// Character Cast -- "cast this prepared spell, authoritatively" (Character
// Sheet Body Phase 1B.2: Authoritative Cast Foundation).
//
// ---------------------------------------------------------------------------
// WHAT THIS MODULE IS, AND WHAT IT DELIBERATELY IS NOT
// ---------------------------------------------------------------------------
// This is a GAMEPLAY COMMAND ("cast spell X"), not a roll helper. The client
// never sends an attack bonus, a spell level, damage dice, a slot cost, or a
// save DC as a trusted fact -- it sends an actionId and (for a leveled
// automatic-damage spell) a visibility, nothing else. Every number this
// module uses is re-derived here, the same way server/utils/character-combat.ts's
// `resolveCombatAction` already re-derives a weapon attack's numbers rather
// than trusting a client-supplied bonus.
//
// Composes the SAME three modules every other authoritative server util
// does: `character-actions.ts` (which prepared spell is this, and what are
// its Rules-Engine-derived attackBonus/spellMechanics -- the prepared-spell
// authority already enforced there, never re-invented here),
// `character-derived.ts` (Spell Slot progression tables, Spellcasting caster
// type), and `character-spellcasting.ts` (the persisted expended-slot
// count). Slot arithmetic itself is never duplicated: `deriveSpellSlotLevels`
// and `expendSlot` are the exact same pure functions
// app/lib/characters/spellcasting.ts already exposes to the client's own
// display and PUT-based mutation path.
//
// ---------------------------------------------------------------------------
// SUPPORTED ARCHETYPES ONLY -- see app/lib/spell-mechanics/cast-capability.ts
// ---------------------------------------------------------------------------
// Five capabilities can be Cast through this module: `supported-spell-attack`
// (Fire Bolt: an untargeted spell attack roll), `supported-automatic-damage`
// (Magic Missile: a damage roll with neither an attack nor a save),
// `supported-save-damage`/`supported-save-context` (Fireball/Hold Person: a
// saving-throw spell, Cast entirely UNTARGETED -- see `castSpellSave`'s own
// header for why this creates no caster d20 and possibly no RollEvent at
// all), and, as of Character Sheet Body Phase 1B.4, `supported-healing`
// (Cure Wounds/Healing Word: an immediate healing roll, Cast performing the
// roll itself with no separate free button -- see `castSpellHeal`'s own
// header). Every other capability (`unsupported-effect`,
// `unsupported-choice`, `unsupported-mechanic`) is rejected with
// `reason: 'not-castable'` -- `classifySpellCastCapability` is the ONE
// predicate this module and CharacterActionsPanel.vue both call, so client
// and server can never independently invent different support rules.
//
// character-combat.ts's existing targeted "Resolve" control (attacker +
// target, target save roll, target HP mutation) is UNTOUCHED by this
// module and by Phase 1B.3 -- it remains real, tested, working
// functionality for whenever a future Encounter system wants to apply a
// Cast against a specific target. This module's own saving-throw path
// answers a narrower, deliberately different question: "what does the
// CASTER'S side of this spell look like right now", never "did the target
// make its save."
//
// ---------------------------------------------------------------------------
// RESOURCE RULE: LEVEL 0 = FREE, LEVEL > 0 = ONE SLOT OF THAT LEVEL
// ---------------------------------------------------------------------------
// A cantrip (`mechanics.level === 0`, e.g. Fire Bolt) costs nothing and is
// always available -- there is no slot pool to check. Any leveled spell
// (`mechanics.level > 0`) requires exactly one slot of that level, verified
// against this character's OWN authoritative Spell Slot progression
// (`deriveSpellSlotLevels`, the identical function the Sheet's own orb
// display already calls) -- never a client-supplied "I have a slot" claim.
// This rule is written once, uniformly, for both supported archetypes: 1B.2's
// only leveled required case is Magic Missile (automatic-damage), but a
// hypothetical leveled attack-roll spell would need the identical resource
// gate, so the gate lives in one shared function rather than being
// special-cased per archetype.
//
// ---------------------------------------------------------------------------
// ORDERING -- WHY ROLL, THEN PERSIST, THEN MUTATE, THEN BROADCAST
// ---------------------------------------------------------------------------
// There are no cross-collection transactions anywhere in this codebase
// (RollEvent rows and the `spellcasting` block_instances row are two
// separate Directus collections/requests) -- this module cannot make Cast
// atomic, only choose the least-bad failure ordering and document the
// residual risk honestly.
//
// For a LEVELED cast, the sequence is:
//   1. Check slot availability (read-only -- no roll, no write yet). If no
//      slot is available, fail here: no roll ever happens, nothing is
//      persisted, nothing is spent.
//   2. Roll the dice locally (`rollFormula` -- deterministic, in-process,
//      effectively cannot fail for the fixed, code-authored expressions this
//      module builds).
//   3. Persist the RollEvent row WITHOUT broadcasting it
//      (`createSpellAttackRollEvent`/`createSpellDamageRollEvent` with
//      `broadcast: false`).
//   4. Mutate and persist the expended-slot count
//      (`loadCharacterSpellcasting` -> pure `expendSlot` -> `saveCharacterSpellcasting`).
//   5. Only once step 4 has succeeded, broadcast the already-persisted roll
//      (`broadcastRollEvent`) and return success.
//
// If step 3 fails (the roll POST itself fails), nothing was spent -- clean
// failure, no residue.
//
// If step 4 fails (the slot-mutation write fails after the roll already
// persisted), this module reports the Cast as FAILED and does NOT broadcast
// -- so no connected client sees a result for a Cast this response tells the
// caster failed, and the caster's own slot was never marked spent (the
// "free spell" outcome this task explicitly calls out is avoided). The
// residual risk this ordering accepts, stated plainly: RollEvents are
// append-only (this codebase has no delete/undo path for one), so that
// roll ROW still exists in storage even though it was never broadcast --
// if a client later fetches roll HISTORY (not realtime) covering that time
// range, the orphaned roll becomes visible then, with no expended slot to
// explain it. This is a known, accepted gap (an orphaned, harmless-looking
// stray row), not a claim of atomicity this module does not have. The
// alternative ordering (mutate the slot first, roll second) was rejected
// because it risks the WORSE outcome this task also names: a player's slot
// is spent with no result at all if the roll step fails after the mutation
// succeeds.
//
// A final broadcast failure (step 5's `broadcastRollEvent` call itself
// throwing) is caught and logged, never surfaced as a Cast failure -- by
// that point the roll is persisted AND the slot is spent, so the Cast has
// genuinely succeeded; a realtime-delivery hiccup must not tell the caster
// their successful cast failed.
//
// ---------------------------------------------------------------------------
// KNOWN, UN-SOLVED RACE: TWO CLIENTS, ONE LAST SLOT
// ---------------------------------------------------------------------------
// `character-spellcasting.ts`'s load-then-save is a plain read-modify-write
// against Directus with no optimistic-concurrency check (no version/etag
// compared on the PATCH). Two simultaneous Casts against the character's
// last slot of a level can both pass step 1's availability check before
// either has written step 4 -- both would then successfully expend, leaving
// `expendedSlots` reflecting only the LAST writer (the first writer's
// increment is silently lost, potentially leaving the count under-spent
// relative to two real casts having happened). This module does not solve
// that race -- doing so would mean adding optimistic concurrency to the
// shared `block_instances` write path used by every other block, a
// cross-cutting change well beyond this phase's scope. It is reported here,
// honestly, as a known limitation: multi-client spell-slot spending is not
// safe against a true simultaneous race today, exactly as it already was not
// safe for the pre-existing client-driven PUT-based expend-slot path this
// module's own resource mutation reuses.

import { createError } from 'h3'
import type { CharacterAction } from './character-actions'
import { getCharacterActions } from './character-actions'
import { getDerivedCharacter } from './character-derived'
import {
  loadCharacterSpellcasting,
  saveCharacterSpellcasting,
  type StoredCharacterSpellcasting
} from './character-spellcasting'
import {
  createSpellAttackRollEvent,
  createSpellDamageRollEvent,
  createSpellHealingRollEvent
} from './roll-events'
import { broadcastRollEvent } from './roll-realtime-bridge'
import {
  classifySpellCastCapability,
  applyResolvedChoicesToDamage,
  legalCastLevelsFor,
  validateSpellChoices,
  type SpellCastCapability,
  type CanonicalSpellMechanics
} from '../../app/lib/spell-mechanics'
import {
  deriveSpellSlotLevels,
  emptyCharacterSpellcasting,
  expendSlot,
  SLOT_TABLE_BY_CASTER_TYPE
} from '../../app/lib/characters/spellcasting'
import type { RollEventRecord, RollVisibility } from '../../app/lib/rolls/types'
import type { AbilityKey } from '../../app/lib/characters/ability-scores'

// ---------------------------------------------------------------------------
// Number/boolean lookups -- restated locally rather than imported, matching
// this codebase's own established split (character-recovery.ts's own
// findNumber/findBoolean are its own private copies too): the tiny id-match
// loop is not the "arithmetic" this task's own "do not duplicate slot-bound
// arithmetic" instruction is about -- deriveSpellSlotLevels/expendSlot
// (imported above, never restated) are.
// ---------------------------------------------------------------------------

type ByCategory = Record<string, Array<{ id: string; value?: unknown }>>

function findNumber(byCategory: ByCategory, id: string): number | undefined {
  for (const entries of Object.values(byCategory)) {
    const entry = entries.find((candidate) => candidate.id === id)
    if (entry) return typeof entry.value === 'number' ? entry.value : undefined
  }
  return undefined
}

function findBoolean(byCategory: ByCategory, id: string): boolean {
  for (const entries of Object.values(byCategory)) {
    const entry = entries.find((candidate) => candidate.id === id)
    if (entry) return entry.value === true
  }
  return false
}

const CHARACTER_LEVEL_ID = 'value:level'
const CASTER_TYPE_IDS = ['full', 'half', 'pact'] as const

// ---------------------------------------------------------------------------
// resolveCastableSpell -- the untargeted, spell-shaped counterpart to
// character-actions.ts's own `resolveAttackAction`. Same posture: look the
// action up by id from `getCharacterActions`'s own list (the SAME prepared-
// spell authority every spell-reading server util already trusts, never a
// second "is this spell available" model), reject anything this phase does
// not support, and return the exact numbers a Cast needs -- never letting a
// caller re-derive them a second, possibly-drifting way.
// ---------------------------------------------------------------------------

export type CastFailureReason =
  | 'character-not-found'
  | 'no-catalogue-selection'
  | 'action-not-found'
  | 'not-castable'
  | 'rules-unavailable'
  | 'resource-unavailable'
  // Character Sheet Body Phase 1B.2.1 (Cast Configuration) additions -- a
  // client-supplied CONFIGURATION input, not a mechanics fact, was invalid.
  // Both 400s: the caller sent something this specific request cannot use,
  // distinct from 'rules-unavailable' (409, the Rules Engine itself has
  // nothing to say) and 'resource-unavailable' (409, a legitimate request
  // for a resource this character has simply run out of).
  | 'invalid-cast-level'
  | 'invalid-choice'

export function statusForCastFailure(reason: CastFailureReason): number {
  switch (reason) {
    case 'character-not-found': return 404
    case 'no-catalogue-selection': return 409
    case 'action-not-found': return 404
    case 'not-castable': return 400
    case 'rules-unavailable': return 409
    case 'resource-unavailable': return 409
    case 'invalid-cast-level': return 400
    case 'invalid-choice': return 400
    default: {
      const exhaustive: never = reason
      return exhaustive
    }
  }
}

type CastableCapability = Extract<SpellCastCapability, {
  kind: 'supported-spell-attack' | 'supported-automatic-damage' | 'supported-save-damage' | 'supported-save-context' | 'supported-healing'
}>

export type CastableSpell = {
  action: CharacterAction
  mechanics: CanonicalSpellMechanics
  capability: CastableCapability
  // Character Sheet Body Phase 1B.2.1 -- the validated `{choiceId:
  // optionId}` map (`{}` when the spell declares no choices), and
  // `mechanics.damage` with any resolved 'damage-type' choice substituted
  // in. Every caller that rolls damage (castSpellAutomaticDamage,
  // rollIndependentSpellDamage) uses THIS, never `mechanics.damage`
  // directly, so a Chromatic-Orb-shaped spell's damage type is resolved in
  // exactly one place regardless of which of the three Cast entry points
  // reached it.
  resolvedChoices: Record<string, string>
  resolvedDamage: CanonicalSpellMechanics['damage']
}

export type ResolveCastableSpellResult =
  | { ok: true; castable: CastableSpell }
  | { ok: false; reason: CastFailureReason; message: string }

async function resolveCastableSpell(
  worldId: string | number,
  characterId: string | number,
  actionId: string,
  choices: Record<string, string> | undefined
): Promise<ResolveCastableSpellResult> {
  const actionsResult = await getCharacterActions(worldId, characterId)
  if (!actionsResult.available) {
    if (actionsResult.reason === 'character-not-found') {
      return { ok: false, reason: 'character-not-found', message: 'Character not found in this world' }
    }
    return { ok: false, reason: 'no-catalogue-selection', message: actionsResult.message }
  }

  const action = actionsResult.actions.find((candidate) => candidate.id === actionId)
  if (!action) {
    return { ok: false, reason: 'action-not-found', message: `No action '${actionId}' on this character` }
  }

  if (action.category !== 'spell') {
    return {
      ok: false,
      reason: 'not-castable',
      message: `'${action.name}' is not a spell -- Cast only supports prepared spells`
    }
  }

  const capability = classifySpellCastCapability({ category: action.category, spellMechanics: action.spellMechanics })

  const isCastableKind = capability?.kind === 'supported-spell-attack'
    || capability?.kind === 'supported-automatic-damage'
    || capability?.kind === 'supported-save-damage'
    || capability?.kind === 'supported-save-context'
    || capability?.kind === 'supported-healing'

  if (!isCastableKind) {
    return {
      ok: false,
      reason: 'not-castable',
      message: `'${action.name}' cannot be Cast authoritatively yet (${capability?.kind ?? 'unsupported-mechanic'}) -- see its Info panel for what it needs`
    }
  }

  // classifySpellCastCapability only returns one of the four `isCastableKind`
  // members when `action.spellMechanics` is genuinely present -- so it is
  // guaranteed non-null/non-undefined here regardless of which one this is.
  const mechanics = action.spellMechanics as CanonicalSpellMechanics
  const castableCapability = capability as CastableCapability

  if (castableCapability.kind === 'supported-spell-attack' && action.attackBonus === undefined) {
    return {
      ok: false,
      reason: 'rules-unavailable',
      message: `This World's active Rules Package does not declare the Spell Attack Bonus '${action.name}' needs`
    }
  }

  // Character Sheet Body Phase 1B.3 -- the identical "Rules Engine has
  // nothing to say" gate `supported-spell-attack` already has above,
  // restated for a saving-throw spell's own required number (Save DC,
  // attached to every spell action uniformly by character-actions.ts's own
  // `getCharacterActions`, unconditionally on resolution kind).
  if (
    (castableCapability.kind === 'supported-save-damage' || castableCapability.kind === 'supported-save-context')
    && action.saveDc === undefined
  ) {
    return {
      ok: false,
      reason: 'rules-unavailable',
      message: `This World's active Rules Package does not declare the Spell Save DC '${action.name}' needs`
    }
  }

  // Character Sheet Body Phase 1B.4 -- the identical gate, restated for
  // healing's own required number, and ONLY when this specific spell's
  // canonical healing actually states it adds one (Prayer of Healing's
  // real RAW text adds none at all -- see SpellRoll.usesSpellcastingModifier's
  // own header -- so it needs no Rules Engine number here to Cast honestly).
  if (
    castableCapability.kind === 'supported-healing'
    && mechanics.healing?.usesSpellcastingModifier
    && action.healingAbilityModifier === undefined
  ) {
    return {
      ok: false,
      reason: 'rules-unavailable',
      message: `This World's active Rules Package does not declare the Spellcasting Ability Modifier '${action.name}' needs`
    }
  }

  // CHOICE AUTHORITY -- the client may submit a choiceId/optionId pair; the
  // server independently verifies the spell actually declares that choice,
  // that the option exists, and that nothing extra/unauthorized was
  // submitted. `validateSpellChoices` (app/lib/spell-mechanics/cast-configuration.ts)
  // is the single function both this module and CharacterActionsPanel.vue's
  // own local Cast-button enablement can call -- only THIS call is
  // authoritative.
  const choiceValidation = validateSpellChoices(mechanics.choices ?? [], choices)
  if (!choiceValidation.ok) {
    return { ok: false, reason: 'invalid-choice', message: choiceValidation.message }
  }

  const resolvedDamage = applyResolvedChoicesToDamage(mechanics.damage, choiceValidation.resolved)

  return {
    ok: true,
    castable: { action, mechanics, capability, resolvedChoices: choiceValidation.resolved, resolvedDamage }
  }
}

// ---------------------------------------------------------------------------
// Spell-slot resource authority -- one function, reused by every leveled
// Cast regardless of capability kind (see this file's own header on why the
// rule is uniform rather than per-archetype).
// ---------------------------------------------------------------------------

type SlotAvailability =
  | { ok: true; max: number; expended: number }
  | { ok: false; reason: 'resource-unavailable'; message: string }
  | { ok: false; reason: 'rules-unavailable'; message: string }
  | { ok: false; reason: 'invalid-cast-level'; message: string }

// `requestedLevel` is whatever `resolveRequestedCastLevel` below decided
// this Cast should use -- the spell's own base level when the client sent
// no explicit `castLevel` (preserving Phase 1B.2's exact prior behavior for
// every existing caller), or a client-CHOSEN higher level, independently
// re-validated here against THIS character's own freshly-loaded Spell Slot
// progression -- never trusted merely because a client-side picker offered
// it as an option.
async function checkSpellSlotAvailability(
  worldId: string | number,
  characterId: string | number,
  requestedLevel: number
): Promise<SlotAvailability> {
  const derived = await getDerivedCharacter(worldId, characterId)
  if (!derived.available) {
    return {
      ok: false,
      reason: 'rules-unavailable',
      message: derived.reason === 'character-not-found' ? 'Character not found in this world' : derived.message
    }
  }

  const byCategory = derived.derived.byCategory
  const casterType = CASTER_TYPE_IDS.find((type) => findBoolean(byCategory, `value:spellcasting.caster_type.${type}`)) ?? null
  const characterLevel = findNumber(byCategory, CHARACTER_LEVEL_ID) ?? 1
  const tableRows = casterType
    ? derived.derived.tables.find((entry) => entry.id === SLOT_TABLE_BY_CASTER_TYPE[casterType])?.rows
    : undefined

  // `expendedSlots: {}` here deliberately reads only `max`/legality from
  // this derivation -- the ACTUAL expended count is read fresh from
  // persistence below, immediately before the mutating write, rather than
  // trusted from this earlier read (see this file's own KNOWN, UN-SOLVED
  // RACE header). `legalCastLevelsFor` is the SAME shared helper
  // CharacterActionsPanel.vue's own Cast Configuration view model calls for
  // display -- one calculation, two readers, never duplicated (this file's
  // own established discipline, e.g. `resolveDamageAbilityModifier` in
  // character-actions.ts).
  const levels = deriveSpellSlotLevels({ casterType, tableRows, characterLevel, expendedSlots: {} })
  const slot = legalCastLevelsFor(requestedLevel, levels).find((entry) => entry.level === requestedLevel)

  if (!slot) {
    return {
      ok: false,
      reason: 'invalid-cast-level',
      message: `This character has no level ${requestedLevel} spell slots according to this World's active Rules Package`
    }
  }

  const maxForLevel = levels.find((entry) => entry.level === requestedLevel)!.max

  const stored = await loadCharacterSpellcasting(characterId)
  const expended = stored?.expendedSlots[String(requestedLevel)] ?? 0

  if (expended >= maxForLevel) {
    return {
      ok: false,
      reason: 'resource-unavailable',
      message: `No level ${requestedLevel} spell slots remaining (${expended}/${maxForLevel} expended)`
    }
  }

  return { ok: true, max: maxForLevel, expended }
}

// ---------------------------------------------------------------------------
// Casting-level resolution -- CASTING LEVEL IS SPECIAL
// ---------------------------------------------------------------------------
// The one place a client-supplied `castLevel` is checked for basic legality
// BEFORE anything else fetches derived character state -- a pure, cheap
// input check. `null` in the success case means "this spell is a cantrip,
// no slot-level concept applies" (never a fabricated `castLevel: 0`,
// matching CanonicalSpellMechanics.level's own "0 means cantrip" contract
// and this phase's own explicit "prefer absence/null" instruction).
//
// Omitting `castLevel` entirely for a LEVELED spell defaults to the spell's
// own base level -- this is what keeps every Phase 1B.2 caller that never
// knew about `castLevel` (Magic Missile's existing accepted single-slot-
// level Cast) working completely unchanged: the client only ever needs to
// send an explicit `castLevel` when it wants something OTHER than the
// spell's own base level.
type ResolveCastLevelResult =
  | { ok: true; level: number | null }
  | { ok: false; reason: 'invalid-cast-level'; message: string }

function resolveRequestedCastLevel(
  mechanics: CanonicalSpellMechanics,
  requestedLevel: number | undefined
): ResolveCastLevelResult {
  if (mechanics.level === 0) {
    if (requestedLevel !== undefined) {
      return {
        ok: false,
        reason: 'invalid-cast-level',
        message: 'This spell is a cantrip and does not use a spell slot -- castLevel must not be supplied'
      }
    }
    return { ok: true, level: null }
  }

  const level = requestedLevel ?? mechanics.level
  if (level < mechanics.level) {
    return {
      ok: false,
      reason: 'invalid-cast-level',
      message: `castLevel ${level} is below this spell's base level ${mechanics.level} -- upcasting only ever goes up`
    }
  }

  return { ok: true, level }
}

async function expendSpellSlotAuthoritatively(
  characterId: string | number,
  level: number,
  max: number
): Promise<StoredCharacterSpellcasting> {
  const stored = (await loadCharacterSpellcasting(characterId)) ?? emptyCharacterSpellcasting()
  const nextExpendedSlots = expendSlot(stored.expendedSlots, level, max)
  return saveCharacterSpellcasting(characterId, { ...stored, expendedSlots: nextExpendedSlots })
}

// ---------------------------------------------------------------------------
// Cast commands
// ---------------------------------------------------------------------------

export type CastSpellInput = {
  worldId: string | number
  characterId: string | number
  rollerUserId: string
  encounterId?: string | number | null
  actionId: string
  visibility: RollVisibility
  metadata?: Record<string, unknown>
  // Character Sheet Body Phase 1B.2.1 (Cast Configuration) additions.
  // `castLevel` -- absent means "this spell's own base level" (preserving
  // every Phase 1B.2 caller's existing behavior unchanged); present and
  // re-validated independently against this character's OWN Spell Slot
  // progression, never trusted merely because a client-side picker offered
  // it (see `resolveRequestedCastLevel`). `choices` -- the client's
  // `{choiceId: optionId}` selection for this spell's own declared
  // `SpellChoice[]`, independently re-verified against
  // `action.spellMechanics.choices` (see `resolveCastableSpell`'s own
  // CHOICE AUTHORITY note) -- never a trusted mechanical value like
  // `damageType: 'lightning'` directly.
  castLevel?: number
  choices?: Record<string, string>
}

// 5etools' own damage-type strings are lowercase -- restated here (not
// imported) because it is a one-line, zero-domain-logic text transform, the
// same "restate the tiny thing, share the actual arithmetic" split this
// codebase already draws everywhere (character-actions.ts's own
// findNumber/findBoolean local copies).
function capitalizeWord(value: string): string {
  return value.length ? value[0]!.toUpperCase() + value.slice(1) : value
}

// A Roll Tray label suffix ("— Lightning") ONLY when the damage type came
// from an actual player CHOICE (Chromatic Orb-shaped) -- never for an
// ordinary fixed-type spell (Fire Bolt, Magic Missile), whose label stays
// exactly `"<name> Damage"`, byte-identical to Phase 1B.2's own accepted
// output. This task's own explicit "do not make labels absurdly verbose"
// instruction is why this is conditional rather than a suffix every spell
// damage roll grows.
function damageTypeLabelFor(mechanics: CanonicalSpellMechanics, resolvedChoices: Record<string, string>): string | undefined {
  if (!mechanics.choices?.length) return undefined
  const chosen = resolvedChoices['damage-type']
  return chosen ? capitalizeWord(chosen) : undefined
}

// Character Sheet Body Phase 1B.3 (Saving-Throw Spell Casting) -- the
// authoritative caster-side facts a saving-throw Cast returns IN PLACE OF a
// dice roll (see this file's own "WHAT DOES CAST ROLL?" note on
// `castSpellSave` below for why there is no RollEvent to attach these to).
// Deliberately NOT a target-facing result: no save is rolled, no hit/miss
// is decided, no HP changes -- this is exactly the same "caster-side
// authority only" boundary `action.attackBonus`/`action.saveDc` already
// draw everywhere else in this codebase, just carried on a dedicated
// response shape instead of a RollEvent.
export type CastSaveContext = {
  savingAbility: AbilityKey
  saveDc: number
  spellLevel: number
  // `null` for a cantrip -- mirrors `resolveRequestedCastLevel`'s own
  // level-or-null contract exactly.
  castLevel: number | null
  // Present only when this spell has structured damage (the
  // `supported-save-damage` case, e.g. Fireball) -- absent for a pure
  // context spell (`supported-save-context`, e.g. Hold Person), which has
  // nothing further to roll. `saveOutcome` is copied straight from
  // `resolvedDamage`, never recomputed.
  damage?: CanonicalSpellMechanics['damage']
  choices?: Record<string, string>
}

export type CastSpellResult =
  | {
      ok: true
      // Character Sheet Body Phase 1B.3 -- OPTIONAL now that a saving-throw
      // Cast (`castSpellSave`) may legitimately produce no dice roll at
      // all. Every OTHER Cast path (`castSpellAttack`,
      // `castSpellAutomaticDamage`, `rollIndependentSpellDamage`) still
      // always populates this -- the type only widened to accommodate the
      // one genuinely rollless path, never weakened for the rolling ones.
      roll?: RollEventRecord
      // Present ONLY for a saving-throw Cast -- see `CastSaveContext`'s own
      // header. Absent for every other archetype.
      saveContext?: CastSaveContext
      // Present only when this Cast actually expended a slot -- the
      // client's own "resource presentation must update from authoritative
      // state, no reload" requirement, satisfied by handing back the exact
      // record `expendSpellSlotAuthoritatively` just persisted rather than
      // making the client re-derive or PUT its own guess at the new count
      // (which risks exactly the drift/double-decrement this task's own
      // "do not duplicate slot-bound arithmetic" instruction warns about).
      // Absent for a free cantrip Cast and for `rollIndependentSpellDamage`
      // -- neither ever touches spellcasting state.
      spellcasting?: StoredCharacterSpellcasting
    }
  | { ok: false; reason: CastFailureReason; message: string }

// Fire Bolt's archetype: an untargeted spell attack roll. Free (no resource
// step) for a cantrip; one slot of the resolved cast level for a leveled
// attack-roll spell (architecture-only generalization -- 1B.2's required
// corpus had no such spell; Chromatic Orb, 1B.2.1's required acceptance
// case, is the first real one).
export async function castSpellAttack(input: CastSpellInput): Promise<CastSpellResult> {
  const resolved = await resolveCastableSpell(input.worldId, input.characterId, input.actionId, input.choices)
  if (!resolved.ok) return resolved

  const { action, mechanics, capability } = resolved.castable
  if (capability.kind !== 'supported-spell-attack') {
    return {
      ok: false,
      reason: 'not-castable',
      message: `'${action.name}' does not resolve as a spell attack roll -- use Cast's automatic-damage path instead`
    }
  }

  const levelResolution = resolveRequestedCastLevel(mechanics, input.castLevel)
  if (!levelResolution.ok) return levelResolution

  const metadata = {
    ...(input.metadata ?? {}),
    actionCategory: 'spell',
    spellLevel: mechanics.level,
    ...(levelResolution.level !== null ? { castLevel: levelResolution.level } : {}),
    ...(Object.keys(resolved.castable.resolvedChoices).length ? { choices: resolved.castable.resolvedChoices } : {})
  }
  const createRoll = (broadcast: boolean) => createSpellAttackRollEvent({
    worldId: input.worldId,
    rollerUserId: input.rollerUserId,
    actorCharacterId: input.characterId,
    encounterId: input.encounterId ?? null,
    spellName: action.name,
    sourceId: action.id,
    attackBonus: action.attackBonus as number,
    visibility: input.visibility,
    metadata,
    broadcast
  })

  if (levelResolution.level === null) {
    const roll = await createRoll(true)
    return { ok: true, roll }
  }

  return castLeveledSpell(input.worldId, input.characterId, levelResolution.level, createRoll)
}

// Magic Missile's archetype: automatic damage, no attack roll, no save.
// Chromatic Orb is NOT this archetype (it is a spell attack, above) --
// automatic-damage remains leveled-only in the required corpus.
export async function castSpellAutomaticDamage(input: CastSpellInput): Promise<CastSpellResult> {
  const resolved = await resolveCastableSpell(input.worldId, input.characterId, input.actionId, input.choices)
  if (!resolved.ok) return resolved

  const { action, mechanics, capability, resolvedChoices, resolvedDamage } = resolved.castable
  if (capability.kind !== 'supported-automatic-damage') {
    return {
      ok: false,
      reason: 'not-castable',
      message: `'${action.name}' does not resolve as automatic damage -- use Cast's spell-attack path instead`
    }
  }

  const levelResolution = resolveRequestedCastLevel(mechanics, input.castLevel)
  if (!levelResolution.ok) return levelResolution

  // classifySpellCastCapability only returns 'supported-automatic-damage'
  // when `mechanics.damage` is present, and `resolveCastableSpell`'s own
  // `applyResolvedChoicesToDamage` never removes a present damage roll --
  // only substitutes its `type` when a choice resolved one.
  const damage = resolvedDamage!
  const metadata = {
    ...(input.metadata ?? {}),
    actionCategory: 'spell',
    spellLevel: mechanics.level,
    ...(levelResolution.level !== null ? { castLevel: levelResolution.level } : {}),
    ...(Object.keys(resolvedChoices).length ? { choices: resolvedChoices } : {})
  }
  const createRoll = (broadcast: boolean) => createSpellDamageRollEvent({
    worldId: input.worldId,
    rollerUserId: input.rollerUserId,
    actorCharacterId: input.characterId,
    encounterId: input.encounterId ?? null,
    spellName: action.name,
    sourceId: action.id,
    dice: damage.dice ?? { count: 0, faces: 0 },
    modifier: damage.modifier,
    damageType: damage.type,
    damageTypeLabel: damageTypeLabelFor(mechanics, resolvedChoices),
    visibility: input.visibility,
    metadata,
    broadcast
  })

  if (levelResolution.level === null) {
    // Not part of the required corpus, but handled honestly rather than
    // assumed impossible: a cantrip with automatic damage costs nothing.
    const roll = await createRoll(true)
    return { ok: true, roll }
  }

  return castLeveledSpell(input.worldId, input.characterId, levelResolution.level, createRoll)
}

// ---------------------------------------------------------------------------
// castSpellHeal -- Cure Wounds/Healing Word's archetype (Character Sheet
// Body Phase 1B.4).
// ---------------------------------------------------------------------------
// Unlike the Attack/Damage split (Fire Bolt) or the untargeted Save split
// (Fireball), healing has NO separate free roll button at all -- Cast
// itself performs the healing roll immediately, in the exact same
// roll-then-persist-unbroadcast-then-expend-then-broadcast ordering every
// other ROLLING leveled Cast already uses (`castLeveledSpell`, shared
// unchanged). This task's own explicit UX instruction is why: a second,
// independent "Healing" button would let a player roll (and see) healing
// numbers without ever spending the spell slot that roll's own existence
// implies, exactly the "free spell" outcome this file's own ORDERING
// section already guards against for damage.
//
// The healing EXPRESSION itself is entirely content-authored
// (`mechanics.healing.dice`/`.modifier`, produced by
// app/lib/spell-mechanics/dnd5e.ts's own three-signal extraction) --
// nothing here parses prose or guesses a number. The only thing THIS
// function adds beyond the content's own dice is the character's
// authoritative Spellcasting Ability Modifier, and only when the spell's
// own canonical shape says it applies (`mechanics.healing.usesSpellcastingModifier`
// -- Prayer of Healing has NO such modifier per its real RAW text, and
// `resolveCastableSpell`'s own gate already refuses to Cast a spell that
// DOES need one from a Rules Package that cannot supply it).
//
// No target, no HP mutation: this function's RollEventRecord is the
// caster's own healing roll TOTAL only -- applying it to any character's
// current HP remains entirely a DM/player manual action (or a future,
// separately-approved phase's job), identical in spirit to
// `castSpellSave`'s own "no target HP mutation" boundary above.
export async function castSpellHeal(input: CastSpellInput): Promise<CastSpellResult> {
  const resolved = await resolveCastableSpell(input.worldId, input.characterId, input.actionId, input.choices)
  if (!resolved.ok) return resolved

  const { action, mechanics, capability, resolvedChoices } = resolved.castable
  if (capability.kind !== 'supported-healing') {
    return {
      ok: false,
      reason: 'not-castable',
      message: `'${action.name}' does not resolve as healing -- use one of Cast's other paths instead`
    }
  }

  // classifySpellCastCapability only returns 'supported-healing' when
  // `mechanics.healing` is present.
  const healing = mechanics.healing!

  const levelResolution = resolveRequestedCastLevel(mechanics, input.castLevel)
  if (!levelResolution.ok) return levelResolution

  // Character Sheet Body Phase 1B.4 -- upcast healing SCALING is explicitly
  // deferred to a future phase (see this task's own "DO NOT implement
  // executable upcast healing scaling" instruction); a spell cast at a
  // higher level still rolls exactly its base healing expression, and
  // `castLevel` is recorded in metadata purely as CONTEXT (identical to
  // `castSpellAutomaticDamage`'s own un-scaled `castLevel` metadata today),
  // never used to alter the dice rolled here.
  const modifier = healing.usesSpellcastingModifier
    ? healing.modifier + (action.healingAbilityModifier as number)
    : healing.modifier

  const metadata = {
    ...(input.metadata ?? {}),
    actionCategory: 'spell',
    spellLevel: mechanics.level,
    ...(levelResolution.level !== null ? { castLevel: levelResolution.level } : {}),
    ...(Object.keys(resolvedChoices).length ? { choices: resolvedChoices } : {})
  }
  const createRoll = (broadcast: boolean) => createSpellHealingRollEvent({
    worldId: input.worldId,
    rollerUserId: input.rollerUserId,
    actorCharacterId: input.characterId,
    encounterId: input.encounterId ?? null,
    spellName: action.name,
    sourceId: action.id,
    dice: healing.dice ?? { count: 0, faces: 0 },
    modifier,
    visibility: input.visibility,
    metadata,
    broadcast
  })

  if (levelResolution.level === null) {
    // Not part of the required 1B.4 corpus (no real healing cantrip exists
    // in the audited XPHB corpus), but handled honestly rather than assumed
    // impossible -- the identical "architecture degrades gracefully" posture
    // `castSpellAutomaticDamage`'s own cantrip branch already takes.
    const roll = await createRoll(true)
    return { ok: true, roll }
  }

  return castLeveledSpell(input.worldId, input.characterId, levelResolution.level, createRoll)
}

// ---------------------------------------------------------------------------
// castSpellSave -- Fireball's archetype (Character Sheet Body Phase 1B.3).
// ---------------------------------------------------------------------------
// WHAT DOES CAST ROLL? Nothing, on the caster's side. A saving-throw spell's
// d20 belongs to the TARGET, who does not exist yet in this untargeted Cast
// path (no Encounter selection required -- this phase's own central
// product goal). Fireball is castable the instant it is prepared, with no
// victim identified at all. So this function creates NO RollEvent -- not a
// dummy d20, not a fabricated "cast succeeded" roll -- only the
// authoritative `CastSaveContext` (Save DC, saving ability, base/cast
// level, damage+saveOutcome where structured) a DM can read directly, and
// (for a leveled spell) the exact same resource expenditure every other
// leveled Cast performs.
//
// FAILURE ORDERING FOR THIS PATH SPECIFICALLY (see this file's own header
// ORDERING section for the ROLLING paths, which this does NOT use): validate
// -> [availability check] -> persist resource expenditure -> return success.
// There is no roll to persist-then-broadcast, so `castLeveledSpell`'s own
// roll-first/broadcast-last sequence does not apply here -- a mutation
// failure after a successful availability check is reported the identical
// way (502, "the cast was not completed"), just without an orphaned
// RollEvent ever having existed to begin with.
//
// No target save, no target HP, no Encounter selection -- all deliberately
// out of this function's scope; see this file's own header and
// character-combat.ts's existing, untouched targeted Resolve control for
// where target-side resolution already lives.
export async function castSpellSave(input: CastSpellInput): Promise<CastSpellResult> {
  const resolved = await resolveCastableSpell(input.worldId, input.characterId, input.actionId, input.choices)
  if (!resolved.ok) return resolved

  const { action, mechanics, capability, resolvedChoices, resolvedDamage } = resolved.castable
  if (capability.kind !== 'supported-save-damage' && capability.kind !== 'supported-save-context') {
    return {
      ok: false,
      reason: 'not-castable',
      message: `'${action.name}' does not resolve as a saving-throw spell -- use one of Cast's other paths instead`
    }
  }

  // classifySpellCastCapability's own saving-throw branch is the only
  // caller of `resolution.kind === 'saving-throw'` -- guaranteed here.
  const savingAbility = (mechanics.resolution as { kind: 'saving-throw'; savingAbility: AbilityKey }).savingAbility
  const saveDc = action.saveDc as number

  const levelResolution = resolveRequestedCastLevel(mechanics, input.castLevel)
  if (!levelResolution.ok) return levelResolution

  const saveContext: CastSaveContext = {
    savingAbility,
    saveDc,
    spellLevel: mechanics.level,
    castLevel: levelResolution.level,
    ...(resolvedDamage ? { damage: resolvedDamage } : {}),
    ...(Object.keys(resolvedChoices).length ? { choices: resolvedChoices } : {})
  }

  if (levelResolution.level === null) {
    // Cantrip: no resource step at all -- Acid Splash's own required
    // acceptance case.
    return { ok: true, saveContext }
  }

  const availability = await checkSpellSlotAvailability(input.worldId, input.characterId, levelResolution.level)
  if (!availability.ok) return availability

  let spellcasting: StoredCharacterSpellcasting
  try {
    spellcasting = await expendSpellSlotAuthoritatively(input.characterId, levelResolution.level, availability.max)
  } catch {
    // No roll was ever created for this path -- nothing to have persisted
    // unbroadcast, nothing orphaned. The resource mutation simply did not
    // happen, and the Cast honestly reports that it did not complete.
    throw createError({
      statusCode: 502,
      statusMessage: 'The spell could not be recorded as cast -- its spell slot could not be recorded as spent'
    })
  }

  return { ok: true, saveContext, spellcasting }
}

// castSpell -- the single entry point cast.post.ts's "Cast" intent calls.
// The client asks to Cast an actionId; it never states (and the route never
// asks it to state) which supported archetype that action is -- this
// function resolves that itself, then dispatches, so "which capability is
// this" is decided in exactly the one place `classifySpellCastCapability`
// already lives, never duplicated into the route's own request parsing.
export async function castSpell(input: CastSpellInput): Promise<CastSpellResult> {
  const resolved = await resolveCastableSpell(input.worldId, input.characterId, input.actionId, input.choices)
  if (!resolved.ok) return resolved

  const kind = resolved.castable.capability.kind
  if (kind === 'supported-spell-attack') return castSpellAttack(input)
  if (kind === 'supported-automatic-damage') return castSpellAutomaticDamage(input)
  if (kind === 'supported-healing') return castSpellHeal(input)
  return castSpellSave(input)
}

// The shared guard-then-roll-then-mutate-then-broadcast sequence for any
// leveled Cast -- see this file's own header (ORDERING) for the full
// reasoning. `createRoll` is one of the two closures above, already bound to
// its own spell-attack or spell-damage shape.
async function castLeveledSpell(
  worldId: string | number,
  characterId: string | number,
  level: number,
  createRoll: (broadcast: boolean) => Promise<RollEventRecord>
): Promise<CastSpellResult> {
  const availability = await checkSpellSlotAvailability(worldId, characterId, level)
  if (!availability.ok) return availability

  const roll = await createRoll(false)

  let spellcasting: StoredCharacterSpellcasting
  try {
    spellcasting = await expendSpellSlotAuthoritatively(characterId, level, availability.max)
  } catch (mutationError) {
    // The roll above is already persisted (append-only, cannot be
    // retracted) but was never broadcast -- no connected client saw it, and
    // this character's slot was never marked spent. See this file's own
    // header (ORDERING) for why this is the accepted residual risk rather
    // than a bug: reporting failure here, without broadcasting, is the
    // least-bad of the three possible outcomes.
    throw createError({
      statusCode: 502,
      statusMessage: 'The spell resolved, but its spell slot could not be recorded as spent -- the cast was not completed'
    })
  }

  try {
    broadcastRollEvent(roll)
  } catch {
    // The Cast has genuinely succeeded by this point (rolled, persisted,
    // slot spent) -- a realtime-delivery failure must not be reported to
    // the caster as a Cast failure. See this file's own header.
  }

  return { ok: true, roll, spellcasting }
}

// ---------------------------------------------------------------------------
// rollIndependentSpellDamage -- the Fire-Bolt-Damage-button case.
// ---------------------------------------------------------------------------
// Only for `supported-spell-attack` spells: Cast/Attack already paid
// whatever resource this spell costs (or the spell is free, for a cantrip),
// so an independent Damage roll here spends nothing further, mirroring
// Phase 1A's weapon Attack/Damage split exactly (`createActionDamageRollEvent`
// takes no resource either).
//
// Refused outright for `supported-automatic-damage` spells: Magic Missile's
// damage roll only ever happens through `castSpellAutomaticDamage`, which
// owns its own resource expenditure -- exposing a second, independent path
// to the identical damage roll would let a player roll Magic Missile's
// damage for free, repeatedly, with no slot ever spent. See this file's own
// header and this task's own "LEVELED SPELL DAMAGE BUTTONS" requirement.
//
// CHARACTER SHEET BODY PHASE 1B.2.1 -- CHROMATIC ORB'S OWN DAMAGE BUTTON.
// Stateless re-validation, the "PREFERRED DAMAGE-CHOICE CONTRACT": this
// request independently re-resolves the spell and re-validates its OWN
// `choices` (never trusting a value the client remembers from a prior Cast,
// and never inventing a Cast Session to remember it server-side either) --
// see `resolveCastableSpell`'s own CHOICE AUTHORITY note, the exact same
// validation Cast itself runs. `castLevel`, if supplied, is validated for
// basic legality (never below the spell's base level, never sent for a
// cantrip) but NEVER checked against slot availability and NEVER spent --
// Damage costs no resource, matching this task's own explicit "FREE
// DAMAGE / RESOURCE SEMANTICS" rule. Preserved in metadata only, so a
// future castLevel-aware scaling phase (1B.5) has the context already
// flowing through without another request-shape change.
//
// CHARACTER SHEET BODY PHASE 1B.3 -- FIREBALL'S OWN DAMAGE BUTTON.
// `supported-save-damage` reuses this exact function unchanged in shape:
// `castSpellSave` (Cast) never rolls damage itself, so a saving-throw
// spell's structured damage is rolled here, independently, exactly like an
// attack-roll spell's -- no target save is required or assumed (RAW's
// "half on a success" is preserved as `resolvedDamage.saveOutcome` CONTEXT
// in the RollEvent's metadata for a DM to apply manually, never computed or
// applied to any target's HP here). Rolling still spends no resource --
// Cast already did, for a leveled save spell.
export async function rollIndependentSpellDamage(input: CastSpellInput): Promise<CastSpellResult> {
  const resolved = await resolveCastableSpell(input.worldId, input.characterId, input.actionId, input.choices)
  if (!resolved.ok) return resolved

  const { action, mechanics, capability, resolvedChoices, resolvedDamage } = resolved.castable
  if (capability.kind !== 'supported-spell-attack' && capability.kind !== 'supported-save-damage') {
    return {
      ok: false,
      reason: 'not-castable',
      message: `'${action.name}' does not expose an independent Damage roll -- its damage is already rolled by Cast, or it has none`
    }
  }

  if (!resolvedDamage) {
    return {
      ok: false,
      reason: 'not-castable',
      message: `'${action.name}' has no canonical damage to roll`
    }
  }

  const levelResolution = resolveRequestedCastLevel(mechanics, input.castLevel)
  if (!levelResolution.ok) return levelResolution

  // Save context (ability/DC/outcome) is CONTEXT ONLY here -- see this
  // function's own header. Absent entirely for a non-saving-throw spell
  // (Fire Bolt, Chromatic Orb), matching every other conditional metadata
  // field in this module.
  const saveMetadata = mechanics.resolution?.kind === 'saving-throw'
    ? {
        savingAbility: mechanics.resolution.savingAbility,
        ...(action.saveDc !== undefined ? { saveDc: action.saveDc } : {}),
        ...(resolvedDamage.saveOutcome ? { saveOutcome: resolvedDamage.saveOutcome } : {})
      }
    : {}

  const roll = await createSpellDamageRollEvent({
    worldId: input.worldId,
    rollerUserId: input.rollerUserId,
    actorCharacterId: input.characterId,
    encounterId: input.encounterId ?? null,
    spellName: action.name,
    sourceId: action.id,
    dice: resolvedDamage.dice ?? { count: 0, faces: 0 },
    modifier: resolvedDamage.modifier,
    damageType: resolvedDamage.type,
    damageTypeLabel: damageTypeLabelFor(mechanics, resolvedChoices),
    visibility: input.visibility,
    metadata: {
      ...(input.metadata ?? {}),
      actionCategory: 'spell',
      spellLevel: mechanics.level,
      ...(levelResolution.level !== null ? { castLevel: levelResolution.level } : {}),
      ...(Object.keys(resolvedChoices).length ? { choices: resolvedChoices } : {}),
      ...saveMetadata
    },
    broadcast: true
  })

  return { ok: true, roll }
}
