// Unit tests for server/utils/character-combat.ts -- Combat Resolution.
//
// `assembleCharacter`, `character-health`, and `app/lib/rules/rng` are
// mocked at the module boundary (each already independently tested, or --
// for rng -- deterministic by construction and mocked here purely so a test
// can PIN a specific roll rather than compute which seed string produces
// it). The Rules Runtime itself is REAL -- built via createWorldRuntime from
// the actual eldra-dnd5e-2024 package on disk -- so every Attack Bonus/
// Armor Class/Save DC these tests assert on comes from the real formulas,
// matching character-recovery.test.ts's and character-actions.test.ts's own
// precedent exactly.

import { readFileSync } from 'node:fs'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
  assembleCharacterMock, getWorldRuntimeMock, loadHealthMock, saveHealthMock, createSeededRngMock
} = vi.hoisted(() => ({
  assembleCharacterMock: vi.fn(),
  getWorldRuntimeMock: vi.fn(),
  loadHealthMock: vi.fn(),
  saveHealthMock: vi.fn(),
  createSeededRngMock: vi.fn()
}))

vi.mock('../../../server/utils/character-assembly', () => ({
  assembleCharacter: assembleCharacterMock
}))

vi.mock('../../../server/utils/world-runtime-service', () => ({
  getWorldRuntime: getWorldRuntimeMock
}))

vi.mock('../../../server/utils/character-health', () => ({
  loadCharacterHealth: loadHealthMock,
  saveCharacterHealth: saveHealthMock
}))

vi.mock('../../../app/lib/rules/rng', () => ({
  createSeededRng: createSeededRngMock
}))

import { createWorldRuntime } from '../../../app/lib/rules/world-runtime'
import { parseExpression } from '../../../app/lib/rules/parser'
import type { Definition, RulesPackageManifest } from '../../../app/lib/rules/types'
import { resolveCombatAction } from '../../../server/utils/character-combat'
import { findRulesFacet } from '../../../app/lib/content-rules'

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
  const result = createWorldRuntime(manifest, definitions, '5', null)
  if (!result.ok) throw new Error(`runtime build failed: ${result.stage}`)
  return result.runtimePackage
}

// Queues fixed die results: rollDie(rng, faces) computes `nextInt(faces)+1`,
// so to force a roll of V, `nextInt` must return V-1. One shared queue
// across every `nextInt` call the resolution makes, in call order (attack
// or save roll first, then damage dice) -- exactly mirroring how a real
// seeded stream draws sequential values from one seed.
function mockRolls(rolls: number[]) {
  const queue = [...rolls]
  createSeededRngMock.mockReturnValue({
    next: () => 0,
    nextInt: (_max: number) => {
      const next = queue.shift()
      if (next === undefined) throw new Error('mockRolls queue exhausted -- test requested more rolls than provided')
      return next - 1
    }
  })
}

function baseEntry(overrides: Record<string, unknown> = {}) {
  return {
    packageId: 'eldra.content.xphb', packageVersion: '1.0.0', systemKey: 'dnd5e',
    title: 'Thing', slug: 'thing', externalId: 'thing', provider: '5etools-json',
    ...overrides
  }
}

const LONGSWORD_ACTION = {
  name: 'Longsword', category: 'weapon' as const, actionType: 'Melee Attack', range: '5 ft.', damage: '1d8 slashing',
  damageRoll: { count: 1, faces: 8 }, damageType: 'slashing', resolution: { kind: 'attack-roll' as const, attackKind: 'melee' as const }
}

const FIREBALL_ACTION = {
  name: 'Fireball', category: 'spell' as const, actionType: 'Level 3 Spell (Evocation)', range: '150 ft.',
  damageRoll: { count: 8, faces: 6 }, damageType: 'fire', resolution: { kind: 'saving-throw' as const, savingAbility: 'dex' as const }
}

// Attacker: Fighter, STR 18 (+4), DEX 10, level 1 -> PB +2. Melee bonus = 6.
// Target: Human, DEX 14 (+2) unarmored -> AC = 10+2 = 12. DEX save bonus = +2
// (not proficient).
function attackerBlueprint(overrides: Record<string, unknown> = {}) {
  return {
    worldId: '5', characterId: '42', characterTitle: 'Attacker',
    species: { status: 'resolved', entry: baseEntry({ title: 'Human', slug: 'human-xphb' }) },
    class: {
      status: 'resolved',
      entry: baseEntry({ title: 'Fighter', slug: 'fighter-xphb', rulesFacet: findRulesFacet('dnd5e.2024', 'class', 'fighter-xphb') ?? undefined })
    },
    background: { status: 'resolved', entry: baseEntry({ title: 'Acolyte', slug: 'acolyte-xphb' }) },
    abilityScores: { method: 'standard-array', scores: { str: 18, dex: 10, con: 10, int: 10, wis: 10, cha: 10 } },
    rulesChoices: null,
    inventory: [{ instanceId: 'item-1', status: 'resolved', title: 'Longsword', equipped: true, attuned: false, quantity: 1, entry: baseEntry({ actions: [LONGSWORD_ACTION] }) }],
    notes: null, health: null,
    spells: [{ instanceId: 'spell-1', status: 'resolved', title: 'Fireball', known: true, prepared: true, entry: baseEntry({ actions: [FIREBALL_ACTION] }) }],
    expendedSlots: {}, packs: [],
    ...overrides
  }
}

function targetBlueprint(overrides: Record<string, unknown> = {}) {
  return {
    worldId: '5', characterId: '99', characterTitle: 'Target',
    species: { status: 'resolved', entry: baseEntry({ title: 'Human', slug: 'human-xphb' }) },
    class: { status: 'resolved', entry: baseEntry({ title: 'Fighter', slug: 'fighter-xphb' }) },
    background: { status: 'resolved', entry: baseEntry({ title: 'Acolyte', slug: 'acolyte-xphb' }) },
    abilityScores: { method: 'standard-array', scores: { str: 10, dex: 14, con: 10, int: 10, wis: 10, cha: 10 } },
    rulesChoices: null, inventory: [], notes: null, health: null, spells: [], expendedSlots: {}, packs: [],
    ...overrides
  }
}

beforeEach(() => {
  assembleCharacterMock.mockReset()
  getWorldRuntimeMock.mockReset()
  loadHealthMock.mockReset()
  saveHealthMock.mockReset()
  createSeededRngMock.mockReset()

  assembleCharacterMock.mockImplementation(async (_worldId: unknown, characterId: unknown) => {
    if (String(characterId) === '42') return { available: true, blueprint: attackerBlueprint() }
    if (String(characterId) === '99') return { available: true, blueprint: targetBlueprint() }
    return { available: false, reason: 'character-not-found' }
  })

  loadHealthMock.mockResolvedValue({ currentHp: 20, temporaryHp: 0, hitDiceSpent: 0, deathSaves: { successes: 0, failures: 0 } })
  saveHealthMock.mockImplementation(async (_id: unknown, stored: unknown) => stored)

  const runtime = loadRealRuntime()
  getWorldRuntimeMock.mockResolvedValue({
    configured: true, ok: true, runtime,
    integrityHash: 'sha256-test', settings: {}, rollTypeOverrides: {}
  })
})

describe('resolveCombatAction -- attack roll, weapon', () => {
  it('a roll that beats AC hits, and applies rolled damage plus Strength modifier', async () => {
    mockRolls([15, 5]) // attack roll 15 (+6 = 21, beats AC 12); damage die 5 (+4 STR = 9)
    const result = await resolveCombatAction('5', '42', '99', 'weapon:item-1')
    expect(result.ok).toBe(true)
    if (!result.ok) return

    expect(result.hit).toBe(true)
    expect(result.critical).toBe(false)
    expect(result.attackRoll).toMatchObject({ roll: 15, bonus: 6, total: 21, targetArmorClass: 12 })
    expect(result.damage).toMatchObject({ rolls: [5], modifier: 4, total: 9, type: 'slashing' })
    expect(result.targetHealth.currentHp).toBe(11) // 20 - 9
  })

  it('a roll that does not beat AC misses, and applies no damage', async () => {
    mockRolls([2]) // attack roll 2 (+6 = 8, does not beat AC 12) -- no damage roll needed
    const result = await resolveCombatAction('5', '42', '99', 'weapon:item-1')
    expect(result.ok).toBe(true)
    if (!result.ok) return

    expect(result.hit).toBe(false)
    expect(result.critical).toBe(false)
    expect(result.damage).toBeUndefined()
    expect(result.targetHealth.currentHp).toBe(20) // unchanged
    expect(saveHealthMock).not.toHaveBeenCalled()
  })

  it('a natural 1 always misses, even if the bonus would otherwise beat AC', async () => {
    mockRolls([1])
    const result = await resolveCombatAction('5', '42', '99', 'weapon:item-1')
    expect(result.ok).toBe(true)
    if (!result.ok) return

    expect(result.hit).toBe(false)
    expect(result.attackRoll?.naturalOne).toBe(true)
  })

  it('a natural 20 always hits and is a critical, doubling the damage DICE (not the modifier)', async () => {
    mockRolls([20, 3, 6]) // attack roll 20 (auto-hit, crit); damage dice [3,6] (2x count) + 4 STR
    const result = await resolveCombatAction('5', '42', '99', 'weapon:item-1')
    expect(result.ok).toBe(true)
    if (!result.ok) return

    expect(result.hit).toBe(true)
    expect(result.critical).toBe(true)
    expect(result.attackRoll?.naturalTwenty).toBe(true)
    expect(result.damage).toMatchObject({ rolls: [3, 6], modifier: 4, total: 13 }) // 3+6+4
  })

  it('temporary HP absorbs damage before current HP', async () => {
    loadHealthMock.mockResolvedValue({ currentHp: 20, temporaryHp: 4, hitDiceSpent: 0, deathSaves: { successes: 0, failures: 0 } })
    mockRolls([15, 5]) // total damage 9 (5+4)

    const result = await resolveCombatAction('5', '42', '99', 'weapon:item-1')
    expect(result.ok).toBe(true)
    if (!result.ok) return

    expect(result.targetHealth.temporaryHp).toBe(0)
    expect(result.targetHealth.currentHp).toBe(15) // 20 - (9 - 4 absorbed)
  })
})

describe('resolveCombatAction -- Unarmed Strike', () => {
  it('always hits for a flat 1 + Strength modifier, no dice rolled', async () => {
    mockRolls([15]) // attack roll only -- no damage dice for Unarmed Strike
    const result = await resolveCombatAction('5', '42', '99', 'unarmed:strike')
    expect(result.ok).toBe(true)
    if (!result.ok) return

    expect(result.hit).toBe(true)
    expect(result.damage).toMatchObject({ rolls: [], total: 5, type: 'bludgeoning' }) // 1 + 4 STR
  })

  it('a critical Unarmed Strike still applies the same flat total -- nothing to double', async () => {
    mockRolls([20])
    const result = await resolveCombatAction('5', '42', '99', 'unarmed:strike')
    expect(result.ok).toBe(true)
    if (!result.ok) return

    expect(result.critical).toBe(true)
    expect(result.damage?.total).toBe(5)
  })
})

describe('resolveCombatAction -- spell attack roll', () => {
  it('resolves against the target\'s AC using the Spell Attack Bonus, no ability modifier added to damage', async () => {
    // Cast as a Wizard for a real Spell Attack Bonus: INT 18 (+4), level 1 -> PB+2, bonus = 6.
    assembleCharacterMock.mockImplementation(async (_worldId: unknown, characterId: unknown) => {
      if (String(characterId) === '42') {
        return {
          available: true,
          blueprint: attackerBlueprint({
            class: { status: 'resolved', entry: baseEntry({ title: 'Wizard', slug: 'wizard-xphb', rulesFacet: findRulesFacet('dnd5e.2024', 'class', 'wizard-xphb') ?? undefined }) },
            abilityScores: { method: 'standard-array', scores: { str: 10, dex: 10, con: 10, int: 18, wis: 10, cha: 10 } },
            spells: [{ instanceId: 'spell-1', status: 'resolved', title: 'Fire Bolt', known: true, prepared: true, entry: baseEntry({ actions: [{ ...FIREBALL_ACTION, name: 'Fire Bolt', damageRoll: { count: 1, faces: 10 }, damageType: 'fire', resolution: { kind: 'attack-roll', attackKind: 'spell' } }] }) }]
          })
        }
      }
      if (String(characterId) === '99') return { available: true, blueprint: targetBlueprint() }
      return { available: false, reason: 'character-not-found' }
    })

    mockRolls([15, 7]) // attack roll 15 (+6 = 21, beats AC 12); damage die 7, no modifier
    const result = await resolveCombatAction('5', '42', '99', 'spell:spell-1')
    expect(result.ok).toBe(true)
    if (!result.ok) return

    expect(result.hit).toBe(true)
    expect(result.attackRoll?.bonus).toBe(6)
    expect(result.damage).toMatchObject({ rolls: [7], modifier: 0, total: 7 })
  })
})

describe('resolveCombatAction -- saving throw, spell', () => {
  it('a failed save takes full damage', async () => {
    // Cast as Wizard, save DC 8+2+4=14. Target DEX save bonus +2 (not proficient).
    assembleCharacterMock.mockImplementation(async (_worldId: unknown, characterId: unknown) => {
      if (String(characterId) === '42') {
        return {
          available: true,
          blueprint: attackerBlueprint({
            class: { status: 'resolved', entry: baseEntry({ title: 'Wizard', slug: 'wizard-xphb', rulesFacet: findRulesFacet('dnd5e.2024', 'class', 'wizard-xphb') ?? undefined }) },
            abilityScores: { method: 'standard-array', scores: { str: 10, dex: 10, con: 10, int: 18, wis: 10, cha: 10 } }
          })
        }
      }
      if (String(characterId) === '99') return { available: true, blueprint: targetBlueprint() }
      return { available: false, reason: 'character-not-found' }
    })

    // Save roll 5 (+2 = 7, fails DC 14). Then 8 damage dice, all 3s = 24.
    mockRolls([5, 3, 3, 3, 3, 3, 3, 3, 3])
    const result = await resolveCombatAction('5', '42', '99', 'spell:spell-1')
    expect(result.ok).toBe(true)
    if (!result.ok) return

    expect(result.savingThrow).toMatchObject({ roll: 5, bonus: 2, total: 7, dc: 14, success: false })
    expect(result.critical).toBe(false)
    expect(result.damage?.total).toBe(24)
    expect(result.damage?.halvedFrom).toBeUndefined()
    expect(result.targetHealth.currentHp).toBe(0) // 20 - 24, floored at 0 (health.ts's own applyDamage)
  })

  it('a successful save halves the damage, rounded down', async () => {
    assembleCharacterMock.mockImplementation(async (_worldId: unknown, characterId: unknown) => {
      if (String(characterId) === '42') {
        return {
          available: true,
          blueprint: attackerBlueprint({
            class: { status: 'resolved', entry: baseEntry({ title: 'Wizard', slug: 'wizard-xphb', rulesFacet: findRulesFacet('dnd5e.2024', 'class', 'wizard-xphb') ?? undefined }) },
            abilityScores: { method: 'standard-array', scores: { str: 10, dex: 10, con: 10, int: 18, wis: 10, cha: 10 } }
          })
        }
      }
      if (String(characterId) === '99') return { available: true, blueprint: targetBlueprint() }
      return { available: false, reason: 'character-not-found' }
    })

    // Save roll 18 (+2 = 20, beats DC 14) -- success. 8 dice, all 3s = 24 raw, halved to 12.
    mockRolls([18, 3, 3, 3, 3, 3, 3, 3, 3])
    const result = await resolveCombatAction('5', '42', '99', 'spell:spell-1')
    expect(result.ok).toBe(true)
    if (!result.ok) return

    expect(result.savingThrow?.success).toBe(true)
    expect(result.damage).toMatchObject({ total: 12, halvedFrom: 24 })
  })

  it('never marks a saving throw as a critical', async () => {
    assembleCharacterMock.mockImplementation(async (_worldId: unknown, characterId: unknown) => {
      if (String(characterId) === '42') {
        return {
          available: true,
          blueprint: attackerBlueprint({
            class: { status: 'resolved', entry: baseEntry({ title: 'Wizard', slug: 'wizard-xphb', rulesFacet: findRulesFacet('dnd5e.2024', 'class', 'wizard-xphb') ?? undefined }) },
            abilityScores: { method: 'standard-array', scores: { str: 10, dex: 10, con: 10, int: 18, wis: 10, cha: 10 } }
          })
        }
      }
      return { available: true, blueprint: targetBlueprint() }
    })

    mockRolls([20, 3, 3, 3, 3, 3, 3, 3, 3]) // a natural 20 on the SAVE means nothing special here
    const result = await resolveCombatAction('5', '42', '99', 'spell:spell-1')
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.critical).toBe(false)
  })
})

describe('resolveCombatAction -- errors', () => {
  it('reports attacker-not-found', async () => {
    const result = await resolveCombatAction('5', '000', '99', 'weapon:item-1')
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.reason).toBe('attacker-not-found')
  })

  it('reports target-not-found', async () => {
    const result = await resolveCombatAction('5', '42', '000', 'weapon:item-1')
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.reason).toBe('target-not-found')
  })

  it('reports action-not-found for an id the attacker does not have', async () => {
    const result = await resolveCombatAction('5', '42', '99', 'weapon:does-not-exist')
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.reason).toBe('action-not-found')
  })

  it('reports no-resolution for an action with nothing to resolve (Species/Class/Background features)', async () => {
    assembleCharacterMock.mockImplementation(async (_worldId: unknown, characterId: unknown) => {
      if (String(characterId) === '42') {
        return {
          available: true,
          blueprint: attackerBlueprint({
            background: { status: 'resolved', entry: baseEntry({ title: 'Acolyte', slug: 'acolyte-xphb', actions: [{ name: 'Magic Initiate', category: 'background', actionType: 'Feature' }] }) }
          })
        }
      }
      return { available: true, blueprint: targetBlueprint() }
    })

    const result = await resolveCombatAction('5', '42', '99', 'background:0')
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.reason).toBe('no-resolution')
  })

  it('does not touch target health when the action cannot be resolved', async () => {
    await resolveCombatAction('5', '42', '99', 'weapon:does-not-exist')
    expect(loadHealthMock).not.toHaveBeenCalled()
    expect(saveHealthMock).not.toHaveBeenCalled()
  })
})
