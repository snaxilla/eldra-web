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

function catalogueWithSubclass() {
  return {
    worldId: 'w1', packs: [], species: [], classes: [], backgrounds: [],
    feats: [], items: [], spells: [], monsters: [],
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

  // Character Progression Phase 1B/1C: Level 2 surfaces the real
  // Scholar/skill Expertise choice; Level 3 (Phase 1C) surfaces the real
  // Subclass choice -- see app/lib/content-rules/dnd5e-2024.ts's own header
  // for the corpus evidence for both. Levels 4/5 remain honestly empty (ASI
  // remains a documented content-authoring gap, per this phase's own
  // explicit DO NOT TOUCH).
  it('surfaces exactly the real Scholar/Expertise choice at level 2 and the real Subclass choice at level 3, and nothing at levels 4/5', async () => {
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
      options: expect.arrayContaining([
        { id: SCHOLAR_ARCANA_OPTION, label: expect.any(String) }
      ])
    }])
    expect(level2.requiredChoices[0]!.options).toHaveLength(6)

    const level3 = result.plan.steps.find((step) => step.level === 3)!
    expect(level3.requiredChoices).toEqual([{
      id: SUBCLASS_CHOICE_KEY,
      label: expect.any(String),
      count: 1,
      selected: [],
      answered: false,
      kind: 'content',
      options: [{ id: SUBCLASS_OPTION, label: 'School of Evocation' }]
    }])

    for (const level of [4, 5]) {
      const step = result.plan.steps.find((s) => s.level === level)!
      expect(step.requiredChoices).toEqual([])
    }

    expect(result.plan.unresolvedChoiceIds).toEqual([SCHOLAR_CHOICE_KEY, SUBCLASS_CHOICE_KEY])
    expect(result.plan.valid).toBe(false)
  })

  // TESTING -- PROGRESSION #15/#16/#17: answering only one of the two
  // required choices must leave the plan invalid; only answering BOTH
  // resolves it.
  it('answering Expertise alone leaves the plan invalid -- Subclass is still unresolved', async () => {
    const result = await planProgression('5', '42', 5, { [SCHOLAR_CHOICE_KEY]: [SCHOLAR_ARCANA_OPTION] })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.plan.unresolvedChoiceIds).toEqual([SUBCLASS_CHOICE_KEY])
    expect(result.plan.valid).toBe(false)
  })

  it('answering Subclass alone leaves the plan invalid -- Expertise is still unresolved', async () => {
    const result = await planProgression('5', '42', 5, { [SUBCLASS_CHOICE_KEY]: [SUBCLASS_OPTION] })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.plan.unresolvedChoiceIds).toEqual([SCHOLAR_CHOICE_KEY])
    expect(result.plan.valid).toBe(false)
  })

  it('a tentative answer to BOTH choices resolves them and makes the plan valid, without persisting anything', async () => {
    const result = await planProgression('5', '42', 5, {
      [SCHOLAR_CHOICE_KEY]: [SCHOLAR_ARCANA_OPTION],
      [SUBCLASS_CHOICE_KEY]: [SUBCLASS_OPTION]
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
    expect(result.plan.unresolvedChoiceIds).toEqual([])
    expect(result.plan.valid).toBe(true)

    // Tentative means tentative -- nothing was written anywhere.
    expect(saveCharacterRulesChoicesMock).not.toHaveBeenCalled()
    expect(saveCharacterProgressionMock).not.toHaveBeenCalled()
  })

  it('an invalid tentative answer (illegal option) leaves the choice unresolved rather than silently accepted', async () => {
    const result = await planProgression('5', '42', 5, {
      [SCHOLAR_CHOICE_KEY]: ['value:skill.athletics.expertise'],
      [SUBCLASS_CHOICE_KEY]: [SUBCLASS_OPTION]
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
      [SUBCLASS_CHOICE_KEY]: [SUBCLASS_OPTION]
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.currentLevel).toBe(5)

    expect(saveCharacterProgressionMock).toHaveBeenCalledWith('42', {
      classes: [{ classRef: CLASS_REF, level: 5, subclassRef: { packageId: 'eldra.content.xphb', slug: 'school-of-evocation-phb' } }]
    })
    expect(saveCharacterProgressionMock).toHaveBeenCalledTimes(1)
    // Only the Definition-kind answer reaches rules_choices -- see
    // SUBCLASS AUTHORITY.
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
      [SUBCLASS_CHOICE_KEY]: [SUBCLASS_OPTION]
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
    const answers = { [SCHOLAR_CHOICE_KEY]: [SCHOLAR_ARCANA_OPTION], [SUBCLASS_CHOICE_KEY]: [SUBCLASS_OPTION] }
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
  // Fighter has no `RulesFacet.progression` at all (only Wizard does, this
  // phase's own one authored case) -- Phase 1A's own "exactly one write"
  // behavior is unchanged for every OTHER character/class.
  it('a Fighter 1 -> 5 confirms with only the progression write, never touching rules_choices', async () => {
    const fighterRef = { packageId: 'eldra.content.xphb', slug: 'fighter-xphb' }
    assembleCharacterMock.mockResolvedValue({
      available: true,
      blueprint: wizardBlueprint({
        class: { status: 'resolved', entry: baseEntry({ title: 'Fighter', slug: 'fighter-xphb', rulesFacet: findRulesFacet('dnd5e.2024', 'class', 'fighter-xphb') ?? undefined }) },
        progression: { classes: [{ classRef: fighterRef, level: 1 }] }
      })
    })

    const planResult = await planProgression('5', '42', 5)
    expect(planResult.ok).toBe(true)
    if (!planResult.ok) return
    expect(planResult.plan.valid).toBe(true)

    const confirmResult = await confirmProgression('5', '42', 5, planResult.plan.fingerprint)
    expect(confirmResult.ok).toBe(true)
    if (!confirmResult.ok) return
    expect(saveCharacterProgressionMock).toHaveBeenCalledWith('42', { classes: [{ classRef: fighterRef, level: 5, subclassRef: null }] })
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
      [SUBCLASS_CHOICE_KEY]: [SUBCLASS_OPTION]
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

    const planResult = await planProgression('5', '42', 5)
    expect(planResult.ok).toBe(true)
    if (!planResult.ok) return

    const confirmResult = await confirmProgression('5', '42', 5, planResult.plan.fingerprint)
    expect(confirmResult.ok).toBe(true)
    if (!confirmResult.ok) return
    expect(saveCharacterProgressionMock).toHaveBeenCalledWith('42', { classes: [{ classRef: fighterRef, level: 5, subclassRef: null }] })
  })
})
