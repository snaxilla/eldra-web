// PHASE 2C.3A -- the pure creation Origin feat authority. The real XPHB feat
// fixture supplies the feat mechanics; the Background shape is the minimal
// structured facet the authority reads. No Background name is branched on.

import { describe, expect, it } from 'vitest'
import {
  findIllegalRepeatAcquisition,
  originFeatPresetChoices,
  ORIGIN_FEAT_GRANT_SEGMENT,
  ORIGIN_FEAT_SLOT,
  resolveCreationOriginFeat
} from '../../../app/lib/characters/creation-origin-feat'
import { progressionChoiceKey } from '../../../app/lib/characters/rules-choices'
import { resolveDnd5eFeatMechanics } from '../../../app/lib/feat-mechanics/dnd5e'
import type { CanonicalFeatMechanics } from '../../../app/lib/feat-mechanics/types'
import xphbFeats from '../feat-mechanics/fixtures/xphb-feats.json'

const PKG = 'eldra.solaris.xphb'
const slugOf = (name: string) => `${name.toLowerCase().replace(/ /g, '-')}-xphb`

const FEATS = xphbFeats.feats.map((raw) => ({
  packageId: PKG,
  slug: slugOf(raw.name),
  title: raw.name,
  featMechanics: resolveDnd5eFeatMechanics(raw)
}))

const background = (originFeatSlug?: string, packageId = PKG) => ({
  packageId,
  rulesFacet: originFeatSlug === undefined ? {} : { originFeatSlug }
})

describe('resolveCreationOriginFeat -- the structured facet is the only source', () => {
  it('a Background with no declared Origin feat resolves to none (nothing invented)', () => {
    expect(resolveCreationOriginFeat({ background: background(), feats: FEATS })).toEqual({ status: 'none' })
  })

  it('a legal Origin feat resolves to an acquisition under the canonical background-source key', () => {
    const result = resolveCreationOriginFeat({ background: background('alert-xphb'), feats: FEATS })
    expect(result).toEqual({
      status: 'acquired',
      acquisition: {
        featRef: { packageId: PKG, slug: 'alert-xphb' },
        choiceKey: 'background:progression:1:grant:origin'
      }
    })
  })

  it('the key is built by the canonical progression builder, never by string concatenation', () => {
    expect(ORIGIN_FEAT_SLOT).toBe('background')
    expect(ORIGIN_FEAT_GRANT_SEGMENT).toBe('grant:origin')
    expect(progressionChoiceKey(ORIGIN_FEAT_SLOT, 1, ORIGIN_FEAT_GRANT_SEGMENT)).toBe('background:progression:1:grant:origin')
  })

  it('a declared feat missing from the World catalogue fails CLOSED (illegal, never substituted)', () => {
    const result = resolveCreationOriginFeat({ background: background('alert-xphb'), feats: FEATS.filter((feat) => feat.slug !== 'alert-xphb') })
    expect(result.status).toBe('illegal')
  })

  it('a declared feat from another package is not found in this Background\'s package (fail closed)', () => {
    const result = resolveCreationOriginFeat({ background: background('alert-xphb', 'other.pkg'), feats: FEATS })
    expect(result.status).toBe('illegal')
  })

  it('a declared feat that is NOT an Origin feat is illegal (wrong category)', () => {
    const result = resolveCreationOriginFeat({ background: background('archery-xphb'), feats: FEATS })
    expect(result).toMatchObject({ status: 'illegal' })
    expect(result.status === 'illegal' ? result.reason : '').toMatch(/not a legal fixed acquisition/)
  })

  it('a feat with missing mechanics fails closed (malformed entry)', () => {
    const malformed = FEATS.map((feat) => (feat.slug === 'alert-xphb' ? { ...feat, featMechanics: null } : feat))
    expect(resolveCreationOriginFeat({ background: background('alert-xphb'), feats: malformed }).status).toBe('illegal')
  })

  it('an Origin feat carrying any prerequisite is illegal for a fixed grant (no prerequisite evaluation at creation)', () => {
    const alert = FEATS.find((feat) => feat.slug === 'alert-xphb')!
    const withPrerequisite = {
      ...alert,
      featMechanics: { ...alert.featMechanics, prerequisiteGroups: [[{}]] } as unknown as CanonicalFeatMechanics
    }
    const result = resolveCreationOriginFeat({ background: background('alert-xphb'), feats: [withPrerequisite] })
    expect(result.status).toBe('illegal')
  })
})

// HUMAN + GENERIC SELECTED-FEAT ACTIVATION PHASE -- `findIllegalRepeatAcquisition` replaces the
// narrower `findDuplicateFeatAcquisition`: a `lookup` stub supplies each feat's own corpus
// `repeatable`/`repeatAcquisitionDifferentiator` facts (never hardcoded to one named feat), and
// `answerFor` stubs each acquisition's own nested-choice answer.
describe('findIllegalRepeatAcquisition -- repeatable-aware, corpus-driven', () => {
  const nonRepeatable = () => ({ repeatable: false })
  const repeatableNoDifferentiator = () => ({ repeatable: true })
  const repeatableWithDifferentiator = () => ({ repeatable: true, differentiator: 'choice:feat.magic-initiate.list' })

  it('distinct feats are never duplicates, regardless of repeatability', () => {
    expect(findIllegalRepeatAcquisition(
      [
        { featRef: { packageId: PKG, slug: 'alert-xphb' }, choiceKey: 'a' },
        { featRef: { packageId: PKG, slug: 'lucky-xphb' }, choiceKey: 'b' }
      ],
      nonRepeatable,
      () => []
    )).toBeNull()
  })

  it('a NON-repeatable feat acquired twice is rejected by its canonical ref', () => {
    expect(findIllegalRepeatAcquisition(
      [
        { featRef: { packageId: PKG, slug: 'alert-xphb' }, choiceKey: 'a' },
        { featRef: { packageId: PKG, slug: 'alert-xphb' }, choiceKey: 'b' }
      ],
      nonRepeatable,
      () => []
    )).toBe(`${PKG}::alert-xphb`)
  })

  it('a repeatable feat with NO differentiator may be acquired more than once unconditionally (e.g. Ability Score Improvement)', () => {
    expect(findIllegalRepeatAcquisition(
      [
        { featRef: { packageId: PKG, slug: 'magic-initiate-xphb' }, choiceKey: 'a' },
        { featRef: { packageId: PKG, slug: 'magic-initiate-xphb' }, choiceKey: 'b' }
      ],
      repeatableNoDifferentiator,
      () => []
    )).toBeNull()
  })

  it('a repeatable feat WITH a differentiator is legal when the two acquisitions answer it differently', () => {
    const answers: Record<string, readonly string[]> = {
      'feat:a:choice:feat.magic-initiate.list': ['value:magic-initiate.list.1.active'],
      'feat:b:choice:feat.magic-initiate.list': ['value:magic-initiate.list.3.active']
    }
    expect(findIllegalRepeatAcquisition(
      [
        { featRef: { packageId: PKG, slug: 'magic-initiate-xphb' }, choiceKey: 'a' },
        { featRef: { packageId: PKG, slug: 'magic-initiate-xphb' }, choiceKey: 'b' }
      ],
      repeatableWithDifferentiator,
      (ownerKey, choiceSetId) => answers[`${ownerKey}:${choiceSetId}`] ?? []
    )).toBeNull()
  })

  it('a repeatable feat WITH a differentiator is rejected when the two acquisitions answer it identically', () => {
    const answers: Record<string, readonly string[]> = {
      'feat:a:choice:feat.magic-initiate.list': ['value:magic-initiate.list.1.active'],
      'feat:b:choice:feat.magic-initiate.list': ['value:magic-initiate.list.1.active']
    }
    expect(findIllegalRepeatAcquisition(
      [
        { featRef: { packageId: PKG, slug: 'magic-initiate-xphb' }, choiceKey: 'a' },
        { featRef: { packageId: PKG, slug: 'magic-initiate-xphb' }, choiceKey: 'b' }
      ],
      repeatableWithDifferentiator,
      (ownerKey, choiceSetId) => answers[`${ownerKey}:${choiceSetId}`] ?? []
    )).toBe(`${PKG}::magic-initiate-xphb`)
  })

  it('a repeatable feat WITH a differentiator left UNANSWERED on either side is never silently treated as "different" (empty vs. empty collides)', () => {
    // Both acquisitions answer with `[]` (genuinely unanswered) -- this function alone cannot tell
    // "unanswered" apart from "answered the same way" by design (see this function's own header):
    // callers (create-v2.post.ts) are expected to reject an unanswered feat-owned choice BEFORE
    // this runs. Proven here as a defense-in-depth property of the comparison itself: an empty
    // answer on BOTH sides is NOT accepted as "different".
    expect(findIllegalRepeatAcquisition(
      [
        { featRef: { packageId: PKG, slug: 'magic-initiate-xphb' }, choiceKey: 'a' },
        { featRef: { packageId: PKG, slug: 'magic-initiate-xphb' }, choiceKey: 'b' }
      ],
      repeatableWithDifferentiator,
      () => []
    )).toBe(`${PKG}::magic-initiate-xphb`)
  })
})

// HUMAN + GENERIC SELECTED-FEAT ACTIVATION PHASE -- `originFeatPresetChoices` re-derives a
// Background's own fixed Origin Feat's preset answer, purely from already-present data: the
// acquisition's own canonical choiceKey and the Background's CURRENT facet. Never a new persisted
// field, never Magic-Initiate-specific.
describe('originFeatPresetChoices -- Background-fixed preset, re-derived not persisted', () => {
  const canonicalKey = progressionChoiceKey(ORIGIN_FEAT_SLOT, 1, ORIGIN_FEAT_GRANT_SEGMENT)

  it('presets the Background\'s own fixed answer for ITS canonical origin-grant acquisition', () => {
    const acolyte = { packageId: PKG, rulesFacet: { originFeatSlug: 'magic-initiate-xphb', originFeatPreset: { 'choice:feat.magic-initiate.list': ['value:magic-initiate.list.1.active'] } } }
    expect(originFeatPresetChoices({ featRef: { packageId: PKG, slug: 'magic-initiate-xphb' }, choiceKey: canonicalKey }, acolyte))
      .toEqual({ 'choice:feat.magic-initiate.list': ['value:magic-initiate.list.1.active'] })
  })

  it('never presets a FREELY-chosen acquisition of the same feat (a different, non-canonical choiceKey)', () => {
    const acolyte = { packageId: PKG, rulesFacet: { originFeatSlug: 'magic-initiate-xphb', originFeatPreset: { 'choice:feat.magic-initiate.list': ['value:magic-initiate.list.1.active'] } } }
    expect(originFeatPresetChoices({ featRef: { packageId: PKG, slug: 'magic-initiate-xphb' }, choiceKey: 'species:choice:feat.origin-selection' }, acolyte))
      .toBeUndefined()
  })

  it('never presets when the Background declares no originFeatPreset at all (every Background before this phase)', () => {
    const plain = { packageId: PKG, rulesFacet: { originFeatSlug: 'alert-xphb' } }
    expect(originFeatPresetChoices({ featRef: { packageId: PKG, slug: 'alert-xphb' }, choiceKey: canonicalKey }, plain))
      .toBeUndefined()
  })

  it('never presets a feat that is not the Background\'s own declared originFeatSlug', () => {
    const acolyte = { packageId: PKG, rulesFacet: { originFeatSlug: 'magic-initiate-xphb', originFeatPreset: { 'choice:feat.magic-initiate.list': ['value:magic-initiate.list.1.active'] } } }
    expect(originFeatPresetChoices({ featRef: { packageId: PKG, slug: 'some-other-feat-xphb' }, choiceKey: canonicalKey }, acolyte))
      .toBeUndefined()
  })
})
