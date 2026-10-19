// Unit tests for app/lib/characters/spellcasting.ts -- the pure
// Spellcasting model behind the Spellcasting System's stored half.
//
// Pure module, nothing to mock. Mirrors inventory.test.ts and
// health.test.ts's own coverage shape: a stored record is re-validated
// rather than trusted, and every mutation is a total, non-mutating
// function.

import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

import {
  addSpell,
  deriveSpellSlotLevels,
  emptyCharacterSpellcasting,
  expendSlot,
  isValidSlotLevel,
  nextInstanceId,
  normalizeStoredSpellcasting,
  removeSpell,
  resetAllSlots,
  restoreSlot,
  toggleSpellFlag,
  toStoredSpellEntry,
  unresolvedSpellLabel,
  type StoredSpellEntry
} from '../../../app/lib/characters/spellcasting'

const REF = { packageId: 'eldra.content.xphb', slug: 'fireball-xphb' }

function spell(overrides: Partial<StoredSpellEntry> = {}): StoredSpellEntry {
  return {
    instanceId: 'spell-1',
    ref: REF,
    known: true,
    prepared: false,
    ...overrides
  }
}

describe('emptyCharacterSpellcasting', () => {
  it('starts with no spells and no expended slots', () => {
    expect(emptyCharacterSpellcasting()).toEqual({ spells: [], expendedSlots: {} })
  })
})

describe('isValidSlotLevel', () => {
  it('accepts 1 through 9', () => {
    for (let level = 1; level <= 9; level++) {
      expect(isValidSlotLevel(level)).toBe(true)
    }
  })

  it('rejects 0, 10, negatives, and non-numbers', () => {
    for (const value of [0, 10, -1, 1.5, 'nine', null, undefined]) {
      expect(isValidSlotLevel(value)).toBe(false)
    }
  })
})

describe('nextInstanceId', () => {
  it('starts at spell-1 for an empty list', () => {
    expect(nextInstanceId([])).toBe('spell-1')
  })

  it('continues past the highest existing numeric suffix', () => {
    expect(nextInstanceId([spell({ instanceId: 'spell-3' }), spell({ instanceId: 'spell-1' })])).toBe('spell-4')
  })
})

describe('normalizeStoredSpellcasting', () => {
  it('returns null for a malformed envelope', () => {
    expect(normalizeStoredSpellcasting(null)).toBeNull()
    expect(normalizeStoredSpellcasting('nope')).toBeNull()
    expect(normalizeStoredSpellcasting({})).toBeNull()
  })

  it('reads back a well-formed record unchanged', () => {
    const stored = { spells: [spell()], expendedSlots: { 1: 2 } }
    expect(normalizeStoredSpellcasting(stored)).toEqual(stored)
  })

  it('drops one malformed spell entry without failing the whole record', () => {
    const result = normalizeStoredSpellcasting({
      spells: [spell(), { instanceId: 'spell-2' }] // no ref and no name -- not a spell
    })
    expect(result?.spells).toHaveLength(1)
  })

  it('drops a half-written reference, degrading the entry rather than the record', () => {
    const result = normalizeStoredSpellcasting({
      spells: [{ instanceId: 'spell-1', ref: { packageId: 'x' }, known: true, prepared: false }]
    })
    // No packageId+slug and no name -- the entry itself is unreadable.
    expect(result?.spells).toEqual([])
  })

  it('normalizes expendedSlots, dropping invalid levels and non-positive counts', () => {
    const result = normalizeStoredSpellcasting({
      spells: [],
      expendedSlots: { 1: 2, 0: 5, 10: 1, 3: 0, 4: -1, 5: 'two' }
    })
    expect(result?.expendedSlots).toEqual({ 1: 2 })
  })

  it('defaults to {} when expendedSlots is absent or malformed', () => {
    expect(normalizeStoredSpellcasting({ spells: [] })?.expendedSlots).toEqual({})
    expect(normalizeStoredSpellcasting({ spells: [], expendedSlots: 'nope' })?.expendedSlots).toEqual({})
  })

  // D&D 2024 Character Rules P3.2.1 -- SPELL REQUIREMENT PROVENANCE normalization.
  describe('requirementIds', () => {
    it('round-trips a valid, non-empty array unchanged', () => {
      const result = normalizeStoredSpellcasting({
        spells: [{ ...spell(), requirementIds: ['spell-requirement.wizard-xphb.spellbook', 'spell-requirement.wizard-xphb.spell'] }]
      })
      expect(result?.spells[0]!.requirementIds).toEqual(['spell-requirement.wizard-xphb.spellbook', 'spell-requirement.wizard-xphb.spell'])
    })

    it('leaves the field absent when the entry never had it (legacy row)', () => {
      const result = normalizeStoredSpellcasting({ spells: [spell()] })
      expect(result?.spells[0]).not.toHaveProperty('requirementIds')
    })

    it('drops non-string / empty-string entries, keeping the valid ones', () => {
      const result = normalizeStoredSpellcasting({
        spells: [{ ...spell(), requirementIds: ['spell-requirement.wizard-xphb.spellbook', 42, '', '   ', null, 'spell-requirement.wizard-xphb.spell'] }]
      })
      expect(result?.spells[0]!.requirementIds).toEqual(['spell-requirement.wizard-xphb.spellbook', 'spell-requirement.wizard-xphb.spell'])
    })

    it('omits the field entirely (never an empty array) when nothing valid survives', () => {
      const result = normalizeStoredSpellcasting({ spells: [{ ...spell(), requirementIds: [42, '', null] }] })
      expect(result?.spells[0]).not.toHaveProperty('requirementIds')
    })

    it('treats a non-array requirementIds as absent, degrading the field rather than the entry', () => {
      const result = normalizeStoredSpellcasting({ spells: [{ ...spell(), requirementIds: 'not-an-array' }] })
      expect(result?.spells).toHaveLength(1)
      expect(result?.spells[0]).not.toHaveProperty('requirementIds')
    })

    it('preserves duplicate ids verbatim -- no destructive dedup write (evaluation uses set semantics, not storage)', () => {
      const result = normalizeStoredSpellcasting({
        spells: [{ ...spell(), requirementIds: ['spell-requirement.wizard-xphb.cantrip', 'spell-requirement.wizard-xphb.cantrip'] }]
      })
      expect(result?.spells[0]!.requirementIds).toEqual(['spell-requirement.wizard-xphb.cantrip', 'spell-requirement.wizard-xphb.cantrip'])
    })
  })
})

describe('toStoredSpellEntry', () => {
  it('carries requirementIds through when present', () => {
    const assembled = { instanceId: 'spell-1', ref: REF, known: true, prepared: true, requirementIds: ['req.a', 'req.b'], status: 'resolved' as const, title: 'Fireball' }
    expect(toStoredSpellEntry(assembled)).toEqual({ instanceId: 'spell-1', ref: REF, known: true, prepared: true, requirementIds: ['req.a', 'req.b'] })
  })

  it('omits requirementIds when absent -- never forces an empty array onto a legacy/untagged entry', () => {
    const assembled = { instanceId: 'spell-1', ref: REF, known: true, prepared: false, status: 'resolved' as const, title: 'Fireball' }
    const result = toStoredSpellEntry(assembled)
    expect(result).not.toHaveProperty('requirementIds')
  })

  it('carries a custom (named) spell through exactly as addSpell/toggleSpellFlag already shape it', () => {
    const assembled = { instanceId: 'spell-1', name: 'Bramblewood Ward', known: true, prepared: false, status: 'custom' as const, title: 'Bramblewood Ward' }
    expect(toStoredSpellEntry(assembled)).toEqual({ instanceId: 'spell-1', name: 'Bramblewood Ward', known: true, prepared: false })
  })
})

describe('unresolvedSpellLabel', () => {
  it('names the slug and marks it unavailable', () => {
    expect(unresolvedSpellLabel(REF)).toBe('fireball-xphb (unavailable)')
  })
})

describe('addSpell / removeSpell / toggleSpellFlag', () => {
  it('adds a catalogue-referenced spell as known and unprepared', () => {
    const result = addSpell([], { ref: REF })
    expect(result).toEqual([{ instanceId: 'spell-1', ref: REF, known: true, prepared: false }])
  })

  it('adds a custom spell by name', () => {
    const result = addSpell([], { name: 'Bramblewood Ward' })
    expect(result).toEqual([{ instanceId: 'spell-1', name: 'Bramblewood Ward', known: true, prepared: false }])
  })

  it('refuses to add a spell with neither a reference nor a name', () => {
    expect(addSpell([spell()], {})).toHaveLength(1)
  })

  it('does not mutate the input list', () => {
    const original = [spell()]
    addSpell(original, { name: 'New' })
    expect(original).toHaveLength(1)
  })

  it('removes by instanceId', () => {
    const result = removeSpell([spell({ instanceId: 'spell-1' }), spell({ instanceId: 'spell-2' })], 'spell-1')
    expect(result).toHaveLength(1)
    expect(result[0].instanceId).toBe('spell-2')
  })

  it('toggles known and prepared independently', () => {
    const list = [spell({ known: true, prepared: false })]
    const preparedOn = toggleSpellFlag(list, 'spell-1', 'prepared')
    expect(preparedOn[0]).toMatchObject({ known: true, prepared: true })

    const knownOff = toggleSpellFlag(preparedOn, 'spell-1', 'known')
    expect(knownOff[0]).toMatchObject({ known: false, prepared: true })
  })
})

describe('expendSlot / restoreSlot / resetAllSlots', () => {
  it('expends one slot of a level, starting from nothing', () => {
    expect(expendSlot({}, 1, 4)).toEqual({ '1': 1 })
  })

  it('is a no-op once every slot of that level is spent', () => {
    expect(expendSlot({ '1': 4 }, 1, 4)).toEqual({ '1': 4 })
  })

  it('is a no-op for an out-of-range slot level', () => {
    expect(expendSlot({}, 10, 4)).toEqual({})
    expect(expendSlot({}, 0, 4)).toEqual({})
  })

  it('restores one slot, removing the key entirely once it reaches zero', () => {
    expect(restoreSlot({ '1': 2 }, 1)).toEqual({ '1': 1 })
    expect(restoreSlot({ '1': 1 }, 1)).toEqual({})
  })

  it('is a no-op restoring a level with nothing spent', () => {
    expect(restoreSlot({}, 1)).toEqual({})
  })

  it('does not mutate the input map', () => {
    const original = { '1': 2 }
    expendSlot(original, 1, 4)
    restoreSlot(original, 1)
    expect(original).toEqual({ '1': 2 })
  })

  it('resetAllSlots always returns an empty map', () => {
    expect(resetAllSlots()).toEqual({})
  })
})

// Character Sheet Body Phase 1B.2 -- extracted verbatim from
// useCharacterSheet.ts's own `slotLevels` computed, so
// server/utils/character-cast.ts's authoritative Cast command derives the
// IDENTICAL max/available numbers the Sheet already displays.
describe('deriveSpellSlotLevels', () => {
  it('returns [] with no caster type at all', () => {
    expect(deriveSpellSlotLevels({
      casterType: null, tableRows: [{ key: 1, slot_1: 2 }], characterLevel: 1, expendedSlots: {}
    })).toEqual([])
  })

  it('returns [] when no row matches this character level', () => {
    expect(deriveSpellSlotLevels({
      casterType: 'full', tableRows: [{ key: 5, slot_1: 4 }], characterLevel: 1, expendedSlots: {}
    })).toEqual([])
  })

  it('a level-1 full caster (Fighter/Wizard-shaped row): one L1 pool, matching the "level" Rules Engine table key', () => {
    const levels = deriveSpellSlotLevels({
      casterType: 'full',
      tableRows: [{ key: 1, slot_1: 2, slot_2: 0 }],
      characterLevel: 1,
      expendedSlots: {}
    })
    expect(levels).toEqual([{ level: 1, max: 2, expended: 0 }])
  })

  it('reads expended from the stored map, keyed by level as a string', () => {
    const levels = deriveSpellSlotLevels({
      casterType: 'full',
      tableRows: [{ key: 1, slot_1: 1 }],
      characterLevel: 1,
      expendedSlots: { '1': 1 }
    })
    expect(levels).toEqual([{ level: 1, max: 1, expended: 1 }])
  })

  it('a higher-level full caster produces multiple pools, skipping any level with zero max', () => {
    const levels = deriveSpellSlotLevels({
      casterType: 'full',
      tableRows: [{ key: 5, slot_1: 4, slot_2: 3, slot_3: 2, slot_4: 0, slot_5: 0 }],
      characterLevel: 5,
      expendedSlots: { '2': 1 }
    })
    expect(levels).toEqual([
      { level: 1, max: 4, expended: 0 },
      { level: 2, max: 3, expended: 1 },
      { level: 3, max: 2, expended: 0 }
    ])
  })

  it('a Pact caster gets exactly one pool, at the table row\'s own declared slot_level', () => {
    const levels = deriveSpellSlotLevels({
      casterType: 'pact',
      tableRows: [{ key: 3, slot_level: 2, slots: 2 }],
      characterLevel: 3,
      expendedSlots: { '2': 1 }
    })
    expect(levels).toEqual([{ level: 2, max: 2, expended: 1 }])
  })

  it('does not mutate its inputs', () => {
    const expendedSlots = { '1': 1 }
    const tableRows = [{ key: 1, slot_1: 2 }]
    deriveSpellSlotLevels({ casterType: 'full', tableRows, characterLevel: 1, expendedSlots })
    expect(expendedSlots).toEqual({ '1': 1 })
    expect(tableRows).toEqual([{ key: 1, slot_1: 2 }])
  })

  // A2 WORKSTREAM 4 -- THIRD-CASTER SUPPORT. `casterType: 'third'` reuses this SAME generic
  // `slot_1`..`slot_9`-column loop (never the Pact special case) -- no new branch was needed in
  // this function at all, confirmed by these tests passing with zero changes to the function
  // itself. The real table (`table:spellcasting.slots_third`, packages/eldra-dnd5e-2024/
  // definitions.json) is re-derived directly from native XPHB corpus: class-fighter.json's own
  // Eldritch Knight "Spell Slots per Spell Level" `rowsSpellProgression` and class-rogue.json's own
  // identical Arcane Trickster table (both confirmed byte-identical), never a 2014 assumption.
  describe('third caster (Eldritch Knight / Arcane Trickster, re-derived from native XPHB corpus)', () => {
    const REAL_THIRD_CASTER_ROWS = [
      { key: 1, slot_1: 0, slot_2: 0, slot_3: 0, slot_4: 0 },
      { key: 2, slot_1: 0, slot_2: 0, slot_3: 0, slot_4: 0 },
      { key: 3, slot_1: 2, slot_2: 0, slot_3: 0, slot_4: 0 },
      { key: 4, slot_1: 3, slot_2: 0, slot_3: 0, slot_4: 0 },
      { key: 5, slot_1: 3, slot_2: 0, slot_3: 0, slot_4: 0 },
      { key: 6, slot_1: 3, slot_2: 0, slot_3: 0, slot_4: 0 },
      { key: 7, slot_1: 4, slot_2: 2, slot_3: 0, slot_4: 0 },
      { key: 8, slot_1: 4, slot_2: 2, slot_3: 0, slot_4: 0 },
      { key: 9, slot_1: 4, slot_2: 2, slot_3: 0, slot_4: 0 },
      { key: 10, slot_1: 4, slot_2: 3, slot_3: 0, slot_4: 0 },
      { key: 11, slot_1: 4, slot_2: 3, slot_3: 0, slot_4: 0 },
      { key: 12, slot_1: 4, slot_2: 3, slot_3: 0, slot_4: 0 },
      { key: 13, slot_1: 4, slot_2: 3, slot_3: 2, slot_4: 0 },
      { key: 14, slot_1: 4, slot_2: 3, slot_3: 2, slot_4: 0 },
      { key: 15, slot_1: 4, slot_2: 3, slot_3: 2, slot_4: 0 },
      { key: 16, slot_1: 4, slot_2: 3, slot_3: 3, slot_4: 0 },
      { key: 17, slot_1: 4, slot_2: 3, slot_3: 3, slot_4: 0 },
      { key: 18, slot_1: 4, slot_2: 3, slot_3: 3, slot_4: 0 },
      { key: 19, slot_1: 4, slot_2: 3, slot_3: 3, slot_4: 1 },
      { key: 20, slot_1: 4, slot_2: 3, slot_3: 3, slot_4: 1 }
    ]

    it('no premature slots at Levels 1-2 (before the subclass\'s own real Level-3 Spellcasting feature)', () => {
      for (const level of [1, 2]) {
        const row = REAL_THIRD_CASTER_ROWS.find((r) => r.key === level)!
        expect(deriveSpellSlotLevels({ casterType: 'third', tableRows: [row], characterLevel: level, expendedSlots: {} })).toEqual([])
      }
    })

    it('Level 3: exactly two 1st-level slots, the real XPHB minimum for both subclasses', () => {
      const row = REAL_THIRD_CASTER_ROWS.find((r) => r.key === 3)!
      expect(deriveSpellSlotLevels({ casterType: 'third', tableRows: [row], characterLevel: 3, expendedSlots: {} }))
        .toEqual([{ level: 1, max: 2, expended: 0 }])
    })

    it('Level 7: a SECOND spell level unlocks (1st + 2nd), never higher', () => {
      const row = REAL_THIRD_CASTER_ROWS.find((r) => r.key === 7)!
      expect(deriveSpellSlotLevels({ casterType: 'third', tableRows: [row], characterLevel: 7, expendedSlots: {} }))
        .toEqual([{ level: 1, max: 4, expended: 0 }, { level: 2, max: 2, expended: 0 }])
    })

    it('Level 19: the maximum spell level this progression ever reaches is 4th, never higher -- the real "1/3 of a full caster, capped at 4th level" shape', () => {
      const row = REAL_THIRD_CASTER_ROWS.find((r) => r.key === 19)!
      const levels = deriveSpellSlotLevels({ casterType: 'third', tableRows: [row], characterLevel: 19, expendedSlots: {} })
      expect(Math.max(...levels.map((l) => l.level))).toBe(4)
      expect(levels).toEqual([
        { level: 1, max: 4, expended: 0 },
        { level: 2, max: 3, expended: 0 },
        { level: 3, max: 3, expended: 0 },
        { level: 4, max: 1, expended: 0 }
      ])
    })

    it('Level 20: the correct final state, unchanged from Level 19 (the real table\'s own last two rows are identical)', () => {
      const row20 = REAL_THIRD_CASTER_ROWS.find((r) => r.key === 20)!
      const row19 = REAL_THIRD_CASTER_ROWS.find((r) => r.key === 19)!
      expect(deriveSpellSlotLevels({ casterType: 'third', tableRows: [row20], characterLevel: 20, expendedSlots: {} }))
        .toEqual(deriveSpellSlotLevels({ casterType: 'third', tableRows: [row19], characterLevel: 19, expendedSlots: {} }))
    })

    it('a DIRECT level jump (reading straight to Level 13\'s own row) produces the identical result a level-by-level walk would -- the function is pure and stateless, never an incremental accumulator', () => {
      const row13 = REAL_THIRD_CASTER_ROWS.find((r) => r.key === 13)!
      const direct = deriveSpellSlotLevels({ casterType: 'third', tableRows: [row13], characterLevel: 13, expendedSlots: {} })
      const again = deriveSpellSlotLevels({ casterType: 'third', tableRows: [row13], characterLevel: 13, expendedSlots: {} })
      expect(direct).toEqual(again)
      expect(direct).toEqual([
        { level: 1, max: 4, expended: 0 },
        { level: 2, max: 3, expended: 0 },
        { level: 3, max: 2, expended: 0 }
      ])
    })

    it('expended slots are read correctly at every spell level simultaneously, exactly like a full/half caster', () => {
      const row = REAL_THIRD_CASTER_ROWS.find((r) => r.key === 13)!
      const levels = deriveSpellSlotLevels({ casterType: 'third', tableRows: [row], characterLevel: 13, expendedSlots: { '1': 2, '3': 1 } })
      expect(levels).toEqual([
        { level: 1, max: 4, expended: 2 },
        { level: 2, max: 3, expended: 0 },
        { level: 3, max: 2, expended: 1 }
      ])
    })

    it('the REAL registered table:spellcasting.slots_third Definition matches this re-derived corpus table exactly, row for row', () => {
      const definitions = JSON.parse(readFileSync('packages/eldra-dnd5e-2024/definitions.json', 'utf8')) as { id: string, rows?: unknown[] }[]
      const table = definitions.find((d) => d.id === 'table:spellcasting.slots_third')
      expect(table, 'table:spellcasting.slots_third must exist in the authored package').toBeDefined()
      expect(table!.rows).toEqual(REAL_THIRD_CASTER_ROWS)
    })

    it('the REAL registered value:spellcasting.caster_type.third Definition exists, mirroring full/half/pact exactly', () => {
      const definitions = JSON.parse(readFileSync('packages/eldra-dnd5e-2024/definitions.json', 'utf8')) as { id: string, kind: string, valueType?: string }[]
      const value = definitions.find((d) => d.id === 'value:spellcasting.caster_type.third')
      expect(value).toBeDefined()
      expect(value!.kind).toBe('value')
      expect(value!.valueType).toBe('boolean')
    })
  })
})
