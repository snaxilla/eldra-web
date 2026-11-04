// Unit tests for safe character deletion (server/utils/character-deletion.ts).
// See that module's own header for the full dependency trace and why each
// collection's behavior is what it is -- these tests pin exactly that
// trace, collection by collection, plus the plan/execute consistency the
// whole module is structured around.

import { beforeEach, describe, expect, it, vi } from 'vitest'

const { directusServiceRequestMock } = vi.hoisted(() => ({
  directusServiceRequestMock: vi.fn()
}))

vi.mock('../../../server/utils/directus', () => ({
  directusServiceRequest: directusServiceRequestMock
}))

import {
  deleteCharacterWithPlan,
  executeCharacterDeletion,
  planCharacterDeletion
} from '../../../server/utils/character-deletion'

const WORLD_ID = '4'
const ENTITY_ID = '1645'

type Store = {
  entity: any
  sheets: any[]
  inventory: any[]
  blockInstances: any[]
  entityActions: any[]
  entityStatblocks: any[]
  monsterProfiles: any[]
  transfers: any[]
  relationships: any[]
  rollEvents: any[]
  mapPins: any[]
  deletedPaths: string[]
  patches: { path: string; body: any }[]
}

function baseStore(overrides: Partial<Store> = {}): Store {
  return {
    entity: { id: Number(ENTITY_ID), world_id: Number(WORLD_ID), title: 'Borc', entity_type: 'pc' },
    sheets: [],
    inventory: [],
    blockInstances: [],
    entityActions: [],
    entityStatblocks: [],
    monsterProfiles: [],
    transfers: [],
    relationships: [],
    rollEvents: [],
    mapPins: [],
    deletedPaths: [],
    patches: [],
    ...overrides
  }
}

type FailureInjection = {
  // Throws this error on the Nth DELETE call for this exact path
  // (1-indexed) -- simulates a transient failure partway through the
  // cascade. A subsequent call (a retry) sees the store's own state,
  // which already reflects everything up to the failure.
  failDeleteOnce?: { path: string; error: any }
  // The entity GET returns `store.entity` for calls 1..N, then null from
  // call N+1 onward -- simulates another request (a concurrent delete,
  // or an earlier retry of THIS request) finishing the job between this
  // execution's own planning read and its final revalidation read.
  entityGoneAfterCall?: number
  // Paths whose DELETE should 404 ("already gone") -- simulating a retry
  // where an earlier, partially-completed attempt already removed this
  // exact row.
  alreadyGonePaths?: string[]
}

function installStore(store: Store, failures: FailureInjection = {}) {
  let entityGetCalls = 0
  const deleteCallCounts: Record<string, number> = {}

  directusServiceRequestMock.mockImplementation(async (path: string, opts: any) => {
    const filterCountResponse = (rows: any[]) => ({
      data: rows.slice(0, opts?.query?.limit === 1 ? 1 : rows.length),
      meta: { filter_count: rows.length }
    })

    if (path === `/items/entities/${ENTITY_ID}` && opts.method === 'GET') {
      entityGetCalls += 1
      if (failures.entityGoneAfterCall && entityGetCalls > failures.entityGoneAfterCall) {
        throw Object.assign(new Error('not found'), { statusCode: 404 })
      }
      return { data: store.entity }
    }
    if (path === `/items/entities/${ENTITY_ID}` && opts.method === 'DELETE') {
      if (failures.failDeleteOnce?.path === path) {
        deleteCallCounts[path] = (deleteCallCounts[path] ?? 0) + 1
        if (deleteCallCounts[path] === 1) {
          throw failures.failDeleteOnce.error
        }
      }
      store.deletedPaths.push(path)
      return { data: {} }
    }

    function handleDelete(): any {
      if (failures.alreadyGonePaths?.includes(path)) {
        throw Object.assign(new Error('not found'), { statusCode: 404 })
      }
      if (failures.failDeleteOnce?.path === path) {
        deleteCallCounts[path] = (deleteCallCounts[path] ?? 0) + 1
        if (deleteCallCounts[path] === 1) {
          throw failures.failDeleteOnce.error
        }
      }
      store.deletedPaths.push(path)
      return { data: {} }
    }

    if (path === '/items/character_sheets' && opts.method === 'GET') {
      return { data: store.sheets.map((s) => ({ id: s.id })) }
    }
    if (/^\/items\/character_sheets\/.+$/.test(path) && opts.method === 'DELETE') {
      return handleDelete()
    }

    if (path === '/items/character_sheet_inventory' && opts.method === 'GET') {
      return { data: store.inventory.map((r) => ({ id: r.id })) }
    }
    if (/^\/items\/character_sheet_inventory\/.+$/.test(path) && opts.method === 'DELETE') {
      return handleDelete()
    }

    if (path === '/items/block_instances' && opts.method === 'GET') return filterCountResponse(store.blockInstances)
    if (/^\/items\/block_instances\/.+$/.test(path) && opts.method === 'DELETE') {
      return handleDelete()
    }
    if (path === '/items/entity_actions' && opts.method === 'GET') return filterCountResponse(store.entityActions)
    if (/^\/items\/entity_actions\/.+$/.test(path) && opts.method === 'DELETE') {
      return handleDelete()
    }
    if (path === '/items/entity_statblocks' && opts.method === 'GET') return filterCountResponse(store.entityStatblocks)
    if (/^\/items\/entity_statblocks\/.+$/.test(path) && opts.method === 'DELETE') {
      return handleDelete()
    }
    if (path === '/items/monster_profiles' && opts.method === 'GET') return filterCountResponse(store.monsterProfiles)
    if (/^\/items\/monster_profiles\/.+$/.test(path) && opts.method === 'DELETE') {
      return handleDelete()
    }

    if (path === '/items/character_sheet_inventory_transfers' && opts.method === 'GET') {
      const filter = opts.query.filter
      if (filter?.id) return { data: store.transfers.filter((t) => filter.id._in.includes(t.id)) }
      return { data: store.transfers.map((t) => ({ id: t.id })) }
    }
    if (/^\/items\/character_sheet_inventory_transfers\/.+$/.test(path) && opts.method === 'PATCH') {
      store.patches.push({ path, body: opts.body })
      const id = Number(path.split('/').pop())
      const row = store.transfers.find((t) => t.id === id)
      if (row) Object.assign(row, opts.body)
      return { data: row }
    }

    if (path === '/items/entity_relationships' && opts.method === 'GET') {
      return { data: store.relationships.map((r) => ({ id: r.id })) }
    }
    if (/^\/items\/entity_relationships\/\d+$/.test(path) && opts.method === 'GET') {
      const id = Number(path.split('/').pop())
      const row = store.relationships.find((r) => r.id === id)
      return { data: { id: row.id, notes: row.notes ?? '', status: row.status ?? 'active' } }
    }
    if (/^\/items\/entity_relationships\/\d+$/.test(path) && opts.method === 'PATCH') {
      store.patches.push({ path, body: opts.body })
      const id = Number(path.split('/').pop())
      const row = store.relationships.find((r) => r.id === id)
      if (row) Object.assign(row, opts.body)
      return { data: row }
    }

    if (path === '/items/roll_events' && opts.method === 'GET') return filterCountResponse(store.rollEvents)
    if (path === '/items/map_pins' && opts.method === 'GET') return filterCountResponse(store.mapPins)

    throw new Error(`unexpected call: ${opts.method} ${path}`)
  })
}

beforeEach(() => {
  directusServiceRequestMock.mockReset()
})

describe('planCharacterDeletion', () => {
  it('404s when the character does not exist', async () => {
    installStore(baseStore({ entity: null }))

    await expect(planCharacterDeletion(WORLD_ID, ENTITY_ID)).rejects.toMatchObject({ statusCode: 404 })
  })

  it('404s on a World/entity mismatch', async () => {
    installStore(baseStore({ entity: { id: Number(ENTITY_ID), world_id: 999, title: 'X', entity_type: 'pc' } }))

    await expect(planCharacterDeletion(WORLD_ID, ENTITY_ID)).rejects.toMatchObject({ statusCode: 404 })
  })

  it('counts every dependent collection correctly', async () => {
    installStore(
      baseStore({
        sheets: [{ id: 39 }],
        inventory: [{ id: 1 }, { id: 2 }, { id: 3 }],
        blockInstances: [{ id: 1 }],
        entityActions: [{ id: 1 }, { id: 2 }],
        entityStatblocks: [],
        monsterProfiles: [],
        transfers: [{ id: 501, source_entity_id: Number(ENTITY_ID), target_entity_id: 999 }],
        relationships: [{ id: 801, notes: '' }, { id: 802, notes: '' }],
        rollEvents: Array.from({ length: 47 }, (_, i) => ({ id: i })),
        mapPins: [{ id: 1 }, { id: 2 }]
      })
    )

    const plan = await planCharacterDeletion(WORLD_ID, ENTITY_ID)

    expect(plan.sheets.count).toBe(1)
    expect(plan.inventoryRows.count).toBe(3)
    expect(plan.blockInstances).toBe(1)
    expect(plan.entityActions).toBe(2)
    expect(plan.entityStatblocks).toBe(0)
    expect(plan.monsterProfiles).toBe(0)
    expect(plan.transfersToDetach.count).toBe(1)
    expect(plan.relationshipsToMark.count).toBe(2)
    expect(plan.rollEventsPreserved).toBe(47)
    expect(plan.mapPinsToUnlink).toBe(2)
  })

  it('never queries character_sheet_inventory when the character has no sheets', async () => {
    installStore(baseStore({ sheets: [] }))

    await planCharacterDeletion(WORLD_ID, ENTITY_ID)

    const inventoryCalls = directusServiceRequestMock.mock.calls.filter(([path]) => path === '/items/character_sheet_inventory')
    expect(inventoryCalls).toHaveLength(0)
  })
})

describe('executeCharacterDeletion -- the dependency trace', () => {
  it('cascade-deletes character_sheets and their inventory rows', async () => {
    const store = baseStore({ sheets: [{ id: 39 }], inventory: [{ id: 1 }, { id: 2 }] })
    installStore(store)

    await deleteCharacterWithPlan(WORLD_ID, ENTITY_ID)

    expect(store.deletedPaths).toContain('/items/character_sheets/39')
    expect(store.deletedPaths).toContain('/items/character_sheet_inventory/1')
    expect(store.deletedPaths).toContain('/items/character_sheet_inventory/2')
  })

  it('cascade-deletes block_instances/entity_actions/entity_statblocks/monster_profiles -- the proven generic-delete precedent', async () => {
    const store = baseStore({
      blockInstances: [{ id: 10 }],
      entityActions: [{ id: 20 }],
      entityStatblocks: [{ id: 30 }],
      monsterProfiles: [{ id: 40 }]
    })
    installStore(store)

    await deleteCharacterWithPlan(WORLD_ID, ENTITY_ID)

    expect(store.deletedPaths).toContain('/items/block_instances/10')
    expect(store.deletedPaths).toContain('/items/entity_actions/20')
    expect(store.deletedPaths).toContain('/items/entity_statblocks/30')
    expect(store.deletedPaths).toContain('/items/monster_profiles/40')
  })

  it('deletes the entities row LAST, after every dependent cascade delete', async () => {
    const store = baseStore({ sheets: [{ id: 39 }], blockInstances: [{ id: 10 }] })
    installStore(store)

    await deleteCharacterWithPlan(WORLD_ID, ENTITY_ID)

    const deleteCalls = directusServiceRequestMock.mock.calls.filter(([, opts]) => opts.method === 'DELETE')
    const lastCall = deleteCalls[deleteCalls.length - 1]
    expect(lastCall[0]).toBe(`/items/entities/${ENTITY_ID}`)
  })

  it('PRESERVES roll_events -- never deletes or patches a single row', async () => {
    const store = baseStore({ rollEvents: Array.from({ length: 10 }, (_, i) => ({ id: i })) })
    installStore(store)

    await deleteCharacterWithPlan(WORLD_ID, ENTITY_ID)

    const rollEventWrites = directusServiceRequestMock.mock.calls.filter(
      ([path, opts]) => path.startsWith('/items/roll_events') && (opts.method === 'DELETE' || opts.method === 'PATCH')
    )
    expect(rollEventWrites).toHaveLength(0)
  })

  it('NEVER touches map_pins directly -- the existing ON DELETE SET NULL relation is the only thing that acts on it', async () => {
    const store = baseStore({ mapPins: [{ id: 1 }, { id: 2 }] })
    installStore(store)

    await deleteCharacterWithPlan(WORLD_ID, ENTITY_ID)

    const mapPinWrites = directusServiceRequestMock.mock.calls.filter(
      ([path, opts]) => path.startsWith('/items/map_pins') && (opts.method === 'DELETE' || opts.method === 'PATCH')
    )
    expect(mapPinWrites).toHaveLength(0)
  })

  // --- Inventory transfers: detached, never deleted ---------------------
  it('marks the departing side cleared on a transfer, without deleting the row', async () => {
    const store = baseStore({
      transfers: [{ id: 501, source_entity_id: Number(ENTITY_ID), target_entity_id: 999, source_cleared_at: null, target_cleared_at: null }]
    })
    installStore(store)

    await deleteCharacterWithPlan(WORLD_ID, ENTITY_ID)

    expect(store.deletedPaths.some((p) => p.includes('inventory_transfers'))).toBe(false)
    const patch = store.patches.find((p) => p.path === '/items/character_sheet_inventory_transfers/501')
    expect(patch?.body).toHaveProperty('source_cleared_at')
    expect(patch?.body).not.toHaveProperty('target_cleared_at')
  })

  it('marks target_cleared_at when the departing character was the target side', async () => {
    const store = baseStore({
      transfers: [{ id: 502, source_entity_id: 999, target_entity_id: Number(ENTITY_ID), source_cleared_at: null, target_cleared_at: null }]
    })
    installStore(store)

    await deleteCharacterWithPlan(WORLD_ID, ENTITY_ID)

    const patch = store.patches.find((p) => p.path === '/items/character_sheet_inventory_transfers/502')
    expect(patch?.body).toEqual({ target_cleared_at: expect.any(String) })
  })

  it('does not re-clear a side that is already cleared', async () => {
    const store = baseStore({
      transfers: [{ id: 503, source_entity_id: Number(ENTITY_ID), target_entity_id: 999, source_cleared_at: '2026-01-01T00:00:00Z', target_cleared_at: null }]
    })
    installStore(store)

    await deleteCharacterWithPlan(WORLD_ID, ENTITY_ID)

    const patch = store.patches.find((p) => p.path === '/items/character_sheet_inventory_transfers/503')
    expect(patch).toBeUndefined()
  })

  // --- Relationships: marked, never deleted ------------------------------
  it('marks a relationship status, appends a note, and preserves the row', async () => {
    const store = baseStore({ relationships: [{ id: 801, notes: 'Old ally.' }] })
    installStore(store)

    await deleteCharacterWithPlan(WORLD_ID, ENTITY_ID)

    expect(store.deletedPaths.some((p) => p.includes('entity_relationships'))).toBe(false)
    const patch = store.patches.find((p) => p.path === '/items/entity_relationships/801')
    expect(patch?.body.status).toBe('character_deleted')
    expect(patch?.body.notes).toContain('Old ally.')
    expect(patch?.body.notes).toContain('Borc')
    expect(patch?.body.notes).toContain('deleted')
  })

  it('writes a clean note (no leading blank join) when the relationship had no prior notes', async () => {
    const store = baseStore({ relationships: [{ id: 802, notes: '' }] })
    installStore(store)

    await deleteCharacterWithPlan(WORLD_ID, ENTITY_ID)

    const patch = store.patches.find((p) => p.path === '/items/entity_relationships/802')
    expect(patch?.body.notes.startsWith('[Automatic]')).toBe(true)
  })

  // --- Entity-type guard --------------------------------------------------
  it('rejects a non-character entity type (location) with 400', async () => {
    installStore(baseStore({ entity: { id: Number(ENTITY_ID), world_id: Number(WORLD_ID), title: 'Varin', entity_type: 'location' } }))

    await expect(deleteCharacterWithPlan(WORLD_ID, ENTITY_ID)).rejects.toMatchObject({ statusCode: 400 })
  })

  it('accepts every character-shaped type (pc, player_character, npc, npc_sheet, character)', async () => {
    for (const entityType of ['pc', 'player_character', 'npc', 'npc_sheet', 'character']) {
      const store = baseStore({ entity: { id: Number(ENTITY_ID), world_id: Number(WORLD_ID), title: 'X', entity_type: entityType } })
      installStore(store)

      await expect(deleteCharacterWithPlan(WORLD_ID, ENTITY_ID)).resolves.toBeDefined()
    }
  })

  // --- Ordering: detach/mark before hard deletes --------------------------
  it('detaches transfers and marks relationships BEFORE deleting any dependent row', async () => {
    const store = baseStore({
      sheets: [{ id: 39 }],
      transfers: [{ id: 501, source_entity_id: Number(ENTITY_ID), target_entity_id: 999, source_cleared_at: null, target_cleared_at: null }],
      relationships: [{ id: 801, notes: '' }]
    })
    installStore(store)

    const baseImpl = directusServiceRequestMock.getMockImplementation()!
    const order: string[] = []
    directusServiceRequestMock.mockImplementation(async (path: string, opts: any) => {
      if (opts.method === 'PATCH') order.push(`patch:${path}`)
      if (opts.method === 'DELETE') order.push(`delete:${path}`)
      return baseImpl(path, opts)
    })

    await deleteCharacterWithPlan(WORLD_ID, ENTITY_ID)

    const firstDeleteIndex = order.findIndex((entry) => entry.startsWith('delete:'))
    const lastPatchIndex = order.map((entry, i) => (entry.startsWith('patch:') ? i : -1)).filter((i) => i >= 0).pop() ?? -1
    expect(firstDeleteIndex).toBeGreaterThan(-1)
    expect(lastPatchIndex).toBeLessThan(firstDeleteIndex)
  })
})

// ---------------------------------------------------------------------
// WRITE-SAFETY REVIEW: no cross-collection Postgres transaction is
// available for this nine-write cascade (re-verified: the existing
// ELDRA_RESOURCE_DB_URL / eldra_resource_writer credential has no grant
// at all on character_sheets, character_sheet_inventory, block_instances,
// entity_actions, entity_statblocks, monster_profiles,
// character_sheet_inventory_transfers, entity_relationships, or
// roll_events -- confirmed against
// scripts/directus/create-resources-unique-index.mjs's own documented
// grant list). These tests pin the resulting recoverable-by-retry design
// instead of a false claim of atomicity.
// ---------------------------------------------------------------------

describe('executeCharacterDeletion -- partial-failure and retry safety', () => {
  it('a mid-cascade failure propagates a clear, retry-safe error -- never a false success', async () => {
    const store = baseStore({ sheets: [{ id: 39 }] })
    installStore(store, {
      failDeleteOnce: { path: '/items/character_sheets/39', error: Object.assign(new Error('network blip'), { statusCode: 500 }) }
    })

    await expect(deleteCharacterWithPlan(WORLD_ID, ENTITY_ID)).rejects.toMatchObject({
      statusMessage: expect.stringContaining('safe to retry')
    })
    // The entities row itself was never reached -- the character is not
    // presented as deleted.
    expect(store.deletedPaths).not.toContain(`/items/entities/${ENTITY_ID}`)
  })

  it('RETRYING after a mid-cascade failure completes successfully, skipping whatever already succeeded', async () => {
    const store = baseStore({ sheets: [{ id: 39 }], blockInstances: [{ id: 10 }] })
    installStore(store, {
      failDeleteOnce: { path: '/items/character_sheets/39', error: Object.assign(new Error('network blip'), { statusCode: 500 }) }
    })

    await expect(deleteCharacterWithPlan(WORLD_ID, ENTITY_ID)).rejects.toThrow()

    // Retry: re-plan and re-execute, same as a fresh HTTP request would.
    // block_instances/10 was already deleted on the first attempt (it ran
    // before the failing character_sheets delete); character_sheets/39
    // failed once and now succeeds.
    store.blockInstances = [] // already gone from the first attempt's cascade
    installStore(store) // no more injected failure -- the "retry" succeeds
    const result = await deleteCharacterWithPlan(WORLD_ID, ENTITY_ID)

    expect(result.plan.entityId).toBe(ENTITY_ID)
    expect(store.deletedPaths).toContain(`/items/entities/${ENTITY_ID}`)
  })

  it('a DELETE that 404s (already gone from an earlier partial attempt) is treated as success, not an error', async () => {
    const store = baseStore({ sheets: [{ id: 39 }] })
    installStore(store, { alreadyGonePaths: ['/items/character_sheets/39'] })

    const result = await deleteCharacterWithPlan(WORLD_ID, ENTITY_ID)

    expect(result.plan).toBeDefined()
    // Not re-added to deletedPaths (it 404'd), but the overall operation
    // still completed, including the final entities delete.
    expect(store.deletedPaths).toContain(`/items/entities/${ENTITY_ID}`)
  })

  it('retrying a relationship-marking step never duplicates the automatic note', async () => {
    const store = baseStore({ relationships: [{ id: 801, notes: 'Old ally.', status: 'character_deleted' }] })
    installStore(store)

    await deleteCharacterWithPlan(WORLD_ID, ENTITY_ID)

    // Already marked (status pre-set to 'character_deleted' in the
    // fixture, simulating an earlier attempt's own patch) -- skipped
    // entirely, so no second patch and no duplicated note text.
    const patch = store.patches.find((p) => p.path === '/items/entity_relationships/801')
    expect(patch).toBeUndefined()
  })

  it('the final entities DELETE revalidates the target: if already gone, succeeds idempotently without erroring', async () => {
    const store = baseStore()
    // Call 1 = planCharacterDeletion's own read; call 2 = the final
    // revalidation read, right before the destructive DELETE -- simulate
    // a concurrent/earlier attempt having ALREADY deleted it by then.
    installStore(store, { entityGoneAfterCall: 1 })

    const result = await deleteCharacterWithPlan(WORLD_ID, ENTITY_ID)

    expect(result.plan).toBeDefined()
    // No DELETE call was needed -- it was already gone.
    expect(store.deletedPaths).not.toContain(`/items/entities/${ENTITY_ID}`)
  })

  it('when only the final entities DELETE fails (every dependent already removed), the error says every dependent is already gone and a retry only repeats this step', async () => {
    const store = baseStore()
    installStore(store, {
      failDeleteOnce: {
        path: `/items/entities/${ENTITY_ID}`,
        error: Object.assign(new Error('timeout'), { statusCode: 500 })
      }
    })

    await expect(deleteCharacterWithPlan(WORLD_ID, ENTITY_ID)).rejects.toMatchObject({
      statusMessage: expect.stringContaining('already gone')
    })
  })
})

describe('deleting a character never touches its owner\'s Eldra Account', () => {
  it('makes no request to eldra_accounts or eldra_identity_links, and never reads/writes owner_account_id', async () => {
    const store = baseStore({
      entity: { id: Number(ENTITY_ID), world_id: Number(WORLD_ID), title: 'Borc', entity_type: 'pc', owner_account_id: 'eldra-account-owner' },
      sheets: [{ id: 39 }],
      relationships: [{ id: 801, notes: '' }]
    })
    installStore(store)

    await deleteCharacterWithPlan(WORLD_ID, ENTITY_ID)

    const allPaths = directusServiceRequestMock.mock.calls.map(([path]) => path)
    expect(allPaths.some((p: string) => p.includes('eldra_accounts'))).toBe(false)
    expect(allPaths.some((p: string) => p.includes('eldra_identity_links'))).toBe(false)
    const allBodies = directusServiceRequestMock.mock.calls.map(([, opts]) => JSON.stringify(opts?.body ?? {}))
    expect(allBodies.some((b: string) => b.includes('owner_account_id'))).toBe(false)
  })
})
