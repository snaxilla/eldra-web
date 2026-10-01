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
  isNonDistinctMultiSelect,
  reconcileSlotDrafts,
  type PresentableProgressionChoiceForReconciliation
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

// D&D 2024 Character Rules Phase 2A.1 UX Correction (round 2) --
// RECONCILIATION, the fix for the real browser defect: a still-incomplete
// slot draft was being wiped on every re-preview because the server only
// ever echoes a COMPLETE answer back (verified directly against
// character-derived.ts's own `validateChoiceSelection`-gated echo -- see
// reconcileSlotDrafts's own header). These tests prove the generic
// "preserve an existing draft; seed a new one; drop a removed one" rule
// that replaces re-seeding from `choice.selected` on every plan.
describe('reconcileSlotDrafts', () => {
  function choice(overrides: Partial<PresentableProgressionChoiceForReconciliation> = {}): PresentableProgressionChoiceForReconciliation {
    return { id: 'class:progression:4:choice:feat.asi-ability-increase', count: 2, distinct: false, selected: [], ...overrides }
  }

  // TESTING -- SLOT DRAFT RECONCILIATION #6: initial non-distinct choice
  // creates a blank slot draft.
  it('a choice with no existing draft and no server answer seeds blank slots', () => {
    const result = reconcileSlotDrafts({}, [choice()])
    expect(result).toEqual({ [choice().id]: ['', ''] })
  })

  // TESTING -- SLOT DRAFT RECONCILIATION #7/#8: a partial local draft
  // survives an equivalent-plan replacement UNCHANGED, in BOTH slot
  // positions -- the server's own `selected: []` echo (an incomplete
  // answer is never echoed, see this describe's own header) must never
  // overwrite it.
  it('partial [INT, blank] survives reconciliation even though the server echoes selected: []', () => {
    const id = choice().id
    const existing = { [id]: ['int', ''] }
    const result = reconcileSlotDrafts(existing, [choice({ selected: [] })])
    expect(result).toEqual({ [id]: ['int', ''] })
  })

  it('partial [blank, INT] survives reconciliation WITHOUT moving INT to slot 1', () => {
    const id = choice().id
    const existing = { [id]: ['', 'int'] }
    const result = reconcileSlotDrafts(existing, [choice({ selected: [] })])
    expect(result).toEqual({ [id]: ['', 'int'] })
  })

  // TESTING -- SLOT DRAFT RECONCILIATION #9/#10: a complete draft survives
  // plan replacement too (not just partial ones).
  it('complete [INT, INT] survives reconciliation', () => {
    const id = choice().id
    const existing = { [id]: ['int', 'int'] }
    // A complete answer IS echoed by the server, per the module's own
    // header -- reconciliation preserves the EXISTING draft regardless,
    // never re-deriving it from the echo on every pass.
    const result = reconcileSlotDrafts(existing, [choice({ selected: ['int', 'int'] })])
    expect(result).toEqual({ [id]: ['int', 'int'] })
  })

  it('complete [INT, WIS] survives reconciliation', () => {
    const id = choice().id
    const existing = { [id]: ['int', 'wis'] }
    const result = reconcileSlotDrafts(existing, [choice({ selected: ['int', 'wis'] })])
    expect(result).toEqual({ [id]: ['int', 'wis'] })
  })

  // TESTING -- SLOT DRAFT RECONCILIATION #11: a choice no longer present
  // in the new plan has its draft discarded entirely (also covers #14's
  // "unrelated plan/target reset" -- a different target level's plan
  // simply omits the old choice ids, and they are dropped the same way).
  it('a draft for a choice absent from the new plan is dropped', () => {
    const existing = { 'some-other-choice-id': ['int', 'wis'] }
    const result = reconcileSlotDrafts(existing, [choice({ id: 'a-different-choice-id' })])
    expect(result).toEqual({ 'a-different-choice-id': ['', ''] })
    expect(result['some-other-choice-id']).toBeUndefined()
  })

  // TESTING -- SLOT DRAFT RECONCILIATION #12: a newly-appearing choice
  // (e.g. the nested ability-distribution choice that only exists once a
  // repeatable feat is selected) is seeded correctly the first time it is
  // seen, alongside an already-tracked, unrelated choice.
  it('a newly-appearing choice is seeded correctly while an existing draft is preserved', () => {
    const existingId = 'class:progression:4:choice:feat.asi-ability-increase'
    const newId = 'class:progression:8:choice:feat.asi-ability-increase'
    const existing = { [existingId]: ['int', 'wis'] }

    const result = reconcileSlotDrafts(existing, [
      choice({ id: existingId, selected: ['int', 'wis'] }),
      choice({ id: newId, selected: [] })
    ])

    expect(result).toEqual({
      [existingId]: ['int', 'wis'],
      [newId]: ['', '']
    })
  })

  // TESTING -- SLOT DRAFT RECONCILIATION #13: a server-provided COMPLETE
  // answer can seed a fresh draft (no existing local draft yet) -- e.g.
  // revisiting an already-confirmed level's own choice.
  it('seeds a fresh draft from a server-provided complete answer when no local draft exists yet', () => {
    const result = reconcileSlotDrafts({}, [choice({ selected: ['int', 'int'] })])
    expect(result).toEqual({ [choice().id]: ['int', 'int'] })
  })

  // Distinct (checkbox) and single-select (radio) choices are never
  // tracked as slot drafts at all -- `isNonDistinctMultiSelect` gates
  // entry into the result entirely, so this reconciliation rule cannot
  // regress Expertise/Subclass/Feat Selection (#15/#16/#17), which remain
  // fully props-driven exactly as before.
  it('ignores count: 1 and distinct (checkbox) choices entirely -- no draft tracked for either', () => {
    const result = reconcileSlotDrafts(
      { 'stale-leftover': ['int', 'wis'] },
      [
        choice({ id: 'single-select', count: 1, distinct: undefined, selected: ['opt-a'] }),
        choice({ id: 'distinct-checkbox', count: 2, distinct: true, selected: ['opt-a'] })
      ]
    )
    expect(result).toEqual({})
  })
})
