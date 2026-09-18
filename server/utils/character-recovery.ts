// Character Recovery -- the orchestrator for the Recovery System's six
// actions (Apply Damage, Apply Healing, Spend Hit Die, Short Rest, Long
// Rest, Reset Death Saves).
//
// Composes exactly the same three modules every other Health-adjacent
// server util does -- character-health.ts (persistence),
// character-derived.ts (the Rules Engine read-model), and the pure
// mutation functions in app/lib/characters/health.ts -- and adds no new
// concept beyond "read current state, ask the Rules Engine for the numbers
// an action needs, apply a pure function, persist the result." No new
// architecture: this is the SAME shape server/utils/character-derived.ts
// itself already is (assembleCharacter -> getWorldRuntime -> evaluate),
// with one more step (a WRITE) at the end.
//
// ---------------------------------------------------------------------------
// WHY THIS FILE, AND NOT app/lib/rules/
// ---------------------------------------------------------------------------
// The Rules Engine (app/lib/rules/**) evaluates; it never mutates or
// persists ActorState, and nothing about that changes here. "The Rules
// Engine determines what should happen" (this task's own DESIGN
// PHILOSOPHY) means exactly what it already means everywhere else in this
// codebase: Maximum HP, a Hit Die's average roll, and how many Hit Dice a
// Long Rest recovers are all `getDerivedCharacter` OUTPUT, read here and
// nowhere computed. Applying that output to stored state -- deciding what
// the NEW `currentHp` is -- is Recovery's own job, performed by the pure
// functions in app/lib/characters/health.ts, exactly the same way
// character-actor-bridge.ts translates facet grants into ActorState
// without either module being "the Rules Engine."
//
// ---------------------------------------------------------------------------
// THREE ACTIONS NEED NO RULES ENGINE AT ALL
// ---------------------------------------------------------------------------
// Damage (temporary HP absorbs, then current HP, floored at zero), Grant
// Temporary HP (replace-if-higher, never additive -- see health.ts's own
// note on `grantTemporaryHp`), and Reset Death Saves need no derived value
// whatsoever. All three work even in a World with no Rules Package
// activated, which is a legal, common state (world-configuration.md
// §10.2). The other four (Heal, Spend Hit Die, Short Rest, Long Rest) all
// need at least Maximum HP to cap against, so they fail informatively
// rather than silently computing a wrong number when no package is active.
//
// ---------------------------------------------------------------------------
// SHORT REST NO LONGER TOUCHES HIT DICE OR HP (Header Cleanup 2.1)
// ---------------------------------------------------------------------------
// Originally a deliberate simplification: 5e's Short Rest, reduced to what
// this package could then express (no spell slot recovery, no class
// features), WAS spending a Hit Die, and both actions called `spendHitDie`
// unchanged, healing by the same deterministic Rules Engine AVERAGE.
//
// Header Cleanup 2.1 makes Spend Hit Die perform a REAL authoritative
// die roll (see "SPEND HIT DIE IS NOW A REAL ROLL" below) -- and a hidden,
// automatic average-roll heal riding along on Short Rest cannot coexist
// with that: the same button-press outcome ("how much did resting heal
// me") cannot mean two different kinds of number depending on which
// button was pressed. Short Rest therefore no longer touches Hit Dice or
// Current HP at all; spending a Hit Die during a Short Rest is now always
// the player's own explicit "Spend Hit Die" click, never automatic. Pact
// Magic recovery (below) is UNCHANGED -- it was never coupled to the
// Hit-Die spend in the first place, only to whether this character is a
// Pact caster.
//
// ---------------------------------------------------------------------------
// LONG REST ALSO CLEARS EXPENDED SPELL SLOTS -- EVERY CASTER, EVERY TYPE
// ---------------------------------------------------------------------------
// RAW: a Long Rest restores all spent Spell Slots, full/half/pact alike, the
// same "no caster type is special-cased" rule the three progression tables
// already follow. Recovery now reads and writes a SECOND stored block for
// this one action (`character-spellcasting.ts`, alongside `character-health.ts`)
// -- still zero Rules Engine mutation, exactly as Health's own writes always
// were; this is state Recovery orchestrates, not state the engine computes.
//
// ---------------------------------------------------------------------------
// SPEND HIT DIE IS NOW A REAL ROLL (Header Cleanup 2.1)
// ---------------------------------------------------------------------------
// Previously: `spendHitDie` healed by `value:hit_points.hit_die_average_roll`,
// a deterministic Rules Engine formula -- never a die roll, never touching
// the canonical Roll System at all (flagged, not silently kept, by Header
// Cleanup 2's own trace). That average is UNCHANGED and still exists (Long
// Rest's own recovery COUNT is a separate formula, `long_rest_hit_dice_
// recovery`, untouched by this), but spending a die individually now rolls
// for real: this module reads the character's Hit Die size and Constitution
// modifier (both already-derived Rules Engine output, the same as every
// other number this file reads) and calls `createHitDieRollEvent`
// (server/utils/roll-events.ts) -- the SAME persisted-and-broadcast
// RollEvent pipeline ability/saving_throw/skill checks already use. The
// roll's own `total` (raw die face + Constitution modifier) becomes the
// amount healed. Two guards run BEFORE any roll is requested, not after:
// no available Hit Die, and already at full Current HP -- in both cases
// there is no roll, no RollEvent, and no Hit Die consumed, matching this
// task's own explicit "a player at full HP must not be able to waste a
// Hit Die" and "zero available -> no roll" requirements. A roll that fails
// (rollFormula rejects the formula) throws before any health mutation is
// computed or persisted, mirroring createDerivedRollEvent's own "throws,
// never a partial write" contract -- Recovery has never had its own
// separate error vocabulary for a roll failure, and inventing one here
// would diverge from how every other roll-producing code path already
// reports this exact failure.

import { assembleCharacter } from './character-assembly'
import { loadCharacterHealth, saveCharacterHealth } from './character-health'
import { loadCharacterSpellcasting, saveCharacterSpellcasting } from './character-spellcasting'
import { getDerivedCharacter } from './character-derived'
import { createHitDieRollEvent } from './roll-events'
import {
  applyDamage,
  applyHealing,
  emptyCharacterHealth,
  grantTemporaryHp,
  resetDeathSaves,
  spendHitDie,
  takeLongRest,
  type StoredCharacterHealth
} from '../../app/lib/characters/health'
import {
  emptyCharacterSpellcasting,
  resetAllSlots
} from '../../app/lib/characters/spellcasting'

export type RecoveryAction =
  | { type: 'damage'; amount: number }
  | { type: 'heal'; amount: number }
  | { type: 'temp-hp'; amount: number }
  | { type: 'spend-hit-die' }
  | { type: 'short-rest' }
  | { type: 'long-rest' }
  | { type: 'reset-death-saves' }

export type RecoveryResult =
  | { ok: true; health: StoredCharacterHealth }
  | { ok: false; reason: 'character-not-found' | 'no-catalogue-selection' | 'rules-unconfigured' | 'rules-broken'; message: string }
  | { ok: false; reason: 'invalid-amount'; message: string }

// Definition IDs this module reads -- named once here, the same "the fixed
// key names the package's own vocabulary declares" posture
// character-actor-bridge.ts already established for
// `abilityValueId`/`EQUIPMENT_COLLECTION_ID`.
const MAX_HP_ID = 'value:hit_points.max'
const HIT_DICE_MAX_ID = 'value:hit_points.hit_dice_max'
const AVERAGE_ROLL_ID = 'value:hit_points.hit_die_average_roll'
const LONG_REST_RECOVERY_ID = 'value:hit_points.long_rest_hit_dice_recovery'
const HIT_DIE_SIZE_ID = 'value:hit_points.hit_die_size'
const CON_MOD_ID = 'value:ability.con.mod'
const PACT_CASTER_ID = 'value:spellcasting.caster_type.pact'

function findNumber(derived: { byCategory: Record<string, Array<{ id: string; value?: unknown }>> }, id: string): number | null {
  for (const entries of Object.values(derived.byCategory)) {
    const entry = entries.find((candidate) => candidate.id === id)
    if (entry) return typeof entry.value === 'number' ? entry.value : null
  }
  return null
}

// Mirrors findNumber exactly, for the one boolean Recovery needs (whether
// this character is a Pact caster) rather than a number.
function findBoolean(derived: { byCategory: Record<string, Array<{ id: string; value?: unknown }>> }, id: string): boolean {
  for (const entries of Object.values(derived.byCategory)) {
    const entry = entries.find((candidate) => candidate.id === id)
    if (entry) return entry.value === true
  }
  return false
}

// Loads whatever `getDerivedCharacter` needs for an action's numbers,
// translating its own three-state result into Recovery's own failure
// shape. Returns `null` for the two actions that need nothing from it --
// see this file's own header on why those two skip this entirely.
type RecoveryFailure = Extract<RecoveryResult, { ok: false }>

async function loadRecoveryNumbers(
  worldId: string | number,
  characterId: string | number
): Promise<
  | {
      ok: true
      maxHp: number
      hitDiceMax: number
      averageRoll: number
      longRestRecovery: number
      hitDieSize: number
      conModifier: number
      isPactCaster: boolean
    }
  | RecoveryFailure
> {
  const result = await getDerivedCharacter(worldId, characterId)

  if (!result.available) {
    if (result.reason === 'character-not-found') {
      return { ok: false, reason: 'character-not-found', message: 'Character not found in this world' }
    }
    return { ok: false, reason: result.reason as 'no-catalogue-selection' | 'rules-unconfigured' | 'rules-broken', message: result.message }
  }

  const maxHp = findNumber(result.derived, MAX_HP_ID)
  const hitDiceMax = findNumber(result.derived, HIT_DICE_MAX_ID)
  const averageRoll = findNumber(result.derived, AVERAGE_ROLL_ID)
  const longRestRecovery = findNumber(result.derived, LONG_REST_RECOVERY_ID)
  // Read for Spend Hit Die's real roll (see this file's header) -- the
  // exact same two Values `value:hit_points.hit_die_average_roll`'s own
  // formula already reads, just not pre-combined into one average here.
  const hitDieSize = findNumber(result.derived, HIT_DIE_SIZE_ID)
  const conModifier = findNumber(result.derived, CON_MOD_ID)

  if (
    maxHp === null || hitDiceMax === null || averageRoll === null || longRestRecovery === null
    || hitDieSize === null || conModifier === null
  ) {
    return {
      ok: false,
      reason: 'rules-broken',
      message: 'This World\'s active Rules Package does not declare the Health values this action needs.'
    }
  }

  // Absent rather than a hard failure when undeclared: a Rules Package with
  // no `spellcasting` category (a non-D&D system, say) simply has no Pact
  // casters, and Recovery should not refuse every rest over a value it
  // does not need for Health.
  const isPactCaster = findBoolean(result.derived, PACT_CASTER_ID)

  return { ok: true, maxHp, hitDiceMax, averageRoll, longRestRecovery, hitDieSize, conModifier, isPactCaster }
}

// The canonical entry point. Loads current health (defaulting to "nothing
// recorded yet" rather than failing -- a character predating the Health
// System can still receive its first recovery action), applies exactly one
// pure mutation, and persists the result.
//
// `rollerUserId` (Header Cleanup 2.1): the authenticated Principal's
// account id, threaded through from the route exactly like every other
// roll-creating write path (createCustomRollEvent/createDerivedRollEvent)
// already requires -- needed only by 'spend-hit-die' (the one action that
// can now create a RollEvent), but required for every call for the same
// reason those two functions require it unconditionally: "who rolled this"
// is never optional once a roll might happen.
export async function applyRecoveryAction(
  worldId: string | number,
  characterId: string | number,
  action: RecoveryAction,
  rollerUserId: string
): Promise<RecoveryResult> {
  // Existence/scope is already checked by the route before this is called;
  // this call additionally confirms the character has a catalogue
  // selection to assemble, the same precondition every other
  // Health-adjacent read requires.
  const assembly = await assembleCharacter(worldId, characterId)
  if (!assembly.available) {
    if (assembly.reason === 'character-not-found') {
      return { ok: false, reason: 'character-not-found', message: 'Character not found in this world' }
    }
    return { ok: false, reason: assembly.reason, message: assembly.message }
  }

  const current = (await loadCharacterHealth(characterId)) ?? emptyCharacterHealth()

  if (action.type === 'damage' || action.type === 'heal' || action.type === 'temp-hp') {
    if (!Number.isFinite(action.amount) || action.amount <= 0) {
      return { ok: false, reason: 'invalid-amount', message: 'Amount must be a positive number' }
    }
  }

  let next: StoredCharacterHealth
  // Set only for 'short-rest' (a Pact caster) and 'long-rest' (everyone) --
  // see this file's header. Every other action leaves spellcasting state
  // completely untouched: no read, no write.
  let resetSpellSlots = false

  switch (action.type) {
    case 'damage':
      next = applyDamage(current, action.amount)
      break

    case 'temp-hp':
      next = grantTemporaryHp(current, action.amount)
      break

    case 'reset-death-saves':
      next = resetDeathSaves(current)
      break

    case 'heal': {
      const numbers = await loadRecoveryNumbers(worldId, characterId)
      if (!numbers.ok) return numbers
      next = applyHealing(current, action.amount, numbers.maxHp)
      break
    }

    case 'spend-hit-die': {
      const numbers = await loadRecoveryNumbers(worldId, characterId)
      if (!numbers.ok) return numbers

      // Guards run BEFORE any roll is requested -- see this file's header.
      // No available Hit Die, or already at full Current HP: no roll, no
      // RollEvent, no consumption. `next` stays the unchanged `current`,
      // the same no-op shape `spendHitDie` itself would produce for either
      // condition (kept there too, as defense-in-depth for any other
      // caller of that pure function).
      if (current.hitDiceSpent >= numbers.hitDiceMax || current.currentHp >= numbers.maxHp) {
        next = { ...current }
        break
      }

      const rolled = await createHitDieRollEvent({
        worldId,
        rollerUserId,
        actorCharacterId: characterId,
        hitDieSize: numbers.hitDieSize,
        conModifier: numbers.conModifier,
        // Fail closed (eldra-roll-system.md §13, restated verbatim by
        // server/api/worlds/[id]/rolls/index.post.ts's own visibility
        // default): an action with no visibility control of its own
        // defaults to the more restrictive state, never the more open one.
        visibility: 'private'
      })

      next = spendHitDie(current, numbers.hitDiceMax, rolled.total, numbers.maxHp)
      break
    }

    case 'short-rest': {
      // No longer spends a Hit Die or heals -- see this file's header
      // ("SHORT REST NO LONGER TOUCHES HIT DICE OR HP"). The only
      // remaining Short-Rest-specific effect is Pact Magic recovery, for a
      // Pact caster only; `loadRecoveryNumbers` is still called because
      // `isPactCaster` comes from the same derived-character read every
      // other action here already requires.
      const numbers = await loadRecoveryNumbers(worldId, characterId)
      if (!numbers.ok) return numbers
      next = { ...current }
      resetSpellSlots = numbers.isPactCaster
      break
    }

    case 'long-rest': {
      const numbers = await loadRecoveryNumbers(worldId, characterId)
      if (!numbers.ok) return numbers
      next = takeLongRest(current, numbers.maxHp, numbers.longRestRecovery)
      resetSpellSlots = true
      break
    }

    default: {
      const exhaustive: never = action
      return exhaustive
    }
  }

  if (resetSpellSlots) {
    const currentSpellcasting = (await loadCharacterSpellcasting(characterId)) ?? emptyCharacterSpellcasting()
    await saveCharacterSpellcasting(characterId, { ...currentSpellcasting, expendedSlots: resetAllSlots() })
  }

  const saved = await saveCharacterHealth(characterId, next)
  return { ok: true, health: saved }
}
