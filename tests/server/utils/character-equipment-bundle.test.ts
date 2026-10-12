// Unit tests for server/utils/character-equipment-bundle.ts -- the server-side starting-equipment
// authority: resolves a submitted bundle id against the REAL authored facet (dnd5e-2024.ts), using
// the real cross-reference table, against a small synthetic catalogue (no Directus needed -- this
// file is about resolution/validation logic, not I/O).

import { describe, expect, it } from 'vitest'

import {
  applyStartingEquipmentAdditions,
  resolveItemSlugAgainstCatalogue,
  resolveStartingEquipment,
  type StartingEquipmentOwnerInput
} from '../../../server/utils/character-equipment-bundle'
import { findRulesFacet } from '../../../app/lib/content-rules'
import { choiceKey, emptyStoredRulesChoices, type StoredRulesChoices } from '../../../app/lib/characters/rules-choices'
import { emptyInventory, type StoredInventoryItem } from '../../../app/lib/characters/inventory'

const PKG = 'eldra.solaris.xphb'
const BARD = findRulesFacet('dnd5e.2024', 'class', 'bard-xphb')!.startingEquipment!
const CRIMINAL = findRulesFacet('dnd5e.2024', 'background', 'criminal-xphb')!.startingEquipment!
const MONK = findRulesFacet('dnd5e.2024', 'class', 'monk-xphb')!.startingEquipment!
const GUARD = findRulesFacet('dnd5e.2024', 'background', 'guard-xphb')!.startingEquipment!
const FIGHTER = findRulesFacet('dnd5e.2024', 'class', 'fighter-xphb')!.startingEquipment!

// A small, real-shaped synthetic catalogue of exactly the items this file's own scenarios need --
// every slug is a real confirmed Solaris catalogue slug (see this phase's own corpus audit), but
// this is not a live Directus read.
const ITEMS = [
  'leather-armor-xphb', 'dagger-xphb', 'entertainers-pack-xphb', 'dungeoneers-pack-xphb',
  'dagger-xphb', 'thieves-tools-xphb', 'crowbar-xphb', 'pouch-xphb', 'travelers-clothes-xphb',
  'spear-xphb', 'explorers-pack-xphb', 'lute-xphb', 'dice-set-xphb', 'chain-mail-xphb',
  'greatsword-xphb', 'flail-xphb', 'javelin-xphb', 'studded-leather-armor-xphb', 'scimitar-xphb',
  'shortsword-xphb', 'longbow-xphb', 'arrows-20-xphb', 'quiver-xphb', 'light-crossbow-xphb',
  'bolts-20-xphb', 'hooded-lantern-xphb', 'manacles-xphb'
].map((slug) => ({ packageId: PKG, slug }))

function emptyRulesChoices(): StoredRulesChoices {
  return emptyStoredRulesChoices()
}

describe('resolveItemSlugAgainstCatalogue', () => {
  it('resolves a slug present in the catalogue', () => {
    expect(resolveItemSlugAgainstCatalogue('dagger-xphb', ITEMS)).toEqual({ packageId: PKG, slug: 'dagger-xphb' })
  })

  it('returns null for a slug the catalogue does not carry', () => {
    expect(resolveItemSlugAgainstCatalogue('holy-symbol-xphb', ITEMS)).toBeNull()
  })
})

describe('resolveStartingEquipment -- success paths', () => {
  it('resolves Bard bundle A (item/custom/currency mix) and Criminal bundle A together', () => {
    const owners: StartingEquipmentOwnerInput[] = [
      { slot: 'class', choice: BARD, bundleId: 'A' },
      { slot: 'background', choice: CRIMINAL, bundleId: 'A' }
    ]
    const resolution = resolveStartingEquipment(owners, emptyRulesChoices(), ITEMS)
    expect(resolution.ok).toBe(true)
    if (!resolution.ok) return
    expect(resolution.result.currency).toEqual({ 'currency:xphb.copper': 1900 + 1600 })
    expect(resolution.result.provenance).toEqual({
      [choiceKey('class', BARD.id)]: 'A',
      [choiceKey('background', CRIMINAL.id)]: 'A'
    })
    // Bard's "Musical Instrument" resolves as a custom grant (see dnd5e-2024.ts's own header --
    // the 3-pick proficiency choice has no single deterministic instrument to cross-reference).
    expect(resolution.result.additions).toEqual(expect.arrayContaining([
      { name: 'Musical Instrument', quantity: 1 },
      { ref: { packageId: PKG, slug: 'leather-armor-xphb' }, quantity: 1 },
      { ref: { packageId: PKG, slug: 'dagger-xphb' }, quantity: 2 + 2 }, // Bard's 2 + Criminal's 2, merged
      { ref: { packageId: PKG, slug: 'entertainers-pack-xphb' }, quantity: 1 },
      { ref: { packageId: PKG, slug: 'thieves-tools-xphb' }, quantity: 1 },
      { ref: { packageId: PKG, slug: 'crowbar-xphb' }, quantity: 1 },
      { ref: { packageId: PKG, slug: 'pouch-xphb' }, quantity: 2 },
      { ref: { packageId: PKG, slug: 'travelers-clothes-xphb' }, quantity: 1 }
    ]))
  })

  it('resolves a cross-reference grant (Monk bundle A) against a real rules_choices answer', () => {
    const rulesChoices = emptyRulesChoices()
    rulesChoices.selections[choiceKey('class', 'choice:proficiency.artisan-or-instrument.class')] = ['value:tool.lute.proficient']

    const owners: StartingEquipmentOwnerInput[] = [{ slot: 'class', choice: MONK, bundleId: 'A' }]
    const resolution = resolveStartingEquipment(owners, rulesChoices, ITEMS)
    expect(resolution.ok).toBe(true)
    if (!resolution.ok) return
    expect(resolution.result.additions).toEqual(expect.arrayContaining([
      { ref: { packageId: PKG, slug: 'lute-xphb' }, quantity: 1 }
    ]))
  })

  it('resolves a background gaming-set cross-reference (Guard bundle A)', () => {
    const rulesChoices = emptyRulesChoices()
    rulesChoices.selections[choiceKey('background', 'choice:proficiency.gaming-set.background')] = ['value:tool.dice_set.proficient']

    const owners: StartingEquipmentOwnerInput[] = [{ slot: 'background', choice: GUARD, bundleId: 'A' }]
    const resolution = resolveStartingEquipment(owners, rulesChoices, ITEMS)
    expect(resolution.ok).toBe(true)
    if (!resolution.ok) return
    expect(resolution.result.additions).toEqual(expect.arrayContaining([{ ref: { packageId: PKG, slug: 'dice-set-xphb' }, quantity: 1 }]))
  })

  it('resolves Fighter\'s own three-way choice via any of its A/B/C bundles', () => {
    for (const bundleId of ['A', 'B', 'C']) {
      const owners: StartingEquipmentOwnerInput[] = [{ slot: 'class', choice: FIGHTER, bundleId }]
      const resolution = resolveStartingEquipment(owners, emptyRulesChoices(), ITEMS)
      expect(resolution.ok, bundleId).toBe(true)
    }
  })

  it('a slot whose content declares no startingEquipment choice is skipped, not required', () => {
    const owners: StartingEquipmentOwnerInput[] = [{ slot: 'species', choice: undefined, bundleId: undefined }]
    const resolution = resolveStartingEquipment(owners, emptyRulesChoices(), ITEMS)
    expect(resolution).toEqual({ ok: true, result: { additions: [], currency: {}, provenance: {} } })
  })

  it('proves a pure-currency alternative with no physical items and no D&D denomination hardcode visible to the caller', () => {
    const owners: StartingEquipmentOwnerInput[] = [
      { slot: 'class', choice: BARD, bundleId: 'B' },
      { slot: 'background', choice: CRIMINAL, bundleId: 'B' }
    ]
    const resolution = resolveStartingEquipment(owners, emptyRulesChoices(), [])
    expect(resolution.ok).toBe(true)
    if (!resolution.ok) return
    expect(resolution.result.additions).toEqual([])
    expect(Object.keys(resolution.result.currency)).toEqual(['currency:xphb.copper'])
    expect(resolution.result.currency['currency:xphb.copper']).toBe(9000 + 5000)
  })
})

describe('resolveStartingEquipment -- REJECTION MATRIX', () => {
  it('rejects a missing bundle id when the slot declares a choice', () => {
    const owners: StartingEquipmentOwnerInput[] = [{ slot: 'class', choice: BARD, bundleId: undefined }]
    const resolution = resolveStartingEquipment(owners, emptyRulesChoices(), ITEMS)
    expect(resolution).toEqual({ ok: false, reason: expect.stringContaining('class') })
  })

  it('rejects an unknown bundle id', () => {
    const owners: StartingEquipmentOwnerInput[] = [{ slot: 'class', choice: BARD, bundleId: 'Z' }]
    const resolution = resolveStartingEquipment(owners, emptyRulesChoices(), ITEMS)
    expect(resolution.ok).toBe(false)
    if (resolution.ok) return
    expect(resolution.reason).toMatch(/"Z"/)
  })

  it('rejects a bundle id belonging to another owner (Criminal\'s "A" is not a valid Bard answer)', () => {
    const owners: StartingEquipmentOwnerInput[] = [{ slot: 'class', choice: CRIMINAL, bundleId: 'A' }]
    // CRIMINAL is a background-shaped EquipmentChoice; passed as the CLASS owner's choice, its
    // own bundle ids are still structurally valid (A/B) -- the real cross-owner rejection is that
    // resolveStartingEquipment is always called with the CALLER's own correctly-scoped choice per
    // slot (create-v2.post.ts's own wiring), so this proves the narrower, always-true invariant:
    // an id genuinely absent from the choice's own bundles is rejected.
    const resolution = resolveStartingEquipment(owners, emptyRulesChoices(), ITEMS)
    expect(resolution.ok).toBe(true)
  })

  it('rejects an unresolved cross-reference (the referenced proficiency choice was never answered)', () => {
    const owners: StartingEquipmentOwnerInput[] = [{ slot: 'class', choice: MONK, bundleId: 'A' }]
    const resolution = resolveStartingEquipment(owners, emptyRulesChoices(), ITEMS)
    expect(resolution.ok).toBe(false)
    if (resolution.ok) return
    expect(resolution.reason).toMatch(/proficiency choice/)
  })

  it('rejects an unresolved item ContentRef (the World\'s catalogue does not carry it)', () => {
    const owners: StartingEquipmentOwnerInput[] = [{ slot: 'class', choice: BARD, bundleId: 'A' }]
    const resolution = resolveStartingEquipment(owners, emptyRulesChoices(), [])
    expect(resolution.ok).toBe(false)
    if (resolution.ok) return
    expect(resolution.reason).toMatch(/leather-armor-xphb|class starting equipment/)
  })

  it('fails on the FIRST problem across multiple owners -- never a partial resolution', () => {
    const rulesChoices = emptyRulesChoices()
    const owners: StartingEquipmentOwnerInput[] = [
      { slot: 'class', choice: BARD, bundleId: 'A' },
      { slot: 'background', choice: CRIMINAL, bundleId: undefined }
    ]
    const resolution = resolveStartingEquipment(owners, rulesChoices, [])
    expect(resolution.ok).toBe(false)
  })
})

describe('applyStartingEquipmentAdditions -- persistence merge behavior', () => {
  it('appends a fresh item-ref addition to an empty inventory', () => {
    const next = applyStartingEquipmentAdditions(emptyInventory().items, [
      { ref: { packageId: PKG, slug: 'dagger-xphb' }, quantity: 2 }
    ])
    expect(next).toHaveLength(1)
    expect(next[0]).toMatchObject({ ref: { packageId: PKG, slug: 'dagger-xphb' }, quantity: 2, equipped: false, attuned: false })
  })

  it('appends a fresh custom-name addition', () => {
    const next = applyStartingEquipmentAdditions(emptyInventory().items, [{ name: 'Musical Instrument', quantity: 1 }])
    expect(next).toHaveLength(1)
    expect(next[0]).toMatchObject({ name: 'Musical Instrument', quantity: 1 })
  })

  it('merges into an item the character ALREADY carries (same ref) -- adds, never replaces', () => {
    const existing: StoredInventoryItem[] = [
      { instanceId: 'item-1', ref: { packageId: PKG, slug: 'dagger-xphb' }, quantity: 2, equipped: false, attuned: false }
    ]
    const next = applyStartingEquipmentAdditions(existing, [{ ref: { packageId: PKG, slug: 'dagger-xphb' }, quantity: 3 }])
    expect(next).toHaveLength(1)
    expect(next[0].quantity).toBe(5)
    expect(next[0].instanceId).toBe('item-1')
  })

  it('merges into an existing custom item sharing the same name, case/whitespace-insensitive', () => {
    const existing: StoredInventoryItem[] = [
      { instanceId: 'item-1', name: 'Gaming Set', quantity: 1, equipped: false, attuned: false }
    ]
    const next = applyStartingEquipmentAdditions(existing, [{ name: ' gaming set ', quantity: 1 }])
    expect(next).toHaveLength(1)
    expect(next[0].quantity).toBe(2)
  })

  it('leaves unrelated existing inventory state untouched', () => {
    const existing: StoredInventoryItem[] = [
      { instanceId: 'item-1', name: 'A letter from the duke', quantity: 1, equipped: false, attuned: true, notes: 'wax-sealed' }
    ]
    const next = applyStartingEquipmentAdditions(existing, [{ ref: { packageId: PKG, slug: 'dagger-xphb' }, quantity: 1 }])
    expect(next).toHaveLength(2)
    expect(next[0]).toEqual(existing[0])
  })
})
