// Character Health persistence -- the Health System's stored half.
//
// The single server-side owner of the `health` block: the one place that
// knows which block_key holds a character's current/temporary HP, spent
// hit dice, and death save marks, and the one place that writes them.
// Route handlers stay thin (parse params -> call a util -> return), matching
// this codebase's own documented convention -- and the SAME pattern
// server/utils/character-ability-scores.ts already established for the
// first piece of player-authored numeric state this Character Architecture
// ever persisted.
//
// ---------------------------------------------------------------------------
// WHY A NEW BLOCK_KEY, AND NO SCHEMA CHANGE
// ---------------------------------------------------------------------------
// `block_instances` is already the polymorphic per-entity store the new
// architecture keeps its player data in -- alongside `catalogue_selection`,
// `ability_scores`, `rules_choices`, `inventory`, and `notes`. A sixth block
// needs no migration and no bootstrap run.
//
// Health resolves against nothing -- unlike `catalogue_selection`, which
// character-assembly.ts re-verifies against the World's current catalogue
// on every read, current HP, temporary HP, hit dice spent, and death save
// marks are the player's own numbers, valid regardless of what any Content
// Pack currently binds. Same reasoning ability_scores.ts already recorded,
// applied to a fourth data shape.

import {
  normalizeStoredCharacterHealth,
  type StoredCharacterHealth
} from '../../app/lib/characters/health'
import { dxFetch } from './entity-factory'

export const CHARACTER_HEALTH_BLOCK_KEY = 'health'

// Sorted after 'notes' (50), which follows 'inventory' (40),
// 'rules_choices' (30), 'ability_scores' (20), and 'catalogue_selection'
// (10) -- the order a character sheet presents them.
const CHARACTER_HEALTH_BLOCK_SORT = 60

export type { StoredCharacterHealth }

// Reads a character's stored health, or null when nothing was ever recorded
// -- the state every character predating this milestone is in, and a
// first-class result rather than an error.
export async function loadCharacterHealth(
  characterId: string | number
): Promise<StoredCharacterHealth | null> {
  const res: any = await dxFetch(
    `/items/block_instances?filter[entity_id][_eq]=${encodeURIComponent(String(characterId))}`
    + `&filter[block_key][_eq]=${CHARACTER_HEALTH_BLOCK_KEY}&fields[]=data&limit=1`
  )

  const row = Array.isArray(res?.data) ? res.data[0] : null
  return normalizeStoredCharacterHealth(row?.data ?? null)
}

// Upsert: PATCH the existing block or POST a new one -- the same
// find-then-PATCH-or-POST shape every other block write in this codebase
// uses.
//
// Takes an ALREADY-VALIDATED value: validation is the caller's job (the
// route rejects with 400), so this function cannot be the place a bad
// record slips through unnoticed.
export async function saveCharacterHealth(
  characterId: string | number,
  stored: StoredCharacterHealth
): Promise<StoredCharacterHealth> {
  const existingRes: any = await dxFetch(
    `/items/block_instances?filter[entity_id][_eq]=${encodeURIComponent(String(characterId))}`
    + `&filter[block_key][_eq]=${CHARACTER_HEALTH_BLOCK_KEY}&fields[]=id&limit=1`
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
        block_key: CHARACTER_HEALTH_BLOCK_KEY,
        label: 'Health',
        sort: CHARACTER_HEALTH_BLOCK_SORT,
        data: stored
      })
    })
  }

  return stored
}
