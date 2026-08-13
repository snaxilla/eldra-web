// Unit tests for World creation (server/utils/worlds.ts). See
// .github/docs/architecture/ownership-and-permissions.md (Revision 2) §5.3,
// §10.1, and §12 Phase 0.
//
// server/utils/directus.ts relies on Nuxt/Nitro auto-imports that do not
// exist under plain Vitest -- the established pattern in this repo (see
// tests/server/utils/rules-packages.test.ts) is to mock that module at the
// boundary rather than let it execute. slugify (server/utils/entity-factory.ts)
// is pure and used for real.

import { beforeEach, describe, expect, it, vi } from 'vitest'

const { directusServiceRequestMock } = vi.hoisted(() => ({
  directusServiceRequestMock: vi.fn()
}))

vi.mock('../../../server/utils/directus', () => ({
  directusServiceRequest: directusServiceRequestMock
}))

import { createWorld, normalizeWorld } from '../../../server/utils/worlds'

beforeEach(() => {
  directusServiceRequestMock.mockReset()
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
  it('creates a World with the caller as owner_id -- temporary ownership model', async () => {
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
