// Character Ability Score persistence -- Character Builder / Character
// Sheet Phase 3.
//
// The single server-side owner of the `ability_scores` block: the one place
// that knows which block_key holds a character's six numbers, and the one
// place that writes them. Route handlers stay thin (parse params -> call a
// util -> return), matching this codebase's own documented convention.
//
// ---------------------------------------------------------------------------
// WHY A NEW BLOCK_KEY, AND NO SCHEMA CHANGE
// ---------------------------------------------------------------------------
// `block_instances` is already the polymorphic per-entity content store, with
// a free-string `block_key` and a JSON `data` column (see
// create_block_instances_schema.sh) -- so a second block alongside
// create-v2.post.ts's own 'catalogue_selection' needs no migration, no
// bootstrap run, and no new collection. This task's own NON-GOALS forbid
// schema changes, and none is required.
//
// A SEPARATE block rather than more fields on 'catalogue_selection' is a
// domain decision, not a storage one. That block records WHICH CATALOGUE
// ENTRIES were chosen, and character-assembly.ts re-resolves every one of
// them against the World's current catalogue on each read. Ability scores
// resolve against nothing -- they are the player's own data, valid whether
// or not a Content Pack is still bound. Putting them in a block that exists
// to be re-verified would imply they could stop being valid.
//
// ---------------------------------------------------------------------------
// WHY NOT REUSE PUT /api/worlds/:id/entities/:entityId/blocks/:blockKey
// ---------------------------------------------------------------------------
// That generic block-upsert route already exists and would technically
// accept this write. It is deliberately not used, for two reasons: it stores
// whatever JSON the client sends with NO validation (ability scores are
// player data that must be shape-checked -- "never trust the client", the
// posture create-v2.post.ts already established), and it is gated on
// `world.entity.edit` rather than a character capability. Ability scores get
// their own route so the contract has a server-side owner; the generic route
// stays exactly as it is, for the wiki-block editor it was built for.

import { normalizeStoredAbilityScores, type StoredAbilityScores } from '../../app/lib/characters/ability-scores'
import { dxFetch } from './entity-factory'

export const ABILITY_SCORES_BLOCK_KEY = 'ability_scores'

// Sorted after 'catalogue_selection' (sort 10) so the two blocks read in the
// order a character sheet presents them.
const ABILITY_SCORES_BLOCK_SORT = 20

export type { StoredAbilityScores }

// Reads a character's stored scores, or null when none were ever recorded --
// the state EVERY character created before Phase 3 is in, and therefore a
// first-class result rather than an error. A stored record that no longer
// passes validation (hand-edited in the Directus admin, say) also reads as
// null: the Sheet showing "no scores yet" is a better failure than rendering
// half a row of garbage.
export async function loadCharacterAbilityScores(characterId: string | number): Promise<StoredAbilityScores | null> {
  const res: any = await dxFetch(
    `/items/block_instances?filter[entity_id][_eq]=${encodeURIComponent(String(characterId))}`
    + `&filter[block_key][_eq]=${ABILITY_SCORES_BLOCK_KEY}&fields[]=data&limit=1`
  )

  const row = Array.isArray(res?.data) ? res.data[0] : null
  return normalizeStoredAbilityScores(row?.data ?? null)
}

// Upsert: PATCH the existing block or POST a new one. Mirrors the
// find-then-PATCH-or-POST shape the existing generic block route already
// uses, so there is one recognizable way to write a block in this codebase.
//
// Takes an ALREADY-VALIDATED value: validation is the caller's job (the
// route rejects with 400), so this function cannot be the place a bad record
// slips through unnoticed.
export async function saveCharacterAbilityScores(
  characterId: string | number,
  stored: StoredAbilityScores
): Promise<StoredAbilityScores> {
  const existingRes: any = await dxFetch(
    `/items/block_instances?filter[entity_id][_eq]=${encodeURIComponent(String(characterId))}`
    + `&filter[block_key][_eq]=${ABILITY_SCORES_BLOCK_KEY}&fields[]=id&limit=1`
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
        block_key: ABILITY_SCORES_BLOCK_KEY,
        label: 'Ability Scores',
        sort: ABILITY_SCORES_BLOCK_SORT,
        data: stored
      })
    })
  }

  return stored
}
