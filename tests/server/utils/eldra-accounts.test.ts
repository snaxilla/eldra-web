// Unit tests for Eldra Account identity (server/utils/eldra-accounts.ts).
// See .github/docs/architecture/ownership-and-permissions.md §6.1/§6.2 and
// §12 Phase 1.
//
// The Directus adapter at the bottom of that module is mocked at its
// boundary (the established pattern in this repo -- see
// tests/server/utils/world-memberships.test.ts), because what is under
// test is the identity RULES, not Directus's HTTP behavior: which field is
// the identity key, that an Account id is Eldra's own, that resolution is
// idempotent, and that a concurrent first-login cannot mint two Accounts
// for one identity.

import { beforeEach, describe, expect, it, vi } from 'vitest'

const { directusServiceRequestMock } = vi.hoisted(() => ({
  directusServiceRequestMock: vi.fn()
}))

vi.mock('../../../server/utils/directus', () => ({
  directusServiceRequest: directusServiceRequestMock
}))

import {
  buildGrantKey,
  buildIdentityKey,
  listIdentitySubjectsForAccount,
  listPlatformGrants,
  resolveAccountDisplayNames,
  resolveAccountForIdentity
} from '../../../server/utils/eldra-accounts'

const DIRECTUS_USER_ID = '12dbac5d-476b-4933-819a-c83de299239a'
const ELDRA_ACCOUNT_ID = 'c0ffee00-0000-4000-8000-000000000001'

function jsonResponse(data: unknown) {
  return { data }
}

beforeEach(() => {
  directusServiceRequestMock.mockReset()
})

// A small in-memory stand-in for the three collections, so a test can
// assert end-to-end behavior (resolve twice, get the same Account) rather
// than only the shape of individual calls.
function installStore(options: { links?: any[]; accounts?: any[]; grants?: any[] } = {}) {
  const links = [...(options.links ?? [])]
  const accounts = [...(options.accounts ?? [])]
  const grants = [...(options.grants ?? [])]
  let created = 0

  directusServiceRequestMock.mockImplementation(async (path: string, opts: any) => {
    const filter = opts?.query?.filter ?? {}

    if (path === '/items/eldra_identity_links' && opts.method === 'GET') {
      const key = filter?.identity_key?._eq
      const accountId = filter?.account_id?._eq
      if (key !== undefined) return jsonResponse(links.filter((l) => l.identity_key === key))
      return jsonResponse(links.filter((l) => l.account_id === accountId))
    }

    if (path === '/items/eldra_identity_links' && opts.method === 'POST') {
      if (links.some((l) => l.identity_key === opts.body.identity_key)) {
        // What Directus's own unique index on identity_key returns.
        throw Object.assign(new Error('Value has to be unique'), {
          data: { errors: [{ message: 'Field "identity_key" has to be unique.' }] }
        })
      }
      links.push({ id: `link-${links.length + 1}`, ...opts.body })
      return jsonResponse(links.at(-1))
    }

    if (path === '/items/eldra_accounts' && opts.method === 'GET') {
      const id = filter?.id?._eq
      const ids = filter?.id?._in
      if (ids) return jsonResponse(accounts.filter((a) => ids.includes(a.id)))
      return jsonResponse(accounts.filter((a) => a.id === id))
    }

    if (path === '/items/eldra_accounts' && opts.method === 'POST') {
      created += 1
      const row = { id: `${ELDRA_ACCOUNT_ID}-${created}`, ...opts.body }
      accounts.push(row)
      return jsonResponse(row)
    }

    if (path === '/items/eldra_platform_grants' && opts.method === 'GET') {
      return jsonResponse(grants.filter((g) => g.account_id === filter?.account_id?._eq))
    }

    throw new Error(`unexpected call: ${opts?.method} ${path}`)
  })

  return { links, accounts, grants, createdCount: () => created }
}

describe('identity keys', () => {
  it('keys an identity on (provider, provider_subject)', () => {
    expect(buildIdentityKey('directus', DIRECTUS_USER_ID)).toBe(`directus|${DIRECTUS_USER_ID}`)
  })

  it('keys a grant on (account_id, capability)', () => {
    expect(buildGrantKey(ELDRA_ACCOUNT_ID, 'platform.settings.manage')).toBe(
      `${ELDRA_ACCOUNT_ID}|platform.settings.manage`
    )
  })
})

describe('resolveAccountForIdentity', () => {
  it('mints an Eldra-owned Account id that is NOT the Directus user id', async () => {
    installStore()

    const account = await resolveAccountForIdentity({
      provider: 'directus',
      providerSubject: DIRECTUS_USER_ID,
      displayName: 'Admin User'
    })

    expect(account.id).not.toBe(DIRECTUS_USER_ID)
    expect(account.id).toBeTruthy()
    expect(account.status).toBe('active')
  })

  it('records the Directus user id ONLY as a provider subject on the identity link', async () => {
    const store = installStore()

    const account = await resolveAccountForIdentity({
      provider: 'directus',
      providerSubject: DIRECTUS_USER_ID,
      displayName: 'Admin User'
    })

    expect(store.links).toHaveLength(1)
    expect(store.links[0]).toMatchObject({
      account_id: account.id,
      provider: 'directus',
      provider_subject: DIRECTUS_USER_ID,
      identity_key: `directus|${DIRECTUS_USER_ID}`
    })
    // The Account row itself carries no Directus identifier at all.
    expect(JSON.stringify(store.accounts[0])).not.toContain(DIRECTUS_USER_ID)
  })

  it('is idempotent -- resolving the same identity twice returns the SAME Account and creates no second one', async () => {
    const store = installStore()

    const first = await resolveAccountForIdentity({
      provider: 'directus',
      providerSubject: DIRECTUS_USER_ID,
      displayName: 'Admin User'
    })
    const second = await resolveAccountForIdentity({
      provider: 'directus',
      providerSubject: DIRECTUS_USER_ID,
      displayName: 'Renamed Since'
    })

    expect(second.id).toBe(first.id)
    expect(store.createdCount()).toBe(1)
    expect(store.links).toHaveLength(1)
  })

  it('never matches an existing Account by email or display name -- only by (provider, subject)', async () => {
    // An Account that already exists with the same human-readable name,
    // linked to a DIFFERENT provider subject. Matching on the name would
    // hand this new identity someone else's Account; that is the federated
    // identity takeover §6.2 rule 2 forbids.
    const store = installStore({
      accounts: [{ id: 'existing-account', display_name: 'Admin User', status: 'active' }],
      links: [
        {
          id: 'link-existing',
          account_id: 'existing-account',
          provider: 'directus',
          provider_subject: 'some-other-subject',
          identity_key: 'directus|some-other-subject'
        }
      ]
    })

    const account = await resolveAccountForIdentity({
      provider: 'directus',
      providerSubject: DIRECTUS_USER_ID,
      displayName: 'Admin User'
    })

    expect(account.id).not.toBe('existing-account')
    expect(store.createdCount()).toBe(1)
  })

  it('a concurrent first-login loses the unique-index race and returns the winner\'s Account, never a second one', async () => {
    const store = installStore()

    // Simulate the race: the courtesy pre-check finds nothing, but by the
    // time the link insert runs, another request has already written it.
    let preChecked = false
    const base = directusServiceRequestMock.getMockImplementation()!
    directusServiceRequestMock.mockImplementation(async (path: string, opts: any) => {
      if (path === '/items/eldra_identity_links' && opts.method === 'GET' && !preChecked) {
        preChecked = true
        return jsonResponse([]) // nothing yet, from this request's point of view
      }
      if (path === '/items/eldra_accounts' && opts.method === 'POST' && preChecked && store.links.length === 0) {
        // The winner commits in between.
        store.accounts.push({ id: 'winner-account', display_name: 'Admin User', status: 'active' })
        store.links.push({
          id: 'link-winner',
          account_id: 'winner-account',
          provider: 'directus',
          provider_subject: DIRECTUS_USER_ID,
          identity_key: `directus|${DIRECTUS_USER_ID}`
        })
      }
      return base(path, opts)
    })

    const account = await resolveAccountForIdentity({
      provider: 'directus',
      providerSubject: DIRECTUS_USER_ID,
      displayName: 'Admin User'
    })

    expect(account.id).toBe('winner-account')
    expect(store.links).toHaveLength(1)
  })

  it('refuses to resolve without a provider subject rather than inventing an identity', async () => {
    installStore()

    await expect(
      resolveAccountForIdentity({ provider: 'directus', providerSubject: '   ', displayName: 'Nobody' })
    ).rejects.toMatchObject({ statusCode: 500 })

    expect(directusServiceRequestMock).not.toHaveBeenCalled()
  })

  it('fails loudly when a link points at a missing Account -- never silently re-mints one', async () => {
    installStore({
      links: [
        {
          id: 'link-orphan',
          account_id: 'deleted-account',
          provider: 'directus',
          provider_subject: DIRECTUS_USER_ID,
          identity_key: `directus|${DIRECTUS_USER_ID}`
        }
      ]
    })

    await expect(
      resolveAccountForIdentity({
        provider: 'directus',
        providerSubject: DIRECTUS_USER_ID,
        displayName: 'Admin User'
      })
    ).rejects.toMatchObject({ statusCode: 500 })
  })

  it('falls back to the subject as a display name rather than storing a blank one', async () => {
    const store = installStore()

    await resolveAccountForIdentity({
      provider: 'directus',
      providerSubject: DIRECTUS_USER_ID,
      displayName: '   '
    })

    expect(store.accounts[0].display_name).toBe(DIRECTUS_USER_ID)
  })
})

describe('listIdentitySubjectsForAccount', () => {
  it('returns every linked provider subject for the Account', async () => {
    installStore({
      links: [
        { id: 'l1', account_id: ELDRA_ACCOUNT_ID, provider: 'directus', provider_subject: DIRECTUS_USER_ID },
        { id: 'l2', account_id: ELDRA_ACCOUNT_ID, provider: 'directus', provider_subject: 'second-subject' },
        { id: 'l3', account_id: 'someone-else', provider: 'directus', provider_subject: 'not-mine' }
      ]
    })

    const subjects = await listIdentitySubjectsForAccount(ELDRA_ACCOUNT_ID)

    expect(subjects).toEqual([DIRECTUS_USER_ID, 'second-subject'])
  })
})

describe('listPlatformGrants', () => {
  it('returns the explicitly granted capability strings for the Account', async () => {
    installStore({
      grants: [
        { id: 'g1', account_id: ELDRA_ACCOUNT_ID, capability: 'platform.settings.manage' },
        { id: 'g2', account_id: ELDRA_ACCOUNT_ID, capability: 'platform.world.list' },
        { id: 'g3', account_id: 'someone-else', capability: 'platform.world.delete' }
      ]
    })

    const grants = await listPlatformGrants(ELDRA_ACCOUNT_ID)

    expect(grants).toEqual(['platform.settings.manage', 'platform.world.list'])
  })

  it('returns nothing for an Account with no grant rows -- the default is no platform capability', async () => {
    installStore()

    expect(await listPlatformGrants(ELDRA_ACCOUNT_ID)).toEqual([])
  })
})

describe('resolveAccountDisplayNames', () => {
  it('resolves names for Eldra Account ids and omits ids that are not Accounts', async () => {
    installStore({
      accounts: [{ id: ELDRA_ACCOUNT_ID, display_name: 'Sam Ledoux', status: 'active' }]
    })

    const names = await resolveAccountDisplayNames([ELDRA_ACCOUNT_ID, DIRECTUS_USER_ID])

    expect(names.get(ELDRA_ACCOUNT_ID)).toBe('Sam Ledoux')
    // A legacy Directus-keyed id is absent rather than guessed at, which is
    // what lets the caller fall through to its own /users lookup for it.
    expect(names.has(DIRECTUS_USER_ID)).toBe(false)
  })

  it('does not query at all for an empty id list', async () => {
    installStore()

    expect(await resolveAccountDisplayNames([])).toEqual(new Map())
    expect(directusServiceRequestMock).not.toHaveBeenCalled()
  })
})
