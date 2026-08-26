// Encounter persistence -- the Encounter Management System's stored half.
//
// The single server-side owner of an Encounter's `entities` row and its
// `encounter_state` block: the one place that creates/reads the entity, and
// the one place that reads/writes its state block. Route handlers stay thin
// (parse params -> call a util -> return), matching this codebase's own
// documented convention -- the same pattern character-health.ts already
// established for a character's own blocks.
//
// ---------------------------------------------------------------------------
// AN ENCOUNTER IS AN ENTITY, NOT A NEW DIRECTUS COLLECTION
// ---------------------------------------------------------------------------
// `entity_type` is a free-form string (server/utils/entity-factory.ts's own
// `CreateEntityArgs`) -- creating one with `entity_type: 'encounter'` needs
// no schema change and no `bootstrap.mjs` run, the exact "no new collection,
// no migration" property `character-health.ts`'s own header already claims
// for a SIXTH character block; this is that same claim for a whole new kind
// of entity. `GET /api/worlds/:id/entities?type=encounter` (already
// generic, server/api/worlds/[id]/entities.get.ts) lists every Encounter in
// a World with zero new server code.

import { createEntityRecord, dxFetch } from './entity-factory'
import {
  emptyEncounterState,
  normalizeStoredEncounterState,
  type StoredEncounterState
} from '../../app/lib/encounters/encounter'

export const ENCOUNTER_ENTITY_TYPE = 'encounter'
export const ENCOUNTER_STATE_BLOCK_KEY = 'encounter_state'

export type EncounterEntity = {
  id: string
  worldId: string
  title: string
}

export type { StoredEncounterState }

// Creates the encounter's `entities` row and its initial (empty)
// `encounter_state` block in one call -- there is no "entity exists but has
// no state block yet" intermediate state for an Encounter, unlike a
// Character (which predates every block this architecture has added since).
export async function createEncounter(worldId: string | number, title: string): Promise<EncounterEntity> {
  const entity = await createEntityRecord({
    worldId: String(worldId),
    title,
    entityType: ENCOUNTER_ENTITY_TYPE
  })

  await saveEncounterState(entity.id, emptyEncounterState())

  return { id: String(entity.id), worldId: String(worldId), title: entity.title }
}

// Reads the encounter's own entity row, or null when it does not exist OR
// does not belong to this World OR is not actually an Encounter -- the same
// three-way "not found" collapse every character route's own scope check
// already performs (ownership-and-permissions.md §9.4: worldId from the URL
// is not self-authorizing).
export async function loadEncounterEntity(
  worldId: string | number,
  encounterId: string | number
): Promise<EncounterEntity | null> {
  const res: any = await dxFetch(`/items/entities/${encounterId}?fields=id,world_id,title,entity_type`)
  const entity = res?.data || null

  if (!entity) return null
  if (String(entity.world_id) !== String(worldId)) return null
  if (String(entity.entity_type) !== ENCOUNTER_ENTITY_TYPE) return null

  return { id: String(entity.id), worldId: String(worldId), title: String(entity.title || '') }
}

// Reads the encounter's stored state, or null when nothing was ever
// recorded -- mirrors loadCharacterHealth's identical "first-class result,
// not an error" reading. In practice this is only null before
// createEncounter's own initial save, since nothing else creates an
// Encounter entity without one.
export async function loadEncounterState(encounterId: string | number): Promise<StoredEncounterState | null> {
  const res: any = await dxFetch(
    `/items/block_instances?filter[entity_id][_eq]=${encodeURIComponent(String(encounterId))}`
    + `&filter[block_key][_eq]=${ENCOUNTER_STATE_BLOCK_KEY}&fields[]=data&limit=1`
  )

  const row = Array.isArray(res?.data) ? res.data[0] : null
  return normalizeStoredEncounterState(row?.data ?? null)
}

// Upsert: PATCH the existing block or POST a new one -- the same
// find-then-PATCH-or-POST shape every other block write in this codebase
// uses.
export async function saveEncounterState(
  encounterId: string | number,
  stored: StoredEncounterState
): Promise<StoredEncounterState> {
  const existingRes: any = await dxFetch(
    `/items/block_instances?filter[entity_id][_eq]=${encodeURIComponent(String(encounterId))}`
    + `&filter[block_key][_eq]=${ENCOUNTER_STATE_BLOCK_KEY}&fields[]=id&limit=1`
  )

  const existing = Array.isArray(existingRes?.data) ? existingRes.data[0] : null

  if (existing?.id) {
    await dxFetch(`/items/block_instances/${existing.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ data: stored })
    })
  } else {
    await dxFetch('/items/block_instances', {
      method: 'POST',
      body: JSON.stringify({
        entity_id: encounterId,
        block_key: ENCOUNTER_STATE_BLOCK_KEY,
        label: 'Encounter State',
        sort: 10,
        data: stored
      })
    })
  }

  return stored
}
