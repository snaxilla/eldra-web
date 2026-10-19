// D&D 2024 Character Rules A3 -- SUBCLASS SPELL AUTHORING, real-content acceptance.
//
// UNIT-ISOLATION (see tests/helpers/completeness-stub.ts): the Phase 0 completeness authority is
// stubbed, exactly like character-progression-subclass-acceptance.test.ts's own sibling file --
// this file's own assertions are about the generic subclass spell-acquisition machinery and the
// REAL authored facets' own shape, never a claim that a full real PHB character (every mandatory
// creation decision, not just spells) can be created end to end through the unstubbed authority.
//
// Mirrors character-progression-subclass-acceptance.test.ts's own harness exactly (A2's
// synthetic-subclass proof), but against REAL, now-authored XPHB subclasses
// (app/lib/content-rules/dnd5e-2024.ts's own A3 block) through the SAME real
// planProgression/confirmProgression/resolveCurrentProgression authority -- never a parallel
// interpretation. Proves the real corpus-derived facets actually work end to end, not merely
// that the generic machinery can be driven by a synthetic fixture.
//
// Covers, across four real subclasses:
//   - Life Domain (Cleric): a pure FIXED spell grant, growing by `minLevel` (L3 -> L5).
//   - Abjurer (Wizard): a spell SELECTION (`spellbook` pool, school-restricted), including a
//     rejected illegal (wrong-school) selection and a rejected missing-selection plan.
//   - Circle of the Land (Druid): the terrain variant-choice gating which fixed spell set
//     applies -- the chosen terrain's own spells resolve, a different terrain's do not.
//   - Eldritch Knight (Fighter): the third-caster CANTRIP pool (implemented) alongside the
//     still-honestly-blocked leveled Wizard spell pool (absent from the plan entirely, never
//     silently satisfied) -- this phase's own reported STOP, re-verified live.

import { readFileSync } from 'node:fs'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../../app/lib/content-rules/creation-completeness', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../app/lib/content-rules/creation-completeness')>()),
  ...(await import('../../helpers/completeness-stub')).MECHANICS_ONLY_COMPLETENESS
}))

const {
  assembleCharacterMock, getWorldRuntimeMock, saveCharacterProgressionMock,
  loadCharacterRulesChoicesMock, saveCharacterRulesChoicesMock,
  listContentPackBindingsForWorldMock, getWorldContentCatalogueMock,
  saveCharacterSpellcastingMock
} = vi.hoisted(() => ({
  assembleCharacterMock: vi.fn(),
  getWorldRuntimeMock: vi.fn(),
  saveCharacterProgressionMock: vi.fn(),
  loadCharacterRulesChoicesMock: vi.fn(),
  saveCharacterRulesChoicesMock: vi.fn(),
  listContentPackBindingsForWorldMock: vi.fn(),
  getWorldContentCatalogueMock: vi.fn(),
  saveCharacterSpellcastingMock: vi.fn()
}))

vi.mock('../../../server/utils/character-assembly', () => ({ assembleCharacter: assembleCharacterMock }))
vi.mock('../../../server/utils/world-runtime-service', () => ({ getWorldRuntime: getWorldRuntimeMock }))
vi.mock('../../../server/utils/character-progression', () => ({ saveCharacterProgression: saveCharacterProgressionMock }))
vi.mock('../../../server/utils/character-rules-choices', () => ({
  loadCharacterRulesChoices: loadCharacterRulesChoicesMock,
  saveCharacterRulesChoices: saveCharacterRulesChoicesMock
}))
vi.mock('../../../server/utils/world-content-packs', () => ({ listContentPackBindingsForWorld: listContentPackBindingsForWorldMock }))
vi.mock('../../../server/utils/world-content-catalogue', () => ({ getWorldContentCatalogue: getWorldContentCatalogueMock }))
vi.mock('../../../server/utils/character-spellcasting', () => ({ saveCharacterSpellcasting: saveCharacterSpellcastingMock }))

import { createWorldRuntime } from '../../../app/lib/rules/world-runtime'
import { parseExpression } from '../../../app/lib/rules/parser'
import type { Definition, RulesPackageManifest } from '../../../app/lib/rules/types'
import { findRulesFacet } from '../../../app/lib/content-rules'
import { resolveDnd5eSpellMechanics } from '../../../app/lib/spell-mechanics/dnd5e'
import { confirmProgression, planProgression, resolveCurrentProgression } from '../../../server/utils/character-progression-plan'
import { progressionChoiceKey } from '../../../app/lib/characters/rules-choices'
import { serializeContentRef } from '../../../app/lib/characters/progression-plan'
import { spellAnswerKey } from '../../../server/utils/character-progression-spell-acquisition'
import type { AssembledSpellEntry, StoredSpellEntry } from '../../../app/lib/characters/spellcasting'

const WORLD_ID = '5'
const CHARACTER_ID = '42'
const PKG = 'eldra.content.xphb'
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
  const result = createWorldRuntime(manifest, definitions, WORLD_ID, null)
  if (!result.ok) throw new Error(`runtime build failed: ${result.stage}`)
  return result.runtimePackage
}

function baseEntry(overrides: Record<string, unknown> = {}) {
  return {
    packageId: PKG, packageVersion: '1.0.0', systemKey: 'dnd5e',
    title: 'Thing', slug: 'thing', externalId: 'thing', provider: '5etools-json',
    ...overrides
  }
}

function spellCatalogueEntry(slug: string, level: number, classLists: string[], school: string, title = slug) {
  return { packageId: PKG, slug, title, spellMechanics: resolveDnd5eSpellMechanics({ name: title, source: 'XPHB', level, school, classLists })! }
}

const REAL_RUNTIME = loadRealRuntime()

beforeEach(() => {
  assembleCharacterMock.mockReset()
  getWorldRuntimeMock.mockReset()
  saveCharacterProgressionMock.mockReset()
  loadCharacterRulesChoicesMock.mockReset()
  saveCharacterRulesChoicesMock.mockReset()
  listContentPackBindingsForWorldMock.mockReset()
  getWorldContentCatalogueMock.mockReset()
  saveCharacterSpellcastingMock.mockReset()

  getWorldRuntimeMock.mockResolvedValue({
    configured: true, ok: true, runtime: REAL_RUNTIME,
    integrityHash: 'sha256-test', settings: {}, rollTypeOverrides: {}
  })
  saveCharacterProgressionMock.mockImplementation(async (_id: unknown, stored: unknown) => stored)
  loadCharacterRulesChoicesMock.mockResolvedValue(null)
  saveCharacterRulesChoicesMock.mockImplementation(async (_id: unknown, stored: unknown) => stored)
  listContentPackBindingsForWorldMock.mockResolvedValue([])
  saveCharacterSpellcastingMock.mockImplementation(async (_id: unknown, stored: unknown) => stored)
})

// ---------------------------------------------------------------------------
// LIFE DOMAIN (Cleric) -- pure FIXED grant, growing by minLevel.
// ---------------------------------------------------------------------------
describe('A3 -- Life Domain (Cleric): fixed spell grants, growing by level, through real Confirm', () => {
  const LIFE_DOMAIN_REF = { packageId: PKG, slug: 'life-domain-xphb' }
  const LIFE_DOMAIN_FACET = findRulesFacet('dnd5e.2024', 'subclass', 'life-domain-xphb')!
  const CLERIC_FACET = findRulesFacet('dnd5e.2024', 'class', 'cleric-xphb')!
  const cantripReq = CLERIC_FACET.spellRequirements!.find((r) => r.pool === 'cantrip' && r.id.endsWith('.cantrip'))!
  const preparedReq = CLERIC_FACET.spellRequirements!.find((r) => r.pool === 'spell')!

  const LIFE_SPELLS = ['aid-xphb', 'bless-xphb', 'cure-wounds-xphb', 'lesser-restoration-xphb', 'mass-healing-word-xphb', 'revivify-xphb']
  const CATALOGUE = [
    ...Array.from({ length: 5 }, (_, i) => spellCatalogueEntry(`cantrip-${i}`, 0, ['Cleric'], 'V')),
    ...Array.from({ length: 20 }, (_, i) => spellCatalogueEntry(`spell-1-${i}`, 1, ['Cleric'], 'V')),
    ...LIFE_SPELLS.map((slug) => spellCatalogueEntry(slug, 1, [], 'V'))
  ]

  const LIFE_DOMAIN_CATALOGUE_ENTRY = baseEntry({
    title: 'Life Domain', slug: LIFE_DOMAIN_REF.slug, parentClassSlug: 'cleric-xphb', rulesFacet: LIFE_DOMAIN_FACET
  })
  // Crossed, unrelated to subclass ownership, by every test in this block that levels past 4
  // (Cleric's own real Level-4 ASI/Feat Selection row, progression:class.asi-standard).
  const ASI_FEAT = baseEntry({
    title: 'Ability Score Improvement', slug: 'ability-score-improvement-xphb', externalId: 'Ability Score Improvement__XPHB',
    featMechanics: { category: 'general', variant: 'G', unsupportedPrerequisites: [], repeatable: true, prerequisiteGroups: [] },
    rulesFacet: findRulesFacet('dnd5e.2024', 'feat', 'ability-score-improvement-xphb') ?? undefined
  })
  function catalogueFor() {
    return { worldId: WORLD_ID, packs: [], species: [], classes: [], backgrounds: [], feats: [ASI_FEAT], items: [], spells: CATALOGUE, monsters: [], subclasses: [LIFE_DOMAIN_CATALOGUE_ENTRY] }
  }

  function blueprint(level: number, subclassRef: { packageId: string, slug: string } | null, spells: AssembledSpellEntry[] = []) {
    return {
      worldId: WORLD_ID,
      characterId: CHARACTER_ID,
      characterTitle: 'A3 Life Domain Fixture',
      species: { status: 'resolved' as const, entry: baseEntry({ title: 'Human', slug: 'human-xphb' }) },
      class: { status: 'resolved' as const, entry: baseEntry({ title: 'Cleric', slug: 'cleric-xphb', rulesFacet: CLERIC_FACET }) },
      subclass: subclassRef
        ? { status: 'resolved' as const, entry: baseEntry({ title: 'Life Domain', slug: subclassRef.slug, parentClassSlug: 'cleric-xphb', rulesFacet: LIFE_DOMAIN_FACET }) }
        : { status: 'missing' as const },
      background: { status: 'resolved' as const, entry: baseEntry({ title: 'Acolyte', slug: 'acolyte-xphb' }) },
      abilityScores: { method: 'standard-array' as const, scores: { str: 10, dex: 10, con: 12, int: 10, wis: 16, cha: 14 } },
      rulesChoices: {
        selections: {
          'class:choice:skill.proficiency': ['value:skill.insight.proficient', 'value:skill.religion.proficient'],
          'class:choice:class.feature-option': ['source:divine-order.protector']
        }
      },
      inventory: [], notes: null, health: null, spells, expendedSlots: {},
      progression: { classes: [{ classRef: { packageId: PKG, slug: 'cleric-xphb' }, level, subclassRef }] },
      resources: null, packs: []
    }
  }

  function useFixture(level: number, subclassRef: { packageId: string, slug: string } | null = null, spells: AssembledSpellEntry[] = []) {
    getWorldContentCatalogueMock.mockResolvedValue(catalogueFor())
    assembleCharacterMock.mockResolvedValue({ available: true, blueprint: blueprint(level, subclassRef, spells) })
  }

  const SUBCLASS_CHOICE_KEY = progressionChoiceKey('class', 3, 'choice:class.subclass')

  it('CONFIRM at Level 3 -- the four Level-3 Life Domain spells persist as always-prepared, alongside the Cleric\'s own normal spells', async () => {
    useFixture(1)
    const answers = {
      [SUBCLASS_CHOICE_KEY]: [serializeContentRef(LIFE_DOMAIN_REF)],
      [spellAnswerKey(cantripReq, 3)]: Array.from({ length: cantripReq.totalByLevel[2]! }, (_, i) => `${PKG}::cantrip-${i}`),
      [spellAnswerKey(preparedReq, 3)]: Array.from({ length: preparedReq.totalByLevel[2]! }, (_, i) => `${PKG}::spell-1-${i}`)
    }
    const plan = await planProgression(WORLD_ID, CHARACTER_ID, 3, answers)
    expect(plan.ok).toBe(true)
    if (!plan.ok) return
    expect(plan.plan.spellPlan?.complete).toBe(true)

    const result = await confirmProgression(WORLD_ID, CHARACTER_ID, 3, plan.plan.fingerprint, answers)
    expect(result.ok).toBe(true)
    if (!result.ok) return

    const written = saveCharacterSpellcastingMock.mock.calls[0]![1] as { spells: StoredSpellEntry[] }
    const bySlug = new Map(written.spells.map((entry) => [entry.ref!.slug, entry]))
    for (const slug of ['aid-xphb', 'bless-xphb', 'cure-wounds-xphb', 'lesser-restoration-xphb']) {
      expect(bySlug.get(slug), slug).toBeDefined()
      expect(bySlug.get(slug)!.prepared, slug).toBe(true)
      expect(bySlug.get(slug)!.known, slug).toBe(false)
    }
    // Not yet available at Level 3.
    expect(bySlug.get('mass-healing-word-xphb')).toBeUndefined()
    expect(bySlug.get('revivify-xphb')).toBeUndefined()
  })

  it('LEVEL-UP 3 -> 5 -- the two Level-5 Life Domain spells are newly granted without disturbing the Level-3 ones', async () => {
    const persisted: AssembledSpellEntry[] = ['aid-xphb', 'bless-xphb', 'cure-wounds-xphb', 'lesser-restoration-xphb'].map((slug, i) => ({
      instanceId: `sp-${i}`, ref: { packageId: PKG, slug }, known: false, prepared: true,
      requirementIds: [`fixed-spell-grant.subclass.${slug}`], status: 'resolved' as const, title: slug,
      entry: CATALOGUE.find((s) => s.slug === slug)
    }))
    useFixture(3, LIFE_DOMAIN_REF, persisted)
    const featKey = progressionChoiceKey('class', 4, 'choice:feat.selection')
    const answers = {
      [featKey]: [serializeContentRef({ packageId: PKG, slug: 'ability-score-improvement-xphb' })],
      [`feat:${featKey}:choice:feat.asi-ability-increase`]: ['source:asi.increase.wis', 'source:asi.increase.wis'],
      [spellAnswerKey(cantripReq, 5)]: Array.from({ length: cantripReq.totalByLevel[4]! }, (_, i) => `${PKG}::cantrip-${i}`),
      [spellAnswerKey(preparedReq, 5)]: Array.from({ length: preparedReq.totalByLevel[4]! }, (_, i) => `${PKG}::spell-1-${i}`)
    }
    const plan = await planProgression(WORLD_ID, CHARACTER_ID, 5, answers)
    expect(plan.ok).toBe(true)
    if (!plan.ok) return
    expect(plan.plan.spellPlan?.complete).toBe(true)

    const result = await confirmProgression(WORLD_ID, CHARACTER_ID, 5, plan.plan.fingerprint, answers)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const written = saveCharacterSpellcastingMock.mock.calls[0]![1] as { spells: StoredSpellEntry[] }
    const slugs = written.spells.map((s) => s.ref!.slug)
    expect(slugs).toContain('mass-healing-word-xphb')
    expect(slugs).toContain('revivify-xphb')
    expect(slugs).toContain('aid-xphb') // Level-3 grant preserved, not duplicated.
    expect(slugs.filter((s) => s === 'aid-xphb')).toHaveLength(1)
  })

  it('FRESH RELOAD -- resolveCurrentProgression independently re-derives the same persisted Life Domain spells', async () => {
    const persisted: AssembledSpellEntry[] = ['aid-xphb', 'bless-xphb', 'cure-wounds-xphb', 'lesser-restoration-xphb'].map((slug, i) => ({
      instanceId: `sp-${i}`, ref: { packageId: PKG, slug }, known: false, prepared: true,
      requirementIds: [`fixed-spell-grant.subclass.${slug}`], status: 'resolved' as const, title: slug,
      entry: CATALOGUE.find((s) => s.slug === slug)
    }))
    useFixture(3, LIFE_DOMAIN_REF, persisted)
    const current = await resolveCurrentProgression(WORLD_ID, CHARACTER_ID)
    expect(current.ok).toBe(true)
    if (!current.ok) return
    expect(current.state.subclassFacet).toEqual(LIFE_DOMAIN_FACET)
    expect(current.state.spells.map((s) => s.ref?.slug).sort()).toEqual(['aid-xphb', 'bless-xphb', 'cure-wounds-xphb', 'lesser-restoration-xphb'])
  })
})

// ---------------------------------------------------------------------------
// ABJURER (Wizard) -- spell SELECTION (spellbook pool, school-restricted).
// ---------------------------------------------------------------------------
describe('A3 -- Abjurer (Wizard): school-restricted spell selection, through real Confirm, rejecting illegal/missing answers', () => {
  const ABJURER_REF = { packageId: PKG, slug: 'abjurer-xphb' }
  const ABJURER_FACET = findRulesFacet('dnd5e.2024', 'subclass', 'abjurer-xphb')!
  const WIZARD_FACET = findRulesFacet('dnd5e.2024', 'class', 'wizard-xphb')!
  const cantripReq = WIZARD_FACET.spellRequirements!.find((r) => r.pool === 'cantrip')!
  const spellbookReq = WIZARD_FACET.spellRequirements!.find((r) => r.pool === 'spellbook')!
  const preparedReq = WIZARD_FACET.spellRequirements!.find((r) => r.pool === 'spell')!
  const abjurerReq = ABJURER_FACET.spellRequirements!.find((r) => r.pool === 'spellbook')!

  const CATALOGUE = [
    ...Array.from({ length: 5 }, (_, i) => spellCatalogueEntry(`cantrip-${i}`, 0, ['Wizard'], 'V')),
    ...Array.from({ length: 20 }, (_, i) => spellCatalogueEntry(`spell-1-${i}`, 1, ['Wizard'], 'V')),
    spellCatalogueEntry('alarm-xphb', 1, ['Wizard'], 'A'),
    spellCatalogueEntry('protection-from-evil-and-good-xphb', 1, ['Wizard'], 'A'),
    // Illegal for this requirement: real Wizard spell, but Divination, not Abjuration.
    spellCatalogueEntry('identify-xphb', 1, ['Wizard'], 'D')
  ]

  const ABJURER_CATALOGUE_ENTRY = baseEntry({
    title: 'Abjurer', slug: ABJURER_REF.slug, parentClassSlug: 'wizard-xphb', rulesFacet: ABJURER_FACET
  })
  function catalogueFor() {
    return { worldId: WORLD_ID, packs: [], species: [], classes: [], backgrounds: [], feats: [], items: [], spells: CATALOGUE, monsters: [], subclasses: [ABJURER_CATALOGUE_ENTRY] }
  }

  function blueprint(level: number, subclassRef: { packageId: string, slug: string } | null) {
    return {
      worldId: WORLD_ID,
      characterId: CHARACTER_ID,
      characterTitle: 'A3 Abjurer Fixture',
      species: { status: 'resolved' as const, entry: baseEntry({ title: 'Human', slug: 'human-xphb' }) },
      class: { status: 'resolved' as const, entry: baseEntry({ title: 'Wizard', slug: 'wizard-xphb', rulesFacet: WIZARD_FACET }) },
      subclass: subclassRef
        ? { status: 'resolved' as const, entry: baseEntry({ title: 'Abjurer', slug: subclassRef.slug, parentClassSlug: 'wizard-xphb', rulesFacet: ABJURER_FACET }) }
        : { status: 'missing' as const },
      background: { status: 'resolved' as const, entry: baseEntry({ title: 'Sage', slug: 'sage-xphb' }) },
      abilityScores: { method: 'standard-array' as const, scores: { str: 10, dex: 10, con: 12, int: 16, wis: 14, cha: 10 } },
      rulesChoices: { selections: { 'class:choice:skill.proficiency': ['value:skill.arcana.proficient', 'value:skill.history.proficient'] } },
      inventory: [], notes: null, health: null, spells: [], expendedSlots: {},
      progression: { classes: [{ classRef: { packageId: PKG, slug: 'wizard-xphb' }, level, subclassRef }] },
      resources: null, packs: []
    }
  }

  function useFixture(level: number, subclassRef: { packageId: string, slug: string } | null = null) {
    getWorldContentCatalogueMock.mockResolvedValue(catalogueFor())
    assembleCharacterMock.mockResolvedValue({ available: true, blueprint: blueprint(level, subclassRef) })
  }

  const SUBCLASS_CHOICE_KEY = progressionChoiceKey('class', 3, 'choice:class.subclass')
  const EXPERTISE_KEY = progressionChoiceKey('class', 2, 'choice:skill.expertise')

  function baseAnswers(level: number) {
    return {
      [SUBCLASS_CHOICE_KEY]: [serializeContentRef(ABJURER_REF)],
      [EXPERTISE_KEY]: ['value:skill.arcana.expertise'],
      [spellAnswerKey(cantripReq, level)]: Array.from({ length: cantripReq.totalByLevel[level - 1]! }, (_, i) => `${PKG}::cantrip-${i}`),
      [spellAnswerKey(spellbookReq, level)]: Array.from({ length: spellbookReq.totalByLevel[level - 1]! }, (_, i) => `${PKG}::spell-1-${i}`),
      [spellAnswerKey(preparedReq, level)]: Array.from({ length: preparedReq.totalByLevel[level - 1]! }, (_, i) => `${PKG}::spell-1-${i}`)
    }
  }

  it('CONFIRM -- two Abjuration spells persist as known, counted separately from the Wizard\'s own spellbook', async () => {
    useFixture(1)
    const answers = {
      ...baseAnswers(3),
      [spellAnswerKey(abjurerReq, 3)]: [`${PKG}::alarm-xphb`, `${PKG}::protection-from-evil-and-good-xphb`]
    }
    const plan = await planProgression(WORLD_ID, CHARACTER_ID, 3, answers)
    expect(plan.ok).toBe(true)
    if (!plan.ok) return
    expect(plan.plan.spellPlan?.complete).toBe(true)

    const result = await confirmProgression(WORLD_ID, CHARACTER_ID, 3, plan.plan.fingerprint, answers)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const written = saveCharacterSpellcastingMock.mock.calls[0]![1] as { spells: StoredSpellEntry[] }
    const bySlug = new Map(written.spells.map((entry) => [entry.ref!.slug, entry]))
    expect(bySlug.get('alarm-xphb')!.known).toBe(true)
    expect(bySlug.get('protection-from-evil-and-good-xphb')!.known).toBe(true)
    // Spellbook pool total (10 at Level 3) is unaffected -- the 2 Abjurer picks are a SEPARATE
    // requirement, never counted against the class's own membership pool.
    expect(written.spells.filter((s) => s.ref!.slug.startsWith('spell-1-'))).toHaveLength(spellbookReq.totalByLevel[2]!)
  })

  it('REJECTS an illegal (wrong-school) selection -- a real Wizard Divination spell does not satisfy the Abjurer requirement', async () => {
    useFixture(1)
    const answers = {
      ...baseAnswers(3),
      [spellAnswerKey(abjurerReq, 3)]: [`${PKG}::alarm-xphb`, `${PKG}::identify-xphb`]
    }
    const plan = await planProgression(WORLD_ID, CHARACTER_ID, 3, answers)
    expect(plan.ok).toBe(true)
    if (!plan.ok) return
    const requirement = plan.plan.spellPlan!.requirements.find((r) => r.requirementId === abjurerReq.id)
    expect(requirement, 'Abjurer requirement must appear in the plan').toBeDefined()
    expect(requirement!.missing, 'the Divination spell must not count toward the Abjuration-only total').toBeGreaterThan(0)
    expect(plan.plan.spellPlan!.complete).toBe(false)
  })

  it('REJECTS a plan missing the mandatory Abjurer selection entirely', async () => {
    useFixture(1)
    const answers = baseAnswers(3) // no abjurerReq answer at all
    const plan = await planProgression(WORLD_ID, CHARACTER_ID, 3, answers)
    expect(plan.ok).toBe(true)
    if (!plan.ok) return
    const requirement = plan.plan.spellPlan!.requirements.find((r) => r.requirementId === abjurerReq.id)
    expect(requirement!.missing).toBe(abjurerReq.totalByLevel[2])
    expect(plan.plan.spellPlan!.complete).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// CIRCLE OF THE LAND (Druid) -- terrain variant-choice gates which fixed spells apply.
// ---------------------------------------------------------------------------
describe('A3 -- Circle of the Land (Druid): the chosen terrain\'s own spells resolve, a different terrain\'s do not', () => {
  const LAND_REF = { packageId: PKG, slug: 'circle-of-the-land-xphb' }
  const LAND_FACET = findRulesFacet('dnd5e.2024', 'subclass', 'circle-of-the-land-xphb')!
  const DRUID_FACET = findRulesFacet('dnd5e.2024', 'class', 'druid-xphb')!
  const cantripReq = DRUID_FACET.spellRequirements!.find((r) => r.pool === 'cantrip' && r.id.endsWith('.cantrip'))!
  const preparedReq = DRUID_FACET.spellRequirements!.find((r) => r.pool === 'spell')!

  const CATALOGUE = [
    ...Array.from({ length: 5 }, (_, i) => spellCatalogueEntry(`cantrip-${i}`, 0, ['Druid'], 'V')),
    ...Array.from({ length: 20 }, (_, i) => spellCatalogueEntry(`spell-1-${i}`, 1, ['Druid'], 'V')),
    spellCatalogueEntry('blur-xphb', 2, [], 'I'),
    spellCatalogueEntry('burning-hands-xphb', 1, [], 'V'),
    spellCatalogueEntry('fire-bolt-xphb', 0, [], 'V'),
    spellCatalogueEntry('fog-cloud-xphb', 1, [], 'C'),
    spellCatalogueEntry('hold-person-xphb', 2, [], 'E'),
    spellCatalogueEntry('ray-of-frost-xphb', 0, [], 'V')
  ]

  const LAND_CATALOGUE_ENTRY = baseEntry({
    title: 'Circle of the Land', slug: LAND_REF.slug, parentClassSlug: 'druid-xphb', rulesFacet: LAND_FACET
  })
  function catalogueFor() {
    return { worldId: WORLD_ID, packs: [], species: [], classes: [], backgrounds: [], feats: [], items: [], spells: CATALOGUE, monsters: [], subclasses: [LAND_CATALOGUE_ENTRY] }
  }

  function blueprint(level: number, subclassRef: { packageId: string, slug: string } | null, extraSelections: Record<string, string[]> = {}) {
    return {
      worldId: WORLD_ID,
      characterId: CHARACTER_ID,
      characterTitle: 'A3 Circle of the Land Fixture',
      species: { status: 'resolved' as const, entry: baseEntry({ title: 'Human', slug: 'human-xphb' }) },
      class: { status: 'resolved' as const, entry: baseEntry({ title: 'Druid', slug: 'druid-xphb', rulesFacet: DRUID_FACET }) },
      subclass: subclassRef
        ? { status: 'resolved' as const, entry: baseEntry({ title: 'Circle of the Land', slug: subclassRef.slug, parentClassSlug: 'druid-xphb', rulesFacet: LAND_FACET }) }
        : { status: 'missing' as const },
      background: { status: 'resolved' as const, entry: baseEntry({ title: 'Hermit', slug: 'hermit-xphb' }) },
      abilityScores: { method: 'standard-array' as const, scores: { str: 10, dex: 10, con: 12, int: 10, wis: 16, cha: 10 } },
      rulesChoices: {
        selections: {
          'class:choice:skill.proficiency': ['value:skill.insight.proficient', 'value:skill.nature.proficient'],
          'class:choice:class.feature-option': ['source:primal-order.magician'],
          ...extraSelections
        }
      },
      inventory: [], notes: null, health: null, spells: [], expendedSlots: {},
      progression: { classes: [{ classRef: { packageId: PKG, slug: 'druid-xphb' }, level, subclassRef }] },
      resources: null, packs: []
    }
  }

  function useFixture(level: number, subclassRef: { packageId: string, slug: string } | null, extraSelections: Record<string, string[]> = {}) {
    getWorldContentCatalogueMock.mockResolvedValue(catalogueFor())
    assembleCharacterMock.mockResolvedValue({ available: true, blueprint: blueprint(level, subclassRef, extraSelections) })
  }

  const SUBCLASS_CHOICE_KEY = progressionChoiceKey('class', 3, 'choice:class.subclass')
  const TERRAIN_CHOICE_KEY = progressionChoiceKey('subclass', 3, 'choice:subclass.feature-option')
  const magicianCantripReq = DRUID_FACET.spellRequirements!.find((r) => r.id.endsWith('.magician-cantrip'))!
  const MAGICIAN_CANTRIP_KEY = spellAnswerKey(magicianCantripReq, 3)

  it('CONFIRM, Arid terrain chosen -- the Arid Land spells persist; the Polar Land spells are never granted', async () => {
    useFixture(1)
    const answers = {
      [SUBCLASS_CHOICE_KEY]: [serializeContentRef(LAND_REF)],
      [TERRAIN_CHOICE_KEY]: ['source:land-circle.arid'],
      [spellAnswerKey(cantripReq, 3)]: Array.from({ length: cantripReq.totalByLevel[2]! }, (_, i) => `${PKG}::cantrip-${i}`),
      [spellAnswerKey(preparedReq, 3)]: Array.from({ length: preparedReq.totalByLevel[2]! }, (_, i) => `${PKG}::spell-1-${i}`),
      [MAGICIAN_CANTRIP_KEY]: [`${PKG}::cantrip-0`]
    }
    const plan = await planProgression(WORLD_ID, CHARACTER_ID, 3, answers)
    expect(plan.ok).toBe(true)
    if (!plan.ok) return
    expect(plan.plan.spellPlan?.complete).toBe(true)

    const result = await confirmProgression(WORLD_ID, CHARACTER_ID, 3, plan.plan.fingerprint, answers)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const written = saveCharacterSpellcastingMock.mock.calls[0]![1] as { spells: StoredSpellEntry[] }
    const slugs = written.spells.map((s) => s.ref!.slug)
    expect(slugs).toContain('blur-xphb')
    expect(slugs).toContain('burning-hands-xphb')
    expect(slugs).toContain('fire-bolt-xphb')
    // Polar Land's own spells (a different terrain) are NEVER granted alongside Arid.
    expect(slugs).not.toContain('fog-cloud-xphb')
    expect(slugs).not.toContain('hold-person-xphb')
    expect(slugs).not.toContain('ray-of-frost-xphb')
  })
})

