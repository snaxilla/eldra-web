// D&D 2024 Character Rules P3.3 -- server/utils/character-spell-acquisition.ts. Pure-function unit
// tests: caster-type derivation, Level-1 slot derivation off the REAL activated package, failure
// messages, and -- the phase's own first acceptance gate -- the canonical write-side merge
// (`buildAcceptedSpellEntries`) proven against the REAL Level-1 Wizard requirement set, including
// the exact cross-pool collision scenario P3.2.1 fixed.

import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

import { createWorldRuntime } from '../../../app/lib/rules/world-runtime'
import { parseExpression } from '../../../app/lib/rules/parser'
import type { Definition, RulesPackageManifest } from '../../../app/lib/rules/types'
import { findRulesFacet } from '../../../app/lib/content-rules'
import { resolveDnd5eSpellMechanics } from '../../../app/lib/spell-mechanics/dnd5e'
import { spellIdentityOf, validateSpellRequirements, type SpellStateCandidate } from '../../../app/lib/characters/spell-requirements'
import type { SpellCatalogueEntry, TentativeSpellSelection } from '../../../app/lib/characters/spell-acquisition-plan'
import type { StoredSpellEntry } from '../../../app/lib/characters/spellcasting'
import {
  buildAcceptedSpellEntries,
  buildCreationSpellPlan,
  casterTypeOf,
  creationSpellSlotLevels,
  describeSpellPlanFailure,
  slotTableRows
} from '../../../server/utils/character-spell-acquisition'

const PKG = 'eldra.solaris.xphb'
const PACKAGE_DIR = 'packages/eldra-dnd5e-2024'

function hydrate(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(hydrate)
  if (node && typeof node === 'object') {
    const record = node as Record<string, unknown>
    if (typeof record.text === 'string' && !record.ast) {
      const parsed = parseExpression(record.text)
      if (!parsed.ok) throw new Error(`Failed to parse: ${record.text}`)
      return { text: record.text, ast: parsed.ast }
    }
    return Object.fromEntries(Object.entries(record).map(([k, v]) => [k, hydrate(v)]))
  }
  return node
}

function loadRealRuntime() {
  const manifest = JSON.parse(readFileSync(`${PACKAGE_DIR}/manifest.json`, 'utf8')) as RulesPackageManifest
  const definitions = hydrate(JSON.parse(readFileSync(`${PACKAGE_DIR}/definitions.json`, 'utf8'))) as Definition[]
  const result = createWorldRuntime(manifest, definitions, '5', null)
  if (!result.ok) throw new Error(`runtime build failed: ${result.stage}`)
  return result.runtimePackage
}

function spellEntry(slug: string, level: number, classLists: string[], title = slug): SpellCatalogueEntry {
  return { packageId: PKG, slug, title, spellMechanics: resolveDnd5eSpellMechanics({ name: title, source: 'XPHB', level, school: 'V', classLists })! }
}

function tentative(requirementId: string, slug: string): TentativeSpellSelection {
  return { requirementId, ref: { packageId: PKG, slug } }
}

describe('casterTypeOf -- real class facets, all 8 casters', () => {
  it.each([
    ['bard-xphb', 'full'], ['cleric-xphb', 'full'], ['druid-xphb', 'full'], ['sorcerer-xphb', 'full'], ['wizard-xphb', 'full'],
    ['paladin-xphb', 'half'], ['ranger-xphb', 'half'],
    ['warlock-xphb', 'pact']
  ] as const)('%s -> %s', (slug, expected) => {
    const facet = findRulesFacet('dnd5e.2024', 'class', slug)!
    expect(casterTypeOf(facet)).toBe(expected)
  })

  it('a non-caster class (no caster_type grant) resolves to null', () => {
    const facet = findRulesFacet('dnd5e.2024', 'class', 'fighter-xphb')
    expect(casterTypeOf(facet)).toBeNull()
  })

  it('an absent facet resolves to null', () => {
    expect(casterTypeOf(undefined)).toBeNull()
    expect(casterTypeOf(null)).toBeNull()
  })
})

describe('slotTableRows / creationSpellSlotLevels -- the REAL activated package, Level 1', () => {
  const runtime = loadRealRuntime()

  it.each(['full', 'half', 'pact'] as const)('%s caster: Level 1 has at least one Level-1 slot (Rules 0.21.0)', (casterType) => {
    const rows = slotTableRows(runtime.registry, casterType)
    const levels = creationSpellSlotLevels(casterType, rows)
    expect(levels.some((l) => l.level === 1 && l.max > 0)).toBe(true)
  })

  it('an unconfigured registry (no table found) fails closed to zero slot levels', () => {
    const rows = slotTableRows({ getById: () => undefined }, 'full')
    expect(creationSpellSlotLevels('full', rows)).toEqual([])
  })

  it('a null caster type (non-caster) never looks up a table at all', () => {
    expect(slotTableRows(runtime.registry, null)).toBeUndefined()
  })
})

describe('describeSpellPlanFailure', () => {
  it('returns null once the plan is complete', () => {
    const plan = buildCreationSpellPlan({ requirements: [], catalogue: [], spellSlotLevels: [], tentative: [] })
    expect(describeSpellPlanFailure(plan)).toBeNull()
  })

  it('names the first unsatisfied requirement\'s own pool and missing count', () => {
    const requirements = findRulesFacet('dnd5e.2024', 'class', 'cleric-xphb')!.spellRequirements!
    const plan = buildCreationSpellPlan({ requirements, catalogue: [], spellSlotLevels: [{ level: 1, max: 1, expended: 0 }], tentative: [] })
    expect(describeSpellPlanFailure(plan)).toMatch(/Choose \d+ more \w+ spell/)
  })
})

describe('buildAcceptedSpellEntries -- Wizard Level-1 success path (3 cantrip + 6 spellbook + 4 prepared)', () => {
  const requirements = findRulesFacet('dnd5e.2024', 'class', 'wizard-xphb')!.spellRequirements!
  const spellbookId = requirements.find((r) => r.pool === 'spellbook')!.id
  const spellId = requirements.find((r) => r.pool === 'spell')!.id
  const cantripId = requirements.find((r) => r.pool === 'cantrip')!.id
  const catalogue = [
    ...[...'abcdef'].map((s) => spellEntry(s, 1, ['Wizard'])),
    ...[...'xyz'].map((s) => spellEntry(`c-${s}`, 0, ['Wizard']))
  ]
  const slots = [{ level: 1, max: 2, expended: 0 }]

  const tentativeAnswers: TentativeSpellSelection[] = [
    ...[...'abcdef'].map((s) => tentative(spellbookId, s)),
    ...[...'abcd'].map((s) => tentative(spellId, s)),
    ...[...'xyz'].map((s) => tentative(cantripId, `c-${s}`))
  ]

  const plan = buildCreationSpellPlan({ requirements, catalogue, spellSlotLevels: slots, tentative: tentativeAnswers })

  it('the plan is complete before any write is attempted', () => {
    expect(plan.complete).toBe(true)
  })

  it('persists exactly 9 physical rows (6 spellbook + 3 cantrip), never 10 (no duplicate row for the 4 also-prepared spells)', () => {
    const entries = buildAcceptedSpellEntries(requirements, plan, tentativeAnswers)
    expect(entries).toHaveLength(9)
  })

  it('cantrip rows are tagged ONLY the cantrip requirement', () => {
    const entries = buildAcceptedSpellEntries(requirements, plan, tentativeAnswers)
    for (const s of [...'xyz']) {
      const row = entries.find((e) => e.ref?.slug === `c-${s}`)!
      expect(row.known).toBe(true)
      expect(row.prepared).toBe(false)
      expect(row.requirementIds).toEqual([cantripId])
    }
  })

  it('spellbook-only rows (e/f) are tagged ONLY the spellbook requirement', () => {
    const entries = buildAcceptedSpellEntries(requirements, plan, tentativeAnswers)
    for (const s of ['e', 'f']) {
      const row = entries.find((e) => e.ref?.slug === s)!
      expect(row.known).toBe(true)
      expect(row.prepared).toBe(false)
      expect(row.requirementIds).toEqual([spellbookId])
    }
  })

  it('spellbook+prepared rows (a-d) are ONE physical row each, tagged BOTH requirements, known AND prepared', () => {
    const entries = buildAcceptedSpellEntries(requirements, plan, tentativeAnswers)
    for (const s of [...'abcd']) {
      const matches = entries.filter((e) => e.ref?.slug === s)
      expect(matches).toHaveLength(1) // never a duplicate physical row
      expect(matches[0]!.known).toBe(true)
      expect(matches[0]!.prepared).toBe(true)
      expect(matches[0]!.requirementIds).toEqual(expect.arrayContaining([spellbookId, spellId]))
      expect(matches[0]!.requirementIds).toHaveLength(2)
    }
  })

  it('every row carries a stable, sequential instanceId (nextInstanceId convention)', () => {
    const entries = buildAcceptedSpellEntries(requirements, plan, tentativeAnswers)
    expect(new Set(entries.map((e) => e.instanceId)).size).toBe(entries.length)
  })

  it('a tentative answer the plan did NOT accept (e.g. a duplicate) never produces a row', () => {
    const withDuplicate = [...tentativeAnswers, tentative(cantripId, 'c-x')] // duplicate of an existing cantrip answer
    const dupPlan = buildCreationSpellPlan({ requirements, catalogue, spellSlotLevels: slots, tentative: withDuplicate })
    const entries = buildAcceptedSpellEntries(requirements, dupPlan, withDuplicate)
    expect(entries.filter((e) => e.ref?.slug === 'c-x')).toHaveLength(1) // still exactly one row, not two
  })
})

function candidatesFromEntries(entries: readonly StoredSpellEntry[], catalogue: readonly SpellCatalogueEntry[]): SpellStateCandidate[] {
  const byRef = new Map(catalogue.map((entry) => [`${entry.packageId}::${entry.slug}`, entry]))
  return entries.map((entry) => {
    const key = entry.ref ? `${entry.ref.packageId}::${entry.ref.slug}` : ''
    const catalogueEntry = byRef.get(key)
    return {
      identity: spellIdentityOf(entry),
      known: entry.known,
      prepared: entry.prepared,
      mechanics: catalogueEntry?.spellMechanics ?? null,
      ...(entry.requirementIds ? { requirementIds: entry.requirementIds } : {})
    }
  })
}

describe('PERSISTENCE SENSITIVITY -- fresh-reload correctness genuinely depends on persisted requirementIds (Wizard + Warlock)', () => {
  it('Wizard: tagged persisted rows validate complete; stripping requirementIds reproduces the pre-P3.2.1 cross-pool collision; the original rows are untouched', () => {
    const requirements = findRulesFacet('dnd5e.2024', 'class', 'wizard-xphb')!.spellRequirements!
    const spellbookId = requirements.find((r) => r.pool === 'spellbook')!.id
    const spellId = requirements.find((r) => r.pool === 'spell')!.id
    const cantripId = requirements.find((r) => r.pool === 'cantrip')!.id
    const catalogue = [
      ...[...'abcdef'].map((s) => spellEntry(s, 1, ['Wizard'])),
      ...[...'xyz'].map((s) => spellEntry(`c-${s}`, 0, ['Wizard']))
    ]
    const slots = [{ level: 1, max: 2, expended: 0 }]
    const tentativeAnswers: TentativeSpellSelection[] = [
      ...[...'abcdef'].map((s) => tentative(spellbookId, s)),
      ...[...'abcd'].map((s) => tentative(spellId, s)),
      ...[...'xyz'].map((s) => tentative(cantripId, `c-${s}`))
    ]
    const plan = buildCreationSpellPlan({ requirements, catalogue, spellSlotLevels: slots, tentative: tentativeAnswers })
    const entries = Object.freeze(buildAcceptedSpellEntries(requirements, plan, tentativeAnswers))

    // A FRESH reload: no Builder, no tentative state -- just the persisted entries + the catalogue.
    const taggedCandidates = candidatesFromEntries(entries, catalogue)
    const taggedResults = validateSpellRequirements({ requirements, characterLevel: 1, spellSlotLevels: slots, candidates: taggedCandidates })
    expect(taggedResults.every((r) => r.satisfied)).toBe(true)

    // Simulate historical/broken provenance: a COPY with every requirementIds field stripped.
    const untaggedCandidates = taggedCandidates.map(({ requirementIds, ...rest }) => rest)
    const untaggedResults = validateSpellRequirements({ requirements, characterLevel: 1, spellSlotLevels: slots, candidates: untaggedCandidates })
    expect(untaggedResults.every((r) => r.satisfied)).toBe(false) // the exact pre-P3.2.1 collision, reproduced on demand

    // The original persisted entries were never touched by any of this.
    expect(entries).toHaveLength(9)
    for (const entry of entries) expect(entry.requirementIds?.length).toBeGreaterThan(0)
  })

  it('Warlock (Level 11): tagged persisted rows (cantrip + ordinary + Arcanum-6) validate complete; stripping requirementIds reproduces the collision; originals untouched', () => {
    const requirements = findRulesFacet('dnd5e.2024', 'class', 'warlock-xphb')!.spellRequirements!
    const cantripId = requirements.find((r) => r.pool === 'cantrip')!.id
    const spellId = requirements.find((r) => r.pool === 'spell')!.id
    const tier6Id = requirements.find((r) => r.pool === 'arcanum' && r.filter.level === 6)!.id
    const cantripTarget = requirements.find((r) => r.pool === 'cantrip')!.totalByLevel[10]!
    const spellTarget = requirements.find((r) => r.pool === 'spell')!.totalByLevel[10]!

    const catalogue = [
      ...Array.from({ length: cantripTarget }, (_, i) => spellEntry(`cantrip-${i}`, 0, ['Warlock'])),
      ...Array.from({ length: spellTarget }, (_, i) => spellEntry(`ordinary-${i}`, 1, ['Warlock'])),
      spellEntry('arcanum-six', 6, ['Warlock'])
    ]
    const tentativeAnswers: TentativeSpellSelection[] = [
      ...Array.from({ length: cantripTarget }, (_, i) => tentative(cantripId, `cantrip-${i}`)),
      ...Array.from({ length: spellTarget }, (_, i) => tentative(spellId, `ordinary-${i}`)),
      tentative(tier6Id, 'arcanum-six')
    ]
    const slots = [{ level: 3, max: 2, expended: 0 }]
    const plan = buildCreationSpellPlan({ requirements, catalogue, spellSlotLevels: slots, tentative: tentativeAnswers })
    const entries = Object.freeze(buildAcceptedSpellEntries(requirements, plan, tentativeAnswers))

    const taggedCandidates = candidatesFromEntries(entries, catalogue)
    const taggedResults = validateSpellRequirements({ requirements, characterLevel: 11, spellSlotLevels: slots, candidates: taggedCandidates })
    expect(taggedResults.every((r) => r.satisfied)).toBe(true)

    const untaggedCandidates = taggedCandidates.map(({ requirementIds, ...rest }) => rest)
    const untaggedResults = validateSpellRequirements({ requirements, characterLevel: 11, spellSlotLevels: slots, candidates: untaggedCandidates })
    expect(untaggedResults.every((r) => r.satisfied)).toBe(false)

    expect(entries).toHaveLength(cantripTarget + spellTarget + 1)
    for (const entry of entries) expect(entry.requirementIds?.length).toBeGreaterThan(0)
  })
})
