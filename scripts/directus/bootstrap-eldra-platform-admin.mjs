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
// THREE THINGS IT DOES, each idempotent:
//   1. Ensures an Eldra Account + ('directus', <subject>) IdentityLink.
//      Reuses them if a login already created them lazily.
//   2. Grants every PlatformCapability to that Account, one
//      eldra_platform_grants row each. `grant_key`'s unique constraint
//      makes a re-run a no-op rather than a duplicate.
//   3. Backfills an `owner` world_memberships row for every World that
//      has NO membership rows at all. Those Worlds were reachable only
//      through the removed fallback, so without this they become
//      unadministrable (§10.1: "a World with zero owners is
//      unadministrable"). A World that already has ANY membership row is
//      left strictly alone -- this script never adds a second owner, never
//      changes an existing role, and never removes anything.
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

// Must match PlatformCapability in server/utils/authorization.ts. A value
// here that is not in that union is inert: resolvePlatformCapabilities
// filters unknown grants out rather than trusting them, so a drift between
// the two lists fails closed.
const PLATFORM_CAPABILITIES = [
  'platform.account.manage',
  'platform.package.install',
  'platform.package.publish',
  'platform.package.remove',
  'platform.contentpack.install',
  'platform.contentpack.publish',
  'platform.contentpack.remove',
  'platform.world.create',
  'platform.world.list',
  'platform.world.delete',
  'platform.settings.manage',
  'platform.breakglass.enter'
]

const PROVIDER = 'directus'

const args = process.argv.slice(2)
const apply = args.includes('--apply')
const revoke = args.includes('--revoke')
const listUsers = args.includes('--list-users')
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
  const params = new URLSearchParams({ filter: JSON.stringify(filter), limit: '-1', ...extra })
  return params.toString()
}

function displayName(user) {
  const full = `${String(user?.first_name ?? '').trim()} ${String(user?.last_name ?? '').trim()}`.trim()
  return full || String(user?.email ?? '').trim() || String(user?.id ?? '')
}

async function printUsers() {
  const users = rows(await dx('/users?fields=id,email,first_name,last_name,status,last_access&limit=-1'))
  console.log('\nDirectus users (choose one and pass its id as --directus-user-id=...):')
  for (const user of users) {
    console.log(`  ${user.id}  ${displayName(user).padEnd(28)} ${user.email || '(no email)'}  last_access=${user.last_access || 'never'}`)
  }
  console.log('')
}

async function ensureAccount(subject) {
  const identityKey = `${PROVIDER}|${subject}`

  const existingLinks = rows(
    await dx(`/items/eldra_identity_links?${q({ identity_key: { _eq: identityKey } }, { fields: 'id,account_id' })}`)
  )

  if (existingLinks.length > 0) {
    const accountId = String(existingLinks[0].account_id)
    const accounts = rows(
      await dx(`/items/eldra_accounts?${q({ id: { _eq: accountId } }, { fields: 'id,display_name,status' })}`)
    )
    if (accounts.length === 0) {
      throw new Error(`Identity link ${identityKey} points at missing account ${accountId}`)
    }
    console.log(`  Account exists: ${accountId} (${accounts[0].display_name}) <- ${identityKey}`)
    return accountId
  }

  const users = rows(await dx(`/users?${q({ id: { _eq: subject } }, { fields: 'id,email,first_name,last_name' })}`))
  if (users.length === 0) {
    throw new Error(`No Directus user with id ${subject}`)
  }
  const name = displayName(users[0])

  if (!apply) {
    console.log(`  WOULD CREATE Account "${name}" + identity link ${identityKey}`)
    return null
  }

  const now = new Date().toISOString()
  const created = await dx('/items/eldra_accounts?fields=id,display_name,status', {
    method: 'POST',
    body: JSON.stringify({ display_name: name, status: 'active', created_at: now, updated_at: now })
  })
  const accountId = String(created?.data?.id ?? created?.id ?? '')
  if (!accountId) {
    throw new Error('Account was created without an id')
  }

  await dx('/items/eldra_identity_links', {
    method: 'POST',
    body: JSON.stringify({
      account_id: accountId,
      provider: PROVIDER,
      provider_subject: subject,
      identity_key: identityKey,
      linked_at: now
    })
  })

  console.log(`  CREATED Account ${accountId} ("${name}") <- ${identityKey}`)
  return accountId
}

async function grantPlatformCapabilities(accountId) {
  const existing = new Set(
    rows(
      await dx(`/items/eldra_platform_grants?${q({ account_id: { _eq: accountId } }, { fields: 'id,capability' })}`)
    ).map((row) => String(row.capability))
  )

  for (const capability of PLATFORM_CAPABILITIES) {
    if (existing.has(capability)) {
      console.log(`  Grant exists: ${capability}`)
      continue
    }

    if (!apply) {
      console.log(`  WOULD GRANT ${capability}`)
      continue
    }

    await dx('/items/eldra_platform_grants', {
      method: 'POST',
      body: JSON.stringify({
        account_id: accountId,
        capability,
        grant_key: `${accountId}|${capability}`,
        granted_at: new Date().toISOString()
      })
    })
    console.log(`  GRANTED ${capability}`)
  }
}

async function revokePlatformCapabilities(accountId) {
  const grants = rows(
    await dx(`/items/eldra_platform_grants?${q({ account_id: { _eq: accountId } }, { fields: 'id,capability' })}`)
  )

  if (grants.length === 0) {
    console.log('  No grants to revoke.')
    return
  }

  for (const grant of grants) {
    if (!apply) {
      console.log(`  WOULD REVOKE ${grant.capability}`)
      continue
    }
    await dx(`/items/eldra_platform_grants/${grant.id}`, { method: 'DELETE' })
    console.log(`  REVOKED ${grant.capability}`)
  }
}

// Worlds with zero membership rows were reachable only through the removed
// admin fallback. Each gets exactly one `owner` row for the bootstrapped
// Account. Worlds that already have any membership row are reported and
// skipped -- the one-owner invariant server/utils/world-memberships.ts
// enforces is never bent here.
async function backfillOwnerlessWorlds(accountId) {
  const worlds = rows(await dx('/items/worlds?fields=id,name&limit=-1'))
  const memberships = rows(await dx('/items/world_memberships?fields=id,world_id,account_id,role&limit=-1'))

  const byWorld = new Map()
  for (const row of memberships) {
    const key = String(row.world_id)
    if (!byWorld.has(key)) byWorld.set(key, [])
    byWorld.get(key).push(row)
  }

  for (const world of worlds) {
    const key = String(world.id)
    const existing = byWorld.get(key) || []

    if (existing.length > 0) {
      const summary = existing.map((row) => `${row.role}:${row.account_id}`).join(', ')
      console.log(`  World ${key} "${world.name}" already has memberships (${summary}) -- left untouched`)
      continue
    }

    if (!apply) {
      console.log(`  WOULD CREATE owner membership for World ${key} "${world.name}" -> ${accountId}`)
      continue
    }

    const now = new Date().toISOString()
    await dx('/items/world_memberships', {
      method: 'POST',
      body: JSON.stringify({
        world_id: Number(world.id),
        account_id: accountId,
        role: 'owner',
        created_at: now,
        updated_at: now
      })
    })
    console.log(`  CREATED owner membership for World ${key} "${world.name}" -> ${accountId}`)
  }
}

async function main() {
  if (listUsers) {
    await printUsers()
    return
  }

  if (!directusUserId) {
    console.error('Usage:')
    console.error('  node scripts/directus/bootstrap-eldra-platform-admin.mjs --list-users')
    console.error('  node scripts/directus/bootstrap-eldra-platform-admin.mjs --directus-user-id=<uuid> [--apply]')
    console.error('  node scripts/directus/bootstrap-eldra-platform-admin.mjs --directus-user-id=<uuid> --revoke [--apply]')
    console.error('')
    console.error('Without --apply nothing is written; every intended change is printed instead.')
    process.exit(1)
  }

  console.log(`\nDirectus: ${DIRECTUS_URL}`)
  console.log(`Mode: ${revoke ? 'REVOKE' : 'GRANT'}${apply ? ' (APPLY -- writes)' : ' (dry run -- no writes)'}`)
  console.log(`Directus user (provider subject): ${directusUserId}\n`)

  console.log('Eldra Account:')
  const accountId = await ensureAccount(directusUserId)

  if (!accountId) {
    console.log('\nDry run: no Account exists yet, so grants and membership backfill cannot be')
    console.log('resolved against a real Account id. Re-run with --apply to create it, or log in')
    console.log('once as that Directus user (which provisions the Account lazily) and re-run.\n')
    return
  }

  if (revoke) {
    console.log('\nPlatform grants:')
    await revokePlatformCapabilities(accountId)
    console.log('\nWorld memberships are NOT removed by --revoke. Current rows for this Account:')
    const own = rows(
      await dx(`/items/world_memberships?${q({ account_id: { _eq: accountId } }, { fields: 'id,world_id,role' })}`)
    )
    for (const row of own) {
      console.log(`  world ${row.world_id}: ${row.role} (membership ${row.id})`)
    }
    if (own.length === 0) console.log('  (none)')
  } else {
    console.log('\nPlatform grants:')
    await grantPlatformCapabilities(accountId)
    console.log('\nOwnerless Worlds:')
    await backfillOwnerlessWorlds(accountId)
  }

  console.log(apply ? '\nDone.\n' : '\nDry run complete -- nothing was written. Re-run with --apply.\n')
}

main().catch((error) => {
  console.error(`\nFailed: ${error?.message || error}\n`)
  process.exit(1)
})
