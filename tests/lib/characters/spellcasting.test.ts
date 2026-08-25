// Unit tests for app/lib/characters/spellcasting.ts -- the pure
// Spellcasting model behind the Spellcasting System's stored half.
//
// Pure module, nothing to mock. Mirrors inventory.test.ts and
// health.test.ts's own coverage shape: a stored record is re-validated
// rather than trusted, and every mutation is a total, non-mutating
// function.

import { describe, expect, it } from 'vitest'

import {
  addSpell,
  emptyCharacterSpellcasting,
  expendSlot,
  isValidSlotLevel,
  nextInstanceId,
  normalizeStoredSpellcasting,
  removeSpell,
  resetAllSlots,
  restoreSlot,
  toggleSpellFlag,
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
