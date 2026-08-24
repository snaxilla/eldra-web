// World Content Catalogue -- Content Consumers Phase 1.
// See server/utils/world-content-runtime.ts (Content Resolution Phase 1,
// which this module consumes and does not duplicate) and this task's own
// OBJECTIVE: "Teach Eldra how to consume the World Content Runtime." The
// runtime returns grouped OPAQUE entries (`byEntityType: Record<string,
// WorldContentEntry[]>`, keyed by whatever string an adapter happened to
// write, `data` untouched). This module is the first consumer: it turns
// that into STRONGLY-TYPED gameplay catalogues -- one named collection per
// category (species/classes/backgrounds/feats/items/spells/monsters) -- so
// a future gameplay system reads `catalogue.species`, never
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
// 1. Every catalogue entry carries the fields already normalized at the
//    envelope level by content-pack-5etools-adapter.ts (systemKey/title/
//    slug/externalId/provider/sourceBook/sourcePage) plus which bound pack
//    it came from (packageId/packageVersion).
//
//    PHASE 1 additionally refused to read anything out of `data`, because
//    doing so would have required per-category interpretation of 5etools'
//    own (widely different, mechanically rich) JSON shapes -- explicitly
//    deferred, not merely unbuilt. CHARACTER BUILDER / CHARACTER SHEET
//    PHASE 2 CLOSES THAT DEFERRAL, and this is the module where it closes:
//    species/classes/backgrounds entries now also carry a `presentation`
//    model.
//
//    The line Phase 1 drew is preserved rather than erased. This module
//    still performs NO interpretation itself: it delegates to
//    app/lib/content-presentation (a pure, system-keyed resolver) and stores
//    what comes back. All knowledge of 5etools field names lives there, in
//    exactly one place, and the catalogue remains a module that knows only
//    which CATEGORY an entry belongs to. And what the resolver produces is
//    still not mechanics -- it restates information the pack already
//    publishes (Speed, Hit Die, Darkvision) without computing movement, hit
//    points, or vision. "Do NOT interpret gameplay mechanics. Do NOT compute
//    rules." is unchanged and still holds.
//
//    Only the three character-facing categories resolve a presentation
//    model. Feats, items, spells, and monsters deliberately do not: no
//    surface consumes them yet, and resolving 391 spells on every catalogue
//    read would be cost with no reader. They are a later phase, and adding
//    them is one line in PRESENTATION_KIND_BY_CATEGORY below.
//
// 2. SEVEN FIXED, named collections, not a generic Record -- the entire
//    value this module adds over the runtime's own `byEntityType`. An
//    entityType none of the 5etools adapters produce (i.e. not one of
//    species/class/background/feat/item/spell/enemy -- see app/lib/importers'
//    preview5eTools* functions, the only entityType producers that exist)
//    is not collected into any of the seven typed arrays. This mirrors the
//    runtime's own "do not redesign" posture: closed, not a speculative
//    extensible registry. `enemy` (not `monster`) is the literal
//    preview5eToolsMonsters actually writes -- see
//    content-pack-monsters-adapter.ts's own design decision 3 for why that
//    mismatch against app/lib/systems/dnd5e.ts's `entityType: 'monster'`
//    registration is deliberately left unresolved here.
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

import { resolveContentPresentation, type PresentationEntry, type PresentationKind } from '../../app/lib/content-presentation'
import type { RulesFacet } from '../../app/lib/content-rules'
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
  // Present only for species/classes/backgrounds -- see design decision 1.
  // `null` (rather than absent) means the category IS presentable but this
  // particular entry could not be resolved: an unreadable `data` payload, or
  // a pack from a game system Eldra has no resolver for. Consumers render
  // identity and provenance and say so, never an error.
  presentation?: PresentationEntry | null
  // rules-package-architecture.md §8 -- Step 4. Carried through from the
  // published entry VERBATIM: unlike `presentation`, which this module
  // computes on every read, a facet is a published fact and this layer only
  // relays it. Absent on every pack published before Step 4.
  //
  // This is what the Character -> ActorState bridge reads, and the ONLY
  // thing it reads about content. `data` is never exposed here and the
  // bridge never sees it (§8.4).
  rulesFacet?: RulesFacet
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
export type MonsterCatalogueEntry = ContentCatalogueEntry

export type WorldGameplayCatalogue = {
  worldId: string
  packs: WorldContentPackResolution[]
  species: SpeciesCatalogueEntry[]
  classes: ClassCatalogueEntry[]
  backgrounds: BackgroundCatalogueEntry[]
  feats: FeatCatalogueEntry[]
  items: ItemCatalogueEntry[]
  spells: SpellCatalogueEntry[]
  monsters: MonsterCatalogueEntry[]
}

// The exact, closed entityType -> catalogue-collection mapping -- see
// design decision 2. Keyed by the literal strings app/lib/importers'
// preview5eTools* functions already write (verified directly against each:
// 'species', 'class', 'background', 'feat', 'item', 'spell', 'enemy').
type CatalogueCategory = keyof Omit<WorldGameplayCatalogue, 'worldId' | 'packs'>

const ENTITY_TYPE_TO_CATEGORY: Record<string, CatalogueCategory> = {
  species: 'species',
  class: 'classes',
  background: 'backgrounds',
  feat: 'feats',
  item: 'items',
  spell: 'spells',
  enemy: 'monsters'
}

// Which catalogue categories resolve a presentation model, and as which
// kind. Keyed by CATALOGUE CATEGORY (not entityType) so it reads against
// WorldGameplayCatalogue's own field names. See design decision 1 for why
// this is deliberately three entries and not seven.
const PRESENTATION_KIND_BY_CATEGORY: Partial<Record<CatalogueCategory, PresentationKind>> = {
  species: 'species',
  classes: 'class',
  backgrounds: 'background'
}

function toCatalogueEntry(entry: WorldContentEntry, category: CatalogueCategory): ContentCatalogueEntry {
  const base: ContentCatalogueEntry = {
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

  // Relayed, not computed -- see the field's own note above. Assigned only
  // when the published entry actually carries one, so an entry with no facet
  // keeps exactly the key set it had before Step 4 rather than gaining a
  // `rulesFacet: undefined`. That matters at this scale: a bound XMM pack is
  // thousands of entries, and none of them will ever have a facet.
  if (entry.rulesFacet) {
    base.rulesFacet = entry.rulesFacet
  }

  const kind = PRESENTATION_KIND_BY_CATEGORY[category]
  if (!kind) {
    return base
  }

  // `data` is read here and NOWHERE else in this module -- and it is handed
  // straight to the resolver rather than inspected. One malformed entry must
  // never take down a World's whole catalogue, so a throwing resolver
  // degrades this entry to `presentation: null` and leaves the other 37
  // intact. Same "absence is legal, and must stay visible" posture design
  // decision 3 applies to a broken pack binding.
  try {
    base.presentation = resolveContentPresentation(entry.systemKey, kind, entry.data)
  } catch {
    base.presentation = null
  }

  return base
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
    spells: [],
    monsters: []
  }

  for (const entry of resolved.entries) {
    const category = ENTITY_TYPE_TO_CATEGORY[entry.entityType]
    if (!category) {
      continue
    }

    catalogue[category].push(toCatalogueEntry(entry, category))
  }

  return catalogue
}
