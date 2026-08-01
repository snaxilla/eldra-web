# Project Status

This project is under active development. Apparent duplication, transitional code, and legacy compatibility paths may be intentional. Do not "clean them up" without understanding the migration strategy.

# Eldra Web

## Overview

Eldra is a worldbuilding / virtual tabletop (VTT) web app: users create "worlds," populate them with
wiki-style entities (characters, locations, items, factions, etc.), build interactive maps, run D&D
5e character sheets, and track timelines of in-world events. It is a Nuxt 4 application backed by
Directus (headless CMS / Postgres) as the system of record, with a thin Nuxt server layer acting as a
BFF (backend-for-frontend) in front of Directus.

The active area of development is the **World Editor map/scene system** (see git log: "scene graph",
"build tool palette", "Road Tool", "canonical layer object persistence") — a from-scratch
Figma/GIS-style scene graph for authoring interactive maps (pins, image overlays, roads, and future
object types like regions, weather, encounter zones).

## Architecture Summary

- **Framework**: Nuxt 4 (Vue 3, `<script setup>`, TypeScript), Nuxt UI v4 component library, Tailwind
  CSS v4.
- **Data layer**: [Directus](https://directus.io/) is the CMS/database. The Nuxt server (`server/api`,
  `server/utils`) never exposes Directus directly to the browser — it proxies/transforms requests using
  a service token (`DIRECTUS_TOKEN`) or the user's session token forwarded from a cookie
  (`eldra_session`).
- **Auth**: Cookie-based session against Directus (`/api/auth/login|logout|me`), fronted by
  `useAuth()` (client state via `useState`) and `middleware/auth.ts` / `middleware/admin.ts` route
  guards.
- **Rendering**: Server-rendered/universal Nuxt pages under `app/pages`, most business logic lives in
  page `<script setup>` blocks and composables per the project's own convention (see Coding
  Conventions below), with presentation pushed into `app/components`.
- **Map rendering**: [Leaflet](https://leafletjs.com/) (`WorldMapLeaflet.client.vue`, client-only
  component) draws a custom "scene" of layers/objects on top of a raster/tiled map image.
- **Rich text**: Tiptap-based editor (`EldraRichTextEditor.vue`) for wiki article content, rendered
  back out via `BlockRenderer.vue` / `utils/renderMarkdown.ts` / `utils/render5e.ts`.
- **Dice rolling**: `@3d-dice/dice-box` (`EldraDiceBox.client.vue`), 3D physics dice for the character
  sheet system.

## Major Systems

### 1. World Editor / Scene Graph (map authoring)

The canonical design doc is [.github/docs/architecture/scene-graph.md](.github/docs/architecture/scene-graph.md) — read it before touching
map code. Core philosophy: **Scene → Layer → Layer Object** is the single source of truth for map
content; rendering, editor UI, and persistence are all "projections" of it. Objects describe *intent*
(geometry + properties + style), never renderer-specific data.

- Hierarchy: `Scene` owns ordered `Layer`s; each `Layer` owns `Object`s (pins, image overlays, roads,
  future: regions/fog/weather/encounter zones/trigger volumes).
- Every object has three independent sections: **Geometry** (where), **Properties** (what/semantics),
  **Style** (visual intent only — renderers translate it to engine-specific drawing).
- Current implementation status (see recent commits): the `SceneLayer`/`LayerObject` TypeScript shapes
  are currently duplicated inline in both [app/pages/worlds/[id]/index.vue](app/pages/worlds/%5Bid%5D/index.vue) and
  [app/components/world/WorldMapLeaflet.client.vue](app/components/world/WorldMapLeaflet.client.vue) rather than imported from one shared module —
  this is an active seam being worked (see "Prepare scene graph seams for canonical map object
  persistence"), not a finished abstraction.
- Build tools: `world-map-active-build-tool` (`useState`) drives an active tool (`select | pin |
  image-overlay | road`) toggled from `MapBuildBanner.vue` / a build tool palette; `play` vs `build`
  mode is tracked via the `world-workspace-mode` `useState`.
- Key components: [app/components/world/WorldMapLeaflet.client.vue](app/components/world/WorldMapLeaflet.client.vue) (renderer, client-only — Leaflet
  needs `window`), `app/components/world/map/*` (Map­BreadcrumbsPanel, MapLayerPanel, MapPinEditor,
  MapImageOverlayEditor, MapSelectedPinCard, MapBuildBanner).
- Persistence today is a mix of legacy dedicated Directus collections (`maps`, pins via
  `server/utils/map-pins.ts`) and the newer canonical layer-object model being introduced; expect both
  to co-exist mid-migration (legacy fallback rendering paths are explicit in the git history).
- Map tiling for large images: `server/api/map-tiles/[mapId]/[z]/[x]/[y].get.ts` +
  `server/utils/map-tiles.ts` (on-demand tile generation, likely via `sharp`).

### 2. Entities (wiki content model)

Generic polymorphic content type used for characters, locations, items, factions, etc. Core shape in
[app/lib/eldra/types.ts](app/lib/eldra/types.ts): `EldraEntity` (`worldId`, `systemKey`, `entityType`, `title`, `slug`, `status`,
`visibility`) plus `EldraEntityBlockInstance` — entities are composed of ordered, repeatable "blocks"
(`blockKey`, arbitrary `data`), rendered via `BlockRenderer.vue`. CRUD lives under
`server/api/worlds/[id]/entities/**` and `server/api/entities/**`; relationships between entities are
a separate first-class API (`server/api/worlds/[id]/relationships*`, `server/utils/entity-relationships.ts`).

### 3. Character System (D&D 5e)

The most complex subsystem. A "character" is an `entity` with `entity_type` in
`character|npc|npc_sheet|pc|player_character`, paired with a `character_sheets` Directus record (see
`server/utils/character-sheets.ts`, `character-sheet-math.ts`, `character-sheet-resolver.ts`,
`character-sheet-subclasses.ts`, `character-sheet-inventory.ts`, `character-sheet-inventory-transfers.ts`,
`character-sheet-notes.ts`). Supports: stats/abilities, class levels & subclasses, spells, feats,
inventory (with player-to-player/NPC item transfers, including a realtime SSE-style bridge —
`inventory-transfer-realtime-bridge.ts`), rests, and a homebrew content forge (custom items/spells/
enemies — `app/components/admin/homebrew/*`, `server/utils/homebrew.ts`). Rule data is sourced from
5etools imports (see System 5 below) via `app/lib/systems/dnd5e.ts`. UI lives under
`app/components/characters/*` (many `Sheet*.vue` components) and `app/pages/worlds/[id]/characters/**`
and `app/pages/worlds/[id]/entities/[entityId]/sheet.vue`.

### 4. Timeline System

Per-world timelines of dated in-world events. API: `server/api/worlds/[id]/timelines/**`
(`index.get/post`, `[timelineId].get/patch/delete`, `[timelineId]/events.post`,
`[timelineId]/events/[eventId].patch/delete`). UI: `app/pages/worlds/[id]/timelines/index.vue` and
`[timelineId].vue`. Straightforward CRUD layered on Directus collections; no client-side state-machine
complexity like the scene graph.

### 5. Rules-System / Import Pipeline

`app/lib/systems/*` defines a pluggable "game system" abstraction (`systems/types.ts`,
`systems/dnd5e.ts`) so entity types/blocks can be system-specific (currently only D&D 5e is
implemented; `systemKey` on worlds/entities is the extension point). `app/lib/importers/*` +
`server/api/import/**` + `server/utils/import-*.ts` implement a 5etools JSON → Directus import
pipeline (preview then save, per content type: spells, items, monsters, classes, species, backgrounds,
feats), used by `app/pages/dev/import-*` pages and `app/pages/worlds/[id]/importer.vue`.

## State Management

No Vuex/Pinia. State management is native Nuxt: `useState('key', initFn)` for cross-component/SSR-safe
shared state (e.g. `world-workspace-mode`, `world-map-active-build-tool`, `eldra-auth`), plain `ref`/
`computed` for local component state, and `useFetch`/`$fetch` for data loading (server routes under
`server/api/**` are the only fetch target — never call Directus from the client).

## Important Directories

```
app/
  app.vue, app.config.ts        Root shell (NuxtLoadingIndicator + UApp + NuxtLayout)
  layouts/                      default | world-map | world-workspace
  pages/                        File-based routing incl. worlds/[id]/** (the World workspace)
  components/
    world/                      Map + world workspace UI (scene graph consumers)
    world/map/                  Map build-tool panels/editors
    characters/                 Character sheet UI (Sheet*.vue)
    admin/homebrew/             Homebrew content forge
    entities/, importer/        Entity cards, import preview panels
  composables/                  useAuth, useSidebar, useTheme, useEntityTypeUi
  lib/
    eldra/                      Core domain types (EldraWorld, EldraEntity, ...) + dev fixture data
    systems/                    Pluggable game-system abstraction (dnd5e)
    importers/                  5etools → Eldra data mappers
  middleware/                   auth.ts, admin.ts route guards
  utils/                        renderMarkdown, render5e, misc render helpers
server/
  api/                          Nuxt server routes (BFF layer), mirrors app/pages/worlds/[id]/** shape
  utils/                        Directus client + all business logic (character sheets, maps, imports,
                                 relationships, homebrew, entity factory)
.github/docs/architecture/      Design docs (scene-graph.md) — read before map/scene work
scripts/directus/               One-off Directus schema-creation scripts (Node, run manually)
```

**Legacy/dead directories — do not add to these:** top-level `components/`, `composables/`, and
`assets/` (outside `app/`) are pre-Nuxt-4-restructure leftovers, superseded by their `app/` equivalents
(e.g. `components/AppSidebar.vue` is stale; `app/components/AppSidebar.vue` is live). They still exist
on disk but are not part of the active Nuxt `srcDir`. Also `backups/*.bak.*` files are ad hoc backups,
not source.

## Coding Conventions

Formal standards are checked into [.github/copilot-instructions.md](.github/copilot-instructions.md) — treat these as binding:

- Preserve existing functionality; never redesign a working system unless asked.
- Business logic belongs in pages or composables; presentation belongs in Vue components. Avoid
  unnecessary wrapper components; keep component APIs small.
- Prefer extraction/moving code over rewriting it. Don't invent new abstractions unless asked.
- Use `<script setup lang="ts">` everywhere. Match existing formatting/style in a file rather than
  imposing a new one.
- Refactors: read all affected files first, make the smallest change that accomplishes the goal, run
  `npm run build`, fix any errors, present the diff, and wait for approval before committing.
- Never commit or push without explicit user approval.

Observed patterns in the code (not formally documented, but consistent):
- Server route business logic is pushed into `server/utils/*.ts` helper modules; `server/api/**`
  handlers stay thin (parse params → call a util → return).
- Directus is always accessed through `directusRequest` / `directusServiceRequest`
  (`server/utils/directus.ts`) — never a raw `fetch` to Directus from elsewhere (map-data.ts uses a
  separate legacy `dxFetch`, note this inconsistency if refactoring that file).
  form for booleans/ids/dates coming back (see `normalizeMap` in `app/pages/worlds/[id]/index.vue`).
- Client-only browser-API components (Leaflet, dice box) use Nuxt's `.client.vue` suffix.

## Build Commands

Package manager is **pnpm** (`packageManager: pnpm@10.32.1`).

```
pnpm install       # install deps
pnpm dev           # dev server, http://localhost:3000
pnpm build         # production build (nuxt build)
pnpm preview        # preview a production build
pnpm run lint       # eslint .
pnpm run typecheck  # nuxt typecheck (vue-tsc)
```

CI (`.github/workflows/ci.yml`) runs `pnpm install`, `pnpm run lint`, `pnpm run typecheck` on every
push (Node 22). There is currently no automated test suite (no unit/e2e tests in the repo) — lint +
typecheck are the only automated gates. The Copilot instructions ask for `npm run build` as a manual
safety check after edits even though CI itself doesn't build.

Directus schema is provisioned via one-off shell scripts at the repo root
(`create_eldra_directus_schema.sh`, `create_eldra_collections_minimal.sh`, `create_worlds_only.sh`,
`create_block_instances_schema.sh`, `verify_directus_collections.sh`, `directus_debug.sh`) and Node
scripts in `scripts/directus/*.mjs` — these are infra/setup tooling, not part of the app build.

## Key Files

- [nuxt.config.ts](nuxt.config.ts) — modules (`@nuxt/ui`), runtime config (Directus URL/token), global CSS.
- [app/lib/eldra/types.ts](app/lib/eldra/types.ts) — core domain types (World, Entity, EntityBlockInstance).
- [server/utils/directus.ts](server/utils/directus.ts) — the only sanctioned way to talk to Directus.
- [app/composables/useAuth.ts](app/composables/useAuth.ts) — session/auth state.
- [app/pages/worlds/[id]/index.vue](app/pages/worlds/%5Bid%5D/index.vue) — World Map page; owns the in-memory `SceneModel` and build-tool state.
- [app/components/world/WorldMapLeaflet.client.vue](app/components/world/WorldMapLeaflet.client.vue) — the scene renderer (Leaflet-backed).
- [server/utils/map-data.ts](server/utils/map-data.ts) / [server/utils/map-pins.ts](server/utils/map-pins.ts) — legacy map/pin persistence still in active use.
- [server/utils/character-sheets.ts](server/utils/character-sheets.ts) — character sheet aggregate load/save logic.
- [.github/docs/architecture/scene-graph.md](.github/docs/architecture/scene-graph.md) — authoritative scene graph design spec.
- [.github/copilot-instructions.md](.github/copilot-instructions.md) — binding process/style rules for AI-assisted edits.

## Current Technical Debt

- **Duplicated Scene Graph types**: `SceneLayer`/`LayerObject`/etc. TypeScript shapes are copy-pasted
  between `app/pages/worlds/[id]/index.vue` and `WorldMapLeaflet.client.vue` instead of living in one
  shared `app/lib/eldra` (or similar) module. Recent commits are actively working toward
  "canonical map object persistence," so expect this to be mid-refactor.
- **Two Directus access patterns**: `server/utils/directus.ts` (`directusRequest`/
  `directusServiceRequest`) is the general-purpose client, but `server/utils/map-data.ts` implements
  its own parallel `dxFetch` using `axios` directly against `process.env.DIRECTUS_URL`. Consolidating
  onto one client is a plausible future cleanup, but do it deliberately, not incidentally.
- **Legacy map/pin persistence vs. canonical layer objects**: pins currently have both a legacy
  dedicated flow (`map-pins.ts`, `MapPinEditor.vue`) and a newer canonical-layer-object path; rendering
  code (`WorldMapLeaflet.client.vue`) carries explicit "legacy fallback" logic per the git history
  ("Phase 3: render pins from scene layer with legacy fallback").
  Any migration work should keep both paths working until the old one is explicitly retired.
- **Dead top-level `components/`, `composables/` directories** (pre-`app/`-restructure leftovers) —
  risk of someone editing the stale copy by mistake. See "Legacy/dead directories" above.
- **Stray `.bak` files** committed under `app/lib/importers/*.ts.bak` and `backups/*.bak.*` — not
  loaded by the app, safe to ignore, candidates for deletion in a cleanup pass (confirm with the user
  first; don't delete unprompted).
- **No automated test suite** — correctness relies on lint + typecheck + manual verification. Be extra
  careful with runtime-only bugs (e.g. Directus field name mismatches) since nothing will catch them
  before deploy.
- **Loose typing at the Directus boundary**: server utils frequently use `any` for Directus API
  responses and hand-roll snake_case → camelCase normalization per endpoint (see `normalizeMap`,
  `normalizeUser`, `normalize` in `map-data.ts`) rather than a shared schema/validation layer.

## Known Architectural Boundaries

- **Client never talks to Directus directly.** All access goes through `server/api/**`, which uses a
  service token or forwards the session cookie. Don't add `$fetch` calls to a Directus URL from
  `app/**`.
- **Scene Graph is meant to be renderer/UI/storage-agnostic** (per the design doc): objects should
  describe geometry/properties/style only, never Leaflet-specific state. New map object types
  (regions, fog, weather, encounter zones, trigger volumes) should be added as new Object Types, not
  by changing the Scene/Layer/Object core shape.
- **`.client.vue` suffix is required** for any component touching browser-only APIs/libraries
  (Leaflet, dice box) — these do not run during SSR.
- **`app/` is the Nuxt 4 `srcDir`.** Anything meant to be part of the live app must go under `app/` (or
  `server/`), not the legacy top-level `components/`/`composables/`.
- **Game-system pluggability** (`systemKey`) is a real seam — entity types/blocks/character-sheet logic
  are meant to eventually support non-5e systems via `app/lib/systems/*`, even though only `dnd5e` is
  implemented today. Avoid hardcoding "5e-only" assumptions deeper into shared entity/world code than
  necessary.

## Recommendations for Future Claude Code Sessions

1. **Read [.github/copilot-instructions.md](.github/copilot-instructions.md) and follow it literally** — it's short, explicit, and
   the user has already encoded their preferred workflow there (small diffs, no auto-commit, run the
   build after edits, ask before destructive changes).
2. Before touching anything map/scene-related, read
   [.github/docs/architecture/scene-graph.md](.github/docs/architecture/scene-graph.md) and the last ~15 commits (`git log --oneline`) — this area is
   under active, deliberate refactor and half-finished-looking code (duplicated types, legacy fallback
   branches) is often intentional mid-migration state, not a bug to "fix" opportunistically.
3. When adding a new map object type, follow the Scene Graph doc's extension pattern (new Object Type)
   rather than modifying `Scene`/`Layer` core fields.
4. Don't "clean up" the legacy top-level `components/`/`composables/` or `.bak` files without asking —
   confirm they're truly unused first (they appear to be, but deletion is a call for the user).
5. There's no test suite; after any non-trivial change, at minimum run `pnpm run lint` and
   `pnpm run typecheck`, and where feasible exercise the affected page in the dev server per the
   project's own house rules.
6. When working on the character sheet system, note the fan-out across many small
   `server/utils/character-sheet-*.ts` files — find the specific concern (math, inventory, notes,
   subclasses, resolver) rather than assuming logic lives in `character-sheets.ts` itself.
# AI Working Agreement

This document is the canonical onboarding guide for AI assistants working on Eldra.

## Development Philosophy

- Preserve existing architecture whenever possible.
- Extend existing systems instead of creating parallel systems.
- Prefer incremental evolution over rewrites.
- Never redesign a working subsystem unless explicitly requested.
- Favor small, reviewable changes over large sweeping refactors.

## Current Development Roadmap

### Eldra 2.0 (Current Milestone)

Primary goal: Complete a fully playable campaign management platform.

Current priorities (in order):

1. Character Sheet infrastructure refactor
2. Desktop Character Sheet redesign
3. Performance optimization
4. Inventory & Equipment
5. Mobile UI cleanup
6. Relationships
7. Admin improvements
8. General polish

### Eldra 2.1

Authentication & Ownership

- Better Auth integration
- Google / Microsoft / Discord login
- User accounts
- Character ownership
- Campaign ownership
- Invitations
- Permissions

### Eldra 3.0

Virtual Tabletop

- Dynamic lighting
- Fog of War
- Vision system
- Walls
- Token ownership
- Initiative tracker
- Combat mode

## Definition of Done

A feature is considered complete only when:

- The requested functionality is implemented.
- Existing functionality remains intact.
- `pnpm run lint` passes.
- `pnpm run typecheck` passes.
- `pnpm build` passes when practical.
- Changes are logically grouped.
- A clear commit boundary has been reached.

## AI Rules

Always:

- Read only the files necessary for the requested task.
- Reuse existing systems before introducing new abstractions.
- Follow existing project conventions.
- Keep diffs as small as practical.
- Explain architectural decisions before implementing large refactors.
- Stop and ask before changing persistence models or public APIs.

Never:

- Rewrite functioning systems for style.
- Replace existing architecture without approval.
- Delete files without approval.
- Commit or push without approval.
- Introduce duplicate systems that solve an existing problem.
- Change renderer contracts unless explicitly requested.

## Architectural Priorities

When multiple implementation options exist, prefer:

1. Maintainability
2. Architectural consistency
3. Simplicity
4. Performance
5. Cleverness

## Session Workflow

For all non-trivial work:

1. Summarize the requested task.
2. Identify affected files.
3. Explain the implementation plan.
4. Wait for approval if the architecture changes.
5. Implement in logical commits.
6. Run validation.
7. Summarize completed work.