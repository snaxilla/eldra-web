// Encounter Actions -- the Encounter Management System's mutation
// orchestrator.
//
// Composes exactly the same shape every other gameplay-mutation server util
// does -- encounter-persistence.ts (load/save the encounter's own entity +
// state block), getDerivedCharacter (a joining combatant's Dexterity
// modifier, for auto-rolled initiative), app/lib/rules/rng.ts (the die
// roll), and the pure functions in app/lib/encounters/encounter.ts -- and
// adds no new concept beyond "read current state, ask the Rules Engine for
// the one number Join needs, apply a pure function, persist the result."
// Exactly the shape server/utils/character-recovery.ts already is, one
// aggregate over: read -> ask the engine -> mutate purely -> persist.
//
// ---------------------------------------------------------------------------
// COMBAT RESOLUTION IS NOT DUPLICATED HERE
// ---------------------------------------------------------------------------
// This module never rolls an attack, evaluates an Attack Bonus/Armor Class/
// Save DC, or applies damage -- server/utils/character-combat.ts already
// owns all three, unchanged, and is reused verbatim by the Character Sheet's
// existing Resolve control (CharacterActionsPanel.vue), which this task does
// not touch. The ONE die this module rolls (initiative, on Join) is a
// DIFFERENT roll than anything Combat Resolution performs, using the same
// primitive (`createSeededRng`) for the same reason character-combat.ts's
// own header already gives: no RollSpec exists for it, and the seeded RNG is
// the one primitive that fits without redesigning anything.
//
// ---------------------------------------------------------------------------
// INITIATIVE GENERATION DEGRADES GRACEFULLY; COMBAT RESOLUTION DOES NOT
// ---------------------------------------------------------------------------
// A deliberate difference from character-recovery.ts's own posture (which
// fails outright when the Rules Engine has nothing to offer): a World may
// legitimately run an Encounter before any Rules Package is activated (this
// task's own scope is bookkeeping, not rules-dependent), so a joining
// combatant whose Dexterity modifier is unavailable rolls with a modifier of
// 0 rather than blocking the join entirely. This is a presentation-adjacent
// convenience number, not HP math -- getting it approximately right when the
// engine is unavailable is preferable to refusing to let combat start.
//
// ---------------------------------------------------------------------------
// CONDITIONS ARE NEVER VALIDATED AGAINST THE RULES PACKAGE AT WRITE TIME
// ---------------------------------------------------------------------------
// Character Conditions System addition: `apply-condition`/`remove-condition`/
// `tick-condition` are ALL pure state mutations (app/lib/encounters/encounter.ts's
// own new functions), with no Rules Engine call in this module at all --
// unlike Join, which needs the engine for an auto-rolled Dexterity modifier.
// A `conditionId` is accepted as any non-empty string and stored verbatim,
// never checked against the active Rules Package's `table:conditions.catalog`
// (packages/eldra-dnd5e-2024/definitions.json). Two reasons, both already
// established elsewhere in this codebase: (1) Initiative's own graceful
// degradation above already means an Encounter must keep working with no
// Rules Package active at all, and a hard validation gate here would
// contradict that; (2) Inventory's own "an unresolved reference is SHOWN,
// never rejected" posture (character-assembly.ts's `resolveInventory`) is
// the precedent for exactly this situation -- catalog resolution belongs to
// the READ side (server/utils/encounter-view.ts attaches a label when it
// can), not a write-time gate that would block a DM from typing "Prone" the
// moment before a Rules Package happens to be configured.

import { randomBytes } from 'node:crypto'
import {
  advanceTurn,
  applyCondition,
  emptyEncounterState,
  endEncounter,
  joinEncounter,
  leaveEncounter,
  previousTurn,
  removeCondition,
  setInitiative,
  tickConditionDuration,
  type StoredEncounterState
} from '../../app/lib/encounters/encounter'
import { getDerivedCharacter } from './character-derived'
import { createEncounter, loadEncounterEntity, loadEncounterState, saveEncounterState, type EncounterEntity } from './encounter-persistence'
import { buildEncounterView, type EncounterView } from './encounter-view'
import { createSeededRng } from '../../app/lib/rules/rng'

export type EncounterAction =
  | { type: 'join'; characterId: string; initiative?: number }
  | { type: 'leave'; characterId: string }
  | { type: 'set-initiative'; characterId: string; initiative: number }
  | { type: 'advance' }
  | { type: 'previous' }
  | { type: 'end' }
  | { type: 'apply-condition'; characterId: string; conditionId: string; duration?: number | null; source?: string }
  | { type: 'remove-condition'; characterId: string; conditionInstanceId: string }
  | { type: 'tick-condition'; characterId: string; conditionInstanceId: string; delta: number }

export type EncounterActionResult =
  | { ok: true; encounter: EncounterView }
  | {
      ok: false
      reason:
        | 'encounter-not-found' | 'character-not-found' | 'not-in-encounter' | 'encounter-ended'
        | 'invalid-initiative' | 'condition-not-found' | 'invalid-condition'
      message: string
    }

const DEX_MOD_ID = 'value:ability.dex.mod'

function findNumber(byCategory: Record<string, Array<{ id: string; value?: unknown }>>, id: string): number | undefined {
  for (const entries of Object.values(byCategory)) {
    const entry = entries.find((candidate) => candidate.id === id)
    if (entry) return typeof entry.value === 'number' ? entry.value : undefined
  }
  return undefined
}

// 1d20 + Dexterity modifier -- the RAW 2024 initiative roll. `seed` mirrors
// character-combat.ts's own default: a fresh, server-generated one unless a
// caller (a test) pins one down. Takes the already-fetched
// `getDerivedCharacter` result rather than fetching it itself -- the join
// branch below needs that same result FIRST anyway, to tell a genuinely
// missing character apart from one the Rules Engine simply has no numbers
// for yet, and fetching it twice would risk the two calls disagreeing.
function rollInitiative(
  derived: Awaited<ReturnType<typeof getDerivedCharacter>>,
  seed: string
): number {
  const dexMod = derived.available ? findNumber(derived.derived.byCategory, DEX_MOD_ID) ?? 0 : 0

  const rng = createSeededRng(seed)
  const roll = rng.nextInt(20) + 1
  return roll + dexMod
}

// The canonical entry point for every mutation. `seed` is accepted only so
// a test can pin the initiative roll down, exactly the same reason
// character-combat.ts's own `resolveCombatAction` accepts one.
export async function applyEncounterAction(
  worldId: string | number,
  encounterId: string | number,
  action: EncounterAction,
  seed: string = randomBytes(16).toString('hex')
): Promise<EncounterActionResult> {
  const entity = await loadEncounterEntity(worldId, encounterId)
  if (!entity) {
    return { ok: false, reason: 'encounter-not-found', message: 'Encounter not found in this world' }
  }

  const current = (await loadEncounterState(encounterId)) ?? emptyEncounterState()

  if (current.status === 'ended' && action.type !== 'end') {
    return { ok: false, reason: 'encounter-ended', message: 'This encounter has already ended' }
  }

  let next: StoredEncounterState

  switch (action.type) {
    case 'join': {
      let initiative = action.initiative
      if (initiative === undefined) {
        const derived = await getDerivedCharacter(worldId, action.characterId)
        if (!derived.available && derived.reason === 'character-not-found') {
          return { ok: false, reason: 'character-not-found', message: 'Character not found in this world' }
        }
        initiative = rollInitiative(derived, seed)
      } else if (!Number.isFinite(initiative)) {
        return { ok: false, reason: 'invalid-initiative', message: 'Initiative must be a number' }
      }
      next = joinEncounter(current, action.characterId, initiative)
      break
    }

    case 'leave':
      next = leaveEncounter(current, action.characterId)
      break

    case 'set-initiative': {
      if (!current.combatants.some((c) => c.characterId === action.characterId)) {
        return { ok: false, reason: 'not-in-encounter', message: 'This character is not in the encounter' }
      }
      if (!Number.isFinite(action.initiative)) {
        return { ok: false, reason: 'invalid-initiative', message: 'Initiative must be a number' }
      }
      next = setInitiative(current, action.characterId, action.initiative)
      break
    }

    case 'advance':
      next = advanceTurn(current)
      break

    case 'previous':
      next = previousTurn(current)
      break

    case 'end':
      next = current.status === 'ended' ? current : endEncounter(current)
      break

    case 'apply-condition': {
      if (!current.combatants.some((c) => c.characterId === action.characterId)) {
        return { ok: false, reason: 'not-in-encounter', message: 'This character is not in the encounter' }
      }
      if (!action.conditionId.trim()) {
        return { ok: false, reason: 'invalid-condition', message: 'conditionId is required' }
      }
      next = applyCondition(current, action.characterId, action.conditionId, {
        duration: action.duration,
        source: action.source
      })
      break
    }

    case 'remove-condition': {
      const combatant = current.combatants.find((c) => c.characterId === action.characterId)
      if (!combatant) {
        return { ok: false, reason: 'not-in-encounter', message: 'This character is not in the encounter' }
      }
      if (!combatant.conditions.some((c) => c.id === action.conditionInstanceId)) {
        return { ok: false, reason: 'condition-not-found', message: 'This condition is not active on this combatant' }
      }
      next = removeCondition(current, action.characterId, action.conditionInstanceId)
      break
    }

    case 'tick-condition': {
      const combatant = current.combatants.find((c) => c.characterId === action.characterId)
      if (!combatant) {
        return { ok: false, reason: 'not-in-encounter', message: 'This character is not in the encounter' }
      }
      if (!combatant.conditions.some((c) => c.id === action.conditionInstanceId)) {
        return { ok: false, reason: 'condition-not-found', message: 'This condition is not active on this combatant' }
      }
      if (!Number.isFinite(action.delta)) {
        return { ok: false, reason: 'invalid-condition', message: 'delta must be a number' }
      }
      next = tickConditionDuration(current, action.characterId, action.conditionInstanceId, action.delta)
      break
    }

    default: {
      const exhaustive: never = action
      return exhaustive
    }
  }

  const saved = await saveEncounterState(encounterId, next)
  const view = await buildEncounterView(worldId, entity as EncounterEntity, saved)

  return { ok: true, encounter: view }
}

// Re-exported for the create route -- a thin passthrough, not a second
// concept: creating an Encounter is not a mutation of an EXISTING one, so it
// does not belong in the EncounterAction union above (which all assume an
// encounterId that already resolves).
export { createEncounter }
