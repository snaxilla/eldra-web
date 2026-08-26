// Unit tests for app/lib/encounters/encounter.ts -- the pure Encounter
// model behind the Encounter Management System.
//
// Pure module, nothing to mock. Mirrors health.test.ts's own coverage
// shape: a stored record is re-validated rather than trusted, and every
// mutation is a total, non-mutating function.

import { describe, expect, it } from 'vitest'

import {
  advanceTurn,
  computeTurnOrder,
  emptyEncounterState,
  endEncounter,
  joinEncounter,
  leaveEncounter,
  normalizeStoredEncounterState,
  previousTurn,
  setInitiative,
  type StoredEncounterState
} from '../../../app/lib/encounters/encounter'

function state(overrides: Partial<StoredEncounterState> = {}): StoredEncounterState {
  return { ...emptyEncounterState(), ...overrides }
}

describe('emptyEncounterState', () => {
  it('starts active, at round 1, with no combatants and no current turn', () => {
    expect(emptyEncounterState()).toEqual({
      status: 'active', round: 1, currentTurnCharacterId: null, combatants: []
    })
  })
})

describe('normalizeStoredEncounterState', () => {
  it('returns null for a malformed envelope', () => {
    expect(normalizeStoredEncounterState(null)).toBeNull()
    expect(normalizeStoredEncounterState('nope')).toBeNull()
    expect(normalizeStoredEncounterState({})).toBeNull()
  })

  it('reads back a well-formed record unchanged', () => {
    const stored = { status: 'active', round: 2, currentTurnCharacterId: '1', combatants: [{ characterId: '1', initiative: 15 }] }
    expect(normalizeStoredEncounterState(stored)).toEqual(stored)
  })

  it('drops one malformed combatant without failing the whole record', () => {
    const result = normalizeStoredEncounterState({
      status: 'active', round: 1, currentTurnCharacterId: null,
      combatants: [{ characterId: '1', initiative: 10 }, { initiative: 5 }]
    })
    expect(result?.combatants).toHaveLength(1)
  })

  it('drops a duplicate characterId, keeping the first', () => {
    const result = normalizeStoredEncounterState({
      status: 'active', round: 1, currentTurnCharacterId: null,
      combatants: [{ characterId: '1', initiative: 10 }, { characterId: '1', initiative: 99 }]
    })
    expect(result?.combatants).toEqual([{ characterId: '1', initiative: 10 }])
  })

  it('clamps round to a minimum of 1', () => {
    expect(normalizeStoredEncounterState({ status: 'active', round: -5, currentTurnCharacterId: null, combatants: [] })?.round).toBe(1)
  })

  it('degrades a currentTurnCharacterId that names no real combatant to null', () => {
    const result = normalizeStoredEncounterState({
      status: 'active', round: 1, currentTurnCharacterId: 'ghost', combatants: [{ characterId: '1', initiative: 10 }]
    })
    expect(result?.currentTurnCharacterId).toBeNull()
  })

  it('defaults an unrecognized status to active', () => {
    expect(normalizeStoredEncounterState({ status: 'bogus', round: 1, currentTurnCharacterId: null, combatants: [] })?.status).toBe('active')
  })

  it('preserves negative initiative -- a low Dexterity modifier is legal', () => {
    const result = normalizeStoredEncounterState({
      status: 'active', round: 1, currentTurnCharacterId: null, combatants: [{ characterId: '1', initiative: -3 }]
    })
    expect(result?.combatants[0]?.initiative).toBe(-3)
  })
})

describe('computeTurnOrder', () => {
  it('sorts descending by initiative', () => {
    const s = state({ combatants: [{ characterId: 'a', initiative: 5 }, { characterId: 'b', initiative: 20 }, { characterId: 'c', initiative: 12 }] })
    expect(computeTurnOrder(s).map((c) => c.characterId)).toEqual(['b', 'c', 'a'])
  })

  it('ties keep join order -- stable sort is the tiebreak, no separate field needed', () => {
    const s = state({ combatants: [{ characterId: 'first', initiative: 10 }, { characterId: 'second', initiative: 10 }, { characterId: 'third', initiative: 10 }] })
    expect(computeTurnOrder(s).map((c) => c.characterId)).toEqual(['first', 'second', 'third'])
  })

  it('does not mutate the input state', () => {
    const s = state({ combatants: [{ characterId: 'a', initiative: 1 }, { characterId: 'b', initiative: 9 }] })
    computeTurnOrder(s)
    expect(s.combatants.map((c) => c.characterId)).toEqual(['a', 'b'])
  })
})

describe('joinEncounter', () => {
  it('adds a new combatant', () => {
    const result = joinEncounter(emptyEncounterState(), '1', 15)
    expect(result.combatants).toEqual([{ characterId: '1', initiative: 15 }])
  })

  it('the first joiner becomes the current turn', () => {
    const result = joinEncounter(emptyEncounterState(), '1', 15)
    expect(result.currentTurnCharacterId).toBe('1')
  })

  it('a later joiner does not disturb whose turn it already is', () => {
    const s = joinEncounter(emptyEncounterState(), '1', 5)
    const result = joinEncounter(s, '2', 20) // higher initiative, joins later
    expect(result.currentTurnCharacterId).toBe('1')
  })

  it('is a no-op for a character already in the encounter', () => {
    const s = joinEncounter(emptyEncounterState(), '1', 15)
    const result = joinEncounter(s, '1', 99)
    expect(result.combatants).toEqual([{ characterId: '1', initiative: 15 }])
  })

  it('does not mutate the input state', () => {
    const s = emptyEncounterState()
    joinEncounter(s, '1', 15)
    expect(s.combatants).toEqual([])
  })
})

describe('leaveEncounter', () => {
  it('removes the combatant', () => {
    const s = joinEncounter(joinEncounter(emptyEncounterState(), '1', 15), '2', 10)
    const result = leaveEncounter(s, '2')
    expect(result.combatants.map((c) => c.characterId)).toEqual(['1'])
  })

  it('leaving a non-current combatant does not change whose turn it is', () => {
    const s = joinEncounter(joinEncounter(emptyEncounterState(), '1', 15), '2', 10)
    const result = leaveEncounter(s, '2')
    expect(result.currentTurnCharacterId).toBe('1')
  })

  it('leaving the current combatant hands the turn to the next in order', () => {
    let s = joinEncounter(emptyEncounterState(), 'a', 20) // current
    s = joinEncounter(s, 'b', 10)
    s = joinEncounter(s, 'c', 5)
    const result = leaveEncounter(s, 'a')
    expect(result.currentTurnCharacterId).toBe('b')
  })

  it('leaving the current combatant when they were last in order wraps to the first', () => {
    let s = joinEncounter(emptyEncounterState(), 'a', 20)
    s = joinEncounter(s, 'b', 10)
    s = { ...s, currentTurnCharacterId: 'b' } // b (lowest initiative -> last in order) has the turn
    const result = leaveEncounter(s, 'b')
    expect(result.currentTurnCharacterId).toBe('a')
  })

  it('leaving the only combatant clears the current turn', () => {
    const s = joinEncounter(emptyEncounterState(), '1', 15)
    const result = leaveEncounter(s, '1')
    expect(result.combatants).toEqual([])
    expect(result.currentTurnCharacterId).toBeNull()
  })

  it('is a no-op for a character not in the encounter', () => {
    const s = joinEncounter(emptyEncounterState(), '1', 15)
    const result = leaveEncounter(s, 'ghost')
    expect(result.combatants).toEqual(s.combatants)
  })
})

describe('setInitiative', () => {
  it('overrides a combatant\'s initiative', () => {
    const s = joinEncounter(emptyEncounterState(), '1', 5)
    const result = setInitiative(s, '1', 25)
    expect(result.combatants).toEqual([{ characterId: '1', initiative: 25 }])
  })

  it('never touches currentTurnCharacterId -- reordering does not disturb whose turn it is', () => {
    let s = joinEncounter(emptyEncounterState(), 'a', 5) // current
    s = joinEncounter(s, 'b', 20)
    const result = setInitiative(s, 'a', 1) // now definitely last in order
    expect(result.currentTurnCharacterId).toBe('a')
  })

  it('is a no-op for a character not in the encounter', () => {
    const s = joinEncounter(emptyEncounterState(), '1', 15)
    const result = setInitiative(s, 'ghost', 99)
    expect(result.combatants).toEqual(s.combatants)
  })
})

describe('advanceTurn', () => {
  it('moves to the next combatant in initiative order', () => {
    let s = joinEncounter(emptyEncounterState(), 'a', 20)
    s = joinEncounter(s, 'b', 10)
    const result = advanceTurn(s)
    expect(result.currentTurnCharacterId).toBe('b')
    expect(result.round).toBe(1)
  })

  it('wraps to the first combatant and increments the round after the last', () => {
    let s = joinEncounter(emptyEncounterState(), 'a', 20)
    s = joinEncounter(s, 'b', 10)
    s = { ...s, currentTurnCharacterId: 'b' }
    const result = advanceTurn(s)
    expect(result.currentTurnCharacterId).toBe('a')
    expect(result.round).toBe(2)
  })

  it('is a no-op with no combatants', () => {
    const result = advanceTurn(emptyEncounterState())
    expect(result).toEqual(emptyEncounterState())
  })

  it('does not mutate the input state', () => {
    let s = joinEncounter(emptyEncounterState(), 'a', 20)
    s = joinEncounter(s, 'b', 10)
    const before = { ...s }
    advanceTurn(s)
    expect(s).toEqual(before)
  })
})

describe('previousTurn', () => {
  it('moves to the previous combatant in initiative order', () => {
    let s = joinEncounter(emptyEncounterState(), 'a', 20)
    s = joinEncounter(s, 'b', 10)
    s = { ...s, currentTurnCharacterId: 'b' }
    const result = previousTurn(s)
    expect(result.currentTurnCharacterId).toBe('a')
    expect(result.round).toBe(1)
  })

  it('wraps to the last combatant and decrements the round before the first, when round > 1', () => {
    let s = joinEncounter(emptyEncounterState(), 'a', 20)
    s = joinEncounter(s, 'b', 10)
    s = { ...s, round: 2, currentTurnCharacterId: 'a' }
    const result = previousTurn(s)
    expect(result.currentTurnCharacterId).toBe('b')
    expect(result.round).toBe(1)
  })

  it('is a no-op at round 1\'s first combatant -- nothing precedes the start of the encounter', () => {
    let s = joinEncounter(emptyEncounterState(), 'a', 20)
    s = joinEncounter(s, 'b', 10)
    const result = previousTurn(s) // round 1, currentTurnCharacterId 'a' (first in order)
    expect(result).toEqual(s)
  })

  it('is a no-op with no combatants', () => {
    expect(previousTurn(emptyEncounterState())).toEqual(emptyEncounterState())
  })
})

describe('endEncounter', () => {
  it('sets status to ended, leaving everything else unchanged', () => {
    let s = joinEncounter(emptyEncounterState(), 'a', 20)
    s = { ...s, round: 3 }
    const result = endEncounter(s)
    expect(result.status).toBe('ended')
    expect(result.round).toBe(3)
    expect(result.combatants).toEqual(s.combatants)
  })
})
