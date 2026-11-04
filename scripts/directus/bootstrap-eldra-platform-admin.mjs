// Deliberate Eldra platform-administrator bootstrap --
// .github/docs/architecture/ownership-and-permissions.md §6.1/§6.4/§12 Phase 1.
//
// WHY THIS SCRIPT HAS TO EXIST. Phase 1 removed the implicit grant that
// made a Directus Administrator an Eldra platform administrator
// (server/utils/authorization.ts's `temporarySingleUserMode`). That grant
// was the ONLY thing giving the existing administrator platform access and
// access to Worlds that have no membership row. Nothing replaces it
// automatically -- on purpose: "a single human may administer both Eldra
// and Directus, but the two systems must have distinct account IDs and
// independently granted permissions." This script is that independent
// grant, performed once, deliberately, naming the Directus user id
// explicitly.
//
// RUN IT AS PART OF THE SAME DEPLOYMENT that ships Phase 1, after
// `node scripts/directus/bootstrap.mjs` has provisioned the collections.
// Until it runs, the existing administrator authenticates successfully and
// holds no platform capability -- the app is fail-closed, not broken, but
// the admin workspace is unreachable.
//
// IDENTIFIED BY SUBJECT, NEVER BY EMAIL. `--directus-user-id` is required
// and is never inferred. Matching an account by email or display name is
// the account-takeover vector §6.2 rule 2 exists to forbid, and this
// script does not do it even as a convenience: `--list-users` prints the
// candidates for a human to choose from, and nothing more.
//
// WHAT `--apply` DOES, each step idempotent:
//   1. Ensures an Eldra Account + ('directus', <subject>) IdentityLink.
//      Reuses them if a login already created them lazily.
//   2. Grants every PlatformCapability to that Account, one
//      eldra_platform_grants row each. `grant_key`'s unique constraint
//      makes a re-run a no-op rather than a duplicate.
//
// Both write ONLY to the three Phase 1 collections, which nothing else
// uses.
//
// WHAT `--apply` DELIBERATELY DOES NOT DO. Backfilling an `owner`
// world_memberships row for a World that has no membership rows at all is
// a SEPARATE operation behind `--backfill-ownerless-worlds`. Such Worlds
// were reachable only through the fallback Phase 1 removed, so they do
// need an owner eventually (§10.1: "a World with zero owners is
// unadministrable") -- but that write lands in live, shared,
// pre-existing data, it assigns ownership of a World that currently has
// none, and `--revoke` does not undo it. None of that should ride along
// with provisioning an admin account.
//
// It is still always PLANNED and printed, marked out of scope, so the
// separation does not cost visibility: nothing is bundled silently, and
// nothing is hidden either. A World that already has ANY membership row is
// left strictly alone -- this script never adds a second owner, never
// changes an existing role, and never removes a membership.
//
// Deciding what to write lives in lib/platform-admin-plan.mjs as a pure
// function, so the dry-run output and the tests describe the same plan
// rather than two restatements of it.
//
// DRY RUN BY DEFAULT. Nothing is written without `--apply`. Every intended
// write is printed first, so the diff against the live instance is
// reviewable before it happens.
//
// RECOVERY / ROLLBACK. `--revoke --apply` deletes exactly the
// eldra_platform_grants rows for the named Account, which restores the
// pre-grant state: the Account and IdentityLink remain (inert -- an
// identity with no grants is an ordinary Account), and memberships are
// left untouched and reported so they can be removed by hand if that is
// wanted. Reverting the CODE alone also restores the old behavior, because
// nothing in Phase 1 destroys or rewrites a single pre-existing row:
// world_memberships, roll_events and directus_users are read, never
// migrated.


import {
  OWNERLESS_BACKFILL_FLAG,
  PLATFORM_CAPABILITIES,
  formatPlan,
  planPlatformAdminBootstrap
} from './lib/platform-admin-plan.mjs'

const DIRECTUS_URL =
  process.env.DIRECTUS_URL ||
  process.env.NUXT_PUBLIC_DIRECTUS_URL ||
  'https://directus.theledouxs.com'

const DIRECTUS_TOKEN =
  process.env.DIRECTUS_SCHEMA_TOKEN ||
  process.env.DIRECTUS_TOKEN ||
  process.env.NUXT_DIRECTUS_TOKEN ||
  process.env.NITRO_DIRECTUS_TOKEN ||
  ''

const PROVIDER = 'directus'

const args = process.argv.slice(2)
const apply = args.includes('--apply')
const revoke = args.includes('--revoke')
const listUsers = args.includes('--list-users')
const backfillOwnerlessWorlds = args.includes(OWNERLESS_BACKFILL_FLAG)
const directusUserId = (args.find((a) => a.startsWith('--directus-user-id=')) || '').split('=')[1] || ''

if (!DIRECTUS_TOKEN) {
  console.error('Missing Directus token.')
  process.exit(1)
}

async function dx(path, options = {}) {
  const res = await fetch(`${DIRECTUS_URL.replace(/\/$/, '')}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${DIRECTUS_TOKEN}`,
      'Content-Type': 'application/json',
      ...(options.headers || {})
    }
  })

  const text = await res.text()
  let json = null
  try {
    json = text ? JSON.parse(text) : null
  } catch {
    json = text
  }

  if (!res.ok) {
    const message = typeof json === 'string' ? json : JSON.stringify(json)
    throw new Error(`${res.status} ${res.statusText}: ${message}`)
  }

  return json
}

function rows(res) {
  return Array.isArray(res?.data) ? res.data : []
}

function q(filter, extra = {}) {
  return new URLSearchParams({ filter: JSON.stringify(filter), limit: '-1', ...extra }).toString()
}

function displayName(user) {
  const full = `${String(user?.first_name ?? '').trim()} ${String(user?.last_name ?? '').trim()}`.trim()
  return full || String(user?.email ?? '').trim() || String(user?.id ?? '')
}

// --list-users exists so the operator picks the subject from real data
// rather than this script guessing one. It deliberately prints enough to
// tell an INTERACTIVE administrator apart from a service-token account
// (which has no email and has never signed in) -- see the runbook note at
// the end of main().
async function printUsers() {
  const users = rows(await dx('/users?fields=id,email,first_name,last_name,status,last_access&limit=-1'))
  console.log('\nDirectus users -- choose the INTERACTIVE administrator, not a service-token account:\n')
  for (const user of users) {
    const kind = user.email ? 'interactive (has email)' : 'SERVICE/TOKEN ACCOUNT (no email)'
    console.log(`  ${user.id}`)
    console.log(`      name        : ${displayName(user)}`)
    console.log(`      email       : ${user.email || '(none)'}`)
    console.log(`      last_access : ${user.last_access || 'never'}`)
    console.log(`      looks like  : ${kind}`)
    console.log('')
  }
}

// Reads every piece of state the plan depends on. All GETs.
async function readState() {
  const identityKey = `${PROVIDER}|${directusUserId}`

  const links = rows(
    await dx(`/items/eldra_identity_links?${q({ identity_key: { _eq: identityKey } }, { fields: 'id,account_id' })}`)
  )
  const existingLink = links[0] ?? null

  let existingAccount = null
  if (existingLink) {
    const accounts = rows(
      await dx(
        `/items/eldra_accounts?${q({ id: { _eq: String(existingLink.account_id) } }, { fields: 'id,display_name,status' })}`
      )
    )
    existingAccount = accounts[0] ?? null
  }

  let directusUser = null
  if (!existingLink) {
    const users = rows(
      await dx(`/users?${q({ id: { _eq: directusUserId } }, { fields: 'id,email,first_name,last_name' })}`)
    )
    directusUser = users[0] ?? null
  }

  const existingGrantRows = existingAccount
    ? rows(
        await dx(
          `/items/eldra_platform_grants?${q({ account_id: { _eq: String(existingAccount.id) } }, { fields: 'id,capability' })}`
        )
      )
    : []

  const worlds = rows(await dx('/items/worlds?fields=id,name&limit=-1'))
  const memberships = rows(await dx('/items/world_memberships?fields=id,world_id,account_id,role&limit=-1'))

  return {
    directusUserId,
    directusUser,
    existingLink,
    existingAccount,
    existingGrantRows,
    existingGrants: existingGrantRows.map((row) => String(row.capability)),
    capabilities: PLATFORM_CAPABILITIES,
    worlds,
    memberships,
    revoke,
    backfillOwnerlessWorlds
  }
}

// Executes the plan's in-scope entries, in order. `accountId` is threaded
// through because the grant and membership bodies depend on an id that may
// not exist until the first write completes.
async function execute(plan) {
  let accountId = plan.accountId
  const now = () => new Date().toISOString()

  for (const write of plan.writes) {
    if (!write.included) continue

    if (write.kind === 'create-account') {
      const created = await dx('/items/eldra_accounts?fields=id,display_name,status', {
        method: 'POST',
        body: JSON.stringify({ ...write.body, created_at: now(), updated_at: now() })
      })
      accountId = String(created?.data?.id ?? created?.id ?? '')
      if (!accountId) throw new Error('Account was created without an id')
      console.log(`  CREATED account ${accountId}`)
      continue
    }

    if (write.kind === 'create-identity-link') {
      await dx('/items/eldra_identity_links', {
        method: 'POST',
        body: JSON.stringify({ ...write.body, account_id: accountId, linked_at: now() })
      })
      console.log(`  LINKED ${write.body.identity_key} -> ${accountId}`)
      continue
    }

    if (write.kind === 'create-grant') {
      await dx('/items/eldra_platform_grants', {
        method: 'POST',
        body: JSON.stringify({
          account_id: accountId,
          capability: write.body.capability,
          grant_key: `${accountId}|${write.body.capability}`,
          granted_at: now()
        })
      })
      console.log(`  GRANTED ${write.body.capability}`)
      continue
    }

    if (write.kind === 'delete-grant') {
      await dx(`/items/eldra_platform_grants/${write.id}`, { method: 'DELETE' })
      console.log(`  REVOKED grant ${write.id}`)
      continue
    }

    if (write.kind === 'create-owner-membership') {
      await dx('/items/world_memberships', {
        method: 'POST',
        body: JSON.stringify({
          world_id: write.body.world_id,
          account_id: accountId,
          role: 'owner',
          created_at: now(),
          updated_at: now()
        })
      })
      console.log(`  CREATED owner membership for World ${write.body.world_id} -> ${accountId}`)
      continue
    }

    throw new Error(`Unknown planned write kind: ${write.kind}`)
  }

  return accountId
}

function usage() {
  console.error('Usage:')
  console.error('  node scripts/directus/bootstrap-eldra-platform-admin.mjs --list-users')
  console.error('  node scripts/directus/bootstrap-eldra-platform-admin.mjs --directus-user-id=<uuid> [--apply]')
  console.error(`  node scripts/directus/bootstrap-eldra-platform-admin.mjs --directus-user-id=<uuid> ${OWNERLESS_BACKFILL_FLAG} [--apply]`)
  console.error('  node scripts/directus/bootstrap-eldra-platform-admin.mjs --directus-user-id=<uuid> --revoke [--apply]')
  console.error('')
  console.error('Without --apply nothing is written; the full plan is printed instead.')
  console.error(`Ownerless-World owner memberships are only written when ${OWNERLESS_BACKFILL_FLAG} is passed.`)
}

async function main() {
  if (listUsers) {
    await printUsers()
    return
  }

  if (!directusUserId) {
    usage()
    process.exit(1)
  }

  console.log(`\nDirectus : ${DIRECTUS_URL}`)
  console.log(`Mode     : ${revoke ? 'REVOKE' : 'GRANT'}${apply ? '  (--apply: WRITES)' : '  (dry run: no writes)'}`)
  console.log(`Subject  : directus|${directusUserId}`)
  console.log(`Backfill : ${revoke ? 'n/a' : backfillOwnerlessWorlds ? 'INCLUDED' : `excluded (pass ${OWNERLESS_BACKFILL_FLAG})`}\n`)

  const state = await readState()
  const plan = planPlatformAdminBootstrap(state)

  if (plan.error) {
    console.error(`Cannot proceed: ${plan.error}\n`)
    process.exit(1)
  }

  // CONFIRM THE SUBJECT BEFORE GRANTING. The whole point of naming the id
  // explicitly is that nothing infers it -- so the plan prints who it
  // resolved to, and flags the one mistake that matters: granting Eldra
  // platform administration to the SERVICE account whose token this very
  // script is authenticating with. That account has no email and has never
  // interactively signed in; a human administrator has both.
  const subject = state.directusUser ?? null
  if (!revoke) {
    console.log('SUBJECT CHECK:')
    if (subject) {
      console.log(`  name        : ${displayName(subject)}`)
      console.log(`  email       : ${subject.email || '(none)'}`)
      if (!subject.email) {
        console.log('  *** WARNING: no email -- this looks like a SERVICE/TOKEN account, not a human administrator.')
        console.log('  *** Re-check with --list-users before applying.')
      }
    } else {
      console.log(`  (reusing the Account already linked to this subject: ${plan.accountId})`)
    }
    console.log('')
  }

  console.log(formatPlan(plan, { apply }))
  console.log('')

  if (!apply) {
    console.log('Dry run complete -- nothing was written.\n')
    return
  }

  const accountId = await execute(plan)
  console.log(`\nDone. Eldra Account: ${accountId}\n`)
}

main().catch((error) => {
  console.error(`\nFailed: ${error?.message || error}\n`)
  process.exit(1)
})
