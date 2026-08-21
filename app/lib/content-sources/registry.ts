// Content Source Registry -- the single, Eldra-owned model of "what can be
// imported," organized as Game System -> Source Collection. See CLAUDE.md
// and .github/docs/architecture/content-source-architecture.md: a GM
// should think "I'm importing the Player's Handbook," never "I'm
// importing from 5etools" -- the importer (5etools JSON parsing,
// app/lib/importers/*) and the Source Collection Provider that wires it
// up (server/utils/content-sources/**) are implementation details this
// registry hides.
//
// Pure data, no I/O, no vendor references -- the same posture every other
// module in app/lib/ already holds (CLAUDE.md: "app/lib/importers/* and
// app/lib/eldra/* contain zero references [to Directus]"). This module
// additionally names no importer, no adapter, no 5etools file, no route,
// and -- as of Step 3 of the architecture doc's Implementation Sequence
// (§12) -- no availability. A SourceCollectionDefinition says WHAT a GM
// can import, never HOW, and never whether it currently works.
//
// ---------------------------------------------------------------------------
// DESIGN DECISIONS
// ---------------------------------------------------------------------------
// 1. A REGISTRY, NOT A SWITCH STATEMENT -- a plain, ordered array of Game
//    Systems, each owning an ordered array of Source Collections.
//    Consumers (the Builder) iterate this structure generically; nothing
//    about a specific system or collection is hardcoded into consumer
//    logic. A future Game System (e.g. Pathfinder) or Source Collection
//    (e.g. the 2024 Player's Handbook) is added by appending one entry
//    here -- no Builder code changes required.
//
// 2. NO `status` FIELD, AND NO `previewEndpoint` FIELD (removed in Step 3;
//    see the architecture doc's §2.5/§2.6/§6.3). Both were plumbing/
//    availability facts masquerading as domain data: `previewEndpoint` is
//    a route shape, and a hand-set `status: 'available'` boolean can lie
//    about whether a collection actually works on a given deployment (no
//    provider registered, or a provider registered but its dataset
//    missing). Availability is now DERIVED server-side, per request, by
//    merging this registry against server/utils/content-sources'
//    registered providers -- see GET /api/content-sources
//    (server/api/content-sources/index.get.ts). This module never
//    computes or stores it.
//
// 3. `books`, `license`, `description`, `suggestedPackageId` are added --
//    every one of them a fact about the collection itself (what book(s)
//    it is, who published it, what it may legally be republished under, a
//    sensible default package identifier) rather than about plumbing, and
//    every one of them was previously hardcoded inside a publish route
//    instead of living here (see the architecture doc's §2.7). `license`
//    is not decorative: ownership-and-permissions.md §7.2.3 makes license
//    metadata legally load-bearing for a published Content Pack.
//
// 4. Three of the nine listed collections have a registered provider
//    (server/utils/content-sources' PROVIDERS array: SRD 5.1, XPHB, and
//    XDMG); the other six are listed anyway so a GM can see the full shape
//    of what Eldra will eventually support, per design decision 1's own
//    "no Builder code changes required" test -- which XPHB proved
//    literally, and XDMG proved again: each addition changed this file and
//    one provider file, and no Builder code at all. `available` is
//    computed entirely by the absence of a matching provider, never by a
//    field on these entries -- design decision 2.
//
// 5. No publish-side route/endpoint wiring here, still. This registry
//    describes collection identity/licensing/labels only; which routes
//    exist to preview or publish a given collection is a server-side,
//    per-collection concern (server/utils/content-sources/**) this module
//    has no opinion on.

export type SourceBookRef = {
  // The publisher's own code for this book, e.g. '5etools' source codes
  // like 'PHB'/'DMG'/'MM' -- for display and attribution, never used as a
  // lookup key (that's `SourceCollectionDefinition.key`).
  code: string
  title: string
  publisher?: string
  year?: number
}

export type SourceCollectionLicense = {
  // e.g. 'OGL-1.0a' | 'CC-BY-4.0' | 'proprietary' -- deliberately a plain
  // string, not a closed union: new licenses appear faster than this
  // module should need a code change to name them.
  id: string
  notice?: string
  attribution?: string
}

export type SourceCollectionDefinition = {
  key: string
  label: string
  description?: string
  // One book, many books, an SRD, or a publisher bundle -- the Builder
  // does not care which; it only ever renders `label`/`books` for
  // context, never branches on how many there are.
  books: readonly SourceBookRef[]
  license: SourceCollectionLicense
  // A sensible default for the Publish form's Package Name field -- never
  // enforced, never a lock. See AdminContentPackBuilderPanel.vue.
  suggestedPackageId: string
}

export type GameSystemDefinition = {
  key: string
  label: string
  collections: readonly SourceCollectionDefinition[]
}

// Phase 1: one Game System (Dungeons & Dragons 5e), one Source Collection
// with a registered provider (SRD 5.1 -- server/utils/content-sources/
// dnd5e/srd-5-1.ts). The remaining six are named so a GM can see what is
// coming; each is real, correctly-attributed domain data (title,
// publisher, year, license) even though none has a provider registered
// yet, per design decision 4.
export const GAME_SYSTEM_REGISTRY: readonly GameSystemDefinition[] = [
  {
    key: 'dnd5e',
    label: 'Dungeons & Dragons 5e',
    collections: [
      {
        key: 'srd-5.1',
        label: 'SRD 5.1',
        description: 'Core Dungeons & Dragons 5th Edition rules content released by Wizards of the Coast under the System Reference Document 5.1.',
        books: [{ code: 'SRD5.1', title: 'System Reference Document 5.1', publisher: 'Wizards of the Coast' }],
        license: {
          id: 'OGL-1.0a',
          notice: 'This Content Pack includes material from the System Reference Document 5.1 ("SRD 5.1"), licensed under the Open Game License Version 1.0a. Portions of the Materials used are property of Wizards of the Coast LLC and are used with permission under the OGL 1.0a.',
          attribution: 'System Reference Document 5.1. Copyright Wizards of the Coast LLC.'
        },
        suggestedPackageId: 'eldra.content.srd-5.1'
      },
      {
        key: 'xphb',
        label: "Player's Handbook (2024)",
        description: "The 2024 revision of the Dungeons & Dragons Player's Handbook.",
        books: [{ code: 'XPHB', title: "Player's Handbook", publisher: 'Wizards of the Coast', year: 2024 }],
        // NOT freely licensed -- unlike SRD 5.1 (OGL-1.0a) and the 2024
        // SRD 5.2 (CC-BY-4.0), the 2024 Player's Handbook is neither. See
        // the architecture doc's §9: a `proprietary` entry makes the pack
        // TECHNICALLY publishable, which is exactly why whether to ship it
        // is a deliberate product/legal decision rather than an
        // architectural one. Recorded honestly here; not decided here.
        license: { id: 'proprietary' },
        suggestedPackageId: 'eldra.content.xphb'
      },
      {
        key: 'phb-2014',
        label: "Player's Handbook (2014)",
        books: [{ code: 'PHB', title: "Player's Handbook", publisher: 'Wizards of the Coast', year: 2014 }],
        license: { id: 'proprietary' },
        suggestedPackageId: 'eldra.content.phb-2014'
      },
      {
        key: 'xdmg',
        label: "Dungeon Master's Guide (2024)",
        description: "The 2024 revision of the Dungeons & Dragons Dungeon Master's Guide.",
        books: [{ code: 'XDMG', title: "Dungeon Master's Guide", publisher: 'Wizards of the Coast', year: 2024 }],
        // NOT freely licensed -- same status as xphb above, and for the
        // same reason (architecture doc §9): recorded honestly, not a
        // decision made here.
        license: { id: 'proprietary' },
        suggestedPackageId: 'eldra.content.xdmg'
      },
      {
        key: 'dmg',
        label: "Dungeon Master's Guide",
        books: [{ code: 'DMG', title: "Dungeon Master's Guide", publisher: 'Wizards of the Coast', year: 2014 }],
        license: { id: 'proprietary' },
        suggestedPackageId: 'eldra.content.dmg'
      },
      {
        key: 'mm',
        label: 'Monster Manual',
        books: [{ code: 'MM', title: 'Monster Manual', publisher: 'Wizards of the Coast', year: 2014 }],
        license: { id: 'proprietary' },
        suggestedPackageId: 'eldra.content.mm'
      },
      {
        key: 'xge',
        label: "Xanathar's Guide to Everything",
        books: [{ code: 'XGE', title: "Xanathar's Guide to Everything", publisher: 'Wizards of the Coast', year: 2017 }],
        license: { id: 'proprietary' },
        suggestedPackageId: 'eldra.content.xge'
      },
      {
        key: 'tce',
        label: "Tasha's Cauldron of Everything",
        books: [{ code: 'TCE', title: "Tasha's Cauldron of Everything", publisher: 'Wizards of the Coast', year: 2020 }],
        license: { id: 'proprietary' },
        suggestedPackageId: 'eldra.content.tce'
      },
      {
        key: 'ftd',
        label: "Fizban's Treasury of Dragons",
        books: [{ code: 'FTD', title: "Fizban's Treasury of Dragons", publisher: 'Wizards of the Coast', year: 2021 }],
        license: { id: 'proprietary' },
        suggestedPackageId: 'eldra.content.ftd'
      }
    ]
  }
]

export function listGameSystems(): readonly GameSystemDefinition[] {
  return GAME_SYSTEM_REGISTRY
}

export function getGameSystem(gameSystemKey: string): GameSystemDefinition | undefined {
  return GAME_SYSTEM_REGISTRY.find((system) => system.key === gameSystemKey)
}

export function getSourceCollection(gameSystemKey: string, collectionKey: string): SourceCollectionDefinition | undefined {
  return getGameSystem(gameSystemKey)?.collections.find((collection) => collection.key === collectionKey)
}

// The default selection for a Game System, given the caller's own
// availability verdict (from GET /api/content-sources) -- this registry
// has no availability of its own to consult (design decision 2), so it
// cannot answer "which collection is available" alone anymore. `isAvailable`
// is supplied by the caller; this function only supplies the ORDERING
// ("first" is a registry fact) and the "never land on nothing" fallback
// (the first collection at all, if none are available yet).
export function firstAvailableCollection(
  gameSystemKey: string,
  isAvailable: (collectionKey: string) => boolean
): SourceCollectionDefinition | undefined {
  const system = getGameSystem(gameSystemKey)
  if (!system) return undefined
  return system.collections.find((collection) => isAvailable(collection.key)) ?? system.collections[0]
}
