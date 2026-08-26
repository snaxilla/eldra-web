// Unit tests for server/utils/encounter-actions.ts -- the Encounter
// Management System's mutation orchestrator.
//
// `encounter-persistence.ts`, `character-derived.ts` (getDerivedCharacter),
// and `app/lib/rules/rng.ts` are mocked at the module boundary --
// encounter-persistence and rng because this file is about ORCHESTRATION
// logic, not Directus I/O or RNG internals (both independently
// uninteresting here); getDerivedCharacter because a canned Dexterity
// modifier is all this module ever reads from it, mirroring
// character-combat.test.ts's own choice to mock rng directly rather than
// build a real seeded stream to pin one roll down.

import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
  loadEncounterEntityMock, loadEncounterStateMock, saveEncounterStateMock,
  getDerivedCharacterMock, createSeededRngMock, getWorldRuntimeMock
} = vi.hoisted(() => ({
  loadEncounterEntityMock: vi.fn(),
  loadEncounterStateMock: vi.fn(),
  saveEncounterStateMock: vi.fn(),
  getDerivedCharacterMock: vi.fn(),
  createSeededRngMock: vi.fn(),
  getWorldRuntimeMock: vi.fn()
}))

vi.mock('../../../server/utils/encounter-persistence', () => ({
  loadEncounterEntity: loadEncounterEntityMock,
  loadEncounterState: loadEncounterStateMock,
  saveEncounterState: saveEncounterStateMock,
  createEncounter: vi.fn()
}))

vi.mock('../../../server/utils/character-derived', () => ({
  getDerivedCharacter: getDerivedCharacterMock
}))

vi.mock('../../../app/lib/rules/rng', () => ({
  createSeededRng: createSeededRngMock
}))

// encounter-view.ts (real, unmocked -- these tests want its actual
// turnOrder/currentCombatant computation exercised) resolves combatant
// TITLES through entity-factory's dxFetch directly, and the condition
// catalog through world-runtime-service's getWorldRuntime. Neither is what
// this file is testing, so a canned/unconfigured response is enough.
vi.mock('../../../server/utils/entity-factory', () => ({
  dxFetch: vi.fn().mockResolvedValue({ data: [] })
}))

vi.mock('../../../server/utils/world-runtime-service', () => ({
  getWorldRuntime: getWorldRuntimeMock
}))

import { applyEncounterAction } from '../../../server/utils/encounter-actions'
import { emptyEncounterState, joinEncounter, type StoredEncounterState } from '../../../app/lib/encounters/encounter'

const ENTITY = { id: '7', worldId: '5', title: 'Goblin Ambush' }

function derivedWithDexMod(mod: number) {
  return {
    available: true,
    derived: { byCategory: { 'core.abilities': [{ id: 'value:ability.dex.mod', value: mod }] } }
  }
}

function mockRoll(value: number) {
  // rollInitiative computes `nextInt(20)+1` -- to force a roll of V,
  // nextInt must return V-1, mirroring character-combat.test.ts's own
  // convention exactly.
  createSeededRngMock.mockReturnValue({ next: () => 0, nextInt: () => value - 1 })
}

beforeEach(() => {
  loadEncounterEntityMock.mockReset()
  loadEncounterStateMock.mockReset()
  saveEncounterStateMock.mockReset()
  getDerivedCharacterMock.mockReset()
  createSeededRngMock.mockReset()
  getWorldRuntimeMock.mockReset()

  loadEncounterEntityMock.mockResolvedValue(ENTITY)
  loadEncounterStateMock.mockResolvedValue(emptyEncounterState())
  saveEncounterStateMock.mockImplementation(async (_id: unknown, state: StoredEncounterState) => state)
  getDerivedCharacterMock.mockResolvedValue(derivedWithDexMod(2))
  getWorldRuntimeMock.mockResolvedValue({ configured: false })
  mockRoll(15)
})

describe('applyEncounterAction -- join', () => {
  it('rolls initiative (1d20 + Dexterity modifier) when none is supplied', async () => {
    mockRoll(15) // 15 + 2 dex mod = 17
    const result = await applyEncounterAction('5', '7', { type: 'join', characterId: '1' })
    expect(result.ok).toBe(true)
    if (!result.ok) return

    expect(result.encounter.turnOrder).toEqual([
      expect.objectContaining({ characterId: '1', initiative: 17 })
    ])
  })

  it('uses a manually supplied initiative instead of rolling', async () => {
    const result = await applyEncounterAction('5', '7', { type: 'join', characterId: '1', initiative: 99 })
    expect(result.ok).toBe(true)
    if (!result.ok) return

    expect(result.encounter.turnOrder[0]).toMatchObject({ characterId: '1', initiative: 99 })
    expect(createSeededRngMock).not.toHaveBeenCalled()
  })

  it('the first joiner becomes the current turn', async () => {
    const result = await applyEncounterAction('5', '7', { type: 'join', characterId: '1', initiative: 5 })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.encounter.currentCombatant?.characterId).toBe('1')
  })

  it('defaults the Dexterity modifier to 0 when the Rules Engine is unavailable, rather than failing', async () => {
    getDerivedCharacterMock.mockResolvedValue({ available: false, reason: 'rules-unconfigured', message: 'no package' })
    mockRoll(10)

    const result = await applyEncounterAction('5', '7', { type: 'join', characterId: '1' })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.encounter.turnOrder[0]?.initiative).toBe(10) // 10 + 0
  })

  it('reports character-not-found when auto-rolling for a character that does not exist', async () => {
    getDerivedCharacterMock.mockResolvedValueOnce({ available: false, reason: 'character-not-found' })

    const result = await applyEncounterAction('5', '7', { type: 'join', characterId: '999' })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.reason).toBe('character-not-found')
    expect(saveEncounterStateMock).not.toHaveBeenCalled()
  })

  it('persists the joined combatant', async () => {
    await applyEncounterAction('5', '7', { type: 'join', characterId: '1', initiative: 10 })
    expect(saveEncounterStateMock).toHaveBeenCalledWith('7', expect.objectContaining({
      combatants: [{ characterId: '1', initiative: 10, conditions: [] }]
    }))
  })
})

describe('applyEncounterAction -- leave', () => {
  it('removes the combatant', async () => {
    loadEncounterStateMock.mockResolvedValue(joinEncounter(emptyEncounterState(), '1', 10))

    const result = await applyEncounterAction('5', '7', { type: 'leave', characterId: '1' })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.encounter.turnOrder).toEqual([])
  })

  it('is a no-op (not an error) for a character not in the encounter -- mirrors the pure module', async () => {
    const result = await applyEncounterAction('5', '7', { type: 'leave', characterId: 'ghost' })
    expect(result.ok).toBe(true)
  })
})

describe('applyEncounterAction -- set-initiative', () => {
  it('overrides a combatant\'s initiative', async () => {
    loadEncounterStateMock.mockResolvedValue(joinEncounter(emptyEncounterState(), '1', 5))

    const result = await applyEncounterAction('5', '7', { type: 'set-initiative', characterId: '1', initiative: 25 })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.encounter.turnOrder[0]).toMatchObject({ characterId: '1', initiative: 25 })
  })

  it('reports not-in-encounter for a character who never joined', async () => {
    const result = await applyEncounterAction('5', '7', { type: 'set-initiative', characterId: 'ghost', initiative: 10 })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.reason).toBe('not-in-encounter')
  })
})

describe('applyEncounterAction -- advance / previous', () => {
  it('advances to the next combatant', async () => {
    let s = joinEncounter(emptyEncounterState(), 'a', 20)
    s = joinEncounter(s, 'b', 10)
    loadEncounterStateMock.mockResolvedValue(s)

    const result = await applyEncounterAction('5', '7', { type: 'advance' })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.encounter.currentCombatant?.characterId).toBe('b')
  })

  it('steps back to the previous combatant', async () => {
    let s = joinEncounter(emptyEncounterState(), 'a', 20)
    s = joinEncounter(s, 'b', 10)
    s = { ...s, currentTurnCharacterId: 'b' }
    loadEncounterStateMock.mockResolvedValue(s)

    const result = await applyEncounterAction('5', '7', { type: 'previous' })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.encounter.currentCombatant?.characterId).toBe('a')
  })
})

describe('applyEncounterAction -- end', () => {
  it('ends the encounter', async () => {
    loadEncounterStateMock.mockResolvedValue(joinEncounter(emptyEncounterState(), '1', 10))

    const result = await applyEncounterAction('5', '7', { type: 'end' })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.encounter.status).toBe('ended')
  })

  it('blocks every other action once ended', async () => {
    loadEncounterStateMock.mockResolvedValue({ ...joinEncounter(emptyEncounterState(), '1', 10), status: 'ended' })

    const result = await applyEncounterAction('5', '7', { type: 'advance' })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.reason).toBe('encounter-ended')
  })
})

describe('applyEncounterAction -- apply-condition / remove-condition / tick-condition', () => {
  it('applies a condition to a combatant', async () => {
    loadEncounterStateMock.mockResolvedValue(joinEncounter(emptyEncounterState(), '1', 10))

    const result = await applyEncounterAction('5', '7', {
      type: 'apply-condition', characterId: '1', conditionId: 'poisoned', duration: 3, source: 'Giant Spider'
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.encounter.turnOrder[0]?.conditions).toEqual([
      { id: 'condition-1', conditionId: 'poisoned', label: 'poisoned', duration: 3, source: 'Giant Spider' }
    ])
  })

  it('reports not-in-encounter when applying to a character who never joined', async () => {
    const result = await applyEncounterAction('5', '7', { type: 'apply-condition', characterId: 'ghost', conditionId: 'poisoned' })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.reason).toBe('not-in-encounter')
  })

  it('reports invalid-condition for an empty conditionId', async () => {
    loadEncounterStateMock.mockResolvedValue(joinEncounter(emptyEncounterState(), '1', 10))

    const result = await applyEncounterAction('5', '7', { type: 'apply-condition', characterId: '1', conditionId: '  ' })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.reason).toBe('invalid-condition')
  })

  it('removes a condition', async () => {
    let s = joinEncounter(emptyEncounterState(), '1', 10)
    s = { ...s, combatants: [{ ...s.combatants[0]!, conditions: [{ id: 'condition-1', conditionId: 'poisoned', duration: null }] }] }
    loadEncounterStateMock.mockResolvedValue(s)

    const result = await applyEncounterAction('5', '7', { type: 'remove-condition', characterId: '1', conditionInstanceId: 'condition-1' })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.encounter.turnOrder[0]?.conditions).toEqual([])
  })

  it('reports condition-not-found for an unmatched condition instance id', async () => {
    loadEncounterStateMock.mockResolvedValue(joinEncounter(emptyEncounterState(), '1', 10))

    const result = await applyEncounterAction('5', '7', { type: 'remove-condition', characterId: '1', conditionInstanceId: 'condition-99' })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.reason).toBe('condition-not-found')
  })

  it('ticks a condition\'s duration', async () => {
    let s = joinEncounter(emptyEncounterState(), '1', 10)
    s = { ...s, combatants: [{ ...s.combatants[0]!, conditions: [{ id: 'condition-1', conditionId: 'poisoned', duration: 3 }] }] }
    loadEncounterStateMock.mockResolvedValue(s)

    const result = await applyEncounterAction('5', '7', { type: 'tick-condition', characterId: '1', conditionInstanceId: 'condition-1', delta: -1 })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.encounter.turnOrder[0]?.conditions[0]?.duration).toBe(2)
  })

  it('reports condition-not-found when ticking an unmatched condition', async () => {
    loadEncounterStateMock.mockResolvedValue(joinEncounter(emptyEncounterState(), '1', 10))

    const result = await applyEncounterAction('5', '7', { type: 'tick-condition', characterId: '1', conditionInstanceId: 'condition-99', delta: -1 })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.reason).toBe('condition-not-found')
  })

  it('condition actions are blocked once the encounter has ended', async () => {
    let s = joinEncounter(emptyEncounterState(), '1', 10)
    s = { ...s, status: 'ended' }
    loadEncounterStateMock.mockResolvedValue(s)

    const result = await applyEncounterAction('5', '7', { type: 'apply-condition', characterId: '1', conditionId: 'poisoned' })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.reason).toBe('encounter-ended')
  })
})

describe('applyEncounterAction -- encounter existence', () => {
  it('reports encounter-not-found without touching state storage', async () => {
    loadEncounterEntityMock.mockResolvedValue(null)

    const result = await applyEncounterAction('5', '999', { type: 'advance' })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.reason).toBe('encounter-not-found')
    expect(loadEncounterStateMock).not.toHaveBeenCalled()
  })
})
