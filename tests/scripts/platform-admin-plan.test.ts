// Tests for the platform-admin bootstrap planner
// (scripts/directus/lib/platform-admin-plan.mjs).
//
// The script this backs writes to a real Directus instance, so "what would
// it write?" is exactly the question that must be answerable without
// running it. The planner is pure -- state in, intended writes out -- and
// the script's dry-run output is a rendering of the same plan these tests
// assert on, which is what keeps the preview and the behaviour from
// drifting apart.
//
// THE INVARIANT UNDER TEST. Platform-admin provisioning (Account,
// IdentityLink, grants -- all in the three Phase 1 collections, all
// reversible) must never silently carry an ownerless-World owner
// membership along with it (live shared data, assigns ownership of a World
// that has none, not undone by --revoke).

import { describe, expect, it } from 'vitest'
import {
  OWNERLESS_BACKFILL_FLAG,
  directusDisplayName,
  formatPlan,
  planPlatformAdminBootstrap
} from '../../scripts/directus/lib/platform-admin-plan.mjs'

const SUBJECT = '12dbac5d-476b-4933-819a-c83de299239a'
const ACCOUNT_ID = 'c0ffee00-0000-4000-8000-000000000001'

const CAPABILITIES = [
  'platform.account.manage',
  'platform.settings.manage',
  'platform.world.create'
]

// Mirrors the live instance as observed read-only: World 4 and 5 have
// membership rows, World 1 "Varin" has none and a null owner_id.
const WORLDS = [
  { id: 1, name: 'Varin' },
  { id: 4, name: 'Solaris' },
  { id: 5, name: 'EveryoneButBobbyB(Test)' }
]

const MEMBERSHIPS = [
  { id: 'm1', world_id: 4, account_id: SUBJECT, role: 'owner' },
  { id: 'm2', world_id: 4, account_id: '3ba67dc9-2b68-4782-9c6c-d9549db1d6ca', role: 'player' },
  { id: 'm3', world_id: 5, account_id: SUBJECT, role: 'owner' }
]

function state(overrides: Record<string, any> = {}) {
  return {
    directusUserId: SUBJECT,
    directusUser: { id: SUBJECT, email: 'sam@example.com', first_name: 'Admin', last_name: 'User' },
    existingLink: null,
    existingAccount: null,
    existingGrants: [],
    existingGrantRows: [],
    capabilities: CAPABILITIES,
    worlds: WORLDS,
    memberships: MEMBERSHIPS,
    ...overrides
  }
}

function kinds(plan: any, includedOnly = false) {
  return plan.writes.filter((w: any) => !includedOnly || w.included).map((w: any) => w.kind)
}

describe('planPlatformAdminBootstrap -- default (no backfill flag)', () => {
  it('plans the Account, IdentityLink and one grant per capability', () => {
    const plan = planPlatformAdminBootstrap(state())

    expect(plan.error).toBeNull()
    expect(kinds(plan, true)).toEqual([
      'create-account',
      'create-identity-link',
      'create-grant',
      'create-grant',
      'create-grant'
    ])
  })

  it('writes ONLY to the three Phase 1 collections -- never world_memberships', () => {
    const plan = planPlatformAdminBootstrap(state())

    const collections = new Set(plan.writes.filter((w: any) => w.included).map((w: any) => w.collection))
    expect([...collections].sort()).toEqual([
      'eldra_accounts',
      'eldra_identity_links',
      'eldra_platform_grants'
    ])
    expect(collections.has('world_memberships')).toBe(false)
  })

  it('still PLANS the ownerless-World membership, marked out of scope and naming the flag', () => {
    const plan = planPlatformAdminBootstrap(state())

    const backfill = plan.writes.filter((w: any) => w.kind === 'create-owner-membership')
    expect(backfill).toHaveLength(1)
    expect(backfill[0].included).toBe(false)
    expect(backfill[0].requires).toBe(OWNERLESS_BACKFILL_FLAG)
    expect(backfill[0].body.world_id).toBe(1)
    expect(backfill[0].description).toContain('Varin')
  })

  it('never proposes touching a World that already has membership rows', () => {
    const plan = planPlatformAdminBootstrap(state())

    const worldIds = plan.writes
      .filter((w: any) => w.kind === 'create-owner-membership')
      .map((w: any) => w.body.world_id)
    expect(worldIds).toEqual([1])
    expect(plan.skips.join('\n')).toContain('World 4 "Solaris" already has memberships')
    expect(plan.skips.join('\n')).toContain('World 5 "EveryoneButBobbyB(Test)" already has memberships')
  })
})

describe('planPlatformAdminBootstrap -- explicit backfill scope', () => {
  it('includes the ownerless-World owner membership only when the flag is set', () => {
    const plan = planPlatformAdminBootstrap(state({ backfillOwnerlessWorlds: true }))

    const backfill = plan.writes.filter((w: any) => w.kind === 'create-owner-membership')
    expect(backfill).toHaveLength(1)
    expect(backfill[0].included).toBe(true)
    expect(backfill[0].requires).toBeUndefined()
    expect(backfill[0].collection).toBe('world_memberships')
  })

  it('still adds exactly one owner, and only for Worlds with zero memberships', () => {
    const plan = planPlatformAdminBootstrap(state({ backfillOwnerlessWorlds: true }))

    const memberships = plan.writes.filter((w: any) => w.kind === 'create-owner-membership')
    expect(memberships.map((w: any) => w.body)).toEqual([{ world_id: 1, role: 'owner' }])
  })

  it('plans nothing for World 1 once it has an owner -- the backfill is self-limiting', () => {
    const plan = planPlatformAdminBootstrap(
      state({
        backfillOwnerlessWorlds: true,
        memberships: [...MEMBERSHIPS, { id: 'm4', world_id: 1, account_id: ACCOUNT_ID, role: 'owner' }]
      })
    )

    expect(kinds(plan)).not.toContain('create-owner-membership')
  })
})

describe('planPlatformAdminBootstrap -- rerun safety (idempotence)', () => {
  it('a second run with everything in place plans no writes at all', () => {
    const plan = planPlatformAdminBootstrap(
      state({
        backfillOwnerlessWorlds: true,
        existingLink: { id: 'link-1', account_id: ACCOUNT_ID },
        existingAccount: { id: ACCOUNT_ID, display_name: 'Admin User', status: 'active' },
        existingGrants: CAPABILITIES,
        existingGrantRows: CAPABILITIES.map((capability, i) => ({ id: `g${i}`, capability })),
        memberships: [...MEMBERSHIPS, { id: 'm4', world_id: 1, account_id: ACCOUNT_ID, role: 'owner' }]
      })
    )

    expect(plan.writes).toEqual([])
    expect(plan.accountId).toBe(ACCOUNT_ID)
    expect(plan.isNewAccount).toBe(false)
  })

  it('reuses an Account a lazy login already created, and tops up only the missing grants', () => {
    const plan = planPlatformAdminBootstrap(
      state({
        existingLink: { id: 'link-1', account_id: ACCOUNT_ID },
        existingAccount: { id: ACCOUNT_ID, display_name: 'Admin User', status: 'active' },
        existingGrants: ['platform.settings.manage'],
        existingGrantRows: [{ id: 'g0', capability: 'platform.settings.manage' }]
      })
    )

    expect(kinds(plan, true)).toEqual(['create-grant', 'create-grant'])
    expect(plan.writes.filter((w: any) => w.included).map((w: any) => w.body.capability).sort()).toEqual([
      'platform.account.manage',
      'platform.world.create'
    ])
    expect(plan.skips.join('\n')).toContain('Grant already present: platform.settings.manage')
  })
})

describe('planPlatformAdminBootstrap -- revoke', () => {
  it('plans deletion of exactly the existing grant rows and nothing else', () => {
    const plan = planPlatformAdminBootstrap(
      state({
        revoke: true,
        existingLink: { id: 'link-1', account_id: ACCOUNT_ID },
        existingAccount: { id: ACCOUNT_ID, display_name: 'Admin User', status: 'active' },
        existingGrants: CAPABILITIES,
        existingGrantRows: CAPABILITIES.map((capability, i) => ({ id: `g${i}`, capability }))
      })
    )

    expect(kinds(plan)).toEqual(['delete-grant', 'delete-grant', 'delete-grant'])
    expect(plan.writes.every((w: any) => w.collection === 'eldra_platform_grants')).toBe(true)
  })

  it('ignores the backfill flag entirely -- revoke never writes a membership', () => {
    const plan = planPlatformAdminBootstrap(
      state({
        revoke: true,
        backfillOwnerlessWorlds: true,
        existingLink: { id: 'link-1', account_id: ACCOUNT_ID },
        existingAccount: { id: ACCOUNT_ID, display_name: 'Admin User', status: 'active' },
        existingGrantRows: [{ id: 'g0', capability: 'platform.settings.manage' }],
        existingGrants: ['platform.settings.manage']
      })
    )

    expect(kinds(plan)).toEqual(['delete-grant'])
    expect(plan.skips.join('\n')).toContain('does not remove the Account, its IdentityLink, or any World membership')
  })
})

describe('planPlatformAdminBootstrap -- refusals', () => {
  it('refuses without a subject rather than guessing one', () => {
    const plan = planPlatformAdminBootstrap(state({ directusUserId: '' }))

    expect(plan.error).toBe('No Directus user id supplied')
    expect(plan.writes).toEqual([])
  })

  it('refuses when the Directus user does not exist', () => {
    const plan = planPlatformAdminBootstrap(state({ directusUser: null }))

    expect(plan.error).toContain('No Directus user')
    expect(plan.writes).toEqual([])
  })

  it('refuses when an existing link points at a missing Account -- never mints a second one', () => {
    const plan = planPlatformAdminBootstrap(
      state({ existingLink: { id: 'link-1', account_id: 'deleted-account' }, existingAccount: null })
    )

    expect(plan.error).toContain('points at missing account deleted-account')
    expect(plan.writes).toEqual([])
  })
})

describe('dry-run rendering', () => {
  it('lists every proposed account, identity, grant AND membership write', () => {
    const output = formatPlan(planPlatformAdminBootstrap(state()), { apply: false })

    expect(output).toContain('WRITES THAT WOULD BE PERFORMED:')
    expect(output).toContain('[eldra_accounts] create Eldra Account "Admin User"')
    expect(output).toContain(`[eldra_identity_links] link identity directus|${SUBJECT}`)
    expect(output).toContain('[eldra_platform_grants] grant platform.settings.manage')
    // The membership appears, in its own clearly-labelled out-of-scope section.
    expect(output).toContain('NOT IN SCOPE')
    expect(output).toContain('[world_memberships] make <new account> owner of World 1 "Varin"')
    expect(output).toContain(`pass ${OWNERLESS_BACKFILL_FLAG} to include this`)
  })

  it('previews grants and memberships even when no Account exists yet', () => {
    // The earlier script returned early in this exact case and could show
    // neither -- the operator could not find out what --apply would do
    // until after it had already created the Account.
    const plan = planPlatformAdminBootstrap(state())

    expect(plan.accountId).toBeNull()
    expect(plan.isNewAccount).toBe(true)
    expect(kinds(plan)).toContain('create-grant')
    expect(kinds(plan)).toContain('create-owner-membership')
  })

  it('shows no out-of-scope section once the backfill flag is passed', () => {
    const output = formatPlan(planPlatformAdminBootstrap(state({ backfillOwnerlessWorlds: true })), { apply: true })

    expect(output).toContain('WRITES TO PERFORM:')
    expect(output).toContain('[world_memberships] make')
    expect(output).not.toContain('NOT IN SCOPE')
  })

  it('says so plainly when there is nothing to do', () => {
    const output = formatPlan(
      planPlatformAdminBootstrap(
        state({
          backfillOwnerlessWorlds: true,
          existingLink: { id: 'link-1', account_id: ACCOUNT_ID },
          existingAccount: { id: ACCOUNT_ID, display_name: 'Admin User', status: 'active' },
          existingGrants: CAPABILITIES,
          existingGrantRows: CAPABILITIES.map((capability, i) => ({ id: `g${i}`, capability })),
          memberships: [...MEMBERSHIPS, { id: 'm4', world_id: 1, account_id: ACCOUNT_ID, role: 'owner' }]
        })
      ),
      { apply: true }
    )

    expect(output).toContain('(none -- everything is already in place)')
  })
})

describe('directusDisplayName', () => {
  it('matches formatAccountDisplayName so a bootstrapped Account is named like a lazy one', () => {
    expect(directusDisplayName({ first_name: 'Admin', last_name: 'User' })).toBe('Admin User')
    expect(directusDisplayName({ first_name: 'Admin', last_name: '' })).toBe('Admin')
    expect(directusDisplayName({ email: 'sam@example.com' })).toBe('sam@example.com')
    expect(directusDisplayName({ id: SUBJECT })).toBe(SUBJECT)
  })
})
