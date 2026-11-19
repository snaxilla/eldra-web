# Direct Content Editing — architecture, guarantees, and handoff

**Status: implemented, committed (`dc0cd60`, `1032b3f`, `432dee5`), and deployed to production
(Solaris) through the entity-Edit-is-permission-based pass. A further, NOT YET committed pass —
Quick Edit Rail + Full-Page Editor — is documented near the very end of this file.** A production
acceptance failure was reported and fixed after deployment — see "Production acceptance failure:
Build-mode discoverability" near the end of this document. This documents the ELDRA Direct Content
Editing consolidation pass: "Items → Shortsword → Edit → change picture/description → Save" with no
manual workspace/import/binding
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
1. World workspace → Items → pick any imported item → confirm an **Edit** button appears directly
   on its card AND in the detail rail. **Updated**: this no longer requires Build mode or any prior
   World Map visit — see "Product regression: Edit must not require Build mode" below, which
   corrects this checklist's own now-obsolete earlier wording.
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
existing event. It is worth stating plainly: any World owner/gm who holds `world.content.bind_workspace`
but not genuine platform `platform.contentworkspace.edit` authority will no longer be able to edit a
SHARED workspace's content directly through either entry point (the Studio routes or the World-facing
dialog's "Edit the shared collection" choice) — their correct path for a shared entity is "Customize
for this World" instead. This correction landed in the same commit as the feature's own first
deployment (`dc0cd60`), so there is no separate prior live behavior it changes.

## Production acceptance failure: Build-mode discoverability (post-deployment fix)

**SUPERSEDED by the owner's product decision below ("Product regression: Edit must not require
Build mode") — kept here, uncorrected, as the historical record of what this fix actually did and
why, exactly like this document's own earlier "boundary review" corrections.** The fix described in
this section made Edit reachable by making Build mode reachable from every page. The owner's
subsequent product decision was that this was itself the wrong direction: Play/Build belongs
EXCLUSIVELY on the World Map, and entity editing must never depend on it, reachable or not. Do not
re-apply anything in this section — read the later section instead.

**Reported**: on Solaris (`/worlds/4/items`), selecting Longbow opened its context rail (Details,
Summary, image, metadata, "CUSTOMIZED FOR THIS WORLD" all rendered correctly) but showed **no Edit
action anywhere** — for the owner's own established administrator account.

**Root cause**: the Edit button (`WorldEntityInteractivePage.vue`) is gated on `mode === 'build'`.
`mode` is a single global `useState` that defaults to `'play'` and resets on every FULL browser
navigation (a bookmark, a direct link, a refresh — anything that isn't client-side SPA routing). The
ONLY control that can switch it to `'build'`, the Play/Build toggle in `WorldWorkspaceSidebar.vue`,
was rendered exclusively on the World Map page (`v-if="isMapPage"`) — a restriction that predates
`WorldEntityInteractivePage.vue` gating its OWN Edit/Delete actions on `mode` too. An owner who
reached `/worlds/4/items` without having visited the Map page earlier in that browser session had
**no way to ever reach Build mode**, and therefore no way to ever see Edit. Not a permissions bug,
not a stale deployment, not an entity/provenance exclusion — every one of those conditions was
confirmed fine; the toggle that controls the gate was simply unreachable from the page the owner was
actually on.

**Fixed**: `WorldWorkspaceSidebar.vue`'s Play/Build toggle is no longer gated on `isMapPage` — it now
renders on every World workspace page (the "Hide/Show Pins" toggle, genuinely map-only, keeps its
`isMapPage` gate unchanged). `WorldEntityInteractivePage.vue` additionally shows a "Switch to Build
mode (sidebar) to edit this item" hint to an authorized editor viewing an entity in Play mode,
instead of Edit silently not existing (client-side convenience, gated on `world.entity.edit` being
present in `world.capabilities`; the server's own capability checks on every write route are the
unaffected, real gate). A second, independently-surfaced mobile bug was found while verifying this
fix on a narrow viewport: the "Build mode, nothing selected" page-presentation panel
(`WorldPagePresentationPanel`, embedded) is `fixed`-positioned at near-full-viewport width with no
responsive breakpoint, so on a narrow viewport it covered the ENTIRE screen with no way back to the
item list once Build mode was active with nothing selected — unreachable before this fix (Build mode
itself was unreachable from Items on mobile), newly exposed by it. Fixed with `hidden md:block`: it's
a secondary background-customization panel, not needed to reach Edit, so hiding it below `md` loses
no desktop functionality.

**Verified** against the real disposable Directus/Postgres instance + a real headless browser (not
production): three Worlds, one fresh never-touched published item, three real roles — owner
(desktop), worldbuilder/authorized-World-only-editor (desktop), and owner again on a 390×844 narrow
viewport (via the mobile drawer) — all three reach Build mode with ZERO Map-page visits in that
session, see Edit, Save successfully, retain selection, and reopen a second edit correctly (the
narrow-viewport run additionally re-confirmed the earlier `StudioEntityEditor` `compact`-prop layout
fix still renders single-column and legible at that width). An unauthorized player-role account on a
separate World correctly sees no Build toggle, no Edit button, and no hint text. Full suite:
6284/6284 passing. No new automated regression test was added — this is a pure Vue-template
visibility condition with no existing component-rendering harness in this repo (consistent with
every other UI-only fix in this document); the real multi-scenario browser run above is the
regression evidence.

**Deployment requirements**: none — pure client-side visibility fix, no schema/env/credential change.

**Follow-ups recorded in this pass** (status updated below):
1. ~~The authorized Play-mode editing hint ... a direct "Switch to Build" action on the hint itself
   would remove one extra step.~~ **OBSOLETE.** The owner's subsequent product decision removed
   Edit's dependency on `mode` entirely, so this hint (and `mode` itself, for entity actions) no
   longer exists. See the next section.
2. The narrow-viewport fix for the "Build mode, nothing selected" panel is `hidden md:block` — it
   makes the panel simply not render below `md`, rather than giving mobile a working equivalent.
   Page/background customization (`WorldPagePresentationPanel`) has no usable mobile entry point at
   all today. **Still open** — explicitly out of scope again in the product-regression fix below, per
   the owner's own instruction not to expand that bounded task into a redesign.

## Product regression: Edit must not require Build mode (owner correction)

**Owner decision, reported as a product regression**: the fix above was itself wrong. Entity editing
must not require Build mode at all. Authorized users should see Edit directly on entity cards.
Play/Build belongs exclusively on the World Map, for pin interactions.

**Corrected**:
- `WorldWorkspaceSidebar.vue`'s Play/Build toggle is gated on `isMapPage` again (restored to
  Map-only, in both the expanded and collapsed/mobile sidebar variants) — reverting the previous
  fix's own change to this file. "Hide/Show Pins" was never touched either time; still Map-only.
- `WorldEntityInteractivePage.vue`'s Edit and Delete actions no longer read `mode` AT ALL. Visibility
  is now purely capability-based: `directEditSupported && canEditEntities` for Edit (both the
  context-rail button AND a new button directly on every entity card, grid and list), and
  `canDeleteEntities` for Delete (its separate, unchanged "catalogue entries have nothing to delete"
  restriction is independent of this and was not a new Delete capability for immutable published
  entries). The obsolete "Switch to Build mode (sidebar) to edit this item" hint is gone — there is
  nothing left to hint about, Edit is just always there when the caller is authorized.
- The authorization checks (`canEditWorldEntities`/`canDeleteWorldEntities`/`supportsDirectEdit`/
  `shouldShowDirectEditAction`) were extracted into a new pure module,
  `app/components/world/worldEntityDirectEditEligibility.ts`, following the SAME established
  sibling-file pattern as `worldEntityHomebrewActions.ts` (this repo has no DOM/browser test
  harness, so pure logic extracted out of a `.vue` file is how anything here gets real unit
  coverage). `shouldShowDirectEditAction` takes no `mode`/build-state parameter at all, by
  construction, making this exact regression (gating entity editing on the Map's Play/Build state)
  structurally impossible to reintroduce through this gate again.
- A card's Edit button opens the EXACT SAME shared direct-edit workflow as the rail's own Edit — no
  second dialog system. `openDirectEdit(entity)` now selects `entity` first (via the existing,
  already-robust `openEntityContext`, the same selection path the card's Details button already
  uses) before opening the dialog, so clicking Edit on a card works correctly even while a DIFFERENT
  entity is currently selected — selection simply follows the edit target. `@click.stop` on the
  card's Edit button prevents it from also triggering the card's own click-to-select handler.
- Shared-source vs. World-local editing boundaries are completely untouched by this fix — it only
  changes WHEN the Edit button/dialog is offered, never what the dialog does once opened or what the
  server allows once it saves.

**Verified** against the real disposable Directus/Postgres instance + a real headless browser (not
production), covering every item in the required checklist: a fresh session on `/worlds/:id/items`
(owner) shows card Edit immediately, no Map visit, ever; a card opens the direct-edit workflow
without first clicking Details; Save → immediate card-text refresh (no reload) → a real hard
`page.reload()` (not SPA navigation) → edit persisted, card Edit still visible, no Map visit → a
second edit reopens showing the just-saved value; card Edit is present in BOTH Grid and List
layouts; a 390×844 narrow viewport shows card Edit immediately, no drawer/hamburger interaction
needed at all (Edit no longer lives behind any sidebar control); an authorized World-only
("worldbuilder" role, not owner/gm) account sees card Edit; an unauthorized "player" role account
sees NO Edit anywhere and NO leftover hint text; a World-only editor on a workspace genuinely shared
with a second World sees the "Customize for this World" / "Edit the shared collection" choice,
`customizeLocally` succeeds, and a DIFFERENT World also bound to that same shared workspace (whose
owner holds `world.content.bind_workspace` via `ALL_WORLD_CAPABILITIES` but not real platform
authority) is correctly refused when actually attempting to SAVE through "Edit the shared
collection" — re-confirming the earlier authorization-boundary fix is untouched by this change;
entering Build mode on the World Map, then navigating to Items, shows entity behavior IDENTICAL to
Play mode (capability-only, as designed); returning to the World Map afterward, the Play/Build
toggle and the pin-visibility control both still work; and the toggle is confirmed absent on the
Items page itself (Map-only, restored). **23/23 checks passed.**

New focused regression tests, using this repo's existing pure-logic-extraction testing pattern (no
component harness exists, so these prove the gating logic directly, not that the `<button>` v-if
renders in a browser — that remains the real headless-browser run above):
`tests/components/world/worldEntityDirectEditEligibility.test.ts` (14 new tests), including one
that asserts `shouldShowDirectEditAction` takes exactly 2 parameters (never a third `mode` argument),
making the regression structurally impossible to reintroduce through this function. Full suite:
6298/6298 passing (309 files). Typecheck: pre-existing failures only, in files this pass never
touched (confirmed identical baseline to the prior round). Lint: the new module and its test file
are clean; `WorldWorkspaceSidebar.vue` and `WorldEntityInteractivePage.vue` carry only the SAME
pre-existing `no-explicit-any`/unused-var debt already documented earlier in this file, unchanged by
this pass's own additions. Production build: `pnpm build` exits 0.

**Remaining non-map mode dependencies**: `collectionRailOpen` (layout) and the "Build mode, nothing
selected" `WorldPagePresentationPanel` panel (`v-if="mode === 'build' && !selectedEntity"`) both
still read `mode` — deliberately untouched, per the owner's own instruction not to expand this
bounded fix into a page/background-customization redesign. This is the SAME follow-up #2 recorded
above, now reconfirmed still open and still out of scope on purpose.

**Follow-ups recorded, current as of this pass** (both deliberately out of scope, neither fixed
here):
1. **Remove unauthorized shared-edit choices from the UI.** `WorldEntityDirectEditDialog.vue`'s
   shared-choice screen offers "Edit the shared collection (requires elevated permission)" to ANY
   caller who reaches it (any World owner/gm with `world.entity.edit`), regardless of whether they
   actually hold real platform `platform.contentworkspace.edit` authority — the dialog has no way to
   know that client-side today. The server is the real, unaffected gate (confirmed again this pass:
   a World-only owner's SAVE attempt through that choice is refused), so this is a discoverability/UX
   gap, not a security one — but a caller who clicks it today reaches a live editor that then fails
   on Save with no warning up front. Worth either plumbing the caller's platform capability down to
   this dialog, or simply not offering a choice the caller can't act on.
2. **Give page/background customization a usable entry point independent of the Map's Play/Build
   state.** The "Build mode, nothing selected" `WorldPagePresentationPanel` panel has no reachable
   entry point outside Build mode, no mobile-usable layout (previously fixed with `hidden md:block`,
   which only suppresses it below `md` rather than giving mobile a working equivalent), and now, per
   this pass's own correction, no connection to entity editing at all anymore. Worth a real design
   pass once Play/Build's own future (Map-only, pins-only) is settled.

**Deployment requirements**: none — pure client-side visibility/authorization-source change, no
schema/env/credential change. The editor itself (`StudioEntityEditor.vue`) was not touched: no
formatting/layout changes, no persistence-model changes, no field changes. Atomic save, conflict
handling, canonical `contentEntityId` selection identity, automatic local-customization
(`splitSharedEntityToLocalWorkspace`), and activation-last ordering are all unchanged and unaffected
by this pass — none of this pass's files intersect with `content-entity-direct-edit.ts` or
`content-workspace-http.ts` at all.

## Quick Edit Rail + Full-Page Editor (NOT YET COMMITTED)

**Before**: the only entity editor was `StudioEntityEditor.vue`'s full form (Title, Description,
Notes, Source book/page, Image, live preview, Revert-all, checkpoint), rendered EITHER inside the
narrow (~380px) collection context rail OR, for a never-yet-customized entity, a separate first-save
ad-hoc form missing Notes/Source book/page entirely. Both surfaces had real layout problems in the
rail specifically (nested ornamental panels, horizontal overflow on wide fields, long text squeezed
into tiny boxes) — small edits and substantial edits had no distinct surfaces at all.

**After**: two purpose-sized surfaces, one shared draft/save contract.
- **Quick Edit Rail** — compact, rail-width, Display name + Image only. Reached by a card's own
  "Edit" button (grid or list), the context rail's "Edit", or a card's dedicated "Change image"
  action.
- **Full-Page Editor** — a dedicated, comfortably-wide route (`/worlds/:id/entities/:entityType/:slug/edit`)
  with every currently-supported field, the live preview alongside the form, and history/checkpoint
  controls, all unchanged from the existing editor.

### Files changed / created (not yet committed)

- `app/components/admin/studio/StudioEntityEditor.vue` — new `fieldSet: 'quick' | 'full'` prop
  (RENDERING toggle only: `draft`/`baseline`/`dirtyPaths`/`save()` are completely unaware of it, so a
  'quick' save can only ever send paths the user actually touched through fields that are actually
  visible — one draft/save contract, not two). New `autoOpenImagePicker`/`seedDraft` props (direct
  image action, draft transfer). New `open-full-editor`/`dirty-change` emits. "Title" relabeled
  "Display name" and a new "Restore inherited image" draft-level action added (distinct from "Remove
  image (show no art)" and the existing persisted-revert link) in BOTH field sets.
- `app/components/world/WorldEntityDirectEditDialog.vue` — new `surface: 'quick' | 'full'` prop
  (threads straight into StudioEntityEditor's `compact`/`fieldSet`; also trims/expands the
  never-customized first-save form's own fields the same way — it now ALSO exposes Notes/Source
  book/page, previously missing entirely in 'full' mode). `focusImage`/`seedDraft` props,
  `open-full-editor`/`dirty-change` emits (relayed from whichever internal surface is active).
- `app/lib/world-entity-collection/direct-edit-navigation.ts` (new, pure, unit-tested) —
  `writeDraftTransfer`/`consumeDraftTransfer` (sessionStorage-based draft transfer) and
  `isSafeCollectionReturnPath` (return-path validation against open-redirect shapes).
- `app/pages/worlds/[id]/entities/[entityType]/[slug]/edit.vue` (new) — the Full-Page Editor route.
  Resolves identity ENTIRELY from route params; consumes a transferred draft once; guards router
  navigation (`onBeforeRouteLeave`) and renders `WorldEntityDirectEditDialog` with `surface="full"`.
- `app/components/world/WorldEntityInteractivePage.vue` — a "Change image" button directly on every
  entity card (grid and list, over the image well, ALWAYS visible — never hover-only); collection
  state (search/view/facet/selection) synced to the URL (debounced `router.replace`, shallow) so
  "the current URL" is always a valid return target; `onOpenFullEditor` (draft transfer + navigate);
  identity-safe reselection on return via `savedEntity` (canonical `contentEntityId`, preferred) or
  `selected` (plain row id, fallback) query params — never title/slug/type alone.
- `server/utils/catalogue-entity-bridge.ts` — **a real, pre-existing bug found and fixed by real
  browser verification** (below).
- Card root (`data-collection-entity-card`) lost its own `role="button"`/`tabindex`/keydown
  handlers — it was a REAL `role="button"` wrapping REAL `<button>` children (Details/Edit/Open
  Article/the new Change image), an invalid nested-interactive ARIA pattern that was ALREADY there.
  It went from "theoretically wrong" to "practically breaking" the instant the new Change-image
  button's own accessible name started colliding with the card's own computed accessible name.
  Keyboard/screen-reader users lose nothing: "Details" performs the identical selection action and
  was always the real, correctly-labeled control.

### Defect found by real browser verification: rename was invisible everywhere but the editor itself

Saving a "name" presentation override (Quick Edit's "Display name", or the full editor's own
"Title" — the SAME pre-existing field, unchanged) persisted correctly (confirmed via the real
workspace entity record) and rendered correctly in the editor's OWN live-preview panel — but the
collection card, the context rail's "SUMMARY" header, and the full-page editor's OWN heading all
kept showing the ORIGINAL, un-renamed title. Root cause: `catalogue-entity-bridge.ts`'s row-building
used `entry.title` (an `EffectiveCandidate`'s stable, identity-ish label, set once at import time)
unconditionally, never `entry.presentation?.name` (the SEPARATE, authored-override-aware field
`world-content-sources.ts`/`world-effective-content.ts` already correctly maintain side-by-side on
the exact same object) — a pre-existing architectural split between "identity" and "authored display
name" that nothing had ever surfaced in the browser before, because nothing had ever actually
verified a name-override save end-to-end outside the editor's own preview. **Fixed**: the bridge row
now prefers `entry.presentation.name` when present, falling back to `entry.title` — reads one
already-computed field, nothing else changes (not `slug`, not `packageId`, not any identity
concept). `StudioEntityEditor.vue`'s own internal header still shows the stable `entity.title`
rather than the live override, which may itself be worth revisiting but is a much smaller, purely
cosmetic inconsistency than the one just fixed — left alone this pass.

### One draft and save contract

Quick Edit and the Full-Page Editor are the SAME component (`StudioEntityEditor.vue`) with different
field visibility, or, for a never-yet-customized entity, the SAME ad-hoc first-save form with
different field visibility (`WorldEntityDirectEditDialog.vue`'s `surface` prop) — never two
competing implementations. Concretely, this means, for free, with no new logic written:
- **Quick Edit can only ever touch name/image.** `dirtyPaths` is computed by comparing the REAL
  `draft` against the REAL `baseline` for every field; a field whose input never renders can never
  become dirty, so description/notes/citations/mechanics are structurally impossible for Quick Edit
  to clear, freeze, or send an edit for — proven directly: saving a Notes change through the
  full-page editor leaves the earlier Quick-Edit-saved name override completely untouched
  (`authoredPresentation` carries both independently), and vice versa.
- **Absent vs. explicit-null image semantics are unchanged** — `draft.image` is still `undefined`
  (inherit) / `null` (explicit "no art") / `{fileId,url}` (explicit choice), exactly as before; the
  new "Restore inherited image" button is the first UI path that ever sets it to `undefined` by user
  action, exercising an edit-building branch (`save()` already sent `value: undefined` for this
  case) that existed in code but had never been reachable from any button before.
- **Opening, cancelling, or saving an unchanged draft writes nothing** — `isDirty`/`dirtyPaths` empty
  means the Save button is disabled and `save()` returns immediately; Cancel with nothing touched
  needs no confirm(). Proven directly in the browser (Cancel test below).
- **Failed saves / conflicts / stale responses** — entirely `StudioEntityEditor.vue`'s existing
  `saveGeneration`/`loadGeneration` machinery and 409-conflict handling, untouched by this pass.
- **Activation-last ordering and retry guarantees** — untouched; this pass never touches
  `content-entity-direct-edit.ts`.

### Full-page route: identity, navigation, draft transfer

- **Identity resolved entirely from route params** (`worldId`/`entityType`/`slug`), via the SAME
  `edit-target` GET the rail already calls (through `WorldEntityDirectEditDialog`) — never from a
  previously-selected rail row. A direct URL visit or a hard refresh therefore always loads the
  correct entity, proven directly in the browser.
- **Draft transfer** (Quick Edit → "Open full editor", carrying an unsaved name/image change) uses
  `sessionStorage` (not the URL — no description text, no credentials, no draft payloads ever appear
  in a URL), a single fixed key, read-and-cleared in one step so it can never be reapplied to a
  later, unrelated visit. The transferred payload is validated against the EXACT worldId/entityType/
  slug the full page actually loaded before being applied at all. It is applied to `draft` ONLY,
  never to `baseline`/`entity.value.revision` — the full page's OWN fresh load is always the real
  revision of record, so a concurrent edit since the Quick Edit draft was created still produces a
  normal 409 conflict on Save, never a silent rebase onto a stale `expectedRevision`. Proven directly
  in the browser: an unsaved rename survives opening the full editor, the sessionStorage key is
  empty both before the click and after the full page consumes it, and the transferred text never
  leaks into any other field.
- **Dirty-navigation guards**: `StudioEntityEditor.vue`'s existing `beforeunload` listener covers a
  hard refresh/tab close (unchanged). A NEW `onBeforeRouteLeave` guard (added because this component
  had never been routed to directly before this pass) covers the Back link, browser back/forward,
  and any other in-app navigation away — driven by a new `dirty-change` emit relayed up from whichever
  surface is active. The dialog's own internal Close/Cancel already confirm discarding before ever
  emitting `close`, so the page's own `onClose` clears its tracked dirty flag first, specifically so
  the ensuing `router.push` doesn't trigger a SECOND confirm() for the same decision the user already
  made.
- **Hard-refresh draft recovery is explicitly NOT implemented.** A hard refresh of the full-page
  editor itself, mid-edit, loses the in-progress draft exactly like `StudioEntityEditor.vue` always
  has (the `beforeunload` warning is the mitigation, unchanged) — stated here plainly per this task's
  own instruction to document the limitation accurately rather than silently leave it unhandled.

### Collection return and immediate refresh

Search/view/facet/selection are synced to the collection page's own URL (debounced, shallow
`router.replace` — no extra history entries, no re-triggered data fetches, since those depend on
`worldId`/`entitySummaryTypes`, never `route.query`). "Open full editor" captures `route.fullPath` AT
THAT MOMENT as the `return` query param on the full-page URL; the full page validates it
(`isSafeCollectionReturnPath` — same-World, relative, no `//`/`://`/backslash open-redirect shapes)
before ever using it, falling back to the category page (or the World Map) when absent/unsafe (e.g. a
bookmarked direct edit URL with no prior collection visit at all). After a successful Save, the
full page auto-returns immediately (`savedEntity=<contentEntityId>` appended) — no separate manual
"Back" click needed, and no hard refresh: the collection page's own `useFetch` for its entity list
re-reads naturally on that fresh page load, and `savedEntity` drives an identity-safe reselect by
canonical `contentEntityId` (never title/slug/type alone — the SAME two-tier preference
`onDirectEditSaved` already used for in-place card edits, now shared with this return path too, with
`selected` as the fallback for a close/cancel that saved nothing). Proven directly in the browser:
search text and grid/list preference both survive the round trip, and the edited entity's own card
reflects the save immediately.

### Permissions and shared scope

Unchanged from the prior two passes — this pass touches ZERO authorization code
(`content-workspace-http.ts`, `content-entity-direct-edit.ts`). Quick Edit and the Full-Page Editor
both resolve through the SAME `edit-target`/`customize`/`split-local` routes and the SAME
`requireWorkspaceEntityAccess` boundary as before: local edits stay local, a shared-source write
still requires real platform `platform.contentworkspace.edit` authority (never
`world.content.bind_workspace` alone), a World-only editor can still "Customize for this World" but
not write a shared source directly, and the shared-choice UI is still a distinct, explicit choice
with truthful impact messaging. The ONE already-recorded follow-up this pass does not fix: the
shared-choice UI still offers "Edit the shared collection" to a caller who may not actually hold
platform authority, discovering that only on Save (see the follow-up list above).

### Verification actually performed

**Real disposable instance + real headless browser** (not production; fresh Worlds/items/species via
`publishContentPack`/`createWorld`/`bindContentPackToWorld`, same disposable Directus/Postgres
pattern as every other round in this document) — **36/36 checks passed** across two focused runs
(30 covering Quick Edit/direct image action/full page/draft transfer/layout, 6 covering Cancel and
the full-page Save-and-return round trip):

- Quick Edit opens for the clicked card; shows ONLY Display name + Image (no description/notes/
  source/mechanics); "Open full editor" present.
- A rename saves, the card/rail update immediately (after the title-display fix above), and the
  full-page URL keyed by the ORIGINAL slug still resolves afterward (identity/slug unchanged).
- Direct "Change image" on a card: opens the Media Gallery picker directly, with NO prior Details
  click, works while picking an image is still pending (Save stays disabled with nothing actually
  chosen yet).
- Full page: opens from a direct URL with a real heading and no prior rail selection; shows the full
  field set (Description/Notes/Source book-page/live preview/checkpoint); a hard refresh still
  resolves the correct entity.
- Draft transfer: an unsaved rename survives "Open full editor"; the sessionStorage key is empty
  before the click and cleared after; the transferred text never leaks into the wrong field.
- Cancel (Quick Edit): a typed-but-cancelled change never appears anywhere afterward.
- Full-page Save → auto-return: lands back on Items with the search term and grid view preserved,
  the entity still correctly shown/customized.
- Layout: Items AND Species, Grid AND List, desktop AND a 390×844 narrow viewport — card Edit/Change
  image reachable in every combination, zero horizontal overflow on the narrow Quick Edit rail.

Full regression suite: 6310/6310 passing (310 files). Typecheck: zero NEW errors in any file this
pass touched or created (confirmed file-by-file against the current, pre-existing, unrelated
baseline — this baseline is large and spans many files never touched across this whole document's
work; this pass is the first to have actually enumerated it beyond spot-checks, and found nothing of
its own in it). Lint: the two new files are clean; every modified file's errors are the SAME
pre-existing `no-explicit-any`/unused-var patterns already documented earlier in this file, with no
new categories introduced. Production build: `pnpm build` exits 0. `git diff --check`: clean.

**Not exercised this pass, stated plainly**: a genuine concurrent-edit 409 conflict through the new
surfaces specifically (the underlying mechanism is `StudioEntityEditor.vue`'s own, completely
unmodified, and was proven correct in an earlier round's unit/disposable tests — not re-proven here
for time, since nothing in this pass touches it); keyboard-only (no-mouse) operation of the new
"Change image" card button (it is a real, focusable `<button>` with a real `aria-label`, satisfying
the structural requirement, but an actual Tab-and-Enter walkthrough was not separately scripted);
touch-specific (as opposed to narrow-viewport-but-mouse-driven headless) interaction.

### Deployment requirements

None — no schema, environment variable, or credential change. Entirely new client-side route +
presentation-layer changes, plus the one `catalogue-entity-bridge.ts` display-name read fix (a pure
read-path change, no write-path/schema implication).

### Status

**NOT committed.** Stopped here for review per this task's own closing instruction.

## Page/background customization: explicit entry point (not yet committed)

Follow-up #2 above, now fixed. Play/Build (`mode`) is confirmed Map-pin-only in product intent; this
pass removes the last non-map surface still reading it for a presentation control.

**Before**: `WorldPagePresentationPanel` (background image + presentation mode, keyed by `pageKey`)
had no entry point reachable outside Build mode, and five call sites each independently gated it
behind their own copy of a "Build mode, nothing selected" aside/block
(`WorldEntityInteractivePage.vue`, `enemies.vue`, `characters/index.vue`, `timelines/index.vue`,
`timelines/[timelineId].vue`) — on mobile this was additionally unreachable regardless of mode
(`hidden md:block`). Entity-level AUTHORING actions already living in the SAME aside/header
(Location Tools' "New Location" form; a Timeline's own "Edit Timeline"/"Add Timeline Entry") are a
separate, still open, out-of-scope mode-coupling issue — not touched here, left exactly as they
were. These were not fixed opportunistically alongside the presentation fix above, and deserve
their OWN discoverability review (same shape as the entity Edit/Delete regression this whole
document tracks, but for entity *creation*/editing controls specifically, not presentation) rather
than being folded into this pass's narrower scope.

**After**: a new capability-gated "Customize Page" button (`app/components/world/WorldPageCustomizeButton.vue`)
in each of those five pages' own header action row, visible only when `world.settings.edit` is held
(`app/lib/eldra/world-settings-eligibility.ts`'s `canEditWorldSettings`, the same established
capability-only, no-`mode`-parameter pattern as `worldEntityDirectEditEligibility.ts`'s
`canEditWorldEntities`). Opens the EXACT SAME, unmodified `WorldPagePresentationPanel` inside Nuxt
UI's `UModal` (the same shared dialog primitive `CharacterInventoryPanel.vue`/
`CharacterSpellcastingPanel.vue` already use) — no second implementation of the editor, no new
persistence/save model (every panel action is already an immediate network save with no separate
draft step, so there is no dirty-draft state to protect on close). Each call site's `scope-note`
states plainly what the setting affects, including the two Timeline pages, which share ONE `pageKey`
("timelines") between the list and per-timeline views — the note says so explicitly rather than
implying the change is scoped to just the timeline being viewed.

Build-mode asides that had NOTHING else in them (`enemies.vue`, `characters/index.vue`,
`timelines/index.vue`, `timelines/[timelineId].vue`) were deleted outright, including their
now-dead `mode`-based rail-open/padding computeds. `WorldEntityInteractivePage.vue`'s aside keeps
Location Tools (untouched, still Build-mode-gated, out of scope) and now only renders at all on
location pages, since the Presentation panel it used to also hold moved to the header button.

**Explicitly NOT touched, and why**: `entities/[entityId]/index.vue`'s own "Page Builder" button+drawer
already has an explicit, non-"nothing-selected" entry point and already reuses
`WorldPagePresentationPanel` unchanged — but it bundles that panel together with a much larger
Article metadata/body/sidebar editor (its own `articleDirty`/`headerDirty` draft model) behind ONE
`mode === 'build'`-gated button, and a `watch(mode, ...)` that force-closes the drawer on mode exit.
Decoupling just the presentation slice of that page from `mode` would mean reaching into the Article
editor's broader gating — ruled out here as entity/article-editor redesign, which this task's own
boundaries excluded. Recorded as a follow-up, narrower than before: only this one remaining page
still couples a presentation control to `mode`, and fixing it means first deciding how "Page Builder"
button visibility should relate to Article-editing authority versus `world.settings.edit` specifically.

**Verification**: typecheck (902 errors before and after, confirmed identical baseline via
`git stash`, zero new errors in any touched/created file), lint (one genuine new issue found and
fixed — an unused `defineProps` return in the new button component; everything else in touched
files is the same pre-existing `no-explicit-any`/unused-var debt already documented in this file,
confirmed at the specific flagged lines via the same stash-based diff), full suite (6507/6507
passing, 320 files, including 6 new tests for `canEditWorldSettings`), production build (`pnpm build`
exits 0, new chunk for `WorldEntityInteractivePage` compiles cleanly), `git diff --check` (clean).
Live smoke check against this repo's own disposable dev instance: unauthenticated GET/POST to a
presentation endpoint both return 401. **Not verified**: no browser tool was available this session —
the actual button→modal open/close, desktop width, 390×844 layout, focus/Escape handling, and
"Game Admin → Page Setup still works after this change" were traced through the code (Page Setup's
own call site in `admin.vue` was not modified at all) but not browser-tested. Stated as an open gap,
not claimed as proven by the build/typecheck/unit results above.

**Follow-ups explicitly retained from this pass** (none of these three are fixed by this pass; each
is a distinct, separately-scoped item, not a detail to lose track of inside the writeup above):
1. `entities/[entityId]/index.vue`'s "Page Builder" button+drawer still couples the SAME presentation
   panel to `mode === 'build'` (via its own button visibility and its `watch(mode, ...)` auto-close) —
   this is the one remaining map-mode dependency on a presentation control, deliberately not touched
   here (see "Explicitly NOT touched, and why" above).
2. Location Tools' "New Location" form and the Timeline pages' "Edit Timeline"/"Add Timeline Entry"
   controls are entity-authoring actions still gated on `mode === 'build'` — a separate
   discoverability review, not a presentation-control issue, and not attempted in this pass.
3. Browser acceptance is still pending for the new "Customize Page" modal (open/close, desktop width,
   390×844 layout, focus/Escape handling) AND for confirming Game Admin → Page Setup still works
   unaffected — neither was browser-tested this session (no browser tool was available); both were
   only traced through the code.

### Deployment requirements

None — pure client-side visibility/entry-point change, reusing the already-existing
`world.settings.edit` capability and the already-existing presentation API/persistence unchanged. No
schema, environment variable, or credential change.

### Separate, unrelated note recorded alongside this pass

World Properties (the World display-name rename feature, tracked only by its own commit messages,
not in this document) is owner-confirmed working in production, per a screenshot showing a renamed
"Solaris Test" World. This is the owner's own acceptance of the rename itself; it does not mean every
individual verification step from that feature's own implementation report (CLI ambiguity handling,
narrow-viewport layout, etc.) was independently re-verified here — those remain as that feature's own
report stated them.

### Status

**NOT committed.** Stopped here for review per this task's own closing instruction.
