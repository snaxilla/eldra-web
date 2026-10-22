// Character Sheet interaction continuity -- Phase 4C.
//
// The V2 sheet renders one of two presentations (desktop / companion, see
// useCharacterSheetPresentation.ts). Crossing between them remounts the
// layout, and with it every panel inside. The player's IN-PROGRESS work in
// those panels must survive that: a half-typed homebrew spell, an inventory
// search, a chosen attack target, a pending cast configuration, an unsaved
// note. This module holds exactly that state.
//
// The page creates one instance and `provide`s it; each panel `inject`s
// its own slice and falls back to a private copy when nothing is provided
// (any other mount point keeps its old, local behaviour). This is plain
// Vue provide/inject -- no store, no persistence: it lives exactly as long
// as the sheet page does, and only in this browser tab.
//
// MEANINGFUL state lives here: user-entered text, selections, open forms,
// pending configurations. DISPOSABLE state (hover, focus rings, tooltip
// and animation state, the roll in flight) stays in the components.

import type { InjectionKey } from 'vue'
import type { StoredCharacterNotes } from '~/lib/characters/character-notes'

export type AddFormInteractionState = {
  open: boolean
  search: string
  selectedKey: string
  customName: string
}

export type InventoryAddInteractionState = AddFormInteractionState & {
  quantity: string
  notes: string
}

export type ActionsInteractionState = {
  targetCharacterId: string
  filter: string | null
  openConfigActionId: string | null
  castLevels: Record<string, number>
  castChoices: Record<string, Record<string, string>>
  // CHARACTER MECHANICS PHASE A5, Phase 3 -- the player's own selected
  // payment method per actionId: `'slot'`, or a resourceId. Mirrors
  // `castLevels`/`castChoices` exactly (a pending, UI-only selection the
  // server independently re-verifies on every real Cast -- see
  // character-cast.ts's own `resolveCastFunding`). Absent means "not yet
  // chosen," distinct from an explicit `'slot'` pick.
  castFunding: Record<string, string>
}

export type NotesInteractionState = {
  // The unsaved draft, or null until the Notes panel first seeds it.
  draft: StoredCharacterNotes | null
}

export type CharacterSheetInteractionState = {
  spellAdd: AddFormInteractionState
  inventoryAdd: InventoryAddInteractionState
  actions: ActionsInteractionState
  notes: NotesInteractionState
}

export const CHARACTER_SHEET_INTERACTION_KEY: InjectionKey<CharacterSheetInteractionState> =
  Symbol('character-sheet-interaction')

export function emptySpellAddState(): AddFormInteractionState {
  return { open: false, search: '', selectedKey: '', customName: '' }
}

export function emptyInventoryAddState(): InventoryAddInteractionState {
  return { open: false, search: '', selectedKey: '', customName: '', quantity: '1', notes: '' }
}

export function emptyActionsState(): ActionsInteractionState {
  return { targetCharacterId: '', filter: null, openConfigActionId: null, castLevels: {}, castChoices: {}, castFunding: {} }
}

export function emptyNotesState(): NotesInteractionState {
  return { draft: null }
}

export function emptyCharacterSheetInteractionState(): CharacterSheetInteractionState {
  return {
    spellAdd: emptySpellAddState(),
    inventoryAdd: emptyInventoryAddState(),
    actions: emptyActionsState(),
    notes: emptyNotesState()
  }
}

// Clears everything in place (a different character opened in the same
// page instance must not inherit the previous one's half-finished work).
export function resetCharacterSheetInteractionState(state: CharacterSheetInteractionState) {
  Object.assign(state, emptyCharacterSheetInteractionState())
}
