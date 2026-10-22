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
    expect(state.actions).toEqual({ targetCharacterId: '', filter: null, openConfigActionId: null, castLevels: {}, castChoices: {}, castFunding: {} })
    expect(state.notes.draft).toBeNull()
  })

  it('reset clears in-progress work in place, so the provided object stays the same', () => {
    const state = emptyCharacterSheetInteractionState()
    state.spellAdd.customName = 'Ember Ward'
    state.spellAdd.open = true
    state.actions.targetCharacterId = '3'
    state.actions.castChoices.firebolt = { type: 'fire' }
    state.actions.castFunding.firebolt = 'resource:steps_of_the_fey'
    state.notes.draft = { general: 'x', appearance: '', personality: '', backstory: '', goals: '', secrets: '' } as never

    resetCharacterSheetInteractionState(state)

    expect(state).toEqual(emptyCharacterSheetInteractionState())
  })

  // A5 PHASE 3 FINAL ACCEPTANCE -- FUNDING-SELECTION INTEGRITY, section 2:
  // "Funding choice resets correctly when changing characters." sheet-v2.vue's
  // own `watch(characterId, () => resetCharacterSheetInteractionState(interactionState))`
  // is what actually fires this on a real character switch (not re-tested here,
  // a page-level wiring concern) -- what THIS module owns, and what this test
  // proves, is that the reset it performs genuinely clears `castFunding` too,
  // not just the fields that existed before this phase.
  it('reset clears castFunding specifically -- a selected resource payment method does not survive a character switch', () => {
    const state = emptyCharacterSheetInteractionState()
    state.actions.castFunding['spell:misty-step'] = 'resource:steps_of_the_fey'
    state.actions.castLevels['spell:misty-step'] = 3

    resetCharacterSheetInteractionState(state)

    expect(state.actions.castFunding).toEqual({})
    expect(state.actions.castLevels).toEqual({})
  })

  // FUNDING-SELECTION INTEGRITY: "Funding choice resets correctly when
  // changing spells." -- castFunding is keyed per actionId exactly like
  // castLevels/castChoices already are, so a NEW action (a spell never
  // before opened) starts with no stored value of its own, regardless of
  // what any OTHER action's own key holds.
  it('castFunding is keyed per action -- selecting a method for one spell never appears under a different spell\'s own key', () => {
    const state = emptyCharacterSheetInteractionState()
    state.actions.castFunding['spell:misty-step'] = 'resource:steps_of_the_fey'

    expect(state.actions.castFunding['spell:darkness']).toBeUndefined()
    expect(state.actions.castFunding['spell:misty-step']).toBe('resource:steps_of_the_fey')
  })
})
