// Regression test for the real-browser production defect: a fresh Wizard's
// Level 2 Scholar/Expertise choice never appeared, and Confirm Level Up was
// enabled with `requiredChoices: []`.
//
// ---------------------------------------------------------------------------
// WHY EVERY OTHER PHASE 1B TEST MISSED THIS
// ---------------------------------------------------------------------------
// tests/server/utils/character-progression-plan.test.ts (and
// character-actor-bridge.test.ts) mock `getWorldRuntime` to return a
// runtime built by reading packages/eldra-dnd5e-2024/{manifest,definitions}.json
// straight off disk with `readFileSync`, via `createWorldRuntime` directly.
// That is the SOURCE a human edits and reviews -- it is NOT what a real
// World's Rules Engine ever evaluates. A World only ever runs a PUBLISHED
// `rules_packages` row (server/utils/rules-packages.ts's own
// `loadPublishedPackage`), and published rows are immutable, versioned, and
// require an explicit `pnpm run directus:publish-rules-package` PLUS an
// explicit per-World `POST .../rules/activate` -- neither of which is part
// of `pnpm run build`/`pnpm run dev` (see that script's own header,
// design decisions 1-5). Editing definitions.json on disk changes NOTHING
// about what an already-activated World evaluates until both of those
// manual steps run. Every existing test that reads the on-disk file
// directly is therefore structurally unable to notice "the source is
// correct but was never (re)published" -- it always sees the freshest
// content, which a real running World never does until someone explicitly
// ships it.
//
// This file closes that gap: `directusServiceRequest` (the one boundary
// BOTH `loadWorldRulesConfig` and `loadPublishedPackage` actually call) is
// the only thing mocked. `getWorldRuntime` -> `loadWorldRulesConfig` ->
// `loadPublishedPackage` -> `createWorldRuntime` -> `planProgression` all
// run for real, exactly the composition a live request performs. The
// "stale published package" fixture below is the REAL on-disk package with
// ONLY the Phase 1B additions (the six `value:skill.*.expertise`
// Definitions, `choice:skill.expertise`, `progression:class.skill-expertise`)
// removed -- i.e. exactly what `rules_packages` still contained the moment
// after Phase 1B's commit shipped app code but before anyone ran the
// publish script. `app/lib/content-rules/dnd5e-2024.ts` (the Wizard
// facet's own `progression:` reference) is ALWAYS the current, deployed
// version in this test, matching the real defect exactly: the app code
// referencing `progression:class.skill-expertise` was already live: the
// PACKAGE it names was not.

import { readFileSync } from 'node:fs'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { directusServiceRequestMock, assembleCharacterMock, loadWorldRulesConfigMock } = vi.hoisted(() => ({
  directusServiceRequestMock: vi.fn(),
  assembleCharacterMock: vi.fn(),
  loadWorldRulesConfigMock: vi.fn()
}))

vi.mock('../../../server/utils/directus', () => ({
  directusServiceRequest: directusServiceRequestMock
}))

vi.mock('../../../server/utils/character-assembly', () => ({
  assembleCharacter: assembleCharacterMock
}))

// Mocked directly, matching tests/server/utils/world-runtime-service.test.ts's
// own established precedent exactly ("loadWorldRulesConfig/loadPublishedPackage
// are mocked directly... createWorldRuntime and everything beneath it... are
// the REAL, unmocked engine") -- this file goes one layer further than that
// precedent by leaving `loadPublishedPackage` itself REAL, since that is the
// exact boundary this defect lives at. `loadWorldRulesConfig` is unrelated to
// the bug (it only says WHICH package/version a World has pinned), so
// mocking it directly keeps this test focused.
vi.mock('../../../server/utils/world-rules-config', () => ({
  loadWorldRulesConfig: loadWorldRulesConfigMock
}))

import { clearRulesPackageCache, computeIntegrityHash } from '../../../server/utils/rules-packages'
import { parseExpression } from '../../../app/lib/rules/parser'
import type { Definition, RulesPackageManifest } from '../../../app/lib/rules/types'
import { findRulesFacet } from '../../../app/lib/content-rules'
import { planProgression } from '../../../server/utils/character-progression-plan'
import { getDerivedCharacterAtLevel } from '../../../server/utils/character-derived'
import { progressionChoiceKey } from '../../../app/lib/characters/rules-choices'

const PACKAGE_DIR = 'packages/eldra-dnd5e-2024'
const CLASS_REF = { packageId: 'eldra.content.xphb', slug: 'wizard-xphb' }

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

const REAL_MANIFEST = JSON.parse(readFileSync(`${PACKAGE_DIR}/manifest.json`, 'utf8')) as RulesPackageManifest
const REAL_DEFINITIONS = hydrate(JSON.parse(readFileSync(`${PACKAGE_DIR}/definitions.json`, 'utf8'))) as Definition[]

// The Phase 1B additions, named explicitly -- removing exactly these (and
// nothing else) from the real, current definitions array reconstructs what
// `rules_packages` still held the instant after Phase 1B's app code shipped
// but before its own package content was ever published.
const PHASE_1B_ADDED_IDS = new Set([
  'value:skill.arcana.expertise',
  'value:skill.history.expertise',
  'value:skill.investigation.expertise',
  'value:skill.medicine.expertise',
  'value:skill.nature.expertise',
  'value:skill.religion.expertise',
  'choice:skill.expertise',
  'progression:class.skill-expertise'
])

// Phase 1B did not only ADD Definitions -- it also EXTENDED six existing
// `.bonus` formulas with an Expertise branch (character-progression-plan.ts's
// own PACKAGE section). A "stale" fixture that merely filters out the added
// ids while keeping the NEW formula text would be a package that never
// actually existed (new formulas referencing Definitions that are not
// there) and fails DependencyGraph construction outright -- confirmed by
// running exactly that filter-only version once before writing this
// comment. The pre-Phase-1B formula text, verified verbatim against
// `git show d40bb07:packages/eldra-dnd5e-2024/definitions.json` (the last
// commit before Phase 1B touched this file), is restored here so the
// "stale" fixture is the REAL package that was genuinely published, byte
// for byte -- not an invented intermediate state.
const PRE_PHASE_1B_BONUS_FORMULAS: Record<string, string> = {
  'value:skill.arcana.bonus': '@value:ability.int.mod + if(@value:skill.arcana.proficient, @value:proficiency_bonus, 0)',
  'value:skill.history.bonus': '@value:ability.int.mod + if(@value:skill.history.proficient, @value:proficiency_bonus, 0)',
  'value:skill.investigation.bonus': '@value:ability.int.mod + if(@value:skill.investigation.proficient, @value:proficiency_bonus, 0)',
  'value:skill.medicine.bonus': '@value:ability.wis.mod + if(@value:skill.medicine.proficient, @value:proficiency_bonus, 0)',
  'value:skill.nature.bonus': '@value:ability.int.mod + if(@value:skill.nature.proficient, @value:proficiency_bonus, 0)',
  'value:skill.religion.bonus': '@value:ability.int.mod + if(@value:skill.religion.proficient, @value:proficiency_bonus, 0)'
}

const STALE_VERSION = '0.9.0'
const STALE_DEFINITIONS = REAL_DEFINITIONS
  .filter((definition) => !PHASE_1B_ADDED_IDS.has(definition.id))
  .map((definition) => {
    const oldFormula = PRE_PHASE_1B_BONUS_FORMULAS[definition.id]
    if (!oldFormula) return definition
    const parsed = parseExpression(oldFormula)
    if (!parsed.ok) throw new Error(`Failed to parse reverted formula: ${oldFormula}`)
    return { ...definition, formula: { text: oldFormula, ast: parsed.ast } } as Definition
  })
const STALE_MANIFEST: RulesPackageManifest = { ...REAL_MANIFEST, version: STALE_VERSION }

// Sanity on the fixture itself -- if this ever fails, the id list above has
// drifted from what Phase 1B actually added, and the "stale" fixture below
// would silently stop representing the real pre-publish state.
if (STALE_DEFINITIONS.length !== REAL_DEFINITIONS.length - PHASE_1B_ADDED_IDS.size) {
  throw new Error('PHASE_1B_ADDED_IDS does not match the real package -- fixture is out of date')
}

function directusRow(manifest: RulesPackageManifest, definitions: Definition[]) {
  return {
    package_id: manifest.packageId,
    version: manifest.version,
    status: 'published',
    engine_api_version: manifest.engineApiVersion,
    state_schema_version: manifest.stateSchemaVersion,
    title: manifest.title,
    integrity_hash: computeIntegrityHash(definitions),
    license_id: manifest.license?.id ?? null,
    created_at: new Date().toISOString(),
    manifest: { ...manifest, status: 'published' },
    definitions,
    validation_issues: null
  }
}

function baseEntry(overrides: Record<string, unknown> = {}) {
  return {
    packageId: 'eldra.content.xphb', packageVersion: '1.0.0', systemKey: 'dnd5e',
    title: 'Thing', slug: 'thing', externalId: 'thing', provider: '5etools-json',
    ...overrides
  }
}

// Tonso-Fun-Jr-shaped: a fresh real Wizard at level 1, using the REAL,
// currently-deployed Rules Facet (app/lib/content-rules/dnd5e-2024.ts) --
// the facet's own `progression:` reference is never stale in this test,
// matching the real defect exactly (app code deploys immediately; package
// content does not).
function wizardBlueprint(overrides: Record<string, unknown> = {}) {
  return {
    worldId: '5',
    characterId: '42',
    characterTitle: 'Tonso Fun Jr.',
    species: { status: 'resolved', entry: baseEntry({ title: 'Human', slug: 'human-xphb' }) },
    class: {
      status: 'resolved',
      entry: baseEntry({ title: 'Wizard', slug: CLASS_REF.slug, rulesFacet: findRulesFacet('dnd5e.2024', 'class', CLASS_REF.slug) ?? undefined })
    },
    background: { status: 'resolved', entry: baseEntry({ title: 'Sage', slug: 'sage-xphb' }) },
    abilityScores: { method: 'standard-array', scores: { str: 10, dex: 10, con: 12, int: 16, wis: 10, cha: 10 } },
    rulesChoices: null,
    inventory: [],
    notes: null,
    health: null,
    spells: [],
    expendedSlots: {},
    progression: { classes: [{ classRef: CLASS_REF, level: 1 }] },
    packs: [],
    ...overrides
  }
}

// Dispatches by the SAME `filter.package_id`/`filter.version` shape
// `loadPublishedPackage` actually sends -- one mock function serving
// whichever published row the currently-activated World asks for, exactly
// like a real `rules_packages` collection with two published rows would.
function mockDirectusRulesPackages(rows: ReturnType<typeof directusRow>[]) {
  directusServiceRequestMock.mockImplementation(async (path: string, options: any) => {
    if (!path.includes('/items/rules_packages')) throw new Error(`Unexpected Directus path in this test: ${path}`)
    const wantedId = options?.query?.filter?._and?.[0]?.package_id?._eq
    const wantedVersion = options?.query?.filter?._and?.[1]?.version?._eq
    const match = rows.find((row) => row.package_id === wantedId && row.version === wantedVersion)
    return { data: match ? [match] : [] }
  })
}

beforeEach(() => {
  directusServiceRequestMock.mockReset()
  assembleCharacterMock.mockReset()
  loadWorldRulesConfigMock.mockReset()
  assembleCharacterMock.mockResolvedValue({ available: true, blueprint: wizardBlueprint() })
  // `loadPublishedPackage`'s own module-level cache is keyed by
  // `packageId@version` and is otherwise correctly permanent for the life
  // of a real process (published rows are genuinely immutable) -- cleared
  // here only so this file's own two fixtures (and any other test file
  // exercising the real `eldra.rules.dnd5e-2024` id in the same worker)
  // never see a stale cache hit from a previous test.
  clearRulesPackageCache()
})

describe('REGRESSION -- fresh Wizard 1->5 plan against the STALE published package (reproduces the real browser defect)', () => {
  beforeEach(() => {
    loadWorldRulesConfigMock.mockResolvedValue({
      worldId: '5',
      activePackageId: STALE_MANIFEST.packageId,
      activePackageVersion: STALE_VERSION,
      activePackageIntegrity: computeIntegrityHash(STALE_DEFINITIONS),
      worldConfigVersion: 1,
      settings: {},
      rollTypes: {}
    })
    mockDirectusRulesPackages([directusRow(STALE_MANIFEST, STALE_DEFINITIONS)])
  })

  it('produces requiredChoices: [] at Level 2 and plan.valid: true -- the EXACT browser symptom', async () => {
    const result = await planProgression('5', '42', 5)
    expect(result.ok).toBe(true)
    if (!result.ok) return

    const level2 = result.plan.steps.find((step) => step.level === 2)!
    expect(level2.requiredChoices).toEqual([])
    expect(result.plan.unresolvedChoiceIds).toEqual([])
    // This is the exact bug: Confirm Level Up would be enabled.
    expect(result.plan.valid).toBe(true)
  })

  // Proves this phase's OWN diagnostic fix (server/utils/character-actor-bridge.ts's
  // new `unresolvedGrants` entry for a `facet.progression` reference the
  // active package does not declare) actually fires against this exact
  // real scenario -- an app-code-deployed Wizard facet naming a Progression
  // a stale published package has never heard of, surfaced instead of
  // silently behaving as if the facet named none at all.
  it('reports the unresolved progression reference in unresolvedGrants, via the real bridge', async () => {
    const result = await getDerivedCharacterAtLevel('5', '42', 2)
    expect(result.available).toBe(true)
    if (!result.available) return
    expect(result.derived.unresolvedGrants).toContain('progression:class.skill-expertise')
  })
})

describe('FIX PROOF -- the identical plan against the PUBLISHED-AND-ACTIVATED current package', () => {
  beforeEach(() => {
    loadWorldRulesConfigMock.mockResolvedValue({
      worldId: '5',
      activePackageId: REAL_MANIFEST.packageId,
      activePackageVersion: REAL_MANIFEST.version,
      activePackageIntegrity: computeIntegrityHash(REAL_DEFINITIONS),
      worldConfigVersion: 2,
      settings: {},
      rollTypes: {}
    })
    mockDirectusRulesPackages([directusRow(REAL_MANIFEST, REAL_DEFINITIONS)])
  })

  it('produces the real Scholar/Expertise choice at Level 2 and plan.valid: false until answered', async () => {
    const result = await planProgression('5', '42', 5)
    expect(result.ok).toBe(true)
    if (!result.ok) return

    const key = progressionChoiceKey('class', 2, 'choice:skill.expertise')
    const level2 = result.plan.steps.find((step) => step.level === 2)!
    expect(level2.requiredChoices).toHaveLength(1)
    expect(level2.requiredChoices[0]?.id).toBe(key)
    expect(level2.requiredChoices[0]?.options).toHaveLength(6)
    expect(result.plan.unresolvedChoiceIds).toEqual([key])
    expect(result.plan.valid).toBe(false)
  })

  it('resolves and validates once a legal tentative answer is supplied', async () => {
    const key = progressionChoiceKey('class', 2, 'choice:skill.expertise')
    const result = await planProgression('5', '42', 5, { [key]: ['value:skill.arcana.expertise'] })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.plan.unresolvedChoiceIds).toEqual([])
    expect(result.plan.valid).toBe(true)
  })
})

describe('package version MUST bump before republishing -- manifest.json is no longer 0.9.0', () => {
  it('the real on-disk manifest version differs from the stale (pre-fix) fixture', () => {
    expect(REAL_MANIFEST.version).not.toBe(STALE_VERSION)
  })
})
