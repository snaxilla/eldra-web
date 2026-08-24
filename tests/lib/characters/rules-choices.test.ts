// Unit tests for app/lib/characters/rules-choices.ts -- the player's side of
// a ChoiceSet.
//
// Pure module, so there is nothing to mock. These cover the rules that
// decide whether an answer counts, because three separate surfaces (the
// Builder's enabled button, the save routes' 400, and the bridge's decision
// to apply an answer at all) depend on them agreeing.

import { describe, expect, it } from 'vitest'

import {
  choiceKey,
  emptyStoredRulesChoices,
  isChoiceAnswered,
  normalizeStoredRulesChoices,
  resolveChoiceTarget,
  selectionsFor,
  toResolvableChoice,
  validateChoiceSelection,
  type ResolvableChoice
} from '../../../app/lib/characters/rules-choices'

const FIGHTER_SKILLS = [
  'value:skill.athletics.proficient',
  'value:skill.perception.proficient',
  'value:skill.survival.proficient'
]

function choice(overrides: Partial<ResolvableChoice> = {}): ResolvableChoice {
  return {
    key: 'class:choice:skill.proficiency',
    slot: 'class',
    choiceSetId: 'choice:skill.proficiency',
    count: 2,
    options: FIGHTER_SKILLS,
    ...overrides
  }
}

describe('choice identity', () => {
  it('keys an answer by slot AND ChoiceSet, so one ChoiceSet asked twice is two questions', () => {
    // A Human's Species facet and a Fighter's Class facet both reference
    // choice:skill.proficiency. They are separate questions.
    expect(choiceKey('species', 'choice:skill.proficiency'))
      .not.toBe(choiceKey('class', 'choice:skill.proficiency'))
  })

  it('takes count and options from the FACET, not the ChoiceSet', () => {
    // The package declares count: 0 precisely because the content supplies it.
    expect(toResolvableChoice('class', {
      choiceSet: 'choice:skill.proficiency',
      count: 2,
      from: FIGHTER_SKILLS
    })).toEqual({
      key: 'class:choice:skill.proficiency',
      slot: 'class',
      choiceSetId: 'choice:skill.proficiency',
      count: 2,
      options: FIGHTER_SKILLS
    })
  })

  it('copies the option list rather than aliasing the facet\'s own array', () => {
    const from = [...FIGHTER_SKILLS]
    const resolvable = toResolvableChoice('class', { choiceSet: 'c', count: 1, from })
    resolvable.options.push('value:skill.arcana.proficient')
    expect(from).toEqual(FIGHTER_SKILLS)
  })

  it('treats a facet with no option list as offering nothing', () => {
    expect(toResolvableChoice('class', { choiceSet: 'c', count: 0 }).options).toEqual([])
  })
})

describe('validateChoiceSelection', () => {
  it('accepts exactly the required number of offered options', () => {
    const result = validateChoiceSelection(choice(), [FIGHTER_SKILLS[0], FIGHTER_SKILLS[1]])
    expect(result).toEqual({ ok: true, selected: [FIGHTER_SKILLS[0], FIGHTER_SKILLS[1]] })
  })

  it('rejects too few -- a half-answered choice is still outstanding', () => {
    const result = validateChoiceSelection(choice(), [FIGHTER_SKILLS[0]])
    expect(result.ok).toBe(false)
    expect((result as any).reason).toMatch(/exactly 2/)
  })

  it('rejects too many', () => {
    expect(validateChoiceSelection(choice(), FIGHTER_SKILLS).ok).toBe(false)
  })

  it('rejects an option that was never offered', () => {
    // Arcana is not on the Fighter's list. Rejected, never silently dropped.
    const result = validateChoiceSelection(choice(), [FIGHTER_SKILLS[0], 'value:skill.arcana.proficient'])
    expect(result.ok).toBe(false)
    expect((result as any).reason).toMatch(/not one of the offered options/)
  })

  it('rejects the same option twice', () => {
    const result = validateChoiceSelection(choice(), [FIGHTER_SKILLS[0], FIGHTER_SKILLS[0]])
    expect(result.ok).toBe(false)
    expect((result as any).reason).toMatch(/more than once/)
  })

  it('rejects a non-list and non-string members', () => {
    expect(validateChoiceSelection(choice(), 'athletics').ok).toBe(false)
    expect(validateChoiceSelection(choice(), null).ok).toBe(false)
    expect(validateChoiceSelection(choice(), [FIGHTER_SKILLS[0], 42]).ok).toBe(false)
  })

  it('treats a zero-count choice as answered by an empty list', () => {
    expect(validateChoiceSelection(choice({ count: 0, options: [] }), []).ok).toBe(true)
  })
})

describe('isChoiceAnswered', () => {
  const key = 'class:choice:skill.proficiency'

  it('is false with nothing stored', () => {
    expect(isChoiceAnswered(choice(), null)).toBe(false)
    expect(isChoiceAnswered(choice(), emptyStoredRulesChoices())).toBe(false)
  })

  it('is false when the stored answer is incomplete', () => {
    expect(isChoiceAnswered(choice(), { selections: { [key]: [FIGHTER_SKILLS[0]] } })).toBe(false)
  })

  it('is true only when the stored answer validly answers THIS question', () => {
    expect(isChoiceAnswered(choice(), {
      selections: { [key]: [FIGHTER_SKILLS[0], FIGHTER_SKILLS[1]] }
    })).toBe(true)
  })

  it('is false when the stored answer no longer fits a changed question', () => {
    // The player answered as a Fighter, then switched to a class that does
    // not offer Athletics. The stored answer is not partially applied.
    const stored = { selections: { [key]: [FIGHTER_SKILLS[0], FIGHTER_SKILLS[1]] } }
    const wizardish = choice({ options: ['value:skill.arcana.proficient', 'value:skill.history.proficient'] })
    expect(isChoiceAnswered(wizardish, stored)).toBe(false)
  })
})

describe('normalizeStoredRulesChoices', () => {
  it('reads a well-formed record', () => {
    expect(normalizeStoredRulesChoices({ selections: { 'class:c': ['a', 'b'] } }))
      .toEqual({ selections: { 'class:c': ['a', 'b'] } })
  })

  it('returns null for anything that is not a selections map', () => {
    for (const bad of [null, undefined, 42, 'x', [], {}, { selections: [] }, { selections: 'x' }]) {
      expect(normalizeStoredRulesChoices(bad)).toBeNull()
    }
  })

  it('returns null when a selection list holds a non-string', () => {
    expect(normalizeStoredRulesChoices({ selections: { k: ['a', 7] } })).toBeNull()
    expect(normalizeStoredRulesChoices({ selections: { k: 'a' } })).toBeNull()
  })

  it('drops a duplicate rather than failing the whole record', () => {
    expect(normalizeStoredRulesChoices({ selections: { k: ['a', 'a', 'b'] } }))
      .toEqual({ selections: { k: ['a', 'b'] } })
  })

  it('validates STRUCTURE only -- fit against a question is decided later', () => {
    // An id no facet offers still READS fine; the bridge rejects it against
    // the current facet, because a repin can invalidate a stored answer with
    // nothing having edited it.
    expect(normalizeStoredRulesChoices({ selections: { k: ['value:nonsense'] } }))
      .toEqual({ selections: { k: ['value:nonsense'] } })
  })

  it('selectionsFor is empty rather than undefined for an unanswered key', () => {
    expect(selectionsFor(null, 'k')).toEqual([])
    expect(selectionsFor({ selections: {} }, 'k')).toEqual([])
  })
})

describe('resolveChoiceTarget', () => {
  const TEMPLATE = 'value:skill.{selected}.proficient'

  it('substitutes a bare token', () => {
    expect(resolveChoiceTarget(TEMPLATE, 'athletics')).toBe('value:skill.athletics.proficient')
  })

  it('leaves an option that is already a full target unchanged', () => {
    // What the authored corpus actually produces: a facet's `from` is
    // typed DefinitionId[], so options arrive whole.
    expect(resolveChoiceTarget(TEMPLATE, 'value:skill.athletics.proficient'))
      .toBe('value:skill.athletics.proficient')
  })

  it('never double-wraps', () => {
    const once = resolveChoiceTarget(TEMPLATE, 'athletics')
    expect(resolveChoiceTarget(TEMPLATE, once)).toBe(once)
  })

  it('returns a template with no placeholder unchanged', () => {
    expect(resolveChoiceTarget('value:fixed.target', 'anything')).toBe('value:fixed.target')
  })
})
