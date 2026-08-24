// Unit tests for app/lib/characters/character-notes.ts -- the pure model
// behind the second V1 feature migrated onto the new Character Architecture.
//
// Pure module, nothing to mock. Notes are the simplest member of the
// app/lib/characters family: no bounds, no references, no resolution -- so
// these tests are mostly about the envelope (well-formed vs not) and about
// the record staying fixed-shape (six fields, always present).

import { describe, expect, it } from 'vitest'

import {
  CHARACTER_NOTE_FIELDS,
  CHARACTER_NOTE_FIELD_LABELS,
  CHARACTER_NOTE_FIELD_PLACEHOLDERS,
  emptyCharacterNotes,
  isCharacterNotesEmpty,
  normalizeStoredCharacterNotes
} from '../../../app/lib/characters/character-notes'

describe('the fixed field set', () => {
  it('is exactly six named fields', () => {
    expect(CHARACTER_NOTE_FIELDS).toEqual([
      'general', 'appearance', 'personality', 'backstory', 'goals', 'secrets'
    ])
  })

  it('every field has a label and a placeholder', () => {
    for (const field of CHARACTER_NOTE_FIELDS) {
      expect(CHARACTER_NOTE_FIELD_LABELS[field]).toBeTruthy()
      expect(CHARACTER_NOTE_FIELD_PLACEHOLDERS[field]).toBeTruthy()
    }
  })
})

describe('emptyCharacterNotes', () => {
  it('is every field present and blank', () => {
    const empty = emptyCharacterNotes()
    expect(Object.keys(empty).sort()).toEqual([...CHARACTER_NOTE_FIELDS].sort())
    for (const field of CHARACTER_NOTE_FIELDS) expect(empty[field]).toBe('')
  })
})

describe('isCharacterNotesEmpty', () => {
  it('is true for an all-blank record', () => {
    expect(isCharacterNotesEmpty(emptyCharacterNotes())).toBe(true)
  })

  it('is true for whitespace-only fields', () => {
    expect(isCharacterNotesEmpty({ ...emptyCharacterNotes(), general: '   \n  ' })).toBe(true)
  })

  it('is false when any one field has content', () => {
    expect(isCharacterNotesEmpty({ ...emptyCharacterNotes(), secrets: 'A secret.' })).toBe(false)
  })
})

describe('normalizeStoredCharacterNotes', () => {
  it('reads a well-formed record', () => {
    const stored = {
      general: 'Reminder text',
      appearance: 'Tall',
      personality: 'Blunt',
      backstory: 'Grew up in a port town',
      goals: 'Find the sword',
      secrets: 'Is actually a spy'
    }
    expect(normalizeStoredCharacterNotes(stored)).toEqual(stored)
  })

  it('returns null for anything that is not an object envelope', () => {
    for (const bad of [null, undefined, 42, 'x', []]) {
      expect(normalizeStoredCharacterNotes(bad)).toBeNull()
    }
  })

  it('an empty object is a legal envelope -- every field just reads as blank', () => {
    expect(normalizeStoredCharacterNotes({})).toEqual(emptyCharacterNotes())
  })

  it('coerces a non-string field to blank rather than rejecting the record', () => {
    // Losing one bad field is strictly better than losing the other five --
    // unlike ability scores, no field here is depended on being well-formed.
    const stored = normalizeStoredCharacterNotes({ general: 42, appearance: 'Tall', secrets: null })
    expect(stored?.general).toBe('')
    expect(stored?.appearance).toBe('Tall')
    expect(stored?.secrets).toBe('')
  })

  it('ignores unknown keys rather than storing them', () => {
    const stored = normalizeStoredCharacterNotes({ general: 'x', notAField: 'y' })
    expect(stored).not.toHaveProperty('notAField')
  })

  it('accepts an empty string as valid content, not as absence', () => {
    expect(normalizeStoredCharacterNotes({ general: '' })?.general).toBe('')
  })

  it('preserves whitespace and line breaks verbatim -- no trimming, no reformatting', () => {
    const stored = normalizeStoredCharacterNotes({ backstory: '  Line one\nLine two  ' })
    expect(stored?.backstory).toBe('  Line one\nLine two  ')
  })

  it('round-trips a full record unchanged', () => {
    const built = {
      general: 'a', appearance: 'b', personality: 'c', backstory: 'd', goals: 'e', secrets: 'f'
    }
    expect(normalizeStoredCharacterNotes(normalizeStoredCharacterNotes(built))).toEqual(built)
  })
})

describe('nothing here computes a rules consequence', () => {
  it('every field is a plain string -- no reference, no id, no derived value', () => {
    const notes = normalizeStoredCharacterNotes({ general: 'x' })!
    for (const field of CHARACTER_NOTE_FIELDS) {
      expect(typeof notes[field]).toBe('string')
    }
  })
})
