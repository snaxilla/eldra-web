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

// UNIT-ISOLATION (classified in tests/rules/completeness-stub-policy.test.ts): this file asserts MECHANICS
// only. The completeness authority is replaced by the explicit stub in tests/helpers/completeness-stub.ts, so it
// makes no claim that a real PHB character can be created or progressed.
vi.mock('../../../app/lib/content-rules/creation-completeness', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../app/lib/content-rules/creation-completeness')>()),
  ...(await import('../../helpers/completeness-stub')).MECHANICS_ONLY_COMPLETENESS
}))

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
  'progression:class.skill-expertise',
  // Character Progression Phase 1C -- also excluded here, unchanged
  // variable name notwithstanding: the STALE fixture below represents the
  // real 0.9.0 published row, which genuinely predates these too. Without
  // this, the STALE scenario would incorrectly ALSO surface the new
  // Level-3 subclass choice (present in the real, current package this
  // list is filtered FROM), diluting this describe block's own narrow,
  // original purpose -- proving the Level-2 Scholar/Expertise regression
  // in isolation.
  'choice:class.subclass',
  'progression:class.subclass-selection'
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
    // Character Progression Phase 1C -- character-derived.ts now calls
    // getWorldContentCatalogue whenever the bridge declares a content
    // choice (the real Wizard facet's new Level-3 subclass row, reached by
    // every 1->5 plan this file builds). This test file's own World has no
    // bound Content Pack, so an empty binding list is the correct, honest
    // answer -- these tests exercise ONLY Rules Package staleness, never
    // subclass content, and an empty catalogue keeps that scope intact.
    if (path.includes('/items/world_content_pack_bindings')) {
      return { data: [] }
    }
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
    // D&D 2024 Character Rules Phase 2A.1 -- this file's own STALE_DEFINITIONS
    // fixture strips only the ORIGINAL Phase 1B skill-expertise ids
    // (PHASE_1B_ADDED_IDS, above); every Phase 2A.1 definition (`progression:
    // class.asi-wizard`, `choice:feat.selection`, ...) is NOT a "Phase 1B
    // added id" and therefore remains present and fully functional in this
    // "stale" fixture. A 1->5 Wizard walk now legitimately crosses the real
    // Level 4 Feat Selection choice, unrelated to the Scholar/stale-package
    // regression this test targets -- so `unresolvedChoiceIds`/`plan.valid`
    // now correctly reflect THAT new, real, unanswered choice. The
    // regression this test actually proves is narrower and still intact:
    // Level 2 itself declares no required choice and no unresolved grant
    // (asserted immediately below, and in the sibling `it` blocks in this
    // describe for the unresolvedGrants/integrity-hash angles) -- Level 2's
    // OWN behavior is what the real browser defect was about, and it is
    // unchanged.
    expect(result.plan.unresolvedChoiceIds).toEqual([
      'class:progression:4:choice:feat.selection'
    ])
    expect(result.plan.valid).toBe(false)
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
    // CHOICE ELIGIBILITY PHASE 2B -- the real XPHB Scholar rule ("choose a
    // skill in which you have PROFICIENCY") is now enforced
    // (`requiresActive`, packages/eldra-dnd5e-2024/definitions.json); this
    // fixture's own base `rulesChoices: null` has no proficiency at all,
    // which would correctly leave Scholar's options empty (0 of 6, not 6)
    // -- overridden here so this describe block's own real subject
    // (the Level 2 Scholar/Expertise choice APPEARING at all) is
    // unaffected by the separate, newly-enforced prerequisite. Arcana
    // specifically, matching the tentative answer the second test below
    // already supplies.
    assembleCharacterMock.mockResolvedValue({
      available: true,
      blueprint: wizardBlueprint({
        rulesChoices: { selections: { 'class:choice:skill.proficiency': ['value:skill.arcana.proficient', 'value:skill.history.proficient'] } }
      })
    })
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

  // Character Progression Phase 1C -- targetLevel 2, not 5: the real
  // package now ALSO declares a Level 3 subclass choice (this phase's own
  // addition), which is out of scope for this describe block's own narrow
  // purpose (proving the Level 2 Scholar/Expertise regression fix in
  // isolation, unchanged). Capping the plan at level 2 keeps it from ever
  // reaching level 3, so this test's assertions stay exactly what they
  // were about. The Level 3 choice itself is covered by
  // tests/server/utils/character-actor-bridge.test.ts's own subclass tests
  // and this file's own dedicated Phase 1C describe block, below.
  it('produces the real Scholar/Expertise choice at Level 2 and plan.valid: false until answered', async () => {
    const result = await planProgression('5', '42', 2)
    expect(result.ok).toBe(true)
    if (!result.ok) return

    const key = progressionChoiceKey('class', 2, 'choice:skill.expertise')
    const level2 = result.plan.steps.find((step) => step.level === 2)!
    expect(level2.requiredChoices).toHaveLength(1)
    expect(level2.requiredChoices[0]?.id).toBe(key)
    // CHOICE ELIGIBILITY PHASE 2B -- 2, not 6: Scholar's real XPHB rule
    // ("a skill in which you have proficiency") now correctly narrows the
    // 6-skill list down to only the ones THIS character (proficient in
    // Arcana + History only, a real, legal Wizard pick) actually
    // qualifies for -- `requiresActive`, the real prerequisite this
    // section exists to prove was previously missing entirely.
    expect(level2.requiredChoices[0]?.options).toHaveLength(2)
    expect(level2.requiredChoices[0]?.options.map((option) => option.id)).toEqual(
      expect.arrayContaining(['value:skill.arcana.expertise', 'value:skill.history.expertise'])
    )
    expect(result.plan.unresolvedChoiceIds).toEqual([key])
    expect(result.plan.valid).toBe(false)
  })

  it('resolves and validates once a legal tentative answer is supplied', async () => {
    const key = progressionChoiceKey('class', 2, 'choice:skill.expertise')
    const result = await planProgression('5', '42', 2, { [key]: ['value:skill.arcana.expertise'] })
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
