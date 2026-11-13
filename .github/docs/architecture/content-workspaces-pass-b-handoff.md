# Content Workspaces — Pass B handoff

Durable recovery record for the Pass B implementation (Phases 4/5/6 of
[content-workspaces-and-studio.md](content-workspaces-and-studio.md)). A fresh session should be
able to continue from this file without repeating the investigation.

**Status:** Phases 4/5/6 are complete server-side with a minimum in-app UI (see the first increment's
own status below). **This section records a SECOND increment**, addressing all four gaps the owner's
review identified before approving commit — all four now complete: (1) save concurrency was NOT
genuinely atomic (Directus's filtered PATCH, proven non-atomic) — **fixed with real Postgres
transactions**, verified by genuinely concurrent integration tests against the disposable instance
using a new least-privilege `eldra_workspace_writer` role; (2) a full disposable end-to-end workflow
proof — **complete, 42/42 checks pass**, and found/fixed a real production bug along the way (see
below); (3) the admin bridge's image propagation gap — **fixed**, reusing the existing
`entities.get.ts` image-resolution contract; (4) "Customize in workspace" from Studio Browse —
**complete**. Nothing in this pass has been committed, pushed, deployed, or run against production.
**Stop for review and commit approval — no commit/push/deploy has been made.**

## Position

| | |
| --- | --- |
| Branch | `main` |
| HEAD | `cc97882` (unchanged — Pass A's own last commit) |
| Pass A | 4 commits, already landed: `5eaee6d`, `db048a9`, `60149d2`, `cc97882` |
| Authorization-fix increment | working-tree only, not committed (see content-workspaces-pass-a-handoff.md) |
| This increment (Pass B) | working-tree only, not committed — see file list below |

## Baseline measured at the start, and the result now

| Check | Before this session | After Pass B (server-side) | After the review follow-up (this section) |
| --- | --- | --- | --- |
| `npx vitest run` | 294 files / 6040 tests, all passing | 304 files / 6205 tests, all passing | **305 files / 6217 tests, all passing** |
| `npm run typecheck` | 908 (sometimes measured 910 — within noise) | 908 — unchanged | **908 — unchanged (re-verified with a clean `.nuxt`)** |
| `npx eslint .` | 5941 problems | 5939 — unchanged (within noise) | **5939 total; zero new findings in any file this follow-up touched, individually verified file-by-file against each file's own pre-existing baseline (including the two files the Item 2 bug fix changed)** |
| `npm run build` | passed | passed | **passed, exit 0, "Build complete!"** |
| `git diff --check` | clean | clean | **clean** |

**A real typecheck regression was found and fixed during this pass, not merely avoided.** Adding a
dedicated `WorkspaceSourceResolution` union type and unioning it into `WorldGameplayCatalogue.packs`
(to represent a live workspace source's own failure shape) measurably widened that field enough to
degrade TypeScript's overload resolution for unrelated components' dynamic (non-literal) `$fetch`/
`useFetch` calls project-wide — confirmed by isolating the change: typecheck diagnostics went from
908 to a stable, reproducible 926, entirely in files this pass never touches (`AppTopbar.vue`,
`BlockRenderer.vue`, `CosmicBackdrop.vue`, several `characters/*ChoicePanel.vue` files). **Fix:** reuse
the *existing* `ContentPackLoadFailure`'s `'not-found'` stage for a missing live workspace source
instead of inventing a parallel union member — structurally the same concept ("the bound source
could not be found"), at zero type-widening cost. `WorldGameplayCatalogue.packs` is therefore
`WorldContentPackResolution[]`, unchanged from before this pass. See
`server/utils/world-effective-content.ts`'s own `WorkspaceSourceResolution` type alias and its header
comment for the full account. **Lesson for future phases:** before widening ANY type that flows
through a Nuxt server route's return value (even one field, even one union member), re-run
`npm run typecheck` with a clean `.nuxt` and compare counts — this class of regression is invisible
by inspection and only shows up as unrelated files' diagnostics changing.

## What exists, and how it was proven

### Phase 4 — Presentation editing

| Module | Proof |
| --- | --- |
| `app/lib/content-authoring/overrides.ts` (`FieldOverride`, `setPath`, `upsertOverride`, `removeOverridePath`, `emptyChannel`, `buildSparseObject`, `diffOverrides`, prototype-pollution rejection, the presentation-field allowlist) | 27 unit tests |
| `app/lib/content-presentation/authored.ts` (`AuthoredPresentation`, `mergeAuthoredPresentation` — absent inherits, present wins, `image: null` is explicit suppression, null `fromSource` still yields an authored-only entry) | 10 unit tests |
| `app/lib/content-presentation/kind-for-entity-type.ts` (entityType → PresentationKind, the same closed set `world-content-catalogue.ts` already uses) | covered through `content-workspace-presentation.test.ts` |
| `server/utils/content-presentation-assets.ts` (`resolvePortableAssetRef` — resolves a Media Gallery `kind:'media'` ref against a specific World's `world_id`; explicit suppression vs. unavailable vs. unsupported-kind; **never broadens access across Worlds**) | 9 unit tests |
| `server/utils/content-workspace-entities.ts` (`getWorkspaceEntityDetail`, `applyPresentationEdits`, `revertPresentationPath`, `revertPresentationChannel`, `createEntityCheckpoint`) | 12 unit tests, mocked Directus |
| `server/utils/content-workspace-presentation.ts` (`resolveBasePresentation`, `previewEntityPresentation`, `computePresentationBaseValueHash`) | 10 unit tests |
| 5 new routes under `server/api/content/workspaces/[workspaceId]/entities/[contentEntityId]/**` (GET detail+preview, PATCH edits, DELETE revert-one/revert-all, POST checkpoints) | 23 route tests (401/403/400/404/409 + success) |
| Schema: `content_workspace_entities.revision`, `content_workspaces.revision` (additive integer counters, `scripts/directus/alter-content-workspaces-revision-counters.mjs`, registered in `bootstrap.mjs`, extended into `verify-content-workspaces-schema.mjs`) | **Run against the real disposable Directus** (`http://127.0.0.1:18055`, still live from Pass A) — created both fields, backfilled 0 existing rows to `revision: 0` automatically via Postgres's own `NOT NULL DEFAULT 0` (verified via direct `curl`), idempotent on a second run, `verify-content-workspaces-schema.mjs` passes |
| Concurrency model | **Verified against the real disposable Directus directly**, not assumed: a collection-level filtered `PATCH /items/content_workspace_entities` with `{query:{filter:{id, revision}}, data:{...}}` correctly updates the matching row and returns `data:[...]`, and correctly returns `data:[]` (zero rows touched) when the filter's `revision` no longer matches — exact request/response pairs captured in this session's transcript. See `content-workspace-entities.ts`'s own header for the honestly-stated residual race window (sub-request, not whole-request — the same class of limitation already documented for `scripts/directus/backfill-media-world-scope.mjs`) |

### Phase 5 — Effective resolver over pinned sources

| Module | Proof |
| --- | --- |
| `app/lib/content-resolution/precedence.ts` (`comparePrecedence`, `selectWinner` — rank 2 workspace > rank 3 priority > rank 4 recency > rank 5 packageId, a total order) | 10 unit tests |
| `server/utils/world-effective-content.ts` (`resolveEffectiveContent`, `isEffectiveContentEnabled`, union-find grouping over `evidenceKeys`, `materialize`, `legacyAliases`) — behind `ELDRA_EFFECTIVE_CONTENT`, default off | 11 unit tests, including: |
| — the no-op theorem, executable | byte-for-byte: for data with no declared evidence, every group is a singleton, output order equals `resolveWorldContent`'s input order, and every entry's `presentation` equals `resolveContentPresentation` applied directly to its `data` |
| — evidence-based collapse | two packs sharing a slug with no evidence stay distinct; E3 (`baseRefs`) collapse; two live sources claiming the same base produce one entity plus a surfaced `conflicts` entry; a suppressed (`state:'disabled'`) entity is still returned (flagged), never silently dropped — consumers decide to filter it |
| `server/utils/world-content-catalogue.ts` (`getWorldContentCatalogue` now branches on the flag; flag-off path is byte-identical to before this phase; flag-on path consumes `resolveEffectiveContent` and uses each entry's pre-resolved `presentation` instead of recomputing it — §8.9's one named behavioral difference) | 26 unit tests (21 pre-existing + 5 new, all passing) |
| `server/utils/catalogue-entity-bridge.ts` (`getCatalogueBackedEntityRows` branches on the flag the same way; overlays an authored description onto the synthesized `.blocks` for item/spell/species/class — the categories whose legacy block shape has a description field at all; feat deliberately excluded, since `feat_core` never had one) | 13 unit tests (9 pre-existing + 4 new) |
| `server/utils/character-assembly.ts` (`resolveSlot` + its three wrappers now accept an optional `legacyAliases` redirect map — §15.3's "rename fix," generalized from slug renames to shadowing; a stored reference naming a now-shadowed legacy address still resolves to the effective winner) | 4 new tests (species redirect, no-alias-exists, alias-names-absent-entry, inventory-item redirect), 54/54 total in the file passing |

**Known, explicitly scoped-out refinement:** the admin bridge's authored-description overlay does not
also carry an authored *image* — no field exists on `CatalogueBridgeRow`/`CatalogueBridgeEnemyRow` to
receive one today (every category's `image` is hardcoded `null`; no gallery route has ever been wired
into these admin browsers). The **gameplay** catalogue projection (`getWorldContentCatalogue`) DOES
correctly carry an authored image through via `entry.presentation.image`, satisfying the primary
"one effective entity, visible in Studio and the gameplay catalogue" requirement for player-facing
surfaces. Extending the admin browser's row shape to also carry an image is a small, separable follow-up,
not started here.

### Phase 6 — Workspace sources and live binding

| Module | Proof |
| --- | --- |
| `server/utils/world-content-packs.ts` (`BindingMode`, extended `WorldContentPackBindingRecord`/`BINDING_FIELDS`/`normalizeBinding` to read `binding_mode`/`channel`/`workspace_id`/`priority`; `workspaceBindingPseudoPackageId`, `saveWorkspaceBinding`, `removeWorkspaceBinding`, `findWorkspaceBindingForWorld`) | 19 unit tests (12 pre-existing + 7 new), fake in-memory Directus store |
| `server/utils/world-content-sources.ts` (`loadWorkspaceAsSource` — materializes a workspace's entities into candidate shape, authored overlay pre-merged, image resolved against the caller's specific `worldId`; ONE batched `/files` lookup, never N+1; cached by `${workspaceId}::${worldId}` + the workspace's own monotonic `revision`, never a timestamp) | 8 unit tests |
| `server/utils/world-content-pack-binding.ts` (`bindWorkspaceLiveToWorld` — refuses while the flag is off or the workspace doesn't exist, writing nothing either way; `unbindWorkspaceFromWorld` — always works, even with the flag off, since it is the documented rollback path) | 17 unit tests (10 pre-existing + 7 new) |
| `server/utils/authorization.ts` (`world.content.bind_workspace` — new World capability, deliberately separate from `world.content.bind_pack`; derived automatically into `owner`/`gm` via `ALL_WORLD_CAPABILITIES`, absent from `worldbuilder`/`player`/`observer` — **no grant-provisioning script needed**, since World capabilities are role-derived, not grant-table-derived like platform capabilities) | 48/48 existing tests still passing, confirming no regression |
| `POST /api/worlds/[id]/content-workspace-binding.post.ts`, `DELETE .../content-workspace-binding/[workspaceId].delete.ts` | 10 route tests |

**Pinned-release identity of a live-bound workspace candidate**, for the record: `packageId = 'workspace.<workspaceId>'`
(a **dot**, not the colon the architecture doc's own pseudocode comment uses) — a colon fails
`app/lib/content-identity`'s `isPackageId` (the reverse-DNS `PACKAGE_ID_PATTERN` every real packageId
already satisfies), which `evidenceKeys`/`legacyAddress` both call on every candidate's `primaryKey`.
This was caught by a real test failure, not assumed; `packageVersion = 'live'` matches the doc exactly.

## Database guarantees versus application conventions (unchanged from Pass A, extended)

Same posture as content-workspaces-pass-a-handoff.md's own section: single-column UNIQUE constraints
are real database guarantees; composite/cross-collection invariants (e.g. "exactly one binding row per
World+workspace") are application-level, enforced the same read-then-upsert way `saveContentPackBinding`
already does for pinned bindings. The two new revision counters are real NOT NULL DEFAULT 0 columns,
verified against the disposable instance.

## Deployment readiness

Content-Workspace saves/imports now depend on a SECOND, direct-to-Postgres connection the
application runtime did not need before this review follow-up (`ELDRA_WORKSPACE_DB_URL`,
`server/utils/content-workspace-entity-atomic.ts`) — this is a real new deployment dependency, not a
code-only change, and the steps below supersede the EARLIER (incomplete) version of this section,
which did not mention it at all.

### Runtime configuration — exact names, behavior, and limits

| | |
| --- | --- |
| Env var the app reads | `ELDRA_WORKSPACE_DB_URL` — a full Postgres connection string (`postgres://eldra_workspace_writer:<password>@<host>:<port>/<database>`), read lazily on first use (`getPool()`), never at process start |
| Database/schema required | The SAME Postgres database Directus itself connects to (same `DB_HOST`/`DB_PORT`/`DB_DATABASE` your Directus deployment already uses) — not a separate database. Requires `content_workspace_entities`, `content_workspaces`, `content_entity_revisions` to exist (step 1) |
| Pool shape | `pg.Pool`, `max: 5`, `idleTimeoutMillis: 30_000`, `connectionTimeoutMillis: 5_000` — small and bounded on purpose (Studio editing/import is one interactive save or one admin-triggered import at a time, never a bulk path); identical values to the pre-existing `character-resource-atomic.ts` pool, for consistency, not shared capacity |
| SSL | Not forced or overridden by this code — `pg.Pool` honors whatever `sslmode=`/`ssl=` the connection string itself specifies (or its absence). If your Postgres requires TLS, the `ELDRA_WORKSPACE_DB_URL` value itself must include `?sslmode=require` (or the mode your provider needs) — this is a per-deployment connection-string concern, not something this module decides for you |
| Config absent | `getPool()` throws a `ConfigurationError` synchronously, before any network attempt. Every caller catches this (`withPersistenceFailureHandling`) and reports a typed `persistence-unavailable`/`persistence-unconfigured` outcome — never a crash, never a silently-accepted write |
| Role/table/privilege unavailable | The same catch path reports `persistence-failure` with the real Postgres error message. A save returns `503` (`content-workspace-persistence-unavailable`); an import returns `{ ok: false, stage: 'write-failed', retrySafe: true }` |
| Fails closed, pinned gameplay continues | Yes, structurally, not by convention: `getWorldContentCatalogue`'s flag-off path (the gameplay every existing World uses today) never imports `content-workspace-entity-atomic.ts` at all. A missing/broken `ELDRA_WORKSPACE_DB_URL` can only ever break a Studio SAVE or IMPORT — it cannot affect character sheets, maps, timelines, or any pinned-content read, with or without the resolver flag |
| Container network | **Not something this repository's own files can answer.** The Dockerfile ships `.output` only and the app previously only ever spoke to Directus over HTTP (`DIRECTUS_URL`) — reaching Postgres DIRECTLY is a genuinely new network requirement for the app container, introduced earlier by `character-resource-atomic.ts` and now shared by this module. **The operator must confirm the app's own runtime network can reach the same host:port Directus's `DB_HOST`/`DB_PORT` names** (they may not be the same reachability — Directus's container and the app's container are not guaranteed to share a network). No container/service name is assumed here because none is represented in this repository's own deployment files |
| Shared with character-resource persistence? | **No.** Separate role (`eldra_workspace_writer` vs. `eldra_resource_writer`), separate env var, separate pool, separate grant set (`content_workspace_entities`/`content_workspaces`/`content_entity_revisions` vs. `block_instances`/`entities`). Confirmed by reading both provisioning scripts and by querying `pg_auth_members` on the disposable instance — neither role is a member of the other, and neither grant set overlaps the other's tables |

### Provisioning — verified, not merely argued

`scripts/directus/create-workspace-entity-writer-role.mjs` — dry-run by default, `--confirm` to
apply, idempotent (checks `pg_roles` before `CREATE ROLE`; every `GRANT` is naturally idempotent).

**Correction made this pass: it used to generate a random password and PRINT it to stdout when the
operator had not supplied one.** That violated "no credential values printed" (stdout routinely
reaches CI logs/terminal scrollback/log aggregators) — fixed: the script now REFUSES to create a new
role unless `ELDRA_WORKSPACE_WRITER_PASSWORD` is already set by the operator (generated through their
own secret-management process, e.g. `openssl rand -hex 32`), and never invents or prints one.
Verified directly: dropped the role on the disposable instance, confirmed the refusal (`exit 1`, no
password in output) with the env var unset, then confirmed successful creation with it set.

**Effective privileges verified independently of the script's own grant list** (queried directly
against the disposable instance, not merely trusted): not superuser, cannot `CREATE ROLE`/`CREATE
DATABASE`, no `REPLICATION`, no `BYPASSRLS`; not a member of any other role; direct table grants are
EXACTLY `content_entity_revisions.{SELECT,INSERT}`, `content_workspace_entities.{SELECT,UPDATE}`,
`content_workspaces.{SELECT,UPDATE}` — nothing else; `PUBLIC` holds no table grant in schema `public`
(no ambient access); `USAGE` but not `CREATE` on schema `public`; `CONNECT` but not `CREATE` on the
database. No sequence grant is needed or held — every id this module writes is generated in JS
(`randomUUID()`), confirmed by checking `content_entity_revisions.id` has no sequence-backed column
default. A real write-probe (the exact `UPDATE`/`INSERT` statements the module issues, run AS the
role via `SET LOCAL ROLE` inside a transaction that is always rolled back) succeeded, and a `DELETE`
attempt under the same role was correctly denied — proving the grant boundary is real, not merely
untested in either direction.

A new script makes this verification repeatable: `scripts/directus/verify-workspace-writer.mjs`
(read-only by default; `--write-probe` is explicit opt-in and always rolls back — see its own header
for the exact guarantee). Both were run against the disposable instance for this report.

### Deployment sequence — exact commands, in order

**1. Additive schema/revision-counter provisioning** (idempotent, run once per deployment that
includes this pass):

```
node scripts/directus/bootstrap.mjs
# or the targeted script alone:
node scripts/directus/alter-content-workspaces-revision-counters.mjs
node scripts/directus/verify-content-workspaces-schema.mjs
```

**2. Workspace writer role — dry run** (prints the exact statements; makes no connection):

```
node scripts/directus/create-workspace-entity-writer-role.mjs
```

**3. Workspace writer role — reviewed apply**, using an **operator/admin provisioning credential**
(a role capable of `CREATE ROLE`/`GRANT` — e.g. the same one Directus's own `DB_USER` happens to be on
many single-tenant deployments, but confirm this for your own instance rather than assuming it; never
the Directus **application-service token**, which is an HTTP credential, not a Postgres one):

```
ELDRA_WORKSPACE_ADMIN_DB_URL="postgres://<admin-role>:<admin-password>@<your-db-host>:<port>/<database>"   # <- TEMPLATE: fill in your deployment's values
ELDRA_WORKSPACE_WRITER_PASSWORD="<generate your own, e.g. via: openssl rand -hex 32>"                        # <- TEMPLATE: never reuse another role's password
node scripts/directus/create-workspace-entity-writer-role.mjs --confirm
```

**4. Secure runtime credential/configuration setup** — the **workspace writer runtime credential**
(distinct from both the admin credential above and the Directus application-service token) is set on
the APPLICATION's own runtime environment, not the database host:

```
ELDRA_WORKSPACE_DB_URL="postgres://eldra_workspace_writer:<the password from step 3>@<your-db-host>:<port>/<database>"   # <- TEMPLATE
```

Confirm the app's own deployment environment (however it already injects `DIRECTUS_URL`/
`DIRECTUS_TOKEN` today) can reach `<your-db-host>:<port>` — this is the network requirement noted in
the table above, specific to your topology and not something this repository can verify for you.

**5. Connection and effective-privilege verification**, before relying on anything in the steps below:

```
ELDRA_WORKSPACE_ADMIN_DB_URL="postgres://<admin-role>:<admin-password>@<your-db-host>:<port>/<database>"   # <- TEMPLATE
node scripts/directus/verify-workspace-writer.mjs
# optional, explicit opt-in, always rolls back -- see the script's own header:
node scripts/directus/verify-workspace-writer.mjs --write-probe
```

**6. Deploying with the resolver flag off:** The default. Every Phase 4/6 code path is reachable and
usable with `ELDRA_EFFECTIVE_CONTENT` unset — the presentation editor writes/reads
`authored_presentation` regardless of the flag (Phase 4 is independently deployable, per the
architecture doc's own phase table). What the flag gates is specifically: whether
`getWorldContentCatalogue`/`catalogue-entity-bridge.ts` consume the effective resolver's output, and
whether `POST .../content-workspace-binding` is allowed to succeed at all (`bindWorkspaceLiveToWorld`
refuses with `409 effective-content-disabled` while the flag is off). Deploying this pass with the
flag off is therefore safe and changes zero observable behavior for any existing World — proven by the
no-op theorem test, not merely argued.

**7. Read-only resolver audit** (before enabling the flag): Run the full test suite (confirms the no-op
theorem holds against this codebase's actual resolvers) and, if real production data is available,
compare `GET /api/worlds/:id/catalogue`'s response with the flag off vs. a staging deployment with the
flag on for the same World — they must be byte-identical for any World with no workspace entities
carrying `contentEntityId`/`baseRefs`/`curatedFrom`/`slugAliases` (true for every World today, since
no Studio edit has ever been saved in production).

**8. Explicit feature enablement:** `ELDRA_EFFECTIVE_CONTENT=true` (or `1`) in the deployment's
environment. Takes effect on the next request with no restart-specific requirement beyond however the
deployment already picks up environment changes (same posture as every other env-gated feature in
this codebase). **Platform-admin grant refresh is NOT required for this step** — no new platform
capability was added (Phase 4/6 reuse the existing `platform.contentworkspace.edit`/`.view`); the one
new capability (`world.content.bind_workspace`) is a World capability, derived automatically from role
(`owner`/`gm`) via `ALL_WORLD_CAPABILITIES` — confirmed by re-reading `WORLD_ROLE_CAPABILITIES`'s own
derivation and by the full existing `authorization.test.ts` suite passing unmodified. **Verifying the
Directus application-service token's own write access remains a standing, UNRESOLVED prerequisite
from Pass A** — nothing in this pass exercised `PATCH`/`DELETE` on `content_workspace_entities` or
`POST` on `content_entity_revisions`/`world_content_pack_bindings` with anything but an
admin-equivalent disposable token; the first real write after deployment is the practical
confirmation point.

**9. Solaris authoring/live-binding acceptance:** Use Pass A's existing API-only workflow
(`POST /api/content/workspaces`, `POST .../import`) to create and seed a workspace, then:

```
POST /api/worlds/<solarisWorldId>/content-workspace-binding
{ "workspaceId": "<workspaceId>" }
```

requiring `world.content.bind_workspace` (owner/GM role on that World) and the flag already enabled
(step 8) — the route 409s with `effective-content-disabled` otherwise, writing nothing. **Owner
browser acceptance: UI now exists (see "In-app UI" above); a real-browser walkthrough
has not been performed** — this repo has no component-rendering harness, matching Pass A's own Browse
panel's documented limitation. Checklist, in order, after deploying with the flag on and creating a
test workspace:

1. Game Admin → Content Studio → **Workspaces** tab. Create a workspace (or open an existing one).
2. **Import** → Provider collection → pick the same game system/collection Solaris's bound pack came
   from → Import (not dry run). Confirm the entity count on the workspace row increases.
3. Click an imported entity (e.g. Shortsword). Confirm the editor opens with its current title/
   description/image pre-filled as placeholders (inherited, not yet customized).
4. Edit the Description field, tab out. Confirm no error, and the live preview panel updates.
5. Reload the page, reopen the same entity. Confirm the edit persisted and shows a Revert control next
   to Description only (not next to untouched fields).
6. Click Revert on Description. Confirm it reverts to the original source text.
7. Edit Description again, choose an image via **Choose image…** (the existing Media Gallery picker,
   scoped to this World), save. Confirm the image appears in the preview.
8. Click **Bind live to this World**. Confirm the workspace row shows "Live-bound to this World."
9. Open the existing **Browse** tab (or an Items category page) for the same World and confirm the
   edited item shows the new description/image, and that there is still only ONE row for it (not a
   duplicate alongside the original pinned entry).
10. Open an existing character (created before this deployment) whose inventory references this item
    by its original package/slug. Confirm it still resolves and now shows the updated description —
    and that quantity/equipped/attuned/notes are unchanged.
11. **Unbind** the workspace. Confirm the World's Items browse reverts to the original pinned entry
    (the edit is preserved in the workspace, just no longer live).

**10. Non-destructive rollback:** Unbind the workspace (`DELETE .../content-workspace-binding/:workspaceId`
— works with the flag on OR off, by design) to return the World to its pinned bindings; separately, set
`ELDRA_EFFECTIVE_CONTENT` back to unset/false. **Order matters for a live-bound World specifically**:
unbind the workspace FIRST, then disable the flag — disabling the flag while a workspace is still
bound (`binding_mode: 'workspace'`) would leave that binding unresolvable (no pinned fallback exists
for a pseudo-packageId), per the architecture doc's own explicit warning ("do not require a blanket
flag disable as a harmless rollback if live bindings would then stop resolving"). For a World with no
live workspace binding, disabling the flag alone is sufficient and fully reverts to Pass A's
(pre-Phase-5) behavior — proven by the same no-op theorem. No data is deleted by any rollback step;
`content_workspace_entities.authored_presentation` rows are never touched by unbinding or disabling the
flag, only by an explicit revert/checkpoint call.

**Rolling back the workspace writer dependency itself** (distinct from the resolver flag above): unsetting
`ELDRA_WORKSPACE_DB_URL` is a valid, non-destructive way to disable EDITING/IMPORTING specifically — every
save/import fails closed (503 / incomplete, retry-safe) while every READ path (pinned gameplay, the
effective resolver if already enabled, existing live bindings) is completely unaffected, per the fail-closed
behavior documented in the runtime-configuration table above. The Postgres role itself never needs to be
revoked or dropped to achieve this; removing the application's own connection string is sufficient and
reversible (set it back, nothing was lost — no entity write happens outside a transaction that also records
its own history row).

### In-app UI (added this session)

| Component | What it does |
| --- | --- |
| `app/components/admin/studio/AdminContentStudioPanel.vue` | Extended with a two-tab switcher (Browse / Workspaces); Browse itself is untouched |
| `app/components/admin/studio/AdminStudioWorkspacesPanel.vue` | List/create a workspace; import (provider or release, with a dry-run preview); list a workspace's entities with search; open one in the editor; bind/unbind this workspace live to the current World, with the live-bound workspace clearly marked and a 409 `effective-content-disabled` response surfaced as a plain-language explanation rather than a raw error |
| `app/components/admin/studio/StudioEntityEditor.vue` | The one presentation editor (§12.3's "one implementation"): Title, Description, Notes, Source book/page, Image (via the existing `WorldMediaPicker.vue`, unchanged), each with its own Customized marker and per-field Revert, plus Revert-all and a named Checkpoint. Every save sends `expectedRevision`; a 409 shows the conflict banner and offers Reload rather than retrying silently. A live preview (reusing `ContentPresentationPanel.vue`, the same renderer Studio Browse/Character Sheet/Builder already use) shows the merged effective result next to the form |

**Verified:** `npm run build` (exit 0, no warnings), `npx eslint` on all three files (0 findings),
`npm run typecheck` (908, unchanged). **Not verified:** rendered in a real browser — this repo has no
component-rendering harness (no `@vue/test-utils`, no DOM env), the same documented limitation Pass
A's own Browse panel shipped with. Owner performs browser acceptance after deployment, per the
checklist below.

**UI scope deliberately narrower than the full architecture doc §12.3 editor:** Sections, Facts, Tags,
and Attribution have no edit control in this pass (still editable through the PATCH API directly; the
validation allowlist accepts all of them). "Customize in workspace W" from Browse's read-only rows
(turning an immutable release entry into a workspace-owned one) is also not wired — the UI described
above only edits entities a workspace already holds (imported via the Import form), which is sufficient
to exercise the brief's own acceptance scenario (import → edit → bind → see one effective item) but not
the full "customize any Browse row in place" convenience the architecture doc envisions for a later UI
pass.

## Second increment — review follow-up (concurrency, image propagation, Browse customization)

### 1. Save concurrency — now genuinely atomic

**The confirmed limitation.** Directus's collection-level filtered `PATCH` (`{query:{filter:{id,
revision}}, data}`) is NOT atomic compare-and-set — Directus's own `ItemsService` resolves matching
ids via a SEPARATE, earlier `SELECT`, then writes `WHERE id IN (keys)`, never re-checking the filter
at write time. The first increment's own module header already said this plainly; this increment
replaces it rather than continuing to document around it.

**The fix.** `server/utils/content-workspace-entity-atomic.ts` — a new module, directly mirroring
the ALREADY-ESTABLISHED pattern `server/utils/character-resource-atomic.ts` uses for a different
table family: real `pg` transactions issued directly against the Postgres instance Directus itself
uses. One function, `writeWorkspaceEntityOverrideAtomic`, performs ALL of the following in ONE
transaction:

1. `UPDATE content_workspace_entities SET <column> = $1::json, revision = revision + 1, updated_at = now() WHERE workspace_id = $2 AND content_entity_id = $3 AND revision = $4 RETURNING *` — the genuine compare-and-set. Zero rows updated is distinguished (not-found vs. conflict) by a read-only follow-up in the SAME transaction, then `ROLLBACK`.
2. `INSERT INTO content_entity_revisions (...)` — a history row, written on EVERY successful call now (not conditioned on whether the value textually changed).
3. `UPDATE content_workspaces SET revision = revision + 1, updated_at = now() WHERE id = $1` — the cache-witness counter, in the SAME transaction.

All three commit or roll back together. `revision = revision + 1` is itself a single atomic
statement (Postgres evaluates it under the row's own lock), so concurrent saves to DIFFERENT entities
in the SAME workspace each apply their own +1 without losing the other's.

`content-workspace-entities.ts`'s `writeOverrides` now calls this instead of the Directus PATCH; the
3 HTTP routes (PATCH, both DELETE overrides routes) gained a new `persistence-unavailable` → 503
branch, distinct from a 409 conflict.

**The import executor's own gap, found and fixed in the same pass.** `content-workspace-import.ts`
never bumped `content_workspaces.revision` at all (only `updated_at`, via the now-deleted
`touchContentWorkspace`) — meaning a live-bound World could keep serving a stale cached
materialization after an import added new entities. Fixed: `touchWorkspaceRevisionAtomic` (same
module, atomic single-statement increment) is called after a successful import with
`entitiesCreated > 0`.

**Least-privilege role, provisioned and verified, not assumed.** `scripts/directus/create-workspace-entity-writer-role.mjs` (dry-run by default, `--confirm` required) creates `eldra_workspace_writer`
with exactly: `CONNECT` on the database, `USAGE` on schema `public`, `SELECT, UPDATE` on
`content_workspace_entities`, `SELECT, UPDATE` on `content_workspaces`, `SELECT, INSERT` on
`content_entity_revisions`. No `DELETE` anywhere, no privilege on any other table, no sequence grant
(every id is JS-generated via `randomUUID()`, never a database default). **Run and verified against
the disposable instance** (idempotent — run twice, second run reported "already exists, password
untouched").

**Real concurrent integration tests — genuinely overlapping, not sequential-presented-as-concurrent.**
`tests/integration/content-workspace-entity-atomic.integration.test.ts`, 10 tests, run against the
disposable instance **using the `eldra_workspace_writer` role itself** (never admin) — proving the
grant set is sufficient, not merely assumed:

| Proof | Result |
| --- | --- |
| Two `Promise.all` saves at the same `expectedRevision` | Exactly one succeeds, one conflict; entity revision advances by exactly 1 (never 2); exactly one history row |
| A save racing a revert at the same revision | Exactly one applies; the other conflicts honestly |
| Two `Promise.all` saves to DIFFERENT entities, same workspace | Both survive; workspace revision advances by exactly 2 (never losing one bump to the other) |
| A subsequent read | Sees both entities' changes |
| `touchWorkspaceRevisionAtomic` racing an entity save, same workspace | Both bumps land (never 1) |
| Stale revision / nonexistent entity | Conflict / not-found, writing NOTHING (no entity change, no history row, no workspace bump) |

All 10 pass. Verified command:
```
ELDRA_WORKSPACE_DB_URL="postgres://eldra_workspace_writer:<password>@<disposable-host>:5432/directus" \
ELDRA_WORKSPACE_TEST_ADMIN_DB_URL="postgres://directus:<password>@<disposable-host>:5432/directus" \
pnpm run test:integration -- tests/integration/content-workspace-entity-atomic.integration.test.ts
```

**What is NOT claimed.** Checkpoint creation (`createEntityCheckpoint`) stays on the Directus REST
path — it mutates no revision-gated state (it only ever INSERTs an independent history row), so it
needs no atomic gate; multiple concurrent checkpoints simply coexist with no lost-update risk.

### 2. Real disposable end-to-end workflow

**What the previous integration proved, and what it didn't.** The first increment's disposable check
(`passa-integration.mjs`, Pass A) and this increment's own atomic-module integration tests prove
schema shape and the CAS mechanism in isolation. Neither one ever drove the full authored-edit →
resolve → character-reference → admin-bridge chain through the real server modules together. This
step closes that gap.

**Harness.** A new disposable-only script, run via `jiti` + the repo's own
`scripts/directus/lib/runtime-shim.mjs` (the same mechanism `passa-integration.mjs` uses) — never a
mock, every call goes through the REAL `server/utils/*.ts` module against the REAL disposable
Directus 11.12.0 / Postgres 16 containers. The disposable instance only ever had the Content
Workspace schema provisioned; `worlds`/`entities`/`block_instances`/`world_memberships`/
`eldra_accounts`/`eldra_identity_links`/`eldra_platform_grants` and `directus_files.world_id` did not
exist on it yet and were provisioned first (see "Schema provisioned this step" below) — all via the
existing idempotent `.mjs` scripts (`scripts/directus/create-world-memberships-schema.mjs`,
`create-eldra-accounts-schema.mjs`, `create-media-world-scope-schema.mjs`) plus one new, equally
idempotent, disposable-only script for the three foundational collections those `.mjs` scripts
assume already exist (`worlds`/`entities`/`block_instances` predate this codebase's own schema-script
convention — CLAUDE.md: "Worlds have historically been created directly in the Directus admin UI").
**The root-level `.sh` schema scripts (`create_eldra_directus_schema.sh` etc.) were never run** — they
hardcode a production-looking host and token and must not be executed from any session.

**The 12-step fixture workflow, run end to end, all real:**

1. Publish a fixture base item (`item`, one release, known identity/mechanics/fluff-image) via the
   real `publishContentPack`.
2. Create a World (`createWorld`, real owner membership) and pin the base release to it
   (`bindContentPackToWorld`).
3. Create a Content Workspace and import the release into it via the real Pass A import path
   (`importIntoWorkspace`).
4. Save an authored description + image override through the ACTUAL Pass B mutation path
   (`applyPresentationEdits`, real atomic CAS, real `eldra_workspace_writer` role) — the image
   override references a REAL `directus_files` row, uploaded through the real
   `uploadImageToDirectus` helper (see the bug this surfaced, below).
5. Enable `ELDRA_EFFECTIVE_CONTENT=true` and live-bind the workspace to the World
   (`bindWorkspaceLiveToWorld`).
6. Resolve the gameplay catalogue (`getWorldContentCatalogue`): **exactly one logical item**
   (pinned + workspace entry correctly collapsed by evidence), presentation reflects the authored
   edit, `itemMechanics`/`attunementRequired` byte-for-byte unchanged from before the edit.
7. Resolve an EXISTING character's inventory reference that still names the ORIGINAL pinned
   `(packageId, slug)` (not the workspace's own pseudo-package id): resolves via the legacy-alias
   redirect (`EffectiveCatalogue.legacyAliases`, `resolveSlot`'s own redirect branch) to the
   effective winner, shows the updated presentation, and `quantity`/`equipped`/`attuned`/`notes`
   are exactly as stored.
8. Resolve the admin bridge (`getCatalogueBackedEntityRows`): same authored description (overlaid
   onto `item_core.description`) and same authored image override as the gameplay catalogue.
   Explicit image suppression (override value `null`) reports an explicit `null` override and the
   effective presentation image is `null` — the source fluff art is never used as a fallback.
9. A SECOND World, pinned to the same release but never live-bound to the workspace, still sees the
   ORIGINAL presentation and ORIGINAL image — nothing leaked across Worlds.
10. Revert the description field (`revertPresentationPath`) — the inherited (source) value returns.
11. Unbind the workspace (`unbindWorkspaceFromWorld`) — the catalogue returns to exactly the pinned
    release, unauthored.
12. Confirmed: exactly ONE release exists for the fixture package for the whole workflow (editing/
    binding/unbinding never published anything), and the character's stored inventory record is
    still byte-identical — no resolution step ever rewrote it.

**Authorization**, using the real `can()` / `WORLD_ROLE_CAPABILITIES` exports from
`server/utils/authorization.ts` (not reimplemented): an account with no membership row for the World
is denied `world.read` (fail-closed); a representative non-admin, non-owner role (GM) may bind a
workspace (`world.content.bind_workspace`); a Player is correctly denied that same capability but
may still edit their own character. **Scope limit, stated plainly:** these `Principal` objects were
constructed directly from the real capability table rather than through the full
`resolvePrincipal(event)` HTTP pipeline, which needs a live H3Event/session this standalone script has
no Nitro process to provide — the capability *policy* is real and exercised; the *session-resolution*
path is not.

**Admin-token caveat, exactly as the review asked to state explicitly:** `DIRECTUS_TOKEN` throughout
this harness is the disposable instance's own admin token — it is what makes ordinary
`directusServiceRequest`-backed reads/writes work in a script with no Nitro process, and it does
**not** verify what a real production Directus service-account *policy* may or may not do. The one
place this harness exercises anything narrower than admin is deliberate: every concurrency-gated
entity write goes through `eldra_workspace_writer`, the real least-privilege Postgres role, proven
sufficient by the workflow actually completing with it.

**A real, previously-unnoticed production bug was found and fixed by this step** (exactly the kind of
defect a schema/shape-only integration cannot catch): `uploadImageToDirectus`
(`server/utils/entity-factory.ts`) and the Media Gallery's own upload route
(`server/api/worlds/[id]/media/upload.post.ts`) both built their `FormData` with the `file` field
FIRST and `world_id`/`title`/`description` AFTER it. Confirmed empirically against the live disposable
Directus 11.12.0 (`curl` with `file` first vs. `file` last): **Directus's multipart file handler
silently ignores every form field that arrives after `file`.** This means `world_id` has been `null`
on every file uploaded through either path in the current codebase, regardless of the `worldId`
argument passed — the Media Gallery route's own header comment claimed this was already fixed
("`world_id` ... set in the SAME multipart request... matching Directus's own documented behavior of
applying any other form field alongside `file`"); that claim was incorrect for field order. **Fixed**
in both files: `file` is now appended LAST. The pre-existing mocked unit test for the Media Gallery
route (`tests/server/api/worlds/[id]/media/upload.post.test.ts`) could not have caught this — it
asserts against the `FormData` object's own `.get()`, which is order-independent — so it still passes
unchanged, correctly, after the fix; re-run to confirm (17/17 pass, both files). This bug meant the
ENTIRE "effective authored image" feature (Item 3 above) would have resolved to `world-scope-
mismatch` for every real uploaded image in production before this fix, despite every unit test for
Item 3 passing — the unit tests mock `directusServiceRequest` and never exercised Directus's real
multipart parser. This is the concrete payoff of Item 2's own stated purpose.

**Schema provisioned this step, against the disposable instance only (never production):**
`worlds`, `entities`, `block_instances` (new, minimal, disposable-only script —
`provision-foundation-schema.mjs`, not committed, see Deployment note below), `world_memberships`,
`eldra_accounts`/`eldra_identity_links`/`eldra_platform_grants`, and `directus_files.world_id` — the
latter four via the EXISTING idempotent `.mjs` scripts, run for the first time against this
particular disposable instance. A `eldra_resource_writer` Postgres role (SELECT on `entities`;
SELECT/INSERT/UPDATE on `block_instances`) was also created, matching the grant set
`character-resource-atomic.ts`'s own module header already documents — `assembleCharacter` depends on
it for resource reads, unrelated to this task's own concurrency work but a hard dependency to exercise
the character-reference step at all.

**Not committed as a repo asset.** The end-to-end script itself (and the matching
`provision-foundation-schema.mjs`) stays in the session scratchpad, mirroring `passa-integration.mjs`'s
own precedent (a point-in-time disposable verification, not a permanent CI asset) — the production
bug fix it found IS committed (`entity-factory.ts`, `media/upload.post.ts`); the harness that found it
is not.

**Result: 42/42 checks passed** after the `uploadImageToDirectus`/upload-route fix (37/42 on the first
run — the 5 failures were the bug above plus two disposable-environment gaps: `ELDRA_RESOURCE_DB_URL`
unset, and a missing `catalogue_selection` block on the fixture character, both fixed in the harness
itself, not in application code).

### 3. Admin image propagation — now complete

**The gap.** The effective resolver supplies `presentation.image` for the GAMEPLAY catalogue
(`getWorldContentCatalogue`, already correct in the first increment), but `catalogue-entity-bridge.ts`
(the ADMIN category browsers' own data source) had no field to carry an image through at all —
`CatalogueBridgeRow.image` was hardcoded `null`.

**The fix — the EXISTING canonical image contract, not a new ad hoc field per category.**
`server/api/worlds/[id]/entities.get.ts` already computes one `derivedImageUrl` per row through a
single shared chain (`entityImageUrl(row) || extractImageUrl(blocks) || <fluff fallbacks>`), used by
EVERY category alike (legacy, homebrew, and catalogue-backed rows share this one function). The fix
adds exactly ONE new, centrally-defined signal this chain checks FIRST:
`CatalogueBridgeRow.effectiveImageOverride?: { url: string } | null`.

- `undefined` (no authored opinion, or the flag is off) → the existing chain runs completely
  unchanged, including every pre-existing fluff-derived image.
- `{ url }` (the author set an image) → wins outright, before the chain even runs.
- `null` (the author explicitly suppressed the image) → stops the chain with NO image — the one
  thing plain block data (`extractImageUrl`) could not express, since a falsy block field there
  just falls through to the next fallback instead of stopping.

`catalogue-entity-bridge.ts`'s new `effectiveImageOverrideFor(entry)` decides this by checking
`entry.customization.authoredFields` for a `path: 'image'` entry specifically — NOT the broader
"is this entry customized at all" flag, which would incorrectly treat "customized the description
only" as an image decision too. This required fixing a real, separate gap:
`customization.authoredFields` was previously always `[]` (dead code — never actually populated).
Fixed by threading `authoredPresentationPaths: string[]` from `WorkspaceEntityDetail.authoredPresentation`
through `WorkspaceSourceEntry` (`world-content-sources.ts`) → `EffectiveCandidate` →
`EffectiveEntity.customization.authoredFields` (`world-effective-content.ts`).

The precedence decision itself is a pure, centrally-defined function
(`app/lib/content-presentation/effective-image.ts`'s `resolveDerivedImageUrl`) — extracted there
rather than left inline in the legacy route specifically so it is unit-testable (`entities.get.ts`
relies on Nuxt's implicit auto-imports and cannot be imported directly under plain Vitest).

**What this does NOT cover, stated plainly.** Enemies/monsters have no `PresentationKind` at all
(`presentationKindForEntityType('enemy')` always returns `null`), so there is structurally nothing
to overlay for them — not an oversight, a real absence of an image surface for that category, exactly
as the brief's own "if a category has no image surface at all, report that distinction" asked for.

**Verified:** 4 new unit tests (`tests/lib/content-presentation/effective-image.test.ts`) proving the
precedence function itself (override wins outright; explicit suppression never falls through; absence
defers completely to the existing chain, byte-for-byte); 4 new tests in
`tests/server/utils/catalogue-entity-bridge.test.ts` proving `effectiveImageOverrideFor`'s three-way
decision end-to-end through `getCatalogueBackedEntityRows`. `entities.get.ts`'s own pre-existing lint
baseline (43) and typecheck contribution are both unchanged.

### 4. "Customize in workspace" from Studio Browse

**The gap.** The first increment's UI only edited entities a workspace already held (imported via
the Workspaces tab's own Import form) — there was no path from a Browse row directly into "edit this
in a workspace."

**The fix — reuses the existing import and editor, adds nothing new underneath.**
`app/components/admin/studio/StudioCustomizeInWorkspaceDialog.vue`, opened from a new "Customize in
workspace…" button inside Browse's existing detail rail
(`AdminContentStudioPanel.vue`). Shows the source (title/package/version/system) and lets the owner
pick an existing workspace (filtered client-side to matching `systemKey`) or create one inline
(reusing the same create form shape the Workspaces tab already has). On "Customize":

1. Calls the EXISTING import API (`POST /api/content/workspaces/:id/import`) with
   `{ source: { kind: 'release', packageId, version }, dryRun: false }` — the row's own WHOLE
   release, because the import API has no "import exactly this one slug" shape and this feature is
   scoped to reuse what exists, not add a new import mechanism. Idempotent by the import planner's
   own existing rules: re-customizing the same row reports "unchanged" for everything already
   present rather than duplicating it.
2. Locates the SPECIFIC entity this row addresses by exact address (title search, then filtered by
   exact `slug` client-side) — never the nearest match, never a guess. If the import succeeded but
   this specific entry didn't resolve (e.g. it landed in `unresolved`), that is reported honestly
   and nothing is opened.
3. On success, opens the existing shared editor (`StudioEntityEditor.vue`, the same one the
   Workspaces tab uses) inline, with a banner stating plainly that these edits are saved but not yet
   active in the current World until the workspace is bound live.

**Guarantees, by construction:** identity/provenance is whatever the real import path already
stamps (`baseRefs`/`sourceKey`), never invented here; workspace list/create reuses the existing
`GET`/`POST /api/content/workspaces` routes, so only workspaces the caller can already see are
offered; nothing here calls adopt-lineage, publish, or the live-binding route — no automatic lineage
adoption, publication, or live binding; a failed import reports the error and opens nothing; the
dialog is reachable only from Browse's own detail rail, scoped exactly as the brief asked ("do not
expand into broad category-page refactoring").

**Verified:** `npx eslint` on both files (0 new findings), `npm run typecheck` (908, unchanged),
`npm run build` (exit 0). **Not verified:** rendered in a real browser (no component-rendering
harness in this repo, the same stated limitation as the first increment's UI) and no automated test
exists for the dialog's own Vue logic for the same reason. The underlying guarantees it depends on
(import idempotency, exact-address lookup never guessing, no automatic lineage/publish/bind) are the
same primitives Item 2's end-to-end script exercises directly against the real import path, so the
dialog's own correctness rests on already-integration-proven ground even though the component itself
has no browser-level proof.

## Third increment — deployment completeness, multipart audit, import invalidation, Browse disclosure

The owner accepted the second increment's atomic-save and disposable workflow results, with three
bounded corrections still required before this pass is deployment-ready. All three are complete.

### 1. Workspace writer: deployment completeness

See "Deployment readiness" above — fully rewritten with the exact runtime configuration, a
provisioning/effective-privilege audit, and the 10-step deployment sequence. Summary of what changed
in the CODE (not just the docs):

- **`create-workspace-entity-writer-role.mjs` no longer generates or prints a credential.** It used
  to invent a random password and print it to stdout when the operator had not supplied one —
  violates "no credential values printed." Fixed: refuses (`exit 1`) to create a new role unless
  `ELDRA_WORKSPACE_WRITER_PASSWORD` is already set by the operator. Verified: dropped the role on the
  disposable instance, confirmed the refusal, then confirmed creation succeeds with the env var set
  and prints no credential.
- **New: `scripts/directus/verify-workspace-writer.mjs`** — read-only by default (role attributes,
  memberships, effective grants, PUBLIC/schema/database privileges, all queried directly rather than
  trusted from the provisioning script); `--write-probe` is explicit opt-in, runs the module's own
  exact statement shapes AS the role (via `SET LOCAL ROLE` inside one transaction), and ALWAYS rolls
  back. Also proves the role is correctly DENIED `DELETE` (no permission was ever granted beyond the
  documented five). 17/17 checks pass against the disposable instance, including the write probe;
  confirmed zero rows left behind afterward.

### 2. Multipart field-order audit — complete

**Audit matrix** (every active Directus file-creation call site found via `rg` for `new FormData()`
and `/files` POST, including the `form-data`-package call sites web `FormData` search would miss):

| Caller / helper | Metadata fields | Order found | World ownership source | Correction |
| --- | --- | --- | --- | --- |
| `uploadImageToDirectus` (`entity-factory.ts`) — character portraits | `world_id` | AFTER `file` | caller-supplied, already-verified `worldId` | **Fixed** (previous increment) |
| Media Gallery upload (`media/upload.post.ts`) | `title`, `description`, `world_id` | AFTER `file` | route's own verified `worldId` | **Fixed** (previous increment) |
| Entity block image upload (`entities/[id]/blocks/[blockKey]/upload-image.post.ts`) | `title`, `world_id` | AFTER `file` | entity's own owning World | **Fixed this increment** |
| Map pin image upload (`map-pins/upload-image.post.ts`) | `world_id` | AFTER `file` | the pin's map's own World | **Fixed this increment** |
| World page background upload (`worlds/[id]/presentation/upload-background.post.ts`) | `world_id` | AFTER `file` | route's verified `worldId` | **Fixed this increment** |
| Entity apply-image (`worlds/[id]/entities/[entityId]/apply-image.post.ts`) | `world_id` | AFTER `file` | entity's own owning World (cross-World mismatch already rejected before this) | **Fixed this increment** |
| World map upload (`directus-maps.ts`'s `uploadFile`, the LIVE path behind `worlds/[id]/maps/upload.post.ts`) | `world_id` | AFTER `file` | route's verified `worldId` | **Fixed this increment** — confirmed the SAME bug reproduces with the Node `form-data` package, not only the Web `FormData` used everywhere else |
| Platform setting image (`admin/upload-setting-image.post.ts`) | none (file only) | n/a | deliberately NONE — platform-scoped asset by design | **No correction needed** — nothing is appended after `file` because nothing else is appended at all |
| Legacy map upload (`map-data.ts`'s `uploadDirectusFile`) | none | n/a | n/a | **Untouched, correctly** — reachable only through the RETIRED 410 route `server/api/map-data/upload/[id].post.ts`; retired routes stay retired |

**Root cause, confirmed empirically, not assumed:** Directus 11.12.0's multipart file handler
silently ignores every form field placed AFTER `file` — reproduced directly with `curl` against the
live disposable instance (field-before-file: persisted; field-after-file: silently `null`), for both
client libraries this codebase uses. **Fix, applied identically everywhere a correction was needed:**
move `file` to be the LAST field appended, every other field before it. No upload infrastructure was
redesigned; this is a field-ordering correction to existing calls, nothing else.

**Tests strengthened to prove ORDER, not just presence.** Every affected test (and the two already-
fixed call sites' own tests, strengthened too) now asserts `[...formData.entries()]`'s actual
insertion order (`file` is the LAST key) rather than only `.get('world_id')` — the old assertion
shape is order-independent and would have passed even with the real bug. The one `form-data`-package
test (`directus-maps.test.ts`) asserts the real serialized multipart body's own byte position
(`name="world_id"` appears before `name="file"`), since that library has no `.entries()`.

**Real disposable verification**, exercising the actual production helpers unmodified (never a
hand-built "correct" FormData standing in for them) against the live disposable Directus: both
`uploadImageToDirectus` (Web `FormData`) and `directus-maps.ts`'s `uploadFile` (`form-data` package)
were called directly, and the resulting `directus_files` rows were read back and confirmed to carry
the correct `world_id`, filename, and file size. 8/8 checks pass.

**Legacy unowned-file review — read-only, no inference, no mutation.** New:
`scripts/directus/inventory-unowned-media.mjs`. Lists every `directus_files` row with `world_id IS
NULL` (via `/files`, not `/items/directus_files` — a Directus system collection has its own top-level
endpoint, confirmed directly: the `/items/` path 403s outright), then cross-references
`entities.image`, `maps.image`/`image_file`, `map_pins.image`, and
`world_page_presentations.background_file_id` as EVIDENCE only — reporting each unowned file as a
single-candidate match, conflicting evidence across several Worlds, or no evidence found, and NEVER
writing anything. There is no apply/confirm mode in this script at all; if ownership should actually
be assigned, that is a separate, explicit, human-reviewed mapping, deliberately not automated here.
`block_instances`'s own free-form image fields are NOT scanned (no fixed schema to search safely) —
a stated gap, not a silent one. Run against the disposable instance only for this report (5 files
found, all correctly reported as "no evidence" — they are this session's own earlier test uploads).

### 3. Import cache invalidation — failure/retry now correct

**The real defect, found by tracing, not assumed.** Two separate bugs, both in
`content-workspace-import.ts`'s post-write revision touch:

1. `touchWorkspaceRevisionAtomic` used to swallow a persistence failure internally (`console.error`
   only, `void` return) — its caller could not observe a failure at all, so an import whose entity
   writes succeeded but whose cache-witness touch failed still reported `ok: true`. **Fixed:** the
   function now returns `{ ok: true } | { ok: false; reason; message }`; the import executor checks
   the result and throws (caught by its own existing catch) when it fails, reporting
   `{ ok: false, stage: 'write-failed', retrySafe: true }` instead of a false success.
2. The touch was gated on `progress.entitiesCreated > 0`. Since the entity/snapshot writes and the
   revision touch are NOT one transaction (this module's own header already says the REST API has no
   cross-collection transaction), a process that writes the entities and then fails or crashes before
   the touch leaves a workspace whose entities are durably persisted but whose revision was never
   bumped. A RETRY of the same import plans those entities as `unchanged` (they already exist), so
   `entitiesCreated` is 0 on the retry, and the old gate skipped the touch a SECOND time — the cache
   stayed stale forever, while the retry reported a successful, complete import. **Fixed:** the touch
   now runs unconditionally on every successful (non-dry-run) import call. A true no-op re-import now
   bumps the revision one extra, harmless time (over-invalidating a cache is always safe;
   under-invalidating is not).

**Mocked failure-injection tests** (`tests/server/utils/content-workspace-import.test.ts`, new
`describe('cache witness repair on retry (Item 3)')` block, clearly labeled as using a mocked
`touchWorkspaceRevisionAtomic` — the "unchanged on retry" planner behavior around it is real, not
mocked): a revision-touch failure after a successful entity write is reported as failure, not
success (message names the cache witness); a retry (entity now classifies as `unchanged`, 0 created)
still calls the touch and repairs the witness, with zero duplicate writes.

**Real disposable proof**, failure injected into the REAL module (not simulated): in a fresh process,
`ELDRA_WORKSPACE_DB_URL` is unset before the first import call, so the touch fails with a genuine
`ConfigurationError` (no pool has been constructed yet, so there is no module-instance ambiguity to
work around); the connection string is then restored before the retry. All 6 required proofs pass
against the real disposable Directus/Postgres:

| Proof | Result |
| --- | --- |
| 1. Entity write succeeds | the entity row is durably present even though the overall call reports failure |
| 2/3. Revision advancement fails → reported as failure/incomplete | `ok: false`, `stage: 'write-failed'`, `retrySafe: true`; workspace revision unchanged (not silently bumped nor silently skipped) |
| 4. Retry repairs invalidation even though the entity now classifies as unchanged | revision advances by exactly 1 on the retry, with `entitiesCreated: 0` |
| 5. The next resolved read sees the imported change | `loadWorkspaceAsSource` (cache cleared) resolves the entity by its real, persisted slug |
| 6. No duplicate entity/snapshot, no lost authored data | exactly one entity, exactly one source snapshot, both before and after the retry |

11/11 checks pass. **Remaining partial-import visibility window, stated plainly:** between the
entity/snapshot writes landing and the revision touch succeeding, a concurrent reader using a
CACHED `loadWorkspaceAsSource` result (keyed by the OLD revision) would not yet see the new entity —
this window closes the moment the touch succeeds (this call or a retry), and is bounded by how long
that gap can last in practice (one failed network round-trip, not an unbounded duration). No reader
is ever told a partially-written import is complete; the caller-facing report always reflects
`ok: false` until the touch actually succeeds.

### 4. Browse "Customize in workspace" — whole-release disclosure

**Verified the disclosure did NOT already exist** (read the dialog's code directly) — this is a new
addition, not a duplicate. `StudioCustomizeInWorkspaceDialog.vue` now shows a standing notice as soon
as the dialog opens ("'Customize' imports this entry's WHOLE release ... there is no single-entry
import"), and interposes a mandatory preview step between selecting a destination workspace and the
real import: a **dry-run** call to the same existing import API (`dryRun: true`, nothing new invented)
shows the source release, the destination workspace, and the exact entry counts (added/unchanged/
changed/unresolved) that WOULD be imported — all BEFORE the "Confirm whole-release import & customize"
button becomes the one that actually writes anything. Switching the destination workspace invalidates
the preview (`needsFreshPreview`), so the counts shown always match the workspace about to receive the
write. Idempotency, the existing exact-address lookup, and the "no automatic adoption/publication/
binding" guarantees are all unchanged — this only adds a disclosure step before the existing write
path, nothing about the write path itself.

Selected-entry import (importing only the one row, not its whole release) is explicitly NOT
implemented, per this increment's own boundary.

**Verified:** `npx eslint` (0 findings), `npm run typecheck` (908, unchanged). **Not verified:**
rendered in a real browser (same repo-wide limitation as every other Studio UI component).

## Remaining / deferred
- **Mechanics editing (Phase 7), Rules Facet editing, publication/portable assets (Phase 8), channels
  (Phase 9), upstream reconciliation (Phase 10)** — all explicitly out of this pass's scope, per the
  architecture doc's own phase ordering and the Pass B brief's Boundaries section. Explicitly NOT
  started, per the brief's own instruction.
- **Sections, Facts, Tags, Attribution editor controls** — explicitly deferred per the review's own
  allowance; still editable through the PATCH API directly (the validation allowlist accepts all of
  them), just with no dedicated UI control yet.
- **Workspace-to-workspace import** — still deferred from Pass A, untouched here.
- **Application-service write-permission prerequisite** — unresolved since Pass A; now covers
  additional specific write operations (see Deployment §3). The review follow-up's own Item 2 used the
  disposable instance's admin token for ordinary reads/writes (stated explicitly, not hidden) and the
  real least-privilege `eldra_workspace_writer`/`eldra_resource_writer` roles for the two
  concurrency-gated write paths — a real production service-account *policy* audit (beyond "the schema
  exists and the grant set works under this one role") is still open.
- **Real browser verification.** Neither increment's UI (`StudioEntityEditor.vue`,
  `AdminStudioWorkspacesPanel.vue`, `StudioCustomizeInWorkspaceDialog.vue`) has been rendered in an
  actual browser — this repo has no component-rendering harness. Owner performs browser acceptance
  after deployment, per the checklist below. Build success is not a substitute for this and is not
  claimed as one.
- **The multipart field-order bug fix (Item 2) is scoped to the two call sites found** —
  `uploadImageToDirectus` and the Media Gallery upload route. No other `/files` POST call site was
  audited for the same ordering hazard; a repo-wide grep for `FormData` + `/files` would be the next
  step if this class of bug is suspected elsewhere.

## Unrelated work in the tree — preserve, do not touch

Same list as content-workspaces-pass-a-handoff.md's own: `character-decisions-presentation-backlog.md`,
`WorldDiceThreeRenderer.client.vue`, `WorldAuthoredDiceRenderer.vue`, `authoredD20Orientation.ts`,
`worldAuthoredDiceRendererAdapter.ts` and their tests, `.github/copilot-instructions.md`,
`content-source-architecture.md`, `eldra-web.code-workspace`, `scene-graph.md`, and the Phase 0
backfill files (`scripts/directus/backfill-media-world-scope.mjs` + its test).

**Newly noticed this pass, pre-existing, NOT touched:** `pnpm-lock.yaml` is sitting in an unmerged
(`UU`) state with literal leftover conflict markers in its own content, and there is an unrelated
pre-existing `git stash` entry (`WIP on main: 6c97930 feat(network): introduce Transportation
Junctions`, touching `package.json`/`pnpm-lock.yaml` — a `vitest`/`@3d-dice/dice-box` version bump,
nothing to do with Content Workspaces). Both predate this session's own work (the lockfile's last
real commit is from 2026-11-06). `git diff --check` reports this file's conflict markers; scoped to
every OTHER file (`git diff --check -- . ':!pnpm-lock.yaml'`) it is clean. Neither the conflicted
lockfile nor the stash entry was touched, reset, or resolved — flagged here as evidence for whoever
owns that other work, not addressed by this task.
