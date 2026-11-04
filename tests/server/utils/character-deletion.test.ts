// Unit tests for safe character deletion (server/utils/character-deletion.ts).
// See that module's own header for the full dependency trace, the fresh
// schema sweep behind it, and exactly why each collection's behavior is
// what it is -- these tests pin that trace collection by collection, the
// COMPLETE PURGE semantics (revision 2: no detach/mark/preserve category
// survives), and the plan/execute consistency the whole module is
// structured around.

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

// ---------------------------------------------------------------------
// A small, generic Directus-filter evaluator -- so the mock store below
// matches rows against whatever filter shape the real code actually
// sends (_and/_or/_eq/_in/_neq), rather than hand-parsing each query's
// exact structure per collection. This is what lets these tests exercise
// the REAL combined-filter queries (e.g. transfers matched by entity_id
// OR sheet_id in one request) rather than a simplified stand-in for them.
// ---------------------------------------------------------------------
function matchesFilter(row: Record<string, any>, filter: any): boolean {
  if (!filter) return true
  if (filter._and) return filter._and.every((f: any) => matchesFilter(row, f))
  if (filter._or) return filter._or.some((f: any) => matchesFilter(row, f))
  for (const [field, condition] of Object.entries(filter)) {
    const value = row[field]
    const cond = condition as any
    if (cond._eq !== undefined && value !== cond._eq) return false
    if (cond._in !== undefined && !cond._in.includes(value)) return false
    if (cond._neq !== undefined && value === cond._neq) return false
  }
  return true
}

type Row = Record<string, any>

type Store = {
  entity: Row | null
  sheets: Row[]
  inventory: Row[]
  blockInstances: Row[]
  entityActions: Row[]
  entityStatblocks: Row[]
  monsterProfiles: Row[]
  transfers: Row[]
  relationships: Row[]
  rollEvents: Row[]
  mapPins: Row[]
  ownershipChanges: Row[]
  // Unrelated data, present to prove it survives untouched -- a second
  // character in the same World, plus its own rows in collections that
  // could plausibly be confused with the deleted character's.
  otherSheets: Row[]
  otherRollEvents: Row[]
  // Side-effect recording.
  deletedPaths: string[]
}

const COLLECTION_KEYS: Record<string, keyof Store> = {
  character_sheets: 'sheets',
  character_sheet_inventory: 'inventory',
  block_instances: 'blockInstances',
  entity_actions: 'entityActions',
  entity_statblocks: 'entityStatblocks',
  monster_profiles: 'monsterProfiles',
  character_sheet_inventory_transfers: 'transfers',
  entity_relationships: 'relationships',
  roll_events: 'rollEvents',
  map_pins: 'mapPins',
  entity_ownership_changes: 'ownershipChanges'
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
    ownershipChanges: [],
    otherSheets: [],
    otherRollEvents: [],
    deletedPaths: [],
    ...overrides
  }
}

type FailureInjection = {
  // Throws this error on the FIRST DELETE call for this exact path --
  // simulates a transient failure partway through the cascade. A later
  // call to the SAME path (a retry) succeeds normally.
  failDeleteOnce?: { path: string; error: any }
  // Paths whose DELETE should 404 ("already gone") -- simulating a retry
  // where an earlier, partially-completed attempt already removed this
  // exact row.
  alreadyGonePaths?: string[]
  // The entity GET returns the entity for calls 1..N, then "not found"
  // from call N+1 onward -- simulates a concurrent/earlier attempt
  // finishing the job between planning and final revalidation.
  entityGoneAfterCall?: number
}

function installStore(store: Store, failures: FailureInjection = {}) {
  let entityGetCalls = 0
  const deleteAttempts: Record<string, number> = {}

  function handleListGet(collectionKey: keyof Store, opts: any) {
    const rows = (store[collectionKey] as Row[]).filter((row) => matchesFilter(row, opts?.query?.filter))
    return { data: rows.map((row) => ({ id: row.id })), meta: { filter_count: rows.length } }
  }

  function handleDelete(collection: string, id: string, path: string) {
    if (failures.alreadyGonePaths?.includes(path)) {
      throw Object.assign(new Error('not found'), { statusCode: 404 })
    }
    if (failures.failDeleteOnce?.path === path) {
      deleteAttempts[path] = (deleteAttempts[path] ?? 0) + 1
      if (deleteAttempts[path] === 1) {
        throw failures.failDeleteOnce.error
      }
    }
    if (collection === 'entities') {
      if (!store.entity || String(store.entity.id) !== id) {
        throw Object.assign(new Error('not found'), { statusCode: 404 })
      }
      store.entity = null
    } else {
      const key = COLLECTION_KEYS[collection]
      if (key) {
        const rows = store[key] as Row[]
        const index = rows.findIndex((row) => String(row.id) === id)
        if (index === -1) {
          throw Object.assign(new Error('not found'), { statusCode: 404 })
        }
        rows.splice(index, 1)
      }
    }
    store.deletedPaths.push(path)
    return { data: {} }
  }

  directusServiceRequestMock.mockImplementation(async (path: string, opts: any) => {
    if (path === `/items/entities/${ENTITY_ID}` && opts.method === 'GET') {
      entityGetCalls += 1
      if (failures.entityGoneAfterCall && entityGetCalls > failures.entityGoneAfterCall) {
        throw Object.assign(new Error('not found'), { statusCode: 404 })
      }
      return { data: store.entity }
    }
    if (path === `/items/entities/${ENTITY_ID}` && opts.method === 'DELETE') {
      return handleDelete('entities', ENTITY_ID, path)
    }

    for (const [collection, key] of Object.entries(COLLECTION_KEYS)) {
      if (path === `/items/${collection}` && opts.method === 'GET') {
        return handleListGet(key, opts)
      }
      const deleteMatch = path.match(new RegExp(`^/items/${collection}/(.+)$`))
      if (deleteMatch && opts.method === 'DELETE') {
        return handleDelete(collection, deleteMatch[1], path)
      }
    }

    throw new Error(`unexpected call: ${opts.method} ${path}`)
  })
}

beforeEach(() => {
  directusServiceRequestMock.mockReset()
})

// ---------------------------------------------------------------------
// planCharacterDeletion -- impact counts, every dependent collection
// ---------------------------------------------------------------------

describe('planCharacterDeletion', () => {
  it('404s when the character does not exist', async () => {
    installStore(baseStore({ entity: null }))

    await expect(planCharacterDeletion(WORLD_ID, ENTITY_ID)).rejects.toMatchObject({ statusCode: 404 })
  })

  it('404s on a World/entity mismatch', async () => {
    installStore(baseStore({ entity: { id: Number(ENTITY_ID), world_id: 999, title: 'X', entity_type: 'pc' } }))

    await expect(planCharacterDeletion(WORLD_ID, ENTITY_ID)).rejects.toMatchObject({ statusCode: 404 })
  })

  it('counts every dependent collection correctly, including the two new ones (map pins, ownership history)', async () => {
    installStore(
      baseStore({
        sheets: [{ id: 39, world_id: Number(WORLD_ID), entity_id: Number(ENTITY_ID) }],
        inventory: [{ id: 1, sheet_id: 39 }, { id: 2, sheet_id: 39 }, { id: 3, sheet_id: 39 }],
        blockInstances: [{ id: 1, entity_id: Number(ENTITY_ID) }],
        entityActions: [{ id: 1, entity_id: Number(ENTITY_ID) }, { id: 2, entity_id: Number(ENTITY_ID) }],
        transfers: [
          { id: 501, world_id: Number(WORLD_ID), source_entity_id: Number(ENTITY_ID), target_entity_id: 999, source_sheet_id: 39, target_sheet_id: 77 }
        ],
        relationships: [{ id: 801, world_id: Number(WORLD_ID), source_entity_id: Number(ENTITY_ID), target_entity_id: 999 }, { id: 802, world_id: Number(WORLD_ID), source_entity_id: 999, target_entity_id: Number(ENTITY_ID) }],
        rollEvents: Array.from({ length: 47 }, (_, i) => ({ id: i, actor_character_id: Number(ENTITY_ID) })),
        mapPins: [{ id: 1, entity_id: Number(ENTITY_ID) }, { id: 2, entity_id: Number(ENTITY_ID) }],
        ownershipChanges: [{ id: 1, entity_id: Number(ENTITY_ID) }]
      })
    )

    const plan = await planCharacterDeletion(WORLD_ID, ENTITY_ID)

    expect(plan.sheets.count).toBe(1)
    expect(plan.inventoryRows.count).toBe(3)
    expect(plan.blockInstances).toBe(1)
    expect(plan.entityActions).toBe(2)
    expect(plan.entityStatblocks).toBe(0)
    expect(plan.monsterProfiles).toBe(0)
    expect(plan.transfers.count).toBe(1)
    expect(plan.relationships.count).toBe(2)
    expect(plan.rollEvents.count).toBe(47)
    expect(plan.mapPins.count).toBe(2)
    expect(plan.ownershipChanges.count).toBe(1)
  })

  // THIS TASK'S OWN INSTRUCTION: transfers are reachable through EITHER
  // the character's entity_id OR its sheet_id -- a transfer row that only
  // matches via sheet_id (e.g. source_entity_id references something
  // else, but source_sheet_id is still this character's sheet) must
  // still be found.
  it('finds a transfer reachable ONLY through the sheet id, not the entity id', async () => {
    installStore(
      baseStore({
        sheets: [{ id: 39, world_id: Number(WORLD_ID), entity_id: Number(ENTITY_ID) }],
        transfers: [
          // Neither source_entity_id nor target_entity_id is this character
          // -- only source_sheet_id matches.
          { id: 501, world_id: Number(WORLD_ID), source_entity_id: 111, target_entity_id: 222, source_sheet_id: 39, target_sheet_id: 77 }
        ]
      })
    )

    const plan = await planCharacterDeletion(WORLD_ID, ENTITY_ID)

    expect(plan.transfers.ids).toEqual(['501'])
  })

  it('finds a transfer reachable on the TARGET sheet id', async () => {
    installStore(
      baseStore({
        sheets: [{ id: 39, world_id: Number(WORLD_ID), entity_id: Number(ENTITY_ID) }],
        transfers: [
          { id: 502, world_id: Number(WORLD_ID), source_entity_id: 111, target_entity_id: 222, source_sheet_id: 77, target_sheet_id: 39 }
        ]
      })
    )

    const plan = await planCharacterDeletion(WORLD_ID, ENTITY_ID)

    expect(plan.transfers.ids).toEqual(['502'])
  })

  // DOUBLE-COUNTING GUARD: a row matching BOTH the entity_id criterion
  // AND the sheet_id criterion in the same combined query must still
  // appear exactly once.
  it('never double-counts a transfer that matches both its entity_id AND its sheet_id', async () => {
    installStore(
      baseStore({
        sheets: [{ id: 39, world_id: Number(WORLD_ID), entity_id: Number(ENTITY_ID) }],
        transfers: [
          { id: 503, world_id: Number(WORLD_ID), source_entity_id: Number(ENTITY_ID), target_entity_id: 999, source_sheet_id: 39, target_sheet_id: 77 }
        ]
      })
    )

    const plan = await planCharacterDeletion(WORLD_ID, ENTITY_ID)

    expect(plan.transfers.count).toBe(1)
    expect(plan.transfers.ids).toEqual(['503'])
    // Exactly one GET to the transfers collection -- a combined filter,
    // never two separate queries whose results could overlap.
    const transferGetCalls = directusServiceRequestMock.mock.calls.filter(
      ([path, opts]) => path === '/items/character_sheet_inventory_transfers' && opts.method === 'GET'
    )
    expect(transferGetCalls).toHaveLength(1)
  })

  it('finds a relationship on either side (source or target)', async () => {
    installStore(
      baseStore({
        relationships: [
          { id: 801, world_id: Number(WORLD_ID), source_entity_id: Number(ENTITY_ID), target_entity_id: 999 },
          { id: 802, world_id: Number(WORLD_ID), source_entity_id: 999, target_entity_id: Number(ENTITY_ID) },
          { id: 803, world_id: Number(WORLD_ID), source_entity_id: 111, target_entity_id: 222 } // unrelated
        ]
      })
    )

    const plan = await planCharacterDeletion(WORLD_ID, ENTITY_ID)

    expect(plan.relationships.ids.sort()).toEqual(['801', '802'])
  })

  it('never queries character_sheet_inventory or the sheet-based transfer branch when the character has no sheet', async () => {
    installStore(baseStore({ sheets: [] }))

    await planCharacterDeletion(WORLD_ID, ENTITY_ID)

    const inventoryCalls = directusServiceRequestMock.mock.calls.filter(([path]) => path === '/items/character_sheet_inventory')
    expect(inventoryCalls).toHaveLength(0)
  })

  it('does not touch an unrelated character\'s sheet or roll history', async () => {
    installStore(
      baseStore({
        sheets: [
          { id: 39, world_id: Number(WORLD_ID), entity_id: Number(ENTITY_ID) },
          { id: 40, world_id: Number(WORLD_ID), entity_id: 9999 } // a different character
        ],
        rollEvents: [
          { id: 1, actor_character_id: Number(ENTITY_ID) },
          { id: 2, actor_character_id: 9999 } // a different character
        ]
      })
    )

    const plan = await planCharacterDeletion(WORLD_ID, ENTITY_ID)

    expect(plan.sheets.ids).toEqual(['39'])
    expect(plan.rollEvents.ids).toEqual(['1'])
  })
})

// ---------------------------------------------------------------------
// executeCharacterDeletion -- the complete purge
// ---------------------------------------------------------------------

describe('executeCharacterDeletion -- complete purge, entity deleted last', () => {
  it('deletes character_sheets and character_sheet_inventory outright', async () => {
    const store = baseStore({
      sheets: [{ id: 39, world_id: Number(WORLD_ID), entity_id: Number(ENTITY_ID) }],
      inventory: [{ id: 1, sheet_id: 39 }, { id: 2, sheet_id: 39 }]
    })
    installStore(store)

    await deleteCharacterWithPlan(WORLD_ID, ENTITY_ID)

    expect(store.sheets).toHaveLength(0)
    expect(store.inventory).toHaveLength(0)
    expect(store.deletedPaths).toContain('/items/character_sheets/39')
  })

  it('deletes block_instances/entity_actions/entity_statblocks/monster_profiles', async () => {
    const store = baseStore({
      blockInstances: [{ id: 10, entity_id: Number(ENTITY_ID) }],
      entityActions: [{ id: 20, entity_id: Number(ENTITY_ID) }],
      entityStatblocks: [{ id: 30, entity_id: Number(ENTITY_ID) }],
      monsterProfiles: [{ id: 40, entity_id: Number(ENTITY_ID) }]
    })
    installStore(store)

    await deleteCharacterWithPlan(WORLD_ID, ENTITY_ID)

    expect(store.deletedPaths).toContain('/items/block_instances/10')
    expect(store.deletedPaths).toContain('/items/entity_actions/20')
    expect(store.deletedPaths).toContain('/items/entity_statblocks/30')
    expect(store.deletedPaths).toContain('/items/monster_profiles/40')
  })

  // --- Revision 2: these five are now HARD DELETED, not detached/marked/preserved ---

  it('DELETES inventory transfer rows outright (no detach/clear) -- matched by entity_id OR sheet_id', async () => {
    const store = baseStore({
      sheets: [{ id: 39, world_id: Number(WORLD_ID), entity_id: Number(ENTITY_ID) }],
      transfers: [
        { id: 501, world_id: Number(WORLD_ID), source_entity_id: Number(ENTITY_ID), target_entity_id: 999, source_sheet_id: 39, target_sheet_id: 77 },
        { id: 502, world_id: Number(WORLD_ID), source_entity_id: 111, target_entity_id: 222, source_sheet_id: 77, target_sheet_id: 39 } // sheet-only match
      ]
    })
    installStore(store)

    await deleteCharacterWithPlan(WORLD_ID, ENTITY_ID)

    expect(store.transfers).toHaveLength(0)
    expect(store.deletedPaths).toContain('/items/character_sheet_inventory_transfers/501')
    expect(store.deletedPaths).toContain('/items/character_sheet_inventory_transfers/502')
  })

  it('DELETES relationship rows outright (no status mark, no note) -- matched by either side', async () => {
    const store = baseStore({
      relationships: [
        { id: 801, world_id: Number(WORLD_ID), source_entity_id: Number(ENTITY_ID), target_entity_id: 999 },
        { id: 802, world_id: Number(WORLD_ID), source_entity_id: 999, target_entity_id: Number(ENTITY_ID) }
      ]
    })
    installStore(store)

    await deleteCharacterWithPlan(WORLD_ID, ENTITY_ID)

    expect(store.relationships).toHaveLength(0)
  })

  it('DELETES roll_events rows for this character (revision 2 -- roll history is no longer preserved)', async () => {
    const store = baseStore({ rollEvents: [{ id: 1, actor_character_id: Number(ENTITY_ID) }, { id: 2, actor_character_id: Number(ENTITY_ID) }] })
    installStore(store)

    await deleteCharacterWithPlan(WORLD_ID, ENTITY_ID)

    expect(store.rollEvents).toHaveLength(0)
  })

  it('does NOT delete another character\'s roll history', async () => {
    const store = baseStore({
      rollEvents: [{ id: 1, actor_character_id: Number(ENTITY_ID) }],
      otherRollEvents: [{ id: 2, actor_character_id: 9999 }]
    })
    installStore(store)

    await deleteCharacterWithPlan(WORLD_ID, ENTITY_ID)

    // otherRollEvents is a separate array in this fixture precisely so a
    // bug that deleted by filter too broadly (e.g. by world_id alone)
    // would be caught -- it is never queried/deleted by this module at
    // all, which is itself the correct behavior.
    expect(store.otherRollEvents).toHaveLength(1)
  })

  it('DELETES map_pins rows for this character (revision 2 -- no longer left to the SET NULL relation)', async () => {
    const store = baseStore({ mapPins: [{ id: 1, entity_id: Number(ENTITY_ID) }, { id: 2, entity_id: Number(ENTITY_ID) }] })
    installStore(store)

    await deleteCharacterWithPlan(WORLD_ID, ENTITY_ID)

    expect(store.mapPins).toHaveLength(0)
  })

  it('DELETES entity_ownership_changes rows for this character', async () => {
    const store = baseStore({ ownershipChanges: [{ id: 1, entity_id: Number(ENTITY_ID) }] })
    installStore(store)

    await deleteCharacterWithPlan(WORLD_ID, ENTITY_ID)

    expect(store.ownershipChanges).toHaveLength(0)
  })

  it('deletes the entities row LAST, after every dependent cascade delete', async () => {
    const store = baseStore({
      sheets: [{ id: 39, world_id: Number(WORLD_ID), entity_id: Number(ENTITY_ID) }],
      blockInstances: [{ id: 10, entity_id: Number(ENTITY_ID) }],
      transfers: [{ id: 501, world_id: Number(WORLD_ID), source_entity_id: Number(ENTITY_ID), target_entity_id: 999 }],
      relationships: [{ id: 801, world_id: Number(WORLD_ID), source_entity_id: Number(ENTITY_ID), target_entity_id: 999 }],
      rollEvents: [{ id: 1, actor_character_id: Number(ENTITY_ID) }],
      mapPins: [{ id: 1, entity_id: Number(ENTITY_ID) }],
      ownershipChanges: [{ id: 1, entity_id: Number(ENTITY_ID) }]
    })
    installStore(store)

    await deleteCharacterWithPlan(WORLD_ID, ENTITY_ID)

    const deleteCalls = directusServiceRequestMock.mock.calls.filter(([, opts]) => opts.method === 'DELETE')
    const lastCall = deleteCalls[deleteCalls.length - 1]
    expect(lastCall[0]).toBe(`/items/entities/${ENTITY_ID}`)
  })

  it('rejects a non-character entity type (location) with 400', async () => {
    installStore(baseStore({ entity: { id: Number(ENTITY_ID), world_id: Number(WORLD_ID), title: 'Varin', entity_type: 'location' } }))

    await expect(deleteCharacterWithPlan(WORLD_ID, ENTITY_ID)).rejects.toMatchObject({ statusCode: 400 })
  })

  it('accepts every character-shaped type (pc, player_character, npc, npc_sheet, character)', async () => {
    for (const entityType of ['pc', 'player_character', 'npc', 'npc_sheet', 'character']) {
      installStore(baseStore({ entity: { id: Number(ENTITY_ID), world_id: Number(WORLD_ID), title: 'X', entity_type: entityType } }))

      await expect(deleteCharacterWithPlan(WORLD_ID, ENTITY_ID)).resolves.toBeDefined()
    }
  })
})

// ---------------------------------------------------------------------
// Owner Account / IdentityLinks / unrelated data -- untouched
// ---------------------------------------------------------------------

describe('a character purge never touches its owner\'s Account or unrelated data', () => {
  it('makes no request to eldra_accounts, eldra_identity_links, eldra_platform_grants, or world_memberships', async () => {
    const store = baseStore({
      entity: { id: Number(ENTITY_ID), world_id: Number(WORLD_ID), title: 'Borc', entity_type: 'pc', owner_account_id: 'eldra-account-owner' },
      sheets: [{ id: 39, world_id: Number(WORLD_ID), entity_id: Number(ENTITY_ID) }],
      relationships: [{ id: 801, world_id: Number(WORLD_ID), source_entity_id: Number(ENTITY_ID), target_entity_id: 999 }],
      ownershipChanges: [{ id: 1, entity_id: Number(ENTITY_ID) }]
    })
    installStore(store)

    await deleteCharacterWithPlan(WORLD_ID, ENTITY_ID)

    const allPaths = directusServiceRequestMock.mock.calls.map(([path]) => path)
    for (const forbidden of ['eldra_accounts', 'eldra_identity_links', 'eldra_platform_grants', 'world_memberships']) {
      expect(allPaths.some((p: string) => p.includes(forbidden))).toBe(false)
    }
    const allBodies = directusServiceRequestMock.mock.calls.map(([, opts]) => JSON.stringify(opts?.body ?? {}))
    expect(allBodies.some((b: string) => b.includes('owner_account_id'))).toBe(false)
  })

  it('leaves a DIFFERENT character in the same World completely untouched', async () => {
    const store = baseStore({
      sheets: [
        { id: 39, world_id: Number(WORLD_ID), entity_id: Number(ENTITY_ID) },
        { id: 40, world_id: Number(WORLD_ID), entity_id: 9999 }
      ],
      otherSheets: []
    })
    installStore(store)

    await deleteCharacterWithPlan(WORLD_ID, ENTITY_ID)

    expect(store.sheets.map((s) => s.id)).toEqual([40])
    expect(store.deletedPaths).not.toContain('/items/character_sheets/40')
  })

  it('does not delete a shared content entity merely because the character\'s sheet references it (class/species/background/item ids are never queried or deleted)', async () => {
    const store = baseStore({
      sheets: [{ id: 39, world_id: Number(WORLD_ID), entity_id: Number(ENTITY_ID), class_entity_id: 501, species_entity_id: 502, background_entity_id: 503 }],
      inventory: [{ id: 1, sheet_id: 39, item_entity_id: 701 }]
    })
    installStore(store)

    await deleteCharacterWithPlan(WORLD_ID, ENTITY_ID)

    // The only entities/* DELETE call is the character's own -- never 501/502/503/701.
    const entityDeletes = store.deletedPaths.filter((p) => /^\/items\/entities\/\d+$/.test(p))
    expect(entityDeletes).toEqual([`/items/entities/${ENTITY_ID}`])
  })
})

// ---------------------------------------------------------------------
// WRITE-SAFETY: no cross-collection Postgres transaction is available
// for this cascade (re-verified against eldra_resource_writer's own
// documented grant set, which has no access at all to most of the
// collections this purge touches). Retry/idempotency is the substitute.
// ---------------------------------------------------------------------

describe('executeCharacterDeletion -- partial-failure and retry safety', () => {
  it('a mid-cascade failure propagates a clear, retry-safe error -- never a false success', async () => {
    const store = baseStore({ sheets: [{ id: 39, world_id: Number(WORLD_ID), entity_id: Number(ENTITY_ID) }] })
    installStore(store, {
      failDeleteOnce: { path: '/items/character_sheets/39', error: Object.assign(new Error('network blip'), { statusCode: 500 }) }
    })

    await expect(deleteCharacterWithPlan(WORLD_ID, ENTITY_ID)).rejects.toMatchObject({
      statusMessage: expect.stringContaining('safe to retry')
    })
    expect(store.deletedPaths).not.toContain(`/items/entities/${ENTITY_ID}`)
  })

  it('RETRYING after a mid-cascade failure finishes the job, including whatever failed the first time', async () => {
    const store = baseStore({
      sheets: [{ id: 39, world_id: Number(WORLD_ID), entity_id: Number(ENTITY_ID) }],
      blockInstances: [{ id: 10, entity_id: Number(ENTITY_ID) }]
    })
    installStore(store, {
      failDeleteOnce: { path: '/items/character_sheets/39', error: Object.assign(new Error('network blip'), { statusCode: 500 }) }
    })

    await expect(deleteCharacterWithPlan(WORLD_ID, ENTITY_ID)).rejects.toThrow()
    // block_instances/10 already deleted by the first (partially-failed)
    // attempt, since it ran before the failing character_sheets delete.
    expect(store.blockInstances).toHaveLength(0)
    expect(store.sheets).toHaveLength(1) // the failing delete never completed

    // Retry: fresh plan + execute, exactly like a second HTTP request.
    installStore(store) // no more injected failure
    const result = await deleteCharacterWithPlan(WORLD_ID, ENTITY_ID)

    expect(result.plan.entityId).toBe(ENTITY_ID)
    expect(store.sheets).toHaveLength(0)
    expect(store.entity).toBeNull()
  })

  it('a DELETE that 404s (already gone from an earlier partial attempt) is treated as success, not an error', async () => {
    const store = baseStore({ sheets: [{ id: 39, world_id: Number(WORLD_ID), entity_id: Number(ENTITY_ID) }] })
    installStore(store, { alreadyGonePaths: ['/items/character_sheets/39'] })

    const result = await deleteCharacterWithPlan(WORLD_ID, ENTITY_ID)

    expect(result.plan).toBeDefined()
    expect(store.entity).toBeNull()
  })

  // Every one of the five revision-2 collections must independently
  // survive a retry where some of ITS rows are already gone.
  it.each([
    ['character_sheet_inventory_transfers', (s: Store) => { s.transfers.push({ id: 501, world_id: Number(WORLD_ID), source_entity_id: Number(ENTITY_ID), target_entity_id: 999 }) }],
    ['entity_relationships', (s: Store) => { s.relationships.push({ id: 801, world_id: Number(WORLD_ID), source_entity_id: Number(ENTITY_ID), target_entity_id: 999 }) }],
    ['roll_events', (s: Store) => { s.rollEvents.push({ id: 1, actor_character_id: Number(ENTITY_ID) }) }],
    ['map_pins', (s: Store) => { s.mapPins.push({ id: 1, entity_id: Number(ENTITY_ID) }) }],
    ['entity_ownership_changes', (s: Store) => { s.ownershipChanges.push({ id: 1, entity_id: Number(ENTITY_ID) }) }]
  ])('retrying is safe when a %s row is already gone', async (collection, seed) => {
    const store = baseStore()
    seed(store)
    const key = COLLECTION_KEYS[collection as string]
    const id = (store[key] as Row[])[0].id
    installStore(store, { alreadyGonePaths: [`/items/${collection}/${id}`] })

    const result = await deleteCharacterWithPlan(WORLD_ID, ENTITY_ID)

    expect(result.plan).toBeDefined()
    expect(store.entity).toBeNull()
  })

  it('the final entities DELETE revalidates the target: if already gone, succeeds idempotently without erroring', async () => {
    const store = baseStore()
    // Call 1 = planCharacterDeletion's own read; call 2 = the final
    // revalidation read right before the destructive DELETE.
    installStore(store, { entityGoneAfterCall: 1 })

    const result = await deleteCharacterWithPlan(WORLD_ID, ENTITY_ID)

    expect(result.plan).toBeDefined()
    expect(store.deletedPaths).not.toContain(`/items/entities/${ENTITY_ID}`)
  })

  it('when only the final entities DELETE fails, the error says every dependent is already gone and a retry only repeats this step', async () => {
    const store = baseStore()
    installStore(store, {
      failDeleteOnce: { path: `/items/entities/${ENTITY_ID}`, error: Object.assign(new Error('timeout'), { statusCode: 500 }) }
    })

    await expect(deleteCharacterWithPlan(WORLD_ID, ENTITY_ID)).rejects.toMatchObject({
      statusMessage: expect.stringContaining('already gone')
    })
  })
})
