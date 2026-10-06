// P1 REGRESSION -- armor-training Values participate in canonical feat prerequisite eligibility.
//
// REAL data: the Heavily Armored feat is the real XPHB corpus record (its real prerequisite is
// `level 4` + `proficiency: [{ armor: "medium" }]`), resolved through the real feat-mechanics
// resolver. The eligibility authority is the REAL planProgression (the Level Manager's own feat
// preview), evaluated against the REAL Rules Package runtime and its facet grants.
//
// The only variable between the two cases is where medium armor training comes from:
//   - Wizard: no medium armor training in its facet -> Heavily Armored is refused.
//   - Cleric: its real facet grants value:armor.medium.proficient -> Heavily Armored is not refused.
// Same class-independent feat, same level, same ability scores. Nothing is special-cased.
//
// NO STUB: the completeness authority is the real one. Feat PREREQUISITE eligibility is a
// preview-time check, independent of whether the rest of the character can be completed.

import { readFileSync } from 'node:fs'
import { beforeEach, describe, expect, it, vi } from 'vitest'

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

vi.mock('../../../server/utils/character-assembly', () => ({ assembleCharacter: assembleCharacterMock }))
vi.mock('../../../server/utils/world-runtime-service', () => ({ getWorldRuntime: getWorldRuntimeMock }))
vi.mock('../../../server/utils/character-progression', () => ({ saveCharacterProgression: saveCharacterProgressionMock }))
vi.mock('../../../server/utils/character-rules-choices', () => ({
  loadCharacterRulesChoices: loadCharacterRulesChoicesMock,
  saveCharacterRulesChoices: saveCharacterRulesChoicesMock
}))
vi.mock('../../../server/utils/world-content-packs', () => ({ listContentPackBindingsForWorld: listContentPackBindingsForWorldMock }))
vi.mock('../../../server/utils/world-content-catalogue', () => ({ getWorldContentCatalogue: getWorldContentCatalogueMock }))

import { createWorldRuntime } from '../../../app/lib/rules/world-runtime'
import { parseExpression } from '../../../app/lib/rules/parser'
import type { Definition, RulesPackageManifest } from '../../../app/lib/rules/types'
import { findRulesFacet } from '../../../app/lib/content-rules'
import { resolveDnd5eFeatMechanics } from '../../../app/lib/feat-mechanics/dnd5e'
import { planProgression } from '../../../server/utils/character-progression-plan'
import { progressionChoiceKey } from '../../../app/lib/characters/rules-choices'
import { serializeContentRef } from '../../../app/lib/characters/progression-plan'
import xphbFeats from '../../lib/feat-mechanics/fixtures/xphb-feats.json'

const PACKAGE_DIR = 'packages/eldra-dnd5e-2024'
const CONTENT_PACKAGE = 'eldra.content.xphb'
const FEAT_CHOICE_KEY = progressionChoiceKey('class', 4, 'choice:feat.selection')

// The real XPHB record, not a hand-written prerequisite.
const HEAVILY_RAW = (xphbFeats.feats as { name: string }[]).find((f) => f.name === 'Heavily Armored')
if (!HEAVILY_RAW) throw new Error('Heavily Armored missing from the XPHB feat fixture')
const HEAVILY_REF = serializeContentRef({ packageId: CONTENT_PACKAGE, slug: 'heavily-armored-xphb' })

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

function baseEntry(overrides: Record<string, unknown> = {}) {
  return { packageId: CONTENT_PACKAGE, packageVersion: '1.0.0', systemKey: 'dnd5e', title: 'Thing', slug: 'thing', externalId: 'thing', provider: '5etools-json', ...overrides }
}

// The real feat record: its own feat facet and its own resolved feat mechanics.
const HEAVILY = baseEntry({
  title: 'Heavily Armored',
  slug: 'heavily-armored-xphb',
  externalId: 'Heavily Armored__XPHB',
  featMechanics: resolveDnd5eFeatMechanics(HEAVILY_RAW),
  rulesFacet: findRulesFacet('dnd5e.2024', 'feat', 'heavily-armored-xphb') ?? undefined
})

// Two real classes, identical in every field the feat prerequisite reads except armor training.
function classEntry(slug: string, title: string) {
  return baseEntry({ title, slug, rulesFacet: findRulesFacet('dnd5e.2024', 'class', slug) ?? undefined })
}

// A level-3 character about to advance to 4 (Feat Selection is crossed at 4). The class is the only
// variable; the subclass is already chosen, so the crossed rows are the Feat Selection alone.
function blueprintFor(slug: string) {
  return {
    worldId: '5',
    characterId: '42',
    characterTitle: 'Armor Test',
    species: { status: 'resolved', entry: baseEntry({ title: 'Human', slug: 'human-xphb' }) },
    class: { status: 'resolved', entry: classEntry(slug, slug) },
    background: { status: 'resolved', entry: baseEntry({ title: 'Sage', slug: 'sage-xphb' }) },
    abilityScores: { method: 'standard-array', scores: { str: 10, dex: 10, con: 12, int: 16, wis: 14, cha: 10 } },
    rulesChoices: { selections: {} },
    inventory: [],
    notes: null,
    health: null,
    spells: [],
    expendedSlots: {},
    progression: {
      classes: [{ classRef: { packageId: CONTENT_PACKAGE, slug }, level: 3, subclassRef: null }]
    },
    packs: []
  }
}

function catalogue() {
  return { worldId: '5', packs: [], species: [], classes: [], backgrounds: [], feats: [HEAVILY], items: [], spells: [], monsters: [], subclasses: [] }
}

// The REAL planner's verdict on Heavily Armored at the Feat Selection choice. `offered` proves the
// option is actually on the plan (so a null refusal is an acceptance, not an absence).
async function heavilyArmoredVerdict(classSlug: string) {
  assembleCharacterMock.mockResolvedValue({ available: true, blueprint: blueprintFor(classSlug) })
  const result = await planProgression('5', '42', 4, { [FEAT_CHOICE_KEY]: [HEAVILY_REF] })
  if (!result.ok) throw new Error(`planProgression failed: ${result.reason} ${result.message}`)
  return {
    refusal: result.featRejections[FEAT_CHOICE_KEY]?.[HEAVILY_REF]?.reason ?? null,
    offered: JSON.stringify(result.plan).includes(HEAVILY_REF)
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

  getWorldRuntimeMock.mockResolvedValue({ configured: true, ok: true, runtime: loadRealRuntime(), integrityHash: 'sha256-test', settings: {}, rollTypeOverrides: {} })
  loadCharacterRulesChoicesMock.mockResolvedValue(null)
  listContentPackBindingsForWorldMock.mockResolvedValue([])
  getWorldContentCatalogueMock.mockResolvedValue(catalogue())
})

describe('P1 regression -- armor training is part of canonical feat prerequisite eligibility (real XPHB Heavily Armored)', () => {
  it('the real corpus record requires medium armor proficiency at level 4', () => {
    expect(HEAVILY_RAW).toMatchObject({ prerequisite: [{ level: 4, proficiency: [{ armor: 'medium' }] }] })
  })

  it('WITHOUT medium armor training (Wizard), Heavily Armored is not a legal option: refused as prerequisite-unmet', async () => {
    const verdict = await heavilyArmoredVerdict('wizard-xphb')
    expect(verdict.refusal).toBe('prerequisite-unmet')
  })

  it('WITH medium armor training from the real facet (Cleric), Heavily Armored becomes legally eligible', async () => {
    const verdict = await heavilyArmoredVerdict('cleric-xphb')
    expect(verdict.offered).toBe(true)
    expect(verdict.refusal).toBeNull()
  })
})
