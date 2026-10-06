// PRODUCTION-PATH ACCEPTANCE -- progression fail-closed, with the REAL completeness authority.
// This file never stubs creation-completeness. A transition that crosses a mandatory decision Eldra
// cannot record is invalid at Preview and refused at Confirm, through the same planner and confirm path
// the Level Manager uses. Classification: ACCEPTANCE (tests/rules/completeness-stub-policy.test.ts).
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
  // Character Progression Phase 1C -- new dependencies this module gained
  // for Content Pack staleness fingerprinting (listContentPackBindingsForWorld)
  // and confirm-time subclass re-resolution (getWorldContentCatalogue).
  // Defaulted below (beforeEach) to "no bindings, empty catalogue" -- the
  // correct, inert state for every test in this file that predates Phase
  // 1C and never selects a subclass.
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
  planProgression,
  resolveCurrentProgression
} from '../../../server/utils/character-progression-plan'
import { progressionChoiceKey } from '../../../app/lib/characters/rules-choices'
import { serializeContentRef } from '../../../app/lib/characters/progression-plan'

const PACKAGE_DIR = 'packages/eldra-dnd5e-2024'
const CLASS_REF = { packageId: 'eldra.content.xphb', slug: 'wizard-xphb' }

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
      }
    ],
    items: [], spells: [], monsters: [],
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
    spells: [],
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

  const runtime = loadRealRuntime()
  getWorldRuntimeMock.mockResolvedValue({
    configured: true, ok: true, runtime,
    integrityHash: 'sha256-test', settings: {}, rollTypeOverrides: {}
  })
  assembleCharacterMock.mockResolvedValue({ available: true, blueprint: wizardBlueprint() })
  saveCharacterProgressionMock.mockImplementation(async (_id: unknown, stored: unknown) => stored)
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

// PHASE 0 -- FAIL CLOSED, through the real planner and the real confirm path. A transition that
// crosses a mandatory decision Eldra cannot record is invalid at Preview, and refused at Confirm
// even when the caller holds a fingerprint from a valid-looking plan.
describe('PHASE 0 -- fail-closed progression, with the REAL completeness authority', () => {

  it('a Wizard 1 -> 2 Preview is invalid and names the decisions it crosses (the prepared spells and spellbook growth)', async () => {
    assembleCharacterMock.mockResolvedValue({ available: true, blueprint: wizardBlueprint() })
    const result = await planProgression('5', '42', 2, {})
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.plan.valid).toBe(false)
    const families = (result.plan.unresolvedDecisions ?? []).map((u) => u.family)
    expect(families).toEqual(expect.arrayContaining(['spell-count', 'spell-choice']))
  })

  it('a Wizard 1 -> 2 Confirm is refused as unsupported-decision and writes nothing', async () => {
    assembleCharacterMock.mockResolvedValue({ available: true, blueprint: wizardBlueprint() })
    const preview = await planProgression('5', '42', 2, {})
    expect(preview.ok).toBe(true)
    if (!preview.ok) return
    const confirm = await confirmProgression('5', '42', 2, preview.plan.fingerprint, {})
    expect(confirm).toMatchObject({ ok: false, reason: 'unsupported-decision' })
    expect(saveCharacterProgressionMock).not.toHaveBeenCalled()
  })

  it('a crafted Confirm that carries a valid fingerprint and no answers is refused the same way', async () => {
    assembleCharacterMock.mockResolvedValue({ available: true, blueprint: wizardBlueprint() })
    const preview = await planProgression('5', '42', 2, {})
    if (!preview.ok) throw new Error('preview failed')
    const crafted = await confirmProgression('5', '42', 2, preview.plan.fingerprint, { 'class:progression:2:choice:spell': ['x'] })
    expect(crafted.ok).toBe(false)
    expect(saveCharacterProgressionMock).not.toHaveBeenCalled()
  })

  it('a Fighter 1 -> 2 crosses no unrecordable decision, so it still plans valid and confirms', async () => {
    const fighterRef = { packageId: 'eldra.content.xphb', slug: 'fighter-xphb' }
    assembleCharacterMock.mockResolvedValue({
      available: true,
      blueprint: wizardBlueprint({
        class: { status: 'resolved', entry: baseEntry({ title: 'Fighter', slug: 'fighter-xphb', rulesFacet: findRulesFacet('dnd5e.2024', 'class', 'fighter-xphb') ?? undefined }) },
        progression: { classes: [{ classRef: fighterRef, level: 1 }] }
      })
    })
    const preview = await planProgression('5', '42', 2, {})
    expect(preview.ok).toBe(true)
    if (!preview.ok) return
    expect(preview.plan.unresolvedDecisions ?? []).toEqual([])
    const confirm = await confirmProgression('5', '42', 2, preview.plan.fingerprint, {})
    expect(confirm.ok).toBe(true)
    expect(saveCharacterProgressionMock).toHaveBeenCalledTimes(1)
  })
})
