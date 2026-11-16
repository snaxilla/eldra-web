# Direct Content Editing — architecture, guarantees, and handoff

**Status: implemented, verified against the disposable instance AND a real headless-browser pass,
NOT committed/deployed.** This documents the ELDRA Direct Content Editing consolidation pass: "Items
→ Shortsword → Edit → change picture/description → Save" with no manual workspace/import/binding
ceremony, built on top of the Content Workspaces & Studio Pass A/B work
(`content-workspaces-and-studio.md`, `content-workspaces-pass-b-handoff.md` — read both first;
nothing here repeats their own content).

**Correction to this document's own earlier claims — TWICE now.** An earlier revision stated "every
required scenario was covered" and that "Customize for this World" was "explicitly NOT implemented."
Both were wrong, found during a first pre-commit boundary review: browser verification had never
actually been attempted; a real authorization gap existed in the Studio entity routes' World-scoped
escalation check; "Customize for this World" is now implemented. A SECOND review then found that
first review's OWN authorization fix was *still* wrong — it escalated World-scoped shared-write
access to `world.content.bind_workspace`, which is NOT shared-content edit authority (see
"Boundary review findings, round two" below). That is now corrected, with `world.content.bind_workspace`
removed from the write path entirely. The same second review also found the slug/entityType-based
selection-recovery fix from the first review was itself an identity-resolution heuristic the brief
explicitly disallows (two unrelated packages can coincidentally share a slug+entityType), and replaced
it with canonical-`contentEntityId`-based selection returned directly by the save/split workflow. See
"Boundary review findings" and "Boundary review findings, round two" below, and the acceptance matrix,
for the corrected, evidenced record.

## Ongoing acceptance standard

> A first-time host must eventually be able to install Eldra, create a World and Game, add content,
> and invite players using minimal complete instructions. Admins are users. Everyday content editing
> must not require knowledge of package IDs, release versions, imports, workspace bindings, or
> internal storage.

This is a standing product requirement, not a one-time task. Every future change to content
authoring/import/workspace machinery should be evaluated against it: does an ordinary admin still
need to understand internals to do the common thing?

## Before / after

**Before:** editing Shortsword's picture meant: open Content Studio, manually enter a package
ID/version, run a whole-release import (even to touch one item), create or pick a workspace by hand,
manually bind it live to the World, THEN find and open the entity in a save-on-blur editor with no
undo/conflict story.

**After:** Items → select Shortsword → **Edit** → change the description/image in one draft → **Save
changes**. The local workspace, the exact-entity import, and the live binding all happen automatically,
only on that first Save — never on merely opening or cancelling. The item appears updated in that
World immediately, with no duplicate row and no second import/bind step, ever, on repeat edits.

## The one application workflow

`server/utils/content-entity-direct-edit.ts` is the SINGLE server-side workflow behind both entry
points (the new "Edit" action and, where it reaches an already-customized entity, Content Studio's
existing editor) — no second orchestration sequence was written.

- `resolveDirectEditTarget(worldId, entityType, slug)` — a PURE READ. Resolves the current effective
  entity (reusing `resolveEffectiveContent`, Pass B's own resolver) and reports one of:
  `resolver-disabled`, `not-found`, `existing-workspace` (already a workspace-sourced winner —
  `scope: 'local'` if bound only to this World, `'shared'` with a count otherwise), or
  `needs-preparation` (still a pinned/channel winner — carries its presentation/mechanics for preview,
  nothing created). **Called on every "Edit" open; creates, imports, and binds nothing.**
- `prepareWorldLocalWorkspace(worldId, actorAccountId, systemKey)` — finds, or creates, the ONE
  workspace a World's own ordinary edits live in, keyed deterministically
  (`worldLocalWorkspaceKey`: `world-<id>-local-edits`) off the ALREADY-unique `workspace_key` column —
  **no new schema**. Idempotent: a concurrent first-edit race re-reads the row `createContentWorkspace`
  reports as already taken, rather than erroring or creating a second workspace.
- `customizeEntityForWorld(input, systemKey)` — called ONLY when there are edits to apply. Re-resolves
  the target itself (never trusts a client-supplied packageId/version), then: reuses an
  already-customized entity's own workspace unchanged, OR imports **exactly the one entity** (a new
  `{kind:'entity', packageId, version, entityType, slug}` import source —
  `app/lib/content-workspaces/validation.ts`, `content-workspace-import.ts` — filtering a release's
  own candidates down to one BEFORE anything else runs, reusing the SAME write/snapshot/retry path a
  whole-release import already has) and live-binds that workspace — then applies the presentation
  edits through the EXISTING atomic save path (`applyPresentationEdits`,
  `content-workspace-entity-atomic.ts`'s real Postgres transactions, unchanged from Pass B).

No second homebrew item type, no second persistence system, no second import mechanism — every
primitive above is Pass A/B's own, reused.

## Entry points, both reaching the same workflow

- **`WorldEntityInteractivePage.vue`** (Items and every other category this shared component serves):
  a new "Edit" button in the context rail, gated on `presentationKindForEntityType(entityType)` being
  non-null — i.e. species/class/background/spell/item/featureOption. Opens
  **`WorldEntityDirectEditDialog.vue`** (new), which calls the edit-target resolver, shows a
  first-save draft for `needs-preparation`, and — once a real workspace/entity exists (either already,
  or right after the first successful Save) — renders the SAME `StudioEntityEditor.vue` Content Studio
  uses. Current selection/search in the category page is untouched throughout; a successful save just
  calls the existing `refresh()` on the category list so the row updates in place.
- **Content Studio** (`AdminContentStudioPanel.vue` → `StudioCustomizeInWorkspaceDialog.vue`):
  unchanged in this pass — still the whole-release import + exact-address lookup flow from the Pass B
  review follow-up. Left as the "advanced" path, per this task's own instruction to keep advanced
  workspace management available there.

**Explicitly unsupported categories, reported rather than guessed at:** location, character/npc, feat,
enemy/monster, subclass — `presentationKindForEntityType` returns `null` for these (the same closed
set the gameplay catalogue's own presentation resolution already uses), so no "Edit" button appears.
Extending them is a separate, scoped follow-up (see Consolidation §9 below), not silently attempted.

## Default scope, and the shared-workspace choice

Per-edit, the default (and ONLY currently-implemented) scope is **"Changes apply to this World"** —
shown as a standing banner on the first-save draft. This is real, not a label: the entity lands in a
workspace bound ONLY to this World (`worldLocalWorkspaceKey`), never a shared one, unless the
EFFECTIVE winner was ALREADY in a shared workspace before this edit even started.

When `resolveDirectEditTarget` reports `scope: 'shared'` (the effective winner is already a
workspace entity bound to other Worlds too), `WorldEntityDirectEditDialog.vue` surfaces a real,
explicit choice between two distinct paths, each requiring its own authority:

- **"Customize for this World"** (`splitSharedEntityToLocalWorkspace`,
  `server/utils/content-entity-direct-edit.ts`; route: `POST
  .../entities/[entityType]/[slug]/split-local`) — gated on ordinary `world.entity.edit` ONLY, never
  touches the shared workspace. Reads the shared entity's `baseSourceRef` (`packageId`/`version`),
  imports that exact entity into this World's OWN local workspace
  (`prepareWorldLocalWorkspace`/the same `{kind:'entity'}` import primitive described above), binds it
  live to this World, then seeds the new local entity's `authoredPresentation` from the shared
  entity's CURRENT authored overrides (so "customize" starts from what you see today, not the
  original pristine release). `comparePrecedence`'s existing binding-recency tiebreak (unchanged, no
  new precedence rule) then makes this World's effective winner the new local copy; the shared
  workspace's own binding to this World is left in place deliberately, not auto-unbound. **Proven:**
  the OTHER World sharing that workspace keeps resolving to the original shared entity, unchanged —
  see the unit test (`splitSharedEntityToLocalWorkspace`'s success test now explicitly asserts the
  shared workspace/entity ids are NEVER passed to any write primitive) and the identity-collision
  disposable proof below.
- **"Edit the shared collection directly"** — requires REAL platform `platform.contentworkspace.edit`
  authority, and is a live change for every World that workspace is bound to; the dialog states this
  impact before the caller commits to it, without disclosing which OTHER Worlds are bound (only the
  count), consistent with "never leak inaccessible World information." **Corrected by the second
  boundary review**: this previously said `world.content.bind_workspace` (owner/gm) was sufficient —
  it is not (see Permissions below for why). The dialog still offers this choice to any World
  owner/gm, since the server is the real gate and a World-only caller who tries it gets a clear 403
  rather than a silently-downgraded result; whether to also hide the button client-side for a caller
  who's known not to hold platform authority is a follow-up UX refinement, not attempted here
  (out of this pass's bounded scope — the dialog has no way to know the caller's platform
  capabilities today without a new fetch, which would be scope creep for this correctness-only pass).

Neither path is silently chosen on the caller's behalf, and neither silently escalates without the
capability it actually requires.

## Identity, inheritance, precedence — what's actually guaranteed

- **Canonical identity preserved, never matched by name.** The exact-entity import reuses
  `content-workspace-import.ts`'s existing identity machinery verbatim (content-addressed snapshot
  keys, `baseRefs`/`baseSourceRef` carried through unchanged) — the SAME guarantee a whole-release
  import already has, just applied to a one-candidate list.
- **Replaces, never duplicates.** `resolveDirectEditTarget` always re-resolves the EFFECTIVE winner
  before any write; a second "Edit → Save" on the same entity (this session, or a fresh session) finds
  `existing-workspace`/`scope: 'local'` and reuses that exact entity — proven by the real disposable
  run's own repeat-save check (§ below): one workspace, one entity, no matter how many times Save ran.
- **Precedence is Pass B's own, unchanged.** A workspace-sourced winner (local OR shared) always
  outranks the pinned/channel release it was imported from (`comparePrecedence`,
  `app/lib/content-resolution/precedence.ts`) — this pass introduces no new precedence rule.
- **Legacy references keep resolving.** An existing character's stored inventory/spell/feat reference,
  still naming the ORIGINAL pinned `(packageId, slug)`, redirects to the new local-workspace winner via
  the SAME `legacyAliases` mechanism Pass B's own resolver already provides — proven directly (§
  below), with quantity/equipped/attuned/notes read back byte-identical.
- **The published release is never touched.** No release version is ever created or modified by this
  workflow; only `content_workspace_entities`/`content_entity_revisions`/`world_content_pack_bindings`
  rows are written.
- **Character inventory state is never rewritten.** Nothing in this workflow performs a write against
  `block_instances`/`entities` for a character; the real disposable run creates a character fixture
  and asserts its stored row is byte-identical after the direct edit.

### Identity-safe selection after Save — corrected by the second boundary review

A client-side category list row's `id` embeds its backing packageId
(`catalogue:<packageId>:<slug>` — `catalogue-entity-bridge.ts`'s own `catalogueTemplateId`), which
LEGITIMATELY changes the moment an entity is customized: the effective winner moves to a new
workspace package. The FIRST boundary review's fix for the resulting "selection silently
disappears after Save" bug re-matched the just-edited row by `slug`+`entityType` against the
previous list. **The SECOND boundary review found this is not identity evidence**: two UNRELATED
published packages can coincidentally share a slug+entityType pair as two entirely separate
effective entities in the same World's catalogue (`world-effective-content.ts`'s own
`evidenceKeys`/`groupByEvidence` only merges candidates that share REAL provenance — a shared
`contentEntityId`, `baseRefs`, `curatedFrom`, `slugAliases`, or lineage supersession — never a
coincidental slug match). Matching on slug+entityType alone could therefore select the WRONG
package's entry.

**Corrected**: `WorldEntityInteractivePage.vue`'s `watch(filteredEntities, ...)` no longer attempts
to re-match a vanished selection at all — it only ever clears it. Re-selection after a save is
instead driven by the save/split workflow's own authoritative response: `customizeEntityForWorld`
and `splitSharedEntityToLocalWorkspace` already return `contentEntityId` (the canonical
`content_workspace_entities` row id); `WorldEntityDirectEditDialog.vue`'s `saved` event now carries
it (`emit('saved', contentEntityId)` from every save/split call site, including the
`activation-failed` recovery path and `StudioEntityEditor.vue`'s own `@saved` payload), and
`onDirectEditSaved(contentEntityId)` in `WorldEntityInteractivePage.vue` matches the refreshed list
by `entity.contentEntityId === contentEntityId` (after an `await nextTick()`, so it runs after the
watcher's own clear) — never by title, slug, or entity type. No new identity-resolution heuristic
was introduced; this reuses the one identity the save workflow already authoritatively produces.

**Proven** by a real disposable data-layer script (not mocked, not browser) exercising the exact
required regression: two genuinely unrelated published packages (different packageId, provider,
externalId, sourceBook — no shared evidence key) both publish an item with the SAME slug and entity
type, bound to one World. 16/16 checks: both rows exist as separate, distinct effective entities
before any edit; customizing one via `customizeEntityForWorld` leaves the OTHER package's row
completely untouched (no `contentEntityId`, own original title, not customized); the save's own
returned `contentEntityId` matches EXACTLY the customized package's row in the refreshed catalogue,
never the other package's; the client-style `contentEntityId` match (the same lookup
`onDirectEditSaved` performs) selects the correct row every time. Re-verified in a real headless
browser afterward (Playwright + Chromium against the disposable instance): Save → immediate card/rail
refresh with selection retained → Close → reopening Edit a second time shows the just-saved
description, confirming the production (non-collision) path this fix also touches was not regressed.

## Atomic vs. recoverable — traced, not assumed

| Step | Guarantee |
| --- | --- |
| Presentation field save (`applyPresentationEdits`) | **Genuinely atomic** — one Postgres transaction (Pass B's `content-workspace-entity-atomic.ts`), real compare-and-set on `expectedRevision`, paired history row, workspace-revision bump, all commit or roll back together. |
| Workspace lookup-or-create (`prepareWorldLocalWorkspace`) | **Not a cross-step transaction, but idempotent and safe to retry.** A concurrent create race is resolved by `workspace_key`'s own database UNIQUE constraint; the loser re-reads the winner's row. No cross-service transaction is claimed anywhere in this pass. |
| Entity import (`importIntoWorkspace` with the `entity` source) | **Not atomic with the steps around it, but retry-safe by construction** — content-addressed snapshot keys make a re-run a no-op for anything already written (Pass B's own existing guarantee, reused unchanged); the cache-witness revision touch is unconditional (Pass B review follow-up fix), so a retry after a partial failure repairs a stale witness rather than compounding it. |
| Live-bind (`bindWorkspaceLiveToWorld` → `saveWorkspaceBinding`) | **Idempotent** — checks for an existing binding row first; re-running never creates a second one. **Now the LAST step** (see below), not the first. |
| The WHOLE `customizeEntityForWorld` call, end to end | **NOT one transaction**, and the step ORDER matters: `prepare → import → save → activate (bind) last`. An earlier revision of this workflow bound the workspace live BEFORE saving the edit (`prepare → import → bind → save`), which meant a freshly-imported-but-not-yet-edited entity could briefly go live for the World with no actual edit applied. Reordered during the boundary review so a bind only ever happens after the edit it's for has durably saved. A failure during activation now reports its own distinct stage, `activation-failed` (save succeeded, bind did not — the caller is told the edit is saved but not yet live, never told the edit was lost), separate from `import-failed`. A crash before save leaves a durably-imported-but-unedited entity behind, exactly as before; a retry re-resolves the target, finds the entity already imported, and completes whatever didn't finish. **Proven directly** by a real disposable failure-injection run exercising all four of the brief's required failure points (workspace-prep-succeeds/import-fails; import-succeeds/atomic-save-fails; save-succeeds/activation-fails; concurrent first-saves for the same World/entity) plus retry-after-each-failure and an unchanged-Save no-op check — **27/27 checks passed**, using a genuinely fresh Node subprocess per failure-injection step (a shared-process `pg.Pool` cache otherwise masks an unset DB-URL env var within the same process). |

## Permissions

- **`world.entity.edit`** (an EXISTING World capability — owner/gm/worldbuilder, per
  `WORLD_ROLE_CAPABILITIES`) gates both new routes (`GET .../edit-target`, `POST .../customize`) and
  the automatic local-workspace prepare/import/bind this pass performs. Deliberately NOT the
  platform-scoped `platform.contentworkspace.edit` Content Studio's own routes require — equating
  "owns this World" with "holds platform workspace authority" is exactly what this architecture
  warns against, and requiring platform capability would have defeated the entire point of
  democratizing everyday editing to ordinary World admins.
- **Escalation for an already-SHARED workspace.** Editing a workspace already bound to other Worlds
  additionally requires `world.content.bind_workspace` (owner/gm only) — checked explicitly at the
  route before the workflow runs, never silently downgraded or upgraded.
- **The shared editor itself (`StudioEntityEditor.vue`) is now reachable by two audiences.** Its own
  five backing routes (`GET`/`PATCH`/both revert `DELETE`s/`POST checkpoints`) now accept EITHER the
  existing platform capability (Content Studio, unchanged) OR a caller holding `world.entity.edit` for
  a `worldId` it supplies — but ONLY when that exact `worldId` is verified, server-side, to be among
  the Worlds the target workspace is ACTUALLY live-bound to right now
  (`requireWorkspaceEntityAccess`, `content-workspace-http.ts`, `listWorldsBoundToWorkspace`). A
  worldbuilder in one World cannot use their own capability to reach a workspace bound only to a
  different World.
- **Fixed during the FIRST boundary review: a real World-scoped write-escalation gap.**
  `requireWorkspaceEntityAccess` originally granted World-scoped access to all five Studio entity
  routes whenever the claimed World was simply bound to the workspace — with NO check for whether
  that workspace was ALSO shared with other Worlds. A caller holding `world.entity.edit` in World A
  only could therefore PATCH/revert/checkpoint a workspace shared between World A and World B
  directly through the Studio routes, bypassing the narrower escalation check that previously existed
  ONLY in `customize.post.ts` — the two call sites had silently diverged. First fixed with a `mode:
  'read' | 'write'` parameter: read-only access still only requires the World to be bound; any write
  additionally required `world.content.bind_workspace` once shared.
- **Corrected by a SECOND boundary review: `world.content.bind_workspace` is not shared-content edit
  authority, and must never substitute for it.** The first fix's escalation target was itself wrong.
  `world.content.bind_workspace` authorizes *attaching/detaching* a workspace from a World — it says
  nothing about authority to change content other Worlds currently rely on. A caller holding every
  single World capability there is on World A, including that one, still has no platform workspace-edit
  authority and must not be able to mutate a workspace shared with World B. Corrected: `mode: 'write'`
  on a SHARED workspace now requires `platformCapability` (`platform.contentworkspace.edit`/`.view`)
  and NOTHING ELSE — no World-scoped capability of any kind substitutes for it once a workspace is
  shared. `mode: 'write'` on a workspace bound to EXACTLY one World still only requires
  `world.entity.edit`, unchanged (the ordinary, non-shared direct-edit case this whole feature exists
  for). A World-only editor who needs to change a SHARED entity now has exactly one path: "Customize
  for this World" (`splitSharedEntityToLocalWorkspace`), which writes only to a brand-new workspace
  bound solely to their own World and never touches the shared one. `customize.post.ts` calls the SAME
  `requireWorkspaceEntityAccess` for its own write, so this correction applies to both entry points at
  once, not just the Studio routes. **Also fixed in the same pass**: a UI bug in
  `WorldEntityDirectEditDialog.vue` where `resolvedWorkspaceId`/`resolvedContentEntityId` were set
  immediately for ANY already-customized target, shared or not — which made the `v-else-if` chain
  match the `StudioEntityEditor` branch before the "Customize for this World / Edit the shared
  collection" choice was ever checked, so that choice was UNREACHABLE and a World-only caller would
  land straight in an editor whose Save/revert/checkpoint calls the server correctly refused, with no
  explanation why. Now deferred until the target resolves as `scope: 'local'`, or until the caller
  explicitly picks "Edit the shared collection."
  **Proven** by the regression the brief required directly: a caller holding EVERY World capability in
  World A (`world.entity.edit`, `world.content.bind_workspace`, all of it), with NO platform
  capability, is refused on every one of the 5 affected routes (both `content-workspace-entity-routes.test.ts`
  and `entity-direct-edit-routes.test.ts`), can still complete "Customize for this World" successfully,
  and a genuinely platform-authorized editor can still explicitly PATCH/revert/checkpoint the shared
  Studio entity directly (`content-workspace-entity-routes.test.ts`'s own
  "platform-authorized shared editing remains fully supported" test, unaffected by any of this).
  `content-workspace-entity-routes.test.ts`: 45/45 passing (its sharing-boundary describe block now
  13 tests, up from the first review's 12 — the old "succeeds with bind_workspace" test is now
  "still refused with bind_workspace," plus the new "refused with EVERY World capability" regression).
  `entity-direct-edit-routes.test.ts`: 19/19 passing (the old "succeeds with bind_workspace" test for
  `customize.post.ts` is likewise now "still refused," plus the same every-capability regression).
- **Unaffected, confirmed by reading, not changed:** player Media Gallery enumeration stays denied;
  portrait upload authorization is untouched; `ELDRA_EFFECTIVE_CONTENT` was not enabled, disabled, or
  otherwise reconfigured in any real environment by this pass — only read (`isEffectiveContentEnabled`)
  and relied upon in the disposable instance for verification.
- **Feature-disabled behavior.** When `ELDRA_EFFECTIVE_CONTENT` is off, `resolveDirectEditTarget`
  reports `resolver-disabled` before touching anything else; both the edit-target route and the
  dialog surface this as a plain-language "Direct editing is not set up for this World yet" message —
  no environment-variable name, no technical jargon, and no binding is attempted while the resolver
  cannot honor it.

## Files changed

New: `server/utils/content-entity-direct-edit.ts` (now also `splitSharedEntityToLocalWorkspace`),
`server/utils/entity-collection-summary.ts` (moved out of `entities.get.ts`, now shared),
`server/api/worlds/[id]/entities/[entityType]/[slug]/edit-target.get.ts`, `.../customize.post.ts`,
`.../split-local.post.ts` (new this review pass — "Customize for this World"),
`app/components/world/WorldEntityDirectEditDialog.vue`,
`tests/server/utils/content-entity-direct-edit.test.ts`, `tests/server/api/worlds/entity-direct-edit-routes.test.ts`,
`tests/server/utils/entity-collection-summary.test.ts`.

Modified: `app/lib/content-workspaces/validation.ts` (new `{kind:'entity'}` import source),
`server/utils/content-workspace-import.ts` (handles it, reusing the release-load path),
`server/utils/world-content-packs.ts` (`listWorldsBoundToWorkspace`, new),
`server/utils/content-workspaces.ts` (`getContentWorkspaceByKey`, new),
`server/utils/catalogue-entity-bridge.ts` (`customized`/`packageId`/`contentEntityId` on
`CatalogueBridgeRow`), `server/api/worlds/[id]/entities.get.ts` (relays those three fields; extracted
`collectionSummary*` helpers out), `server/utils/content-workspace-http.ts`
(`requireWorkspaceEntityAccess`, now takes a `mode: 'read' | 'write'` parameter — the boundary-review
authorization fix above), the 5 Studio entity routes under
`server/api/content/workspaces/[workspaceId]/entities/[contentEntityId]/**` (dual-auth with the
correct `mode` per route, `worldId` threaded through, mechanics `metaLines` added to the GET
response), `server/utils/content-workspace-presentation.ts` (`rawPayloadOf` exported for the
mechanics preview), `app/components/admin/studio/StudioEntityEditor.vue` (full draft/Save/Cancel
rewrite, mechanics preview, `saved` event; this review pass additionally added a `compact` prop —
see "Narrow-rail layout defect" below), `app/components/world/WorldEntityInteractivePage.vue` (Edit
button, provenance label fix, dialog mount; this review pass additionally fixed a selection-loss bug
in the post-refresh selection-matching watcher — see "Selection-loss after Save" below).

**Additionally changed in the pre-commit boundary review pass** (on top of everything above):
`server/api/worlds/[id]/entities/[entityType]/[slug]/customize.post.ts` (escalation check now
delegates to `requireWorkspaceEntityAccess(..., 'write')` instead of a separate duplicate check),
`app/components/world/WorldEntityDirectEditDialog.vue` (real "Customize for this World" /
"Edit the shared collection" choice, replacing placeholder text; `activation-failed` handling that
keeps the caller in the editor with a standing "not yet live" banner instead of treating a saved
edit as a failure).

## Verification actually performed

- **Unit (mocked), as of the SECOND boundary review:** `content-entity-direct-edit.test.ts` (20,
  incl. 5 for `splitSharedEntityToLocalWorkspace` — one of which now also asserts the shared
  workspace/entity are NEVER passed to any write primitive — and an ordering assertion proving
  save-before-activate), `entity-collection-summary.test.ts` (7), `entity-direct-edit-routes.test.ts`
  (19 — up from 18: the old "succeeds with `world.content.bind_workspace`" test is now "still refused
  with it," plus a new "refused even with EVERY World capability" regression), `content-workspace-entity-routes.test.ts`
  (45 — up from 41: same correction to its sharing-boundary describe block, now 13 tests). **Focused
  run across these three files: 84/84 passing.** Typecheck run once against the current tree:
  pre-existing failures only, all in files this pass never touched (`server/utils/homebrew/*.ts`,
  `import-save*.ts`, `players.ts`, `world-memberships.ts`, `world-rules-choice-options.ts`,
  `worlds.ts` — confirmed already failing on HEAD, unrelated). Lint, run once against the current
  tree: `content-workspace-http.ts`, `WorldEntityDirectEditDialog.vue`, and all three touched test
  files are clean (zero findings); `WorldEntityInteractivePage.vue` carries pre-existing
  `no-explicit-any` debt (confirmed 74 errors/7 warnings on HEAD before this feature's own work
  began — this round's fix actually REMOVED 2 of the previously-added `any` usages by deleting the
  slug-matching code, replacing them with 2 new ones in the `contentEntityId` lookup, net unchanged
  from the prior round, still the SAME pre-existing convention every other callback in this
  1700-line file already uses, not a scope-appropriate place to fix that debt). Production build:
  `pnpm build` exits 0, `Build complete!`. `git diff --check`: clean. Per this round's own
  instruction to avoid repeated full-suite runs without cause, the full 6279-test suite was NOT
  re-run in this round — the 84 focused tests above cover every file this round touched or could
  plausibly regress, and the previous round's full-suite pass (6279/6279) stands as the last broader
  confirmation; the user should request a final full run before any commit if that matters more than
  the time cost.
- **Real disposable end-to-end** (jiti + the repo's own runtime shim, against the disposable Directus
  11.12.0/Postgres 16 instance, real application modules, no mocks of this workflow's own logic):
  **20/20 "happy path" checks pass** (opening Edit creates nothing; cancelling creates nothing; the
  first Save imports exactly one entity and binds automatically; no duplicate logical item; a second
  Save reuses the same workspace/entity; a pinned second World is unaffected; legacy inventory
  references still resolve correctly; exactly one release ever existed for the run), PLUS a separate
  **27/27 failure-and-retry proof** added during the boundary review, exercising all four of the
  brief's required failure points directly (workspace-prep-succeeds/import-fails;
  import-succeeds/atomic-save-fails; save-succeeds/activation-fails; concurrent first-saves racing
  for the same World/entity), retry-after-each-failure, and an unchanged-Save no-op check — no
  duplicates, no false "live/saved" success, no unintended activation, and all recoverable work
  actually recovered on retry.
- **Real headless-browser verification — now actually performed** (Playwright-core + Chromium
  against the local Nuxt dev server and the same disposable Directus/Postgres instance, a real
  Eldra Account resolved from the disposable admin's own Directus identity, a real owned World, a
  real published fixture item). The earlier revision of this document stated this step was "not
  performed" and handed off a manual checklist instead; performing it for real found two genuine
  defects, both now fixed (see below) and re-verified by re-running the same script after each fix.
  See the acceptance matrix for the itemized PASS/FAIL record.

### Defects found by real browser verification, round one (both fixed that round)

1. **Selection-loss after a successful Save.** A catalogue-sourced entity's list/rail `id` embeds its
   backing packageId (`catalogue:<packageId>:<slug>`), which legitimately changes the moment a
   direct edit customizes the entity — the effective winner moves to the new World-local workspace
   package. `WorldEntityInteractivePage.vue`'s post-refresh `watch(filteredEntities, ...)` matched
   the selection by exact `id` only, so a successful Save made the selected row "disappear" (by its
   old id) and silently deselected it, bouncing the rail back to the page-level "nothing selected"
   panel even though the card's own content had refreshed correctly. **Fixed that round**: the
   watcher re-pointed selection to the row with the same `slug`/`entityType` before falling back to
   clearing it. **Superseded by the second boundary review** (see "Identity-safe selection after
   Save" above) — slug/entityType matching was itself found to be an unsafe identity heuristic and
   replaced with canonical-`contentEntityId` matching driven by the save workflow's own response.
2. **`StudioEntityEditor.vue`'s two-column layout breaks inside the World entity rail.** Its
   fields/live-preview layout is `lg:grid-cols-2` — a VIEWPORT breakpoint, correct for its two other,
   full-width callers (`StudioCustomizeInWorkspaceDialog.vue`, `AdminStudioWorkspacesPanel.vue`), but
   the World rail this pass newly embeds it in is only ~380px wide while the viewport itself is still
   well above the `lg` breakpoint — so the two columns tried to render side-by-side in a container far
   too narrow for either, producing severe visual overlap (the live-preview card sitting on top of
   the Description field, the entity title wrapping letter-by-letter because its flex sibling's fixed
   badge/button width left almost no room). Severe enough to make Cancel/Save unreliable to click
   (the overlapping "Mechanics" header intercepted pointer events in the automated run). **Fixed**:
   added a `compact` prop (default `false`, so both existing wide-canvas callers are completely
   unaffected) that forces a single-column layout and stacks the header's title/badge rows instead of
   placing them side-by-side; `WorldEntityDirectEditDialog.vue` passes `compact` on its own
   `<StudioEntityEditor>` usage only. Re-verified: clean single-column form, title on one line, no
   overlap, Save/Cancel both reliably clickable.

Both were real, pre-existing-in-this-session-but-never-exercised defects in the "second Save
onward" path specifically (the FIRST save of any entity uses `WorldEntityDirectEditDialog.vue`'s own
simpler first-save-draft form, which never hit either bug) — exactly the kind of thing the brief's
instruction ("lack of an existing component harness alone does not establish that browser testing is
impossible") was written to catch.

### Acceptance matrix (current — reflects the SECOND boundary review's corrections)

| Requirement | Status | Evidence |
| --- | --- | --- |
| World entity-edit permission cannot authorize arbitrary workspace edits | **PASS** | `requireWorkspaceEntityAccess` checks the claimed World is actually bound before granting anything |
| Caller-supplied World IDs cannot grant access to unrelated entities | **PASS** | "Claiming an unrecognized World is refused" tests, both route test files |
| Binding a workspace does not itself confer shared-content edit authority | **PASS (corrected this round)** | `world.content.bind_workspace` REMOVED from the write path entirely — round one's fix still granted it this authority; round two's "still refused even with world.content.bind_workspace" tests in both route files prove it no longer does |
| A World editor cannot modify content consumed by another World via direct-edit or Studio routes | **PASS** | `mode: 'read'\|'write'` + the shared-write-requires-platform-capability correction; two-Worlds-sharing-one-workspace test suites in both files |
| **Required regression: a caller with EVERY World capability in World A (incl. entity edit + workspace binding), no platform authority, cannot mutate a workspace shared with World B through any affected endpoint** | **PASS** | New test in both `content-workspace-entity-routes.test.ts` (all 4 write handlers) and `entity-direct-edit-routes.test.ts` (`customize.post.ts`), using `ALL_WORLD_CAPABILITIES` as the principal's world grant — refused with 403 on every one |
| **Required regression: that same caller CAN customize locally in A** | **PASS** | `split-local.post.ts` tests — gated on ordinary `world.entity.edit` only, succeeds regardless of `world.content.bind_workspace` |
| **Required regression: B and the shared source remain unchanged** | **PASS** | `splitSharedEntityToLocalWorkspace`'s success test now explicitly asserts the shared workspace/entity ids are never passed to `bindWorkspaceLiveToWorld`/`applyPresentationEdits`; the identity-collision disposable proof (below) independently confirms the same at the data layer for a materially identical scenario |
| **Required regression: a platform-authorized editor can still explicitly edit the shared source** | **PASS** | `content-workspace-entity-routes.test.ts`'s pre-existing "platform-authorized shared editing remains fully supported" test, unaffected and still passing; confirmed this capability path was never touched by either round's fix |
| Read/history/checkpoint/revert operations enforce appropriate scope | **PASS** | Read uses `mode: 'read'` (bound-World-only, unaffected by the write correction); checkpoint/revert/patch all use `mode: 'write'`, verified individually |
| Sharing/scope checked using authoritative server-side data, not client claims | **PASS** | `listWorldsBoundToWorkspace` is a real server read, never trusts a client-supplied `scope`/`sharedWithWorldCount` |
| "Customize for this World" implemented using existing identity/provenance/import machinery | **PASS** | `splitSharedEntityToLocalWorkspace`; reuses exact-entity import, `applyPresentationEdits`, existing precedence — no new identity scheme, no new schema |
| Shared editing is a distinct explicit choice requiring real shared-editing authority | **PASS, with a round-one UI bug fixed this round** | The choice UI was previously unreachable (see "Boundary review findings, round two"); now gated correctly on `scope: 'local'` vs. the explicit choice |
| **Identity-safe selection: not resolved via title or slug/type alone** | **PASS (corrected this round)** | Round one's slug/entityType re-match REMOVED; replaced with canonical `contentEntityId` from the save workflow's own response |
| **Required regression: two unrelated packages publishing the same slug+entityType — customizing either retains its OWN effective result, never the other's** | **PASS** | Real disposable (non-mocked) proof, 16/16 checks, against the live Directus/Postgres instance — see below |
| No independent/second identity-resolution heuristic introduced | **PASS** | The fix reuses `contentEntityId`, already returned by the existing save/split workflow; no new matching logic was invented |
| Failure/retry: prep-succeeds/import-fails; import-succeeds/save-fails; save-succeeds/activation-fails; concurrent first saves | **PASS** | 27/27 real disposable failure-injection run (round one; unaffected by this round's changes) |
| Explicit Save/Cancel | **PASS** | Real browser re-run this round: Save persists and refreshes; Cancel on a dirty draft is blocked pending confirmation |
| Dirty-close handling | **PASS** | Real browser re-run this round: `confirm()` dialog fired with "Discard unsaved changes?" |
| Immediate refresh and opening a second edit | **PASS (explicitly re-verified this round)** | Real browser re-run: after Save, the card/rail show the update immediately with selection retained; reopening Edit a second time shows the just-saved description |
| Conflict draft retention | **NOT VERIFIED in the browser, either round** | `StudioEntityEditor.vue`'s documented 409-reload-and-banner behavior is unit-tested; not newly changed by either boundary review, not re-exercised in the browser |
| Image selection | **PASS (picker reachable and functional, round one; not re-exercised this round since untouched)** | Media Gallery picker opens correctly from the edit form; actual upload-and-apply not exercised (pre-existing, unmodified component, outside this round's changed surface) |

### Real disposable identity-collision proof (this round's required regression for selection identity)

Not mocked — run directly against the live disposable Directus 11.12.0/Postgres 16 instance via jiti
+ the repo's own runtime shim, using the real `publishContentPack`, `createWorld`,
`bindContentPackToWorld`, `customizeEntityForWorld`, and `getCatalogueBackedEntityRows` (the exact
function `GET /api/worlds/:id/entities` itself calls). Scenario: two packages with different
packageId/provider/externalId/sourceBook (no shared evidence key — confirmed by `evidenceKeys()`'s
own grouping rules, which these intentionally fail to satisfy) each publish an item with the
IDENTICAL slug and entityType, both bound to one World. **16/16 checks passed**: both rows resolve
as separate, distinct effective entities before any edit (different packageId, correct independent
titles); customizing Pack A's entry via `customizeEntityForWorld` leaves Pack B's row completely
untouched (no `contentEntityId`, unchanged title, not customized); the save's own returned
`contentEntityId` matches EXACTLY Pack A's row after a refresh, never Pack B's; the client-style
`contentEntityId` lookup (the identical logic `onDirectEditSaved` performs) selects Pack A's row
every time and never Pack B's.

**Owner browser acceptance checklist** (superseded by the acceptance matrix above as the
authoritative record, kept here as a quick manual re-check after a real deployment with
`ELDRA_EFFECTIVE_CONTENT=true`):
1. World workspace → Items → pick any imported item → confirm an **Edit** button appears in the
   detail rail (requires Build mode, toggled from the World Map page's sidebar — the toggle itself
   only renders there, not on category pages, but the mode carries over via client-side navigation).
2. Click Edit, change the description, pick a new image, click **Save changes** — confirm the rail
   stays on the SAME entity afterward, not bounced back to an empty panel.
3. Reopen the SAME item's Edit a second time — confirm the just-saved description/image are there,
   and the form (now `StudioEntityEditor.vue`) is legible and single-column inside the rail.
4. Open a different World not bound to this workspace; confirm its own copy of the item is
   unaffected.
5. With a World bound to a workspace ALSO shared with another World, confirm Edit shows the
   "Customize for this World" / "Edit the shared collection" choice — NOT the editor directly — and
   that "Edit the shared collection" without platform authority fails with a clear permission error
   rather than silently succeeding.

## Consolidation assessment (bounded, not a rewrite)

| Finding | Existing callers / responsibility | Preserve | Proposed replacement | Transition | Priority |
| --- | --- | --- | --- | --- | --- |
| **Two Directus access patterns** (documented since Pass A — `directusServiceRequest` vs. ad hoc `dxFetch`) | ~15+ files | Per-user vs. service-token semantics, wherever intentional | A single audited client, OR an explicit per-file "this is intentionally service-scoped" marker | Audit call-by-call (large, cross-cutting — NOT done in this pass) | Low — unrelated to this pass's own correctness |
| **`collectionSummary*` helpers lived in a route file**, not a util (fixed THIS pass) | `entities.get.ts` | Exact behavior (verified byte-identical lint/typecheck baseline before/after the move) | `server/utils/entity-collection-summary.ts` | **Done** | — |
| **Platform-only Studio entity routes blocked ordinary World admins** (fixed THIS pass) | The 5 routes under `content/workspaces/.../entities/[contentEntityId]/**` | Platform-capability path unchanged | `requireWorkspaceEntityAccess` dual-auth | **Done**, verified by new + existing route tests | — |
| **No single "exact one entity" import primitive existed before this pass** (fixed THIS pass) | `content-workspace-import.ts` | Release/provider import paths, snapshot/retry guarantees | `{kind:'entity'}` source | **Done** | — |
| **"Customize for THIS World" from an already-SHARED workspace** (was not implemented; **done this review pass**) | `WorldEntityDirectEditDialog.vue`, `resolveDirectEditTarget` | Shared-scope detection, escalation gating (both already correct) | `splitSharedEntityToLocalWorkspace` — reuses the SAME exact-entity import plus a "seed initial edits from the shared entity's current `authoredPresentation`" step | **Done.** The split entity gets a NEW identity (a fresh workspace-backed entity in this World's own local workspace, imported from the shared entity's `baseSourceRef`) rather than inheriting the shared entity's own identity — simpler and consistent with how every other direct-edit entity is created; legacy-alias continuity for the ORIGINAL published release still works exactly as before (unchanged `baseRefs` on the new import) | — |
| **Multi-write partial-failure risk**, `customizeEntityForWorld` end to end | This pass's own new module | The individual idempotent guarantees already in place (table above) | An explicit "pending preparation" marker so a UI could show "still finishing setup" distinctly from "saved" after a crash mid-sequence, instead of the caller just retrying blind | Only worth doing if real-world retries turn out to need better UX than "click Save again" | Low — no evidence yet that the current retry-safe-but-not-transactional behavior is a problem in practice |
| **Obsolete routes/compatibility layers** | None newly found in this pass beyond what Pass A/B already documented (`map-data.ts`'s retired upload path, the renderer compatibility branches) | — | — | — | Unchanged from Pass B's own assessment |
| **Install/upgrade entry point** | `scripts/directus/bootstrap.mjs` (schema), `create-workspace-entity-writer-role.mjs` (writer role, manual, credential-gated) | The existing manual, documented sequence (Pass B handoff's own 10-step deployment sequence) | A SINGLE documented entry point that runs schema bootstrap AND states (not performs) the writer-role step, since that one step correctly requires a human-supplied credential and must never be automated into "the app provisions its own elevated database role" | Document only — do NOT give the app permanent superuser access, and do NOT build a broad installer in this pass | **Flagged for the next bounded pass**, not attempted here |
| **Fresh-install vs. upgrade requirements** | Same scripts above | Idempotency already present in every schema/role script | A single README-level "first install" vs. "upgrading an existing deployment" split, since today's docs describe the STEPS but not which ones a fresh install can skip (there is nothing to migrate yet) | Documentation-only | Low |
| **Credentials/privileges, install-time vs. runtime** | `ELDRA_WORKSPACE_DB_URL` (runtime, least-privilege), the admin credential used only to run `--confirm` provisioning (install-time only, never stored by the app) | The existing least-privilege split (Pass B handoff's own table) | No change needed — already correctly separated; worth restating here since this pass adds a user-facing feature that now DEPENDS on that credential existing for direct editing to work at all (not just for Content Studio) | — | — |

**What this pass explicitly did NOT do, per its own boundaries:** no mechanics/Rules Facet authoring,
no release publication, no channels, no reconciliation UI, no broad installer overhaul, no
speculative abstraction layers, no production access, nothing committed/pushed/deployed.

## Deployment requirements for this pass specifically

**None beyond what Pass B's own handoff already documents and the owner has already provisioned in
production** (workspace schema/revision counters, the `eldra_workspace_writer` role,
`ELDRA_WORKSPACE_DB_URL`, Solaris already live-bound). This pass adds no new collection, no new
column, no new environment variable, and no new credential — `worldLocalWorkspaceKey` is a plain
value in the ALREADY-unique `workspace_key` column, and every new route reuses the existing
`eldra_workspace_writer`/Directus-service-token write paths unchanged. If `ELDRA_EFFECTIVE_CONTENT`
and the workspace writer are already configured (true for Solaris per the owner's own notes), direct
editing works for any World the moment this code deploys — no additional provisioning step.

**Explicitly confirmed unchanged by the second boundary review's two correctness fixes.** Neither
fix touches schema, environment variables, or credentials: the authorization correction only removes
a capability check that was already wrong (no new capability, no new grant row shape); the selection
fix is a pure client-side Vue change plus threading an already-returned `contentEntityId` through an
existing event. Nothing in this whole feature has been committed, pushed, or deployed at any point,
so there is no live behavior to migrate away from — but it is worth stating plainly for whenever this
DOES ship: any World owner/gm who holds `world.content.bind_workspace` but not genuine platform
`platform.contentworkspace.edit` authority will no longer be able to edit a SHARED workspace's
content directly through either entry point (the Studio routes or the World-facing dialog's "Edit
the shared collection" choice) — their correct path for a shared entity is "Customize for this
World" instead. Since this was never live, this is a correction before first deployment, not a
regression against deployed behavior.
