// POST /api/worlds/:id/characters/create-v2
// Character Creation V2 -- the first catalogue-driven Character Creation
// workflow. See server/utils/world-content-catalogue.ts (Content Consumers
// Phase 1, the sole source of truth for Species/Class/Background choices)
// and this task's own OBJECTIVE: "the first Character Creation workflow
// driven entirely by the World Content Catalogue... Nothing should read
// World entities."
//
// Deliberately separate from server/api/worlds/[id]/characters/create.post.ts
// and .../builder.post.ts (V1) -- this task's own instruction: "Do NOT
// reuse the old V1 workflow if it assumes World entities." Those routes
// resolve species/class/background choices from the `entities` collection
// (verified against builder.vue's own data fetches:
// GET /api/worlds/:id/entities, GET /api/worlds/:id/entities/:entityId)
// and additionally build a full character_sheets row (ability scores,
// combat stats, spellcasting). This route does neither: it re-verifies
// every choice against the CURRENT World Content Catalogue
// (getWorldContentCatalogue) -- never trusting a client-submitted choice at
// face value, so "no hardcoded options" is a server-enforced invariant, not
// only a UI one -- and stops at recording the choice. No ability scores, no
// derived statistics, no rules evaluation, no character_sheets row: this
// task's NON-GOALS forbid all of them, and "Character Sheet" is explicitly
// out of scope.
//
// SAVE (task's own SAVE section): "the minimal character record required to
// continue later." That is exactly what this writes -- one `entities` row
// (entityType: 'pc', the same domain concept CLAUDE.md already documents:
// "A character is an entity with entity_type in ... pc ...") via the
// existing createEntityRecord (server/utils/entity-factory.ts, reused
// unchanged -- not redesigned), plus one block_instances row under a NEW
// block_key ('catalogue_selection') recording which three catalogue
// entries were chosen. A new block_key, rather than reusing V1's
// 'character_core', keeps this record fully inert to the existing
// Character Sheet/character-sheet-resolver.ts, which has no reason to ever
// read it -- "Do NOT modify the existing Character Sheet" is satisfied by
// construction, not by care taken elsewhere.
//
// PHASE 3 -- ABILITY SCORES. `abilities` is accepted here but is OPTIONAL,
// and the asymmetry with the Builder (which requires it before enabling
// Create) is deliberate rather than an oversight:
//
//   The Builder is a guided creation flow. Finishing a character without
//   ability scores is not a workflow it should encourage, so its own
//   `missingRequirements` lists them and Create stays disabled until they
//   are assigned.
//
//   The API must be able to represent a character that HAS no scores,
//   because characters created before Phase 3 exist and are valid, and
//   because PUT .../abilities exists precisely so scores can be assigned
//   later. Rejecting a scoreless create would make this route stricter than
//   the data model it writes into, and would break the "create now, score at
//   the table" path without buying any integrity.
//
// A malformed `abilities` payload IS rejected -- optional means "may be
// absent", never "may be garbage".
//
// AUTHORIZATION: gated on `world.character.create`, the same capability
// server/api/worlds/[id]/characters/create.post.ts and .../builder.post.ts
// already require for creating a `pc` -- this route always creates a `pc`
// (Character Creation V2 is the Player-facing flow the task's GOAL
// describes), so there is no type-branching to do.

import { createError, defineEventHandler, getRouterParam, readBody } from 'h3'
import { requireCapability } from '../../../../utils/authorization'
import { getWorldContentCatalogue, type ContentCatalogueEntry } from '../../../../utils/world-content-catalogue'
import { createEntityRecord, dxFetch } from '../../../../utils/entity-factory'
import { saveCharacterAbilityScores } from '../../../../utils/character-ability-scores'
import { normalizeStoredAbilityScores } from '../../../../../app/lib/characters/ability-scores'

type CatalogueSelectionInput = {
  packageId?: unknown
  slug?: unknown
}

// Re-verifies a client-submitted choice against the CURRENT catalogue by
// (packageId, slug) -- never trusts the title/externalId/etc. the client
// also sent along; those are looked up fresh from the server's own
// getWorldContentCatalogue result. A choice naming a pack/slug the World is
// no longer bound to (or never was) resolves to null, which the handler
// below treats as a validation failure, never a silent substitution.
function findInCatalogue(
  entries: readonly ContentCatalogueEntry[],
  ref: CatalogueSelectionInput | undefined | null
): ContentCatalogueEntry | null {
  const packageId = typeof ref?.packageId === 'string' ? ref.packageId : ''
  const slug = typeof ref?.slug === 'string' ? ref.slug : ''

  if (!packageId || !slug) {
    return null
  }

  return entries.find((entry) => entry.packageId === packageId && entry.slug === slug) ?? null
}

// What the `catalogue_selection` block actually stores.
//
// ContentCatalogueEntry gained a `presentation` model in Character
// Builder/Sheet Phase 2 (see server/utils/world-content-catalogue.ts's own
// design decision 1). Persisting a whole ContentCatalogueEntry verbatim
// would therefore have started writing a ~2.5KB rendered presentation
// snapshot per choice into every character, for nothing: character-assembly.ts
// re-resolves each choice against the CURRENT catalogue by (packageId, slug)
// and never replays this snapshot's other fields (its own design decision 2).
//
// Pinning the stored shape explicitly keeps the persisted record exactly
// what it was before Phase 2, and stops it drifting again the next time the
// catalogue type grows a field.
function toStoredChoice(entry: ContentCatalogueEntry) {
  return {
    packageId: entry.packageId,
    packageVersion: entry.packageVersion,
    systemKey: entry.systemKey,
    title: entry.title,
    slug: entry.slug,
    externalId: entry.externalId,
    provider: entry.provider,
    sourceBook: entry.sourceBook,
    sourcePage: entry.sourcePage
  }
}

export default defineEventHandler(async (event) => {
  const worldId = String(getRouterParam(event, 'id') || '')

  if (!worldId) {
    throw createError({ statusCode: 400, statusMessage: 'Missing world id' })
  }

  const principal = event.context.principal ?? null
  if (!principal) {
    throw createError({ statusCode: 401, statusMessage: 'Authentication required' })
  }
  requireCapability(principal, 'world.character.create', { kind: 'world', worldId })

  const body = await readBody(event)
  const title = String(body?.title || '').trim()

  if (!title) {
    throw createError({ statusCode: 400, statusMessage: 'Character name is required' })
  }

  const catalogue = await getWorldContentCatalogue(worldId)

  const species = findInCatalogue(catalogue.species, body?.species)
  const characterClass = findInCatalogue(catalogue.classes, body?.class)
  const background = findInCatalogue(catalogue.backgrounds, body?.background)

  if (!species || !characterClass || !background) {
    throw createError({
      statusCode: 400,
      statusMessage: "Species, Class, and Background must each be chosen from the World's current Content Catalogue"
    })
  }

  // Validated BEFORE the entity is created, so a malformed payload cannot
  // leave a half-built character behind (Directus offers no cross-collection
  // transaction -- ordering is how consistency is expressed here).
  const abilityScores = body?.abilities == null ? null : normalizeStoredAbilityScores(body.abilities)

  if (body?.abilities != null && !abilityScores) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Ability scores must be six whole numbers (str, dex, con, int, wis, cha), each between 1 and 30'
    })
  }

  const created = await createEntityRecord({
    worldId,
    title,
    entityType: 'pc'
  })

  if (created?.id) {
    await dxFetch('/items/block_instances', {
      method: 'POST',
      body: JSON.stringify({
        entity_id: created.id,
        block_key: 'catalogue_selection',
        label: 'Catalogue Selection',
        sort: 10,
        data: {
          species: toStoredChoice(species),
          class: toStoredChoice(characterClass),
          background: toStoredChoice(background)
        }
      })
    }).catch(() => null)

    if (abilityScores) {
      await saveCharacterAbilityScores(created.id, abilityScores).catch(() => null)
    }
  }

  return {
    ...created,
    species,
    class: characterClass,
    background,
    abilityScores
  }
})
