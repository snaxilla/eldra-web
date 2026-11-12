# Content Workspaces — Pass A handoff

Durable recovery record for the Pass A implementation (Phases 1–3 of
[content-workspaces-and-studio.md](content-workspaces-and-studio.md)). A fresh session should be
able to continue from this file without repeating the investigation.

**Status:** Pass A implementation complete and awaiting commit/push/deployment approval. Verified
by unit tests, route tests, and a real-database integration run against a disposable instance.
**Browser acceptance is explicitly pending** — the owner performs it after deployment; see
"Post-deployment browser acceptance" below. **Nothing committed, pushed, or deployed. No production
operation of any kind was performed.**

## Position

| | |
| --- | --- |
| Branch | `main` |
| HEAD | `eca8783` feat(media): add World-scope backfill tool for pre-existing unowned images |
| Committed Pass A work | none — everything is working-tree only |

## Baseline measured at the start, and the result now

| Check | Baseline | After Pass A | After cleanup pass |
| --- | --- | --- | --- |
| `npx vitest run` | 283 files / **5760** tests | 293 files / **6027** tests, **all passing** | unchanged (no runtime behavior touched in cleanup) |
| `npm run typecheck` | **910** diagnostics | **910** — zero new | **910** — unchanged |
| `npx eslint .` | **5941** problems | 5942 (+1, `admin.vue` `import/first`) | **5941** — fixed, back to baseline exactly |
| `npm run build` | passed | passed | **passed** (re-run after the `admin.vue` import move) |
| `git diff --check` | clean | clean | **clean** |

**The one new lint finding — fixed.** `app/pages/worlds/[id]/admin.vue` had gone 49 → 50
`import/first` errors, because that page calls `definePageMeta()` above its imports (idiomatic
Nuxt) and the rule flags every import after the first non-import statement — all 49 pre-existing
ones, and the new `AdminContentStudioPanel` import made 50. The fix moves **only** that one new
import line above `definePageMeta()`, so it is never "after" a non-import statement and is not
flagged; the other 49 pre-existing imports are untouched, in their original place, and still
individually flagged by the same pre-existing violation — fixing those is a mass-reorganization of
an unrelated page, not in scope here. Confirmed: `app/pages/worlds/[id]/admin.vue` alone now
reports 49 problems (matching its own pre-Pass-A baseline exactly), and the full repository total
is back to **5941**, matching the measured starting baseline exactly — not merely "improved for an
explained reason," but identical.

## Disposable Directus (real integration target)

A throwaway Directus **11.12.0** + Postgres 16 pair on an isolated Docker network. Not production;
holds no real data.

```
http://127.0.0.1:18055   admin token: disposable-admin-token
containers: eldra-passa-disposable-directus, eldra-passa-disposable-db
network:    eldra-passa-disposable
```

Teardown once Pass A is reviewed:

```
docker rm -f eldra-passa-disposable-directus eldra-passa-disposable-db
docker network rm eldra-passa-disposable
```

### Directus behaviour verified first-hand against it

Observed, never assumed — Phase 0's lesson was that a mock can accept a request the real server
rejects.

| Behaviour | Observed |
| --- | --- |
| Adding `NOT NULL DEFAULT 'pinned'` to a populated table | Existing rows backfilled; inserts omitting it also get `pinned` |
| `schema.is_indexed: true` via the Fields API | Index really created |
| Single-column `schema.is_unique` | Enforced; duplicate insert → `400 RECORD_NOT_UNIQUE` |
| Collection that does not exist | `403 FORBIDDEN` on `/items/<c>` **and** `/collections/<c>` |
| Missing required field | `400 FAILED_VALIDATION`, one error per field |
| `POST /items/<c>` with an **array** | One transaction — one bad row rolls the whole batch back |
| Unauthenticated read of a new collection | `403 FORBIDDEN` (default-deny holds) |
| Collection-level `PATCH /items/<c>` | Needs `{ query \| keys, data }`; never reads `?filter=` (the Phase 0 bug) |
| Single-item `PATCH /items/<c>/<pk>` | Body is the plain field object, no wrapper |

## What exists, and how it was proven

### Phase 1 — identity and schema

| Module | Proof |
| --- | --- |
| `app/lib/content-identity/index.ts` | 30 unit tests — lineage-scoped addresses, the closed evidence list, contradictory evidence refused |
| `scripts/directus/lib/content-workspace-schema-spec.mjs` | 27 contract tests + provisioned **twice** against the disposable instance (second run created nothing) |
| `scripts/directus/create-content-workspaces-schema.mjs` | ditto |
| `scripts/directus/alter-world-content-pack-bindings-binding-modes.mjs` | every binding reads `pinned` afterwards |
| `scripts/directus/verify-content-workspaces-schema.mjs` | passes against the disposable instance |

### Phase 2 — read-only Content Studio

| Module | Proof |
| --- | --- |
| `app/components/admin/studio/studioSearchQuery.ts` | 21 unit tests — all nine categories, filters, facets, pagination, mints nothing |
| `app/components/admin/studio/AdminContentStudioPanel.vue` | **not rendered in a browser** — see Known limitations |
| `server/api/content/studio/search.get.ts` | route tests: needs platform capability **and** World access |

### Phase 3 — storage, import, snapshots, lineage

| Module | Proof |
| --- | --- |
| `server/utils/content-workspaces.ts` | 21 unit tests + real database round trip |
| `server/utils/content-workspace-import.ts` | 20 unit tests (ordering, partial failure, retry, batching) + real database round trip |
| `server/utils/content-package-lineages.ts` | 25 unit tests + real database round trip |
| `server/utils/content-lineage-compatibility.ts` | covered through the adopt route tests |
| Publisher guard in `publishContentPackRelease` | 9 end-to-end tests + real database round trip |
| 13 routes under `server/api/content/**` | 45 route tests (401/403/400/404/409/503) |

### Real-database integration result

`30/30` checks passed against the disposable Directus, exercising the real modules through jiti +
the repo's own runtime shim: workspace creation and the UNIQUE key, import, idempotent re-import,
changed-upstream review without advancing the base, snapshot retention, retry writing no second
snapshot, adoption conflict, legacy publication refused after adoption with **no new release row**,
owner publication allowed, un-adopt restoring legacy publishing, and the original pinned release
still loading byte-identical.

Script: `/tmp/claude-0/-opt-eldra-eldra-web/a4b8af87-c24f-4806-a632-6359f533a3ee/scratchpad/passa-integration.mjs`
(scratchpad, deliberately not committed). Re-run with:

```
cd /opt/eldra/eldra-web
DIRECTUS_URL=http://127.0.0.1:18055 DIRECTUS_TOKEN=disposable-admin-token \
  node /tmp/claude-0/-opt-eldra-eldra-web/a4b8af87-c24f-4806-a632-6359f533a3ee/scratchpad/passa-integration.mjs
```

## Database guarantees versus application conventions

**Enforced by Postgres** (single-column UNIQUE, which the Fields API does support): one workspace per
`workspace_key`; one entity per `identity_key` (workspace + contentEntityId); one entity per
`address_key`; one entity per `source_key`; one snapshot per `snapshot_key`; **one lineage row per
`package_id`** — so two workspaces cannot both own a lineage, and simultaneous adopters are
arbitrated by the constraint, not by a read-before-write.

**Application-only, and documented as such**: a legacy publish that read "unadopted" immediately
before an adoption committed can still insert its release — the Directus REST API offers no
transaction spanning two collections. Adopt a lineage while no publish or `packages:sync` run is in
flight. The import executor's cross-collection ordering (snapshot, then entity) is likewise ordered
and recoverable, not atomic; recovery is by content-addressed `snapshot_key`, so a retry resumes
rather than duplicating.

## Known limitations

1. **No browser verification of the Studio panel.** This repo has no component-rendering harness,
   and standing up a dev server against fixture data was out of scope for this pass. The pure
   filtering/pagination module is fully tested; the `.vue` shell is not. **This is by design, not
   an oversight: the owner performs browser acceptance after this is deployed** — see
   "Post-deployment browser acceptance" near the end of this document for the exact checklist. Do
   not treat anything else in this document as having satisfied this item.
2. **Workspace-to-workspace import is not implemented in Pass A — a known deferred requirement,
   not silently counted as completed.** The approved Phase 3 list includes importing from another
   authorized workspace alongside published releases and provider collections; only the latter two
   are supported. `validateImportRequest` **explicitly rejects** `source.kind: 'workspace'` with a
   400 (`"source.kind must be 'release' or 'provider'"`) rather than silently ignoring it or
   half-implementing it — see `app/lib/content-workspaces/validation.ts`. The owner has accepted
   deferring this. When it is picked up, the future implementation must preserve: canonical
   identity (`contentEntityId` carried, never reminted, across the copy), provenance (the source
   workspace recorded as a `baseSourceRef`/evidence, not re-authored as if newly imported from
   nowhere), permissions (the caller's access to *both* workspaces, not just the destination),
   accepted bases (copied as an accepted base with its own snapshot lineage, not merged into the
   destination's existing one), and authored channels (the source workspace's
   `authored_presentation`/`authored_mechanics`/`authored_facet` either carried over explicitly or
   explicitly dropped — never silently lost). No new implementation is requested in this cleanup
   pass.
3. **Pass A implements no editing.** No override channel is ever written; `authored_*` columns exist
   and stay empty.

## Remaining / deferred (Pass B and later)

Presentation editor, mechanics editor, Rules Facet editor, effective-entity collapse, live workspace
binding, channel behaviour, workspace release publication, portable asset ingestion/export,
reconciliation UI, enemies fold.

## Unrelated work in the tree — preserve, do not touch

`character-decisions-presentation-backlog.md` (spell-membership entry),
`WorldDiceThreeRenderer.client.vue`, `WorldAuthoredDiceRenderer.vue`, `authoredD20Orientation.ts`,
`worldAuthoredDiceRendererAdapter.ts` and their two tests, `.github/copilot-instructions.md`,
`content-source-architecture.md`, `eldra-web.code-workspace`, `scene-graph.md`.

Also uncommitted but complete and previously approved: the Phase 0 backfill request-format
correction (`scripts/directus/backfill-media-world-scope.mjs`, its test, and the deployment section
of `content-workspaces-and-studio.md`).

## Deployment — verified, not merely asserted

Pass A executed nothing against production. Everything below was checked against the actual
schema-missing error classification (`server/utils/content-workspace-schema.ts`) and the publisher
guard (`checkLineagePublication` inside `content-package-lineages.ts`), either by reading the code
path directly or by exercising it with the existing test suite — not inferred from the architecture
document's own description of itself.

**1. Behaviour with the new schema absent.** `withWorkspaceSchema` classifies a `403 FORBIDDEN`
from Directus (confirmed empirically against 11.12.0: this is what a nonexistent collection
returns, on both `/items/<c>` and `/collections/<c>`) into a named `ContentWorkspaceSchemaError`;
every `/api/content/**` route wraps its body in `withWorkspaceHttp`, which turns that into
`503 { code: 'content-workspace-schema-unavailable' }` with the exact remediation command in the
message — never a 500, never an empty success. Proven by
`tests/server/api/content/content-workspace-routes.test.ts`'s `'unprovisioned schema'` block and
`tests/server/utils/content-workspaces.test.ts`'s `'missing schema'` block (both currently passing).

**2. Deploying application code before schema provisioning.** `checkLineagePublication` (the
single-writer guard inside `publishContentPackRelease` — the one function that writes a
`content_packs` row) resolves "does the registry collection exist at all" via the *same*
`/collections/<c>` 403 check; when it does not exist, the function returns `{ allowed: true }`,
so **every existing publication path — direct publish, `publishContentSourceSelection`,
`refreshContentSource`, `packages:sync` — behaves exactly as it did before Pass A**, with zero
relationship to whether the new collections exist. This is not an inference from the architecture
document: `tests/server/utils/content-packs-lineage-guard.test.ts`'s
`'publishes normally when the registry collection is not provisioned at all'` test exercises the
real `publishContentPack`/`publishContentPackRelease` pipeline against exactly this condition and
passes. Existing gameplay (`getWorldContentCatalogue`, character resolution) reads only
`content_packs`/`world_content_pack_bindings`, neither of which Pass A's schema changes shape in an
incompatible way (`binding_mode` is additive with a default). **Deploying the application before
provisioning genuinely leaves the new routes inert (503) while everything that existed before Pass
A keeps working**, including publication to any lineage nobody has adopted — which, before this
deployment, is every lineage, because adoption itself does not yet exist on this instance.

**3. Exact schema commands.** Two narrow, single-purpose scripts exist and are the preferred
option for *this* deployment — each does only what this change needs, rather than re-running every
schema script the application has ever accumulated:

```
node scripts/directus/create-content-workspaces-schema.mjs
node scripts/directus/alter-world-content-pack-bindings-binding-modes.mjs
```

(equivalently, `pnpm run directus:create-content-workspaces` and
`pnpm run directus:alter-binding-modes` — both registered in `package.json`). Both are idempotent
(verified: a third consecutive run against the disposable instance created nothing and reported
every field as already existing) and independent of each other (the alter script only adds columns
to `world_content_pack_bindings`, which already exists from prior phases). CLAUDE.md's own
canonical deployment procedure's broader `node scripts/directus/bootstrap.mjs` — which runs these
two plus every other schema script the application has ever registered — remains the documented
"if unsure" fallback and is also idempotent; it is not wrong to use, just wider blast radius than
this specific change needs.

**4. Exact verification command.**

```
node scripts/directus/verify-content-workspaces-schema.mjs
```

(`pnpm run directus:verify-content-workspaces`). Checks, against the real instance: every declared
field exists with its `UNIQUE`/`NOT NULL` constraint actually set in the database (not merely
requested at creation time); the configured `DIRECTUS_TOKEN` can **read** items from every new
collection; an **unauthenticated** request to each new collection is refused (default-deny); and
that zero bindings sit outside `'pinned'` mode. It exits nonzero and prints every problem found if
any check fails — confirmed by having run it both with every check satisfied (exit 0) against the
disposable instance.

**5. Required service-account permissions — verified for read, inferred for write, flagged
honestly.** The verify script above proves the configured token can **read** the new collections
and that the public role cannot. It does **not** independently exercise a **write** (the Pass A
integration run used an admin-role disposable token, which bypasses Directus's per-collection
permission checks entirely, so it cannot stand in for the production service token's actual grant).
CLAUDE.md's own documented caution applies unchanged: *"Collection schema permission and collection
item CRUD permission are separate Directus concerns... verify both if a newly-provisioned
collection still 403s."* The strongest evidence available without touching production is
precedent: the same `DIRECTUS_TOKEN` already reads *and writes* `content_packs`,
`world_content_pack_bindings`, and `directus_files` (the Phase 0 backfill) today, in production,
with no separate permission-grant step ever having been documented for any of them — the schema
scripts for all of those collections are shaped identically to the two new ones (Directus Collections
API only, no DDL, no `pg` import). This makes it likely the token already holds instance-wide
access that extends automatically to the new collections, but this is an inference from precedent,
not an independent re-verification specific to these two collections. If the configured token
turns out to lack write access, the failure mode is still safe and diagnosable: the route's own
error mapping (`asHttpError`) only intercepts `ContentWorkspaceSchemaError` (a 403 on *schema*
access, i.e. missing collection); a 403 on an *item write* with the collection present would
propagate as a raw Directus error through the route — not a crash, but also not yet given its own
named classification. This is a genuine, remaining production prerequisite: confirm write access
once, either by having the operator attempt the first real `POST /api/content/workspaces` after
deployment (covered in the browser/API acceptance checklist below) or by checking the service
account's role/policy in the Directus admin UI before deploying.

**6. Restart.** Not needed. Both schema scripts use Directus's own Collections/Fields REST API
(never raw SQL/DDL — confirmed by reading them; neither imports `pg`), and Directus invalidates its
own schema cache when schema changes through that API. Confirmed empirically, repeatedly: the
disposable Directus container was never restarted across this entire implementation and
verification effort (including a provisioning run performed in a prior session and re-verified
hours later in this one), and every newly created collection/field was immediately usable in the
very next script invocation with no restart or manual cache-clear step.

**7. Cache behaviour affecting schema availability.** None beyond the automatic invalidation in
(6). Nothing Pass A adds introduces a new application-level cache that could make the schema
*appear* absent to the running Nitro process after it genuinely exists (no `clearContentPackCache`-
style cache exists for the workspace modules — every read in `content-workspaces.ts` and
`content-package-lineages.ts` goes straight to Directus on every call).

**8. Remaining production prerequisites not yet completed.** Exactly one, named above in (5): a
live confirmation that the production `DIRECTUS_TOKEN` can **write** to `content_workspaces`,
`content_workspace_entities`, `content_entity_source_snapshots`, `content_entity_revisions`,
`content_package_lineages` (the two append-only/schema-only collections,
`content_release_channels` and `content_pack_assets`, are not written by any Pass A code path and
need only the read/default-deny check above). Nothing else — schema shape, defaults, indexes,
uniqueness, default-deny, and read access are all independently verified against a real Directus
11.12.0, not merely asserted from the architecture document.

**Rollback — non-destructive by default.** See
[content-workspaces-and-studio.md §18.2](content-workspaces-and-studio.md#182-rollback-discipline-once-a-deployment-holds-real-data-added-in-review)
for the full procedure; summary:

- **Preserve every new collection and row.** Dropping them is only ever correct for a verified
  disposable environment or a production deployment confirmed to hold zero workspace rows and zero
  adopted lineages (query `content_workspaces`, `content_workspace_entities`,
  `content_package_lineages` to confirm) — an earlier revision of this handoff recommended
  dropping the collections unconditionally, which is wrong once any workspace exists.
- **The binding columns go inert either way** (`binding_mode` stays `'pinned'`, which is what every
  existing binding already is) — this part of the original note was correct and still holds.
- Rollback itself is: withdraw the Studio/`/api/content/**` mutation routes (reverting to a build
  that never registered them is sufficient); **before** doing so, check
  `content_package_lineages` for any adopted owner; if one exists, keep the publisher guard
  (`checkLineagePublication`, enforced inside `publishContentPackRelease` itself) in the build
  being deployed, or explicitly freeze the lineage first — never deploy an older build that would
  let `packages:sync`/refresh publish a second release to a lineage a workspace still owns.
- Stop any publish/refresh/sync run before starting the rollback review, and don't resume until the
  freeze-or-keep-guard decision above is made.
- Never auto-un-adopt as part of rollback (un-adopt is its own explicit, audited, reversible admin
  action, §11.4) and never delete data to restore legacy publishing — freezing or un-adopting
  already does that with zero data loss.
- Read/audit access to the new collections (`GET /api/content/workspaces`, `.../entities`,
  `GET /api/content/lineages`) may need to stay reachable during recovery even while the mutating
  routes are withdrawn, so an operator can confirm what a workspace holds before deciding.

No existing release, binding, or character reference is touched at any point, regardless of which
rollback path is taken.

## Post-deployment browser acceptance — PENDING, owner performs after deployment

**Browser verification of this pass has not been performed and is explicitly deferred to the
owner, after commit, push, and deployment.** Everything in this handoff and the final report that
says "proven" or "verified" refers to unit tests, route tests, and the real-database integration
run against the disposable instance — never a browser. No claim in this document should be read as
visual/UI verification having occurred.

**Where each capability actually lives**, so the checklist below never asks for a control that
doesn't exist:

| Capability | Where |
| --- | --- |
| Browse a World's content (search/filter/paginate/detail) | **UI** — Game Admin → Content Studio, and the underlying API (`GET /api/content/studio/search`) |
| Create / list / archive a workspace | **API only.** `POST/GET/PATCH /api/content/workspaces`. No button, form, or panel calls these — confirmed by grepping `app/` for every route path; nothing does |
| Import into a workspace | **API only.** `POST /api/content/workspaces/:id/import` |
| Adopt / transfer / release a package lineage | **API only.** `POST .../adopt-lineage`, `PUT`/`DELETE /api/content/lineages/:packageId/owner` |
| Edit presentation, mechanics, or a Rules Facet | **Not implemented at all** (Pass B+) |

So "browser acceptance" below is specifically a Content Studio Browse walkthrough — the only
Pass A surface with a UI. Workspace/import/adoption can only be exercised via `curl`/an API client
with a valid session, not by clicking anything, and are not part of the browser checklist for that
reason.

**Checklist** (perform in order, after the schema is provisioned per Deployment §3–4 above and the
application is deployed):

1. Sign in as an account holding `platform.contentworkspace.view` (and, for a World with existing
   Content Pack bindings, membership in that World), then open **Game Admin → Content Studio** for
   **Solaris**.
2. Confirm the category facets shown match Solaris's actually-bound Content Packs' categories
   (species/classes/backgrounds/feats/items/spells/monsters/subclasses/feature options — only the
   ones Solaris's bindings actually populate should show a nonzero count).
3. Search for a known item, e.g. **Shortsword** — confirm it appears with its title, category
   badge, and (if the bound pack supplies one) artwork.
4. Filter by category (e.g. Items) and by source package — confirm the result list and the facet
   counts both narrow consistently with each other.
5. If there are enough results to paginate, use Previous/Next and confirm the shown range
   (`Showing X–Y of Z`) advances correctly and never shows a duplicate or skipped row across a page
   boundary.
6. Open a result's detail rail — confirm it renders the same presentation (description, facts,
   sections, provenance) the existing category pages/Character Sheet show for that same entry, via
   the shared `ContentPresentationPanel.vue`, and shows "legacy entry — addressed by package and
   slug" (not a fabricated id) for anything with no `contentEntityId`.
7. Confirm there is **no** Edit, Save, or Customize control anywhere in Studio — Pass A is
   read-only by design; any such control appearing would itself be the regression to report.
8. Resize to a narrow/phone viewport — confirm the filter rail collapses to the "Filters (N)"
   toggle button described in the component, every control stays reachable and legible, and
   nothing requires horizontal scrolling.
9. Sign in (or use a second browser profile) as an ordinary player account with no platform
   capability and no `platform.contentworkspace.*` grant, and confirm: Content Studio does not
   appear as a navigable Game Admin section for them (or, if navigated to directly, the panel shows
   its permission-denied state rather than data); and a direct request to
   `GET /api/content/studio/search` or `GET /api/content/workspaces` with that account's session
   answers `403`, never data.
10. Open an existing character (created before this deployment) and confirm its inventory and
    available actions resolve exactly as before — Pass A reads no new table at character-resolution
    time (`resolveWorldContent`/`getWorldContentCatalogue` are unchanged), so this is a
    no-regression check, not a new-feature check.

**What this checklist does, and does not, cover** — stated explicitly so none of these get
conflated with one another:

- **Production schema provisioning**: covered by Deployment §3–4 above (`verify-content-workspaces-
  schema.mjs`'s own exit code), not by this checklist.
- **Browser acceptance**: exactly the ten steps above — the one thing genuinely pending.
- **Disposable-instance integration coverage already done**: workspace creation, import (release
  and provider), idempotent re-import, changed-upstream review, snapshot retention, lineage
  adoption/conflict, publisher refusal after adoption, un-adopt restoring legacy publishing — all
  30/30, against a real database, documented above. This checklist does not need to re-prove any of
  that; it is specifically the one thing a disposable Directus + Vitest cannot exercise (an actual
  browser rendering the Vue component against production data).
- **Remaining untested operation**: write access for the production `DIRECTUS_TOKEN` specifically
  (Deployment §5) — nothing in this checklist exercises workspace creation, since there is no UI
  path to it; if the operator wants that confirmed as part of this pass, it requires one API call
  (`POST /api/content/workspaces`) with a valid session, separate from the browser walkthrough.
