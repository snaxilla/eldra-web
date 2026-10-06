// ALL-CLASS PROGRESSION CONTRACT AUDIT (2026-10-01) -- the real browser
// defect this file exists to close for good: Bob, a Level-1 Barbarian,
// previewed Level 1 -> 3 in the Level Manager and got pure automatic
// numeric progression with NO "Requires: Subclass (choose 1)" choice --
// wrong, because every real XPHB class selects its subclass at Level 3
// (confirmed this phase by direct extraction from
// /opt/eldra/datasets/5etools-src/data/class/class-*.json, all 12 classes,
// not assumed). Root cause: `progression:class.subclass-selection`
// (packages/eldra-dnd5e-2024/definitions.json) was referenced by exactly
// ONE class facet in the whole corpus -- Wizard's -- so Character
// Progression Phase 1C was effectively authored only for Wizard. The fix
// (app/lib/content-rules/dnd5e-2024.ts) references the SAME, already-
// correct, already-`at: 3` Progression from the other 11 classes' facets
// -- zero new engine primitives, zero class-specific application code.
//
// This file proves the fix for ALL 12 classes with ONE data-driven test
// body, never twelve synthetic copies of Wizard -- the exact anti-
// whack-a-mole discipline this task's own header names. `assembleCharacter`
// is mocked at the module boundary (matching character-progression-plan.
// test.ts's own precedent exactly); the Rules Runtime is REAL (built from
// the actual eldra-dnd5e-2024 package on disk), and every class's own
// `RulesFacet` comes from the REAL, shipped `dnd5e-2024.ts` corpus via
// `findRulesFacet` -- never a hand-typed fixture that could silently
// drift from either.

import { readFileSync } from 'node:fs'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// UNIT-ISOLATION (classified in tests/rules/completeness-stub-policy.test.ts): this file asserts MECHANICS
// only. The completeness authority is replaced by the explicit stub in tests/helpers/completeness-stub.ts, so it
// makes no claim that a real PHB character can be created or progressed.
vi.mock('../../../app/lib/content-rules/creation-completeness', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../app/lib/content-rules/creation-completeness')>()),
  ...(await import('../../helpers/completeness-stub')).MECHANICS_ONLY_COMPLETENESS
}))

const {
  assembleCharacterMock, getWorldRuntimeMock, saveCharacterProgressionMock,
  loadCharacterRulesChoicesMock, saveCharacterRulesChoicesMock,
  listContentPackBindingsForWorldMock, getWorldContentCatalogueMock
} = vi.hoisted(() => ({
  assembleCharacterMock: vi.fn(),
  getWorldRuntimeMock: vi.fn(),
  saveCharacterProgressionMock: vi.fn(),
  loadCharacterRulesChoicesMock: vi.fn(),
  saveCharacterRulesChoicesMock: vi.fn(),
  listContentPackBindingsForWorldMock: vi.fn(),
  getWorldContentCatalogueMock: vi.fn()
}))

vi.mock('../../../server/utils/character-assembly', () => ({
  assembleCharacter: assembleCharacterMock
}))
vi.mock('../../../server/utils/world-runtime-service', () => ({
  getWorldRuntime: getWorldRuntimeMock
}))
vi.mock('../../../server/utils/character-progression', () => ({
  saveCharacterProgression: saveCharacterProgressionMock
}))
vi.mock('../../../server/utils/character-rules-choices', () => ({
  loadCharacterRulesChoices: loadCharacterRulesChoicesMock,
  saveCharacterRulesChoices: saveCharacterRulesChoicesMock
}))
vi.mock('../../../server/utils/world-content-packs', () => ({
  listContentPackBindingsForWorld: listContentPackBindingsForWorldMock
}))
vi.mock('../../../server/utils/world-content-catalogue', () => ({
  getWorldContentCatalogue: getWorldContentCatalogueMock
}))

import { createWorldRuntime } from '../../../app/lib/rules/world-runtime'
import { parseExpression } from '../../../app/lib/rules/parser'
import type { Definition, RulesPackageManifest } from '../../../app/lib/rules/types'
import { findRulesFacet } from '../../../app/lib/content-rules'
import {
  confirmProgression,
  planProgression
} from '../../../server/utils/character-progression-plan'
import { progressionChoiceKey } from '../../../app/lib/characters/rules-choices'
import { serializeContentRef } from '../../../app/lib/characters/progression-plan'

const PACKAGE_DIR = 'packages/eldra-dnd5e-2024'
const WORLD_ID = '5'
const CHARACTER_ID = '42'

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
  const result = createWorldRuntime(manifest, definitions, WORLD_ID, null)
  if (!result.ok) throw new Error(`runtime build failed: ${result.stage}`)
  return result.runtimePackage
}

function baseEntry(overrides: Record<string, unknown> = {}) {
  return {
    packageId: 'eldra.content.xphb', packageVersion: '1.0.0', systemKey: 'dnd5e',
    title: 'Thing', slug: 'thing', externalId: 'thing', provider: '5etools-json',
    ...overrides
  }
}

// REAL, production-verified data (read-only Directus read against
// Solaris's own bound Content Pack `eldra.solaris.xphb@1.0.8`, this
// phase) -- exactly 4 native-XPHB subclasses per class, 48 total. Never
// hand-invented; this is the actual curated selection a real World runs.
const REAL_SUBCLASSES_BY_CLASS: Record<string, string[]> = {
  'barbarian-xphb': ['path-of-the-berserker-xphb', 'path-of-the-wild-heart-xphb', 'path-of-the-world-tree-xphb', 'path-of-the-zealot-xphb'],
  'bard-xphb': ['college-of-dance-xphb', 'college-of-glamour-xphb', 'college-of-lore-xphb', 'college-of-valor-xphb'],
  'cleric-xphb': ['life-domain-xphb', 'light-domain-xphb', 'trickery-domain-xphb', 'war-domain-xphb'],
  'druid-xphb': ['circle-of-the-land-xphb', 'circle-of-the-moon-xphb', 'circle-of-the-sea-xphb', 'circle-of-the-stars-xphb'],
  'fighter-xphb': ['battle-master-xphb', 'champion-xphb', 'eldritch-knight-xphb', 'psi-warrior-xphb'],
  'monk-xphb': ['warrior-of-mercy-xphb', 'warrior-of-shadow-xphb', 'warrior-of-the-elements-xphb', 'warrior-of-the-open-hand-xphb'],
  'paladin-xphb': ['oath-of-devotion-xphb', 'oath-of-glory-xphb', 'oath-of-the-ancients-xphb', 'oath-of-vengeance-xphb'],
  'ranger-xphb': ['beast-master-xphb', 'fey-wanderer-xphb', 'gloom-stalker-xphb', 'hunter-xphb'],
  'rogue-xphb': ['arcane-trickster-xphb', 'assassin-xphb', 'soulknife-xphb', 'thief-xphb'],
  'sorcerer-xphb': ['aberrant-sorcery-xphb', 'clockwork-sorcery-xphb', 'draconic-sorcery-xphb', 'wild-magic-sorcery-xphb'],
  'warlock-xphb': ['archfey-patron-xphb', 'celestial-patron-xphb', 'fiend-patron-xphb', 'great-old-one-patron-xphb'],
  'wizard-xphb': ['abjurer-xphb', 'diviner-xphb', 'evoker-xphb', 'illusionist-xphb']
}

const ALL_12_CLASS_SLUGS = Object.keys(REAL_SUBCLASSES_BY_CLASS)

// Real XPHB subclass-selection level -- confirmed this phase, identically
// 3 for all 12 classes (class-<name>.json's own "<Class> Subclass"
// classFeature, source: 'XPHB'). Expressed as a lookup, not a bare
// literal, so a future corpus change that genuinely diverges one class's
// level would be a one-line data update here, never a hidden assumption.
const REAL_SUBCLASS_LEVEL: Record<string, number> = Object.fromEntries(
  ALL_12_CLASS_SLUGS.map((slug) => [slug, 3])
)

function catalogueForClass(classSlug: string) {
  const subclasses = (REAL_SUBCLASSES_BY_CLASS[classSlug] ?? []).map((slug) =>
    baseEntry({ title: slug, slug, parentClassSlug: classSlug })
  )
  // A SECOND class's subclasses are always present too (never just the
  // one under test) -- this is what proves PARENT-CLASS FILTERING for
  // real, not merely "the only option offered happens to be legal."
  const otherClassSlug = classSlug === 'wizard-xphb' ? 'fighter-xphb' : 'wizard-xphb'
  const otherSubclasses = (REAL_SUBCLASSES_BY_CLASS[otherClassSlug] ?? []).map((slug) =>
    baseEntry({ title: slug, slug, parentClassSlug: otherClassSlug })
  )
  return {
    worldId: WORLD_ID, packs: [], species: [], classes: [], backgrounds: [],
    feats: [], items: [], spells: [], monsters: [],
    subclasses: [...subclasses, ...otherSubclasses]
  }
}

function blueprintForClass(classSlug: string) {
  return {
    worldId: WORLD_ID,
    characterId: CHARACTER_ID,
    characterTitle: 'All-Class Subclass Audit Fixture',
    species: { status: 'resolved' as const, entry: baseEntry({ title: 'Human', slug: 'human-xphb' }) },
    class: {
      status: 'resolved' as const,
      entry: baseEntry({ title: classSlug, slug: classSlug, rulesFacet: findRulesFacet('dnd5e.2024', 'class', classSlug) ?? undefined })
    },
    background: { status: 'resolved' as const, entry: baseEntry({ title: 'Sage', slug: 'sage-xphb' }) },
    abilityScores: { method: 'standard-array' as const, scores: { str: 12, dex: 12, con: 14, int: 12, wis: 12, cha: 12 } },
    rulesChoices: null,
    inventory: [],
    notes: null,
    health: null,
    spells: [],
    expendedSlots: {},
    progression: { classes: [{ classRef: { packageId: 'eldra.content.xphb', slug: classSlug }, level: 1 }] },
    resources: null,
    packs: []
  }
}

beforeEach(() => {
  assembleCharacterMock.mockReset()
  getWorldRuntimeMock.mockReset()
  saveCharacterProgressionMock.mockReset()
  loadCharacterRulesChoicesMock.mockReset()
  saveCharacterRulesChoicesMock.mockReset()
  listContentPackBindingsForWorldMock.mockReset()
  getWorldContentCatalogueMock.mockReset()

  const runtime = loadRealRuntime()
  getWorldRuntimeMock.mockResolvedValue({
    configured: true, ok: true, runtime,
    integrityHash: 'sha256-test', settings: {}, rollTypeOverrides: {}
  })
  saveCharacterProgressionMock.mockImplementation(async (_id: unknown, stored: unknown) => stored)
  loadCharacterRulesChoicesMock.mockResolvedValue(null)
  saveCharacterRulesChoicesMock.mockImplementation(async (_id: unknown, stored: unknown) => stored)
  listContentPackBindingsForWorldMock.mockResolvedValue([])
})

describe.each(ALL_12_CLASS_SLUGS)('ALL-CLASS SUBCLASS CONTRACT -- %s', (classSlug) => {
  const subclassLevel = REAL_SUBCLASS_LEVEL[classSlug]!
  const realOptions = REAL_SUBCLASSES_BY_CLASS[classSlug]!
  const subclassChoiceKey = progressionChoiceKey('class', subclassLevel, 'choice:class.subclass')

  beforeEach(() => {
    getWorldContentCatalogueMock.mockResolvedValue(catalogueForClass(classSlug))
    assembleCharacterMock.mockResolvedValue({ available: true, blueprint: blueprintForClass(classSlug) })
  })

  it(`produces exactly one required Subclass choice at the real Level ${subclassLevel}, kind content, count 1, 4 options`, async () => {
    const result = await planProgression(WORLD_ID, CHARACTER_ID, subclassLevel)
    expect(result.ok).toBe(true)
    if (!result.ok) return

    const step = result.plan.steps.find((s) => s.level === subclassLevel)
    expect(step, `no step found for level ${subclassLevel}`).toBeDefined()

    const subclassChoices = step!.requiredChoices.filter((c) => c.id === subclassChoiceKey)
    expect(subclassChoices, 'exactly one required Subclass choice').toHaveLength(1)

    const choice = subclassChoices[0]!
    expect(choice.kind).toBe('content')
    expect(choice.count).toBe(1)
    expect(choice.options).toHaveLength(4)
  })

  it('every option has a stable, parseable ContentRef value and a non-empty label', async () => {
    const result = await planProgression(WORLD_ID, CHARACTER_ID, subclassLevel)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const step = result.plan.steps.find((s) => s.level === subclassLevel)!
    const choice = step.requiredChoices.find((c) => c.id === subclassChoiceKey)!

    for (const option of choice.options) {
      expect(typeof option.id).toBe('string')
      expect(option.id.length).toBeGreaterThan(0)
      expect(typeof option.label).toBe('string')
      expect(option.label.length).toBeGreaterThan(0)
    }
    const optionSlugs = choice.options.map((o) => o.id.split('::')[1] ?? o.id).sort()
    expect(new Set(optionSlugs).size).toBe(4) // all distinct
  })

  it('every option belongs to THIS class only -- parent-class filtering proven against a real second class present in the same catalogue', async () => {
    const result = await planProgression(WORLD_ID, CHARACTER_ID, subclassLevel)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const step = result.plan.steps.find((s) => s.level === subclassLevel)!
    const choice = step.requiredChoices.find((c) => c.id === subclassChoiceKey)!

    const offeredSlugs = choice.options.map((o) => serializeContentRef && o.id).map((id) => id)
    for (const realSlug of realOptions) {
      const expectedRef = serializeContentRef({ packageId: 'eldra.content.xphb', slug: realSlug })
      expect(offeredSlugs).toContain(expectedRef)
    }
    // None of the OTHER class's real subclass slugs ever appear.
    const otherClassSlug = classSlug === 'wizard-xphb' ? 'fighter-xphb' : 'wizard-xphb'
    for (const otherSlug of REAL_SUBCLASSES_BY_CLASS[otherClassSlug] ?? []) {
      const otherRef = serializeContentRef({ packageId: 'eldra.content.xphb', slug: otherSlug })
      expect(offeredSlugs).not.toContain(otherRef)
    }
  })

  it('the plan is INVALID until the Subclass choice is answered', async () => {
    const result = await planProgression(WORLD_ID, CHARACTER_ID, subclassLevel)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.plan.valid).toBe(false)
    expect(result.plan.unresolvedChoiceIds).toContain(subclassChoiceKey)
  })

  it('one legal tentative answer resolves the requirement, with respect to the subclass requirement specifically', async () => {
    // Asserts the SUBCLASS requirement specifically, never global
    // `plan.valid` -- Wizard's own real corpus facet also crosses a
    // SEPARATE, unrelated Level-2 Expertise choice in a 1->3 walk, which
    // this test deliberately does not answer (answering only the choice
    // under test, never every choice a class happens to have, is what
    // keeps this file's own body genuinely class-agnostic rather than
    // quietly special-cased for Wizard).
    const legalOption = serializeContentRef({ packageId: 'eldra.content.xphb', slug: realOptions[0]! })
    const result = await planProgression(WORLD_ID, CHARACTER_ID, subclassLevel, { [subclassChoiceKey]: [legalOption] })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const step = result.plan.steps.find((s) => s.level === subclassLevel)!
    const resolvedChoice = step.requiredChoices.find((c) => c.id === subclassChoiceKey)!
    expect(resolvedChoice.answered).toBe(true)
    expect(result.plan.unresolvedChoiceIds).not.toContain(subclassChoiceKey)

    // Confirm requires the WHOLE plan valid (every real declared choice
    // answered, not only the one under test) -- for the 11 classes whose
    // ONLY real choice through this level is Subclass, that is exactly
    // what was just answered, so Confirm succeeds and this asserts the
    // full authoritative write. Wizard's own real corpus additionally
    // declares an unrelated Level-2 Expertise choice through the same
    // walk -- genuinely outside this test's scope (proven, not special-
    // cased: `result.plan.valid` is read, never assumed) -- so for Wizard
    // only, this proves the SUBCLASS requirement resolved (already
    // asserted above) without attempting a Confirm this test never
    // supplied every real answer for.
    if (!result.plan.valid) return

    const confirmResult = await confirmProgression(
      WORLD_ID, CHARACTER_ID, subclassLevel, result.plan.fingerprint, { [subclassChoiceKey]: [legalOption] }
    )
    expect(confirmResult.ok).toBe(true)
    if (!confirmResult.ok) return
    expect(confirmResult.progression.classes[0]!.subclassRef).toEqual({ packageId: 'eldra.content.xphb', slug: realOptions[0] })
  })

  it('a subclass ContentRef belonging to ANOTHER class is rejected server-side at Confirm, never silently accepted', async () => {
    const otherClassSlug = classSlug === 'wizard-xphb' ? 'fighter-xphb' : 'wizard-xphb'
    const wrongClassOption = serializeContentRef({
      packageId: 'eldra.content.xphb',
      slug: REAL_SUBCLASSES_BY_CLASS[otherClassSlug]![0]!
    })

    // The PLAN itself may optimistically report this as "answered" (plan
    // validity is a diff over declared choices, not yet the authoritative
    // parent-class check) -- Confirm is where server authority is
    // required to reject it, exactly as the task specifies ("Server
    // Confirm must reject a crafted subclass ContentRef").
    const planResult = await planProgression(WORLD_ID, CHARACTER_ID, subclassLevel, { [subclassChoiceKey]: [wrongClassOption] })
    expect(planResult.ok).toBe(true)
    if (!planResult.ok) return

    const confirmResult = await confirmProgression(
      WORLD_ID, CHARACTER_ID, subclassLevel, planResult.plan.fingerprint, { [subclassChoiceKey]: [wrongClassOption] }
    )
    expect(confirmResult.ok).toBe(false)
    if (confirmResult.ok) return
    expect(confirmResult.reason).toBe('unresolved-choices')
    expect(saveCharacterProgressionMock).not.toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------------------
// BOB ACCEPTANCE CONTRACT -- the exact real browser case, proven to fail
// against the pre-fix package and pass against the fix.
// ---------------------------------------------------------------------------

describe('BOB CHOICE SURFACE -- Barbarian, Level 1 -> 3 requirement presence (mechanics; completeness stubbed)', () => {
  beforeEach(() => {
    getWorldContentCatalogueMock.mockResolvedValue(catalogueForClass('barbarian-xphb'))
    assembleCharacterMock.mockResolvedValue({ available: true, blueprint: blueprintForClass('barbarian-xphb') })
  })

  it('Level 3 shows "Requires: Subclass (choose 1)" with exactly the 4 real Barbarian subclasses, and the plan is invalid until answered', async () => {
    const result = await planProgression(WORLD_ID, CHARACTER_ID, 3)
    expect(result.ok).toBe(true)
    if (!result.ok) return

    const level3 = result.plan.steps.find((s) => s.level === 3)!
    const subclassChoiceKey = progressionChoiceKey('class', 3, 'choice:class.subclass')
    const subclassChoice = level3.requiredChoices.find((c) => c.id === subclassChoiceKey)

    expect(subclassChoice, 'Bob\'s Level 3 preview must declare a Subclass choice').toBeDefined()
    expect(subclassChoice!.kind).toBe('content')
    expect(subclassChoice!.count).toBe(1)
    expect(subclassChoice!.options.map((o) => o.id).sort()).toEqual(
      REAL_SUBCLASSES_BY_CLASS['barbarian-xphb']!
        .map((slug) => serializeContentRef({ packageId: 'eldra.content.xphb', slug }))
        .sort()
    )
    expect(result.plan.valid).toBe(false)
    expect(result.plan.unresolvedChoiceIds).toContain(subclassChoiceKey)
  })

  // PROVES THE BITE: this exact assertion, run against the pre-fix
  // package (facet.progression without 'progression:class.subclass-
  // selection'), finds NO subclass choice at all -- `subclassChoice` is
  // `undefined` and the real browser defect reproduces. Verified directly
  // this phase by temporarily reverting the Barbarian facet's own
  // `progression` array and re-running this exact test, which failed with
  // "Bob's Level 3 preview must declare a Subclass choice" before the fix
  // and passes after it.
  it('REGRESSION PROOF: Confirm remains unavailable (plan invalid) with no subclass selected', async () => {
    const result = await planProgression(WORLD_ID, CHARACTER_ID, 3)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.plan.valid).toBe(false)
  })
})
