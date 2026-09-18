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
  loadSpellcastingMock, saveSpellcastingMock, createHitDieRollEventMock
} = vi.hoisted(() => ({
  assembleCharacterMock: vi.fn(),
  getWorldRuntimeMock: vi.fn(),
  loadHealthMock: vi.fn(),
  saveHealthMock: vi.fn(),
  loadSpellcastingMock: vi.fn(),
  saveSpellcastingMock: vi.fn(),
  createHitDieRollEventMock: vi.fn()
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

// Header Cleanup 2.1: Spend Hit Die now creates a real RollEvent via
// server/utils/roll-events.ts's createHitDieRollEvent. Mocked at the module
// boundary (already independently tested in roll-events.test.ts) -- these
// tests assert that character-recovery.ts calls it with the right
// server-derived numbers and applies ITS `total`, not that OpenDice itself
// works.
vi.mock('../../../server/utils/roll-events', () => ({
  createHitDieRollEvent: createHitDieRollEventMock
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

// A representative RollEventRecord -- shaped exactly like
// createHitDieRollEvent's own real return value (roll-events.test.ts
// covers its persistence/broadcast contract directly). `total: 6` is
// deliberately DIFFERENT from the d10+CON3 deterministic average (9,
// `floor(10/2)+1+3`) these fixtures used to heal by -- proving these tests
// exercise the real roll's own total, not a coincidentally-matching
// average.
function fakeHitDieRoll(total = 6) {
  return {
    id: 'roll-1',
    worldId: '5',
    encounterId: null,
    actorCharacterId: '42',
    rollerUserId: 'account-1',
    rollerDisplayName: 'Bobbert Player',
    label: 'Hit Die (d10)',
    sourceType: 'hit_die',
    sourceKey: null,
    sourceId: null,
    expression: '1d10+3',
    dice: [{ sides: 10, sign: 1, results: [3], keptFlags: [true], kept: [3], advantageState: 'normal', multiplier: 1, total: 3, naturalHigh: false, naturalLow: false }],
    modifier: 3,
    modifiers: [3],
    total,
    visibility: 'private',
    createdAt: '2026-01-01T00:00:00.000Z',
    metadata: { conModifier: 3 }
  }
}

beforeEach(() => {
  assembleCharacterMock.mockReset()
  getWorldRuntimeMock.mockReset()
  loadHealthMock.mockReset()
  saveHealthMock.mockReset()
  loadSpellcastingMock.mockReset()
  saveSpellcastingMock.mockReset()
  createHitDieRollEventMock.mockReset()

  assembleCharacterMock.mockResolvedValue({ available: true, blueprint: FIGHTER_CON_16_BLUEPRINT })
  saveHealthMock.mockImplementation(async (_id: unknown, stored: unknown) => stored)
  loadSpellcastingMock.mockResolvedValue({ spells: [], expendedSlots: { 1: 2 } })
  saveSpellcastingMock.mockImplementation(async (_id: unknown, stored: unknown) => stored)
  createHitDieRollEventMock.mockResolvedValue(fakeHitDieRoll())

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

    const result = await applyRecoveryAction('5', '42', { type: 'damage', amount: 7 }, 'account-1')
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.health.temporaryHp).toBe(0)
    expect(result.health.currentHp).toBe(10) // 7 - 4 absorbed = 3 spillover
  })

  it('works even when the World has no Rules Package activated', async () => {
    loadHealthMock.mockResolvedValue({ currentHp: 10, temporaryHp: 0, hitDiceSpent: 0, deathSaves: { successes: 0, failures: 0 } })
    getWorldRuntimeMock.mockResolvedValue({ configured: false })

    const result = await applyRecoveryAction('5', '42', { type: 'damage', amount: 3 }, 'account-1')
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.health.currentHp).toBe(7)
  })

  it('persists the result through saveCharacterHealth', async () => {
    loadHealthMock.mockResolvedValue({ currentHp: 10, temporaryHp: 0, hitDiceSpent: 0, deathSaves: { successes: 0, failures: 0 } })
    await applyRecoveryAction('5', '42', { type: 'damage', amount: 3 }, 'account-1')
    expect(saveHealthMock).toHaveBeenCalledWith('42', expect.objectContaining({ currentHp: 7 }))
  })

  it('rejects a non-positive amount', async () => {
    loadHealthMock.mockResolvedValue(null)
    const result = await applyRecoveryAction('5', '42', { type: 'damage', amount: 0 }, 'account-1')
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.reason).toBe('invalid-amount')
  })

  it('starts from empty health when nothing was ever recorded', async () => {
    loadHealthMock.mockResolvedValue(null)
    const result = await applyRecoveryAction('5', '42', { type: 'damage', amount: 3 }, 'account-1')
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.health.currentHp).toBe(0) // floored, never negative
  })
})

describe('applyRecoveryAction -- temp-hp (no Rules Engine needed, replace-if-higher)', () => {
  it('replaces temporary HP when the granted amount is higher', async () => {
    loadHealthMock.mockResolvedValue({ currentHp: 13, temporaryHp: 2, hitDiceSpent: 0, deathSaves: { successes: 0, failures: 0 } })

    const result = await applyRecoveryAction('5', '42', { type: 'temp-hp', amount: 5 }, 'account-1')
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.health.temporaryHp).toBe(5)
  })

  it('keeps the existing (higher) temporary HP rather than stacking or replacing downward', async () => {
    loadHealthMock.mockResolvedValue({ currentHp: 13, temporaryHp: 8, hitDiceSpent: 0, deathSaves: { successes: 0, failures: 0 } })

    const result = await applyRecoveryAction('5', '42', { type: 'temp-hp', amount: 3 }, 'account-1')
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.health.temporaryHp).toBe(8)
  })

  it('works even when the World has no Rules Package activated', async () => {
    loadHealthMock.mockResolvedValue({ currentHp: 10, temporaryHp: 0, hitDiceSpent: 0, deathSaves: { successes: 0, failures: 0 } })
    getWorldRuntimeMock.mockResolvedValue({ configured: false })

    const result = await applyRecoveryAction('5', '42', { type: 'temp-hp', amount: 4 }, 'account-1')
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.health.temporaryHp).toBe(4)
  })

  it('persists the result through saveCharacterHealth', async () => {
    loadHealthMock.mockResolvedValue({ currentHp: 10, temporaryHp: 0, hitDiceSpent: 0, deathSaves: { successes: 0, failures: 0 } })
    await applyRecoveryAction('5', '42', { type: 'temp-hp', amount: 6 }, 'account-1')
    expect(saveHealthMock).toHaveBeenCalledWith('42', expect.objectContaining({ temporaryHp: 6 }))
  })

  it('rejects a non-positive amount', async () => {
    loadHealthMock.mockResolvedValue(null)
    const result = await applyRecoveryAction('5', '42', { type: 'temp-hp', amount: 0 }, 'account-1')
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.reason).toBe('invalid-amount')
  })

  it('does not touch current HP', async () => {
    loadHealthMock.mockResolvedValue({ currentHp: 9, temporaryHp: 0, hitDiceSpent: 0, deathSaves: { successes: 0, failures: 0 } })
    const result = await applyRecoveryAction('5', '42', { type: 'temp-hp', amount: 4 }, 'account-1')
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.health.currentHp).toBe(9)
  })
})

describe('applyRecoveryAction -- heal (reads Maximum HP)', () => {
  it('heals, capped at the Rules Engine\'s derived Maximum HP', async () => {
    loadHealthMock.mockResolvedValue({ currentHp: 10, temporaryHp: 0, hitDiceSpent: 0, deathSaves: { successes: 0, failures: 0 } })

    const result = await applyRecoveryAction('5', '42', { type: 'heal', amount: 20 }, 'account-1')
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.health.currentHp).toBe(13) // capped at Max HP, not 30
  })

  it('fails informatively when the World has no Rules Package activated', async () => {
    loadHealthMock.mockResolvedValue({ currentHp: 10, temporaryHp: 0, hitDiceSpent: 0, deathSaves: { successes: 0, failures: 0 } })
    getWorldRuntimeMock.mockResolvedValue({ configured: false })

    const result = await applyRecoveryAction('5', '42', { type: 'heal', amount: 5 }, 'account-1')
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.reason).toBe('rules-unconfigured')
    expect(saveHealthMock).not.toHaveBeenCalled()
  })
})

describe('applyRecoveryAction -- spend-hit-die (Header Cleanup 2.1: a real authoritative roll)', () => {
  it('spends a die and heals by the RollEvent\'s own total, not the deterministic average', async () => {
    createHitDieRollEventMock.mockResolvedValue(fakeHitDieRoll(6))
    loadHealthMock.mockResolvedValue({ currentHp: 5, temporaryHp: 0, hitDiceSpent: 0, deathSaves: { successes: 0, failures: 0 } })

    const result = await applyRecoveryAction('5', '42', { type: 'spend-hit-die' }, 'account-1')
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.health.currentHp).toBe(11) // 5 + 6 (the roll's total, NOT the average of 9)
    expect(result.health.hitDiceSpent).toBe(1)
  })

  it('derives Hit Die size and Constitution modifier server-side and passes them to the roll, never a client number', async () => {
    loadHealthMock.mockResolvedValue({ currentHp: 5, temporaryHp: 0, hitDiceSpent: 0, deathSaves: { successes: 0, failures: 0 } })

    await applyRecoveryAction('5', '42', { type: 'spend-hit-die' }, 'account-1')

    // Fighter (d10) + CON 16 (+3 mod) -- see this file's own fixture comment.
    expect(createHitDieRollEventMock).toHaveBeenCalledWith(
      expect.objectContaining({
        worldId: '5',
        rollerUserId: 'account-1',
        actorCharacterId: '42',
        hitDieSize: 10,
        conModifier: 3,
        visibility: 'private'
      })
    )
  })

  it('caps healing at Maximum HP, same as every other healing path', async () => {
    createHitDieRollEventMock.mockResolvedValue(fakeHitDieRoll(20))
    loadHealthMock.mockResolvedValue({ currentHp: 10, temporaryHp: 0, hitDiceSpent: 0, deathSaves: { successes: 0, failures: 0 } })

    const result = await applyRecoveryAction('5', '42', { type: 'spend-hit-die' }, 'account-1')
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.health.currentHp).toBe(13) // capped at Max HP, not 30
  })

  it('is a no-op once every Hit Die is spent -- level 1 has exactly one -- and never rolls', async () => {
    loadHealthMock.mockResolvedValue({ currentHp: 5, temporaryHp: 0, hitDiceSpent: 1, deathSaves: { successes: 0, failures: 0 } })

    const result = await applyRecoveryAction('5', '42', { type: 'spend-hit-die' }, 'account-1')
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.health.currentHp).toBe(5)
    expect(result.health.hitDiceSpent).toBe(1)
    // NO-HIT-DICE GUARD: no roll requested at all, not merely a roll whose
    // result was discarded.
    expect(createHitDieRollEventMock).not.toHaveBeenCalled()
  })

  it('is a no-op at full Current HP, even with a Hit Die available, and never rolls', async () => {
    loadHealthMock.mockResolvedValue({ currentHp: 13, temporaryHp: 0, hitDiceSpent: 0, deathSaves: { successes: 0, failures: 0 } })

    const result = await applyRecoveryAction('5', '42', { type: 'spend-hit-die' }, 'account-1')
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.health.currentHp).toBe(13)
    expect(result.health.hitDiceSpent).toBe(0)
    // FULL-HP GUARD: a player at full HP must not be able to waste a Hit
    // Die -- no roll requested, no die consumed.
    expect(createHitDieRollEventMock).not.toHaveBeenCalled()
  })

  it('propagates a roll failure without consuming a Hit Die or persisting any health change', async () => {
    loadHealthMock.mockResolvedValue({ currentHp: 5, temporaryHp: 0, hitDiceSpent: 0, deathSaves: { successes: 0, failures: 0 } })
    createHitDieRollEventMock.mockRejectedValue(Object.assign(new Error('roll failed'), { statusCode: 400 }))

    await expect(applyRecoveryAction('5', '42', { type: 'spend-hit-die' }, 'account-1')).rejects.toThrow('roll failed')
    expect(saveHealthMock).not.toHaveBeenCalled()
  })
})

describe('applyRecoveryAction -- short-rest (Header Cleanup 2.1: no longer touches Hit Dice or HP)', () => {
  it('does not change Current HP, Temp HP, or Hit Dice spent', async () => {
    loadHealthMock.mockResolvedValue({ currentHp: 5, temporaryHp: 2, hitDiceSpent: 0, deathSaves: { successes: 0, failures: 0 } })

    const result = await applyRecoveryAction('5', '42', { type: 'short-rest' }, 'account-1')
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.health.currentHp).toBe(5)
    expect(result.health.temporaryHp).toBe(2)
    expect(result.health.hitDiceSpent).toBe(0)
  })

  it('never creates a RollEvent -- Hit Dice are spent only via the explicit Spend Hit Die action now', async () => {
    loadHealthMock.mockResolvedValue({ currentHp: 5, temporaryHp: 0, hitDiceSpent: 0, deathSaves: { successes: 0, failures: 0 } })

    await applyRecoveryAction('5', '42', { type: 'short-rest' }, 'account-1')
    expect(createHitDieRollEventMock).not.toHaveBeenCalled()
  })

  it('does not change Hit Dice spent even when a die was already spent', async () => {
    loadHealthMock.mockResolvedValue({ currentHp: 5, temporaryHp: 0, hitDiceSpent: 1, deathSaves: { successes: 0, failures: 0 } })

    const result = await applyRecoveryAction('5', '42', { type: 'short-rest' }, 'account-1')
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.health.hitDiceSpent).toBe(1)
  })
})

describe('applyRecoveryAction -- long-rest', () => {
  it('fully heals, clears temp HP, recovers hit dice, clears death saves', async () => {
    loadHealthMock.mockResolvedValue({
      currentHp: 2, temporaryHp: 5, hitDiceSpent: 1,
      deathSaves: { successes: 1, failures: 2 }
    })

    const result = await applyRecoveryAction('5', '42', { type: 'long-rest' }, 'account-1')
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.health.currentHp).toBe(13) // full Max HP
    expect(result.health.temporaryHp).toBe(0)
    expect(result.health.hitDiceSpent).toBe(0) // level 1 recovers ceil(1/2)=1, all of it
    expect(result.health.deathSaves).toEqual({ successes: 0, failures: 0 })
  })

  // Header Cleanup 2.1 -- THE EXACT REGRESSION FROM THE REPORTED BROWSER
  // BUG ("Hit Dice = 0 / 1, click Long Rest, Hit Dice remains 0 / 1"),
  // reproduced end-to-end through this module's real formula pipeline
  // (loadRealRuntime -- the actual eldra-dnd5e-2024 package, not a hand-
  // built fake). This proves the SERVER's own computation was never the
  // bug: hitDiceMax=1, hitDiceSpent=1 -> long-rest -> hitDiceSpent=0, so
  // `available` (hitDiceMax - hitDiceSpent, computed the same way
  // useCharacterSheet.ts's own `hitDiceAvailable` is) resolves to 1 / 1,
  // exactly as the domain always claimed. The actual root cause was
  // client-side: useCharacterMutations.ts's `recovery.apply` never
  // refreshed the Sheet's `derived` snapshot (where `hitDiceAvailable` is
  // read from) after a Recovery action changed `hitDiceSpent` -- fixed
  // there, not here; see this file's own "long rest failed to restore hit
  // dice" investigation notes in useCharacterMutations.ts.
  it('proves the reported browser bug is not a server-side formula defect: hitDiceMax=1, hitDiceSpent=1 -> long-rest -> available resolves to 1/1', async () => {
    loadHealthMock.mockResolvedValue({ currentHp: 5, temporaryHp: 0, hitDiceSpent: 1, deathSaves: { successes: 0, failures: 0 } })

    const result = await applyRecoveryAction('5', '42', { type: 'long-rest' }, 'account-1')
    expect(result.ok).toBe(true)
    if (!result.ok) return

    const hitDiceMax = 1 // Fighter, level 1: @value:level
    const available = hitDiceMax - result.health.hitDiceSpent
    expect(result.health.hitDiceSpent).toBe(0)
    expect(available).toBe(1) // 1 / 1, not the reported stuck 0 / 1
  })

  it('also clears every expended spell slot, for a non-caster same as anyone', async () => {
    // Fighter is not a caster at all -- Long Rest resets slot state
    // unconditionally regardless, the same "no caster type is special-cased"
    // rule the three progression tables already follow.
    loadHealthMock.mockResolvedValue({ currentHp: 5, temporaryHp: 0, hitDiceSpent: 0, deathSaves: { successes: 0, failures: 0 } })

    await applyRecoveryAction('5', '42', { type: 'long-rest' }, 'account-1')
    expect(saveSpellcastingMock).toHaveBeenCalledWith('42', expect.objectContaining({ expendedSlots: {} }))
  })
})

describe('applyRecoveryAction -- spell slot recovery hooks (Short Rest, Pact Magic only)', () => {
  it('short-rest does NOT touch spell slots for a non-Pact character', async () => {
    loadHealthMock.mockResolvedValue({ currentHp: 5, temporaryHp: 0, hitDiceSpent: 0, deathSaves: { successes: 0, failures: 0 } })

    await applyRecoveryAction('5', '42', { type: 'short-rest' }, 'account-1')
    expect(saveSpellcastingMock).not.toHaveBeenCalled()
    expect(loadSpellcastingMock).not.toHaveBeenCalled()
  })

  it('short-rest DOES clear expended Pact Magic slots for a Warlock', async () => {
    assembleCharacterMock.mockResolvedValue({ available: true, blueprint: WARLOCK_BLUEPRINT })
    loadHealthMock.mockResolvedValue({ currentHp: 5, temporaryHp: 0, hitDiceSpent: 0, deathSaves: { successes: 0, failures: 0 } })

    await applyRecoveryAction('5', '42', { type: 'short-rest' }, 'account-1')
    expect(saveSpellcastingMock).toHaveBeenCalledWith('42', expect.objectContaining({ expendedSlots: {} }))
  })

  it('spend-hit-die never touches spell slots, even for a Warlock', async () => {
    assembleCharacterMock.mockResolvedValue({ available: true, blueprint: WARLOCK_BLUEPRINT })
    loadHealthMock.mockResolvedValue({ currentHp: 5, temporaryHp: 0, hitDiceSpent: 0, deathSaves: { successes: 0, failures: 0 } })

    await applyRecoveryAction('5', '42', { type: 'spend-hit-die' }, 'account-1')
    expect(saveSpellcastingMock).not.toHaveBeenCalled()
  })

  // Header Cleanup 2.1 REPLACES the old "short-rest and spend-hit-die
  // produce identical HEALTH results" test -- that was true only because
  // Short Rest used to auto-spend a Hit Die via the same deterministic
  // average. Now the two are deliberately DIFFERENT: Short Rest never
  // touches HP or Hit Dice (see the dedicated short-rest describe block
  // above), so the only thing left for the two to still share is Pact
  // Magic recovery, which this describe block already covers on its own.
  it('short-rest for a Warlock still leaves HP and Hit Dice untouched, even though Pact Magic resets', async () => {
    assembleCharacterMock.mockResolvedValue({ available: true, blueprint: WARLOCK_BLUEPRINT })
    loadHealthMock.mockResolvedValue({ currentHp: 1, temporaryHp: 0, hitDiceSpent: 1, deathSaves: { successes: 0, failures: 0 } })

    const result = await applyRecoveryAction('5', '42', { type: 'short-rest' }, 'account-1')
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.health.currentHp).toBe(1)
    expect(result.health.hitDiceSpent).toBe(1)
    expect(saveSpellcastingMock).toHaveBeenCalledWith('42', expect.objectContaining({ expendedSlots: {} }))
  })
})

describe('applyRecoveryAction -- reset-death-saves (no Rules Engine needed)', () => {
  it('clears marks without touching HP', async () => {
    loadHealthMock.mockResolvedValue({
      currentHp: 0, temporaryHp: 0, hitDiceSpent: 0,
      deathSaves: { successes: 2, failures: 1 }
    })
    getWorldRuntimeMock.mockResolvedValue({ configured: false })

    const result = await applyRecoveryAction('5', '42', { type: 'reset-death-saves' }, 'account-1')
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.health.deathSaves).toEqual({ successes: 0, failures: 0 })
    expect(result.health.currentHp).toBe(0)
  })
})

describe('applyRecoveryAction -- character existence', () => {
  it('reports character-not-found without touching health storage', async () => {
    assembleCharacterMock.mockResolvedValue({ available: false, reason: 'character-not-found' })

    const result = await applyRecoveryAction('5', '999', { type: 'damage', amount: 3 }, 'account-1')
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.reason).toBe('character-not-found')
    expect(loadHealthMock).not.toHaveBeenCalled()
  })
})
