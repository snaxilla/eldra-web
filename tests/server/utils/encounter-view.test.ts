// Unit tests for server/utils/encounter-view.ts -- the Encounter Management
// System's read model.
//
// encounter-persistence.ts and entity-factory's dxFetch (the combatant
// title lookup) are mocked at the module boundary -- both independently
// uninteresting here; this file is about the turnOrder/current/next
// COMPUTATION, which is exercised for real.

import { beforeEach, describe, expect, it, vi } from 'vitest'

const { loadEncounterEntityMock, loadEncounterStateMock, dxFetchMock } = vi.hoisted(() => ({
  loadEncounterEntityMock: vi.fn(),
  loadEncounterStateMock: vi.fn(),
  dxFetchMock: vi.fn()
}))

vi.mock('../../../server/utils/encounter-persistence', () => ({
  loadEncounterEntity: loadEncounterEntityMock,
  loadEncounterState: loadEncounterStateMock
}))

vi.mock('../../../server/utils/entity-factory', () => ({
  dxFetch: dxFetchMock
}))

import { getEncounterView } from '../../../server/utils/encounter-view'

const ENTITY = { id: '7', worldId: '5', title: 'Goblin Ambush' }

beforeEach(() => {
  loadEncounterEntityMock.mockReset()
  loadEncounterStateMock.mockReset()
  dxFetchMock.mockReset()

  loadEncounterEntityMock.mockResolvedValue(ENTITY)
  dxFetchMock.mockResolvedValue({ data: [{ id: '1', title: 'Aria' }, { id: '2', title: 'Bram' }] })
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
      combatants: [{ characterId: '1', initiative: 20 }, { characterId: '2', initiative: 15 }]
    })

    const result = await getEncounterView('5', '7')
    expect(result.available).toBe(true)
    if (!result.available) return

    expect(result.encounter.title).toBe('Goblin Ambush')
    expect(result.encounter.round).toBe(2)
    expect(result.encounter.turnOrder).toEqual([
      { characterId: '1', characterTitle: 'Aria', initiative: 20, isCurrentTurn: false },
      { characterId: '2', characterTitle: 'Bram', initiative: 15, isCurrentTurn: true }
    ])
    expect(result.encounter.currentCombatant?.characterId).toBe('2')
  })

  it('computes the next combatant as the one after current, wrapping around', async () => {
    loadEncounterStateMock.mockResolvedValue({
      status: 'active', round: 1, currentTurnCharacterId: '2', // last in order
      combatants: [{ characterId: '1', initiative: 20 }, { characterId: '2', initiative: 15 }]
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
      combatants: [{ characterId: '1', initiative: 10 }]
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
