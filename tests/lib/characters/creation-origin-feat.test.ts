// PHASE 2C.3A -- the pure creation Origin feat authority. The real XPHB feat
// fixture supplies the feat mechanics; the Background shape is the minimal
// structured facet the authority reads. No Background name is branched on.

import { describe, expect, it } from 'vitest'
import {
  findDuplicateFeatAcquisition,
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

describe('findDuplicateFeatAcquisition -- one feat, one acquisition at creation', () => {
  it('distinct feats are not duplicates', () => {
    expect(findDuplicateFeatAcquisition([
      { featRef: { packageId: PKG, slug: 'alert-xphb' }, choiceKey: 'a' },
      { featRef: { packageId: PKG, slug: 'lucky-xphb' }, choiceKey: 'b' }
    ])).toBeNull()
  })

  it('the same feat acquired twice is reported by its canonical ref', () => {
    expect(findDuplicateFeatAcquisition([
      { featRef: { packageId: PKG, slug: 'alert-xphb' }, choiceKey: 'a' },
      { featRef: { packageId: PKG, slug: 'alert-xphb' }, choiceKey: 'b' }
    ])).toBe(`${PKG}::alert-xphb`)
  })
})
