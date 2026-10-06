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
const BASELINE = { species: 3, classes: 0, backgrounds: 0, combinations: 0 }

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
