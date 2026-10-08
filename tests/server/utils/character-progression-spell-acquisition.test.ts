// D&D 2024 Character Rules P3.4 -- server/utils/character-progression-spell-acquisition.ts. Pure-
// function unit tests: target-level slot derivation off the REAL activated package, target-state
// plan correctness (never a per-level delta), the Wizard two-tier membership dependency WITHIN one
// planning call, Warlock's four independent Arcanum tiers, and the canonical CONFIRM-WRITE merge
// (`buildProgressionAcceptedSpellEntries`) -- which, unlike P3.3's creation-side
// `buildAcceptedSpellEntries`, must PATCH an already-persisted spell list rather than build one
// from scratch. No fake SpellRequirement definitions: every requirement set below is the REAL,
// shipped `dnd5e-2024.ts` class facet, via `findRulesFacet`.

import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

import { createWorldRuntime } from '../../../app/lib/rules/world-runtime'
import { parseExpression } from '../../../app/lib/rules/parser'
import type { Definition, RulesPackageManifest } from '../../../app/lib/rules/types'
import { findRulesFacet } from '../../../app/lib/content-rules'
import { resolveDnd5eSpellMechanics } from '../../../app/lib/spell-mechanics/dnd5e'
import type { SpellCatalogueEntry, TentativeSpellSelection } from '../../../app/lib/characters/spell-acquisition-plan'
import type { AssembledSpellEntry, StoredSpellEntry } from '../../../app/lib/characters/spellcasting'
import { slotTableRows } from '../../../server/utils/character-spell-acquisition'
import {
  buildProgressionAcceptedSpellEntries,
  buildProgressionSpellPlan,
  candidatesFromAssembledSpells,
  progressionSpellSlotLevels,
  spellAnswerKey,
  spellTentativeSelectionsFromAnswers,
  toProgressionSpellPlan
} from '../../../server/utils/character-progression-spell-acquisition'

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

// Built once, reused by every test below -- avoids re-loading/re-parsing the real on-disk package
// per test.
const SHARED_RUNTIME = loadRealRuntime()
function progressionSpellSlotLevelsFixture(targetLevel: number) {
  const facet = findRulesFacet('dnd5e.2024', 'class', 'wizard-xphb')!
  return progressionSpellSlotLevels(SHARED_RUNTIME.registry, facet, targetLevel)
}

function assembledFromStored(entries: readonly StoredSpellEntry[], catalogue: readonly SpellCatalogueEntry[]): AssembledSpellEntry[] {
  const byRef = new Map(catalogue.map((entry) => [`${entry.packageId}::${entry.slug}`, entry]))
  return entries.map((entry) => {
    const key = entry.ref ? `${entry.ref.packageId}::${entry.ref.slug}` : ''
    const catalogueEntry = byRef.get(key)
    return {
      ...entry,
      status: catalogueEntry ? ('resolved' as const) : ('missing' as const),
      title: catalogueEntry?.title ?? entry.name ?? 'Spell',
      entry: catalogueEntry
    }
  })
}

describe('progressionSpellSlotLevels -- the REAL activated package, target-level-aware (not fixed to Level 1)', () => {
  const runtime = loadRealRuntime()
  const wizardFacet = findRulesFacet('dnd5e.2024', 'class', 'wizard-xphb')!
  const paladinFacet = findRulesFacet('dnd5e.2024', 'class', 'paladin-xphb')!
  const warlockFacet = findRulesFacet('dnd5e.2024', 'class', 'warlock-xphb')!

  it('a full caster (Wizard) has a HIGHER max spell level at Level 20 than at Level 1', () => {
    const atL1 = progressionSpellSlotLevels(runtime.registry, wizardFacet, 1)
    const atL20 = progressionSpellSlotLevels(runtime.registry, wizardFacet, 20)
    const maxOf = (levels: readonly { level: number }[]) => Math.max(...levels.map((l) => l.level))
    expect(maxOf(atL1)).toBe(1)
    expect(maxOf(atL20)).toBeGreaterThan(maxOf(atL1))
  })

  it('a half caster (Paladin, Rules 0.21.0 corrected table) legally casts at Level 1 and scales by Level 20 -- no 2014 assumption', () => {
    const atL1 = progressionSpellSlotLevels(runtime.registry, paladinFacet, 1)
    const atL20 = progressionSpellSlotLevels(runtime.registry, paladinFacet, 20)
    expect(atL1.some((l) => l.level === 1 && l.max > 0)).toBe(true)
    const maxOf = (levels: readonly { level: number }[]) => Math.max(...levels.map((l) => l.level))
    expect(maxOf(atL20)).toBeGreaterThan(maxOf(atL1))
  })

  it('a Pact caster (Warlock) at Level 17 has a higher slot LEVEL than at Level 1 (Arcanum breakpoints depend on this)', () => {
    const atL1 = progressionSpellSlotLevels(runtime.registry, warlockFacet, 1)
    const atL17 = progressionSpellSlotLevels(runtime.registry, warlockFacet, 17)
    expect(atL1[0]?.level).toBe(1)
    expect(atL17[0]!.level).toBeGreaterThan(atL1[0]!.level)
  })

  it('a null registry (unconfigured World) fails closed to zero slot levels at any target', () => {
    expect(progressionSpellSlotLevels(null, wizardFacet, 20)).toEqual([])
  })

  it('a non-caster facet (no caster_type grant) is zero slots at every target', () => {
    const fighterFacet = findRulesFacet('dnd5e.2024', 'class', 'fighter-xphb')!
    expect(progressionSpellSlotLevels(runtime.registry, fighterFacet, 20)).toEqual([])
  })
})

describe('candidatesFromAssembledSpells', () => {
  it('translates known/prepared/requirementIds/mechanics straight through', () => {
    const entry: AssembledSpellEntry = {
      instanceId: 'spell-1', ref: { packageId: PKG, slug: 'fireball' }, known: true, prepared: true,
      requirementIds: ['req-a'], status: 'resolved', title: 'Fireball',
      entry: spellEntry('fireball', 3, ['Wizard'])
    }
    const [candidate] = candidatesFromAssembledSpells([entry])
    expect(candidate!.known).toBe(true)
    expect(candidate!.prepared).toBe(true)
    expect(candidate!.requirementIds).toEqual(['req-a'])
    expect(candidate!.mechanics?.level).toBe(3)
  })

  it('a row with no resolved catalogue entry (status: missing) carries null mechanics -- fails legality closed, never guessed', () => {
    const entry: AssembledSpellEntry = {
      instanceId: 'spell-1', ref: { packageId: PKG, slug: 'ghost' }, known: true, prepared: false,
      status: 'missing', title: 'ghost (unavailable)', reason: 'no longer bound'
    }
    const [candidate] = candidatesFromAssembledSpells([entry])
    expect(candidate!.mechanics).toBeNull()
  })

  it('an absent requirementIds field is omitted from the candidate too (legacy fallback stays available downstream)', () => {
    const entry: AssembledSpellEntry = {
      instanceId: 'spell-1', ref: { packageId: PKG, slug: 'light' }, known: true, prepared: false,
      status: 'resolved', title: 'Light', entry: spellEntry('light', 0, ['Wizard'])
    }
    const [candidate] = candidatesFromAssembledSpells([entry])
    expect(candidate).not.toHaveProperty('requirementIds')
  })
})

// ---------------------------------------------------------------------------
// WIZARD -- the critical two-tier case. Level 1 -> 2, 1 -> 8, 1 -> 20.
// ---------------------------------------------------------------------------
describe('buildProgressionSpellPlan -- WIZARD, target-state (never a per-level delta)', () => {
  const requirements = findRulesFacet('dnd5e.2024', 'class', 'wizard-xphb')!.spellRequirements!
  const spellbookId = requirements.find((r) => r.pool === 'spellbook')!.id
  const spellId = requirements.find((r) => r.pool === 'spell')!.id
  const cantripId = requirements.find((r) => r.pool === 'cantrip')!.id

  // The real, already-proven Level-1 creation state (P3.3): 3 cantrips, 6 spellbook (4 of which
  // are also prepared) -- see tests/server/utils/character-spell-acquisition.test.ts's own
  // identical fixture. Used here as the PERSISTED starting point every progression test below
  // builds on, never re-derived.
  const persistedSpellbook = [...'abcdef'].map((s) => s)
  const persistedPrepared = [...'abcd']
  const persistedCantrips = [...'xyz']
  const catalogue = [
    ...Array.from({ length: 60 }, (_, i) => spellEntry(`book-${i}`, 1, ['Wizard'])),
    ...persistedSpellbook.map((s) => spellEntry(s, 1, ['Wizard'])),
    ...Array.from({ length: 10 }, (_, i) => spellEntry(`cantrip-${i}`, 0, ['Wizard'])),
    ...persistedCantrips.map((s) => spellEntry(`c-${s}`, 0, ['Wizard']))
  ]
  const persistedStored: StoredSpellEntry[] = [
    ...persistedSpellbook.map((s) => ({
      instanceId: `spell-${s}`, ref: { packageId: PKG, slug: s }, known: true,
      prepared: persistedPrepared.includes(s), requirementIds: persistedPrepared.includes(s) ? [spellbookId, spellId] : [spellbookId]
    })),
    ...persistedCantrips.map((s) => ({
      instanceId: `spell-c-${s}`, ref: { packageId: PKG, slug: `c-${s}` }, known: true, prepared: false, requirementIds: [cantripId]
    }))
  ]
  const persisted = assembledFromStored(persistedStored, catalogue)

  it('Level 1 -> 2: already satisfied at Level 1\'s own totals -- the SAME totals apply at Level 2 too (Wizard\'s own real corpus has no Level-2 spell-count increase), so nothing new is missing', () => {
    const slots = progressionSpellSlotLevelsFixture(2)
    const plan = buildProgressionSpellPlan({ requirements, catalogue, spellSlotLevels: slots, targetLevel: 2, persisted, tentative: [] })
    const spellbookPlan = plan.requirements.find((r) => r.requirementId === spellbookId)!
    expect(spellbookPlan.target).toBe(requirements.find((r) => r.id === spellbookId)!.totalByLevel[1])
    expect(spellbookPlan.missing).toBe(Math.max(0, spellbookPlan.target - 6))
  })

  it('Level 1 -> 8: missing spellbook is EXACTLY target(8) - 6 (the real corpus\'s own 20 - 6 = 14), never a sum of per-level deltas', () => {
    const slots = progressionSpellSlotLevelsFixture(8)
    const plan = buildProgressionSpellPlan({ requirements, catalogue, spellSlotLevels: slots, targetLevel: 8, persisted, tentative: [] })
    const spellbookTarget = requirements.find((r) => r.id === spellbookId)!.totalByLevel[7]!
    expect(spellbookTarget).toBe(20) // the real corpus value this phase's own brief cites
    const spellbookPlan = plan.requirements.find((r) => r.requirementId === spellbookId)!
    expect(spellbookPlan.target).toBe(20)
    expect(spellbookPlan.legalCount).toBe(6)
    expect(spellbookPlan.missing).toBe(14)
  })

  it('Level 1 -> 20: missing spellbook/prepared/cantrip are each exactly target(20) - persisted, independently', () => {
    const slots = progressionSpellSlotLevelsFixture(20)
    const plan = buildProgressionSpellPlan({ requirements, catalogue, spellSlotLevels: slots, targetLevel: 20, persisted, tentative: [] })
    const byId = (id: string) => plan.requirements.find((r) => r.requirementId === id)!

    expect(byId(spellbookId).target).toBe(44)
    expect(byId(spellbookId).missing).toBe(44 - 6)
    expect(byId(spellId).target).toBe(25)
    expect(byId(spellId).missing).toBe(25 - 4)
    expect(byId(cantripId).target).toBe(5)
    expect(byId(cantripId).missing).toBe(5 - 3)
  })

  it('DEPENDENT EVALUATION -- a NEW tentative spellbook pick becomes an eligible PREPARED option in THIS SAME call, no save/reload/prepare round trip', () => {
    const slots = progressionSpellSlotLevelsFixture(8)
    const newSpellSlug = 'book-0'
    const tentativeAnswers: TentativeSpellSelection[] = [tentative(spellbookId, newSpellSlug)]
    const plan = buildProgressionSpellPlan({ requirements, catalogue, spellSlotLevels: slots, targetLevel: 8, persisted, tentative: tentativeAnswers })
    const spellPlan = plan.requirements.find((r) => r.requirementId === spellId)!
    // The freshly-added spellbook member is now a LEGAL prepared option -- never requiring it to
    // already have been a prepared pick in a PRIOR, separate call.
    expect(spellPlan.options.some((option) => option.slug === newSpellSlug)).toBe(true)
  })

  it('a target Level 2 character cannot acquire a spell above its own real max spell level', () => {
    const highLevelSpell = spellEntry('fireball-like', 3, ['Wizard'])
    const slots = progressionSpellSlotLevelsFixture(2)
    const plan = buildProgressionSpellPlan({
      requirements, catalogue: [...catalogue, highLevelSpell], spellSlotLevels: slots, targetLevel: 2, persisted,
      tentative: [tentative(spellbookId, 'fireball-like')]
    })
    const spellbookPlan = plan.requirements.find((r) => r.requirementId === spellbookId)!
    expect(spellbookPlan.issues.some((issue) => issue.kind === 'illegal-wrong-level')).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// WARLOCK -- four independent Arcanum tiers, crossed at 11/13/15/17.
// ---------------------------------------------------------------------------
describe('buildProgressionSpellPlan -- WARLOCK, Arcanum tiers appear only at their own real level, with zero cross-tier contamination', () => {
  const requirements = findRulesFacet('dnd5e.2024', 'class', 'warlock-xphb')!.spellRequirements!
  const tier = (level: 6 | 7 | 8 | 9) => requirements.find((r) => r.pool === 'arcanum' && r.filter.level === level)!.id
  const facet = findRulesFacet('dnd5e.2024', 'class', 'warlock-xphb')!
  const catalogue = [6, 7, 8, 9].map((level) => spellEntry(`arcanum-${level}`, level, ['Warlock']))

  it.each([
    [11, [6]], [13, [6, 7]], [15, [6, 7, 8]], [17, [6, 7, 8, 9]]
  ] as const)('at target Level %s, exactly tiers %j have a nonzero target', (targetLevel, expectedTiers) => {
    const slots = progressionSpellSlotLevels(SHARED_RUNTIME.registry, facet, targetLevel)
    const plan = buildProgressionSpellPlan({ requirements, catalogue, spellSlotLevels: slots, targetLevel, persisted: [], tentative: [] })
    for (const level of [6, 7, 8, 9] as const) {
      const requirementPlan = plan.requirements.find((r) => r.requirementId === tier(level))!
      expect(requirementPlan.target, `tier ${level} at target ${targetLevel}`).toBe(expectedTiers.includes(level) ? 1 : 0)
    }
  })

  it('an Arcanum-6 already persisted (satisfied) does not leak into Arcanum-7\'s own count at Level 13', () => {
    const slots = progressionSpellSlotLevels(SHARED_RUNTIME.registry, facet, 13)
    const persistedStored: StoredSpellEntry[] = [
      { instanceId: 'arc6', ref: { packageId: PKG, slug: 'arcanum-6' }, known: true, prepared: false, requirementIds: [tier(6)] }
    ]
    const persisted = assembledFromStored(persistedStored, catalogue)
    const plan = buildProgressionSpellPlan({ requirements, catalogue, spellSlotLevels: slots, targetLevel: 13, persisted, tentative: [] })
    expect(plan.requirements.find((r) => r.requirementId === tier(6))!.satisfied).toBe(true)
    const tier7 = plan.requirements.find((r) => r.requirementId === tier(7))!
    expect(tier7.legalCount).toBe(0)
    expect(tier7.missing).toBe(1)
  })
})

// ---------------------------------------------------------------------------
// HALF CASTERS -- Paladin/Ranger, target-level legality (Rules 0.21.0).
// ---------------------------------------------------------------------------
describe('buildProgressionSpellPlan -- PALADIN/RANGER half-caster target-level legality', () => {
  it.each(['paladin-xphb', 'ranger-xphb'] as const)('%s: the real spell-pool target grows strictly between Level 2 and Level 20', (classSlug) => {
    const requirements = findRulesFacet('dnd5e.2024', 'class', classSlug)!.spellRequirements!
    const facet = findRulesFacet('dnd5e.2024', 'class', classSlug)!
    const spellId = requirements.find((r) => r.pool === 'spell')!.id
    const catalogue = Array.from({ length: 30 }, (_, i) => spellEntry(`spell-${i}`, 1, ['Paladin', 'Ranger']))

    const atL2Slots = progressionSpellSlotLevels(SHARED_RUNTIME.registry, facet, 2)
    const atL20Slots = progressionSpellSlotLevels(SHARED_RUNTIME.registry, facet, 20)
    const atL2 = buildProgressionSpellPlan({ requirements, catalogue, spellSlotLevels: atL2Slots, targetLevel: 2, persisted: [], tentative: [] })
    const atL20 = buildProgressionSpellPlan({ requirements, catalogue, spellSlotLevels: atL20Slots, targetLevel: 20, persisted: [], tentative: [] })

    const targetAt = (plan: typeof atL2) => plan.requirements.find((r) => r.requirementId === spellId)!.target
    expect(targetAt(atL20)).toBeGreaterThan(targetAt(atL2))
  })
})

// ---------------------------------------------------------------------------
// toProgressionSpellPlan -- presentation shape, answer-key stability.
// ---------------------------------------------------------------------------
describe('toProgressionSpellPlan', () => {
  const requirements = findRulesFacet('dnd5e.2024', 'class', 'bard-xphb')!.spellRequirements!

  it('answerKey is stable: the SAME requirement + the SAME targetLevel always produce the SAME key, across two independent calls', () => {
    const a = spellAnswerKey(requirements[0]!, 5)
    const b = spellAnswerKey(requirements[0]!, 5)
    expect(a).toBe(b)
  })

  it('answerKey differs across requirements, and across target levels for the SAME requirement', () => {
    expect(spellAnswerKey(requirements[0]!, 5)).not.toBe(spellAnswerKey(requirements[1]!, 5))
    expect(spellAnswerKey(requirements[0]!, 5)).not.toBe(spellAnswerKey(requirements[0]!, 6))
  })

  it('label uses the shared pool-kind mapping, never a class name', () => {
    const catalogue = Array.from({ length: 10 }, (_, i) => spellEntry(`b-${i}`, 1, ['Bard']))
    const plan = buildProgressionSpellPlan({
      requirements, catalogue, spellSlotLevels: [{ level: 1, max: 1, expended: 0 }], targetLevel: 1, persisted: [], tentative: []
    })
    const presentation = toProgressionSpellPlan(requirements, plan, 1)
    for (const requirement of presentation.requirements) {
      expect(['Cantrips', 'Prepared Spells', 'Spellbook', 'Mystic Arcanum']).toContain(requirement.label)
    }
  })

  it('selectedRefs contains only catalogue-ref-backed identities, in wire (serializeContentRef) form', () => {
    const slug = 'bard-cantrip-0'
    const catalogue = [spellEntry(slug, 0, ['Bard'])]
    const cantripId = requirements.find((r) => r.pool === 'cantrip')!.id
    const plan = buildProgressionSpellPlan({
      requirements, catalogue, spellSlotLevels: [{ level: 1, max: 1, expended: 0 }], targetLevel: 1, persisted: [],
      tentative: [tentative(cantripId, slug)]
    })
    const presentation = toProgressionSpellPlan(requirements, plan, 1)
    const cantripPlan = presentation.requirements.find((r) => r.requirementId === cantripId)!
    expect(cantripPlan.selectedRefs).toContain(`${PKG}::${slug}`)
  })
})

// ---------------------------------------------------------------------------
// spellTentativeSelectionsFromAnswers -- wire decoding, THIS module's own fixed slot/at convention.
// ---------------------------------------------------------------------------
describe('spellTentativeSelectionsFromAnswers', () => {
  const requirements = findRulesFacet('dnd5e.2024', 'class', 'wizard-xphb')!.spellRequirements!

  it('decodes a well-formed answer at the exact key spellAnswerKey builds', () => {
    const requirement = requirements[0]!
    const key = spellAnswerKey(requirement, 8)
    const answers = { [key]: [`${PKG}::some-spell`] }
    const [selection] = spellTentativeSelectionsFromAnswers(answers, requirements, 8)
    expect(selection).toEqual({ requirementId: requirement.id, ref: { packageId: PKG, slug: 'some-spell' } })
  })

  it('an answer at the WRONG targetLevel\'s key is never decoded -- this session\'s answers do not leak into a different target', () => {
    const requirement = requirements[0]!
    const key = spellAnswerKey(requirement, 8)
    const answers = { [key]: [`${PKG}::some-spell`] }
    expect(spellTentativeSelectionsFromAnswers(answers, requirements, 20)).toEqual([])
  })

  it('a malformed ref string is silently skipped, never thrown', () => {
    const requirement = requirements[0]!
    const key = spellAnswerKey(requirement, 8)
    expect(spellTentativeSelectionsFromAnswers({ [key]: ['not-a-ref'] }, requirements, 8)).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// buildProgressionAcceptedSpellEntries -- CONFIRM WRITE, canonical merge (PATCH, never rebuild).
// ---------------------------------------------------------------------------
describe('buildProgressionAcceptedSpellEntries -- canonical merge onto EXISTING persisted rows', () => {
  const requirements = findRulesFacet('dnd5e.2024', 'class', 'wizard-xphb')!.spellRequirements!
  const spellbookId = requirements.find((r) => r.pool === 'spellbook')!.id
  const spellId = requirements.find((r) => r.pool === 'spell')!.id
  const catalogue = Array.from({ length: 60 }, (_, i) => spellEntry(`book-${i}`, 1, ['Wizard']))

  it('an existing physical row with NO accepted delta survives byte-for-byte (same instanceId, same fields)', () => {
    const persisted: StoredSpellEntry[] = [
      { instanceId: 'spell-1', ref: { packageId: PKG, slug: 'book-0' }, known: true, prepared: false, requirementIds: [spellbookId] }
    ]
    const plan = buildProgressionSpellPlan({
      requirements, catalogue, spellSlotLevels: [{ level: 1, max: 1, expended: 0 }], targetLevel: 1,
      persisted: assembledFromStored(persisted, catalogue), tentative: []
    })
    const next = buildProgressionAcceptedSpellEntries(persisted, requirements, plan, [])
    expect(next).toEqual(persisted)
  })

  it('a NEW identity (no existing row) gets exactly ONE new physical row, never duplicated across two requirements it satisfies at once', () => {
    const persisted: StoredSpellEntry[] = []
    const tentativeAnswers: TentativeSpellSelection[] = [
      tentative(spellbookId, 'book-0'),
      tentative(spellId, 'book-0')
    ]
    const plan = buildProgressionSpellPlan({
      requirements, catalogue, spellSlotLevels: [{ level: 1, max: 1, expended: 0 }], targetLevel: 1,
      persisted: [], tentative: tentativeAnswers
    })
    const next = buildProgressionAcceptedSpellEntries(persisted, requirements, plan, tentativeAnswers)
    expect(next).toHaveLength(1)
    expect(next[0]!.known).toBe(true)
    expect(next[0]!.prepared).toBe(true)
    expect(next[0]!.requirementIds).toEqual(expect.arrayContaining([spellbookId, spellId]))
  })

  it('an identity that ALREADY has a physical row (spellbook-only) gains the SECOND tag/flag on the SAME row -- never a duplicate row -- when a LATER confirm also accepts it as prepared', () => {
    const persisted: StoredSpellEntry[] = [
      { instanceId: 'spell-existing', ref: { packageId: PKG, slug: 'book-0' }, known: true, prepared: false, requirementIds: [spellbookId] }
    ]
    const tentativeAnswers: TentativeSpellSelection[] = [tentative(spellId, 'book-0')]
    const plan = buildProgressionSpellPlan({
      requirements, catalogue, spellSlotLevels: [{ level: 1, max: 1, expended: 0 }], targetLevel: 1,
      persisted: assembledFromStored(persisted, catalogue), tentative: tentativeAnswers
    })
    const next = buildProgressionAcceptedSpellEntries(persisted, requirements, plan, tentativeAnswers)
    expect(next).toHaveLength(1) // still one physical row
    expect(next[0]!.instanceId).toBe('spell-existing') // the SAME row, not a new one
    expect(next[0]!.known).toBe(true)
    expect(next[0]!.prepared).toBe(true)
    expect(next[0]!.requirementIds).toEqual(expect.arrayContaining([spellbookId, spellId]))
  })

  it('IDEMPOTENCY -- applying the identical accepted answers a second time reproduces the exact same physical rows, never a duplicate or a compounded flag', () => {
    const persisted: StoredSpellEntry[] = []
    const tentativeAnswers: TentativeSpellSelection[] = [tentative(spellbookId, 'book-0')]
    const plan = buildProgressionSpellPlan({
      requirements, catalogue, spellSlotLevels: [{ level: 1, max: 1, expended: 0 }], targetLevel: 1,
      persisted: [], tentative: tentativeAnswers
    })
    const firstPass = buildProgressionAcceptedSpellEntries(persisted, requirements, plan, tentativeAnswers)

    const secondPlan = buildProgressionSpellPlan({
      requirements, catalogue, spellSlotLevels: [{ level: 1, max: 1, expended: 0 }], targetLevel: 1,
      persisted: assembledFromStored(firstPass, catalogue), tentative: tentativeAnswers
    })
    const secondPass = buildProgressionAcceptedSpellEntries(firstPass, requirements, secondPlan, tentativeAnswers)
    expect(secondPass).toEqual(firstPass)
  })

  it('a tentative answer the plan did NOT accept (e.g. above the legal spell level) never produces a row', () => {
    const highLevelSpell = spellEntry('too-high', 9, ['Wizard'])
    const tentativeAnswers: TentativeSpellSelection[] = [tentative(spellbookId, 'too-high')]
    const plan = buildProgressionSpellPlan({
      requirements, catalogue: [...catalogue, highLevelSpell], spellSlotLevels: [{ level: 1, max: 1, expended: 0 }], targetLevel: 1,
      persisted: [], tentative: tentativeAnswers
    })
    const next = buildProgressionAcceptedSpellEntries([], requirements, plan, tentativeAnswers)
    expect(next).toEqual([])
  })
})
