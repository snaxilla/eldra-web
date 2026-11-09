// Unit tests for app/lib/item-mechanics/dnd5e.ts -- resolveDnd5eItemMechanics.
//
// Character Purgatory item-mechanics pass. Before this file existed, this
// module (the ONLY resolver standing between a published item's raw
// 5etools data and the weapon mechanics the Rules Engine's Actions panel,
// and now the Item Detail panel, read) had zero test coverage anywhere in
// the repo. Fixtures below are copied verbatim from
// /opt/eldra/datasets/5etools-src/data/items-base.json (source: 'XPHB'),
// not invented, so these tests pin resolution against the real corpus
// shape rather than an idealized one.

import { describe, expect, it } from 'vitest'
import { resolveDnd5eItemAttunementRequired, resolveDnd5eItemMechanics } from '../../../app/lib/item-mechanics/dnd5e'
import { resolveItemAttunementRequired, resolveItemMechanics } from '../../../app/lib/item-mechanics'

// Verbatim from items-base.json, baseitem[], source: 'XPHB'.
const SHORTSWORD = {
  name: 'Shortsword', source: 'XPHB', type: 'M|XPHB', weaponCategory: 'martial',
  property: ['F|XPHB', 'L|XPHB'], mastery: ['Vex|XPHB'], dmg1: '1d6', dmgType: 'P', weapon: true
}

const SHORTBOW = {
  name: 'Shortbow', source: 'XPHB', type: 'R|XPHB', weaponCategory: 'simple',
  property: ['A|XPHB', '2H|XPHB'], mastery: ['Vex|XPHB'], range: '80/320', dmg1: '1d6', dmgType: 'P', weapon: true
}

const DAGGER = {
  name: 'Dagger', source: 'XPHB', type: 'M|XPHB', weaponCategory: 'simple',
  property: ['F|XPHB', 'L|XPHB', 'T|XPHB'], mastery: ['Nick|XPHB'], range: '20/60', dmg1: '1d4', dmgType: 'P', weapon: true
}

const QUARTERSTAFF = {
  name: 'Quarterstaff', source: 'XPHB', type: 'M|XPHB', weaponCategory: 'simple',
  property: ['V|XPHB'], mastery: ['Topple|XPHB'], dmg1: '1d6', dmgType: 'B', dmg2: '1d8', weapon: true
}

// The real Staff/Wooden Staff dual-purpose shape this resolver's own
// header documents: `type: 'SCF|XPHB'` (Spellcasting Focus, not a weapon
// type code) yet still carries a full weapon stat block, with `property`
// codes that, uniquely on this entry, have NO `|XPHB` suffix at all.
const STAFF = {
  name: 'Staff', source: 'XPHB', type: 'SCF|XPHB', scfType: 'arcane', weaponCategory: 'simple',
  property: ['V'], mastery: ['Topple|XPHB'], dmg1: '1d6', dmgType: 'B', dmg2: '1d8', staff: true
}

// Verbatim from items-base.json, Leather Armor -- no `weaponCategory` at
// all, the real structural signal this resolver gates on.
const LEATHER_ARMOR = {
  name: 'Leather Armor', source: 'XPHB', type: 'LA|XPHB', ac: 11, armor: true
}

describe('resolveDnd5eItemMechanics', () => {
  it('resolves a melee martial weapon (Shortsword) with its properties and mastery', () => {
    expect(resolveDnd5eItemMechanics(SHORTSWORD)).toEqual({
      kind: 'weapon',
      weaponCategory: 'martial',
      range: 'melee',
      properties: ['finesse', 'light'],
      masteryProperty: 'Vex',
      proficiencyGroups: ['martial', 'martial_light', 'martial_finesse_light']
    })
  })

  it('resolves a ranged simple weapon (Shortbow)', () => {
    expect(resolveDnd5eItemMechanics(SHORTBOW)).toEqual({
      kind: 'weapon',
      weaponCategory: 'simple',
      range: 'ranged',
      properties: ['ammunition', 'two-handed'],
      masteryProperty: 'Vex',
      proficiencyGroups: ['simple']
    })
  })

  it('resolves a thrown finesse weapon (Dagger)', () => {
    const result = resolveDnd5eItemMechanics(DAGGER)
    expect(result?.range).toBe('melee')
    expect(result?.properties).toEqual(['finesse', 'light', 'thrown'])
    expect(result?.masteryProperty).toBe('Nick')
  })

  it('resolves a versatile weapon with a second damage die (Quarterstaff) -- properties only, no damage dice modeled here', () => {
    const result = resolveDnd5eItemMechanics(QUARTERSTAFF)
    expect(result?.properties).toEqual(['versatile'])
    expect(result?.masteryProperty).toBe('Topple')
    expect(result).not.toHaveProperty('dmg1')
    expect(result).not.toHaveProperty('damage')
  })

  it('resolves the Staff/Wooden Staff SCF dual-purpose shape as a weapon despite type:SCF, and handles un-suffixed property codes', () => {
    const result = resolveDnd5eItemMechanics(STAFF)
    expect(result?.kind).toBe('weapon')
    expect(result?.range).toBe('melee')
    expect(result?.properties).toEqual(['versatile'])
    expect(result?.masteryProperty).toBe('Topple')
  })

  it('returns null for a non-weapon item (Leather Armor) -- Milestone A resolves weapons only', () => {
    expect(resolveDnd5eItemMechanics(LEATHER_ARMOR)).toBeNull()
  })

  it('returns null for malformed/absent data rather than throwing', () => {
    expect(resolveDnd5eItemMechanics(null)).toBeNull()
    expect(resolveDnd5eItemMechanics(undefined)).toBeNull()
    expect(resolveDnd5eItemMechanics('not an object')).toBeNull()
    expect(resolveDnd5eItemMechanics({})).toBeNull()
  })

  it('returns null for a weapon-shaped entry missing its mastery property -- never fabricates one', () => {
    const { mastery, ...withoutMastery } = SHORTSWORD as any
    expect(resolveDnd5eItemMechanics(withoutMastery)).toBeNull()
  })

  it('derives proficiencyGroups structurally from category+properties, never from the weapon name', () => {
    // Longsword: martial, no light/finesse -- should get ONLY 'martial'.
    const longsword = { ...SHORTSWORD, name: 'Longsword', property: [] }
    expect(resolveDnd5eItemMechanics(longsword)?.proficiencyGroups).toEqual(['martial'])
  })
})

describe('resolveItemMechanics (system dispatch)', () => {
  it('dispatches dnd5e to the real resolver', () => {
    expect(resolveItemMechanics('dnd5e', SHORTSWORD)?.kind).toBe('weapon')
  })

  it('returns null for an unknown system rather than throwing', () => {
    expect(resolveItemMechanics('pf2e', SHORTSWORD)).toBeNull()
  })
})

// Character Sheet Inventory pass. Fixtures copied verbatim from
// items.json: Ring of Protection (XDMG, reqAttune: true) is the real
// "explicitly requires attunement" case; Shortsword (XPHB, no reqAttune
// field at all) is the real "mundane, never attunes" case the reported
// bug incorrectly showed a control for.
const RING_OF_PROTECTION_XDMG = {
  name: 'Ring of Protection', source: 'XDMG', type: 'RG|XDMG', rarity: 'rare', reqAttune: true
}

describe('resolveDnd5eItemAttunementRequired', () => {
  it('is true for a real item whose reqAttune is true (Ring of Protection)', () => {
    expect(resolveDnd5eItemAttunementRequired(RING_OF_PROTECTION_XDMG)).toBe(true)
  })

  it('is false for a real mundane item with no reqAttune field at all (Shortsword)', () => {
    expect(resolveDnd5eItemAttunementRequired(SHORTSWORD)).toBe(false)
  })

  it('is true for reqAttune as a condition string, not only a bare boolean -- "requires attunement" either way', () => {
    expect(resolveDnd5eItemAttunementRequired({ name: 'X', reqAttune: 'by a Spellcaster' })).toBe(true)
  })

  it('is true for the legacy `attunement` boolean when reqAttune is absent', () => {
    expect(resolveDnd5eItemAttunementRequired({ name: 'X', attunement: true })).toBe(true)
  })

  it('never infers attunement from rarity or name -- a common item can require it, a legendary one need not', () => {
    expect(resolveDnd5eItemAttunementRequired({ name: 'Mundane Common Thing', rarity: 'common' })).toBe(false)
    expect(resolveDnd5eItemAttunementRequired({ name: 'Vorpal Sword', rarity: 'legendary' })).toBe(false)
  })

  it('returns false, never throws, for malformed/absent data', () => {
    expect(resolveDnd5eItemAttunementRequired(null)).toBe(false)
    expect(resolveDnd5eItemAttunementRequired(undefined)).toBe(false)
    expect(resolveDnd5eItemAttunementRequired('not an object')).toBe(false)
  })
})

describe('resolveItemAttunementRequired (system dispatch)', () => {
  it('dispatches dnd5e to the real resolver', () => {
    expect(resolveItemAttunementRequired('dnd5e', RING_OF_PROTECTION_XDMG)).toBe(true)
  })

  it('returns false for an unknown system rather than throwing', () => {
    expect(resolveItemAttunementRequired('pf2e', RING_OF_PROTECTION_XDMG)).toBe(false)
  })
})
