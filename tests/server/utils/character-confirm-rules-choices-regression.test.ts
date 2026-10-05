// D&D 2024 Character Rules Phase 2A.1 -- CONFIRM/PERSISTENCE DEFECT
// REGRESSION.
//
// Real production defect: a character (Tonso Fun Jr., World "Solaris")
// correctly previewed a Level 4 Ability Score Improvement feat with a
// nested ability-distribution answer of `[INT, INT]` ("+2 Intelligence"),
// correctly confirmed it (the write persisted both the feat and the nested
// answer, verified directly against Directus), and then read back Level 5
// from an ordinary, authoritative, non-preview Character Sheet load with
// Intelligence STILL AT BASE (15, not 17) -- the confirmed feat had no
// effect at all on normal assembly.
//
// ROOT CAUSE: `normalizeStoredRulesChoices` (app/lib/characters/
// rules-choices.ts), called unconditionally by `assembleCharacter`
// (server/utils/character-assembly.ts) on every read of the persisted
// `rules_choices` block, used to silently deduplicate every selection list
// -- `['source:asi.increase.int','source:asi.increase.int']` (2 items, the
// correct, real, persisted ASI answer) read back as `['source:asi.increase.
// int']` (1 item). `validateChoiceSelection` (same file) then rejected it
// (`selected.length !== choice.count`, 1 !== 2) as an UNANSWERED choice, so
// `character-actor-bridge.ts`'s `applyChoice` never activated either
// `source:asi.increase.int` SourceInstance, and the Ability Score
// Improvement feat's own confirmed, persisted, correct effect silently
// never applied.
//
// This is what `tests/lib/characters/rules-choices.test.ts` proves at the
// unit level (`normalizeStoredRulesChoices` no longer drops a duplicate).
// THIS file proves the full, real, end-to-end round trip the Sheet actually
// exercises: real Directus-row-shaped persisted JSON -> real
// `assembleCharacter` -> real `buildActorState` -> real Rules Engine
// `evaluate()`, against the REAL shipped `eldra-dnd5e-2024` package (never a
// hand-typed fixture that could silently drift from it) -- the exact
// `getDerivedCharacter` entry point `server/api/worlds/[id]/characters/
// [characterId]/derived.get.ts` calls for every ordinary (non-preview)
// Sheet load. `assembleCharacter` itself is NEVER mocked here, unlike
// character-derived.test.ts/character-progression-plan.test.ts's own
// precedent of mocking it at the module boundary -- mocking it is exactly
// why this defect shipped unnoticed: every existing ASI test in
// character-progression-plan.test.ts asserts on `confirmProgression`'s own
// WRITE (which was always correct), never on a REAL subsequent READ of what
// it wrote.

import { readFileSync } from 'node:fs'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { directusServiceRequestMock, getWorldContentCatalogueMock, getWorldRuntimeMock } = vi.hoisted(() => ({
  directusServiceRequestMock: vi.fn(),
  getWorldContentCatalogueMock: vi.fn(),
  getWorldRuntimeMock: vi.fn()
}))

vi.mock('../../../server/utils/directus', () => ({
  directusServiceRequest: directusServiceRequestMock
}))

vi.mock('../../../server/utils/world-content-catalogue', () => ({
  getWorldContentCatalogue: getWorldContentCatalogueMock
}))

vi.mock('../../../server/utils/world-runtime-service', () => ({
  getWorldRuntime: getWorldRuntimeMock
}))

import { createWorldRuntime } from '../../../app/lib/rules/world-runtime'
import { parseExpression } from '../../../app/lib/rules/parser'
import type { Definition, RulesPackageManifest } from '../../../app/lib/rules/types'
import { findRulesFacet } from '../../../app/lib/content-rules'
import { getDerivedCharacter } from '../../../server/utils/character-derived'

const PACKAGE_DIR = 'packages/eldra-dnd5e-2024'
const WORLD_ID = '5'
const CHARACTER_ID = '1649' // Tonso Fun Jr.'s real production entity id.
const CLASS_REF = { packageId: 'eldra.content.xphb', slug: 'wizard-xphb' }
const ASI_FEAT_REF = { packageId: 'eldra.content.xphb', slug: 'ability-score-improvement-xphb' }

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

// The real World Content Catalogue entries assembleCharacter/the Feat
// Selection content-choice resolver both need: a real Wizard class facet
// (declares the asi-standard Progression) and a real Ability Score
// Improvement feat facet (declares the nested ability-distribution choice,
// `distinct: false`, `effect: 'activate-source'`) -- both read straight off
// the real shipped corpus via `findRulesFacet`, never hand-typed, so this
// regression cannot silently drift from what Solaris's actual bound Content
// Pack declares.
function catalogue() {
  return {
    worldId: WORLD_ID,
    packs: [],
    species: [baseEntry({ title: 'Human', slug: 'human-xphb' })],
    classes: [baseEntry({ title: 'Wizard', slug: CLASS_REF.slug, rulesFacet: findRulesFacet('dnd5e.2024', 'class', CLASS_REF.slug) ?? undefined })],
    backgrounds: [baseEntry({ title: 'Sage', slug: 'sage-xphb' })],
    feats: [
      baseEntry({
        title: 'Ability Score Improvement',
        slug: ASI_FEAT_REF.slug,
        featMechanics: { category: 'general', variant: 'G', unsupportedPrerequisites: [], repeatable: true, prerequisiteGroups: [] },
        rulesFacet: findRulesFacet('dnd5e.2024', 'feat', ASI_FEAT_REF.slug) ?? undefined
      })
    ],
    items: [], spells: [], monsters: [], subclasses: []
  }
}

// Mirrors character-assembly.test.ts's own `mockEntityAndBlock` -- the
// Directus I/O boundary `assembleCharacter` reads directly, with no block
// omitted (so every assembled field looks exactly like a real persisted
// character's, not a partially-stubbed one).
function mockEntityAndBlocks(progressionData: unknown, rulesChoicesData: unknown, abilityScoresData: unknown) {
  directusServiceRequestMock.mockImplementation(async (path: string) => {
    if (path === `/items/entities/${CHARACTER_ID}`) {
      return { data: { id: Number(CHARACTER_ID), world_id: Number(WORLD_ID), title: 'Tonso Fun Jr.', entity_type: 'pc' } }
    }
    if (path === '/items/block_instances') {
      return {
        data: [
          { block_key: 'catalogue_selection', data: { species: { packageId: 'eldra.content.xphb', slug: 'human-xphb' }, class: { packageId: CLASS_REF.packageId, slug: CLASS_REF.slug }, background: { packageId: 'eldra.content.xphb', slug: 'sage-xphb' } } },
          { block_key: 'ability_scores', data: abilityScoresData },
          { block_key: 'rules_choices', data: rulesChoicesData },
          { block_key: 'progression', data: progressionData }
        ]
      }
    }
    throw new Error(`unexpected directusServiceRequest path: ${path}`)
  })
}

beforeEach(() => {
  directusServiceRequestMock.mockReset()
  getWorldContentCatalogueMock.mockReset()
  getWorldRuntimeMock.mockReset()

  getWorldContentCatalogueMock.mockResolvedValue(catalogue())
  const runtime = loadRealRuntime()
  getWorldRuntimeMock.mockResolvedValue({
    configured: true, ok: true, runtime,
    integrityHash: 'sha256-test', settings: {}, rollTypeOverrides: {}
  })
})

function intelligenceValue(byCategory: Awaited<ReturnType<typeof getDerivedCharacter>> extends { available: true; derived: infer D } ? D extends { byCategory: infer B } ? B : never : never) {
  for (const entries of Object.values(byCategory as Record<string, { id: string; value?: unknown }[] | undefined>)) {
    const entry = entries?.find((candidate) => candidate.id === 'value:ability.int')
    if (entry) return entry.value
  }
  return undefined
}

function abilityValue(byCategory: unknown, id: string) {
  for (const entries of Object.values(byCategory as Record<string, { id: string; value?: unknown }[] | undefined>)) {
    const entry = entries?.find((candidate) => candidate.id === id)
    if (entry) return entry.value
  }
  return undefined
}

describe('CONFIRM/PERSISTENCE DEFECT -- real round trip, Tonso\'s exact shape', () => {
  const choiceKey = 'feat:class:progression:4:choice:feat.selection:choice:feat.asi-ability-increase'

  const progression = {
    classes: [{ classRef: CLASS_REF, level: 5, subclassRef: null }],
    feats: [{ featRef: ASI_FEAT_REF, choiceKey: 'class:progression:4:choice:feat.selection' }]
  }
  const rulesChoices = {
    selections: {
      [choiceKey]: ['source:asi.increase.int', 'source:asi.increase.int']
    }
  }
  const abilityScores = {
    method: 'standard-array',
    scores: { str: 8, dex: 12, con: 10, int: 15, wis: 14, cha: 13 }
  }

  it('a confirmed ASI feat with a [INT,INT] nested answer raises derived Intelligence from base 15 to 17 on an ordinary (non-preview) read -- this is the exact defect, and fails against the pre-fix normalizeStoredRulesChoices', async () => {
    mockEntityAndBlocks(progression, rulesChoices, abilityScores)

    const result = await getDerivedCharacter(WORLD_ID, CHARACTER_ID)
    expect(result.available).toBe(true)
    if (!result.available) return

    expect(intelligenceValue(result.derived.byCategory)).toBe(17)
  })

  it('RELOAD TEST -- repeated independent reads stay at 17, never drift upward (no double-application, nothing persisted by a read)', async () => {
    mockEntityAndBlocks(progression, rulesChoices, abilityScores)

    const first = await getDerivedCharacter(WORLD_ID, CHARACTER_ID)
    const second = await getDerivedCharacter(WORLD_ID, CHARACTER_ID)
    const third = await getDerivedCharacter(WORLD_ID, CHARACTER_ID)

    for (const result of [first, second, third]) {
      expect(result.available).toBe(true)
      if (!result.available) continue
      expect(intelligenceValue(result.derived.byCategory)).toBe(17)
    }
  })

  it('base Intelligence in ability_scores is never mutated -- the +2 is entirely Source-derived, not a rewrite of the stored 15', async () => {
    mockEntityAndBlocks(progression, rulesChoices, abilityScores)
    expect(abilityScores.scores.int).toBe(15) // the fixture itself, never touched by a read
    const result = await getDerivedCharacter(WORLD_ID, CHARACTER_ID)
    expect(result.available).toBe(true)
  })
})

describe('CONFIRM/PERSISTENCE DEFECT -- a non-repeating two-ability split (the OTHER legal ASI shape) was never broken, and still is not', () => {
  it('[INT,WIS] (two DISTINCT abilities, +1 each) derives Intelligence 16 and Wisdom 15', async () => {
    const choiceKey = 'feat:class:progression:4:choice:feat.selection:choice:feat.asi-ability-increase'
    mockEntityAndBlocks(
      {
        classes: [{ classRef: CLASS_REF, level: 5, subclassRef: null }],
        feats: [{ featRef: ASI_FEAT_REF, choiceKey: 'class:progression:4:choice:feat.selection' }]
      },
      { selections: { [choiceKey]: ['source:asi.increase.int', 'source:asi.increase.wis'] } },
      { method: 'standard-array', scores: { str: 8, dex: 12, con: 10, int: 15, wis: 14, cha: 13 } }
    )

    const result = await getDerivedCharacter(WORLD_ID, CHARACTER_ID)
    expect(result.available).toBe(true)
    if (!result.available) return
    expect(abilityValue(result.derived.byCategory, 'value:ability.int')).toBe(16)
    expect(abilityValue(result.derived.byCategory, 'value:ability.wis')).toBe(15)
  })
})

describe('CONFIRM/PERSISTENCE DEFECT -- MULTIPLE ASI LEVELS, each with its own duplicate nested answer', () => {
  it('a Level 4 [INT,INT] AND a Level 8 [WIS,WIS], confirmed independently, BOTH survive a Level 8 read', async () => {
    const level4Key = 'feat:class:progression:4:choice:feat.selection:choice:feat.asi-ability-increase'
    const level8Key = 'feat:class:progression:8:choice:feat.selection:choice:feat.asi-ability-increase'

    mockEntityAndBlocks(
      {
        classes: [{ classRef: CLASS_REF, level: 8, subclassRef: null }],
        feats: [
          { featRef: ASI_FEAT_REF, choiceKey: 'class:progression:4:choice:feat.selection' },
          { featRef: ASI_FEAT_REF, choiceKey: 'class:progression:8:choice:feat.selection' }
        ]
      },
      {
        selections: {
          [level4Key]: ['source:asi.increase.int', 'source:asi.increase.int'],
          [level8Key]: ['source:asi.increase.wis', 'source:asi.increase.wis']
        }
      },
      { method: 'standard-array', scores: { str: 8, dex: 12, con: 10, int: 15, wis: 14, cha: 13 } }
    )

    const result = await getDerivedCharacter(WORLD_ID, CHARACTER_ID)
    expect(result.available).toBe(true)
    if (!result.available) return
    expect(abilityValue(result.derived.byCategory, 'value:ability.int')).toBe(17)
    expect(abilityValue(result.derived.byCategory, 'value:ability.wis')).toBe(16)
  })
})
