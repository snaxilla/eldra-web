// Unit tests for app/components/characters/characterSheetInteractionState.ts
// (Phase 4C interaction continuity across the desktop/companion switch).

import { describe, expect, it } from 'vitest'
import {
  emptyCharacterSheetInteractionState,
  resetCharacterSheetInteractionState
} from '../../../app/components/characters/characterSheetInteractionState'

describe('character sheet interaction state', () => {
  it('starts with every form closed and empty', () => {
    const state = emptyCharacterSheetInteractionState()
    expect(state.spellAdd).toEqual({ open: false, search: '', selectedKey: '', customName: '' })
    expect(state.inventoryAdd.quantity).toBe('1')
    expect(state.actions).toEqual({ targetCharacterId: '', filter: null, openConfigActionId: null, castLevels: {}, castChoices: {} })
    expect(state.notes.draft).toBeNull()
  })

  it('reset clears in-progress work in place, so the provided object stays the same', () => {
    const state = emptyCharacterSheetInteractionState()
    state.spellAdd.customName = 'Ember Ward'
    state.spellAdd.open = true
    state.actions.targetCharacterId = '3'
    state.actions.castChoices.firebolt = { type: 'fire' }
    state.notes.draft = { general: 'x', appearance: '', personality: '', backstory: '', goals: '', secrets: '' } as never

    resetCharacterSheetInteractionState(state)

    expect(state).toEqual(emptyCharacterSheetInteractionState())
  })
})
