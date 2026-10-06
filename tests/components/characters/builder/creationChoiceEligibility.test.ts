// Tests for app/lib/characters/creation-choice-eligibility.ts and the Builder
// draft wiring in characterBuilderSelection.ts -- the ONE rule the V2 Builder
// presents and the save route enforces.
//
// Real content is used for the case that failed in the browser (Sage grants
// Arcana + History; Wizard offers skill proficiency). Synthetic facets are
// used ONLY to prove the mechanism is slot-agnostic (species or class granting
// what another slot offers) -- they never stand in for production behavior, and
// nothing in production branches on Sage, Wizard, or any skill name.

import { describe, expect, it, vi } from 'vitest'

// UNIT-ISOLATION (classified in tests/rules/completeness-stub-policy.test.ts): this file asserts MECHANICS
// only. The completeness authority is replaced by the explicit stub in tests/helpers/completeness-stub.ts, so it
// makes no claim that a real PHB character can be created or progressed.
vi.mock('../../../../app/lib/content-rules/creation-completeness', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../app/lib/content-rules/creation-completeness')>()),
  ...(await import('../../../helpers/completeness-stub')).MECHANICS_ONLY_COMPLETENESS
}))
import {
  ALREADY_ACQUIRED_REASON,
  directlyGrantedValues,
  nextSelectionAfterToggle,
  resolveCreationChoices,
  type CreationSlotInput
} from '../../../../app/lib/characters/creation-choice-eligibility'
import { findRulesFacet } from '../../../../app/lib/content-rules'
import {
  creationChoicePresentation,
  declaredChoices,
  emptyDraft,
  isProficiencyStepComplete,
  missingRequirements,
  pruneChoices,
  setChoiceSelections,
  type BuilderCatalogueEntry,
  type CharacterBuilderDraft
} from '../../../../app/components/characters/builder/characterBuilderSelection'

const ARCANA = 'value:skill.arcana.proficient'
const HISTORY = 'value:skill.history.proficient'
const INSIGHT = 'value:skill.insight.proficient'
const NATURE = 'value:skill.nature.proficient'
const CLASS_KEY = 'class:choice:skill.proficiency'

function sageFacet() {
  return findRulesFacet('dnd5e.2024', 'background', 'sage-xphb') ?? undefined
}

function wizardFacet() {
  return findRulesFacet('dnd5e.2024', 'class', 'wizard-xphb') ?? undefined
}

function entryFor(title: string, slug: string, rulesFacet: unknown): BuilderCatalogueEntry {
  return {
    packageId: 'eldra.content.xphb',
    packageVersion: '1.0.0',
    systemKey: 'dnd5e',
    title,
    slug,
    externalId: `${title}__XPHB`,
    provider: '5etools-json',
    rulesFacet
  } as unknown as BuilderCatalogueEntry
}

function realDraft(overrides: Partial<CharacterBuilderDraft> = {}): CharacterBuilderDraft {
  return {
    ...emptyDraft(),
    species: entryFor('Gnome', 'gnome-xphb', undefined),
    class: entryFor('Wizard', 'wizard-xphb', wizardFacet()),
    background: entryFor('Sage', 'sage-xphb', sageFacet()),
    ...overrides
  }
}

function wizardPresentation(draft: CharacterBuilderDraft) {
  const found = creationChoicePresentation(draft).find((presentation) => presentation.key === CLASS_KEY)
  if (!found) throw new Error('Wizard skill-proficiency presentation missing')
  return found
}

function availability(presentation: { offered: { value: string; eligible: boolean; reason?: string }[] }, value: string) {
  return presentation.offered.find((option) => option.value === value)
}

describe('direct grants -- unconditional facts, read from every selected slot', () => {
  it('collects only grants whose value is true (a grant is never a choice)', () => {
    const granted = directlyGrantedValues([
      { slot: 'background', facet: { grants: [{ set: ARCANA, to: true }, { set: 'value:save.str.proficient', to: false }] } }
    ])
    expect(granted.has(ARCANA)).toBe(true)
    expect(granted.has('value:save.str.proficient')).toBe(false)
  })
})

describe('the real case -- Gnome + Wizard + Sage', () => {
  // 1 + 2: Background's direct grant disables the matching Class option, and
  // BOTH granted skills (Arcana AND History) are disabled.
  it('Sage grants Arcana and History -- both are disabled in Wizard\'s skill choice, with the truthful reason', () => {
    const presentation = wizardPresentation(realDraft())

    expect(availability(presentation, ARCANA)).toMatchObject({ eligible: false, reason: ALREADY_ACQUIRED_REASON })
    expect(availability(presentation, HISTORY)).toMatchObject({ eligible: false, reason: ALREADY_ACQUIRED_REASON })
  })

  // 3: unrelated Wizard skills remain selectable.
  it('unrelated Wizard skills remain eligible and carry no reason', () => {
    const presentation = wizardPresentation(realDraft())

    expect(availability(presentation, INSIGHT)).toEqual({ value: INSIGHT, eligible: true })
    expect(availability(presentation, NATURE)).toEqual({ value: NATURE, eligible: true })
  })

  // 14: a choice's own declaration never disables it -- the whole offered list
  // is still offered, and only actually-granted values are unavailable.
  it('keeps every declared option visible -- offered is not owned', () => {
    const presentation = wizardPresentation(realDraft())
    const offeredValues = presentation.offered.map((option) => option.value)

    expect(offeredValues).toEqual(expect.arrayContaining([ARCANA, HISTORY, INSIGHT, NATURE]))
    expect(presentation.offered.filter((option) => option.eligible).length).toBe(presentation.offered.length - 2)
  })

  // 7: changing Background recomputes eligibility from the same draft.
  it('switching Background away from Sage makes Arcana and History eligible again', () => {
    const withoutSage = realDraft({ background: entryFor('Acolyte', 'acolyte-xphb', undefined) })
    const presentation = wizardPresentation(withoutSage)

    expect(availability(presentation, ARCANA)).toEqual({ value: ARCANA, eligible: true })
    expect(availability(presentation, HISTORY)).toEqual({ value: HISTORY, eligible: true })
  })

  it('switching back to Sage disables them again', () => {
    const draft = realDraft({ background: entryFor('Acolyte', 'acolyte-xphb', undefined) })
    draft.background = entryFor('Sage', 'sage-xphb', sageFacet())

    expect(availability(wizardPresentation(draft), ARCANA)).toMatchObject({ eligible: false })
  })
})

describe('slot-agnostic direct grants -- synthetic facets, mechanism only', () => {
  const offeredByClass = { choiceSet: 'choice:skill.proficiency', count: 1, from: [ARCANA, INSIGHT] }

  it('a SPECIES direct grant affects a CLASS choice equivalently', () => {
    const slots: CreationSlotInput[] = [
      { slot: 'species', facet: { grants: [{ set: ARCANA, to: true }] } },
      { slot: 'class', facet: { choices: [offeredByClass] } }
    ]
    const [choice] = resolveCreationChoices(slots, {})
    expect(choice!.offered.find((option) => option.value === ARCANA)).toMatchObject({ eligible: false })
  })

  it('a CLASS direct grant affects a BACKGROUND choice equivalently', () => {
    const slots: CreationSlotInput[] = [
      { slot: 'class', facet: { grants: [{ set: INSIGHT, to: true }] } },
      { slot: 'background', facet: { choices: [{ choiceSet: 'choice:skill.proficiency', count: 1, from: [INSIGHT, NATURE] }] } }
    ]
    const [choice] = resolveCreationChoices(slots, {})
    expect(choice!.offered.find((option) => option.value === INSIGHT)).toMatchObject({ eligible: false })
    expect(choice!.offered.find((option) => option.value === NATURE)).toMatchObject({ eligible: true })
  })

  // 6: slot order does not affect eligibility of the GRANTED values. The grant
  // is visible whether its slot comes before or after the choice.
  it('slot order does not change which options a direct grant disables', () => {
    const grantFirst: CreationSlotInput[] = [
      { slot: 'background', facet: { grants: [{ set: ARCANA, to: true }] } },
      { slot: 'class', facet: { choices: [offeredByClass] } }
    ]
    const choiceFirst: CreationSlotInput[] = [
      { slot: 'class', facet: { choices: [offeredByClass] } },
      { slot: 'background', facet: { grants: [{ set: ARCANA, to: true }] } }
    ]

    const eligibleIn = (slots: CreationSlotInput[]) => {
      const presentation = resolveCreationChoices(slots, {}).find((choice) => choice.slot === 'class')!
      return presentation.offered.map((option) => `${option.value}:${option.eligible}`)
    }

    expect(eligibleIn(choiceFirst)).toEqual(eligibleIn(grantFirst))
  })

  // 9 + 10: a stale or illegal answer never counts toward the requirement.
  it('an answer that a grant has made illegal is dropped from the effective selection and does not satisfy the count', () => {
    const slots: CreationSlotInput[] = [
      { slot: 'background', facet: { grants: [{ set: ARCANA, to: true }] } },
      { slot: 'class', facet: { choices: [offeredByClass] } }
    ]
    const [choice] = resolveCreationChoices(slots, { 'class:choice:skill.proficiency': [ARCANA] })

    expect(choice!.selected).toEqual([])
    expect(choice!.answered).toBe(false)
  })
})

describe('the Builder draft -- interactive, never silently illegal', () => {
  // 8: an ineligible checkbox cannot be added to the selection.
  it('clicking an unavailable option leaves the selection unchanged', () => {
    const presentation = wizardPresentation(realDraft())
    expect(nextSelectionAfterToggle(presentation, ARCANA)).toEqual([])
  })

  it('clicking a legal option adds it, up to the required count', () => {
    const presentation = wizardPresentation(realDraft())
    const afterFirst = nextSelectionAfterToggle(presentation, INSIGHT)
    expect(afterFirst).toEqual([INSIGHT])

    const afterSecond = nextSelectionAfterToggle({ ...presentation, selected: afterFirst }, NATURE)
    expect(afterSecond).toEqual([INSIGHT, NATURE])

    // The third click past the count is ignored, never a third pick.
    expect(nextSelectionAfterToggle({ ...presentation, selected: afterSecond }, 'value:skill.perception.proficient')).toEqual([INSIGHT, NATURE])
  })

  it('unticking a picked option removes it', () => {
    const presentation = { ...wizardPresentation(realDraft()), selected: [INSIGHT] }
    expect(nextSelectionAfterToggle(presentation, INSIGHT)).toEqual([])
  })

  // 9: a tentative answer made illegal by a later change is REMOVED from the
  // draft, not merely hidden, so it can never be submitted.
  it('switching Background to Sage removes a previously-picked, now-illegal Arcana from the draft', () => {
    const draft = realDraft({ background: entryFor('Acolyte', 'acolyte-xphb', undefined) })
    setChoiceSelections(draft, CLASS_KEY, [ARCANA, INSIGHT])
    expect(draft.choices.selections[CLASS_KEY]).toEqual([ARCANA, INSIGHT])

    draft.background = entryFor('Sage', 'sage-xphb', sageFacet())
    pruneChoices(draft)

    expect(draft.choices.selections[CLASS_KEY]).toEqual([INSIGHT])
  })

  // 10: counts and completeness use only eligible answers.
  it('a selection made only of unavailable options does not complete the proficiency step', () => {
    const draft = realDraft()
    draft.choices.selections[CLASS_KEY] = [ARCANA, HISTORY]
    pruneChoices(draft)

    expect(isProficiencyStepComplete(draft)).toBe(false)
    expect(draft.choices.selections[CLASS_KEY]).toEqual([])
    expect(missingRequirements(draft).some((line) => line.includes('Class'))).toBe(true)
  })

  it('two legal alternatives complete the proficiency step and clear the requirement', () => {
    const draft = realDraft()
    setChoiceSelections(draft, CLASS_KEY, [INSIGHT, NATURE])

    expect(isProficiencyStepComplete(draft)).toBe(true)
    expect(missingRequirements(draft).some((line) => line.includes('Class'))).toBe(false)
  })

  // 14: unrelated choices are not globally disabled by a grant on another key.
  it('a grant of one skill does not disable an unrelated, differently-keyed choice', () => {
    const draft = realDraft()
    const offered = declaredChoices(draft).find((choice) => choice.key === CLASS_KEY)!.options
    expect(offered).toContain(INSIGHT)
    expect(offered).not.toContain(ARCANA)
  })
})
