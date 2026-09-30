// Unit tests for app/components/characters/characterProgressionChoicePresentation.ts
// -- D&D 2024 Character Rules Phase 2A.1 UX Correction.
//
// Pure module, nothing to mock, no DOM. Proves the generic rendering-mode
// decision and the slot-draft arithmetic CharacterProgressionPanel.vue's
// template/script delegate to, at the smallest testable boundary (this
// repo has no Vue component-render harness -- vitest.config.ts is
// `environment: 'node'` -- so these are the real, direct proof rather than
// a snapshot of rendered HTML).

import { describe, expect, it } from 'vitest'

import {
  applySlotChange,
  draftFromAnswer,
  draftToAnswer,
  isNonDistinctMultiSelect
} from '../../../app/components/characters/characterProgressionChoicePresentation'

describe('isNonDistinctMultiSelect', () => {
  // TESTING -- PRESENTATION #1: count 1 remains single-select behavior,
  // regardless of `distinct` -- "the same option twice" has no meaning
  // when only one pick is ever required. Covers Skill Expertise, Subclass,
  // and Feat Selection alike (#8/#9/#10 below): all three are `count: 1`
  // in the real authored corpus, so this one generic rule already keeps
  // every one of them on the unchanged radio/content-select path with no
  // per-choice knowledge.
  it('is false for count: 1, whatever `distinct` is', () => {
    expect(isNonDistinctMultiSelect({ count: 1, distinct: false })).toBe(false)
    expect(isNonDistinctMultiSelect({ count: 1, distinct: true })).toBe(false)
    expect(isNonDistinctMultiSelect({ count: 1 })).toBe(false)
  })

  // TESTING -- PRESENTATION #2: count > 1 with `distinct` omitted or
  // `true` (every choice authored before this phase, and every OTHER
  // choice authored since -- e.g. `choice:skill.proficiency`) stays on the
  // EXISTING checkbox-list path, unchanged. Proves the new rendering mode
  // is a real opt-in, never a global replacement of the checkbox UI.
  it('is false for count > 1 with distinct omitted or true -- preserves the existing checkbox path', () => {
    expect(isNonDistinctMultiSelect({ count: 2 })).toBe(false)
    expect(isNonDistinctMultiSelect({ count: 2, distinct: true })).toBe(false)
    expect(isNonDistinctMultiSelect({ count: 4 })).toBe(false)
  })

  it('is true only for count > 1 AND distinct: false', () => {
    expect(isNonDistinctMultiSelect({ count: 2, distinct: false })).toBe(true)
    expect(isNonDistinctMultiSelect({ count: 3, distinct: false })).toBe(true)
  })
})

describe('draftFromAnswer', () => {
  it('pads a shorter (or empty) answer with blanks up to count', () => {
    expect(draftFromAnswer([], 2)).toEqual(['', ''])
    expect(draftFromAnswer(['int'], 2)).toEqual(['int', ''])
  })

  it('reads a complete answer positionally, including a duplicate', () => {
    expect(draftFromAnswer(['int', 'int'], 2)).toEqual(['int', 'int'])
    expect(draftFromAnswer(['int', 'wis'], 2)).toEqual(['int', 'wis'])
  })

  it('truncates an answer longer than count rather than overflowing the draft', () => {
    expect(draftFromAnswer(['int', 'wis', 'cha'], 2)).toEqual(['int', 'wis'])
  })
})

describe('applySlotChange + draftToAnswer -- the full slot-edit round trip', () => {
  // TESTING -- PRESENTATION #3: count 2 + distinct false can represent
  // [INT, INT] -- the +2-to-one-ability shape, unreachable through the
  // pre-existing checkbox toggle (checking a box twice is impossible).
  it('setting both slots to the SAME value produces a duplicate-occurrence answer', () => {
    let draft = draftFromAnswer([], 2)
    draft = applySlotChange(draft, 0, 'int')
    draft = applySlotChange(draft, 1, 'int')
    expect(draftToAnswer(draft)).toEqual(['int', 'int'])
  })

  // TESTING -- PRESENTATION #4: count 2 + distinct false can represent
  // [INT, WIS] -- the +1/+1-to-two-abilities shape.
  it('setting two slots to DIFFERENT values produces a two-distinct-value answer', () => {
    let draft = draftFromAnswer([], 2)
    draft = applySlotChange(draft, 0, 'int')
    draft = applySlotChange(draft, 1, 'wis')
    expect(draftToAnswer(draft)).toEqual(['int', 'wis'])
  })

  // TESTING -- PRESENTATION #5/#6: changing one slot must never disturb
  // the other -- proven both directions, including the out-of-order case
  // (filling slot 2 before slot 1) that a naive "re-derive slots from the
  // filtered emitted answer" implementation would silently mis-position --
  // see this module's own "WHY A DRAFT ARRAY" header for why the draft is
  // kept separate from the emitted answer specifically to avoid this.
  it('replacing slot 1 preserves slot 2', () => {
    let draft = draftFromAnswer([], 2)
    draft = applySlotChange(draft, 0, 'int')
    draft = applySlotChange(draft, 1, 'wis')
    expect(draftToAnswer(draft)).toEqual(['int', 'wis'])

    draft = applySlotChange(draft, 0, 'cha')
    expect(draftToAnswer(draft)).toEqual(['cha', 'wis'])
  })

  it('replacing slot 2 preserves slot 1', () => {
    let draft = draftFromAnswer([], 2)
    draft = applySlotChange(draft, 0, 'int')
    draft = applySlotChange(draft, 1, 'wis')
    expect(draftToAnswer(draft)).toEqual(['int', 'wis'])

    draft = applySlotChange(draft, 1, 'dex')
    expect(draftToAnswer(draft)).toEqual(['int', 'dex'])
  })

  it('filling slot 2 BEFORE slot 1 still positions each value correctly once slot 1 is filled', () => {
    let draft = draftFromAnswer([], 2)
    draft = applySlotChange(draft, 1, 'wis')
    expect(draftToAnswer(draft)).toEqual(['wis']) // slot 1 still blank, omitted

    draft = applySlotChange(draft, 0, 'int')
    expect(draftToAnswer(draft)).toEqual(['int', 'wis']) // never ['wis', 'int'] or a dropped value
  })

  // TESTING -- PRESENTATION #7: incomplete slot state does not become a
  // valid COMPLETE answer -- a still-blank slot is dropped from the
  // emitted array entirely (never submitted as an empty-string member),
  // so the result is SHORTER than `count`, the same shape server-side
  // `validateChoiceSelection` already reads as "not yet answered" (a
  // count mismatch) for every other choice in this codebase. Mirrors the
  // EXISTING checkbox path's own "always emit the current real state, let
  // count-validation decide answered-ness" convention -- no new policy
  // invented for this choice shape.
  it('a still-blank slot is omitted from the emitted answer, never submitted as an empty value', () => {
    const draft = applySlotChange(draftFromAnswer([], 2), 0, 'int')
    const answer = draftToAnswer(draft)
    expect(answer).toEqual(['int'])
    expect(answer).toHaveLength(1) // not 2 -- no placeholder for the unset slot
  })

  it('clearing a slot back to blank removes it from the emitted answer again', () => {
    let draft = draftFromAnswer([], 2)
    draft = applySlotChange(draft, 0, 'int')
    draft = applySlotChange(draft, 1, 'wis')
    draft = applySlotChange(draft, 1, '')
    expect(draftToAnswer(draft)).toEqual(['int'])
  })

  it('an out-of-range slot index is a no-op, never throws or corrupts the draft', () => {
    const draft = draftFromAnswer(['int', 'wis'], 2)
    expect(applySlotChange(draft, 5, 'cha')).toEqual(['int', 'wis'])
    expect(applySlotChange(draft, -1, 'cha')).toEqual(['int', 'wis'])
  })
})
