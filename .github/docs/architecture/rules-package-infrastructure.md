# Eldra Rules Package Infrastructure Architecture

Status: **Proposed (revision 1). Not implemented.** No code or collection described here exists in
the repository today.

Companion to [world-configuration.md](./world-configuration.md) and
[rules-engine.md](./rules-engine.md). Read world-configuration.md §5 (Data Model Sketch), §7 (Runtime
Flow), and §8 (Package Install / Selection Flow) first — this document is the concrete persistence
realization of those three sketches, plus the operational questions they left open (caching,
rollback, admin surface, sheet discovery).

---

# 1. Executive Summary

Five commits built a complete, pure, in-memory rules runtime:

```
loadRulesPackage(manifest, definitions, worldConfig)  →  RuntimeRulesPackage
resolveWorldConfig(manifest, worldId, stored)         →  ResolvedWorldConfig
createWorldRuntime(manifest, definitions, worldId, stored) → RulesPackageLoadResult
```

`createWorldRuntime` is the finished front door. **Nothing can call it, because none of its four
arguments can be produced.** There is no storage for a manifest, no storage for definitions, no
storage for a world's configuration, and no code path that assembles the three.

This document specifies exactly that missing layer, and its central claim is a subtraction:

> Rules Package Infrastructure is **two Directus collections, three server modules, one publish
> script, and one admin tab.** Every capability beyond that — import UI, drafts workflow,
> reconciliation, migration, receipts, actor state — is deferred, and each deferral is justified by a
> missing precondition rather than by scheduling.

Six decisions carry the design:

1. **Two collections, not six.** `rules_packages` (global) and `world_rules_config` (world-scoped).
   `actor_rules_state`, `actor_rules_snapshots`, `rules_audit_log`, `rules_package_receipts`, and
   `world_config_definitions` are all deferred — every one of them has zero readers in V1.

2. **The starter package is published by a script, not uploaded through a UI.** This is the largest
   simplification available and I recommend it strongly. `bootstrap.mjs` already establishes
   "run a Node script from a dev checkout against the real `DIRECTUS_URL`" as the sanctioned
   provisioning channel (CLAUDE.md Deployment Checklist). Reusing it for the first package deletes
   file upload, multipart handling, zip parsing, bundle integrity manifests, and the entire
   draft-on-failure workflow from V1 — none of which has a second consumer until translation
   adapters arrive.

3. **The activation gate that world-configuration.md §A.2 specifies is almost entirely inert in V1,
   and should not be built yet.** Its whole purpose is protecting `actor_rules_state` rows from a
   package switch. `actor_rules_state` does not exist in V1, so "does any actor state exist for this
   world?" is unconditionally *no*. Switching and rolling back are both free, and **rollback is not a
   feature — it is the activate action pointed at an older row.** Reset Rules State ships with
   `actor_rules_state`, not before it.

4. **Caching is one in-process `Map`, keyed by `(packageId, version, integrity)`, holding parsed
   package documents — not runtimes.** Immutable published releases make invalidation structurally
   impossible to get wrong. A second-level `RuntimeRulesPackage` cache is specified but explicitly
   not built, because nothing has profiled the graph build yet.

5. **Rolls execute on the server.** The sheet discovers roll types over HTTP and posts a roll
   request; it never receives the package. This keeps a multi-megabyte definitions blob off the wire,
   fixes the already-flagged client-side `Math.random()` seed, and matches the `RollEvent` flow §J
   assumes. `EldraDiceBox` is unchanged — it already consumes `RollEvent` and generates no randomness.

6. **Nothing migrates, again.** Same property that made World Configuration safe: a world with no
   `world_rules_config` row is unconfigured, unconfigured is legal, and the Rules Engine stays out of
   its request path entirely.

**What I think is wrong with the framing of this task**, stated plainly:

- **"Game Admin package management" is blocked on something nobody has listed as a dependency:
  `app/pages/worlds/[id]/admin.vue` has no authentication or authorization guard at all** (§2.3).
  Every destructive rules operation this milestone contemplates — activate, switch, disable a
  definition, later Reset Rules State — would land on a page any unauthenticated visitor can open.
  This is a prerequisite commit, not a polish item, and it is the one genuine blocker I found.
- **"Runtime activation" is not a persisted concept and should not become one.** Activation is a
  *write* to `world_rules_config`; the runtime is *derived* on demand from that row. Storing a
  "runtime" or an "activation record" would create a second source of truth that can disagree with
  the config row. There is no `is_active` boolean anywhere in this design.
- **Import should not be in V1 at all** (decision 2 above). The task lists importer integration as a
  question; my answer is that the correct V1 integration is *none*, and that this is a feature, not
  a gap.

---

# 2. Current Repo Findings

Separated into **Fact** (verified this session) and **Consequence**.

## 2.1 The pure runtime is complete and has no possible caller

**Fact.** `app/lib/rules/` now contains 21 modules including `world-config.ts`, `rules-package.ts`,
and `world-runtime.ts`. `createWorldRuntime(manifest, definitions, worldId, stored)` returns a
`RulesPackageLoadResult`. 649 tests pass. `grep` for `createWorldRuntime` outside `app/lib/rules/`
and `tests/` returns nothing.

**Consequence.** This layer is the only thing standing between a finished engine and a running one,
and its shape is fully determined by an existing function signature rather than open to design. The
persistence layer's job is to produce exactly four values.

## 2.2 `validatePackage` is implemented and is the publish gate

**Fact.** `app/lib/rules/package-validation.ts:156` —
`validatePackage(manifest, definitions): { ok, issues }`, where `issues` is
`PackageValidationIssue[]` carrying `severity`/`code`/`message`/`definitionId`.

**Consequence.** The publish path needs no new validation logic. Publication is one call plus a
severity filter (errors block, warnings do not), exactly as world-configuration.md §H.6 specifies.

## 2.3 Game Admin has no auth guard — the one real blocker

**Fact.** `app/pages/worlds/[id]/admin.vue:2-4` declares only
`definePageMeta({ layout: 'world-workspace' })`. No `middleware`. A repo-wide search for pages using
the admin guard returns exactly one file: `app/pages/admin/index.vue`. The guard itself exists and
works (`app/middleware/admin.ts`: authenticated + `isAdmin`, redirecting to `/login` or `/`).

**Consequence.** Game Admin is currently reachable by anyone with the URL. Today the blast radius is
grants and homebrew; with package activation it becomes "any visitor can change what game a world is
running." **A guard commit must precede any Rules write endpoint.** Note also that `middleware/admin.ts`
gates on *global* Directus admin, not per-world ownership — per-world permissions do not exist
(world-configuration.md §2.3), so global-admin-only is the correct V1 gate and the honest one.

## 2.4 `world_id` is an integer, but one collection disagrees

**Fact.** `create-character-sheet-schema.mjs:252` and `create-entity-relationship-schema.mjs:241`
both provision `world_id` as `integerField`. Every write site coerces with `Number(worldId)`
(`character-sheet-inventory.ts:116`, `character-sheet-inventory-transfers.ts:508`, …). But
`world_page_presentations` — the closest structural precedent for this milestone — keys on
`world_key` as a **string** (`presentation/[pageKey].get.ts`: `filter[world_key][_eq]`).

**Consequence.** `world_rules_config.world_id` should be **integer**, following the majority
convention and the two collections that actually model world-scoped records. The
`world_page_presentations` string key is the outlier and should not be copied.

## 2.5 An assumed ID type has already caused one production bug

**Fact.** `create-scene-layer-objects-schema.mjs:120-139` contains a bespoke `ensureFieldType`
migration helper, with a comment explaining it exists because `map_id` was provisioned as `integer`
while `maps.id` is actually a `uuid` — "this exact mismatch has been rejecting every write since the
collection was created."

**Consequence.** **Verify `worlds.id`'s actual Directus data type against the live instance before
writing the schema script.** §2.4's evidence is strong (every call site coerces to `Number`) but it
is inference from application code, not from the schema. This project has already paid for that
inference once. The verification is one `GET /fields/worlds/id`.

## 2.6 `bootstrap.mjs` is a hardcoded list

**Fact.** `scripts/directus/bootstrap.mjs:16-21` — a four-entry `SCRIPTS` array, run in sequence,
each script independently idempotent via check-before-create.

**Consequence.** Each new schema script is two changes: the file, and one line in that array.
Forgetting the second is silent — the script simply never runs on deploy. This is the failure mode
that left `scene_layer_objects` missing in production for weeks (CLAUDE.md Deployment Checklist).

## 2.7 Two Directus access patterns, and new code has no excuse

**Fact.** `server/utils/directus.ts` exports `directusServiceRequest`/`directusRequest`. CLAUDE.md
records that a local `dxFetch`/`baseUrl`/`token` trio is copy-pasted in 15+ files;
`presentation/[pageKey].get.ts` is one of them.

**Consequence.** rules-engine.md §21 already says this explicitly and it is repeated here because it
is the single easiest rule to violate by copy-pasting the nearest neighbouring route: **every module
in this milestone uses `directusServiceRequest`.** Package and config reads are service-token
operations by design — packages are global content, and config reads happen during roll execution
where there may be no user session to forward.

## 2.8 The preview-then-save import precedent exists but is content-only

**Fact.** `server/api/import/preview/5etools` and `server/api/import/save/5etools` implement the
5etools *content* pipeline (entities, blocks, `import_source` provenance).

**Consequence.** The pattern is proven and available when Rules Package import eventually lands, but
per ADR-018 content and mechanics import independently — this milestone touches neither directory.

---

# 3. The Fifteen Answers

## Q1 — Where should Rules Packages be stored?

**Directus, in a new global `rules_packages` collection.** Not on disk, not in the repo at runtime.

The decisive constraint is deployment shape, not preference: the production container is built from
`Dockerfile` and contains **only `.output`** — no `package.json`, no `scripts/`, no source
(CLAUDE.md). A disk-backed package directory would not exist in production. Directus is the only
storage the running app can reach.

Repo-committed JSON under `packages/` is **authoring source material**, read by the publish script
from a developer checkout, never by the running application.

Scope: **global, not world-scoped.** A package is content shared across worlds; the binding of a
package to a world lives in `world_rules_config`. This mirrors how `entities` are world-scoped while
`app_settings` is global.

## Q2 — How should package versions be represented?

**`(package_id, version)` as a composite identity, one row per version, unique together.**
`version` is semver text. `package_id` is reverse-DNS and never changes.

- Multiple versions of the same `package_id` coexist as sibling rows — required for pinning and for
  rollback to mean anything.
- A world references `(package_id, version)`, never the row's `id` (a surrogate uuid that would break
  if a row were ever recreated) and never an embedded copy of the package.
- Published rows are **never updated**. A new version is an insert.

`engine_api_version` and `state_schema_version` are separate columns and separate concepts
(rules-engine.md §25.1): an engine upgrade must not force republication, and a content fix must not
force actor-state migration. `world_config_version` is a **fourth, world-local** counter and belongs
to the other collection entirely.

## Q3 — How should published vs draft packages work?

**One `status` column (`draft` | `published`), enforced at activation, but V1 only ever writes
`published`.**

The semantics are fixed by rules-engine.md §11.8: a draft is a mutable workspace that may contain
`unresolved` nodes and may fail self-tests; it can never be activated or evaluated. A published
release is immutable and carries the `integrity` hash that is its identity.

The V1 simplification: **because there is no import endpoint and no authoring UI, nothing in V1 can
produce a draft.** The publish script validates and either inserts a `published` row or fails to the
console with the `PackageValidationIssue[]` printed. Drafts become reachable the moment import lands
and not before.

The column still ships in V1, for two reasons that are not speculative: `PackageStatus` already
exists in `types.ts`, and the activation check `status === 'published'` is a real gate that must be
written correctly the first time.

## Q4 — How should imported packages be tracked?

**By `manifest.origin`, which already exists in `types.ts` and travels inside the package.** Nothing
additional in V1.

`origin` is deliberately tiny (§11.9): who produced this, from what, at what version. Everything
richer — per-definition provenance, confidence grades, candidate mappings, review state — belongs to
a **Translation Receipt** stored *outside* the package (§22A.3), in a future
`rules_package_receipts` collection. Deferred, because there are no adapters to produce receipts.

The existing 5etools content importer is **not** a rules-package importer and is untouched. Per
ADR-018 the two pipelines are independent; conflating them is the mistake this answer exists to
prevent.

## Q5 — How should Game Admin manage packages?

**One new tab in the existing page** — `{ key: 'rules', label: 'Rules', icon: 'i-lucide-scale' }` in
`app/pages/worlds/[id]/admin.vue`'s `panels` array — with panel bodies extracted into
`app/components/admin/rules/*`, following the `AdminHomebrewForgePanel.vue` precedent rather than
adding ~600 lines to a 1,369-line page.

**Prerequisite, not optional:** the auth guard from §2.3 must land first.

V1 tab contents:

| Section | Read | Write |
|---|---|---|
| Active package + version + integrity status | ✓ | activate / switch |
| Installed packages (global list, envelope columns only) | ✓ | — |
| Validation issues from the active package, grouped by severity | ✓ | — |
| Optional rules, generated from `manifest.optionalRules[]` | ✓ | edit values |
| Roll types | ✓ | enable / disable / reorder / rebind |
| Binding gaps + unbound recommended roles | ✓ | — |

Deferred: package authoring, draft editing, import UI, migration/upgrade UI, reconciliation,
per-definition diffs, self-test runner, trace inspector, world override editing, Reset Rules State
(see Q6).

## Q6 — How should package activation work?

**Activation is a single write to `world_rules_config`, and a runtime is derived from it on demand.
There is no activation record and no `is_active` flag.**

```
POST /api/worlds/:id/rules/activate  { packageId, version }
  → load the rules_packages row for (packageId, version)
  → assert status === 'published'                    reject 409 if draft
  → assert engineApiVersion is satisfied by the engine  reject 409 if not
  → recompute integrity over the stored definitions; assert it matches integrity_hash
                                                      reject 409 loudly if not
  → upsert world_rules_config for this world:
        active_package_id / active_package_version / active_package_integrity
        world_config_version += 1
  → return the resolved summary (roll types, gaps, unbound roles)
```

**What is deliberately absent, and why:** world-configuration.md §A.2 gates a package switch behind
"does any `actor_rules_state` row exist for this world?" and, if so, requires a typed-confirmation
Reset Rules State. In V1 that query has exactly one possible answer — `actor_rules_state` does not
exist as a collection — so the gate is unreachable code and the confirmation dialog protects nothing.
**Both ship in the same commit as `actor_rules_state`, not before it.** Writing them now would mean
writing a destructive-confirmation flow that has never been exercised against real state, which is
the worst possible time to write one.

Switching packages and changing versions are therefore both unrestricted in V1. That is not a
loosening of §A.2 — it is §A.2's own condition evaluating to "free."

Deactivation is deleting the `world_rules_config` row: the world returns to unconfigured, which is a
legal state that behaves exactly as it does today.

## Q7 — How should activation rollback work?

**Rollback is not a distinct feature. It is `activate` pointed at an older `(packageId, version)`.**

This works because published releases are immutable and every version remains present as its own
row. There is no snapshot to restore, no inverse migration to run, and no history table to maintain
— which is precisely why no history table is proposed.

The boundary worth stating explicitly, so it is not discovered later: **rollback is safe in V1 only
because no actor state is bound to a package version.** Once `actor_rules_state` exists, rolling back
across a `state_schema_version` change requires the §25 migration machinery (dry run, per-actor
snapshot, transactional apply) and must be **refused** until that machinery exists. The refusal
condition is a comparison of two integers and should be written into the activation service at the
same time as `actor_rules_state`, not retrofitted.

## Q8 — How should runtime package caching work?

**One in-process `Map`, keyed by `` `${packageId}@${version}#${integrity}` ``, holding the parsed
package document (`{ manifest, definitions }`). Nothing else.**

```ts
// server/utils/rules-packages.ts
const packageCache = new Map<string, LoadedPackage>()
```

Why this is safe rather than merely convenient: published releases are immutable (§25.2), and the
key includes the integrity hash. A cache entry can therefore never be stale — if the content
changed, the integrity changed, and the key changed. There is no invalidation logic to write and
none to get wrong.

What it buys: the Directus round-trip and the JSON parse of what may be a multi-megabyte definitions
blob, on every roll.

**A second-level `RuntimeRulesPackage` cache is specified and deliberately not built.** Its key would
be `(packageId, version, integrity, worldId, worldConfigVersion)` — `world_config_version` is already
incremented on every config write specifically so this key can exist later (world-configuration.md
§K.6). It is not built because nobody has measured `RulesRegistry.create` + `DependencyGraph.build`
against a real package, and caching an unmeasured cost is how caches become bugs. Add it when a
profile justifies it; the key is reserved.

Two honest limitations, named now:

- **Per-process.** Multiple Nitro processes each hold their own copy. Memory duplication, never
  staleness. Same single-process characteristic as the existing SSE bridge (§2.10) but without that
  bridge's correctness consequences.
- **Unbounded.** V1 has one package. If the installed-package count ever grows, this needs an LRU
  bound — a `Map` with a size check, not a dependency.

**Directus must never be in the evaluation path** (§21.6). It appears exactly twice, both before
evaluation begins: load the package, load the config row.

## Q9 — What Directus collections are required?

**Exactly two.** Full column lists in §4.

| Collection | Scope | Purpose |
|---|---|---|
| `rules_packages` | global | immutable published releases |
| `world_rules_config` | one row per world | which package is active + this world's answers |

**Not in V1**, each with its blocking precondition:

| Collection | Blocked on |
|---|---|
| `actor_rules_state` | Character Sheet V2 — nothing writes canonical actor state yet |
| `actor_rules_snapshots` | `actor_rules_state` |
| `rules_audit_log` | a permissions/identity model to attribute entries to |
| `rules_package_receipts` | translation adapters |
| `world_config_definitions` | Transportation Phase 3 (§19/§20) |

**Not altered:** `worlds` (no new column — config lives in its own row per the
`world_page_presentations` precedent), `worlds.system_key` (live entity-block consumers),
`character_sheets`, `character_sheet_inventory`, `entities`, `block_instances`, `map_pins`,
`scene_layer_objects`.

## Q10 — How should Character Sheets discover the active package?

**Over HTTP, in two steps, with the package never leaving the server.**

```
GET  /api/worlds/:id/rules/summary
       → { configured: false }                                   unconfigured world
       → { configured: true, packageId, packageVersion,
           rollTypes: ResolvedRollType[],   // already ordered, enabled-only
           gaps, unboundRecommendedRoles, issues }

POST /api/worlds/:id/rules/roll   { rollTypeId, entityId? }
       → RollEvent
```

The sheet filters `rollTypes` to `surfaces ∋ 'sheet'` and renders a button per entry. This is what
deletes `ROLL_SPEC_ID` and the ad-hoc in-memory package from
`app/composables/useCharacterSheetRolls.ts`.

**Why rolls execute server-side**, given that the current implementation rolls in the browser:

- The alternative ships `manifest` + all `definitions` to the browser on every sheet load.
- The seed is currently `Math.random()`, already flagged in-repo as needing server generation; a
  server route fixes it as a side effect rather than as separate work.
- §J's `RollEvent` → `SessionRuntime.publish(event, visibility)` flow assumes a server origin.
  Building client-side now means rewriting when multiplayer lands.

`EldraDiceBox` does not change: it consumes a `RollEvent` and generates no randomness of its own.

**Sequencing note carried forward from world-configuration.md §9:** roll-type *discovery* does not
depend on the `ActorState` bridge. A `RollSpec` whose dice expression is self-contained (`1d20`)
reads no actor state. Discovery ships first; the bridge follows independently.

## Q11 — How should importers integrate?

**In V1: they do not, and that is the recommendation, not a gap.**

The only V1 ingestion path is `scripts/directus/publish-starter-package.mjs` reading repo-committed
JSON. That covers the actual V1 need — one package, authored in-repo, published deliberately — at a
fraction of the cost of an upload pipeline.

When Rules Package import does arrive it follows the proven local pattern (§2.8): preview → confirm
→ save, under `server/api/rules-packages/import/`, with failures persisted as `draft` rows carrying
their `validation_issues` rather than discarded.

The 5etools **content** importer is untouched (ADR-018).

## Q12 — What survives re-import?

**V1 has no re-import.** A new version is a new row and a repin; nothing is overwritten, so nothing
can be lost.

What survives a version change is determined by where data lives, and the split is already correct:

| Data | Lives in | Survives repin |
|---|---|---|
| Definitions, roll type declarations, required traits | `rules_packages` (per version) | replaced wholesale — that *is* the new version |
| World's optional-rule values and trait answers | `world_rules_config.settings` | **yes** — different table, keyed by world |
| World's roll-type enable/order/rebind | `world_rules_config.roll_types` | **yes** |

The interesting case is already implemented: after a repin, a world's stored override may name a
roll type the new version no longer declares. `resolveWorldConfig` handles this today — it emits an
`undeclared-world-roll-type-override` **warning** and contributes nothing to the resolved list
(world-configuration.md §10: "stale config after upgrade, not corruption"). The stale key is left in
storage untouched, so downgrading restores it.

True re-import with three-way merge requires receipts (§22A.11) and is explicitly out of scope.
Claiming re-import is safe before that machinery exists is how §31.11's predicted data loss happens.

## Q13 — What belongs to the World?

Exactly four facts, and no mechanics:

- **Which package version is active** — `(active_package_id, active_package_version)` plus the
  integrity witness.
- **Answers to declared settings** — `settings`, as `{ [kind]: { [key]: scalar } }`, including the
  engine-reserved kind `rules` for optional rules.
- **Roll-type surfacing** — `roll_types`, restricted to the closed operation set
  `enabled` / `order` / `rollSpec` / `visibility`.
- **Its own config version** — `world_config_version`, incremented on every write.

Deferred but reserved: `overrides` (the closed `WorldOverride` set, §21.5/ADR-012) and `bindings`
(persisted Binding Gap resolutions). `StoredWorldRulesConfig` in `types.ts` deliberately omits both,
and the collection should too until something reads them.

**The World computes nothing.** `quality: 4` is a world fact; `1 + quality * 0.1` is a package
interpretation (§19.1).

## Q14 — What belongs to the Package?

Everything mechanical: Definitions (Values, Collections, Modifiers, Sources, Actions, Roll Specs),
`semanticRoles` bindings, `modifierTypes` stacking policy, `requiredTraits` / `optionalRules` /
`rollTypes` declarations, layouts (§18), migrations (§25), and its own identity
(`packageId`, `version`, `engineApiVersion`, `stateSchemaVersion`, `integrity`, `origin`, `license`).

A package contains **no setting vocabulary** and no world's answers. It declares what it needs; it
never stores what a particular world said.

## Q15 — What belongs to the Runtime?

**Nothing persistent. The runtime is derived, in-process, and disposable.**

`RuntimeRulesPackage` = `{ packageId, packageVersion, manifest, registry, dependencyGraph, worldConfig }`,
frozen, produced by `createWorldRuntime` from the two persisted sides. It is never written anywhere.
Every configuration change produces a new one rather than mutating an existing one — which is what
makes `EvaluationSession`'s immutability guarantee hold without any invalidation protocol.

Derived values are **never persisted** (§13.2). The runtime is the same category of thing: a pure
function of `(package, world config)`, cheap to rebuild, dangerous to store.

---

# 4. Data Model

Following the `scene_layer_objects` pattern: **fixed envelope columns + typed JSON sections + one
translation module.**

## 4.1 `rules_packages` (new, global)

| Column | Type | Nullable | Why a column rather than JSON |
|---|---|---|---|
| `id` | uuid | no | PK |
| `package_id` | string | no | queried, joined, filtered |
| `version` | string | no | queried, pinned |
| `status` | string | no | `draft` \| `published` — activation gate + list filtering |
| `engine_api_version` | string | no | compatibility filtering |
| `state_schema_version` | integer | no | future migration decisions |
| `title` | string | no | listing UI without loading the blob |
| `integrity_hash` | string | yes | identity when published; null while draft (§11.8) |
| `license_id` | string | yes | compliance surfacing (§30) |
| `created_at` | timestamp | no | |
| `manifest` | json | no | whole manifest |
| `definitions` | json | no | all definitions incl. compiled ASTs |
| `validation_issues` | json | yes | `PackageValidationIssue[]` from the last validation |

Unique on `(package_id, version)`. Published rows are never updated.

Omitted from V1 with reasons: `layouts` (§18 layouts are unimplemented — an unread column implies a
feature exists), `migrations` (no migration executor — same argument, and world-configuration.md §5.1
already reaches this conclusion).

**Query discipline, load-bearing:** `definitions` may be several megabytes for a real package. List
and admin endpoints must request envelope columns explicitly and **never** `fields=*`. Only the
loader, for the single active version, reads `manifest` + `definitions`.

## 4.2 `world_rules_config` (new, world-scoped)

| Column | Type | Nullable | Notes |
|---|---|---|---|
| `id` | uuid | no | PK |
| `world_id` | integer | no | **unique**; see §2.4 and verify per §2.5 |
| `active_package_id` | string | no | |
| `active_package_version` | string | no | |
| `active_package_integrity` | string | yes | witness — a mismatch is a loud error, never silent |
| `world_config_version` | integer | no | default 1; incremented on every write (§K.6) |
| `settings` | json | no | `{ [kind]: { [key]: scalar } }`, `rules` reserved |
| `roll_types` | json | no | `{ [rollTypeId]: { enabled?, order?, rollSpec?, visibility? } }` |
| `created_at`, `updated_at` | timestamp | no | |

Unique on `world_id`. **Absence is legal** and means unconfigured (§3.3).

These columns are exactly `StoredWorldRulesConfig` (`types.ts`) plus the integrity witness and
timestamps — deliberately, so the translation module is a field rename and nothing more.

## 4.3 Directus provisioning

Two new scripts, registered in `bootstrap.mjs`'s `SCRIPTS` array (§2.6 — forgetting this line is
silent):

```
scripts/directus/create-rules-packages-schema.mjs
scripts/directus/create-world-rules-config-schema.mjs
```

Both follow the established `ensureCollection`/`ensureField` idempotent shape. Per CLAUDE.md's
Deployment Checklist, running `node scripts/directus/bootstrap.mjs` against the real instance remains
a **manual** post-deploy step, and per its closing note, **collection-schema permission and
collection-item CRUD permission are separate Directus concerns** — verify the service account can
actually read and write items, not merely that the collection exists.

---

# 5. Module Map

```
app/lib/rules/                          PURE — unchanged by this milestone except one addition
  canonicalize.ts                (new)  stable stringification for integrity hashing
  world-runtime.ts               (done) createWorldRuntime — the front door

server/utils/
  rules-packages.ts              (new)  listPackages / loadPublishedPackage / publishPackage
                                        + the in-process package cache (Q8)
  world-rules-config.ts          (new)  loadWorldRulesConfig / saveWorldRulesConfig
                                        row ⇄ StoredWorldRulesConfig translation
  world-runtime-service.ts       (new)  getWorldRuntime(worldId) — the assembly point

server/api/
  rules-packages/index.get.ts    (new)  installed packages, envelope columns only
  worlds/[id]/rules/summary.get.ts      (new)  what the sheet and admin tab read
  worlds/[id]/rules/activate.post.ts    (new)  Q6
  worlds/[id]/rules/config.patch.ts     (new)  optional rules + roll type overrides
  worlds/[id]/rules/roll.post.ts        (new)  server-side roll execution (Q10)

app/components/admin/rules/*     (new)  the Rules tab's panels
app/pages/worlds/[id]/admin.vue  (edit) one panels[] entry + one v-else-if branch + AUTH GUARD
app/composables/useCharacterSheetRolls.ts (edit) discovery replaces ROLL_SPEC_ID
```

`world-runtime-service.ts` is the single most important new module and the only one that knows both
halves exist:

```ts
// pseudocode — the whole point of the milestone
export async function getWorldRuntime(worldId: string) {
  const stored = await loadWorldRulesConfig(worldId)
  if (!stored) return { configured: false } as const

  const pkg = await loadPublishedPackage(stored.activePackageId, stored.activePackageVersion)
  const result = createWorldRuntime(pkg.manifest, pkg.definitions, worldId, stored)
  if (!result.ok) return { configured: true, ok: false, stage: result.stage, errors: result.errors }

  return { configured: true, ok: true, runtime: result.runtimePackage }
}
```

Three states, all of which callers must handle: **unconfigured** (legal, legacy behavior),
**configured but broken** (loud, diagnosable, never silently degraded to unconfigured), and **ready**.
Collapsing the middle state into the first is the single most likely implementation mistake in this
milestone — it would turn a corrupt package into "no rules configured" and hide the failure.

## 5.1 Integrity hashing

`canonicalize.ts` is pure and testable: recursive key-sorted serialization producing a stable string.
The SHA-256 itself happens in `server/utils/rules-packages.ts` via `node:crypto`, keeping
`app/lib/rules/` free of Node built-ins and browser-incompatible imports.

V1 uses simple sorted-key canonicalization, not full RFC 8785 JCS. The requirement is
*determinism across our own two call sites* (publish and verify), not cross-implementation
interoperability. Upgrade only if an external tool ever needs to reproduce the hash.

---

# 6. Runtime Flow

```
sheet loads
   └─ GET /api/worlds/:id/rules/summary
         └─ getWorldRuntime(worldId)
               ├─ loadWorldRulesConfig(worldId) ──── null? → { configured: false } → legacy sheet
               ├─ loadPublishedPackage(id, ver) ──── in-process cache, keyed by integrity
               │     └─ verify status / engineApiVersion / integrity
               └─ createWorldRuntime(manifest, definitions, worldId, stored)   [PURE]
                     ├─ resolveWorldConfig  → snapshot, rollTypes, gaps, roles
                     └─ loadRulesPackage    → registry, dependencyGraph
         └─ respond with rollTypes ∩ surfaces('sheet'), gaps, issues

roll button clicked
   └─ POST /api/worlds/:id/rules/roll { rollTypeId }
         ├─ getWorldRuntime(worldId)              (cached package; runtime rebuilt)
         ├─ resolve rollTypeId → rollSpec via runtime.worldConfig.rollTypes
         ├─ ActorState: {} in V1  →  bridge later  →  actor_rules_state eventually
         ├─ seed generated SERVER-SIDE
         └─ requestRoll({ rollSpecId, registry, graph, actorState, context }) → RollEvent
   └─ EldraDiceBox.rollResult(event, label)        [UNCHANGED]
```

Two properties make this safe, and both are inherited rather than newly invented:

- **Directus appears exactly twice, both before evaluation begins.**
- **The pure layer is not modified.** Everything above `createWorldRuntime` is new; everything below
  it shipped in Commits 1–5 and stays frozen.

---

# 7. Recommended Implementation Sequence

Narrow commits in dependency order, each independently reviewable and revertible. This is the same
rhythm the Rules Engine commits followed: schema, then a pure-adjacent module, then a consumer.

**Infra 1 — Game Admin auth guard.** *(prerequisite, §2.3)*
`app/pages/worlds/[id]/admin.vue` — add `middleware: 'admin'` to `definePageMeta`. One line, no new
concepts, and it must precede every write endpoint below. Worth landing on its own so the security
fix is not buried inside a feature diff.

**Infra 2 — `rules_packages` schema.**
`scripts/directus/create-rules-packages-schema.mjs` + the `bootstrap.mjs` line. Verify `worlds.id`'s
real type here too (§2.5), before Infra 4 needs it. Nothing reads the collection yet — zero risk.

**Infra 3 — Package canonicalization + loader.**
`app/lib/rules/canonicalize.ts` (+ tests), `server/utils/rules-packages.ts` with the cache.
`loadPublishedPackage` verifies status, `engineApiVersion`, and integrity.

**Infra 4 — Starter package + publish script.**
`packages/eldra-generic-d20/` and `scripts/directus/publish-starter-package.mjs`. A minimal
hand-authored d20 package: a few ability Values, one derived modifier, `roll:check`, `roll:luck`,
one optional rule, one `requiredTrait`, and `vitality`/`level` role bindings. **This is the first
package the engine ever runs — real content, not scaffolding**, and it is what makes every later
commit testable end to end.

**Infra 5 — `world_rules_config` schema + persistence.**
`scripts/directus/create-world-rules-config-schema.mjs` + `bootstrap.mjs`,
`server/utils/world-rules-config.ts` (row ⇄ `StoredWorldRulesConfig`).

**Infra 6 — `getWorldRuntime` + summary endpoint.**
`server/utils/world-runtime-service.ts`, `server/api/worlds/[id]/rules/summary.get.ts`. The first
moment the whole stack executes together. Three-state handling per §5.

**Infra 7 — Activation + config write endpoints.**
`activate.post.ts`, `config.patch.ts`. Bumps `world_config_version` on every write. No Reset Rules
State (Q6).

**Infra 8 — Game Admin Rules tab, read-only.**
`app/components/admin/rules/*` + one tab entry. Active package, validation issues, binding gaps,
unbound roles.

**Infra 9 — Game Admin Rules tab, write.**
Activate/switch, optional-rule editing, roll-type enable/disable/reorder/rebind.

**Infra 10 — Server-side roll execution.**
`server/api/worlds/[id]/rules/roll.post.ts`, server-generated seed.

**Infra 11 — Sheet roll-button discovery.**
`useCharacterSheetRolls.ts` + `sheet.vue` call sites only. Deletes `ROLL_SPEC_ID` and the ad-hoc
package. **Highest visible value in the milestone** — the first time a player touches the Rules
Engine — and it does not require the `ActorState` bridge.

After this milestone, in order: `actor_rules_state` (+ the §A.2 activation gate and Reset Rules State,
which belong with it), the legacy → `ActorState` bridge, then the tier-1 generated sheet.

---

# 8. Explicitly Deferred

| Deferred | Blocked on | Reserved by |
|---|---|---|
| Package import UI / upload / zip bundles | no second producer until adapters | §2.8's proven preview→save pattern |
| Draft editing workflow | no authoring UI | `status` column |
| Reset Rules State + §A.2 activation gate | `actor_rules_state` | Q6 |
| Migration execution (§25) | `actor_rules_state` + `stateSchemaVersion` divergence | `state_schema_version` column |
| `RuntimeRulesPackage` cache | a profile showing graph build is hot | `world_config_version` column |
| Translation receipts, re-import merge | adapters | `manifest.origin` |
| World overrides (`WorldOverride`), persisted binding resolutions | a concrete recurring need | omitted from `StoredWorldRulesConfig` on purpose |
| Roll visibility enforcement, Chat, Session Runtime | users, ownership, presence, multi-process transport | `RollEvent` + `visibility` |
| `world_config_definitions`, Transportation traits | Phase 3 traversal | `@world:<kind>.<key>` syntax already ships |
| Per-world permissions | no membership model | global-admin guard (Infra 1) |

Each row's middle column is a missing precondition, not a scheduling preference. That distinction is
the point of the table.

---

# 9. Project Knowledge Review

**1. What is the smallest infrastructure that lets a real package run in a real world?**

Infra 1–6, and nothing else: the two collections exist, one starter package is published, one world
points at it, and `GET /rules/summary` returns real resolved roll types. That is a working rules
runtime, before any admin UI or sheet integration. Infra 7–11 make it *usable*; Infra 1–6 make it
*real*.

**2. What is the single largest risk in this milestone?**

Silently collapsing "configured but broken" into "unconfigured" (§5). A world whose package fails to
load must produce a loud, diagnosable error in the admin tab — not fall back to the legacy sheet as
though no package were selected. The fallback path is correct for genuinely unconfigured worlds and
catastrophic for broken ones, and the two are one `if` apart. Second largest: forgetting the
`bootstrap.mjs` line (§2.6), which has already caused a production outage of exactly this kind.

**3. What does this milestone deliberately not simplify?**

The integrity hash. It would be easy to skip — nothing in V1 mutates a published row, and Directus
is trusted infrastructure. It stays because "immutable release" is either enforced or it is a
comment, and because the loader's cache correctness depends on it being true (Q8). It is one pure
function and one `node:crypto` call.

**4. Does this design keep World Configuration free of mechanics?**

Yes. `world_rules_config` stores identity (`active_package_*`), answers (`settings`), and
presentation selection (`roll_types`). No expression, no formula, no definition, no derived value.
The one place that could erode is `WorldOverride` — deliberately still omitted from both the type and
the collection.

**5. Is the runtime ever persisted?**

No, anywhere, by construction. `RuntimeRulesPackage` is frozen, derived, and disposable; every
configuration change produces a new one. Derived values are never persisted (§13.2), and the runtime
is the same category of artifact.
