// Safe character deletion -- Player Management (Game Admin). See
// .github/docs/architecture/ownership-and-permissions.md and this task's
// own CHARACTER DELETION section for the full dependency trace this
// implements.
//
// THE DEFECT THIS REPLACES. Both delete paths that existed before this
// module hard-deleted only the `entities` row:
//   server/api/worlds/[id]/characters/[characterId]/index.delete.ts --
//     deleted NOTHING else. No sheet, no inventory, no block_instances.
//   server/api/worlds/[id]/entities/[entityId]/index.delete.ts --
//     cascaded block_instances/entity_actions/entity_statblocks/
//     monster_profiles (the generic entity-delete pattern this module
//     extends), but never character_sheets or anything downstream of it.
// Both are reachable in production today; the standalone Characters page
// (app/pages/worlds/[id]/characters/index.vue) already calls the first
// one from a live delete button. This module is the one place both now
// go through.
//
// THE DEPENDENCY MAP, AND WHY EACH DECISION IS THE ONE IT IS -- traced
// against the live Directus schema (GET /fields/<collection>,
// GET /relations), not assumed:
//
//   character_sheets, character_sheet_inventory,
//   block_instances, entity_actions, entity_statblocks, monster_profiles
//     CASCADE DELETE. Meaningless without the entity; nothing else reads
//     them independently. The latter four reuse the exact precedent
//     already proven safe by the generic entity-delete route; the first
//     two are this module's own addition (the generic route never
//     cascaded character_sheets at all -- the gap that let a sheet
//     outlive its own entity).
//
//   roll_events
//     PRESERVED, UNTOUCHED. `actor_character_id` is a snapshot, never
//     joined back to a live entity on read (server/utils/roll-events.ts's
//     listRollEvents filters by world/visibility only) -- this is dice
//     history, not live state, and the brief is explicit: preserve it.
//
//   map_pins
//     UNTOUCHED, DELIBERATELY. The only real database-level relation to
//     `entities` in this schema (`map_pins.entity_id`, verified via
//     GET /relations) is already `ON DELETE SET NULL`. Deleting the
//     entities row below triggers it automatically; this module must not
//     also touch map_pins, or it would duplicate/race a referential
//     action Directus already owns.
//
//   character_sheet_inventory_transfers
//     DETACHED, NOT DELETED. Reuses `source_cleared_at`/`target_cleared_at`
//     -- an EXISTING, already-shipped, already-tested mechanism
//     (clearInventoryTransferHistory in
//     server/utils/character-sheet-inventory-transfers.ts) for "this side
//     no longer needs to see this transfer in their history," applied
//     per-side. The departing character's side is marked cleared; the
//     counterparty's side, and the row itself (item_name, item_snapshot,
//     quantity, every timestamp), survive untouched. This was NOT invented
//     for this task -- it is the schema's own existing answer to "how do I
//     make a transfer stop appearing for one party without destroying it
//     for the other."
//
//   entity_relationships
//     MARKED, NOT DELETED. `status` is free-text (confirmed: the only
//     client that edits it, WorldEntityRelationshipsPanel.vue, renders it
//     as a plain text input, and no code anywhere branches on a specific
//     status string) -- safe to extend with a new value,
//     'character_deleted', without touching any existing display or
//     filter logic. The row, its label/notes/metadata, and the SURVIVING
//     side's own identity all remain exactly as `normalizeRelationship`
//     (server/utils/entity-relationships.ts) already renders them when one
//     side is missing: `other: null`, no crash -- confirmed by tracing,
//     not assumed. The departing side's own entity_id is left as-is: a
//     historical fact, not something to scrub.
//
// PLAN, THEN EXECUTE -- the same shape as
// scripts/directus/lib/platform-admin-plan.mjs, for the same reason: the
// deletion-impact endpoint and the actual delete must describe the SAME
// thing, so they are built from one function rather than two
// descriptions of it that could drift. `planCharacterDeletion` gathers
// state and decides; `executeCharacterDeletion` performs exactly what was
// planned, nothing more.
import { createError } from 'h3'
import { directusServiceRequest } from './directus'
// The full character-shaped entity_type vocabulary (CLAUDE.md: "a
// 'character' is an entity with entity_type in
// character|npc|npc_sheet|pc|player_character") -- intentionally wider
// than OWNABLE_CHARACTER_ENTITY_TYPES (server/utils/character-ownership.ts),
// which is PC-only. The ORIGINAL characters/[characterId]/index.delete.ts
// accepted all five (its capability branch treated bare 'character' as
// PC-like for authorization purposes, even though
// server/utils/character-sheets.ts's own normalizeCharacterType treats it
// as an NPC alias for data purposes) -- this route preserves that same
// acceptance rather than narrowing what it will delete.
const DELETABLE_CHARACTER_ENTITY_TYPES = ['character', 'npc', 'npc_sheet', 'pc', 'player_character']

function isDeletableCharacterEntityType(value: string): boolean {
  return DELETABLE_CHARACTER_ENTITY_TYPES.includes(value.toLowerCase())
}

export type CharacterDeletionPlan = {
  worldId: string
  entityId: string
  title: string
  entityType: string
  // Rows that will be hard-deleted.
  sheets: { count: number; ids: string[] }
  inventoryRows: { count: number; ids: string[] }
  blockInstances: number
  entityActions: number
  entityStatblocks: number
  monsterProfiles: number
  // Rows that will be marked/detached, never deleted.
  transfersToDetach: { count: number; ids: string[] }
  relationshipsToMark: { count: number; ids: string[] }
  // Informational only -- untouched by execution.
  rollEventsPreserved: number
  mapPinsToUnlink: number
}

async function listIds(collection: string, filter: Record<string, unknown>): Promise<string[]> {
  const res: any = await directusServiceRequest(`/items/${collection}`, {
    method: 'GET',
    query: { filter, limit: -1, fields: 'id' }
  })
  return (Array.isArray(res?.data) ? res.data : []).map((row: any) => String(row.id))
}

async function countRows(collection: string, filter: Record<string, unknown>): Promise<number> {
  const res: any = await directusServiceRequest(`/items/${collection}`, {
    method: 'GET',
    query: { filter, limit: 1, meta: 'filter_count' }
  })
  return Number(res?.meta?.filter_count ?? (Array.isArray(res?.data) ? res.data.length : 0))
}

// Gathers every fact needed to decide the plan, then decides it. Shared by
// both computeDeletionImpact (read-only) and the delete path (which calls
// this, then executes exactly what it returned).
export async function planCharacterDeletion(
  worldId: string | number,
  entityId: string | number
): Promise<CharacterDeletionPlan> {
  const entityRes: any = await directusServiceRequest(`/items/entities/${entityId}`, {
    method: 'GET',
    query: { fields: 'id,world_id,title,entity_type' }
  })

  const entity = entityRes?.data ?? null
  if (!entity || String(entity.world_id) !== String(worldId)) {
    throw createError({ statusCode: 404, statusMessage: 'Character not found in this world' })
  }

  const sheetIds = await listIds('character_sheets', {
    _and: [{ world_id: { _eq: Number(worldId) } }, { entity_id: { _eq: Number(entityId) } }]
  })

  const inventoryRowIds =
    sheetIds.length === 0
      ? []
      : await listIds('character_sheet_inventory', { sheet_id: { _in: sheetIds.map(Number) } })

  const [blockInstances, entityActions, entityStatblocks, monsterProfiles] = await Promise.all([
    countRows('block_instances', { entity_id: { _eq: Number(entityId) } }),
    countRows('entity_actions', { entity_id: { _eq: Number(entityId) } }),
    countRows('entity_statblocks', { entity_id: { _eq: Number(entityId) } }),
    countRows('monster_profiles', { entity_id: { _eq: Number(entityId) } })
  ])

  const transferIds = await listIds('character_sheet_inventory_transfers', {
    _and: [
      { world_id: { _eq: Number(worldId) } },
      { _or: [{ source_entity_id: { _eq: Number(entityId) } }, { target_entity_id: { _eq: Number(entityId) } }] }
    ]
  })

  const relationshipIds = await listIds('entity_relationships', {
    _and: [
      { world_id: { _eq: Number(worldId) } },
      { _or: [{ source_entity_id: { _eq: Number(entityId) } }, { target_entity_id: { _eq: Number(entityId) } }] }
    ]
  })

  const [rollEventsPreserved, mapPinsToUnlink] = await Promise.all([
    countRows('roll_events', { actor_character_id: { _eq: Number(entityId) } }),
    countRows('map_pins', { entity_id: { _eq: Number(entityId) } })
  ])

  return {
    worldId: String(worldId),
    entityId: String(entity.id),
    title: String(entity.title ?? ''),
    entityType: String(entity.entity_type ?? ''),
    sheets: { count: sheetIds.length, ids: sheetIds },
    inventoryRows: { count: inventoryRowIds.length, ids: inventoryRowIds },
    blockInstances,
    entityActions,
    entityStatblocks,
    monsterProfiles,
    transfersToDetach: { count: transferIds.length, ids: transferIds },
    relationshipsToMark: { count: relationshipIds.length, ids: relationshipIds },
    rollEventsPreserved,
    mapPinsToUnlink
  }
}

async function deleteByIds(collection: string, ids: readonly string[]): Promise<void> {
  for (const id of ids) {
    await directusServiceRequest(`/items/${collection}/${id}`, { method: 'DELETE' })
  }
}

async function detachTransfers(entityId: string, transferIds: readonly string[]): Promise<void> {
  if (transferIds.length === 0) return

  const res: any = await directusServiceRequest('/items/character_sheet_inventory_transfers', {
    method: 'GET',
    query: {
      filter: { id: { _in: transferIds.map(Number) } },
      limit: -1,
      fields: 'id,source_entity_id,target_entity_id,source_cleared_at,target_cleared_at'
    }
  })

  const now = new Date().toISOString()
  for (const row of Array.isArray(res?.data) ? res.data : []) {
    const patch: Record<string, string> = {}
    if (String(row.source_entity_id) === entityId && !row.source_cleared_at) {
      patch.source_cleared_at = now
    }
    if (String(row.target_entity_id) === entityId && !row.target_cleared_at) {
      patch.target_cleared_at = now
    }
    if (Object.keys(patch).length > 0) {
      await directusServiceRequest(`/items/character_sheet_inventory_transfers/${row.id}`, {
        method: 'PATCH',
        body: patch
      })
    }
  }
}

function deletedCharacterNote(title: string): string {
  return `[Automatic] "${title}" was deleted on ${new Date().toISOString()}. This relationship record is preserved for history; the character it references no longer exists.`
}

async function markRelationships(relationshipIds: readonly string[], title: string): Promise<void> {
  for (const id of relationshipIds) {
    const res: any = await directusServiceRequest(`/items/entity_relationships/${id}`, {
      method: 'GET',
      query: { fields: 'id,notes' }
    })
    const existingNotes = String(res?.data?.notes ?? '').trim()
    const notes = existingNotes ? `${existingNotes}\n\n${deletedCharacterNote(title)}` : deletedCharacterNote(title)

    await directusServiceRequest(`/items/entity_relationships/${id}`, {
      method: 'PATCH',
      body: { status: 'character_deleted', notes }
    })
  }
}

export type CharacterDeletionResult = {
  plan: CharacterDeletionPlan
}

// Executes exactly the plan planCharacterDeletion already described.
// Order matters: detach/mark BEFORE the hard deletes (both read rows this
// function is about to make unreachable by entity_id lookups once the
// sheets/entity are gone), and the `entities` row itself is deleted LAST
// so map_pins' own ON DELETE SET NULL relation fires only once everything
// else has already been handled.
//
// Takes an ALREADY-COMPUTED plan rather than re-deriving one, so a caller
// that needed the plan anyway (e.g. to decide authorization by entity
// type, as index.delete.ts does) never pays for the dependency scan
// twice. `deleteCharacterWithPlan` below is the convenience wrapper for a
// caller that has not computed one yet.
export async function executeCharacterDeletion(plan: CharacterDeletionPlan): Promise<CharacterDeletionResult> {
  if (!isDeletableCharacterEntityType(plan.entityType)) {
    // Not a character-shaped entity -- this route is for characters, not
    // arbitrary entities (that is the generic
    // entities/[entityId]/index.delete.ts route's job).
    throw createError({
      statusCode: 400,
      statusMessage: `Entity type "${plan.entityType}" is not a character -- use the generic entity delete route instead`
    })
  }

  await detachTransfers(plan.entityId, plan.transfersToDetach.ids)
  await markRelationships(plan.relationshipsToMark.ids, plan.title)

  await deleteByIds('character_sheet_inventory', plan.inventoryRows.ids)

  // block_instances/entity_actions/entity_statblocks/monster_profiles are
  // keyed by entity_id directly (not by sheet id, unlike inventory above)
  // -- same cascade precedent the generic entity-delete route already
  // uses, resolved by filter here rather than threading four more id
  // lists through the plan object.
  await deleteManyByFilter('block_instances', { entity_id: { _eq: Number(plan.entityId) } })
  await deleteManyByFilter('entity_actions', { entity_id: { _eq: Number(plan.entityId) } })
  await deleteManyByFilter('entity_statblocks', { entity_id: { _eq: Number(plan.entityId) } })
  await deleteManyByFilter('monster_profiles', { entity_id: { _eq: Number(plan.entityId) } })

  await deleteByIds('character_sheets', plan.sheets.ids)

  // The entities row, last -- triggers map_pins' own SET NULL relation.
  await directusServiceRequest(`/items/entities/${plan.entityId}`, { method: 'DELETE' })

  return { plan }
}

// Convenience: plan, then execute, in one call -- for a caller with no
// reason to look at the plan before committing to the delete.
export async function deleteCharacterWithPlan(
  worldId: string | number,
  entityId: string | number
): Promise<CharacterDeletionResult> {
  const plan = await planCharacterDeletion(worldId, entityId)
  return await executeCharacterDeletion(plan)
}

async function deleteManyByFilter(collection: string, filter: Record<string, unknown>): Promise<void> {
  const ids = await listIds(collection, filter)
  await deleteByIds(collection, ids)
}
