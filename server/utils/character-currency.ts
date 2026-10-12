// Character Currency persistence -- the P8 companion to character-inventory.ts.
//
// The single server-side owner of the `currency` block: the one place that
// knows which block_key holds what a character has, and the one place that
// writes it. Mirrors character-inventory.ts's own shape exactly (same
// `block_instances` store, same find-then-PATCH-or-POST upsert) because the
// two are the same kind of player data -- see currency.ts's own header for
// why currency is not simply another inventory row.

import {
  normalizeStoredCurrency,
  type StoredCharacterCurrency
} from '../../app/lib/characters/currency'
import { dxFetch } from './entity-factory'

export const CURRENCY_BLOCK_KEY = 'currency'

// Sorted after 'inventory' (40) -- the order a character sheet presents them.
const CURRENCY_BLOCK_SORT = 50

export type { StoredCharacterCurrency }

// Reads what a character has, or null when nothing was ever recorded -- the
// state every character predating this migration is in, and a first-class
// result rather than an error.
export async function loadCharacterCurrency(
  characterId: string | number
): Promise<StoredCharacterCurrency | null> {
  const res: any = await dxFetch(
    `/items/block_instances?filter[entity_id][_eq]=${encodeURIComponent(String(characterId))}`
    + `&filter[block_key][_eq]=${CURRENCY_BLOCK_KEY}&fields[]=data&limit=1`
  )

  const row = Array.isArray(res?.data) ? res.data[0] : null
  return normalizeStoredCurrency(row?.data ?? null)
}

// Upsert: PATCH the existing block or POST a new one -- the same
// find-then-PATCH-or-POST shape every other block write in this codebase
// uses.
//
// Takes an ALREADY-VALIDATED value: validation is the caller's job, so this
// function cannot be the place a bad record slips through unnoticed.
export async function saveCharacterCurrency(
  characterId: string | number,
  stored: StoredCharacterCurrency
): Promise<StoredCharacterCurrency> {
  const existingRes: any = await dxFetch(
    `/items/block_instances?filter[entity_id][_eq]=${encodeURIComponent(String(characterId))}`
    + `&filter[block_key][_eq]=${CURRENCY_BLOCK_KEY}&fields[]=id&limit=1`
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
        block_key: CURRENCY_BLOCK_KEY,
        label: 'Currency',
        sort: CURRENCY_BLOCK_SORT,
        data: stored
      })
    })
  }

  return stored
}
