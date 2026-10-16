// Unit tests for server/utils/character-progression-plan.ts -- Character
// Progression Phase 1A (Game Admin Level Manager + Authoritative Level
// Transition Engine) and Phase 1B (Package-Authored Progression
// Declarations + Level-Triggered Choices + Progression Choice Persistence).
//
// `assembleCharacter`/`getWorldRuntime` mocked at the module boundary, the
// Rules Runtime REAL (built via createWorldRuntime from the actual
// eldra-dnd5e-2024 package on disk) -- matching character-recovery.test.ts's/
// character-cast.test.ts's own precedent exactly, so every Proficiency
// Bonus/Max HP/Hit Dice number, AND every Phase 1B Progression/ChoiceSet
// (`progression:class.skill-expertise`, `choice:skill.expertise`) these
// tests assert on is the real, shipped package content -- not a hand-typed
// fixture that could drift from it. `saveCharacterProgression`
// (server/utils/character-progression.ts) and `loadCharacterRulesChoices`/
// `saveCharacterRulesChoices` (server/utils/character-rules-choices.ts) are
// mocked -- the only real Directus writes/reads this module ever performs.
//
// Every fingerprint used below is obtained from a REAL `planProgression()`
// call's own `.fingerprint`, never a hand-typed string -- Phase 1B folds
// the active package's own integrity hash into it (this file's own
// PACKAGE VERSIONING header), so a hardcoded fingerprint would silently
// stop matching the moment that format changes again, exactly the
// "client never invents its own plan" discipline this module's own header
// already requires of every real caller.

import { readFileSync } from 'node:fs'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// UNIT-ISOLATION (see tests/helpers/completeness-stub.ts): the progression plan MECHANICS are tested with
// the completeness authority stubbed. The fail-closed behaviour through this planner is tested with the REAL
// authority in tests/server/utils/character-progression-fail-closed.test.ts.
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
  // Character Progression Phase 1C -- new dependencies this module gained
  // for Content Pack staleness fingerprinting (listContentPackBindingsForWorld)
  // and confirm-time subclass re-resolution (getWorldContentCatalogue).
  // Defaulted below (beforeEach) to "no bindings, empty catalogue" -- the
  // correct, inert state for every test in this file that predates Phase
  // 1C and never selects a subclass.
  listContentPackBindingsForWorldMock: vi.fn(),
  getWorldContentCatalogueMock: vi.fn(),
  // D&D 2024 Character Rules P3.4 -- the ONE new write this module's own
  // confirmProgression gained, mocked the same way saveCharacterProgression/
  // saveCharacterRulesChoices already are -- the real Directus client would
  // otherwise reach `useRuntimeConfig()`, which does not exist in this plain
  // Node Vitest environment.
  saveCharacterSpellcastingMock: vi.fn()
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

vi.mock('../../../server/utils/character-spellcasting', () => ({
  saveCharacterSpellcasting: saveCharacterSpellcastingMock
}))

import { createWorldRuntime } from '../../../app/lib/rules/world-runtime'
import { parseExpression } from '../../../app/lib/rules/parser'
import type { Definition, RulesPackageManifest } from '../../../app/lib/rules/types'
import { findRulesFacet } from '../../../app/lib/content-rules'
import {
  confirmProgression,
  planProgression,
  resolveCurrentProgression
} from '../../../server/utils/character-progression-plan'
import { progressionChoiceKey } from '../../../app/lib/characters/rules-choices'
import { resolveDnd5eItemMechanics } from '../../../app/lib/item-mechanics/dnd5e'
import { serializeContentRef } from '../../../app/lib/characters/progression-plan'
import { fullySatisfyingSpellState } from '../../helpers/satisfying-spell-fixture'

const PACKAGE_DIR = 'packages/eldra-dnd5e-2024'
const CLASS_REF = { packageId: 'eldra.content.xphb', slug: 'wizard-xphb' }
// D&D 2024 Character Rules P3.4 -- DragoWizard is a REAL-fixture convenience Wizard this whole file
// uses for UNRELATED mechanics (Scholar, Subclass, Feat Selection, ASI). See
// tests/helpers/satisfying-spell-fixture.ts's own header for why its persisted spell state must now
// satisfy Wizard's own real spellRequirements at whatever target level a given test uses.
const WIZARD_SPELL_REQUIREMENTS = findRulesFacet('dnd5e.2024', 'class', 'wizard-xphb')?.spellRequirements ?? []

// Character Progression Phase 1B -- the real, package-declared identity of
// the one real Wizard choice this phase authors (Level 2's real XPHB
// "Scholar" feature): `progressionChoiceKey('class', 2, 'choice:skill.expertise')`,
// computed here via the real function rather than hand-typed, so a rename
// on either side fails this file loudly instead of silently drifting.
const SCHOLAR_CHOICE_KEY = progressionChoiceKey('class', 2, 'choice:skill.expertise')
const SCHOLAR_ARCANA_OPTION = 'value:skill.arcana.expertise'

// Character Progression Phase 1C -- the real, package-declared identity of
// the new Level 3 Subclass choice, computed via the real functions rather
// than hand-typed. `SUBCLASS_OPTION` is a stable, made-up-but-consistent
// ContentRef this file's own `catalogueWithSubclass` fixture (below)
// resolves as the one legal Wizard subclass option in every test's default
// World -- these tests exercise the generic progression machinery, not any
// real published subclass corpus (that is covered by
// tests/server/utils/character-actor-bridge.test.ts and the corpus/content
// tests instead).
const SUBCLASS_CHOICE_KEY = progressionChoiceKey('class', 3, 'choice:class.subclass')
const SUBCLASS_OPTION = serializeContentRef({ packageId: 'eldra.content.xphb', slug: 'school-of-evocation-phb' })

// ALL-CLASS PROGRESSION CONTRACT AUDIT (2026-10-01) -- `progressionChoiceKey`
// depends only on slot/level/choiceSetId, never on which class, so Fighter's
// own subclass choice (now that `progression:class.subclass-selection` is
// referenced by every class's facet, not only Wizard's) is answered under
// this EXACT SAME key -- `battle-master-xphb` is the real, production-
// verified XPHB slug (confirmed this phase directly against Solaris's own
// bound Content Pack), reused here rather than invented.
const FIGHTER_SUBCLASS_OPTION = serializeContentRef({ packageId: 'eldra.content.xphb', slug: 'battle-master-xphb' })

// D&D 2024 Character Rules Phase 2A.1 -- the real, package-declared
// identity of the new Level 4 Feat Selection choice both Wizard AND Fighter
// now legitimately cross on a 1->5 walk (`progressionChoiceKey` does not
// encode which class/Progression Definition produced a row, only the
// slot/level/ChoiceSet -- the same property SUBCLASS_CHOICE_KEY already
// has, and harmless here since no character in this file has more than one
// class). `FEAT_OPTION` names "Actor" specifically because it is a FIXED
// ability-increase feat (`sources: ['source:asi.increase.cha']` in the real
// facet corpus) -- it introduces no NESTED ability-distribution choice,
// keeping these pre-existing tests (which predate Feat Selection and are
// not themselves testing it) focused on the mechanism they already cover.
const FEAT_CHOICE_KEY = progressionChoiceKey('class', 4, 'choice:feat.selection')
const FEAT_OPTION = serializeContentRef({ packageId: 'eldra.content.xphb', slug: 'actor-xphb' })
// Weapon Mastery phase -- Fighter's own Level-4 growth row, the SAME real choiceSetId shape every
// other Fighter 1->5 walk below now crosses.
const FIGHTER_WEAPON_MASTERY_KEY = progressionChoiceKey('class', 4, 'choice:class.weapon-mastery')
const WEAPON_MASTERY_OPTION = serializeContentRef({ packageId: 'eldra.content.xphb', slug: 'longsword-xphb' })
// D&D 2024 Character Rules Phase 2A.1 -- the real, package-declared
// Ability Score Improvement feat itself, for the tests below that exercise
// its own nested ability-distribution choice/cap/repeatability behavior
// specifically (Actor, above, deliberately has none of those).
const ASI_OPTION = serializeContentRef({ packageId: 'eldra.content.xphb', slug: 'ability-score-improvement-xphb' })
const ASI_ABILITY_CHOICE_KEY = `feat:${FEAT_CHOICE_KEY}:choice:feat.asi-ability-increase`
// A General feat with a real, checkable prerequisite this character does
// NOT meet by default (DragoWizard's own str is 10, below 13) -- proves
// Confirm-time prerequisite rejection without relying on the unauthored
// armor-proficiency case (§ this phase's own known, honest simplification).
const LOCKED_FEAT_OPTION = serializeContentRef({ packageId: 'eldra.content.xphb', slug: 'great-weapon-master-xphb' })

function catalogueWithSubclass() {
  return {
    worldId: 'w1', packs: [], species: [], classes: [], backgrounds: [],
    feats: [
      {
        packageId: 'eldra.content.xphb',
        packageVersion: '1.0.0',
        systemKey: 'dnd5e',
        title: 'Actor',
        slug: 'actor-xphb',
        externalId: 'Actor__XPHB',
        provider: '5etools-json',
        featMechanics: { category: 'general', variant: 'G', unsupportedPrerequisites: [], repeatable: false, prerequisiteGroups: [] }
      },
      {
        packageId: 'eldra.content.xphb',
        packageVersion: '1.0.0',
        systemKey: 'dnd5e',
        title: 'Ability Score Improvement',
        slug: 'ability-score-improvement-xphb',
        externalId: 'Ability Score Improvement__XPHB',
        provider: '5etools-json',
        featMechanics: { category: 'general', variant: 'G', unsupportedPrerequisites: [], repeatable: true, prerequisiteGroups: [] },
        // The real authored facet -- without this, the bridge's own feat
        // consumption loop (character-actor-bridge.ts's `consumeFacet`)
        // has nothing to apply, and the nested ability-distribution choice
        // would never be declared at all (facetFor returns null for an
        // entry with no rulesFacet, exactly as an unfaceted item already
        // does).
        rulesFacet: findRulesFacet('dnd5e.2024', 'feat', 'ability-score-improvement-xphb') ?? undefined
      },
      {
        packageId: 'eldra.content.xphb',
        packageVersion: '1.0.0',
        systemKey: 'dnd5e',
        title: 'Great Weapon Master',
        slug: 'great-weapon-master-xphb',
        externalId: 'Great Weapon Master__XPHB',
        provider: '5etools-json',
        featMechanics: {
          category: 'general',
          variant: 'G',
          unsupportedPrerequisites: [],
          repeatable: false,
          prerequisiteGroups: [[{ kind: 'ability', ability: 'str', minimum: 13 }]]
        }
      },
      // D&D 2024 Character Rules A1 -- a real, repeatable General feat with its own
      // `repeatAcquisitionDifferentiator` (the real corpus's own "must choose a different damage
      // type each time for Energy Mastery"), for the differentiator-enforcement tests below.
      // Prerequisite left empty (DragoWizard is a real caster either way) -- these tests isolate
      // the differentiator mechanism, not prerequisite checking (already covered above).
      {
        packageId: 'eldra.content.xphb',
        packageVersion: '1.0.0',
        systemKey: 'dnd5e',
        title: 'Elemental Adept',
        slug: 'elemental-adept-xphb',
        externalId: 'Elemental Adept__XPHB',
        provider: '5etools-json',
        featMechanics: { category: 'general', variant: 'G', unsupportedPrerequisites: [], repeatable: true, prerequisiteGroups: [] },
        rulesFacet: findRulesFacet('dnd5e.2024', 'feat', 'elemental-adept-xphb') ?? undefined
      }
    ],
    // Weapon Mastery phase -- Fighter's own real Level-4 growth row (progression:class.weapon-
    // mastery-growth-4-10-16) is crossed by every 1->5 walk this file's own Fighter tests exercise
    // below -- a real, arbitrary, legal weapon identity so that row's own answer can resolve.
    items: [{
      packageId: 'eldra.content.xphb',
      packageVersion: '1.0.0',
      systemKey: 'dnd5e',
      title: 'Longsword',
      slug: 'longsword-xphb',
      externalId: 'Longsword__XPHB',
      provider: '5etools-json',
      itemMechanics: resolveDnd5eItemMechanics({ weaponCategory: 'martial', type: 'M|XPHB', property: ['V|XPHB'], mastery: ['Sap|XPHB'] })
    }],
    spells: [], monsters: [],
    subclasses: [
      {
        packageId: 'eldra.content.xphb',
        packageVersion: '1.0.0',
        systemKey: 'dnd5e',
        title: 'School of Evocation',
        slug: 'school-of-evocation-phb',
        externalId: 'School of Evocation__PHB',
        provider: '5etools-json',
        parentClassSlug: CLASS_REF.slug
      },
      // ALL-CLASS PROGRESSION CONTRACT AUDIT (2026-10-01) -- a second,
      // Fighter-parented option, needed now that `progression:class.
      // subclass-selection` is referenced by every class's facet (see
      // FIGHTER_SUBCLASS_OPTION's own comment above) -- this file's
      // existing Fighter-blueprint tests cross the real Level-3 subclass
      // row in their own 1->5 walk and must be able to answer it.
      {
        packageId: 'eldra.content.xphb',
        packageVersion: '1.0.0',
        systemKey: 'dnd5e',
        title: 'Battle Master',
        slug: 'battle-master-xphb',
        externalId: 'Battle Master__XPHB',
        provider: '5etools-json',
        parentClassSlug: 'fighter-xphb'
      }
    ]
  }
}

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
  return {
    packageId: 'eldra.content.xphb', packageVersion: '1.0.0', systemKey: 'dnd5e',
    title: 'Thing', slug: 'thing', externalId: 'thing', provider: '5etools-json',
    ...overrides
  }
}

// DragoWizard-shaped: a real Wizard, INT 16 (+3), starting at level 1.
// `progression` is the field this phase itself adds -- absent means level 1
// (assembleCharacter's own synthesis, exercised for real by
// character-assembly.test.ts; here we set it explicitly per test).
function wizardBlueprint(overrides: Record<string, unknown> = {}) {
  return {
    worldId: '5',
    characterId: '42',
    characterTitle: 'DragoWizard',
    species: { status: 'resolved', entry: baseEntry({ title: 'Human', slug: 'human-xphb' }) },
    class: {
      status: 'resolved',
      entry: baseEntry({ title: 'Wizard', slug: CLASS_REF.slug, rulesFacet: findRulesFacet('dnd5e.2024', 'class', CLASS_REF.slug) ?? undefined })
    },
    background: { status: 'resolved', entry: baseEntry({ title: 'Sage', slug: 'sage-xphb' }) },
    abilityScores: { method: 'standard-array', scores: { str: 10, dex: 10, con: 12, int: 16, wis: 10, cha: 10 } },
    // CHOICE ELIGIBILITY PHASE 2B -- the real XPHB Scholar rule ("choose a
    // skill in which you have proficiency") is now enforced
    // (`requiresActive`, packages/eldra-dnd5e-2024/definitions.json).
    // DragoWizard's own established identity throughout this file already
    // answers Scholar with Arcana (`SCHOLAR_ARCANA_OPTION`) -- this
    // fixture needs to actually BE proficient in Arcana for that to
    // remain a legal pick, which the previous bare `null` default never
    // supplied (correctly unnoticed until this phase, since nothing
    // enforced the prerequisite before now).
    // Wizard's own real skill-proficiency choice requires exactly 2 picks
    // (`count: 2`) -- both supplied here (Arcana + History) so the
    // selection actually VALIDATES (a 1-of-2 answer never resolves, so
    // `value:skill.arcana.proficient` would never be set at all).
    rulesChoices: { selections: { 'class:choice:skill.proficiency': ['value:skill.arcana.proficient', 'value:skill.history.proficient'] } },
    inventory: [],
    notes: null,
    health: null,
    // D&D 2024 Character Rules P3.4 -- a fully satisfying spell state at Level 5, DragoWizard's
    // own established acceptance target throughout this file (this describe block's own title).
    // A test targeting a DIFFERENT level (8, in the feat-authority block below) overrides this
    // field explicitly with its own `fullySatisfyingSpellState(WIZARD_SPELL_REQUIREMENTS, <level>)`.
    spells: fullySatisfyingSpellState(WIZARD_SPELL_REQUIREMENTS, 5),
    expendedSlots: {},
    progression: { classes: [{ classRef: CLASS_REF, level: 1 }] },
    packs: [],
    ...overrides
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
  saveCharacterSpellcastingMock.mockReset()

  const runtime = loadRealRuntime()
  getWorldRuntimeMock.mockResolvedValue({
    configured: true, ok: true, runtime,
    integrityHash: 'sha256-test', settings: {}, rollTypeOverrides: {}
  })
  assembleCharacterMock.mockResolvedValue({ available: true, blueprint: wizardBlueprint() })
  saveCharacterProgressionMock.mockImplementation(async (_id: unknown, stored: unknown) => stored)
  saveCharacterSpellcastingMock.mockImplementation(async (_id: unknown, stored: unknown) => stored)
  // No creation-time rules choices recorded, by default -- matching
  // `wizardBlueprint`'s own `rulesChoices: null` above.
  loadCharacterRulesChoicesMock.mockResolvedValue(null)
  saveCharacterRulesChoicesMock.mockImplementation(async (_id: unknown, stored: unknown) => stored)
  // Character Progression Phase 1C -- no Content Pack bindings, empty
  // catalogue, by default: every test in this file that predates Phase 1C
  // (and every one that does not specifically exercise subclass selection)
  // needs the Content axis to be a stable, empty no-op.
  listContentPackBindingsForWorldMock.mockResolvedValue([])
  // Character Progression Phase 1C -- a legal Wizard subclass option by
  // default (`catalogueWithSubclass`, below CLASS_REF's own declaration):
  // DragoWizard's real 1->5 walk crosses the real Level 3 subclass choice
  // now that the real package declares it, so most tests in this file need
  // a legal option available even when they are not specifically testing
  // subclass selection -- individual tests override with a bare empty
  // catalogue where that absence is the point being tested.
  getWorldContentCatalogueMock.mockResolvedValue(catalogueWithSubclass())
})

describe('resolveCurrentProgression', () => {
  it('reports the current total level from the assembled blueprint', async () => {
    const result = await resolveCurrentProgression('5', '42')
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.state.currentLevel).toBe(1)
    expect(result.state.progression).toEqual({ classes: [{ classRef: CLASS_REF, level: 1 }] })
  })

  it('reports character-not-found', async () => {
    assembleCharacterMock.mockResolvedValue({ available: false, reason: 'character-not-found' })
    const result = await resolveCurrentProgression('5', '999')
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.reason).toBe('character-not-found')
  })
})

describe('planProgression -- DragoWizard 1 -> 5 (the required acceptance target)', () => {
  it('produces one step per entered level, in ascending order', async () => {
    const result = await planProgression('5', '42', 5)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.plan.currentLevel).toBe(1)
    expect(result.plan.targetLevel).toBe(5)
    expect(result.plan.steps.map((step) => step.level)).toEqual([2, 3, 4, 5])
  })

  it('surfaces the Proficiency Bonus increase as an automatic consequence, at exactly the level it changes (5)', async () => {
    const result = await planProgression('5', '42', 5)
    expect(result.ok).toBe(true)
    if (!result.ok) return

    const level5 = result.plan.steps.find((step) => step.level === 5)!
    const profChange = level5.automaticConsequences.find((c) => c.id === 'value:proficiency_bonus')
    expect(profChange).toEqual({ id: 'value:proficiency_bonus', label: expect.any(String), previousValue: 2, newValue: 3 })

    // Levels 2-4 do not cross a proficiency threshold -- no line item for it.
    for (const level of [2, 3, 4]) {
      const step = result.plan.steps.find((s) => s.level === level)!
      expect(step.automaticConsequences.some((c) => c.id === 'value:proficiency_bonus')).toBe(false)
    }
  })

  // Character Progression Phase 1B/1C/2A.1: Level 2 surfaces the real
  // Scholar/skill Expertise choice; Level 3 (Phase 1C) surfaces the real
  // Subclass choice; Level 4 (Phase 2A.1) surfaces the real Feat Selection
  // choice -- see app/lib/content-rules/dnd5e-2024.ts's own header for the
  // corpus evidence for all three. Level 5 remains honestly empty (Wizard's
  // next ASI threshold is Level 8).
  it('surfaces exactly the real Scholar/Expertise choice at level 2, the real Subclass choice at level 3, and the real Feat Selection choice at level 4, nothing at level 5', async () => {
    const result = await planProgression('5', '42', 5)
    expect(result.ok).toBe(true)
    if (!result.ok) return

    const level2 = result.plan.steps.find((step) => step.level === 2)!
    expect(level2.requiredChoices).toEqual([{
      id: SCHOLAR_CHOICE_KEY,
      label: expect.any(String),
      count: 1,
      selected: [],
      answered: false,
      kind: 'definition',
      choiceSetId: 'choice:skill.expertise',
      // D&D 2024 Character Rules Phase 2A.1 UX Correction -- real,
      // package-declared `distinct: true` (definitions.json), now relayed
      // to the client so CharacterProgressionPanel.vue's generic renderer
      // can tell this apart from a `distinct: false` choice.
      distinct: true,
      options: expect.arrayContaining([
        { id: SCHOLAR_ARCANA_OPTION, label: expect.any(String) }
      ])
    }])
    // CHOICE ELIGIBILITY PHASE 2B -- 2, not 6: DragoWizard is proficient in
    // only Arcana + History (this fixture's own `rulesChoices`), and
    // Scholar's real XPHB rule ("a skill in which you have proficiency")
    // now correctly narrows its 6-skill list down to the ones this
    // character actually qualifies for.
    expect(level2.requiredChoices[0]!.options).toHaveLength(2)

    const level3 = result.plan.steps.find((step) => step.level === 3)!
    expect(level3.requiredChoices).toEqual([{
      id: SUBCLASS_CHOICE_KEY,
      label: expect.any(String),
      count: 1,
      selected: [],
      answered: false,
      kind: 'content',
      choiceSetId: 'choice:class.subclass',
      options: [{ id: SUBCLASS_OPTION, label: 'School of Evocation' }]
    }])

    const level4 = result.plan.steps.find((step) => step.level === 4)!
    expect(level4.requiredChoices).toEqual([{
      id: FEAT_CHOICE_KEY,
      label: expect.any(String),
      count: 1,
      selected: [],
      answered: false,
      kind: 'content',
      choiceSetId: 'choice:feat.selection',
      // This file's own catalogue fixture (catalogueWithSubclass) declares
      // three General feats. PHASE 2C.1: the option list is now the SHARED
      // legality (featOptionVerdict), so Great Weapon Master -- whose real
      // prerequisite is Strength 13, and this character's Strength is 10 --
      // is refused at preview rather than offered and then rejected at Confirm.
      // Actor and Ability Score Improvement have no unmet prerequisite.
      options: expect.arrayContaining([
        { id: FEAT_OPTION, label: 'Actor' },
        { id: ASI_OPTION, label: 'Ability Score Improvement' }
      ])
    }])
    expect(level4.requiredChoices[0]!.options.map((o) => o.id)).not.toContain(LOCKED_FEAT_OPTION)

    const level5 = result.plan.steps.find((s) => s.level === 5)!
    expect(level5.requiredChoices).toEqual([])

    expect(result.plan.unresolvedChoiceIds).toEqual([SCHOLAR_CHOICE_KEY, SUBCLASS_CHOICE_KEY, FEAT_CHOICE_KEY])
    expect(result.plan.valid).toBe(false)
  })

  // TESTING -- PROGRESSION #15/#16/#17: answering only some of the three
  // required choices must leave the plan invalid; only answering ALL THREE
  // resolves it.
  it('answering Expertise alone leaves the plan invalid -- Subclass and Feat Selection are still unresolved', async () => {
    const result = await planProgression('5', '42', 5, { [SCHOLAR_CHOICE_KEY]: [SCHOLAR_ARCANA_OPTION] })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.plan.unresolvedChoiceIds).toEqual([SUBCLASS_CHOICE_KEY, FEAT_CHOICE_KEY])
    expect(result.plan.valid).toBe(false)
  })

  it('answering Subclass alone leaves the plan invalid -- Expertise and Feat Selection are still unresolved', async () => {
    const result = await planProgression('5', '42', 5, { [SUBCLASS_CHOICE_KEY]: [SUBCLASS_OPTION] })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.plan.unresolvedChoiceIds).toEqual([SCHOLAR_CHOICE_KEY, FEAT_CHOICE_KEY])
    expect(result.plan.valid).toBe(false)
  })

  it('a tentative answer to ALL THREE choices resolves them and makes the plan valid, without persisting anything', async () => {
    const result = await planProgression('5', '42', 5, {
      [SCHOLAR_CHOICE_KEY]: [SCHOLAR_ARCANA_OPTION],
      [SUBCLASS_CHOICE_KEY]: [SUBCLASS_OPTION],
      [FEAT_CHOICE_KEY]: [FEAT_OPTION]
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return

    const level2 = result.plan.steps.find((step) => step.level === 2)!
    expect(level2.requiredChoices).toEqual([expect.objectContaining({
      id: SCHOLAR_CHOICE_KEY, selected: [SCHOLAR_ARCANA_OPTION], answered: true
    })])
    const level3 = result.plan.steps.find((step) => step.level === 3)!
    expect(level3.requiredChoices).toEqual([expect.objectContaining({
      id: SUBCLASS_CHOICE_KEY, selected: [SUBCLASS_OPTION], answered: true
    })])
    const level4 = result.plan.steps.find((step) => step.level === 4)!
    expect(level4.requiredChoices).toEqual([expect.objectContaining({
      id: FEAT_CHOICE_KEY, selected: [FEAT_OPTION], answered: true
    })])
    expect(result.plan.unresolvedChoiceIds).toEqual([])
    expect(result.plan.valid).toBe(true)

    // Tentative means tentative -- nothing was written anywhere.
    expect(saveCharacterRulesChoicesMock).not.toHaveBeenCalled()
    expect(saveCharacterProgressionMock).not.toHaveBeenCalled()
  })

  it('an invalid tentative answer (illegal option) leaves the choice unresolved rather than silently accepted', async () => {
    const result = await planProgression('5', '42', 5, {
      [SCHOLAR_CHOICE_KEY]: ['value:skill.athletics.expertise'],
      [SUBCLASS_CHOICE_KEY]: [SUBCLASS_OPTION],
      [FEAT_CHOICE_KEY]: [FEAT_OPTION]
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.plan.unresolvedChoiceIds).toEqual([SCHOLAR_CHOICE_KEY])
    expect(result.plan.valid).toBe(false)
  })

  // TESTING -- PROGRESSION #18/#19: a subclass ContentRef that does not
  // exist, or belongs to a different class, is never silently accepted as
  // an answer.
  it('an unknown ContentRef leaves the Subclass choice unresolved', async () => {
    const result = await planProgression('5', '42', 5, {
      [SUBCLASS_CHOICE_KEY]: [serializeContentRef({ packageId: 'eldra.content.xphb', slug: 'no-such-subclass' })]
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.plan.unresolvedChoiceIds).toContain(SUBCLASS_CHOICE_KEY)
  })

  it('base mechanics are unaffected by planning -- the character\'s own stored level is never mutated by a preview', async () => {
    await planProgression('5', '42', 5)
    expect(saveCharacterProgressionMock).not.toHaveBeenCalled()
  })

  it('a real formula reference (Spell Save DC, which reads Proficiency Bonus) also changes at the same threshold level', async () => {
    const result = await planProgression('5', '42', 5)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const level5 = result.plan.steps.find((step) => step.level === 5)!
    expect(level5.automaticConsequences.some((c) => c.id === 'value:spellcasting.save_dc')).toBe(true)
  })
})

describe('planProgression -- validation', () => {
  it('rejects a target level that is not above the current level (advancement only)', async () => {
    const result = await planProgression('5', '42', 1)
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.reason).toBe('not-advancement')
  })

  it('rejects a target level below the current level', async () => {
    assembleCharacterMock.mockResolvedValue({
      available: true,
      blueprint: wizardBlueprint({ progression: { classes: [{ classRef: CLASS_REF, level: 5 }] } })
    })
    const result = await planProgression('5', '42', 3)
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.reason).toBe('not-advancement')
  })

  it('rejects an invalid target level (out of 1-20 range)', async () => {
    const result = await planProgression('5', '42', 25)
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.reason).toBe('invalid-target-level')
  })

  it('rejects a non-integer target level', async () => {
    const result = await planProgression('5', '42', 3.5 as unknown as number)
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.reason).toBe('invalid-target-level')
  })

  it('reports character-not-found', async () => {
    assembleCharacterMock.mockResolvedValue({ available: false, reason: 'character-not-found' })
    const result = await planProgression('5', '999', 5)
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.reason).toBe('character-not-found')
  })
})

// A real preview's own fingerprint -- the fresh, current value, never a
// hand-typed guess (see this file's own header). Every test below that
// needs "a valid fingerprint for the DragoWizard fixture as it currently
// stands" calls this rather than repeating the same three lines.
async function freshFingerprint(targetLevel = 5): Promise<string> {
  const plan = await planProgression('5', '42', targetLevel)
  if (!plan.ok) throw new Error('expected a valid plan')
  return plan.plan.fingerprint
}

describe('confirmProgression -- persistence, ordering, and idempotency', () => {
  // Character Progression Phase 1B -- DragoWizard's own real 1->5 walk now
  // crosses the real Scholar/Expertise choice at level 2, so confirming it
  // requires supplying that answer -- exactly the real end-to-end path this
  // phase's own vertical slice exists to prove.
  it('persists the new target level AND the answered progression choice, choices written before level (the safer ordering)', async () => {
    const fingerprint = await freshFingerprint()
    const callOrder: string[] = []
    saveCharacterRulesChoicesMock.mockImplementation(async (_id: unknown, stored: unknown) => {
      callOrder.push('choices')
      return stored
    })
    saveCharacterProgressionMock.mockImplementation(async (_id: unknown, stored: unknown) => {
      callOrder.push('progression')
      return stored
    })

    const result = await confirmProgression('5', '42', 5, fingerprint, {
      [SCHOLAR_CHOICE_KEY]: [SCHOLAR_ARCANA_OPTION],
      [SUBCLASS_CHOICE_KEY]: [SUBCLASS_OPTION],
      [FEAT_CHOICE_KEY]: [FEAT_OPTION]
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.currentLevel).toBe(5)

    expect(saveCharacterProgressionMock).toHaveBeenCalledWith('42', {
      classes: [{ classRef: CLASS_REF, level: 5, subclassRef: { packageId: 'eldra.content.xphb', slug: 'school-of-evocation-phb' } }],
      feats: [{ featRef: { packageId: 'eldra.content.xphb', slug: 'actor-xphb' }, choiceKey: FEAT_CHOICE_KEY }],
      items: []
    })
    expect(saveCharacterProgressionMock).toHaveBeenCalledTimes(1)
    // Only the Definition-kind answer reaches rules_choices -- see
    // SUBCLASS AUTHORITY. The feat pick is ALSO content-kind (like
    // subclass), so it never reaches rules_choices either -- Actor's own
    // real facet grants a fixed Source, no nested Definition-kind choice.
    expect(saveCharacterRulesChoicesMock).toHaveBeenCalledWith('42', { selections: { [SCHOLAR_CHOICE_KEY]: [SCHOLAR_ARCANA_OPTION] } })
    expect(saveCharacterRulesChoicesMock).toHaveBeenCalledTimes(1)
    expect(callOrder).toEqual(['choices', 'progression'])
  })

  // Character Progression Phase 1B -- CREATION CHOICES VS PROGRESSION
  // CHOICES, tested explicitly: a character with REAL creation-time answers
  // already on record must keep them, byte-identical, after a progression
  // confirm writes a DIFFERENT key into the same block.
  it('never overwrites or deletes existing creation-time rules choices when persisting a progression answer', async () => {
    loadCharacterRulesChoicesMock.mockResolvedValue({
      selections: { 'class:choice:skill.proficiency': ['value:skill.history.proficient', 'value:skill.medicine.proficient'] }
    })
    const fingerprint = await freshFingerprint()

    const result = await confirmProgression('5', '42', 5, fingerprint, {
      [SCHOLAR_CHOICE_KEY]: [SCHOLAR_ARCANA_OPTION],
      [SUBCLASS_CHOICE_KEY]: [SUBCLASS_OPTION],
      [FEAT_CHOICE_KEY]: [FEAT_OPTION]
    })
    expect(result.ok).toBe(true)

    // Only the Definition-kind answer (Expertise) ever reaches rules_choices
    // -- the Content-kind answer (subclass) is NEVER written there (see
    // SUBCLASS AUTHORITY: its sole durable home is
    // progression.classes[].subclassRef, asserted separately below).
    expect(saveCharacterRulesChoicesMock).toHaveBeenCalledWith('42', {
      selections: {
        'class:choice:skill.proficiency': ['value:skill.history.proficient', 'value:skill.medicine.proficient'],
        [SCHOLAR_CHOICE_KEY]: [SCHOLAR_ARCANA_OPTION]
      }
    })
    if (result.ok) {
      expect(result.progression.classes[0]?.subclassRef).toEqual({ packageId: 'eldra.content.xphb', slug: 'school-of-evocation-phb' })
    }
  })

  it('rejects with unresolved-choices, and writes nothing, when the required Scholar choice is not answered', async () => {
    const fingerprint = await freshFingerprint()
    const result = await confirmProgression('5', '42', 5, fingerprint)
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.reason).toBe('unresolved-choices')
    expect(saveCharacterProgressionMock).not.toHaveBeenCalled()
    expect(saveCharacterRulesChoicesMock).not.toHaveBeenCalled()
  })

  it('rejects with unresolved-choices when the submitted answer picks an option this choice does not offer', async () => {
    const fingerprint = await freshFingerprint()
    const result = await confirmProgression('5', '42', 5, fingerprint, { [SCHOLAR_CHOICE_KEY]: ['value:skill.athletics.expertise'] })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.reason).toBe('unresolved-choices')
    expect(saveCharacterRulesChoicesMock).not.toHaveBeenCalled()
  })

  // Idempotency: confirming the SAME already-answered transition a second
  // time (a retried request) must not duplicate anything or corrupt state
  // -- the merge write reproduces the identical final selections map, and
  // the level write reproduces the identical target level.
  it('retrying an identical confirm reproduces the exact same writes, never a duplicate or an incremented level', async () => {
    const fingerprint = await freshFingerprint()
    const answers = {
      [SCHOLAR_CHOICE_KEY]: [SCHOLAR_ARCANA_OPTION],
      [SUBCLASS_CHOICE_KEY]: [SUBCLASS_OPTION],
      [FEAT_CHOICE_KEY]: [FEAT_OPTION]
    }
    const first = await confirmProgression('5', '42', 5, fingerprint, answers)
    expect(first.ok).toBe(true)

    // The retry re-reads current state fresh, including the choice this
    // module's own first call just persisted -- loadCharacterRulesChoicesMock
    // is updated here to reflect that, the same way a real Directus read
    // would on a genuine retry.
    loadCharacterRulesChoicesMock.mockResolvedValue({ selections: { [SCHOLAR_CHOICE_KEY]: [SCHOLAR_ARCANA_OPTION] } })

    const second = await confirmProgression('5', '42', 5, fingerprint, answers)
    expect(second.ok).toBe(true)
    if (!second.ok) return
    expect(second.currentLevel).toBe(5)
    expect(second.progression.classes[0]?.subclassRef).toEqual({ packageId: 'eldra.content.xphb', slug: 'school-of-evocation-phb' })
    expect(saveCharacterRulesChoicesMock).toHaveBeenLastCalledWith('42', { selections: { [SCHOLAR_CHOICE_KEY]: [SCHOLAR_ARCANA_OPTION] } })
  })

  it('rejects a stale fingerprint -- the character\'s level has moved since the plan was previewed', async () => {
    // Plan was generated when the character was level 1, but by confirm
    // time the character is actually level 3.
    const fingerprint = await freshFingerprint()
    assembleCharacterMock.mockResolvedValue({
      available: true,
      blueprint: wizardBlueprint({ progression: { classes: [{ classRef: CLASS_REF, level: 3 }] } })
    })

    const result = await confirmProgression('5', '42', 5, fingerprint)
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.reason).toBe('stale-plan')
    expect(saveCharacterProgressionMock).not.toHaveBeenCalled()
  })

  // Character Progression Phase 1B -- PACKAGE VERSIONING: a fingerprint
  // built against one package integrity hash is stale against a different
  // one, even when the character's own level has not moved at all.
  it('rejects a fingerprint whose package integrity hash no longer matches the currently active package', async () => {
    const fingerprint = await freshFingerprint()
    getWorldRuntimeMock.mockResolvedValue({
      configured: true, ok: true, runtime: loadRealRuntime(),
      integrityHash: 'sha256-different-version', settings: {}, rollTypeOverrides: {}
    })

    const result = await confirmProgression('5', '42', 5, fingerprint)
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.reason).toBe('stale-plan')
    expect(saveCharacterProgressionMock).not.toHaveBeenCalled()
  })

  it('rejects a non-advancing target level even with a fresh fingerprint', async () => {
    const fingerprint = await freshFingerprint(2)
    const result = await confirmProgression('5', '42', 1, fingerprint)
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.reason).toBe('not-advancement')
    expect(saveCharacterProgressionMock).not.toHaveBeenCalled()
  })

  it('rejects when no class is recorded at all', async () => {
    // A genuinely class-less character -- the `class` slot itself
    // unresolved (never a Wizard facet in this specific scenario), matching
    // what `assembleCharacter`'s own synthesis actually produces for a
    // character with no class assigned at all (character-assembly.ts's own
    // "an empty pair means no class was ever recorded" note) -- unlike a
    // resolved Wizard with an empty `progression.classes`, which
    // `assembleCharacter` would have synthesized a level-1 entry for
    // already and therefore cannot really reach this branch in production.
    assembleCharacterMock.mockResolvedValue({
      available: true,
      blueprint: wizardBlueprint({
        class: { status: 'missing', packageId: '', slug: '', reason: 'No class selected' },
        progression: { classes: [] }
      })
    })
    const fingerprint = await freshFingerprint()
    const result = await confirmProgression('5', '42', 5, fingerprint)
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.reason).toBe('no-class-recorded')
    expect(saveCharacterProgressionMock).not.toHaveBeenCalled()
  })

  it('refuses to guess when more than one class entry exists -- multiclassing is not supported by this Level Manager', async () => {
    assembleCharacterMock.mockResolvedValue({
      available: true,
      blueprint: wizardBlueprint({
        progression: {
          classes: [
            { classRef: CLASS_REF, level: 3 },
            { classRef: { packageId: 'eldra.content.xphb', slug: 'fighter-xphb' }, level: 2 }
          ]
        }
      })
    })
    const fingerprint = await freshFingerprint(6)
    const result = await confirmProgression('5', '42', 6, fingerprint)
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.reason).toBe('multiclass-not-supported')
    expect(saveCharacterProgressionMock).not.toHaveBeenCalled()
  })

  it('rejects an invalid target level before any write', async () => {
    const fingerprint = await freshFingerprint()
    const result = await confirmProgression('5', '42', 99, fingerprint)
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.reason).toBe('invalid-target-level')
    expect(saveCharacterProgressionMock).not.toHaveBeenCalled()
  })

  it('reports character-not-found', async () => {
    assembleCharacterMock.mockResolvedValue({ available: false, reason: 'character-not-found' })
    const result = await confirmProgression('5', '999', 5, '1')
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.reason).toBe('character-not-found')
  })
})

describe('confirmProgression -- exactly one write when no real progression choice is crossed', () => {
  // D&D 2024 Character Rules Phase 2A.1 -- Fighter now DOES declare a real
  // `RulesFacet.progression` (`progression:class.asi-fighter`, real XPHB
  // ASI levels 4/6/8/12/14/16), crossed by this same 1->5 walk at level 4.
  // The FEAT pick is still content-kind, so it still never reaches
  // rules_choices (Actor's own facet grants a fixed Source, no nested
  // Definition-kind choice) -- "exactly one write" remains true, just no
  // longer because Fighter has NO progression at all.
  it('a Fighter 1 -> 5 confirms with only the progression write, never touching rules_choices', async () => {
    const fighterRef = { packageId: 'eldra.content.xphb', slug: 'fighter-xphb' }
    assembleCharacterMock.mockResolvedValue({
      available: true,
      blueprint: wizardBlueprint({
        class: { status: 'resolved', entry: baseEntry({ title: 'Fighter', slug: 'fighter-xphb', rulesFacet: findRulesFacet('dnd5e.2024', 'class', 'fighter-xphb') ?? undefined }) },
        progression: { classes: [{ classRef: fighterRef, level: 1 }] }
      })
    })

    // ALL-CLASS PROGRESSION CONTRACT AUDIT (2026-10-01) -- a Fighter 1->5
    // walk now ALSO crosses the real Level-3 subclass row (every class's
    // facet references `progression:class.subclass-selection` as of this
    // fix, not only Wizard's) -- answered here the same way Wizard's own
    // subclass choice already is everywhere else in this file. A content-
    // kind answer is still never persisted to rules_choices (it resolves
    // to `progression.classes[].subclassRef` instead), so "exactly one
    // write" remains true.
    const answers = { [FEAT_CHOICE_KEY]: [FEAT_OPTION], [SUBCLASS_CHOICE_KEY]: [FIGHTER_SUBCLASS_OPTION], [FIGHTER_WEAPON_MASTERY_KEY]: [WEAPON_MASTERY_OPTION] }
    const planResult = await planProgression('5', '42', 5, answers)
    expect(planResult.ok).toBe(true)
    if (!planResult.ok) return
    expect(planResult.plan.valid).toBe(true)

    const confirmResult = await confirmProgression('5', '42', 5, planResult.plan.fingerprint, answers)
    expect(confirmResult.ok).toBe(true)
    if (!confirmResult.ok) return
    expect(saveCharacterProgressionMock).toHaveBeenCalledWith('42', {
      classes: [{ classRef: fighterRef, level: 5, subclassRef: { packageId: 'eldra.content.xphb', slug: 'battle-master-xphb' } }],
      feats: [{ featRef: { packageId: 'eldra.content.xphb', slug: 'actor-xphb' }, choiceKey: FEAT_CHOICE_KEY }],
      items: [{ itemRef: { packageId: 'eldra.content.xphb', slug: 'longsword-xphb' }, choiceKey: FIGHTER_WEAPON_MASTERY_KEY }]
    })
    expect(saveCharacterProgressionMock).toHaveBeenCalledTimes(1)
    expect(saveCharacterRulesChoicesMock).not.toHaveBeenCalled()
  })
})

describe('security/authority -- no client-trusted fact', () => {
  it('confirmProgression re-derives everything -- a valid fresh fingerprint plus a real answer succeeds', async () => {
    // Structural proof: the function signature itself has no slot for a
    // client-provided proficiency bonus, HP, or spell-slot count -- only
    // targetLevel/fingerprint/answers, all independently re-validated.
    const fingerprint = await freshFingerprint()
    const result = await confirmProgression('5', '42', 5, fingerprint, {
      [SCHOLAR_CHOICE_KEY]: [SCHOLAR_ARCANA_OPTION],
      [SUBCLASS_CHOICE_KEY]: [SUBCLASS_OPTION],
      [FEAT_CHOICE_KEY]: [FEAT_OPTION]
    })
    expect(result.ok).toBe(true)
  })

  it('a fingerprint that does not match ANY real prior state is rejected the same as a stale one', async () => {
    const result = await confirmProgression('5', '42', 5, 'not-a-real-fingerprint')
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.reason).toBe('stale-plan')
  })

  it('an answer for a choice this plan does not actually declare is silently ignored, never persisted', async () => {
    const fingerprint = await freshFingerprint()
    const result = await confirmProgression('5', '42', 5, fingerprint, {
      [SCHOLAR_CHOICE_KEY]: [SCHOLAR_ARCANA_OPTION],
      [SUBCLASS_CHOICE_KEY]: [SUBCLASS_OPTION],
      [FEAT_CHOICE_KEY]: [FEAT_OPTION],
      'class:progression:2:choice:not-a-real-choice': ['some-garbage-id']
    })
    expect(result.ok).toBe(true)
    expect(saveCharacterRulesChoicesMock).toHaveBeenCalledWith('42', { selections: { [SCHOLAR_CHOICE_KEY]: [SCHOLAR_ARCANA_OPTION] } })
  })
})

describe('no class-name special cases', () => {
  it('a Fighter (a different class, different facet) plans and confirms through the identical generic path', async () => {
    const fighterRef = { packageId: 'eldra.content.xphb', slug: 'fighter-xphb' }
    assembleCharacterMock.mockResolvedValue({
      available: true,
      blueprint: wizardBlueprint({
        class: { status: 'resolved', entry: baseEntry({ title: 'Fighter', slug: 'fighter-xphb', rulesFacet: findRulesFacet('dnd5e.2024', 'class', 'fighter-xphb') ?? undefined }) },
        progression: { classes: [{ classRef: fighterRef, level: 1 }] }
      })
    })

    // ALL-CLASS PROGRESSION CONTRACT AUDIT (2026-10-01) -- see the
    // identical note on the sibling test immediately above.
    const answers = { [FEAT_CHOICE_KEY]: [FEAT_OPTION], [SUBCLASS_CHOICE_KEY]: [FIGHTER_SUBCLASS_OPTION], [FIGHTER_WEAPON_MASTERY_KEY]: [WEAPON_MASTERY_OPTION] }
    const planResult = await planProgression('5', '42', 5, answers)
    expect(planResult.ok).toBe(true)
    if (!planResult.ok) return

    const confirmResult = await confirmProgression('5', '42', 5, planResult.plan.fingerprint, answers)
    expect(confirmResult.ok).toBe(true)
    if (!confirmResult.ok) return
    expect(saveCharacterProgressionMock).toHaveBeenCalledWith('42', {
      classes: [{ classRef: fighterRef, level: 5, subclassRef: { packageId: 'eldra.content.xphb', slug: 'battle-master-xphb' } }],
      feats: [{ featRef: { packageId: 'eldra.content.xphb', slug: 'actor-xphb' }, choiceKey: FEAT_CHOICE_KEY }],
      items: [{ itemRef: { packageId: 'eldra.content.xphb', slug: 'longsword-xphb' }, choiceKey: FIGHTER_WEAPON_MASTERY_KEY }]
    })
  })
})

// ---------------------------------------------------------------------------
// D&D 2024 Character Rules Phase 2A.1 -- Confirm-time feat authority
// ---------------------------------------------------------------------------
// Every case here proves server authority, not client trust: the SAME
// three checks (catalogue re-resolution, repeatability, prerequisite, cap)
// that a well-behaved client's own picker would already filter, re-run
// independently against a request that skips straight past that filtering.

// D&D 2024 Character Rules Phase 2A.1 -- `assembleCharacterMock` is a
// STATIC mock everywhere else in this file (`.mockResolvedValue`, ignoring
// its own arguments) because every OTHER tentative mechanism this file
// exercises (subclass selection) is resolved directly from `tentativeAnswers`
// by character-derived.ts's own content-choice loop, with no dependency on
// `assembleCharacter` actually USING its `tentativeSubclassRef`/
// `tentativeFeatAcquisitions` parameters. A feat's own NESTED choice
// (Ability Score Improvement's ability-distribution question) is different:
// it is declared only once the feat's own facet reaches the bridge via
// `blueprint.feats`, which requires `assembleCharacter` to actually
// incorporate `tentativeFeatAcquisitions` into the blueprint it returns --
// exactly what the REAL `assembleCharacter` does (character-assembly.ts)
// and what this mock must now also do, for these specific tests only.
function mockAssembleCharacterWithDynamicFeats(overrides: Record<string, unknown> = {}) {
  assembleCharacterMock.mockImplementation(async (
    _worldId: unknown,
    _characterId: unknown,
    _tentativeSubclassRef: unknown,
    tentativeFeatAcquisitions?: readonly { choiceKey: string; ref: { packageId: string; slug: string } }[]
  ) => ({
    available: true,
    blueprint: wizardBlueprint({
      feats: (tentativeFeatAcquisitions ?? []).map(({ choiceKey, ref }) => ({
        status: 'resolved' as const,
        entry: {
          packageId: ref.packageId, packageVersion: '1.0.0', systemKey: 'dnd5e',
          title: ref.slug, slug: ref.slug, externalId: ref.slug, provider: '5etools-json',
          rulesFacet: findRulesFacet('dnd5e.2024', 'feat', ref.slug) ?? undefined
        },
        choiceKey
      })),
      ...overrides
    })
  }))
}

describe('confirmProgression -- feat authority (repeatability, prerequisite, cap)', () => {
  it('rejects a non-repeatable feat already owned from an earlier confirm', async () => {
    // DragoWizard already has Actor (a non-repeatable feat) from a PRIOR,
    // already-confirmed transition -- `base.feats` in confirmProgression's
    // own terms.
    assembleCharacterMock.mockResolvedValue({
      available: true,
      blueprint: wizardBlueprint({
        progression: {
          classes: [{ classRef: CLASS_REF, level: 4 }],
          feats: [{ featRef: { packageId: 'eldra.content.xphb', slug: 'actor-xphb' }, choiceKey: FEAT_CHOICE_KEY }]
        },
        // D&D 2024 Character Rules P3.4 -- this confirm targets Level 8, not the file's own
        // default Level 5 -- the satisfying spell state must match the TARGET this test actually
        // uses (an under-sized Level-5 set would spuriously fail as "missing").
        spells: fullySatisfyingSpellState(WIZARD_SPELL_REQUIREMENTS, 8)
      })
    })
    // A SECOND, later ASI-tier confirm tries to take Actor again.
    const secondFeatKey = progressionChoiceKey('class', 8, 'choice:feat.selection')
    const fingerprint = await freshFingerprint(8)
    const result = await confirmProgression('5', '42', 8, fingerprint, { [secondFeatKey]: [FEAT_OPTION] })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.reason).toBe('illegal-feat-selection')
    expect(saveCharacterProgressionMock).not.toHaveBeenCalled()
  })

  it('accepts the SAME repeatable feat (Ability Score Improvement) taken a second time', async () => {
    assembleCharacterMock.mockResolvedValue({
      available: true,
      blueprint: wizardBlueprint({
        progression: {
          classes: [{ classRef: CLASS_REF, level: 4 }],
          feats: [{ featRef: { packageId: 'eldra.content.xphb', slug: 'ability-score-improvement-xphb' }, choiceKey: FEAT_CHOICE_KEY }]
        },
        // D&D 2024 Character Rules P3.4 -- see the identical note in the previous test.
        spells: fullySatisfyingSpellState(WIZARD_SPELL_REQUIREMENTS, 8)
      })
    })
    const secondFeatKey = progressionChoiceKey('class', 8, 'choice:feat.selection')
    const secondNestedKey = `feat:${secondFeatKey}:choice:feat.asi-ability-increase`
    const fingerprint = await freshFingerprint(8)
    const result = await confirmProgression('5', '42', 8, fingerprint, {
      [secondFeatKey]: [ASI_OPTION],
      [secondNestedKey]: ['source:asi.increase.con', 'source:asi.increase.con']
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.progression.feats).toEqual([
      { featRef: { packageId: 'eldra.content.xphb', slug: 'ability-score-improvement-xphb' }, choiceKey: FEAT_CHOICE_KEY },
      { featRef: { packageId: 'eldra.content.xphb', slug: 'ability-score-improvement-xphb' }, choiceKey: secondFeatKey }
    ])
  })

  // D&D 2024 Character Rules A1 -- Elemental Adept's own real repeatability rule ("you can take
  // this feat more than once, but you must choose a different damage type each time"), the ONE
  // call site where `findIllegalRepeatAcquisition` (app/lib/characters/creation-origin-feat.ts) is
  // actually reachable for a General feat (never offered at creation). The prior acquisition's own
  // nested answer is read back through the SAME merged persisted+tentative selections map
  // (`current.state.rulesChoiceSelections` + `answers`) every other feat-owned nested choice uses.
  describe('repeat-acquisition differentiator (Elemental Adept)', () => {
    const priorChoiceKey = FEAT_CHOICE_KEY
    const priorFeatRef = { packageId: 'eldra.content.xphb', slug: 'elemental-adept-xphb' }
    const priorDamageTypeKey = `feat:${priorChoiceKey}:choice:feat.elemental-adept.damage-type`

    function blueprintWithPriorElementalAdept(damageTypeValueId: string) {
      return wizardBlueprint({
        progression: {
          classes: [{ classRef: CLASS_REF, level: 4 }],
          feats: [{ featRef: priorFeatRef, choiceKey: priorChoiceKey }]
        },
        rulesChoices: {
          selections: {
            'class:choice:skill.proficiency': ['value:skill.arcana.proficient', 'value:skill.history.proficient'],
            [priorDamageTypeKey]: [damageTypeValueId]
          }
        },
        spells: fullySatisfyingSpellState(WIZARD_SPELL_REQUIREMENTS, 8)
      })
    }

    it('a second acquisition with a DIFFERENT legal damage type succeeds, and both are owned', async () => {
      assembleCharacterMock.mockResolvedValue({ available: true, blueprint: blueprintWithPriorElementalAdept('value:elemental-adept.damage-type.fire.active') })
      const secondFeatKey = progressionChoiceKey('class', 8, 'choice:feat.selection')
      const secondNestedKey = `feat:${secondFeatKey}:choice:feat.elemental-adept.damage-type`
      // D&D 2024 Character Rules A1.1 -- Elemental Adept's facet ALSO declares its own real
      // ability-choice-1 (int/wis/cha), now enforced as mandatory too by the generic completeness
      // gate -- a fully legal Confirm answers BOTH of this feat's own declared choices.
      const secondAbilityKey = `feat:${secondFeatKey}:choice:feat.ability-choice-1`
      const fingerprint = await freshFingerprint(8)
      const result = await confirmProgression('5', '42', 8, fingerprint, {
        [secondFeatKey]: [serializeContentRef(priorFeatRef)],
        [secondNestedKey]: ['value:elemental-adept.damage-type.cold.active'],
        [secondAbilityKey]: ['source:asi.increase.int']
      })
      expect(result.ok).toBe(true)
      if (!result.ok) return
      expect(result.progression.feats).toEqual([
        { featRef: priorFeatRef, choiceKey: priorChoiceKey },
        { featRef: priorFeatRef, choiceKey: secondFeatKey }
      ])
    })

    it('a second acquisition with the SAME damage type is rejected, zero writes', async () => {
      assembleCharacterMock.mockResolvedValue({ available: true, blueprint: blueprintWithPriorElementalAdept('value:elemental-adept.damage-type.fire.active') })
      const secondFeatKey = progressionChoiceKey('class', 8, 'choice:feat.selection')
      const secondNestedKey = `feat:${secondFeatKey}:choice:feat.elemental-adept.damage-type`
      const fingerprint = await freshFingerprint(8)
      const result = await confirmProgression('5', '42', 8, fingerprint, {
        [secondFeatKey]: [serializeContentRef(priorFeatRef)],
        [secondNestedKey]: ['value:elemental-adept.damage-type.fire.active']
      })
      expect(result.ok).toBe(false)
      if (result.ok) return
      expect(result.reason).toBe('illegal-feat-selection')
      expect(saveCharacterProgressionMock).not.toHaveBeenCalled()
    })

    // D&D 2024 Character Rules A1.1 -- the generic feat-owned nested choice completeness gate
    // (character-progression-plan.ts, reusing resolveCreationChoices verbatim) now closes the
    // gap the NOTE above used to document: a missing or illegal nested answer is rejected,
    // BEFORE any write, through the real Confirm authority.
    it('a second acquisition with NO damage-type answer is rejected (unresolved choice), zero writes', async () => {
      assembleCharacterMock.mockResolvedValue({ available: true, blueprint: blueprintWithPriorElementalAdept('value:elemental-adept.damage-type.fire.active') })
      const secondFeatKey = progressionChoiceKey('class', 8, 'choice:feat.selection')
      const fingerprint = await freshFingerprint(8)
      const result = await confirmProgression('5', '42', 8, fingerprint, {
        [secondFeatKey]: [serializeContentRef(priorFeatRef)]
      })
      expect(result.ok).toBe(false)
      if (result.ok) return
      expect(result.reason).toBe('unresolved-choices')
      expect(saveCharacterProgressionMock).not.toHaveBeenCalled()
      expect(saveCharacterRulesChoicesMock).not.toHaveBeenCalled()
    })

    it('a second acquisition naming an illegal (non-enumerated) damage-type Value is rejected, zero writes', async () => {
      assembleCharacterMock.mockResolvedValue({ available: true, blueprint: blueprintWithPriorElementalAdept('value:elemental-adept.damage-type.fire.active') })
      const secondFeatKey = progressionChoiceKey('class', 8, 'choice:feat.selection')
      const secondNestedKey = `feat:${secondFeatKey}:choice:feat.elemental-adept.damage-type`
      const fingerprint = await freshFingerprint(8)
      const result = await confirmProgression('5', '42', 8, fingerprint, {
        [secondFeatKey]: [serializeContentRef(priorFeatRef)],
        [secondNestedKey]: ['value:elemental-adept.damage-type.does-not-exist.active']
      })
      expect(result.ok).toBe(false)
      if (result.ok) return
      expect(result.reason).toBe('unresolved-choices')
      expect(saveCharacterProgressionMock).not.toHaveBeenCalled()
      expect(saveCharacterRulesChoicesMock).not.toHaveBeenCalled()
    })

    // A crafted key naming a ChoiceSet THIS feat's own facet never declares is simply never
    // produced by `resolveCreationChoices` at all (it only ever walks the facet's own
    // `choices` array) -- there is no presentation to mark unanswered, so it is silently
    // irrelevant to this gate. It is NOT silently accepted as this feat's answer, though: a
    // crafted key can only ever satisfy a REAL declared key (keyed by this exact choiceKey +
    // choiceSetId), so an undeclared key never substitutes for a real one, and the real one
    // still shows up unanswered.
    it('a crafted key for a ChoiceSet this feat never declares does not satisfy the real nested choice; still rejected', async () => {
      assembleCharacterMock.mockResolvedValue({ available: true, blueprint: blueprintWithPriorElementalAdept('value:elemental-adept.damage-type.fire.active') })
      const secondFeatKey = progressionChoiceKey('class', 8, 'choice:feat.selection')
      const fingerprint = await freshFingerprint(8)
      const result = await confirmProgression('5', '42', 8, fingerprint, {
        [secondFeatKey]: [serializeContentRef(priorFeatRef)],
        [`feat:${secondFeatKey}:choice:does-not-exist`]: ['value:elemental-adept.damage-type.cold.active']
      })
      expect(result.ok).toBe(false)
      if (result.ok) return
      expect(result.reason).toBe('unresolved-choices')
      expect(saveCharacterProgressionMock).not.toHaveBeenCalled()
    })

    // A (re-submitted) answer keyed under the FIRST (prior) acquisition's own choiceKey can
    // never satisfy the SECOND (new) acquisition's own nested choice -- `resolveCreationChoices`
    // keys by `feat:${choiceKey}:${choiceSetId}`, unique per acquisition, never per ChoiceSet
    // alone. Submitting an answer under the WRONG (first) feat's key leaves the SECOND feat's
    // own real required key genuinely unanswered.
    it('an answer keyed under a DIFFERENT (prior) feat acquisition cannot satisfy the current one; still rejected', async () => {
      assembleCharacterMock.mockResolvedValue({ available: true, blueprint: blueprintWithPriorElementalAdept('value:elemental-adept.damage-type.fire.active') })
      const secondFeatKey = progressionChoiceKey('class', 8, 'choice:feat.selection')
      const fingerprint = await freshFingerprint(8)
      const result = await confirmProgression('5', '42', 8, fingerprint, {
        [secondFeatKey]: [serializeContentRef(priorFeatRef)],
        // Mistakenly (or maliciously) re-answers the FIRST acquisition's own key, never the
        // second's -- the real key this NEW acquisition needs is never supplied.
        [priorDamageTypeKey]: ['value:elemental-adept.damage-type.cold.active']
      })
      expect(result.ok).toBe(false)
      if (result.ok) return
      expect(result.reason).toBe('unresolved-choices')
      expect(saveCharacterProgressionMock).not.toHaveBeenCalled()
    })

    // HISTORICAL COMPATIBILITY -- a character who already owns Elemental Adept from a PRIOR
    // confirm, with NO nested damage-type answer on record at all (predates this phase, or was
    // never required under an older rules version), still loads and can progress normally: the
    // completeness gate is scoped to feats ACQUIRED IN THIS TRANSITION only, never retroactively
    // to `base.feats`. A LATER, unrelated transition (e.g. an ordinary ASI pick) must not be
    // blocked by that old, still-missing answer.
    it('a historical Elemental Adept acquisition with no nested answer on record does not block an unrelated later transition', async () => {
      assembleCharacterMock.mockResolvedValue({
        available: true,
        blueprint: wizardBlueprint({
          progression: {
            classes: [{ classRef: CLASS_REF, level: 4 }],
            feats: [{ featRef: priorFeatRef, choiceKey: priorChoiceKey }]
          },
          // No `priorDamageTypeKey` entry at all -- simulates a pre-A1 historical character.
          rulesChoices: { selections: { 'class:choice:skill.proficiency': ['value:skill.arcana.proficient', 'value:skill.history.proficient'] } },
          spells: fullySatisfyingSpellState(WIZARD_SPELL_REQUIREMENTS, 8)
        })
      })
      const secondFeatKey = progressionChoiceKey('class', 8, 'choice:feat.selection')
      const secondNestedKey = `feat:${secondFeatKey}:choice:feat.asi-ability-increase`
      const fingerprint = await freshFingerprint(8)
      const result = await confirmProgression('5', '42', 8, fingerprint, {
        [secondFeatKey]: [ASI_OPTION],
        [secondNestedKey]: ['source:asi.increase.con', 'source:asi.increase.con']
      })
      expect(result.ok).toBe(true)
      if (!result.ok) return
      expect(result.progression.feats).toEqual([
        { featRef: priorFeatRef, choiceKey: priorChoiceKey },
        { featRef: { packageId: 'eldra.content.xphb', slug: 'ability-score-improvement-xphb' }, choiceKey: secondFeatKey }
      ])
    })
  })

  // D&D 2024 Character Rules A1.1 -- the SAME generic completeness gate, proven against ASI's
  // own real nested ability-distribution choice (the choice EVERY existing test in this file's
  // feat-authority block already answers correctly -- these two make that requirement explicit
  // and prove the negative case too).
  describe('generic feat-owned nested choice completeness (ASI)', () => {
    it('ASI with NO nested ability-distribution answer is rejected (unresolved choice), zero writes', async () => {
      assembleCharacterMock.mockResolvedValue({
        available: true,
        blueprint: wizardBlueprint({
          progression: {
            classes: [{ classRef: CLASS_REF, level: 4 }],
            feats: [{ featRef: { packageId: 'eldra.content.xphb', slug: 'actor-xphb' }, choiceKey: FEAT_CHOICE_KEY }]
          },
          spells: fullySatisfyingSpellState(WIZARD_SPELL_REQUIREMENTS, 8)
        })
      })
      const secondFeatKey = progressionChoiceKey('class', 8, 'choice:feat.selection')
      const fingerprint = await freshFingerprint(8)
      const result = await confirmProgression('5', '42', 8, fingerprint, {
        [secondFeatKey]: [ASI_OPTION]
        // The nested `feat:${secondFeatKey}:choice:feat.asi-ability-increase` answer is deliberately omitted.
      })
      expect(result.ok).toBe(false)
      if (result.ok) return
      expect(result.reason).toBe('unresolved-choices')
      expect(saveCharacterProgressionMock).not.toHaveBeenCalled()
      expect(saveCharacterRulesChoicesMock).not.toHaveBeenCalled()
    })

    it('ASI with a legal nested ability-distribution answer is accepted (unchanged behavior)', async () => {
      assembleCharacterMock.mockResolvedValue({
        available: true,
        blueprint: wizardBlueprint({
          progression: {
            classes: [{ classRef: CLASS_REF, level: 4 }],
            feats: [{ featRef: { packageId: 'eldra.content.xphb', slug: 'actor-xphb' }, choiceKey: FEAT_CHOICE_KEY }]
          },
          spells: fullySatisfyingSpellState(WIZARD_SPELL_REQUIREMENTS, 8)
        })
      })
      const secondFeatKey = progressionChoiceKey('class', 8, 'choice:feat.selection')
      const secondNestedKey = `feat:${secondFeatKey}:choice:feat.asi-ability-increase`
      const fingerprint = await freshFingerprint(8)
      const result = await confirmProgression('5', '42', 8, fingerprint, {
        [secondFeatKey]: [ASI_OPTION],
        [secondNestedKey]: ['source:asi.increase.con', 'source:asi.increase.con']
      })
      expect(result.ok).toBe(true)
      if (!result.ok) return
      expect(result.progression.feats).toEqual([
        { featRef: { packageId: 'eldra.content.xphb', slug: 'actor-xphb' }, choiceKey: FEAT_CHOICE_KEY },
        { featRef: { packageId: 'eldra.content.xphb', slug: 'ability-score-improvement-xphb' }, choiceKey: secondFeatKey }
      ])
    })
  })

  it('rejects a feat whose real prerequisite this character does not meet', async () => {
    // DragoWizard's own str is 10 (wizardBlueprint's default) -- Great
    // Weapon Master requires str >= 13.
    const fingerprint = await freshFingerprint()
    const result = await confirmProgression('5', '42', 5, fingerprint, {
      [SCHOLAR_CHOICE_KEY]: [SCHOLAR_ARCANA_OPTION],
      [SUBCLASS_CHOICE_KEY]: [SUBCLASS_OPTION],
      [FEAT_CHOICE_KEY]: [LOCKED_FEAT_OPTION]
    })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.reason).toBe('illegal-feat-selection')
    expect(saveCharacterProgressionMock).not.toHaveBeenCalled()
  })

  it('rejects an ASI distribution that would push an ability above the legal cap of 20', async () => {
    // A character already at 20 Strength (the maximum this feat may ever
    // reach) attempting +2 more.
    mockAssembleCharacterWithDynamicFeats({
      abilityScores: { method: 'standard-array', scores: { str: 20, dex: 10, con: 12, int: 16, wis: 10, cha: 10 } }
    })
    const fingerprint = await freshFingerprint()
    const result = await confirmProgression('5', '42', 5, fingerprint, {
      [SCHOLAR_CHOICE_KEY]: [SCHOLAR_ARCANA_OPTION],
      [SUBCLASS_CHOICE_KEY]: [SUBCLASS_OPTION],
      [FEAT_CHOICE_KEY]: [ASI_OPTION],
      [ASI_ABILITY_CHOICE_KEY]: ['source:asi.increase.str', 'source:asi.increase.str']
    })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.reason).toBe('illegal-feat-selection')
    expect(saveCharacterProgressionMock).not.toHaveBeenCalled()
  })

  it('accepts a legal ASI distribution that stays at or below the cap, and persists the resulting feat', async () => {
    mockAssembleCharacterWithDynamicFeats()
    const fingerprint = await freshFingerprint()
    const result = await confirmProgression('5', '42', 5, fingerprint, {
      [SCHOLAR_CHOICE_KEY]: [SCHOLAR_ARCANA_OPTION],
      [SUBCLASS_CHOICE_KEY]: [SUBCLASS_OPTION],
      [FEAT_CHOICE_KEY]: [ASI_OPTION],
      [ASI_ABILITY_CHOICE_KEY]: ['source:asi.increase.int', 'source:asi.increase.wis']
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.progression.feats).toEqual([
      { featRef: { packageId: 'eldra.content.xphb', slug: 'ability-score-improvement-xphb' }, choiceKey: FEAT_CHOICE_KEY }
    ])
    // The nested ability-distribution answer IS a Definition-kind answer
    // (an 'activate-source' choice, not content-kind) -- it DOES reach
    // rules_choices, alongside Scholar.
    expect(saveCharacterRulesChoicesMock).toHaveBeenCalledWith('42', {
      selections: {
        [SCHOLAR_CHOICE_KEY]: [SCHOLAR_ARCANA_OPTION],
        [ASI_ABILITY_CHOICE_KEY]: ['source:asi.increase.int', 'source:asi.increase.wis']
      }
    })
  })
})

// TIEFLING SPECIES COMPLETION -- the CRITICAL ACCEPTANCE TARGET: Fiendish Legacy's own real
// Level-3/5 fixed spell growth, proven through REAL `confirmProgression`/`resolveCurrentProgression`
// authority (never a bare pure-helper call), using THIS file's own established "mock only the
// Directus I/O boundary, run the real Rules Runtime" pattern. Species facet declares no mandatory
// choice this file's own completeness stub would need answering beyond the legacy/ability picks
// already recorded in `rulesChoices` below -- class is deliberately a bare, unfaceted Fighter (no
// Fighting Style/Weapon Mastery noise) so every assertion stays about Tiefling's own species
// mechanics alone.
describe('TIEFLING SPECIES COMPLETION -- Fiendish Legacy Level-3/5 fixed spell growth, through real confirmProgression authority', () => {
  const TIEFLING_ENTRY = baseEntry({ title: 'Tiefling', slug: 'tiefling-xphb', rulesFacet: findRulesFacet('dnd5e.2024', 'species', 'tiefling-xphb') ?? undefined })
  const FIGHTER_ENTRY_BARE = baseEntry({ title: 'Fighter', slug: 'fighter-xphb' })
  const ABYSSAL_SELECTIONS = {
    'species:choice:species.feature-option': ['source:fiendish-legacy.abyssal'],
    'species:choice:species.innate-spellcasting-ability': ['value:innate-spellcasting.ability.cha']
  }
  const CHTHONIC_SELECTIONS = {
    'species:choice:species.feature-option': ['source:fiendish-legacy.chthonic'],
    'species:choice:species.innate-spellcasting-ability': ['value:innate-spellcasting.ability.cha']
  }

  function tieflingCatalogue() {
    const spell = (slug: string) => baseEntry({ title: slug, slug, packageId: 'eldra.content.xphb' })
    return {
      worldId: '5', packs: [], species: [], classes: [], backgrounds: [], feats: [], subclasses: [], items: [], monsters: [],
      spells: [
        spell('thaumaturgy-xphb'), spell('poison-spray-xphb'), spell('chill-touch-xphb'),
        spell('ray-of-sickness-xphb'), spell('false-life-xphb'),
        spell('hold-person-xphb'), spell('ray-of-enfeeblement-xphb')
      ]
    }
  }

  // A bare "already has its Level-1 spells" baseline, as if persisted by a prior create-v2.post
  // write -- the Level-1 legacy cantrip + Otherworldly Presence's own unconditional Thaumaturgy,
  // tagged with the SAME synthetic provenance `resolveFixedSpellGrants` itself writes.
  function level1Spells(legacyCantripSlug: string) {
    return [
      { instanceId: 'a', ref: { packageId: 'eldra.content.xphb', slug: 'thaumaturgy-xphb' }, known: true, prepared: false, requirementIds: ['fixed-spell-grant.species.thaumaturgy-xphb'] },
      { instanceId: 'b', ref: { packageId: 'eldra.content.xphb', slug: legacyCantripSlug }, known: true, prepared: false, requirementIds: [`fixed-spell-grant.species.${legacyCantripSlug}`] }
    ]
  }

  function tieflingBlueprint(overrides: Record<string, unknown> = {}) {
    return {
      worldId: '5', characterId: '42', characterTitle: 'Rhyzae',
      species: { status: 'resolved', entry: TIEFLING_ENTRY },
      class: { status: 'resolved', entry: FIGHTER_ENTRY_BARE },
      background: { status: 'resolved', entry: baseEntry({ title: 'Criminal', slug: 'criminal-xphb' }) },
      abilityScores: { method: 'standard-array', scores: { str: 15, dex: 14, con: 13, int: 10, wis: 12, cha: 8 } },
      rulesChoices: { selections: ABYSSAL_SELECTIONS },
      inventory: [], notes: null, health: null,
      spells: level1Spells('poison-spray-xphb'),
      expendedSlots: {},
      progression: { classes: [{ classRef: { packageId: 'eldra.content.xphb', slug: 'fighter-xphb' }, level: 1 }] },
      packs: [],
      ...overrides
    }
  }

  beforeEach(() => {
    getWorldContentCatalogueMock.mockResolvedValue(tieflingCatalogue())
  })

  async function confirmTo(targetLevel: number, blueprintOverrides: Record<string, unknown> = {}) {
    assembleCharacterMock.mockResolvedValue({ available: true, blueprint: tieflingBlueprint(blueprintOverrides) })
    const plan = await planProgression('5', '42', targetLevel)
    if (!plan.ok) throw new Error('expected a valid plan')
    return confirmProgression('5', '42', targetLevel, plan.plan.fingerprint)
  }

  it('Level 1 -> 2: no premature Level-3 grant -- only the already-persisted Level-1 spells remain', async () => {
    const result = await confirmTo(2, { progression: { classes: [{ classRef: { packageId: 'eldra.content.xphb', slug: 'fighter-xphb' }, level: 1 }] } })
    expect(result.ok).toBe(true)
    // No NEW spell state to write at all -- the Level window (1, 2] contains neither legacy
    // spell's own minLevel (3 or 5), so resolveFixedSpellGrants resolves nothing new.
    expect(saveCharacterSpellcastingMock).not.toHaveBeenCalled()
  })

  it('Level 2 -> 3: the correct Abyssal Level-3 spell (Ray of Sickness) is granted, always prepared', async () => {
    const result = await confirmTo(3, { progression: { classes: [{ classRef: { packageId: 'eldra.content.xphb', slug: 'fighter-xphb' }, level: 2 }] } })
    expect(result.ok).toBe(true)
    expect(saveCharacterSpellcastingMock).toHaveBeenCalledTimes(1)
    const [, written] = saveCharacterSpellcastingMock.mock.calls[0]!
    const raySickness = written.spells.find((s: any) => s.ref?.slug === 'ray-of-sickness-xphb')
    expect(raySickness).toBeDefined()
    expect(raySickness.known).toBe(false)
    expect(raySickness.prepared).toBe(true)
    // The Level-1 spells persisted BEFORE this confirm are retained, byte-identical, never
    // renumbered.
    expect(written.spells.some((s: any) => s.ref?.slug === 'thaumaturgy-xphb')).toBe(true)
    expect(written.spells.some((s: any) => s.ref?.slug === 'poison-spray-xphb')).toBe(true)
    // Infernal's/Chthonic's own Level-3 spells never leak in for an Abyssal Tiefling.
    expect(written.spells.some((s: any) => s.ref?.slug === 'false-life-xphb')).toBe(false)
    // No duplicate physical rows: every instanceId is distinct.
    const instanceIds = written.spells.map((s: any) => s.instanceId)
    expect(new Set(instanceIds).size).toBe(instanceIds.length)
  })

  it('Level 3 -> 4: the Level-3 grant is retained, and no new grant is added prematurely', async () => {
    const persistedAtLevel3 = [
      ...level1Spells('poison-spray-xphb'),
      { instanceId: 'c', ref: { packageId: 'eldra.content.xphb', slug: 'ray-of-sickness-xphb' }, known: false, prepared: true, requirementIds: ['fixed-spell-grant.species.ray-of-sickness-xphb'] }
    ]
    const result = await confirmTo(4, {
      progression: { classes: [{ classRef: { packageId: 'eldra.content.xphb', slug: 'fighter-xphb' }, level: 3 }] },
      spells: persistedAtLevel3
    })
    expect(result.ok).toBe(true)
    // The window (3, 4] contains neither legacy spell's own minLevel (3 is excluded by the
    // EXCLUSIVE lower bound -- already resolved; 5 is above the upper bound) -- nothing new.
    expect(saveCharacterSpellcastingMock).not.toHaveBeenCalled()
  })

  it('Level 4 -> 5: the correct Abyssal Level-5 spell (Hold Person) is granted, Level-3 grant still present', async () => {
    const persistedAtLevel4 = [
      ...level1Spells('poison-spray-xphb'),
      { instanceId: 'c', ref: { packageId: 'eldra.content.xphb', slug: 'ray-of-sickness-xphb' }, known: false, prepared: true, requirementIds: ['fixed-spell-grant.species.ray-of-sickness-xphb'] }
    ]
    const result = await confirmTo(5, {
      progression: { classes: [{ classRef: { packageId: 'eldra.content.xphb', slug: 'fighter-xphb' }, level: 4 }] },
      spells: persistedAtLevel4
    })
    expect(result.ok).toBe(true)
    expect(saveCharacterSpellcastingMock).toHaveBeenCalledTimes(1)
    const [, written] = saveCharacterSpellcastingMock.mock.calls[0]!
    expect(written.spells.some((s: any) => s.ref?.slug === 'hold-person-xphb')).toBe(true)
    expect(written.spells.some((s: any) => s.ref?.slug === 'ray-of-sickness-xphb')).toBe(true)
    const instanceIds = written.spells.map((s: any) => s.instanceId)
    expect(new Set(instanceIds).size).toBe(instanceIds.length)
  })

  it('a DIRECT Level 1 -> 5 jump grants BOTH the Level-3 and Level-5 spells in one confirm, with no duplicates', async () => {
    const result = await confirmTo(5, { progression: { classes: [{ classRef: { packageId: 'eldra.content.xphb', slug: 'fighter-xphb' }, level: 1 }] } })
    expect(result.ok).toBe(true)
    expect(saveCharacterSpellcastingMock).toHaveBeenCalledTimes(1)
    const [, written] = saveCharacterSpellcastingMock.mock.calls[0]!
    expect(written.spells.some((s: any) => s.ref?.slug === 'ray-of-sickness-xphb')).toBe(true)
    expect(written.spells.some((s: any) => s.ref?.slug === 'hold-person-xphb')).toBe(true)
    expect(written.spells.some((s: any) => s.ref?.slug === 'thaumaturgy-xphb')).toBe(true)
    expect(written.spells.some((s: any) => s.ref?.slug === 'poison-spray-xphb')).toBe(true)
    const instanceIds = written.spells.map((s: any) => s.instanceId)
    expect(new Set(instanceIds).size).toBe(instanceIds.length)
  })

  it('a DIFFERENT legacy (Chthonic) grants its OWN Level-3/5 spells, never Abyssal\'s', async () => {
    const result = await confirmTo(5, {
      rulesChoices: { selections: CHTHONIC_SELECTIONS },
      spells: level1Spells('chill-touch-xphb'),
      progression: { classes: [{ classRef: { packageId: 'eldra.content.xphb', slug: 'fighter-xphb' }, level: 1 }] }
    })
    expect(result.ok).toBe(true)
    const [, written] = saveCharacterSpellcastingMock.mock.calls[0]!
    expect(written.spells.some((s: any) => s.ref?.slug === 'false-life-xphb')).toBe(true)
    expect(written.spells.some((s: any) => s.ref?.slug === 'ray-of-enfeeblement-xphb')).toBe(true)
    expect(written.spells.some((s: any) => s.ref?.slug === 'ray-of-sickness-xphb')).toBe(false)
    expect(written.spells.some((s: any) => s.ref?.slug === 'hold-person-xphb')).toBe(false)
  })

  it('a FRESH READ after the direct 1 -> 5 jump (resolveCurrentProgression) sees the exact persisted state, never re-mutated', async () => {
    const result = await confirmTo(5, { progression: { classes: [{ classRef: { packageId: 'eldra.content.xphb', slug: 'fighter-xphb' }, level: 1 }] } })
    expect(result.ok).toBe(true)
    const [, written] = saveCharacterSpellcastingMock.mock.calls[0]!

    // Simulate the fresh read a later request would perform: assembleCharacter now returns the
    // JUST-WRITTEN spell state (a real character's own next read would see exactly this).
    assembleCharacterMock.mockResolvedValue({
      available: true,
      blueprint: tieflingBlueprint({ spells: written.spells, progression: { classes: [{ classRef: { packageId: 'eldra.content.xphb', slug: 'fighter-xphb' }, level: 5 }] } })
    })
    const fresh = await resolveCurrentProgression('5', '42')
    expect(fresh.ok).toBe(true)
    if (!fresh.ok) return
    expect(fresh.state.currentLevel).toBe(5)
    expect(fresh.state.spells.some((s: any) => s.ref?.slug === 'ray-of-sickness-xphb')).toBe(true)
    expect(fresh.state.spells.some((s: any) => s.ref?.slug === 'hold-person-xphb')).toBe(true)
  })
})
