// Pure planner for the Eldra platform-admin bootstrap
// (scripts/directus/bootstrap-eldra-platform-admin.mjs).
//
// WHY THIS IS A SEPARATE, PURE MODULE. The script's job is to write to a
// real Directus instance, which makes "what would it write?" exactly the
// question that is hardest to answer by running it. Extracting the
// decision -- state in, list of intended writes out, no I/O -- is what
// lets the dry-run output and the tests be the SAME thing rather than two
// descriptions of the same intent that can drift. The script fetches
// state, calls this, prints the plan, and (only with --apply) executes the
// entries this module marked as in scope.
//
// THE SEPARATION THIS ENCODES. Platform-admin provisioning and
// ownerless-World membership backfill are two different operations with
// two different blast radii:
//
//   * Account, IdentityLink and platform grants write ONLY to the three
//     Phase 1 collections, which nothing else uses, and are fully
//     reversible by deleting grant rows.
//   * An owner membership writes to `world_memberships` -- live,
//     pre-existing, shared data -- assigns ownership of a World that
//     currently has none, and is NOT undone by --revoke.
//
// So the second never rides along with the first. It requires its own
// flag, and when that flag is absent the plan still SHOWS the candidates
// (marked out of scope) rather than hiding them, because "nothing will be
// bundled silently" and "you cannot find out what would happen" are not
// the same guarantee.

/**
 * @typedef {Object} PlannedWrite
 * @property {'create-account'|'create-identity-link'|'create-grant'|'delete-grant'|'create-owner-membership'} kind
 * @property {string} collection
 * @property {boolean} included  Whether --apply would actually perform it.
 * @property {string} description  One human-readable line.
 * @property {Record<string, unknown>} [body]  For creates.
 * @property {string} [id]  For deletes.
 * @property {string} [requires]  The flag needed to include it, if excluded.
 */

export const OWNERLESS_BACKFILL_FLAG = '--backfill-ownerless-worlds'

// Must match ALL_PLATFORM_CAPABILITIES in server/utils/authorization.ts --
// the actual vocabulary resolvePlatformCapabilities filters grants
// against. Kept here (rather than inline in the operational script) so
// tests/scripts/platform-admin-plan.test.ts can import it with no
// side effects; the script re-exports it unchanged so nothing that
// imported it from there before has to change.
export const PLATFORM_CAPABILITIES = [
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
  'platform.breakglass.enter',
  'platform.character.manage'
]

/**
 * Resolves the display name for a Directus user row the same way
 * server/utils/accounts.ts's formatAccountDisplayName does, so a bootstrapped
 * Account is named identically to a lazily-provisioned one.
 */
export function directusDisplayName(user) {
  const first = String(user?.first_name ?? '').trim()
  const last = String(user?.last_name ?? '').trim()
  const full = `${first} ${last}`.trim()
  return full || String(user?.email ?? '').trim() || String(user?.id ?? '')
}

/**
 * @param {Object} state
 * @param {string} state.directusUserId        The provider subject, supplied explicitly.
 * @param {Object|null} state.directusUser     The Directus user row, or null if not found.
 * @param {Object|null} state.existingLink     eldra_identity_links row for this identity, if any.
 * @param {Object|null} state.existingAccount  eldra_accounts row the link points at, if any.
 * @param {string[]} state.existingGrants      capability strings already granted.
 * @param {Array<{id: string, capability: string}>} state.existingGrantRows
 * @param {string[]} state.capabilities        The full PlatformCapability vocabulary.
 * @param {Array<{id: string|number, name: string}>} state.worlds
 * @param {Array<{world_id: string|number, account_id: string, role: string}>} state.memberships
 * @param {boolean} [state.revoke]
 * @param {boolean} [state.backfillOwnerlessWorlds]
 * @returns {{accountId: string|null, isNewAccount: boolean, writes: PlannedWrite[], skips: string[], error: string|null}}
 */
export function planPlatformAdminBootstrap(state) {
  const {
    directusUserId,
    directusUser,
    existingLink,
    existingAccount,
    existingGrants = [],
    existingGrantRows = [],
    capabilities = [],
    worlds = [],
    memberships = [],
    revoke = false,
    backfillOwnerlessWorlds = false
  } = state

  /** @type {PlannedWrite[]} */
  const writes = []
  const skips = []

  if (!directusUserId) {
    return { accountId: null, isNewAccount: false, writes, skips, error: 'No Directus user id supplied' }
  }

  const identityKey = `directus|${directusUserId}`

  // An existing link whose Account row is gone is the one state this
  // script must not paper over -- creating a second Account for an
  // identity that already claims one is how memberships get orphaned.
  if (existingLink && !existingAccount) {
    return {
      accountId: null,
      isNewAccount: false,
      writes,
      skips,
      error: `Identity link ${identityKey} points at missing account ${existingLink.account_id}`
    }
  }

  if (!existingLink && !directusUser) {
    return {
      accountId: null,
      isNewAccount: false,
      writes,
      skips,
      error: `No Directus user with id ${directusUserId}`
    }
  }

  // `null` when the Account does not exist yet: the plan is still fully
  // previewable, with downstream rows addressed to "<new account>" rather
  // than the planner refusing to describe them. That is the dry-run gap
  // this closes -- the previous script returned early here and could not
  // show the grants or the membership candidates at all.
  const accountId = existingAccount ? String(existingAccount.id) : null
  const isNewAccount = !existingLink
  const accountRef = accountId ?? '<new account>'

  if (revoke) {
    for (const row of existingGrantRows) {
      writes.push({
        kind: 'delete-grant',
        collection: 'eldra_platform_grants',
        included: true,
        id: String(row.id),
        description: `revoke ${row.capability} from ${accountRef}`
      })
    }
    if (existingGrantRows.length === 0) {
      skips.push('No platform grants exist for this Account -- nothing to revoke.')
    }
    // Revoke deliberately touches nothing else. See the script's own
    // RECOVERY note: the Account and IdentityLink are inert without
    // grants, and deleting them would orphan anything pointing at them.
    skips.push('Revoke does not remove the Account, its IdentityLink, or any World membership.')
    return { accountId, isNewAccount: false, writes, skips, error: null }
  }

  if (isNewAccount) {
    const displayName = directusDisplayName(directusUser)
    writes.push({
      kind: 'create-account',
      collection: 'eldra_accounts',
      included: true,
      description: `create Eldra Account "${displayName}"`,
      body: { display_name: displayName, status: 'active' }
    })
    writes.push({
      kind: 'create-identity-link',
      collection: 'eldra_identity_links',
      included: true,
      description: `link identity ${identityKey} -> ${accountRef}`,
      body: { provider: 'directus', provider_subject: directusUserId, identity_key: identityKey }
    })
  } else {
    skips.push(`Account ${accountId} already exists for ${identityKey} -- reusing it.`)
  }

  const granted = new Set(existingGrants.map(String))
  for (const capability of capabilities) {
    if (granted.has(capability)) {
      skips.push(`Grant already present: ${capability}`)
      continue
    }
    writes.push({
      kind: 'create-grant',
      collection: 'eldra_platform_grants',
      included: true,
      description: `grant ${capability} to ${accountRef}`,
      body: { capability, grant_key: `${accountRef}|${capability}` }
    })
  }

  // --- Ownerless-World backfill: always planned, included only on demand.
  const membershipsByWorld = new Map()
  for (const row of memberships) {
    const key = String(row.world_id)
    if (!membershipsByWorld.has(key)) membershipsByWorld.set(key, [])
    membershipsByWorld.get(key).push(row)
  }

  for (const world of worlds) {
    const key = String(world.id)
    const existing = membershipsByWorld.get(key) || []

    if (existing.length > 0) {
      const summary = existing.map((row) => `${row.role}:${row.account_id}`).join(', ')
      skips.push(`World ${key} "${world.name}" already has memberships (${summary}) -- never touched.`)
      continue
    }

    writes.push({
      kind: 'create-owner-membership',
      collection: 'world_memberships',
      included: backfillOwnerlessWorlds,
      requires: backfillOwnerlessWorlds ? undefined : OWNERLESS_BACKFILL_FLAG,
      description: `make ${accountRef} owner of World ${key} "${world.name}" (currently has no membership rows)`,
      body: { world_id: Number(world.id), role: 'owner' }
    })
  }

  return { accountId, isNewAccount, writes, skips, error: null }
}

/**
 * Renders a plan for the console. Separated from both planning and
 * execution so dry-run output and --apply operate on one shared
 * description instead of two.
 */
export function formatPlan(plan, { apply = false } = {}) {
  const lines = []
  const included = plan.writes.filter((w) => w.included)
  const excluded = plan.writes.filter((w) => !w.included)

  lines.push(apply ? 'WRITES TO PERFORM:' : 'WRITES THAT WOULD BE PERFORMED:')
  if (included.length === 0) {
    lines.push('  (none -- everything is already in place)')
  }
  for (const write of included) {
    lines.push(`  [${write.collection}] ${write.description}`)
  }

  if (excluded.length > 0) {
    lines.push('')
    lines.push('NOT IN SCOPE (requires an explicit flag, and will NOT be written):')
    for (const write of excluded) {
      lines.push(`  [${write.collection}] ${write.description}`)
      lines.push(`      -> pass ${write.requires} to include this`)
    }
  }

  if (plan.skips.length > 0) {
    lines.push('')
    lines.push('ALREADY SATISFIED / UNCHANGED:')
    for (const skip of plan.skips) {
      lines.push(`  ${skip}`)
    }
  }

  return lines.join('\n')
}
