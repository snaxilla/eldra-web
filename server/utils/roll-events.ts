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
import { directusServiceRequest } from './directus'

const COLLECTION = 'roll_events'

// Paging defaults -- eldra-roll-system.md §7's own `?limit=&cursor=`
// contract names no specific numbers; picked once, here, so the route and
// this module never drift on what "no limit given" or "too large a limit"
// means.
export const DEFAULT_ROLL_EVENTS_LIMIT = 50
export const MAX_ROLL_EVENTS_LIMIT = 200

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

function fromPersistenceRow(row: any): RollEventRecord {
  return {
    id: String(row?.id ?? ''),
    worldId: String(row?.world_id ?? ''),
    encounterId: row?.encounter_id != null ? String(row.encounter_id) : null,
    actorCharacterId: row?.actor_character_id != null ? String(row.actor_character_id) : null,
    rollerUserId: String(row?.roller_user_id ?? ''),
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
  const rolled = rollFormula(input.expression)

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

  const res: any = await directusServiceRequest(`/items/${COLLECTION}`, {
    method: 'POST',
    body: row
  })

  return fromPersistenceRow(res?.data)
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

  const rolls = page.map(fromPersistenceRow)
  const lastRow = page[page.length - 1]
  const nextCursor =
    hasMore && lastRow
      ? encodeRollEventsCursor({ createdAt: String(lastRow.created_at ?? ''), id: String(lastRow.id ?? '') })
      : null

  return { rolls, nextCursor }
}
