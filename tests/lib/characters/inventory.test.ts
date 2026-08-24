// Unit tests for app/lib/characters/inventory.ts -- the pure inventory model
// behind the first V1 feature migrated onto the new Character Architecture.
//
// Pure module, nothing to mock. These cover the two things everything else
// depends on: that a stored record is re-validated rather than trusted, and
// that every list change is a total, non-mutating function.

import { describe, expect, it } from 'vitest'

import {
  MAX_ITEM_QUANTITY,
  MIN_ITEM_QUANTITY,
  addInventoryItem,
  changeInventoryQuantity,
  clampQuantity,
  emptyInventory,
  nextInstanceId,
  normalizeStoredInventory,
  removeInventoryItem,
  setInventoryQuantity,
  toggleInventoryFlag,
  unresolvedItemLabel,
  type StoredInventoryItem
} from '../../../app/lib/characters/inventory'

const REF = { packageId: 'eldra.content.xphb', slug: 'longsword-xphb' }

function item(overrides: Partial<StoredInventoryItem> = {}): StoredInventoryItem {
  return {
    instanceId: 'item-1',
    ref: REF,
    quantity: 1,
    equipped: false,
    attuned: false,
    ...overrides
  }
}

describe('quantity rules', () => {
  it('clamps to a whole number within bounds', () => {
    expect(clampQuantity(3)).toBe(3)
    expect(clampQuantity('4')).toBe(4)
    expect(clampQuantity(2.7)).toBe(2)
    expect(clampQuantity(0)).toBe(MIN_ITEM_QUANTITY)
    expect(clampQuantity(-5)).toBe(MIN_ITEM_QUANTITY)
    expect(clampQuantity(99999)).toBe(MAX_ITEM_QUANTITY)
  })

  it('falls back to the minimum for anything unreadable', () => {
    for (const bad of [null, undefined, 'x', {}, NaN, Infinity]) {
      expect(clampQuantity(bad)).toBe(MIN_ITEM_QUANTITY)
    }
  })
})

describe('instance identity', () => {
  it('is deterministic, so an ActorState built twice is identical', () => {
    const items = [item({ instanceId: 'item-1' }), item({ instanceId: 'item-2' })]
    expect(nextInstanceId(items)).toBe('item-3')
    expect(nextInstanceId(items)).toBe('item-3')
  })

  it('does not reuse an id after a removal from the middle', () => {
    const items = [item({ instanceId: 'item-1' }), item({ instanceId: 'item-5' })]
    expect(nextInstanceId(items)).toBe('item-6')
  })

  it('starts at one for an empty pack', () => {
    expect(nextInstanceId([])).toBe('item-1')
  })
})

describe('normalizeStoredInventory', () => {
  it('reads a well-formed record', () => {
    const stored = { items: [{ instanceId: 'item-1', ref: REF, quantity: 2, equipped: true, attuned: false }] }
    expect(normalizeStoredInventory(stored)?.items[0]).toMatchObject({
      instanceId: 'item-1', ref: REF, quantity: 2, equipped: true, attuned: false
    })
  })

  it('returns null for anything that is not an items envelope', () => {
    for (const bad of [null, undefined, 42, 'x', [], {}, { items: 'x' }, { items: {} }]) {
      expect(normalizeStoredInventory(bad)).toBeNull()
    }
  })

  it('drops one unreadable row rather than failing the whole pack', () => {
    // A list is not an atomic record: losing a player's entire inventory
    // because one row is malformed is the worse failure.
    const stored = { items: [item(), null, 'nonsense', { quantity: 3 }] }
    expect(normalizeStoredInventory(stored)?.items).toHaveLength(1)
  })

  it('drops a row that is neither a reference nor a name', () => {
    expect(normalizeStoredInventory({ items: [{ instanceId: 'item-9', quantity: 2 }] })?.items).toEqual([])
  })

  it('drops a half-written reference back to a custom item', () => {
    const stored = { items: [{ instanceId: 'item-1', ref: { packageId: 'p' }, name: 'Rope', quantity: 1 }] }
    const result = normalizeStoredInventory(stored)?.items[0]
    expect(result?.ref).toBeUndefined()
    expect(result?.name).toBe('Rope')
  })

  it('never stores a name beside a reference -- the title comes from the catalogue', () => {
    const stored = { items: [{ instanceId: 'item-1', ref: REF, name: 'Stale Copy', quantity: 1 }] }
    expect(normalizeStoredInventory(stored)?.items[0]?.name).toBeUndefined()
  })

  it('coerces flags and quantity rather than trusting them', () => {
    const stored = { items: [{ instanceId: 'item-1', ref: REF, quantity: '7', equipped: 'yes', attuned: 1 }] }
    expect(normalizeStoredInventory(stored)?.items[0]).toMatchObject({
      quantity: 7, equipped: false, attuned: false
    })
  })

  it('drops a duplicate instanceId', () => {
    const stored = { items: [item({ instanceId: 'item-1' }), item({ instanceId: 'item-1' })] }
    expect(normalizeStoredInventory(stored)?.items).toHaveLength(1)
  })

  it('reads an empty pack as empty rather than as absent', () => {
    expect(normalizeStoredInventory(emptyInventory())).toEqual({ items: [] })
  })
})

describe('mutations are pure and total', () => {
  it('adds a catalogue-backed item without copying its title', () => {
    const next = addInventoryItem([], { ref: REF, quantity: 3 })
    expect(next).toHaveLength(1)
    expect(next[0]).toMatchObject({ instanceId: 'item-1', ref: REF, quantity: 3, equipped: false, attuned: false })
    expect(next[0]!.name).toBeUndefined()
  })

  it('adds a custom item by name', () => {
    const next = addInventoryItem([], { name: 'Letter from the duke' })
    expect(next[0]).toMatchObject({ name: 'Letter from the duke', quantity: MIN_ITEM_QUANTITY })
    expect(next[0]!.ref).toBeUndefined()
  })

  it('refuses an item with neither a reference nor a name', () => {
    expect(addInventoryItem([], {})).toEqual([])
    expect(addInventoryItem([], { name: '   ' })).toEqual([])
  })

  it('never mutates the list it was given', () => {
    const original = [item()]
    const frozen = JSON.stringify(original)

    addInventoryItem(original, { name: 'Rope' })
    removeInventoryItem(original, 'item-1')
    changeInventoryQuantity(original, 'item-1', 5)
    toggleInventoryFlag(original, 'item-1', 'equipped')

    expect(JSON.stringify(original)).toBe(frozen)
  })

  it('steps quantity without ever reaching zero', () => {
    // Stepping down is not a request to throw the item away -- removing is a
    // separate, explicit action, so notes and container survive.
    const items = [item({ quantity: 1, notes: 'keep me' })]
    const next = changeInventoryQuantity(items, 'item-1', -1)
    expect(next[0]!.quantity).toBe(MIN_ITEM_QUANTITY)
    expect(next[0]!.notes).toBe('keep me')
  })

  it('sets a quantity directly, clamped', () => {
    expect(setInventoryQuantity([item()], 'item-1', '12')[0]!.quantity).toBe(12)
    expect(setInventoryQuantity([item()], 'item-1', -3)[0]!.quantity).toBe(MIN_ITEM_QUANTITY)
  })

  it('toggles equipped and attuned independently', () => {
    let items = [item()]
    items = toggleInventoryFlag(items, 'item-1', 'equipped')
    expect(items[0]).toMatchObject({ equipped: true, attuned: false })

    items = toggleInventoryFlag(items, 'item-1', 'attuned')
    expect(items[0]).toMatchObject({ equipped: true, attuned: true })

    items = toggleInventoryFlag(items, 'item-1', 'equipped')
    expect(items[0]).toMatchObject({ equipped: false, attuned: true })
  })

  it('leaves other items untouched when one changes', () => {
    const items = [item({ instanceId: 'item-1' }), item({ instanceId: 'item-2', quantity: 4 })]
    const next = toggleInventoryFlag(items, 'item-1', 'equipped')
    expect(next[1]).toEqual(items[1])
  })

  it('removes by instanceId and ignores an unknown one', () => {
    const items = [item({ instanceId: 'item-1' }), item({ instanceId: 'item-2' })]
    expect(removeInventoryItem(items, 'item-1').map((i) => i.instanceId)).toEqual(['item-2'])
    expect(removeInventoryItem(items, 'nope')).toHaveLength(2)
  })

  it('round-trips through normalize, so a save cannot write what a read rejects', () => {
    const built = addInventoryItem(addInventoryItem([], { ref: REF, quantity: 2 }), { name: 'Rope' })
    expect(normalizeStoredInventory({ items: built })?.items).toEqual(built)
  })
})

describe('unresolved items are explained, not blanked', () => {
  it('labels a broken reference visibly', () => {
    expect(unresolvedItemLabel(REF)).toBe('longsword-xphb (unavailable)')
  })
})

describe('nothing here computes a rules consequence', () => {
  it('stores no weight, value, capacity, or armour class', () => {
    const next = addInventoryItem([], { ref: REF, quantity: 2 })
    // The full set of keys an item may carry -- all decisions, no derivations.
    expect(Object.keys(next[0]!).sort()).toEqual(
      ['attuned', 'equipped', 'instanceId', 'quantity', 'ref'].sort()
    )
  })
})
