# Project Status

This project is under active development. Apparent duplication, transitional code, and legacy compatibility paths may be intentional. Do not "clean them up" without understanding the migration strategy.

# Product Vision

Eldra is not intended to be merely a campaign management tool.

The long-term vision is a modern, self-hosted Virtual Tabletop built around worldbuilding, persistent campaign management, collaborative storytelling, and tactical battlemaps.

Major architectural decisions should be evaluated against that long-term vision.

Features should generally evolve existing systems rather than introducing parallel implementations.

# Eldra Web

## Overview

Eldra is a worldbuilding / virtual tabletop (VTT) web app: users create "worlds," populate them with
wiki-style entities (characters, locations, items, factions, etc.), build interactive maps, run D&D
5e character sheets, and track timelines of in-world events. It is a Nuxt 4 application backed by
Directus (headless CMS / Postgres) as the system of record, with a thin Nuxt server layer acting as a
BFF (backend-for-frontend) in front of Directus.

Recent commit history is dominated by the **World Editor map/scene system** ("scene graph", "build
tool palette", "Road Tool", "canonical layer object persistence") — a from-scratch Figma/GIS-style
scene graph for authoring interactive maps (pins, image overlays, roads, and future object types like
regions, weather, encounter zones). However, the explicit **Current Development Roadmap** (see below)
lists Character Sheet infrastructure/redesign as the top priorities for the "Eldra 2.0" milestone and
doesn't call out Scene Graph work by name — treat both signals as real: git history shows where recent
effort actually went, the roadmap states current intent. If a task's priority relative to these isn't
obvious, ask rather than assume one supersedes the other.

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
- `SceneLayer`/`LayerObject`/etc. TypeScript shapes live in one shared module,
  [app/lib/eldra/scene.ts](app/lib/eldra/scene.ts), imported by both [app/pages/worlds/[id]/index.vue](app/pages/worlds/%5Bid%5D/index.vue) and
  [app/components/world/WorldMapLeaflet.client.vue](app/components/world/WorldMapLeaflet.client.vue).
- Build tools: `world-map-active-build-tool` (`useState`) drives an active tool (`select | pin |
  image-overlay | road`) toggled from `MapBuildBanner.vue` / a build tool palette; `play` vs `build`
  mode is tracked via the `world-workspace-mode` `useState`.
- Key components: [app/components/world/WorldMapLeaflet.client.vue](app/components/world/WorldMapLeaflet.client.vue) (renderer, client-only — Leaflet
  needs `window`), `app/components/world/map/*` (Map­BreadcrumbsPanel, MapLayerPanel, MapPinEditor,
  MapImageOverlayEditor, MapSelectedPinCard, MapBuildBanner).
- **Persistence**: Image Overlays and Roads persist through the canonical Scene Layer Object
  persistence system — [server/utils/scene-layer-objects.ts](server/utils/scene-layer-objects.ts) (the permanent client/server contract,
  `listLayerObjects`/`createLayerObject`/`updateLayerObject`/`deleteLayerObject`) backed by the
  `scene_layer_objects` Directus collection (schema: [scripts/directus/create-scene-layer-objects-schema.mjs](scripts/directus/create-scene-layer-objects-schema.mjs)).
  The client (`app/pages/worlds/[id]/index.vue`) never talks to Directus directly, only to
  `server/api/worlds/[id]/maps/[mapId]/layer-objects/**`. **Pins intentionally remain on the legacy
  `map_pins` Directus collection** (`server/utils/map-pins.ts`, `/api/map-pins/**`) — pin *rendering*
  already flows through the Scene Graph (pins are adapted into `LayerObject` shape client-side via the
  `pinLayerObjects` computed before reaching the renderer), but pin *persistence* migration onto
  `scene_layer_objects` is intentionally deferred pending a future design proposal, not started. See
  Scene Graph Status below.
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

**Note the scale of `sheet.vue` itself**: `app/pages/worlds/[id]/entities/[entityId]/sheet.vue` is
~8,900 lines in a single file — by far the largest file in the app and a direct tension with the
"business logic in composables, presentation in components" convention. Recent git history (rail
width standardization, single-open-drawer behavior, theme defaults) shows this file under continuous,
incremental churn rather than being frozen legacy. This matches the roadmap's #1/#2 priorities
("Character Sheet infrastructure refactor", "Desktop Character Sheet redesign" — see Current
Development Roadmap below): expect this file to be an active refactor target, and prefer extracting
cohesive pieces into `Sheet*.vue` components/composables over adding more logic inline, consistent with
the project's own stated convention.

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

### 6. World Page Presentation

A smaller, separate system for per-page visual customization (background image/theme) of world
workspace pages, keyed by `pageKey` (see `pageKey` computed logic in `app/layouts/world-workspace.vue`).
UI: `app/components/world/WorldPagePresentationPanel.vue` (~490 lines). API:
`server/api/worlds/[id]/presentation/[pageKey].get/post.ts` and `presentation/upload-background.post.ts`.
Independent of the Scene Graph — don't confuse "presentation" (page chrome/background) with
"properties"/"style" in the Scene Graph object model.

## Layouts

Two layouts are relevant to map/world work and are easy to conflate:
- `world-map.vue` — a bare fullscreen shell (just a slot on a dark background), used for map-only
  views.
- `world-workspace.vue` — the full World workspace chrome: owns `world-workspace-mode` (`play`/`build`),
  the show-pins cookie/state, the collapsible left sidebar, and the page Presentation system above. Most
  `worlds/[id]/**` pages use this one.

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
- `server/utils/directus.ts` (`directusRequest`/`directusServiceRequest`) is the *intended* single
  Directus client, but in practice most `server/api/**` route files and several `server/utils/*.ts`
  files define their own local `dxFetch`/`baseUrl`/`token` trio that hits `process.env.DIRECTUS_URL`
  with a raw `fetch` directly — see "Two Directus access patterns" under Technical Debt below before
  assuming `directus.ts` is universally used.
- Directus returns snake_case rows; call sites normalize them into camelCase by hand at the boundary
  (see `normalizeMap`/`normalize` in `app/pages/worlds/[id]/index.vue` and `server/utils/map-data.ts`,
  `normalizeUser` in `useAuth.ts`) rather than through a shared schema/mapper.
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
typecheck are the only automated gates.

**Package-manager inconsistency across docs — use pnpm.** The project's actual package manager is
pnpm (lockfile, CI, `packageManager` field), but `.github/copilot-instructions.md` says to run
`npm run build` as a safety check, and [Dockerfile](Dockerfile) builds the production image with plain `npm install`
/ `npm run build` (no lockfile committed for npm, no pnpm in the image). Treat `pnpm build` /
`pnpm run lint` / `pnpm run typecheck` as authoritative for local verification; don't "fix" the
Dockerfile or copilot-instructions.md to pnpm without asking — the Docker build may intentionally
tolerate a lockfile-less `npm install` for portability, and changing it is a deployment-affecting
decision.

Directus schema is provisioned via one-off shell scripts at the repo root
(`create_eldra_directus_schema.sh`, `create_eldra_collections_minimal.sh`, `create_worlds_only.sh`,
`create_block_instances_schema.sh`, `verify_directus_collections.sh`, `directus_debug.sh`) and Node
scripts in `scripts/directus/*.mjs` — these are infra/setup tooling, not part of the app build.

## Key Files

- [nuxt.config.ts](nuxt.config.ts) — modules (`@nuxt/ui`), runtime config (Directus URL/token), global CSS.
- [app/lib/eldra/types.ts](app/lib/eldra/types.ts) — core domain types (World, Entity, EntityBlockInstance).
- [server/utils/directus.ts](server/utils/directus.ts) — the only sanctioned way to talk to Directus.
- [app/composables/useAuth.ts](app/composables/useAuth.ts) — session/auth state.
- [app/pages/worlds/[id]/index.vue](app/pages/worlds/%5Bid%5D/index.vue) — World Map page; owns the `SceneModel`, build-tool state, and the client-side write/read cache for Image Overlay/Road persistence.
- [app/components/world/WorldMapLeaflet.client.vue](app/components/world/WorldMapLeaflet.client.vue) — the scene renderer (Leaflet-backed).
- [server/utils/scene-layer-objects.ts](server/utils/scene-layer-objects.ts) — canonical Scene Layer Object persistence (Image Overlays, Roads); the runtime-model ↔ Directus-row translation boundary.
- [server/utils/map-data.ts](server/utils/map-data.ts) — Map (not Layer Object) metadata persistence; out of scope for the Scene Graph migration (a Map is the Scene's container, not a Layer Object).
- [server/utils/map-pins.ts](server/utils/map-pins.ts) — legacy pin persistence, intentionally still in active use (see Scene Graph Status below).
- [server/utils/character-sheets.ts](server/utils/character-sheets.ts) — character sheet aggregate load/save logic.
- [.github/docs/architecture/scene-graph.md](.github/docs/architecture/scene-graph.md) — authoritative scene graph design spec.
- [.github/copilot-instructions.md](.github/copilot-instructions.md) — binding process/style rules for AI-assisted edits.

## Current Technical Debt

- **Two Directus access patterns, and the "wrong" one is dominant**: `server/utils/directus.ts`
  (`directusRequest`/`directusServiceRequest`, session-cookie-aware) is the only client that respects
  the logged-in user's permissions. But a raw `dxFetch`/`baseUrl`/`token` helper (plain `fetch` or
  `axios` straight to `process.env.DIRECTUS_URL` with the *service* token) is copy-pasted independently
  in at least 15 files, including `server/utils/map-data.ts`, `map-pins.ts`, `entity-factory.ts`,
  `directus-maps.ts`, and route handlers like `server/api/worlds/[id]/maps.get.ts`,
  `presentation/[pageKey].get.ts`, `entities/[entityId].patch.ts`, `pins/create-entity.post.ts`. This
  is not one legacy outlier — it's the majority pattern for anything touching maps, pins, and entity
  writes. Consolidating is a large, cross-cutting refactor; don't do it opportunistically inside an
  unrelated task, and note that some of these routes may be *intentionally* using the service token
  (bypassing per-user permissions) rather than by accident — confirm intent before changing auth
  behavior on any one of them.
- **Pins: legacy persistence, but already canonical-shaped rendering**: pins persist via the dedicated
  `map_pins` collection (`map-pins.ts`, `MapPinEditor.vue`), not `scene_layer_objects` — intentionally
  deferred, see Scene Graph Status below. Rendering is already fully migrated: pins are adapted into
  `LayerObject` shape client-side (`pinLayerObjects` computed in `index.vue`) before reaching the
  renderer, so this is a persistence-backend gap, not a rendering-shape one.
- **Renderer compatibility paths (`WorldMapLeaflet.client.vue`), identified but not yet removed**:
  `SceneLayer.type`/`SceneLayer.data` and the `type === 'X'` / `pinsLayer?.data?.pins` / `props.pins`
  fallback branches in `resolvedPins`/`resolvedImageOverlays`/`resolvedRoads` (from the pre-migration
  "Phase 3: render pins from scene layer with legacy fallback" commit) all appear unreachable from the
  only current caller (`index.vue`'s `scene.value` never sets `.type`/`.data`, always populates
  `.objects`) — confirmed by tracing, not by removal. Left in place pending a runtime check (actually
  loading the World Map page and confirming behavior after removal), since this is renderer-facing code
  with no test coverage. Do not remove without that verification.
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

## Codebase-Specific Notes for Future Claude Code Sessions

General workflow rules (small diffs, ask before approval-gated changes, validation steps) are covered
by the **AI Working Agreement** and `.github/copilot-instructions.md` below — this list only covers
things specific to *this* codebase that aren't generic process advice:

1. Before touching anything map/scene-related, read
   [.github/docs/architecture/scene-graph.md](.github/docs/architecture/scene-graph.md), the Scene Graph Status section below, and the last ~15
   commits (`git log --oneline`) — Image Overlay/Road persistence is now canonical, but pins are
   *intentionally* still on legacy persistence, and the renderer's pin-rendering fallback branches
   (`SceneLayer.type`/`.data`, `props.pins`) are identified as safe-looking but explicitly deferred
   pending runtime verification, not bugs to "fix" opportunistically.
2. When adding a new map object type, follow the Scene Graph doc's extension pattern (new Object Type)
   rather than modifying `Scene`/`Layer` core fields.
3. Don't "clean up" the legacy top-level `components/`/`composables/`, `.bak` files, or the widespread
   local `dxFetch` duplication without asking — confirm scope and get explicit sign-off; these look like
   easy wins but touch working, deployed code paths (see Technical Debt above).
4. When working on the character sheet system, note the fan-out across many small
   `server/utils/character-sheet-*.ts` files — find the specific concern (math, inventory, notes,
   subclasses, resolver) rather than assuming logic lives in `character-sheets.ts` itself. On the
   client side, expect most logic to live directly in the ~8,900-line `sheet.vue` page rather than in
   composables — this is the codebase's biggest deviation from its own stated conventions, and per the
   roadmap it's an explicit refactor target, not merely tolerated debt.
5. Local dev/testing requires a running Directus instance and `DIRECTUS_URL`/`NUXT_PUBLIC_DIRECTUS_URL`
   + `DIRECTUS_TOKEN` env vars (no `.env` is committed — see `nuxt.config.ts` runtimeConfig). Don't
   assume a mock or in-memory data layer exists; `app/lib/eldra/dev-data.ts` is fixture/sample data for
   reference, not a substitute backend.

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

## Scene Graph Cleanup

Commit 5 results:

- Dead persistence scaffolding removed: `serializeSceneForPersistence`, `hydrateSceneFromPersistence`,
  `SceneLayerObjectsSnapshot`, `ScenePersistenceSnapshot` (had zero call sites; superseded by
  `loadSceneLayerObjectsForMap`/`writeSceneLayerObjectsForMap`).
- Renderer compatibility paths identified and intentionally deferred pending runtime verification:
  `SceneLayer.type`, `SceneLayer.data`, and the `type === 'X'` / `pinsLayer?.data?.pins` / `props.pins`
  fallback branches in `WorldMapLeaflet.client.vue`'s `resolvedPins`/`resolvedImageOverlays`/
  `resolvedRoads`. Traced to zero reachable call paths from the single current caller (`index.vue`),
  but not removed — this is renderer-facing code with no automated test coverage, so removal needs an
  actual page load/manual check first, not just static tracing. Do not remove without that
  verification (see Technical Debt above).
- Pin persistence intentionally excluded from this migration — see Scene Graph Status below.

## Scene Graph Status

Canonical:

- Roads
- Image Overlays

Legacy (intentional):

- Pins

Renderer:

- Fully Scene Graph driven for all three object types today (pins included — pins are adapted into
  `LayerObject` shape client-side before reaching the renderer, independent of where they persist).

Persistence:

- Roads and Image Overlays use `scene_layer_objects` (canonical, Directus-backed).
- Pins intentionally remain on `map_pins` until a future migration is explicitly approved (design
  proposal only, not yet started).

Deferred (not blocking, not forgotten):

- Renderer compatibility paths noted under Scene Graph Cleanup above, pending runtime verification.