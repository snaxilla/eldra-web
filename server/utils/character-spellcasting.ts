// Character Spellcasting persistence -- the Spellcasting System's stored
// half.
//
// The single server-side owner of the `spellcasting` block: the one place
// that knows which block_key holds a character's known/prepared spells and
// expended slot counts, and the one place that writes them. Route handlers
// stay thin (parse params -> call a util -> return), matching this
// codebase's own documented convention -- the same shape
// character-health.ts and character-inventory.ts already use for their own
// blocks.
//
// `block_instances` is already the polymorphic per-entity store the new
// architecture keeps its player data in -- alongside `catalogue_selection`,
// `ability_scores`, `rules_choices`, `inventory`, `notes`, and `health`. A
// seventh block needs no migration and no bootstrap run.
//
// Spellcasting NUMBERS (Spellcasting Ability, Spell Save DC, Spell Attack
// Bonus, Spell Slot progression) are never read or written here -- they are
// Rules Engine output, read from `getDerivedCharacter`'s `byCategory` and
// `tables` (character-derived.ts). This file persists only the two things
// this task's own CHARACTER DATA section names: which spells a character has
// learned/prepared, and how many of each slot level are currently spent.

import {
  normalizeStoredSpellcasting,
  type StoredCharacterSpellcasting
} from '../../app/lib/characters/spellcasting'
import { dxFetch } from './entity-factory'

export const CHARACTER_SPELLCASTING_BLOCK_KEY = 'spellcasting'

// Sorted after 'health' (60) -- the order a character sheet presents them.
const CHARACTER_SPELLCASTING_BLOCK_SORT = 70

export type { StoredCharacterSpellcasting }

// Reads a character's stored spellcasting record, or null when nothing was
// ever recorded -- the state every character predating this milestone is
// in, and a first-class result rather than an error.
export async function loadCharacterSpellcasting(
  characterId: string | number
): Promise<StoredCharacterSpellcasting | null> {
  const res: any = await dxFetch(
    `/items/block_instances?filter[entity_id][_eq]=${encodeURIComponent(String(characterId))}`
    + `&filter[block_key][_eq]=${CHARACTER_SPELLCASTING_BLOCK_KEY}&fields[]=data&limit=1`
  )

  const row = Array.isArray(res?.data) ? res.data[0] : null
  return normalizeStoredSpellcasting(row?.data ?? null)
}

// Upsert: PATCH the existing block or POST a new one -- the same
// find-then-PATCH-or-POST shape every other block write in this codebase
// uses.
//
// Takes an ALREADY-VALIDATED value: validation is the caller's job (the
// route rejects with 400), so this function cannot be the place a bad
// record slips through unnoticed.
export async function saveCharacterSpellcasting(
  characterId: string | number,
  stored: StoredCharacterSpellcasting
): Promise<StoredCharacterSpellcasting> {
  const existingRes: any = await dxFetch(
    `/items/block_instances?filter[entity_id][_eq]=${encodeURIComponent(String(characterId))}`
    + `&filter[block_key][_eq]=${CHARACTER_SPELLCASTING_BLOCK_KEY}&fields[]=id&limit=1`
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
        block_key: CHARACTER_SPELLCASTING_BLOCK_KEY,
        label: 'Spellcasting',
        sort: CHARACTER_SPELLCASTING_BLOCK_SORT,
        data: stored
      })
    })
  }

  return stored
}
