// PRODUCTION-PATH ACCEPTANCE -- REAL AVAILABILITY. This file never stubs the completeness authority.
//
// It computes, from the real native-XPHB content and the real fail-closed authority, how many species,
// classes, and backgrounds can be created on their own, and how many complete species x class x
// background combinations exist. Every entity name is DERIVED from the decision index's owners; nothing
// is hardcoded by class or background name. The expected baseline below is the one approved as the
// temporary Phase-0 state. When a primitive lands, these numbers should improve, and this test is the
// place that proves it. If the computed result differs from the baseline, the change is a STOP:
// explain it before updating the baseline.

import { describe, expect, it } from 'vitest'
import { DND5E_2024_POPULATION, creationUnresolvedDecisions } from '../../../app/lib/content-rules/creation-completeness'

const NONE = '-'
// The population comes from the corpus (recorded in the index), never from decision owners.
const SPECIES = [...DND5E_2024_POPULATION.species]
const CLASSES = [...DND5E_2024_POPULATION.classes]
const BACKGROUNDS = [...DND5E_2024_POPULATION.backgrounds]

// The availability of one entity: no decision it owns at creation is unrecordable.
const individuallyCreatable = (kind: 'species' | 'class' | 'background', slug: string) => creationUnresolvedDecisions({
  species: kind === 'species' ? slug : NONE,
  class: kind === 'class' ? slug : NONE,
  background: kind === 'background' ? slug : NONE
}).length === 0

// The Phase-0 baseline (accepted as a temporary infrastructure state). Counts only, never names.
//
// D&D 2024 Character Rules P8 -- STOP, explained: starting equipment (the one decision every
// class and every background owned) is now implemented (app/lib/characters/equipment-bundle.ts +
// server/utils/character-equipment-bundle.ts), reclassifying all 28 class/background-owned
// `equipment-package` decisions from blocked to implemented. That is why `classes`/`backgrounds`/
// `combinations` jump from 0 here -- the four classes with NO other blocker (Bard, Monk, Sorcerer,
// Wizard) and the 13 backgrounds with no other blocker (every one but Acolyte/Guide/Sage, whose
// own Magic Initiate Origin feat remains unsupported) are now genuinely individually creation-
// complete. `species` is unchanged -- P8 touches no species decision.
// FEATURE-OPTION PHASE -- Cleric (Divine Order) and Druid (Primal Order) join the creation-complete
// roster (4 -> 6 classes), lifting the complete 3 species x 6 classes x 13 backgrounds combinations
// from 156 to 234.
// WEAPON MASTERY PHASE -- Barbarian, Fighter, Paladin, and Ranger join too (6 -> 10 classes;
// Rogue remains creation-blocked by Expertise and Thieves' Cant/language policy), lifting the
// complete combinations from 234 to 390.
// LANGUAGE CORPUS + POLICY PHASE -- Rogue's real remaining blocker was its own Thieves' Cant
// feature's embedded "one other language" choice, now authored (alongside the newly-discovered
// universal "Choose Languages" creation rule and Ranger's own Deft Explorer language half).
// Rogue joins the creation-complete roster (10 -> 11 classes; Warlock remains blocked by
// Eldritch Invocations alone), lifting the complete combinations from 390 to 429 (3 x 11 x 13).
// ELDRITCH INVOCATIONS PHASE -- Warlock's own real remaining blocker (Eldritch Invocations: the
// Level-1 choice plus the real Level 2/5/7/9/12/15/18 count growth) is now authored via the
// generic choice:class.accumulating-option ChoiceSet/progression. Warlock joins the
// creation-complete roster (11 -> 12 classes, the full named roster), lifting the complete
// combinations from 429 to 468 (3 x 12 x 13).
const BASELINE = { species: 3, classes: 12, backgrounds: 13, combinations: 468 }

describe('real creation availability -- derived from the corpus through the real authority', () => {
  it('the corpus population is what the index says it is (10 species, 12 classes, 16 backgrounds)', () => {
    expect(SPECIES).toHaveLength(10)
    expect(CLASSES).toHaveLength(12)
    expect(BACKGROUNDS).toHaveLength(16)
  })

  it(`species individually creation-complete: ${BASELINE.species} of 10`, () => {
    expect(SPECIES.filter((slug) => individuallyCreatable('species', slug))).toHaveLength(BASELINE.species)
  })

  it(`classes creation-complete: ${BASELINE.classes} of 12`, () => {
    expect(CLASSES.filter((slug) => individuallyCreatable('class', slug))).toHaveLength(BASELINE.classes)
  })

  it(`backgrounds creation-complete: ${BASELINE.backgrounds} of 16`, () => {
    expect(BACKGROUNDS.filter((slug) => individuallyCreatable('background', slug))).toHaveLength(BASELINE.backgrounds)
  })

  it(`complete native species x class x background combinations: ${BASELINE.combinations} of ${10 * 12 * 16}`, () => {
    let complete = 0
    for (const species of SPECIES) for (const cls of CLASSES) for (const background of BACKGROUNDS) {
      if (creationUnresolvedDecisions({ species, class: cls, background }).length === 0) complete++
    }
    expect(complete).toBe(BASELINE.combinations)
  })
})
