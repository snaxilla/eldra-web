// Unit tests for World creation (server/utils/worlds.ts). See
// .github/docs/architecture/ownership-and-permissions.md (Revision 2) §5.3,
// §8.5, §10.1, and §12 Phase 0+2.
//
// server/utils/directus.ts relies on Nuxt/Nitro auto-imports that do not
// exist under plain Vitest -- the established pattern in this repo (see
// tests/server/utils/rules-packages.test.ts) is to mock that module at the
// boundary rather than let it execute. slugify (server/utils/entity-factory.ts)
// is pure and used for real.
//
// server/utils/world-memberships.ts's createOwnerMembership is mocked too
// (rather than exercised through the same directusServiceRequest mock) so
// this file's slug-generation/defaults assertions -- several of which count
// exactly how many GET calls createWorld makes -- stay isolated from
// createOwnerMembership's own internal Directus calls, which
// tests/server/utils/world-memberships.test.ts already covers directly.

import { beforeEach, describe, expect, it, vi } from 'vitest'

const { directusServiceRequestMock, createOwnerMembershipMock } = vi.hoisted(() => ({
  directusServiceRequestMock: vi.fn(),
  createOwnerMembershipMock: vi.fn()
}))

vi.mock('../../../server/utils/directus', () => ({
  directusServiceRequest: directusServiceRequestMock
}))

vi.mock('../../../server/utils/world-memberships', () => ({
  createOwnerMembership: createOwnerMembershipMock
}))

import { createWorld, normalizeWorld, getWorldById, renameWorld, MAX_WORLD_NAME_LENGTH } from '../../../server/utils/worlds'

beforeEach(() => {
  directusServiceRequestMock.mockReset()
  createOwnerMembershipMock.mockReset()
  createOwnerMembershipMock.mockResolvedValue({ id: 'membership-1', worldId: '1', accountId: 'account-1', role: 'owner', createdAt: null })
})

describe('normalizeWorld', () => {
  it('maps a Directus row onto the shared World shape', () => {
    const world = normalizeWorld({
      id: 7,
      name: 'Varin',
      slug: 'varin',
      system_key: 'dnd5e',
      description: 'A world',
      visibility: 'private',
      owner_id: 'account-1'
    })

    expect(world).toEqual({
      id: 7,
      name: 'Varin',
      slug: 'varin',
      system_key: 'dnd5e',
      systemKey: 'dnd5e',
      description: 'A world',
      visibility: 'private',
      owner_id: 'account-1',
      banner_image_url: null,
      sidebar_image_url: null
    })
  })

  it('falls back to defaults for a sparse row', () => {
    const world = normalizeWorld({ id: 1 })

    expect(world.name).toBe('Untitled World')
    expect(world.visibility).toBe('private')
    expect(world.owner_id).toBeNull()
  })
})

describe('createWorld', () => {
  it('creates a World with the caller as owner_id -- compatibility column, alongside real membership', async () => {
    directusServiceRequestMock.mockImplementation(async (path: string, options: any) => {
      if (options.method === 'GET') {
        return { data: [] } // no slug collision
      }
      return { data: { id: 10, ...options.body } }
    })

    const world = await createWorld({ name: 'New World', ownerAccountId: 'account-42' })

    expect(world.owner_id).toBe('account-42')

    const postCall = directusServiceRequestMock.mock.calls.find(([, options]) => options.method === 'POST')
    expect(postCall?.[1].body.owner_id).toBe('account-42')
  })

  it('creates the initial Owner membership after the World row exists -- the real ownership model', async () => {
    directusServiceRequestMock.mockImplementation(async (path: string, options: any) => {
      if (options.method === 'GET') return { data: [] }
      return { data: { id: 99, ...options.body } }
    })

    const world = await createWorld({ name: 'Owned World', ownerAccountId: 'account-owner' })

    expect(world.id).toBe(99)
    expect(createOwnerMembershipMock).toHaveBeenCalledTimes(1)
    expect(createOwnerMembershipMock).toHaveBeenCalledWith(99, 'account-owner')
  })

  it('propagates a failure to create the owner membership rather than swallowing it', async () => {
    directusServiceRequestMock.mockImplementation(async (path: string, options: any) => {
      if (options.method === 'GET') return { data: [] }
      return { data: { id: 20, ...options.body } }
    })
    createOwnerMembershipMock.mockRejectedValue(new Error('membership creation failed'))

    await expect(createWorld({ name: 'World', ownerAccountId: 'account-1' })).rejects.toThrow('membership creation failed')
  })

  it('defaults are initialized correctly: system_key, visibility, description', async () => {
    directusServiceRequestMock.mockImplementation(async (path: string, options: any) => {
      if (options.method === 'GET') return { data: [] }
      return { data: { id: 11, ...options.body } }
    })

    const world = await createWorld({ name: 'Defaults World', ownerAccountId: 'account-1' })

    expect(world.system_key).toBe('dnd5e')
    expect(world.visibility).toBe('private')
    expect(world.description).toBe('')
  })

  it('honors an explicit systemKey and public visibility when provided', async () => {
    directusServiceRequestMock.mockImplementation(async (path: string, options: any) => {
      if (options.method === 'GET') return { data: [] }
      return { data: { id: 12, ...options.body } }
    })

    const world = await createWorld({
      name: 'Custom World',
      ownerAccountId: 'account-1',
      systemKey: 'pf2e',
      visibility: 'public',
      description: '  A description  '
    })

    expect(world.system_key).toBe('pf2e')
    expect(world.visibility).toBe('public')
    expect(world.description).toBe('A description')
  })

  it('rejects any visibility other than public as private -- no silent pass-through of unknown values', async () => {
    directusServiceRequestMock.mockImplementation(async (path: string, options: any) => {
      if (options.method === 'GET') return { data: [] }
      return { data: { id: 13, ...options.body } }
    })

    const world = await createWorld({ name: 'World', ownerAccountId: 'account-1', visibility: 'not-a-real-value' })

    expect(world.visibility).toBe('private')
  })

  it('derives a slug from the name', async () => {
    directusServiceRequestMock.mockImplementation(async (path: string, options: any) => {
      if (options.method === 'GET') return { data: [] }
      return { data: { id: 14, ...options.body } }
    })

    const world = await createWorld({ name: 'The Shattered Isles!', ownerAccountId: 'account-1' })

    expect(world.slug).toBe('the-shattered-isles')
  })

  it('appends a numeric suffix when the derived slug already exists', async () => {
    let getCallCount = 0
    directusServiceRequestMock.mockImplementation(async (path: string, options: any) => {
      if (options.method === 'GET') {
        getCallCount++
        // First candidate ("varin") collides; second ("varin-2") is free.
        return { data: getCallCount === 1 ? [{ id: 1 }] : [] }
      }
      return { data: { id: 15, ...options.body } }
    })

    const world = await createWorld({ name: 'Varin', ownerAccountId: 'account-1' })

    expect(world.slug).toBe('varin-2')
    expect(getCallCount).toBe(2)
  })

  it('requests only the envelope fields on create, never the full row wholesale', async () => {
    directusServiceRequestMock.mockImplementation(async (path: string, options: any) => {
      if (options.method === 'GET') return { data: [] }
      return { data: { id: 16, ...options.body } }
    })

    await createWorld({ name: 'World', ownerAccountId: 'account-1' })

    const postCall = directusServiceRequestMock.mock.calls.find(([, options]) => options.method === 'POST')
    expect(postCall?.[1].query.fields).toBe('id,name,slug,system_key,description,visibility,owner_id')
  })
})

describe('getWorldById', () => {
  it('returns the normalized World for a real id', async () => {
    directusServiceRequestMock.mockResolvedValue({ data: { id: 5, name: 'Solaris', slug: 'solaris' } })

    const world = await getWorldById(5)

    expect(world?.name).toBe('Solaris')
    expect(world?.slug).toBe('solaris')
    const call = directusServiceRequestMock.mock.calls[0]
    expect(call[0]).toBe('/items/worlds/5')
    expect(call[1].method).toBe('GET')
  })

  it('returns null when Directus has no matching row', async () => {
    directusServiceRequestMock.mockResolvedValue({ data: null })

    expect(await getWorldById(999)).toBeNull()
  })

  it('returns null (never throws) when the Directus request itself fails', async () => {
    directusServiceRequestMock.mockRejectedValue(new Error('network error'))

    expect(await getWorldById(5)).toBeNull()
  })
})

describe('renameWorld -- World Properties (Game Admin -> World Properties -> change name -> Save)', () => {
  beforeEach(() => {
    directusServiceRequestMock.mockReset()
  })

  it('renames the World, preserving id and slug untouched', async () => {
    directusServiceRequestMock.mockImplementation(async (path: string, options: any) => {
      if (options.method === 'GET') return { data: { id: 5, name: 'Old Name', slug: 'old-slug', system_key: 'dnd5e' } }
      return { data: { id: 5, name: options.body.name, slug: 'old-slug', system_key: 'dnd5e' } }
    })

    const result = await renameWorld(5, 'New Name')

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.changed).toBe(true)
    expect(result.world.id).toBe(5)
    expect(result.world.slug).toBe('old-slug')
    expect(result.world.name).toBe('New Name')
  })

  it('trims surrounding whitespace before saving', async () => {
    directusServiceRequestMock.mockImplementation(async (path: string, options: any) => {
      if (options.method === 'GET') return { data: { id: 5, name: 'Old Name', slug: 'old-slug' } }
      return { data: { id: 5, name: options.body.name, slug: 'old-slug' } }
    })

    await renameWorld(5, '   Trimmed Name   ')

    const patchCall = directusServiceRequestMock.mock.calls.find(([, options]) => options.method === 'PATCH')
    expect(patchCall?.[1].body.name).toBe('Trimmed Name')
  })

  it('rejects an empty name without ever calling Directus to write', async () => {
    const result = await renameWorld(5, '')

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.stage).toBe('invalid-name')
    expect((result as any).reason).toBe('empty')
    expect(directusServiceRequestMock).not.toHaveBeenCalled()
  })

  it('rejects a whitespace-only name the same way as empty', async () => {
    const result = await renameWorld(5, '   \t  ')

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.stage).toBe('invalid-name')
    expect((result as any).reason).toBe('empty')
    expect(directusServiceRequestMock).not.toHaveBeenCalled()
  })

  it('rejects a name longer than MAX_WORLD_NAME_LENGTH without ever calling Directus', async () => {
    const result = await renameWorld(5, 'x'.repeat(MAX_WORLD_NAME_LENGTH + 1))

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.stage).toBe('invalid-name')
    expect((result as any).reason).toBe('too-long')
    expect(directusServiceRequestMock).not.toHaveBeenCalled()
  })

  it('accepts a name at exactly MAX_WORLD_NAME_LENGTH', async () => {
    const exactName = 'x'.repeat(MAX_WORLD_NAME_LENGTH)
    directusServiceRequestMock.mockImplementation(async (path: string, options: any) => {
      if (options.method === 'GET') return { data: { id: 5, name: 'Old Name', slug: 'old-slug' } }
      return { data: { id: 5, name: options.body.name, slug: 'old-slug' } }
    })

    const result = await renameWorld(5, exactName)
    expect(result.ok).toBe(true)
  })

  it('reports not-found for a World id that does not exist, without writing', async () => {
    directusServiceRequestMock.mockResolvedValue({ data: null })

    const result = await renameWorld(999, 'New Name')

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.stage).toBe('not-found')
    const patchCall = directusServiceRequestMock.mock.calls.find(([, options]) => options.method === 'PATCH')
    expect(patchCall).toBeUndefined()
  })

  it('no-op: an unchanged name (after trim) never issues a Directus write', async () => {
    directusServiceRequestMock.mockImplementation(async (path: string, options: any) => {
      if (options.method === 'GET') return { data: { id: 5, name: 'Same Name', slug: 'same-slug' } }
      throw new Error('should never PATCH for a no-op rename')
    })

    const result = await renameWorld(5, '  Same Name  ')

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.changed).toBe(false)
    expect(result.world.name).toBe('Same Name')
    const patchCall = directusServiceRequestMock.mock.calls.find(([, options]) => options.method === 'PATCH')
    expect(patchCall).toBeUndefined()
  })

  it('duplicate names across different Worlds are allowed -- no uniqueness check, matching createWorld\'s own existing policy', async () => {
    directusServiceRequestMock.mockImplementation(async (path: string, options: any) => {
      if (options.method === 'GET') return { data: { id: 7, name: 'Old Name', slug: 'world-seven' } }
      return { data: { id: 7, name: options.body.name, slug: 'world-seven' } }
    })

    // "Solaris" already names a DIFFERENT World in this scenario -- renameWorld
    // never checks for that, by design, since creation never did either.
    const result = await renameWorld(7, 'Solaris')

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.world.name).toBe('Solaris')
  })
})
