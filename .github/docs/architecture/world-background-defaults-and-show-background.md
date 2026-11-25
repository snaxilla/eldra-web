# World Background Defaults, Show Background, and Navigation Scrollbar

Status: **Implemented, unit-tested, typecheck/build/diff-check clean. Real-browser verification
NOT performed this pass -- see §5 for why, and what is still needed to close that gap.**

## 1. What this pass adds

Three independent, small usability improvements, bundled because they touch the same World
Workspace surface area:

1. **World-default page background inheritance** -- a World can now set one default background/
   mode that every page without its own override shows, instead of every page needing to be
   configured individually.
2. **"Show Background"** -- a personal, temporary viewing toggle that fades out page content to
   let a viewer look at the artwork behind it, without losing anything.
3. **Gold navigation scrollbar** -- the World Workspace sidebar's own scroll containers now use the
   theme's gold accent token instead of the browser default.

None of these touch the Species/Class collection-card regression repair from the prior pass (see
[species-class-context-content-and-enemy-images.md](./species-class-context-content-and-enemy-images.md))
or its tests.

## 2. World-Default Background

### 2.1 Existing system traced first

Before this pass, per-page backgrounds already existed as `world_page_presentations` (one row per
`world_key` + `page_key`, fields `presentation_mode` [`immersive`|`muted`|`neutral`] and
`background_file_id`), read/written by
[server/api/worlds/[id]/presentation/[pageKey].get.ts](../../../server/api/worlds/%5Bid%5D/presentation/%5BpageKey%5D.get.ts)
and `[pageKey].post.ts`, edited through
[WorldPagePresentationPanel.vue](../../../app/components/world/WorldPagePresentationPanel.vue) (the
"Customize Page" button inline, or Game Admin → Page Setup), and rendered by
[world-workspace.vue](../../../app/layouts/world-workspace.vue)'s `hasPageBackdrop`/`backgroundImageUrl`
computeds. There was no World-level concept at all -- every page was independently configured or
showed nothing.

`WorldMediaPicker.vue` (the shared Media Gallery picker: keyboard/focus/Escape via a `FocusScope`,
nested-dialog `dismissible` coordination with `WorldPageCustomizeButton.vue`) was already correct and
reusable as-is; nothing in it changed.

### 2.2 Design: reuse the same collection, not a second system

**No new collection, no schema change to add the World default itself.** A World's default
background/mode is stored as an ordinary row in the SAME `world_page_presentations` collection,
with a reserved `page_key` value: `'world-default'` (`WORLD_DEFAULT_PAGE_KEY`,
[server/utils/world-page-presentation.ts](../../../server/utils/world-page-presentation.ts)). This
reuses the exact same GET/POST routes, the exact same `world.settings.edit` authorization, the exact
same cross-World asset check (`fileBelongsToWorld`), and the exact same editor component
(`WorldPagePresentationPanel.vue`) -- Game Admin → Page Setup gained one new list entry
("World Default") that points the SAME panel at `page-key="world-default"`. `'world-default'` can
never collide with a real route-derived page key (`resolveWorldWorkspacePageKey` only ever returns an
actual URL segment, `'entity-article'`, `'character-sheet'`, or `'world-map'`/`'global'`).

### 2.3 Precedence and the three-state model

Exactly the order asked for: **explicit page override → World default → nothing.** The missing
piece was distinguishing two states that used to collapse into the same thing (`background_file_id
== null`): "never configured, should inherit" and "explicitly cleared, should show nothing." A new
`backgroundSource` concept (`'override' | 'inherit' | 'none'`) makes this explicit:

- **`override`** -- this page has its own `background_file_id`. Never stored explicitly; always
  *inferred* from the file id being set (`resolveBackgroundSource`), so an existing override works
  identically whether or not the new column below has been migrated yet.
- **`inherit`** -- explicit "Use World Default" choice. Shows the World default's own background
  and mode.
- **`none`** -- explicit "No Background" choice. Shows nothing, even if a World default exists.
- **No row at all** (the common case -- most pages in most Worlds have never been touched) resolves
  to `inherit`. This is what makes "Existing Worlds with no new default retain their current
  appearance" true for free: if no World default is ever set, inheriting resolves to nothing, byte
  -identical to today. The moment a World default IS set, every untouched page starts showing it --
  exactly the feature being asked for, not a side effect to guard against.

All of this precedence logic is one pure, directly-tested function,
`resolvePagePresentation(pageKey, ownRow, worldDefaultRow)` in `world-page-presentation.ts`, called
from the GET route. The client (`world-workspace.vue`) needed **zero rendering changes** -- it has
always just trusted whatever `presentationMode`/`backgroundImageUrl` the route resolves, and the
route now resolves inheritance before responding.

### 2.4 Specialized surfaces are excluded from inheritance, not just from this pass's new UI

**World Map** (`page_key` would be `'world-map'`) and **Character Sheet** (`'character-sheet'`) are
excluded from the *implicit* inherit path (`SPECIALIZED_PAGE_KEYS` in `world-page-presentation.ts`):
if either has no own override, resolution forces `'none'` rather than silently picking up whatever a
GM later sets as the World default.

- **World Map**: already structurally impossible to see a page backdrop at all --
  `world-workspace.vue`'s `isFullBleedMap` gate means `hasPageBackdrop` is unconditionally `false`
  there; the map draws its own scene. Excluding it from inheritance resolution is purely to skip a
  pointless extra Directus fetch (`pagePresentationNeedsWorldDefault` returns `false` for it), not a
  visible behavior change -- there is nothing to exclude it FROM.
- **Character Sheet**: the one surface genuinely excluded for a product reason, per this task's
  explicit instruction. It already uses this same per-page mechanism (so an explicit override still
  works exactly as before), but a GM who has never set one keeps seeing nothing when a World default
  is set elsewhere, rather than that default sweeping in unasked. `WorldPagePresentationPanel.vue`
  hides the "Use World Default"/"No Background" controls for this page key (`supportsInheritance`),
  keeping the original single "Clear" action instead, since offering a button that can never
  visibly do anything would be misleading.

Both exclusions are enforced server-side (`resolvePagePresentation`), not just client-side UI
cosmetics.

### 2.5 Avoiding an accidental override bug

A real bug caught during implementation, not a hypothetical: the panel's `setPresentationMode`
(Immersive/Muted/Neutral buttons) used to re-save using `presentationState.value.backgroundFileId`.
That field is the RESOLVED display value -- while inheriting, it's the World default's own file id,
not this page's. Re-saving mode with that value would have silently turned "inheriting" into "this
page now explicitly overrides with a copy of the World default's image" the moment someone merely
clicked a mode button. Fixed by introducing `ownBackgroundFileId` (null unless
`backgroundSource === 'override'`) and using that for every mode-only save.

### 2.6 Server-side deployment-order safety

Two separate safety measures, because the new `background_source` column is additive:

- **Reads never break pre-migration.** `fetchPresentationRow` uses `fields=*` (wildcard), not an
  itemized `fields[]` list -- Directus rejects a `fields[]` request naming an unknown column
  outright, which would otherwise turn "the migration hasn't run on this instance yet" into every
  single page load 500ing. A missing column just reads as `undefined`, which
  `resolveBackgroundSource` already treats as "no inherit marker" → `'none'`, identical to
  pre-feature behavior. This matches `world-presentation-settings.ts`'s own established `fields: '*'`
  convention for the same reason.
- **Writes only touch the new column when the new actions are used.** `resolveWriteBackgroundSource`
  returns `null` (meaning: leave `background_source` out of the Directus write body entirely) for
  every pre-existing save path -- mode toggle, picking an image, the legacy single "Clear" on
  Character Sheet/World Default -- so none of them depend on whether the migration has run. Only
  the two NEW explicit actions ("Use World Default" / "No Background") ever write it, and only they
  require the migration to have run first (see §2.7's deployment order).

### 2.7 Additive schema: provisioning and deployment order

New script:
[scripts/directus/alter-world-page-presentations-background-source.mjs](../../../scripts/directus/alter-world-page-presentations-background-source.mjs)
(`pnpm run directus:alter-world-page-presentations-background-source`), added to
`scripts/directus/bootstrap.mjs`'s `SCRIPTS` list (so `pnpm run directus:bootstrap` picks it up too).
Idempotent, following the exact `ensureField`/backfill pattern
`alter-world-content-pack-bindings-binding-modes.mjs` already established: adds the nullable
`background_source` field if missing, then backfills every existing row to `'override'` (has a file)
or `'none'` (doesn't) -- never leaving a pre-existing row's meaning to be inferred, per §2.3.

**Deployment order for this one column, overriding CLAUDE.md's general "deploy app, then migrate"
checklist**: run this script **before** the two new save actions are exposed to real users. Reads
degrade safely either order (§2.6), but a write naming an unprovisioned field 400s. Command:

```
node scripts/directus/bootstrap.mjs
# or, to run only this one script:
node scripts/directus/alter-world-page-presentations-background-source.mjs
```

Not run against any live instance by this pass -- no credential for the confirmed-disposable
instance was available (see §5); the owner runs this as part of the normal deployment checklist.

## 3. "Show Background"

Entirely client-side, workspace-shell-owned (`world-workspace.vue`), not per-page:

- `useState<boolean>('world-show-background-active', ...)`, offered only when
  `canOfferShowBackground(hasPageBackdrop, pageKey)` is true (`app/lib/eldra/world-show-background.ts`,
  pure and unit-tested) -- i.e. there is a resolved backdrop AND the page isn't Character Sheet (the
  World Map is already excluded for free, since it never has `hasPageBackdrop`).
- **Mechanism: hide the page-content column, not individual panels.** The content `<slot />` wrapper
  gets `opacity-0 pointer-events-none` plus the native `inert` attribute (bound `:inert=
  "showBackgroundActive"`) when active. Because every page's own context/secondary panels render
  INSIDE that slot, this one toggle hides all of them together with zero per-page wiring -- there was
  no need to touch `WorldEntityInteractivePage.vue` or any other page component.
- **Nothing is unmounted.** The hidden content stays mounted, just visually and interactively
  inert -- so "restore prior state/selection/draft" and "don't lose unsaved work" are true by
  construction, not something extra to implement.
- **The left navigation rail and the toggle itself are siblings of the hidden wrapper**, not inside
  it -- both stay visible and reachable the entire time, including the mobile drawer (gated off only
  while the drawer is actually open, matching the hamburger's own existing convention, to avoid
  sharing a corner with the drawer's close button).
- **Keyboard/AT**: `inert` removes the subtree from both the tab order and the accessibility tree in
  every current browser; `aria-hidden` is added alongside it defensively, though redundant with
  `inert` in current implementations.
- **Reduced motion**: `motion-safe:transition-opacity` / `motion-reduce:transition-none` (Tailwind's
  built-in variants) -- the fade is skipped outright under `prefers-reduced-motion`.
- **Escape**: a bubble-phase `window` keydown listener restores content unless
  `document.querySelector('[role="dialog"]')` finds something open (confirmed Reka UI's
  `DialogContentImpl` renders `role="dialog"` by reading its source directly) -- covers every UModal
  -based dialog generically. `WorldMediaPicker`'s own Escape handler runs in the CAPTURE phase and
  calls `stopPropagation()`, which halts dispatch before this bubble-phase listener would ever see
  the event, so the Media Gallery picker needs no explicit check here either.
- **Reset on navigation**: a `watch(() => route.path, ...)` forces it off -- route.path already
  encodes both page and World. A second `watchEffect` also forces it off if `canOfferShowBackground`
  itself flips false without a navigation (e.g. the backdrop is cleared while active).

## 4. Navigation Scrollbar

**The real scroll containers, traced first**: the two `<nav>` elements inside
[WorldWorkspaceSidebar.vue](../../../app/components/world/WorldWorkspaceSidebar.vue) -- the collapsed
icon rail and the expanded link list -- not the `<aside>` wrapper around them, which never scrolls
itself. (No prior gold-scrollbar attempt existed anywhere in the codebase to diagnose; this is new.)
A rule written against the `<aside>` would never apply, since `::-webkit-scrollbar`/`scrollbar-color`
only affect the element that actually overflows.

Both `<nav>`s share one new class, `.eldra-nav-scroll`, styled in a new scoped `<style>` block in the
same component: `scrollbar-width: thin` + `scrollbar-color` using the theme's `--eldra-accent-rgb`/
`--eldra-panel-rgb` tokens (not literals, per CLAUDE.md), plus the matching `::-webkit-scrollbar*`
rules for a visible thumb/track in Chromium/WebKit. The whole color block is wrapped in
`@media (forced-colors: none)` so Windows High Contrast's own accessible scrollbar rendering is never
overridden. `overflow-y: auto` (not `scroll`) is unchanged, so a platform's overlay-scrollbar
auto-hide behavior is untouched. Scoped to one component's two elements -- no global reset, per
CLAUDE.md's "No global scrollbar redesign" instruction.

## 5. Verification

### 5.1 Automated

- New/extended pure-function tests: `resolveBackgroundSource`, `resolvePagePresentation`,
  `pagePresentationNeedsWorldDefault`, `resolveWriteBackgroundSource`
  ([tests/server/utils/world-page-presentation.test.ts](../../../tests/server/utils/world-page-presentation.test.ts)) --
  precedence, inherit-vs-explicit-none, specialized-surface exclusion, and the write-side
  deployment-order safety all covered directly, without a Directus dependency.
- `canOfferShowBackground`, `shouldRestoreOnEscape`
  ([tests/lib/eldra/world-show-background.test.ts](../../../tests/lib/eldra/world-show-background.test.ts)).
- Full suite: 6669 passed (up from 6645 before this pass -- the prior pass's own regression-fix
  tests remain included and untouched).
- `pnpm run typecheck`: 895 errors, down from an **unrelated, pre-existing 902-error baseline**
  (confirmed via a non-stash backup/restore comparison, matching this repo's own established
  methodology for comparing against HEAD without touching the owner's dirty tree or stashes). Zero
  new errors from this pass -- a normalized line-by-line diff between the baseline and after
  confirms every line in the "after" set already existed in the baseline set. The 7-error drop is an
  incidental side effect of adding an explicit `useFetch<FetchedPagePresentation>()` generic in
  `world-workspace.vue` (needed so my own new `backgroundSource` field couldn't get swallowed by a
  pre-existing ambiguous-union inference problem at that exact call site -- Nuxt's typed fetch was
  already unioning this GET route's response shape with an unrelated sibling POST route's shape by
  path-pattern, which was silently already producing dead-on-arrival property-access errors at these
  lines in the pre-existing baseline); not a deliberate separate fix, just a consequence of the one I
  needed anyway.
- `pnpm build`: production build completes (log watched to actual process exit, not just the
  harness's wrapper-script notification).
- `git diff --check`: clean.

### 5.2 Real-browser verification: NOT performed this pass

Same blocker as the prior pass's own §9.5, unchanged since then: no safe, non-production,
disposable-scoped Directus credential is available to this session through any permitted means.
Per this round's explicit instruction, no further credential discovery, authentication-bypass route,
retry of a previously-blocked approach, or `.env` load was attempted to try to close that gap again.

**Not verified in a real browser**: World Default → inherit precedence end-to-end, "Return to World
Default" round-trip, World isolation, Show Background's actual fade/inert/focus behavior, the gold
scrollbar's rendered appearance, or either specialized-surface exclusion, on either desktop or
~390×844. Everything above this line is implementation, unit-test, type, and build verification
only -- a real pass/fail on the browser checklist this task specified remains open, and "no defect
found" here must not be read as a browser pass. The owner either supplies a disposable-scoped
credential or exercises the checklist directly to close this out.

## 6. Files changed this pass

- `server/utils/world-page-presentation.ts` -- `resolveBackgroundSource`, `resolvePagePresentation`,
  `resolveWriteBackgroundSource`, `pagePresentationNeedsWorldDefault`, `WORLD_DEFAULT_PAGE_KEY`
  (new, pure, tested).
- `server/api/worlds/[id]/presentation/[pageKey].get.ts` -- resolves inheritance; `fields=*` for
  pre-migration safety.
- `server/api/worlds/[id]/presentation/[pageKey].post.ts` -- accepts/writes `backgroundSource` only
  for the two new explicit actions.
- `app/components/world/WorldPagePresentationPanel.vue` -- inherited/overridden/none state label,
  "Use World Default"/"No Background" actions (replacing "Clear" for inheritance-supporting pages),
  the `ownBackgroundFileId` fix.
- `app/pages/worlds/[id]/admin.vue` -- one new Page Setup entry ("World Default").
- `app/layouts/world-workspace.vue` -- Show Background state/toggle/escape/reset; explicit
  `useFetch` generic.
- `app/components/world/WorldWorkspaceSidebar.vue` -- `.eldra-nav-scroll` class + scoped scrollbar
  styling.
- `app/lib/eldra/world-show-background.ts` (new, pure, tested).
- `scripts/directus/alter-world-page-presentations-background-source.mjs` (new),
  `scripts/directus/bootstrap.mjs`, `package.json` (new script entry).
- `tests/server/utils/world-page-presentation.test.ts`, `tests/lib/eldra/world-show-background.test.ts`
  (new).

## 7. Status

Implemented, unit-tested, typecheck/build/diff-check clean, per §5.1. **Real-browser acceptance is
explicitly unverified, per §5.2** -- stopped for review per this task's own instruction. Not
committed, not pushed, no deployment or production access. Unrelated dirty/untracked work and the
pre-existing stash are untouched. **Superseded by §8 below** for the follow-up bounded
deployment/compatibility check, which found and fixed one real bug in this pass's own code.

## 8. Follow-up: bounded deployment/compatibility check

### 8.1 UI path for the World-default background

Game Admin (`/worlds/:id/admin`) → **Page Setup** rail section → the **World Default** entry (new
this pass, first in `pageSetupSections`) → the SAME `WorldPagePresentationPanel` every other Page
Setup entry uses, pointed at `page-key="world-default"`. Clicking its preview square opens the SAME
`WorldMediaPicker` (the shared Media Gallery overlay) every other page's background picker uses --
no new picker, no new preview control.

Confirmed server-side, by re-reading `[pageKey].post.ts` directly (unchanged by this pass, since
`page_key: 'world-default'` is just another row in the same collection):

- **`world.settings.edit`**: `requireCapability(principal, 'world.settings.edit', { kind: 'world',
  worldId })`, same line, same capability, every page key including `'world-default'`.
- **World-ownership**: `fileBelongsToWorld(fileCheck.data.world_id, worldId)` against the picked
  file's own `world_id`, 403s on a cross-World id, same line, every page key.
- **Image-type validation -- precisely where it actually happens, not where this report could have
  overclaimed it**: NOT in `[pageKey].post.ts` itself, which only checks existence + ownership, no
  `type` field requested. It is enforced one layer up, at the only two places a `backgroundFileId`
  can ever originate from: `media.get.ts` (the Gallery listing WorldMediaPicker reads) filters
  `type: { _starts_with: 'image/' }`, and `media/upload.post.ts` rejects anything whose
  `mimeType` doesn't start with `image/` before it ever reaches the Gallery. This is pre-existing,
  identical for every other page key, and unchanged by this pass -- stated precisely rather than
  implied as a save-time re-check that does not exist.

### 8.2 Legacy rows with `background_source = NULL`

Six new/extended tests in `tests/server/utils/world-page-presentation.test.ts`
(`describe('legacy rows: background_source is literally null ...')` and the clarification block
right after it) cover each bullet directly against a row object with `background_source: null` --
not merely absent from the object, which the earlier tests already covered separately:

- **Existing explicit page images remain unchanged.** A row with `background_file_id` set and
  `background_source: null` still resolves `'override'` -- `resolveBackgroundSource` checks the file
  id FIRST and never looks at the stored source once it's found one.
- **Pages without an image inherit as intended -- but precisely which "without an image" case.**
  Only a page with NO ROW AT ALL inherits. A row that DOES exist with `background_file_id: null,
  background_source: null` (the pre-existing "Clear" state) resolves `'none'`, not `'inherit'` --
  tested side by side in the same `it` block so the distinction can't be missed.
- **"Use World default" and "No background" remain distinct.** Same `worldDefault`, two rows
  differing only in `background_source` ('inherit' vs 'none'), asserted to resolve to different
  `backgroundFileId`/`backgroundSource` values.
- **Updating presentation mode preserves the background source.** Two-part guarantee: the WRITE
  side (`resolveWriteBackgroundSource(undefined, null)` returns `null` for a mode-only save, so
  the column is never touched) and the READ side (resolving the same row before/after a simulated
  mode-only change, with only `presentation_mode` edited, gives the identical `backgroundSource`).
- **Existing fallback backgrounds remain intact.** The pre-existing `character-sheet` → `characters`
  read-only fallback (§2.4, predates this pass) is simulated directly through
  `resolvePagePresentation('character-sheet', <substituted row>, null)`: a fallback row with an
  image still resolves `'override'`; one without still resolves `'none'`, never swept into
  inheriting (character-sheet is a specialized, excluded surface).

**Was explicit-none newly introduced, or already supported?** Precisely: the OUTCOME was already
supported -- "no `background_file_id`" has always meant "show nothing," and the pre-existing
"Clear" action already reached exactly that state. What's new is that `'none'` now exists as a
named, STORED value distinguishable from something else -- which is only meaningful because
`'inherit'` is new. Before this pass there was nothing to distinguish "none" from, so there is no
yes/no answer to "was none already supported" as a STATE; a new test
(`describe('explicit "none" was not a pre-existing named state -- only its outcome was')`) proves
this directly: a pre-feature row with no `background_source` key at all produces an IDENTICAL
resolved result (via `toEqual`) to one with `background_source: 'none'` written explicitly.

### 8.3 Show Background's Restore control and Teleport-rendered panels

**Restore control placement -- confirmed by re-reading the template, not re-asserted from memory.**
In `world-workspace.vue`, the Show Background/Restore Content `<button>` (line ~540,
`data-show-background-toggle`) is a SIBLING that precedes the `<div class="min-w-0 overflow-hidden
relative">` wrapper carrying `:inert="showBackgroundActive"` -- it is not a descendant of that
wrapper, so `inert` (which only affects its own subtree) never reaches it. It keeps its normal DOM
tab order and `fixed` position regardless of `showBackgroundActive`, so it stays keyboard-reachable
and clickable the entire time Show Background is active -- this is what makes it the "always
-reachable" control, not merely a visual claim.

**Teleport gap found and fixed -- one specific component, not a broader audit.** `inert` only
affects the DOM subtree of the element it's applied to; a `<Teleport to="body">` moves its content
OUTSIDE that subtree entirely, so content Show Background is supposed to hide could otherwise remain
fully interactive. Checked every `<Teleport>` reachable from a page Show Background actually offers
the toggle on (`character-sheet` and the Map are already excluded, so their own Teleports --
`CharacterPortrait.vue`, `MapImageOverlayEditor.vue` -- are moot):

- **`WorldEntityContextDrawer.vue`'s own image lightbox** (`<Teleport to="body">`, its internal
  full-screen portrait viewer) is reachable from `locations`, `species`/`classes`/etc. catalogue
  pages, `characters`, `timelines`, and `entity-article` -- all backdrop-capable, inheritance
  -supporting page keys. This drawer's own MAIN panel is a plain DOM descendant of the page (verified
  by tracing its mount site in `entities/[entityId]/index.vue`), correctly covered by the slot
  wrapper's `inert` already; only this one internal lightbox escapes it.
  **Fixed**: the component now reads the SAME shared `useState<boolean>('world-show-background-
  active', ...)` directly (no prop drilling -- the established cross-component convention this
  workspace already uses everywhere) and applies the identical `inert`/opacity/`aria-hidden`
  treatment to its own Teleported root. A no-op wherever this component is used on a page that never
  offers the toggle (e.g. the Character Sheet itself uses a different drawer entry point that is
  excluded already).
- **`WorldMediaPicker.vue`'s** own Teleport was left untouched -- it is an active-editing surface
  (Build mode / Game Admin picking a background), not an "associated context/secondary content
  panel" a browsing viewer encounters, and is already its own modal-like overlay with its own
  Escape/focus handling; folding it in would be exactly the "broader redesign" this follow-up's own
  instruction excludes. Not an identified gap, noted for completeness only.

### 8.4 Migration: exact path, commands, deployment order, and precisely what fails before it

**Script**: [scripts/directus/alter-world-page-presentations-background-source.mjs](../../../scripts/directus/alter-world-page-presentations-background-source.mjs)

**Provisioning command** (idempotent -- safe to run more than once, matching every other
`alter-*`/`create-*` script's own convention):

```
node scripts/directus/alter-world-page-presentations-background-source.mjs
# or, via package.json:
pnpm run directus:alter-world-page-presentations-background-source
# or, as part of the full bootstrap sequence (also idempotent, runs every schema script in order):
pnpm run directus:bootstrap
```

**Verification** (re-run the same script; its own log distinguishes "already provisioned" from a
backfill it still had to do):

```
node scripts/directus/alter-world-page-presentations-background-source.mjs
```

A second run prints `Field exists: world_page_presentations.background_source` (from
`provisionCollection`'s own idempotency log) and finds zero rows left needing backfill --
confirming the column exists and every existing row already carries an explicit
`'override'`/`'none'` value, not relying on a human to inspect Directus Studio directly.

**Deployment order -- overrides CLAUDE.md's general "deploy app, then migrate" checklist for this
one column**: run this script BEFORE this pass's code is live in production, or at minimum before
real users can reach the two new buttons. Not run against any live instance by this pass -- no
credential for the confirmed-disposable instance was available; the owner runs it as part of the
normal deployment checklist.

**Precisely which saves fail before migration, and which do not** (re-verified against the actual
current code, not restated from the first pass's draft -- which contained one inaccuracy, corrected
in §8.5 below):

| Action | Sends `backgroundSource` in the save body? | Fails before migration? |
|---|---|---|
| Mode buttons (Immersive/Muted/Neutral) | No | **No** -- unaffected |
| Picking an image from the Gallery | No (inferred from the file id; `resolveWriteBackgroundSource` returns `null` whenever a file id is present) | **No** -- unaffected |
| Legacy "Clear" (Character Sheet, World Default pages only) | No, as of the fix in §8.5 | **No** -- unaffected |
| **"Use World Default"** (new) | Yes, `'inherit'` | **Yes** -- Directus rejects the write (unknown field), the panel surfaces the Directus error, the row is left unchanged |
| **"No Background"** (new) | Yes, `'none'` | **Yes** -- same failure mode |

Every read (every page load, including the backdrop itself) is unaffected regardless of migration
status, per §2.6's `fields=*` wildcard.

### 8.5 Bug found and fixed during this check: "Clear" was not actually migration-safe

The first pass's own §2.6/§6 claimed the legacy "Clear" action "never touches this column at all."
Re-reading the actual code for this check found that claim was **false**: `clearBackground()` called
`savePresentation(currentMode.value, null, 'none')` -- passing an explicit `'none'` third argument,
which DOES get written to `background_source`. This would have made the PRE-EXISTING Clear button
(used on Character Sheet and World Default, the only two pages that still show it) newly fail before
the migration runs, which is both inaccurate documentation and a real, if narrow, regression risk
for existing functionality.

**Fixed**: `clearBackground()` now calls `savePresentation(currentMode.value, null)` with no third
argument, exactly matching every other pre-existing save path. This loses nothing: both
`resolvePagePresentation`'s World-default branch and its specialized-key forcing already ignore
whatever `background_source` a Character Sheet/World Default row has stored, so writing `'none'`
there was accomplishing nothing even after migration -- it was pure, unnecessary, migration-order
risk with zero behavioral benefit. §8.4's table above reflects the corrected behavior. Full suite
re-run after the fix: 6675 passed (up from 6669 for the six new/extended tests in §8.2); typecheck
unchanged (895 errors, the same pre-existing, unrelated baseline delta as the prior report);
`git diff --check` clean; production build re-run and completed cleanly.

### 8.6 Status

Implemented, re-verified, one real bug found in this pass's own prior code and fixed (§8.5), all
four bounded-check items answered precisely against the actual current code rather than restated
from the first draft. Browser acceptance remains pending for the same, unchanged reason (§5.2) --
not chased again this round, per explicit instruction. **Superseded by §9 below** for the final
save-time image-type validation correction. Stopped for review. Not committed, not pushed, no
deployment or production access. Unrelated dirty/untracked work and the pre-existing stash remain
untouched.

## 9. Final correction: save-time image-type validation

### 9.1 The gap

§8.1 already traced exactly where image-type validation happens: `media.get.ts`'s Gallery listing
filter and `media/upload.post.ts`'s own upload-time check. Both gate how a file normally REACHES the
picker -- neither one validates the presentation save route itself. A client (or a bug, or a direct
API call bypassing the picker) could submit an existing file id that belongs to this World but is
not an image -- e.g. a PDF or any other non-`image/*` upload -- and `[pageKey].post.ts`'s own
ownership check (`fileBelongsToWorld`) would have waved it straight through: it only ever requested
`id`/`world_id`, never `type`.

### 9.2 Fix: reused the existing lookup, added the missing check to it

No new Directus call. The SAME single `/files/:id` lookup `[pageKey].post.ts` already made for the
ownership check now also requests `type` (`fields[]=type` added to the existing `fields[]` list),
and the decision moved into one new pure function reusing the existing `fileBelongsToWorld`
comparison rather than duplicating it:

- `isSupportedImageType(type)` -- the identical `image/`-prefix rule already enforced upstream.
- `needsBackgroundFileLookup(backgroundFileId)` -- the existing `if (backgroundFileId)` gate, now
  named and exported so "no lookup when no new asset is submitted" is a directly testable fact, not
  just inline control flow. Mode-only saves, "Use World Default", "No Background", and the legacy
  "Clear" action all submit `backgroundFileId: null` and never enter this branch at all -- zero
  extra lookup, confirmed by the SAME gate that already made this true before this correction (the
  check was already conditional on `backgroundFileId` being truthy; this correction only adds what
  happens INSIDE that existing gate).
- `validateBackgroundFile(file, worldId)` -- ownership checked first (403, same message as before --
  a cross-World id is rejected without the response ever depending on that file's type), then type
  (400, new). Returns a plain `{ ok, statusCode?, statusMessage? }` the route throws verbatim,
  so the route and the tested function can never drift from each other.

The route's existing-row lookup and save/persist logic are UNCHANGED and still run strictly after
this check, so a non-image submission is rejected before anything is written -- exactly like the
pre-existing ownership rejection already was.

### 9.3 Explicitly preserved, by construction

- **Legacy reads**: this is a write-path-only change; `[pageKey].get.ts` and every
  `resolvePagePresentation`/`resolveBackgroundSource` read path are untouched.
- **Inherit/none semantics**: `needsBackgroundFileLookup` is false whenever `backgroundFileId` is
  null, which is true for every inherit/none save -- this validation never runs for them, let alone
  changes what they write.
- **Mode-only saves**: same reasoning -- `ownBackgroundFileId` is null unless the page's own source
  is already `'override'`, so a mode-only save either re-validates the SAME file it already had
  (harmless, idempotent) or, for inherit/none pages, never reaches the lookup at all.
- **Clear**: still submits `backgroundFileId: null` (per §8.5's fix) -- never reaches this block.

### 9.4 Tests added

`tests/server/utils/world-page-presentation.test.ts`, three new `describe` blocks, naming the exact
four scenarios asked for:

- `isSupportedImageType` -- accepts `image/*`, rejects a non-image type, rejects
  null/undefined/non-string.
- `needsBackgroundFileLookup` -- false for null/empty (no new asset), true for an actual id.
- `validateBackgroundFile`:
  - **Same-World image accepted** -- `{ id, world_id: 42, type: 'image/png' }` against world `42`
    → `{ ok: true }`.
  - **Same-World non-image rejected before persistence** -- same World id, `type: 'application/pdf'`
    → `{ ok: false, statusCode: 400, ... }` (the route throws this before ever reaching the
    existing-row/save logic, per §9.2).
  - **Cross-World image remains rejected** -- `world_id: 43` against world `42`, even with
    `type: 'image/png'` → `{ ok: false, statusCode: 403, ... }` -- ownership still wins first,
    unchanged from before this correction.
  - A same-World non-image lookup is covered by the gate functions above and by `[pageKey].post.ts`
    itself only ever calling `validateBackgroundFile` inside the `needsBackgroundFileLookup` branch
    -- confirmed by reading the route's current code, not re-asserted from the prior draft.

Full suite re-run: 6685 passed (up from 6675). Typecheck: 895 errors, same pre-existing baseline
delta as every prior report in this document -- zero new errors, confirmed by the same
baseline-restore comparison methodology used throughout this document's own verification history.
`git diff --check` clean. Production build re-run and completed cleanly.

### 9.5 Status

Implemented, tested, typecheck/build/diff-check clean. Committed (see commit hash in the final
report delivered alongside this update). Browser acceptance remains pending, unchanged from §5.2 --
not chased this round either, per explicit instruction. No production provisioning run; the
migration documented in §8.4 remains the owner's to execute.
