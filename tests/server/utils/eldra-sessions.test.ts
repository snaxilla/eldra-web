// Unit tests for Eldra-owned sessions (server/utils/eldra-sessions.ts).
// See that module's own header for why this exists at all (an
// OIDC-authenticated principal has no Directus credential to validate a
// session against) and scripts/directus/create-eldra-sessions-schema.mjs
// for the collection this is the only reader/writer of.
//
// server/utils/directus.ts relies on Nuxt/Nitro auto-imports that do not
// exist under plain Vitest -- mocked at the boundary, the established
// pattern in this repo.

import { createHash } from 'node:crypto'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { directusServiceRequestMock } = vi.hoisted(() => ({
  directusServiceRequestMock: vi.fn()
}))

vi.mock('../../../server/utils/directus', () => ({
  directusServiceRequest: directusServiceRequestMock
}))

import { createEldraSession, resolveEldraSession, revokeEldraSession } from '../../../server/utils/eldra-sessions'

const ACCOUNT_ID = 'eldra-account-1'

function hash(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

type Row = { id: string; account_id: string; token_hash: string; expires_at: string; revoked_at: string | null }

function installStore(rows: Row[] = []) {
  const store = [...rows]
  let nextId = 1

  directusServiceRequestMock.mockImplementation(async (path: string, opts: any) => {
    if (path === '/items/eldra_sessions' && opts.method === 'GET') {
      const hashFilter = opts.query?.filter?.token_hash?._eq
      return { data: store.filter((row) => row.token_hash === hashFilter) }
    }
    if (path === '/items/eldra_sessions' && opts.method === 'POST') {
      const row: Row = { id: `session-${nextId++}`, revoked_at: null, ...opts.body }
      store.push(row)
      return { data: row }
    }
    const patchMatch = path.match(/^\/items\/eldra_sessions\/(.+)$/)
    if (patchMatch && opts.method === 'PATCH') {
      const row = store.find((r) => r.id === patchMatch[1])
      if (!row) throw Object.assign(new Error('not found'), { statusCode: 404 })
      Object.assign(row, opts.body)
      return { data: row }
    }
    throw new Error(`unexpected call: ${opts.method} ${path}`)
  })

  return store
}

beforeEach(() => {
  directusServiceRequestMock.mockReset()
})

describe('createEldraSession', () => {
  it('issues a raw token and stores only its hash -- never the raw value', async () => {
    const store = installStore()

    const session = await createEldraSession(ACCOUNT_ID)

    expect(session.token).toBeTruthy()
    expect(store).toHaveLength(1)
    expect(store[0].token_hash).toBe(hash(session.token))
    expect(store[0].token_hash).not.toBe(session.token)
    expect(JSON.stringify(store)).not.toContain(session.token)
  })

  it('sets an expiry roughly 7 days out', async () => {
    installStore()

    const before = Date.now()
    const session = await createEldraSession(ACCOUNT_ID)
    const expiresAt = new Date(session.expiresAt).getTime()

    const sevenDaysMs = 60 * 60 * 24 * 7 * 1000
    expect(expiresAt).toBeGreaterThan(before + sevenDaysMs - 5000)
    expect(expiresAt).toBeLessThan(before + sevenDaysMs + 5000)
  })

  it('two sessions for the same account get two distinct, unguessable tokens', async () => {
    installStore()

    const a = await createEldraSession(ACCOUNT_ID)
    const b = await createEldraSession(ACCOUNT_ID)

    expect(a.token).not.toBe(b.token)
  })
})

describe('resolveEldraSession', () => {
  it('resolves a valid, unexpired, unrevoked token to its account id', async () => {
    const rawToken = 'a-raw-token'
    installStore([
      { id: 's1', account_id: ACCOUNT_ID, token_hash: hash(rawToken), expires_at: new Date(Date.now() + 10000).toISOString(), revoked_at: null }
    ])

    const result = await resolveEldraSession(rawToken)

    expect(result).toEqual({ accountId: ACCOUNT_ID })
  })

  it('returns null for a token that was never issued', async () => {
    installStore([])

    expect(await resolveEldraSession('never-issued')).toBeNull()
  })

  it('returns null for a blank token without querying the store', async () => {
    installStore([])

    expect(await resolveEldraSession('   ')).toBeNull()
    expect(directusServiceRequestMock).not.toHaveBeenCalled()
  })

  it('returns null for an EXPIRED session', async () => {
    const rawToken = 'expired-token'
    installStore([
      { id: 's1', account_id: ACCOUNT_ID, token_hash: hash(rawToken), expires_at: new Date(Date.now() - 1000).toISOString(), revoked_at: null }
    ])

    expect(await resolveEldraSession(rawToken)).toBeNull()
  })

  it('returns null for a REVOKED session, even if not yet expired', async () => {
    const rawToken = 'revoked-token'
    installStore([
      { id: 's1', account_id: ACCOUNT_ID, token_hash: hash(rawToken), expires_at: new Date(Date.now() + 10000).toISOString(), revoked_at: new Date().toISOString() }
    ])

    expect(await resolveEldraSession(rawToken)).toBeNull()
  })

  it('opportunistically updates last_used_at, but a failure to do so does not invalidate an otherwise-valid session', async () => {
    const rawToken = 'a-raw-token'
    installStore([
      { id: 's1', account_id: ACCOUNT_ID, token_hash: hash(rawToken), expires_at: new Date(Date.now() + 10000).toISOString(), revoked_at: null }
    ])
    // Make the PATCH (last_used_at update) fail -- the GET above already
    // resolved successfully by the time this would run.
    const base = directusServiceRequestMock.getMockImplementation()!
    directusServiceRequestMock.mockImplementation(async (path: string, opts: any) => {
      if (opts.method === 'PATCH') throw new Error('transient write failure')
      return base(path, opts)
    })
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {})

    const result = await resolveEldraSession(rawToken)

    expect(result).toEqual({ accountId: ACCOUNT_ID })
    // Let the fire-and-forget PATCH's rejection settle before asserting.
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(logged).toHaveBeenCalled()
    logged.mockRestore()
  })
})

describe('revokeEldraSession', () => {
  it('revokes a valid session', async () => {
    const rawToken = 'a-raw-token'
    const store = installStore([
      { id: 's1', account_id: ACCOUNT_ID, token_hash: hash(rawToken), expires_at: new Date(Date.now() + 10000).toISOString(), revoked_at: null }
    ])

    await revokeEldraSession(rawToken)

    expect(store[0].revoked_at).toBeTruthy()
    expect(await resolveEldraSession(rawToken)).toBeNull()
  })

  it('is idempotent -- revoking an already-revoked session is a silent no-op', async () => {
    const rawToken = 'a-raw-token'
    const revokedAt = new Date(Date.now() - 5000).toISOString()
    const store = installStore([
      { id: 's1', account_id: ACCOUNT_ID, token_hash: hash(rawToken), expires_at: new Date(Date.now() + 10000).toISOString(), revoked_at: revokedAt }
    ])

    await expect(revokeEldraSession(rawToken)).resolves.toBeUndefined()
    expect(store[0].revoked_at).toBe(revokedAt) // unchanged, not re-patched

    const patchCalls = directusServiceRequestMock.mock.calls.filter(([, opts]) => opts.method === 'PATCH')
    expect(patchCalls).toHaveLength(0)
  })

  it('revoking a token that was never issued is a silent no-op, not an error', async () => {
    installStore([])

    await expect(revokeEldraSession('never-issued')).resolves.toBeUndefined()
  })

  it('revoking a blank token is a silent no-op with no store call', async () => {
    installStore([])

    await revokeEldraSession('')

    expect(directusServiceRequestMock).not.toHaveBeenCalled()
  })
})

// Security review (OIDC architecture audit) -- before this fix, every one
// of these three functions called directusServiceRequest directly, so a
// Directus-side failure (most realistically: the `eldra_sessions`
// collection not yet provisioned, which Directus answers with the same
// 403 shape as "the service token may not read this" -- see
// server/utils/eldra-accounts.ts's own identityStoreError for the
// verified detail) propagated as Directus's OWN raw error. h3 serializes
// an uncaught thrown object's own `data`/`statusCode` into the actual HTTP
// response, so that error would have reached an unauthenticated caller
// completing server/api/auth/oidc/callback.get.ts's login flow. These
// pin that a store failure now always surfaces as a generic 503, never
// the raw Directus error, for all three entry points.
describe('session store failures never propagate as the raw Directus error', () => {
  function directusRejects() {
    directusServiceRequestMock.mockReset()
    directusServiceRequestMock.mockRejectedValue(
      Object.assign(new Error("You don't have permission to access this."), {
        statusCode: 403,
        data: { errors: [{ message: "You don't have permission to access this.", extensions: { code: 'FORBIDDEN' } }] }
      })
    )
  }

  it('createEldraSession maps a store failure to a generic 503, never Directus\'s own 403/message', async () => {
    directusRejects()

    await expect(createEldraSession(ACCOUNT_ID)).rejects.toMatchObject({ statusCode: 503 })
    try {
      await createEldraSession(ACCOUNT_ID)
    } catch (error: any) {
      expect(JSON.stringify(error)).not.toContain('FORBIDDEN')
      expect(JSON.stringify(error)).not.toContain("don't have permission")
    }
  })

  it('resolveEldraSession\'s lookup maps a store failure the same way', async () => {
    directusRejects()

    await expect(resolveEldraSession('some-token')).rejects.toMatchObject({ statusCode: 503 })
  })

  it('revokeEldraSession\'s lookup maps a store failure the same way', async () => {
    directusRejects()

    await expect(revokeEldraSession('some-token')).rejects.toMatchObject({ statusCode: 503 })
  })

  it('revokeEldraSession\'s revoking PATCH maps a store failure the same way, after a successful lookup', async () => {
    const rawToken = 'a-raw-token'
    installStore([
      { id: 's1', account_id: ACCOUNT_ID, token_hash: hash(rawToken), expires_at: new Date(Date.now() + 10000).toISOString(), revoked_at: null }
    ])
    const base = directusServiceRequestMock.getMockImplementation()!
    directusServiceRequestMock.mockImplementation(async (path: string, opts: any) => {
      if (opts.method === 'PATCH') {
        throw Object.assign(new Error('forbidden'), { statusCode: 403 })
      }
      return base(path, opts)
    })

    await expect(revokeEldraSession(rawToken)).rejects.toMatchObject({ statusCode: 503 })
  })

  it('still logs the real Directus detail server-side, so the failure is diagnosable from the server log alone', async () => {
    directusRejects()
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {})

    await expect(createEldraSession(ACCOUNT_ID)).rejects.toBeTruthy()

    expect(logged).toHaveBeenCalled()
    logged.mockRestore()
  })
})
