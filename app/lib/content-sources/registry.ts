// Content Source Registry -- the single, Eldra-owned model of "what can be
// imported," organized as Game System -> Content Source. See this task's
// own DESIGN GOAL: a GM should think "I'm importing the Player's Handbook,"
// never "I'm importing from 5etools" -- the importer (5etools JSON parsing,
// app/lib/importers/*) is an implementation detail this registry hides.
//
// Pure data, no I/O, no vendor references -- the same posture every other
// module in app/lib/ already holds (CLAUDE.md: "app/lib/importers/* and
// app/lib/eldra/* contain zero references [to Directus]"). This module
// additionally names no importer, no adapter, and no 5etools file -- a
// ContentSourceDefinition says WHAT a GM can import, never HOW.
//
// ---------------------------------------------------------------------------
// DESIGN DECISIONS
// ---------------------------------------------------------------------------
// 1. A REGISTRY, NOT A SWITCH STATEMENT (this task's own ARCHITECTURE
//    section) -- a plain, ordered array of Game Systems, each owning an
//    ordered array of Content Sources. Consumers (the Builder) iterate this
//    structure generically; nothing about a specific system or source is
//    hardcoded into consumer logic. A future Game System (e.g. Pathfinder)
//    or Content Source (e.g. the 2024 Player's Handbook) is added by
//    appending one entry here -- no Builder code changes required, which is
//    this task's own explicit test for the design.
//
// 2. `status: 'available'` is the ONLY thing that gates whether a source is
//    selectable, and it is set by hand, per source, matching reality: only
//    SRD 5.1 has a real preview route today
//    (GET /api/content-packs/preview/srd-5-1). Every other listed source is
//    `'coming-soon'` with no `previewEndpoint` -- "display only sources the
//    importer actually knows how to preview" is enforced by this field, not
//    by the Builder guessing or probing an endpoint.
//
// 3. `previewEndpoint` lives on the definition, not hardcoded in the
//    Builder -- this is what lets the Builder's "Generate Preview" action
//    stay source-agnostic. Adding a second working source later means
//    setting `status: 'available'` and a real `previewEndpoint` here; the
//    Builder's fetch call already reads it generically.
//
// 4. No publish-side wiring here. This registry only describes PREVIEW
//    availability (this task's own NON-GOALS: "Do NOT implement publishing
//    changes"). Publishing remains keyed on whatever `packageId`/`version`
//    the GM types, unchanged.

export type ContentSourceStatus = 'available' | 'coming-soon'

export type ContentSourceDefinition = {
  key: string
  label: string
  status: ContentSourceStatus
  // Only ever set when status is 'available' -- see design decision 2.
  previewEndpoint?: string
}

export type GameSystemDefinition = {
  key: string
  label: string
  contentSources: ContentSourceDefinition[]
}

// Phase 1: one Game System (Dungeons & Dragons 5e), one working Content
// Source (SRD 5.1). The remaining six are named per this task's own
// IMPLEMENT list, listed so a GM can see what is coming, disabled because
// no importer for them exists yet (this task's own NON-GOALS: "Do NOT
// implement preview support for books other than SRD 5.1").
export const GAME_SYSTEM_REGISTRY: readonly GameSystemDefinition[] = [
  {
    key: 'dnd5e',
    label: 'Dungeons & Dragons 5e',
    contentSources: [
      { key: 'srd-5.1', label: 'SRD 5.1', status: 'available', previewEndpoint: '/api/content-packs/preview/srd-5-1' },
      { key: 'phb-2014', label: "Player's Handbook (2014)", status: 'coming-soon' },
      { key: 'dmg', label: "Dungeon Master's Guide", status: 'coming-soon' },
      { key: 'mm', label: 'Monster Manual', status: 'coming-soon' },
      { key: 'xge', label: "Xanathar's Guide to Everything", status: 'coming-soon' },
      { key: 'tce', label: "Tasha's Cauldron of Everything", status: 'coming-soon' },
      { key: 'ftd', label: "Fizban's Treasury of Dragons", status: 'coming-soon' }
    ]
  }
]

export function listGameSystems(): readonly GameSystemDefinition[] {
  return GAME_SYSTEM_REGISTRY
}

export function getGameSystem(gameSystemKey: string): GameSystemDefinition | undefined {
  return GAME_SYSTEM_REGISTRY.find((system) => system.key === gameSystemKey)
}

export function getContentSource(gameSystemKey: string, sourceKey: string): ContentSourceDefinition | undefined {
  return getGameSystem(gameSystemKey)?.contentSources.find((source) => source.key === sourceKey)
}

// The default selection for a Game System -- its first `available` source,
// or its first source at all if (hypothetically) none are available yet.
// Used so a newly selected Game System never lands on a disabled source.
export function firstAvailableContentSource(gameSystemKey: string): ContentSourceDefinition | undefined {
  const system = getGameSystem(gameSystemKey)
  if (!system) return undefined
  return system.contentSources.find((source) => source.status === 'available') ?? system.contentSources[0]
}
