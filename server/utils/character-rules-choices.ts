// Character Rules Choice persistence -- proficiency choice resolution.
//
// The single server-side owner of the `rules_choices` block: the one place
// that knows which block_key holds a character's answered ChoiceSets, and
// the one place that writes them. Route handlers stay thin (parse params ->
// call a util -> return), matching this codebase's own documented
// convention.
//
// Deliberately a near-copy of character-ability-scores.ts's shape rather
// than a shared abstraction over it. Two blocks is not a pattern; the two
// modules differ in what they validate and will diverge further (choices are
// re-checked against facets that can change, scores never are), and
// extracting a generic "block store" now would be inventing an abstraction
// this codebase's own working agreement says to wait for.
//
// ---------------------------------------------------------------------------
// WHY A NEW BLOCK_KEY, AND NO SCHEMA CHANGE
// ---------------------------------------------------------------------------
// `block_instances` is already the polymorphic per-entity store with a
// free-string `block_key` and a JSON `data` column, so a third block beside
// 'catalogue_selection' and 'ability_scores' needs no migration and no
// bootstrap run. This task's NON-GOALS forbid architecture changes, and none
// is required.
//
// rules-package-architecture.md §18.3 decides that `actor_rules_state` will
// eventually be the canonical rules-owned store and that Phase 3's
// ability_scores block migrates into it. That collection does not exist
// (rules-package-infrastructure.md Q9 defers it, blocked on Character Sheet
// V2), so this block follows the precedent that IS live rather than
// anticipating one that is not. When `actor_rules_state` lands, this block
// migrates alongside `ability_scores` -- the same migration, one more key,
// which is exactly why storing choices the same way as scores is the
// cheapest thing to move later.
//
// ---------------------------------------------------------------------------
// A SEPARATE BLOCK, NOT MORE FIELDS ON 'catalogue_selection'
// ---------------------------------------------------------------------------
// Same domain reasoning character-ability-scores.ts already recorded.
// 'catalogue_selection' records WHICH CATALOGUE ENTRIES were chosen and is
// re-resolved against the World's catalogue on every read. Choice answers
// are the player's own decisions: they are re-validated against the current
// facets, but they do not resolve to a catalogue entry and are not
// meaningless without one.

import {
  normalizeStoredRulesChoices,
  type StoredRulesChoices
} from '../../app/lib/characters/rules-choices'
import { dxFetch } from './entity-factory'

export const RULES_CHOICES_BLOCK_KEY = 'rules_choices'

// Sorted after 'ability_scores' (20), which is sorted after
// 'catalogue_selection' (10) -- the order a character sheet presents them.
const RULES_CHOICES_BLOCK_SORT = 30

export type { StoredRulesChoices }

// Reads a character's stored answers, or null when none were ever recorded
// -- the state every character created before this task is in, and a
// first-class result rather than an error.
export async function loadCharacterRulesChoices(
  characterId: string | number
): Promise<StoredRulesChoices | null> {
  const res: any = await dxFetch(
    `/items/block_instances?filter[entity_id][_eq]=${encodeURIComponent(String(characterId))}`
    + `&filter[block_key][_eq]=${RULES_CHOICES_BLOCK_KEY}&fields[]=data&limit=1`
  )

  const row = Array.isArray(res?.data) ? res.data[0] : null
  return normalizeStoredRulesChoices(row?.data ?? null)
}

// Upsert: PATCH the existing block or POST a new one -- the same
// find-then-PATCH-or-POST shape every other block write in this codebase
// uses.
//
// Takes an ALREADY-VALIDATED value: validation is the caller's job (the
// route rejects with 400), so this function cannot be the place a bad
// record slips through unnoticed.
export async function saveCharacterRulesChoices(
  characterId: string | number,
  stored: StoredRulesChoices
): Promise<StoredRulesChoices> {
  const existingRes: any = await dxFetch(
    `/items/block_instances?filter[entity_id][_eq]=${encodeURIComponent(String(characterId))}`
    + `&filter[block_key][_eq]=${RULES_CHOICES_BLOCK_KEY}&fields[]=id&limit=1`
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
        block_key: RULES_CHOICES_BLOCK_KEY,
        label: 'Rules Choices',
        sort: RULES_CHOICES_BLOCK_SORT,
        data: stored
      })
    })
  }

  return stored
}
