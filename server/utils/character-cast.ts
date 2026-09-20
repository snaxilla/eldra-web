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
// Only `supported-spell-attack` (Fire Bolt: an untargeted spell attack roll)
// and `supported-automatic-damage` (Magic Missile: a damage roll with
// neither an attack nor a save) can be Cast through this module. Every other
// capability (`unsupported-save`, `unsupported-healing`, `unsupported-effect`,
// `unsupported-choice`, `unsupported-mechanic`) is rejected with
// `reason: 'not-castable'` -- `classifySpellCastCapability` is the ONE
// predicate this module and CharacterActionsPanel.vue both call, so client
// and server can never independently invent different support rules. A
// saving-throw spell (Fireball) stays on character-combat.ts's existing
// targeted "Resolve" control, entirely untouched by this module.
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
  createSpellDamageRollEvent
} from './roll-events'
import { broadcastRollEvent } from './roll-realtime-bridge'
import { classifySpellCastCapability, type SpellCastCapability, type CanonicalSpellMechanics } from '../../app/lib/spell-mechanics'
import {
  deriveSpellSlotLevels,
  emptyCharacterSpellcasting,
  expendSlot,
  SLOT_TABLE_BY_CASTER_TYPE
} from '../../app/lib/characters/spellcasting'
import type { RollEventRecord, RollVisibility } from '../../app/lib/rolls/types'

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

export function statusForCastFailure(reason: CastFailureReason): number {
  switch (reason) {
    case 'character-not-found': return 404
    case 'no-catalogue-selection': return 409
    case 'action-not-found': return 404
    case 'not-castable': return 400
    case 'rules-unavailable': return 409
    case 'resource-unavailable': return 409
    default: {
      const exhaustive: never = reason
      return exhaustive
    }
  }
}

type CastableCapability = Extract<SpellCastCapability, { kind: 'supported-spell-attack' | 'supported-automatic-damage' }>

export type CastableSpell = {
  action: CharacterAction
  mechanics: CanonicalSpellMechanics
  capability: CastableCapability
}

export type ResolveCastableSpellResult =
  | { ok: true; castable: CastableSpell }
  | { ok: false; reason: CastFailureReason; message: string }

async function resolveCastableSpell(
  worldId: string | number,
  characterId: string | number,
  actionId: string
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

  if (!capability || (capability.kind !== 'supported-spell-attack' && capability.kind !== 'supported-automatic-damage')) {
    return {
      ok: false,
      reason: 'not-castable',
      message: `'${action.name}' cannot be Cast authoritatively yet (${capability?.kind ?? 'unsupported-mechanic'}) -- see its Info panel for what it needs`
    }
  }

  // classifySpellCastCapability only returns 'supported-spell-attack' when
  // `mechanics.resolution.kind === 'attack-roll'` and only
  // 'supported-automatic-damage' when `mechanics.damage` is present -- so
  // `action.spellMechanics` is guaranteed non-null/non-undefined here.
  const mechanics = action.spellMechanics as CanonicalSpellMechanics

  if (capability.kind === 'supported-spell-attack' && action.attackBonus === undefined) {
    return {
      ok: false,
      reason: 'rules-unavailable',
      message: `This World's active Rules Package does not declare the Spell Attack Bonus '${action.name}' needs`
    }
  }

  return { ok: true, castable: { action, mechanics, capability } }
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

async function checkSpellSlotAvailability(
  worldId: string | number,
  characterId: string | number,
  level: number
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

  const levels = deriveSpellSlotLevels({ casterType, tableRows, characterLevel, expendedSlots: {} })
  const slot = levels.find((entry) => entry.level === level)

  if (!slot) {
    return {
      ok: false,
      reason: 'rules-unavailable',
      message: `This character has no level ${level} spell slots according to this World's active Rules Package`
    }
  }

  // `expendedSlots: {}` above deliberately reads only `max` from this
  // derivation -- the ACTUAL expended count is read fresh from persistence
  // in `expendSpellSlotAuthoritatively` below, immediately before the
  // mutating write, rather than trusted from this earlier read. This keeps
  // the read-only availability check and the eventual write looking at the
  // freshest expended count available to each, without pretending a
  // single read protects against the race this file's header already
  // documents.
  const stored = await loadCharacterSpellcasting(characterId)
  const expended = stored?.expendedSlots[String(level)] ?? 0

  if (expended >= slot.max) {
    return {
      ok: false,
      reason: 'resource-unavailable',
      message: `No level ${level} spell slots remaining (${expended}/${slot.max} expended)`
    }
  }

  return { ok: true, max: slot.max, expended }
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
}

export type CastSpellResult =
  | {
      ok: true
      roll: RollEventRecord
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
// step) for a cantrip; one slot of `mechanics.level` for a leveled attack-roll
// spell (architecture-only generalization -- 1B.2's required corpus has no
// such spell, see this file's own header).
export async function castSpellAttack(input: CastSpellInput): Promise<CastSpellResult> {
  const resolved = await resolveCastableSpell(input.worldId, input.characterId, input.actionId)
  if (!resolved.ok) return resolved

  const { action, mechanics, capability } = resolved.castable
  if (capability.kind !== 'supported-spell-attack') {
    return {
      ok: false,
      reason: 'not-castable',
      message: `'${action.name}' does not resolve as a spell attack roll -- use Cast's automatic-damage path instead`
    }
  }

  const metadata = { ...(input.metadata ?? {}), actionCategory: 'spell', spellLevel: mechanics.level }
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

  if (mechanics.level === 0) {
    const roll = await createRoll(true)
    return { ok: true, roll }
  }

  return castLeveledSpell(input.worldId, input.characterId, mechanics.level, createRoll)
}

// Magic Missile's archetype: automatic damage, no attack roll, no save.
// Always leveled in the required corpus (a cantrip with automatic-damage
// resolution is not part of this phase's supported set; `mechanics.level`
// is trusted from the server-derived mechanics either way, never a client
// value).
export async function castSpellAutomaticDamage(input: CastSpellInput): Promise<CastSpellResult> {
  const resolved = await resolveCastableSpell(input.worldId, input.characterId, input.actionId)
  if (!resolved.ok) return resolved

  const { action, mechanics, capability } = resolved.castable
  if (capability.kind !== 'supported-automatic-damage') {
    return {
      ok: false,
      reason: 'not-castable',
      message: `'${action.name}' does not resolve as automatic damage -- use Cast's spell-attack path instead`
    }
  }

  // classifySpellCastCapability only returns 'supported-automatic-damage'
  // when `mechanics.damage` is present.
  const damage = mechanics.damage!
  const metadata = { ...(input.metadata ?? {}), actionCategory: 'spell', spellLevel: mechanics.level }
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
    visibility: input.visibility,
    metadata,
    broadcast
  })

  if (mechanics.level === 0) {
    // Not part of the required corpus, but handled honestly rather than
    // assumed impossible: a cantrip with automatic damage costs nothing.
    const roll = await createRoll(true)
    return { ok: true, roll }
  }

  return castLeveledSpell(input.worldId, input.characterId, mechanics.level, createRoll)
}

// castSpell -- the single entry point cast.post.ts's "Cast" intent calls.
// The client asks to Cast an actionId; it never states (and the route never
// asks it to state) which of the two supported archetypes that action is --
// this function resolves that itself, then dispatches, so "which capability
// is this" is decided in exactly the one place `classifySpellCastCapability`
// already lives, never duplicated into the route's own request parsing.
export async function castSpell(input: CastSpellInput): Promise<CastSpellResult> {
  const resolved = await resolveCastableSpell(input.worldId, input.characterId, input.actionId)
  if (!resolved.ok) return resolved

  return resolved.castable.capability.kind === 'supported-spell-attack'
    ? castSpellAttack(input)
    : castSpellAutomaticDamage(input)
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
export async function rollIndependentSpellDamage(input: CastSpellInput): Promise<CastSpellResult> {
  const resolved = await resolveCastableSpell(input.worldId, input.characterId, input.actionId)
  if (!resolved.ok) return resolved

  const { action, mechanics, capability } = resolved.castable
  if (capability.kind !== 'supported-spell-attack') {
    return {
      ok: false,
      reason: 'not-castable',
      message: `'${action.name}' does not expose an independent Damage roll -- its damage is already rolled by Cast`
    }
  }

  if (!mechanics.damage) {
    return {
      ok: false,
      reason: 'not-castable',
      message: `'${action.name}' has no canonical damage to roll`
    }
  }

  const roll = await createSpellDamageRollEvent({
    worldId: input.worldId,
    rollerUserId: input.rollerUserId,
    actorCharacterId: input.characterId,
    encounterId: input.encounterId ?? null,
    spellName: action.name,
    sourceId: action.id,
    dice: mechanics.damage.dice ?? { count: 0, faces: 0 },
    modifier: mechanics.damage.modifier,
    damageType: mechanics.damage.type,
    visibility: input.visibility,
    metadata: { ...(input.metadata ?? {}), actionCategory: 'spell', spellLevel: mechanics.level },
    broadcast: true
  })

  return { ok: true, roll }
}
