// Character Notes persistence -- the second V1 feature migrated onto the
// new Character Architecture, following the pattern
// server/utils/character-inventory.ts established.
//
// The single server-side owner of the `notes` block: the one place that
// knows which block_key holds a character's free text, and the one place
// that writes it. Route handlers stay thin (parse params -> call a util ->
// return), matching this codebase's own documented convention.
//
// ---------------------------------------------------------------------------
// WHY NOT V1's NOTES STORAGE
// ---------------------------------------------------------------------------
// V1's Notes tab persists through the generic entity block route
// (server/utils/character-sheet-notes.ts), an open-ended LIST of
// arbitrarily many title+body cards. This feature is a different, fixed
// shape (six named fields), so it is a new block key rather than a shape
// squeezed into the old one -- exactly as Inventory's new `inventory` block
// sits beside, not inside, `character_sheet_inventory`.
//
// This uses `block_instances`, the polymorphic per-entity store the new
// architecture already keeps its player data in -- alongside
// `catalogue_selection`, `ability_scores`, `rules_choices`, and `inventory`.
// No schema change, no bootstrap run.

import {
  normalizeStoredCharacterNotes,
  type StoredCharacterNotes
} from '../../app/lib/characters/character-notes'
import { dxFetch } from './entity-factory'

export const CHARACTER_NOTES_BLOCK_KEY = 'notes'

// Sorted after 'inventory' (40), which follows 'rules_choices' (30),
// 'ability_scores' (20), and 'catalogue_selection' (10) -- the order a
// character sheet presents them.
const CHARACTER_NOTES_BLOCK_SORT = 50

export type { StoredCharacterNotes }

// Reads a character's stored notes, or null when nothing was ever recorded
// -- the state every character predating this migration is in, and a
// first-class result rather than an error.
export async function loadCharacterNotes(
  characterId: string | number
): Promise<StoredCharacterNotes | null> {
  const res: any = await dxFetch(
    `/items/block_instances?filter[entity_id][_eq]=${encodeURIComponent(String(characterId))}`
    + `&filter[block_key][_eq]=${CHARACTER_NOTES_BLOCK_KEY}&fields[]=data&limit=1`
  )

  const row = Array.isArray(res?.data) ? res.data[0] : null
  return normalizeStoredCharacterNotes(row?.data ?? null)
}

// Upsert: PATCH the existing block or POST a new one -- the same
// find-then-PATCH-or-POST shape every other block write in this codebase
// uses.
//
// Takes an ALREADY-VALIDATED value: validation is the caller's job (the
// route rejects with 400), so this function cannot be the place a bad
// record slips through unnoticed.
export async function saveCharacterNotes(
  characterId: string | number,
  stored: StoredCharacterNotes
): Promise<StoredCharacterNotes> {
  const existingRes: any = await dxFetch(
    `/items/block_instances?filter[entity_id][_eq]=${encodeURIComponent(String(characterId))}`
    + `&filter[block_key][_eq]=${CHARACTER_NOTES_BLOCK_KEY}&fields[]=id&limit=1`
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
        block_key: CHARACTER_NOTES_BLOCK_KEY,
        label: 'Notes',
        sort: CHARACTER_NOTES_BLOCK_SORT,
        data: stored
      })
    })
  }

  return stored
}
