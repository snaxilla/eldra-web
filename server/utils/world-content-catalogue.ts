// World Content Catalogue -- Content Consumers Phase 1.
// See server/utils/world-content-runtime.ts (Content Resolution Phase 1,
// which this module consumes and does not duplicate) and this task's own
// OBJECTIVE: "Teach Eldra how to consume the World Content Runtime." The
// runtime returns grouped OPAQUE entries (`byEntityType: Record<string,
// WorldContentEntry[]>`, keyed by whatever string an adapter happened to
// write, `data` untouched). This module is the first consumer: it turns
// that into STRONGLY-TYPED gameplay catalogues -- one named collection per
// category (species/classes/backgrounds/feats/items/spells) -- so a future
// gameplay system reads `catalogue.species`, never
// `resolved.byEntityType['species']` with a string literal and an `as`
// cast.
//
// rules-engine.md §2.4 is why this module reads NOTHING from `data`:
// `character-sheet-resolver.ts` (the EXISTING, legacy path) already
// "resolves class/species/background/feat entities" from World Entities by
// deeply interpreting 5e-specific structure -- exactly the kind of
// gameplay-mechanics interpretation this task's NON-GOALS forbid here
// ("Do NOT interpret gameplay mechanics. Do NOT compute rules."). This
// module is a *parallel*, Content-Pack-sourced foundation, not an
// integration with that legacy resolver -- it shares no code and no
// concept with character-sheet-resolver.ts/character-sheet-math.ts.
//
// ---------------------------------------------------------------------------
// DESIGN DECISIONS
// ---------------------------------------------------------------------------
// 1. Every catalogue entry carries ONLY fields already normalized at the
//    envelope level by content-pack-5etools-adapter.ts (systemKey/title/
//    slug/externalId/provider/sourceBook/sourcePage) plus which bound pack
//    it came from (packageId/packageVersion). This is deliberately the same
//    field set world-content-runtime.ts's own WorldContentSummaryEntry
//    already exposes -- "interpret only the fields required to identify
//    and present entries" is satisfied by identity + provenance alone. No
//    field is ever read out of `data`: doing so would require per-category
//    interpretation of 5etools' own (widely different, mechanically rich)
//    JSON shapes, which is exactly the "gameplay mechanics"/"compute rules"
//    line this phase must not cross. A short description, an icon, a
//    level/school/rarity -- all of that lives inside `data` and is
//    therefore explicitly deferred, not merely unbuilt.
//
// 2. Six FIXED, named collections, not a generic Record -- the entire value
//    this module adds over the runtime's own `byEntityType`. An entityType
//    the current 5etools adapter never produces (i.e. not one of
//    species/class/background/feat/item/spell -- see app/lib/importers'
//    preview5eTools* functions, the only entityType producers that exist)
//    is not collected into any of the six typed arrays. This mirrors the
//    runtime's own "do not redesign" posture: the six categories are
//    exactly what IMPLEMENT asks for, not a speculative extensible
//    registry.
//
// 3. Per-pack resolution status (`packs`) is threaded through unmodified
//    from resolveWorldContent -- a broken binding must stay visible to a
//    catalogue consumer (a UI populating a species selector should be able
//    to show "one pack failed to load"), not silently vanish. Mirrors
//    world-content-runtime.ts's own design decision 1 exactly, generalized
//    one layer up.
//
// 4. No caching, no writes, no capability check -- same posture as
//    world-content-runtime.ts's own design decision 5, for the same reason
//    (GET /api/worlds/:id/content and GET /api/worlds/:id/content-packs's
//    shared precedent: reading is not gated the way writing is).

import { resolveWorldContent, type WorldContentEntry, type WorldContentPackResolution } from './world-content-runtime'

// ---------------------------------------------------------------------------
// The catalogue entry shape -- identity + provenance only. See design
// decision 1.
// ---------------------------------------------------------------------------

export type ContentCatalogueEntry = {
  packageId: string
  packageVersion: string
  systemKey: string
  title: string
  slug: string
  externalId: string
  provider: string
  sourceBook?: string
  sourcePage?: string
}

// Named aliases per category -- distinct types (not just one shared type
// used six times) so a future gameplay module can import exactly the one
// it needs (`import type { SpeciesCatalogueEntry } from '...'`) and so each
// category has a seam to grow its own fields later without touching the
// others, without implying today that any of the six differ yet.
export type SpeciesCatalogueEntry = ContentCatalogueEntry
export type ClassCatalogueEntry = ContentCatalogueEntry
export type BackgroundCatalogueEntry = ContentCatalogueEntry
export type FeatCatalogueEntry = ContentCatalogueEntry
export type ItemCatalogueEntry = ContentCatalogueEntry
export type SpellCatalogueEntry = ContentCatalogueEntry

export type WorldGameplayCatalogue = {
  worldId: string
  packs: WorldContentPackResolution[]
  species: SpeciesCatalogueEntry[]
  classes: ClassCatalogueEntry[]
  backgrounds: BackgroundCatalogueEntry[]
  feats: FeatCatalogueEntry[]
  items: ItemCatalogueEntry[]
  spells: SpellCatalogueEntry[]
}

// The exact, closed entityType -> catalogue-collection mapping -- see
// design decision 2. Keyed by the literal strings app/lib/importers'
// preview5eTools* functions already write (verified directly against each:
// 'species', 'class', 'background', 'feat', 'item', 'spell').
const ENTITY_TYPE_TO_CATEGORY: Record<string, keyof Omit<WorldGameplayCatalogue, 'worldId' | 'packs'>> = {
  species: 'species',
  class: 'classes',
  background: 'backgrounds',
  feat: 'feats',
  item: 'items',
  spell: 'spells'
}

function toCatalogueEntry(entry: WorldContentEntry): ContentCatalogueEntry {
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

// The canonical entry point for this consumer layer. Composes
// resolveWorldContent (Content Resolution Phase 1) and nothing else --
// this function performs no I/O of its own. A World with zero bindings, or
// whose bound packs contain none of the six known categories, resolves to
// a catalogue with every collection empty, never an error -- the same
// "absence is legal" posture resolveWorldContent already established.
export async function getWorldContentCatalogue(worldId: string | number): Promise<WorldGameplayCatalogue> {
  const resolved = await resolveWorldContent(worldId)

  const catalogue: WorldGameplayCatalogue = {
    worldId: resolved.worldId,
    packs: resolved.packs,
    species: [],
    classes: [],
    backgrounds: [],
    feats: [],
    items: [],
    spells: []
  }

  for (const entry of resolved.entries) {
    const category = ENTITY_TYPE_TO_CATEGORY[entry.entityType]
    if (!category) {
      continue
    }

    catalogue[category].push(toCatalogueEntry(entry))
  }

  return catalogue
}
