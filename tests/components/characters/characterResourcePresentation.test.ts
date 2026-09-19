// Unit tests for app/components/characters/characterResourcePresentation.ts
// -- Character Sheet Caster Pass 0.1's Character Resource Presentation
// contract.
//
// Two things are proven here, deliberately with non-spell fixtures where
// it matters: (1) the ORDERING/ACCESSIBILITY rules CharacterResourceOrbs.vue
// renders through (available-first, expended-last; a stated accessible
// name, never color alone), and (2) that the view model itself does not
// assume "spell slots, levels 1-9, one class" -- a character with Spell
// Slots AND a wholly invented "Sorcery Points"/"Bardic Inspiration" shape
// (never persisted, never gameplay -- pure fixtures proving the CONTRACT,
// not a new feature) must be representable without a code change here.

import { describe, expect, it } from 'vitest'
import {
  isResourceUnitAvailable,
  resourceUnitAriaLabel,
  spellSlotsToCharacterResources,
  type CharacterResourceGroup,
  type CharacterResourcePool
} from '../../../app/components/characters/characterResourcePresentation'

describe('isResourceUnitAvailable -- available-first, expended-last ordering', () => {
  it('max 4 / expended 1: three available, one expended, in that position order', () => {
    const pool: CharacterResourcePool = { id: '1', max: 4, expended: 1, adjustable: true }
    expect([1, 2, 3, 4].map((position) => isResourceUnitAvailable(pool, position))).toEqual([
      true, true, true, false
    ])
  })

  it('max 4 / expended 4: zero available, four expended', () => {
    const pool: CharacterResourcePool = { id: '1', max: 4, expended: 4, adjustable: true }
    expect([1, 2, 3, 4].map((position) => isResourceUnitAvailable(pool, position))).toEqual([
      false, false, false, false
    ])
  })

  it('max 4 / expended 0: four available', () => {
    const pool: CharacterResourcePool = { id: '1', max: 4, expended: 0, adjustable: true }
    expect([1, 2, 3, 4].map((position) => isResourceUnitAvailable(pool, position))).toEqual([
      true, true, true, true
    ])
  })

  // The exact worked example this task's own spec gives, reproduced
  // literally: clicking a filled orb increases `expended`, which must
  // deterministically re-derive the SAME left-filled/right-empty shape,
  // never a different one -- ordering never "jumps" after a click.
  it('reproduces the exact click sequence from the spec: 4/1 -> expend -> 4/2 -> restore -> 4/1', () => {
    const afterExpend: CharacterResourcePool = { id: '1', max: 4, expended: 2, adjustable: true }
    expect([1, 2, 3, 4].map((position) => isResourceUnitAvailable(afterExpend, position))).toEqual([
      true, true, false, false
    ])

    const afterRestore: CharacterResourcePool = { id: '1', max: 4, expended: 1, adjustable: true }
    expect([1, 2, 3, 4].map((position) => isResourceUnitAvailable(afterRestore, position))).toEqual([
      true, true, true, false
    ])
  })
})

describe('resourceUnitAriaLabel -- accessible naming never relies on color alone', () => {
  it('states the group, pool label, position, and explicit available/expended word', () => {
    const pool: CharacterResourcePool = { id: '1', label: 'L1', max: 2, expended: 1, adjustable: true }
    expect(resourceUnitAriaLabel('Spell Slots', pool, 1)).toBe('Spell Slots L1 unit 1 of 2: available')
    expect(resourceUnitAriaLabel('Spell Slots', pool, 2)).toBe('Spell Slots L1 unit 2 of 2: expended')
  })

  it('omits the pool label segment when a pool has none (a single-pool resource)', () => {
    const pool: CharacterResourcePool = { id: 'main', max: 5, expended: 2, adjustable: true }
    expect(resourceUnitAriaLabel('Sorcery Points', pool, 1)).toBe('Sorcery Points unit 1 of 5: available')
  })
})

describe('spellSlotsToCharacterResources -- the Spell Slots adapter', () => {
  it('adapts slotLevels into one "Spell Slots" group with one pool per level', () => {
    const groups = spellSlotsToCharacterResources([
      { level: 1, max: 2, expended: 0 }
    ])

    expect(groups).toEqual([
      {
        id: 'spell-slots',
        label: 'Spell Slots',
        pools: [{ id: '1', label: 'L1', max: 2, expended: 0, adjustable: true }]
      }
    ])
  })

  it('produces multiple pools for multiple slot levels, in the given order', () => {
    const groups = spellSlotsToCharacterResources([
      { level: 1, max: 4, expended: 1 },
      { level: 2, max: 3, expended: 0 },
      { level: 3, max: 2, expended: 2 }
    ])

    expect(groups).toHaveLength(1)
    expect(groups[0]!.pools.map((pool) => pool.id)).toEqual(['1', '2', '3'])
    expect(groups[0]!.pools).toEqual([
      { id: '1', label: 'L1', max: 4, expended: 1, adjustable: true },
      { id: '2', label: 'L2', max: 3, expended: 0, adjustable: true },
      { id: '3', label: 'L3', max: 2, expended: 2, adjustable: true }
    ])
  })

  // Ordering stability: calling the adapter twice with the same input
  // produces byte-identical output -- nothing here depends on iteration
  // order of an object, a Set, or anything else that could silently
  // reorder between renders.
  it('produces stable, repeatable output for the same input', () => {
    const input = [
      { level: 1, max: 4, expended: 1 },
      { level: 2, max: 3, expended: 0 }
    ]
    expect(spellSlotsToCharacterResources(input)).toEqual(spellSlotsToCharacterResources(input))
  })

  it('produces NO groups for a non-caster (empty slotLevels) -- never an empty "Spell Slots" container', () => {
    expect(spellSlotsToCharacterResources([])).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// FUTURE-PROOFING PROOF -- pure view-model fixtures only, per this task's
// own TESTING -- FUTURE-PROOF PRESENTATION section. These resources are
// NEVER granted to a real character, never persisted, and never gameplay --
// they exist only to prove the CharacterResourceGroup/CharacterResourcePool
// contract itself does not assume "spell slots", "one group", or "one
// class", the same way character-derived.ts's own DerivedCharacter proves
// system-agnosticism by never naming D&D.
// ---------------------------------------------------------------------------

describe('CharacterResourceGroup contract -- proven capable of non-spell, multi-group resources', () => {
  it('can represent a single-pool resource shaped like Sorcery Points (one pool, no per-pool label)', () => {
    const sorceryPoints: CharacterResourceGroup = {
      id: 'sorcery-points',
      label: 'Sorcery Points',
      pools: [{ id: 'main', max: 5, expended: 2, adjustable: true }]
    }

    expect(sorceryPoints.pools).toHaveLength(1)
    expect(isResourceUnitAvailable(sorceryPoints.pools[0]!, 1)).toBe(true)
    expect(isResourceUnitAvailable(sorceryPoints.pools[0]!, 4)).toBe(false)
  })

  it('can represent a character with multiple simultaneous resource groups (Spell Slots + Sorcery Points + Bardic Inspiration)', () => {
    const groups: CharacterResourceGroup[] = [
      ...spellSlotsToCharacterResources([{ level: 1, max: 4, expended: 1 }]),
      { id: 'sorcery-points', label: 'Sorcery Points', pools: [{ id: 'main', max: 5, expended: 2, adjustable: true }] },
      { id: 'bardic-inspiration', label: 'Bardic Inspiration', pools: [{ id: 'main', max: 3, expended: 0, adjustable: true }] }
    ]

    expect(groups.map((group) => group.id)).toEqual(['spell-slots', 'sorcery-points', 'bardic-inspiration'])
    // Nothing about the shape required knowing these are three DIFFERENT
    // classes' resources, or that one of them (Spell Slots) came from a
    // different code path (the adapter) than the other two (hand-built
    // fixtures) -- a renderer loops over `groups` uniformly either way.
    expect(groups.every((group) => Array.isArray(group.pools))).toBe(true)
  })
})
