// Character Assembly -- Phase 1.
// Bridges Character Creation V2 (server/api/worlds/[id]/characters/create-v2.post.ts)
// and the future Character Sheet V2. See this task's own OBJECTIVE:
// "Character Creation currently records only Species/Class/Background...
// This phase assembles those choices into one resolved character model."
//
// INPUT/OUTPUT (this task's own GOAL): Character choices (the persisted
// `catalogue_selection` block_instances row create-v2.post.ts already
// writes) + the World Content Catalogue (world-content-catalogue.ts) ->
// one resolved Character Blueprint. This module performs exactly that
// composition and nothing else.
//
// ---------------------------------------------------------------------------
// DESIGN DECISIONS
// ---------------------------------------------------------------------------
// 1. NO RULES, NO GAMEPLAY. This module answers exactly one question per
//    catalogue choice: "does this reference still resolve against the
//    World's CURRENT catalogue, and if so, to what entry?" It never merges,
//    derives, or computes anything beyond that single resolution.
//
//    PHASE 1 additionally excluded ability scores entirely, as that phase's
//    own NON-GOALS required. CHARACTER BUILDER / SHEET PHASE 3 lifts that
//    exclusion in the narrowest possible way: the blueprint now also carries
//    the character's STORED ability scores, passed through verbatim.
//
//    That is not a softening of the rule above, because ability scores are
//    PLAYER DATA, not mechanics -- they resolve against nothing, are read
//    from the character's own record, and nothing here interprets them. No
//    modifier, save, skill, hit point, or initiative is computed from them
//    in this module or in anything it calls; that remains exclusively the
//    Rules Engine's (app/lib/rules/**), which this module still neither
//    imports nor duplicates. What Phase 1 forbade was DERIVING gameplay from
//    scores, and that is still forbidden.
//
// 2. RE-VERIFICATION, NOT TRUST -- the persisted `catalogue_selection`
//    block is a SNAPSHOT taken at character-creation time
//    (create-v2.post.ts's own denormalized ContentCatalogueEntry objects,
//    keyed by (packageId, slug)). This module re-resolves each choice's
//    (packageId, slug) against the CURRENT catalogue rather than replaying
//    the stale snapshot verbatim -- a bound Content Pack may since have
//    been unbound, repinned, or had an entry removed. Mirrors
//    create-v2.post.ts's own "never trust a client-submitted choice at
//    face value" posture, one layer later: here it is "never trust a
//    PERSISTED choice to still be valid," for the same reason.
//
// 3. MISSING CONTENT IS REPORTED, NEVER A CRASH -- a choice that no longer
//    resolves is returned as a `missing` slot with a human-readable
//    reason, never thrown. Same "absence is legal, and must stay visible"
//    posture world-content-runtime.ts's own design decision 1 already
//    established for a broken pack binding, generalized one layer up to a
//    single choice. A slot whose OWN pack failed to load (present in
//    `catalogue.packs` with `ok:false`) reports that specifically, distinct
//    from a merely-renamed/removed entry inside a pack that loaded fine --
//    so a caller can tell "your Content Pack is broken" apart from "this
//    pick isn't offered anymore."
//
// 4. Reads `entities`/`block_instances` directly via directusServiceRequest,
//    the same boundary create-v2.post.ts's own dxFetch (entity-factory.ts)
//    already uses -- no new Directus access pattern introduced. Only the
//    fields this module actually needs are requested (id/world_id/title
//    for the entity; data only for the block), matching
//    entities/[entityId].get.ts's own scoped-fields convention.
//
// 5. No capability check on this read -- matching GET /api/worlds/:id/content,
//    GET /api/worlds/:id/catalogue, and GET /api/worlds/:id/entities/:entityId's
//    own shared precedent: reading a World's configuration/content is not
//    gated the way writing it is.

import { directusServiceRequest } from './directus'
import { getWorldContentCatalogue, type ContentCatalogueEntry } from './world-content-catalogue'
import { ABILITY_SCORES_BLOCK_KEY } from './character-ability-scores'
import { RULES_CHOICES_BLOCK_KEY } from './character-rules-choices'
import { INVENTORY_BLOCK_KEY } from './character-inventory'
import { CHARACTER_NOTES_BLOCK_KEY } from './character-notes'
import { CHARACTER_HEALTH_BLOCK_KEY } from './character-health'
import {
  normalizeStoredCharacterHealth,
  type StoredCharacterHealth
} from '../../app/lib/characters/health'
import {
  normalizeStoredCharacterNotes,
  type StoredCharacterNotes
} from '../../app/lib/characters/character-notes'
import {
  normalizeStoredInventory,
  unresolvedItemLabel,
  type AssembledInventoryItem,
  type StoredInventoryItem
} from '../../app/lib/characters/inventory'
import { normalizeStoredRulesChoices, type StoredRulesChoices } from '../../app/lib/characters/rules-choices'
import { normalizeStoredAbilityScores, type StoredAbilityScores } from '../../app/lib/characters/ability-scores'
import type { WorldContentPackResolution } from './world-content-runtime'

const CATALOGUE_SELECTION_BLOCK_KEY = 'catalogue_selection'

type StoredChoiceRef = {
  packageId?: unknown
  slug?: unknown
}

export type CharacterAssemblySlot =
  | { status: 'resolved'; entry: ContentCatalogueEntry }
  | { status: 'missing'; packageId: string; slug: string; reason: string }

// One carried item, joined to the catalogue. The stored decision (how many,
// equipped, attuned, notes) is echoed verbatim; everything ABOUT the item --
// its title, its source book, its pack -- comes from the catalogue entry it
// resolved to, so repinning a Content Pack updates every character carrying
// it rather than leaving each holding a private copy.
//
// The type itself is declared in app/lib/characters/inventory.ts, because the
// Character Sheet renders it and `app/` must never import from `server/`.
// This module produces it; the panel consumes it. Re-exported so callers
// reading assembly types find it alongside the blueprint.
export type { AssembledInventoryItem }

export type CharacterAssemblyBlueprint = {
  worldId: string
  characterId: string
  characterTitle: string
  species: CharacterAssemblySlot
  class: CharacterAssemblySlot
  background: CharacterAssemblySlot
  // Phase 3. `null` when this character has no scores recorded -- true of
  // every character created before Phase 3, and a first-class state the
  // Sheet renders rather than an error. Never derived, never defaulted to
  // a row of 10s: absent means absent.
  abilityScores: StoredAbilityScores | null
  // The player's answers to ChoiceSets their chosen content declared.
  // `null` when none were ever recorded -- true of every character created
  // before proficiency choices existed, and a first-class state (the choice
  // is simply still outstanding) rather than an error.
  //
  // Stored answers are NOT trusted to still fit their question: the bridge
  // re-checks every one against the facets that are current at read time,
  // because repinning a Content Pack can invalidate an answer that nothing
  // edited.
  rulesChoices: StoredRulesChoices | null
  // What this character carries, joined to the World's current catalogue.
  // An empty list when nothing was ever recorded -- carrying nothing is a
  // legal state, not an absent one, which is why this is [] and not null.
  inventory: AssembledInventoryItem[]
  // Free text the player wrote about this character. `null` when nothing was
  // ever recorded -- true of every character created before this feature --
  // mirroring `abilityScores`' own null-means-absent convention. Resolves
  // against nothing: unlike species/class/background/inventory, there is no
  // catalogue reference to re-join on every read.
  notes: StoredCharacterNotes | null
  // Current HP, Temporary HP, Hit Dice spent, and Death Save marks. `null`
  // when nothing was ever recorded -- true of every character created before
  // the Health System, and a first-class state (the Sheet shows "not set
  // yet"), never an error. Maximum HP is never carried here: it is derived
  // by the Rules Engine from Hit Die size (Class-granted), Constitution, and
  // level, and this blueprint's job is inputs only.
  health: StoredCharacterHealth | null
  packs: WorldContentPackResolution[]
}

export type CharacterAssemblyResult =
  | { available: true; blueprint: CharacterAssemblyBlueprint }
  | { available: false; reason: 'character-not-found' }
  | { available: false; reason: 'no-catalogue-selection'; message: string }

function extractRef(value: unknown): StoredChoiceRef | null {
  if (!value || typeof value !== 'object') return null
  return value as StoredChoiceRef
}

// Resolves one choice against its category's CURRENT catalogue entries --
// see design decisions 2 and 3. `label` is only ever used inside a
// human-readable `reason` string, never as a lookup key.
function resolveSlot(
  ref: StoredChoiceRef | null,
  category: readonly ContentCatalogueEntry[],
  packs: readonly WorldContentPackResolution[],
  label: string
): CharacterAssemblySlot {
  const packageId = typeof ref?.packageId === 'string' ? ref.packageId : ''
  const slug = typeof ref?.slug === 'string' ? ref.slug : ''

  if (!packageId || !slug) {
    return { status: 'missing', packageId, slug, reason: `No ${label} was recorded for this character` }
  }

  const found = category.find((entry) => entry.packageId === packageId && entry.slug === slug)
  if (found) {
    return { status: 'resolved', entry: found }
  }

  const brokenPack = packs.find((pack) => pack.packageId === packageId && !pack.ok)
  if (brokenPack) {
    return {
      status: 'missing',
      packageId,
      slug,
      reason: `The Content Pack '${packageId}' this ${label} choice depends on failed to load`
    }
  }

  return {
    status: 'missing',
    packageId,
    slug,
    reason: `'${slug}' is no longer offered by '${packageId}' in this World's current Content Catalogue`
  }
}

// Joins stored inventory to the catalogue. Reuses resolveSlot's exact
// resolution rule -- match on (packageId, slug), and treat a reference whose
// pack is broken or absent as missing rather than as an error -- so an item
// and a Species behave identically when their content goes away.
function resolveInventory(
  stored: readonly StoredInventoryItem[],
  items: readonly ContentCatalogueEntry[],
  packs: readonly WorldContentPackResolution[]
): AssembledInventoryItem[] {
  return stored.map((item) => {
    if (!item.ref) {
      return { ...item, status: 'custom', title: item.name || 'Item' }
    }

    const slot = resolveSlot(item.ref, items, packs, 'Item')

    if (slot.status === 'resolved') {
      return { ...item, status: 'resolved', title: slot.entry.title, entry: slot.entry }
    }

    return {
      ...item,
      status: 'missing',
      title: unresolvedItemLabel(item.ref),
      reason: slot.reason
    }
  })
}

// The canonical entry point for this module. Composes one entity read, one
// block_instances read, and getWorldContentCatalogue -- no other I/O.
export async function assembleCharacter(
  worldId: string | number,
  characterId: string | number
): Promise<CharacterAssemblyResult> {
  // A non-existent entity id is reported by Directus as a 403 (its item-
  // level permission check runs before existence is known), not a 200 with
  // an empty `data` -- so a thrown request, not just an empty result, means
  // "not found" here. Caught broadly (network errors included) for the
  // same reason: this module's whole contract is "never throws," and a
  // failed lookup is exactly as much "not found" as an empty one.
  let entity: any = null
  try {
    const entityRes: any = await directusServiceRequest(`/items/entities/${characterId}`, {
      method: 'GET',
      query: { fields: 'id,world_id,title' }
    })
    entity = entityRes?.data || null
  } catch {
    entity = null
  }

  if (!entity || String(entity.world_id) !== String(worldId)) {
    return { available: false, reason: 'character-not-found' }
  }

  // All six blocks in ONE query rather than six round trips -- they
  // differ only by block_key, and `_in` costs nothing over `_eq`. `block_key` is added to
  // `fields` because the rows now have to be told apart.
  const blockRes: any = await directusServiceRequest('/items/block_instances', {
    method: 'GET',
    query: {
      filter: {
        _and: [
          { entity_id: { _eq: Number(characterId) } },
          {
            block_key: {
              _in: [
                CATALOGUE_SELECTION_BLOCK_KEY,
                ABILITY_SCORES_BLOCK_KEY,
                RULES_CHOICES_BLOCK_KEY,
                INVENTORY_BLOCK_KEY,
                CHARACTER_NOTES_BLOCK_KEY,
                CHARACTER_HEALTH_BLOCK_KEY
              ]
            }
          }
        ]
      },
      limit: 6,
      fields: 'block_key,data'
    }
  })

  const blocks: any[] = Array.isArray(blockRes?.data) ? blockRes.data : []
  const findBlock = (key: string) => blocks.find((row) => row?.block_key === key) ?? null

  const block = findBlock(CATALOGUE_SELECTION_BLOCK_KEY)
  const selection = block?.data && typeof block.data === 'object' ? block.data : null

  // Re-validated on read, not trusted: a record hand-edited in the Directus
  // admin into an unreadable shape degrades to "no scores yet" rather than
  // rendering a broken row. Same posture design decision 3 takes for a
  // choice that no longer resolves.
  const abilityScores = normalizeStoredAbilityScores(findBlock(ABILITY_SCORES_BLOCK_KEY)?.data ?? null)
  const rulesChoices = normalizeStoredRulesChoices(findBlock(RULES_CHOICES_BLOCK_KEY)?.data ?? null)
  const storedInventory = normalizeStoredInventory(findBlock(INVENTORY_BLOCK_KEY)?.data ?? null)
  const notes = normalizeStoredCharacterNotes(findBlock(CHARACTER_NOTES_BLOCK_KEY)?.data ?? null)
  const health = normalizeStoredCharacterHealth(findBlock(CHARACTER_HEALTH_BLOCK_KEY)?.data ?? null)

  if (!selection) {
    return {
      available: false,
      reason: 'no-catalogue-selection',
      message: 'This character has no recorded Species/Class/Background choices to assemble -- it may have been created outside the catalogue-driven Character Creation flow.'
    }
  }

  const catalogue = await getWorldContentCatalogue(worldId)

  const blueprint: CharacterAssemblyBlueprint = {
    worldId: String(worldId),
    characterId: String(characterId),
    characterTitle: String(entity.title || ''),
    species: resolveSlot(extractRef(selection.species), catalogue.species, catalogue.packs, 'Species'),
    class: resolveSlot(extractRef(selection.class), catalogue.classes, catalogue.packs, 'Class'),
    background: resolveSlot(extractRef(selection.background), catalogue.backgrounds, catalogue.packs, 'Background'),
    abilityScores,
    rulesChoices,
    inventory: resolveInventory(storedInventory?.items ?? [], catalogue.items, catalogue.packs),
    notes,
    health,
    packs: catalogue.packs
  }

  return { available: true, blueprint }
}
