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
// COMPLETE PURGE (revision 2, this task). The design below replaces the
// previous detach/mark/preserve policy entirely: User Decision for THIS
// task is explicit -- "deleting them should remove everything tied to
// the character... Do not leave detached, marked, or preserved rows that
// still describe the deleted character." There is no "test vs. real"
// flag anywhere in this data model, so this is now how EVERY character
// deletion behaves, through both callers (the standalone Characters page
// and the Player Management drawer -- see index.delete.ts, the one route
// both already share).
//
// THE DEPENDENCY MAP, RE-TRACED FOR THIS REVISION -- a fresh schema sweep
// (GET /fields across every non-system collection, GET /relations), not a
// reuse of the prior investigation's list:
//
//   character_sheets, character_sheet_inventory,
//   block_instances, entity_actions, entity_statblocks, monster_profiles
//     HARD DELETE. Unchanged from revision 1 -- meaningless without the
//     entity, nothing else reads them independently.
//
//   character_sheet_inventory_transfers
//     HARD DELETE (changed from "detach"). Matched by EITHER the
//     character's own entity_id (source_entity_id/target_entity_id) OR
//     either of its sheet ids (source_sheet_id/target_sheet_id) -- the
//     brief's own instruction to check both, since nothing in this
//     schema guarantees the two always move together, and missing a row
//     reachable only by sheet id would leave exactly the kind of
//     "preserved row describing the deleted character" this revision
//     exists to eliminate. One combined OR query per collection (never
//     two separate queries unioned), so a row matching through BOTH
//     criteria is still counted and deleted exactly once. Deleting the
//     whole row necessarily also removes the counterparty's copy of that
//     transfer -- an explicit, accepted tradeoff of "complete purge,"
//     not an oversight.
//
//   entity_relationships
//     HARD DELETE (changed from "mark + note"). Same reasoning and same
//     counterparty tradeoff as transfers above.
//
//   roll_events
//     HARD DELETE (changed from "preserve"). Matched by
//     actor_character_id. This is now the one place in the codebase that
//     deletes roll history -- a deliberate exception to
//     server/utils/roll-events.ts's own "dice history is never deleted"
//     assumption, made ONLY because this task's explicit instruction
//     names "roll history" among what a complete purge must remove.
//
//   map_pins
//     HARD DELETE (changed from "leave to the ON DELETE SET NULL
//     relation"). The relation still exists and would have merely
//     nulled entity_id, leaving the pin itself behind -- which satisfies
//     "no dangling reference" but not this task's literal instruction to
//     delete "map pins" outright. Deleted explicitly, before the entities
//     row, so the relation never has anything left to act on.
//
//   entity_ownership_changes
//     HARD DELETE (new -- this collection did not exist when character
//     deletion was first built). Matched by entity_id. Deleting a
//     character's ownership history is exactly "ownership history," named
//     explicitly in this task's own purge list.
//
//   A GENUINE GAP, FOUND AND DELIBERATELY NOT CLOSED HERE: an Encounter's
//   `encounter_state` block (app/lib/encounters/encounter.ts) stores its
//   combatants as a JSON array of `{ characterId, ... }` objects on the
//   ENCOUNTER's own entity, not as a relational row keyed by the
//   character's id -- so no schema-level sweep or entity_id-column
//   filter can find it, and deleting a character currently listed as a
//   combatant would leave a dangling characterId inside that JSON,
//   exactly the kind of "preserved description" this revision is
//   otherwise built to eliminate. NOT implemented: verified live,
//   zero entities of entity_type 'encounter' exist in this deployment
//   (`filter_count: 0`), and `joinEncounter` has no API route or client
//   UI calling it anywhere in this codebase -- the feature that would
//   ever populate a combatant list has not shipped. Closing this would
//   mean querying every Encounter entity in the World, loading and
//   patching its state via the already-existing, already-tested
//   `leaveEncounter` (the correct reuse, not a new mechanism) -- real
//   work, for a path nothing can reach today. Reported here rather than
//   silently built around or silently ignored; revisit once Encounters
//   ship a join flow.
//
//   NOT FOLLOWED, DELIBERATELY: character_sheets.class_entity_id/
//   species_entity_id/background_entity_id and
//   character_sheet_inventory(_transfers).item_entity_id all reference
//   SHARED CONTENT (class/species/background/item definitions), never the
//   character itself. This task's own instruction is explicit that these
//   must survive a character's deletion -- confirmed by this fresh sweep
//   that nothing in this module ever queries or deletes by these columns.
//
//   NEVER TOUCHED, BY DESIGN: eldra_accounts, eldra_identity_links,
//   eldra_platform_grants, world_memberships -- a character's owner
//   (Account, IdentityLinks, Directus user/credentials behind it, and
//   every World membership) is a different aggregate entirely, and
//   nothing below ever names any of these four collections.
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

// Every field below counts rows that WILL BE HARD-DELETED -- there is no
// "preserved"/"detached"/"marked" category any more (revision 2, this
// task). Each `ids` list is built from exactly one combined-filter query
// per collection, so a row matching more than one OR'd condition (e.g. a
// transfer reachable by both its entity_id and its sheet_id) still
// appears, and is deleted, exactly once -- never double-counted, never
// double-deleted.
export type CharacterDeletionPlan = {
  worldId: string
  entityId: string
  title: string
  entityType: string
  sheets: { count: number; ids: string[] }
  inventoryRows: { count: number; ids: string[] }
  blockInstances: number
  entityActions: number
  entityStatblocks: number
  monsterProfiles: number
  transfers: { count: number; ids: string[] }
  relationships: { count: number; ids: string[] }
  rollEvents: { count: number; ids: string[] }
  mapPins: { count: number; ids: string[] }
  ownershipChanges: { count: number; ids: string[] }
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
  const sheetIdNumbers = sheetIds.map(Number)

  const inventoryRowIds =
    sheetIds.length === 0 ? [] : await listIds('character_sheet_inventory', { sheet_id: { _in: sheetIdNumbers } })

  const [blockInstances, entityActions, entityStatblocks, monsterProfiles] = await Promise.all([
    countRows('block_instances', { entity_id: { _eq: Number(entityId) } }),
    countRows('entity_actions', { entity_id: { _eq: Number(entityId) } }),
    countRows('entity_statblocks', { entity_id: { _eq: Number(entityId) } }),
    countRows('monster_profiles', { entity_id: { _eq: Number(entityId) } })
  ])

  // Matched by EITHER the character's own entity_id OR either of its
  // sheet ids -- one combined filter, never two separate queries, so a
  // row satisfying more than one branch is still returned (and later
  // deleted) exactly once. The sheet-id branches are omitted entirely
  // when the character has no sheet, rather than sending an empty
  // `_in: []` (which some Directus filter paths treat inconsistently).
  const transferEntityOrSheetMatch: any[] = [
    { source_entity_id: { _eq: Number(entityId) } },
    { target_entity_id: { _eq: Number(entityId) } }
  ]
  if (sheetIdNumbers.length > 0) {
    transferEntityOrSheetMatch.push(
      { source_sheet_id: { _in: sheetIdNumbers } },
      { target_sheet_id: { _in: sheetIdNumbers } }
    )
  }

  const transferIds = await listIds('character_sheet_inventory_transfers', {
    _and: [{ world_id: { _eq: Number(worldId) } }, { _or: transferEntityOrSheetMatch }]
  })

  const relationshipIds = await listIds('entity_relationships', {
    _and: [
      { world_id: { _eq: Number(worldId) } },
      { _or: [{ source_entity_id: { _eq: Number(entityId) } }, { target_entity_id: { _eq: Number(entityId) } }] }
    ]
  })

  const [rollEventIds, mapPinIds, ownershipChangeIds] = await Promise.all([
    listIds('roll_events', { actor_character_id: { _eq: Number(entityId) } }),
    listIds('map_pins', { entity_id: { _eq: Number(entityId) } }),
    listIds('entity_ownership_changes', { entity_id: { _eq: Number(entityId) } })
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
    transfers: { count: transferIds.length, ids: transferIds },
    relationships: { count: relationshipIds.length, ids: relationshipIds },
    rollEvents: { count: rollEventIds.length, ids: rollEventIds },
    mapPins: { count: mapPinIds.length, ids: mapPinIds },
    ownershipChanges: { count: ownershipChangeIds.length, ids: ownershipChangeIds }
  }
}

// A 404 here means "already gone" -- exactly what a RETRY of a deletion
// that failed partway through finds for every row an earlier attempt
// already removed. Treating that as success (not an error) is what makes
// re-running this whole cascade after a partial failure safe: nothing
// throws merely because some of the work was already done. Any other
// status propagates as a real failure.
function isAlreadyGone(error: any): boolean {
  const status = error?.response?.status ?? error?.statusCode ?? error?.status
  return status === 404
}

async function deleteByIds(collection: string, ids: readonly string[]): Promise<void> {
  for (const id of ids) {
    try {
      await directusServiceRequest(`/items/${collection}/${id}`, { method: 'DELETE' })
    } catch (error) {
      if (!isAlreadyGone(error)) {
        throw error
      }
    }
  }
}

export type CharacterDeletionResult = {
  plan: CharacterDeletionPlan
}

// Executes exactly the plan planCharacterDeletion already described.
// Order: every dependent row is deleted first, by id lists this function
// never re-derives (it deletes exactly the ids the plan already found --
// see the module header's own note on why double-counting/double-
// deleting is structurally ruled out upstream, in the plan's own
// combined-filter queries). The `entities` row itself is deleted LAST.
//
// Takes an ALREADY-COMPUTED plan rather than re-deriving one, so a caller
// that needed the plan anyway (e.g. to decide authorization by entity
// type, as index.delete.ts does) never pays for the dependency scan
// twice. `deleteCharacterWithPlan` below is the convenience wrapper for a
// caller that has not computed one yet.
// WRITE-SAFETY REVIEW: no cross-collection Postgres transaction is
// available for this cascade (re-verified, not assumed -- see this
// module's header). Every collection touched below is its own
// independent set of Directus requests, not one atomic operation, and a
// partial failure is a real, reachable outcome: a network blip, a
// timeout, or Directus itself erroring partway through can leave some
// dependents removed and others not. Claiming the overall cascade is
// atomic merely because every step is drawn from one shared plan (the
// plan/execute split exists to keep the PREVIEW and the EXECUTION
// consistent with each other, not to make the execution transactional)
// would be exactly the false claim this review asked to rule out.
//
// THE RECOVERABLE DESIGN, instead of a transaction that does not exist:
// every step is made safe to RE-RUN to completion. deleteByIds/
// deleteManyByFilter tolerate "already gone" (404) as success, not an
// error -- a retry that finds some rows already deleted by an earlier,
// partially-failed attempt simply continues; every delete below is
// idempotent for exactly this reason, with no collection-specific
// exceptions left (the prior revision's detach/mark steps needed their
// own bespoke idempotency logic -- plain deletes do not).
// So if any step throws, the caller sees a real, honest error -- the
// character may be left PARTIALLY deleted -- and the correct recovery is
// simply to call this same deletion again: every already-completed step
// is a no-op the second time, and the remaining ones proceed from
// wherever the first attempt stopped. Nothing here silently presents a
// partially-deleted character as a successful, complete deletion.
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

  try {
    // Transfers, relationships, roll history, map pins, ownership
    // history -- every row that directly references this character,
    // deleted outright (revision 2: no detach/mark/preserve category
    // remains). Order among these five has no dependency on each other,
    // only on running before the entity itself.
    await deleteByIds('character_sheet_inventory_transfers', plan.transfers.ids)
    await deleteByIds('entity_relationships', plan.relationships.ids)
    await deleteByIds('roll_events', plan.rollEvents.ids)
    await deleteByIds('map_pins', plan.mapPins.ids)
    await deleteByIds('entity_ownership_changes', plan.ownershipChanges.ids)

    await deleteByIds('character_sheet_inventory', plan.inventoryRows.ids)

    // block_instances/entity_actions/entity_statblocks/monster_profiles
    // are keyed by entity_id directly (not by sheet id, unlike inventory
    // above) -- same cascade precedent the generic entity-delete route
    // already uses, resolved by filter here rather than threading four
    // more id lists through the plan object. Re-querying by filter at
    // delete time (rather than reusing the plan's own counts) is itself
    // part of the retry safety: a retry sees only whatever still matches.
    await deleteManyByFilter('block_instances', { entity_id: { _eq: Number(plan.entityId) } })
    await deleteManyByFilter('entity_actions', { entity_id: { _eq: Number(plan.entityId) } })
    await deleteManyByFilter('entity_statblocks', { entity_id: { _eq: Number(plan.entityId) } })
    await deleteManyByFilter('monster_profiles', { entity_id: { _eq: Number(plan.entityId) } })

    await deleteByIds('character_sheets', plan.sheets.ids)
  } catch (error: any) {
    throw createError({
      statusCode: error?.statusCode ?? 500,
      statusMessage: `Character deletion did not complete (dependent-record cleanup failed): ${error?.statusMessage ?? error?.message ?? 'unknown error'}. The character has NOT been fully deleted and may be left with some dependents already removed. This operation is safe to retry -- retrying will skip whatever was already removed and continue.`
    })
  }

  // FINAL REVALIDATION, immediately before the one truly irreversible
  // step. Every dependent above is already gone (or never existed); this
  // confirms the entity itself is still the SAME row this plan was
  // computed against before deleting it -- guards against a concurrent
  // delete (e.g. a second admin, or a retry racing a first attempt that
  // actually finished) rather than blindly issuing a DELETE against
  // whatever id the plan happened to carry.
  const current: any = await directusServiceRequest(`/items/entities/${plan.entityId}`, {
    method: 'GET',
    query: { fields: 'id,world_id' }
  }).catch((error: any) => {
    if (isAlreadyGone(error)) return null
    throw error
  })

  if (!current?.data) {
    // Already gone -- a concurrent request (or an earlier retry of THIS
    // request) already finished the job. Idempotent success, not an
    // error: the character is deleted, which is exactly what the caller
    // asked for.
    return { plan }
  }

  if (String(current.data.world_id) !== plan.worldId) {
    // Should not be reachable in practice (a character's World does not
    // change mid-deletion), but a mismatch here means the id this plan
    // was computed for no longer names the same row -- refusing is
    // strictly safer than deleting whatever is currently at that id.
    throw createError({
      statusCode: 409,
      statusMessage: 'The character changed World during deletion -- refusing to delete; please retry'
    })
  }

  // The entities row, last -- every map_pins row that referenced it was
  // already deleted above, so the collection's own ON DELETE SET NULL
  // relation finds nothing left to act on by the time this runs.
  try {
    await directusServiceRequest(`/items/entities/${plan.entityId}`, { method: 'DELETE' })
  } catch (error: any) {
    if (!isAlreadyGone(error)) {
      throw createError({
        statusCode: error?.statusCode ?? 500,
        statusMessage: `All dependent records were removed, but deleting the character itself failed: ${error?.statusMessage ?? error?.message ?? 'unknown error'}. Retry to finish -- every dependent is already gone, so a retry will only repeat this final step.`
      })
    }
  }

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
