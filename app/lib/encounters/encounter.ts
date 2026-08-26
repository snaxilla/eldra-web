// Encounter -- the Encounter Management System's stored state.
//
// Shaped like the app/lib/characters/*.ts family (health.ts in particular):
// pure, re-validated on read rather than trusted, and computing no Rules
// Engine value. Health tracks one character's own numbers; an Encounter
// tracks a battle's own bookkeeping -- who is in it, their initiative, whose
// turn it is, and which round this is. Nothing here rolls a die, evaluates
// an Attack Bonus, or applies damage -- Combat Resolution
// (server/utils/character-combat.ts) already owns all of that, unchanged
// and reused verbatim; this module owns none of it.
//
// ---------------------------------------------------------------------------
// AN ENCOUNTER IS ITS OWN ENTITY, NOT A CHARACTER BLOCK
// ---------------------------------------------------------------------------
// Every block in the app/lib/characters/ family belongs to ONE character
// entity. An Encounter belongs to no character -- it is its own `entities`
// row (`entity_type: 'encounter'`, server/utils/entity-factory.ts's already-
// generic `createEntityRecord`, no schema change), carrying its own single
// `encounter_state` block (server/utils/encounter-persistence.ts), the exact
// same block_instances pattern every character block already uses, one
// level up.
//
// ---------------------------------------------------------------------------
// CURRENT TURN IS TRACKED BY IDENTITY, NEVER BY ARRAY INDEX
// ---------------------------------------------------------------------------
// "Combatants may join after combat begins" (this task's own INITIATIVE
// section) means the turn order can be recomputed at any moment with a
// combatant inserted anywhere in it. An index into that recomputed order
// would silently point at the WRONG combatant the moment someone joins
// ahead of the current position. `currentTurnCharacterId` names WHO is
// acting, not WHERE they sit -- immune to the list being resorted around
// them. Every function below that needs "where is the current turn in the
// order" (advanceTurn, previousTurn, leaveEncounter) recomputes the order
// fresh and looks the id up in it, rather than trusting a stored position.
//
// ---------------------------------------------------------------------------
// TURN ORDER IS COMPUTED, NEVER STORED
// ---------------------------------------------------------------------------
// `computeTurnOrder` sorts combatants by initiative descending on every
// call -- there is no separate "order" array to keep in sync with
// initiative values, which is what "Reordering" (this task's own INITIATIVE
// section) means in practice: override a combatant's initiative and the
// order changes as a direct consequence, never a second edit.
//
// `Array.prototype.sort` has been a STABLE sort (ties keep their original
// relative position) since ES2019, in every engine this codebase runs on --
// so combatants tied on initiative keep their join order automatically,
// which is this module's answer to "Tie handling": the array's own
// insertion order (append-only; see joinEncounter) IS the tiebreak, with no
// separate field needed to express it.

export type StoredCombatant = {
  characterId: string
  initiative: number
}

export type EncounterStatus = 'active' | 'ended'

export type StoredEncounterState = {
  status: EncounterStatus
  round: number
  // `null` only when there are no combatants yet (before the first Join).
  currentTurnCharacterId: string | null
  combatants: StoredCombatant[]
}

export function emptyEncounterState(): StoredEncounterState {
  return { status: 'active', round: 1, currentTurnCharacterId: null, combatants: [] }
}

function nonNegativeInt(value: unknown, fallback = 0): number {
  const parsed = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(parsed)) return fallback
  const whole = Math.trunc(parsed)
  return whole < 0 ? fallback : whole
}

// Initiative is a signed integer (a low Dexterity modifier can make it
// negative) -- unlike hit points or a round counter, there is no floor at
// zero here.
function initiativeNumber(value: unknown, fallback = 0): number {
  const parsed = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(parsed) ? Math.trunc(parsed) : fallback
}

// Re-validated on read, never trusted -- the same posture every module in
// the app/lib/characters/ family already takes. A malformed COMBATANT is
// dropped rather than failing the whole record (mirrors
// normalizeStoredInventory's identical choice for one bad item); a
// malformed ENVELOPE still returns null.
export function normalizeStoredEncounterState(value: unknown): StoredEncounterState | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null

  const input = value as Record<string, unknown>
  if (!Array.isArray(input.combatants)) return null

  const combatants: StoredCombatant[] = []
  const seen = new Set<string>()

  for (const raw of input.combatants) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) continue
    const record = raw as Record<string, unknown>
    const characterId = typeof record.characterId === 'string' ? record.characterId.trim() : ''
    if (!characterId || seen.has(characterId)) continue
    seen.add(characterId)
    combatants.push({ characterId, initiative: initiativeNumber(record.initiative) })
  }

  const status: EncounterStatus = input.status === 'ended' ? 'ended' : 'active'
  const round = Math.max(1, nonNegativeInt(input.round, 1))

  const currentTurnCharacterId =
    typeof input.currentTurnCharacterId === 'string' && combatants.some((c) => c.characterId === input.currentTurnCharacterId)
      ? input.currentTurnCharacterId
      : null

  return { status, round, currentTurnCharacterId, combatants }
}

// ---------------------------------------------------------------------------
// Turn order -- computed, never stored. See this file's own header.
// ---------------------------------------------------------------------------

export function computeTurnOrder(state: StoredEncounterState): StoredCombatant[] {
  return [...state.combatants].sort((a, b) => b.initiative - a.initiative)
}

// ---------------------------------------------------------------------------
// Mutations -- pure, total, and the only place this shape changes. Every one
// returns a NEW state rather than mutating in place, the same discipline
// inventory.ts's own "Mutations" section and health.ts's own "Recovery"
// section already establish.
// ---------------------------------------------------------------------------

// A no-op (returns the same combatants, by value) when this character is
// already a combatant -- refuses rather than creating a duplicate entry, the
// same "an item with no identity is not an item" refusal
// addInventoryItem already models for its own invalid input.
export function joinEncounter(
  state: StoredEncounterState,
  characterId: string,
  initiative: number
): StoredEncounterState {
  if (state.combatants.some((c) => c.characterId === characterId)) return { ...state }

  const combatants = [...state.combatants, { characterId, initiative: initiativeNumber(initiative) }]
  // The first combatant to join starts the encounter's turn order; every
  // later joiner does not disturb whichever combatant already has the turn.
  const currentTurnCharacterId = state.currentTurnCharacterId ?? characterId

  return { ...state, combatants, currentTurnCharacterId }
}

export function leaveEncounter(state: StoredEncounterState, characterId: string): StoredEncounterState {
  const wasCurrent = state.currentTurnCharacterId === characterId
  const combatants = state.combatants.filter((c) => c.characterId !== characterId)

  if (!wasCurrent) return { ...state, combatants }
  if (!combatants.length) return { ...state, combatants, currentTurnCharacterId: null }

  // The departing combatant held the turn -- hand it to whoever was NEXT in
  // the order they were just removed from (wrapping to the first if they
  // were last). Every other combatant's relative order is unaffected by one
  // removal, so the pre-removal order is the correct one to consult.
  const orderBefore = computeTurnOrder(state)
  const leavingIndex = orderBefore.findIndex((c) => c.characterId === characterId)
  const nextIndex = leavingIndex + 1 >= orderBefore.length ? 0 : leavingIndex + 1
  const currentTurnCharacterId = orderBefore[nextIndex]!.characterId

  return { ...state, combatants, currentTurnCharacterId }
}

// Manual initiative override -- a no-op for a characterId not currently a
// combatant, the same "nothing to change" reading every other keyed mutation
// in this codebase gives an unmatched id. Never touches
// `currentTurnCharacterId`: tracking the turn by IDENTITY (this file's own
// header) means an initiative change can reorder FUTURE turns without ever
// disturbing whose turn it is right now.
export function setInitiative(
  state: StoredEncounterState,
  characterId: string,
  initiative: number
): StoredEncounterState {
  const combatants = state.combatants.map((c) =>
    c.characterId === characterId ? { ...c, initiative: initiativeNumber(initiative) } : c
  )
  return { ...state, combatants }
}

// Advances to the next combatant in the current turn order, incrementing
// `round` when the order wraps past its last combatant. A no-op with no
// combatants (nothing to advance to).
export function advanceTurn(state: StoredEncounterState): StoredEncounterState {
  const order = computeTurnOrder(state)
  if (!order.length) return { ...state }

  const currentIndex = order.findIndex((c) => c.characterId === state.currentTurnCharacterId)
  const nextIndex = currentIndex === -1 ? 0 : currentIndex + 1

  if (nextIndex >= order.length) {
    return { ...state, round: state.round + 1, currentTurnCharacterId: order[0]!.characterId }
  }
  return { ...state, currentTurnCharacterId: order[nextIndex]!.characterId }
}

// The reverse of advanceTurn -- steps back one combatant, decrementing
// `round` when stepping back past the first combatant of a round. Clamped
// at round 1's first combatant: there is nothing before the encounter
// began, so this is a no-op there rather than producing round 0.
export function previousTurn(state: StoredEncounterState): StoredEncounterState {
  const order = computeTurnOrder(state)
  if (!order.length) return { ...state }

  const currentIndex = order.findIndex((c) => c.characterId === state.currentTurnCharacterId)

  if (currentIndex <= 0) {
    if (state.round <= 1) return { ...state }
    return { ...state, round: state.round - 1, currentTurnCharacterId: order[order.length - 1]!.characterId }
  }
  return { ...state, currentTurnCharacterId: order[currentIndex - 1]!.characterId }
}

// Soft-end: `status` flips to 'ended', every other field is left exactly as
// it was at the moment of ending -- an ended encounter is a historical
// record (who fought, in what order, how many rounds), not a deleted one.
export function endEncounter(state: StoredEncounterState): StoredEncounterState {
  return { ...state, status: 'ended' }
}
