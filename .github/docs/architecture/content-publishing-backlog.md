# Content Publishing -- Backlog

Status: **recorded, not implemented.** Workflow/tooling backlog for the Content Pack
publication pipeline, kept separate from
[character-decisions-presentation-backlog.md](character-decisions-presentation-backlog.md),
which is Character Sheet/Creator presentation-only.

## `packages:sync` / Refresh Content Package does not pick up a newly added candidate category

**Observed**: when the `feature-options` Content Source category was added to the XPHB
provider (Character Creator V3 -- Selected Option Explanations), `pnpm run packages:sync
--world Solaris` kept reporting Content `CURRENT` and performed no action, even after
`--apply`. Traced directly: `scripts/directus/packages-sync.mjs`'s own classification (and the
`refreshContentSource` function it calls for `--apply`) regenerate candidates and keep ONLY
those whose `externalId` already exists in the Content Pack's last published version ("keep
whatever was already selected, rebuilt with today's pipeline" -- `refresh.ts`'s own documented
rule). A brand-new category's candidates have no prior `externalId` to match, so they are
silently excluded from every regeneration, and the tool's own report gives no hint that
candidates exist but are unselected. The new Feature Options were only made available in the
live `eldra.solaris.xphb` pack after a MANUAL publish + rebind outside this tool.

**Desired outcome**: an explicit, reviewable way to widen a Content Pack's published selection
from the terminal, without `packages:sync`/refresh ever silently including content nobody
reviewed. One concrete direction already sketched (not committed to): a narrow, explicit
opt-in CLI flag (e.g. `--include-category <key>`) that both (a) in classification, reports what
a named new category would add instead of silently saying `CURRENT`, and (b) in the apply path,
includes that category's current candidates in the next published version.

**Do NOT, when this is picked up:**
- Make `packages:sync`/refresh auto-include every candidate the provider now offers -- that is
  the exact "never silently pull in new entries nobody has reviewed" rule this gap doesn't
  violate today, and any fix must keep that invariant.
- Conflate this with a Rules Package change -- this is entirely the Content Pack publication
  axis (`content_packs` + `world_content_pack_bindings`), never `rules_packages`/
  `world_rules_config`.

Not implemented here -- this pass only fixed Creator-side consumption of the already-published
Feature Options; the publication workflow gap above is unchanged.

## Media Gallery thumbnail delivery (recorded 2026-11-12, observed during Content Workspaces Pass A)

Recorded here rather than in
[character-decisions-presentation-backlog.md](character-decisions-presentation-backlog.md)
because this is the media/asset axis of the content pipeline
([content-workspaces-and-studio.md §13](content-workspaces-and-studio.md)), not Character
Sheet presentation.

**Observed**: Media Gallery cards appear to request original full-size files. Caldera image
cards reference 146.5 MB originals, and previews stay blank while loading.

**Not yet verified**: that the gallery genuinely downloads the full original is an inference
from the card markup and the observed delay — **the actual request path has not been
inspected**. The first task when this is picked up is to confirm what the gallery really
requests (Directus serves `/assets/:id` with transform parameters such as `?width=&height=&fit=`
and named presets, so the fix may be a missing query parameter rather than a missing feature).
Do not assert the full original is downloaded until a network trace or the component's own
request URL shows it.

**Desired outcome**: gallery cards request appropriately sized thumbnails/transforms or
generated previews, with lazy loading and useful loading/error states, while the
**full-resolution original is preserved unchanged** for map use — map overlays and tiling read
the original by file id and must keep getting the full-resolution asset.

**Do NOT, when this is picked up:**
- Downscale, re-encode, or replace the stored original. Map tiling depends on it.
- Introduce a second upload or storage path; the ownership policy
  (`directus_files.world_id`, Phase 0) stays the single source of truth for which World an
  asset belongs to.

Not implemented in Pass A — recorded only.

**Implemented (2026-11-18, Media Gallery Thumbnail Performance pass).** Root cause verified, not
inferred: cards request `file.url` = `/api/assets/:id` with **no** transform query parameters at
all (confirmed by reading `server/api/worlds/[id]/media.get.ts`'s `assetUrl()`, the only place
that URL is built), and the shared proxy route (`server/api/assets/[id].get.ts`) **dropped every
incoming query parameter and always fetched Directus's bare `/assets/:id`** — so even a caller
that *did* add `?width=` would have gotten the full original anyway, which is the deeper reason
"appears to request originals" was correct. Directus's own on-the-fly transform (confirmed
*working* against a disposable 11.12.0 instance, `storage_asset_transform: "all"`) is also
confirmed to **refuse** any source wider or taller than 6000px with `ILLEGAL_ASSET_TRANSFORMATION`
— the Caldera images, at an 8K-class resolution, are exactly this case, so "just forward the query
string" alone would convert "slow" into "broken" for them specifically.

Fix: `/api/assets/[id].get.ts` now accepts one query param, `preset=card` (a small, fixed,
named set — never arbitrary caller width/height). It first asks Directus's own transform (the
preferred, zero-new-infrastructure path, used for every image ≤6000px — confirmed against the
small fixture). When Directus refuses specifically with `ILLEGAL_ASSET_TRANSFORMATION`, it falls
back to a new module, `server/utils/media-thumbnails.ts` — a bounded (max 2 concurrent
generations, per-fileId request-coalesced, 20s-timeout), **in-memory-cached** `sharp` pass
(already a project dependency; `map-tiles.ts` already uses it for an even heavier job). Any OTHER
failure (file genuinely missing, auth failure) propagates unchanged — never silently falls back
to serving the original. `app/pages/worlds/[id]/media.vue` and `WorldMediaPicker.vue`'s card grids
now request `?preset=card`; both already had `loading="lazy"` and an `aspect-[4/3]` box (no
layout-shift fix needed) and both gained an explicit "Preview unavailable" + manual Retry state on
image load error. The full-screen preview modal, the picker's side panel, Copy URL, and every
other `/api/assets/:id` caller across the app (~80 sites — portraits, items, map pins, etc.) are
**unchanged**: omitting `preset` is byte-for-byte the same proxy behavior as before this pass.

**Why in-memory, not a file-backed cache mirroring `map-tiles.ts`'s own `/opt/eldra/maps`
convention**: this repo's own `Dockerfile` copies only `.output` into the runtime image — no
`VOLUME`, no `/opt/eldra` reference anywhere in it — so whether that path is actually a
persistent, deployment-provisioned volume in the real production container is **unconfirmed**
from this pass (no production access). Rather than inherit that same unverified assumption for a
new path, the cache is a small bounded, byte-budgeted `Map` (see the pre-commit review below for
the exact limits), safe under this app's own
already-documented single-process deployment. The only cost of this choice being imperfect is a
~0.4-1s regeneration on the next cold request after a process restart — never a correctness bug.
See `media-thumbnails.ts`'s own header for the full reasoning; this is a safe, incremental,
non-redesign upgrade if `/opt/eldra`'s production persistence is ever confirmed.

**Existing assets receive previews automatically — no backfill script needed.** Because
generation is on-demand (triggered by the first request for a given file's thumbnail, not only at
upload time), an already-uploaded large image gets its first thumbnail generated transparently on
whoever's gallery card loads it next; nothing needs to run against production first. The tradeoff
is the one measured below: the very first viewer after this deploys (or after any restart) pays
the ~0.4-1s cold-generation cost for a large image; every viewer after that, until the next
restart, gets the cached ~0.1s warm response.

**Measured (391 real spell entries / real 100-140MB 8K-class PNG fixtures generated locally, and
through the real running app against a disposable Directus 11.12.0 — see the full report for
exact numbers and commands)**: a `preset=card` response for a 105MB/7680×4320 source dropped from
would-be-105MB to **9.6KB** (cold: ~1.1s, generation-bound; warm: ~0.085s, cache-bound). A
134MB/4320×7680 transparent portrait produced a correctly-oriented, alpha-preserving 147KB
thumbnail. A small (800×600) image's `preset=card` response used Directus's own transform
directly (confirmed via its own distinct `cache-control` header) and dropped from 1.5MB to 175KB.

**Deployment**: no schema change, no `bootstrap.mjs` run. A plain code deploy. No action required
for existing large images — see "automatically" above. `ASSETS_TRANSFORM_IMAGE_MAX_DIMENSION`
(Directus's own config) was **not** changed and should not be, per this pass's own instruction not
to raise global limits speculatively — if the owner wants to confirm production's own transform
settings, `GET /settings` (as an existing Directus admin) returns `storage_asset_transform`, which
should read `"all"` or list `"card"`-shaped presets, not `"none"`. **Production's own
`storage_asset_transform` setting is not claimed to match the disposable instance this pass
measured against** — it was only confirmed there; the read above is how the owner confirms it in
production, not an assumption that it already does.

**Bounded pre-commit resource review (2026-11-18) — four real gaps found and fixed, before
commit:**

1. **Cache was entry-count-bounded (200), not byte-bounded** — a real worst case (maximum-entropy
   640×640 WebP with an alpha channel, measured directly) is ~667KB/entry, so 200 entries had no
   real memory ceiling. Fixed: the cache now tracks actual bytes and evicts least-recently-used
   entries once a 50MB budget (generous relative to the real ordinary-content numbers measured
   above: 9.6KB–175KB) is exceeded, with a secondary 500-entry backstop and an 8MB single-entry
   cutoff — a thumbnail larger than that is still generated and served correctly, just never
   retained.
2. **A generation timeout rejected the caller's promise but did not stop the underlying work** —
   reproduced directly: destroying only the source stream left the `sharp`/libvips pipeline running
   in the background indefinitely (confirmed: its `destroyed` flag stayed `false`, no `end`/`error`
   fired). Fixed: a timeout now destroys both the source stream and the `sharp` transform stream,
   and the concurrency slot is released only after that destruction, in the same `finally` —
   "released" and "actually stopped" are now the same moment.
3. **The wait queue for a concurrency slot had no bound** — a burst of requests for many different
   uncached large files could each queue indefinitely with no signal anything was wrong. Fixed: a
   bounded queue (8) now rejects immediately with an explicit `ThumbnailGenerationOverloadedError`
   (surfaced as HTTP 503) once both the 2 active slots and the queue are full, rather than hanging.
4. **A generation already in flight when its file was deleted could still repopulate the cache
   after the fact** — `clearCachedThumbnail` only cleared an already-cached entry; it could not
   reach into an in-flight generation about to resolve. Fixed, then revised once more on a second
   review pass: the first fix tombstoned every deleted file id **permanently** — safe (Directus ids
   are never reused) but unbounded (a `Set` that only ever grows for the life of the process, one
   entry per delete ever performed). Replaced with bounded lifecycle tracking: an id is tracked
   *only* while a generation for that exact id is genuinely in flight — a subset of the in-flight
   map's own keys, so it is bounded by the same concurrency cap (at most 10 entries at any instant,
   never one per deletion ever performed) — and the tracking entry is removed the moment that
   generation settles, success or failure. A delete with nothing in flight tracks nothing at all;
   the per-request Directus existence check (point 2.3 below) is what actually protects that case,
   unchanged.

All four have focused regression tests (`tests/server/utils/media-thumbnails.test.ts`), using
controlled, test-only deferred/short-timeout overrides rather than giant fixtures or long waits —
including a 25-cycle delete-during-generation loop proving the tracking never accumulates, and an
explicit cleanup assertion showing it returns to zero once the guarded generation settles. Also
added: explicit tests proving a cache hit never skips the per-request Directus existence/status
check (the route always asks Directus first, cache or not), that extra caller-supplied query
parameters are never forwarded to Directus as an unrestricted transform, and that concurrent
requests for different files never cross-contaminate results.

**Second review pass (2026-11-18) — two further checks, both resolved before commit:**

1. **Bounded deletion tracking** (above) replaces the permanent tombstone from the first review
   pass — same correctness guarantee (an in-flight generation can never repopulate the cache for a
   file deleted mid-flight), now with no permanent-growth cost.
2. **The oversized-source fallback was gated on the bare `ILLEGAL_ASSET_TRANSFORMATION` code
   alone.** Verified against Directus 11.12.0's own source
   (`@directus/api/dist/services/assets.js`, `AssetsService.getAsset`): that error has exactly ONE
   throw site in the whole file, always with the literal `{ invalidTransformations: ['width',
   'height'] }`, guarding exactly "missing or over-the-limit width/height." Confirmed empirically
   too — `storage_asset_transform: 'none'`, `'presets'` with no match, and invalid
   `fit`/`format`/`quality`/`width` values all respond with a *different* code
   (`INVALID_QUERY`), never this one — so today, this code is genuinely never shared with another
   transformation-policy failure. Tightened anyway, per instruction, to require verified evidence
   through the response itself rather than the bare code: `isIllegalAssetTransformation` now also
   requires `invalidTransformations` to actually name `width` or `height`, so a hypothetical future
   Directus version reusing this same code for an unrelated field (e.g. an invalid `fit`) would be
   correctly rejected rather than silently routed into app-level processing. Two new negative tests
   pin this: the same code with a different `invalidTransformations` field, and the same code with
   no `invalidTransformations` field at all — both must propagate as an ordinary error, never
   trigger the fallback.

**Accurate acceptance record:**
- Card output: a 640×640 bounding box (`fit: inside`, `withoutEnlargement: true` — aspect ratio
  always preserved, never stretched, never upscaled past the source's own size), WebP, quality 78.
  Measured exact outputs: the 7680×4320 landscape fixture produced a 640×360 thumbnail; the
  4320×7680 portrait fixture produced 360×640. Alpha is preserved when the source has it (confirmed
  via `sharp().metadata().hasAlpha === true` on the generated output from a transparent source).
- **Cold large-image generation performs exactly one download+decode of the original** — Directus's
  own rejection of the transform attempt (`ILLEGAL_ASSET_TRANSFORMATION`) happens before any file
  bytes are read (Directus already knows the stored `width`/`height` from its own metadata
  columns), so only the fallback's own subsequent request actually transfers the original, once,
  streamed directly into `sharp` rather than buffered whole into memory first.
- **Browser layout/Retry behavior is NOT VERIFIED.** No browser automation tool was available in
  this session; every claim above was confirmed at the HTTP layer (`curl`, real disposable Directus,
  real uploads) through the real running app, not by rendering the page. The "Preview unavailable" +
  Retry UI, the `aspect-[4/3]` layout-shift prevention, and `loading="lazy"` behavior as actually
  rendered in a browser remain unverified — flagged here explicitly rather than implied by the
  server-side verification above.

**Owner production acceptance follow-up (2026-11-19) — incomplete fix, now closed.** Gallery cards
passed production acceptance, but the owner found the fix was incomplete: `WorldMediaPicker`'s grid
thumbnails correctly used the `card` derivative, but merely **clicking** an image to preview it (not
"using" it) in the picker's own right-hand selected-image panel still rendered `selectedFile.url` —
the plain original — directly. Clicking the reported ~146MB Caldera image left that panel blank/slow,
exactly as reported, because selecting it for preview alone downloaded the full original a second
time.

**Root cause, traced, not assumed**: `WorldMediaPicker.vue`'s side panel `<img :src="selectedFile.url">`
was a separate rendering path from the grid's own (already-fixed) `thumbnailUrl()` — fixing the grid
alone never touched it. The same pattern existed one level removed in `MapImageOverlayEditor.vue`
(the Build Tool's own Image Overlay create/edit dialog, reached through the same picker): its small
in-dialog preview rendered `editingOverlay.imageUrl` — the REAL overlay reference, which must stay the
full original because it is what gets saved and what the Scene Graph renderer (`WorldMapLeaflet.client.vue`)
actually draws on the map — directly too, so picking an overlay image downloaded the original purely
to show a 160px-tall dialog preview.

**Fix**: both now derive a SEPARATE, display-only `card`-preset URL from the same underlying reference
— `thumbnailUrl()`/`sidePreviewLoadedId` in `WorldMediaPicker.vue`, `dialogPreviewUrl` in
`MapImageOverlayEditor.vue` — while the underlying value used for the real contract (`selectFile`'s
`emit('select', file)`; `editingOverlay.imageUrl`) is never touched, so "Use This Image", double-click
selection, and actual map-overlay rendering all still resolve to the original, unchanged. The
duplicated `?preset=card` URL-building logic (previously inline and slightly different in three
places: the Gallery grid, the Picker's own grid, and now these two preview surfaces) was extracted
into one shared, unit-tested pure function, `app/lib/media/thumbnail-url.ts`'s `buildCardThumbnailUrl`.
Rapid selection changes in the Picker's side panel cannot show a stale previous image as current: the
`<img>` is keyed by `selectedFile.id` (forcing a fresh DOM element per selection, so the browser can
never paint an old element's already-loaded pixels under a new `src`), and a `sidePreviewLoadedId`
comparison shows a "Loading preview..." placeholder until the NEW image's own `load` event fires.
Selecting an image itself stays synchronous (`pickFile`/`selectFile` only ever set a ref) — nothing
about this fix makes selection wait on its preview.

**Traced, not fixed — explicitly out of scope for this pass**: `Check the Map Picker and other
WorldMediaPicker callers` found the identical "small passive preview bound directly to the original
reference" pattern in two more consumers — `WorldEntityDirectEditDialog.vue` and
`StudioEntityEditor.vue` (both a 64×64px image-field preview) — and a third, `SheetManageCharacterRail.vue`,
sets a sheet THEME BACKGROUND image from the picker's selection, which may legitimately need more
resolution than a 640px card bound (not traced closely enough to say either way). `EldraRichTextEditor.vue`
and `AdminHomebrewDraftImagePicker.vue`/`timelines/[timelineId].vue` were skimmed but not fully traced.
None of these were touched this pass — the brief's own explicit scope was the Picker's own preview and
"the map upload form" (identified as `MapImageOverlayEditor.vue`, the only Map-related consumer); fixing
the remainder is a reasonable, bounded follow-up, not done here to avoid scope creep into files/components
with varying risk profiles this pass did not have time to trace individually.

**Verification — stated honestly, per instruction not to claim HTTP tests establish UI behavior.** No
browser automation tool was available this session either. What WAS verified:
- Direct code inspection confirms both template `<img>` bindings now reference the derivative
  (`thumbnailUrl(selectedFile)` / `dialogPreviewUrl`), never the original, for these two preview
  surfaces specifically — and that the underlying `selectedFile`/`editingOverlay.imageUrl` values used
  by `selectFile`'s emit and by the real overlay-rendering contract are untouched.
  `buildCardThumbnailUrl` itself has full unit coverage (empty input, existing query string, retry
  token present/absent/falsy, whitespace).
  - Build, full test suite (318 files / 6478 tests), typecheck (902, unchanged), and lint (zero new
    across every touched file) all pass.
- **NOT verified**: an actual browser session confirming the picker's side panel and the overlay
  dialog visually show the small derivative (not a blank/slow load) when a real large image is
  selected; that rapid selection switching never flashes a stale previous image in practice; that the
  error/Retry state renders and actually recovers; and narrow-viewport layout. This is the exact gap
  stated rather than papered over — the owner's own next deploy-and-click-through pass is what closes
  it, the same way the grid fix's own browser verification is still open from the prior pass.

Picker selection preview and the overlay dialog preview are now implemented per the fix above;
browser verification of both remains open until the next deploy.

## Remaining authoring image previews (not yet committed)

Closes the two of the three follow-ups named above that still had the identical "small preview bound
directly to the original reference" pattern.

**Traced, changed**:
- `WorldEntityDirectEditDialog.vue` — the 64×64px Image-field preview (both the pending-draft `<img>`
  and the inherited/`needsPreparation.presentation.image` fallback `<img>`) now wraps its `:src` in
  `buildCardThumbnailUrl`. The value actually STORED on selection (`onImageSelected`'s
  `draft.value.image = { fileId: file.id, url: file.url }`, and the edit payload's `fileId`) is
  untouched — still the original, confirmed by inspection of `onImageSelected` and the `edits.push`
  call that only ever sends `fileId`, never a URL.
- `StudioEntityEditor.vue` — the same 64×64px Image-field preview (draft-or-effective), same fix, same
  untouched-storage guarantee (`onImageSelected`/`revertPath`/the save payload's `fileId`-only shape).
  Also traced its own `ContentPresentationPanel` ("Last saved state" live preview, `max-h-72/80`
  artwork) — this is intentional, prominent artwork display (the Builder's before-selection preview
  and the Sheet's after-creation display, per that component's own header comment), not a small
  editing-control thumbnail, so left unchanged on purpose.

**Traced, no change needed**:
- `SheetManageCharacterRail.vue` — the earlier "may legitimately need more resolution" question is now
  resolved by tracing: this file has no `<img>` tag and no small preview surface for the sheet theme
  background AT ALL. The chosen background is applied ONLY as a live, full-size CSS `background-image`
  (`safeAppearanceCssUrl(theme.backgroundUrl)`) on the actual sheet surface — the real, intentional
  rendered background this backlog has always said to leave alone — and the "Appearance" panel shows
  only a text title (`backgroundTitle`) plus "Gallery"/"Default" buttons, no thumbnail of any kind.
  Nothing to fix here; `selectSheetThemeMedia` already stores the original `file.url` unchanged.

**Confirmed safe to apply `buildCardThumbnailUrl` unconditionally to both changed surfaces** (per this
task's own instruction to check the helper's URL contract before reusing it): every value flowing into
these two `<img>` bindings is always either empty/absent or an internal `/api/assets/:id` reference --
never external. `draft.image.url` always comes from `WorldMediaPicker`'s own `select` emit (confirmed:
`MediaFile.url` is always server-built via `assetUrl(id)`); `needsPreparation.presentation.image.url` /
`preview?.effectivePresentation?.image?.url` always comes from
`server/utils/content-presentation-assets.ts`'s `resolvePortableAssetRef`, which only ever returns
`url: \`/api/assets/${file.id}\`` or `image: null` (never an external/foreign URL, by construction --
`unsupported-kind`/`not-found`/`world-scope-mismatch` all resolve to `null`, never a passthrough of
some other string).

**Still open, unchanged, explicitly out of scope for this pass too**: `EldraRichTextEditor.vue`,
`AdminHomebrewDraftImagePicker.vue`, and `timelines/[timelineId].vue` were named in the prior pass as
"skimmed but not fully traced" — this pass's own brief named only the three files above, so these
three remain exactly as open as before. Not touched, not newly investigated.

**No new tests added.** `buildCardThumbnailUrl` itself is unchanged and already has full unit coverage
(see the prior pass's own entry above); these two changes are plain template `:src` bindings calling
that same already-tested function, with no new helper behavior and no DOM-mount test harness in this
repo to exercise a rendered `<img>` against -- a test that only re-asserts the template expression
would duplicate it, not verify anything new.

**Verification**: typecheck (902, confirmed unchanged baseline -- one transient new error introduced by
an unguarded `string | undefined` argument was caught and fixed with a `|| ''` fallback before this
count was taken), lint (zero errors in both touched files), full suite (321 files / 6511 tests
passing), production build (clean, no new warnings for either file), `git diff --check` (clean). No
browser tool was available this session -- rapid-selection/stale-image behavior, thumbnail
failure/Retry, and actual rendered layout at both preview sites were NOT browser-verified; this is
traced-through-code confidence only, stated as such rather than implied.

### Deployment requirements

None -- reuses the existing, already-deployed `buildCardThumbnailUrl`/`preset=card` path; no schema,
environment, or credential change.

### Status

**NOT committed.** Stopped here for review per this task's own closing instruction.
