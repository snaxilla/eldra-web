// Unit tests for server/utils/character-recovery.ts -- the Recovery
// System's orchestrator.
//
// `assembleCharacter`, `loadCharacterHealth`/`saveCharacterHealth`, and
// `getWorldRuntime` are mocked at the module boundary (each already
// independently tested), matching character-derived.test.ts's own
// precedent. The Rules Runtime itself is REAL -- built via
// createWorldRuntime from the actual eldra-dnd5e-2024 package on disk --
// so every number these tests assert on (Maximum HP, average roll, Long
// Rest recovery) comes from the real formulas, not a hand-built fake that
// could silently drift from them.

import { readFileSync } from 'node:fs'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
  assembleCharacterMock, getWorldRuntimeMock, loadHealthMock, saveHealthMock,
  loadSpellcastingMock, saveSpellcastingMock
} = vi.hoisted(() => ({
  assembleCharacterMock: vi.fn(),
  getWorldRuntimeMock: vi.fn(),
  loadHealthMock: vi.fn(),
  saveHealthMock: vi.fn(),
  loadSpellcastingMock: vi.fn(),
  saveSpellcastingMock: vi.fn()
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

vi.mock('../../../server/utils/character-spellcasting', () => ({
  loadCharacterSpellcasting: loadSpellcastingMock,
  saveCharacterSpellcasting: saveSpellcastingMock
}))

import { createWorldRuntime } from '../../../app/lib/rules/world-runtime'
import { parseExpression } from '../../../app/lib/rules/parser'
import type { Definition, RulesPackageManifest } from '../../../app/lib/rules/types'
import { applyRecoveryAction } from '../../../server/utils/character-recovery'
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

const FIGHTER_CON_16_BLUEPRINT = {
  worldId: '5',
  characterId: '42',
  characterTitle: 'Bobbert',
  species: { status: 'resolved' as const, entry: baseEntry('human-xphb') },
  class: { status: 'resolved' as const, entry: { ...baseEntry('fighter-xphb'), rulesFacet: findRulesFacet('dnd5e.2024', 'class', 'fighter-xphb') ?? undefined } },
  background: { status: 'resolved' as const, entry: baseEntry('acolyte-xphb') },
  abilityScores: {
    method: 'standard-array' as const,
    scores: { str: 10, dex: 10, con: 16, int: 10, wis: 10, cha: 10 }
  },
  rulesChoices: null,
  inventory: [],
  notes: null,
  health: null,
  spells: [],
  expendedSlots: {},
  packs: []
}

function baseEntry(slug: string) {
  return {
    packageId: 'eldra.content.xphb', packageVersion: '1.0.0', systemKey: 'dnd5e',
    title: slug, slug, externalId: slug, provider: '5etools-json'
  }
}

// Warlock -- a Pact caster, the only class whose Short Rest recovers spell
// slots (character-recovery.ts's own header). Otherwise identical to the
// Fighter fixture above; only the class differs.
const WARLOCK_BLUEPRINT = {
  ...FIGHTER_CON_16_BLUEPRINT,
  class: { status: 'resolved' as const, entry: { ...baseEntry('warlock-xphb'), rulesFacet: findRulesFacet('dnd5e.2024', 'class', 'warlock-xphb') ?? undefined } }
}

beforeEach(() => {
  assembleCharacterMock.mockReset()
  getWorldRuntimeMock.mockReset()
  loadHealthMock.mockReset()
  saveHealthMock.mockReset()
  loadSpellcastingMock.mockReset()
  saveSpellcastingMock.mockReset()

  assembleCharacterMock.mockResolvedValue({ available: true, blueprint: FIGHTER_CON_16_BLUEPRINT })
  saveHealthMock.mockImplementation(async (_id: unknown, stored: unknown) => stored)
  loadSpellcastingMock.mockResolvedValue({ spells: [], expendedSlots: { 1: 2 } })
  saveSpellcastingMock.mockImplementation(async (_id: unknown, stored: unknown) => stored)

  const runtime = loadRealRuntime()
  getWorldRuntimeMock.mockResolvedValue({
    configured: true, ok: true, runtime,
    integrityHash: 'sha256-test', settings: {}, rollTypeOverrides: {}
  })
})

// Fighter (d10) + CON 16 (+3 mod), level 1: Maximum HP = 13.

describe('applyRecoveryAction -- damage (no Rules Engine needed)', () => {
  it('reduces current HP, temp HP absorbing first', async () => {
    loadHealthMock.mockResolvedValue({ currentHp: 13, temporaryHp: 4, hitDiceSpent: 0, deathSaves: { successes: 0, failures: 0 } })

    const result = await applyRecoveryAction('5', '42', { type: 'damage', amount: 7 })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.health.temporaryHp).toBe(0)
    expect(result.health.currentHp).toBe(10) // 7 - 4 absorbed = 3 spillover
  })

  it('works even when the World has no Rules Package activated', async () => {
    loadHealthMock.mockResolvedValue({ currentHp: 10, temporaryHp: 0, hitDiceSpent: 0, deathSaves: { successes: 0, failures: 0 } })
    getWorldRuntimeMock.mockResolvedValue({ configured: false })

    const result = await applyRecoveryAction('5', '42', { type: 'damage', amount: 3 })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.health.currentHp).toBe(7)
  })

  it('persists the result through saveCharacterHealth', async () => {
    loadHealthMock.mockResolvedValue({ currentHp: 10, temporaryHp: 0, hitDiceSpent: 0, deathSaves: { successes: 0, failures: 0 } })
    await applyRecoveryAction('5', '42', { type: 'damage', amount: 3 })
    expect(saveHealthMock).toHaveBeenCalledWith('42', expect.objectContaining({ currentHp: 7 }))
  })

  it('rejects a non-positive amount', async () => {
    loadHealthMock.mockResolvedValue(null)
    const result = await applyRecoveryAction('5', '42', { type: 'damage', amount: 0 })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.reason).toBe('invalid-amount')
  })

  it('starts from empty health when nothing was ever recorded', async () => {
    loadHealthMock.mockResolvedValue(null)
    const result = await applyRecoveryAction('5', '42', { type: 'damage', amount: 3 })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.health.currentHp).toBe(0) // floored, never negative
  })
})

describe('applyRecoveryAction -- heal (reads Maximum HP)', () => {
  it('heals, capped at the Rules Engine\'s derived Maximum HP', async () => {
    loadHealthMock.mockResolvedValue({ currentHp: 10, temporaryHp: 0, hitDiceSpent: 0, deathSaves: { successes: 0, failures: 0 } })

    const result = await applyRecoveryAction('5', '42', { type: 'heal', amount: 20 })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.health.currentHp).toBe(13) // capped at Max HP, not 30
  })

  it('fails informatively when the World has no Rules Package activated', async () => {
    loadHealthMock.mockResolvedValue({ currentHp: 10, temporaryHp: 0, hitDiceSpent: 0, deathSaves: { successes: 0, failures: 0 } })
    getWorldRuntimeMock.mockResolvedValue({ configured: false })

    const result = await applyRecoveryAction('5', '42', { type: 'heal', amount: 5 })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.reason).toBe('rules-unconfigured')
    expect(saveHealthMock).not.toHaveBeenCalled()
  })
})

describe('applyRecoveryAction -- spend-hit-die and short-rest (identical HP effect for a non-Pact character)', () => {
  it('spends a die and heals by the real average-roll value', async () => {
    loadHealthMock.mockResolvedValue({ currentHp: 5, temporaryHp: 0, hitDiceSpent: 0, deathSaves: { successes: 0, failures: 0 } })

    const result = await applyRecoveryAction('5', '42', { type: 'spend-hit-die' })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    // d10, CON +3: floor(10/2)+1+3 = 9.
    expect(result.health.currentHp).toBe(13) // 5 + 9 = 14, capped at Max HP 13
    expect(result.health.hitDiceSpent).toBe(1)
  })

  it('short-rest produces the identical result to spend-hit-die', async () => {
    loadHealthMock.mockResolvedValue({ currentHp: 1, temporaryHp: 0, hitDiceSpent: 0, deathSaves: { successes: 0, failures: 0 } })
    const spendResult = await applyRecoveryAction('5', '42', { type: 'spend-hit-die' })

    loadHealthMock.mockResolvedValue({ currentHp: 1, temporaryHp: 0, hitDiceSpent: 0, deathSaves: { successes: 0, failures: 0 } })
    const shortRestResult = await applyRecoveryAction('5', '42', { type: 'short-rest' })

    expect(spendResult).toEqual(shortRestResult)
  })

  it('is a no-op once every Hit Die is spent -- level 1 has exactly one', async () => {
    loadHealthMock.mockResolvedValue({ currentHp: 5, temporaryHp: 0, hitDiceSpent: 1, deathSaves: { successes: 0, failures: 0 } })

    const result = await applyRecoveryAction('5', '42', { type: 'spend-hit-die' })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.health.currentHp).toBe(5)
    expect(result.health.hitDiceSpent).toBe(1)
  })
})

describe('applyRecoveryAction -- long-rest', () => {
  it('fully heals, clears temp HP, recovers hit dice, clears death saves', async () => {
    loadHealthMock.mockResolvedValue({
      currentHp: 2, temporaryHp: 5, hitDiceSpent: 1,
      deathSaves: { successes: 1, failures: 2 }
    })

    const result = await applyRecoveryAction('5', '42', { type: 'long-rest' })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.health.currentHp).toBe(13) // full Max HP
    expect(result.health.temporaryHp).toBe(0)
    expect(result.health.hitDiceSpent).toBe(0) // level 1 recovers ceil(1/2)=1, all of it
    expect(result.health.deathSaves).toEqual({ successes: 0, failures: 0 })
  })

  it('also clears every expended spell slot, for a non-caster same as anyone', async () => {
    // Fighter is not a caster at all -- Long Rest resets slot state
    // unconditionally regardless, the same "no caster type is special-cased"
    // rule the three progression tables already follow.
    loadHealthMock.mockResolvedValue({ currentHp: 5, temporaryHp: 0, hitDiceSpent: 0, deathSaves: { successes: 0, failures: 0 } })

    await applyRecoveryAction('5', '42', { type: 'long-rest' })
    expect(saveSpellcastingMock).toHaveBeenCalledWith('42', expect.objectContaining({ expendedSlots: {} }))
  })
})

describe('applyRecoveryAction -- spell slot recovery hooks (Short Rest, Pact Magic only)', () => {
  it('short-rest does NOT touch spell slots for a non-Pact character', async () => {
    loadHealthMock.mockResolvedValue({ currentHp: 5, temporaryHp: 0, hitDiceSpent: 0, deathSaves: { successes: 0, failures: 0 } })

    await applyRecoveryAction('5', '42', { type: 'short-rest' })
    expect(saveSpellcastingMock).not.toHaveBeenCalled()
    expect(loadSpellcastingMock).not.toHaveBeenCalled()
  })

  it('short-rest DOES clear expended Pact Magic slots for a Warlock', async () => {
    assembleCharacterMock.mockResolvedValue({ available: true, blueprint: WARLOCK_BLUEPRINT })
    loadHealthMock.mockResolvedValue({ currentHp: 5, temporaryHp: 0, hitDiceSpent: 0, deathSaves: { successes: 0, failures: 0 } })

    await applyRecoveryAction('5', '42', { type: 'short-rest' })
    expect(saveSpellcastingMock).toHaveBeenCalledWith('42', expect.objectContaining({ expendedSlots: {} }))
  })

  it('spend-hit-die never touches spell slots, even for a Warlock', async () => {
    assembleCharacterMock.mockResolvedValue({ available: true, blueprint: WARLOCK_BLUEPRINT })
    loadHealthMock.mockResolvedValue({ currentHp: 5, temporaryHp: 0, hitDiceSpent: 0, deathSaves: { successes: 0, failures: 0 } })

    await applyRecoveryAction('5', '42', { type: 'spend-hit-die' })
    expect(saveSpellcastingMock).not.toHaveBeenCalled()
  })

  it('short-rest and spend-hit-die still produce identical HEALTH results for a non-Pact character', async () => {
    loadHealthMock.mockResolvedValue({ currentHp: 1, temporaryHp: 0, hitDiceSpent: 0, deathSaves: { successes: 0, failures: 0 } })
    const spendResult = await applyRecoveryAction('5', '42', { type: 'spend-hit-die' })

    loadHealthMock.mockResolvedValue({ currentHp: 1, temporaryHp: 0, hitDiceSpent: 0, deathSaves: { successes: 0, failures: 0 } })
    const shortRestResult = await applyRecoveryAction('5', '42', { type: 'short-rest' })

    expect(spendResult).toEqual(shortRestResult)
  })
})

describe('applyRecoveryAction -- reset-death-saves (no Rules Engine needed)', () => {
  it('clears marks without touching HP', async () => {
    loadHealthMock.mockResolvedValue({
      currentHp: 0, temporaryHp: 0, hitDiceSpent: 0,
      deathSaves: { successes: 2, failures: 1 }
    })
    getWorldRuntimeMock.mockResolvedValue({ configured: false })

    const result = await applyRecoveryAction('5', '42', { type: 'reset-death-saves' })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.health.deathSaves).toEqual({ successes: 0, failures: 0 })
    expect(result.health.currentHp).toBe(0)
  })
})

describe('applyRecoveryAction -- character existence', () => {
  it('reports character-not-found without touching health storage', async () => {
    assembleCharacterMock.mockResolvedValue({ available: false, reason: 'character-not-found' })

    const result = await applyRecoveryAction('5', '999', { type: 'damage', amount: 3 })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.reason).toBe('character-not-found')
    expect(loadHealthMock).not.toHaveBeenCalled()
  })
})
