// Character Inventory persistence -- the first V1 feature migrated onto the
// new Character Architecture.
//
// The single server-side owner of the `inventory` block: the one place that
// knows which block_key holds what a character carries, and the one place
// that writes it. Route handlers stay thin (parse params -> call a util ->
// return), matching this codebase's own documented convention.
//
// ---------------------------------------------------------------------------
// WHY NOT `character_sheet_inventory`
// ---------------------------------------------------------------------------
// V1's inventory lives in a dedicated Directus collection keyed by `sheet_id`
// -- the primary key of a `character_sheets` row. Characters created through
// the catalogue-driven flow have no such row, so that table cannot hold their
// inventory at all: the key it is keyed by does not exist. Re-keying it on
// `entity_id` would mean migrating a live table that the V1 sheet, the item
// transfer system, and its realtime bridge all still read.
//
// So this uses `block_instances`, the polymorphic per-entity store the new
// architecture already keeps its player data in -- alongside
// `catalogue_selection`, `ability_scores`, and `rules_choices`. No schema
// change, no migration, and nothing V1 depends on is touched. The two
// inventories are independent because the two character models are
// independent; consolidating them is the job of the migration that retires
// `character_sheets`, not of this one.
//
// rules-package-architecture.md §18.3 designates `actor_rules_state` as the
// eventual canonical rules-owned store. It does not exist yet
// (rules-package-infrastructure.md Q9 defers it), so this follows the
// precedent that is live. When it lands, this block migrates with
// `ability_scores` and `rules_choices` -- the same migration, one more key.

import {
  normalizeStoredInventory,
  type StoredInventory
} from '../../app/lib/characters/inventory'
import { dxFetch } from './entity-factory'

export const INVENTORY_BLOCK_KEY = 'inventory'

// Sorted after 'rules_choices' (30), which follows 'ability_scores' (20) and
// 'catalogue_selection' (10) -- the order a character sheet presents them.
const INVENTORY_BLOCK_SORT = 40

export type { StoredInventory }

// Reads what a character carries, or null when nothing was ever recorded --
// the state every character predating this migration is in, and a
// first-class result rather than an error.
export async function loadCharacterInventory(
  characterId: string | number
): Promise<StoredInventory | null> {
  const res: any = await dxFetch(
    `/items/block_instances?filter[entity_id][_eq]=${encodeURIComponent(String(characterId))}`
    + `&filter[block_key][_eq]=${INVENTORY_BLOCK_KEY}&fields[]=data&limit=1`
  )

  const row = Array.isArray(res?.data) ? res.data[0] : null
  return normalizeStoredInventory(row?.data ?? null)
}

// Upsert: PATCH the existing block or POST a new one -- the same
// find-then-PATCH-or-POST shape every other block write in this codebase
// uses.
//
// Takes an ALREADY-VALIDATED value: validation is the caller's job (the
// route rejects with 400), so this function cannot be the place a bad record
// slips through unnoticed.
export async function saveCharacterInventory(
  characterId: string | number,
  stored: StoredInventory
): Promise<StoredInventory> {
  const existingRes: any = await dxFetch(
    `/items/block_instances?filter[entity_id][_eq]=${encodeURIComponent(String(characterId))}`
    + `&filter[block_key][_eq]=${INVENTORY_BLOCK_KEY}&fields[]=id&limit=1`
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
        block_key: INVENTORY_BLOCK_KEY,
        label: 'Inventory',
        sort: INVENTORY_BLOCK_SORT,
        data: stored
      })
    })
  }

  return stored
}
