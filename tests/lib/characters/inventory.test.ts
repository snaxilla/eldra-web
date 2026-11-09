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
  equipmentCollectionFields,
  isItemAttunable,
  isItemEquippable,
  itemDetailLines,
  nextInstanceId,
  normalizeStoredInventory,
  removeInventoryItem,
  setInventoryQuantity,
  toggleInventoryFlag,
  unresolvedItemLabel,
  type AssembledInventoryItem,
  type InventoryCatalogueEntry,
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

// ---------------------------------------------------------------------------
// itemDetailLines -- the Item Detail panel's player-facing content
// ---------------------------------------------------------------------------
// Character Purgatory follow-up. The real reported bug:
// `Resolved from: eldra.solaris.xphb@1.0.37` -- internal package-resolution
// plumbing -- leaked into the player-facing item detail panel. These pin
// that `entry.packageId`/`packageVersion` can never reach this list, while
// `entry.sourceBook` (useful, human-readable provenance) still does.
// ---------------------------------------------------------------------------

function resolvedItem(overrides: Partial<AssembledInventoryItem> = {}): AssembledInventoryItem {
  return {
    instanceId: 'item-1',
    quantity: 1,
    equipped: false,
    attuned: false,
    status: 'resolved',
    title: 'Shortsword',
    entry: {
      packageId: 'eldra.solaris.xphb',
      packageVersion: '1.0.37',
      title: 'Shortsword',
      slug: 'shortsword-xphb',
      sourceBook: 'XPHB'
    },
    ...overrides
  }
}

describe('itemDetailLines', () => {
  it('never includes the raw package locator -- the exact reported leak', () => {
    const lines = itemDetailLines(resolvedItem())

    expect(lines.join(' | ')).not.toContain('eldra.solaris.xphb')
    expect(lines.join(' | ')).not.toContain('1.0.37')
    expect(lines.some((line) => line.startsWith('Resolved from'))).toBe(false)
  })

  it('keeps the human-readable Source line when the catalogue entry has one', () => {
    const lines = itemDetailLines(resolvedItem())
    expect(lines).toContain('Source: XPHB')
  })

  it('omits the Source line entirely when the entry has none -- never a blank "Source:"', () => {
    const lines = itemDetailLines(resolvedItem({ entry: { packageId: 'eldra.solaris.xphb', packageVersion: '1.0.37', title: 'Shortsword', slug: 'shortsword-xphb' } }))
    expect(lines.some((line) => line.startsWith('Source:'))).toBe(false)
  })

  it('a custom item (no catalogue entry at all) never gets a Source or package line', () => {
    const lines = itemDetailLines(resolvedItem({ status: 'custom', entry: undefined }))
    expect(lines.some((line) => line.startsWith('Source:') || line.startsWith('Resolved from'))).toBe(false)
  })

  it('always leads with Quantity, and includes Container/notes when present', () => {
    const lines = itemDetailLines(resolvedItem({ quantity: 3, container: 'Backpack', notes: 'A gift from the blacksmith' }))
    expect(lines[0]).toBe('Quantity: 3')
    expect(lines).toContain('Container: Backpack')
    expect(lines).toContain('A gift from the blacksmith')
  })

  it('a missing (broken reference) item includes its own reason', () => {
    const lines = itemDetailLines(resolvedItem({ status: 'missing', reason: 'No longer published by any bound Content Pack', entry: undefined }))
    expect(lines).toContain('No longer published by any bound Content Pack')
  })
})

// ---------------------------------------------------------------------------
// itemDetailLines -- item mechanics (weapon/armor), Character Purgatory
// item-mechanics pass. Representative shapes taken from the real resolved
// output: app/lib/item-mechanics/dnd5e.ts for itemMechanics, and
// app/lib/content-rules/dnd5e-2024.ts's actual authored facets for
// Shortsword/Leather Armor/Shield (collectionFields values copied verbatim
// from the real package source, not invented).
// ---------------------------------------------------------------------------

describe('itemDetailLines -- weapon mechanics', () => {
  it('renders type, damage, range, properties, and mastery for a resolved weapon', () => {
    const lines = itemDetailLines(resolvedItem({
      entry: {
        packageId: 'eldra.solaris.xphb',
        packageVersion: '1.0.37',
        title: 'Shortsword',
        slug: 'shortsword-xphb',
        sourceBook: 'XPHB',
        itemMechanics: {
          kind: 'weapon',
          weaponCategory: 'martial',
          range: 'melee',
          properties: ['finesse', 'light'],
          masteryProperty: 'Vex',
          proficiencyGroups: ['martial', 'martial_light', 'martial_finesse_light']
        },
        actions: [{ name: 'Shortsword', category: 'weapon', actionType: 'Melee Attack', range: '5 ft.', damage: '1d6 piercing', damageType: 'piercing' }]
      }
    }))

    expect(lines).toContain('Type: Martial Melee Weapon')
    expect(lines).toContain('Damage: 1d6 piercing')
    expect(lines).toContain('Range: 5 ft.')
    expect(lines).toContain('Properties: Finesse, Light')
    expect(lines).toContain('Mastery: Vex')
  })

  it('renders a ranged weapon correctly, with no Properties line when it has none', () => {
    const lines = itemDetailLines(resolvedItem({
      entry: {
        packageId: 'eldra.solaris.xphb',
        packageVersion: '1.0.37',
        title: 'Shortbow',
        slug: 'shortbow-xphb',
        itemMechanics: {
          kind: 'weapon',
          weaponCategory: 'simple',
          range: 'ranged',
          properties: [],
          masteryProperty: 'Slow',
          proficiencyGroups: ['simple']
        },
        actions: [{ name: 'Shortbow', category: 'weapon', actionType: 'Ranged Attack', range: '80/320 ft.', damage: '1d6 piercing', damageType: 'piercing' }]
      }
    }))

    expect(lines).toContain('Type: Simple Ranged Weapon')
    expect(lines).toContain('Range: 80/320 ft.')
    expect(lines.some((line) => line.startsWith('Properties:'))).toBe(false)
    expect(lines).toContain('Mastery: Slow')
  })

  it('still shows weapon Type/Properties/Mastery when no actions resolved a damage string', () => {
    const lines = itemDetailLines(resolvedItem({
      entry: {
        packageId: 'eldra.solaris.xphb',
        packageVersion: '1.0.37',
        title: 'Shortsword',
        slug: 'shortsword-xphb',
        itemMechanics: {
          kind: 'weapon',
          weaponCategory: 'martial',
          range: 'melee',
          properties: ['finesse'],
          masteryProperty: 'Vex',
          proficiencyGroups: ['martial', 'martial_finesse_light']
        }
      }
    }))

    expect(lines).toContain('Type: Martial Melee Weapon')
    expect(lines.some((line) => line.startsWith('Damage:'))).toBe(false)
    expect(lines).toContain('Properties: Finesse')
    expect(lines).toContain('Mastery: Vex')
  })
})

describe('itemDetailLines -- armor mechanics', () => {
  it('renders Armor Class and an uncapped Dexterity Bonus for Light armor (real Leather Armor facet)', () => {
    const lines = itemDetailLines(resolvedItem({
      entry: {
        packageId: 'eldra.solaris.xphb',
        packageVersion: '1.0.37',
        title: 'Leather Armor',
        slug: 'leather-armor-xphb',
        rulesFacet: {
          collectionFields: [{
            collection: 'collection:equipment',
            fields: { category: 'armor', slot: 'armor', sourceRef: 'source:equipment.armor', armorClass: 11, dexCapMin: -99, dexCapMax: 99 }
          }]
        }
      }
    }))

    expect(lines).toContain('Type: Armor')
    expect(lines).toContain('Armor Class: 11')
    expect(lines).toContain('Dexterity Bonus: full')
  })

  it('renders a capped Dexterity Bonus for Medium armor (real Chain Shirt facet)', () => {
    const lines = itemDetailLines(resolvedItem({
      entry: {
        packageId: 'eldra.solaris.xphb',
        packageVersion: '1.0.37',
        title: 'Chain Shirt',
        slug: 'chain-shirt-xphb',
        rulesFacet: {
          collectionFields: [{
            collection: 'collection:equipment',
            fields: { category: 'armor', slot: 'armor', sourceRef: 'source:equipment.armor', armorClass: 13, dexCapMin: -99, dexCapMax: 2 }
          }]
        }
      }
    }))

    expect(lines).toContain('Armor Class: 13')
    expect(lines).toContain('Dexterity Bonus: up to +2')
  })

  it('renders no Dexterity Bonus for Heavy armor (real Chain Mail facet)', () => {
    const lines = itemDetailLines(resolvedItem({
      entry: {
        packageId: 'eldra.solaris.xphb',
        packageVersion: '1.0.37',
        title: 'Chain Mail',
        slug: 'chain-mail-xphb',
        rulesFacet: {
          collectionFields: [{
            collection: 'collection:equipment',
            fields: { category: 'armor', slot: 'armor', sourceRef: 'source:equipment.armor', armorClass: 16, dexCapMin: 0, dexCapMax: 0 }
          }]
        }
      }
    }))

    expect(lines).toContain('Armor Class: 16')
    expect(lines).toContain('Dexterity Bonus: none')
  })

  it('labels a held armor-category item (the real Shield facet) as Shield, with no fabricated AC line', () => {
    const lines = itemDetailLines(resolvedItem({
      entry: {
        packageId: 'eldra.solaris.xphb',
        packageVersion: '1.0.37',
        title: 'Shield',
        slug: 'shield-xphb',
        rulesFacet: {
          collectionFields: [{ collection: 'collection:equipment', fields: { category: 'armor', slot: 'held' } }]
        }
      }
    }))

    expect(lines).toContain('Type: Shield')
    expect(lines.some((line) => line.startsWith('Armor Class:'))).toBe(false)
  })

  it('shows Requires Attunement when the resolved entry\'s attunementRequired field is true (reqAttune, not the armor facet)', () => {
    // Character Sheet Inventory pass: Requires Attunement now reads
    // entry.attunementRequired (world-content-catalogue.ts, mirroring the
    // importer's own reqAttune/attunement semantics) rather than the
    // armor-only rulesFacet.collectionFields.requiresAttunement field,
    // which is never true for any real authored XPHB facet (see
    // app/lib/content-rules/dnd5e-2024.ts's own comment: XPHB is mundane
    // starting equipment, so that field is "exercised by the mechanism...
    // without yet being exercised by real content").
    const lines = itemDetailLines(resolvedItem({
      entry: {
        packageId: 'eldra.solaris.xdmg',
        packageVersion: '1.0.0',
        title: 'Ring of Protection',
        slug: 'ring-of-protection-xdmg',
        attunementRequired: true
      }
    }))

    expect(lines).toContain('Requires Attunement: Yes')
  })

  it('never shows Requires Attunement when attunementRequired is absent or false', () => {
    const absent = itemDetailLines(resolvedItem({
      entry: { packageId: 'eldra.solaris.xphb', packageVersion: '1.0.37', title: 'Shortsword', slug: 'shortsword-xphb' }
    }))
    const explicitFalse = itemDetailLines(resolvedItem({
      entry: { packageId: 'eldra.solaris.xphb', packageVersion: '1.0.37', title: 'Shortsword', slug: 'shortsword-xphb', attunementRequired: false }
    }))

    expect(absent.some((line) => line.startsWith('Requires Attunement'))).toBe(false)
    expect(explicitFalse.some((line) => line.startsWith('Requires Attunement'))).toBe(false)
  })
})

describe('itemDetailLines -- honest fallback for unmechanised items', () => {
  it('shows a clear fallback line for a resolved item with no itemMechanics and no armor facet (e.g. ammunition)', () => {
    const lines = itemDetailLines(resolvedItem({
      entry: {
        packageId: 'eldra.solaris.xphb',
        packageVersion: '1.0.37',
        title: 'Arrows (20)',
        slug: 'arrows-20-xphb',
        sourceBook: 'XPHB'
      }
    }))

    expect(lines).toContain('No item details are available in this content package.')
  })

  it('never shows the fallback for a custom (non-catalogue) item', () => {
    const lines = itemDetailLines(resolvedItem({ status: 'custom', entry: undefined }))
    expect(lines).not.toContain('No item details are available in this content package.')
  })

  it('never shows the fallback for a missing (broken-reference) item', () => {
    const lines = itemDetailLines(resolvedItem({ status: 'missing', reason: 'gone', entry: undefined }))
    expect(lines).not.toContain('No item details are available in this content package.')
  })

  it('never leaks raw weapon/armor property codes or facet plumbing -- only the curated labels', () => {
    const lines = itemDetailLines(resolvedItem({
      entry: {
        packageId: 'eldra.solaris.xphb',
        packageVersion: '1.0.37',
        title: 'Shortsword',
        slug: 'shortsword-xphb',
        itemMechanics: {
          kind: 'weapon',
          weaponCategory: 'martial',
          range: 'melee',
          properties: ['finesse', 'light'],
          masteryProperty: 'Vex',
          proficiencyGroups: ['martial', 'martial_light', 'martial_finesse_light']
        },
        rulesFacet: {
          collectionFields: [{ collection: 'collection:equipment', fields: { category: 'weapon', slot: 'held' } }]
        }
      }
    }))

    const joined = lines.join(' | ')
    expect(joined).not.toContain('collection:equipment')
    expect(joined).not.toContain('proficiencyGroups')
    expect(joined).not.toContain('martial_finesse_light')
  })
})

// ---------------------------------------------------------------------------
// itemDetailLines -- item presentation (description/facts), Character Sheet
// Inventory implementation pass. The real reported bug: Potion of Healing
// had a real description on the Items admin page but showed only the
// honest fallback on the Character Sheet, because entry.presentation was
// never computed for items at all (see world-content-catalogue.ts's own
// PRESENTATION_KIND_BY_CATEGORY). Representative items per the task's own
// ask: Potion of Healing (description/facts path), Shortsword and Leather
// Armor (existing mechanics must remain visible, unchanged), Arrows (no
// presentation and no mechanics -- keeps the honest fallback, never an
// invented mechanic).
// ---------------------------------------------------------------------------

describe('itemDetailLines -- item presentation (description/facts)', () => {
  it('renders the real Potion of Healing description and facts -- the exact reported bug', () => {
    const lines = itemDetailLines(resolvedItem({
      entry: {
        packageId: 'eldra.solaris.xdmg',
        packageVersion: '1.0.0',
        title: 'Potion of Healing',
        slug: 'potion-of-healing-xdmg',
        sourceBook: 'XDMG',
        presentation: {
          kind: 'item',
          name: 'Potion of Healing',
          sourceBook: 'XDMG',
          sourcePage: '288',
          description: ["This potion is a magic item. The creature that drinks the magical red fluid in this vial regains 2d4 + 2 Hit Points."],
          facts: [
            { label: 'Rarity', value: 'Common' },
            { label: 'Value', value: '50 gp' },
            { label: 'Weight', value: '0.5 lb.' }
          ],
          sections: [],
          notes: []
        }
      }
    }))

    expect(lines).toContain('This potion is a magic item. The creature that drinks the magical red fluid in this vial regains 2d4 + 2 Hit Points.')
    expect(lines).toContain('Rarity: Common')
    expect(lines).toContain('Value: 50 gp')
    expect(lines).toContain('Weight: 0.5 lb.')
    expect(lines).not.toContain('No item details are available in this content package.')
  })

  it('an item with presentation.description but no weapon/armor mechanics never gets the fallback line', () => {
    const lines = itemDetailLines(resolvedItem({
      entry: {
        packageId: 'eldra.solaris.xdmg',
        packageVersion: '1.0.0',
        title: 'Scroll of Identify',
        slug: 'scroll-of-identify-xdmg',
        presentation: {
          kind: 'item', name: 'Scroll of Identify', description: ['A spell scroll.'], facts: [], sections: [], notes: []
        }
      }
    }))

    expect(lines).not.toContain('No item details are available in this content package.')
  })

  it('resolved but presentation: null (unreadable data) with no mechanics still falls back honestly', () => {
    const lines = itemDetailLines(resolvedItem({
      entry: { packageId: 'eldra.solaris.xdmg', packageVersion: '1.0.0', title: 'Broken Entry', slug: 'broken-entry', presentation: null }
    }))

    expect(lines).toContain('No item details are available in this content package.')
  })

  it('Shortsword mechanics remain visible alongside (empty) presentation -- mundane weapons have no entries text', () => {
    const lines = itemDetailLines(resolvedItem({
      entry: {
        packageId: 'eldra.solaris.xphb',
        packageVersion: '1.0.37',
        title: 'Shortsword',
        slug: 'shortsword-xphb',
        presentation: { kind: 'item', name: 'Shortsword', description: [], facts: [], sections: [], notes: ['no description'] },
        itemMechanics: {
          kind: 'weapon', weaponCategory: 'martial', range: 'melee', properties: ['finesse', 'light'],
          masteryProperty: 'Vex', proficiencyGroups: ['martial', 'martial_light', 'martial_finesse_light']
        }
      }
    }))

    expect(lines).toContain('Type: Martial Melee Weapon')
    expect(lines).toContain('Mastery: Vex')
    expect(lines).not.toContain('No item details are available in this content package.')
    // The presentation resolver's OWN "no description" note must never leak
    // through -- itemDetailLines has its own fallback sentence and reads
    // presentation.description/.facts only, never presentation.notes.
    expect(lines.join(' | ')).not.toContain('no description')
  })

  it('Leather Armor mechanics remain visible, unchanged, alongside empty presentation', () => {
    const lines = itemDetailLines(resolvedItem({
      entry: {
        packageId: 'eldra.solaris.xphb',
        packageVersion: '1.0.37',
        title: 'Leather Armor',
        slug: 'leather-armor-xphb',
        presentation: { kind: 'item', name: 'Leather Armor', description: [], facts: [], sections: [], notes: [] },
        rulesFacet: {
          collectionFields: [{
            collection: 'collection:equipment',
            fields: { category: 'armor', slot: 'armor', armorClass: 11, dexCapMin: -99, dexCapMax: 99 }
          }]
        }
      }
    }))

    expect(lines).toContain('Type: Armor')
    expect(lines).toContain('Armor Class: 11')
    expect(lines).toContain('Dexterity Bonus: full')
  })

  it('Arrows (ammunition) -- no presentation, no mechanics -- keeps the honest fallback, never an invented mechanic', () => {
    const lines = itemDetailLines(resolvedItem({
      entry: {
        packageId: 'eldra.solaris.xphb',
        packageVersion: '1.0.37',
        title: 'Arrows (20)',
        slug: 'arrows-20-xphb',
        sourceBook: 'XPHB',
        presentation: { kind: 'item', name: 'Arrows (20)', description: [], facts: [], sections: [], notes: [] }
      }
    }))

    expect(lines).toContain('No item details are available in this content package.')
    expect(lines.some((line) => line.startsWith('Type:'))).toBe(false)
    expect(lines.some((line) => line.startsWith('Damage:'))).toBe(false)
    expect(lines.some((line) => line.startsWith('Armor Class:'))).toBe(false)
  })

  it('never leaks presentation provenance (sourceBook/sourcePage/name) -- only description and facts are read', () => {
    const lines = itemDetailLines(resolvedItem({
      entry: {
        packageId: 'eldra.solaris.xdmg',
        packageVersion: '1.0.0',
        title: 'Potion of Healing',
        slug: 'potion-of-healing-xdmg',
        presentation: {
          kind: 'item', name: 'Potion of Healing', sourceBook: 'INTERNAL-SOURCE-TAG', sourcePage: '999',
          description: ['It heals you.'], facts: [], sections: [], notes: []
        }
      }
    }))

    expect(lines.join(' | ')).not.toContain('INTERNAL-SOURCE-TAG')
  })
})

// ---------------------------------------------------------------------------
// isItemEquippable / isItemAttunable -- Character Sheet Inventory pass.
// Representative items per the task's own ask: Shortsword (weapon,
// equippable), Leather Armor (armor, equippable), Shield (armor/held,
// equippable), Potion of Healing (neither), Arrows (neither).
// ---------------------------------------------------------------------------

function catalogueEntry(overrides: Partial<InventoryCatalogueEntry> = {}): InventoryCatalogueEntry {
  return { packageId: 'eldra.solaris.xphb', packageVersion: '1.0.37', title: 'Thing', slug: 'thing-xphb', ...overrides }
}

describe('isItemEquippable', () => {
  it('is true for a resolved weapon (Shortsword)', () => {
    expect(isItemEquippable(catalogueEntry({
      itemMechanics: { kind: 'weapon', weaponCategory: 'martial', range: 'melee', properties: [], masteryProperty: 'Vex', proficiencyGroups: ['martial'] }
    }))).toBe(true)
  })

  it('is true for armor carrying an equipment Rules Facet (Leather Armor)', () => {
    expect(isItemEquippable(catalogueEntry({
      rulesFacet: { collectionFields: [{ collection: 'collection:equipment', fields: { category: 'armor', slot: 'armor', armorClass: 11 } }] }
    }))).toBe(true)
  })

  it('is true for a Shield (armor category, held slot, no armorClass published)', () => {
    expect(isItemEquippable(catalogueEntry({
      rulesFacet: { collectionFields: [{ collection: 'collection:equipment', fields: { category: 'armor', slot: 'held' } }] }
    }))).toBe(true)
  })

  it('is false for Potion of Healing (no itemMechanics, no equipment facet)', () => {
    expect(isItemEquippable(catalogueEntry({ itemMechanics: null }))).toBe(false)
  })

  it('is false for Arrows (ammunition -- no facet at all)', () => {
    expect(isItemEquippable(catalogueEntry())).toBe(false)
  })

  it('is false for a non-armor, non-weapon equipment-collection category (adventuring gear)', () => {
    expect(isItemEquippable(catalogueEntry({
      rulesFacet: { collectionFields: [{ collection: 'collection:equipment', fields: { category: 'gear' } }] }
    }))).toBe(false)
  })

  it('is false when entry is undefined (custom item with no catalogue entry)', () => {
    expect(isItemEquippable(undefined)).toBe(false)
  })
})

describe('isItemAttunable', () => {
  it('is true only when attunementRequired is explicitly true', () => {
    expect(isItemAttunable(catalogueEntry({ attunementRequired: true }))).toBe(true)
  })

  it('is false for Potion of Healing and Arrows (attunementRequired absent)', () => {
    expect(isItemAttunable(catalogueEntry())).toBe(false)
  })

  it('is false when attunementRequired is explicitly false', () => {
    expect(isItemAttunable(catalogueEntry({ attunementRequired: false }))).toBe(false)
  })

  it('is false when entry is undefined', () => {
    expect(isItemAttunable(undefined)).toBe(false)
  })

  it('is independent of equip eligibility -- a weapon is not attunable by default, and attunement does not imply equippable', () => {
    const magicRing = catalogueEntry({ attunementRequired: true }) // no itemMechanics, no equipment facet
    expect(isItemAttunable(magicRing)).toBe(true)
    expect(isItemEquippable(magicRing)).toBe(false)
  })
})

describe('equipmentCollectionFields', () => {
  it('finds the collection:equipment group fields', () => {
    const entry = catalogueEntry({
      rulesFacet: { collectionFields: [{ collection: 'collection:equipment', fields: { category: 'armor' } }] }
    })
    expect(equipmentCollectionFields(entry)?.category).toBe('armor')
  })

  it('returns undefined when there is no equipment facet or no entry', () => {
    expect(equipmentCollectionFields(catalogueEntry())).toBeUndefined()
    expect(equipmentCollectionFields(undefined)).toBeUndefined()
  })
})
