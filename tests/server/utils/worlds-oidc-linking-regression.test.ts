// Regression coverage for the Worlds-loading production incident caused
// by generic OIDC identity linking.
//
// PRODUCTION FAILURE. Directus/Postgres rejected
//   SELECT ... FROM world_memberships WHERE account_id IN ($1, $2, $3)
// with "invalid input syntax for type uuid:
// '10d35c7e1ec63ca2b15b573d236bf75434b93b0e605ad30ed98e0a56f100847d'" --
// an OIDC `sub` claim, opaque and not uuid-shaped, that had been linked to
// an Eldra Account and then flowed, unfiltered, into the `_in` filter
// server/utils/world-memberships.ts's listMembershipsForAccount (and
// roll-events.ts's listRollEvents) build against a uuid-typed column.
//
// THE FIX (server/utils/eldra-accounts.ts's listLegacyDirectusUuidSubjectsForAccount,
// consumed by server/utils/authorization.ts's accountLookupKeys) is unit-
// tested directly in tests/server/utils/eldra-accounts.test.ts. This file
// proves the fix end-to-end, through REAL eldra-accounts.ts,
// world-memberships.ts, and roll-events.ts code -- only directusServiceRequest
// (the actual Directus HTTP boundary) and world-memberships.ts's own
// resolveDisplayNames (an unrelated, separate Directus round-trip
// listRollEvents also happens to make) are mocked -- to show the exact
// production query path now succeeds for an Account that has BOTH a
// legacy Directus identity and a newly-linked OIDC identity.

import { beforeEach, describe, expect, it, vi } from 'vitest'

const { directusServiceRequestMock } = vi.hoisted(() => ({
  directusServiceRequestMock: vi.fn()
}))

vi.mock('../../../server/utils/directus', () => ({
  directusServiceRequest: directusServiceRequestMock
}))

// resolveDisplayNames is a SEPARATE Directus round-trip (/users,
// /items/eldra_accounts) listRollEvents happens to make to label each
// roll with a display name -- irrelevant to the uuid-filter regression
// this file is about, so it is stubbed rather than re-plumbed through the
// same single-mock router below. listMembershipsForAccount (the function
// actually under test) is left real via importActual.
vi.mock('../../../server/utils/world-memberships', async () => {
  const actual = await vi.importActual<typeof import('../../../server/utils/world-memberships')>(
    '../../../server/utils/world-memberships'
  )
  return { ...actual, resolveDisplayNames: vi.fn().mockResolvedValue(new Map()) }
})

import { listLegacyDirectusUuidSubjectsForAccount } from '../../../server/utils/eldra-accounts'
import { listMembershipsForAccount } from '../../../server/utils/world-memberships'
import { listRollEvents } from '../../../server/utils/roll-events'

const ELDRA_ACCOUNT_ID = 'c0ffee00-0000-4000-8000-000000000001'
const DIRECTUS_USER_ID = '12dbac5d-476b-4933-819a-c83de299239a'
// The exact value from the production incident report.
const OIDC_SUBJECT = '10d35c7e1ec63ca2b15b573d236bf75434b93b0e605ad30ed98e0a56f100847d'

function jsonResponse(data: unknown) {
  return { data }
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// Recursively finds every `_in` array value anywhere in a Directus filter
// object, regardless of how deeply `_and`/`_or` nest it -- robust against
// the filter SHAPE (world_memberships' is flat, roll_events' is nested
// inside visibility/_or/_and clauses) rather than hand-matching one.
function findAllInArrays(filter: unknown): unknown[][] {
  if (!filter || typeof filter !== 'object') return []

  const results: unknown[][] = []
  for (const [key, value] of Object.entries(filter as Record<string, unknown>)) {
    if (key === '_in' && Array.isArray(value)) {
      results.push(value)
    } else if (Array.isArray(value)) {
      for (const entry of value) results.push(...findAllInArrays(entry))
    } else if (value && typeof value === 'object') {
      results.push(...findAllInArrays(value))
    }
  }
  return results
}

// Routes the single directusServiceRequest mock by collection path, the
// same shape tests/server/utils/world-memberships.test.ts and
// tests/server/utils/eldra-accounts.test.ts already use. Simulates the
// real database constraint the production incident hit: an `_in` filter
// containing anything that is not uuid-shaped throws, exactly like
// Postgres did.
function installAdminWithBothIdentitiesLinked() {
  directusServiceRequestMock.mockImplementation(async (path: string, options: any) => {
    if (path === '/items/eldra_identity_links') {
      return jsonResponse([
        { id: 'l1', account_id: ELDRA_ACCOUNT_ID, provider: 'directus', provider_subject: DIRECTUS_USER_ID },
        // The newly-linked OIDC identity -- same Account, different provider.
        { id: 'l2', account_id: ELDRA_ACCOUNT_ID, provider: 'https://idp.example.com/application/o/eldra/', provider_subject: OIDC_SUBJECT }
      ])
    }

    if (path === '/items/world_memberships' || path === '/items/roll_events') {
      // The actual production constraint: a non-uuid value anywhere in
      // this filter's `_in` arrays is what Postgres (via Directus)
      // rejected outright.
      for (const keys of findAllInArrays(options.query.filter)) {
        for (const key of keys) {
          if (typeof key === 'string' && !UUID_PATTERN.test(key)) {
            throw Object.assign(
              new Error(`invalid input syntax for type uuid: "${key}"`),
              { statusCode: 500 }
            )
          }
        }
      }

      if (path === '/items/world_memberships') {
        return jsonResponse([
          // The row shape that exists in the live store today: keyed by
          // the DIRECTUS user id, written before Eldra Accounts existed.
          { id: 'm1', world_id: 4, account_id: DIRECTUS_USER_ID, role: 'owner', created_at: '2026-01-01T00:00:00Z' }
        ])
      }

      return jsonResponse([
        { id: 'r1', world_id: 4, roller_user_id: DIRECTUS_USER_ID, visibility: 'private', created_at: '2026-01-01T00:00:00Z', source_type: 'ability', roll_type: 'check', die_groups: [], total: 10, breakdown: '' }
      ])
    }

    throw new Error(`unexpected directusServiceRequest call: ${path}`)
  })
}

beforeEach(() => {
  directusServiceRequestMock.mockReset()
})

describe('linking an OIDC identity does not break an existing Directus-backed admin\'s Worlds lookup', () => {
  it('accountLookupKeys built from the real identity-link store excludes the OIDC subject', async () => {
    installAdminWithBothIdentitiesLinked()

    const legacyKeys = await listLegacyDirectusUuidSubjectsForAccount(ELDRA_ACCOUNT_ID)
    const accountLookupKeys = [ELDRA_ACCOUNT_ID, ...legacyKeys]

    expect(accountLookupKeys).toEqual([ELDRA_ACCOUNT_ID, DIRECTUS_USER_ID])
    expect(accountLookupKeys).not.toContain(OIDC_SUBJECT)
  })

  it('the Worlds list (listMembershipsForAccount) still resolves the admin\'s legacy-keyed membership -- the exact production query path', async () => {
    installAdminWithBothIdentitiesLinked()

    const legacyKeys = await listLegacyDirectusUuidSubjectsForAccount(ELDRA_ACCOUNT_ID)
    const accountLookupKeys = [ELDRA_ACCOUNT_ID, ...legacyKeys]

    // Before the fix, accountLookupKeys would have included OIDC_SUBJECT
    // here and this call would have thrown exactly the production error.
    const memberships = await listMembershipsForAccount(accountLookupKeys)

    expect(memberships).toEqual([
      { id: 'm1', worldId: '4', accountId: DIRECTUS_USER_ID, role: 'owner', createdAt: '2026-01-01T00:00:00Z' }
    ])
  })

  it('private roll-history lookup also still resolves the admin\'s own legacy-keyed rolls', async () => {
    installAdminWithBothIdentitiesLinked()

    const legacyKeys = await listLegacyDirectusUuidSubjectsForAccount(ELDRA_ACCOUNT_ID)
    const accountLookupKeys = [ELDRA_ACCOUNT_ID, ...legacyKeys]

    const result = await listRollEvents({
      worldId: 4,
      requesterAccountId: ELDRA_ACCOUNT_ID,
      requesterAccountKeys: accountLookupKeys,
      canSeeGm: false
    })

    expect(result.rolls).toHaveLength(1)
    expect(result.rolls[0].rollerUserId).toBe(DIRECTUS_USER_ID)
  })

  it('sanity check: an UNFILTERED lookup-key set (the pre-fix shape) reproduces the exact production failure', async () => {
    installAdminWithBothIdentitiesLinked()

    // Deliberately NOT using listLegacyDirectusUuidSubjectsForAccount --
    // this is what accountLookupKeys looked like before the fix.
    const unfilteredKeys = [ELDRA_ACCOUNT_ID, DIRECTUS_USER_ID, OIDC_SUBJECT]

    await expect(listMembershipsForAccount(unfilteredKeys)).rejects.toThrow(/invalid input syntax for type uuid/)
  })
})
