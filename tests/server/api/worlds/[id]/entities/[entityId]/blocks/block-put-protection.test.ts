// PHASE 2C.2C -- the generic block PUT refuses the two AUTHORITATIVE character
// blocks, and only those. Two authoritative blocks are never writable here:
//   catalogue_selection -- creation-owned identity.
//   progression          -- evolved state (level, subclass, acquired feats).
// Both are written only by dedicated workflows (creation; Level Manager confirm),
// which apply the authority a generic write would bypass. The ordinary-block test
// proves the protection is not a blanket refusal.

import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { H3Event } from 'h3'

// Nitro auto-imports these in production. Set BEFORE the handler module evaluates
// (hoisted above the imports), since its top-level defineEventHandler runs on import.
vi.hoisted(() => {
  const g = globalThis as any
  g.defineEventHandler = (fn: unknown) => fn
  g.getRouterParam = (event: any, name: string) => event.context.params?.[name]
  g.readBody = async (event: any) => event._requestBody
  g.createError = (input: { statusCode: number; statusMessage?: string }) =>
    Object.assign(new Error(input.statusMessage ?? 'error'), { statusCode: input.statusCode })
})

vi.mock('h3', async () => {
  const actual = await vi.importActual<typeof import('h3')>('h3')
  return { ...actual, readBody: vi.fn(async (event: any) => event._requestBody) }
})


import handler from '../../../../../../../../server/api/worlds/[id]/entities/[entityId]/blocks/[blockKey].put'

const WORLD_ID = 5
const ENTITY_ID = 42

function event(blockKey: string, body: unknown = { data: { value: 1 } }): H3Event {
  return {
    context: {
      principal: {
        accountId: 'gm-1',
        platformCapabilities: new Set(),
        worldCapabilities: new Map([[String(WORLD_ID), new Set(['world.read', 'world.entity.edit'])]]),
        temporarySingleUserMode: false
      },
      params: { id: String(WORLD_ID), entityId: String(ENTITY_ID), blockKey }
    },
    node: { req: {}, res: { statusCode: 200 } },
    _requestBody: body
  } as unknown as H3Event
}

// The handler's own dxFetch calls the network `fetch` directly. The real seam is
// that boundary: every non-GET request is a write the test records.
type Call = { url: string, method: string }
let calls: Call[] = []

function writes() {
  return calls.filter((call) => call.method !== 'GET')
}

function fakeResponse(body: unknown) {
  const text = body === null ? '' : JSON.stringify(body)
  return { ok: true, status: 200, text: async () => text }
}

beforeEach(() => {
  process.env.DIRECTUS_URL = 'http://directus.test'
  process.env.DIRECTUS_TOKEN = 'test-token'
  calls = []
  vi.stubGlobal('fetch', async (url: string, init: { method?: string } = {}) => {
    const method = init.method ?? 'GET'
    calls.push({ url, method })
    if (url.includes(`/items/entities/${ENTITY_ID}`)) return fakeResponse({ data: { id: ENTITY_ID, world_id: WORLD_ID } })
    if (url.includes('/items/block_instances') && method === 'GET') return fakeResponse({ data: [{ id: 9 }] })
    return fakeResponse({ data: { id: 9 } })
  })
})

describe('generic block PUT -- authoritative character blocks are refused', () => {
  it.each(['catalogue_selection', 'progression'])('%s -> 403, and nothing is written', async (blockKey) => {
    await expect(handler(event(blockKey) as any)).rejects.toMatchObject({ statusCode: 403 })
    expect(writes()).toHaveLength(0)
  })

  it('a progression write attempt carrying a forged feat is refused before any read-modify-write', async () => {
    await expect(handler(event('progression', { data: { classes: [], feats: [{ featRef: { packageId: 'x', slug: 'y' }, choiceKey: 'z' }] } }) as any))
      .rejects.toMatchObject({ statusCode: 403 })
    expect(writes()).toHaveLength(0)
  })
})

describe('generic block PUT -- ordinary blocks still follow the existing behavior', () => {
  it('a non-authoritative block (notes) is not refused and is written', async () => {
    await expect(handler(event('notes', { data: { text: 'hello' } }) as any)).resolves.toBeDefined()
    expect(writes().length).toBeGreaterThan(0)
  })
})
