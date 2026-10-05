// Regression for the browser-observed Phase 2B failure: a Sorcerer whose
// Background is Sage still saw Arcana checked, counted, and retained.
//
// The fixtures are the PUBLISHED Content Pack shapes for eldra.solaris.xphb@
// 1.0.10 (read through the same catalogue loader GET /api/worlds/:id/catalogue
// uses), reduced to the fields the Builder reads: identity and rulesFacet.
// Nothing here is hand-built from source RulesFacets.
//
// The draft is built the way create-v2.vue builds it: a catalogue entry is
// selected by findOptionByKey, then the choice is answered through
// setChoiceSelections and pruned as the page's watch does. Only functions that
// exist in both the deployed Builder and the working tree are called, so this
// same file can be run against either tree and must fail on the deployed one.

import { describe, expect, it } from 'vitest'
import {
  choiceSelections,
  creationChoicePresentation,
  declaredChoices,
  emptyDraft,
  findOptionByKey,
  optionKey,
  pruneChoices,
  setChoiceSelections,
  type BuilderCatalogueEntry,
  type CharacterBuilderDraft
} from '../../../../app/components/characters/builder/characterBuilderSelection'

const PACKAGE = 'eldra.solaris.xphb'
const VERSION = '1.0.10'
const CLASS_KEY = 'class:choice:skill.proficiency'
const ARCANA = 'value:skill.arcana.proficient'
const DECEPTION = 'value:skill.deception.proficient'
const INSIGHT = 'value:skill.insight.proficient'

// Published facet, eldra.solaris.xphb@1.0.10, background sage-xphb.
const SAGE_FACET = {
  grants: [
    { set: 'value:skill.arcana.proficient', to: true },
    { set: 'value:skill.history.proficient', to: true }
  ]
}

// Published facet, eldra.solaris.xphb@1.0.10, background acolyte-xphb.
// Grants neither Arcana nor History, so it is the "switch away" Background.
const ACOLYTE_FACET = {
  grants: [
    { set: 'value:skill.insight.proficient', to: true },
    { set: 'value:skill.religion.proficient', to: true }
  ]
}

// Published facet, eldra.solaris.xphb@1.0.10, class sorcerer-xphb.
const SORCERER_FACET = {
  grants: [
    { set: 'value:save.con.proficient', to: true },
    { set: 'value:save.cha.proficient', to: true },
    { set: 'value:hit_points.hit_die_size', to: 6 },
    { set: 'value:spellcasting.ability.cha', to: true },
    { set: 'value:spellcasting.caster_type.full', to: true }
  ],
  choices: [
    {
      choiceSet: 'choice:skill.proficiency',
      count: 2,
      from: [
        'value:skill.arcana.proficient',
        'value:skill.deception.proficient',
        'value:skill.insight.proficient',
        'value:skill.intimidation.proficient',
        'value:skill.persuasion.proficient',
        'value:skill.religion.proficient'
      ]
    }
  ]
}

function publishedEntry(title: string, slug: string, rulesFacet?: unknown): BuilderCatalogueEntry {
  return {
    packageId: PACKAGE,
    packageVersion: VERSION,
    systemKey: 'dnd5e',
    title,
    slug,
    externalId: `${title}__XPHB`,
    provider: '5etools-json',
    ...(rulesFacet ? { rulesFacet } : {})
  } as unknown as BuilderCatalogueEntry
}

const catalogue = {
  species: [publishedEntry('Gnome', 'gnome-xphb')],
  classes: [publishedEntry('Sorcerer', 'sorcerer-xphb', SORCERER_FACET)],
  backgrounds: [
    publishedEntry('Sage', 'sage-xphb', SAGE_FACET),
    publishedEntry('Acolyte', 'acolyte-xphb', ACOLYTE_FACET)
  ]
}

// Selects a catalogue entry the way the page does, by composite key.
function select(
  draft: CharacterBuilderDraft,
  slot: 'species' | 'class' | 'background',
  options: readonly BuilderCatalogueEntry[],
  slug: string
) {
  const entry = options.find((candidate) => candidate.slug === slug)!
  draft[slot] = findOptionByKey(options, optionKey(entry))
}

function sorcererWithSage(): CharacterBuilderDraft {
  const draft = emptyDraft()
  select(draft, 'species', catalogue.species, 'gnome-xphb')
  select(draft, 'class', catalogue.classes, 'sorcerer-xphb')
  select(draft, 'background', catalogue.backgrounds, 'sage-xphb')
  return draft
}

function offeredValues(draft: CharacterBuilderDraft): string[] {
  return declaredChoices(draft).find((choice) => choice.key === CLASS_KEY)!.options
}

describe('browser shape -- Gnome + Sorcerer + Sage (published facets)', () => {
  // The bite: on the deployed Builder, Arcana is still a declared option and
  // is retained in the selection, which is exactly what the screenshot showed.
  it('Sage grants Arcana, so Arcana is not an available Sorcerer skill option', () => {
    expect(offeredValues(sorcererWithSage())).not.toContain(ARCANA)
  })

  it('a picked Arcana is not retained and does not count toward choose-2', () => {
    const draft = sorcererWithSage()
    setChoiceSelections(draft, CLASS_KEY, [ARCANA, DECEPTION])

    expect(choiceSelections(draft, CLASS_KEY)).not.toContain(ARCANA)
    expect(choiceSelections(draft, CLASS_KEY)).toEqual([DECEPTION])
  })

  it('an unrelated Sorcerer skill stays available and selectable', () => {
    expect(offeredValues(sorcererWithSage())).toContain(DECEPTION)
    expect(offeredValues(sorcererWithSage())).toContain(INSIGHT)
  })
})

describe('browser shape -- switching Background recomputes and prunes', () => {
  it('Acolyte makes Arcana available; a legal Arcana pick is kept', () => {
    const draft = sorcererWithSage()
    select(draft, 'background', catalogue.backgrounds, 'acolyte-xphb')
    setChoiceSelections(draft, CLASS_KEY, [ARCANA, DECEPTION])

    expect(offeredValues(draft)).toContain(ARCANA)
    expect(choiceSelections(draft, CLASS_KEY)).toEqual([ARCANA, DECEPTION])
  })

  it('switching back to Sage prunes the now-illegal Arcana and the count drops from 2 to 1', () => {
    const draft = sorcererWithSage()
    select(draft, 'background', catalogue.backgrounds, 'acolyte-xphb')
    setChoiceSelections(draft, CLASS_KEY, [ARCANA, DECEPTION])

    select(draft, 'background', catalogue.backgrounds, 'sage-xphb')
    // The page runs pruneChoices from a watch on the species/class/background
    // keys; this is the same call, made at the same boundary.
    pruneChoices(draft)

    expect(choiceSelections(draft, CLASS_KEY)).toEqual([DECEPTION])
    expect(offeredValues(draft)).not.toContain(ARCANA)
  })
})

describe('browser shape -- initial presentation and idempotent pruning', () => {
  // The page runs pruneChoices on mount (immediate watch), so a draft that
  // already holds an illegal answer must be sanitised before any slot change.
  it('a stale illegal Arcana already in the draft is not presented as selected, and is pruned', () => {
    const draft = sorcererWithSage()
    draft.choices.selections[CLASS_KEY] = [ARCANA, DECEPTION]

    expect(creationChoicePresentation(draft).find((item) => item.key === CLASS_KEY)!.selected).toEqual([DECEPTION])

    pruneChoices(draft)

    expect(choiceSelections(draft, CLASS_KEY)).toEqual([DECEPTION])
  })

  it('an already-clean draft is left untouched -- the same array and selections objects are kept', () => {
    const draft = sorcererWithSage()
    setChoiceSelections(draft, CLASS_KEY, [DECEPTION, INSIGHT])
    const selections = draft.choices.selections
    const answer = draft.choices.selections[CLASS_KEY]

    pruneChoices(draft)

    expect(draft.choices.selections).toBe(selections)
    expect(draft.choices.selections[CLASS_KEY]).toBe(answer)
    expect(draft.choices.selections[CLASS_KEY]).toEqual([DECEPTION, INSIGHT])
  })

  it('pruning an empty draft writes nothing, and a second prune is a no-op', () => {
    const draft = sorcererWithSage()
    pruneChoices(draft)
    expect(draft.choices.selections).toEqual({})

    draft.choices.selections[CLASS_KEY] = [ARCANA, DECEPTION]
    pruneChoices(draft)
    const answer = draft.choices.selections[CLASS_KEY]
    pruneChoices(draft)

    expect(draft.choices.selections[CLASS_KEY]).toBe(answer)
  })

  it('switching Background to Sage prunes a newly-illegal answer without any interaction on the choice', () => {
    const draft = sorcererWithSage()
    select(draft, 'background', catalogue.backgrounds, 'acolyte-xphb')
    setChoiceSelections(draft, CLASS_KEY, [ARCANA, DECEPTION])

    select(draft, 'background', catalogue.backgrounds, 'sage-xphb')
    pruneChoices(draft)

    expect(choiceSelections(draft, CLASS_KEY)).toEqual([DECEPTION])
  })

  it('switching away from Sage restores Arcana as an eligible option, and a pruned answer is not resurrected', () => {
    const draft = sorcererWithSage()
    draft.choices.selections[CLASS_KEY] = [ARCANA]
    pruneChoices(draft)
    expect(choiceSelections(draft, CLASS_KEY)).toEqual([])

    select(draft, 'background', catalogue.backgrounds, 'acolyte-xphb')
    pruneChoices(draft)

    const arcana = creationChoicePresentation(draft).find((item) => item.key === CLASS_KEY)!.offered
      .find((option) => option.value === ARCANA)
    expect(arcana).toEqual({ value: ARCANA, eligible: true })
    expect(choiceSelections(draft, CLASS_KEY)).toEqual([])

    setChoiceSelections(draft, CLASS_KEY, [ARCANA, DECEPTION])
    expect(choiceSelections(draft, CLASS_KEY)).toEqual([ARCANA, DECEPTION])
  })
})
