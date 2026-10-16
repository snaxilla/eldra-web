// PHASE 2C.3A -- the Origin Feat corpus contract, checked against the REAL 5etools
// XPHB Background data. Every expectation is derived from the raw Background's own
// `feats` entry, so a Background's declaration can only pass if the package's
// facet says exactly what the source says. No test or application code branches
// on a Background name.
//
// FEAT-OWNED SPELL ACQUISITION PHASE -- re-derived directly, not trusted from this file's own
// prior assumption: the raw Background `feats` key for Magic Initiate is NOT a bare
// `"magic initiate|xphb"` -- it is `"magic initiate; cleric|xphb"` (Acolyte), `"...; druid|xphb"`
// (Guide), `"...; wizard|xphb"` (Sage). The `; <variant>` tail FIXES which spell list, per
// Background, in the corpus itself -- `rawFeatNameOf` below splits it off (mirroring the
// established treatment for Skilled's own `; <variant>` tail) because the package's own
// `originFeatSlug` names the FEAT identity only (`magic-initiate-xphb`); WHICH list is a separate
// fact, carried by the facet's own `grants` (see dnd5e-2024.ts's own Acolyte/Guide/Sage entries).

import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

import { findRulesFacet } from '../../app/lib/content-rules'
import { DND5E_2024_PROGRESSION_COVERAGE } from '../../app/lib/content-rules/dnd5e-2024-progression-coverage'

const DATA_ROOT = '/opt/eldra/datasets/5etools-src/data'

type RawBackground = { name: string, source: string, feats?: Record<string, boolean>[] }

// The raw feat key is `<name>|xphb`, optionally with a `; <variant>` choice/fixed-variant tail
// (Magic Initiate, Skilled). The slug the package uses is the lowercased feat NAME only -- the
// variant tail, when present, is a separate fact (see this file's own header above).
function rawFeatNameOf(background: RawBackground): string {
  const keys = (background.feats ?? []).flatMap((entry) => Object.keys(entry))
  expect(keys.length, `${background.name} must declare exactly one feat entry`).toBe(1)
  return keys[0]!.split('|')[0]!.split(';')[0]!.trim()
}

// Magic Initiate's own fixed variant per granting Background, re-derived directly from the raw
// `; <variant>` tail -- mapped to the package's own opaque `value:magic-initiate.list.N.active`
// convention (list.1 = Cleric, list.2 = Druid, list.3 = Wizard; see dnd5e-2024.ts's own header).
const MAGIC_INITIATE_VARIANT_VALUE: Record<string, string> = { cleric: 'value:magic-initiate.list.1.active', druid: 'value:magic-initiate.list.2.active', wizard: 'value:magic-initiate.list.3.active' }
function rawFeatVariantOf(background: RawBackground): string | null {
  const keys = (background.feats ?? []).flatMap((entry) => Object.keys(entry))
  const tail = keys[0]!.split('|')[0]!.split(';')[1]
  return tail ? tail.trim() : null
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

  // FEAT-OWNED SPELL ACQUISITION PHASE -- Magic Initiate (Acolyte/Guide/Sage) is now ALSO fixed-
  // supported (its own spell decisions are representable via spellRequirements/requiresActive, no
  // ChoiceSet needed since the real corpus fixes the list per Background) -- every real XPHB
  // Background now declares `originFeatSlug`, never `creationUnavailable`.
  it('every XPHB Background has a facet, and every facet is fixed-supported (originFeatSlug), none creation-unavailable', () => {
    for (const { background, facet } of CLASSIFIED) {
      expect(facet, `No facet for ${background.name}`).toBeDefined()
      expect(facet?.originFeatSlug, `${background.name} must declare originFeatSlug`).not.toBeUndefined()
      expect(facet?.creationUnavailable, `${background.name} must not be creation-unavailable`).toBeUndefined()
    }
  })

  // P1: Crafter, Musician, and Skilled are representable (their tool and skill-or-tool choices are
  // facet choices over Definition ids). FEAT-OWNED SPELL ACQUISITION PHASE: Magic Initiate
  // (Acolyte/Guide/Sage) is now representable too (spellRequirements + requiresActive).
  it('all 16 Backgrounds are supported, and they cover 10 unique Origin feats', () => {
    const supported = CLASSIFIED.filter(({ facet }) => facet?.originFeatSlug !== undefined)
    expect(supported).toHaveLength(16)
    expect(new Set(supported.map(({ facet }) => facet?.originFeatSlug)).size).toBe(10)
  })

  it('zero Backgrounds are creation-unavailable', () => {
    expect(CLASSIFIED.filter(({ facet }) => facet?.creationUnavailable !== undefined)).toHaveLength(0)
  })

  it('a supported Background\'s declared Origin feat is the feat its own corpus entry grants', () => {
    for (const { background, facet } of CLASSIFIED) {
      if (facet?.originFeatSlug === undefined) continue
      const expected = `${rawFeatNameOf(background).toLowerCase().replace(/ /g, '-')}-xphb`
      expect(facet.originFeatSlug, `${background.name} grants ${rawFeatNameOf(background)}`).toBe(expected)
    }
  })

  // FEAT-OWNED SPELL ACQUISITION PHASE -- for Magic Initiate specifically, the raw `; <variant>`
  // tail fixes WHICH spell list.
  // HUMAN + GENERIC SELECTED-FEAT ACTIVATION PHASE -- proven against the facet's own
  // `originFeatPreset` (never the originFeatSlug field, which names the feat identity only; never
  // `grants`, which this phase removed -- a global grant could no longer distinguish a
  // Background-fixed acquisition from a freely-chosen one, see dnd5e-2024.ts's own header on
  // Acolyte/Guide/Sage). The preset answers Magic Initiate's own nested
  // `choice:feat.magic-initiate.list` choice directly.
  it('Magic Initiate\'s own fixed variant per Background matches the raw corpus tail, via the granting facet\'s own originFeatPreset', () => {
    for (const { background, facet } of CLASSIFIED) {
      if (facet?.originFeatSlug !== 'magic-initiate-xphb') continue
      const variant = rawFeatVariantOf(background)
      expect(variant, `${background.name}'s Magic Initiate must name a variant`).not.toBeNull()
      const expectedValue = MAGIC_INITIATE_VARIANT_VALUE[variant!]
      expect(expectedValue, `${background.name}'s variant "${variant}" must be a known list`).toBeDefined()
      expect(facet?.originFeatPreset?.['choice:feat.magic-initiate.list'], `${background.name} must preset ${expectedValue}`).toEqual([expectedValue])
    }
  })

  it('the supported Background set is exactly the set whose Origin feat is fixed', () => {
    const supported = CLASSIFIED
      .filter(({ facet }) => facet?.originFeatSlug !== undefined)
      .map(({ background, facet }) => `${background.name}->${facet?.originFeatSlug}`)
      .sort()
    expect(supported).toEqual([
      'Acolyte->magic-initiate-xphb',
      'Artisan->crafter-xphb',
      'Charlatan->skilled-xphb',
      'Criminal->alert-xphb',
      'Entertainer->musician-xphb',
      'Farmer->tough-xphb',
      'Guard->alert-xphb',
      'Guide->magic-initiate-xphb',
      'Hermit->healer-xphb',
      'Merchant->lucky-xphb',
      'Noble->skilled-xphb',
      'Sage->magic-initiate-xphb',
      'Sailor->tavern-brawler-xphb',
      'Scribe->skilled-xphb',
      'Soldier->savage-attacker-xphb',
      'Wayfarer->lucky-xphb'
    ])
  })

  it('the ledger records the Origin Feat honestly: both fixed-feat-identity and fixed-spell-list acquisition are IMPLEMENTED; effects separate', () => {
    const fixed = DND5E_2024_PROGRESSION_COVERAGE.find((e) => e.id === 'background:origin-feat:fixed-acquisition')
    expect(fixed?.status).toBe('IMPLEMENTED')
    expect(fixed?.implementationRef).toBe('facet:background.originFeatSlug')
    // FEAT-OWNED SPELL ACQUISITION PHASE -- RECLASSIFIED IMPLEMENTED (was ENGINE_BLOCKED): Magic
    // Initiate's own spell decisions are representable now too.
    const choiceRow = DND5E_2024_PROGRESSION_COVERAGE.find((e) => e.id === 'background:origin-feat:choice-acquisition')
    expect(choiceRow?.status).toBe('IMPLEMENTED')
    const effects = DND5E_2024_PROGRESSION_COVERAGE.filter((e) => e.featureName.startsWith('Origin Feat effect: '))
    expect(effects).toHaveLength(6)
    for (const effect of effects) expect(effect.status).not.toBe('IMPLEMENTED')
  })
})
