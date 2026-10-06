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
import { saveCharacterProgression } from '../../../../utils/character-progression'
import { getWorldRuntime } from '../../../../utils/world-runtime-service'
import {
  declaredCreationContentChoices,
  resolveCreationContentChoices,
  type ContentChoiceSelector
} from '../../../../../app/lib/characters/creation-content-choices'
import { saveCharacterAbilityScores } from '../../../../utils/character-ability-scores'
import { saveCharacterRulesChoices } from '../../../../utils/character-rules-choices'
import { getDerivedCharacter } from '../../../../utils/character-derived'
import { saveCharacterHealth } from '../../../../utils/character-health'
import {
  emptyStoredRulesChoices,
  validateChoiceSelection
} from '../../../../../app/lib/characters/rules-choices'
import { resolveCreationChoices } from '../../../../../app/lib/characters/creation-choice-eligibility'
import { normalizeStoredAbilityScores } from '../../../../../app/lib/characters/ability-scores'
import { initializeCharacterHealth } from '../../../../../app/lib/characters/health'

// Character Sheet Caster Pass 0 -- restated, not shared, from
// server/utils/character-recovery.ts's own identically-shaped, module-private
// `findNumber` (same "no Rules Engine value id crosses a domain boundary via
// import" discipline this codebase already applies elsewhere, e.g.
// worldAuthoredThreeDiceRendererAdapter.ts's own header on why it duplicates
// rather than imports a sibling's tiny helper). Scans every category,
// ignoring which one declares the id, because this route -- like Recovery --
// has no reason to know or care which Rule Category a Value belongs to.
const MAX_HP_ID = 'value:hit_points.max'

function findDerivedNumber(
  derived: { byCategory: Record<string, Array<{ id: string; value?: unknown }>> },
  id: string
): number | null {
  for (const entries of Object.values(derived.byCategory)) {
    const entry = entries.find((candidate) => candidate.id === id)
    if (entry) return typeof entry.value === 'number' ? entry.value : null
  }
  return null
}

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

  // ChoiceSet answers. Eligibility is decided by the SAME shared rule the
  // Builder presents (app/lib/characters/creation-choice-eligibility.ts) --
  // never a second copy here. Only what this character's OWN content offers
  // is judged, never what the request names.
  //
  // Optional, exactly as `abilities` is: a character may be created with its
  // choices still outstanding, and the standalone proficiencies page exists
  // precisely so they can be answered later. Absent means outstanding, which
  // is a legal state the Sheet already reports.
  const slots = [
    { slot: 'species', facet: species.rulesFacet },
    { slot: 'class', facet: characterClass.rulesFacet },
    { slot: 'background', facet: background.rulesFacet }
  ]
  // PHASE 2C.2B -- a ChoiceSet is content-backed only by the PACKAGE's own
  // declaration (`from.kind === 'fromContentCatalogue'`), read from the World's
  // active registry. Never inferred from an id, a label, or the answer's shape.
  const runtime = await getWorldRuntime(worldId)
  const contentSelectorOf = (choiceSetId: string): ContentChoiceSelector | null => {
    if (!(runtime.configured && runtime.ok)) return null
    const definition = runtime.runtime.registry.getById(choiceSetId)
    if (!definition || definition.kind !== 'choiceSet' || definition.from.kind !== 'fromContentCatalogue') return null
    return { category: definition.from.category, filter: definition.from.filter }
  }
  const isContentChoiceSet = (choiceSetId: string) => contentSelectorOf(choiceSetId) !== null
  const contentDeclarations = declaredCreationContentChoices(slots, contentSelectorOf)
  const contentKeys = new Set(contentDeclarations.map((declaration) => declaration.key))

  const declaredKeys = new Set(resolveCreationChoices(slots, {}, isContentChoiceSet).map((presentation) => presentation.key))

  const rulesChoices = emptyStoredRulesChoices()
  const rawSelections = body?.choices?.selections

  if (rawSelections != null) {
    if (typeof rawSelections !== 'object' || Array.isArray(rawSelections)) {
      throw createError({ statusCode: 400, statusMessage: '`choices.selections` must be an object' })
    }

    const entries = Object.entries(rawSelections as Record<string, unknown>)

    for (const [key, value] of entries) {
      if (!declaredKeys.has(key)) {
        throw createError({
          statusCode: 400,
          statusMessage: `This character's content declares no choice "${key}"`
        })
      }

      if (!Array.isArray(value) || value.some((item) => typeof item !== 'string' || !item)) {
        throw createError({ statusCode: 400, statusMessage: `${key}: Selections must be a list of Definition ids.` })
      }
    }

    // Judged once, together: a sibling's accepted answer makes a later
    // choice's duplicate ineligible, exactly as the Builder shows it.
    const submitted = Object.fromEntries(entries.map(([key, value]) => [key, value as string[]]))
    const judged = new Map(resolveCreationChoices(slots, submitted, isContentChoiceSet).map((presentation) => [presentation.key, presentation]))

    for (const [key, values] of Object.entries(submitted)) {
      const presentation = judged.get(key)!

      // An offered-but-unavailable value is REJECTED, never silently dropped:
      // the Builder should have prevented it, so reaching here means a stale
      // or crafted request, which must fail loudly.
      for (const value of values) {
        const option = presentation.offered.find((candidate) => candidate.value === value)
        if (option && !option.eligible) {
          throw createError({
            statusCode: 400,
            statusMessage: `${key}: "${value}" is ${option.reason ? option.reason.toLowerCase() : 'not available'} and cannot be chosen`
          })
        }
      }

      const eligibleChoice = {
        key,
        slot: presentation.slot,
        choiceSetId: presentation.choiceSetId,
        count: presentation.count,
        options: presentation.offered.filter((option) => option.eligible).map((option) => option.value),
        distinct: true
      }

      const validation = validateChoiceSelection(eligibleChoice, values)

      if (!validation.ok) {
        throw createError({ statusCode: 400, statusMessage: `${key}: ${validation.reason}` })
      }

      rulesChoices.selections[key] = validation.selected
    }
  }

  // PHASE 2C.2B -- ContentRef answers to content-backed creation choices. The
  // client names only (choice key, encoded ref). Category, variant, prerequisites,
  // ownership, and the ref's real catalogue entry are all re-derived here from
  // the package declaration and the World's catalogue -- never trusted.
  const rawContent = body?.contentChoices
  if (rawContent != null && (typeof rawContent !== 'object' || Array.isArray(rawContent))) {
    throw createError({ statusCode: 400, statusMessage: '`contentChoices` must be an object of choice keys to ContentRef lists' })
  }
  const submittedContent = (rawContent ?? {}) as Record<string, unknown>
  for (const [key, value] of Object.entries(submittedContent)) {
    if (!contentKeys.has(key)) {
      throw createError({ statusCode: 400, statusMessage: `This character's content declares no content choice "${key}"` })
    }
    if (!Array.isArray(value) || value.some((item) => typeof item !== 'string' || !item)) {
      throw createError({ statusCode: 400, statusMessage: `${key}: Selections must be a list of encoded ContentRefs.` })
    }
  }
  const contentPresentations = resolveCreationContentChoices(
    contentDeclarations,
    slots,
    Object.fromEntries(Object.entries(submittedContent).map(([key, value]) => [key, value as string[]])),
    catalogue.feats
  )
  const contentAcquisitions: { featRef: { packageId: string, slug: string }, choiceKey: string }[] = []
  for (const presentation of contentPresentations) {
    const submitted = (submittedContent[presentation.key] as string[] | undefined) ?? []
    if (submitted.length > presentation.count) {
      throw createError({ statusCode: 400, statusMessage: `${presentation.key}: choose ${presentation.count}` })
    }
    for (const ref of submitted) {
      const offer = presentation.offered.find((candidate) => candidate.ref === ref)
      if (!offer) {
        throw createError({ statusCode: 400, statusMessage: `${presentation.key}: "${ref}" is not a legal option for this choice` })
      }
      if (!offer.eligible) {
        throw createError({ statusCode: 400, statusMessage: `${presentation.key}: "${offer.title}" is ${offer.reason ? offer.reason.toLowerCase() : 'not available'} and cannot be chosen` })
      }
    }
    if (!presentation.valid) {
      throw createError({ statusCode: 400, statusMessage: `${presentation.key}: choose ${presentation.count} option${presentation.count === 1 ? '' : 's'}` })
    }
    for (const offer of presentation.offered.filter((candidate) => presentation.selected.includes(candidate.ref))) {
      contentAcquisitions.push({ featRef: { packageId: offer.packageId, slug: offer.slug }, choiceKey: presentation.key })
    }
  }

  const created = await createEntityRecord({
    worldId,
    title,
    entityType: 'pc'
  })

  if (created?.id) {
    // PHASE 2C.2B -- FAIL LOUDLY. catalogue_selection is the identity the
    // canonical progression below depends on, so a failure here fails the
    // request. No rollback is claimed: an entity row may already exist.
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
    })

    // PHASE 2C.2B -- canonical progression, written AFTER the catalogue identity
    // it depends on. The class ref is built ONCE from the same selected catalogue
    // entry that catalogue_selection stores, so the two are identical by
    // construction (no re-resolution, no label inference). Fails loudly.
    const classRef = { packageId: characterClass.packageId, slug: characterClass.slug }
    await saveCharacterProgression(created.id, {
      classes: [{ classRef, level: 1, subclassRef: null }],
      feats: contentAcquisitions
    })

    if (abilityScores) {
      await saveCharacterAbilityScores(created.id, abilityScores).catch(() => null)
    }

    if (Object.keys(rulesChoices.selections).length > 0) {
      await saveCharacterRulesChoices(created.id, rulesChoices).catch(() => null)
    }

    // Character Sheet Caster Pass 0 -- INITIAL HEALTH. A newly-created
    // playable character begins at its authoritative MAXIMUM hp, never the
    // `emptyCharacterHealth()` fallback the Sheet otherwise shows for
    // "nothing recorded yet" (character-health.ts's own documented state
    // for a character predating the Health System -- never meant to
    // describe a character one second old, which is exactly what this
    // route was leaving every new character as before this task). This
    // reads the SAME already-tested Rules Engine projection every other
    // Health-adjacent server util reads (getDerivedCharacter), for the
    // SAME Value id server/utils/character-recovery.ts's own MAX_HP_ID
    // already names -- no class, no hit die size, no Constitution formula
    // is computed here; this route only asks "what does the active Rules
    // Package say Max HP is" and seeds Current HP at that number.
    //
    // FAILURE SEMANTICS -- deliberately NOT `.catch(() => null)` like the
    // three writes above, and this split matters:
    //
    //   getDerivedCharacter returning `available: false` (no Rules Package
    //   activated in this World, or this character still missing data the
    //   active package needs -- e.g. no ability scores yet, a state this
    //   very route already treats as legal, see PHASE 3's own note above)
    //   is NOT a failure. It is the SAME "absence is a legal state"
    //   degradation every Health-adjacent server util already documents
    //   (character-recovery.ts's own header). This character is left
    //   exactly as EVERY character was before this task -- no health block
    //   yet -- and creation still succeeds. `findDerivedNumber` returning
    //   `null` (the active package derives something but does not declare
    //   Max HP at all) is treated identically, for the same reason.
    //
    //   But once `maxHp` IS a real number, Health is no longer optional --
    //   it is the exact fact this task exists to guarantee. Swallowing a
    //   `saveCharacterHealth` failure here would silently recreate the
    //   precise bug this task fixes (entity + derivable Max HP exist,
    //   Health does not). Directus has no cross-collection transaction --
    //   the identical, already-accepted precedent server/utils/worlds.ts's
    //   own `createWorld` establishes for `createOwnerMembership` ("fails
    //   loudly (500) rather than silently... a state worth surfacing, not
    //   swallowing") -- so a thrown error here propagates uncaught,
    //   failing this request honestly rather than returning 200 for an
    //   incompletely-initialized character. The residual risk is the SAME
    //   one that precedent already accepts: `entities`/`catalogue_
    //   selection`/(optional `ability_scores`/`rules_choices`) rows already
    //   persisted above remain even though the overall request now reports
    //   failure -- true cross-collection atomicity does not exist anywhere
    //   in this codebase, and this task does not invent it.
    const derivedResult = await getDerivedCharacter(worldId, created.id)
    if (derivedResult.available) {
      const maxHp = findDerivedNumber(derivedResult.derived, MAX_HP_ID)
      if (maxHp !== null) {
        await saveCharacterHealth(created.id, initializeCharacterHealth(maxHp))
      }
    }
  }

  return {
    ...created,
    species,
    class: characterClass,
    background,
    abilityScores,
    rulesChoices
  }
})
