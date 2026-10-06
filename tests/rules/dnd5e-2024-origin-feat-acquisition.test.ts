// PHASE 2C.3A -- the Origin Feat corpus contract, checked against the REAL 5etools
// XPHB Background data. Every expectation is derived from the raw Background's own
// `feats` entry, so a Background's declaration can only pass if the package's
// facet says exactly what the source says. No test or application code branches
// on a Background name.

import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

import { findRulesFacet } from '../../app/lib/content-rules'
import { DND5E_2024_PROGRESSION_COVERAGE } from '../../app/lib/content-rules/dnd5e-2024-progression-coverage'

const DATA_ROOT = '/opt/eldra/datasets/5etools-src/data'

type RawBackground = { name: string, source: string, feats?: Record<string, boolean>[] }

// The raw feat key is `<name>|xphb`, optionally with a `; <variant>` choice tail
// (Magic Initiate, Skilled). The slug the package uses is the lowercased name.
function rawFeatNameOf(background: RawBackground): string {
  const keys = (background.feats ?? []).flatMap((entry) => Object.keys(entry))
  expect(keys.length, `${background.name} must declare exactly one feat entry`).toBe(1)
  return keys[0]!.split('|')[0]!
}

const RAW_BACKGROUNDS = (JSON.parse(readFileSync(`${DATA_ROOT}/backgrounds.json`, 'utf8')) as { background: RawBackground[] })
  .background
  .filter((background) => background.source === 'XPHB')

const CLASSIFIED = RAW_BACKGROUNDS.map((background) => {
  const facet = findRulesFacet('dnd5e.2024', 'background', `${background.name.toLowerCase().replace(/ /g, '-')}-xphb`)
  return { background, facet }
})

describe('PHASE 2C.3A -- Background Origin feat declarations match the real XPHB corpus', () => {
  it('the corpus holds exactly 16 XPHB Backgrounds, each with one fixed feat entry', () => {
    expect(RAW_BACKGROUNDS).toHaveLength(16)
    for (const background of RAW_BACKGROUNDS) rawFeatNameOf(background)
  })

  it('every XPHB Background has a facet, and each facet is either supported or blocked, never both', () => {
    for (const { background, facet } of CLASSIFIED) {
      expect(facet, `No facet for ${background.name}`).toBeDefined()
      const supported = facet?.originFeatSlug !== undefined
      const blocked = facet?.creationUnavailable !== undefined
      expect(supported !== blocked, `${background.name} must be exactly one of supported or creation-unavailable`).toBe(true)
    }
  })

  // P1: Crafter, Musician, and Skilled are representable (their tool and skill-or-tool choices are
  // facet choices over Definition ids), so their Backgrounds are supported. Magic Initiate is not.
  it('exactly 13 Backgrounds are supported, and they cover 9 unique Origin feats', () => {
    const supported = CLASSIFIED.filter(({ facet }) => facet?.originFeatSlug !== undefined)
    expect(supported).toHaveLength(13)
    expect(new Set(supported.map(({ facet }) => facet?.originFeatSlug)).size).toBe(9)
  })

  it('exactly 3 Backgrounds (the Magic Initiate Origin feat) are creation-unavailable', () => {
    expect(CLASSIFIED.filter(({ facet }) => facet?.creationUnavailable !== undefined)).toHaveLength(3)
  })

  it('a supported Background\'s declared Origin feat is the feat its own corpus entry grants', () => {
    for (const { background, facet } of CLASSIFIED) {
      if (facet?.originFeatSlug === undefined) continue
      const expected = `${rawFeatNameOf(background).toLowerCase().replace(/ /g, '-')}-xphb`
      expect(facet.originFeatSlug, `${background.name} grants ${rawFeatNameOf(background)}`).toBe(expected)
    }
  })

  it('the supported Background set is exactly the set whose Origin feat is fixed or representably chosen', () => {
    const supported = CLASSIFIED
      .filter(({ facet }) => facet?.originFeatSlug !== undefined)
      .map(({ background, facet }) => `${background.name}->${facet?.originFeatSlug}`)
      .sort()
    expect(supported).toEqual([
      'Artisan->crafter-xphb',
      'Charlatan->skilled-xphb',
      'Criminal->alert-xphb',
      'Entertainer->musician-xphb',
      'Farmer->tough-xphb',
      'Guard->alert-xphb',
      'Hermit->healer-xphb',
      'Merchant->lucky-xphb',
      'Noble->skilled-xphb',
      'Sailor->tavern-brawler-xphb',
      'Scribe->skilled-xphb',
      'Soldier->savage-attacker-xphb',
      'Wayfarer->lucky-xphb'
    ])
  })

  it('the blocked set is exactly the Magic Initiate Origin Backgrounds, and every reason is user-facing prose', () => {
    const blocked = CLASSIFIED.filter(({ facet }) => facet?.creationUnavailable !== undefined)
    expect(blocked.map(({ background }) => background.name).sort()).toEqual([
      'Acolyte', 'Guide', 'Sage'
    ])
    for (const { facet } of blocked) {
      expect(facet?.creationUnavailable).toMatch(/cannot record yet\.$/)
      expect(facet?.creationUnavailable).not.toMatch(/ENGINE_BLOCKED|CONTENT_BLOCKED|[a-z]+\.[a-z.]+:/)
    }
  })

  it('the ledger splits the Origin Feat honestly: fixed acquisition IMPLEMENTED, choice set blocked, effects separate', () => {
    const fixed = DND5E_2024_PROGRESSION_COVERAGE.find((e) => e.id === 'background:origin-feat:fixed-acquisition')
    expect(fixed?.status).toBe('IMPLEMENTED')
    expect(fixed?.implementationRef).toBe('facet:background.originFeatSlug')
    expect(DND5E_2024_PROGRESSION_COVERAGE.find((e) => e.id === 'background:origin-feat:choice-acquisition')?.status).toBe('ENGINE_BLOCKED')
    const effects = DND5E_2024_PROGRESSION_COVERAGE.filter((e) => e.featureName.startsWith('Origin Feat effect: '))
    expect(effects).toHaveLength(6)
    for (const effect of effects) expect(effect.status).not.toBe('IMPLEMENTED')
  })
})
