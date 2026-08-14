// Unit tests for Player creation (server/utils/players.ts). See
// .github/docs/architecture/ownership-and-permissions.md (Revision 2)
// §5.3/§6.1/§10.3 and this task's own PLAYER DIRECTORY/CREATE PLAYER
// sections.
//
// server/utils/directus.ts relies on Nuxt/Nitro auto-imports that do not
// exist under plain Vitest -- the established pattern in this repo (see
// tests/server/utils/rules-packages.test.ts) is to mock that module at the
// boundary rather than let it execute.

import { beforeEach, describe, expect, it, vi } from 'vitest'

const { directusServiceRequestMock } = vi.hoisted(() => ({
  directusServiceRequestMock: vi.fn()
}))

vi.mock('../../../server/utils/directus', () => ({
  directusServiceRequest: directusServiceRequestMock
}))

import { createPlayer, isValidUsername, normalizeUsername, usernameToEmail } from '../../../server/utils/players'

function jsonResponse(data: unknown) {
  return { data }
}

beforeEach(() => {
  directusServiceRequestMock.mockReset()
})

describe('normalizeUsername / isValidUsername / usernameToEmail -- pure', () => {
  it('trims and lowercases', () => {
    expect(normalizeUsername('  Silverhand  ')).toBe('silverhand')
  })

  it('accepts lowercase letters, numbers, dots, hyphens, underscores, 3-32 chars', () => {
    expect(isValidUsername('silverhand')).toBe(true)
    expect(isValidUsername('v-1_score.99')).toBe(true)
    expect(isValidUsername('ab')).toBe(false) // too short
    expect(isValidUsername('a'.repeat(33))).toBe(false) // too long
    expect(isValidUsername('Silverhand')).toBe(false) // uppercase -- normalize first
    expect(isValidUsername('silver hand')).toBe(false) // space
    expect(isValidUsername('silver@hand')).toBe(false) // @ not allowed
  })

  it('appends the internal username domain, unrelated to any real mailbox', () => {
    // players.eldra.app is deliberately verified (this module's own header
    // comment) against the LIVE Directus instance's email validator, which
    // rejects several IANA reserved/special-use TLDs (.internal, .local,
    // .invalid) specifically -- this is not an arbitrary placeholder.
    expect(usernameToEmail('silverhand')).toBe('silverhand@players.eldra.app')
  })
})

describe('createPlayer -- validation', () => {
  it('rejects an empty display name', async () => {
    await expect(createPlayer({ displayName: '   ', username: 'validname', password: 'longenough1' })).rejects.toMatchObject({
      statusCode: 400
    })
    expect(directusServiceRequestMock).not.toHaveBeenCalled()
  })

  it('rejects an invalid username', async () => {
    await expect(createPlayer({ displayName: 'V', username: 'no', password: 'longenough1' })).rejects.toMatchObject({
      statusCode: 400
    })
    expect(directusServiceRequestMock).not.toHaveBeenCalled()
  })

  it('rejects a too-short password', async () => {
    await expect(createPlayer({ displayName: 'V', username: 'validname', password: 'short' })).rejects.toMatchObject({
      statusCode: 400
    })
    expect(directusServiceRequestMock).not.toHaveBeenCalled()
  })
})

describe('createPlayer -- creation', () => {
  it('creates a Directus user with the synthesized email, splitting Display Name into first/last', async () => {
    directusServiceRequestMock.mockImplementation(async (_path: string, options: any) => {
      if (options.method === 'GET') return jsonResponse([]) // username not taken
      return jsonResponse({ id: 'account-42', email: options.body.email, first_name: options.body.first_name, last_name: options.body.last_name })
    })

    const player = await createPlayer({ displayName: 'Johnny Silverhand', username: 'Silverhand', password: 'longenough1' })

    expect(player.accountId).toBe('account-42')
    expect(player.displayName).toBe('Johnny Silverhand')

    const postCall = directusServiceRequestMock.mock.calls.find(([, options]) => options.method === 'POST')
    expect(postCall?.[1].body).toMatchObject({
      email: 'silverhand@players.eldra.app',
      password: 'longenough1',
      first_name: 'Johnny',
      last_name: 'Silverhand'
    })
  })

  it('handles a single-word display name (no last name)', async () => {
    directusServiceRequestMock.mockImplementation(async (_path: string, options: any) => {
      if (options.method === 'GET') return jsonResponse([])
      return jsonResponse({ id: 'account-1', email: options.body.email, first_name: options.body.first_name, last_name: options.body.last_name })
    })

    await createPlayer({ displayName: 'Rogue', username: 'rogue1', password: 'longenough1' })

    const postCall = directusServiceRequestMock.mock.calls.find(([, options]) => options.method === 'POST')
    expect(postCall?.[1].body.first_name).toBe('Rogue')
    expect(postCall?.[1].body.last_name).toBeNull()
  })

  it('never sends a raw password-confirmation or role field to Directus', async () => {
    directusServiceRequestMock.mockImplementation(async (_path: string, options: any) => {
      if (options.method === 'GET') return jsonResponse([])
      return jsonResponse({ id: 'account-1', email: options.body.email })
    })

    await createPlayer({ displayName: 'V', username: 'validname', password: 'longenough1' })

    const postCall = directusServiceRequestMock.mock.calls.find(([, options]) => options.method === 'POST')
    expect(postCall?.[1].body.role).toBeUndefined()
    expect(postCall?.[1].body.passwordConfirmation).toBeUndefined()
  })
})

describe('createPlayer -- duplicate usernames rejected', () => {
  it('rejects via the pre-check when the username already exists', async () => {
    directusServiceRequestMock.mockImplementation(async (_path: string, options: any) => {
      if (options.method === 'GET') return jsonResponse([{ id: 'existing-account' }])
      throw new Error('should not attempt to create when pre-check finds a duplicate')
    })

    await expect(createPlayer({ displayName: 'V', username: 'taken', password: 'longenough1' })).rejects.toMatchObject({
      statusCode: 409
    })
  })

  it('maps a Directus uniqueness-constraint error (the race the pre-check cannot fully close) to 409', async () => {
    directusServiceRequestMock.mockImplementation(async (_path: string, options: any) => {
      if (options.method === 'GET') return jsonResponse([]) // pre-check says available
      const error: any = new Error('Directus rejected the request')
      error.data = { errors: [{ message: 'Value must be unique for field "email".' }] }
      throw error
    })

    await expect(createPlayer({ displayName: 'V', username: 'raceduser', password: 'longenough1' })).rejects.toMatchObject({
      statusCode: 409
    })
  })

  it('propagates a non-uniqueness Directus failure unchanged', async () => {
    directusServiceRequestMock.mockImplementation(async (_path: string, options: any) => {
      if (options.method === 'GET') return jsonResponse([])
      const error: any = new Error('Directus is down')
      error.data = { errors: [{ message: 'Internal Server Error' }] }
      throw error
    })

    await expect(createPlayer({ displayName: 'V', username: 'validname', password: 'longenough1' })).rejects.toThrow(
      'Directus is down'
    )
  })
})
