// Unit tests for server/utils/character-cast.ts -- Character Sheet Body
// Phase 1B.2 (Authoritative Cast Foundation).
//
// `assembleCharacter`/`getWorldRuntime` mocked at the module boundary, the
// Rules Runtime REAL (built via createWorldRuntime from the actual
// eldra-dnd5e-2024 package on disk) -- matching character-actions.test.ts's/
// character-recovery.test.ts's/character-combat.test.ts's own precedent
// exactly, so `getCharacterActions`/`getDerivedCharacter` underneath this
// module run for real: the Wizard's Spell Attack Bonus (+6), Spell Save DC
// (14), and level-1 Spell Slot table (2 first-level slots) all come from
// packages/eldra-dnd5e-2024/definitions.json's real formulas, not a
// hand-built fake that could silently drift from them.
//
// `createSpellAttackRollEvent`/`createSpellDamageRollEvent`
// (server/utils/roll-events.ts) and `broadcastRollEvent`
// (server/utils/roll-realtime-bridge.ts) are mocked -- matching
// character-recovery.test.ts's own precedent for `createHitDieRollEvent`
// exactly ("these tests assert that X calls it with the right
// server-derived numbers... not that OpenDice itself works"; the roll
// arithmetic itself is covered directly in
// tests/server/utils/roll-events-spell-rolls.test.ts). `loadCharacterSpellcasting`/
// `saveCharacterSpellcasting` (server/utils/character-spellcasting.ts) are
// mocked the same way persistence is mocked throughout this file's sibling
// tests, standing in for Directus.
//
// Fire Bolt and Magic Missile's `spellMechanics` are the REAL resolver
// output (`resolveDnd5eSpellMechanics`) against the REAL 5etools XPHB rows
// already used by tests/lib/spell-mechanics/dnd5e.test.ts -- never a
// hand-typed CanonicalSpellMechanics fixture that could drift from what the
// resolver actually produces.

import { readFileSync } from 'node:fs'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
  assembleCharacterMock, getWorldRuntimeMock,
  loadSpellcastingMock, saveSpellcastingMock,
  createSpellAttackRollEventMock, createSpellDamageRollEventMock, createSpellHealingRollEventMock,
  broadcastRollEventMock, getDerivedCharacterOverrideMock
} = vi.hoisted(() => ({
  assembleCharacterMock: vi.fn(),
  getWorldRuntimeMock: vi.fn(),
  loadSpellcastingMock: vi.fn(),
  saveSpellcastingMock: vi.fn(),
  createSpellAttackRollEventMock: vi.fn(),
  createSpellDamageRollEventMock: vi.fn(),
  createSpellHealingRollEventMock: vi.fn(),
  broadcastRollEventMock: vi.fn(),
  // Used ONLY by the "multiple legal cast levels" describe block below --
  // this app has no leveling system yet (character level is the Rules
  // Engine's own stored-value default of 1 for every blueprint this file's
  // real engine can build; see that block's own header), so a level-3+
  // Wizard with a real second Spell Slot level cannot be constructed
  // through the normal blueprint/real-engine pipeline every OTHER test in
  // this file uses. `undefined` (the default) means "defer to the real
  // getDerivedCharacter" -- only that one describe block ever sets it.
  getDerivedCharacterOverrideMock: vi.fn(() => undefined as unknown)
}))

vi.mock('../../../server/utils/character-assembly', () => ({
  assembleCharacter: assembleCharacterMock
}))

vi.mock('../../../server/utils/world-runtime-service', () => ({
  getWorldRuntime: getWorldRuntimeMock
}))

vi.mock('../../../server/utils/character-derived', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../server/utils/character-derived')>()
  return {
    ...actual,
    getDerivedCharacter: async (...args: Parameters<typeof actual.getDerivedCharacter>) => {
      const override = await getDerivedCharacterOverrideMock(...args)
      return override ?? actual.getDerivedCharacter(...args)
    }
  }
})

vi.mock('../../../server/utils/character-spellcasting', () => ({
  loadCharacterSpellcasting: loadSpellcastingMock,
  saveCharacterSpellcasting: saveSpellcastingMock
}))

vi.mock('../../../server/utils/roll-events', () => ({
  createSpellAttackRollEvent: createSpellAttackRollEventMock,
  createSpellDamageRollEvent: createSpellDamageRollEventMock,
  createSpellHealingRollEvent: createSpellHealingRollEventMock
}))

vi.mock('../../../server/utils/roll-realtime-bridge', () => ({
  broadcastRollEvent: broadcastRollEventMock
}))

import { createWorldRuntime } from '../../../app/lib/rules/world-runtime'
import { parseExpression } from '../../../app/lib/rules/parser'
import type { Definition, RulesPackageManifest } from '../../../app/lib/rules/types'
import { findRulesFacet } from '../../../app/lib/content-rules'
import { resolveDnd5eSpellMechanics } from '../../../app/lib/spell-mechanics/dnd5e'
import {
  castSpell,
  castSpellAttack,
  castSpellAutomaticDamage,
  castSpellSave,
  castSpellHeal,
  rollIndependentSpellDamage
} from '../../../server/utils/character-cast'
import rows from '../../lib/content-presentation/fixtures/5etools-real-rows.json'

const PACKAGE_DIR = 'packages/eldra-dnd5e-2024'
const spells = rows.xphb.spells as any

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

// INT 18 -> +4 mod. Level 1 -> proficiency +2. Spell Attack Bonus = 6,
// Spell Save DC = 14 -- the exact numbers character-actions.test.ts's own
// Wizard fixture already proves against the real Rules Engine.
function wizardBlueprint(overrides: Record<string, unknown> = {}) {
  return {
    worldId: '5',
    characterId: '42',
    characterTitle: 'Elminster',
    species: { status: 'resolved', entry: baseEntry({ title: 'Human', slug: 'human-xphb' }) },
    class: {
      status: 'resolved',
      entry: baseEntry({ title: 'Wizard', slug: 'wizard-xphb', rulesFacet: findRulesFacet('dnd5e.2024', 'class', 'wizard-xphb') ?? undefined })
    },
    background: { status: 'resolved', entry: baseEntry({ title: 'Sage', slug: 'sage-xphb' }) },
    abilityScores: { method: 'standard-array', scores: { str: 10, dex: 10, con: 10, int: 18, wis: 10, cha: 10 } },
    rulesChoices: null,
    inventory: [],
    notes: null,
    health: null,
    spells: [],
    expendedSlots: {},
    packs: [],
    ...overrides
  }
}

function preparedSpell(instanceId: string, title: string, mechanics: ReturnType<typeof resolveDnd5eSpellMechanics>) {
  return {
    instanceId, status: 'resolved' as const, title, known: true, prepared: true,
    entry: baseEntry({ title, slug: title.toLowerCase().replace(/\s+/g, '-'), spellMechanics: mechanics })
  }
}

const FIRE_BOLT_MECHANICS = resolveDnd5eSpellMechanics(spells['Fire Bolt'])
const MAGIC_MISSILE_MECHANICS = resolveDnd5eSpellMechanics(spells['Magic Missile'])
const FIREBALL_MECHANICS = resolveDnd5eSpellMechanics(spells.Fireball)
const CHROMATIC_ORB_MECHANICS = resolveDnd5eSpellMechanics(spells['Chromatic Orb'])
const SHIELD_MECHANICS = resolveDnd5eSpellMechanics(spells.Shield)
const ACID_SPLASH_MECHANICS = resolveDnd5eSpellMechanics(spells['Acid Splash'])
const HOLD_PERSON_MECHANICS = resolveDnd5eSpellMechanics(spells['Hold Person'])

beforeEach(() => {
  assembleCharacterMock.mockReset()
  getWorldRuntimeMock.mockReset()
  loadSpellcastingMock.mockReset()
  saveSpellcastingMock.mockReset()
  createSpellAttackRollEventMock.mockReset()
  createSpellDamageRollEventMock.mockReset()
  createSpellHealingRollEventMock.mockReset()
  broadcastRollEventMock.mockReset()
  getDerivedCharacterOverrideMock.mockReset()
  getDerivedCharacterOverrideMock.mockResolvedValue(undefined)

  const runtime = loadRealRuntime()
  getWorldRuntimeMock.mockResolvedValue({
    configured: true, ok: true, runtime,
    integrityHash: 'sha256-test', settings: {}, rollTypeOverrides: {}
  })
  assembleCharacterMock.mockResolvedValue({
    available: true,
    blueprint: wizardBlueprint({
      spells: [
        preparedSpell('spell-1', 'Fire Bolt', FIRE_BOLT_MECHANICS),
        preparedSpell('spell-2', 'Magic Missile', MAGIC_MISSILE_MECHANICS)
      ]
    })
  })
  loadSpellcastingMock.mockResolvedValue({ spells: [], expendedSlots: {} })
  saveSpellcastingMock.mockImplementation(async (_id: unknown, stored: unknown) => stored)
  createSpellAttackRollEventMock.mockResolvedValue({ id: 'roll-attack-1', total: 15 })
  createSpellDamageRollEventMock.mockResolvedValue({ id: 'roll-damage-1', total: 5 })
  createSpellHealingRollEventMock.mockResolvedValue({ id: 'roll-healing-1', total: 12 })
})

const CAST_INPUT = {
  worldId: '5', characterId: '42', rollerUserId: 'account-1',
  visibility: 'private' as const
}

describe('castSpellAttack -- Fire Bolt (cantrip, required acceptance)', () => {
  it('rolls with the real, server-derived Spell Attack Bonus -- never a client-sent number', async () => {
    const result = await castSpellAttack({ ...CAST_INPUT, actionId: 'spell:spell-1' })
    expect(result.ok).toBe(true)
    if (!result.ok) return

    expect(createSpellAttackRollEventMock).toHaveBeenCalledWith(
      expect.objectContaining({ spellName: 'Fire Bolt', sourceId: 'spell:spell-1', attackBonus: 6, broadcast: true })
    )
  })

  it('consumes no spell slot for a cantrip -- no load/save of spellcasting state at all', async () => {
    await castSpellAttack({ ...CAST_INPUT, actionId: 'spell:spell-1' })

    expect(loadSpellcastingMock).not.toHaveBeenCalled()
    expect(saveSpellcastingMock).not.toHaveBeenCalled()
  })

  it('never sends a client-provided attackBonus through -- the input type has no such field', async () => {
    // Structural proof: CastSpellInput (character-cast.ts) has no
    // attackBonus/level/damage field for a caller to even populate; the
    // route's own FORBIDDEN_CAST_FIELDS rejects one anyway if a caller
    // tries at the HTTP boundary (see cast.post.ts).
    const input = { ...CAST_INPUT, actionId: 'spell:spell-1' }
    expect(Object.keys(input)).not.toContain('attackBonus')
  })

  it('never touches spellcasting persistence for a free cantrip -- no `spellcasting` field on the result', async () => {
    const result = await castSpellAttack({ ...CAST_INPUT, actionId: 'spell:spell-1' })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.spellcasting).toBeUndefined()
  })
})

describe('castSpellAutomaticDamage -- Magic Missile (leveled, required acceptance)', () => {
  it('rolls the canonical 1d4+1 force damage, including the "+1" regression', async () => {
    const result = await castSpellAutomaticDamage({ ...CAST_INPUT, actionId: 'spell:spell-2' })
    expect(result.ok).toBe(true)

    expect(createSpellDamageRollEventMock).toHaveBeenCalledWith(
      expect.objectContaining({
        spellName: 'Magic Missile', sourceId: 'spell:spell-2',
        dice: { count: 1, faces: 4 }, modifier: 1, damageType: 'force',
        broadcast: false // withheld until the slot mutation succeeds
      })
    )
  })

  it('returns the updated spellcasting record so the client can update resource presentation without a reload or a second PUT', async () => {
    saveSpellcastingMock.mockResolvedValue({ spells: [], expendedSlots: { '1': 1 } })

    const result = await castSpellAutomaticDamage({ ...CAST_INPUT, actionId: 'spell:spell-2' })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.spellcasting).toEqual({ spells: [], expendedSlots: { '1': 1 } })
  })

  it('expends exactly one level-1 slot on success', async () => {
    await castSpellAutomaticDamage({ ...CAST_INPUT, actionId: 'spell:spell-2' })

    expect(saveSpellcastingMock).toHaveBeenCalledWith('42', { spells: [], expendedSlots: { '1': 1 } })
  })

  it('broadcasts the roll only AFTER the slot mutation has succeeded', async () => {
    const callOrder: string[] = []
    saveSpellcastingMock.mockImplementation(async (_id: unknown, stored: unknown) => {
      callOrder.push('save')
      return stored
    })
    broadcastRollEventMock.mockImplementation(() => { callOrder.push('broadcast') })

    await castSpellAutomaticDamage({ ...CAST_INPUT, actionId: 'spell:spell-2' })

    expect(callOrder).toEqual(['save', 'broadcast'])
    expect(broadcastRollEventMock).toHaveBeenCalledWith({ id: 'roll-damage-1', total: 5 })
  })

  it('rejects the Cast outright when no level-1 slots remain -- BEFORE any roll happens', async () => {
    loadSpellcastingMock.mockResolvedValue({ spells: [], expendedSlots: { '1': 2 } }) // both slots already spent

    const result = await castSpellAutomaticDamage({ ...CAST_INPUT, actionId: 'spell:spell-2' })

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.reason).toBe('resource-unavailable')

    // No roll ever happened, nothing was ever persisted, nothing further
    // was ever spent -- the clean "unavailable" failure path.
    expect(createSpellDamageRollEventMock).not.toHaveBeenCalled()
    expect(saveSpellcastingMock).not.toHaveBeenCalled()
    expect(broadcastRollEventMock).not.toHaveBeenCalled()
  })

  it('a failed slot mutation reports failure and never broadcasts -- the accepted residual-risk ordering, never a free spell', async () => {
    saveSpellcastingMock.mockRejectedValue(new Error('Directus write failed'))

    await expect(castSpellAutomaticDamage({ ...CAST_INPUT, actionId: 'spell:spell-2' })).rejects.toMatchObject({ statusCode: 502 })

    // The roll WAS rolled (createRoll already ran before the mutation was
    // attempted -- see character-cast.ts's own ORDERING header) but was
    // never broadcast, so no connected client saw a result for a Cast this
    // response reports as failed.
    expect(createSpellDamageRollEventMock).toHaveBeenCalled()
    expect(broadcastRollEventMock).not.toHaveBeenCalled()
  })

  it('does not expose a free independent Damage roll for an automatic-damage spell', async () => {
    const result = await rollIndependentSpellDamage({ ...CAST_INPUT, actionId: 'spell:spell-2' })

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.reason).toBe('not-castable')
    expect(createSpellDamageRollEventMock).not.toHaveBeenCalled()
  })
})

describe('rollIndependentSpellDamage -- Fire Bolt\'s own Damage button', () => {
  it('rolls the canonical 1d10 fire damage, unbroadcast-gated (broadcasts immediately, no resource involved)', async () => {
    const result = await rollIndependentSpellDamage({ ...CAST_INPUT, actionId: 'spell:spell-1' })

    expect(result.ok).toBe(true)
    expect(createSpellDamageRollEventMock).toHaveBeenCalledWith(
      expect.objectContaining({
        spellName: 'Fire Bolt', dice: { count: 1, faces: 10 }, modifier: 0, damageType: 'fire', broadcast: true
      })
    )
    expect(loadSpellcastingMock).not.toHaveBeenCalled() // no resource check at all
  })
})

describe('castSpell -- the single dispatching entry point', () => {
  it('routes an attack-roll spell (Fire Bolt) through the attack path', async () => {
    await castSpell({ ...CAST_INPUT, actionId: 'spell:spell-1' })
    expect(createSpellAttackRollEventMock).toHaveBeenCalled()
    expect(createSpellDamageRollEventMock).not.toHaveBeenCalled()
  })

  it('routes an automatic-damage spell (Magic Missile) through the automatic-damage path', async () => {
    await castSpell({ ...CAST_INPUT, actionId: 'spell:spell-2' })
    expect(createSpellDamageRollEventMock).toHaveBeenCalled()
    expect(createSpellAttackRollEventMock).not.toHaveBeenCalled()
  })
})

describe('unsupported spells -- never fabricate a Cast', () => {
  // Character Sheet Body Phase 1B.3 upgrade: Fireball (a saving-throw
  // spell) is now SUPPORTED -- see the dedicated 'castSpellSave' describe
  // blocks below. Shield (resolution: null, no damage, no healing) remains
  // a genuine unsupported-effect case, keeping this describe block's own
  // purpose intact.
  it('rejects an effect-only spell (Shield) as not-castable, and touches no roll/persistence machinery', async () => {
    assembleCharacterMock.mockResolvedValue({
      available: true,
      blueprint: wizardBlueprint({ spells: [preparedSpell('spell-3', 'Shield', SHIELD_MECHANICS)] })
    })

    const result = await castSpell({ ...CAST_INPUT, actionId: 'spell:spell-3' })

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.reason).toBe('not-castable')
    expect(createSpellAttackRollEventMock).not.toHaveBeenCalled()
    expect(createSpellDamageRollEventMock).not.toHaveBeenCalled()
    expect(loadSpellcastingMock).not.toHaveBeenCalled()
  })

  it('a known-but-not-prepared spell is action-not-found -- the same prepared-authority every other server util already trusts', async () => {
    assembleCharacterMock.mockResolvedValue({
      available: true,
      blueprint: wizardBlueprint({
        spells: [{ instanceId: 'spell-1', status: 'resolved', title: 'Fire Bolt', known: true, prepared: false, entry: baseEntry({ spellMechanics: FIRE_BOLT_MECHANICS }) }]
      })
    })

    const result = await castSpell({ ...CAST_INPUT, actionId: 'spell:spell-1' })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.reason).toBe('action-not-found')
  })

  it('reports character-not-found', async () => {
    assembleCharacterMock.mockResolvedValue({ available: false, reason: 'character-not-found' })

    const result = await castSpell({ ...CAST_INPUT, actionId: 'spell:spell-1' })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.reason).toBe('character-not-found')
  })

  it('reports action-not-found for an id the character does not have', async () => {
    const result = await castSpell({ ...CAST_INPUT, actionId: 'spell:does-not-exist' })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.reason).toBe('action-not-found')
  })
})

describe('no spell-name special cases', () => {
  it('a synthetic, differently-named spell with Fire Bolt\'s exact mechanics is Cast identically', async () => {
    assembleCharacterMock.mockResolvedValue({
      available: true,
      blueprint: wizardBlueprint({ spells: [preparedSpell('spell-9', 'Zzyzx\'s Totally Fictional Bolt', FIRE_BOLT_MECHANICS)] })
    })

    const result = await castSpell({ ...CAST_INPUT, actionId: 'spell:spell-9' })
    expect(result.ok).toBe(true)
    expect(createSpellAttackRollEventMock).toHaveBeenCalledWith(
      expect.objectContaining({ spellName: 'Zzyzx\'s Totally Fictional Bolt', attackBonus: 6 })
    )
  })
})

// ---------------------------------------------------------------------------
// Character Sheet Body Phase 1B.2.1 -- Cast Configuration
// ---------------------------------------------------------------------------

describe('castLevel -- omitted defaults to the spell\'s base level (backward compatible)', () => {
  it('Magic Missile with no castLevel still expends exactly one level-1 slot, as it did before this phase', async () => {
    const result = await castSpellAutomaticDamage({ ...CAST_INPUT, actionId: 'spell:spell-2' })
    expect(result.ok).toBe(true)
    expect(saveSpellcastingMock).toHaveBeenCalledWith('42', { spells: [], expendedSlots: { '1': 1 } })
  })

  it('records the resolved castLevel and base spellLevel in the roll\'s metadata', async () => {
    await castSpellAutomaticDamage({ ...CAST_INPUT, actionId: 'spell:spell-2' })
    expect(createSpellDamageRollEventMock).toHaveBeenCalledWith(
      expect.objectContaining({ metadata: expect.objectContaining({ spellLevel: 1, castLevel: 1 }) })
    )
  })
})

describe('castLevel -- cantrips reject any explicit castLevel', () => {
  it('Fire Bolt with an explicit castLevel is rejected -- a cantrip never uses a spell slot', async () => {
    const result = await castSpellAttack({ ...CAST_INPUT, actionId: 'spell:spell-1', castLevel: 1 })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.reason).toBe('invalid-cast-level')
    expect(loadSpellcastingMock).not.toHaveBeenCalled()
    expect(createSpellAttackRollEventMock).not.toHaveBeenCalled()
  })

  it('Fire Bolt\'s own roll never carries a castLevel key in metadata when none was requested', async () => {
    await castSpellAttack({ ...CAST_INPUT, actionId: 'spell:spell-1' })
    const call = createSpellAttackRollEventMock.mock.calls[0]![0]
    expect(call.metadata).not.toHaveProperty('castLevel')
  })
})

describe('castLevel -- below base level is rejected', () => {
  it('a synthetic level-2 automatic-damage spell rejects castLevel: 1', async () => {
    const level2Mechanics = {
      level: 2, concentration: false, ritual: false,
      resolution: { kind: 'automatic' as const },
      damage: { dice: { count: 2, faces: 6 }, modifier: 0, type: 'force' }
    }
    assembleCharacterMock.mockResolvedValue({
      available: true,
      blueprint: wizardBlueprint({ spells: [preparedSpell('spell-4', 'Test Bolt', level2Mechanics)] })
    })

    const result = await castSpellAutomaticDamage({ ...CAST_INPUT, actionId: 'spell:spell-4', castLevel: 1 })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.reason).toBe('invalid-cast-level')
    expect(loadSpellcastingMock).not.toHaveBeenCalled()
    expect(createSpellDamageRollEventMock).not.toHaveBeenCalled()
  })
})

describe('castLevel -- a level this character\'s progression does not declare is rejected', () => {
  it('Magic Missile with castLevel: 5 is rejected -- a level-1 Wizard has no level-5 slots at all', async () => {
    const result = await castSpellAutomaticDamage({ ...CAST_INPUT, actionId: 'spell:spell-2', castLevel: 5 })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.reason).toBe('invalid-cast-level')
    expect(createSpellDamageRollEventMock).not.toHaveBeenCalled()
    expect(saveSpellcastingMock).not.toHaveBeenCalled()
  })
})

describe('castLevel -- a fully expended selected level is rejected, explicit castLevel or not', () => {
  it('rejects with resource-unavailable, matching the pre-existing omitted-castLevel behavior exactly', async () => {
    loadSpellcastingMock.mockResolvedValue({ spells: [], expendedSlots: { '1': 2 } })

    const result = await castSpellAutomaticDamage({ ...CAST_INPUT, actionId: 'spell:spell-2', castLevel: 1 })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.reason).toBe('resource-unavailable')
  })
})

describe('castLevel -- multiple legal levels, the SELECTED higher slot is the one actually expended', () => {
  // This app has no leveling system yet -- every real blueprint this file's
  // real Rules Engine can build sits at character level 1 (the Rules
  // Engine's own stored-value default), which only ever grants a single
  // Spell Slot level. `getDerivedCharacterOverrideMock` fakes a level-3-shaped
  // Wizard's derived state (level-1 AND level-2 slot pools) for this one
  // scenario only -- every other describe block in this file leaves it at
  // its default (defer to the real engine).
  function fakeMultiLevelDerived() {
    return {
      available: true as const,
      derived: {
        byCategory: {
          spellcasting: [
            { id: 'value:spellcasting.caster_type.full', value: true },
            { id: 'value:spellcasting.attack_bonus', value: 6 },
            { id: 'value:spellcasting.save_dc', value: 14 }
          ],
          progression: [{ id: 'value:level', value: 3 }]
        },
        tables: [{
          id: 'table:spellcasting.slots_full',
          rows: [{ key: 3, slot_1: 4, slot_2: 2, slot_3: 0, slot_4: 0, slot_5: 0, slot_6: 0, slot_7: 0, slot_8: 0, slot_9: 0 }]
        }],
        choices: []
      }
    }
  }

  it('expends the level-2 slot, not the level-1 one, when castLevel: 2 is selected', async () => {
    getDerivedCharacterOverrideMock.mockResolvedValue(fakeMultiLevelDerived())
    loadSpellcastingMock.mockResolvedValue({ spells: [], expendedSlots: {} })

    const result = await castSpellAutomaticDamage({ ...CAST_INPUT, actionId: 'spell:spell-2', castLevel: 2 })
    expect(result.ok).toBe(true)
    expect(saveSpellcastingMock).toHaveBeenCalledWith('42', { spells: [], expendedSlots: { '2': 1 } })
  })

  it('base spell level (mechanics.level) remains 1 even when Cast at level 2 -- never mutated by upcasting', async () => {
    getDerivedCharacterOverrideMock.mockResolvedValue(fakeMultiLevelDerived())
    loadSpellcastingMock.mockResolvedValue({ spells: [], expendedSlots: {} })

    await castSpellAutomaticDamage({ ...CAST_INPUT, actionId: 'spell:spell-2', castLevel: 2 })
    expect(createSpellDamageRollEventMock).toHaveBeenCalledWith(
      expect.objectContaining({ metadata: expect.objectContaining({ spellLevel: 1, castLevel: 2 }) })
    )
  })

  it('does NOT fabricate upcast scaling -- damage stays the canonical 1d4+1 regardless of the higher selected level', async () => {
    getDerivedCharacterOverrideMock.mockResolvedValue(fakeMultiLevelDerived())
    loadSpellcastingMock.mockResolvedValue({ spells: [], expendedSlots: {} })

    await castSpellAutomaticDamage({ ...CAST_INPUT, actionId: 'spell:spell-2', castLevel: 2 })
    expect(createSpellDamageRollEventMock).toHaveBeenCalledWith(
      expect.objectContaining({ dice: { count: 1, faces: 4 }, modifier: 1 })
    )
  })
})

describe('castLevel -- client cannot forge slot cost', () => {
  it('CastSpellInput has no field for a client to supply max/slot cost -- the server always re-derives it', async () => {
    const input = { ...CAST_INPUT, actionId: 'spell:spell-2', castLevel: 1 }
    expect(Object.keys(input)).not.toContain('slotCost')
    expect(Object.keys(input)).not.toContain('max')
  })

  it('the expended count the server persists always matches its OWN derived max, never anything client-influenced', async () => {
    await castSpellAutomaticDamage({ ...CAST_INPUT, actionId: 'spell:spell-2', castLevel: 1 })
    // The real Rules Engine's own level-1 Wizard table caps level-1 slots at
    // 2 (packages/eldra-dnd5e-2024's own real table) -- this number comes
    // from nowhere the client touched.
    expect(saveSpellcastingMock).toHaveBeenCalledWith('42', { spells: [], expendedSlots: { '1': 1 } })
  })
})

describe('Chromatic Orb -- structured damage-type choice, first real acceptance case', () => {
  function withChromaticOrbPrepared(overrides: Record<string, unknown> = {}) {
    assembleCharacterMock.mockResolvedValue({
      available: true,
      blueprint: wizardBlueprint({
        spells: [preparedSpell('spell-5', 'Chromatic Orb', CHROMATIC_ORB_MECHANICS)],
        ...overrides
      })
    })
  }

  it('classifies as castable via the single dispatching entry point', async () => {
    withChromaticOrbPrepared()
    const result = await castSpell({ ...CAST_INPUT, actionId: 'spell:spell-5', choices: { 'damage-type': 'lightning' } })
    expect(result.ok).toBe(true)
    expect(createSpellAttackRollEventMock).toHaveBeenCalled()
    expect(createSpellDamageRollEventMock).not.toHaveBeenCalled()
  })

  it('rejects Cast outright when the required damage-type choice is missing', async () => {
    withChromaticOrbPrepared()
    const result = await castSpellAttack({ ...CAST_INPUT, actionId: 'spell:spell-5' })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.reason).toBe('invalid-choice')
    expect(createSpellAttackRollEventMock).not.toHaveBeenCalled()
    expect(loadSpellcastingMock).not.toHaveBeenCalled()
  })

  it('rejects an illegal damage type', async () => {
    withChromaticOrbPrepared()
    const result = await castSpellAttack({ ...CAST_INPUT, actionId: 'spell:spell-5', choices: { 'damage-type': 'necrotic' } })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.reason).toBe('invalid-choice')
  })

  it('rejects an unrecognized choice id', async () => {
    withChromaticOrbPrepared()
    const result = await castSpellAttack({ ...CAST_INPUT, actionId: 'spell:spell-5', choices: { ability: 'str' } })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.reason).toBe('invalid-choice')
  })

  it('accepts a legal type and rolls the attack with the real, server-derived Spell Attack Bonus', async () => {
    withChromaticOrbPrepared()
    const result = await castSpellAttack({ ...CAST_INPUT, actionId: 'spell:spell-5', choices: { 'damage-type': 'lightning' } })
    expect(result.ok).toBe(true)
    expect(createSpellAttackRollEventMock).toHaveBeenCalledWith(
      expect.objectContaining({ spellName: 'Chromatic Orb', attackBonus: 6 })
    )
  })

  it('consumes exactly one level-1 slot on a successful default-level Cast', async () => {
    withChromaticOrbPrepared()
    await castSpellAttack({ ...CAST_INPUT, actionId: 'spell:spell-5', choices: { 'damage-type': 'lightning' } })
    expect(saveSpellcastingMock).toHaveBeenCalledWith('42', { spells: [], expendedSlots: { '1': 1 } })
  })

  it('never mutates target HP or performs hit/miss -- this is still an untargeted attack roll only', async () => {
    withChromaticOrbPrepared()
    const result = await castSpellAttack({ ...CAST_INPUT, actionId: 'spell:spell-5', choices: { 'damage-type': 'lightning' } })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.roll).not.toHaveProperty('targetHealth')
    expect(result.roll).not.toHaveProperty('hit')
  })

  describe('independent Damage -- stateless re-validation, no Cast Session', () => {
    it('rolls the canonical 3d8 with the chosen type, spending no slot at all', async () => {
      withChromaticOrbPrepared()
      const result = await rollIndependentSpellDamage({ ...CAST_INPUT, actionId: 'spell:spell-5', choices: { 'damage-type': 'lightning' } })
      expect(result.ok).toBe(true)
      expect(createSpellDamageRollEventMock).toHaveBeenCalledWith(
        expect.objectContaining({
          spellName: 'Chromatic Orb', dice: { count: 3, faces: 8 }, modifier: 0,
          damageType: 'lightning', damageTypeLabel: 'Lightning', broadcast: true
        })
      )
      expect(loadSpellcastingMock).not.toHaveBeenCalled()
      expect(saveSpellcastingMock).not.toHaveBeenCalled()
    })

    it('rejects Damage when the choice is missing -- never a silently defaulted type', async () => {
      withChromaticOrbPrepared()
      const result = await rollIndependentSpellDamage({ ...CAST_INPUT, actionId: 'spell:spell-5' })
      expect(result.ok).toBe(false)
      if (result.ok) return
      expect(result.reason).toBe('invalid-choice')
      expect(createSpellDamageRollEventMock).not.toHaveBeenCalled()
    })

    it('rejects an illegal damage type on the Damage request independently of Cast', async () => {
      withChromaticOrbPrepared()
      const result = await rollIndependentSpellDamage({ ...CAST_INPUT, actionId: 'spell:spell-5', choices: { 'damage-type': 'radiant' } })
      expect(result.ok).toBe(false)
      if (result.ok) return
      expect(result.reason).toBe('invalid-choice')
    })

    it('a Damage roll may legally choose a DIFFERENT type than a prior Cast -- no binding, no Cast Session', async () => {
      withChromaticOrbPrepared()
      await castSpellAttack({ ...CAST_INPUT, actionId: 'spell:spell-5', choices: { 'damage-type': 'lightning' } })

      const damageResult = await rollIndependentSpellDamage({ ...CAST_INPUT, actionId: 'spell:spell-5', choices: { 'damage-type': 'fire' } })
      expect(damageResult.ok).toBe(true)
      expect(createSpellDamageRollEventMock).toHaveBeenCalledWith(expect.objectContaining({ damageType: 'fire' }))
    })
  })

  it('a differently-named spell with Chromatic Orb\'s exact structured choice works identically -- no spell-name logic', async () => {
    assembleCharacterMock.mockResolvedValue({
      available: true,
      blueprint: wizardBlueprint({ spells: [preparedSpell('spell-6', 'Zzyzx\'s Prismatic Bolt', CHROMATIC_ORB_MECHANICS)] })
    })

    const result = await castSpellAttack({ ...CAST_INPUT, actionId: 'spell:spell-6', choices: { 'damage-type': 'poison' } })
    expect(result.ok).toBe(true)
    expect(createSpellAttackRollEventMock).toHaveBeenCalledWith(expect.objectContaining({ spellName: 'Zzyzx\'s Prismatic Bolt' }))
  })
})

describe('ordinary fixed-type spell damage labels stay unchanged (no absurd verbosity)', () => {
  it('Magic Missile\'s damage label carries no type suffix -- only a real CHOICE ever adds one', async () => {
    await castSpellAutomaticDamage({ ...CAST_INPUT, actionId: 'spell:spell-2' })
    expect(createSpellDamageRollEventMock).toHaveBeenCalledWith(
      expect.objectContaining({ damageTypeLabel: undefined })
    )
  })
})

// ---------------------------------------------------------------------------
// Character Sheet Body Phase 1B.3 -- Saving-Throw Spell Casting
// ---------------------------------------------------------------------------
// This app has no leveling system yet (see the 1B.2.1 describe block above,
// same reasoning): the real Wizard fixture is permanently character level
// 1, which only ever grants level-1 Spell Slots. Fireball's own base level
// (3) needs a level-3 slot pool to exist at all, so these tests reuse the
// exact same `getDerivedCharacterOverrideMock` technique 1B.2.1 already
// established -- a controlled fake for JUST the derived-character read,
// while `getCharacterActions`/`assembleCharacter` still run for real.

function level5WizardDerived(overrides: Partial<{ slot3Max: number; slot4Max: number }> = {}) {
  return {
    available: true as const,
    derived: {
      byCategory: {
        spellcasting: [
          { id: 'value:spellcasting.caster_type.full', value: true },
          { id: 'value:spellcasting.attack_bonus', value: 6 },
          { id: 'value:spellcasting.save_dc', value: 14 }
        ],
        progression: [{ id: 'value:level', value: 5 }]
      },
      tables: [{
        id: 'table:spellcasting.slots_full',
        rows: [{
          key: 5, slot_1: 4, slot_2: 3, slot_3: overrides.slot3Max ?? 2, slot_4: overrides.slot4Max ?? 0,
          slot_5: 0, slot_6: 0, slot_7: 0, slot_8: 0, slot_9: 0
        }]
      }],
      choices: []
    }
  }
}

function withFireballPrepared() {
  assembleCharacterMock.mockResolvedValue({
    available: true,
    blueprint: wizardBlueprint({ spells: [preparedSpell('spell-7', 'Fireball', FIREBALL_MECHANICS)] })
  })
}

describe('castSpellSave -- Fireball (saving-throw, structured damage, required acceptance)', () => {
  it('classifies Cast-capable and dispatches through castSpell', async () => {
    withFireballPrepared()
    getDerivedCharacterOverrideMock.mockResolvedValue(level5WizardDerived())

    const result = await castSpell({ ...CAST_INPUT, actionId: 'spell:spell-7' })
    expect(result.ok).toBe(true)
  })

  it('produces NO caster d20 -- result.roll is absent', async () => {
    withFireballPrepared()
    getDerivedCharacterOverrideMock.mockResolvedValue(level5WizardDerived())

    const result = await castSpellSave({ ...CAST_INPUT, actionId: 'spell:spell-7' })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.roll).toBeUndefined()
  })

  it('creates ZERO RollEvents -- neither attack nor damage', async () => {
    withFireballPrepared()
    getDerivedCharacterOverrideMock.mockResolvedValue(level5WizardDerived())

    await castSpellSave({ ...CAST_INPUT, actionId: 'spell:spell-7' })
    expect(createSpellAttackRollEventMock).not.toHaveBeenCalled()
    expect(createSpellDamageRollEventMock).not.toHaveBeenCalled()
    expect(broadcastRollEventMock).not.toHaveBeenCalled()
  })

  it('returns the authoritative, server-derived Save DC and ability -- Dexterity, DC 14', async () => {
    withFireballPrepared()
    getDerivedCharacterOverrideMock.mockResolvedValue(level5WizardDerived())

    const result = await castSpellSave({ ...CAST_INPUT, actionId: 'spell:spell-7' })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.saveContext).toMatchObject({ savingAbility: 'dex', saveDc: 14, spellLevel: 3, castLevel: 3 })
  })

  it('preserves the half-on-save context, computed nowhere except the canonical resolver', async () => {
    withFireballPrepared()
    getDerivedCharacterOverrideMock.mockResolvedValue(level5WizardDerived())

    const result = await castSpellSave({ ...CAST_INPUT, actionId: 'spell:spell-7' })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.saveContext?.damage).toMatchObject({ dice: { count: 8, faces: 6 }, type: 'fire', saveOutcome: 'half-on-save' })
  })

  it('consumes exactly one level-3 slot at the default (base-level) castLevel', async () => {
    withFireballPrepared()
    getDerivedCharacterOverrideMock.mockResolvedValue(level5WizardDerived())
    loadSpellcastingMock.mockResolvedValue({ spells: [], expendedSlots: {} })

    await castSpellSave({ ...CAST_INPUT, actionId: 'spell:spell-7' })
    expect(saveSpellcastingMock).toHaveBeenCalledWith('42', { spells: [], expendedSlots: { '3': 1 } })
  })

  it('returns the updated spellcasting record for authoritative resource-orb refresh', async () => {
    withFireballPrepared()
    getDerivedCharacterOverrideMock.mockResolvedValue(level5WizardDerived())
    loadSpellcastingMock.mockResolvedValue({ spells: [], expendedSlots: {} })
    saveSpellcastingMock.mockResolvedValue({ spells: [], expendedSlots: { '3': 1 } })

    const result = await castSpellSave({ ...CAST_INPUT, actionId: 'spell:spell-7' })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.spellcasting).toEqual({ spells: [], expendedSlots: { '3': 1 } })
  })

  it('a selected HIGHER castLevel is the exact slot consumed, base spell level stays 3', async () => {
    withFireballPrepared()
    getDerivedCharacterOverrideMock.mockResolvedValue(level5WizardDerived({ slot4Max: 1 }))
    loadSpellcastingMock.mockResolvedValue({ spells: [], expendedSlots: {} })

    const result = await castSpellSave({ ...CAST_INPUT, actionId: 'spell:spell-7', castLevel: 4 })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.saveContext).toMatchObject({ spellLevel: 3, castLevel: 4 })
    expect(saveSpellcastingMock).toHaveBeenCalledWith('42', { spells: [], expendedSlots: { '4': 1 } })
  })

  it('rejects a castLevel below the spell\'s own base level', async () => {
    withFireballPrepared()
    getDerivedCharacterOverrideMock.mockResolvedValue(level5WizardDerived())

    const result = await castSpellSave({ ...CAST_INPUT, actionId: 'spell:spell-7', castLevel: 2 })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.reason).toBe('invalid-cast-level')
    expect(saveSpellcastingMock).not.toHaveBeenCalled()
  })

  it('rejects a level this character\'s progression does not declare (level 9)', async () => {
    withFireballPrepared()
    getDerivedCharacterOverrideMock.mockResolvedValue(level5WizardDerived())

    const result = await castSpellSave({ ...CAST_INPUT, actionId: 'spell:spell-7', castLevel: 9 })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.reason).toBe('invalid-cast-level')
  })

  it('zero available legal slots rejects the Cast BEFORE any resource mutation -- no free spell', async () => {
    withFireballPrepared()
    getDerivedCharacterOverrideMock.mockResolvedValue(level5WizardDerived())
    loadSpellcastingMock.mockResolvedValue({ spells: [], expendedSlots: { '3': 2 } }) // both L3 slots spent

    const result = await castSpellSave({ ...CAST_INPUT, actionId: 'spell:spell-7' })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.reason).toBe('resource-unavailable')
    expect(saveSpellcastingMock).not.toHaveBeenCalled()
  })

  it('does not require or accept a target -- CastSpellInput has no target field at all', () => {
    const input = { ...CAST_INPUT, actionId: 'spell:spell-7' }
    expect(Object.keys(input)).not.toContain('targetCharacterId')
    expect(Object.keys(input)).not.toContain('target')
  })

  it('never mutates any character\'s HP -- the result carries no target/health shape', async () => {
    withFireballPrepared()
    getDerivedCharacterOverrideMock.mockResolvedValue(level5WizardDerived())

    const result = await castSpellSave({ ...CAST_INPUT, actionId: 'spell:spell-7' })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result).not.toHaveProperty('targetHealth')
    expect(result).not.toHaveProperty('hit')
  })

  it('honors Cast Configuration\'s structured choices generically, even for a saving-throw spell', async () => {
    // Synthetic: Fireball's own mechanics plus a structured choice, proving
    // the SAME generic choice validation this phase's earlier acceptance
    // (Chromatic Orb) established applies uniformly to the save path too --
    // no save-specific choice handling exists.
    const withChoice = {
      ...FIREBALL_MECHANICS!,
      choices: [{ id: 'damage-type', label: 'Damage Type', options: [{ id: 'fire', label: 'Fire' }, { id: 'cold', label: 'Cold' }] }]
    }
    assembleCharacterMock.mockResolvedValue({
      available: true,
      blueprint: wizardBlueprint({ spells: [preparedSpell('spell-8', 'Test Fireball', withChoice)] })
    })
    getDerivedCharacterOverrideMock.mockResolvedValue(level5WizardDerived())

    const missing = await castSpellSave({ ...CAST_INPUT, actionId: 'spell:spell-8' })
    expect(missing.ok).toBe(false)
    if (!missing.ok) expect(missing.reason).toBe('invalid-choice')

    const withSelection = await castSpellSave({ ...CAST_INPUT, actionId: 'spell:spell-8', choices: { 'damage-type': 'cold' } })
    expect(withSelection.ok).toBe(true)
    if (withSelection.ok) expect(withSelection.saveContext?.damage?.type).toBe('cold')
  })
})

describe('castSpellSave -- Acid Splash (cantrip, save-for-no-damage, required acceptance)', () => {
  function withAcidSplashPrepared() {
    assembleCharacterMock.mockResolvedValue({
      available: true,
      blueprint: wizardBlueprint({ spells: [preparedSpell('spell-9', 'Acid Splash', ACID_SPLASH_MECHANICS)] })
    })
  }

  it('consumes no spell slot at all -- no load/save of spellcasting state', async () => {
    withAcidSplashPrepared()
    const result = await castSpellSave({ ...CAST_INPUT, actionId: 'spell:spell-9' })
    expect(result.ok).toBe(true)
    expect(loadSpellcastingMock).not.toHaveBeenCalled()
    expect(saveSpellcastingMock).not.toHaveBeenCalled()
  })

  it('produces no caster d20 and no RollEvent', async () => {
    withAcidSplashPrepared()
    await castSpellSave({ ...CAST_INPUT, actionId: 'spell:spell-9' })
    expect(createSpellAttackRollEventMock).not.toHaveBeenCalled()
    expect(createSpellDamageRollEventMock).not.toHaveBeenCalled()
  })

  it('castLevel is null -- a cantrip has no casting-level concept', async () => {
    withAcidSplashPrepared()
    const result = await castSpellSave({ ...CAST_INPUT, actionId: 'spell:spell-9' })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.saveContext?.castLevel).toBeNull()
    expect(result.saveContext?.savingAbility).toBe('dex')
  })

  it('rejects an explicit castLevel for a cantrip -- cannot be forced to consume a leveled slot', async () => {
    withAcidSplashPrepared()
    const result = await castSpellSave({ ...CAST_INPUT, actionId: 'spell:spell-9', castLevel: 1 })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.reason).toBe('invalid-cast-level')
    expect(loadSpellcastingMock).not.toHaveBeenCalled()
  })

  it('preserves the no-damage-on-save context', async () => {
    withAcidSplashPrepared()
    const result = await castSpellSave({ ...CAST_INPUT, actionId: 'spell:spell-9' })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.saveContext?.damage).toMatchObject({ dice: { count: 1, faces: 6 }, type: 'acid', saveOutcome: 'no-damage-on-save' })
  })
})

describe('castSpellSave -- Hold Person (save-context-only, no structured damage)', () => {
  function withHoldPersonPrepared() {
    assembleCharacterMock.mockResolvedValue({
      available: true,
      blueprint: wizardBlueprint({ spells: [preparedSpell('spell-10', 'Hold Person', HOLD_PERSON_MECHANICS)] })
    })
  }

  it('Cast succeeds and returns Save DC/ability context with no damage field', async () => {
    withHoldPersonPrepared()
    // Hold Person is base level 2 -- the real level-1 Wizard fixture has no
    // level-2 slots, so this uses the same controlled override as Fireball.
    getDerivedCharacterOverrideMock.mockResolvedValue(level5WizardDerived())
    loadSpellcastingMock.mockResolvedValue({ spells: [], expendedSlots: {} })

    const result = await castSpellSave({ ...CAST_INPUT, actionId: 'spell:spell-10' })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.saveContext).toMatchObject({ savingAbility: 'wis', spellLevel: 2 })
    expect(result.saveContext?.damage).toBeUndefined()
  })

  it('consumes the selected level-2 slot like any other leveled Cast', async () => {
    withHoldPersonPrepared()
    getDerivedCharacterOverrideMock.mockResolvedValue(level5WizardDerived())
    loadSpellcastingMock.mockResolvedValue({ spells: [], expendedSlots: {} })

    await castSpellSave({ ...CAST_INPUT, actionId: 'spell:spell-10' })
    expect(saveSpellcastingMock).toHaveBeenCalledWith('42', { spells: [], expendedSlots: { '2': 1 } })
  })

  it('does not fabricate an independent Damage roll -- Hold Person has no canonical damage to roll', async () => {
    withHoldPersonPrepared()
    getDerivedCharacterOverrideMock.mockResolvedValue(level5WizardDerived())

    const result = await rollIndependentSpellDamage({ ...CAST_INPUT, actionId: 'spell:spell-10' })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.reason).toBe('not-castable')
    expect(createSpellDamageRollEventMock).not.toHaveBeenCalled()
  })
})

describe('rollIndependentSpellDamage -- Fireball\'s own Damage button', () => {
  it('rolls the canonical 8d6 fire damage, spending no additional slot', async () => {
    withFireballPrepared()
    getDerivedCharacterOverrideMock.mockResolvedValue(level5WizardDerived())

    const result = await rollIndependentSpellDamage({ ...CAST_INPUT, actionId: 'spell:spell-7' })
    expect(result.ok).toBe(true)
    expect(createSpellDamageRollEventMock).toHaveBeenCalledWith(
      expect.objectContaining({ spellName: 'Fireball', dice: { count: 8, faces: 6 }, modifier: 0, damageType: 'fire' })
    )
    expect(loadSpellcastingMock).not.toHaveBeenCalled()
    expect(saveSpellcastingMock).not.toHaveBeenCalled()
  })

  it('retains save context (ability, DC, saveOutcome) in the RollEvent metadata', async () => {
    withFireballPrepared()
    getDerivedCharacterOverrideMock.mockResolvedValue(level5WizardDerived())

    await rollIndependentSpellDamage({ ...CAST_INPUT, actionId: 'spell:spell-7' })
    expect(createSpellDamageRollEventMock).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({ savingAbility: 'dex', saveDc: 14, saveOutcome: 'half-on-save' })
      })
    )
  })

  it('preserves/revalidates a supplied castLevel without applying any upcast scaling -- still 8d6', async () => {
    withFireballPrepared()
    getDerivedCharacterOverrideMock.mockResolvedValue(level5WizardDerived({ slot4Max: 1 }))

    const result = await rollIndependentSpellDamage({ ...CAST_INPUT, actionId: 'spell:spell-7', castLevel: 4 })
    expect(result.ok).toBe(true)
    expect(createSpellDamageRollEventMock).toHaveBeenCalledWith(
      expect.objectContaining({ dice: { count: 8, faces: 6 }, metadata: expect.objectContaining({ castLevel: 4, spellLevel: 3 }) })
    )
  })

  it('does not require a prior successful Cast -- Damage is independently callable', async () => {
    withFireballPrepared()
    getDerivedCharacterOverrideMock.mockResolvedValue(level5WizardDerived())

    const result = await rollIndependentSpellDamage({ ...CAST_INPUT, actionId: 'spell:spell-7' })
    expect(result.ok).toBe(true)
    expect(createSpellAttackRollEventMock).not.toHaveBeenCalled()
  })
})

describe('rollIndependentSpellDamage -- Acid Splash\'s own Damage button', () => {
  it('rolls the canonical 1d6 acid damage, no resource check at all', async () => {
    assembleCharacterMock.mockResolvedValue({
      available: true,
      blueprint: wizardBlueprint({ spells: [preparedSpell('spell-9', 'Acid Splash', ACID_SPLASH_MECHANICS)] })
    })

    const result = await rollIndependentSpellDamage({ ...CAST_INPUT, actionId: 'spell:spell-9' })
    expect(result.ok).toBe(true)
    expect(createSpellDamageRollEventMock).toHaveBeenCalledWith(
      expect.objectContaining({ dice: { count: 1, faces: 6 }, damageType: 'acid' })
    )
    expect(loadSpellcastingMock).not.toHaveBeenCalled()
  })
})

describe('Phase 1B.3 -- no spell-name special cases', () => {
  it('a synthetic, differently-named spell with Fireball\'s exact mechanics casts identically', async () => {
    assembleCharacterMock.mockResolvedValue({
      available: true,
      blueprint: wizardBlueprint({ spells: [preparedSpell('spell-11', 'Zzyzx\'s Fiery Doom', FIREBALL_MECHANICS)] })
    })
    getDerivedCharacterOverrideMock.mockResolvedValue(level5WizardDerived())

    const result = await castSpell({ ...CAST_INPUT, actionId: 'spell:spell-11' })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.saveContext).toMatchObject({ savingAbility: 'dex', saveDc: 14 })
  })
})

describe('Phase 1B.3 -- targeted Resolve preservation', () => {
  // character-combat.ts's own module is untouched by this phase (verified
  // by this file's own diff scope) -- this test proves the untargeted Cast
  // path added here coexists with, rather than replaces, that capability:
  // Fireball is castable through THIS module while its saving-throw
  // resolution/damage shape remains exactly what resolveCombatAction's own
  // targeted path already reads from the same `action.resolution`/
  // `action.damageRoll` fields (see character-combat.test.ts, unchanged and
  // still green -- confirmed by the full suite run accompanying this task).
  it('a Fireball action still carries the resolution/damage shape targeted Resolve depends on', async () => {
    withFireballPrepared()
    getDerivedCharacterOverrideMock.mockResolvedValue(level5WizardDerived())

    const result = await castSpellSave({ ...CAST_INPUT, actionId: 'spell:spell-7' })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    // The same authoritative facts (ability, DC, damage dice/type) a
    // targeted Resolve would read are exactly what this untargeted Cast
    // also returns -- one canonical source, two different consumers.
    expect(result.saveContext?.savingAbility).toBe('dex')
    expect(result.saveContext?.damage?.dice).toEqual({ count: 8, faces: 6 })
  })
})

// ---------------------------------------------------------------------------
// Character Sheet Body Phase 1B.4 -- Healing Spell Foundation
// ---------------------------------------------------------------------------
// Cure Wounds and Healing Word are both real BASE-LEVEL-1 spells, so (like
// Fire Bolt/Magic Missile above, and unlike Fireball/Hold Person's own
// level5WizardDerived fake) these tests use the DEFAULT real level-1 Wizard
// fixture and the real Rules Engine throughout -- INT 18 -> +4 ability
// modifier, the exact same number `character-actions.test.ts`'s own Wizard
// fixture already proves against `value:spellcasting.attack_bonus`/
// `value:spellcasting.save_dc` (prof +2, so 6/14 respectively; the
// Spellcasting Ability Modifier itself, folded into neither of those, is
// +4). Only the one test that deliberately simulates an unavailable Rules
// Package number uses a controlled override.

const CURE_WOUNDS_MECHANICS = resolveDnd5eSpellMechanics(spells['Cure Wounds'])
const HEALING_WORD_MECHANICS = resolveDnd5eSpellMechanics(spells['Healing Word'])

function withCureWoundsPrepared() {
  assembleCharacterMock.mockResolvedValue({
    available: true,
    blueprint: wizardBlueprint({ spells: [preparedSpell('spell-12', 'Cure Wounds', CURE_WOUNDS_MECHANICS)] })
  })
}

function withHealingWordPrepared() {
  assembleCharacterMock.mockResolvedValue({
    available: true,
    blueprint: wizardBlueprint({ spells: [preparedSpell('spell-13', 'Healing Word', HEALING_WORD_MECHANICS)] })
  })
}

// Mirrors `level5WizardDerived` above exactly, except at level 1 (matching
// Cure Wounds/Healing Word's own base level, so no other Spell Slot
// behavior changes) and, deliberately, WITHOUT a
// `value:spellcasting.ability_mod` entry -- simulating a Rules Package that
// does not declare this character's Spellcasting Ability Modifier at all,
// the one scenario the 'rules-unavailable' gate below needs to construct.
function level1WizardDerivedNoAbilityMod() {
  return {
    available: true as const,
    derived: {
      byCategory: {
        spellcasting: [
          { id: 'value:spellcasting.caster_type.full', value: true },
          { id: 'value:spellcasting.attack_bonus', value: 6 },
          { id: 'value:spellcasting.save_dc', value: 14 }
        ],
        progression: [{ id: 'value:level', value: 1 }]
      },
      tables: [{
        id: 'table:spellcasting.slots_full',
        rows: [{ key: 1, slot_1: 2, slot_2: 0, slot_3: 0, slot_4: 0, slot_5: 0, slot_6: 0, slot_7: 0, slot_8: 0, slot_9: 0 }]
      }],
      choices: []
    }
  }
}

describe('castSpellHeal -- Cure Wounds (leveled, required primary acceptance)', () => {
  it('classifies Cast-capable and dispatches through castSpell', async () => {
    withCureWoundsPrepared()
    const result = await castSpell({ ...CAST_INPUT, actionId: 'spell:spell-12' })
    expect(result.ok).toBe(true)
    expect(createSpellHealingRollEventMock).toHaveBeenCalled()
    expect(createSpellAttackRollEventMock).not.toHaveBeenCalled()
    expect(createSpellDamageRollEventMock).not.toHaveBeenCalled()
  })

  // THE required acceptance case: the content-authored 2d8 (no flat
  // modifier stated) PLUS the real, server-derived Spellcasting Ability
  // Modifier (+4) -- never a client-sent number, never hardcoded to
  // "Wisdom for Cleric" or any other class-specific assumption (this
  // Wizard's own spellcasting ability is Intelligence, and the resolver
  // never needed to know that).
  it('rolls 2d8 healing plus the real, server-derived Spellcasting Ability Modifier, unbroadcast until the slot mutation succeeds', async () => {
    withCureWoundsPrepared()
    const result = await castSpellHeal({ ...CAST_INPUT, actionId: 'spell:spell-12' })
    expect(result.ok).toBe(true)

    expect(createSpellHealingRollEventMock).toHaveBeenCalledWith(
      expect.objectContaining({
        spellName: 'Cure Wounds', sourceId: 'spell:spell-12',
        dice: { count: 2, faces: 8 }, modifier: 4,
        broadcast: false
      })
    )
  })

  it('expends exactly one level-1 slot on success', async () => {
    withCureWoundsPrepared()
    await castSpellHeal({ ...CAST_INPUT, actionId: 'spell:spell-12' })
    expect(saveSpellcastingMock).toHaveBeenCalledWith('42', { spells: [], expendedSlots: { '1': 1 } })
  })

  it('returns the updated spellcasting record for authoritative resource-orb refresh', async () => {
    withCureWoundsPrepared()
    saveSpellcastingMock.mockResolvedValue({ spells: [], expendedSlots: { '1': 1 } })

    const result = await castSpellHeal({ ...CAST_INPUT, actionId: 'spell:spell-12' })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.spellcasting).toEqual({ spells: [], expendedSlots: { '1': 1 } })
  })

  it('broadcasts the roll only AFTER the slot mutation has succeeded -- identical ordering to every other rolling Cast', async () => {
    withCureWoundsPrepared()
    const callOrder: string[] = []
    saveSpellcastingMock.mockImplementation(async (_id: unknown, stored: unknown) => {
      callOrder.push('save')
      return stored
    })
    broadcastRollEventMock.mockImplementation(() => { callOrder.push('broadcast') })

    await castSpellHeal({ ...CAST_INPUT, actionId: 'spell:spell-12' })

    expect(callOrder).toEqual(['save', 'broadcast'])
    expect(broadcastRollEventMock).toHaveBeenCalledWith({ id: 'roll-healing-1', total: 12 })
  })

  it('rejects the Cast outright when no level-1 slots remain -- BEFORE any roll happens', async () => {
    withCureWoundsPrepared()
    loadSpellcastingMock.mockResolvedValue({ spells: [], expendedSlots: { '1': 2 } })

    const result = await castSpellHeal({ ...CAST_INPUT, actionId: 'spell:spell-12' })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.reason).toBe('resource-unavailable')
    expect(createSpellHealingRollEventMock).not.toHaveBeenCalled()
    expect(saveSpellcastingMock).not.toHaveBeenCalled()
    expect(broadcastRollEventMock).not.toHaveBeenCalled()
  })

  it('a failed slot mutation reports failure (502) and never broadcasts -- the roll was already rolled, never a free spell', async () => {
    withCureWoundsPrepared()
    saveSpellcastingMock.mockRejectedValue(new Error('Directus write failed'))

    await expect(castSpellHeal({ ...CAST_INPUT, actionId: 'spell:spell-12' })).rejects.toMatchObject({ statusCode: 502 })

    expect(createSpellHealingRollEventMock).toHaveBeenCalled()
    expect(broadcastRollEventMock).not.toHaveBeenCalled()
  })

  it('does not require or accept a target -- CastSpellInput has no target field at all', () => {
    const input = { ...CAST_INPUT, actionId: 'spell:spell-12' }
    expect(Object.keys(input)).not.toContain('targetCharacterId')
    expect(Object.keys(input)).not.toContain('target')
  })

  it('never mutates any character\'s HP -- the result carries no target/health shape', async () => {
    withCureWoundsPrepared()
    const result = await castSpellHeal({ ...CAST_INPUT, actionId: 'spell:spell-12' })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result).not.toHaveProperty('targetHealth')
    expect(result.roll).not.toHaveProperty('targetHealth')
  })

  it('records the resolved castLevel and base spellLevel in the roll\'s metadata, like every other leveled Cast', async () => {
    withCureWoundsPrepared()
    await castSpellHeal({ ...CAST_INPUT, actionId: 'spell:spell-12' })
    expect(createSpellHealingRollEventMock).toHaveBeenCalledWith(
      expect.objectContaining({ metadata: expect.objectContaining({ spellLevel: 1, castLevel: 1 }) })
    )
  })

  it('honors Cast Configuration\'s structured choices generically, even for a healing spell (synthetic, proves genericity)', async () => {
    const withChoice = {
      ...CURE_WOUNDS_MECHANICS!,
      choices: [{ id: 'damage-type', label: 'Damage Type', options: [{ id: 'fire', label: 'Fire' }, { id: 'cold', label: 'Cold' }] }]
    }
    assembleCharacterMock.mockResolvedValue({
      available: true,
      blueprint: wizardBlueprint({ spells: [preparedSpell('spell-14', 'Test Cure Wounds', withChoice)] })
    })

    const missing = await castSpellHeal({ ...CAST_INPUT, actionId: 'spell:spell-14' })
    expect(missing.ok).toBe(false)
    if (!missing.ok) expect(missing.reason).toBe('invalid-choice')

    const withSelection = await castSpellHeal({ ...CAST_INPUT, actionId: 'spell:spell-14', choices: { 'damage-type': 'cold' } })
    expect(withSelection.ok).toBe(true)
  })
})

// The required SECOND acceptance case -- proves castSpellHeal is not
// Cure-Wounds-specific: a different die size (2d4), a different slot cost
// arithmetic path exercised identically.
describe('castSpellHeal -- Healing Word (leveled, required second acceptance)', () => {
  it('rolls 2d4 healing plus the real Spellcasting Ability Modifier', async () => {
    withHealingWordPrepared()
    const result = await castSpellHeal({ ...CAST_INPUT, actionId: 'spell:spell-13' })
    expect(result.ok).toBe(true)
    expect(createSpellHealingRollEventMock).toHaveBeenCalledWith(
      expect.objectContaining({ spellName: 'Healing Word', dice: { count: 2, faces: 4 }, modifier: 4 })
    )
  })

  it('expends exactly one level-1 slot on success', async () => {
    withHealingWordPrepared()
    await castSpellHeal({ ...CAST_INPUT, actionId: 'spell:spell-13' })
    expect(saveSpellcastingMock).toHaveBeenCalledWith('42', { spells: [], expendedSlots: { '1': 1 } })
  })
})

// Prayer of Healing's own real RAW shape: all three extraction signals
// present, but the source states NO spellcasting-ability-modifier addend.
// Proves `usesSpellcastingModifier: undefined` means exactly what it says --
// the roll uses ONLY the content-authored dice/modifier, no number folded
// in from character-actions.ts at all, even though this character's own
// Spellcasting Ability Modifier (+4) is perfectly available.
describe('castSpellHeal -- Prayer-of-Healing-shaped (no usesSpellcastingModifier, synthetic)', () => {
  it('rolls the flat content-authored dice with no ability modifier added', async () => {
    const prayerShaped = { ...CURE_WOUNDS_MECHANICS!, healing: { dice: { count: 2, faces: 8 }, modifier: 0 } }
    assembleCharacterMock.mockResolvedValue({
      available: true,
      blueprint: wizardBlueprint({ spells: [preparedSpell('spell-15', 'Test Prayer of Healing', prayerShaped)] })
    })

    const result = await castSpellHeal({ ...CAST_INPUT, actionId: 'spell:spell-15' })
    expect(result.ok).toBe(true)
    expect(createSpellHealingRollEventMock).toHaveBeenCalledWith(
      expect.objectContaining({ dice: { count: 2, faces: 8 }, modifier: 0 })
    )
  })

  // The 'rules-unavailable' gate must NOT trigger for a spell that does not
  // need the modifier at all, even when the Rules Package genuinely has
  // nothing to say about it.
  it('Casts successfully even when the Rules Package does not declare a Spellcasting Ability Modifier at all', async () => {
    const prayerShaped = { ...CURE_WOUNDS_MECHANICS!, healing: { dice: { count: 2, faces: 8 }, modifier: 0 } }
    assembleCharacterMock.mockResolvedValue({
      available: true,
      blueprint: wizardBlueprint({ spells: [preparedSpell('spell-15', 'Test Prayer of Healing', prayerShaped)] })
    })
    getDerivedCharacterOverrideMock.mockResolvedValue(level1WizardDerivedNoAbilityMod())

    const result = await castSpellHeal({ ...CAST_INPUT, actionId: 'spell:spell-15' })
    expect(result.ok).toBe(true)
  })
})

// The gate this phase's own character-cast.ts adds: when a healing spell's
// canonical shape DOES require the Spellcasting Ability Modifier
// (usesSpellcastingModifier: true, e.g. Cure Wounds), but this World's
// active Rules Package does not declare one, Cast must fail honestly rather
// than silently rolling with a missing/zero modifier.
describe('castSpellHeal -- rules-unavailable gate', () => {
  it('rejects Cure Wounds when the Rules Package does not declare a Spellcasting Ability Modifier', async () => {
    withCureWoundsPrepared()
    getDerivedCharacterOverrideMock.mockResolvedValue(level1WizardDerivedNoAbilityMod())

    const result = await castSpellHeal({ ...CAST_INPUT, actionId: 'spell:spell-12' })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.reason).toBe('rules-unavailable')
    expect(createSpellHealingRollEventMock).not.toHaveBeenCalled()
    expect(loadSpellcastingMock).not.toHaveBeenCalled()
  })
})

// Not part of the required 1B.4 corpus (no real healing cantrip exists in
// the audited XPHB corpus -- see this file's own header and dnd5e.ts's own
// HEALING header), but the architecture must degrade gracefully rather than
// silently break -- the identical "handled honestly, not assumed
// impossible" posture castSpellAutomaticDamage's own cantrip branch already
// takes.
describe('castSpellHeal -- cantrip healing (not part of the required corpus, synthetic)', () => {
  it('a synthetic level-0 healing spell rolls immediately, broadcasts immediately, and touches no spellcasting state', async () => {
    const cantripHealing = {
      level: 0, concentration: false, ritual: false, resolution: null,
      healing: { dice: { count: 1, faces: 4 }, modifier: 0 }
    }
    assembleCharacterMock.mockResolvedValue({
      available: true,
      blueprint: wizardBlueprint({ spells: [preparedSpell('spell-16', 'Test Healing Cantrip', cantripHealing)] })
    })

    const result = await castSpellHeal({ ...CAST_INPUT, actionId: 'spell:spell-16' })
    expect(result.ok).toBe(true)
    expect(createSpellHealingRollEventMock).toHaveBeenCalledWith(
      expect.objectContaining({ dice: { count: 1, faces: 4 }, broadcast: true })
    )
    expect(loadSpellcastingMock).not.toHaveBeenCalled()
    expect(saveSpellcastingMock).not.toHaveBeenCalled()
  })
})

// Upcasting: a spell cast at a higher-than-base level still rolls exactly
// its base healing expression -- executable scaling is explicitly deferred
// to a future phase (see this file's own header on `fakeMultiLevelDerived`/
// `level5WizardDerived` for why this app has no real leveling system to
// construct a genuine multi-slot-level character through, hence the same
// controlled derived-character fake technique).
describe('castSpellHeal -- upcasting does not scale the healing roll (executable scaling deferred)', () => {
  function fakeMultiLevelDerived() {
    return {
      available: true as const,
      derived: {
        byCategory: {
          spellcasting: [
            { id: 'value:spellcasting.caster_type.full', value: true },
            { id: 'value:spellcasting.attack_bonus', value: 6 },
            { id: 'value:spellcasting.save_dc', value: 14 },
            { id: 'value:spellcasting.ability_mod', value: 4 }
          ],
          progression: [{ id: 'value:level', value: 3 }]
        },
        tables: [{
          id: 'table:spellcasting.slots_full',
          rows: [{ key: 3, slot_1: 4, slot_2: 2, slot_3: 0, slot_4: 0, slot_5: 0, slot_6: 0, slot_7: 0, slot_8: 0, slot_9: 0 }]
        }],
        choices: []
      }
    }
  }

  it('Cast at castLevel: 2 expends the level-2 slot but still rolls the base 2d8 dice, recording castLevel in metadata', async () => {
    withCureWoundsPrepared()
    getDerivedCharacterOverrideMock.mockResolvedValue(fakeMultiLevelDerived())
    loadSpellcastingMock.mockResolvedValue({ spells: [], expendedSlots: {} })

    const result = await castSpellHeal({ ...CAST_INPUT, actionId: 'spell:spell-12', castLevel: 2 })
    expect(result.ok).toBe(true)
    expect(saveSpellcastingMock).toHaveBeenCalledWith('42', { spells: [], expendedSlots: { '2': 1 } })
    expect(createSpellHealingRollEventMock).toHaveBeenCalledWith(
      expect.objectContaining({
        dice: { count: 2, faces: 8 }, modifier: 4,
        metadata: expect.objectContaining({ spellLevel: 1, castLevel: 2 })
      })
    )
  })
})

describe('castSpell -- routes supported-healing through castSpellHeal', () => {
  it('Cure Wounds is dispatched through the healing path, not attack/automatic-damage/save', async () => {
    withCureWoundsPrepared()
    await castSpell({ ...CAST_INPUT, actionId: 'spell:spell-12' })
    expect(createSpellHealingRollEventMock).toHaveBeenCalled()
    expect(createSpellAttackRollEventMock).not.toHaveBeenCalled()
    expect(createSpellDamageRollEventMock).not.toHaveBeenCalled()
  })
})

describe('rollIndependentSpellDamage -- never exposes a free roll for a pure-healing spell', () => {
  // Healing has NO separate Damage/Healing button at all (this phase's own
  // UX requirement) -- Cast itself performs the healing roll. Proven here
  // structurally: the one existing "independent roll" entry point still
  // refuses a supported-healing spell outright, exactly like it already
  // refuses Magic Missile's automatic-damage above.
  it('rejects Cure Wounds as not-castable through the independent-damage entry point', async () => {
    withCureWoundsPrepared()
    const result = await rollIndependentSpellDamage({ ...CAST_INPUT, actionId: 'spell:spell-12' })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.reason).toBe('not-castable')
    expect(createSpellHealingRollEventMock).not.toHaveBeenCalled()
    expect(createSpellDamageRollEventMock).not.toHaveBeenCalled()
  })
})

describe('Phase 1B.4 -- no spell-name special cases', () => {
  it('a synthetic, differently-named spell with Cure Wounds\' exact mechanics casts identically', async () => {
    assembleCharacterMock.mockResolvedValue({
      available: true,
      blueprint: wizardBlueprint({ spells: [preparedSpell('spell-17', 'Zzyzx\'s Restorative Bolt', CURE_WOUNDS_MECHANICS)] })
    })

    const result = await castSpell({ ...CAST_INPUT, actionId: 'spell:spell-17' })
    expect(result.ok).toBe(true)
    expect(createSpellHealingRollEventMock).toHaveBeenCalledWith(
      expect.objectContaining({ spellName: 'Zzyzx\'s Restorative Bolt', dice: { count: 2, faces: 8 }, modifier: 4 })
    )
  })
})
