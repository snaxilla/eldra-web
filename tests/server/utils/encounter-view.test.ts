// Unit tests for server/utils/encounter-view.ts -- the Encounter Management
// System's read model.
//
// encounter-persistence.ts, entity-factory's dxFetch (the combatant title
// lookup), and world-runtime-service's getWorldRuntime (the Character
// Conditions System's catalog lookup) are mocked at the module boundary --
// all three independently uninteresting here; this file is about the
// turnOrder/current/next/condition-label-resolution COMPUTATION, which is
// exercised for real.

import { beforeEach, describe, expect, it, vi } from 'vitest'

const { loadEncounterEntityMock, loadEncounterStateMock, dxFetchMock, getWorldRuntimeMock } = vi.hoisted(() => ({
  loadEncounterEntityMock: vi.fn(),
  loadEncounterStateMock: vi.fn(),
  dxFetchMock: vi.fn(),
  getWorldRuntimeMock: vi.fn()
}))

vi.mock('../../../server/utils/encounter-persistence', () => ({
  loadEncounterEntity: loadEncounterEntityMock,
  loadEncounterState: loadEncounterStateMock
}))

vi.mock('../../../server/utils/entity-factory', () => ({
  dxFetch: dxFetchMock
}))

vi.mock('../../../server/utils/world-runtime-service', () => ({
  getWorldRuntime: getWorldRuntimeMock
}))

import { getEncounterView } from '../../../server/utils/encounter-view'

const ENTITY = { id: '7', worldId: '5', title: 'Goblin Ambush' }

// A minimal fake registry -- only `getById` is exercised by this module, so
// only that is faked, mirroring the "only what is actually read" discipline
// every other test in this codebase's own mock objects already follows.
const CONDITION_CATALOG_TABLE = {
  kind: 'table' as const,
  rows: [
    { key: 'poisoned', label: 'Poisoned' },
    { key: 'prone', label: 'Prone' }
  ]
}

function configuredRuntime() {
  return {
    configured: true, ok: true,
    runtime: { registry: { getById: (id: string) => (id === 'table:conditions.catalog' ? CONDITION_CATALOG_TABLE : undefined) } }
  }
}

beforeEach(() => {
  loadEncounterEntityMock.mockReset()
  loadEncounterStateMock.mockReset()
  dxFetchMock.mockReset()
  getWorldRuntimeMock.mockReset()

  loadEncounterEntityMock.mockResolvedValue(ENTITY)
  dxFetchMock.mockResolvedValue({ data: [{ id: '1', title: 'Aria' }, { id: '2', title: 'Bram' }] })
  getWorldRuntimeMock.mockResolvedValue({ configured: false })
})

describe('getEncounterView', () => {
  it('reports encounter-not-found without reading state', async () => {
    loadEncounterEntityMock.mockResolvedValue(null)

    const result = await getEncounterView('5', '999')
    expect(result.available).toBe(false)
    if (result.available) return
    expect(result.reason).toBe('encounter-not-found')
    expect(loadEncounterStateMock).not.toHaveBeenCalled()
  })

  it('resolves combatant titles and marks the current turn', async () => {
    loadEncounterStateMock.mockResolvedValue({
      status: 'active', round: 2, currentTurnCharacterId: '2',
      combatants: [{ characterId: '1', initiative: 20, conditions: [] }, { characterId: '2', initiative: 15, conditions: [] }]
    })

    const result = await getEncounterView('5', '7')
    expect(result.available).toBe(true)
    if (!result.available) return

    expect(result.encounter.title).toBe('Goblin Ambush')
    expect(result.encounter.round).toBe(2)
    expect(result.encounter.turnOrder).toEqual([
      { characterId: '1', characterTitle: 'Aria', initiative: 20, isCurrentTurn: false, conditions: [] },
      { characterId: '2', characterTitle: 'Bram', initiative: 15, isCurrentTurn: true, conditions: [] }
    ])
    expect(result.encounter.currentCombatant?.characterId).toBe('2')
  })

  it('computes the next combatant as the one after current, wrapping around', async () => {
    loadEncounterStateMock.mockResolvedValue({
      status: 'active', round: 1, currentTurnCharacterId: '2', // last in order
      combatants: [{ characterId: '1', initiative: 20, conditions: [] }, { characterId: '2', initiative: 15, conditions: [] }]
    })

    const result = await getEncounterView('5', '7')
    expect(result.available).toBe(true)
    if (!result.available) return
    expect(result.encounter.nextCombatant?.characterId).toBe('1') // wraps to first
  })

  it('a dangling combatant reference (character deleted) degrades to a placeholder title', async () => {
    dxFetchMock.mockResolvedValue({ data: [] })
    loadEncounterStateMock.mockResolvedValue({
      status: 'active', round: 1, currentTurnCharacterId: '1',
      combatants: [{ characterId: '1', initiative: 10, conditions: [] }]
    })

    const result = await getEncounterView('5', '7')
    expect(result.available).toBe(true)
    if (!result.available) return
    expect(result.encounter.turnOrder[0]?.characterTitle).toBe('Character 1')
  })

  it('treats no stored state as an empty encounter, never an error', async () => {
    loadEncounterStateMock.mockResolvedValue(null)

    const result = await getEncounterView('5', '7')
    expect(result.available).toBe(true)
    if (!result.available) return
    expect(result.encounter.turnOrder).toEqual([])
    expect(result.encounter.currentCombatant).toBeNull()
    expect(result.encounter.nextCombatant).toBeNull()
  })
})

describe('getEncounterView -- condition labels (Character Conditions System)', () => {
  it('resolves a recognized conditionId to its catalog label', async () => {
    getWorldRuntimeMock.mockResolvedValue(configuredRuntime())
    loadEncounterStateMock.mockResolvedValue({
      status: 'active', round: 1, currentTurnCharacterId: '1',
      combatants: [{
        characterId: '1', initiative: 10,
        conditions: [{ id: 'condition-1', conditionId: 'poisoned', duration: 3, source: 'Giant Spider' }]
      }]
    })

    const result = await getEncounterView('5', '7')
    expect(result.available).toBe(true)
    if (!result.available) return
    expect(result.encounter.turnOrder[0]?.conditions).toEqual([
      { id: 'condition-1', conditionId: 'poisoned', label: 'Poisoned', duration: 3, source: 'Giant Spider' }
    ])
  })

  it('falls back to the raw conditionId as the label when no Rules Package is active', async () => {
    loadEncounterStateMock.mockResolvedValue({
      status: 'active', round: 1, currentTurnCharacterId: '1',
      combatants: [{ characterId: '1', initiative: 10, conditions: [{ id: 'condition-1', conditionId: 'custom-hexed', duration: null }] }]
    })

    const result = await getEncounterView('5', '7')
    expect(result.available).toBe(true)
    if (!result.available) return
    expect(result.encounter.turnOrder[0]?.conditions[0]).toMatchObject({ conditionId: 'custom-hexed', label: 'custom-hexed' })
  })

  it('exposes the full catalog as availableConditions when a Rules Package is active', async () => {
    getWorldRuntimeMock.mockResolvedValue(configuredRuntime())
    loadEncounterStateMock.mockResolvedValue({ status: 'active', round: 1, currentTurnCharacterId: null, combatants: [] })

    const result = await getEncounterView('5', '7')
    expect(result.available).toBe(true)
    if (!result.available) return
    expect(result.encounter.availableConditions).toEqual(
      expect.arrayContaining([{ id: 'poisoned', label: 'Poisoned' }, { id: 'prone', label: 'Prone' }])
    )
  })

  it('availableConditions is empty when no Rules Package is active', async () => {
    loadEncounterStateMock.mockResolvedValue({ status: 'active', round: 1, currentTurnCharacterId: null, combatants: [] })

    const result = await getEncounterView('5', '7')
    expect(result.available).toBe(true)
    if (!result.available) return
    expect(result.encounter.availableConditions).toEqual([])
  })
})
