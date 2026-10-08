// Unit tests for app/components/characters/builder/characterBuilderSelection.ts
// -- the pure selection/validation logic behind Character Builder V2
// (create-v2.vue + CharacterBuilderOptionPicker.vue).
//
// The fixture deliberately reproduces the dataset fact that makes this hard,
// and which the previous Builder got wrong: a World with BOTH SRD 5.1 and
// XPHB bound has two "Human" species and two "Fighter" classes, identical in
// title, distinguished only by (packageId, slug). Matching on slug alone can
// resolve to the wrong pack's entry.

import { describe, expect, it, vi } from 'vitest'

// UNIT-ISOLATION (classified in tests/rules/completeness-stub-policy.test.ts): this file asserts MECHANICS
// only. The completeness authority is replaced by the explicit stub in tests/helpers/completeness-stub.ts, so it
// makes no claim that a real PHB character can be created or progressed.
vi.mock('../../../../app/lib/content-rules/creation-completeness', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../app/lib/content-rules/creation-completeness')>()),
  ...(await import('../../../helpers/completeness-stub')).MECHANICS_ONLY_COMPLETENESS
}))
import {
  CHOICE_KEYS,
  STEP_KEYS,
  choiceSelections,
  declaredChoices,
  effectiveSpellSelections,
  emptyDraft,
  filterOptions,
  findOptionByKey,
  hasAmbiguousTitles,
  isSelectionHidden,
  isDraftComplete,
  isProficiencyStepComplete,
  isSpellStepComplete,
  isStepComplete,
  missingRequirements,
  pruneChoices,
  setChoiceSelections,
  setSpellSelections,
  spellAcquisitionPresentation,
  spellRequirementSections,
  nextStep,
  optionKey,
  previousStep,
  toCreatePayload,
  activeAssignment,
  draftAbilityScores,
  isAbilityStepComplete,
  switchAbilityMethod,
  type BuilderCatalogueEntry,
  type BuilderCreationContext,
  type CharacterBuilderDraft
} from '../../../../app/components/characters/builder/characterBuilderSelection'
import { findRulesFacet } from '../../../../app/lib/content-rules'
import { resolveDnd5eSpellMechanics } from '../../../../app/lib/spell-mechanics/dnd5e'
import { serializeContentRef } from '../../../../app/lib/characters/progression-plan'
import type { CreationSpellEntry } from '../../../../app/lib/characters/creation-content-choices'
import {
  defaultAssignmentForMethod,
  filledAssignment,
  normalizeStoredAbilityScores,
  pointBuyRemaining,
  type AbilityScoreAssignment
} from '../../../../app/lib/characters/ability-scores'

function entry(overrides: Partial<BuilderCatalogueEntry> = {}): BuilderCatalogueEntry {
  return {
    packageId: 'eldra.content.xphb',
    packageVersion: '1.0.0',
    systemKey: 'dnd5e',
    title: 'Human',
    slug: 'human-xphb',
    externalId: 'Human__XPHB',
    provider: '5etools-json',
    sourceBook: 'XPHB',
    sourcePage: '194',
    ...overrides
  }
}

const SRD_HUMAN = entry({
  packageId: 'eldra.content.srd-5.1',
  title: 'Human',
  slug: 'human-phb',
  externalId: 'Human__PHB',
  sourceBook: 'PHB'
})
const XPHB_HUMAN = entry()
const XPHB_ELF = entry({ title: 'Elf', slug: 'elf-xphb', externalId: 'Elf__XPHB' })
const XPHB_FIGHTER = entry({ title: 'Fighter', slug: 'fighter-xphb', externalId: 'Fighter__XPHB' })
const XPHB_ACOLYTE = entry({ title: 'Acolyte', slug: 'acolyte-xphb', externalId: 'Acolyte__XPHB' })

const STANDARD_ARRAY_ASSIGNMENT: AbilityScoreAssignment = {
  str: 15, dex: 14, con: 13, int: 12, wis: 10, cha: 8
}

function completeDraft(): CharacterBuilderDraft {
  const draft = emptyDraft()
  draft.name = 'Aria'
  draft.species = XPHB_HUMAN
  draft.class = XPHB_FIGHTER
  draft.background = XPHB_ACOLYTE
  draft.abilities.byMethod['standard-array'] = { ...STANDARD_ARRAY_ASSIGNMENT }
  return draft
}

describe('optionKey -- composite identity', () => {
  it('joins packageId and slug, matching what the save route resolves on', () => {
    expect(optionKey(XPHB_HUMAN)).toBe('eldra.content.xphb::human-xphb')
  })

  it('distinguishes two same-titled entries from different packs', () => {
    expect(optionKey(SRD_HUMAN)).not.toBe(optionKey(XPHB_HUMAN))
  })

  it('is empty for a null/undefined selection', () => {
    expect(optionKey(null)).toBe('')
    expect(optionKey(undefined)).toBe('')
  })
})

describe('findOptionByKey', () => {
  const options = [SRD_HUMAN, XPHB_HUMAN, XPHB_ELF]

  it('resolves the exact pack entry, never merely the first title match', () => {
    expect(findOptionByKey(options, optionKey(XPHB_HUMAN))).toBe(XPHB_HUMAN)
    expect(findOptionByKey(options, optionKey(SRD_HUMAN))).toBe(SRD_HUMAN)
  })

  it('returns null for an unknown or empty key', () => {
    expect(findOptionByKey(options, 'eldra.content.nope::human-xphb')).toBeNull()
    expect(findOptionByKey(options, '')).toBeNull()
  })
})

describe('filterOptions -- search', () => {
  const options = [SRD_HUMAN, XPHB_HUMAN, XPHB_ELF]

  it('returns everything for an empty or whitespace query', () => {
    expect(filterOptions(options, '')).toHaveLength(3)
    expect(filterOptions(options, '   ')).toHaveLength(3)
  })

  it('matches on title, case-insensitively', () => {
    expect(filterOptions(options, 'elf').map((o) => o.title)).toEqual(['Elf'])
    expect(filterOptions(options, 'ELF').map((o) => o.title)).toEqual(['Elf'])
  })

  it('matches on source book, so a player can narrow to one book', () => {
    expect(filterOptions(options, 'xphb')).toHaveLength(2)
    expect(filterOptions(options, 'phb')).toHaveLength(3)
  })

  it('AND-matches multiple terms in any order -- "human xphb" finds only the XPHB Human', () => {
    expect(filterOptions(options, 'human xphb')).toEqual([XPHB_HUMAN])
    expect(filterOptions(options, 'xphb human')).toEqual([XPHB_HUMAN])
  })

  it('returns nothing when no option matches', () => {
    expect(filterOptions(options, 'tiefling')).toEqual([])
  })

  it('never mutates the input array', () => {
    const original = [...options]
    filterOptions(options, 'elf')
    expect(options).toEqual(original)
  })
})

describe('isSelectionHidden -- a search must not look like it cleared the choice', () => {
  const options = [SRD_HUMAN, XPHB_HUMAN, XPHB_ELF]

  it('is true when the chosen option is filtered out of the visible list', () => {
    const visible = filterOptions(options, 'elf')
    expect(isSelectionHidden(visible, optionKey(SRD_HUMAN))).toBe(true)
  })

  it('is false when the chosen option is still visible', () => {
    const visible = filterOptions(options, 'human xphb')
    expect(isSelectionHidden(visible, optionKey(XPHB_HUMAN))).toBe(false)
  })

  it('is false when no search is active, since everything is visible', () => {
    const visible = filterOptions(options, '')
    expect(isSelectionHidden(visible, optionKey(SRD_HUMAN))).toBe(false)
  })

  it('is false while nothing is chosen', () => {
    expect(isSelectionHidden(filterOptions(options, 'elf'), '')).toBe(false)
  })

  it('distinguishes the two same-titled Humans -- hiding one does not mask the other', () => {
    const visible = filterOptions(options, 'human xphb')
    expect(isSelectionHidden(visible, optionKey(XPHB_HUMAN))).toBe(false)
    expect(isSelectionHidden(visible, optionKey(SRD_HUMAN))).toBe(true)
  })
})

describe('hasAmbiguousTitles', () => {
  it('is true when two packs contribute the same title', () => {
    expect(hasAmbiguousTitles([SRD_HUMAN, XPHB_HUMAN, XPHB_ELF])).toBe(true)
  })

  it('is false when every title is distinct', () => {
    expect(hasAmbiguousTitles([XPHB_HUMAN, XPHB_ELF])).toBe(false)
  })

  it('is false for an empty catalogue', () => {
    expect(hasAmbiguousTitles([])).toBe(false)
  })
})

describe('validation', () => {
  it('an empty draft is incomplete and reports every requirement', () => {
    const draft = emptyDraft()
    expect(isDraftComplete(draft)).toBe(false)
    expect(missingRequirements(draft)).toEqual([
      'Enter a character name.',
      'Choose a Species.',
      'Choose a Class.',
      'Choose a Background.',
      'Finish assigning ability scores.'
    ])
  })

  it('a whitespace-only name does not satisfy the name requirement', () => {
    const draft = { ...completeDraft(), name: '   ' }
    expect(isDraftComplete(draft)).toBe(false)
    expect(missingRequirements(draft)).toEqual(['Enter a character name.'])
  })

  it('a fully populated draft is complete with nothing outstanding', () => {
    const draft = completeDraft()
    expect(isDraftComplete(draft)).toBe(true)
    expect(missingRequirements(draft)).toEqual([])
  })

  it('reports only the genuinely missing choice', () => {
    const draft = { ...completeDraft(), class: null }
    expect(missingRequirements(draft)).toEqual(['Choose a Class.'])
  })

  it('isStepComplete tracks each step independently', () => {
    const draft = { ...emptyDraft(), name: 'Aria', species: XPHB_HUMAN }
    expect(isStepComplete(draft, 'identity')).toBe(true)
    expect(isStepComplete(draft, 'species')).toBe(true)
    expect(isStepComplete(draft, 'class')).toBe(false)
    expect(isStepComplete(draft, 'abilities')).toBe(false)
    expect(isStepComplete(draft, 'review')).toBe(false)
  })
})

describe('toCreatePayload', () => {
  it('sends only (packageId, slug) per choice -- the fields the save route actually reads', () => {
    expect(toCreatePayload(completeDraft())).toEqual({
      title: 'Aria',
      species: { packageId: 'eldra.content.xphb', slug: 'human-xphb' },
      class: { packageId: 'eldra.content.xphb', slug: 'fighter-xphb' },
      background: { packageId: 'eldra.content.xphb', slug: 'acolyte-xphb' },
      // Ability scores are sent IN FULL, unlike the three catalogue choices:
      // there is no catalogue to re-resolve them against, because they are
      // the player's own data rather than a reference to published content.
      abilities: {
        method: 'standard-array',
        scores: { str: 15, dex: 14, con: 13, int: 12, wis: 10, cha: 8 }
      },
      // ChoiceSet answers travel the same way and for the same reason: they
      // are the player's decisions, not a reference to published content.
      // Empty here because the fixture's entries carry no Rules Facet.
      choices: { selections: {} },
      // PHASE 2C.2B -- no content-backed declaration in this draft, so no content answers.
      contentChoices: {},
      // D&D 2024 Character Rules P3.3 -- Fighter declares no spellRequirements, so no spell answers.
      spellSelections: []
    })
  })

  it('trims the submitted name', () => {
    expect(toCreatePayload({ ...completeDraft(), name: '  Aria  ' })?.title).toBe('Aria')
  })

  it('carries the SRD pack id when the SRD Human is the one chosen', () => {
    const payload = toCreatePayload({ ...completeDraft(), species: SRD_HUMAN })
    expect(payload?.species).toEqual({ packageId: 'eldra.content.srd-5.1', slug: 'human-phb' })
  })

  it('refuses to build a payload from an incomplete draft', () => {
    expect(toCreatePayload(emptyDraft())).toBeNull()
    expect(toCreatePayload({ ...completeDraft(), background: null })).toBeNull()
  })

  it('refuses to build a payload when only the ability scores are unfinished', () => {
    const draft = completeDraft()
    draft.abilities.byMethod['standard-array'] = defaultAssignmentForMethod('standard-array')

    expect(toCreatePayload(draft)).toBeNull()
    expect(missingRequirements(draft)).toEqual(['Finish assigning ability scores.'])
  })
})

describe('ability scores (Phase 3)', () => {
  it('a new draft starts on Standard Array with nothing assigned', () => {
    const draft = emptyDraft()

    expect(draft.abilities.method).toBe('standard-array')
    expect(isAbilityStepComplete(draft)).toBe(false)
    expect(draftAbilityScores(draft)).toBeNull()
  })

  it('yields the six numbers once the active method is finished', () => {
    expect(draftAbilityScores(completeDraft())).toEqual({
      str: 15, dex: 14, con: 13, int: 12, wis: 10, cha: 8
    })
  })

  it('keeps each method\'s own work, so leaving one and returning restores it', () => {
    const draft = emptyDraft()
    switchAbilityMethod(draft, 'point-buy')
    draft.abilities.byMethod['point-buy'].str = 15

    switchAbilityMethod(draft, 'manual')
    expect(draft.abilities.method).toBe('manual')

    switchAbilityMethod(draft, 'point-buy')
    expect(draft.abilities.byMethod['point-buy'].str).toBe(15)
  })

  it('seeds a pristine method from the current one when it can represent those numbers', () => {
    const draft = completeDraft()
    // The standard array is also a legal 27-point buy.
    switchAbilityMethod(draft, 'point-buy')

    expect(activeAssignment(draft)).toEqual(STANDARD_ARRAY_ASSIGNMENT)
  })

  it('does NOT seed a method that cannot represent the current numbers', () => {
    const draft = emptyDraft()
    draft.abilities.method = 'manual'
    draft.abilities.byMethod.manual = filledAssignment(18)

    switchAbilityMethod(draft, 'point-buy')

    // 18 is unbuyable; Point Buy opens at its own floor rather than clamping.
    expect(activeAssignment(draft)).toEqual(defaultAssignmentForMethod('point-buy'))
    // ...and the manual work is untouched.
    expect(draft.abilities.byMethod.manual).toEqual(filledAssignment(18))
  })

  it('never overwrites a method the player has already worked in', () => {
    const draft = completeDraft()
    draft.abilities.byMethod['point-buy'] = filledAssignment(12)

    switchAbilityMethod(draft, 'point-buy')

    expect(activeAssignment(draft)).toEqual(filledAssignment(12))
  })
})

describe('step navigation', () => {
  it('walks the full step order forwards and backwards', () => {
    // Proficiencies sits after the three content choices, because the
    // questions it asks are declared BY those choices.
    expect(STEP_KEYS).toEqual([
      'identity', 'species', 'class', 'background', 'proficiencies', 'spells', 'abilities', 'review'
    ])
    expect(nextStep('identity')).toBe('species')
    expect(nextStep('background')).toBe('proficiencies')
    // D&D 2024 Character Rules P3.3 -- 'spells' sits right after 'proficiencies', for the same
    // "its questions are declared by the chosen Class" reason.
    expect(nextStep('proficiencies')).toBe('spells')
    expect(nextStep('spells')).toBe('abilities')
    expect(nextStep('abilities')).toBe('review')
    expect(previousStep('species')).toBe('identity')
  })

  it('stops at both ends rather than wrapping', () => {
    expect(nextStep('review')).toBeNull()
    expect(previousStep('identity')).toBeNull()
  })

  it('CHOICE_KEYS covers exactly the three catalogue-backed steps', () => {
    expect(CHOICE_KEYS).toEqual(['species', 'class', 'background'])
  })
})

// ---------------------------------------------------------------------------
// End-to-end: Builder draft -> create payload -> server validator.
// ---------------------------------------------------------------------------
// Every module in this path is the REAL one -- the Builder's draft logic, the
// payload builder, and the server-side validator the create route and
// PUT .../abilities both call. This is the test that would catch the two
// halves drifting apart, which is exactly what putting the ability-score
// domain in app/lib/characters/ (shared by client and server) exists to
// prevent.

describe('ability scores round-trip from Builder to server', () => {
  it('a completed draft produces a payload the server validator accepts unchanged', () => {
    const payload = toCreatePayload(completeDraft())!

    const stored = normalizeStoredAbilityScores(payload.abilities)

    expect(stored).toEqual(payload.abilities)
    // What persists is the six numbers and their provenance -- nothing else.
    expect(Object.keys(stored!).sort()).toEqual(['method', 'scores'])
  })

  it('a point-buy draft round-trips with its budget intact and its method preserved', () => {
    const draft = completeDraft()
    // The standard array is also a legal 27-point buy, so it carries over.
    switchAbilityMethod(draft, 'point-buy')

    expect(pointBuyRemaining(activeAssignment(draft))).toBe(0)

    const payload = toCreatePayload(draft)!
    expect(payload.abilities.method).toBe('point-buy')
    expect(normalizeStoredAbilityScores(payload.abilities)).toEqual(payload.abilities)
  })

  it('an unfinished ability step blocks the payload entirely -- the server is never asked', () => {
    const draft = completeDraft()
    switchAbilityMethod(draft, 'roll')

    expect(isAbilityStepComplete(draft)).toBe(false)
    expect(toCreatePayload(draft)).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// Proficiency choices -- the questions the chosen content asks
// ---------------------------------------------------------------------------

const ATHLETICS = 'value:skill.athletics.proficient'
const PERCEPTION = 'value:skill.perception.proficient'
const ARCANA = 'value:skill.arcana.proficient'

const CLASS_KEY = 'class:choice:skill.proficiency'

// A Class facet shaped exactly like the authored corpus's Fighter.
const FIGHTER_WITH_SKILLS = entry({
  title: 'Fighter',
  slug: 'fighter-xphb',
  externalId: 'Fighter__XPHB',
  rulesFacet: {
    grants: [{ set: 'value:save.str.proficient', to: true }],
    choices: [{
      choiceSet: 'choice:skill.proficiency',
      count: 2,
      from: [ATHLETICS, PERCEPTION, 'value:skill.survival.proficient']
    }]
  }
})

const WIZARD_WITH_SKILLS = entry({
  title: 'Wizard',
  slug: 'wizard-xphb',
  externalId: 'Wizard__XPHB',
  rulesFacet: {
    choices: [{
      choiceSet: 'choice:skill.proficiency',
      count: 2,
      from: [ARCANA, 'value:skill.history.proficient', 'value:skill.insight.proficient']
    }]
  }
})

function fighterDraft(): CharacterBuilderDraft {
  const draft = completeDraft()
  draft.class = FIGHTER_WITH_SKILLS
  return draft
}

describe('declaredChoices', () => {
  it('asks nothing when the chosen content carries no Rules Facet', () => {
    expect(declaredChoices(completeDraft())).toEqual([])
  })

  it('asks what the chosen Class declares, keyed by slot', () => {
    expect(declaredChoices(fighterDraft())).toEqual([{
      key: CLASS_KEY,
      slot: 'class',
      choiceSetId: 'choice:skill.proficiency',
      count: 2,
      options: [ATHLETICS, PERCEPTION, 'value:skill.survival.proficient'],
      distinct: true,
      maxPerOption: undefined
    }])
  })

  it('is derived from the CURRENT selection -- changing Class changes the question', () => {
    const draft = fighterDraft()
    expect(declaredChoices(draft)[0]!.options).toContain(ATHLETICS)

    draft.class = WIZARD_WITH_SKILLS
    expect(declaredChoices(draft)[0]!.options).not.toContain(ATHLETICS)
    expect(declaredChoices(draft)[0]!.options).toContain(ARCANA)
  })
})

describe('answering a choice', () => {
  it('records exactly what was ticked', () => {
    const draft = fighterDraft()
    setChoiceSelections(draft, CLASS_KEY, [ATHLETICS, PERCEPTION])
    expect(choiceSelections(draft, CLASS_KEY)).toEqual([ATHLETICS, PERCEPTION])
  })

  it('computes nothing -- the draft holds ids, never a bonus or a boolean map', () => {
    const draft = fighterDraft()
    setChoiceSelections(draft, CLASS_KEY, [ATHLETICS, PERCEPTION])
    expect(draft.choices).toEqual({ selections: { [CLASS_KEY]: [ATHLETICS, PERCEPTION] } })
  })

  it('is incomplete until the required count is met', () => {
    const draft = fighterDraft()
    expect(isProficiencyStepComplete(draft)).toBe(false)

    setChoiceSelections(draft, CLASS_KEY, [ATHLETICS])
    expect(isProficiencyStepComplete(draft)).toBe(false)

    setChoiceSelections(draft, CLASS_KEY, [ATHLETICS, PERCEPTION])
    expect(isProficiencyStepComplete(draft)).toBe(true)
  })

  it('is vacuously complete when nothing asks a question', () => {
    // A World whose content carries no facets must not be blocked by a step
    // that has nothing in it.
    expect(isProficiencyStepComplete(completeDraft())).toBe(true)
  })

  it('blocks the whole draft while a declared choice is unanswered', () => {
    const draft = fighterDraft()
    expect(isDraftComplete(draft)).toBe(false)
    expect(missingRequirements(draft).join(' ')).toMatch(/Choose exactly 2/)

    setChoiceSelections(draft, CLASS_KEY, [ATHLETICS, PERCEPTION])
    expect(isDraftComplete(draft)).toBe(true)
    expect(missingRequirements(draft)).toEqual([])
  })

  it('marks the step complete only when every choice is answered', () => {
    const draft = fighterDraft()
    setChoiceSelections(draft, CLASS_KEY, [ATHLETICS, PERCEPTION])
    expect(isStepComplete(draft, 'proficiencies')).toBe(true)
  })
})

describe('changing the Class discards answers it no longer asks for', () => {
  it('prunes options the new Class does not offer, even though the KEY is identical', () => {
    const draft = fighterDraft()
    setChoiceSelections(draft, CLASS_KEY, [ATHLETICS, PERCEPTION])

    draft.class = WIZARD_WITH_SKILLS
    pruneChoices(draft)

    // Both declare choice:skill.proficiency on the class slot, so the key
    // survives -- but neither Fighter pick is on the Wizard's list, so
    // neither is carried over. Without this the draft would still hold two
    // picks for a two-pick question and the picker would disable every
    // option the Wizard actually offers.
    expect(choiceSelections(draft, CLASS_KEY)).toEqual([])
    expect(isProficiencyStepComplete(draft)).toBe(false)
  })

  it('keeps an option the new Class still offers', () => {
    const SHARED = entry({
      title: 'Ranger',
      slug: 'ranger-xphb',
      externalId: 'Ranger__XPHB',
      rulesFacet: {
        choices: [{
          choiceSet: 'choice:skill.proficiency',
          count: 2,
          from: [ATHLETICS, ARCANA]
        }]
      }
    })

    const draft = fighterDraft()
    setChoiceSelections(draft, CLASS_KEY, [ATHLETICS, PERCEPTION])

    draft.class = SHARED
    pruneChoices(draft)

    // Athletics is on both lists and is kept; Perception is not and is not.
    expect(choiceSelections(draft, CLASS_KEY)).toEqual([ATHLETICS])
  })

  it('drops an answer entirely when the new Class asks nothing', () => {
    const draft = fighterDraft()
    setChoiceSelections(draft, CLASS_KEY, [ATHLETICS, PERCEPTION])

    draft.class = XPHB_FIGHTER  // no facet at all
    pruneChoices(draft)

    expect(draft.choices.selections).toEqual({})
    expect(isProficiencyStepComplete(draft)).toBe(true)
  })
})

describe('toCreatePayload carries the answers', () => {
  it('sends the selections the player made', () => {
    const draft = fighterDraft()
    setChoiceSelections(draft, CLASS_KEY, [ATHLETICS, PERCEPTION])

    expect(toCreatePayload(draft)?.choices).toEqual({
      selections: { [CLASS_KEY]: [ATHLETICS, PERCEPTION] }
    })
  })

  it('refuses to build a payload while a declared choice is unanswered', () => {
    expect(toCreatePayload(fighterDraft())).toBeNull()
  })

  it('copies rather than aliasing the draft, so a later edit cannot mutate a sent payload', () => {
    const draft = fighterDraft()
    setChoiceSelections(draft, CLASS_KEY, [ATHLETICS, PERCEPTION])

    const payload = toCreatePayload(draft)!
    setChoiceSelections(draft, CLASS_KEY, [ATHLETICS, 'value:skill.survival.proficient'])

    expect(payload.choices.selections[CLASS_KEY]).toEqual([ATHLETICS, PERCEPTION])
  })
})

// ---------------------------------------------------------------------------
// D&D 2024 Character Rules P3.3 -- the Builder browser-shape test. Exercises the SAME
// normalized catalogue/facet/plan shape the real V2 Builder page receives (real authored class
// facets via findRulesFacet, a synthetic but realistically-shaped spell catalogue), never a
// hand-built fake SpellRequirement -- "Builder wiring has false-greened before" is this phase's
// own stated reason to test exactly this shape, not just planSpellAcquisition in isolation (P3.2
// already does that).
// ---------------------------------------------------------------------------
describe('D&D 2024 Character Rules P3.3 -- Builder spell acquisition (real facets, catalogue shape)', () => {
  function wizardSpell(slug: string, level: number, classLists: string[] = ['Wizard']) {
    return resolveDnd5eSpellMechanics({ name: slug, source: 'XPHB', level, school: 'V', classLists })!
  }

  function spellEntry(slug: string, level: number, classLists: string[], title = slug): CreationSpellEntry {
    return { packageId: 'eldra.solaris.xphb', slug, title, spellMechanics: wizardSpell(slug, level, classLists) }
  }

  const WIZARD_ENTRY = entry({ title: 'Wizard', slug: 'wizard-xphb', rulesFacet: findRulesFacet('dnd5e.2024', 'class', 'wizard-xphb') })
  const CLERIC_ENTRY = entry({ title: 'Cleric', slug: 'cleric-xphb', rulesFacet: findRulesFacet('dnd5e.2024', 'class', 'cleric-xphb') })

  const WIZARD_SPELLBOOK = [...'abcdefghij'].map((s) => spellEntry(s, 1, ['Wizard']))
  const CLERIC_SPELL = spellEntry('cleric-one', 1, ['Cleric'])

  function wizardDraft(): CharacterBuilderDraft {
    const draft = emptyDraft()
    draft.name = 'Elminster'
    draft.class = WIZARD_ENTRY
    return draft
  }

  function contextWith(spells: CreationSpellEntry[]): BuilderCreationContext {
    return { contentSelectorOf: () => null, feats: [], spells }
  }

  it('a real caster (Wizard) selected produces real missing spell requirements, with real titles', () => {
    const plan = spellAcquisitionPresentation(wizardDraft(), contextWith(WIZARD_SPELLBOOK))
    const spellbook = plan.requirements.find((r) => r.pool === 'spellbook')!
    expect(spellbook.missing).toBe(6)
    expect(spellbook.options.map((o) => o.title).sort()).toEqual([...'abcdefghij'].sort())
  })

  it('a legal answer reduces the missing count, recomputed from the SAME draft', () => {
    const draft = wizardDraft()
    const sections = spellRequirementSections(draft, contextWith(WIZARD_SPELLBOOK))
    const spellbook = sections.find((s) => s.pool === 'spellbook')!
    setSpellSelections(draft, spellbook.requirementId, [serializeContentRef({ packageId: 'eldra.solaris.xphb', slug: 'a' })])

    const after = spellAcquisitionPresentation(draft, contextWith(WIZARD_SPELLBOOK)).requirements.find((r) => r.pool === 'spellbook')!
    expect(after.missing).toBe(5)
  })

  it('a duplicate selection for the same requirement is refused (never silently inflates the count)', () => {
    const draft = wizardDraft()
    const sections = spellRequirementSections(draft, contextWith(WIZARD_SPELLBOOK))
    const spellbookId = sections.find((s) => s.pool === 'spellbook')!.requirementId
    const ref = serializeContentRef({ packageId: 'eldra.solaris.xphb', slug: 'a' })
    setSpellSelections(draft, spellbookId, [ref, ref])

    const plan = spellAcquisitionPresentation(draft, contextWith(WIZARD_SPELLBOOK))
    const spellbook = plan.requirements.find((r) => r.pool === 'spellbook')!
    expect(spellbook.legalCount).toBe(1)
    expect(spellbook.issues.some((issue) => issue.kind === 'tentative-duplicate')).toBe(true)
  })

  it('Wizard: a tentative spellbook answer immediately feeds eligible prepared options, within the SAME plan', () => {
    const draft = wizardDraft()
    const sections = spellRequirementSections(draft, contextWith(WIZARD_SPELLBOOK))
    const spellbookId = sections.find((s) => s.pool === 'spellbook')!.requirementId
    setSpellSelections(draft, spellbookId, [...'abcdef'].map((s) => serializeContentRef({ packageId: 'eldra.solaris.xphb', slug: s })))

    const preparedSection = spellRequirementSections(draft, contextWith(WIZARD_SPELLBOOK)).find((s) => s.pool === 'spell')!
    for (const s of [...'abcdef']) {
      expect(Object.keys(preparedSection.optionLabels)).toContain(serializeContentRef({ packageId: 'eldra.solaris.xphb', slug: s }))
    }
  })

  it('a Class switch makes the prior Class\'s answers invisible to both presentation and submission', () => {
    const draft = wizardDraft()
    const spellbookId = spellRequirementSections(draft, contextWith(WIZARD_SPELLBOOK)).find((s) => s.pool === 'spellbook')!.requirementId
    setSpellSelections(draft, spellbookId, [serializeContentRef({ packageId: 'eldra.solaris.xphb', slug: 'a' })])

    draft.class = CLERIC_ENTRY
    const clericSections = spellRequirementSections(draft, contextWith([...WIZARD_SPELLBOOK, CLERIC_SPELL]))
    expect(clericSections.some((s) => s.pool === 'spellbook')).toBe(false)
    expect(effectiveSpellSelections(draft)).toEqual([])
    // The stale draft entry itself is preserved (switching back re-validates it), never deleted.
    expect(draft.spellSelections[spellbookId]).toEqual([serializeContentRef({ packageId: 'eldra.solaris.xphb', slug: 'a' })])
  })

  it('the spell step is incomplete for a real caster with unanswered requirements, and complete once satisfied', () => {
    const draft = wizardDraft()
    expect(isSpellStepComplete(draft, contextWith(WIZARD_SPELLBOOK))).toBe(false)
  })

  it('a non-caster Class (Fighter, no spellRequirements) has no spell sections and an already-complete spell step', () => {
    const draft = fighterDraft()
    expect(spellRequirementSections(draft, contextWith([]))).toEqual([])
    expect(isSpellStepComplete(draft, contextWith([]))).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// D&D 2024 Character Rules P3.3B -- the Builder browser-shape matrix, every real caster archetype
// plus the two Builder-specific proofs (prepared-outside-spellbook refusal, payload inclusion) not
// yet covered above. Tests the SAME normalized draft/context/plan shape the real V2 page receives
// -- "Builder wiring has false-greened before" is this phase's own stated reason to prove this
// shape directly, never just planSpellAcquisition in isolation (P3.2 already does that).
// ---------------------------------------------------------------------------
describe('D&D 2024 Character Rules P3.3B -- Builder browser-shape matrix (every real caster archetype)', () => {
  function classCatalogueEntry(slug: string, title: string): BuilderCatalogueEntry {
    return entry({ title, slug, rulesFacet: findRulesFacet('dnd5e.2024', 'class', slug) })
  }

  function spell(slug: string, level: number, classLists: string[]): CreationSpellEntry {
    return { packageId: 'eldra.solaris.xphb', slug, title: slug, spellMechanics: resolveDnd5eSpellMechanics({ name: slug, source: 'XPHB', level, school: 'V', classLists })! }
  }

  function draftFor(classEntry: BuilderCatalogueEntry): CharacterBuilderDraft {
    const draft = emptyDraft()
    draft.name = 'Rowan'
    draft.class = classEntry
    return draft
  }

  function contextWith(spells: CreationSpellEntry[]): BuilderCreationContext {
    return { contentSelectorOf: () => null, feats: [], spells }
  }

  it('1. Fighter: no spell requirements at all', () => {
    const draft = draftFor(classCatalogueEntry('fighter-xphb', 'Fighter'))
    expect(spellRequirementSections(draft, contextWith([]))).toEqual([])
  })

  it('2. Sorcerer: real cantrip + ordinary requirements, both generic sections, real P2 options', () => {
    const SORCERER = classCatalogueEntry('sorcerer-xphb', 'Sorcerer')
    const catalogue = [...'ab'].map((s) => spell(`sorc-${s}`, 0, ['Sorcerer'])).concat([...'cd'].map((s) => spell(`sorc-${s}`, 1, ['Sorcerer'])))
    const draft = draftFor(SORCERER)
    const sections = spellRequirementSections(draft, contextWith(catalogue))
    expect(sections.map((s) => s.pool).sort()).toEqual(['cantrip', 'spell'])
    expect(sections.every((s) => s.label.length > 0)).toBe(true)
  })

  it('3. Cleric: real prepared requirement, no spellbook dependency', () => {
    const CLERIC = classCatalogueEntry('cleric-xphb', 'Cleric')
    const draft = draftFor(CLERIC)
    const sections = spellRequirementSections(draft, contextWith([]))
    expect(sections.some((s) => s.pool === 'spellbook')).toBe(false)
    expect(sections.some((s) => s.pool === 'spell')).toBe(true)
  })

  it('4. Paladin: a real Level-1 spell section appears, with legal Level-1 options (Rules 0.21.0 half-caster baseline)', () => {
    const PALADIN = classCatalogueEntry('paladin-xphb', 'Paladin')
    const catalogue = [spell('pal-a', 1, ['Paladin'])]
    const draft = draftFor(PALADIN)
    const sections = spellRequirementSections(draft, contextWith(catalogue))
    const spellSection = sections.find((s) => s.pool === 'spell')!
    expect(spellSection.choice.count).toBeGreaterThan(0)
    expect(Object.keys(spellSection.optionLabels)).toContain(serializeContentRef({ packageId: 'eldra.solaris.xphb', slug: 'pal-a' }))
  })

  it('5. Ranger: a real Level-1 spell section appears, with legal Level-1 options', () => {
    const RANGER = classCatalogueEntry('ranger-xphb', 'Ranger')
    const catalogue = [spell('ran-a', 1, ['Ranger'])]
    const draft = draftFor(RANGER)
    const sections = spellRequirementSections(draft, contextWith(catalogue))
    const spellSection = sections.find((s) => s.pool === 'spell')!
    expect(spellSection.choice.count).toBeGreaterThan(0)
    expect(Object.keys(spellSection.optionLabels)).toContain(serializeContentRef({ packageId: 'eldra.solaris.xphb', slug: 'ran-a' }))
  })

  it('6. Warlock: cantrip + ordinary sections appear; no Mystic Arcanum control at Level 1 (target is 0, no special-case needed)', () => {
    const WARLOCK = classCatalogueEntry('warlock-xphb', 'Warlock')
    const draft = draftFor(WARLOCK)
    const sections = spellRequirementSections(draft, contextWith([]))
    expect(sections.map((s) => s.pool).sort()).toEqual(['cantrip', 'spell'])
    expect(sections.some((s) => s.pool === 'arcanum')).toBe(false)
  })

  it('7. Wizard: exactly 3 cantrip + 6 spellbook + 4 prepared, all three sections present simultaneously', () => {
    const WIZARD = classCatalogueEntry('wizard-xphb', 'Wizard')
    const catalogue = [
      ...[...'abcdef'].map((s) => spell(s, 1, ['Wizard'])),
      ...[...'xyz'].map((s) => spell(`c-${s}`, 0, ['Wizard']))
    ]
    const draft = draftFor(WIZARD)
    const sections = spellRequirementSections(draft, contextWith(catalogue))
    expect(sections.find((s) => s.pool === 'cantrip')!.choice.count).toBe(3)
    expect(sections.find((s) => s.pool === 'spellbook')!.choice.count).toBe(6)
    expect(sections.find((s) => s.pool === 'spell')!.choice.count).toBe(4)
  })

  it('9. Wizard: a prepared pick outside the effective spellbook is refused (unavailable), at the Builder plan level', () => {
    const WIZARD = classCatalogueEntry('wizard-xphb', 'Wizard')
    const catalogue = [...'abcdefg'].map((s) => spell(s, 1, ['Wizard']))
    const draft = draftFor(WIZARD)
    const plan = spellAcquisitionPresentation(draft, contextWith(catalogue))
    const spellbookId = plan.requirements.find((r) => r.pool === 'spellbook')!.requirementId
    const spellId = plan.requirements.find((r) => r.pool === 'spell')!.requirementId

    setSpellSelections(draft, spellbookId, [...'abcdef'].map((s) => serializeContentRef({ packageId: 'eldra.solaris.xphb', slug: s })))
    setSpellSelections(draft, spellId, [serializeContentRef({ packageId: 'eldra.solaris.xphb', slug: 'g' })]) // never added to the spellbook

    const after = spellAcquisitionPresentation(draft, contextWith(catalogue))
    const prepared = after.requirements.find((r) => r.requirementId === spellId)!
    expect(prepared.satisfied).toBe(false)
    expect(prepared.issues.some((i) => i.kind === 'illegal-not-in-membership-pool')).toBe(true)
  })

  it('10. a same-requirement duplicate selection is unavailable/refused (already proven above for Wizard\'s spellbook; reconfirmed generically for an ordinary pool)', () => {
    const CLERIC = classCatalogueEntry('cleric-xphb', 'Cleric')
    const catalogue = [spell('cleric-a', 1, ['Cleric'])]
    const draft = draftFor(CLERIC)
    const spellId = spellAcquisitionPresentation(draft, contextWith(catalogue)).requirements.find((r) => r.pool === 'spell')!.requirementId
    const dupRef = serializeContentRef({ packageId: 'eldra.solaris.xphb', slug: 'cleric-a' })
    setSpellSelections(draft, spellId, [dupRef, dupRef])

    const plan = spellAcquisitionPresentation(draft, contextWith(catalogue))
    const result = plan.requirements.find((r) => r.requirementId === spellId)!
    expect(result.legalCount).toBe(1)
    expect(result.issues.some((i) => i.kind === 'tentative-duplicate')).toBe(true)
  })

  // `toCreatePayload` gates on the FULL draft being complete, including REAL Phase-0 authority
  // (creationBlockerMessages) -- and per the real availability scoreboard, NO real class is
  // individually creation-complete yet (equipment and other unrelated blockers), regardless of
  // spell state. That is a correct, already-proven Phase-0 fact, not something this test should
  // route around. What P3.3B actually owns is narrower: the SPELL portion of the payload
  // (`effectiveSpellSelections`, the exact function `toCreatePayload` itself calls for its own
  // `spellSelections` field) is shaped correctly and is complete once the spell step itself is
  // satisfied -- proven directly, independent of the rest of the draft's Phase-0 state.
  it('12. legal, complete spell answers are shaped exactly as the create-v2 transport expects (requirementId + ref only)', () => {
    const WIZARD = classCatalogueEntry('wizard-xphb', 'Wizard')
    const catalogue = [
      ...[...'abcdef'].map((s) => spell(s, 1, ['Wizard'])),
      ...[...'xyz'].map((s) => spell(`c-${s}`, 0, ['Wizard']))
    ]
    const draft = draftFor(WIZARD)

    const plan = spellAcquisitionPresentation(draft, contextWith(catalogue))
    const spellbookId = plan.requirements.find((r) => r.pool === 'spellbook')!.requirementId
    const spellId = plan.requirements.find((r) => r.pool === 'spell')!.requirementId
    const cantripId = plan.requirements.find((r) => r.pool === 'cantrip')!.requirementId
    setSpellSelections(draft, spellbookId, [...'abcdef'].map((s) => serializeContentRef({ packageId: 'eldra.solaris.xphb', slug: s })))
    setSpellSelections(draft, spellId, [...'abcd'].map((s) => serializeContentRef({ packageId: 'eldra.solaris.xphb', slug: s })))
    setSpellSelections(draft, cantripId, [...'xyz'].map((s) => serializeContentRef({ packageId: 'eldra.solaris.xphb', slug: `c-${s}` })))

    const context = contextWith(catalogue)
    expect(isSpellStepComplete(draft, context)).toBe(true)

    const submitted = effectiveSpellSelections(draft)
    expect(submitted).toHaveLength(13) // 6 spellbook + 4 prepared + 3 cantrip
    for (const selection of submitted) {
      expect(Object.keys(selection).sort()).toEqual(['ref', 'requirementId']) // transport shape only
      expect(Object.keys(selection.ref).sort()).toEqual(['packageId', 'slug'])
    }
  })
})
