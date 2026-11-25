# World-Wide Search — Trace and Implementation Plan

Status: **Plan revised. A bounded security correction this plan's own §2.3 trace uncovered has been
implemented, tested, and typechecked (§0 below) — separately from, and before, any search code,
which remains documentation-only.** Every fact below marked *(verified)* was confirmed by reading the
actual current file; nothing here is inferred from a type name or a doc elsewhere without checking
the code itself.

Companion to [content-source-architecture.md](./content-source-architecture.md) (the Content Pack
publishing pipeline upstream of what this document searches) and
[species-class-context-content-and-enemy-images.md](./species-class-context-content-and-enemy-images.md)
(the collection-card/context-rail regression this plan explicitly avoids repeating — see §5.2).

---

## 0. Security correction applied this pass (implemented, not merely planned)

§2.3's original trace found that five list routes called neither `requireCapability` nor read
`event.context.principal` at all — any authenticated Eldra account, member of the target World or
not, could read it. Per explicit, separate authorization, this has now been **fixed in code**
(this plan's own implementation remains deferred):

### 0.1 Routes corrected — world.read required before any backend read

- `GET /api/worlds/:id/entities` ([entities.get.ts](../../../server/api/worlds/[id]/entities.get.ts))
- `GET /api/worlds/:id/enemies` ([enemies.get.ts](../../../server/api/worlds/[id]/enemies.get.ts))
- `GET /api/worlds/:id/maps` ([maps.get.ts](../../../server/api/worlds/[id]/maps.get.ts))
- `GET /api/worlds/:id/timelines` ([index.get.ts](../../../server/api/worlds/[id]/timelines/index.get.ts))
- `GET /api/worlds/:id/mentions/search` ([search.get.ts](../../../server/api/worlds/[id]/mentions/search.get.ts))

Each now calls `requireCapability(principal, 'world.read', { kind: 'world', worldId })`
([authorization.ts](../../../server/utils/authorization.ts)) immediately after validating the
`worldId` route param and before any `directusServiceRequest`/catalogue-resolution call. `world.read`
is held by every membership role (owner/gm/worldbuilder/player/observer), so this is exactly "is the
caller a member of this World at all" — never narrower than any real role already passes, never a
new per-role distinction.

### 0.2 Detail routes inspected — "a protected list does not secure an unprotected detail route"

Traced every detail/context route the search plan's §2.5 coverage matrix would open, for the SAME
two omissions: missing `requireCapability`, and missing (or present) verification that the fetched
record's own World actually matches the route's `:id`.

| Route | Missing `requireCapability`? | World-match on the record itself? | Action |
|---|---|---|---|
| `GET /entities/:entityId` ([entities/[entityId].get.ts](../../../server/api/worlds/[id]/entities/[entityId].get.ts)) | Yes — fixed | **Already correct**, unchanged (`entity.world_id !== worldId` → 404) | `requireCapability` added |
| `GET /characters/:characterId/assembly` ([assembly.get.ts](../../../server/api/worlds/[id]/characters/[characterId]/assembly.get.ts)) | Yes — fixed (the file's own header previously claimed this was deliberate; see 0.4) | **Already correct**, unchanged (`character-assembly.ts` checks `entity.world_id`) | `requireCapability` added, header corrected |
| `GET /timelines/:timelineId` ([timelines/[timelineId].get.ts](../../../server/api/worlds/[id]/timelines/[timelineId].get.ts)) | Yes — fixed | **Already correct**, unchanged (`findTimeline`'s own slug-prefix check) | `requireCapability` added |
| `GET /maps/:mapId/layer-objects` ([layer-objects/index.get.ts](../../../server/api/worlds/[id]/maps/[mapId]/layer-objects/index.get.ts)) | Yes — fixed | **Was NOT checked at all** — the World id route param existed but was never even read; any account could request any mapId's layer objects regardless of World | `requireCapability` added, AND a new `/items/maps` ownership lookup added (`mapRow.world !== worldId` → 404) |
| Enemy detail | N/A | N/A | No separate detail route exists — confirmed (§2.5): the rail reads data already present in the (now-fixed) list response; nothing further to gate |

### 0.3 Found but explicitly NOT fixed this pass — reported, not silently expanded into

- **`GET /api/map-pins`** and **`GET /api/map-tiles/:mapId/:z/:x/:y`** — not nested under
  `/worlds/:id/**` at all (no World id in the URL to check against), so correcting them would mean
  deriving a World from the map row first — a structurally larger change than this pass's own bounded
  scope. Flagged, not touched.
- **`GET /api/worlds/:id/content`** and **`GET /api/worlds/:id/catalogue`** — the SAME
  no-`requireCapability` gap exists in both (confirmed by reading them; `content.get.ts`'s own header
  cited the identical "reading is not gated like writing" rationale `assembly.get.ts` used to). Left
  alone: they feed the Character Creator/rules catalogue, not this plan's traced content types
  (entities/characters/enemies/maps/timelines), and fixing them is a different, separately-scoped
  correction, not "a directly related route" to search's own context-opening paths.

### 0.4 A real bug found and corrected while fixing `assembly.get.ts`

Its previous header comment said *"No requireCapability here — matching GET /api/worlds/:id/content,
GET /api/worlds/:id/catalogue, and GET /api/worlds/:id/entities/:entityId's own shared precedent:
reading is not gated the way writing is."* That was itself the gap, stated as if it were a design —
none of the three cited routes checked membership either, and `entities/:entityId.get.ts` has now
been corrected. The comment has been rewritten to say so plainly rather than left to mislead the next
reader.

### 0.5 Verification

- **Focused tests**, one file per corrected route (plus the pre-existing `assembly.get.test.ts`,
  updated — it previously never set `event.context.principal` at all, so the fix would otherwise have
  broken it silently): unauthenticated caller (401, backend never called), authenticated nonmember
  (403, backend never called), member of a different World only (403), World A route with a World B
  record id (404, pre-existing protection re-verified, not just assumed), authorized member (request
  proceeds, existing response shape intact). 43 new/updated tests, all passing.
- **Full suite**: 6724 passed (up from 6685), zero failures — no other existing test constructed an
  event for these handlers without a principal, so nothing else silently broke.
- **Typecheck**: 895 errors, identical to the pre-existing baseline — confirmed via a line-by-line
  normalized diff (this repo's own established non-stash baseline-comparison method), zero new, zero
  fixed. One incidental `any`-typing addition in `layer-objects/index.get.ts` (a new Directus call this
  fix introduced) was typed explicitly to avoid adding to that count.
- **Lint**: every `@typescript-eslint/no-explicit-any`/`no-empty` finding in the touched files is
  pre-existing, confirmed by linting the HEAD version of each file directly; the new test files follow
  this repo's own established `vi.hoisted(() => Object.assign(globalThis as any, {...}))` shim
  convention (already present, identically, in the pre-existing `entities.get.test.ts`).
- Not run: production build (no behavior-affecting change to page bundles; server-route-only).

### 0.6 Remaining exposure, stated plainly

§0.3's three routes remain unfixed. §2.6 (below) documents that NO per-record `visibility`
enforcement exists anywhere in the app, corrected or not — membership is necessary, not sufficient,
and this pass only closes the membership gap.

---

## 1. Product goal, restated precisely

From the World Map (and, per this task's own instruction, eventually from anywhere in the World
workspace — the architecture below is NOT Map-specific), search the current World for a spell, item,
species, class, character, location, enemy, map, or timeline. Selecting a result opens the existing
right-hand context rail, without moving the Map or its camera. An explicit, separate action opens
whatever each content type's real full destination already is.

---

## 2. Existing capabilities — traced, not assumed

### 2.1 Search/aggregation endpoints that already exist

| Endpoint | Covers | Mechanism *(verified)* |
|---|---|---|
| `GET /api/worlds/:id/mentions/search` ([search.get.ts](../../../server/api/worlds/[id]/mentions/search.get.ts)) | Legacy/homebrew `entities` (all types) + `eras` (timelines) + `events` (timeline events) | `directusServiceRequest`, **`limit: -1`, no query/search param at all** — returns the World's entire entity+timeline+event list in one response. Filtering is 100% client-side (`WorldMentionAutocompleteTextarea.vue`'s `filteredMentionEntities` computed, plain `.toLowerCase()` substring match, `.slice(0, 8)`). **No catalogue content, no Maps.** |
| `GET /api/worlds/:id/media` ([media.get.ts](../../../server/api/worlds/[id]/media.get.ts)) | Media Gallery files | Real server-side Directus `_icontains` filter (`title`/`filename_download`/`filename_disk`/`description`) — the one existing precedent for an actual server-side substring query, but only because files are plain Directus rows. Not reusable for catalogue content (not Directus rows at all — see §2.2). |
| `GET /api/worlds/:id/entities` ([entities.get.ts](../../../server/api/worlds/[id]/entities.get.ts)) | Legacy/homebrew entities + catalogue-bridged species/class/item/spell/feat (merged, see §2.2) | No `search` param of any kind *(verified: no `getQuery(event).search` read anywhere in the file)*. The existing Species/Class/etc. browsers (`WorldEntityInteractivePage.vue`) fetch the type's full list once and filter client-side via `collectionSearchHaystack`. |
| `GET /api/worlds/:id/enemies` ([enemies.get.ts](../../../server/api/worlds/[id]/enemies.get.ts)) | Legacy/homebrew enemies + catalogue-bridged enemies | Same shape, no search param, client-side filter in `enemies.vue`. |
| `GET /api/worlds/:id/maps` ([maps.get.ts](../../../server/api/worlds/[id]/maps.get.ts)) | Maps | No search param. |
| `GET /api/worlds/:id/timelines` ([index.get.ts](../../../server/api/worlds/[id]/timelines/index.get.ts)) | Timelines (queries the `eras` collection, not a `timelines` collection — confirms "do not assume every content type uses the same… endpoint" is already true today) | No search param. |

**No existing endpoint does server-side cross-type text search.** The closest precedent
(`mentions/search.get.ts`) is cross-type in SHAPE but not in FILTERING — it is exactly the
"download everything, filter client-side" pattern this task's own §4 warns against, already live at
World-entity+timeline scale. It is cited here as valid UX/shape precedent, not as something to
extend, because adding catalogue content (hundreds–thousands of SRD/XPHB entries) to that same
unfiltered-download pattern would make the anti-pattern materially worse, not just repeat it.

### 2.2 World-authored entities vs. catalogue/effective-content resolution *(verified)*

Two genuinely different data sources back what a browser currently shows as one list, and a search
feature must know which is which:

- **Legacy/homebrew**: real rows in the Directus `entities` collection (plus `block_instances`),
  world-scoped by `world_id`, read via `directusServiceRequest` (service token, bypasses per-user
  Directus permissions by design — this app's established pattern, not a bug).
- **Catalogue-backed** (species/class/item/spell/feat/enemy sourced from a bound, published Content
  Pack): resolved per-World by [world-content-runtime.ts](../../../server/utils/world-content-runtime.ts)'s
  `resolveWorldContent` (flat, pinned/channel-only) or
  [world-effective-content.ts](../../../server/utils/world-effective-content.ts)'s
  `resolveEffectiveContent` (adds workspace-sourced live content + shadowing/precedence — gated
  behind `ELDRA_EFFECTIVE_CONTENT`, default OFF). Turned into entity-browser-shaped pseudo-rows by
  [catalogue-entity-bridge.ts](../../../server/utils/catalogue-entity-bridge.ts)'s
  `getCatalogueBackedEntityRows`/`getCatalogueBackedEnemyRows`, merged with the legacy rows in
  `entities.get.ts`/`enemies.get.ts`.

**A real, pre-existing inconsistency, confirmed by reading both functions directly**:
`getCatalogueBackedEntityRows` (species/class/item/spell/feat) calls `resolveEffectiveContent` when
the flag is on, so it already respects effective winners/shadowing/legacy aliases. `getCatalogueBackedEnemyRows`
**always** calls the plain `resolveWorldContent`, flag or no flag — enemies get no effective-winner
treatment today. This is not something this plan fixes; it is a fact search must not paper over (see
§3's identity rules, which are written to be correct either way).

**Stable catalogue identity already exists and must be reused, not reinvented**:
`catalogueTemplateId(packageId, slug) → "catalogue:<packageId>:<slug>"` *(verified,
catalogue-entity-bridge.ts)* is the id every catalogue-backed row already uses — never a Directus
numeric id (there isn't one), never slug alone. This directly satisfies the task's "never identify
catalogue entries by slug or title alone."

**Maps** (own Directus collection, not `entities`) and **Timelines** (the `eras` collection, plus
`events`) are structurally outside both the legacy-entity and catalogue-bridge systems entirely — a
third and fourth shape. See the coverage matrix (§2.5).

### 2.3 Permissions — traced directly, not assumed, and the single most important finding in this document

[server/middleware/authorize.ts](../../../server/middleware/authorize.ts) is the **only** server
middleware. Its own header states its scope precisely: it guarantees *"a resolved Principal"* (i.e.
*some* authenticated Eldra account) for every non-public `/api/**` route. It explicitly does **not**
check per-world membership or any capability — that is deliberately left to each route, via
`requireCapability(principal, capability, { kind: 'world', worldId })`
([authorization.ts](../../../server/utils/authorization.ts)).

That capability mechanism is real and correctly fail-closed: `can()` looks up
`principal.worldCapabilities.get(worldId)`; no membership row for that World → `false`, full stop,
administrator or not *(verified, authorization.ts lines ~612–644)*. Some routes call it
(`presentation-settings.get.ts`, `[pageKey].post.ts`, `index.patch.ts` all call
`requireCapability(principal, 'world.read'|'world.settings.edit', …)`).

**`entities.get.ts`, `enemies.get.ts`, `maps.get.ts`, `timelines/index.get.ts`, and
`mentions/search.get.ts` do not** *(verified: no `requireCapability`, no `principal` reference, no
`event.context.principal` read, in any of the five files)*. Today, any authenticated Eldra account —
not necessarily a member of the target World — can call any of these five routes for **any**
`worldId` and receive that World's full entity/enemy/map/timeline list. This is the middleware's own
documented scope working exactly as designed (deny-by-default authentication, opt-in per-route
capability), combined with five routes that opted out of the capability check entirely.

**Per-record visibility is a separate, even less finished story.** `EldraVisibility = 'private' |
'world' | 'public'` *(verified, app/lib/eldra/types.ts)* exists as a field and is returned in every
entity row, but `authorization.ts`'s own comment states the fact plainly: *"Visibility enforcement is
out of this task's scope (NON-GOALS: no entity ownership)"*. No route anywhere filters on
`visibility`. A Player today already sees every `'private'` entity's title/summary/blocks through
the existing browsers, GM-authored or not — this is not a search-specific gap, it is a whole-app gap
that predates this task by multiple milestones. §2.6 below traces the actual, authoritative policy
for this rather than proposing one.

**What this means for the plan:**

- A new search endpoint **must** call `requireCapability(principal, 'world.read', { kind: 'world',
  worldId })` itself. **Implemented already, and generalized**: §0 documents that this is now true not
  only for a hypothetical new search endpoint but for the five existing list routes and their detail
  routes directly — the actual, broader fix, done under separate explicit authorization rather than
  scoped to code that does not exist yet.
- Per-record `visibility` enforcement does not exist anywhere to delegate to, and **this plan does
  not invent one**. An earlier draft of this section proposed treating `world.entity.edit` as a
  stand-in "may see private content" authority — that was a shortcut, not a traced policy, and is
  withdrawn. §2.6 finds the actual authoritative design (`ownership-and-permissions.md` §8.3's
  `may_read`) and the actual capability it names (`world.character.edit_any`, a different one), and
  recommends search defer to it rather than inventing per-record semantics of its own.

### 2.6 Private visibility — the authoritative policy, traced (not invented)

**An authoritative design exists and must be reused, not reinvented.**
[ownership-and-permissions.md](./ownership-and-permissions.md) §8.3, explicitly "kept verbatim" from
its own revision 1 as "the model for how the rest should read":

```
may_read(principal, entity) =
      has(principal, 'world.read', entity.world)
  AND ( entity.visibility === 'public'
     OR entity.visibility === 'world'    AND is_member(principal, entity.world)
     OR entity.visibility === 'private'  AND ( entity.owner === principal.account
                                            OR has(principal, 'world.character.edit_any', entity.world) ) )
```

Traced directly against the actual current schema/capabilities, not assumed:

- **Ownership/creator fields**: `entities.owner_account_id` is a REAL, existing column *(verified,
  `server/utils/character-ownership.ts`)*, nullable, written only through Game Admin's Player
  Management flow (`platform.character.manage`-gated `owner.put.ts`/`owner.delete.ts`). Per
  `ownership-and-permissions.md` §8.4, it is **populated only for player characters** — items, spells,
  locations, factions, and NPCs never have an owner. This is confirmed by design, not an
  implementation gap: §8.2 states entities are "world-owned by default; optionally account-owned
  (player characters)."
- **The correct GM-tier override capability is `world.character.edit_any`, NOT `world.entity.edit`**
  *(verified against `WORLD_ROLE_CAPABILITIES`, authorization.ts)* — held by GM/Owner, not
  Worldbuilder, not Player. `world.entity.edit` is a DIFFERENT axis (general content-editing
  authority, held by Worldbuilder too) and was never the right capability for this; using it would
  have handed every Worldbuilder visibility into every player's private character, which §8.3's own
  formula never grants.
- **Character-specific read rules**: no separate rule exists beyond `may_read` itself — a character
  is an entity, `owner_account_id` is how its ownership is expressed, and §8.3 already covers it. No
  second, character-specific visibility mechanism was found.
- **Dedicated GM/private-content read authority**: `world.character.edit_any` IS this, already defined
  and already assignable (GM/Owner roles) — not something to create.
- **This policy is NOT implemented anywhere today.** No route evaluates `may_read`; §0 only adds
  World-membership checks (`has(principal, 'world.read', entity.world)`, the formula's own leading
  clause), which is necessary but, by the formula's own structure, insufficient on its own.

**Concise proposed visibility matrix** (what `may_read` would decide, once implemented — not
implemented by this pass):

| `entity.visibility` | Readable by |
|---|---|
| `public` | Anyone (even unauthenticated, per §8.3: "public worlds fall out for free") |
| `world` | Any member (`world.read` + membership) |
| `private`, entity has an owner (characters only) | The owning Account, or a `world.character.edit_any` holder |
| `private`, entity has NO owner (items/spells/locations/factions/NPCs — always, per §8.4) | Only a `world.character.edit_any` holder — there is no owner branch to fall back to |

**Unresolved cases, left for explicit review, not decided here:**

1. Is a private, unowned NPC/location actually meant to be GM-only-readable under this formula, or
   does the "optionally account-owned" model need a THIRD case (e.g. "owned by no one, visible to its
   creator") that §8.3 does not express? The formula as written says GM-only; this may be exactly
   right (a GM's secret lore) or may be an under-specified edge the formula's author never meant to
   force.
2. `is_member` for `'world'` visibility — is this plan's own `world.read` check already equivalent to
   `is_member`, or does the formula intend something narrower (e.g. a role above Observer)? Reading
   `can()`'s own implementation, `world.read` IS granted to every role including Observer, so they are
   the same check today — flagged as an assumption, not re-derived from a separate `is_member` primitive
   that does not exist in code.
3. Public Worlds ("world.visibility" itself, a different field from entity visibility) are named in
   §8.3 as following "for free" but `worlds.visibility` is itself uniformly `'world'`/unpopulated with
   intent per §2.6 of that same document — whether any World is actually meant to be public today is
   unanswered, and irrelevant until one is.

**This plan does not implement `may_read` and does not claim the membership correction in §0 fixes
private visibility.** It fixes exactly one clause of a four-clause formula (`has(principal,
'world.read', entity.world)`), the only one usable without first resolving the three open questions
above.

### 2.4 Context-rail components and selection state *(verified)*

One shared component, [WorldEntityContextDrawer.vue](../../../app/components/world/WorldEntityContextDrawer.vue),
used by five world pages (`index.vue` the World Map, `entities/[entityId]/index.vue`,
`characters/index.vue`, `timelines/[timelineId].vue`, `characters/[characterId]/sheet-v2.vue`) plus
the legacy sheet. Takes `entity: any | null` — an **already-resolved, full entity-shaped object**,
never a bare id; the calling page owns `open`/`entity` as its own local state (not a shared
`useState`), fetches/assembles whatever it hands in, and listens for `close`/`readMore`/`openMap`/
`openMention`. On the World Map page specifically, it is driven by `selectedPin` and rendered with
`:open="Boolean(selectedPin && mode === 'play')"` — opening it **never** touches the Leaflet map
instance, camera, or viewport; those are completely independent pieces of state. This is exactly the
mechanism search needs to reuse for "keep the current Map and camera position intact": call whatever
each content type's existing "resolve one full context object" step is, then set the SAME local
`selectedX`/`open` state the page already drives this drawer with.

One component has its own internal `<Teleport to="body">` lightbox (image zoom) that escapes the
page's own DOM subtree — relevant precedent from the Show Background pass
([world-background-defaults-and-show-background.md](./world-background-defaults-and-show-background.md) §8.3),
noted here only as a reminder that this drawer has at least one non-obvious rendering detail, not as
something search touches.

### 2.5 Coverage matrix — reusable paths and genuine gaps, by content type

| Type | List/resolve path | Stable identity | Full-view destination | Search today |
|---|---|---|---|---|
| Spell / Item / Species / Class / Feat | `getCatalogueBackedEntityRows` (catalogue) + legacy `entities` rows | `catalogue:<packageId>:<slug>` (catalogue) or Directus `entities.id` (legacy/homebrew) | **None, beyond the context rail itself** — confirmed: `catalogue-entity-bridge.ts`'s own header states Delete/Open Article "do not apply" to a catalogue row (no backing `entities.id`), and `entities/[entityId]/index.vue` has no handling for a `catalogue:` id at all *(verified: zero matches)*. The rail IS the fullest view these types have today. | None server-side |
| Character / NPC | `entities.get.ts` `?summary=1&type=character,npc,…` (cheap — summary mode never attaches `.blocks`, i.e. no full character-sheet assembly) | Directus `entities.id` | `/worlds/:id/characters/:characterId/sheet` (or `sheet-v2`) | None server-side (client-filtered in `characters/index.vue`) |
| Enemy | `getCatalogueBackedEnemyRows` (catalogue, **no** effective-content/shadowing — §2.2) + legacy `entities` rows | Same catalogue/legacy split as above | Context rail (same as Spell/Item/etc. — no separate full statblock page found) | None server-side |
| Location (and other generic entity types) | Legacy `entities` rows only — not catalogue-backed | Directus `entities.id` | `/worlds/:id/entities/:id` (full article page) | None server-side |
| Map | `maps.get.ts` (own Directus collection) | Directus `maps.id` | The World Map itself, via a pin's existing "linked map" navigation (`openLinkedMap()` in `index.vue`) — this is map-to-map navigation, not camera recentering; there is no "pan the current map to this location" primitive today, confirmed by tracing `openSelectedPinContextMap` | None server-side |
| Timeline (and timeline events) | `timelines/index.get.ts` (queries `eras`), events via a sibling `events` collection (as `mentions/search.get.ts` already demonstrates) | Directus `eras.id` / `events.id` | `/worlds/:id/timelines/:timelineId` | None server-side (included, unfiltered, in `mentions/search`) |

---

## 3. Result contract and identity

```ts
type WorldSearchResultType =
  | 'spell' | 'item' | 'species' | 'class' | 'feat'   // catalogue-capable types
  | 'character' | 'npc'
  | 'enemy'
  | 'location' | 'entity'                              // generic legacy entity types
  | 'map'
  | 'timeline'

type WorldSearchResultRef =
  // CORRECTED -- carries entityType alongside packageId+slug, NOT catalogueTemplateId's bare
  // `packageId:slug` string reused verbatim. See the collision rule immediately below for why.
  | { kind: 'catalogue'; packageId: string; entityType: WorldSearchResultType; slug: string }
  // A real Directus row id -- entities, maps, or eras, disambiguated by `collection`
  // because these are three different tables sharing no id space.
  | { kind: 'row'; collection: 'entities' | 'maps' | 'eras'; id: string }

type WorldSearchResult = {
  ref: WorldSearchResultRef        // typed, opens context OR full view -- never a bare string id
  type: WorldSearchResultType
  title: string
  sourceLabel: string               // short, e.g. "Species — XPHB" or "Homebrew" or "Location"
  summary: string                   // SHORT teaser only -- see §5.2, never full article/block content
  thumbnailUrl: string | null       // run through the SAME buildCardThumbnailUrl derivative
                                    // (app/lib/media/thumbnail-url.ts) every existing card/picker uses
                                    // -- never the original asset
  customized?: boolean              // relayed verbatim from EffectiveEntity.customization.customized
                                    // when effective-content is on, exactly as catalogue-entity-bridge.ts
                                    // already relays it -- not recomputed
}
```

Two rules, both already established elsewhere in this codebase and carried over unchanged, not
invented here:

- **Never identify a catalogue entry by slug or title alone — and, corrected, not by
  `packageId + slug` alone either.** The actual within-pack uniqueness key, per
  `content-pack-publishing.ts`'s own `validateContentPackForPublication` (its literal identity string
  is `` `${systemKey}::${entityType}::${slug}` ``), is **systemKey + entityType + slug**, not just
  slug. `catalogueTemplateId(packageId, slug)` (`catalogue-entity-bridge.ts`) safely omits `entityType`
  today only because every existing caller already operates within one entityType at a time
  (`getCatalogueBackedEntityRows(worldId, ['item'])` for the Items browser, etc.) — the entityType is
  implicit in which function was called. Search is the FIRST consumer that would ever merge multiple
  entityTypes into one lookup space, which is exactly where the omitted dimension becomes a real
  collision risk: since slugs are generated as `slugify(name-source)` with no entityType segment
  (content-source-architecture.md §2.4), a same-book Spell and Item that happen to share a name (e.g.
  a "Light" spell and a "Light" item) would produce the identical slug and therefore the identical
  bare `packageId:slug` pair. **`ref.entityType` is therefore a required field, and resolving a ref
  must filter to that entityType's own resolved bucket (`byEntityType[entityType]`) before matching
  on slug — never a flat, cross-type `packageId+slug` lookup.** A title collision across two bound
  packs (PHB Fireball vs. XPHB Fireball, content-source-architecture.md §2.4) is the SEPARATE case
  `packageId` itself already resolves correctly; this correction is about the within-pack,
  cross-entityType case, which `packageId` alone does not.
- **Respect effective winners and legacy aliases; never show shadowed duplicates as separate
  results.** When `ELDRA_EFFECTIVE_CONTENT` is on, search must enumerate `resolveEffectiveContent`'s
  own `entries` (already-collapsed winners, one per evidence group), never a raw, pre-collapse
  candidate list — i.e. reuse `getCatalogueBackedEntityRows`'s existing output as-is rather than
  re-deriving a parallel resolution. `legacyAliases` (world-effective-content.ts) is for resolving an
  **already-stored** `{packageId, slug}` reference found elsewhere (e.g. a character's inventory
  item) forward to its current winner — not a search concern directly, but the reason a search result
  REF must be re-resolved through the same alias table at open-time if a consumer ever persists one
  (none of this plan's own proposed UI does; noted for completeness).

**Scope is the current World's effective content, never the whole server.** Every path above is
already World-scoped by construction: `resolveWorldContent`/`resolveEffectiveContent` only ever walk
THIS World's own bindings (`listContentPackBindingsForWorld(worldId)`), never "every published
pack." No new scoping logic is needed here — only correct reuse.

---

## 4. Performance and freshness

### 4.1 What already exists and should be reused, not rebuilt

| Layer | Caching today *(verified)* | Implication for search |
|---|---|---|
| Published Content Pack content | In-process `Map`, keyed `${packageId}@${version}#${integrityHash}` ([content-packs.ts](../../../server/utils/content-packs.ts) lines ~284–325) — sound because a release's content is immutable; a new version is a new key | Search's catalogue reads inherit this automatically and are always correct; publishing a new version changes nothing already cached, binding a world to the new version changes what resolves |
| Workspace-sourced (live) content | Revision-keyed cache ([world-content-sources.ts](../../../server/utils/world-content-sources.ts) `sourceCache`, invalidated the moment `revision` changes) | Same story — an authored edit bumps the revision counter (per `alter-content-workspaces-revision-counters.mjs`), so the very next search request sees it; no new cache needed |
| Binding list (`world_content_pack_bindings`) | **No application-level cache** — always a fresh Directus read, verified by reading `listContentPackBindingsForWorld` directly | Bind/unbind/rebind is reflected on the next search request, immediately, **at this layer** |
| Legacy/homebrew `entities`, `maps`, `eras`/`events` | **No application-level cache** — always a fresh `directusServiceRequest`, verified by reading the Nuxt-server call sites directly | Same, **at this layer** — see the caveat immediately below |
| Principal/capabilities | `resolvePrincipal` re-resolves from the Account/Membership/Platform-grant tables on every request (no session-cached capability set found) | A membership/role change takes effect on the caller's very next request — no stale-permission window to design around, **at this layer** |

**Correction: "always fresh" above is scoped to the Nuxt server layer only, and that scope is now
stated explicitly rather than implied.** This plan did not, and under its own constraints could not,
verify whether Directus itself (its optional query-result cache feature) or any infrastructure in
front of it (a reverse proxy, CDN) caches these same reads — checking would mean reading deployment
configuration this task explicitly forbids loading (`.env`), and no other verified source in this
repository documents it either way. If a freshness bug is ever reported for one of these reads, that
layer — not the Nuxt-server code traced here — is the first place to check, not a layer this document
can rule out.

**No new cross-request cache should be introduced for this feature, at the Nuxt-server layer this
plan controls.** The one NEW reuse this plan asks for is **request-local**, not cross-request:
resolve each per-World source exactly once per search request and reuse that result across every
requested type, instead of one resolve call per type — mirroring `resolveEffectiveContent`'s own
existing `precomputedBindings` optimization (world-content-runtime.ts's own documented "Published
-Pack Load Reduction Pass"), applied one layer up. **This does NOT mean pulling full rows into memory
and filtering in Node** — see §4.2's correction below for exactly what "resolve once" means for each
source kind.

### 4.2 What this plan must avoid repeating

- `mentions/search.get.ts`'s own "fetch everything, filter client-side" pattern, at a scale where it
  is cheap today (a World's own entities+eras+events) becomes expensive once catalogue content
  (hundreds to thousands of SRD/XPHB entries) joins the same list. **Search text filtering must
  happen server-side.**
- **Correction — "server-side filtering" does not mean "load every row/block into Node and filter
  there," for the two source kinds where a real database-side filter is available:**
  - **Legacy/homebrew `entities`, `maps`, `eras`**: these ARE plain Directus rows. Search must issue
    its OWN dedicated query with a real `_icontains` filter on `title` (`media.get.ts`'s own
    established precedent, §2.1) and a MINIMAL field list (`id, title, slug, entity_type, summary` —
    never `fields: '*'`, never `block_instances`/`entity_statblocks`/etc., which `entities.get.ts`'s
    and `entities/:entityId.get.ts`'s existing shapes pull for an entirely different purpose: a full
    collection browser or a single record's full detail, not a 20-result search list). Reusing those
    EXISTING routes' own over-fetching shape for search — the original draft of this plan's own
    "resolve each per-World source once" language implied exactly this — would be "loading every
    row/block merely to return twenty names." Corrected: a new, narrow, search-specific query per
    source, not a reuse of the collection-browser query shape.
  - **Catalogue content (species/class/item/spell/feat/enemy)**: there is no Directus row to push an
    `_icontains` filter into — a published pack's content is an in-memory array after
    `resolveWorldContent`/`resolveEffectiveContent` resolves it. For this source kind ONLY, reusing
    the existing **effective view** (§2.2) and filtering the resolved, already-bounded (this World's
    own bound packs, never "every package on the server," §3) array in Node is the correct and only
    available approach — there is no narrower query possible beneath it. This is the one place
    "resolve once, filter in memory" is actually the right design, not a shortcut.
- Full character-sheet assembly (`character-sheets.ts`'s heavier per-character load) merely to search
  a name — not needed: a dedicated, minimal-fields `entities` query (same correction as above,
  filtered additionally to `entity_type IN (character, npc, ...)`) finds a name without assembling
  anything. `entities.get.ts`'s own `?summary=1` mode is cited as evidence this general shape (name
  -only, no `.blocks`) is already a proven, cheap pattern in this codebase — search's own query is
  still its own dedicated one, per the correction above, not a call to that route.
- Rebuilding the catalogue once per requested type — see the request-local reuse note above.
- Unbounded results: every type group capped (proposed 5 per type), the merged/ranked response capped
  overall (proposed 20), both server-side, never "return everything and let the client slice."

### 4.3 Client-side interaction performance

- **Debounce**: 250ms, matching the one existing precedent for exactly this kind of live-search input
  (`WorldMediaPicker.vue`'s own `setTimeout(() => loadMedia(), 250)`).
- **Minimum query length**: 2 characters before any request fires, avoiding a flood of near-useless
  single-character server round trips.
- **Cancellation/stale-response protection**: a monotonic request-token counter (the same idiom
  `WorldMediaPicker.vue`'s own `retryTokens`/`sidePreviewLoadedId` guards already use elsewhere in
  this codebase for "don't let a late response overwrite what's currently showing") — each outgoing
  request carries a token; a response is applied only if its token is still the latest issued.
  `useFetch`'s/`$fetch`'s own built-in abort-on-unmount is not sufficient alone, since the component
  does not unmount between keystrokes.
- **Pagination**: none proposed for v1 — a capped, ranked top-20 across all types is the product
  surface (a compact dropdown/panel), not a paged results browser; if that changes, bounded
  cursor/offset paging can be added to the same endpoint without a contract break (an additive
  `cursor`/`offset` query param).

---

## 5. Interaction design

### 5.1 Placement

A single search field, discoverable in the World Workspace shell (`world-workspace.vue` /
`WorldWorkspaceSidebar.vue`), not bolted onto the Map page's own toolbar — satisfying "do not design
a Map-only implementation that must be replaced later" directly. Candidate placement, consistent
with this workspace's own established shell-owned-control convention (the Show Background toggle,
the hamburger trigger — both `fixed`, both layout-owned, neither per-page): a field in the expanded
sidebar's header area (collapsed rail: an icon that expands a compact overlay), reachable from every
World page because the sidebar itself is reachable from every World page. A dedicated keyboard
shortcut is optional and, if added, must be scoped so it never fires while focus is inside a
contenteditable/textarea/input (the Tiptap editor, any entity field, the dice/roll inputs) — checked
by event target, not by a global capture-phase hijack, mirroring how `WorldMediaPicker`'s own Escape
handling already scopes itself narrowly rather than claiming the whole window unconditionally.

### 5.2 Results — the regression this plan must not repeat

[species-class-context-content-and-enemy-images.md](./species-class-context-content-and-enemy-images.md)
traced a real, shipped regression: a single overloaded field carried BOTH a short card teaser and the
full generated rail article, so compact cards briefly rendered full articles. The fix there was
separating fields, never line-clamping a shared one. This plan's result contract (§3) already applies
that lesson directly: `summary` is a short teaser ONLY, sourced the same way `entities.get.ts`'s own
`summary`/`overviewText`/`coreText` chain already is (never the full generated article text that
field's sibling `articleDetail` carries) — the compact result row and the rich context rail it opens
read **different** fields by construction, not the same field at two render sizes.

### 5.3 States and keyboard

- **Keyboard navigation**: Up/Down moves a highlighted result, Enter opens its context rail, Escape
  closes the search surface — the same interaction shape `WorldMentionAutocompleteTextarea.vue`
  already implements for its own result list (`activeMentionIndex`), reused as a pattern, not
  imported as code (different trigger, different host surface).
- **Loading / no-results / failure**: explicit states, not a bare empty list — "no results for ‘x’"
  distinct from "searching…" distinct from "couldn't reach the server" (the last one must name which
  source failed when only one did — see §5.5).
- **Right-hand context opening without touching the Map**: the MECHANISM (not merely "emit to the
  host page") is specified in full in §5.6 below, corrected from an earlier, underspecified draft.
- **Full-view destinations, per type** (§2.5's matrix, restated as the explicit action, corrected):
  Character → navigate to the sheet route (a real read/play destination — confirmed this is not an
  edit-only route before citing it). Timeline → navigate to `/worlds/:id/timelines/:timelineId`.
  Location (legacy entity) → navigate to `/worlds/:id/entities/:id` (the article READ page, confirmed
  distinct from any edit route). Map → navigate to the World Map (there is no existing "recenter on
  this pin" primitive to call into; if that affordance is wanted, it is new scope, not something this
  plan can wire up to an existing mechanism — flagged in §9). **Spell / Item / Species / Class / Feat /
  Enemy → the explicit "open full view" action is OMITTED entirely for these types, not pointed at the
  same context rail the result already opens.** An earlier draft proposed the latter; corrected,
  because a button whose action is "open the thing you're already looking at" is not a full-view
  action, it is a rail linked to itself — confusing, not honest. If a real full view is wanted for
  these types later, that is new scope (a new page), not something this plan's own search feature can
  manufacture by relabeling the rail.
- **Mobile (~390×844)**: the search surface should behave like the existing mobile drawer overlay
  convention (`world-workspace.vue`'s off-canvas sidebar drawer) rather than a separate bespoke
  mobile layout — full-width overlay, dismissible, same focus-restore-on-close discipline
  `WorldPagePresentationPanel.vue`'s own picker-button pattern already established.
- **Coexistence with map-pin context and other open rails**: `WorldEntityContextDrawer` already has
  no built-in exclusivity mechanism of its own — each host page's own `selectedX` ref decides what is
  currently shown. A search-opened result and a map-pin-opened result are the same drawer instance on
  the Map page, so selecting one already (by construction, once wired into the same `selectedPin`
  -equivalent state) replaces the other, exactly as clicking a second pin already replaces the first
  today. No new exclusivity logic needs to be invented.

### 5.4 Non-destructive by construction

Opening search, typing, and selecting a result are all reads. Nothing in this design calls a POST/
PATCH/DELETE route, touches `world-workspace-mode`, or writes to any `world_page_presentations`/
`entities`/`maps`/`eras` row. "Must not discard drafts, reset the Map, or trigger writes" is satisfied
by construction, not by an added guard — there is no write path in this feature at all.

### 5.5 Failure isolation

Per-source try/catch inside the one new endpoint (§6): a failure loading, say, the catalogue
(`resolveWorldContent` throwing) must not also suppress legacy-entity, map, or timeline results — the
same per-category isolation principle `content-source-architecture.md` §4 already names as a solved,
generic property of the Content Pack preview path, applied here to search's own type groups. The
response names which group(s) degraded (`partialFailures: WorldSearchResultType[]`) so the UI can
show "some results may be missing" rather than silently returning fewer results than really exist.

### 5.6 Shell-to-page context wiring — the concrete mechanism (corrected)

An earlier draft said selecting a result "opens the context rail" and "emits to the host page" — true
but not a design, since the search field lives in the workspace SHELL
(`world-workspace.vue`/`WorldWorkspaceSidebar.vue`, reachable from every page) while
`WorldEntityContextDrawer` is driven by each HOST PAGE's own local `selectedX` ref (§2.4) — five
different pages, five different local refs, none owned by the shell. Concretely:

- **Ownership**: a new shell-level `useState<PendingSearchSelection | null>('world-search-pending-selection',
  () => null)`, matching this workspace's own established cross-component `useState` convention
  (`world-show-background-active` is the most recent precedent). The SEARCH component writes to it on
  selection; it does not resolve or open anything itself.
- **Typed reference resolution**: `PendingSearchSelection` carries the SAME `WorldSearchResultRef`
  (§3) the result card held, plus a monotonic `requestToken: number` (see stale-selection protection
  below). Each of the five host pages that already embeds `WorldEntityContextDrawer` adds a small
  `watch(pendingSelection, ...)` that: (1) checks the ref is for a type/collection it actually hosts a
  rail for (all five currently can host any entity-shaped object, so in practice this is a pass
  -through, not a filter); (2) calls the SAME "resolve one full context object" step that type's OWN
  existing per-item click handler already uses (the entity detail route for legacy rows,
  `catalogueEntryToBlocks`-shaped data for catalogue rows via the SAME resolver `getCatalogueBackedEntityRows`
  already uses, etc. — no new resolution code, reuse of each page's own existing per-item path); (3)
  on success, assigns that page's own local `selectedX` ref exactly as a click on its own card already
  does; (4) clears `pendingSelection` back to `null` so a later render doesn't reprocess it.
- **Reauthorization, independent of the search result (item B)**: step (2) above goes through the
  SAME detail route every direct click already uses (`GET /entities/:entityId`, `assembly.get`, etc.)
  — all of which §0 confirmed now enforce `world.read` (and, pre-existingly, world-match) themselves.
  **A search result is data the client already asked for and received; it is never treated as proof
  of authorization for the follow-up load.** If a result's own permissions changed between the search
  response and the click (a membership revoked mid-session, an entity deleted), the SAME 401/403/404 a
  direct navigation would hit today fires here too — search introduces no new trust boundary to reason
  about.
- **Replacement/close behavior**: selecting a new result while a rail is already open is the SAME
  single ref assignment a second pin-click already produces today (§2.4) — no special-cased "replace"
  logic needed, it falls out of each page's own existing reactive assignment.
- **Stale-selection protection**: resolving step (2) is async (a real network call); the user may
  select a DIFFERENT result, or navigate away, before it resolves. The `requestToken` is compared at
  the moment resolution completes against the current value of a shell-level
  `useState<number>('world-search-selection-token', () => 0)` (incremented on every NEW selection,
  including a bare close/clear) — a late resolution whose token no longer matches is discarded,
  mirroring `WorldMediaPicker.vue`'s own established `retryTokens`/`sidePreviewLoadedId` guard idiom
  (§4.3) applied to this async step instead of an image load.
- **World-navigation cleanup**: a route-level `watch(() => route.path, () => { pendingSelection.value
  = null })` at the SAME layout level `world-workspace.vue` already resets the Show Background toggle
  on navigation (`world-background-defaults-and-show-background.md` §3) — same pattern, new state key.
  A page lacking a host rail at all (none currently, but e.g. Game Admin) simply never consumes a
  pending selection; it is left pending until either a navigation clears it or the user lands on a
  hosting page, whichever comes first — no special redirect-to-Map behavior is proposed, since all
  five current context-rail hosts cover every type this plan's own coverage matrix (§2.5) searches.

---

## 6. Permission/identity decisions for the review to confirm before implementation

1. **World membership (`world.read`) is required before search reads anything.** No longer a future
   decision — §0 implements and generalizes this across the five existing list routes and their
   detail routes, under separate explicit authorization, ahead of any search code existing.
2. **Private-visibility filtering is NOT implemented by this plan, and search must not invent its own
   policy for it.** §2.6 traces the actual authoritative design (`may_read`,
   ownership-and-permissions.md §8.3) and withdraws an earlier draft's invented shortcut
   (`world.entity.edit` as a stand-in for "may see private content" — wrong capability; the formula
   names `world.character.edit_any`). Three concrete open questions block implementing `may_read`
   itself (§2.6's "Unresolved cases"); until those are answered, search should match today's
   (unenforced) baseline for `visibility` rather than approximate a policy nobody has signed off on.
   This is the one item in this list that is a genuine blocker, not a style preference.
3. **Enemy results do not reflect effective-content shadowing** (§2.2) — an existing, pre-existing
   inconsistency this plan surfaces through search rather than hides; not something to silently
   "fix" by changing `getCatalogueBackedEnemyRows`'s own resolution path as a side effect of adding
   search. (§5.6 restates this at the point it actually bites — ranking/dedup.)

---

## 7. Smallest coherent implementation scope

One new read-only route, one new Vue component (plus its trigger in the workspace shell), reusing
every resolution/identity/rail/thumbnail path traced above:

- `GET /api/worlds/:id/search?q=<text>` — `requireCapability(principal, 'world.read', ...)` first
  (§0's own pattern, not a future aspiration); a dedicated, minimal-fields, `_icontains`-filtered
  Directus query per Directus-backed source, and the existing effective-content view for catalogue
  content (§4.2's correction — never the collection-browser routes' own over-fetching shape); caps
  and ranks (§4.2); returns `WorldSearchResult[]` (§3, with the corrected `entityType`-bearing
  catalogue ref) plus `partialFailures`. **Does NOT filter on `visibility`** — §6 item 2 is a
  confirmed blocker, not a detail to fill in during implementation; matches today's unenforced
  baseline until that is separately resolved.
- One new Vue component for the search field + results panel, mounted in the workspace shell (§5.1),
  owning its own debounce/token/keyboard-nav state, writing to the shell-level `pendingSelection`
  state §5.6 specifies — not a bare "emit to host page."
- **Not in this slice, and explicitly not needed for it to be coherent on day one**: a
  "recenter the Map camera on this location" primitive (§5.3) — genuinely new scope if wanted,
  independent of everything else here; a dedicated keyboard shortcut (optional, additive, §5.1); a
  paged results browser (§4.3, additive via the same contract); any `may_read`/private-visibility
  enforcement (§6 item 2, blocked on open questions, §2.6).

## 8. Focused test and browser-acceptance plan

**Unit (no Directus/HTTP dependency, matching this repo's established pure-function testing
convention — e.g. `world-page-presentation.ts`'s own `resolvePagePresentation`)**:

- Result ranking/capping given a fixed candidate list (exact match ranks above starts-with ranks
  above contains; per-type cap; overall cap).
- **Catalogue ref construction, including the corrected collision case (§3)**: `packageId + entityType
  + slug`, never slug alone, never `packageId + slug` alone — a fixture pair (a Spell and an Item
  sharing one slug within the same package) must resolve to two DISTINCT refs and never be collapsed
  or cross-resolved; and legacy-row ref construction (collection+id) from representative fixtures of
  each content type.
- Per-type failure isolation: one source's resolver throwing does not empty the others' results, and
  is reported in `partialFailures`.
- Debounce/min-query-length/stale-response-token logic as pure functions, same extraction pattern as
  `app/lib/eldra/world-show-background.ts`'s own `shouldRestoreOnEscape`.
- §5.6's stale-selection-token comparison, as a pure function, same reasoning.
- **No `visibility`-aware filtering test** — correctly absent, since §6 item 2 means this plan does
  not implement that filtering; a test for it would assert behavior this plan explicitly does not
  build.

**Browser acceptance (pending the same, already-documented blocker — no safe disposable Directus
credential established in this environment; see
[species-class-context-content-and-enemy-images.md](./species-class-context-content-and-enemy-images.md) §9.5/§5.2
of the Background-Defaults doc for the full trace of why, unchanged since those passes)**:

- Searching from the World Map surfaces a result across at least one catalogue type (e.g. a bound
  pack's spell) and one legacy type (a homebrew location), opens the context rail for each without
  moving the Map, and the explicit "open full view" action lands on the correct destination per
  §5.3's matrix (and is correctly ABSENT, not a self-linking button, for catalogue-only types).
  Selecting a second result while the first's rail is open replaces it (§5.6); navigating to a
  different World clears any pending selection.
- A non-member account's request to a World it does not belong to is rejected (401/403) by the search
  endpoint itself, not merely filtered client-side — already proven at the route level for the five
  pre-existing list/detail routes this round (§0.5); the new search route and the new Vue selection
  -resolution path (§5.6) reuse those SAME now-corrected routes, so this check is largely inherited,
  not a new surface to verify from scratch.
- **Not a browser-acceptance item in this pass**: Player-vs-GM differing results for a
  `'private'`-visibility entity — removed, since §6 item 2 means this plan does not implement that
  distinction to verify.
- Desktop and ~390×844 layouts; keyboard-only operation (Up/Down/Enter/Escape); no-results and
  simulated-failure (one source down) states.

---

## 9. Dependencies, uncertainties, and schema/deployment requirements

- **No new Directus collection or field is required.** Every source this plan reads already exists
  and is already World-scoped. This is a pure aggregation-and-filtering feature over existing reads.
- **No new environment flag is required** — the plan reuses whatever `ELDRA_EFFECTIVE_CONTENT`
  already resolves to via the existing `getCatalogueBackedEntityRows` call, rather than branching on
  the flag itself.
- **Uncertain, flagged rather than guessed**: whether a "recenter the Map on this pin" primitive is
  wanted now or later (§5.3, §7) — a product call, not an architecture one.
- **Uncertain**: the exact ranking tie-break and per-type/overall caps proposed in §4.2/§7 are
  reasonable defaults, not measured against real content volume in this environment (no safe
  disposable access this pass, per CLAUDE.md's own standing constraint and this task's explicit
  instruction not to chase credentials) — worth a quick sanity check against a real bound pack's
  entry count before locking the numbers in.
- **§6 item 2 (private visibility) is the one real blocker before implementation** — not a style
  preference, a genuine open question (§2.6's three unresolved cases) that must be answered by a
  human, not approximated by this plan. §6 items 1 and 3 are already resolved (1 implemented in §0; 3
  is a disclosed, accepted pre-existing inconsistency, not a decision pending). Everything else in
  this plan is a direct, evidenced reuse of code that already exists and already works.

---

## 10. Status

**Two different things happened this round, and they should not be conflated:**

1. **The security correction (§0) was implemented, tested, and typechecked** — real code, under
   separate, explicit authorization, scoped exactly to the membership gap §2.3's trace found (five
   list routes, four detail routes). Full suite 6724 passed, typecheck 895 (identical to baseline),
   lint consistent with pre-existing style. Not committed, not pushed, no production access, no
   production provisioning run.
2. **This search plan itself remains documentation only.** No search route, no search component, no
   search test was written. §0's own fixes are reused BY this plan (§3, §4.2, §5.6, §7) but exist
   independently of it and were not written "for" search specifically — they correct a real gap the
   trace happened to surface.

Six concrete revisions were made to the plan itself this round, all traced to a specific flaw rather
than a style pass: the catalogue ref now carries `entityType` (a real, demonstrated collision risk,
§3); §4.2 corrects "resolve once" into "a dedicated minimal-field DB query for Directus-backed
sources, the existing effective view only for catalogue content" (the original language would have
meant loading full rows/blocks to return twenty names); §4.1's freshness claims are now scoped to the
Nuxt-server layer, with Directus/infrastructure-level caching explicitly marked unverified rather than
asserted away; §5.6 replaces "emit to the host page" with a concrete, ownership-and-cleanup-specified
mechanism; §5.3 omits (rather than self-links) the full-view action for catalogue-only types; and §2.6
withdraws the `world.entity.edit`-as-private-content-authority shortcut, replacing it with the actual
traced policy and three named open questions. Stopped for review before any further implementation.
Unrelated dirty/untracked work and the pre-existing stash were not touched.
