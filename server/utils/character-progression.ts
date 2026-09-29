// Character Progression persistence -- Character Progression Phase 1A's
// stored half.
//
// The single server-side owner of the `progression` block: the one place
// that knows which block_key holds a character's class-level entries, and
// the one place that writes them. Mirrors character-spellcasting.ts's own
// shape exactly (find-then-PATCH-or-POST against `block_instances`), the
// same polymorphic per-entity store `catalogue_selection`/`ability_scores`/
// `rules_choices`/`inventory`/`notes`/`health`/`spellcasting` already use --
// an eighth block needs no migration and no bootstrap run.
//
// This file persists only WHICH levels this character has in WHICH classes
// (`StoredCharacterProgression`, app/lib/characters/progression.ts). It
// never computes total level, never touches HP/proficiency/spell slots
// (Rules Engine output, read from `getDerivedCharacter`), and never decides
// whether a requested transition is legal -- that is entirely
// server/utils/character-progression-plan.ts's job. Mirrors
// character-spellcasting.ts's own "numbers are Rules Engine output, this
// file persists only the stored half" discipline exactly.

import {
  normalizeStoredProgression,
  type StoredCharacterProgression
} from '../../app/lib/characters/progression'
import { dxFetch } from './entity-factory'

export const CHARACTER_PROGRESSION_BLOCK_KEY = 'progression'

// Sorted between 'ability_scores' (20) and 'rules_choices' (30) -- level is
// as foundational to a character as its ability scores, and a level-gated
// choice (once the package ever declares one, see character-progression-plan.ts's
// own header) conceptually depends on it, so it belongs just before
// rules_choices in reading order.
const CHARACTER_PROGRESSION_BLOCK_SORT = 25

export type { StoredCharacterProgression }

// Reads a character's stored progression record, or null when nothing was
// ever recorded -- true of every character created before this phase, and
// a first-class result (character-progression-plan.ts's own
// `totalCharacterLevel` already treats an absent record as level 1,
// mirroring `value:level`'s own Rules Engine default) rather than an error.
export async function loadCharacterProgression(
  characterId: string | number
): Promise<StoredCharacterProgression | null> {
  const res: any = await dxFetch(
    `/items/block_instances?filter[entity_id][_eq]=${encodeURIComponent(String(characterId))}`
    + `&filter[block_key][_eq]=${CHARACTER_PROGRESSION_BLOCK_KEY}&fields[]=data&limit=1`
  )

  const row = Array.isArray(res?.data) ? res.data[0] : null
  return normalizeStoredProgression(row?.data ?? null)
}

// Upsert: PATCH the existing block or POST a new one -- the same
// find-then-PATCH-or-POST shape every other block write in this codebase
// uses.
//
// Takes an ALREADY-VALIDATED value: validation (legal target level, no
// unresolved required choices, fresh-state fingerprint match) is entirely
// character-progression-plan.ts's `confirmProgression`'s job, never this
// function's -- mirrors saveCharacterSpellcasting's own identical division
// of labor exactly.
export async function saveCharacterProgression(
  characterId: string | number,
  stored: StoredCharacterProgression
): Promise<StoredCharacterProgression> {
  const existingRes: any = await dxFetch(
    `/items/block_instances?filter[entity_id][_eq]=${encodeURIComponent(String(characterId))}`
    + `&filter[block_key][_eq]=${CHARACTER_PROGRESSION_BLOCK_KEY}&fields[]=id&limit=1`
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
        block_key: CHARACTER_PROGRESSION_BLOCK_KEY,
        label: 'Progression',
        sort: CHARACTER_PROGRESSION_BLOCK_SORT,
        data: stored
      })
    })
  }

  return stored
}
