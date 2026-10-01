// Character Resources persistence -- D&D 2024 Character Rules Phase 2A.2.
// The Generic Character Resource system's stored half, structured exactly
// like server/utils/character-spellcasting.ts's own `expendedSlots` block --
// read that file's header first; this is the identical pattern, generalized
// from slot levels to Resource Definition ids.
//
// ONE generic block for every package-authored resource (Rage, Bardic
// Inspiration, Channel Divinity, Sorcery Points, Superiority Dice, ...),
// never one block per class/resource -- the explicit requirement this
// phase's own PERSISTENCE section states ("Do not create one block per
// class"). `block_instances` is already the polymorphic per-entity store
// every other character block lives in; an eighth block needs no migration
// and no bootstrap run.

import {
  emptyCharacterResources,
  expendResource,
  normalizeStoredResources,
  restoreResource,
  type StoredCharacterResources
} from '../../app/lib/characters/resources'
import { dxFetch } from './entity-factory'

export const CHARACTER_RESOURCES_BLOCK_KEY = 'resources'

// Sorted after 'spellcasting' (70) -- the order a character sheet presents
// the generic per-entity blocks.
const CHARACTER_RESOURCES_BLOCK_SORT = 80

export type { StoredCharacterResources }

// Reads a character's stored resource-expenditure record, or null when
// nothing was ever recorded -- true of every character predating this
// phase, and a first-class state (every acquired resource simply reads as
// zero expended), never an error.
export async function loadCharacterResources(
  characterId: string | number
): Promise<StoredCharacterResources | null> {
  const res: any = await dxFetch(
    `/items/block_instances?filter[entity_id][_eq]=${encodeURIComponent(String(characterId))}`
    + `&filter[block_key][_eq]=${CHARACTER_RESOURCES_BLOCK_KEY}&fields[]=data&limit=1`
  )

  const row = Array.isArray(res?.data) ? res.data[0] : null
  return normalizeStoredResources(row?.data ?? null)
}

// Upsert: PATCH the existing block or POST a new one -- the same
// find-then-PATCH-or-POST shape every other block write in this codebase
// uses. Takes an ALREADY-VALIDATED/already-clamped value; this function
// never clamps, never resolves a Definition, and never decides what a valid
// expenditure count is -- that authority lives entirely in
// character-resources.ts (app/lib/characters/) and the routes that call it.
export async function saveCharacterResources(
  characterId: string | number,
  stored: StoredCharacterResources
): Promise<StoredCharacterResources> {
  const existingRes: any = await dxFetch(
    `/items/block_instances?filter[entity_id][_eq]=${encodeURIComponent(String(characterId))}`
    + `&filter[block_key][_eq]=${CHARACTER_RESOURCES_BLOCK_KEY}&fields[]=id&limit=1`
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
        entity_id: characterId,
        block_key: CHARACTER_RESOURCES_BLOCK_KEY,
        label: 'Resources',
        sort: CHARACTER_RESOURCES_BLOCK_SORT,
        data: stored
      })
    })
  }

  return stored
}

// ---------------------------------------------------------------------------
// MANUAL EXPEND / RESTORE -- server-authoritative.
// ---------------------------------------------------------------------------
// Mirrors character-cast.ts's own `expendSpellSlotAuthoritatively` exactly:
// `max` is supplied by the CALLER (the route below), already read fresh off
// `getDerivedCharacter` -- never trusted from the client, never recomputed
// here (this file has no Rules Engine access and must not gain any, per
// server/utils/character-actor-bridge.ts's own "PURE ON PURPOSE" boundary
// one layer over). A player/DM button click becomes exactly one of these
// two calls; both read-modify-write the SAME persisted record a Rest
// recovery or a future authoritative action-consumption call also writes,
// so there is one serialized sequence of truth per character, not three
// independently-trusted mutation paths.
export async function expendResourceAuthoritatively(
  characterId: string | number,
  resourceId: string,
  max: number,
  amount = 1
): Promise<StoredCharacterResources> {
  const stored = (await loadCharacterResources(characterId)) ?? emptyCharacterResources()
  const nextExpended = expendResource(stored.expended, resourceId, max, amount)
  return saveCharacterResources(characterId, { expended: nextExpended })
}

export async function restoreResourceAuthoritatively(
  characterId: string | number,
  resourceId: string,
  amount = 1
): Promise<StoredCharacterResources> {
  const stored = (await loadCharacterResources(characterId)) ?? emptyCharacterResources()
  const nextExpended = restoreResource(stored.expended, resourceId, amount)
  return saveCharacterResources(characterId, { expended: nextExpended })
}
