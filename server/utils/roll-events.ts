// Roll Event persistence -- Phase 1 of
// .github/docs/architecture/eldra-roll-system.md (see that document's §6
// for the data model, §7 for the API contract, and its Phase 1 entry,
// §14, for this file's exact scope).
//
// The single server-side owner of the `roll_events` Directus collection
// (schema: scripts/directus/create-roll-events-schema.mjs). Route handlers
// (server/api/worlds/[id]/rolls/**) stay thin -- parse/validate the
// request shape, call this module, return -- matching this codebase's own
// documented convention and the same split
// server/utils/character-health.ts, character-notes.ts,
// character-actions.ts, and character-combat.ts already establish for
// their own domains.
//
// APPEND-ONLY, ON PURPOSE (adr-023-server-authoritative-gameplay-events.md
// §7). Every row this module writes is a permanent, immutable fact -- this
// file exposes no update/delete function, and never will for a Roll
// Event: a roll's entire value IS the event, unlike character HP or
// inventory (which have real, mutable Current State alongside their own
// event history). Contrast character-health.ts/character-notes.ts's own
// find-then-PATCH-or-POST upsert shape, which is correct for THEM
// precisely because they track "the current state of one named thing" --
// the opposite of what a roll is.
//
// PHASE 1 SCOPE: `custom` rolls only. `createCustomRollEvent` is the one
// write path this phase ships; `ability`/`saving_throw`/`skill`/
// `action_attack`/`spell_attack`/`spell_save`/`damage` derivation (§3/§4)
// is explicitly Phase 2/3 work and is not started here. `listRollEvents`
// is source-type-agnostic already (it lists whatever rows exist), so it
// needs no Phase 2 change to keep working once other source types exist.
//
// PHASE 2 ADDITION: `createDerivedRollEvent` is the ability/saving_throw/
// skill write path (eldra-roll-system.md §3/§4/Phase 2). It re-derives the
// bonus from `getDerivedCharacter` (server/utils/character-derived.ts) --
// the SAME already-tested Rules Engine output the Character Sheet itself
// reads -- and never trusts a client-supplied number, mirroring
// world-rules-roll.ts's own "recompute, don't trust" precedent for its
// seed. No new evaluation path is built; this function only looks up one
// already-evaluated `DerivedValue` by category + id and rolls `1d20`
// against it. `action_attack`/`spell_attack`/`spell_save`/`damage` remain
// Phase 3 work.
//
// PHASE 2C ADDITION: every `RollEventRecord` this module returns now
// carries `rollerDisplayName`, resolved via
// world-memberships.ts's own `resolveDisplayNames` (exported for exactly
// this reuse) -- the Roll Tray's own CONTENT requirement ("Player name")
// would otherwise have nothing but a bare account UUID to show. This is a
// display-only enrichment, resolved with the same service-token trust this
// module already has (no new capability, no new endpoint, no schema
// change) -- never routed through the capability-gated `GET /members`,
// since knowing who rolled is not roster/invite data.
//
// PHASE 2D ADDITION: every write path (`createCustomRollEvent`,
// `createDerivedRollEvent`) now calls `broadcastRollEvent`
// (server/utils/roll-realtime-bridge.ts) immediately after persisting,
// with the exact same fully-resolved `RollEventRecord` it returns to the
// requester -- "the broadcaster should only deliver already-persisted
// RollEvents" (this task's own SERVER section). No business logic moves
// into the bridge: it never decides whether a roll happened, only who
// among already-connected clients is allowed to see this one.
//
// DIRECTUS ACCESS: `directusServiceRequest` (server/utils/directus.ts) --
// CLAUDE.md's "the only sanctioned way to talk to Directus" -- never a new
// local `dxFetch`. The service token, not the session-forwarding
// `directusRequest`, matching the exact precedent
// server/utils/scene-layer-objects.ts and server/utils/world-memberships.ts
// already set for a freshly-introduced, capability-gated collection:
// authorization happens once, at the application layer
// (requireCapability, called by the route before this module ever runs),
// not through Directus's own per-item permissions.
//
// TRUST BOUNDARY (eldra-roll-system.md §13): this module never reads a
// `total`, `dice`, `seed`, or pre-computed result off anything a caller
// supplies -- `createCustomRollEvent`'s only untrusted input is the
// formula STRING itself, which is then rolled here, server-side, via the
// OpenDice adapter (app/lib/rolls/dice-adapter.ts, Phase 0). The route
// layer additionally rejects a request body that tries to supply
// total/dice/seed/results at all, before this module is ever called.

// createError is imported explicitly (rather than relied on as a Nitro
// auto-import) -- the same reason server/utils/world-memberships.ts
// already does -- so this module is directly unit-testable under plain
// Vitest, which has no Nuxt/Nitro auto-import shims. h3's createError is
// the exact function Nitro auto-imports at runtime, so this changes
// nothing about production behavior.
import { createError } from 'h3'
import { rollFormula } from '../../app/lib/rolls/dice-adapter'
import type { RollDieGroup, RollEventRecord, RollSourceType, RollVisibility } from '../../app/lib/rolls/types'
import type { RuleCategory } from '../../app/lib/rules/types'
import { directusServiceRequest } from './directus'
import { getDerivedCharacter, type DerivedCharacterResult } from './character-derived'
import { resolveDisplayNames } from './world-memberships'
import { broadcastRollEvent } from './roll-realtime-bridge'
import { resolveAttackAction, type ResolveAttackActionResult } from './character-actions'

const COLLECTION = 'roll_events'

// ---------------------------------------------------------------------------
// Roll System Phase 3C (Roll Performance Audit) -- pipeline timing.
// ---------------------------------------------------------------------------
// "Measure first, optimize second." This logs how long each named server-
// side stage of a roll actually took, so the true bottleneck in "click ->
// Roll Tray visible" is read directly out of server logs rather than
// guessed at. `performance.now()` (sub-millisecond, monotonic), not
// `Date.now()` -- precision matters against a 1000ms budget. Every write
// path (`createCustomRollEvent`, `createDerivedRollEvent`) logs the same
// shape so the two are directly comparable.
function logRollPerf(label: string, stages: ReadonlyArray<readonly [string, number]>): void {
  const total = stages.reduce((sum, [, ms]) => sum + ms, 0)
  const breakdown = stages.map(([name, ms]) => `${name}=${ms.toFixed(1)}ms`).join(' ')
  console.log(`[roll-perf] ${label} total=${total.toFixed(1)}ms (${breakdown})`)
}

// Paging defaults -- eldra-roll-system.md §7's own `?limit=&cursor=`
// contract names no specific numbers; picked once, here, so the route and
// this module never drift on what "no limit given" or "too large a limit"
// means.
export const DEFAULT_ROLL_EVENTS_LIMIT = 50
export const MAX_ROLL_EVENTS_LIMIT = 200

// One-account convenience over `resolveDisplayNames` -- every WRITE path
// resolves exactly its own roller (`principal.accountId`, never a batch),
// falling back to the bare id itself rather than throwing, matching
// `listMembersForWorld`'s own "still appears, falling back to accountId"
// posture for an account that can't be resolved.
async function resolveOneDisplayName(accountId: string): Promise<string> {
  const names = await resolveDisplayNames([accountId])
  return names.get(accountId) || accountId
}

// ---------------------------------------------------------------------------
// Persistence translation -- Directus row (snake_case) <-> RollEventRecord
// (camelCase), matching this codebase's own established boundary
// convention (CLAUDE.md's "Directus returns snake_case rows; call sites
// normalize them into camelCase by hand at the boundary").
// ---------------------------------------------------------------------------

function toPersistenceRow(input: {
  worldId: string | number
  encounterId: string | number | null
  actorCharacterId: string | number | null
  rollerUserId: string
  label: string
  sourceType: RollSourceType
  sourceKey: string | null
  sourceId: string | null
  expression: string
  dice: RollDieGroup[]
  modifier: number
  modifiers: number[]
  total: number
  visibility: RollVisibility
  metadata: Record<string, unknown>
}) {
  return {
    world_id: Number(input.worldId),
    encounter_id: input.encounterId != null ? Number(input.encounterId) : null,
    actor_character_id: input.actorCharacterId != null ? Number(input.actorCharacterId) : null,
    roller_user_id: input.rollerUserId,
    label: input.label,
    source_type: input.sourceType,
    source_key: input.sourceKey,
    source_id: input.sourceId,
    expression: input.expression,
    dice: input.dice,
    modifier: input.modifier,
    modifiers: input.modifiers,
    total: input.total,
    visibility: input.visibility,
    // Server-stamped here, never client-supplied -- matching
    // scene-layer-objects.ts's own created_at/updated_at convention (the
    // app writes the timestamp explicitly; the column itself has no
    // Directus-side auto-populate behavior).
    created_at: new Date().toISOString(),
    metadata: input.metadata
  }
}

// `displayName` is resolved separately (a Directus `/users` lookup,
// server/utils/world-memberships.ts's own `resolveDisplayNames`) because
// this function only ever sees ONE roll_events row at a time and batching
// that lookup across a whole page (`listRollEvents`) needs to happen once,
// outside this per-row translator -- never omitted silently: every caller
// below resolves and passes one.
function fromPersistenceRow(row: any, displayName: string): RollEventRecord {
  return {
    id: String(row?.id ?? ''),
    worldId: String(row?.world_id ?? ''),
    encounterId: row?.encounter_id != null ? String(row.encounter_id) : null,
    actorCharacterId: row?.actor_character_id != null ? String(row.actor_character_id) : null,
    rollerUserId: String(row?.roller_user_id ?? ''),
    rollerDisplayName: displayName,
    label: String(row?.label ?? ''),
    sourceType: (row?.source_type ?? 'custom') as RollSourceType,
    sourceKey: row?.source_key != null ? String(row.source_key) : null,
    sourceId: row?.source_id != null ? String(row.source_id) : null,
    expression: String(row?.expression ?? ''),
    dice: Array.isArray(row?.dice) ? row.dice : [],
    modifier: Number(row?.modifier ?? 0),
    modifiers: Array.isArray(row?.modifiers) ? row.modifiers : [],
    total: Number(row?.total ?? 0),
    visibility: (row?.visibility === 'table' ? 'table' : 'private') as RollVisibility,
    createdAt: String(row?.created_at ?? ''),
    metadata: row?.metadata && typeof row.metadata === 'object' ? row.metadata : {}
  }
}

// ---------------------------------------------------------------------------
// Write -- custom rolls only (Phase 1 scope, this file's own header)
// ---------------------------------------------------------------------------

export type CreateCustomRollInput = {
  worldId: string | number
  // The authenticated Directus user requesting this roll -- the route
  // resolves this from event.context.principal.accountId, never from the
  // request body.
  rollerUserId: string
  actorCharacterId?: string | number | null
  encounterId?: string | number | null
  // The one untrusted input this function actually rolls. Already
  // required-non-empty by the route before this is called; validated
  // again here structurally by virtue of being handed to OpenDice, which
  // is the only thing that can actually judge whether it means anything.
  expression: string
  label: string
  visibility: RollVisibility
  metadata?: Record<string, unknown>
}

// Rolls `input.expression` through the Phase 0 adapter and persists the
// result as a new, permanent roll_events row. Throws a 400 (OpenDice's own
// message, verbatim -- eldra-roll-system.md §7: "if it throws, the request
// is rejected with the library's own message, never silently coerced")
// when the formula is malformed or exceeds OpenDice's documented limits.
// Never returns a partially-written or updatable record -- there is no
// corresponding update function in this module (this file's own header).
export async function createCustomRollEvent(input: CreateCustomRollInput): Promise<RollEventRecord> {
  const tStart = performance.now()
  const rolled = rollFormula(input.expression)
  const tRolled = performance.now()

  if (!rolled.ok) {
    throw createError({ statusCode: 400, statusMessage: rolled.error })
  }

  const row = toPersistenceRow({
    worldId: input.worldId,
    encounterId: input.encounterId ?? null,
    actorCharacterId: input.actorCharacterId ?? null,
    rollerUserId: input.rollerUserId,
    label: input.label,
    sourceType: 'custom',
    sourceKey: null,
    sourceId: null,
    expression: rolled.roll.expression,
    dice: rolled.roll.dice,
    modifier: rolled.roll.modifier,
    modifiers: rolled.roll.modifiers,
    total: rolled.roll.total,
    visibility: input.visibility,
    metadata: input.metadata ?? {}
  })

  const tBeforePersist = performance.now()
  const [res, displayName]: [any, string] = await Promise.all([
    directusServiceRequest(`/items/${COLLECTION}`, { method: 'POST', body: row }),
    resolveOneDisplayName(input.rollerUserId)
  ])
  const tAfterPersist = performance.now()

  const roll = fromPersistenceRow(res?.data, displayName)
  broadcastRollEvent(roll)
  const tAfterBroadcast = performance.now()

  logRollPerf('custom roll', [
    ['openDice', tRolled - tStart],
    ['persistence+displayName', tAfterPersist - tBeforePersist],
    ['broadcast', tAfterBroadcast - tAfterPersist]
  ])

  return roll
}

// ---------------------------------------------------------------------------
// Write -- ability/saving_throw/skill rolls (Phase 2, §3/§4)
// ---------------------------------------------------------------------------

export type DerivableRollSourceType = 'ability' | 'saving_throw' | 'skill'

// The one place this file names a Rule Category per source type -- §3's
// "the server re-derives from the same already-tested Rules Engine output
// the Character Sheet itself reads." Never a Definition id: a package that
// declares no `core.saves` simply has no saving throw entries to find,
// which surfaces below as an ordinary "not found" rejection, not a crash.
const DERIVED_ROLL_CATEGORY_BY_SOURCE_TYPE: Record<DerivableRollSourceType, RuleCategory> = {
  ability: 'core.abilities',
  saving_throw: 'core.saves',
  skill: 'core.skills'
}

// The default display label when the client doesn't supply one (mirroring
// createCustomRollEvent's own "no label, default from what was actually
// rolled" posture) -- eldra-roll-system.md §4's own "Shown to player"
// examples ("Strength Check", "Wisdom Save", "Stealth Check"). This is
// generic English roll vocabulary keyed by SOURCE TYPE, never a package's
// own Definition id or ability name -- the label still comes entirely from
// `entry.label`, this only appends the word for what kind of roll it is.
const DERIVED_ROLL_LABEL_SUFFIX_BY_SOURCE_TYPE: Record<DerivableRollSourceType, string> = {
  ability: 'Check',
  saving_throw: 'Save',
  skill: 'Check'
}

// Maps a `getDerivedCharacter` rejection onto an HTTP status -- the same
// character-not-found -> 404, everything-else-about-Rules-state -> 409/500
// shape server/api/worlds/[id]/characters/[characterId]/combat.post.ts
// already established for this exact result type, restated as its own
// function here because this module (unlike that route) throws directly
// rather than returning a result for the route to translate, matching
// createCustomRollEvent's own throw-from-the-util convention immediately
// above.
function statusForDerivedCharacterFailure(
  result: Extract<DerivedCharacterResult, { available: false }>
): { statusCode: number; statusMessage: string } {
  switch (result.reason) {
    case 'character-not-found':
      return { statusCode: 404, statusMessage: 'No character exists with that id in this World' }
    case 'no-catalogue-selection':
      return { statusCode: 409, statusMessage: result.message }
    case 'rules-unconfigured':
      return { statusCode: 409, statusMessage: result.message }
    case 'rules-broken':
      return { statusCode: 500, statusMessage: result.message }
    default: {
      const exhaustive: never = result
      return exhaustive
    }
  }
}

export type CreateDerivedRollInput = {
  worldId: string | number
  rollerUserId: string
  actorCharacterId: string | number
  encounterId?: string | number | null
  sourceType: DerivableRollSourceType
  // The Rules Engine id this bonus is read from, e.g.
  // 'value:skill.stealth.bonus' -- required, and looked up ONLY within the
  // category §3/§4 name for this sourceType, never across all categories.
  sourceKey: string
  label?: string
  visibility: RollVisibility
  metadata?: Record<string, unknown>
}

// Rolls `1d20` against the ONE already-evaluated bonus a real
// `getDerivedCharacter` call reports for `sourceKey`, and persists the
// result exactly like `createCustomRollEvent` does. Trust boundary
// (eldra-roll-system.md §13, §3): this function never accepts a bonus,
// modifier, or expression from the caller -- `sourceKey` only NAMES which
// already-computed Rules Engine Value to re-read; the number itself always
// comes from this fresh `getDerivedCharacter` call, never from `input`.
export async function createDerivedRollEvent(input: CreateDerivedRollInput): Promise<RollEventRecord> {
  const tStart = performance.now()
  const result = await getDerivedCharacter(input.worldId, input.actorCharacterId)
  const tDerived = performance.now()

  if (!result.available) {
    throw createError(statusForDerivedCharacterFailure(result))
  }

  const category = DERIVED_ROLL_CATEGORY_BY_SOURCE_TYPE[input.sourceType]
  const entry = (result.derived.byCategory[category] ?? []).find((candidate) => candidate.id === input.sourceKey)

  if (!entry) {
    throw createError({
      statusCode: 400,
      statusMessage: `'${input.sourceKey}' is not a ${input.sourceType.replace('_', ' ')} this character's Rules Package declares`
    })
  }
  if (entry.error) {
    throw createError({ statusCode: 409, statusMessage: entry.error })
  }
  if (typeof entry.value !== 'number') {
    throw createError({
      statusCode: 400,
      statusMessage: `'${input.sourceKey}' did not evaluate to a number, so it cannot be rolled`
    })
  }

  const rolled = rollFormula('1d20', { bonuses: [entry.value] })
  const tRolled = performance.now()
  if (!rolled.ok) {
    throw createError({ statusCode: 400, statusMessage: rolled.error })
  }

  const label =
    input.label?.trim() ||
    `${entry.label ?? input.sourceKey} ${DERIVED_ROLL_LABEL_SUFFIX_BY_SOURCE_TYPE[input.sourceType]}`

  const row = toPersistenceRow({
    worldId: input.worldId,
    encounterId: input.encounterId ?? null,
    actorCharacterId: input.actorCharacterId,
    rollerUserId: input.rollerUserId,
    label,
    sourceType: input.sourceType,
    sourceKey: input.sourceKey,
    sourceId: null,
    expression: rolled.roll.expression,
    dice: rolled.roll.dice,
    modifier: rolled.roll.modifier,
    modifiers: rolled.roll.modifiers,
    total: rolled.roll.total,
    visibility: input.visibility,
    metadata: input.metadata ?? {}
  })

  const tBeforePersist = performance.now()
  const [res, displayName]: [any, string] = await Promise.all([
    directusServiceRequest(`/items/${COLLECTION}`, { method: 'POST', body: row }),
    resolveOneDisplayName(input.rollerUserId)
  ])
  const tAfterPersist = performance.now()

  const roll = fromPersistenceRow(res?.data, displayName)
  broadcastRollEvent(roll)
  const tAfterBroadcast = performance.now()

  logRollPerf(`derived roll (${input.sourceType})`, [
    ['characterAssembly+rulesDerivation', tDerived - tStart],
    ['openDice', tRolled - tDerived],
    ['persistence+displayName', tAfterPersist - tBeforePersist],
    ['broadcast', tAfterBroadcast - tAfterPersist]
  ])

  return roll
}

// ---------------------------------------------------------------------------
// Write -- Hit Die rolls (Character Sheet Header Cleanup 2.1)
// ---------------------------------------------------------------------------
//
// Spend Hit Die used to heal by a deterministic Rules-Engine AVERAGE
// (`value:hit_points.hit_die_average_roll`), entirely bypassing this module.
// That average is still what a Long Rest's own recovery count uses (no
// change there), but the ACT of spending one die now produces a real,
// visible, persisted RollEvent -- exactly the same "server derives, server
// rolls, never trusts the client" shape createDerivedRollEvent already
// established for ability/saving_throw/skill.
//
// UNLIKE createDerivedRollEvent, this function does NOT call
// getDerivedCharacter itself -- server/utils/character-recovery.ts (its
// only caller) already calls it once, for the SAME action, to read Maximum
// HP and Hit Dice numbers it needs regardless of whether a roll happens at
// all (the full-HP/no-dice-available guards run before this is ever
// called). A second, redundant fetch of the same already-in-hand numbers
// would add nothing; the caller passes `hitDieSize`/`conModifier` through
// directly. This is still "the server derives it" -- character-recovery.ts
// is server code, never the browser; no client request body ever reaches
// this function's inputs.
export type CreateHitDieRollInput = {
  worldId: string | number
  rollerUserId: string
  actorCharacterId: string | number
  encounterId?: string | number | null
  hitDieSize: number
  conModifier: number
  visibility: RollVisibility
  metadata?: Record<string, unknown>
}

// Rolls `1d<hitDieSize>` with the character's Constitution modifier as a
// flat bonus, and persists the result exactly like createCustomRollEvent/
// createDerivedRollEvent do -- same persistence row, same broadcast, same
// "throws on a roll failure, never a partially-written record" contract.
// `sourceKey` is null (matching a custom roll): no SINGLE Rules Engine
// Value id names this whole roll, since it combines two (hit_die_size,
// ability.con.mod) rather than re-reading one already-evaluated bonus.
export async function createHitDieRollEvent(input: CreateHitDieRollInput): Promise<RollEventRecord> {
  const tStart = performance.now()
  const rolled = rollFormula(`1d${input.hitDieSize}`, { bonuses: [input.conModifier] })
  const tRolled = performance.now()

  if (!rolled.ok) {
    throw createError({ statusCode: 400, statusMessage: rolled.error })
  }

  const row = toPersistenceRow({
    worldId: input.worldId,
    encounterId: input.encounterId ?? null,
    actorCharacterId: input.actorCharacterId,
    rollerUserId: input.rollerUserId,
    label: `Hit Die (d${input.hitDieSize})`,
    sourceType: 'hit_die',
    sourceKey: null,
    sourceId: null,
    expression: rolled.roll.expression,
    dice: rolled.roll.dice,
    modifier: rolled.roll.modifier,
    modifiers: rolled.roll.modifiers,
    total: rolled.roll.total,
    visibility: input.visibility,
    metadata: { ...(input.metadata ?? {}), conModifier: input.conModifier }
  })

  const tBeforePersist = performance.now()
  const [res, displayName]: [any, string] = await Promise.all([
    directusServiceRequest(`/items/${COLLECTION}`, { method: 'POST', body: row }),
    resolveOneDisplayName(input.rollerUserId)
  ])
  const tAfterPersist = performance.now()

  const roll = fromPersistenceRow(res?.data, displayName)
  broadcastRollEvent(roll)
  const tAfterBroadcast = performance.now()

  logRollPerf('hit die roll', [
    ['openDice', tRolled - tStart],
    ['persistence+displayName', tAfterPersist - tBeforePersist],
    ['broadcast', tAfterBroadcast - tAfterPersist]
  ])

  return roll
}

// ---------------------------------------------------------------------------
// Write -- weapon/unarmed Attack and Damage rolls (Character Sheet Body
// Phase 1A, character-sheet-beauty-pass.md's own IMPLEMENT section).
// ---------------------------------------------------------------------------
//
// UNTARGETED, ON PURPOSE. These two functions produce exactly one d20 (or
// one damage expression) plus its authoritative modifier -- no target, no
// Armor Class comparison, no hit/miss, no HP applied to anyone.
// server/utils/character-combat.ts's existing `resolveCombatAction` already
// does the full targeted version (attack vs AC, damage applied to a
// target's HP) for the "Resolve" control on spell actions; these functions
// are Phase 1A's deliberately smaller sibling for weapon/unarmed actions --
// see character-actions.ts's own `resolveAttackAction` for why the two
// never disagree about which actions qualify.
//
// Both share `resolveAttackAction`'s one lookup (never a second, separate
// action-resolution path) and never accept a label from the caller -- the
// display label is always `<action name> Attack`/`<action name> Damage`,
// server-derived from the same authoritative action name Combat Resolution
// already trusts, never a client-supplied string.

const MELEE_ATTACK_BONUS_ID = 'value:combat.melee_attack_bonus'
const RANGED_ATTACK_BONUS_ID = 'value:combat.ranged_attack_bonus'

// Maps resolveAttackAction's own rejection reasons onto an HTTP status,
// mirroring statusForDerivedCharacterFailure's shape immediately above for
// the identical reason: this module throws directly rather than returning a
// result for the route to translate.
function statusForAttackActionFailure(
  result: Extract<ResolveAttackActionResult, { ok: false }>
): { statusCode: number; statusMessage: string } {
  switch (result.reason) {
    case 'character-not-found':
      return { statusCode: 404, statusMessage: result.message }
    case 'action-not-found':
      return { statusCode: 404, statusMessage: result.message }
    case 'no-catalogue-selection':
      return { statusCode: 409, statusMessage: result.message }
    case 'not-attack-capable':
      return { statusCode: 400, statusMessage: result.message }
    case 'rules-unavailable':
      return { statusCode: 409, statusMessage: result.message }
    default: {
      const exhaustive: never = result.reason
      return exhaustive
    }
  }
}

export type CreateActionAttackRollInput = {
  worldId: string | number
  rollerUserId: string
  actorCharacterId: string | number
  encounterId?: string | number | null
  // Client-supplied INTENT ("roll this action's attack"), never a modifier
  // or a bonus -- resolveAttackAction re-derives everything this rolls.
  actionId: string
  visibility: RollVisibility
  metadata?: Record<string, unknown>
}

// `1d20` against the action's own already-Rules-Engine-derived Attack Bonus
// (`action.attackBonus`, attached by getCharacterActions) -- no target, no
// Armor Class, no hit/miss decision. Persists and broadcasts exactly like
// every other write path in this module.
export async function createActionAttackRollEvent(input: CreateActionAttackRollInput): Promise<RollEventRecord> {
  const tStart = performance.now()
  const resolved = await resolveAttackAction(input.worldId, input.actorCharacterId, input.actionId)
  const tResolved = performance.now()

  if (!resolved.ok) {
    throw createError(statusForAttackActionFailure(resolved))
  }

  const { action } = resolved.resolved
  const bonusId = action.resolution.attackKind === 'melee' ? MELEE_ATTACK_BONUS_ID : RANGED_ATTACK_BONUS_ID

  const rolled = rollFormula('1d20', { bonuses: [action.attackBonus] })
  const tRolled = performance.now()
  if (!rolled.ok) {
    throw createError({ statusCode: 400, statusMessage: rolled.error })
  }

  const row = toPersistenceRow({
    worldId: input.worldId,
    encounterId: input.encounterId ?? null,
    actorCharacterId: input.actorCharacterId,
    rollerUserId: input.rollerUserId,
    label: `${action.name} Attack`,
    sourceType: 'action_attack',
    sourceKey: bonusId,
    sourceId: action.id,
    expression: rolled.roll.expression,
    dice: rolled.roll.dice,
    modifier: rolled.roll.modifier,
    modifiers: rolled.roll.modifiers,
    total: rolled.roll.total,
    visibility: input.visibility,
    metadata: { ...(input.metadata ?? {}), actionCategory: action.category, attackKind: action.resolution.attackKind }
  })

  const tBeforePersist = performance.now()
  const [res, displayName]: [any, string] = await Promise.all([
    directusServiceRequest(`/items/${COLLECTION}`, { method: 'POST', body: row }),
    resolveOneDisplayName(input.rollerUserId)
  ])
  const tAfterPersist = performance.now()

  const roll = fromPersistenceRow(res?.data, displayName)
  broadcastRollEvent(roll)
  const tAfterBroadcast = performance.now()

  logRollPerf('action attack roll', [
    ['actionResolution', tResolved - tStart],
    ['openDice', tRolled - tResolved],
    ['persistence+displayName', tAfterPersist - tBeforePersist],
    ['broadcast', tAfterBroadcast - tAfterPersist]
  ])

  return roll
}

export type CreateActionDamageRollInput = {
  worldId: string | number
  rollerUserId: string
  actorCharacterId: string | number
  encounterId?: string | number | null
  actionId: string
  visibility: RollVisibility
  metadata?: Record<string, unknown>
}

// The action's own damage dice (a weapon's `damageRoll`) or, for Unarmed
// Strike (which carries no dice at all -- RAW 2024's flat "1 + Strength
// modifier"), a fixed `1d1` -- a real, single, always-1 die roll rather
// than a bare modifier, so Unarmed Strike's damage still travels through
// the exact same dice-based RollEventRecord/Roll Tray/dice-presentation
// pipeline every other roll in this app uses, with no special-cased
// "modifier-only" record shape. OpenDice itself requires at least one die
// per formula (confirmed against the library directly) -- `1d1` is the
// smallest expression that satisfies that while still reporting an
// authoritative, always-reproducible-from-its-own-seed die group. Never
// doubles dice for a critical -- Phase 1A has no target/hit context to know
// whether this damage followed a critical Attack roll (see this module's
// own header on why hit/miss stays out of scope).
export async function createActionDamageRollEvent(input: CreateActionDamageRollInput): Promise<RollEventRecord> {
  const tStart = performance.now()
  const resolved = await resolveAttackAction(input.worldId, input.actorCharacterId, input.actionId)
  const tResolved = performance.now()

  if (!resolved.ok) {
    throw createError(statusForAttackActionFailure(resolved))
  }

  const { action, damageAbilityModifier } = resolved.resolved

  let expression: string
  let damageType: string | undefined

  if (action.category === 'unarmed') {
    // RAW 2024: flat "1 + Strength modifier bludgeoning" -- see
    // character-combat.ts's own identical special case for why this is the
    // one action Phase 1A hand-derives a damage type for rather than
    // reading `action.damageType` (UNARMED_STRIKE carries none).
    expression = '1d1'
    damageType = 'bludgeoning'
  } else {
    if (!action.damageRoll) {
      throw createError({
        statusCode: 409,
        statusMessage: `'${action.name}' has no damage dice declared by its Content Pack -- this World's content is missing structured damage data for it`
      })
    }
    expression = `${action.damageRoll.count}d${action.damageRoll.faces}`
    damageType = action.damageType
  }

  const rolled = rollFormula(expression, { bonuses: [damageAbilityModifier] })
  const tRolled = performance.now()
  if (!rolled.ok) {
    throw createError({ statusCode: 400, statusMessage: rolled.error })
  }

  const row = toPersistenceRow({
    worldId: input.worldId,
    encounterId: input.encounterId ?? null,
    actorCharacterId: input.actorCharacterId,
    rollerUserId: input.rollerUserId,
    label: `${action.name} Damage`,
    sourceType: 'damage',
    sourceKey: null,
    sourceId: action.id,
    expression: rolled.roll.expression,
    dice: rolled.roll.dice,
    modifier: rolled.roll.modifier,
    modifiers: rolled.roll.modifiers,
    total: rolled.roll.total,
    visibility: input.visibility,
    metadata: {
      ...(input.metadata ?? {}),
      actionCategory: action.category,
      ...(damageType ? { damageType } : {})
    }
  })

  const tBeforePersist = performance.now()
  const [res, displayName]: [any, string] = await Promise.all([
    directusServiceRequest(`/items/${COLLECTION}`, { method: 'POST', body: row }),
    resolveOneDisplayName(input.rollerUserId)
  ])
  const tAfterPersist = performance.now()

  const roll = fromPersistenceRow(res?.data, displayName)
  broadcastRollEvent(roll)
  const tAfterBroadcast = performance.now()

  logRollPerf('action damage roll', [
    ['actionResolution', tResolved - tStart],
    ['openDice', tRolled - tResolved],
    ['persistence+displayName', tAfterPersist - tBeforePersist],
    ['broadcast', tAfterBroadcast - tAfterPersist]
  ])

  return roll
}

// ---------------------------------------------------------------------------
// Write -- spell attack/damage rolls (Character Sheet Body Phase 1B.2,
// Authoritative Cast Foundation)
// ---------------------------------------------------------------------------
//
// UNTARGETED, matching createActionAttackRollEvent/createActionDamageRollEvent's
// own posture exactly (see that section's own header): one d20 (or one
// damage expression) plus its authoritative modifier, no target, no Armor
// Class comparison, no hit/miss decision, no HP applied to anyone. Spell
// saving-throw resolution is out of this phase's scope entirely and stays
// on character-combat.ts's existing targeted "Resolve" control, untouched.
//
// THE ONE REAL DIFFERENCE FROM createActionAttackRollEvent/
// createActionDamageRollEvent: those two resolve an actionId THEMSELVES
// (calling resolveAttackAction internally). These two take an
// ALREADY-DERIVED attack bonus / damage dice+modifier as input instead.
// That is deliberate, not a shortcut: server/utils/character-cast.ts is
// the one place that resolves a spell action's numbers (reusing
// server/utils/character-actions.ts's own getCharacterActions for the
// SAME "is this prepared" authority every other spell-reading server util
// already trusts), because a LEVELED Cast also needs those exact numbers
// for its own resource-authority decision BEFORE any roll happens.
// Resolving twice (once here, once there) would risk exactly the kind of
// drift this module's sibling functions already avoid by resolving only
// once -- so the resolution stays in character-cast.ts, and these two
// functions are pure "given the numbers, roll and persist" primitives.
//
// `broadcast` -- Cast's own atomicity requirement (this task's own
// "IMPORTANT -- BROADCAST ORDERING" section). A cantrip Cast has no
// resource step at all, so it broadcasts immediately (`broadcast: true`),
// exactly like every other roll in this module. A LEVELED Cast must not
// let a connected client see a successful-looking RollEvent before the
// matching slot expenditure is known to have persisted --
// character-cast.ts calls these with `broadcast: false`, then calls
// `broadcastRollEvent` (already a standalone export, imported above)
// itself, ONLY once the slot mutation has actually succeeded. The row is
// still PERSISTED either way -- RollEvents are append-only (this file's
// own header), there is no "undo" once the POST below succeeds -- so a
// LATER mutation failure cannot un-happen the roll; withholding the
// broadcast only limits who finds out about it before the server has
// finished deciding whether the whole Cast succeeded. See
// character-cast.ts's own header for the full ordering and the residual
// risk that remains once no further step can fail.
//
// `sourceType`: 'spell_attack' is an EXISTING, previously-reserved-but-
// unused member of RollSourceType (app/lib/rolls/types.ts) -- using it now
// is not introducing a new taxonomy member, it is finally implementing one
// this app already declared room for. Spell DAMAGE reuses the existing
// generic 'damage' sourceType unchanged (the same one weapon/unarmed
// damage already uses) rather than adding a 'spell_damage' variant --
// there is nothing about a spell's damage roll that needs its own
// taxonomy slot; the `label` ("<Spell Name> Damage") already gives the
// Roll Tray everything it needs to tell it apart from a weapon's, exactly
// as this task's own ROLL EVENT TAXONOMY section prefers.

export type CreateSpellAttackRollInput = {
  worldId: string | number
  rollerUserId: string
  actorCharacterId: string | number
  encounterId?: string | number | null
  // Display only, server-derived by the caller from the character's own
  // prepared spell -- never a client-supplied label.
  spellName: string
  sourceId: string
  attackBonus: number
  visibility: RollVisibility
  metadata?: Record<string, unknown>
  broadcast: boolean
}

export async function createSpellAttackRollEvent(input: CreateSpellAttackRollInput): Promise<RollEventRecord> {
  const tStart = performance.now()
  const rolled = rollFormula('1d20', { bonuses: [input.attackBonus] })
  const tRolled = performance.now()
  if (!rolled.ok) {
    throw createError({ statusCode: 400, statusMessage: rolled.error })
  }

  const row = toPersistenceRow({
    worldId: input.worldId,
    encounterId: input.encounterId ?? null,
    actorCharacterId: input.actorCharacterId,
    rollerUserId: input.rollerUserId,
    label: `${input.spellName} Attack`,
    sourceType: 'spell_attack',
    sourceKey: null,
    sourceId: input.sourceId,
    expression: rolled.roll.expression,
    dice: rolled.roll.dice,
    modifier: rolled.roll.modifier,
    modifiers: rolled.roll.modifiers,
    total: rolled.roll.total,
    visibility: input.visibility,
    metadata: input.metadata ?? {}
  })

  const tBeforePersist = performance.now()
  const [res, displayName]: [any, string] = await Promise.all([
    directusServiceRequest(`/items/${COLLECTION}`, { method: 'POST', body: row }),
    resolveOneDisplayName(input.rollerUserId)
  ])
  const tAfterPersist = performance.now()

  const roll = fromPersistenceRow(res?.data, displayName)
  if (input.broadcast) broadcastRollEvent(roll)
  const tAfterBroadcast = performance.now()

  logRollPerf('spell attack roll', [
    ['openDice', tRolled - tStart],
    ['persistence+displayName', tAfterPersist - tBeforePersist],
    ['broadcast', tAfterBroadcast - tAfterPersist]
  ])

  return roll
}

export type CreateSpellDamageRollInput = {
  worldId: string | number
  rollerUserId: string
  actorCharacterId: string | number
  encounterId?: string | number | null
  spellName: string
  sourceId: string
  dice: { count: number; faces: number }
  modifier: number
  damageType?: string
  visibility: RollVisibility
  metadata?: Record<string, unknown>
  broadcast: boolean
}

export async function createSpellDamageRollEvent(input: CreateSpellDamageRollInput): Promise<RollEventRecord> {
  const tStart = performance.now()
  const expression = `${input.dice.count}d${input.dice.faces}`
  const rolled = rollFormula(expression, { bonuses: [input.modifier] })
  const tRolled = performance.now()
  if (!rolled.ok) {
    throw createError({ statusCode: 400, statusMessage: rolled.error })
  }

  const row = toPersistenceRow({
    worldId: input.worldId,
    encounterId: input.encounterId ?? null,
    actorCharacterId: input.actorCharacterId,
    rollerUserId: input.rollerUserId,
    label: `${input.spellName} Damage`,
    sourceType: 'damage',
    sourceKey: null,
    sourceId: input.sourceId,
    expression: rolled.roll.expression,
    dice: rolled.roll.dice,
    modifier: rolled.roll.modifier,
    modifiers: rolled.roll.modifiers,
    total: rolled.roll.total,
    visibility: input.visibility,
    metadata: { ...(input.metadata ?? {}), ...(input.damageType ? { damageType: input.damageType } : {}) }
  })

  const tBeforePersist = performance.now()
  const [res, displayName]: [any, string] = await Promise.all([
    directusServiceRequest(`/items/${COLLECTION}`, { method: 'POST', body: row }),
    resolveOneDisplayName(input.rollerUserId)
  ])
  const tAfterPersist = performance.now()

  const roll = fromPersistenceRow(res?.data, displayName)
  if (input.broadcast) broadcastRollEvent(roll)
  const tAfterBroadcast = performance.now()

  logRollPerf('spell damage roll', [
    ['openDice', tRolled - tStart],
    ['persistence+displayName', tAfterPersist - tBeforePersist],
    ['broadcast', tAfterBroadcast - tAfterPersist]
  ])

  return roll
}

// ---------------------------------------------------------------------------
// Read -- cursor pagination, visibility filtering (§5/§7)
// ---------------------------------------------------------------------------

export type ListRollEventsInput = {
  worldId: string | number
  // The requester's own account id -- used only to let a private roll
  // remain visible to the person who made it; never trusted for anything
  // else (the actual GM-visibility decision is `canSeeGm`, resolved by the
  // route via the existing `can()`, never re-derived here).
  requesterAccountId: string
  // Whether the requester holds world.roll.see_gm for this World --
  // resolved by the caller (the route), not this module: this file has no
  // reason to know what a Principal is, matching the same decoupling
  // server/utils/world-rules-roll.ts already has from Principal's own
  // shape.
  canSeeGm: boolean
  encounterId?: string | number | null
  actorCharacterId?: string | number | null
  limit?: number
  cursor?: string | null
}

export type ListRollEventsResult = {
  rolls: RollEventRecord[]
  nextCursor: string | null
}

type RollEventsCursor = { createdAt: string; id: string }

// Opaque, not secret -- eldra-roll-system.md §7 names `nextCursor` a plain
// string with no encoding mandated. base64url of "<created_at>|<id>" is a
// keyset-pagination cursor: resuming from it means "rows strictly after
// this one, in the same (created_at desc, id desc) order the first page
// was sorted by" -- correct even when two rolls share the exact same
// millisecond timestamp, which plain "give me everything older than X"
// pagination would either duplicate or skip.
export function encodeRollEventsCursor(cursor: RollEventsCursor): string {
  return Buffer.from(`${cursor.createdAt}|${cursor.id}`, 'utf8').toString('base64url')
}

// Never throws -- a garbage or tampered cursor degrades to "start from the
// beginning" (null) rather than a 400, since this is a paging convenience,
// not a security boundary (visibility filtering, the actual boundary, is
// applied independently of whether a cursor was supplied at all).
export function decodeRollEventsCursor(raw: string): RollEventsCursor | null {
  try {
    const decoded = Buffer.from(raw, 'base64url').toString('utf8')
    const separator = decoded.indexOf('|')
    if (separator <= 0) return null

    const createdAt = decoded.slice(0, separator)
    const id = decoded.slice(separator + 1)
    if (!createdAt || !id) return null

    return { createdAt, id }
  } catch {
    return null
  }
}

function clampLimit(value: number | undefined): number {
  if (!Number.isFinite(value) || !value || (value as number) <= 0) return DEFAULT_ROLL_EVENTS_LIMIT
  return Math.min(Math.floor(value as number), MAX_ROLL_EVENTS_LIMIT)
}

// Lists this World's roll_events, newest first, applying visibility (§5)
// server-side before any row is ever serialized back to a caller --
// "GM-only values must be filtered server-side before serialization"
// (rules-engine.md §24.3), the same rule §5 already restates for rolls.
// A caller lacking world.roll.see_gm never receives another account's
// `private` row, full stop -- there is no client-side "hide the private
// ones" step this could be undone by.
export async function listRollEvents(input: ListRollEventsInput): Promise<ListRollEventsResult> {
  const pageSize = clampLimit(input.limit)

  const clauses: Record<string, unknown>[] = [{ world_id: { _eq: Number(input.worldId) } }]

  if (input.encounterId != null) {
    clauses.push({ encounter_id: { _eq: Number(input.encounterId) } })
  }
  if (input.actorCharacterId != null) {
    clauses.push({ actor_character_id: { _eq: Number(input.actorCharacterId) } })
  }

  // Visibility (§5): everyone sees `table`; a `private` row is visible
  // only to its own roller, unless the requester independently holds
  // world.roll.see_gm (in which case no filter is added at all -- a GM
  // sees every row).
  if (!input.canSeeGm) {
    clauses.push({
      _or: [
        { visibility: { _eq: 'table' } },
        { _and: [{ visibility: { _eq: 'private' } }, { roller_user_id: { _eq: input.requesterAccountId } }] }
      ]
    })
  }

  const cursor = input.cursor ? decodeRollEventsCursor(input.cursor) : null
  if (cursor) {
    // Keyset resume: strictly after the cursor row in (-created_at, -id)
    // order -- see encodeRollEventsCursor's own header for why a plain
    // "older than X" filter is not sufficient on its own.
    clauses.push({
      _or: [
        { created_at: { _lt: cursor.createdAt } },
        { _and: [{ created_at: { _eq: cursor.createdAt } }, { id: { _lt: cursor.id } }] }
      ]
    })
  }

  const filter = clauses.length === 1 ? clauses[0] : { _and: clauses }

  // Fetch one extra row past the page size -- its presence (not its
  // content) is what tells us whether a `nextCursor` should be returned at
  // all, without a separate COUNT query.
  const res: any = await directusServiceRequest(`/items/${COLLECTION}`, {
    method: 'GET',
    query: {
      filter,
      sort: ['-created_at', '-id'],
      limit: pageSize + 1
    }
  })

  const rows: any[] = Array.isArray(res?.data) ? res.data : []
  const hasMore = rows.length > pageSize
  const page = hasMore ? rows.slice(0, pageSize) : rows

  // Batch-resolved once per page, not once per row -- the same
  // dedupe-then-`_in` shape `resolveDisplayNames` already uses for a whole
  // World roster, applied here to whichever rollers actually appear on
  // this page (often the same handful of players, repeated many times).
  const displayNames = await resolveDisplayNames([...new Set(page.map((row) => String(row?.roller_user_id ?? '')))])
  const rolls = page.map((row) => fromPersistenceRow(row, displayNames.get(String(row?.roller_user_id ?? '')) || String(row?.roller_user_id ?? '')))
  const lastRow = page[page.length - 1]
  const nextCursor =
    hasMore && lastRow
      ? encodeRollEventsCursor({ createdAt: String(lastRow.created_at ?? ''), id: String(lastRow.id ?? '') })
      : null

  return { rolls, nextCursor }
}
