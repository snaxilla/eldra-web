// Unit tests for GET /api/worlds/:id (server/api/worlds/[id]/index.get.ts).
// Beta Zero audit, Issue 2: this route now attaches `capabilities` -- every
// WorldCapability the real can() grants the viewing Principal for this
// World -- so the client (app/layouts/world-workspace.vue) can hide Build
// mode instead of rendering it and failing later. can() is exercised for
// REAL (not mocked); the route's own raw `fetch` against Directus is
// stubbed globally, matching this file's existing (out-of-scope-to-change)
// Directus access pattern.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { H3Event } from 'h3'

import handler from '../../../../../server/api/worlds/[id]/index.get'
import type { Principal } from '../../../../../server/utils/authorization'

function directusWorldsResponse() {
  return {
    data: [
      { id: 5, name: 'Varin', slug: 'varin', system_key: 'dnd5e', description: '', visibility: 'private', owner_id: 'owner-1' }
    ]
  }
}

function principal(worldCapabilities: [string, string[]][], temporarySingleUserMode = false): Principal {
  return {
    accountId: 'account-1',
    platformCapabilities: new Set(),
    worldCapabilities: new Map(worldCapabilities.map(([worldId, caps]) => [worldId, new Set(caps as any)])),
    temporarySingleUserMode
  }
}

function fakeEvent(worldId: string, p: Principal | null): H3Event {
  return { context: { principal: p, params: { id: worldId } } } as unknown as H3Event
}

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(async () => ({
    ok: true,
    json: async () => directusWorldsResponse()
  })))
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('GET /api/worlds/:id -- capabilities', () => {
  it('an Owner receives world.entity.edit among their capabilities', async () => {
    const result = await handler(fakeEvent('5', principal([['5', ['world.read', 'world.entity.edit', 'world.settings.edit']]])))

    expect(result.capabilities).toContain('world.entity.edit')
  })

  it('a Player does NOT receive world.entity.edit -- the capability that gates Build mode client-side', async () => {
    const result = await handler(fakeEvent('5', principal([['5', ['world.read', 'world.character.create', 'world.character.edit_own', 'world.roll.execute']]])))

    expect(result.capabilities).not.toContain('world.entity.edit')
  })

  it('an unauthenticated request (no principal) gets an empty capability set, not a crash', async () => {
    const result = await handler(fakeEvent('5', null))

    expect(result.capabilities).toEqual([])
  })

  it('the legacy migration-gap fallback still grants world.entity.edit for the admin fallback on a World with no membership row', async () => {
    const result = await handler(fakeEvent('5', principal([], true)))

    expect(result.capabilities).toContain('world.entity.edit')
  })

  it('a real membership row is authoritative even under temporarySingleUserMode -- a Player membership does not get the admin fallback', async () => {
    const result = await handler(fakeEvent('5', principal([['5', ['world.read']]], true)))

    expect(result.capabilities).not.toContain('world.entity.edit')
  })
})
