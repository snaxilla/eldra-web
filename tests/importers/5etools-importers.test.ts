// Characterization tests for Eldra's existing 5e.tools preview importers
// (app/lib/importers/*). These tests capture CURRENT behavior so that future
// Rules Translation work (see .github/docs/architecture/rules-engine.md,
// Phase T1+) can widen importer output additively without silently changing
// what these pure functions produce today.
//
// These tests call the pure preview*() functions directly. They do not
// start Nuxt, do not hit HTTP routes, and do not touch Directus.
//
// Every preview function except preview5eToolsMonsters stamps
// import_source.imported_at with `new Date().toISOString()`. Fake timers
// pin that to a fixed instant so snapshots are deterministic.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  preview5eToolsBackgrounds,
  preview5eToolsClasses,
  preview5eToolsFeats,
  preview5eToolsItems,
  preview5eToolsMonsters,
  preview5eToolsSpecies,
  preview5eToolsSpells
} from '../../app/lib/importers'

import classesFixture from './fixtures/5etools-classes.json'
import speciesFixture from './fixtures/5etools-species.json'
import backgroundsFixture from './fixtures/5etools-backgrounds.json'
import featsFixture from './fixtures/5etools-feats.json'
import itemsFixture from './fixtures/5etools-items.json'
import spellsFixture from './fixtures/5etools-spells.json'
import monstersFixture from './fixtures/5etools-monsters.json'

const FROZEN_NOW = '2024-01-01T00:00:00.000Z'

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date(FROZEN_NOW))
})

afterEach(() => {
  vi.useRealTimers()
})

describe('preview5eToolsClasses', () => {
  it('matches the current preview result for a class with a structured hit die and features', () => {
    const result = preview5eToolsClasses(classesFixture)
    expect(result).toMatchSnapshot()
  })

  it('currently reduces a structured { number, faces } hit die down to "dF" (the number is dropped)', () => {
    // normalizeHitDie() checks `if (hd.faces)` before `if (hd.number && hd.faces)`,
    // so the number-aware branch is unreachable today -- captured as-is.
    const result = preview5eToolsClasses(classesFixture)
    const block = result.items[0].blocks.find((b) => b.blockKey === 'class_core')
    expect(block?.data?.hit_die).toBe('d10')
  })

  it('preserves source identity/provenance in the preview entity', () => {
    const result = preview5eToolsClasses(classesFixture)
    const entity = result.items[0]

    expect(entity.provider).toBe('5etools-json')
    expect(entity.externalId).toBe('Test Vanguard__TEST')
    expect(entity.sourceBook).toBe('TEST')
    expect(entity.sourcePage).toBe('12')
    expect(entity.raw).toEqual((classesFixture as any).class[0])

    const importSourceBlock = entity.blocks.find((b) => b.blockKey === 'import_source')
    expect(importSourceBlock?.data?.provider).toBe('5etools-json')
    expect(importSourceBlock?.data?.external_id).toBe('Test Vanguard__TEST')
    expect(importSourceBlock?.data?.raw_json).toEqual((classesFixture as any).class[0])
    expect(importSourceBlock?.data?.imported_at).toBe(FROZEN_NOW)
  })

  it('emits a warning and zero items for a payload with no classes', () => {
    const result = preview5eToolsClasses({})
    expect(result.count).toBe(0)
    expect(result.items).toEqual([])
    expect(result.warnings).toEqual(['No classes found'])
  })

  // Species/Class Context Content pass -- regression fixtures for the
  // actual reproduced failing structure (not a hypothetical one): the real
  // XPHB Fighter's own `primaryAbility` is `[{str:true},{dex:true}]`, which
  // the OLD normalizePrimaryAbility (plain `textify()`) serialized to
  // literal JSON text because that shape matched none of textify's
  // recognized object cases. Verified against the real dataset
  // (/opt/eldra/datasets/5etools-src/data/class/class-fighter.json) before
  // writing this fixture.
  it('reads a real Fighter-shaped primaryAbility ([{str:true},{dex:true}]) as "Strength or Dexterity", never as JSON', () => {
    const result = preview5eToolsClasses({
      class: [{
        name: 'Fixture Fighter',
        source: 'TEST',
        page: 1,
        hd: { number: 1, faces: 10 },
        proficiency: ['str', 'con'],
        primaryAbility: [{ str: true }, { dex: true }]
      }]
    })

    const block = result.items[0].blocks.find((b) => b.blockKey === 'class_core')
    expect(block?.data?.primary_ability).toBe('Strength or Dexterity')
    expect(block?.data?.primary_ability).not.toMatch(/[{}]/)
    expect(block?.data?.primary_ability).not.toContain('"str"')
  })

  it('reads a required-pair primaryAbility ([{dex:true, wis:true}]) as "Dexterity and Wisdom"', () => {
    const result = preview5eToolsClasses({
      class: [{
        name: 'Fixture Monk',
        source: 'TEST',
        primaryAbility: [{ dex: true, wis: true }]
      }]
    })

    const block = result.items[0].blocks.find((b) => b.blockKey === 'class_core')
    expect(block?.data?.primary_ability).toBe('Dexterity and Wisdom')
  })

  // The generic textify() fallback this field also used to route through
  // for any OTHER unrecognized shape (previously JSON.stringify, now
  // delegated to content-presentation/dnd5e.ts's own flattenEntries) --
  // exercised here via a synthetic {type:'table', ...} node nested inside
  // `entries` (real XPHB classes carry their tables in a separate
  // `classTableGroups` field rather than top-level `entries`, so this
  // fixture constructs the shape directly to prove the fallback itself,
  // independent of whether any real class payload currently reaches it).
  it('flattens an embedded 5etools table instead of ever emitting raw JSON for an unrecognized entries shape', () => {
    const result = preview5eToolsClasses({
      class: [{
        name: 'Fixture Tabled Class',
        source: 'TEST',
        entries: [
          'Some prose.',
          {
            type: 'table',
            colLabels: ['Level', 'Feature'],
            rows: [['1', 'Example Feature']]
          }
        ]
      }]
    })

    const block = result.items[0].blocks.find((b) => b.blockKey === 'class_core')
    expect(block?.data?.description).toContain('Some prose.')
    expect(block?.data?.description).toContain('Example Feature')
    expect(block?.data?.description).not.toMatch(/[{}]/)
  })

  // Species/Class Context Content pass (owner follow-up, "useful content"
  // gap): textify()'s own leaf-string branches used to return a raw
  // 5etools string verbatim, {@tag ...} markup and all -- a real class's
  // own top-level `entries` description can embed e.g. {@variantrule ...}
  // tags. Now cleaned via clean5eText, same as the Class Features/Starting
  // Equipment sections.
  it('strips {@tag} markup from the class description text', () => {
    const result = preview5eToolsClasses({
      class: [{
        name: 'Fixture Tagged Class',
        source: 'TEST',
        entries: ['You can finish a {@variantrule Long Rest|XPHB|long rest} in half the time.']
      }]
    })

    const block = result.items[0].blocks.find((b) => b.blockKey === 'class_core')
    expect(block?.data?.description).toBe('You can finish a Long Rest in half the time.')
    expect(block?.data?.description).not.toContain('{@')
  })
})

describe('preview5eToolsSpecies', () => {
  it('matches the current preview result for a species with a named trait section', () => {
    const result = preview5eToolsSpecies(speciesFixture)
    expect(result).toMatchSnapshot()
  })

  it('only carries forward entries shaped as { type: "entries", name, entries } as traits', () => {
    const result = preview5eToolsSpecies(speciesFixture)
    const block = result.items[0].blocks.find((b) => b.blockKey === 'species_core')

    expect(block?.data?.traits).toContain('## Darkvision')
    expect(block?.data?.traits).not.toContain('non-trait flavor line')
  })

  // Species/Class Context Content pass -- the rail's own "Traits" meta
  // line (server/utils/entity-collection-summary.ts) reads
  // core.rawTraitCount || core.trait_count, a field this importer never
  // actually set before this pass (always undefined, so the line was
  // always silently blank). trait_count now mirrors the SAME named-section
  // filter `traits` is built from.
  it('sets trait_count to the number of named trait sections carried into traits', () => {
    const result = preview5eToolsSpecies(speciesFixture)
    const block = result.items[0].blocks.find((b) => b.blockKey === 'species_core')

    expect(block?.data?.trait_count).toBe(1)
  })

  // Regression fixture for the actual failing structure: a species'
  // ability-score-increase field in the shape an older/legacy-style
  // payload can carry it ({str:1, con:1}) matched none of textify()'s
  // recognized object shapes, so it fell to JSON.stringify -- reproduced
  // directly in the committed fixture (5etools-species.json's own
  // `ability` field) and asserted explicitly here, not only via the
  // snapshot above.
  it('never emits raw JSON for an unrecognized ability-score-increase shape', () => {
    const result = preview5eToolsSpecies(speciesFixture)
    const block = result.items[0].blocks.find((b) => b.blockKey === 'species_core')

    expect(block?.data?.ability_score_increase).not.toMatch(/[{}]/)
  })

  // Species/Class Context Content pass (owner follow-up, "useful content"
  // gap): discovered while verifying gap #2 (existing published content) --
  // the real XPHB Elf's own Darkvision/Fey Ancestry/Keen Senses traits each
  // embed at least one {@sense...}/{@condition...}/{@skill...} tag, and
  // textify() never cleaned its own leaf-string branches before this fix.
  it('strips {@tag} markup from named trait section text', () => {
    const result = preview5eToolsSpecies({
      race: [{
        name: 'Fixture Elf',
        source: 'TEST',
        entries: [
          {
            type: 'entries',
            name: 'Fey Ancestry',
            entries: ['You have Advantage on saving throws to avoid or end the {@condition Charmed|XPHB} condition.']
          }
        ]
      }]
    })

    const block = result.items[0].blocks.find((b) => b.blockKey === 'species_core')
    expect(block?.data?.traits).toContain(
      'You have Advantage on saving throws to avoid or end the Charmed condition.'
    )
    expect(block?.data?.traits).not.toContain('{@')
  })
})

describe('preview5eToolsBackgrounds', () => {
  it('matches the current preview result for a background with a structured skill choice', () => {
    const result = preview5eToolsBackgrounds(backgroundsFixture)
    expect(result).toMatchSnapshot()
  })

  it('currently flattens a structured { choose: { from, count } } skill proficiency into JSON text', () => {
    const result = preview5eToolsBackgrounds(backgroundsFixture)
    const block = result.items[0].blocks.find((b) => b.blockKey === 'background_core')

    // This is the exact flattening behavior identified in
    // .github/docs/architecture/rules-engine.md §2.12: a machine-readable
    // ChoiceSet-shaped object currently survives only as opaque JSON text.
    expect(block?.data?.skill_proficiencies).toContain('"choose"')
    expect(block?.data?.skill_proficiencies).toContain('"count": 2')
  })
})

describe('preview5eToolsFeats', () => {
  it('matches the current preview result for a feat using 5etools {@tag} markup', () => {
    const result = preview5eToolsFeats(featsFixture)
    expect(result).toMatchSnapshot()
  })

  it('currently strips {@skill ...} 5etools tag markup down to its display text', () => {
    const result = preview5eToolsFeats(featsFixture)
    const block = result.items[0].blocks.find((b) => b.blockKey === 'feat_core')

    expect(block?.data?.benefits).toContain('such as Perception.')
    expect(block?.data?.benefits).not.toContain('{@skill')
  })
})

describe('preview5eToolsItems', () => {
  it('matches the current preview result for an item with structured value/damage/AC', () => {
    const result = preview5eToolsItems(itemsFixture)
    expect(result).toMatchSnapshot()
  })

  it('preserves source identity/provenance in the preview entity', () => {
    const result = preview5eToolsItems(itemsFixture)
    const entity = result.items[0]

    expect(entity.provider).toBe('5etools-json')
    expect(entity.externalId).toBe('item__Test Blade of Placeholder__TEST')
    // extractItemsFromPayload() tags every raw item with __importKind before
    // returning it, so `raw` is the source object plus that one extra field.
    expect(entity.raw).toEqual({ ...(itemsFixture as any).item[0], __importKind: 'item' })
  })
})

describe('preview5eToolsSpells', () => {
  it('matches the current preview result for a spell with structured time/range/duration', () => {
    const result = preview5eToolsSpells(spellsFixture)
    expect(result).toMatchSnapshot()
  })

  it('currently normalizes structured casting time/range/duration into short display strings', () => {
    const result = preview5eToolsSpells(spellsFixture)
    const block = result.items[0].blocks.find((b) => b.blockKey === 'spell_core')

    expect(block?.data?.casting_time).toBe('1 action')
    expect(block?.data?.range).toBe('30 feet')
    expect(block?.data?.duration).toBe('Instantaneous')
    expect(block?.data?.components).toBe('V, S')
  })
})

describe('preview5eToolsMonsters', () => {
  // preview5eToolsMonsters does not call new Date() and does not follow the
  // EldraImportPreviewResult shape (no provider/systemKey/count) -- its
  // output is already fully deterministic without fake timers.

  it('matches the current preview result for a monster with matched fluff', () => {
    const result = preview5eToolsMonsters(monstersFixture)
    expect(result).toMatchSnapshot()
  })

  it('currently flattens creature type and speed into the statblock JSON fields', () => {
    const result = preview5eToolsMonsters(monstersFixture) as any
    const statblock = result.items[0]._monsterData.statblock

    expect(statblock.creature_type).toBe('construct (clockwork)')
    expect(statblock.armor_class).toBe(15)
    expect(statblock.hit_points_average).toBe(45)
    expect(statblock.hit_points_formula).toBe('6d8 + 18')
    expect(statblock.speed_json).toEqual({ walk: 20, climb: 10 })
  })

  it('carries the raw monster payload forward for both statblock and profile', () => {
    const result = preview5eToolsMonsters(monstersFixture) as any
    const rawMonster = (monstersFixture as any).monster[0]

    expect(result.items[0]._monsterData.statblock.raw_payload_json).toEqual(rawMonster)
    expect(result.items[0]._monsterData.monsterProfile.raw_payload_json).toEqual(rawMonster)
  })

  it('emits a warning and zero items for a payload with no monsters', () => {
    const result = preview5eToolsMonsters({}) as any
    expect(result.items).toEqual([])
    expect(result.warnings).toEqual(['No monsters found in payload.'])
  })
})
