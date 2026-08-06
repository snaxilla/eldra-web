# Eldra Rules Engine Architecture

Status: **Partially implemented (revision 3).** The compiler front-end and the first runtime layers
exist under `app/lib/rules/`: core types, canonical Expression AST, tokenizer, parser, dependency
extraction, definition registry, reference validation, type validation, dependency graph, structural
dependency edges, static cycle detection, evaluation session, lazy evaluator, and the modifier
pipeline. Revision 3 revises §16 in response to what implementing that pipeline revealed; the
implementation does **not** yet match §16 as revised (see §16.17 and §35B).

Companion to [scene-graph.md](./scene-graph.md). Read that first — the Rules Engine deliberately
reuses its structural conventions (fixed envelope + typed sections, stable IDs, schema versions,
extension by new *types* rather than by changing the core model).

---

# 1. Executive Summary

Eldra needs a way to describe *how a game works* without changing application code. Today it has the
opposite: one game (D&D 5e) is welded into the application at every layer — Directus columns
(`class_name`, `species_name`, `level`), server math (`character-sheet-math.ts`: `ABILITIES`,
`SKILLS`, `proficiencyBonusForLevel`, `FULL_CASTER_CLASS_KEYS`, armor-class candidate logic), and an
8,877-line sheet page.

**Recommendation: a declarative, versioned Rules Package model with a small, safe, compiled
expression language, plus a narrow and explicitly-designed extension seam that is specified now and
built later.**

The core claim of this architecture:

> Eldra Core knows about **Values**, **Modifiers**, **Collections**, **Actions**, and **Rolls**.
> It does not know about Attributes, Skills, Saves, Hit Points, Classes, or Levels.
> Those are things a Rules Package *builds* out of the five primitives.

The mechanism that makes this survivable — that stops "TTRPG-agnostic" from meaning "the rest of the
application can no longer do anything" — is **Semantic Roles**: a package may declare that a value it
defined *plays the role of* `vitality` or `movement.speed`. Core never requires a role. Subsystems
(Transportation, token bars, initiative, encumbrance) *ask* for roles and degrade visibly when a
package doesn't provide one. This is the single most important idea in this document.

**Second recommendation (added in revision 2): a Rules Translation and Import Layer.** The engine
evaluates exactly one format — the native Eldra Rules Package. Everything else reaches that format
through **adapters**, via a compiler-style pipeline:

```
Source Format → Source Adapter → Translation Bundle (IR) → Validation & Reconciliation
              → Native Rules Package (draft → published) → Rules Engine
```

The engine never learns that Foundry, Roll20, or 5e.tools exist. Three findings make this concrete
rather than aspirational:

- **Eldra's 5e.tools importer is already an adapter.** `app/lib/importers/*` are *pure functions*
  (`preview5eToolsSpells(payload) → EldraImportPreviewResult`) with zero I/O; persistence lives in a
  separate module. The parse/persist split the pipeline requires already exists (§2.11).
- **The source data is far more mechanical than the importer currently extracts.** Real 5e.tools
  class data contains `hd: {number:1, faces:10}`, `proficiency: ["str","con"]`,
  `startingProficiencies.skills: [{choose:{from:[…],count:2}}]`, and
  `multiclassing.requirements: {or:[{str:13,dex:13}]}` — a dice spec, save proficiencies, a
  **machine-readable ChoiceSet**, and a **machine-readable predicate**. The current importer flattens
  all of it to prose through `textify()` (§2.12).
- **Foundry's most translatable system is its most generic one.** Simple Worldbuilding's
  `template.json` declares `health {value,min,max}` and `power {value,min,max}` — Eldra Resources —
  and `system.json` declares `primaryTokenAttribute: "health"`, which is *literally a Semantic Role
  binding* (§22A.8).

The product promise is deliberately **not** "everything imports perfectly." It is: *preserve and
translate as much structured work as safely possible, state precisely what could not be translated
and why, and hand the author an implementation-ready starting point instead of a blank package.*

Four things in this brief are, in my assessment, wrong or over-scoped, and I say so in full in
§31 and §35:

1. **The scope is too large to precede the Character Sheet refactor.** Building §§11–22 before
   touching sheets would stall the Eldra 2.0 roadmap for months. The kernel (§15) plus the sheet
   contract (§18) is what actually unblocks sheet work; the rest should follow real use cases.
2. **A purely declarative system will not stay expressive enough**, and every comparable platform
   proves it. The escape hatch must be *designed now* (§23.4) even though it must not be *built*
   in V1 — otherwise it gets bolted on later in the worst possible shape.
3. **"The Rules Package defines the Character Sheet" is only two-thirds achievable.** Fully
   generated sheets are usable but mediocre, and a beautiful sheet is one of Eldra's actual
   differentiators. Packages should supply *structure, semantics, and layout intent*; Eldra
   supplies the layout primitives. Packages must never supply markup.
4. **Revision 2 self-correction: this document's own §22.6 was too binary.** It concluded that
   Foundry/Roll20 mechanics "get reimplemented" and treated import as roughly all-or-nothing. That
   is correct for *perfect automatic conversion of arbitrary executable systems* and wrong as a
   product position. Graded, partial, reviewable translation is both feasible and valuable — the
   evidence is in §22A.8 and §22A.9. §22.6 is rewritten accordingly, and its narrow technical claim
   (you cannot execute or faithfully decompile a Foundry system) survives intact.

## 1.1 Revision history

| Rev | Change |
|---|---|
| 1 | Original architecture: package model, primitives, Semantic Roles, expressions, evaluation, modifiers, actions, sheet/world/transport contracts, persistence, security, migration. |
| 2 | Adds the **Rules Translation and Import Layer** (§22A) and the repository findings behind it (§2.11–§2.13). Revises §1, §3, §4, §10, §11, §22, §23, §30, §31, §32, §33, §34, §35. **No revision-1 architectural decision is reversed**; one conclusion (§22.6) is materially widened, and the first-commit recommendation gains three small concepts (§34.1). |
| 3 | **Resolves the modifier architecture** after implementation exposed seven under-specified areas. Rewrites §16 (adding §16.8–§16.18); revises §11.2, §12.3, §13.1, §14.2, §15.3, §27.1, ADR-009, the Appendix, and the status header; adds ADR-020, ADR-021, and §35B. Introduces `@source:` (§16.9), modifier attachment by reference (§16.10), collection-item source activation and the `SourceOverlay` (§16.8), `manifest.modifierTypes` (§16.3), structured suppression (§16.6), and explicit clamp bounds (§16.12). **Three revision-2 decisions are reversed**: unknown modifier types no longer default to `stack`, `base` is no longer a legal modifier phase, and `suppresses` is no longer an untyped string array. Companion revisions land in `expression-language.md` §8.2/§9. |
| 3 (amended) | **Fixes a contradiction found during revision-3 review**: revision 3 as first drafted retained the deployed rule *"a condition that does not yield `true` — including a `RulesError` — excludes the Modifier"*, which made §16.9's absent-`@source:`-field errors, §14.8's dynamic-cycle visibility guarantee, and §28's "visible degradation over silent corruption" all unreachable at once. Adds **§16.11A** (condition results and error propagation): `false` excludes, non-boolean and `error` propagate; first error aborts the target; errors are memoized, traced, and enriched with provenance but never re-labelled. Revises §14.4, §15.2, §15.4, §16.5, §16.9, §16.11, §16.13 (examples 2 and 8; adds example 9), §16.14, §16.15, §16.17, §16.18, §27.1, §28, and §35B. Adds ADR-022. Companion revisions in `expression-language.md` §7.1, §8.2, §9, §11. **A fourth revision-2 decision is reversed**: a non-`true` condition result no longer excludes a modifier — only a `false` one does. |

---

# 2. Current-State Repository Findings

Separated into **Fact** (observed), **Inference** (my reading), and consequences.

## 2.1 There is no rules engine, and no expression evaluation of any kind

**Fact.** `grep -rn "formula"` across `app/` and `server/` returns only display strings —
`attackFormula`, `damageFormula`, `formulaParts.join(' + ')` — all in `sheet.vue`, all
presentation. There is no parser, no evaluator, no AST, no dependency graph anywhere in the
repository. `package.json` contains no expression library, no schema validator (no `zod`), and no
test runner.

**Consequence.** This is a genuine greenfield within a brownfield application. Nothing has to be
unwound to introduce an evaluator — but also nothing exists to build on, including validation.

## 2.2 There are already *two* parallel "system" representations, and neither is the one you'd expect

**Fact.**

- `app/lib/systems/{types,dnd5e,index}.ts` (354 lines for dnd5e) is a **declarative,
  data-driven schema registry**: `EldraSystemSchema` → `EldraSchemaBlock[]` → `EldraSchemaField[]`
  with `type`, `default`, `min`, `max`, `options`, `importAliases`. It has a version field. It is
  registered in a keyed map (`systems: Record<string, EldraSystemSchema>`).
- Its only consumers are `app/lib/importers/*` (via `buildDefaultEntityData`), `dev-data.ts`, and
  three `server/api/systems/**` endpoints.
- The **character sheet does not use it at all.** Sheets use the `character_sheets` Directus
  collection — hardcoded 5e columns (`level`, `class_name`, `subclass_name`, `species_name`,
  `background_name`, `class_entity_id`, `species_entity_id`, `background_entity_id`) plus JSON
  columns (`ability_scores`, `combat_stats`, `proficiencies`, `resources`, `spellcasting`,
  `features`, `notes`, `choices`) — and `server/utils/character-sheet-*.ts` for logic.

**Inference.** `app/lib/systems/*` is the road not taken. It is closer in spirit to a Rules Package
than anything else in the repository, and it demonstrates the team already reaches for declarative
schema when building something new. It stalled because it only ever described *entity content
shape*, never *mechanics* — it can say "a class entity has a `hit_die` field" but not "hit points
are computed from hit die and Constitution."

**Consequence.** The Rules Engine must not become a *third* parallel representation. §33 sequences
`app/lib/systems/*` being subsumed rather than left to rot alongside.

## 2.3 `systemKey` is a decorative field, not a live seam

**Fact.** `systemKey` / `system_key` is stored on worlds and entities and set by importers, and
read in exactly these places: display (`index.vue` shows a badge), importer payload construction,
and `entity-factory.ts` copying it onto new entities. **No code branches on it.**
`getSystemByKey()` exists but is only called from the `server/api/systems/**` read endpoints.

**Inference.** CLAUDE.md describes `systemKey` as "a real seam." That is aspirational rather than
factual — it is a *reserved* seam. Nothing dispatches on it today.

**Consequence.** Good news: there is no legacy polymorphic dispatch to unwind, so the Rules Engine
can define what `systemKey` *means* rather than fight an existing meaning. Bad news: the assumption
that the codebase is already partly system-agnostic should be discarded. It is not.

## 2.4 5e is hardcoded deep in server logic

**Fact.** `server/utils/character-sheet-math.ts` is 1,497 lines containing, among others:
`abilityModifier(score) => floor((score-10)/2)`, a literal `ABILITIES` array, a literal `SKILLS`
array with ability bindings, `proficiencyBonusForLevel`, `FULL_CASTER_CLASS_KEYS` /
`HALF_CASTER_CLASS_KEYS` sets, `effectiveCasterLevel`, `buildSpellSlotRows`,
`buildArmorClassCandidates` (with armor/shield item inspection), `parseHitDieFaces`,
`calculatedMaxHpForSheet`. `character-sheet-resolver.ts` (671 lines) resolves class/species/
background/feat entities and parses free-text 5e entries into structured actions.

**Consequence.** This is the code the Rules Engine replaces, and it is a *reference corpus*: every
function in it is a worked example of a mechanic the engine must be able to express declaratively.
§34's first commit does not delete any of it. Deleting it is a Phase 2/3 concern, behind an adapter.

## 2.5 The sheet page is an unmanaged reactive dependency graph

**Fact.** `app/pages/worlds/[id]/entities/[entityId]/sheet.vue` is 8,877 lines containing **168
`computed(...)`** and **346 `function`** declarations in a single component scope.

**Inference.** This is the concrete form of the roadmap's "Performance optimization" item. Vue
recomputes a `computed` when any reactive dependency changes; with 168 of them in one scope,
chained, over deep objects, an unrelated edit plausibly invalidates a large fraction of the graph.
I did not profile this and am not claiming a specific cost — but the shape is exactly the
"unbounded reactive dependency chains" the brief names as a risk.

**Consequence.** The Rules Engine's dependency graph (§15) is not only a correctness feature. It is
the mechanism that replaces 168 ad-hoc computeds with one evaluator over a memoized, explicitly
invalidated value store. This is a performance argument for the engine, not against it.

## 2.6 The Scene Graph persistence pattern is the right precedent, and it is proven

**Fact.** `scene_layer_objects` uses: a fixed envelope of first-class columns
(`object_id`, `object_type`, `object_schema_version`, `visible`, `created_at`, …) + three typed JSON
sections (`geometry`, `properties`, `style`) + one `metadata` JSON for genuinely shapeless data.
`server/utils/scene-layer-objects.ts` is the sole translation boundary
(`toPersistenceRow`/`fromPersistenceRow`). Comments in the schema script state explicitly that new
object types "must not require new columns here."

**Consequence.** §21 adopts this pattern wholesale rather than inventing a new one. It is the
strongest, most recently-validated convention in the codebase.

## 2.7 Live reference resolution is an established, proven convention

**Fact.** The Transportation Network stores `{nodeRef}` / `{junctionRef}` instead of coordinates
and resolves position at render time (`resolveRoadCoordinateXY`), with cycle protection. Moving a
Pin moves every connected Road with no cached coordinate to invalidate.

**Consequence.** The same discipline applies directly to derived values (§13): store what was
*chosen*, resolve what is *computed*. This is not a new principle for this team — it is the one they
just spent three milestones proving.

## 2.8 The permissions model is close to nonexistent

**Fact.** Authorization is a single boolean: `isAdmin = role?.admin_access || role?.name ===
'Administrator'` (`useAuth.ts`), enforced by `middleware/admin.ts`. There is no campaign
membership, no GM/player distinction, no per-character ownership. Eldra 2.1 lists all of this as
future work.

**Consequence.** §24 must be designed as a *contract with a permissions system that does not exist
yet*. Concretely: the engine must tag values and rolls with a visibility classification from day
one, even though nothing enforces it yet, because retrofitting visibility onto an evaluator later
is far more expensive than carrying an unused field.

## 2.9 No tests, no schema validation, manual migrations

**Fact.** No test directory, no test runner, no validation library. CI runs `lint` + `typecheck`
only. Directus schema is provisioned by idempotent `.mjs` scripts run **manually** post-deploy
(`scripts/directus/bootstrap.mjs`); CLAUDE.md records that this exact gap caused
`scene_layer_objects` to be missing in production for weeks.

**Consequence.** This is the single largest *project* risk to the Rules Engine, larger than any
design question in this document. A rules engine whose arithmetic is not tested is a liability, and
this project currently has no way to test arithmetic. §26 treats introducing a test runner as a
**prerequisite of Phase 1, not a nice-to-have** — it is the first genuinely non-negotiable
recommendation here.

## 2.11 The 5e.tools importer is already an adapter — the pure/impure split exists

**Fact.** The import pipeline is already three cleanly separated stages:

```
server/api/import/preview/5etools/<type>.post.ts   parse JSON body
  → app/lib/importers/5etools-<type>.ts            preview5eToolsX(payload) → EldraImportPreviewResult
server/api/import/save/5etools/<type>.post.ts      same preview fn, then:
  → server/utils/import-save.ts                    persistImportedEntities({worldId, mode, items})
```

Every function in `app/lib/importers/*` (1,619 lines across 7 source types) is **pure**: it takes a
parsed JSON payload and returns a plain object. No `fetch`, no Directus, no filesystem, no clock
except `new Date().toISOString()` for a provenance stamp. `persistImportedEntities` is the only
writer and lives in a different module, consuming `EldraImportPreviewEntity[]`.

**Fact.** `EldraImportPreviewResult` already carries proto-IR structure: `provider`, `systemKey`,
`entityType`, `count`, `items`, **`warnings: string[]`**. `EldraImportPreviewEntity` already carries
per-item provenance: `provider`, `externalId`, `sourceBook`, `sourcePage`, and **`raw` — the complete
unmodified source fragment**.

**Fact.** `EldraImportProvider` is declared as `'5etools-json' | 'manual' | 'foundry-pack'` —
`foundry-pack` is a *reserved, unimplemented* provider already present in the type.

**Inference.** The brief's proposed migration Phase B ("separate source parsing from Directus
persistence") is **already complete**. This materially shortens the migration path (§22A.10) and is
the single most useful finding of this investigation.

**Consequence.** The 5e.tools importer is not merely a candidate first adapter — it is structurally
an adapter already, missing only a richer output type and a provenance/confidence sidecar.

## 2.12 The importer discards machine-readable mechanics that exist in the source

**Fact**, from the live dataset at `/opt/eldra/datasets/5etools-src`:

| Source data (real) | Current importer behavior |
|---|---|
| `hd: {number: 1, faces: 10}` | `normalizeHitDie()` → `"d10"` (string) |
| `proficiency: ["str","con"]` | `normalizeSavingThrows()` → `"str, con"` (string) |
| `startingProficiencies.skills: [{choose:{from:[8 skills],count:2}}]` | `normalizeProficiencyList()` → `textify()` → `JSON.stringify` fallback, embedded in a text field |
| `multiclassing.requirements: {or:[{str:13,dex:13}]}` | not read at all |
| `classFeature[]` (50 entries, each with `level`) | not read at all; `classFeatures` textified into `description` |
| item `dmg1: "1d4"`, `dmgType: "S"`, `ac: 2`, `bonusWeapon: "+1"` | items importer reads some; magic bonuses largely textified |
| monster `hp: {average:13, formula:"3d8"}`, `speed:{walk:20,fly:50}` | textified |

**Inference.** 5e.tools is substantially more structured than the current importer exploits. A
`{choose:{from,count}}` is a ChoiceSet. A `{or:[{str:13}]}` is a predicate. `{number,faces}` is a
dice spec. `classFeature[].level` is a Progression. These are not heuristic reconstructions — they
are already the right *shape* and are being deliberately flattened because the destination
(`block_instances.data` text fields) cannot hold them.

**Consequence.** The strongest single argument for a Translation IR: **the destination format, not
the source data, is what currently loses the mechanics.** Point the same parsers at a richer target
and most of this survives (§22A.10).

## 2.13 Import provenance and de-duplication are half-built

**Fact.** The `import_source` block (`app/lib/systems/dnd5e.ts`) declares `provider`, `external_id`,
`source_book`, `source_page`, `source_url`, `imported_at`, `import_version`, `hash`, `raw_json`.
In practice `hash` is always written as `''` and `import_version` always as `'preview'` — declared
but unused.

**Fact.** `persistImportedEntities` de-duplicates on `(world_id, entity_type, slug)`, **not** on
`externalId` — even though `externalId` is computed (`${name}__${source}`) and stored. An upstream
rename changes the slug and silently creates a duplicate rather than updating.

**Fact.** `raw_json` persists the complete source fragment into Directus for every imported entity.

**Fact.** `server/utils/import-datasets.ts` operates on a **locally cloned git repository** at
`/opt/eldra/datasets/5etools-src`, refreshed via `git fetch` / `git pull --ff-only`, guarded by a
dedicated `ELDRA_DATASET_UPDATE_TOKEN`. Eldra ships no game content; the operator supplies it.

**Consequence, three parts.** (a) The provenance *fields* exist and just need to be populated —
`hash` is exactly the source-fingerprint field re-import needs (§22A.11). (b) Slug-based dedup must
become identity-based before any re-import story works. (c) The local-clone model is already the
correct licensing posture (§30) and should be generalized, not replaced: **adapters read
user-supplied local sources; Eldra never fetches content.**

## 2.14 Where the existing architecture helps, and where it conflicts

| Existing | Effect on Rules Engine |
|---|---|
| `scene_layer_objects` envelope+JSON pattern | **Helps.** Adopt directly (§21). |
| Live-reference resolution discipline | **Helps.** Directly transfers to derived values. |
| `app/lib/systems/*` declarative schema | **Helps.** Proves appetite; becomes package `content` (§11). |
| Server importing `app/lib/**` (`server/api/systems/*`) | **Helps.** Proves the isomorphic-engine plan (§23.3) is viable today. |
| `server/utils/directus.ts` as sole client | **Helps**, where actually used. |
| 15+ files with copy-pasted `dxFetch` | **Conflicts.** Do not add a 16th; use `directusServiceRequest`. |
| `character_sheets` 5e-shaped columns | **Conflicts.** Cannot hold package-defined state. Requires a new collection, not an ALTER (§21.3). |
| `character-sheet-math.ts` | **Conflicts.** Must be replaced, but only behind an adapter. |
| 8,877-line `sheet.vue` | **Conflicts**, and is also the reason to do this. |
| No tests | **Blocks.** See §2.9. |
| Manual schema migration | **Constrains.** Every schema step must be idempotent and separately deployable (§25). |
| One-boolean permissions | **Constrains.** §24 is a forward contract, not an implementation. |
| `app/lib/importers/*` are pure functions | **Helps enormously.** Already the adapter shape (§2.11). |
| `EldraImportPreviewResult` + `raw` + `warnings` | **Helps.** Proto-IR; widen rather than replace (§22A.10). |
| `foundry-pack` reserved in `EldraImportProvider` | **Helps.** The seam is already named. |
| `import_source` block with unused `hash`/`import_version` | **Helps.** Provenance fields exist; populate them (§22A.11). |
| Slug-based import de-duplication | **Conflicts.** Must become identity-based before re-import works (§2.13). |
| `raw_json` persisted per entity | **Constrains.** Convenient for re-translation, a redistribution hazard (§30.3). |
| Local git-clone dataset model | **Helps.** Already the correct licensing posture; generalize it (§30). |

---

# 3. Product Goals

1. A campaign can run on a rules system Eldra's authors never anticipated.
2. Adding a rules system requires **no change to Eldra application code**.
3. Every computed number can explain itself in terms a player understands.
4. The same inputs always produce the same outputs.
5. Rules can evolve without silently corrupting existing characters.
6. A technically capable GM can eventually author rules without writing application code.
7. Character sheets get *faster*, not slower.
8. Setting (World Configuration) and mechanics (Rules) can be mixed and matched.
9. **Existing structured work is preserved rather than retyped.** A GM with a Foundry system, a
   Roll20 sheet, or a 5e.tools dataset should get an implementation-ready starting package, not a
   blank one.
10. **Every translated artifact states its own fidelity.** A user can always answer: what converted,
    what was assumed, what still needs work, what was excluded and why.
11. **Re-import is a first-class operation.** Upstream sources change; local reconciliation work must
    survive that.

---

# 4. Explicit Non-Goals

**Not goals of this architecture, and not goals of V1:**

- Modelling every rule of any specific published game. Completeness is a *package* concern.
- **Executing, emulating, or faithfully decompiling Foundry or Roll20 systems.** Eldra never runs
  source-platform code, never implements their APIs, and never claims behavioural equivalence.
  Translation is *assisted authoring with graded fidelity*, not compatibility (§22.6, §22A).
- **Promising any compatibility percentage.** No "95% of Foundry systems supported" claim, ever
  (§35A.17).
- Automatic translation of arbitrary JavaScript. Sheet workers and `prepareDerivedData` produce
  scaffolds and diagnostics, not formulas (§22A.8, §22A.9).
- A package marketplace, signing infrastructure, or trust tiers. Design the manifest to permit it
  (§22.5); build none of it.
- **Bundling, mirroring, or redistributing source-platform content.** Users supply their own local
  sources; Eldra ships adapters, never game content (§30).
- Third-party adapter distribution in V1. Adapters are first-party and in-repo (§22A.4).
- Rules-driven tactical combat automation (Eldra 3.0 territory).
- Replacing the Scene Graph, Timelines, Relationships, or Transportation Network.
- Arbitrary package-supplied HTML/CSS/JavaScript. Ever, in this design.
- Being a general-purpose programming environment. The expression language is deliberately
  **not Turing-complete** (§14).

---

# 5. Terminology

| Term | Meaning |
|---|---|
| **Rules Package** | A versioned, immutable bundle of Definitions describing how a game works. |
| **Definition** | Any package-declared thing with a stable ID (a Value, Action, Modifier source, Collection, …). |
| **Value Definition** | A named, typed slot on an actor. Either *stored* or *derived*. |
| **Stored Value** | Authored/chosen by a user. The system of record. |
| **Derived Value** | Computed from other values. Never persisted (except deliberate Snapshots). |
| **Collection Definition** | A repeating list of structured instances (inventory, spells, conditions). |
| **Modifier** | A declarative change to a Value or Roll, from a Source, possibly conditional. |
| **Source** | The thing a Modifier comes from (an item, condition, feature, campaign override). |
| **Action** | Something an actor can do: costs, prerequisites, an optional Roll, and Outcomes. |
| **Roll Spec** | A declarative description of dice + selection + success interpretation. |
| **Semantic Role** | An optional, package-declared tag binding a Definition to a capability Eldra Core understands (`vitality`, `movement.speed`). |
| **Actor** | Anything with rules state — PC, NPC, vehicle, faction. Not necessarily a "character." |
| **Actor State** | The stored, persisted rules data for one Actor under one Package. |
| **Trace** | The auditable explanation of how a Derived Value or Roll reached its result. |
| **Binding** | A campaign-level mapping between World Configuration definitions and Rules Package expectations. |
| **Engine API Version** | The Rules Engine's own contract version. Distinct from a package's version. |

Note on **Actor** rather than **Character**: the brief asks for vehicles, travel, and factions.
Binding the engine to "Character" would be an early, hard-to-reverse mistake.

---

# 6. External System Research

## 6.1 Foundry VTT

*Sources: [System Development](https://foundryvtt.com/article/system-development/),
[TypeDataModel](https://foundryvtt.com/api/classes/foundry.abstract.TypeDataModel.html),
[ActiveEffect](https://foundryvtt.com/api/classes/foundry.documents.ActiveEffect.html),
[Community Wiki](https://foundryvtt.wiki/en/development/api/DataModel).*

A game system is **a JavaScript application package**. `system.json` declares id, version,
compatibility range, ES modules, stylesheets, compendium packs, `documentTypes`, and — notably —
`primaryTokenAttribute`/`secondaryTokenAttribute`, the manifest telling core which system-defined
attribute drives token bars.

Structure:

- **DataModels** (`TypeDataModel`) define schemas with typed fields (`StringField`, `NumberField`,
  `SchemaField`) per Actor/Item subtype. Declarative, validated, inheritable.
- **Document subtypes** are registered in `init` by assigning `CONFIG.Actor.documentClass` and
  `CONFIG.Actor.dataModels`.
- **Two-phase derivation**: `prepareBaseData` (before embedded documents and effects) →
  ActiveEffects applied → `prepareDerivedData`. Derived values are explicitly *not stored*.
- **ActiveEffect** is the modifier model: `changes[]` of `{key: path, mode, value}` plus
  `priority`, `disabled`, `transfer`, `duration`. Modes are `ADD`, `MULTIPLY`, `OVERRIDE`,
  `UPGRADE`, `DOWNGRADE`, `CUSTOM`. Application is phased; `shouldApplyChange()` is overridable.
- **Migrations** via `migrateData` on the DataModel.

**Lessons.** The manifest/version/compat model, the schema-first data model, the two-phase
derivation split, and the not-stored-derived-data rule are all excellent and directly borrowable.
The `key`/`mode`/`value`/`priority` modifier tuple is a strong declarative core.

**Limits.** Every ruleset is a full JS application: to add a homebrew system you write, build, and
distribute code. Sheets are system-authored `Application` subclasses, so system logic and sheet
implementation couple tightly. `CUSTOM` mode is an unbounded escape hatch. Community system code has
no complexity ceiling. Foundry is not a data-driven rules platform; it is a plugin host that happens
to ship schemas.

## 6.2 Foundry PF2e "Rule Elements" — the most relevant precedent found

*Sources: [Quickstart guide for rule
elements](https://github.com/foundryvtt/pf2e/wiki/Quickstart-guide-for-rule-elements),
[Common Rule Elements](https://mintlify.wiki/foundryvtt/pf2e/rule-elements/common-rule-elements).*

Built *on top of* Foundry, the PF2e system added a declarative layer so homebrew authors write JSON
instead of JavaScript. This is the closest existing thing to what Eldra wants, and it is worth more
study than Foundry core.

```json
{ "key": "FlatModifier", "selector": "perception", "type": "circumstance",
  "value": 2, "label": "Alert", "predicate": ["action:seek"] }
```

- **`key`** selects a rule element *type* from ~40 (`FlatModifier`, `AdjustModifier`, `DamageDice`,
  `ChoiceSet`, `RollOption`, `GrantItem`, `AdjustDegreeOfSuccess`, `BaseSpeed`, `Aura`, …).
- **`selector`** targets a statistic by slug, and accepts arrays.
- **`type`** is a *stacking class* — same-type bonuses don't stack, highest wins.
- **`predicate`** is a declarative boolean over "roll options" (kebab-case game-state facts), with
  `or`/`and`/`not`/`nor`/`nand`/`gte`/`lte`/`gt`/`lt`/`eq`, nestable, with `self`/`target`/`origin`
  context domains.
- **Bracketed values** allow expressions: `"floor(@actor.level/2)"`, `"max(1, @actor.level - 2)"`,
  `"ternary(gte(@actor.level, 3), 2, 1)"`, and newer `match(when(...), when(...), default)`.
- **`ChoiceSet`** models player choice declaratively, storing the selection in a flag other rule
  elements predicate on.

**Lessons for Eldra — this is the design to beat.** Specifically worth stealing: selector-targeted
modifiers; predicates as data over named facts; expressions embedded in modifier values;
choice-as-a-definition rather than choice-as-UI-code.

**Limits, and they matter.** The rule element *catalogue* is game-specific — `AdjustDegreeOfSuccess`,
`DexterityModifierCap`, `CriticalSpecialization`, `BattleForm` are PF2-shaped, not universal. The
stacking rule (same type doesn't stack) is **hardcoded into the system**, not declared. Selectors are
free-text slugs with no schema, so typos fail silently. And after ~40 rule element types, PF2e still
requires JavaScript for genuinely hard mechanics. **That last fact is the strongest available
evidence for §31.2: a declarative catalogue converges toward, but never reaches, full expressiveness.**

## 6.3 Roll20

*Sources: [Sheet Worker Scripts (Help
Center)](https://help.roll20.net/hc/en-us/articles/360037773513-Sheet-Worker-Scripts),
[Sheet Worker Scripts (Wiki)](https://wiki.roll20.net/Sheet_Worker_Scripts),
[Sheetworker examples](https://wiki.roll20.net/Sheetworker_examples_for_Non-programmers).*

A character sheet is **HTML + CSS + JavaScript**. Attributes are created implicitly by naming an
input. Derived values are either `autocalc` fields embedded in HTML or **sheet workers** — JS that
registers on `change:attr` / `sheet:opened` and reads/writes via async `getAttrs`/`setAttrs`.
Repeating sections use a `repeating_<name>_<rowID>_<attr>` naming convention with `getSectionIDs`.
Roll buttons use `@{attr}` / `%{macro}` substitution; roll templates format output.

The documentation itself flags the failure modes: workers are asynchronous, so "code cannot simply be
executed from top to bottom"; **"asynchronous cascades should be avoided"** and authors are advised
to batch into one `getAttrs` rather than chaining get→set→get; the API sandbox and browser
environments differ (the spread operator works in one and crashes the other).

**Lessons.** Roll20's *user-facing vocabulary* is genuinely excellent and widely understood:
attributes, repeating sections, `@{}` references, familiar roll expressions, and roll templates as a
separate presentation concern. Non-programmers really do author these.

**Limits.** There is no separation between stored attributes, computed values, and presentation —
they are all the same HTML document. Authoritative game logic lives in sheet workers, meaning the
rules *are* the UI. The async cascade problem is the direct consequence of having no dependency
graph: each worker manually re-reads and re-writes state, and ordering is emergent rather than
derived. This is precisely the architecture Eldra must not adopt, and notably it resembles what
`sheet.vue` has organically become (§2.5).

## 6.4 Fantasy Grounds (third system)

*Source: [Creating a Ruleset —
Overview](https://fantasygroundsunity.atlassian.net/wiki/spaces/FGCP/pages/996644412/Creating+a+Ruleset+-+Overview),
[Extensions](https://fantasygroundsunity.atlassian.net/wiki/spaces/FGCP/pages/996645657/Developer+Guide+-+Extensions).*

Rulesets are XML (UI + data structure) + Lua (behavior) + assets, distributed as a directory or a
`.pak`, requiring a `base.xml`. Crucially, **rulesets layer**: a ruleset can inherit all of another's
functionality, with `CoreRPG` provided as a shared base. Extensions are "defined almost exactly like
rulesets" and are applied *after* all ruleset layers load.

**Lessons.** Layering/inheritance with a shared base layer is real, shipped, and long-lived — it is
strong evidence that package composition (§11.5) is worth supporting. The uniform
"extension == ruleset applied later" model is elegant: one composition mechanism, not two.

**Limits.** Behavior is Lua — full scripting, same trust and complexity ceiling as Foundry. The
self/super layering model is notoriously subtle (the community forum thread found in research is
literally titled *"Working With and Around Self-Super Code Layering"*). **This is direct evidence for
the risk in §31.4: deep inheritance chains in rules content become very hard to reason about.**

## 6.5 CEL — Common Expression Language (fourth system)

*Sources: [cel.dev](https://cel.dev/), [cel-spec](https://github.com/google/cel-spec),
[CEL in Kubernetes](https://kubernetes.io/docs/reference/using-api/cel/).*

Not an RPG system — a *safe expression language*, and the most directly applicable prior art for §14.
CEL is explicitly **non-Turing-complete**, "sandboxed, deterministic, and prevents infinite loops or
resource exhaustion." Each program is a single expression evaluating to a single value. It
"evaluates linearly with respect to the size of the expression and the input" with macros disabled,
which the project frames as a *feature* enabling evaluation "orders of magnitude faster than
equivalently sandboxed JavaScript." **Cost units are deterministic** — the same expression and input
always cost the same, which makes resource limits enforceable *before* evaluation. Kubernetes uses
it for CRD validation and admission policy, evaluated in-process in the API server rather than via
webhooks. Syntax is deliberately C-like/familiar.

**Lessons.** Everything about the *shape* of this is right for Eldra: single-expression programs,
non-Turing-complete by construction, deterministic cost accounting, in-process evaluation, familiar
syntax. §14 adopts all five properties.

**Limits for Eldra.** CEL has no dice, no notion of collections-of-actor-state as a first-class
domain, and no established small TypeScript implementation suitable for shipping to a browser in a
Nuxt app. Adopting CEL wholesale would mean a large dependency, a syntax that is *general-purpose
familiar* rather than *RPG familiar* (`@strength` and `2d6` read better to a GM than
`actor.attributes.strength.value`), and still building the dice and roll layers on top. **Borrow the
properties; do not adopt the implementation.**

---

# 7. Foundry / Roll20 / Eldra Comparison

| | **Foundry VTT** | **Roll20** | **Eldra (proposed)** |
|---|---|---|---|
| **Extension unit** | JS system package (`system.json`) | HTML/CSS/JS character sheet | Declarative Rules Package (JSON document, immutable release) |
| **Data schema** | `TypeDataModel`, typed, validated | Implicit — attributes exist by being named in HTML | Explicit typed Value/Collection Definitions, validated on import |
| **Logic location** | System JS (`prepareDerivedData`) + ActiveEffects | Sheet workers (async JS in the sheet) | Compiled expression ASTs + declarative Modifiers, in a shared engine |
| **Sheet relationship** | System authors an `Application` subclass; tight coupling | The sheet *is* the system | Sheet is a **renderer of a declared layout**; no logic in the sheet |
| **Migration** | `migrateData` per DataModel, code-driven | Essentially none; sheet authors hand-roll | Declarative, versioned migration steps + preview + pinning (§25) |
| **Security** | Full JS trust; you trust the package author | Sandboxed-ish JS, but authoritative logic client-side | No package code. Non-Turing-complete expressions, cost-limited (§23) |
| **Authoring accessibility** | Developer only | Web developer; non-programmers copy snippets | Data authoring; future visual editor is a first-class goal (§11.7) |
| **Runtime flexibility** | Effectively unlimited | High, at the cost of correctness | High within the model; bounded by design (§31.2) |
| **Portability** | Portable between Foundry instances only | Portable between Roll20 games only | Portable JSON bundle + integrity hash + engine compat range (§22) |
| **Homebrew friendliness** | Poor (write a system) / good via PF2e Rule Elements | Good for tweaks, poor for correctness | The primary design target |
| **Explainability** | Ad hoc per system | None | First-class Traces (§27) |
| **Main risk** | Every ruleset is an unbounded app | Rules and UI are the same artifact | Declarative ceiling (§31.2); scope (§31.1) |

## 7.1 What Eldra should borrow from Foundry

**Confirmed by research, with one revision.**

- Versioned packages with an explicit **engine compatibility range** — yes, adopt.
- **Schema-first typed definitions** with validation at load, not at use — yes, adopt.
- **Two-phase preparation** (base → modifiers → derived) — yes, and generalize to explicit phases (§16.4).
- **Derived data is never stored** — yes, adopt as an invariant.
- **Migration as a lifecycle step owned by the definition** — yes, adopt (§25).
- **`primaryTokenAttribute` as manifest-declared capability binding** — this is the seed of Semantic
  Roles (§12.4), and is the most underrated idea in Foundry's manifest.
- **Revision:** the brief suggests borrowing Foundry's "clear core-versus-system boundary." Foundry's
  boundary is clear in *documentation* but porous in *practice* — systems reassign `CONFIG` classes
  and override core methods. Borrow the *stated* boundary, not the enforcement model. Eldra's
  boundary is enforced by packages containing no executable code at all.

## 7.2 What Eldra should avoid from Foundry

**Confirmed.**

- Requiring a ruleset to be a JavaScript application.
- Coupling sheet implementation to system code.
- An unbounded `CUSTOM` mode. If Eldra ships an escape hatch it must be capability-scoped (§23.4).
- **Additional, from PF2e rather than core Foundry:** do not hardcode one game's stacking rule into
  the engine. PF2e bakes "same type doesn't stack" into the system layer; Eldra must make stacking
  policy a package-declared property (§16.3).

## 7.3 What Eldra should borrow from Roll20

**Confirmed, with emphasis shifted.**

- **Repeating sections** — the single best user-facing idea in Roll20. Adopt as Collections (§12.3).
- **Familiar reference syntax.** `@{attribute}` is recognized by a huge population of GMs. Eldra's
  `@attribute.path` is deliberately near-identical (§14.2).
- **Recognizable roll expressions** (`2d6+3`). Adopt as literal syntax (§14.6).
- **Roll templates as a separate presentation artifact** — this is genuinely well-factored in Roll20
  and worth copying: how a roll *looks* is not how a roll *works* (§17.6).
- **Revision:** the brief lists "custom sheet flexibility" as a thing to borrow. I disagree — see
  §7.4 and §31.3. Roll20's flexibility comes precisely from letting authors write arbitrary markup,
  which is the thing Eldra must not do.

## 7.4 What Eldra should avoid from Roll20

**Confirmed and strengthened.**

- Authoritative rules in sheet workers.
- HTML/CSS/JS as the de facto rules package.
- Weak separation of stored / computed / presented values.
- **Additional, and the most important one:** avoid *manual* recomputation. Roll20's documented
  "asynchronous cascade" problem is not an async problem, it is a *missing dependency graph* problem.
  Every worker re-reads state and writes derived results back into stored attributes, so ordering is
  emergent. Eldra's answer is §15: derive the order from the AST, never from author-written sequence.
  **Note that `sheet.vue` has independently evolved toward the Roll20 failure mode** — 168 computeds
  with implicit ordering — which makes this the most locally relevant lesson in the whole comparison.

---

# 8. Architectural Alternatives

## Alternative A — Code-first system packages (the Foundry model)

Packages are TypeScript modules loaded into the app, implementing an interface.

| Dimension | Assessment |
|---|---|
| Expressive power | Maximal |
| Authoring difficulty | Developer-only; kills goal 6 |
| Security | **Fatal.** Executing third-party code in the Nuxt server = full access to `DIRECTUS_TOKEN`, env, filesystem, all campaigns. Directly violates the brief's principle 3. |
| Performance | Good |
| Migration complexity | Code migrations; hard to preview or roll back |
| UI generation | Poor — packages generate their own UI |
| Debuggability | Ordinary code debugging (a real advantage) |
| Long-term maintainability | Poor — Eldra becomes hostage to package quality |
| Unusual systems | Excellent |
| Rewrite risk | Low technically, **high commercially** (self-hosted + untrusted packages is untenable) |

**Rejected.** Security alone is disqualifying for a self-hosted multi-tenant product.

## Alternative B — Purely declarative, no escape hatch

Everything is data. If it can't be expressed declaratively, it can't be done.

| Dimension | Assessment |
|---|---|
| Expressive power | **Insufficient long-term.** PF2e's ~40 rule elements + residual JS is the evidence (§6.2). |
| Authoring difficulty | Best of all options |
| Security | Excellent |
| Performance | Excellent |
| Migration complexity | Lowest — data-to-data transforms |
| UI generation | Excellent — full structural knowledge |
| Debuggability | Excellent (traces) |
| Maintainability | Excellent until the ceiling; then Eldra Core absorbs every unexpressible mechanic as a special case |
| Unusual systems | Good for the common 90%, brittle at the edges |
| Rewrite risk | **High.** The ceiling arrives as a crisis rather than a plan. |

**Rejected as stated** — but it is the right *default*, which is why C exists.

## Alternative C — Declarative core + specified, capability-scoped extension seam **(RECOMMENDED)**

Packages are pure data. Expressions compile to an AST. A **named, versioned extension point**
contract is *specified in V1 and implemented later*, where a package may declare it needs a
capability (`custom-check-resolver`, `custom-progression`), which Eldra Core either provides an
implementation for, or refuses to load the package.

| Dimension | Assessment |
|---|---|
| Expressive power | Declarative for the 90%; a planned, bounded path for the rest |
| Authoring difficulty | Same as B for normal authors |
| Security | Same as B in V1 (no code runs). The seam is designed to be capability-scoped and server-side-only when built. |
| Performance | Same as B |
| Migration complexity | Slightly higher — extension usage must be tracked in the manifest |
| UI generation | Same as B |
| Debuggability | Same as B; extensions are explicit and few |
| Maintainability | **Best.** The ceiling has a designed exit rather than an emergency one. |
| Unusual systems | Best available |
| Rewrite risk | **Lowest** |

**Recommended.**

## Alternative D — Event/rule graph (production-rule / ECS style)

Rules are `when <condition> then <effect>` productions over an entity-component store, forward-chained.

| Dimension | Assessment |
|---|---|
| Expressive power | Very high; excellent for triggers/reactions |
| Authoring difficulty | **Poor.** Production systems are notoriously hard to reason about — non-local behavior, rule ordering, unpredictable cascades. Fails goal 6 badly. |
| Security | Fine |
| Performance | Risky — forward chaining can cascade unboundedly, the exact failure the brief names |
| Migration | Hard — rule interactions are emergent |
| UI generation | Poor — no declared structure to render |
| Debuggability | **Poor.** "Why did this fire?" is a research problem. |
| Rewrite risk | Moderate |

**Rejected as the core model.** But note: an *event/trigger* layer is genuinely the right shape for
the narrow problem of reactions and durations (§16.7, §17.7). Take the idea, not the architecture.

---

# 9. Recommended Architecture

**Alternative C.** Concretely:

1. A **Rules Package** is an immutable, versioned, validated JSON document containing Definitions.
   It contains no executable code.
2. **Five primitives**: Value, Collection, Modifier, Action, Roll Spec. Everything a game has —
   attributes, skills, saves, HP, sanity, stress, classes, levels — is *built from* these by the
   package. None of them is an engine concept.
3. **Semantic Roles** let a package tell Eldra Core which of its definitions fill capabilities Core
   understands. Optional, additive, and the reason agnosticism doesn't cripple the rest of the app.
4. Formulas are authored as **text in a small RPG-flavoured DSL**, parsed **once** at package
   validation into a **canonical AST**, stored as both. Evaluation walks a **pre-compiled** closure
   tree. Non-Turing-complete, cost-bounded, deterministic.
5. **Dice never appear in derived-value evaluation.** A Roll Spec is a *value* that pure expressions
   may construct; only the Roll Engine consumes one, with an explicit seed.
6. A **dependency graph** is extracted from ASTs and modifier targets at package load, topologically
   ordered once, and used for dirty-marking and memoized lazy recomputation.
7. **Traces are first-class.** Determinism means any value can be re-evaluated with tracing enabled
   on demand, so explanation costs nothing when not asked for.
8. **The engine is isomorphic.** One implementation in `app/lib/rules/`, imported by both browser and
   Nitro server (a pattern `server/api/systems/*` already uses). Client evaluation is a preview;
   **server evaluation is authoritative**.
9. **Persistence follows `scene_layer_objects`**: fixed envelope columns + typed JSON sections, with
   one translation boundary module.

## 9.1 What this deliberately cannot support in V1

Stated plainly, because unstated limits become surprises:

- **Cross-actor rules.** Opposed checks and auras need two actors in one evaluation context. V1
  evaluates one actor. The context type (§15.6) reserves the shape; the engine ignores it.
- **Reactions and triggers.** No event bus in V1. Durations are declared but only *decremented* by
  explicit user action, not automatically.
- **Rules-driven combat**, initiative, or targeting.
- **Multi-package campaigns.** One active package per campaign in V1 (§11.6).
- **Package dependencies / inheritance.** Reserved in the manifest, rejected for V1 (§31.4).
- **A visual rules editor.** JSON authoring plus validation only.
- **Any package-provided code.**

## 9.2 Extension seams that preserve growth

| Seam | Preserves |
|---|---|
| `engineApiVersion` range in the manifest | Ability to change the engine without breaking pinned campaigns |
| `EvaluationContext` with an unused `actors: Record<role, ActorState>` field | Opposed checks, auras |
| `capabilities: []` in the manifest | The §23.4 extension seam |
| Semantic Roles registry | New Core subsystems asking packages for new capabilities |
| Roll Spec as a structured value, not a string | Cards, tables, manual resolution, non-dice randomizers |
| `dependencies: []` reserved and rejected at load | Future composition without a format change |
| Definition IDs are opaque, namespaced strings | Renames via migration rather than data loss |

## 9.3 Decisions that must be made now vs deferred

**Now (expensive to reverse — see §35.11):** definition identity scheme; stored-vs-derived boundary;
the AST as canonical form; dice excluded from derived evaluation; Actor (not Character) as the
subject; persistence envelope; visibility classification on every value; engine API versioning.

**Defer:** the rule-element catalogue's exact contents; stacking policy defaults; the sheet layout
vocabulary's full breadth; migration DSL richness; the extension seam's implementation; package
composition; anything about marketplaces.

---

# 10. System Boundaries

```
┌──────────────────────────────────────────────────────────────────────┐
│ Eldra Core                                                           │
│  Scene Graph · Entities · Timelines · Relationships · Transportation │
│  Auth · Persistence · Rendering primitives                           │
└───────────────┬──────────────────────────────────────┬───────────────┘
                │ (reads Semantic Roles)               │ (reads traits)
                ▼                                      ▼
┌───────────────────────────────┐        ┌─────────────────────────────┐
│ Rules Engine (Eldra-owned)    │        │ World Configuration         │
│  parser · AST · evaluator     │◄───────┤  vocabulary + typed traits  │
│  dependency graph · modifiers │ traits │  (Road Types, Currencies,   │
│  roll engine · trace builder  │  only  │   Languages, Calendars, …)  │
└───────────────┬───────────────┘        └─────────────────────────────┘
                │ loads + validates
                ▼
┌───────────────────────────────┐
│ Rules Package (data only)     │
│  Definitions · Expressions    │
│  Layout intent · Migrations   │
└───────────────▲───────────────┘
                │ publish (draft → published)
┌───────────────┴──────────────────────────────────────────────────────┐
│ Translation & Import Layer  (§22A)  — build time only, never runtime │
│                                                                      │
│  user-supplied source  →  Adapter (executable, sandboxed, offline)   │
│      →  Translation Bundle = draft definitions + Receipt sidecar     │
│      →  Validation  →  Reconciliation workspace  →  publish          │
└──────────────────────────────────────────────────────────────────────┘
```

**Non-negotiable dependency directions:**

- Rules Engine **reads** World Configuration traits. World Configuration **never** reads Rules.
- Rules Engine **reads** Transportation route topology. Transportation **never** reads Rules.
- Rules Package **never** imports anything. It is inert data.
- Character Sheet **reads** Rules Engine output. Rules Engine **never** knows a sheet exists.
- **The Rules Engine never imports the Translation Layer, and has no concept of a "source".** The
  arrow above points one way, upward, and only at publish time. An adapter can only ever produce a
  package that a human could have hand-written; it has no privileged construct. This is what keeps
  translation complexity entirely outside the runtime (ADR-013).
- **Adapters never reach the network and never see Directus credentials or user sessions** (§22A.5).

The one-way rule is what prevents the circular coupling the brief warns about. Where a package needs
something the other side doesn't provide, the gap surfaces as a **Binding** (§19.3) — an explicit,
campaign-level, user-visible mapping — never as a back-edge.

---

# 11. Rules Package Model

## 11.1 Definition

A Rules Package is an **immutable, content-addressed, versioned document**. Publishing a new version
never mutates an old one; campaigns pin a version (§25.4).

## 11.2 Manifest

```jsonc
{
  "packageId": "eldra.example.dicepool",   // reverse-DNS, globally stable, never changes
  "version": "1.3.0",                      // semver
  "status": "published",                   // draft | published   (§11.8 — added in rev 2)
  "engineApiVersion": "^1.0.0",            // which Rules Engine contract this needs
  "stateSchemaVersion": 3,                 // shape of actor state this version writes
  "origin": {                              // OPTIONAL; absent for hand-authored packages (§11.9)
    "kind": "translated",                  // authored | translated
    "adapterId": "eldra.adapter.5etools",
    "adapterVersion": "0.4.0",
    "sourceId": "5etools-src@a1b2c3d",
    "sourceHash": "sha256-…",
    "receiptRef": "receipt_01H…"           // pointer only; the receipt lives outside the package
  },
  "title": "Signal Lost",
  "description": "…",
  "authors": [{ "name": "…", "url": "…" }],
  "license": { "id": "CC-BY-4.0", "notice": "…", "attribution": "…" },
  "integrity": "sha256-…",                 // hash of the canonicalized definitions
  "capabilities": [],                       // §23.4 — must be empty in V1
  "dependencies": [],                       // reserved; rejected if non-empty in V1
  "modules": [                              // optional feature sets within one package
    { "id": "psionics", "title": "Psionics", "default": false }
  ],
  "semanticRoles": {                        // §12.4
    "vitality": "value:hull",
    "movement.speed": "value:thrust"
  },
  "modifierTypes": [                        // §16.3 — stacking policy table (added in revision 3)
    { "id": "equipment", "stacking": "highest" },
    { "id": "untyped",   "stacking": "stack" }
  ],
  "localization": { "default": "en", "available": ["en"] }
}
```

`packageId` + `version` is the identity. `integrity` is computed over canonicalized definitions and
is what makes "is this the package this character was built against?" answerable.

## 11.3 Contents

```
definitions/
  values/         Value Definitions (stored + derived)
  collections/    Collection Definitions
  modifiers/      Reusable modifier templates
  sources/        Things that carry modifiers (item types, conditions, features)
  actions/        Action Definitions
  rolls/          Named Roll Specs
  tables/         Lookup tables
  choices/        Choice Sets
  progressions/   Progression tracks
  content/        Package-authored instances (item catalogue, spell list, …)
layouts/          Sheet layout declarations (§18)
migrations/       Versioned migration steps (§25)
tests/            Package self-tests (§26.3)
i18n/             Translation bundles
```

`definitions/content/` is where `app/lib/systems/dnd5e.ts` eventually lands (§2.2).

## 11.4 Ownership matrix

| Concern | Owner | Notes |
|---|---|---|
| Evaluator, parser, dependency graph, roll engine | **Eldra Core** | Never package-supplied |
| Primitive kinds (Value/Collection/Modifier/Action/Roll) | **Eldra Core** | Closed set |
| Semantic Role vocabulary | **Eldra Core** | Packages *fill* roles, don't invent them |
| Attributes, skills, saves, HP, classes, levels | **Rules Package** | None are engine concepts |
| Stacking policy | **Rules Package** | Declared, not assumed (§16.3) |
| Sheet layout structure | **Rules Package** | Structure and intent only |
| Sheet visual design, components, theming | **Eldra Core** | Packages never supply markup |
| Setting vocabulary (Road Types, Currencies, Languages) | **World Configuration** | §19 |
| Which package/version is active; bindings; overrides | **Campaign** | §11.6 |
| Stored values, collection instances, choices | **Character/Actor** | §13 |
| Derived values | **Nobody — recomputed** | Never persisted (§13.4) |

## 11.5 Composition

**Deferred, deliberately, with the manifest field reserved.** Fantasy Grounds shows layering works
and has decades of production use — but its own community documents the self/super layering model as
a persistent source of confusion (§6.4). Layering plus campaign overrides plus migrations is a
combinatorial hazard (§31.4). V1: `dependencies` must be empty; a non-empty array is a load error
with a clear message. This is cheap to relax later and expensive to retract.

`modules` (optional feature sets *inside* one package) ships in V1 — it covers most of the real need
("this campaign doesn't use psionics") at a fraction of the complexity.

## 11.6 Multiple packages per campaign

**No, in V1.** One campaign, one package, one pinned version. Two packages both defining
`value:strength` have no principled resolution, and inventing one now would be guesswork. Revisit
when someone has an actual use case that `modules` can't serve.

## 11.7 Human authorability

The model is designed for a future visual editor even though V1 authors JSON:

- Every definition is a flat record with an ID — editable as a form.
- Expressions have **both** a human text form and an AST. A visual editor emits AST directly and
  renders text; a text author writes text and the parser emits AST. Neither is privileged.
- Modifiers are `{target, phase, operation, value, condition}` — five form fields.
- Validation errors carry definition IDs and source spans, so an editor can point at them.

A translated package and a hand-authored package are the *same artifact type*. The reconciliation
workspace (§22A.7) is therefore the first real authoring UI, arriving earlier and with a stronger
justification than a from-scratch editor would have.

## 11.8 Draft versus published status *(added in revision 2)*

A package is `draft` or `published`. This is a small field with large consequences and it must exist
before the first line of engine code (§34.1).

| | `draft` | `published` |
|---|---|---|
| May contain `unresolved` expression nodes (§14.12) | yes | **no** |
| May contain `scaffold`-fidelity definitions (§22A.6) | yes | only if explicitly accepted |
| May fail package self-tests | yes | **no** |
| Mutable | yes — a working document | **never** (§25.2) |
| Can be bound to a campaign / evaluated | **no** | yes |
| Has an `integrity` hash | no | yes, and it is the identity |

Only `published` packages are immutable and only `published` packages are activatable. A draft is a
workspace; publication is the validating transition, and it is the same transition whether the
content came from an adapter or a text editor.

Without this field, translation has nowhere to put partial work except outside the package format —
which forces a second, divergent definition model. That is the outcome ADR-013 exists to prevent.

## 11.9 Package origin *(added in revision 2)*

`origin` is deliberately tiny: **who produced this package, from what, at what version.** It is
package-level identity, not per-definition metadata, and it is the only translation-related field
inside a published package.

Everything else translation needs — per-definition provenance, confidence, review state, candidate
mappings, diagnostics, raw source fragments — lives in the **Translation Receipt**, stored *alongside*
the package and never inside it (§22A.3). The runtime loads packages and never loads receipts.

`receiptRef` is a pointer, not an embed. A package whose receipt has been deleted still evaluates
perfectly; it has merely lost the ability to be cleanly re-imported.

---

# 12. Definition Type Model

The brief supplies a 30-item candidate list and asks me not to accept it blindly. **I don't.** Most
of those are patterns, not primitives. Here is the consolidation.

## 12.1 The five primitives

### Value Definition

```jsonc
{
  "id": "value:might",
  "kind": "value",
  "valueType": "number",             // number | text | boolean | enum | ref | diceSpec
  "storage": "stored",               // stored | derived
  "default": 2,
  "constraints": { "min": 1, "max": 6 },
  "visibility": "public",            // public | owner | gm   (§24.3)
  "label": "Might",
  "tags": ["attribute"]              // package-defined taxonomy; engine ignores
}
```

```jsonc
{
  "id": "value:might.mod",
  "kind": "value",
  "storage": "derived",
  "valueType": "number",
  "formula": { "text": "floor((@value:might - 10) / 2)", "ast": { /* … */ } }
}
```

**Attributes, skills, saves, defenses, and derived values are all this one type.** The difference is
`storage`, `tags`, and whether a formula exists. There is no `AttributeDefinition`.

### Collection Definition

```jsonc
{
  "id": "collection:inventory",
  "kind": "collection",
  "sourceRefField": "sourceRef",                 // §16.8 (added in revision 3)
  "itemSchema": [
    { "key": "name",     "valueType": "text" },
    { "key": "quantity", "valueType": "number", "default": 1 },
    { "key": "equipped", "valueType": "boolean", "default": false },
    { "key": "sourceRef","valueType": "ref", "refKind": "source" }
  ],
  "slots": [ { "id": "hand", "capacity": 2 } ]   // optional; equipment slots
}
```

Covers inventory, spells known, conditions, features, notes, containers, and Roll20-style repeating
sections. **Equipment slots are a property of a collection, not a separate primitive.**

`sourceRefField` names the `itemSchema` key whose value activates a Source for each item that has one
(§16.8). It is optional — a collection with no `sourceRefField` never activates Sources. The named
field must be declared in `itemSchema` with `valueType: "ref"` and `refKind: "source"`, and
`itemSchema` may not declare any engine-reserved key (`instanceId`, `definitionId`, `duration`,
`origin`), since item fields share one flat namespace with those under `@source:` (§16.9).

### Modifier

Full treatment in §16.

### Action Definition

Full treatment in §17.

### Roll Spec

Full treatment in §17.3.

## 12.2 What the brief's list collapses into

| Candidate | Verdict |
|---|---|
| Field definitions, Scalar values, Enumerations | → **Value** (`valueType`) |
| References | → **Value** (`valueType: "ref"`) |
| Collections, Items, Containers, Equipment slots | → **Collection** |
| Attributes, Derived values | → **Value** (`storage`) |
| **Resources** | → **Value pair + constraint.** *But see §12.5* — kept as sugar |
| **Tracks / clocks** | → **Resource** with `min`/`max` and no auto-reset. Not separate. |
| Conditions, Effects | → **Source** carrying Modifiers |
| Modifiers | → **Modifier** |
| Actions | → **Action** |
| Checks, Rolls, Dice pools | → **Roll Spec** (one type, three configurations — §17.3) |
| Tables | → **Table** (a lookup structure, not a behavior) — kept |
| Tags | → a **field** on definitions, not a definition |
| Progression tracks | → **Progression** (ordered grants keyed to a Value) — kept |
| Choice sets | → **ChoiceSet** — kept (proven necessary by PF2e) |
| Feature grants | → an **Outcome** of a Progression or Action |
| Constraints, Validators | → fields on Value/Collection, plus package **tests** (§26) |
| Events / triggers | → **deferred entirely** (§9.1). Reserved, not modelled. |
| Procedures / workflows | → **rejected.** This is Alternative D creeping back in. Multi-step procedures are Actions that produce Outcomes; a workflow engine is not warranted. |

**Result: 5 primitives + 4 supporting types (Source, Table, Progression, ChoiceSet) = 9**, down from 30.

## 12.3 Why Collections stay a primitive

A Collection could be modelled as "a Value of type list." It should not be, for three reasons that
are all load-bearing: (a) collection items are *addressable* by modifiers and expressions
(`@collection:inventory[equipped].bonus`); (b) sheets need to render them as repeating structures —
this is Roll20's single best idea (§7.3); (c) they need per-item identity stable across reordering,
exactly like Scene Graph objects.

## 12.4 Semantic Roles — the mechanism that makes agnosticism survivable

Eldra Core defines a **closed registry of roles**. Packages *optionally* bind definitions to them.

| Role | Consumed by | If unbound |
|---|---|---|
| `vitality` | Token bars, damage UI, death/defeat states | No health bar; damage is a manual value edit |
| `movement.speed` | Transportation travel (§20) | Travel returns distance only, no duration |
| `initiative` | Future initiative tracker (Eldra 3.0) | Manual initiative entry |
| `encumbrance.capacity` / `encumbrance.load` | Inventory warnings | No encumbrance UI |
| `currency` | Inventory/shops | Currency shown as plain values |
| `identity.name` / `identity.portrait` | Cards, tokens, lists | Falls back to the Entity's title |
| `level` | Progression UI, "level up" affordance | No level-up affordance |
| `proficiency` | Sheet grouping hints | Ungrouped |

Rules:

1. Roles are **optional**. A narrative package binding none is valid and loads.
2. Roles are **declarative**, in the manifest — no code inspects definition names.
3. Unbound roles cause **visible degradation**, never errors: the feature is absent and the campaign
   settings page says why. This directly implements the brief's "prefer visible degradation."
4. Core **never** writes through a role. Roles are read-only capability discovery.
5. The registry is **versioned with the engine**. Adding a role is a minor engine version; it cannot
   break existing packages because binding is optional.

This is the generalization of Foundry's `primaryTokenAttribute` (§7.1) and the direct answer to
"how does the rest of the app do anything if it can't assume hit points exist."

## 12.5 Resources: sugar, not a primitive — and why the sugar is kept

A resource is a stored `current` + a derived-or-stored `max` + a clamp. That is two Values. But
Actions need to *spend* them, sheets need to *render* them as a pair, and rests need to *restore*
them. Modelling them as two unrelated Values pushes that relationship into every consumer.

**Decision:** `kind: "resource"` is **declared sugar** that the loader expands into two Values plus a
constraint plus a `resourceOf` back-link. The engine core sees only Values; the sheet contract and
action costs see a resource. This keeps the primitive set honest while keeping consumers simple, and
means "is Resource a primitive?" is answered *"no, but it is a first-class declaration."*

## 12.6 Definition identity

- Format: `<kind>:<slug>`, e.g. `value:might`, `action:strike`, `collection:inventory`.
- Namespaced by package at *reference* time; unqualified inside a package.
- **Opaque and permanent.** Never derived from the label. Renaming a label never changes the ID.
- Changing an ID is a **breaking change requiring a migration step** (§25.3).
- IDs are the join key for actor state, campaign overrides, bindings, and traces — this is the
  single most expensive thing to get wrong (§35.11).

---

# 13. Character State Model

## 13.1 Shape

```jsonc
{
  "actorId": "entity:1234",
  "packageId": "eldra.example.dicepool",
  "packageVersion": "1.3.0",
  "stateSchemaVersion": 3,
  "enabledModules": ["psionics"],

  "values": {                       // STORED values only, keyed by definition ID
    "value:might": 4,
    "value:hull.current": 12
  },

  "collections": {
    "collection:inventory": [
      { "instanceId": "ci_01H…", "name": "Cutting Torch", "quantity": 1,
        "equipped": true, "sourceRef": "source:item.torch" }
    ]
  },

  "choices": {                      // resolved ChoiceSets
    "choice:origin": "belter"
  },

  "sources": [                      // active modifier-carrying things not in a collection
    { "instanceId": "cs_01H…", "sourceRef": "source:condition.stressed",
      "duration": { "kind": "rounds", "remaining": 3 } }
  ],

  "custom": {                       // user-created values not defined by the package
    "user:favouriteBar": { "valueType": "text", "value": "The Rusty Airlock" }
  },

  "campaignExtensions": {}          // campaign-defined additions (§13.6)
}
```

**`sources` is not the whole active set.** It holds Source instances that are *stored decisions* —
conditions, temporary effects, granted features. Collection items independently activate Sources at
runtime via `sourceRefField` (§16.8); those instances are **derived, never stored here**, exactly per
§13.2. The union of both is the dynamic overlay, computed once per evaluation session and owned by
`source-overlay.ts` — not by this document's stored shape.

## 13.2 Stored vs derived — the invariant

**Only user decisions are stored.** If a value can be recomputed from stored state + package +
world config, it is derived and it is not persisted.

Rationale: this is the same principle the Transportation Network just validated three times. A
persisted derived value is a cache with no invalidation strategy, and it is how sheets silently
drift out of sync with the rules that produced them.

## 13.3 Current vs maximum

`current` is stored (it is a user decision — you took damage). `max` is usually derived. The resource
declaration (§12.5) carries the clamp; if `max` drops below `current`, clamping happens at **read**
time, not by mutating stored state — otherwise a temporary max reduction permanently destroys data.

## 13.4 The one exception: Snapshots

Sometimes a value must be frozen — a level-up record, a session-start state, an audit entry. These
are **explicit, separately named, and never mixed into live state**:

```jsonc
{ "snapshotId": "snap_…", "actorId": "…", "takenAt": "…", "reason": "level-up",
  "packageId": "…", "packageVersion": "1.3.0", "integrity": "sha256-…",
  "values": { /* full resolved values at that instant */ } }
```

Stored in a separate collection. Read-only. Carries the package version and hash so it remains
interpretable after upgrades. **A snapshot is history; live state is truth.** This mirrors the
Scene Graph's insistence on distinguishing live references from stored copies.

## 13.5 Custom user values

Users can add values the package never defined (`custom`). They are typed, they can be referenced in
campaign-scoped expressions, they are **never** referenced by package expressions (the package
doesn't know they exist), and they survive package upgrades untouched.

## 13.6 Campaign extensions

Campaigns may add values and modifiers (§21.5). These live under `campaignExtensions` in actor
state, keyed by campaign-scoped IDs (`campaign:<campaignId>:<slug>`) so they can never collide with
package IDs and are trivially separable during migration.

## 13.7 Import / export

An actor exports as `{state, packageId, packageVersion, integrity, snapshots?}`. Importing into a
campaign on a different package is **refused**, not coerced — cross-system character conversion is a
product feature, not a data-layer behavior, and silently mapping `might` to `strength` would be
exactly the kind of quiet corruption §28 exists to prevent.

---

# 14. Expression and Formula Model

## 14.1 Decision

**A small custom DSL, parsed once into a canonical AST, stored as both text and AST, compiled to a
closure tree, evaluated repeatedly.** Reasoning in ADR-002 (§32).

Rejected: raw JS/`Function` (violates principle 3 outright); adopting CEL wholesale (§6.5 — right
properties, wrong fit: no dice, no small TS implementation, general-purpose syntax where RPG-familiar
syntax is a real adoption advantage); AST-only authoring (hostile to humans, and the brief is right
to flag it); JSONLogic (verbose, poor error messages, no types).

Storing **both** forms is the key move. Text is what humans edit and diff. AST is what the engine
evaluates, hashes, extracts dependencies from, and what a future visual editor emits. Neither is
privileged; the parser and a printer keep them in sync, and validation rejects any mismatch.

## 14.2 Surface syntax

Deliberately near-Roll20 for reference syntax and near-arithmetic for everything else.

```
floor((@value:might - 10) / 2)
max(1, @value:level - 2)
if(@value:hull.current <= 0, "defeated", "active")
sum(@collection:inventory[equipped], "weightEach" * "quantity")
count(@sources[definitionId = "source:condition.stressed"])
lookup(table:proficiency, @value:level)
2d6 + @value:might.mod
@world:roadType.speedFactor
@source:equipped
```

- `@value:x`, `@collection:x`, `@sources`, `@choice:x` — actor state references
- `@world:x` — World Configuration traits (§19)
- `@ctx:x` — evaluation context (§15.6)
- `@source:x` — the Source instance carrying the enclosing modifier (§16.9); legal **only** inside a
  `ModifierSpec`'s `value`/`condition` *(added in revision 3)*
- `[...]` — collection filter predicate
- `"key"` inside an aggregate — the item field being aggregated

> **Revision 3 repairs two stale examples here.** `count(@sources[tag = "stressed"])` filtered on a
> scalar `tag` field that no modeled type ever had; `SourceDefinition.tags` is a *list* (§16.6), and
> EEL has no membership function, so the canonical filter is now on `definitionId`. Tag-based
> filtering of `@sources` is deferred to V2 together with a membership function. `@sources` items
> expose exactly `instanceId`, `definitionId`, and `tags`.

## 14.3 Type system

Types: `number`, `text`, `boolean`, `enum<...>`, `ref`, `list<T>`, `diceSpec`, `error`.

**Gradually typed, checked at validation.** Every Value Definition declares `valueType`, so the
parser can type-check every reference at *package import* — a formula referencing a text value in
arithmetic fails the package, not the session. This is the property Roll20 most conspicuously lacks.

No implicit coercion between `number` and `text`. `boolean` → `number` is explicit (`toNumber`).

## 14.4 Null and error behavior

There is no `null`. Every value has a type-appropriate zero (`0`, `""`, `false`, empty list).

Errors **propagate as a distinct `error` value carrying a reason and the definition ID**, they do not
throw. `1 + error` is `error`. A derived value that evaluates to `error` renders as a visible
inline error on the sheet with its trace available, and everything else keeps working. This is
"visible degradation over silent corruption" implemented at the type level, and it is why one bad
formula cannot take a character sheet down.

**Errors propagate through *gating* as well as through arithmetic** *(clarified in revision 3)*. A
boolean context — a modifier `condition`, an `if(...)` predicate — is not a filter that absorbs
errors. `error` is never read as `false`, and a non-boolean value is never coerced into one. The
propagation rule is uniform: whatever an `error` flows into, the result is `error`. §16.11A specifies
this for the Modifier Pipeline, which is where the distinction has teeth, but the rule is a property
of the type system, not of that pipeline.

## 14.5 Function whitelist

Closed set, versioned with the engine. No user-defined functions in V1.

*Arithmetic*: `floor ceil round abs min max clamp pow sqrt sign`
*Logic*: `if not and or`
*Comparison*: `= != < <= > >=`
*Text*: `concat lower upper` (no regex, no unbounded repetition)
*Collections*: `sum count any all first max_of min_of filter`
*Lookup*: `lookup(table, key)`
*Conversion*: `toNumber toText`
*Dice construction*: `dice(n, faces)`, `keepHighest`, `keepLowest`, `explode`, `reroll` — these
**construct a `diceSpec`; they do not roll.**

Notably absent: no loops, no recursion, no `while`, no user functions, no date/time (non-deterministic),
no randomness. Non-Turing-completeness is structural, exactly as in CEL (§6.5).

## 14.6 Dice are values, not evaluation

`2d6 + 3` in a derived value evaluates to a **`diceSpec`**, not a number. Derived-value evaluation
stays pure and deterministic. Only the Roll Engine (§17) consumes a `diceSpec`, and only with an
explicit seed.

This is a deviation from most VTTs, where formulas and rolls blur, and I consider it one of the two
most important decisions here (alongside Semantic Roles). It is what makes determinism (principle 6)
actually true rather than aspirational, and it is very expensive to retrofit.

## 14.7 Dependency extraction

Walking the AST for reference nodes yields the exact dependency set, for free, at validation time.
No author annotation, no runtime discovery, no Roll20-style manual `getAttrs` lists.

Collection filters create a dependency on the whole collection (V1 — coarse but correct).

## 14.8 Cycles

Static cycles are detected at **package validation** and fail the import with the full cycle path.
Dynamic cycles (via conditional modifiers) are caught at runtime by a visit-set guard, yielding
`error` for the participating values with a trace naming the cycle — never a hang.

## 14.9 Security and limits

No `eval`, no `Function`, no property access into host objects — the evaluator only sees a plain
resolved state object. Expressions are bounded by AST node count at validation, and by an evaluation
step budget at runtime. Because the language is non-Turing-complete and linear in AST size,
**cost is computable before evaluation** (the CEL property, §6.5) and can be enforced at import.

## 14.10 Localization

Expressions are **not** localized — syntax and definition IDs are invariant. Labels and trace strings
are localized via `i18n/` keyed by definition ID. Numbers format at the presentation layer.

## 14.11 Authoring UX

Errors carry `{definitionId, span, message, suggestion}`. Because `valueType` is declared,
"unknown reference `@value:mite`" can suggest `@value:might`. Validation is at import, not at play.
## 14.12 The `unresolved` node *(added in revision 2)*

One additional AST node kind exists so that translation has somewhere honest to put "a formula
belongs here and we could not produce it":

```jsonc
{ "kind": "unresolved",
  "reason": "sheet-worker-logic",           // why no formula was produced
  "note": "Derived from Roll20 worker on change:strength",
  "hint": { "text": "floor((@value:strength - 10) / 2)" }   // optional suggested completion
}
```

Semantics, deliberately strict:

- It **type-checks as `error`** and evaluates to `error` (§14.4) — so a draft never silently
  computes a plausible-but-wrong number.
- It contributes **no dependency edges** and cannot participate in a cycle.
- Its presence **blocks publication** (§11.8). A published package cannot contain one.
- `hint` is inert. It is a suggestion for a human, never evaluated.

This is the one place where translation reaches into the runtime type system, and it is why the node
kind must exist in the first type contract rather than being added later: adding a variant to a
discriminated union afterwards means auditing every exhaustive `switch` in the parser, type checker,
dependency extractor, evaluator, and printer (§34.1).

---

# 15. Dependency and Evaluation Engine

## 15.1 Two-layer graph

- **Static skeleton** — derived from ASTs at package load. Same for every actor on that package
  version. Topologically sorted **once** and cached per `(packageId, version)`.
- **Dynamic overlay** — which modifiers are currently active (equipped items, conditions). Changes
  per actor, per moment. Adds edges into the skeleton.

Separating these is what makes the cost sane: the expensive analysis happens once per package
version, not per actor and never per render.

## 15.2 Evaluation

Lazy, memoized, pull-based:

1. Read `value:x` → memo hit? return.
2. Miss → resolve dependencies (recursively), gather active modifiers targeting `x`, apply phases
   (§16.4), memoize, return. If modifier resolution *fails* (§16.11A), `x` is `error`; that error is
   memoized exactly like a successful value and returned on subsequent reads.
3. Write a stored value → mark it and its transitive dependents dirty; **compute nothing**.
4. Next read recomputes only what is both dirty and actually read.

**Consequence for §2.5:** a sheet showing 40 values evaluates ~40 subgraphs, not 168 computeds over
whole objects. Editing one attribute dirties its dependents only. This is the concrete mechanism by
which the Rules Engine makes sheets faster rather than slower.

## 15.3 Ordering and stability

Within a phase, modifiers are ordered by
`(explicitOrder, sourceDefinitionId, sourceInstanceId, attachmentIndex)` — never *actor-state* array
or load order, which is not stable across loads. This makes evaluation reproducible across machines
and sessions, which is a prerequisite for trace comparison and for golden tests.

**`attachmentIndex` was added in revision 3** and is the modifier's position within its
`SourceDefinition.modifiers` array. Without it the key is not total: two modifiers attached to the
*same* Source instance with the same `explicitOrder` tie on all three original components, leaving
their relative order undefined — which for `exclusive` stacking (§16.11) decides the winner. A
Source's own `modifiers` array is part of the immutable, integrity-hashed package document (§11.1),
so it *is* stable across loads; the revision-2 warning about array order refers to actor-state
arrays, not to package documents.

## 15.4 Memoization boundaries

Memo cache is keyed by `(actorStateVersion, contextHash)`. Context-dependent values (a bonus that
only applies "while attacking") are evaluated under a context and cached under that context's hash,
so the general case doesn't poison the specific one.

**`error` values are memoized on identical terms** *(revision 3, §16.11A)*. An `error` is a
`RuleValue` (§14.4) and is a pure function of the same immutable inputs, so caching it is sound;
declining to cache it would reserve the worst repeated-work case for the worst content. Errors are
never sticky: any actor-state edit bumps `actorStateVersion` and discards them with everything else,
so fixing the cause clears the error on the next read.

## 15.5 Traces

The evaluator has a tracing mode that records `{step, label, sourceId, operation, operand,
runningValue}`. **Off by default.** Because evaluation is deterministic and replayable,
`explain(path)` re-runs just that subgraph with tracing on. Explanation therefore costs nothing
until a user asks — which is why explainability and performance are not in tension here.

## 15.6 Evaluation context

```ts
type EvaluationContext = {
  purpose?: string                          // "attack" | "travel" | ...
  actors?: Record<string, ActorStateRef>    // RESERVED (§9.1) — V1 populates only "self"
  world?: WorldConfigSnapshotRef
  tags?: string[]                           // ad-hoc facts, cf. PF2e roll options (§6.2)
  seed?: string                             // rolls only
}
```

The `actors` map is present and unused in V1. Carrying it now is nearly free; adding it later means
changing every evaluator signature.

## 15.7 Performance targets

Full evaluation of a realistic actor (~200 values, ~50 modifiers, ~100 collection items) should be
comfortably sub-frame on a typical client; incremental re-evaluation after a single edit should touch
only the dirty subgraph. These are design intents to be **measured in Phase 1** (§33), not
measurements — this repository has no benchmarks today and I will not invent numbers.

## 15.8 Where evaluation runs

Both, from one implementation in `app/lib/rules/` (the `server/api/systems/*` files already import
from `app/lib/`, so this is an established pattern).

- **Client**: all derived values, immediately, for responsiveness. Treated as a **preview**.
- **Server**: authoritative for anything persisted, contested, or GM-visible-only, and for all
  randomness. The server re-evaluates from stored state; it never trusts a client-sent derived value.

Because evaluation is pure, running it twice is cheap and the results are comparable. A mismatch is a
detectable tamper/version signal (§23.3).

---

# 16. Modifier and Effect System

The hardest part, as the brief says. Treated accordingly.

> **Revision 3 note.** §16 was materially rewritten after the Modifier Pipeline was implemented
> against revision 2 and surfaced seven under-specified areas: source-scoped expressions, standalone
> modifier attachment, collection-item source activation, the modifier-type declaration site, the
> suppression model, and the `base`/`clamp` phase semantics. Every one is now resolved with an
> explicit V1 decision. Four revision-2 statements are **reversed** and are flagged inline:
> unknown modifier types no longer default to `stack`, `base`-phase modifiers are no longer legal,
> `suppresses` is no longer an untyped string array, and a non-`true` condition result no longer
> excludes a modifier — only a `false` one does (§16.11A). See §1.1 and §16.17.

## 16.1 Shape

A modifier has one shape, authored in one of two positions.

```jsonc
// Inline inside a Source — no id of its own, scoped to that Source.
{
  "target": "value:defense",
  "phase": "add",
  "modifierType": "equipment",
  "value": { "text": "2", "ast": {} },
  "condition": { "text": "@source:equipped", "ast": {} },
  "order": 0,
  "label": "Shield",
  "suppressible": true
}
```

```jsonc
// Standalone, reusable — has its own id and kind, attached by reference (§16.10).
{
  "id": "modifier:shield.defense",
  "kind": "modifier",
  "target": "value:defense",
  "phase": "add",
  "modifierType": "equipment",
  "value": { "text": "2", "ast": {} },
  "condition": { "text": "@source:equipped", "ast": {} },
  "label": "Shield"
}
```

Modifiers are attached to **Sources** — items, conditions, features, progression grants, campaign
extensions. A Source is active or not; its modifiers apply or not.

**Invariant (new in revision 3): every modifier that reaches evaluation does so through exactly one
active Source instance.** There is no other activation path. This is what makes `@source:` (§16.9)
always resolvable, provenance (§27) always available, and ordering (§15.3) always total.

> Revision 2 wrote the condition above as `@source.equipped`. That syntax was never legal under
> `expression-language.md`'s grammar. The canonical form is `@source:equipped` (§16.9).

## 16.2 Two distinct target kinds

This is a real separation that Foundry blurs, and getting it wrong is expensive:

- **Value Modifiers** target a Value path. They change a number/text/boolean.
- **Roll Modifiers** target a Roll Spec. They add dice, change selection policy, change reroll
  policy, shift a success threshold, or adjust degrees of success.

**"Advantage" is not a value modifier.** It does not change a number; it changes how dice are
selected. Modelling it as `+X` is how systems end up unable to express dice pools or roll-under.
§17.3 shows all three proof systems falling out of one Roll Spec structure precisely because of this
split.

## 16.3 Stacking is package-declared, never assumed

**Declaration site (resolved in revision 3): `manifest.modifierTypes`.** It sits in the manifest for
the same reason `semanticRoles` does — it is package-wide policy that the engine must understand,
not content, and it is not referenced by any expression, so it needs no `DefinitionId` and no
registry entry.

```jsonc
// RulesPackageManifest.modifierTypes
"modifierTypes": [
  { "id": "equipment",    "stacking": "highest", "label": "Equipment" },
  { "id": "circumstance", "stacking": "highest" },
  { "id": "untyped",      "stacking": "stack" },
  { "id": "curse",        "stacking": "lowest" },
  { "id": "morph",        "stacking": "exclusive" }
]
```

A declaration carries exactly three fields: `id` (the key `ModifierSpec.modifierType` names),
`stacking`, and an optional `label` for UI. Allowed-phase and value-type constraints were considered
and rejected — neither has any grounding in a worked example, and both are derivable from the
policy itself (§16.11).

D&D 5e mostly stacks; PF2e mostly doesn't and **hardcodes that** (§6.2, §7.2); other systems take
best-of-all. Baking any of these into the engine would silently prevent whole families of games.

**`modifierType` is optional on a modifier.** An omitted `modifierType` means the modifier does not
participate in typed stacking: it always applies, and it forms its own group of one (§16.11). This
is the common case in most systems, and requiring a ceremonial `"modifierType": "untyped"` on every
modifier would be authoring noise for no gain.

**REVERSAL of revision 2: a `modifierType` that names an undeclared type is a package validation
error, not a `stack` default with a warning.** Revision 2's "default to `stack`" wording was written
when no declaration site existed, so *every* type was necessarily unknown and a hard error would
have rejected every package. Now that types are declarable, silently defaulting is strictly harmful:
a typo (`"equipmnet"`) would silently downgrade `highest` to `stack` and produce a wrong number with
no diagnostic — precisely the class of quiet corruption §28 exists to prevent.

## 16.4 Phases

Applied in fixed order; within a phase, §15.3 ordering; per-phase stacking resolution per type
(§16.11):

1. `base` — the starting value. **Reserved for the Value's own formula or default. Not a modifier
   slot** (see below).
2. `set` — hard override of the base
3. `add` — additive, grouped by modifier type, resolved per that type's policy
4. `scale` — multiplicative
5. `clamp` — bounds the running value; every clamp modifier declares an explicit bound (§16.12)
6. `final` — post-clamp override (rare; escape valve for "regardless of anything, this is 0")

Fixed phase order is a deliberate constraint. Author-controlled ordering is how Roll20 sheets became
unreasonable (§7.4).

**REVERSAL of revision 2: a modifier may not declare `phase: "base"`. It is a package validation
error.** Revision 2 listed `base` among the phases without saying what a modifier *in* that phase
does, and the implementation found there is no coherent answer that `set` does not already cover:
both replace the running value, and they differ only in which runs first. The `base` phase exists in
the trace vocabulary (§27.1 shows a `base` step) and in the pipeline's phase ordering, but it is
occupied by the Value's own formula/default and nothing else. A modifier's legal phases are
therefore `set | add | scale | clamp | final`.

**`add` and `scale` are numeric-only.** `set`, `final`, and `base` accept any `RuleValue`. `clamp` is
numeric-only (§16.12). This is what makes stacking selection well-defined for every supported type
(§16.11).

## 16.5 The full capability matrix

| Requirement | Mechanism |
|---|---|
| Flat bonus | `phase: add` |
| Multiplier | `phase: scale` |
| Override | `phase: set` / `final` |
| Min / max | `phase: clamp` |
| Advantage-like | **Roll Modifier**: `selection: {keep: "highest", count: 1}` on a 2-die pool |
| Dice add/remove | Roll Modifier: `dice: +1d6` |
| Rerolls | Roll Modifier: `reroll: {when: "<= 1", limit: 1}` |
| Success thresholds | Roll Modifier: `successRule.threshold` |
| Replacement value | `phase: set` with a formula |
| Conditional | `condition` expression — must yield `boolean` (§16.11A) |
| Condition failure | Non-boolean or `error` → propagates as `error` on the target, never as `false` (§16.11A) |
| Typed stack/no-stack | `modifierType` + §16.3 |
| Duration | `duration` on the Source instance |
| Source | Source instance ID (always recorded) |
| Priority | `order` within phase |
| Target path | `target` |
| Scope | Source activation (§16.8) + `condition` |
| Min / max bound | `phase: clamp` + explicit `clamp: "min" \| "max"` (§16.12) |
| Reusable modifier | Standalone `kind: "modifier"` + `{ "ref": … }` attachment (§16.10) |
| Item-carried modifier | Collection `sourceRefField` (§16.8) |
| "While equipped" | `condition` reading `@source:equipped` (§16.9) |
| Suppression | `suppresses: { sources: [...], tags: [...] }` (§16.6) |
| Immunity | `suppresses.tags` — suppress every active Source carrying a tag |
| Removal | Remove the Source instance from actor state |
| Provenance | Every trace step names the source instance (§27) |

## 16.6 Suppression and immunity

One mechanism: a Source may suppress other Sources, by **Source DefinitionId** or by **tag**.

```jsonc
{
  "id": "source:condition.immuneToPoison",
  "kind": "source",
  "tags": ["condition"],
  "suppresses": { "tags": ["poison"] },
  "modifiers": []
}
```

**Revision 3 replaces `suppresses: string[]` with a structured shape.** The untyped array was
ambiguous by construction — nothing in an entry said whether it was a Source id or a tag, so no
implementation could honour both without guessing. `suppresses.sources` holds Source DefinitionIds;
`suppresses.tags` holds tags matched against `SourceDefinition.tags` (exact string match, no
predicate language). This is a breaking change to a field no shipped package uses.

Rules, all preserved from revision 2 except where noted:

- Suppression resolves **before** any modifier application, in **one pass**.
- Matching is at the **SourceDefinition** level, never instance-targeted. You suppress "all stressed
  conditions", not "that particular instance of stressed". Instance-targeted suppression is not a V1
  capability.
- Suppression is **not transitive** (A suppresses B; B's suppression of C still applies). This
  follows directly from computing the suppressed set from the full *pre-suppression* active set in
  one pass — a suppressed Source is still consulted as a suppressor. Non-transitivity is a
  simplification flagged explicitly as a known limitation rather than an oversight: transitive
  suppression needs a fixpoint and can oscillate.
- **A suppressed Source can still suppress another Source.** That is what non-transitive means, and
  it is the intended architecture, not an implementation artifact.
- Tag *predicates* (comparison, negation, boolean composition over tags) are deferred to V2. Exact
  tag match covers the immunity use case, and a predicate mini-language has no worked example
  anywhere in this document to ground its syntax.

## 16.7 Duration

Declared on the Source instance (`rounds`, `minutes`, `until-rest`, `permanent`, `custom`). **V1
decrements only on explicit user action.** No automatic expiry — that needs the event layer (§9.1),
and a half-built event layer is worse than none.

**Duration does not gate activation.** A Source instance present in the overlay is active regardless
of its `duration.remaining`; the engine never infers expiry. A package that wants a modifier to stop
applying when a duration runs out writes that explicitly:
`"condition": { "text": "@source:duration.remaining > 0" }`. This keeps "what is active" a pure
function of stored state rather than of wall-clock or turn-counter inference.

## 16.8 Source activation and the dynamic overlay

§15.1 splits the graph into a static skeleton and a **dynamic overlay**. This section defines the
overlay precisely: what is in it, where it comes from, and who builds it.

A **Source instance** is an activation record. There are exactly **two** activation paths in V1:

**Path 1 — declared instances.** `ActorState.sources` (§13.1): "active modifier-carrying things not
in a collection". Conditions, temporary spell effects, granted class/ancestry features, environmental
effects. The instance is stored because its existence *is* a user/GM decision.

**Path 2 — collection-item instances.** A `CollectionDefinition` may declare
`sourceRefField` — the `itemSchema` key whose value names a `SourceDefinition`:

```jsonc
{
  "id": "collection:inventory",
  "kind": "collection",
  "sourceRefField": "sourceRef",
  "itemSchema": [
    { "key": "name",      "valueType": "text" },
    { "key": "quantity",  "valueType": "number", "default": 1 },
    { "key": "equipped",  "valueType": "boolean", "default": false },
    { "key": "sourceRef", "valueType": "ref", "refKind": "source" }
  ]
}
```

The field name is **schema-declared, not hardcoded and not conventional.** `sourceRef` is the
customary name and the one every example here uses, but the engine reads
`CollectionDefinition.sourceRefField` to find it. Hardcoding a magic key would contradict §16.3's own
"declared, never assumed" rationale, and costs one optional field to avoid.

**Every item whose `sourceRefField` resolves to a real `SourceDefinition` instantiates a Source
instance. Activation is not gated by any other item field.** There is deliberately no `activeWhen`
on the collection and no `equipped` convention in the engine: gating is expressed **only** by
modifier `condition`s reading `@source:` (§16.9). One mechanism, not two.

The consequence is important and intended: **an unequipped item's Source is present in the overlay
and inactive at the modifier level**, not absent. A trace can therefore explain *"Scale Hauberk is
carried but not equipped"* rather than silently omitting it.

**One item instantiates at most one Source** in V1 (`sourceRefField` is a single key). A
list-valued form is deferred to V2.

**Instance identity.** A collection-item Source instance takes the item's own `instanceId` as its
`instanceId`. Item instance ids are already required to be stable across reordering (§12.3), and
**`instanceId` values must be unique across the entire ActorState** — across every collection and
`ActorState.sources` — which V1 satisfies by construction since they are ULIDs.

**Provenance.** Every Source instance carries an `origin` recording how it was activated:

```jsonc
{ "kind": "declared" }
{ "kind": "collection", "collectionId": "collection:inventory", "itemInstanceId": "ci_01H…" }
```

`origin` is what lets a trace step name the item instance (§27.1) and what lets a future cache
layer know that editing an item field invalidates the values its Source modifies.

**Ownership — one subsystem, stated once.** The overlay is built by a dedicated pure function,
`buildSourceOverlay(registry, actorState) → SourceOverlay`, living in its own module
(`app/lib/rules/source-overlay.ts`). It is called **once, when an `EvaluationSession` is
constructed**, and the result is stored immutably on the session.

This is a genuinely new abstraction and it earns its place by resolving a real three-way ownership
problem that the implementation hit directly:

- **`ActorState` must not own it.** ActorState stores user decisions only (§13.2); a derived overlay
  persisted into it would be a cache with no invalidation strategy.
- **The Modifier Pipeline must not own it.** Deriving instances from collection items inside the
  pipeline would make modifier selection responsible for inventing actor state.
- **`EvaluationSession` must not *compute* it.** The session is a state container. It holds the
  overlay; it does not derive it.

`EvaluationSession`'s role widens by exactly one documented step: it calls `buildSourceOverlay` once
at construction. It gains no other computation.

## 16.9 Source-scoped expressions (`@source:`)

Canonical syntax: **`@source:<path>`** — a seventh reference namespace. Full grammar, tokenization,
typing, and failure behavior are specified in `expression-language.md` §8.2; this section states the
rules the Modifier system depends on.

**`@source:` binds to the one Source instance through which the enclosing modifier was activated.**
The invariant in §16.1 guarantees exactly one such instance always exists — for inline modifiers,
for referenced standalone modifiers (§16.10), for declared instances, and for collection-item
instances alike. There is no context in which an active modifier has no `@source:` binding.

**Lexical scope: `@source:` is legal only inside a `ModifierSpec`'s `value` and `condition`
expressions.** Anywhere else — a `ValueDefinition.formula`, a `RollSpec.dice`, an `ActionDefinition`
expression, a `ResourceDefinition.max` — it is a reference-validation error. This is the narrowest
scope that supports every canonical use case.

**Visible fields.** Two groups, one flat namespace:

| Path | Type | Availability |
|---|---|---|
| `@source:instanceId` | text | always |
| `@source:definitionId` | text | always |
| `@source:duration.kind` | text | always (`""` when no duration) |
| `@source:duration.remaining` | number | always (`0` when no duration) |
| `@source:<itemField>` | declared by the item schema | only for collection-item instances |

`instanceId`, `definitionId`, `duration`, and `origin` are **engine-reserved**. A
`CollectionDefinition.itemSchema` that declares a field with any of those keys is a package
validation error — that is what keeps the flat namespace unambiguous instead of needing a
disambiguating sub-object.

**Absent field → `error`, never a zero.** Reading `@source:equipped` on a declared (non-item) Source
instance, or reading a misspelled field, produces a `RulesError` (§14.4). This is deliberate: §14.4's
"every value has a type-appropriate zero" applies to values whose type is known, and an absent field
has no known type. Silently returning `false` for `@source:equiped` would disable a modifier forever
with no diagnostic.

**And that error must reach the player, not be re-swallowed by the pipeline.** A `RulesError` from an
absent `@source:` field propagates out of the condition and makes the target Value `error`, with the
modifier and Source instance named (§16.11A). It is *not* treated as "not true". Without that rule
this whole section would be decorative: producing an error and then having the next stage interpret
it as `false` gives exactly the silent, permanent deactivation the error was introduced to prevent.

**No static dependency edge.** `@source:` refers to runtime instance data — a Source instance and,
for item instances, that item's stored field values — never to a Definition. Dependency extraction
must emit **no** graph edge for the `source` namespace, exactly as it emits none for `ctx`, `world`,
`sources`, or `choice`. The static skeleton is package-level and identical for every actor (§15.1);
item field values are per-actor. The real relationship — "editing this item's `equipped` field
invalidates values its Source modifies" — is a *runtime invalidation* relationship (§16.16), carried
by `origin`, not a static edge.

## 16.10 Standalone modifier attachment

**A standalone modifier becomes active by being referenced from an active Source's `modifiers`
array. That is the only activation path.**

`SourceDefinition.modifiers` accepts inline specs and references, in one array, in author order:

```jsonc
{
  "id": "source:item.scaleHauberk",
  "kind": "source",
  "label": "Scale Hauberk",
  "modifiers": [
    { "ref": "modifier:armour.guard" },
    { "target": "value:stealth", "phase": "add", "value": { "text": "-1" },
      "condition": { "text": "@source:equipped" } }
  ]
}
```

One array rather than a parallel `modifierRefs` was chosen so that authoring order — which is the
final ordering tiebreak (§15.3) — is expressible across both forms without a merge rule. The
alternatives were rejected: a back-reference on the modifier (`ModifierDefinition.source`) inverts
ownership and makes a Source's modifier list non-local; package-level attachment records add a third
structure to read; and eliminating standalone modifiers entirely would force copy-paste for the
genuinely reusable case (`modifier:resistance.fire` attached to a ring, a spell, and a feature).

Decisions:

1. **Activation:** only via `{ "ref": … }` from an active Source.
2. **Multiple attachment:** yes — one standalone modifier may be referenced by any number of Sources.
   That is the point.
3. **Coexistence:** inline and referenced entries may be freely mixed in one `modifiers` array.
4. **Provenance:** a referenced modifier behaves *exactly* as if inlined at that position. It
   inherits the Source instance's `instanceId`, `definitionId`, and `origin`, and its `@source:`
   binds to that instance. A modifier's own `DefinitionId` is never its provenance.
5. **Ordering:** `(explicitOrder, sourceDefinitionId, sourceInstanceId, attachmentIndex)` — see
   §15.3, which revision 3 extends with the fourth component.
6. **An unattached standalone modifier is a validation *warning*, not an error.** It is dead content,
   not incorrect content, and a package may legitimately ship a library of modifiers that a campaign
   extension (§13.6, §21.5) attaches later. The warning names the modifier id.
7. **Reference validation:** `{ "ref": X }` must resolve to a Definition with `kind: "modifier"`.
   A missing target or a wrong-kind target is a reference-validation error.
8. **Graph edges:** attachment adds `source → modifier` (the Source's contribution requires that
   modifier's expressions). Combined with the existing inverted `target → source` edge, a cycle
   routed through a referenced modifier is fully visible to static detection (§16.15 example 8).
9. **Authoring reusable modifiers:** define them top-level with `id` + `kind: "modifier"`, attach by
   reference. There is no other sanctioned pattern.
10. **`ModifierDefinition.id`/`.kind` optionality is removed.** Revision 2 made both optional so one
    type could serve both positions, which forced every consumer — registry, dependency graph,
    evaluator — to carry an unreachable "no kind" branch. Revision 3 splits the type: `ModifierSpec`
    (no identity) is what appears inline, and `ModifierDefinition = ModifierSpec & { id; kind }` is
    what appears top-level. This is a breaking type change and it is justified: it makes every member
    of the `Definition` union have a required `id` and `kind`, which is what the registry has always
    assumed.

## 16.11 Stacking resolution

Precise algorithm, applied per target, after phase grouping.

**Grouping key: `(target, phase, modifierType)`.** Since resolution always runs for one target at a
time, this reduces to `(phase, modifierType)` in practice. Phase must be in the key — taking the
"highest" across an `add` and a `scale` bonus is meaningless. A modifier with no `modifierType` forms
its own group of one and is never grouped with another.

**Stacking selection applies to the `add` and `scale` phases only.** `set`, `final` (and `base`,
which holds the formula) are override phases where the rule is simply *last in §15.3 order wins* —
"the highest of two text overrides" is not a coherent operation. `clamp` has its own resolution
(§16.12). This boundary is what makes every policy well-defined for every supported `RuleValueType`.

**Policies:**

| Policy | Rule |
|---|---|
| `stack` | Every candidate applies, in §15.3 order. |
| `highest` | Exactly one applies: the greatest numeric value. Ties broken by §15.3 order, first wins. |
| `lowest` | Exactly one applies: the least numeric value. Ties broken by §15.3 order, first wins. |
| `exclusive` | Exactly one applies: **first in §15.3 order**, selected by priority, not by magnitude. |

`exclusive` is selected by `order`, not by value, because §16.3's own example for it is `morph`
(polymorph-style effects): the semantics is "only one such effect can be in force", and which one is
a priority question. **More than one active `exclusive` candidate is not an error** — it is the
normal case the policy exists to resolve.

**Stage ordering — the sequence is fixed and total:**

1. Discovery (§16.8 overlay) → 2. Suppression (§16.6) → 3. Target match → 4. **Ordering** (§15.3) →
5. **Condition evaluation** → 6. **Candidate value evaluation** → 7. Phase grouping (§16.4) →
8. **Stacking selection** → 9. Application (evaluator).

- **Conditions are evaluated before selection** (step 5 < 8). A modifier whose condition evaluates to
  `false` is not a candidate at all, so it can never win a `highest` contest. A condition that
  *fails* is a different matter entirely and is governed by §16.11A.
- **Values are evaluated before selection** (step 6 < 8), because `highest`/`lowest` cannot compare
  what has not been computed.
- **Every candidate value is evaluated exactly once, for every policy** — including `exclusive`,
  where only the winner's value is strictly needed. Uniform evaluation keeps the count of expression
  evaluations independent of the policy, which matters for determinism and for trace completeness.
  The one exception is failure: the first condition or value error aborts the whole resolution
  (§16.11A), so candidates ordered after it are not evaluated at all.
- **Ordering precedes condition evaluation** (step 4 < 5) so that conditions — which may read other
  Values — are themselves evaluated in a deterministic sequence.
- **Stacking runs after phase grouping** (step 7 < 8), since phase is part of the grouping key.

**Candidate value edge cases:**

| Candidate value | Behavior |
|---|---|
| `error` | Propagates; the target evaluates to `error` (§14.4). |
| Non-numeric in `add`/`scale` | `error` on the target. These phases are numeric-only (§16.4). |
| Non-numeric under `highest`/`lowest` | `error`. Comparison requires numbers; skipping the candidate would silently change the result. |
| `diceSpec` | Not valid in `add`/`scale`. Dice belong to Roll Modifiers (§16.2), deferred to V2. |
| Mixed `RuleValueType`s in one group | `error`. Never coerce. |

**Static rejection:** an undeclared `modifierType` is rejected at package validation (§16.3), so
selection never encounters an unknown policy at runtime.

**Error handling at every stage is specified in §16.11A**, which governs the candidate edge cases
above rather than being governed by them.

## 16.11A Condition results and error propagation

> **This section corrects a defect in revision 3 as first drafted.** Revision 3 retained the
> implemented behavior *"a condition that does not yield `true` — including a `RulesError` or a
> non-boolean `RuleValue` — excludes the Modifier"*, and that rule is incompatible with three other
> decisions this same revision made: absent `@source:` fields are runtime errors rather than zeros
> (§16.9), runtime dynamic cycles surface as `RulesError` values (§14.8, §16.13 example 8), and §28's
> governing principle is visible degradation over silent corruption. Under the retained rule those
> three guarantees were unreachable in practice: a misspelled `@source:` field, or a runtime cycle
> reached through a condition, produced a `RulesError` that the pipeline immediately reinterpreted as
> "not true", dropped the modifier, and returned a plausible, wrong, undiagnosable final number. The
> rule is replaced below.

### The governing principle

> **False eligibility excludes. Evaluation failure propagates.**

These are two different things and the pipeline must never conflate them. `false` is an *answer* —
the package author said, in a well-formed expression, that this modifier does not apply right now.
`error` is the *absence* of an answer. Treating the absence of an answer as a "no" is exactly the
silent-corruption pattern §28 exists to prevent, and it is worse here than in arithmetic: an errored
addend at least makes the target visibly `error` under §14.4, whereas an errored *condition* used to
vanish without a trace.

### Condition result semantics

A `ModifierSpec.condition` is a **boolean context** (`expression-language.md` §7.1). Its four
possible outcomes are exhaustive and each has exactly one behavior:

| Condition result | Behavior | Classification |
|---|---|---|
| `true` (boolean) | The modifier remains an applicable candidate. | Eligibility |
| `false` (boolean) | The modifier is **intentionally inactive** and is excluded. No error, no diagnostic, no trace step. | Eligibility |
| Any other `RuleValue` (`number`, `text`, `diceSpec`, `list`, …) | Produce a **new** `RulesError`, code `modifier-condition-not-boolean`, naming the modifier's target, Source definition, Source instance, and the actual type received. Propagate it. | Failure |
| `error` (a `RulesError`) | **Propagate the existing `RulesError`**, enriched with modifier/Source provenance. Never converted to `false`, never replaced. | Failure |

**There is no truthiness in EEL.** A non-boolean condition is not "coerced and then judged"; it is a
type error the language deliberately does not paper over (§14.3 forbids implicit coercion generally,
and this is that rule applied to gating). Note that this makes a non-boolean condition an error at
*runtime* even in the cases type validation cannot catch statically — `@source:<itemField>` types are
statically unknown (§16.9), so `"condition": { "text": "@source:quantity" }` on a number-typed item
field passes static checks and errors at evaluation.

**A condition error must never silently disable a modifier.** That sentence is the whole decision.

### Pipeline failure semantics

Six questions, one canonical V1 answer each.

**1. First error aborts; errors are not accumulated.** Condition evaluation proceeds in the
deterministic §15.3 order, and the first condition that fails aborts resolution of that target
immediately. Remaining conditions are not evaluated, and no candidate values are evaluated.

Accumulation was considered and rejected. Accumulating means continuing to evaluate expressions in a
state already known to be broken — and because conditions may read other Values (§16.11 stage 4's
whole justification), continuing can produce *cascading* secondary errors whose only cause is the
first one. Reporting one true failure beats reporting one true failure plus four consequences of it.
Package validation, by contrast, *does* accumulate (§16.14), because there the whole point is to hand
an author a complete list before they publish; runtime evaluation has the opposite goal.

**2. The target Value evaluates to `error`.** It does not fall back to its unmodified base, and it
does not return a partial result computed from the modifiers that happened to resolve before the
failure. A partially-modified number is indistinguishable from a correct one on a character sheet,
which is precisely the corruption being prevented. The sheet renders that one value as a visible
inline error with its trace available, and every other value keeps working (§14.4, §28).

**3. The error is memoized, for the lifetime of the `EvaluationSession` only.** A `RulesError` is a
`RuleValue` (§14.4) and is memoized under the same `(actorStateVersion, contextHash)` key as any
other result (§15.4). This is sound because the session is immutable: the error is a pure function of
the same inputs that produced it, so re-deriving it would return the identical error. Not memoizing
would mean re-walking a known-failing subgraph on every read of a broken value — the worst possible
performance case reserved for the worst possible content. Any actor-state edit bumps
`actorStateVersion` and therefore discards the memoized error along with everything else; an error is
never sticky across a fix.

**4. Provenance is attached by enrichment, never by replacement.** A `RulesError` carries an optional
`provenance` record (§16.18) naming the target, the modifier's Source definition id, its Source
instance id, its `attachmentIndex`, and the pipeline stage that failed. Enrichment wraps: the
original `code`, `message`, and any `cause` chain are preserved intact, and provenance is added
around them. The trace records the failure as a step with `op: "error"` carrying the same provenance,
so `explain(path)` (§27) shows exactly which modifier, from which item or condition instance, broke
the value — the same provenance a successful modifier step would have carried.

**5. Yes — deterministic ordering determines which error surfaces first.** §15.3's total ordering key
is what makes "which error do I see" reproducible across machines and sessions. Without it, two
clients evaluating the same actor could report different first errors, and golden-trace testing
(§26.4) would be impossible for any package with more than one broken modifier. This is a second,
independent justification for the ordering key beyond the `exclusive`-stacking one in §15.3.

**6. No. A condition failure never allows later phases to continue.** Resolution aborts, the target
is `error`, and `set`/`add`/`scale`/`clamp`/`final` are not applied. Fail-closed, not fail-partial.

### Runtime cycles keep their identity

A `RulesError` reaching the pipeline from a runtime dynamic cycle (§14.8) is **not** re-classified as
a condition error. Its `code` stays `cycle-detected` and its cycle path is preserved verbatim;
provenance is added around it, naming the modifier whose condition entered the cycle. A cycle is a
structural problem with a specific, actionable diagnostic — the full path — and flattening it into a
generic "condition failed" would destroy the one piece of information that makes it fixable. The same
rule applies to any other `RulesError` with a specific code: enrich, never re-label.

### Error behavior at every pipeline stage

Stage numbering follows §16.11.

| # | Stage | `RulesError` behavior |
|---|---|---|
| 1 | Overlay construction (§16.8) | **Accumulated** into `SourceOverlay.diagnostics`; does not abort. An unresolvable `sourceRef` on an actor's item names no Source, so it targets nothing and has no Value to propagate to. It is surfaced in §27.5 diagnostics, which is where "visible" lives for state-level problems. This is the one accumulating stage, and it accumulates because it runs before any target is chosen. |
| 2 | Suppression (§16.6) | **Cannot error.** Exact-match set operations over static ids and tags. No expression is evaluated. |
| 3 | Target match | **Cannot error.** String equality against `ModifierSpec.target`. |
| 4 | Ordering (§15.3) | **Cannot error.** Total order over four static fields. |
| 5 | **Condition evaluation** | **Propagates immediately; aborts the target.** Per the table above. |
| 6 | **Candidate value evaluation** | **Propagates immediately; aborts the target.** Identical rule to stage 5, for the identical reason. Non-numeric in `add`/`scale`, mixed types in one group, and `diceSpec` are all *produced as* errors here (§16.11) and then obey this rule. |
| 7 | Phase grouping | **Cannot error.** Partition by `(phase, modifierType)`; both are validated statically (§16.3, §16.4). |
| 8a | `highest` / `lowest` comparison | **Cannot see an error.** Every candidate value was resolved at stage 6, and a non-numeric one aborted there. Comparison is total over numbers. A candidate is never skipped to make a comparison succeed — skipping would silently change the selected value. |
| 8b | `exclusive` selection | **Cannot error** (selection is by `order`, not by value) — but **a losing candidate's stage-6 value error still aborts the target.** §16.11 evaluates every candidate exactly once regardless of policy, so the error is real; suppressing it because that candidate lost would make error *visibility* depend on the stacking policy, which is not a property a policy is allowed to have. |
| 8c | `stack` selection | **Cannot error.** Every candidate applies; no selection occurs. |
| 9a | Clamp bound evaluation (§16.12) | **Propagates immediately; aborts the target.** A clamp bound is a candidate value and follows stage 6. |
| 9b | Clamp range check (§16.12) | **Produces** an `error` when the effective lower bound exceeds the effective upper bound, and that error aborts the target. |
| 9c | Phase application (evaluator) | **Propagates.** `1 + error` is `error` (§14.4). A running value that is already `error` stays `error` through every remaining phase. |

**No stage silently removes a candidate.** The only candidate removals in the entire pipeline are:
suppression (stage 2, an explicit package decision), target mismatch (stage 3), a `false` condition
(stage 5, an explicit authoring decision), and losing a stacking contest (stage 8, an explicit
declared policy). Every one is a decision some package author wrote down. Nothing is removed because
evaluating it went wrong.

## 16.12 Clamp semantics

A clamp modifier **declares its bound explicitly**. There is no inference, ever, and in particular
the evaluator never reads a `label` to decide whether a number is a floor or a ceiling.

```jsonc
{ "target": "value:guard", "phase": "clamp", "clamp": "max", "value": { "text": "30" },
  "label": "Maximum Guard" }
```

`clamp` is `"min"` (lower bound) or `"max"` (upper bound) and is **required whenever
`phase === "clamp"`** — expressed as a discriminated union on `phase` (§16.16), so a clamp modifier
without a bound is a *type* error, not a runtime guess. §16.4's revision-2 wording "min / max / floor
/ ceiling" named four operations where there are two: "floor" and "ceiling" are synonyms for the
lower and upper bound respectively, not distinct operations, and that wording is now corrected.

Resolution, given a running value `v`:

1. Collect every applicable `min` bound; the effective lower bound is the **greatest** of them.
2. Collect every applicable `max` bound; the effective upper bound is the **least** of them.
3. If both exist and `lower > upper` → **`error`**. An impossible range is an authoring mistake, and
   silently preferring one bound would produce a plausible wrong number.
4. Otherwise apply lower first, then upper.

Applying "greatest lower, least upper" makes the result **independent of §15.3 order**, which is
what makes multiple independent clamps composable — a racial minimum and an item maximum must not
depend on which package listed its Source first.

`clamp` is **numeric-only**: a non-numeric running value at the clamp phase is an `error`. Declared
`modifierType` stacking policies do **not** apply to clamp groups; §16.12's greatest-lower/least-upper
rule is the clamp resolution, and it replaces stacking for that phase.

`ValueDefinition.constraints` (`{min, max}`, §12.1) is a *separate* mechanism — a Definition-level
invariant, not a Modifier — and is out of scope for §16. Where both exist, constraints apply after
the whole modifier pipeline, at read time (§13.3).

## 16.13 Canonical worked examples

Every expression below parses under `expression-language.md` as revised, and every field appears in
the type delta (§16.18).

**Shared package fragment**

```jsonc
// manifest
"modifierTypes": [
  { "id": "equipment",    "stacking": "highest" },
  { "id": "circumstance", "stacking": "stack" },
  { "id": "morph",        "stacking": "exclusive" }
]
```

```jsonc
{ "id": "collection:inventory", "kind": "collection", "sourceRefField": "sourceRef",
  "itemSchema": [
    { "key": "name",      "valueType": "text" },
    { "key": "equipped",  "valueType": "boolean", "default": false },
    { "key": "sourceRef", "valueType": "ref", "refKind": "source" } ] }

{ "id": "value:agility", "kind": "value", "storage": "stored", "valueType": "number", "default": 14 }

{ "id": "value:agility.mod", "kind": "value", "storage": "derived", "valueType": "number",
  "formula": { "text": "floor((@value:agility - 10) / 2)" } }

{ "id": "value:guard", "kind": "value", "storage": "derived", "valueType": "number",
  "formula": { "text": "10 + @value:agility.mod" } }

{ "id": "source:item.scaleHauberk", "kind": "source", "label": "Scale Hauberk",
  "modifiers": [ { "ref": "modifier:armour.guard" } ] }

{ "id": "modifier:armour.guard", "kind": "modifier", "target": "value:guard", "phase": "add",
  "modifierType": "equipment", "value": { "text": "2" },
  "condition": { "text": "@source:equipped" }, "label": "Scale Hauberk" }
```

### 1. Equipped armour

```jsonc
"collections": { "collection:inventory": [
  { "instanceId": "ci_01H…", "name": "Scale Hauberk", "equipped": true,
    "sourceRef": "source:item.scaleHauberk" } ] }
```

Overlay: one instance `{ instanceId: "ci_01H…", sourceRef: "source:item.scaleHauberk",
origin: { kind: "collection", collectionId: "collection:inventory", itemInstanceId: "ci_01H…" } }`.

`modifier:armour.guard` is attached by reference and inherits that instance's provenance.
`@source:equipped` resolves through `origin` to the item's `equipped` field → `true` → applies.

Base `10 + 2 = 12`, `add` `+2` → **`value:guard = 14`**.

```jsonc
{ "path": "value:guard", "result": 14, "steps": [
  { "op": "base", "label": "Guard",         "value": 12, "running": 12 },
  { "op": "add",  "label": "Scale Hauberk", "sourceId": "source:item.scaleHauberk",
    "sourceInstanceId": "ci_01H…", "modifierType": "equipment", "value": 2, "running": 14 } ] }
```

### 2. Unequipped armour

Same item, `"equipped": false`.

**The Source instance still exists in the overlay** — the item is still carried. `@source:equipped`
resolves to `false` — a well-formed answer, not a failure — so the modifier is not applied.
`value:guard = 12`.

This is the intended distinction: *absent from the overlay* means "not carried at all"; *present but
condition-gated* means "carried, not equipped" — and only the second can be explained to a player.

The condition returned `false`, a well-formed answer, so exclusion here is ordinary eligibility and
produces no error and no diagnostic (§16.11A). Compare example 9, where the same-looking exclusion
would have hidden a real fault.

### 3. Temporary condition (no collection involved)

```jsonc
{ "id": "source:condition.stressed", "kind": "source", "tags": ["condition", "mental"],
  "modifiers": [ { "target": "value:guard", "phase": "add", "modifierType": "circumstance",
                   "value": { "text": "-2" } } ] }
```

```jsonc
"sources": [ { "instanceId": "cs_01H…", "sourceRef": "source:condition.stressed",
               "duration": { "kind": "rounds", "remaining": 3 },
               "origin": { "kind": "declared" } } ]
```

No condition expression, so it always applies while the instance exists. `value:guard = 12 - 2 = 10`.
Note it declares no `@source:equipped` — a declared instance has no item fields, and reading one
would correctly `error` (§16.9).

### 4. Reusable standalone modifier

`modifier:armour.guard` above *is* the example: one top-level definition, attached by `{ "ref": … }`
from `source:item.scaleHauberk`, and equally attachable from `source:item.plateArmour` without
duplication. Each attachment inherits its own Source instance's provenance, so two equipped armours
produce two distinct trace steps naming two distinct item instances.

### 5. Stacking

Base `value:guard = 12`. Four active Sources contribute `add` modifiers:

| Source instance | modifierType | value | order |
|---|---|---|---|
| `si_a` (`source:item.hauberk`) | `equipment` | 2 | 0 |
| `si_b` (`source:item.ring`) | `equipment` | 3 | 0 |
| `si_c` (`source:spell.bless`) | `circumstance` | 1 | 0 |
| `si_d` (`source:spell.guidance`) | `circumstance` | 2 | 0 |

- **`equipment` is `highest`** → group `{2, 3}` → **3** applies, `2` does not.
- **`circumstance` is `stack`** → both apply → **+3**.

Result: `12 + 3 + 3 = 18`.

**Exclusive conflict.** Two active `morph` modifiers on `value:size`, both `phase: set`:

| Source instance | modifierType | order |
|---|---|---|
| `si_e` (`source:spell.enlarge`) | `morph` | 10 |
| `si_f` (`source:spell.reduce`) | `morph` | 5 |

`morph` is `exclusive`, and `set` is an override phase — but the `exclusive` policy still selects the
single winner *before* the override rule applies. Selection is by §15.3 order: `order 5` precedes
`order 10`, so **`source:spell.reduce` wins deterministically**. This is **not an error**; resolving
the conflict is exactly what `exclusive` is for. The loser appears in the trace as suppressed-by-policy.

### 6. Clamp

```jsonc
{ "target": "value:guard", "phase": "clamp", "clamp": "min", "value": { "text": "10" },
  "label": "Minimum Guard" }
{ "target": "value:guard", "phase": "clamp", "clamp": "max", "value": { "text": "30" },
  "label": "Maximum Guard" }
```

Running value 8 → lower bound 10 applies → 10. Running value 34 → upper bound 30 applies → 30.
Running value 18 → unchanged. If a third Source added `clamp: "min"` of `35`, the effective range
would be `[35, 30]` → **`error`**, not a silently-picked bound.

### 7. Suppression (non-transitive)

```jsonc
{ "id": "source:a", "kind": "source", "suppresses": { "sources": ["source:b"] }, "modifiers": [] }
{ "id": "source:b", "kind": "source", "suppresses": { "sources": ["source:c"] },
  "modifiers": [ { "target": "value:guard", "phase": "add", "value": { "text": "2" } } ] }
{ "id": "source:c", "kind": "source",
  "modifiers": [ { "target": "value:guard", "phase": "add", "value": { "text": "4" } } ] }
```

All three instances active. One pass over the **pre-suppression** set: `A` suppresses `B`; `B`
suppresses `C`. **C remains suppressed** even though B itself is suppressed — suppression is not
transitive, and a suppressed Source is still consulted as a suppressor. Neither `+2` nor `+4`
applies; `value:guard` keeps its base.

### 8. Runtime dynamic cycle

```jsonc
{ "id": "value:guard",  "kind": "value", "storage": "derived",
  "formula": { "text": "10 + @value:agility.mod" } }
{ "id": "value:morale", "kind": "value", "storage": "derived",
  "formula": { "text": "@value:guard" } }

{ "id": "source:spell.desperation", "kind": "source",
  "modifiers": [ { "target": "value:guard", "phase": "add", "value": { "text": "2" },
                   "condition": { "text": "@value:morale < 12" } } ] }
```

Statically, the graph contains `value:guard → source:spell.desperation → value:morale → value:guard`
— a real cycle, and static detection **does** reject this package. Now make the modifier's *presence*
conditional on runtime state instead:

The same modifier attached to a Source that is only ever instantiated by an equipped item means the
cycle exists **only in actor states where that item is carried**. Static analysis operates on the
package skeleton, which is identical for every actor (§15.1), and cannot know which items an actor
holds — so it cannot reject a package that is cyclic only under some overlays without rejecting
legitimate packages outright.

The evaluator's visit stack catches it: evaluating `value:guard` pushes `value:guard`, resolves the
modifier's condition, which evaluates `value:morale`, which re-enters `value:guard` — already on the
stack → `error` naming the full path, never a hang (§14.8). Static detection and the runtime guard
are complementary, not redundant: static rejects what is *always* cyclic, the guard catches what is
*sometimes* cyclic.

**That error is the result.** The cycle `RulesError` arrives as the outcome of a *condition*
evaluation, and §16.11A is what makes it survive: it aborts resolution of `value:guard`, which
evaluates to `error`, with the cycle path preserved verbatim and the modifier's provenance added
around it.

```jsonc
{ "path": "value:guard", "result": { "kind": "error", "code": "cycle-detected",
    "message": "cycle: value:guard → source:spell.desperation → value:morale → value:guard",
    "provenance": { "targetId": "value:guard", "stage": "condition",
                    "sourceDefinitionId": "source:spell.desperation",
                    "sourceInstanceId": "si_01H…", "attachmentIndex": 0 } },
  "steps": [
    { "op": "base",  "label": "Guard", "value": 12, "running": 12 },
    { "op": "error", "label": "Desperation", "sourceId": "source:spell.desperation",
      "sourceInstanceId": "si_01H…", "code": "cycle-detected" } ] }
```

Note the `code`: it is `cycle-detected`, **not** `modifier-condition-not-boolean`. The pipeline
enriched the error without re-labelling it (§16.11A), so the player-facing diagnostic still names the
actual cycle rather than a generic condition failure. Had revision 3 kept the "non-true excludes"
rule, this example would have ended with `value:guard = 12` and no diagnostic anywhere — the
architecture would have claimed cycles are visible while guaranteeing they are not.

### 9. Condition failure — a misspelled `@source:` field

The one-character version of the same defect, and the reason `@source:` absent-field errors (§16.9)
are load-bearing rather than decorative.

```jsonc
{ "id": "modifier:armour.guard", "kind": "modifier", "target": "value:guard", "phase": "add",
  "modifierType": "equipment", "value": { "text": "2" },
  "condition": { "text": "@source:equiped" }, "label": "Scale Hauberk" }
```

`equiped` is a typo; the item schema declares `equipped`. The field is absent, so the condition
evaluates to `error` (§16.9). Under §16.11A that error propagates: resolution of `value:guard`
aborts, and the value renders as a visible inline error naming `modifier:armour.guard`, the item
instance it came from, and the missing field.

```jsonc
{ "path": "value:guard", "result": { "kind": "error", "code": "source-field-absent",
    "message": "@source:equiped is not a field of source instance ci_01H… (collection:inventory)",
    "provenance": { "targetId": "value:guard", "stage": "condition",
                    "sourceDefinitionId": "source:item.scaleHauberk",
                    "sourceInstanceId": "ci_01H…", "attachmentIndex": 0 } } }
```

The rejected alternative produced `value:guard = 12` — correct-looking, permanently wrong, and
indistinguishable from example 2's legitimately unequipped armour. **Example 2 and example 9 must not
look the same to a player, and under §16.11A they do not**: example 2 is `false` (an answer, quietly
excluded), example 9 is `error` (no answer, loudly surfaced). That distinction is the entire content
of "false eligibility excludes; evaluation failure propagates".

The same treatment applies to a non-boolean condition. `"condition": { "text": "@source:quantity" }`
on a `number` item field passes static type validation — item-field types are statically unknown
(§16.9) — and errors at evaluation with `modifier-condition-not-boolean`, naming the type received.

## 16.14 Validation ownership

Each new rule has exactly one owning phase.

| Rule | Owner |
|---|---|
| `@source:x` tokenizes and parses | parser |
| Bare `@source` (no path) rejected; `@sources:x` rejected | parser |
| `@source:` used outside a `ModifierSpec` expression | reference validation |
| `{ "ref": X }` resolves to an existing `kind: "modifier"` Definition | reference validation |
| Collection `sourceRefField` names a declared `itemSchema` key | package structural validation |
| That key's field is `valueType: "ref"`, `refKind: "source"` | package structural validation |
| `itemSchema` must not declare an engine-reserved key | package structural validation |
| `modifierType` names a declared `manifest.modifierTypes` entry | package structural validation |
| Modifier `phase` is not `base` | package structural validation |
| `phase: "clamp"` carries a `clamp` bound | package structural validation (and the type system) |
| Standalone modifier with no attachment (**warning**) | package structural validation |
| `suppresses.sources` entries resolve to `kind: "source"` | reference validation |
| `ActionEffect.target` resolves to a Value or Resource | reference validation |
| `@source:` engine-field types (`instanceId`, `duration.remaining`, …) | type validation |
| `add`/`scale`/`clamp` operands are numeric | type validation (static) + evaluator (runtime) |
| Modifier `condition` is `boolean` **wherever its type is statically knowable** | type validation |
| Non-boolean condition result at runtime (statically-unknown types) | modifier pipeline (§16.11A) |
| `RulesError` from a condition or candidate value → abort + enrich with provenance | modifier pipeline (§16.11A) |
| Attachment edges `source → modifier` | graph construction |
| Always-cyclic packages | static cycle detection |
| Overlay-dependent cycles | runtime evaluator visit stack |
| Absent `@source:` field at runtime | evaluator |
| Impossible clamp range | evaluator |

Two of these deserve emphasis because they are a static/runtime pair, not a duplication. **Type
validation rejects a statically non-boolean condition at package validation** — `"condition":
{ "text": "@value:might" }` on a `number` Value is an error the author sees before publishing.
**The pipeline catches the rest at runtime**, because `@source:<itemField>` types are statically
unknown by construction (§16.9) and no static pass can decide them. Neither check subsumes the other,
and shipping only the runtime one would push a whole class of authoring mistakes past publication.

## 16.15 Runtime flow and module ownership

```
ActorState (stored user decisions)                          §13
        │
        ▼   buildSourceOverlay(registry, actorState)         source-overlay.ts      ← NEW
   SourceOverlay  (Source instances + origin provenance)     §16.8
        │
        ▼   held immutably, built once at construction       evaluation-session.ts
   EvaluationSession
        │
        ▼   suppression → target match → ordering →
        │   condition eval → candidate value eval →
        │   phase grouping → stacking selection             modifier-pipeline.ts    §16.6/§16.11
   ModifierResolution                                        §16.11A
        │
        ├── ok: false ─▶ RulesError + provenance ────────┐   §16.11A
        │                                                │
        ▼   ok: true                                     │
   Ordered, selected, value-resolved modifiers           │
        │                                                │
        ▼   base → set → add → scale → clamp → final     │   evaluator.ts            §16.4
   RuleValue ◀───────────────────────────────────────────┘   (error is a RuleValue, §14.4)
        │
        ├──▶ Trace steps (incl. terminal `op: "error"`)      evaluator → session     §27
        └──▶ Memo cache (errors memoized identically)        evaluator → session     §15.2
```

**Resolution failure is a first-class outcome of the pipeline, not an exception and not an empty
result.** The `ok: false` branch is the mechanism by which §28's "visible degradation" reaches an
actual pixel: it carries a `RulesError` with modifier and Source provenance (§16.11A) all the way to
the value the sheet renders. There is no path in this diagram where a failure is converted back into
a successful-looking number.

**The pipeline resolves candidate modifier *values*; it never computes the target's final value.**
That boundary is required rather than stylistic: `highest`/`lowest` selection cannot happen without
evaluating candidates, so value resolution must sit inside the pipeline, while composing base plus
selected modifiers into a result stays with the evaluator.

Only one new abstraction is introduced (`SourceOverlay`), and only because §16.8 identified a real
three-way ownership problem. `ActiveSourceResolver` and `ActorRuleState` were considered and rejected
as renamings of work already owned by the pipeline and the session respectively.

## 16.16 Derivation, structure, mutation, invalidation

Four relationships are routinely conflated. They are distinct, and only two are graph edges.

| Relationship | Example | Static graph? | Cycle-relevant? |
|---|---|---|---|
| **Derivation dependency** | `value:guard`'s formula reads `@value:agility.mod` | **Yes** | Yes |
| **Structural dependency** | `target → source`, `source → modifier`, `action → roll`, `action → cost resource` | **Yes** | Yes |
| **Imperative mutation target** | `ActionEffect.target` — an Action *writes* `value:stress.current` | **No** | No |
| **Runtime invalidation** | after that write, everything transitively depending on it is stale | Derived from the graph's reverse edges at runtime | No |

**`ActionEffect.target` is confirmed excluded from the dependency graph.** An Action effect is a
one-shot imperative write at execution time, not a continuous derivation: evaluating
`value:stress.current` does not require knowing that `action:overload` can modify it, the way it
requires knowing about an active Modifier targeting it. Treating every imperative write as a static
edge would make the graph cyclic almost everywhere and would reject legitimate packages.

It **does** participate in reference validation (it must name a real Value or Resource — a gap in the
current implementation), in package validation (kind check), and in cache invalidation after
execution (it is the entry point: invalidate the target, then walk `getDependents` transitively).

## 16.17 Revision-3 decision summary

| # | Decision | Status |
|---|---|---|
| A | `@source:<path>`, seventh namespace, mandatory path, modifier-scope only | New |
| B | Attachment via `{ "ref": … }` inside `SourceDefinition.modifiers` | New |
| B | `ModifierSpec` / `ModifierDefinition` split; `id`/`kind` no longer optional | **Breaking** |
| C | `CollectionDefinition.sourceRefField`; every referencing item instantiates a Source | New |
| C | `SourceOverlay` built once per session by `source-overlay.ts` | New |
| D | `manifest.modifierTypes` is the declaration site | New |
| D | Undeclared `modifierType` is an error, not a `stack` default | **Reverses rev 2** |
| D | Grouping key `(target, phase, modifierType)`; selection on `add`/`scale` only | New |
| E | `suppresses: { sources, tags }`; `SourceDefinition.tags` | **Breaking** |
| E | Non-transitive, one-pass, definition-level | Unchanged |
| F | `phase: "base"` illegal for modifiers | **Reverses rev 2** |
| F | `clamp: "min" \| "max"` required on clamp modifiers | New |
| G | `ActionEffect.target` excluded from the graph | Confirmed |
| H | A modifier `condition` is a boolean context; `false` excludes, non-boolean is an error | **Reverses rev 2** |
| H | A condition `RulesError` propagates and is never read as `false` | **Reverses rev 2** |
| H | First condition/value error aborts the target; errors are not accumulated at runtime | New |
| H | Condition errors are memoized for the session's lifetime, like any other `RuleValue` | New |
| H | Errors are enriched with provenance, never re-labelled (cycles keep `cycle-detected`) | New |

## 16.18 Type contract delta

Proposed changes to `app/lib/rules/types.ts` (and `ast.ts` where noted). Breaking changes are marked;
each is justified in the section that decided it.

```ts
// ── ast.ts ──────────────────────────────────────────────────────────────────
// §16.9 / expression-language.md §8.2. Seventh namespace. No new AST node kind.
export type ReferenceNamespace =
  | 'value' | 'collection' | 'sources' | 'choice' | 'world' | 'ctx'
  | 'source'                                    // NEW

// ── Modifier types (§16.3) ──────────────────────────────────────────────────
export type ModifierStacking = 'stack' | 'highest' | 'lowest' | 'exclusive'  // existed, now used

export type ModifierTypeDeclaration = {          // NEW
  id: string
  stacking: ModifierStacking
  label?: string
}

export type RulesPackageManifest = {
  // …existing fields unchanged…
  modifierTypes?: ModifierTypeDeclaration[]      // NEW
}

// ── Modifiers (§16.1, §16.10, §16.12) ───────────────────────────────────────
// BREAKING: replaces ModifierDefinition's optional id/kind with a clean split.
export type ModifierPhase = 'base' | 'set' | 'add' | 'scale' | 'clamp' | 'final'
export type ModifierApplicationPhase = Exclude<ModifierPhase, 'base'>   // NEW — §16.4
export type ClampBound = 'min' | 'max'                                  // NEW — §16.12

type ModifierSpecBase = {
  target: DefinitionId
  value: Expression | RuleValue
  condition?: Expression
  modifierType?: string
  order?: number
  label?: string
  suppressible?: boolean
}

// Discriminated on `phase`: a clamp modifier without a bound cannot be constructed.
export type ModifierSpec =                                              // NEW
  | (ModifierSpecBase & { phase: Exclude<ModifierApplicationPhase, 'clamp'> })
  | (ModifierSpecBase & { phase: 'clamp'; clamp: ClampBound })

export type ModifierDefinition = ModifierSpec & {                       // BREAKING
  id: DefinitionId                               // was optional
  kind: 'modifier'                               // was optional
}

export type ModifierReference = { ref: DefinitionId }                   // NEW — §16.10

// ── Sources (§16.6, §16.8) ──────────────────────────────────────────────────
export type SourceSuppression = {                                       // NEW
  sources?: DefinitionId[]
  tags?: string[]
}

export type SourceDefinition = {
  id: DefinitionId
  kind: 'source'
  label?: string
  tags?: string[]                                // NEW — §16.6
  modifiers: Array<ModifierSpec | ModifierReference>   // BREAKING: was ModifierDefinition[]
  duration?: SourceDuration
  suppresses?: SourceSuppression                 // BREAKING: was string[]
}

export type SourceOrigin =                                              // NEW — §16.8
  | { kind: 'declared' }
  | { kind: 'collection'; collectionId: DefinitionId; itemInstanceId: string }

export type SourceInstance = {
  instanceId: string
  sourceRef: DefinitionId
  duration?: SourceDuration
  origin?: SourceOrigin                          // NEW; absent in stored state = 'declared'
}

// ── Collections (§16.8) ─────────────────────────────────────────────────────
export type CollectionDefinition = {
  // …existing fields unchanged…
  sourceRefField?: string                        // NEW — itemSchema key naming a SourceDefinition
}

// ── Runtime overlay (§16.8) ─────────────────────────────────────────────────
// app/lib/rules/source-overlay.ts — NEW module.
export type ResolvedSourceInstance = {                                  // NEW
  instanceId: string
  definitionId: DefinitionId
  definition: SourceDefinition
  origin: SourceOrigin
  duration?: SourceDuration
  itemFields?: Record<string, RuleValue>         // present only for origin.kind === 'collection'
}

export type SourceOverlay = {                                           // NEW
  instances: readonly ResolvedSourceInstance[]
  diagnostics: readonly RulesError[]             // unresolvable sourceRefs, reserved-key clashes
}

// ── Modifier pipeline (§16.11, §15.3) ───────────────────────────────────────
// app/lib/rules/modifier-pipeline.ts — existing type, revised.
export type ActiveModifier = {
  spec: ModifierSpec                             // was `modifier: ModifierDefinition`
  phase: ModifierApplicationPhase
  modifierType?: string
  sourceDefinitionId: DefinitionId
  sourceInstanceId: string
  attachmentIndex: number                        // NEW — §15.3's fourth ordering component
  origin: SourceOrigin                           // NEW — carries item provenance for @source:
  resolvedValue: RuleValue                       // NEW — §16.11 step 6; required, never an error
}

// BREAKING (§16.11A): resolveActiveModifiers can no longer return a bare array.
// A condition or candidate-value failure aborts resolution, and that outcome has
// to be representable in the return type rather than smuggled out as an empty list
// — an empty list means "no modifiers apply", which is a legitimate success.
export type ModifierResolution =                                        // NEW — §16.11A
  | { ok: true;  modifiers: readonly ActiveModifier[] }
  | { ok: false; error: RulesError }

// ── Errors and provenance (§14.4, §16.11A) ──────────────────────────────────
export type ModifierPipelineStage =                                     // NEW — §16.11A
  | 'overlay' | 'condition' | 'candidate-value' | 'clamp-bound' | 'application'

export type RulesErrorProvenance = {                                    // NEW — §16.11A
  targetId: DefinitionId
  stage: ModifierPipelineStage
  sourceDefinitionId?: DefinitionId
  sourceInstanceId?: string
  attachmentIndex?: number
}

export type RulesError = {
  // …existing fields (kind, code, message, cause?) unchanged…
  provenance?: RulesErrorProvenance              // NEW — added by enrichment; `code`/`message`/
                                                 // `cause` are never overwritten (§16.11A)
}

// Codes introduced by revision 3. Enrichment never replaces an existing code, so a
// runtime cycle surfacing through a condition keeps `cycle-detected`.
//   'modifier-condition-not-boolean'  — §16.11A
//   'source-field-absent'             — §16.9
//   'clamp-range-impossible'          — §16.12

// ── Traces (§27) ────────────────────────────────────────────────────────────
export type TraceStep = {
  // …existing fields unchanged…
  sourceInstanceId?: string                      // NEW — §16.8 provenance
  clamp?: ClampBound                             // NEW — §16.12; a clamp step states its bound
  // `op` gains 'error' — a terminal step recording the failure that aborted the
  // target, carrying the same provenance a successful modifier step would (§16.11A).
  code?: string                                  // NEW — set only on an 'error' step
}

// ── Validation results ──────────────────────────────────────────────────────
export type PackageValidationSeverity = 'error' | 'warning'             // NEW
export type PackageValidationIssue = {                                  // NEW
  severity: PackageValidationSeverity
  code: string                                   // e.g. 'unattached-modifier', 'unknown-modifier-type'
  message: string
  definitionId?: DefinitionId
}
```

**Backward compatibility.** Four breaking changes are accepted deliberately:
`ModifierDefinition.id`/`.kind` becoming required (§16.10 decision 10), `SourceDefinition.modifiers`
accepting references (§16.10), `suppresses` becoming structured (§16.6), and `resolveActiveModifiers`
returning a `ModifierResolution` rather than an array (§16.11A). The first three replace *package*
shapes that were ambiguous or unusable by construction, and no published package exists to migrate —
the package format has never shipped. The fourth is an *internal* signature change with exactly two
call sites today, and it is unavoidable: a function whose only failure representation is an empty
array cannot distinguish "nothing applies" from "something broke".

---

# 17. Action / Check / Roll Model

## 17.1 Action Definition

```jsonc
{
  "id": "action:overload",
  "label": "Overload the Coupler",
  "costs":         [ { "resource": "value:stress", "amount": { "text": "1" } } ],
  "prerequisites": [ { "text": "@value:stress.current < @value:stress.max" } ],
  "inputs":        [ { "id": "target", "kind": "actor", "optional": true } ],
  "roll": "roll:standardPool",
  "outcomes": [
    { "when": { "text": "@ctx:successes >= 3" }, "effects": [ /* … */ ] },
    { "when": { "text": "@ctx:successes >= 1" }, "effects": [ /* … */ ] },
    { "when": { "text": "true" },                "effects": [ /* … */ ] }
  ],
  "presentation": { "template": "check", "title": "Overload" }
}
```

## 17.2 Pipeline

```
select action → validate prerequisites → resolve inputs → check costs
   → build Roll Spec (apply Roll Modifiers)
   → [ roll | manual entry | no roll ]
   → interpret result → select outcome → propose state changes
   → GM review (if configured) → commit → emit output + trace
```

Everything up to "commit" is a **proposal**. State changes are proposed, not applied, which is what
makes GM override (§17.8) and undo possible without special-casing.

## 17.3 Roll Spec — one structure, all three families

```jsonc
{
  "id": "roll:standardPool",
  "dice":      { "text": "dice(@value:pool, 6)" },
  "selection": { "keep": "all" },
  "reroll":    null,
  "successRule": { "kind": "countAtLeast", "threshold": 5 },
  "degrees": [ { "id": "critical", "when": "@ctx:successes >= 4" },
               { "id": "success",  "when": "@ctx:successes >= 1" },
               { "id": "failure",  "when": "true" } ]
}
```

The three proof families, from the same structure:

| Family | `dice` | `selection` | `successRule` |
|---|---|---|---|
| d20 roll-over | `1d20 + @mod` | `keep: all` | `atLeast: @ctx:dc` |
| d20 with advantage | `2d20` | `keep: highest 1` | `atLeast: @ctx:dc` |
| Percentile roll-under | `1d100` | `keep: all` | `atMost: @value:skill` |
| Dice pool | `dice(@pool, 6)` | `keep: all` | `countAtLeast: 5` |
| Manual/GM-narrated | *(none)* | — | `manual` |

`successRule.kind: "manual"` is what makes "the GM resolves this externally" a first-class outcome
rather than a missing feature.

## 17.4 Randomness and determinism

Rolls take an explicit **seed**. Server-generated, recorded with the result. Given the same seed,
spec, and state, the same result — so a disputed roll can be replayed and verified. The client may
*animate* a roll (via the existing `EldraDiceBox`), but the server's result is authoritative and the
animation is told what to show.

## 17.5 Costs and state changes

Costs are validated server-side against freshly re-evaluated state (never against client-sent
numbers) and applied atomically with the outcome. A failed cost check aborts before rolling.

## 17.6 Output presentation

`presentation.template` names an **Eldra-provided** template (`check`, `damage`, `simple`,
`table-result`) and supplies data. Borrowed from Roll20's roll templates (§7.3), but templates are
Eldra components, not package markup — packages choose and populate, never author.

## 17.7 Non-dice randomizers

`dice` is one `randomizer` kind. `table` (weighted lookup) and `card` (draw without replacement) are
reserved in the type and unimplemented in V1.

## 17.8 GM override

Any proposed outcome can be replaced by a GM before commit. The trace records both the computed and
the overridden result, so audit history stays honest. Requires the permissions work in §24 to be
meaningful; the data shape exists from V1 regardless.

---

# 18. Character Sheet Contract

## 18.1 The honest constraint

**I disagree with the framing that sheets can be fully package-defined.** Generated forms are usable
and ugly; Eldra's sheet quality is a genuine differentiator, and Roll20 buys layout freedom by
letting packages ship markup — which is exactly the coupling this architecture exists to prevent.

**The split:** packages declare *structure, semantics, and layout intent*. Eldra owns *components,
visual design, responsiveness, accessibility, and theming*.

## 18.2 Layout declaration

```jsonc
{
  "id": "layout:default",
  "actorKinds": ["pc"],
  "presentations": ["desktop", "mobile", "print"],
  "tabs": [
    { "id": "main", "label": "Character",
      "sections": [
        { "id": "attributes", "layout": "grid", "columns": 3,
          "fields": [
            { "value": "value:might", "control": "stepper" },
            { "value": "value:might.mod", "control": "readonly", "explain": true }
          ] },
        { "id": "gear", "layout": "collection",
          "collection": "collection:inventory",
          "columns": ["name", "quantity", "equipped"],
          "rowActions": ["action:equip"] },
        { "id": "acts", "layout": "actions", "actions": ["action:overload"] }
      ],
      "visibleWhen": { "text": "true" } }
  ]
}
```

`control` names an Eldra component from a closed vocabulary (`stepper`, `readonly`, `text`,
`select`, `toggle`, `resource-bar`, `dice-button`, …). Unknown controls fall back to a typed default
control with a validation warning — never a blank space.

## 18.3 Three layout tiers

1. **Auto-generated** — from definitions alone, no layout declared. Always available, guaranteed
   complete, deliberately plain. This is the diagnostic sheet in Phase 2, and it is what makes a new
   package usable on day one.
2. **Package-provided** — the package's intended sheet.
3. **User-customized** — campaign or player reordering/hiding, stored separately, referencing
   definition IDs so it survives package upgrades where those IDs survive.

## 18.4 Required behaviors

Editable stored values; read-only derived values with an **explain affordance** on every one;
repeating collections with add/remove/reorder; action buttons that run §17.2; conditional visibility
via expressions; inline validation; permission-aware controls (§24.3); desktop/mobile/print
presentations; keyboard and screen-reader accessible controls (Eldra's responsibility, not the
package's); localized labels.

## 18.5 What must exist before the Character Sheet refactor begins

This is the brief's most operationally important question, and the answer is short:

1. **Value Definition + stored/derived split** — the sheet's data model.
2. **The evaluator + dependency graph** — what replaces 168 computeds.
3. **Traces** — the "why is this 17?" affordance is a sheet feature and must exist first.
4. **The layout contract above** — even if only tier 1 is implemented.
5. **The 5e adapter** (§33 Phase 2) — so the existing sheet keeps working throughout.

Everything else in this document — actions, rolls, modifiers, world bindings, packaging — can land
after the sheet refactor starts. **This is the recommended reordering of the brief's phase plan**
(§33).

---

# 19. World Configuration Contract

## 19.1 The boundary, stated crisply

- **World Configuration answers "what exists and what is it called?"** It declares definitions with
  **typed traits**. Road Type "King's Road" exists and has `{surface: "paved", quality: 4}`.
- **Rules Package answers "what does that mean mechanically?"** It reads traits and computes.

World Configuration must contain **no mechanics**, and Rules Packages must contain **no setting
vocabulary**. A travel *multiplier* is a rules concept even though it feels like a road property;
`quality: 4` is the world-config fact, and `1 + quality * 0.1` is the rules interpretation.

## 19.2 Contract

```jsonc
// World Configuration declares:
{ "id": "worldcfg:roadType.kingsRoad", "kind": "roadType", "label": "King's Road",
  "traits": { "surface": "paved", "quality": 4 } }

// Rules Package declares what it needs:
{ "requiredTraits": [
    { "kind": "roadType", "trait": "quality", "valueType": "number", "default": 1 } ] }
```

Packages read via `@world:<kind>.<trait>` in the evaluation context. **One-way: rules read world
config; world config never reads rules.**

## 19.3 Bindings and validation

When a world config doesn't provide a required trait, the campaign shows a **Binding gap**: a named,
user-resolvable mapping ("your Road Types have no `quality`; map it, or accept the default of 1").
Bindings are campaign-scoped data. Neither side is modified.

This is how campaigns stay valid when either side changes: **changes produce binding gaps, not
runtime failures.** Unresolved gaps use declared defaults and surface a persistent, dismissible
campaign warning.

## 19.4 Worked examples

| World Config supplies | Rules Package interprets |
|---|---|
| Road Type traits | Travel speed factor |
| Terrain / weather tags | Movement and check modifiers |
| Currency definitions + exchange | Inventory value, purchase actions |
| Calendar structure | Duration arithmetic, rest boundaries |
| Languages | Choice options for a language-related Value |
| Factions | Reputation values, condition sources |
| Pin/Location types | Which travel Actions are available |

---

# 20. Transportation Network Contract

## 20.1 Responsibility split

- **Transportation Network** produces **topology, distance, and trait references**. Nodes, Edges,
  Junctions, adjacency, and (Phase 3) traversal and routes. It is pure graph and geometry.
- **Rules Engine** determines **mechanical consequence**: time, cost, fatigue, risk.

TN must never import Rules. Rules must never import Leaflet or geometry code.

## 20.2 The interface

```ts
type Route = {
  routeId: string
  legs: Array<{
    edgeId: string
    edgeTypeRef: string | null      // → World Configuration definition
    distance: number
    fromNodeRef: string
    toNodeRef: string
  }>
  totalDistance: number
}
```

TN produces `Route`. The Rules Engine consumes `Route` + a party (a set of Actor States) + world
config traits, and evaluates a package-declared travel Action:

```
legDuration = legDistance / (partySpeed * surfaceFactor * weatherFactor * loadFactor)
```

Where `partySpeed` comes from the `movement.speed` **Semantic Role** (§12.4) — typically the minimum
across the party. **If no package binds `movement.speed`, travel returns distance and route only,
with no duration.** That is the intended degradation, not a failure.

## 20.3 Future travel concerns and where they belong

| Concern | Owner |
|---|---|
| Route topology, distance, adjacency, junctions | **Transportation Network** |
| Seasonal accessibility (is this edge traversable?) | **World Configuration** trait + TN filter |
| Movement modes, base speeds | **Rules Package** (Values + Semantic Role) |
| Edge/terrain/weather modifiers | **Rules Package** reading World Config traits |
| Encumbrance, mounts, vehicles | **Rules Package** (vehicles are Actors — §5) |
| Rest requirements, fatigue | **Rules Package** (Resources + Actions) |
| Resource consumption (rations, fuel) | **Rules Package** (Action costs) |
| Party composition | **Rules Engine** aggregation over multiple Actor States |
| Skill checks during travel | **Rules Package** Actions |
| Random encounter hooks | **Rules Package** Action outcomes + `table` randomizer (§17.7) |

Note that "party travel" is the first genuine multi-actor use case. It is also the reason
`EvaluationContext.actors` is reserved in V1 (§15.6) — travel will need it before combat does.

---

# 21. Persistence Model

Adopting the `scene_layer_objects` pattern (§2.6): **fixed envelope columns + typed JSON sections +
one translation module.** Recommended module: `server/utils/rules-packages.ts` and
`server/utils/actor-rules-state.ts`, using `directusServiceRequest` (**not** a 16th copy of
`dxFetch`).

## 21.1 `rules_packages` — immutable releases

| Column | Type | Why a column |
|---|---|---|
| `id` | uuid | PK |
| `package_id` | string | Queried, joined |
| `version` | string | Queried, pinned |
| `engine_api_version` | string | Compatibility filtering |
| `state_schema_version` | integer | Migration decisions |
| `title`, `status` | string | Listing UI |
| `integrity_hash` | string | Verification |
| `license_id` | string | Filtering, compliance surfacing (§30) |
| `created_at` | timestamp | |
| `manifest` | json | Whole manifest |
| `definitions` | json | All definitions incl. compiled ASTs |
| `layouts` | json | |
| `migrations` | json | |

Unique on `(package_id, version)`. Rows are **never updated** after publish. Everything not queried
stays in JSON — normalizing definitions into a dozen tables would buy nothing (they are always read
wholesale, validated wholesale, versioned wholesale) and would cost a schema migration per new
definition kind, which is exactly what §2.9's manual migration process makes expensive.

## 21.2 `actor_rules_state`

| Column | Type |
|---|---|
| `id` | uuid |
| `world_id`, `entity_id` | int (matching existing conventions) |
| `package_id`, `package_version` | string |
| `state_schema_version` | integer |
| `enabled_modules` | json |
| `values`, `collections`, `choices`, `sources`, `custom`, `campaign_extensions` | json |
| `created_at`, `updated_at` | timestamp |

**No derived values. Ever.** (§13.2)

## 21.3 Relationship to `character_sheets`

`character_sheets` cannot hold package-defined state — its columns are 5e nouns (§2.4). **Do not
ALTER it.** Add `actor_rules_state` alongside; migrate content behind an adapter (§33 Phase 2);
retire `character_sheets` only when nothing reads it. This mirrors exactly how `scene_layer_objects`
was introduced alongside `map_pins` rather than replacing it — a pattern this team has already
executed successfully, including the part where the legacy collection stays in use indefinitely and
that is fine.

## 21.4 Other collections

- `actor_rules_snapshots` — §13.4. Immutable.
- `campaign_rules_bindings` — §19.3 + campaign overrides. Small; JSON body.
- `rules_audit_log` — §27.4. Append-only; consider retention from day one.

## 21.5 Campaign overrides — deliberately narrow

**A constrained, typed set only:**

- Add a Modifier from a campaign-owned Source
- Change a package-declared **constant** (a `default` on a stored value)
- Disable a Definition
- Add a campaign-scoped Value or Collection
- Resolve a Binding

**Explicitly not permitted:** arbitrary deep-merge patches over package definitions, or editing
package formulas in place. Free-form overrides are the single most dangerous feature that could be
added here — they become un-migratable the moment the package changes underneath them, and they turn
every package upgrade into a manual reconciliation. See §31.5.

## 21.6 Directus in the evaluation path

**It must not be.** Directus loads package documents and actor state; evaluation happens in-process
over plain objects. Package documents are cached in-process keyed by `(packageId, version, hash)` —
safe precisely because releases are immutable.

---

# 22. Package Import / Export Format

## 22.1 Bundle

A directory or `.zip` with `manifest.json` at root, mirroring §11.3, plus `integrity.json`
(per-file hashes + a canonicalized root hash).

## 22.2 Import pipeline

```
read manifest → check engineApiVersion → verify integrity → parse+typecheck expressions
  → validate definitions & references → detect static cycles → resolve semantic roles
  → run package self-tests (§26.3) → PREVIEW → confirm → store immutable release
```

**Preview before commit** is mandatory and mirrors the existing 5etools importer's proven
preview-then-save flow (`server/api/import/**`) — a pattern already familiar to this codebase and
its users.

## 22.3 Conflict detection

On upgrade, the preview diffs old→new: definitions added / removed / changed, ID renames declared by
migrations, actor-state fields orphaned, binding gaps introduced. **A package that removes a
definition still referenced by actor state cannot be activated without a migration step** (§25.3).

## 22.4 Export

Round-trips: export → import → identical integrity hash. This is a testable invariant and should be
one of the first golden tests.

## 22.5 Trust levels — designed, not built

Reserve `trust: "local" | "official" | "community"` in the manifest. **V1 supports local file import
only.** No signing, no registry, no marketplace. The field exists so adding them later isn't a format
change (§4).

## 22.6 Can Foundry or Roll20 packages be imported? — Partially, and gradedly.

**This section is materially revised in revision 2.** Revision 1 answered a narrower question than
the product actually asks, and answered it too absolutely.

**What revision 1 got right, and which stands unchanged:**

- Eldra cannot **execute** a Foundry system, implement its API, or load its modules.
- Arbitrary JavaScript — `prepareDerivedData`, sheet workers, hooks, macros — **cannot be
  automatically and safely converted into declarative formulas**. Decompiling behaviour into
  expressions is not a solved problem and Eldra will not pretend otherwise.
- **No compatibility percentage will ever be claimed**, and translated output is never trusted
  without validation.

**What revision 1 got wrong:** it treated "cannot convert executable behaviour" as equivalent to
"mechanics get reimplemented," collapsing a spectrum into a binary. Between *perfect automatic
conversion* and *retype everything from scratch* there is a large, valuable middle, and the evidence
found in revision 2's investigation is that the middle is where most of the actual work lives:

- Foundry's `system.json` `documentTypes`, legacy `template.json`, localization files, and
  `primaryTokenAttribute`/`secondaryTokenAttribute` are **statically extractable declarative data**.
  Simple Worldbuilding translates to Eldra's model almost exactly (§22A.8).
- Compendium **ActiveEffects** are `{key, mode, value, priority}` tuples — a near-isomorphism with
  Eldra's `{target, phase, value, order}` modifier (§16.1). This is direct translation, not heuristic.
- **PF2e Rule Elements** are already declarative JSON authored precisely so that homebrewers need not
  write code. They are the single most translatable mechanical corpus in the ecosystem (§22A.8).
- Roll20 HTML yields attribute names, types, defaults, repeating sections, roll templates, and
  translation keys — enough for a **complete field-and-layout scaffold**, which is most of the tedium
  even when no worker logic converts (§22A.9).
- 5e.tools carries machine-readable dice specs, choice sets, predicates, and level-keyed progressions
  that Eldra is currently discarding (§2.12).

**Revised conclusion.** Content ports well; *declarative* mechanics port well; *executable* mechanics
do not port at all and must be surfaced as explicit, located, explained gaps. The correct product
framing is not "can it be imported?" but "**how much of this arrives already built, and is the
remainder clearly identified?**" That question is answered per-definition by the conversion grading
model in §22A.6, and the machinery to answer it is §22A.

Eldra's genuine advantage is unchanged and now stronger: completing a scaffold is *authoring*, not
*programming* — and the author starts from a populated package with a to-do list rather than an empty
file.

---

# 22A. Rules Translation and Import Architecture

*Added in revision 2. Numbered `22A` rather than inserted as `23` deliberately: renumbering §§23–35
would invalidate roughly a hundred internal cross-references for no analytical gain.*

## 22A.1 Position in the system

```
user-supplied source            (local files only — never fetched by Eldra)
        ↓
Source Adapter                  (executable, first-party, offline, resource-bounded)
        ↓
Translation Bundle              draft definitions + Receipt sidecar + diagnostics
        ↓
Validation                      the same validator that validates hand-written packages
        ↓
Reconciliation Workspace        human review, mapping, completion
        ↓
Native Rules Package            draft → published (immutable)
        ↓
Rules Engine                    which has never heard of any of the above
```

The compiler analogy in the brief is exact and worth keeping: adapters are front-ends, the Bundle is
an IR, the published package is the validated artifact, and the engine is the runtime. The property
that matters most is the one compilers get right — **the back end is the only thing that decides what
is valid**, so a buggy or hostile front end cannot produce something the runtime could not otherwise
have been handed.

## 22A.2 Is a distinct Translation IR warranted? — Yes, but not as a parallel model

The brief offers three options and hypothesises option 3 (hybrid). **The hypothesis is right and its
usual implementation is wrong**, so it needs sharpening.

The failure mode of a naive hybrid is that translation metadata gets *embedded inside* definitions
(`{id, formula, __confidence, __sourcePath, __reviewed}`). That looks economical and is corrosive:
the runtime type now carries import concerns, every validator and evaluator must ignore fields it
does not understand, and "strip before publish" becomes a lossy transformation nobody can verify.

- **Option 1 — translate straight to native definitions.** Rejected. There is nowhere to put
  confidence, unresolved candidates, diagnostics, review state, or raw source. Everything not
  perfectly translatable is silently dropped, which is precisely the failure §28 exists to prevent.
- **Option 2 — a fully independent IR.** Rejected. A second definition model would immediately drift
  from the native one, and every native model change would need mirroring. This is how translation
  layers rot.
- **Option 3, sharpened — native fragments plus a keyed sidecar.** **Recommended.**

```
Translation Bundle
├── definitions[]     ← NATIVE definition shapes, possibly incomplete
│                       (may contain `unresolved` AST nodes; may fail validation)
├── receipt           ← SIDECAR, keyed by definition ID
│                       provenance · fidelity · confidence · review · candidates · exclusions
├── diagnostics[]     ← bundle-level findings not attributable to one definition
└── sourceSnapshot    ← content-addressed reference to the source used
```

The single decision that makes this work: **translation metadata is keyed by definition ID in a
sidecar, never embedded in the definition.**

Consequences, all of which are the point:

1. Narrowing a Bundle to a Package is **dropping the sidecar**, not transforming definitions. It is
   trivially verifiable and cannot be lossy in the direction that matters.
2. The runtime never sees, parses, or ignores a translation field. §22A's entire complexity budget
   stays outside the engine, satisfying the brief's constraint that runtime simplicity is not
   compromised for tooling.
3. The receipt is exactly the artifact re-import needs (§22A.11), so it is retained after publish
   rather than discarded — but *alongside* the package, not inside it.
4. Draft definitions are already native shapes, so the reconciliation UI edits the same objects the
   authoring UI will edit. One editor, not two.

**Boundary, stated exactly.**

| Concept | Bundle / Receipt | Published Package |
|---|---|---|
| Definition shapes, expressions, AST | ✅ (may be incomplete) | ✅ (must be complete) |
| `unresolved` AST nodes | ✅ | ❌ blocks publish |
| Source path, line, original ID | ✅ | ❌ |
| Fidelity, confidence, review state | ✅ | ❌ |
| Candidate mappings, alternatives | ✅ | ❌ |
| Raw source fragments | ✅ | ❌ |
| Diagnostics, warnings | ✅ | ❌ (resolved or accepted before publish) |
| Adapter identity/version | ✅ | ✅ — but only in `origin` (§11.9) |
| Source identity + hash | ✅ | ✅ — `origin` only |
| License + attribution | ✅ | ✅ — **mandatory**, and surfaced (§30) |
| Reconciliation history | ✅ | ❌ |

Two fields cross the line — adapter identity and source hash — because they are genuine package
identity ("what is this and where did it come from"), and because without them re-import cannot find
its own previous output.

## 22A.3 Provenance model

Provenance lives at three granularities and it is worth being precise about which is which:

**Package level** — `manifest.origin` (§11.9). Five fields. Survives publication. Answers *"what
produced this artifact?"*

**Definition level** — the receipt, keyed by definition ID:

```jsonc
{
  "value:might": {
    "source":   { "adapter": "eldra.adapter.foundry", "file": "template.json",
                  "path": "Actor.character.attributes.might", "originalId": "attributes.might" },
    "fidelity": "exact",
    "confidence": 1.0,
    "review":   "unreviewed",
    "ownership":"generated",
    "license":  { "id": "MIT", "holder": "…", "note": "system code" }
  },
  "value:might.mod": {
    "source":   { "adapter": "eldra.adapter.roll20", "file": "sheet.html", "line": 214,
                  "path": "input[name=attr_might_mod]" },
    "fidelity": "scaffold",
    "confidence": 0.35,
    "review":   "unreviewed",
    "ownership":"generated",
    "exclusion": null,
    "candidates": [ { "text": "floor((@value:might - 10) / 2)", "why": "common d20 modifier shape",
                      "confidence": 0.35 } ]
  }
}
```

**Content level** — imported *content* instances (an item, a spell) keep the existing
`import_source` block shape (§2.13), whose `provider` / `external_id` / `source_book` / `hash` fields
already exist and merely need populating. Content provenance and mechanics provenance are separate
because they update independently (ADR-018).

**Retention rule.** Receipts are retained for as long as the package might be re-imported, which is
indefinitely by default. They are *not* part of the package, are not required to evaluate it, and can
be deleted to reclaim space at the cost of degrading a future re-import from three-way merge to
two-way (§22A.11). That trade should be the user's, made explicitly.

**Raw source fragments** (`rawSource`) are retained in the Bundle and are **excluded from the receipt
by default** once published, because retaining full copyrighted source text indefinitely is a
redistribution hazard (§30.3) — this is the one place the current importer's `raw_json` behaviour
should *not* be generalized.

## 22A.4 Adapter contract

```ts
type SourceAdapter = {
  id: string                  // "eldra.adapter.foundry"
  version: string             // participates in reproducibility (§22A.11)
  label: string
  sourceKinds: string[]       // "foundry-system" | "roll20-sheet" | "5etools-data" | ...

  detect(input: SourceInput): Promise<DetectionResult>
  inspect(input: SourceInput): Promise<SourceManifestSummary>   // cheap, pre-extraction
  extract(input: SourceInput, options: ExtractOptions): Promise<TranslationBundle>

  capabilities: {
    producesDefinitions: boolean
    producesContent: boolean
    producesLayouts: boolean
    supportsIncrementalReimport: boolean
  }
  reconciliationHints?: ReconciliationHint[]   // adapter-specific UI affordances
}
```

Six obligations, in order:

1. **Detect** — recognise the source kind, cheaply, without full parsing.
2. **Inspect** — report what is in there (declared name, version, counts, declared licenses) *before*
   the user commits to extraction.
3. **Extract statically** — read only. Never execute source code.
4. **Validate against the source's own schema** where one exists, and report deviations rather than
   guessing through them.
5. **Normalize and translate** into native definition shapes.
6. **Report** — fidelity, confidence, provenance, diagnostics, and license findings for every
   definition it emits and every construct it declined to emit.

Obligation 6 is what separates this from an importer. **An adapter that silently skips something has
malfunctioned**, even if everything it did emit is correct.

**What adapters are, concretely.** Compiled first-party TypeScript in the Eldra repository, under
`app/lib/rules/translation/adapters/<id>/`, following the existing `app/lib/importers/*` convention
of pure functions with I/O hoisted to the caller. Not external CLIs (an operational burden and a
sandbox escape surface), not data-only mappings (insufficient — parsing 5e.tools' `{choose:{...}}`
requires real code), not user-installable plugins in V1.

**Data-driven where possible.** Field-to-field mappings that *are* expressible as data — Foundry
`template.json` paths → definition IDs, ActiveEffect `mode` → Eldra `phase` — should live in JSON
mapping tables inside the adapter, not in code. This shrinks the executable surface, makes the
mapping reviewable, and lets a future authoring UI edit mappings without a release. **Code parses;
data maps.**

## 22A.5 Security boundary — three tiers, not one problem

The brief is right that these are different problems, and conflating them is how a good rule ("no
package code") gets applied to a place it does not belong.

| | **Rules Package** | **Import Adapter** | **Capability Extension** (§23.4) |
|---|---|---|---|
| Executable code | **Never** | Yes — it is a parser | Yes — Eldra-authored only |
| When it runs | — | Once, at import | Every evaluation |
| Runs on | — | User-supplied files | Live campaign state |
| Blast radius | — | Bad *data*, then validated | Wrong *rules*, silently, forever |
| Third-party authored | Yes | V1: no | Never |
| Output trusted | Validated | **Validated identically to hand-written** | Trusted by construction |

**Why adapter code is fundamentally different from forbidden package code** — the argument in one
sentence: *an adapter's only output is a package that a human could have hand-written, and it passes
through the same validator, so an adapter can produce bad data but can never extend what the runtime
is able to do.* Package code, by contrast, would execute inside evaluation, per user, per render, on
live campaign data, forever, with no validation boundary downstream of it. These are not the same
risk and should not share a policy.

**V1 execution model.** In-process in the Nitro server import context, admin-gated, first-party
adapters only.

**Controls, from V1:**

- **No network access.** Adapters receive bytes, never URLs. This is a security control *and* the
  licensing control (§30) — Eldra cannot fetch content it should not have.
- **No Directus client, no session, no credentials, no env.** The adapter signature takes
  `SourceInput` and returns a `TranslationBundle`. It has no handle to reach anything else.
- **Read-only source access**, via an explicit file-tree abstraction rather than raw `fs`.
- **Resource limits**: wall-clock timeout, max input size, max archive entries, max output
  definitions, decompression-ratio cap (zip bombs), max nesting depth.
- **Archive isolation**: extraction to a scratch directory outside any served path, purged after.
  Path traversal in archive entries rejected, not sanitized.
- **Adapter output is untrusted input.** It goes through the identical validator as an uploaded
  hand-written package. No adapter-privileged construct exists.

**When third-party adapters arrive** (not V1, possibly never): out-of-process only — a worker or
child process with no network namespace, no inherited environment, a read-only source mount, a
write-only bundle pipe, and hard CPU/memory caps. That is a real sandbox and it should not be built
until someone actually needs it, because the moment it exists it must be maintained forever.

## 22A.6 Conversion grading

The brief proposes: `exact`, `high-confidence`, `heuristic`, `scaffold`, `unsupported`,
`omitted-by-policy`, `blocked-by-license`, `unresolved` — and asks me not to accept it blindly.

**I don't.** That list conflates three orthogonal axes, and conflating them makes real states
inexpressible. "Heuristic **and** human-confirmed" is a normal, good outcome. "Scaffold **and**
license-blocked" is a normal, bad one. A single enum cannot say either.

**Recommended model: three independent fields plus a conditional fourth.**

**1. `fidelity` — how the definition was produced.** Structural, adapter-declared, five values:

| Value | Meaning | Example |
|---|---|---|
| `exact` | Deterministic 1:1 mapping. No judgement. | Foundry `template.json` numeric field → stored Value |
| `derived` | Mechanical transformation via a known rule. | ActiveEffect `mode: ADD` → `phase: "add"` |
| `inferred` | Pattern-matched. Probably right, could be wrong. | `attr_str_mod` → `floor((@str-10)/2)` |
| `scaffold` | Structure produced; behaviour absent. **A human must finish it.** | Roll20 attribute with a worker Eldra could not read |
| `absent` | Nothing produced. See `exclusion`. | A Foundry hook |

Note what is missing: `high-confidence` is not a fidelity. It is a confidence.

**2. `confidence` — numeric `0.0`–`1.0`.** **Adapter-declared**; the validator may **lower** it and
may never raise it. Numeric because the useful operations are ordering and thresholding ("show me
everything below 0.6"), which categories do badly. `exact` implies `1.0`; below `exact`, confidence
and fidelity vary independently.

**3. `review` — human state.** `unreviewed` → `accepted` | `edited` | `rejected`. Orthogonal to both
of the above, and the only field a human writes.

**4. `exclusion` — present only when `fidelity: "absent"`.** Says *why* nothing was produced:

| Value | Meaning |
|---|---|
| `unsupported-behaviour` | Depends on executable code or platform behaviour |
| `license-restricted` | Detected as restricted content; excluded by policy (§30) |
| `policy-excluded` | User excluded it (assets, prose, a whole module) |
| `source-incomplete` | Source referenced something not present in the supplied files |
| `adapter-gap` | Known adapter limitation — a to-do, not a wall |

Distinguishing `unsupported-behaviour` from `adapter-gap` matters: the first is honest about a
permanent limit, the second is a tracked improvement. Collapsing them makes the roadmap invisible.

**The six questions a user must be able to answer**, and where each is answered:

| Question | Answered by |
|---|---|
| What converted? | `fidelity` distribution across the bundle |
| What assumptions were made? | `fidelity: inferred` + `candidates[].why` |
| What still needs work? | `fidelity: scaffold` + `unresolved` AST nodes |
| What was deliberately excluded? | `exclusion` |
| Can this activate safely? | §22A.12 |
| Which source files produced this? | `receipt[id].source` |
| Has a human reviewed this? | `review` |

## 22A.7 Reconciliation workflow

```
select local source  →  detect  →  inspect summary (+ license findings)  →  confirm
   →  extract  →  Translation Bundle  →  validate
   →  RECONCILIATION WORKSPACE  ←──────────┐
   →  draft package preview                │ iterate
   →  package self-tests  ─────────────────┘
   →  activation eligibility check (§22A.12)
   →  publish immutable release  (+ retain receipt)
```

**V1 scope — deliberately small, and chosen by what blocks activation:**

1. **Bundle summary**: counts by fidelity, diagnostics, license findings. The "is this worth
   continuing?" screen.
2. **Definition list** with fidelity/confidence badges, filterable, sorted worst-first.
3. **Accept / reject / edit** per definition, writing `review`.
4. **Semantic Role mapping** — the highest-leverage screen in the whole workspace. Roles are what let
   the rest of Eldra function (§12.4), some adapters can pre-fill them (Foundry's
   `primaryTokenAttribute` is a direct binding), and there are usually fewer than ten.
5. **Unresolved formula completion** — a text field per `unresolved` node, pre-filled with `hint`
   where the adapter offered one. Plain authoring; no special editor.
6. **Identity conflict resolution** — duplicate or ambiguous definition IDs.
7. **License review and exclusion** — per source-document, with bulk exclusion of prose and assets.
8. **Publish gate** showing exactly what is blocking (§22A.12).

**Deferred to later tooling**, and none of it blocks V1: side-by-side source↔output comparison;
guided stacking-policy selection; roll-mechanic mapping wizards; automated prose/mechanics splitting
beyond file-level heuristics; in-workspace self-test authoring; three-way merge UI (§22A.11 starts
report-only); adapter-supplied custom reconciliation screens.

The discipline: **V1 ships only what is required to get from a bundle to a legally activatable
package.** Everything that merely makes that nicer waits for evidence about which parts are actually
painful.

## 22A.8 Foundry translation feasibility matrix

Grounded in inspection of `foundryvtt/worldbuilding` (MIT), `foundryvtt/dnd5e` (MIT code),
`foundryvtt/pf2e` (Apache-2.0 code), and the official CLI/compendium documentation.

**Two structural facts that drive everything below.**

*First:* `template.json` — the statically extractable schema mechanism — is the **legacy** path.
Simple Worldbuilding still ships one; **`foundryvtt/dnd5e` no longer has one at all** (404 on
`master`), having moved its schema into `TypeDataModel` classes in JavaScript. So the ecosystem is
moving *away* from the extractable form. Adapters must handle both and degrade honestly.

*Second:* compendium packs have been **LevelDB binaries since v11**, not JSON. Extraction requires
`@foundryvtt/foundryvtt-cli` or a `classic-level` reader. Content is extractable but not by reading
files — a real tooling dependency, and a decision point (§22A.15).

| Artifact | Classification | Why |
|---|---|---|
| `system.json` metadata (id, version, compat, authors, license) | **Directly translatable** | Declarative JSON → manifest fields |
| `primaryTokenAttribute` / `secondaryTokenAttribute` | **Directly translatable** | Literally a Semantic Role binding → `vitality` |
| `documentTypes` (subtypes; `htmlFields`) | **Directly translatable** | Declares actor/item kinds; `htmlFields` **identifies prose fields**, which is a free mechanics/prose split (§30.2) |
| `template.json` scalar fields | **Directly translatable** | Typed defaults → stored Value Definitions |
| `template.json` `{value,min,max}` triples | **Directly translatable** | Exactly an Eldra Resource (§12.5) |
| `template.json` `templates` / inheritance | **Adapter-specific** | Mechanical to flatten; needs Foundry-specific rules |
| Typed `DataModel` schemas (`NumberField` etc.) | **Adapter-specific, source-only** | Statically analysable *from repository source*; **not** from a distributed bundled `.mjs`. Fidelity depends entirely on which the user supplies |
| `DataModel.migrateData` | **Not safely translatable** | Arbitrary code. Diagnostic only |
| Compendium **Items** (JSON after CLI extraction) | **Directly translatable** (structure) / **license-dependent** (content) | Well-formed records; the *text* is usually the licensing problem |
| Compendium **Actors** | **Directly translatable** (structure) / **license-dependent** | As above |
| **ActiveEffect `changes[]`** | **Directly translatable** | `{key, mode, value, priority}` → `{target, phase, value, order}`. `ADD`→`add`, `MULTIPLY`→`scale`, `OVERRIDE`→`set`, `UPGRADE`/`DOWNGRADE`→`clamp`. **The single best mechanical mapping in the ecosystem** |
| ActiveEffect `mode: CUSTOM` | **Not safely translatable** | Dispatches to system JS. `absent` + `unsupported-behaviour` |
| ActiveEffect `duration`, `disabled`, `transfer` | **Directly translatable** | Maps to Source instance duration/activation (§16.7) |
| **PF2e Rule Elements** | **Adapter-specific, high fidelity** | See below — the most translatable mechanical corpus available |
| `prepareBaseData` / `prepareDerivedData` | **Scaffold only** | The derived values' *names and paths* are often statically discoverable; the arithmetic is not. Emit `unresolved` + `hint` |
| Hooks | **Not safely translatable** | Event-driven code; Eldra has no event layer (§9.1) |
| Macros | **Not safely translatable** | Arbitrary user JS |
| Sheet templates (Handlebars) | **Scaffold only** | Field *presence*, grouping, tab structure, and ordering are extractable; bindings are partially inferable; behaviour is not. Produces a usable §18.2 layout skeleton |
| Roll formulas in data (`"@abilities.str.mod + 2"`) | **Heuristically translatable** | Foundry's roll syntax is close to Eldra's; path rewriting is the work. `derived`, occasionally `inferred` |
| System migration code | **Not translatable** | Diagnostic only |
| Localization (`lang/*.json`) | **Directly translatable** | Key→string maps → `i18n/` (§14.10) |
| Assets (images, fonts, audio) | **Excluded by policy** | Never translated; `policy-excluded` by default (§30) |
| Content prose | **License-dependent** | `htmlFields` marks it; excludable in bulk |

**Why PF2e Rule Elements deserve their own row.** They are declarative JSON, authored specifically so
that homebrewers need not write JavaScript — the same goal as this architecture, reached
independently. The correspondence is unusually close:

| PF2e | Eldra |
|---|---|
| `selector` | Modifier `target` |
| `type` (stacking class) | `modifierType` (§16.3) |
| `value`, incl. `floor(@actor.level/2)` | Modifier `value` expression |
| `predicate` (`or`/`and`/`not`/`gte`…) | `condition` expression |
| `ChoiceSet` | ChoiceSet (§12.2) |
| `RollOption` | Context `tags` (§15.6) |
| `DamageDice` | Roll Modifier (§16.2) |
| `AdjustDegreeOfSuccess` | `degrees` on a Roll Spec (§17.3) |

Three real caveats: (a) roughly 40 rule element keys exist and many (`BattleForm`,
`CriticalSpecialization`, `DexterityModifierCap`) are PF2-shaped, not universal; (b) **PF2e's
stacking rule is hardcoded in the system, not declared** — the adapter must *inject* the appropriate
`modifierTypes` policy table (§16.3), which is a translation decision that must be surfaced, not
silent; (c) selectors reference statistic slugs that exist only because the PF2e system defines them,
so translation needs a PF2e-shaped base package to target. Rule Elements convert well **into a
package that already has somewhere to put them**.

## 22A.9 Roll20 translation feasibility matrix

Grounded in inspection of `Roll20/roll20-character-sheets` (MIT collection license) and a real sheet
(`24XX/`), which yielded a `sheet.json` manifest, `attr_*`-named inputs, a
`<rolltemplate class="sheet-rolltemplate-…">`, and a `translation.json`.

| Artifact | Classification | Why |
|---|---|---|
| `sheet.json` manifest (html/css/authors/preview/instructions) | **Directly translatable** | Package metadata + attribution |
| `name="attr_*"` inputs | **Directly translatable** | Attribute name, and `type`/`value` give type + default → stored Value Definitions. **Confirmed empirically** |
| `<input type="number|text|checkbox">` | **Directly translatable** | → `valueType` |
| `<select><option>` | **Directly translatable** | → `enum` Value Definition |
| `readonly` / `disabled` attributes | **Heuristically translatable** | Strong hint that a value is derived, not stored |
| `repeating_*` sections | **Directly translatable** | → Collection Definitions (§12.3). Field names within the section give the item schema |
| `autocalc` / `value="@{a}+@{b}"` | **Heuristically translatable** | A real expression in near-Eldra syntax. `derived`, occasionally `inferred` |
| Sheet-worker **dependencies** | **Heuristically extractable** | `on("change:str change:level", …)` names the inputs; `getAttrs([...])`/`setAttrs({...})` name inputs and outputs. **The dependency graph is recoverable even when the arithmetic is not** |
| Sheet-worker **arithmetic** | **Scaffold only** | Arbitrary JS. Emit an `unresolved` node whose dependencies are known and whose formula is blank — a far better starting point than nothing |
| Roll buttons (`type="roll"`, `@{}`/`%{}`) | **Heuristically translatable** | Roll expression + the attributes it references → a draft Roll Spec (§17.3) |
| Macros | **Not safely translatable** | Free text with platform semantics. Preserve verbatim as a note |
| `<rolltemplate>` | **Scaffold only** | Names an output shape; maps to choosing an Eldra template (§17.6), never to markup |
| CSS / layout | **Excluded by policy** | Eldra owns presentation (ADR-007). *Ordering and grouping* inform the layout skeleton; styling is discarded |
| `translation.json` | **Directly translatable** | → `i18n/` |
| Compendium bindings | **Not translatable** | Platform-specific; diagnostic |

**Direct answer to the brief's question — yes, a Roll20 adapter is worth building without translating
any JavaScript.** It can produce: the complete attribute set with types and defaults; every repeating
section as a Collection; a tab/section layout skeleton in source order; enum options; autocalc
formulas outright; roll buttons as draft Roll Specs; localization; and — the underrated part — a
**correct dependency graph for worker-derived values with the formulas left blank**. That is the
majority of the tedium. What remains is the interesting part, which is the part a human wanted to
write anyway.

## 22A.10 5e.tools importer migration strategy

The brief proposes Phases A–E and asks me to challenge them. **The main correction is that Phase B is
already done** (§2.11): parsing is pure and already separated from persistence. The revised sequence
is shorter and strictly additive — the working importer is never rewritten and never breaks.

| | Objective | Change to existing behaviour |
|---|---|---|
| **T-A** | **Characterization tests.** Fixture-driven snapshot tests over the current `preview5eTools*` outputs. Trivial to write because the functions are already pure. | **None.** Pure addition. |
| **T-B** | *(brief's Phase B)* — **already satisfied.** Document it; do not do it. | None. |
| **T-C** | **Widen the output type, additively.** Add optional `mechanics?` and `provenance?` to `EldraImportPreviewEntity` alongside the existing `blocks`. Populate the already-declared-but-unused `hash` and `import_version` (§2.13). Start capturing the structured mechanics currently flattened by `textify()` (§2.12). | **None** — existing consumers read `blocks` and are untouched. Snapshot tests from T-A prove it. |
| **T-D** | **Emit a Translation Bundle.** A new module reads the widened output and produces definitions + receipt. Existing preview/save routes keep calling the same functions. | None. New route only. |
| **T-E** | **Fix identity.** De-duplicate on `(provider, externalId)` rather than slug, with slug as fallback for pre-existing rows (§2.13). | **Behavioural** — the one genuinely risky step. Ship it alone, behind its own commit, with a migration that backfills `external_id`. |
| **T-F** | **Emit native package definitions**, not just content: hit dice, save proficiencies, skill ChoiceSets, multiclass predicates, level-keyed Progressions. | None. |
| **T-G** | **Split the outputs.** The same source can now produce package definitions, package content, and world entity content independently (ADR-018). | None. |
| **T-H** | Retire the direct-import-only path **only after** parity is demonstrated by the T-A tests. | Removal, last. |

Two deviations from the brief worth flagging. **T-E is called out as its own step** because changing
a de-duplication key on live data is the only genuinely dangerous move in the sequence and should not
be buried inside a larger change. And **T-F comes after identity is fixed, not before** — emitting
mechanics keyed on an identity scheme you are about to change doubles the work.

## 22A.11 Re-import and update

A one-shot importer is a demo. The mechanism that makes re-import real is **per-definition
ownership**, recorded in the receipt:

| `ownership` | Meaning | Re-import behaviour |
|---|---|---|
| `generated` | Adapter produced it; untouched by a human | **Regenerate freely.** No conflict possible |
| `generated-then-edited` | Adapter produced it; a human changed it | **Three-way merge.** Conflict if both sides changed |
| `authored` | A human created it; no source counterpart | **Never touched.** Not even if a source definition now collides |
| `generated-then-deleted` | Adapter produced it; a human removed it deliberately | **Stays deleted** unless explicitly re-enabled — a tombstone, not an absence |

The last row matters more than it looks: without tombstones, every re-import resurrects everything a
user deliberately removed, which is the fastest way to make an importer unusable.

**Three-way merge**, mediated by the receipt:

```
BASE   = definitions the previous adapter run produced   (recoverable from the receipt)
THEIRS = definitions this adapter run produces           (new source, possibly new adapter version)
OURS   = the current published/draft package             (BASE + human edits)
```

- Changed in `THEIRS` only → take it.
- Changed in `OURS` only → keep it.
- Changed in both, identically → no conflict.
- Changed in both, differently → **conflict**, surfaced with all three versions. Never auto-resolved.

Because BASE is reconstructible from the receipt, this works without storing a full copy of the old
package — but it does mean **deleting a receipt downgrades re-import to two-way** (source vs. current),
which cannot distinguish "the user changed this" from "the source changed this" and must therefore
conflict on everything that differs. That is the explicit cost named in §22A.3.

**Source lock.** `origin` (§11.9) pins adapter ID+version and source ID+hash. On re-import:

| Situation | Behaviour |
|---|---|
| Same adapter version, same source hash | No-op. Report "no changes" |
| Same adapter, newer source | Normal three-way merge |
| **Newer adapter, same source** | Re-translation may legitimately *improve* fidelity. Treat as `THEIRS` changing, but flag the cause as adapter-driven — users find silent changes from an unchanged source alarming |
| Upstream ID changed | Detected via receipt `source.originalId`. Offer rename; never silently orphan |
| Upstream definition removed | Propose removal, show downstream impact, **never delete actor data** (§25.3 `archiveTo`) |
| Previously accepted `inferred` mapping still matches | Preserve the `accepted` review state |
| Previously accepted mapping no longer matches | Reset to `unreviewed` and flag. An acceptance applies to a specific mapping, not forever |
| New `unsupported-behaviour` appears | Report prominently; may block re-publication (§22A.12) |

**Content and mechanics update independently** (ADR-018). A 5e.tools dataset refresh that adds
monsters must not force re-review of the class progression definitions.

## 22A.12 Activation criteria

A package may be **published** only if:

1. No `unresolved` AST nodes remain (§14.12).
2. No unresolved definition references.
3. No static dependency cycles (§14.8).
4. Every declared Semantic Role resolves to an existing definition.
5. Package self-tests pass (§26.3).
6. Every `fidelity: "scaffold"` definition is either completed or **explicitly accepted** by a human,
   recorded as `review: "accepted"`.
7. Every `exclusion: "license-restricted"` finding has been reviewed.
8. License metadata is present and attribution is populated (§30.2).

**May a package activate with unresolved mappings remaining? — No for `unresolved`; yes, with
explicit acceptance, for `scaffold`.** The distinction is exact: an `unresolved` node has no value at
all and would evaluate to `error` at runtime, so allowing it would ship a package that is broken by
construction. A `scaffold` definition *has* a defined value — usually a plain stored value with no
derivation — and is merely less automated than the source was. A GM who accepts that trade should be
allowed to play, and the acceptance is recorded, visible in campaign diagnostics (§27.5), and
re-surfaced on every re-import.

Low `confidence` never blocks activation by itself. It sorts the review queue. Blocking on a number
an adapter chose would make adapters lie about their confidence, which is exactly backwards.

## 22A.13 Translation failure behaviour

Extending §28's principle — **visible degradation, never silent corruption** — to the import path:

| Failure | Behaviour |
|---|---|
| Source kind not detected | Refuse with the list of recognised kinds. Never guess |
| Source corrupt / partially readable | Translate what parses; emit `source-incomplete` for the rest. **Never a silent partial import** |
| Adapter crashes mid-extraction | Whole bundle discarded. No partial package. Error names the adapter, version, and source path |
| Adapter exceeds a resource limit | Aborted, reported as a limit hit with which limit — not as a source problem |
| Adapter emits an invalid definition | Validation rejects it; the *rest* of the bundle survives; the definition becomes `absent` + `adapter-gap` |
| Adapter emits a definition that fails typecheck | Same, plus the type error is attached to the receipt entry |
| Bundle validates but self-tests fail | Import allowed, **publish blocked** (§22A.12) — mirrors §26.3 |
| Source contains restricted content | Excluded by default, listed, never silently included |
| Re-import conflicts | Presented; nothing applied until resolved. The existing package is untouched |
| Receipt missing on re-import | Degrade to two-way merge, **warn explicitly** that local edits cannot be distinguished from source changes |
| Adapter version no longer available | Re-import refused rather than run under a different adapter silently |

The invariant: **a failed or partial translation never produces an activatable package, and never
mutates an existing one.**

## 22A.14 Is the Eldra Rules Package a canonical TTRPG representation?

The brief asks me not to oversell this. I won't.

**As a compiler target: yes, and this is the defensible claim.** It canonicalizes well because it was
designed around what mechanical systems actually share:

- Named typed values, stored vs. derived
- Modifiers with targets, phases, conditions, and declared stacking
- Resources, tracks, clocks
- Repeating collections with per-item identity
- Dice/pool/percentile resolution under one Roll Spec (§17.3)
- Level-keyed or milestone progression
- Player choice as data (ChoiceSet)

Every one of those appeared in at least two of the four sources researched, in different clothes.

**What stays source-specific**: platform automation semantics; UI behaviour; targeting and area
resolution; anything depending on a specific initiative or action-economy implementation; content
organisation conventions.

**What inevitably becomes scaffold or diagnostic**: executable derivation, reactions and triggers
(Eldra has no event layer — §9.1), GM-adjudicated procedures, and cross-actor mechanics until §15.6's
reserved multi-actor context is implemented.

**What resists canonicalization outright** — and this is the honest limit: fiction-first and
narrative systems whose "rules" are conversational procedures. Position-and-effect negotiation, "say
yes or roll the dice", table-consensus mechanics, and clocks whose advancement is a fictional
judgement rather than a computation. Eldra can *hold* their values and *present* their tracks; it
cannot canonicalize the part that matters, because the part that matters is a conversation. A design
that claimed otherwise would be lying.

**On the name.** "Canonical TTRPG Rule Representation" is branding that overstates the claim and
invites exactly the compatibility expectations §4 forbids. The accurate description is a **canonical
execution format** — a validated artifact that Eldra's engine can evaluate deterministically and
explainably, and that multiple source formats can be translated *into* with graded and stated
fidelity. That is a genuinely useful thing and it does not require being a universal ontology of
tabletop games. Practical interoperability is the goal; the ontology is not.

## 22A.15 Open translation questions

1. **Foundry compendium extraction dependency.** LevelDB packs need `@foundryvtt/foundryvtt-cli` or
   `classic-level`. Options: require the user to run the CLI and upload JSON (zero dependency, worse
   UX); vendor a reader (a dependency, and §Implementation Constraints forbids adding one now);
   support only extracted JSON in V1 (**recommended** — defer the decision until the adapter is real).
2. **Repository source vs. distributed bundle.** DataModel extraction works on repo source and fails
   on a shipped minified `.mjs` (PF2e ships `vendor.mjs` + `pf2e.mjs`). The adapter must detect which
   it was given and state the fidelity ceiling *before* extraction, not after.
3. **Which base package do PF2e Rule Elements target?** They need PF2-shaped selectors to exist. Does
   Eldra ship a PF2e-shaped skeleton package, or does the adapter synthesise one? This is a product
   decision with licensing implications.
4. **Adapter versioning and reproducibility.** Should old adapter versions be retained indefinitely so
   re-import is always reproducible? Storage is trivial; the maintenance commitment is not.
5. **Bundle persistence.** Are unpublished bundles stored server-side (resumable, auditable, but a new
   collection and a retention policy) or held client-side for one session (simpler, loses work)?
   Recommendation: server-side, with an expiry.

---

# 23. Security Model

## 23.1 Threat model

Untrusted package authors; untrusted campaign authors; multi-tenant self-hosted deployments where
one campaign must never read another's data. **Added in revision 2:** untrusted *source archives*
supplied to import adapters, and the adapter code that parses them.

**Three distinct trust tiers, not one policy** (full treatment in §22A.5):

| Tier | Code? | Runs when | Trust model |
|---|---|---|---|
| Rules Package | **Never** | — | Inert data, validated |
| Import Adapter | Yes, first-party | Once, at import | Sandboxed, offline, output re-validated |
| Capability Extension (§23.4) | Yes, Eldra-authored | Every evaluation | Vetted, shipped with the engine |

"No package code" remains absolute. It was never a statement about *build-time tooling*, and applying
it to adapters would forbid parsing while permitting nothing safer — Eldra's existing 5e.tools
importer is already executable parser code and always has been (§2.11).

## 23.2 Controls

| Threat | Control |
|---|---|
| Arbitrary code execution | **No package code, at all.** No `eval`, no `Function`, no dynamic import |
| Credential/env access | Evaluator receives only a plain resolved state object; no host references |
| Network/filesystem | No I/O primitives exist in the language (§14.5) |
| Cross-campaign reads | Evaluation context is constructed server-side and scoped to one campaign |
| Infinite loops | Non-Turing-complete by construction; no loops or recursion |
| Resource exhaustion | AST node cap at import; step budget at runtime; deterministic pre-computable cost (§14.9) |
| Deep recursion | Depth limit + visit set (§14.8) |
| Payload bombs | Package size, definition count, and collection size limits, enforced at import |
| Tampered client values | Server re-evaluates authoritatively; never trusts client-derived numbers |
| Forged rolls | Server-side seeded rolls only (§17.4) |
| Malicious content strings | Sanitize at render; `dompurify` is already a dependency |
| **Malicious source archive** (zip bomb, path traversal, huge inputs) | Decompression-ratio cap, entry count/size caps, traversal entries rejected not sanitized, scratch dir outside any served path, purged after (§22A.5) |
| **Adapter reaching the network** | Adapters receive bytes, never URLs. No HTTP client in scope — also the §30 licensing control |
| **Adapter reaching Directus / sessions / env** | Adapter signature is `SourceInput → TranslationBundle`. No client, no credentials, no `process.env` handle |
| **Adapter producing a privileged package** | Impossible by construction: adapter output passes the identical validator as hand-written packages. No adapter-only construct exists |
| **Adapter resource exhaustion** | Wall-clock timeout, memory cap, max output definition count |
| **Draft package evaluated accidentally** | `status: draft` cannot bind to a campaign (§11.8); `unresolved` nodes evaluate to `error` and block publish (§14.12) |

## 23.3 Client vs server evaluation — and whether client calculation can be trusted

**It cannot be trusted, and it doesn't need to be.** The resolution is that client evaluation is a
*preview*, not a *fact*. Every persisted or contested outcome is re-evaluated server-side from stored
state before commit.

The brief also asks whether server-side evaluation would create unacceptable latency. **It would not,
if scoped correctly.** Latency would be unacceptable if every keystroke round-tripped — so it
doesn't: local edits evaluate locally and instantly. The server evaluates only at commit boundaries,
where a round trip is already happening for the write. The pure, isomorphic engine is what makes this
split possible without maintaining two implementations.

## 23.4 The extension seam — specified now, built later

If §31.2 proves correct and declarative expressiveness runs out, the exit is:

- A package declares `capabilities: ["custom-check-resolver"]` in its manifest.
- Eldra Core ships a **named, versioned, closed set** of capability implementations.
- Core either has an implementation registered for that capability or **refuses to load the package**.
- **Packages still never ship code.** They request a behavior Eldra has implemented and vetted.

This deliberately makes new capabilities require an Eldra release. That friction is the feature: it
keeps the trust boundary intact and prevents the seam from degenerating into Foundry's `CUSTOM` mode.
**V1: `capabilities` must be empty; non-empty is a load error.**

---

# 24. Permissions Model

## 24.1 Current reality

One boolean (§2.8). Everything here is a **forward contract** against Eldra 2.1's ownership work.

## 24.2 Roles the engine assumes will exist

`system-admin` (install packages) · `campaign-owner` (choose package/version, edit bindings and
overrides) · `gm` (see GM-only values, secret rolls, override outcomes) · `player` (edit owned
actors) · `observer` (read public values).

## 24.3 Visibility classification — carry it from day one

Every Value Definition, Action, and Roll declares `visibility: "public" | "owner" | "gm"`.

**In V1 nothing enforces this.** It is carried anyway, because:

- Retrofitting visibility onto an evaluator later means auditing every value and every trace step.
- GM-only values must be **filtered server-side before serialization** — filtering them client-side
  is not privacy, and a client-side-first implementation is very hard to correct later.
- Traces leak: a public value derived from a GM-only value must produce a **redacted trace step**
  ("Hidden modifier: +2") rather than naming the source. That behavior has to be in the trace
  builder's design from the beginning.

## 24.4 Secret rolls

Server-generated, seed and result stored, visible to GM, revealable later. The audit log records the
reveal.

## 24.5 DoS and abuse

Per-user rate limits on evaluation-heavy endpoints; import quotas; the §23.2 limits.

---

# 25. Versioning and Migration

## 25.1 Three independent versions

- **`engineApiVersion`** — the Rules Engine's contract. Breaking engine change = major bump.
- **Package `version`** — semver on package content.
- **`stateSchemaVersion`** — the shape of actor state a package version writes.

Keeping these separate matters: an engine upgrade must not force every package to republish, and a
package content fix must not force actor-state migration.

## 25.2 Immutability

Published releases are never mutated. Campaigns pin `(packageId, version)`. A new version is a new
row, and characters keep running on the old one until explicitly upgraded.

## 25.3 Migration steps

```jsonc
{ "from": 2, "to": 3, "steps": [
  { "op": "renameValue",   "from": "value:str", "to": "value:might" },
  { "op": "removeValue",   "id": "value:legacyLuck", "archiveTo": "custom" },
  { "op": "transformValue","id": "value:defense", "using": { "text": "@self + 1" } },
  { "op": "renameCollection", "from": "collection:gear", "to": "collection:inventory" }
] }
```

Migrations are **declarative data**, not code. `removeValue` with `archiveTo: "custom"` is the
default recommendation — preserving orphaned data as an inert custom value is almost always better
than deleting it, and it costs almost nothing.

## 25.4 Upgrade flow

```
select target version → validate compatibility → diff definitions → plan migration
  → DRY RUN on a copy of every affected actor → report (changed values, orphans, errors)
  → GM confirms → snapshot every actor (§13.4) → apply → repin campaign
```

The dry run and the pre-upgrade snapshot together are the rollback strategy: **restore the snapshot
and repin the old version.** Because old releases are immutable and still present, rollback is always
available.

## 25.5 Failure

A failed migration leaves the campaign on the **old** version. Migration is per-actor and
transactional; partial failure reports which actors failed and leaves them untouched. Never a
half-migrated campaign.

---

# 26. Testing Strategy

## 26.1 Prerequisite — the non-negotiable one

**A test runner must land before Phase 1** (§2.9). Vitest is the natural fit for a Nuxt/Vite project
and adds one dev dependency. This is the single highest-value change in this entire document
relative to its cost: a rules engine without tested arithmetic is worse than no rules engine,
because it produces confident wrong numbers.

## 26.2 Engine tests (Eldra's own)

Parser/printer round-trip · AST evaluation · type checking · cycle detection · modifier phases and
stacking · dependency invalidation · trace correctness · roll determinism under fixed seeds ·
migration steps · property-based tests for arithmetic identities and for "evaluation order never
affects the result."

## 26.3 Package self-tests — packages prove their own math

```jsonc
{ "id": "test:mightMod",
  "given": { "values": { "value:might": 14 } },
  "expect": [ { "path": "value:might.mod", "equals": 2 } ] }

{ "id": "test:poolDistribution",
  "given": { "values": { "value:pool": 5 } },
  "roll": "roll:standardPool", "samples": 10000,
  "expect": [ { "stat": "meanSuccesses", "between": [1.5, 1.9] } ] }
```

Run at import (§22.2). **A package failing its own tests can be imported but not activated.** This
is how "a package proves its core math works before being activated" becomes mechanical rather than
aspirational.

## 26.4 Golden traces

Store full traces for representative characters. Any engine change that alters a trace must alter it
*intentionally* — this is the regression net for the parts of a rules engine that unit tests
historically miss, namely ordering and provenance.

---

# 27. Observability and Explainability

## 27.1 Trace shape

```jsonc
{ "path": "value:defense", "result": 17, "steps": [
  { "op": "base",  "label": "Base Defense", "value": 13, "running": 13 },
  { "op": "add",   "label": "Shield",  "sourceId": "source:item.shield",
    "sourceInstanceId": "ci_01H…", "modifierType": "equipment", "value": 2, "running": 15 },
  { "op": "add",   "label": "Blessed", "sourceId": "source:condition.blessed",
    "sourceInstanceId": "cs_01H…", "value": 2, "running": 17 },
  { "op": "clamp", "label": "Maximum", "sourceId": "source:rule.defenseCap",
    "sourceInstanceId": "cs_02H…", "clamp": "max", "value": 30, "running": 17 } ] }
```

Renders as the brief's example, with every line attributable to a real source instance.

**A failed evaluation traces too.** When modifier resolution aborts (§16.11A), the trace ends in a
terminal `op: "error"` step carrying the same `sourceId`/`sourceInstanceId` provenance a successful
modifier step would, plus the error `code`:

```jsonc
{ "path": "value:defense", "result": { "kind": "error", "code": "source-field-absent",
    "message": "@source:equiped is not a field of source instance ci_01H… (collection:inventory)",
    "provenance": { "targetId": "value:defense", "stage": "condition",
                    "sourceDefinitionId": "source:item.shield",
                    "sourceInstanceId": "ci_01H…", "attachmentIndex": 0 } },
  "steps": [
    { "op": "base",  "label": "Base Defense", "value": 13, "running": 13 },
    { "op": "error", "label": "Shield", "sourceId": "source:item.shield",
      "sourceInstanceId": "ci_01H…", "code": "source-field-absent" } ] }
```

Steps before the failure are retained — they show how far evaluation got — and no steps follow it,
because nothing else was evaluated. This is what makes `explain(path)` useful on a *broken* value,
which is the case a user is most likely to ask about.

> **Revision 3 corrections.** `sourceId` now always names a **SourceDefinition**, and the new
> `sourceInstanceId` names the instance (§16.8) — revision 2 mixed the two, putting the raw instance
> ids `inv:ci_…`/`src:cs_…` in `sourceId`. The "Agility" step was removed: `value:defense`'s formula
> already incorporates `@value:agility.mod`, so it belongs to the `base` step (now 13), not to a
> separate `add` step — a modifier step must correspond to a real Modifier with a real Source. The
> clamp step carries its explicit `clamp` bound (§16.12) rather than relying on the label "Maximum".

## 27.2 Cost

Zero when not requested (§15.5). Determinism means `explain(path)` replays just that subgraph.

## 27.3 Redaction

GM-only sources appear as `{label: "Hidden", redacted: true}` for non-GM viewers, computed
**server-side** (§24.3).

## 27.4 Audit log

Append-only: actions taken, rolls (spec + seed + result), state changes, GM overrides, package
upgrades, migrations. Enough to reconstruct a session.

## 27.5 Diagnostics

Per-campaign: unbound semantic roles, binding gaps, failing package tests, values evaluating to
`error`, deprecated definitions still referenced. This is the surface where "visible degradation"
becomes actually visible.

---

# 28. Failure and Recovery Model

**Principle: visible degradation, never silent corruption.**

| Failure | Behavior |
|---|---|
| Invalid formula | Rejected at import. Package never activates. |
| Formula errors at runtime | Value becomes `error`; renders as an inline error with a trace; rest of sheet works |
| Missing reference | Import-time validation error; at runtime (dynamic path) → `error` value |
| Upgrade removes a definition | Blocked without a migration step; `archiveTo: custom` preserves data (§25.3) |
| Dependency cycle | Static → import fails with the cycle path. Dynamic → `error` + trace, never a hang. Reached through a modifier condition, it keeps `code: cycle-detected` and gains provenance (§16.11A) |
| Modifier condition errors or returns non-boolean | Target value becomes `error` with modifier/Source provenance; the modifier is **never** silently dropped (§16.11A); rest of sheet works |
| Modifier candidate value or clamp bound errors | Same — first error aborts that target only (§16.11A) |
| Missing package dependency | Cannot occur in V1 (§11.5) |
| Migration fails | Campaign stays on old version; failed actors untouched; report names them |
| Orphaned actor values | Retained in `custom`, listed in diagnostics, never deleted |
| Missing world binding | Declared default + persistent campaign warning (§19.3) |
| Evaluation exceeds budget | Aborts that path → `error` with "evaluation limit exceeded" |
| Package disabled mid-campaign | Actor state preserved read-only; sheet shows "no active rules package" |
| Rollback | Restore pre-upgrade snapshot, repin old (still-present, immutable) version |
| Engine version incompatible | Campaign refuses to load rules, shows required range, preserves all data |

The through-line: **data is never destroyed by a rules failure.** Worst case is a read-only campaign
with a clear explanation.

---

# 29. Performance Model

## 29.1 Design budget

| Operation | Frequency | Approach |
|---|---|---|
| Parse expressions | Once per package version, at import | Never at evaluation |
| Build dependency graph + topo sort | Once per package version, cached | Never per actor |
| Load package document | Once per process, cached by immutable hash | Directus out of the hot path (§21.6) |
| Full actor evaluation | On load | Lazy — only what is read |
| Single stored-value edit | Constant, per keystroke | Dirty-mark only; no computation |
| Read a derived value | Per render | Memo hit, or recompute one subgraph |
| Explain | On user request | Replay one subgraph with tracing |
| Roll | On user action | Server round trip (already a write) |

## 29.2 Anti-patterns explicitly designed against

Re-parsing per evaluation (ASTs are precompiled) · full recomputation on unrelated edits (dirty
subgraph only) · unbounded reactive chains (one evaluator, not 168 computeds) · network round trips
for local derived values (client evaluation) · recursive recalculation storms (topological order +
visit guard).

## 29.3 The sheet.vue comparison

Today: 168 `computed`s over shared deep objects, invalidation determined by Vue's dependency tracking
over whatever those computeds happen to touch. After: one reactive store of stored values, one
evaluator, explicit dependency edges, per-value memoization.

I am claiming this is **structurally** better — fewer, narrower, explicitly-scoped invalidations. I
am **not** claiming a measured improvement, because no benchmark exists (§15.7). Phase 1 should
establish one before Phase 2 makes claims.

---

# 30. Licensing and Content Boundaries

*Not legal advice. These are architectural boundaries that reduce exposure.*

Research context: the D&D 5.1 SRD was released under **CC-BY-4.0** in January 2023, permitting reuse
and derivative works with attribution ([sources](https://paizo.com/orclicense)). Paizo's **ORC
License** is a system-agnostic, perpetual, irrevocable open license that expressly licenses game
mechanics, sidestepping the long-running argument about whether mechanics are copyrightable at all.

## 30.0 Observed source licensing — and why "it's on GitHub" proves nothing *(revision 2)*

Verified directly against each repository:

| Source | Code license | Content license | The trap |
|---|---|---|---|
| `foundryvtt/worldbuilding` | MIT | *(no game content)* | None — genuinely clean |
| `foundryvtt/dnd5e` | MIT (`Copyright 2021 Andrew Clayton`) | **Separate** — OGL/SRD, plus additional content licenses | One repo, **two licenses**. The MIT file covers the software only |
| `foundryvtt/pf2e` | Apache-2.0 | **Separate** — Paizo content terms | Same split; compendium packs are not Apache-2.0 |
| `Roll20/roll20-character-sheets` | MIT (Roll20, 2014–2018) | Community-contributed per sheet | The collection license does not settle rights in any individual sheet's embedded game text |
| **`5etools-src`** (Eldra's own local dataset) | **MIT — "the Software"** | **Not licensed for redistribution.** `data/` is publisher content, much of it well beyond SRD | **The most dangerous case, and it is already in this repository's workflow.** `LICENSE.md` reads MIT; that covers site code and tooling, not `data/bestiary/*.json` |
| Open5e | Open-source | Deliberately license-clean, **per-document license metadata** | The model to imitate |

**The single most important licensing finding: a repository's `LICENSE` file frequently governs only
its code, while the game content beside it is governed by something else entirely — or by nothing
granting redistribution at all.** An adapter that reads MIT-licensed parser code from a repo has
learned nothing about whether the JSON next to it may be republished.

Two structural gifts worth exploiting rather than rebuilding:

- 5e.tools separates `fluff-*.json` (prose/lore) from mechanical files **at the file level**.
- Foundry's `documentTypes` declares `htmlFields` — literally a list of which fields are prose.

Both give adapters a **free, source-declared mechanics/prose split** (§30.2), which is the most
effective mitigation available and costs nothing to use.

**Open5e is the design to copy on provenance**: it publishes per-document license metadata and states
a policy of only including content that is licensed for reuse or owned outright. Eldra should carry
license metadata at the same granularity — per source document, not per package (§22A.3).

## 30.1 Categories the architecture must keep separate

| Category | Risk | Boundary |
|---|---|---|
| **Engine-compatible package** (mechanics as data, original wording) | Low | Core supported path |
| **Reimplemented public mechanics** (numbers/procedures, own words) | Low | Fully supported |
| **Open-licensed content** (CC-BY / ORC) | Low **with attribution** | `license` block required and **surfaced in UI**, not just stored |
| **Copyrighted rules text** (flavor text, descriptions, proprietary names) | **High** | Never bundled by Eldra; never redistributable through Eldra |
| **User-created private config** | Low | Stays private by default |
| **Community distribution** | Depends entirely on content | Not built (§22.5) |
| **Adapter code** (Eldra-authored parser) | Low | Eldra's own work. Distributed with Eldra, contains **no source content** |
| **Private local translation** (user's own files, own instance) | Low | The default and expected path |
| **Redistributing a translated package** | **Depends entirely on what was translated** | Blocked by default; requires license review (§22A.12 criterion 7) |
| **Translated mechanics, original wording** | Low | The intended output shape |
| **Translated content prose** | **High** | Excluded by default via source-declared prose fields (§30.0) |
| **Art / assets** | **High** | Never translated. `policy-excluded` by default (§22A.6) |
| **Retained `rawSource` fragments** | **Medium and easy to overlook** | Excluded from receipts by default on publish (§22A.3) — see §30.3 |

## 30.2 Architectural mitigations

1. **Mechanics and prose are separate fields.** A Value Definition holds `id`, `formula`,
   `constraints`; `description` is separate and optional. A package can be mechanically complete
   with zero prose. This is the single most effective structural mitigation available.
2. **`license` is mandatory in the manifest**, with `attribution` surfaced in the UI wherever the
   package is shown — attribution obligations under CC-BY are only met if attribution is actually
   displayed.
3. **Eldra ships no game content.** Reference/proof packages are original (§Appendix).
4. **Private by default**, no distribution path (§22.5).
5. **The existing 5etools importer is a user-supplied-data pipeline**, and should stay one — Eldra
   ships the mapper, users supply the files. This is already how it works and it is the right shape;
   it should not drift toward bundled data.
6. **Export is user-initiated** and carries license metadata with it.

## 30.3 Translation-specific mitigations *(revision 2)*

1. **Adapters ship without content.** An adapter is parser code plus mapping tables. It contains no
   game text, no statistics, no assets. It is distributable precisely because it is empty of content
   — the same reason the 5e.tools importer is already distributable today.
2. **Users supply their own sources, always.** Adapters take bytes and have **no network access**
   (§22A.5). Eldra cannot fetch content it should not have, and this is enforced by the adapter
   signature rather than by policy. The existing local-git-clone dataset model (§2.13) is exactly
   this pattern and should be generalized rather than replaced.
3. **Use the source's own prose declarations.** `htmlFields` and `fluff-*.json` (§30.0) let bulk
   prose exclusion be a checkbox rather than a per-field judgement.
4. **Per-source-document license metadata**, Open5e-style, carried in the receipt and surfaced in
   the reconciliation workspace before publish.
5. **License findings are a publish gate**, not a footnote (§22A.12 criterion 7). Unknown-license
   material is flagged as unknown — never assumed permissive.
6. **`rawSource` is not retained past publish by default.** This is a deliberate deviation from the
   current importer's `raw_json` behaviour (§2.13), which persists complete source fragments into
   Directus indefinitely. That is harmless for a private local install and becomes a redistribution
   hazard the moment a package is exported. Retaining it should be opt-in, per-import, and clearly
   labelled.
7. **Translated packages are private by default and marked `origin.kind: "translated"`**, so any
   future sharing path can refuse or gate them without needing to re-derive where they came from.
8. **No mirroring, ever.** Eldra does not host, cache, or redistribute source platform content.

---

# 31. Risks and Open Questions

Where I disagree with the brief, I say so.

## 31.1 **This is too much at once — my strongest objection**

The brief scopes ~15 subsystems. Built sequentially before the Character Sheet refactor, this is
many months during which the roadmap's #1 and #2 priorities are blocked and no user sees anything.

**Recommendation:** build the kernel (§15) + the sheet contract (§18) and *stop*. Migrate 5e behind
an adapter. Let actions, modifiers, world bindings, and packaging follow real use cases. §33
sequences this.

## 31.2 **Fully declarative will not stay expressive enough**

PF2e reached ~40 rule element types and still requires JavaScript for hard mechanics (§6.2). That is
the best available empirical evidence, and I take it seriously. Eldra will hit the same wall.

**Recommendation:** §23.4's seam must be *specified* in V1 (it is) and *unimplemented* in V1. If it
is not specified now, the eventual escape hatch will be `eval`-shaped, because that is what a rushed
escape hatch always is.

## 31.3 **"Rules define the sheet" is only two-thirds true**

Generated sheets are complete and plain. Beautiful sheets need design. Roll20 buys freedom with
package markup, which reintroduces exactly the coupling this design exists to remove.

**Recommendation:** §18's three tiers. Say "auto-generated sheets are functional, not beautiful" out
loud rather than discovering it after the refactor.

## 31.4 **Package inheritance is a trap**

Fantasy Grounds proves layering works and *also* proves it confuses people for decades (§6.4).
Layering × campaign overrides × migrations is combinatorial.

**Recommendation:** reserve the field, reject it at load, ship `modules` instead (§11.5). Revisit
only with a concrete use case.

## 31.5 **Campaign overrides are the most dangerous feature in this document**

Free-form overrides that patch definitions become un-migratable the moment the package changes, and
convert every upgrade into manual reconciliation.

**Recommendation:** the narrow typed list in §21.5. Refuse deep-merge patching. This will feel
restrictive and it is the restriction most worth keeping.

## 31.6 **Directus is right for storage, wrong for evaluation**

Correct for package documents, actor state, and audit. It must not be in the evaluation read path
(§21.6).

## 31.7 **Testing is the largest project risk, and it is not a design problem**

No tests, no validation library, manual schema migration (§2.9). A rules engine amplifies all three.
§26.1 is the mitigation and it is cheap.

## 31.8 Open questions requiring product-owner decisions

1. Is a "campaign" a first-class object yet? This document assumes campaign-scoped package binding,
   but campaigns don't exist as an entity today — worlds do. **Blocking for Phase 6, not Phase 1.**
2. Are NPCs/monsters Actors under the same package? (Recommendation: yes, different `actorKind`.)
3. Must 5e reach full parity as a package before `character-sheet-math.ts` is retired, or is a
   long-lived adapter acceptable? (Recommendation: long-lived adapter.)
4. Can a world change its rules package after characters exist? (Recommendation: no in V1.)
5. Do players author packages, or only admins? (Affects §24 urgency.)
6. Is 5e-package parity a launch requirement or an eventual goal?
7. Is `stateSchemaVersion` per-package or global? (Recommendation: per-package.)
8. Does World Configuration ship before or after the Rules kernel? (Recommendation: after — §19 is
   only a contract until something needs it.)

*Added in revision 2 — translation-specific:*

9. **Which adapter is built first?** 5e.tools has the lowest risk and highest existing leverage;
   Foundry has the highest demand. (Recommendation: 5e.tools, because §22A.10 is almost entirely
   additive and proves the pipeline before any new parsing risk is taken.)
10. **Is translated-package sharing ever a product goal?** If never, §30's redistribution machinery
    can stay minimal. If eventually, license metadata must be rigorous from the first import.
11. **Are third-party adapters ever permitted?** Determines whether the out-of-process sandbox in
    §22A.5 must be built. (Recommendation: no, indefinitely.)
12. **Does Eldra ship skeleton base packages** (a PF2e-shaped or 5e-shaped target for adapters to
    translate into)? Product and licensing implications (§22A.15 Q3).
13. **Are unpublished Translation Bundles persisted server-side**, and for how long? (§22A.15 Q5.)
14. **Is Foundry compendium extraction in scope at all**, given the LevelDB tooling dependency?
    (Recommendation: V1 accepts CLI-extracted JSON only — §22A.15 Q1.)

---
## 31.9 **Translation will be judged against an expectation Eldra should never set** *(revision 2)*

The moment "import your Foundry system" appears in any UI, a substantial fraction of users will read
it as "my game works now." Nothing in §22A delivers that, and nothing can.

**Recommendation:** the feature is named for what it does — *Translate* or *Import as draft*, never
*Convert* or *Migrate*. The bundle summary leads with fidelity counts, and a scaffold-heavy result
should look like work remaining, not like success. Publishing a compatibility percentage anywhere
would be the single worst product decision available here (§4, §35A.17).

## 31.10 **Adapters are a maintenance treadmill** *(revision 2)*

Source platforms change under Eldra with no notice and no obligation. Foundry moved schemas out of
`template.json` into DataModels and compendiums from NeDB to LevelDB; both silently reduce what an
adapter can extract. PF2e's ~40 rule elements evolve continuously.

**Recommendation:** adapters degrade rather than break — an unrecognised construct is
`absent` + `adapter-gap` (§22A.6), never a crash and never a silent omission. Ship **few** adapters
and keep them shallow. Two well-maintained adapters beat five rotting ones, and a rotting adapter is
worse than none because it produces confidently wrong output.

## 31.11 **Re-import is where data loss will actually happen** *(revision 2)*

Every other risk in this document costs time. This one costs work that cannot be recovered: a
re-import that overwrites hours of human formula authoring is unforgivable and entirely possible if
ownership tracking (§22A.11) is treated as optional.

**Recommendation:** ownership markers and tombstones are **not** deferrable to "when re-import
ships." The receipt must record ownership from the very first translated package, because a package
translated before ownership tracking existed can never be safely re-imported afterwards. Until
three-way merge exists, re-import should be **report-only** — show the diff, apply nothing.

## 31.12 **The IR could still become a second definition model** *(revision 2)*

§22A.2's sidecar design is specifically intended to prevent this, but the pressure will be constant:
the first time a translation needs "just one field" that native definitions lack, embedding it is the
path of least resistance, and after three such fields there are two models.

**Recommendation:** treat "does this field belong in the definition or the receipt?" as an explicit
review question on every translation PR. The test is simple — *would a hand-authoring user ever set
this?* If no, it belongs in the receipt.

---

# 32. Architecture Decision Records

### ADR-001 — Declarative packages, not code-first

**Context.** Foundry proves code-first is maximally expressive and requires trusting package
authors with full runtime access. Eldra is self-hosted and multi-tenant.
**Options.** (A) Code-first · (B) Purely declarative · (C) Declarative + specified seam.
**Decision.** **C.**
**Consequences.** Packages are inert data; no sandbox needed; UI generation and migration become
tractable; authoring opens to non-programmers. Expressiveness is bounded.
**Risks.** The declarative ceiling (§31.2).
**Revisit when.** Three or more real mechanics are demonstrably inexpressible.

### ADR-002 — Custom DSL, canonical AST, compiled once

**Context.** Need safe, deterministic, dependency-analyzable, human-authorable expressions with dice.
**Options.** (A) JS/`Function` · (B) CEL · (C) JSONLogic · (D) AST-only · (E) DSL + AST.
**Decision.** **E.** Store text and AST; parse at import; evaluate a compiled closure tree.
**Consequences.** Free dependency extraction; no re-parsing; visual editors emit AST directly;
RPG-familiar syntax (`2d6`, `@value:x`); we own a parser (~small, bounded grammar).
**Risks.** Maintaining a language. Mitigated by the closed function whitelist and no user functions.
**Revisit when.** The grammar needs anything Turing-complete.

### ADR-003 — Derived values are never stored

**Context.** Stored derived values drift from the rules that produced them.
**Options.** (A) Store all · (B) Store none · (C) Store hot values.
**Decision.** **B**, with explicit Snapshots (§13.4) as the only exception.
**Consequences.** No cache invalidation problem; upgrades change values correctly and immediately.
**Risks.** Evaluation must be fast — §15.2/§29 address this.
**Revisit when.** Profiling shows evaluation dominating; even then, cache in-process, never in the DB.

### ADR-004 — Opaque namespaced definition IDs

**Context.** IDs are the join key for state, overrides, bindings, traces, and migrations.
**Options.** (A) Label-derived slugs · (B) UUIDs · (C) `<kind>:<slug>`, opaque and permanent.
**Decision.** **C.**
**Consequences.** Human-readable in JSON and traces; renaming a label is free; renaming an *ID* is a
declared breaking migration.
**Risks.** Authors will pick bad IDs early. Mitigated by rename migrations.
**Revisit when.** Cross-package references need global uniqueness — prefix with `packageId` then.

### ADR-005 — No package composition in V1

**Context.** Fantasy Grounds shows layering works and is confusing (§6.4).
**Decision.** `dependencies` reserved, rejected at load. Ship `modules` instead.
**Consequences.** Much simpler validation, migration, and conflict handling.
**Risks.** Duplication across similar packages.
**Revisit when.** Two shipped packages genuinely need a shared base.

### ADR-006 — World Config declares traits; Rules interpret them; one-way

**Context.** Circular coupling between setting and mechanics would be fatal.
**Options.** (A) Merge them · (B) Rules own everything · (C) Traits + one-way reads + bindings.
**Decision.** **C.**
**Consequences.** Either side evolves independently; mismatches surface as user-resolvable binding
gaps, never runtime failures.
**Risks.** Binding gaps could proliferate. Mitigated by required defaults.
**Revisit when.** A mechanic genuinely needs to write back to world config — it should become a
world-config concept instead.

### ADR-007 — Sheets render declared layouts; packages never ship markup

**Context.** Roll20 proves package markup destroys the boundary.
**Options.** (A) Package HTML · (B) Fully auto-generated · (C) Declared structure + Eldra components.
**Decision.** **C**, with three tiers (§18.3).
**Consequences.** Consistent quality, theming, accessibility, and mobile; packages cannot break the app.
**Risks.** Layouts a package wants and can't express.
**Revisit when.** The control vocabulary is repeatedly insufficient — extend the vocabulary, not the
escape hatch.

### ADR-008 — Isomorphic engine; client previews, server decides

**Context.** Client evaluation is required for responsiveness and can never be trusted.
**Options.** (A) Client only · (B) Server only · (C) Both, one implementation, server authoritative.
**Decision.** **C.**
**Consequences.** Instant local feedback; tamper resistance; no round trip per keystroke; one codebase.
**Risks.** Divergence between environments — mitigated by purity and shared golden tests.
**Revisit when.** Never for correctness; possibly for very large actors (move evaluation server-side).

### ADR-009 — Fixed modifier phases; package-declared stacking

**Context.** Every system stacks differently; PF2e hardcodes its own rule.
**Options.** (A) Hardcode a policy · (B) Author-ordered application · (C) Fixed phases + declared
per-type stacking.
**Decision.** **C** (§16.3, §16.4).
**Consequences.** Deterministic and reproducible; supports non-stacking, best-of, and exclusive
systems without engine changes.
**Risks.** Six phases may not cover everything. Mitigated by `final`.
**Revisit when.** A real system needs a seventh phase.
**Amended in revision 3.** The decision stands; three under-specified points are now settled.
Stacking is declared at `manifest.modifierTypes` (§16.3) — revision 2 named no declaration site at
all. An undeclared `modifierType` is now an **error** rather than a silent `stack` default, which was
only ever tenable while no declaration site existed. And `base` is not a modifier phase: five phases
(`set`/`add`/`scale`/`clamp`/`final`) are available to modifiers, with `base` reserved for the
Value's own formula (§16.4).

### ADR-010 — Declarative migrations, immutable releases, mandatory dry run

**Context.** Manual, unautomated schema deployment (§2.9) plus evolving rules is a corruption risk.
**Options.** (A) No migration (pin forever) · (B) Code migrations · (C) Declarative steps + dry run
+ snapshot.
**Decision.** **C.**
**Consequences.** Previewable, reversible upgrades; rollback is restore-snapshot + repin.
**Risks.** The step vocabulary may be insufficient — extend it as needed; never allow code.
**Revisit when.** A necessary transformation cannot be expressed as steps.

### ADR-011 — No package code, ever; capability-scoped seam instead

**Context.** Self-hosted, multi-tenant, untrusted authors.
**Options.** (A) Trust authors · (B) Sandbox (isolated-vm/QuickJS) · (C) No code + capability seam.
**Decision.** **C** (§23.4).
**Consequences.** Whole classes of vulnerability are structurally impossible; no sandbox to maintain
or escape.
**Risks.** New capabilities require an Eldra release — accepted deliberately as the price of the
trust boundary.
**Revisit when.** Capability requests become frequent enough to justify a real sandbox; even then,
server-side only.

### ADR-012 — Narrow, typed campaign overrides

**Context.** Free-form overrides are un-migratable (§31.5).
**Options.** (A) Deep-merge patches · (B) None · (C) A closed typed list.
**Decision.** **C** (§21.5).
**Consequences.** Overrides survive package upgrades; migrations stay tractable.
**Risks.** GMs will want more. Extend the list deliberately, one operation at a time.
**Revisit when.** A specific override type is requested repeatedly — add *that* type.

### ADR-013 — Translation IR: native definitions plus a keyed sidecar *(revision 2)*

**Context.** Translation needs to express provenance, confidence, unresolved mappings, candidates,
diagnostics, and review state. A published package must express none of them.
**Options.** (A) Translate directly to native definitions — no room for any of it · (B) A fully
independent IR — drifts from the native model and doubles maintenance · (C) Native definition shapes
carrying embedded translation fields · (D) **Native definition shapes plus a Receipt sidecar keyed by
definition ID.**
**Decision.** **D.** The Translation Bundle is `{definitions[], receipt, diagnostics[],
sourceSnapshot}`. Narrowing to a package is *dropping the sidecar*.
**Consequences.** One definition model, so no drift. Zero translation concepts in the runtime type.
Publication is a verifiable subtraction rather than a lossy transformation. The receipt survives as
the re-import substrate (ADR-017). The reconciliation UI and the future authoring UI edit the same
objects.
**Risks.** Sidecar and definitions can desynchronise if a definition is renamed without updating the
receipt key — so renames must go through one operation that updates both. Ongoing pressure to embed
"just one field" (§31.12).
**Revisit when.** A translation concept genuinely needs to affect evaluation — which would mean the
runtime model is missing something, and the fix belongs in the runtime model, not the receipt.

### ADR-014 — Adapters may contain executable code; Rules Packages may not *(revision 2)*

**Context.** "No package code" (ADR-011) is absolute and correct. Parsing Foundry `template.json` or
Roll20 HTML requires real code. Are these the same rule?
**Options.** (A) Extend the no-code rule to adapters — forbids parsing, makes translation impossible
· (B) Data-only mapping tables — insufficient; `{choose:{from,count}}` needs a parser · (C) External
CLI tools — operational burden and a larger escape surface · (D) **Executable first-party adapters in
a controlled import context, with output re-validated identically to hand-written packages.**
**Decision.** **D.** Three trust tiers (§22A.5), not one policy.
**Consequences.** Adapter code runs once, at import, offline, on user-supplied files, with no
credentials, and its only output is a package a human could have written. It cannot extend runtime
capability. Eldra's existing importer already works exactly this way (§2.11), so this ratifies
current practice rather than loosening a rule.
**Risks.** A future contributor reads "adapters may contain code" as permission to relax ADR-011.
Mitigated by stating the distinction as a *tier table* rather than an exception.
**Revisit when.** Third-party adapters are seriously proposed — at which point out-of-process
sandboxing becomes mandatory, not optional.

### ADR-015 — Fidelity, confidence, and review are three fields, not one enum *(revision 2)*

**Context.** The brief proposed a single status vocabulary mixing production method, exclusion
reason, and human review state.
**Options.** (A) One enum as proposed · (B) Numeric confidence only · (C) **Separate `fidelity`
(categorical, adapter-declared), `confidence` (numeric, adapter-declared, validator may only lower),
`review` (human), plus `exclusion` present only when `fidelity: absent`.**
**Decision.** **C.**
**Consequences.** "Heuristic and human-accepted" and "scaffold and license-blocked" are both
expressible. Confidence sorts a review queue; fidelity drives publish gating; review records human
judgement. Adapters cannot inflate confidence past validation.
**Risks.** Four fields is more ceremony than one. Justified because the single enum cannot represent
states that occur routinely.
**Revisit when.** Real usage shows a field is never read — most likely `confidence`, if reviewers
turn out to sort by fidelity alone.

### ADR-016 — Provenance retention: package `origin`, definition-level receipt *(revision 2)*

**Context.** Provenance must survive for re-import without polluting the runtime.
**Options.** (A) None — one-shot import only · (B) Full provenance inside definitions · (C) **Minimal
`origin` in the manifest; everything else in a receipt stored alongside, not inside.**
**Decision.** **C.** Five `origin` fields cross into the published package: adapter id/version,
source id/hash, receipt pointer.
**Consequences.** Runtime loads packages, never receipts. A package with a deleted receipt still
evaluates perfectly and merely loses clean re-import. `rawSource` is dropped by default on publish
(§30.3).
**Risks.** Receipts become an orphanable side-table needing its own retention policy.
**Revisit when.** Receipt storage becomes material — at which point retention becomes user-visible.

### ADR-017 — Re-import ownership and three-way merge *(revision 2)*

**Context.** Sources update. Human reconciliation work must survive that, and must never be silently
overwritten.
**Options.** (A) Re-import replaces everything · (B) Re-import creates a new package each time ·
(C) **Per-definition ownership** (`generated` / `generated-then-edited` / `authored` /
`generated-then-deleted`) driving a three-way merge with BASE reconstructed from the receipt.
**Decision.** **C.**
**Consequences.** `generated` regenerates freely; `authored` is never touched; edits conflict rather
than vanish; deliberate deletions stay deleted via tombstones. Deleting a receipt degrades to
two-way merge with an explicit warning.
**Risks.** Merge UI is real work. Mitigated by making V1 re-import **report-only** — show the diff,
apply nothing (§31.11).
**Revisit when.** Never for the ownership model — it must exist from the first translated package,
because a package translated without it can never be safely re-imported afterwards.

### ADR-018 — Content and mechanics import independently *(revision 2)*

**Context.** One source (a 5e.tools dataset, a Foundry system) yields both package *mechanics*
(definitions) and package/world *content* (items, spells, monsters). They change at different rates
and carry different licensing risk.
**Options.** (A) One combined import · (B) **Separate, independently versioned and re-importable
streams.**
**Decision.** **B.** A dataset refresh adding monsters must not force re-review of class
progressions; content may be excluded on licensing grounds while mechanics are kept.
**Consequences.** Two provenance paths — definition receipts (§22A.3) and the existing
`import_source` block for content (§2.13). Existing content import is preserved unchanged.
**Risks.** Referential integrity across streams (a mechanic referencing an excluded item) — handled
as an unresolved reference, which blocks publish (§22A.12).
**Revisit when.** Cross-stream references become common enough to need a real link model.

### ADR-019 — Source licensing boundaries *(revision 2)*

**Context.** Source repositories routinely carry a permissive **code** license beside content that is
not redistributable. `5etools-src` states MIT and its `data/` is publisher content (§30.0).
**Options.** (A) Trust repository `LICENSE` files · (B) Block all import of licensed material ·
(C) **Adapters ship without content; users supply their own local sources; adapters have no network
access; every artifact carries per-source-document license provenance; license findings gate
publication.**
**Decision.** **C.**
**Consequences.** Adapter code is freely distributable because it is empty of content. Eldra cannot
fetch what it should not have — enforced by the adapter signature, not by policy. Source-declared
prose markers (`htmlFields`, `fluff-*.json`) make bulk prose exclusion a checkbox. The existing
local-clone dataset model (§2.13) is generalized rather than replaced.
**Risks.** Users can still translate content they lack rights to. Eldra's mitigations are structural
(no fetching, no hosting, private by default, provenance retained), not enforcement — and should not
be described as enforcement.
**Revisit when.** Any sharing or marketplace path is seriously proposed; the requirements change
completely at that point.

### ADR-020 — Source-scoped expressions and one activation path *(revision 3)*

**Context.** Implementing the Modifier Pipeline showed that the canonical "+2 while equipped" pattern
was unbuildable: `@source.equipped` did not parse, standalone modifiers had no attachment mechanism,
and collection items had no defined route to becoming active Sources.
**Options.** (A) Hardcode an `equipped` convention in the engine · (B) Gate activation with a
collection-level `activeWhen` expression · (C) One activation path per item plus modifier-level
`condition`s reading a new `@source:` namespace · (D) Drop item-carried modifiers from V1.
**Decision.** **C** (§16.8, §16.9, §16.10).
**Consequences.** One gating mechanism instead of two. Every active modifier has exactly one Source
instance, so provenance, ordering, and `@source:` binding are total. An unequipped item's Source stays
in the overlay and is condition-gated, so a trace can explain "carried, not equipped" rather than
silently omitting it.
**Risks.** `@source` and `@sources` differ by one character. Mitigated grammatically: `@source`
requires a path, `@sources` forbids one, so either typo is a syntax error with a targeted suggestion.
**Revisit when.** An item must activate more than one Source, or a Source must be gated by something
no expression can read.

### ADR-021 — The dynamic Source overlay is derived, never stored *(revision 3)*

**Context.** Collection items activate Sources (ADR-020), so the active-Source set is no longer just
`ActorState.sources`. Something must derive the union, and three candidates all had a claim.
**Options.** (A) Persist derived instances into `ActorState` · (B) Derive them inside the Modifier
Pipeline · (C) Derive them inside `EvaluationSession`'s constructor logic · (D) **A dedicated pure
builder module whose output the session holds immutably.**
**Decision.** **D** — `source-overlay.ts` exposes `buildSourceOverlay(registry, actorState)`;
`EvaluationSession` calls it once at construction and stores the result (§16.8, §16.15).
**Consequences.** `ActorState` keeps storing only user decisions (§13.2). The Modifier Pipeline reads
an overlay it did not invent. The session stays a container that holds one derived value rather than
a computation engine. Each of the three has exactly one job.
**Risks.** One more module. Justified only because all three alternatives put derived state in a
subsystem that must not own it; a rename like `ActiveSourceResolver` would not have resolved that.
**Revisit when.** The overlay must change *during* a session (V1 sessions are single-shot).

### ADR-022 — Gating never absorbs errors *(revision 3)*

**Context.** The deployed pipeline excluded a modifier whenever its `condition` did not yield `true`,
including when the condition produced a `RulesError`. That single rule silently defeated three
guarantees this architecture makes elsewhere: absent `@source:` fields error rather than returning
zero (§16.9), runtime dynamic cycles are visible as `error` values (§14.8), and failures degrade
visibly rather than corrupting silently (§28). Each of those produces a `RulesError`; the pipeline
then read it as "not true", dropped the modifier, and returned a plausible wrong number with no
diagnostic anywhere.
**Options.** (A) Keep "non-true excludes" and accept that the three guarantees are aspirational ·
(B) Treat only `error` as propagating, but coerce non-boolean values to `false` · (C) **Boolean
`false` excludes; every other outcome — non-boolean or `error` — propagates as an `error` on the
target** · (D) Propagate, but accumulate every failure for the target rather than aborting at the
first.
**Decision.** **C**, with first-error-aborts (§16.11A). B was rejected because coercion is exactly
the implicit conversion §14.3 forbids everywhere else, and because a `number`-typed condition is an
authoring mistake, not a "no". D was rejected because conditions may read other Values, so continuing
past a known failure generates cascading secondary errors whose only cause is the first — one true
failure beats one true failure plus its consequences. Package validation still accumulates (§16.14);
runtime evaluation has the opposite goal.
**Consequences.** *False eligibility excludes; evaluation failure propagates* becomes a stated
principle with a stage-by-stage table behind it (§16.11A). No pipeline stage removes a candidate
because evaluating it went wrong. Errors are memoized (§15.4), traced with a terminal `op: "error"`
step (§27.1), and enriched with provenance without being re-labelled — a cycle surfacing through a
condition still reports `cycle-detected` and its full path. `resolveActiveModifiers` gains a
`ModifierResolution` return type, because an empty array legitimately means "nothing applies".
**Risks.** A single typo'd `@source:` field now visibly breaks one value rather than quietly
producing a wrong one. That is the intended trade and the whole point of §28; the mitigation is
diagnostics quality (§27.5), not leniency. Second risk: authors used to truthy conditions in other
VTTs will hit `modifier-condition-not-boolean` — mitigated by static type validation catching it
before publication wherever the type is knowable (§16.14).
**Revisit when.** A concrete case appears where a package genuinely wants "if this cannot be
determined, treat it as inactive." That intent is expressible today and explicitly —
`if(<can determine>, <test>, false)` — so the engine should not assume it.

---

# 33. Phased Implementation Roadmap

Reordered from the brief's suggestion per §31.1: **the sheet contract moves earlier**, and package
tooling moves later. Each phase is independently verifiable and independently deployable.

### Phase 0 — Test infrastructure *(prerequisite; not in the brief's plan)*

**Objective.** Make arithmetic testable.
**Scope.** Add Vitest; one trivial test; wire `pnpm test` into CI alongside lint/typecheck.
**Excludes.** Any rules code. Any existing-code tests.
**Affects.** `package.json`, `.github/workflows/ci.yml`, `vitest.config.ts`.
**Schema.** None. **Migration.** None.
**Verification.** `pnpm test` passes locally and in CI.
**Rollback.** Revert; nothing depends on it.
**Unlocks.** Everything after this. **Without it, do not start Phase 1.**
**Model.** **Sonnet** — mechanical, well-precedented.

### Phase 1 — Rules Kernel (types → parser → evaluator)

**Objective.** Evaluate derived values from a package document, with traces.
**Scope.** `app/lib/rules/`: types; DSL parser → AST; type checker; dependency extraction + topo
sort + cycle detection; evaluator with memoization and dirty-marking; trace builder; package
validator. In-memory only.
**Excludes.** Persistence, Directus, UI, actions, dice, modifiers, migrations.
**Affects.** New directory only. **Nothing existing is touched.**
**Schema.** None. **Migration.** None.
**Verification.** Unit tests for parser round-trip, evaluation, cycles, traces; the three proof
packages (§Appendix) evaluate correctly; establish the §15.7 benchmark.
**Rollback.** Delete the directory.
**Unlocks.** Everything. This is the load-bearing phase.
**Model.** **Opus** — parser/AST/graph design with long-lived consequences and no tests to lean on
initially.

### Phase 2 — Modifiers and effects *(moved earlier — sheets need them)*

**Objective.** Sources, modifiers, phases, declared stacking, conditions.
**Scope.** §16 in full, minus durations/auto-expiry. Includes the `SourceOverlay` (§16.8), `@source:`
(§16.9), reference attachment (§16.10), stacking selection (§16.11), **the §16.11A error-propagation
contract**, and explicit clamp bounds (§16.12).
**Excludes.** Roll modifiers (needs Phase 4), auras, triggers.
**Affects.** `app/lib/rules/` only.
**Verification.** Stacking-matrix tests per policy; ordering stability; golden traces. **Plus a
negative-path suite**: a `false` condition excludes silently, a non-boolean condition errors, an
`error` condition propagates with provenance, a runtime cycle through a condition keeps
`cycle-detected`, and a misspelled `@source:` field never yields a plausible number (§16.11A, §16.13
examples 8–9). Error-path tests are not optional here — §16.11A's whole content is behavior that
looks correct when it is wrong.
**Rollback.** Feature-flag off; kernel still works.
**Unlocks.** Equipment bonuses, conditions — i.e. a sheet that shows real numbers.
**Model.** **Opus** — §16 is the hardest correctness surface here.

### Phase 3 — Persistence and actor binding

**Objective.** Store packages and actor state; bind an Actor to a package.
**Scope.** `rules_packages` + `actor_rules_state` schema scripts; `server/utils/rules-packages.ts`,
`server/utils/actor-rules-state.ts`; `server/api/worlds/[id]/rules/**`.
**Excludes.** Touching `character_sheets`. Migrations. Upgrades.
**Affects.** New collections and utils; `scripts/directus/bootstrap.mjs` gains two entries.
**Schema.** Two new collections. **Migration.** None — additive only.
**Verification.** Round-trip package import/export with identical hash; state persists and reloads;
`bootstrap.mjs` is idempotent. **Deploy per the §Deployment Checklist manual process.**
**Rollback.** Unused collections; no existing reads change.
**Unlocks.** Real characters on real packages.
**Model.** **Sonnet** — follows the `scene-layer-objects.ts` pattern closely.

### Phase 4 — Sheet contract and generated sheet

**Objective.** Render a working sheet from definitions alone.
**Scope.** Layout declaration types; tier-1 auto-generated renderer; `app/components/rules/*`
controls; explain popover.
**Excludes.** Migrating the 5e sheet. Package-provided layouts.
**Affects.** New components; one new diagnostic route. `sheet.vue` untouched.
**Verification.** All three proof packages render and are editable; explain works on every derived
value.
**Rollback.** Route removal.
**Unlocks.** **The Character Sheet refactor can now begin** (§18.5).
**Model.** **Sonnet** — component work against a settled contract.

### Phase 5 — 5e adapter and incremental sheet migration

**Objective.** Express current 5e mechanics as a package; run the existing sheet against the engine
section by section.
**Scope.** Author a 5e package; an adapter reading `character_sheets` into `ActorState`; migrate
`sheet.vue` **one panel at a time** behind a flag; leave `character-sheet-math.ts` in place as the
comparison oracle.
**Excludes.** Deleting anything. Changing `character_sheets`.
**Verification.** **Differential testing** — for a corpus of real characters, engine output must
match `character-sheet-math.ts` output value-for-value. This is the highest-value verification
technique available here and it is only possible because the legacy code still exists.
**Rollback.** Per-panel flags.
**Unlocks.** Retiring 5e-specific server math, eventually.
**Model.** **Opus** — differential migration of a live 8,877-line surface.

### Phase 6 — Actions, rolls, dice

**Objective.** §17 end to end.
**Scope.** Roll Spec, roll engine with seeds, roll modifiers, action pipeline, cost validation,
outcomes, output templates, `EldraDiceBox` integration.
**Excludes.** Automated targeting, reactions, combat.
**Schema.** `rules_audit_log`.
**Verification.** Seeded determinism; distribution tests; server-authoritative costs; all three proof
families produce correct outcomes.
**Model.** **Opus** for the roll/modifier model, **Sonnet** for UI wiring.

### Phase 7 — World Configuration bindings and travel

**Objective.** §19 + §20.
**Scope.** Trait contract, binding UI, `@world:` resolution, `Route` consumption, travel actions.
**Depends on.** World Configuration existing, and Transportation Phase 3 (adjacency/traversal).
**Verification.** Travel duration responds to road/terrain/weather traits; missing
`movement.speed` degrades to distance-only with a visible notice.
**Model.** **Sonnet.**

### Phase 8 — Migration and upgrade tooling

**Objective.** §25.
**Scope.** Migration steps, diffing, dry run, snapshots, upgrade UI, rollback.
**Verification.** Migration fixtures; dry run never mutates; rollback restores exactly.
**Model.** **Opus** — data-destructive surface.

### Phase 9 — Package authoring tooling

**Objective.** Import/export UI, validation reporting, package self-test runner, first authoring UI.
**Model.** **Sonnet.**

## 33.1 Translation phases *(revision 2)*

**The kernel is not blocked by translation.** Phases T1–T5 run *after* Phase 1 and largely in
parallel with Phases 2–5. Only two things must precede the first engine commit, and both are type
declarations rather than features (§34.1).

The one exception is **T0, which belongs with Phase 0** because it is cheap, purely additive, and its
value decays: characterization tests are easiest to write while the importer's behaviour is still
exactly what it has always been.

### Phase T0 — Characterization tests for the existing importer *(with Phase 0)*

**Objective.** Freeze current importer behaviour before anything moves.
**Scope.** Fixture JSON + snapshot tests over `preview5eTools*` outputs. Trivial because the
functions are already pure (§2.11).
**Excludes.** Any change to importer behaviour whatsoever.
**Affects.** Test files only.
**Verification.** Tests pass; snapshots reviewed by a human once.
**Unlocks.** Every later importer change becomes safe.
**Model.** **Sonnet.**

### Phase T1 — Translation types and the 5e.tools bundle emitter

**Objective.** Prove the pipeline end-to-end on the source Eldra already understands.
**Scope.** `app/lib/rules/translation/`: `TranslationBundle`, `TranslationReceipt`, `SourceAdapter`,
fidelity/confidence/review/exclusion types. Widen `EldraImportPreviewEntity` **additively** (T-C),
then emit a bundle from the existing parsers (T-D).
**Excludes.** New source platforms. Reconciliation UI. Publishing. Any change to existing importer
output.
**Affects.** New directory; additive optional fields on one existing type.
**Verification.** T0 snapshots still pass unchanged — the proof that nothing regressed.
**Unlocks.** Everything else in translation.
**Model.** **Opus** — the IR boundary (ADR-013) is the decision most expensive to get wrong.

### Phase T2 — Validation, publish gate, and reconciliation workspace V1

**Objective.** Get from a bundle to a publishable package with human review.
**Scope.** §22A.12 activation criteria; §22A.7 V1 workspace (summary, list with fidelity badges,
accept/reject, Semantic Role mapping, unresolved-formula completion, license review, publish gate).
**Excludes.** Three-way merge, side-by-side comparison, wizards.
**Depends on.** Phase 3 (persistence) for storing published releases.
**Verification.** A 5e.tools dataset produces a package that activates and evaluates.
**Model.** **Sonnet** for the workspace, **Opus** for the validator/publish gate.

### Phase T3 — Import identity correction

**Objective.** De-duplicate on `(provider, externalId)` rather than slug (§2.13, T-E).
**Scope.** That change, alone, plus an `external_id` backfill.
**Excludes.** Everything else. **This is the only behaviourally risky step in translation** and must
ship isolated.
**Verification.** Re-running an unchanged import produces zero duplicates and zero spurious updates.
**Rollback.** Revert to slug matching; the backfilled column is harmless.
**Model.** **Opus** — live-data identity change.

### Phase T4 — Native mechanics emission from 5e.tools

**Objective.** Stop discarding the mechanics the source already contains (§2.12).
**Scope.** Hit dice → dice specs; save proficiencies; skill `{choose}` → ChoiceSets; multiclass
`{or:[…]}` → predicates; `classFeature[].level` → Progressions.
**Depends on.** T3 — do not emit mechanics keyed on an identity scheme about to change.
**Verification.** A generated 5e package's derived values match `character-sheet-math.ts` on the
Phase 5 differential corpus. **This is where translation and the 5e adapter validate each other.**
**Model.** **Opus.**

### Phase T5 — A second adapter

**Objective.** Prove the adapter contract generalises — the first adapter always fits the interface
it was extracted from.
**Scope.** One of: Foundry `template.json` + ActiveEffects (broadest reach), Roll20 sheet scaffolding
(best scaffold-quality demonstration), or PF2e Rule Elements (highest mechanical fidelity).
**Recommendation.** **Foundry `template.json` + ActiveEffects**, because Simple Worldbuilding gives a
near-exact end-to-end target (§22A.8) and ActiveEffects exercise the modifier model rather than only
the value model.
**Excludes.** Compendium LevelDB extraction (§22A.15 Q1) — accept CLI-extracted JSON.
**Model.** **Opus.**

### Phase T6+ — Deferred

Three-way merge UI · re-import beyond report-only · additional adapters · out-of-process sandbox ·
adapter-supplied reconciliation screens.

## 33.2 Revised ordering summary

```
Phase 0 + T0   test infra + importer characterization
Phase 1        Rules Kernel                         ← unblocked; translation waits
Phase 2        Modifiers
Phase 3        Persistence            ┐
Phase 4        Sheet contract         ├── T1 · T2 can start once Phase 3 lands
Phase 5        5e adapter + migration ┘   T3 → T4 pair with Phase 5's differential corpus
Phase 6..9     Actions · World · Migration · Tooling      T5 alongside
```

The claim in §31.1 is unchanged: the kernel plus the sheet contract is what unblocks the roadmap.
Translation adds no work before Phase 1 beyond three type declarations and one set of tests.

---

# 34. First Implementation Commit Recommendation

**Types only. No behavior. No dependencies. No schema.**

```
app/lib/rules/types.ts
```

Exporting: `RulesPackageManifest`, `Definition` (discriminated union over the 5 primitives + 4
supporting types), `ValueDefinition`, `CollectionDefinition`, `ModifierDefinition`,
`ActionDefinition`, `RollSpec`, `SemanticRole`, `ActorState`, `EvaluationContext`,
`EvaluationResult`, `Trace`, `TraceStep`, `RulesError`.

Rationale — this mirrors exactly how the Scene Graph started (`app/lib/eldra/scene.ts`: shared types
first, consumers later), which is the convention this repository has most recently proven. It is
reviewable in one sitting, has zero runtime risk, cannot break any existing behavior, and forces
every hard naming decision (§9.3, ADR-004) to be made and reviewed *before* any code depends on it.

Commit message, in the project's established style:

```
feat(rules): introduce Rules Engine core type contract
```

**Do not include in this commit:** the parser, any evaluator, any Directus schema, any dependency,
any change to `character-sheet-*.ts`, `sheet.vue`, or `app/lib/systems/*`.

**Phase 0 (Vitest) should land either immediately before or immediately after this**, as its own
commit.

## 34.1 Translation-aware additions to the first commit *(revision 2)*

The brief asks for a disciplined recommendation, not a wish list. The test applied to each candidate:
**would adding this later require auditing code that already exists?** Three pass. Four fail.

**Include — three concepts, roughly fifteen lines:**

1. **`status: 'draft' | 'published'` on `RulesPackageManifest`** (§11.8). The validator and the
   activation path branch on it. Adding it later means revisiting both plus every call site that
   assumed a package was activatable by existing.
2. **`origin?: PackageOrigin`** (§11.9) — optional, five fields, absent on hand-authored packages.
   Cheap now; retrofitting means a schema change to an *immutable* collection later, which is the
   worst possible time.
3. **An `unresolved` variant in the expression/AST node union** (§14.12). This is the strongest case
   of the three: adding a variant to a discriminated union afterwards means auditing every exhaustive
   `switch` in the parser, type checker, dependency extractor, evaluator, printer, and validator.
   Declaring it now costs one union member and one documented rule ("type-checks as `error`, blocks
   publish, contributes no dependencies").

**Exclude — these belong in `app/lib/rules/translation/` at Phase T1:**

- `TranslationBundle`, `TranslationReceipt` — not runtime types at all. Putting them in the core
  contract would be the exact mistake ADR-013 exists to prevent.
- `SourceAdapter` — no adapter exists to satisfy it, and an interface written before its first
  implementation is guesswork.
- Fidelity / confidence / review / exclusion types — sidecar concepts; the runtime never sees them.
- Mapping-receipt format — *specified* in §22A.3, deliberately **not** declared as a type until
  something writes one.

**Verdict: the first commit recommendation is unchanged in file, scope, and message.** Same file
(`app/lib/rules/types.ts`), same message (`feat(rules): introduce Rules Engine core type contract`),
same "types only, no behaviour, nothing existing touched" constraint — plus three small concepts that
would be disproportionately expensive to retrofit. That is a *widening*, not a redirection.

---

# 35. Final Review — Direct Answers

**1. What is the smallest kernel genuinely worth building?**
Value Definitions (stored/derived) + the expression parser producing a canonical AST + a memoized
evaluator with an explicit dependency graph + traces. That is Phase 1. Everything else —
collections, modifiers, actions, rolls, packaging — is additive. If only one thing gets built, build
that; it is what replaces 168 computeds and it is what makes "why is this 17?" answerable.

**2. Which features are foundational and must precede Character Sheet optimization?**
Five, listed in §18.5: the stored/derived value model; the evaluator and dependency graph; traces;
the layout contract (even at tier 1 only); and the 5e adapter. Notably **not** foundational: actions,
dice, world bindings, migrations, packaging. The sheet refactor can start after Phase 4.

**3. Which features should be deliberately postponed?**
Package composition/inheritance (§31.4) · multi-package campaigns · the extension seam's
implementation (specify only, §23.4) · event/trigger and auto-expiring durations · cross-actor
evaluation · marketplace/signing/trust tiers · the visual rules editor · rules-driven combat ·
non-dice randomizers · localization beyond label keys.

**4. Can Eldra remain primarily data-driven, or is constrained code extension eventually unavoidable?**
**Primarily data-driven: yes, and for most systems, permanently.** But some form of extension is
eventually unavoidable — PF2e is the proof (§6.2, §31.2). The distinction that matters: it does not
have to be *package-supplied* code. §23.4's capability model keeps packages inert forever while
still giving hard mechanics an exit. **Packages should never ship executable code, in any version of
Eldra.** That is the one line I would defend hardest in this entire document.

**5. What existing Character Sheet code should survive?**
The *presentation* layer, largely intact: `app/components/characters/Sheet*.vue` — tab bars, drawers,
rails, inventory tables, ability grids, the dice box integration, the theming. These are good
components solving real UI problems; they should be re-pointed at engine output rather than rewritten.
Also surviving: the inventory transfer system and its realtime bridge (orthogonal to rules), and the
5etools import pipeline (which becomes a package-content source). And critically —
`character-sheet-math.ts` survives *through Phase 5* as the differential-testing oracle. It is the
only specification of current behavior that exists, and deleting it before parity is proven would
discard the best verification asset in the repository.

**6. What existing Character Sheet code should not shape the new architecture?**
`character_sheets`' 5e-shaped columns (`class_name`, `species_name`, `level`, `subclass_name`) — do
not generalize these; replace them. The hardcoded taxonomies in `character-sheet-math.ts`
(`ABILITIES`, `SKILLS`, `FULL_CASTER_CLASS_KEYS`, `proficiencyBonusForLevel`, armor-class candidate
logic) — these are package content, not engine concepts. The organic accretion in `sheet.vue`
(168 computeds, 346 functions in one scope) — its *structure* is the thing being fixed and must not
be carried forward. And `character-sheet-resolver.ts`' free-text parsing of 5e entries into
structured actions is an import-time concern, not a runtime one.

**7. How should World Configuration and Rules Engine communicate without coupling?**
World Configuration declares **typed traits** on named definitions. Rules Packages declare
**required traits** and read them through `@world:` references. The dependency is strictly one-way —
rules read world config, never the reverse. Where they don't line up, the campaign gets an explicit,
user-resolvable **Binding** with a declared default and a visible warning. Neither subsystem ever
modifies the other, and neither imports the other. Changes on either side produce binding gaps, not
runtime failures (§19).

**8. How should Transportation Network feed travel rules?**
TN produces a `Route` — ordered legs with `edgeId`, `edgeTypeRef`, and `distance` — and nothing
mechanical. The Rules Engine consumes `Route` + party actor states + world config traits and
evaluates a package-declared travel Action. Party speed comes from the `movement.speed` Semantic
Role. **If no package binds that role, travel returns distance and route with no duration** — the
intended visible degradation. TN never imports Rules; Rules never imports geometry (§20).

**9. How can an imported package be trusted, validated, migrated, and explained?**
*Trusted:* it contains no code, so trust is about content, not execution — integrity hash, declared
license, and (later) trust tiers. *Validated:* engine-compat check → integrity verify → parse and
type-check every expression → validate all references → detect static cycles → resolve semantic roles
→ **run the package's own self-tests** → preview → confirm. A package failing its own tests can be
imported but not activated. *Migrated:* declarative migration steps with a mandatory dry run, a
pre-upgrade snapshot of every actor, and rollback by restoring the snapshot and repinning the
still-present immutable old release. *Explained:* traces (§27), plus a campaign diagnostics view
listing unbound roles, binding gaps, failing tests, and values in an `error` state.

**10. What should the very first implementation commit contain?**
`app/lib/rules/types.ts` — the core type contract, no behavior, no dependencies, no schema, nothing
existing touched. Message: `feat(rules): introduce Rules Engine core type contract`. This mirrors how
the Scene Graph began and forces every irreversible naming decision to be reviewed before anything
depends on it. Vitest (Phase 0) lands as its own adjacent commit (§34).

**11. What decisions would be most expensive to reverse?**
In descending order:
1. **Definition identity** (ADR-004) — it is the join key for state, overrides, bindings, traces, and
   migrations. Getting it wrong means rewriting every one of those.
2. **Stored vs derived boundary** (ADR-003) — storing derived values means every later change needs
   a cache-invalidation strategy that doesn't exist.
3. **Dice excluded from derived evaluation** (§14.6) — retrofitting purity onto an impure evaluator
   means rewriting the evaluator, the graph, and every test.
4. **Actor rather than Character** as the subject (§5) — vehicles, parties, and factions all depend
   on it, and it touches every signature.
5. **The AST as canonical form** (ADR-002) — text-only authoring forecloses visual editing and makes
   dependency extraction a parsing problem forever.
6. **No package code** (ADR-011) — trivially reversible technically, effectively irreversible
   socially: once one package ships code, the trust boundary is gone permanently.
7. **Visibility on every value** (§24.3) — cheap now, an audit of every value and trace step later.
8. **Semantic Roles as optional** — making any role mandatory later breaks every package that
   doesn't bind it.

**12. What assumptions still require product-owner decisions?**
The eight open questions in §31.8. The two that actually gate work: **(a)** whether a "campaign" is
going to become a first-class object — this document assumes campaign-scoped package binding, but
only worlds exist today, and Phase 7 needs an answer; and **(b)** whether 5e must reach full package
parity before `character-sheet-math.ts` is retired, or whether a long-lived adapter is acceptable —
my recommendation is the long-lived adapter, but it is a product call about how much migration risk
to accept, not a technical one.

---

# 35A. Final Review — Translation *(revision 2)*

**1. Is a distinct Translation IR warranted?**
Yes — as **native definition shapes plus a Receipt sidecar keyed by definition ID**, not as a parallel
model (ADR-013). Translating straight to native definitions leaves nowhere to put confidence,
candidates, diagnostics, or review state, so everything imperfect gets silently dropped. A fully
independent IR drifts from the native model and doubles maintenance. The sidecar keeps one definition
model, keeps every translation concept out of the runtime type, makes publication a verifiable
*subtraction* rather than a lossy transformation, and produces the artifact re-import needs for free.

**2. Can the existing 5e.tools importer realistically become the first generalized source adapter?**
Yes, and more easily than expected — **it is structurally already one.** `app/lib/importers/*` are
pure functions with all I/O hoisted to callers, and `persistImportedEntities` is a separate writer
(§2.11). `EldraImportPreviewResult` is a proto-IR carrying `provider`, `warnings`, `externalId`,
`sourceBook`, and full `raw` source. `EldraImportProvider` even reserves `'foundry-pack'`. The
brief's proposed Phase B is already done; what remains is widening the output type additively and
adding a receipt (§22A.10). It should be the first adapter precisely because the risky parsing work
is behind us.

**3. Which parts of Foundry systems can be translated automatically?**
`system.json` metadata; `documentTypes` and their `htmlFields` prose markers;
`primaryTokenAttribute`/`secondaryTokenAttribute` (a direct Semantic Role binding); `template.json`
scalar fields and `{value,min,max}` resource triples; localization files; compendium Item and Actor
*structure*; and — the best mapping available anywhere in the ecosystem — **ActiveEffect `changes[]`**,
where `{key, mode, value, priority}` maps near-isomorphically onto Eldra's `{target, phase, value,
order}`. In-data roll formulas translate heuristically since the syntax is close. Two caveats found by
inspection: `template.json` is the *legacy* mechanism (`foundryvtt/dnd5e` no longer has one), and
compendiums are LevelDB binaries since v11 requiring CLI extraction.

**4. Which parts can only produce scaffolds or diagnostics?**
Scaffolds: `prepareBaseData`/`prepareDerivedData` (names and paths are often discoverable, arithmetic
is not); Handlebars sheet templates (field presence, grouping, ordering → a layout skeleton);
DataModel schemas when only a bundled `.mjs` is supplied. Diagnostics only: hooks, macros,
`ActiveEffect mode: CUSTOM`, and system migration code. Assets are excluded by policy, never
translated.

**5. Is PF2e's Rule Element model especially suitable for translation?**
Yes — it is the most translatable mechanical corpus in the ecosystem, because it was built for the
same reason this architecture exists: letting homebrewers avoid writing JavaScript. `selector`→
`target`, `type`→`modifierType`, `predicate`→`condition`, `value` expressions→`value` expressions,
`ChoiceSet`→ChoiceSet, `RollOption`→context tags, `DamageDice`→Roll Modifier,
`AdjustDegreeOfSuccess`→`degrees`. Three caveats: much of the ~40-key catalogue is PF2-shaped;
**PF2e's stacking rule is hardcoded rather than declared**, so the adapter must inject a
`modifierTypes` policy table and say so; and selectors need a PF2e-shaped base package to land in.

**6. What useful output can a Roll20 adapter produce without translating any JavaScript?**
A great deal, and this is the most underrated finding. Verified against a real sheet: every `attr_*`
input with type and default → stored Values; `<select>` options → enums; `repeating_*` sections →
Collections; `readonly` as a derived-value hint; `autocalc`/`@{}` expressions translated outright;
roll buttons → draft Roll Specs; `<rolltemplate>` → an Eldra output template choice;
`translation.json` → i18n; and source ordering → a layout skeleton. Plus the best part: sheet-worker
`on("change:…")` and `getAttrs`/`setAttrs` calls yield a **correct dependency graph with the formulas
left blank**. The tedium converts; the interesting part is what a human wanted to write anyway.

**7. Should adapters be allowed to contain executable code?**
Yes (ADR-014). Parsing `template.json`, Roll20 HTML, or 5e.tools `{choose:{from,count}}` requires a
parser. Data-only mapping is insufficient; external CLIs add operational burden and escape surface.
Note that this ratifies existing practice — Eldra's importer has always been executable parser code.
*Rules Packages* remain absolutely code-free; that rule was never about build-time tooling.

**8. Where and under what security model should adapters run?**
V1: in-process in the Nitro import context, admin-gated, first-party only, with **no network access**
(adapters receive bytes, never URLs), no Directus client, no session, no credentials, no `process.env`
handle, read-only source access via a file-tree abstraction, and hard limits on time, input size,
archive entries, decompression ratio, and output count. Archives extract to a scratch directory
outside any served path and are purged. If third-party adapters are ever permitted, out-of-process
only — separate process, no network namespace, read-only mount, write-only bundle pipe, CPU/memory
caps — and that sandbox should not be built until someone needs it.

**9. How is adapter code fundamentally different from forbidden Rules Package code?**
In one sentence: *an adapter's only output is a package a human could have hand-written, validated by
the same validator, so it can produce bad data but can never extend what the runtime can do.* Package
code would execute inside evaluation, per user, per render, against live campaign state, forever,
with no validation boundary downstream. Adapter code runs once, at import, offline, on user-supplied
files, with its output fully re-validated. Same word, entirely different blast radius.

**10. How should translated definitions retain source provenance?**
Three granularities. Package level: `manifest.origin` — adapter id/version, source id/hash, receipt
pointer; five fields, survives publication. Definition level: the **receipt**, keyed by definition ID
— source file/path/line/original ID, fidelity, confidence, review, ownership, license, candidates;
stored *alongside* the package, never inside it, and never loaded by the runtime. Content level: the
existing `import_source` block, whose `hash` and `import_version` fields already exist and merely
need populating (§2.13). `rawSource` is dropped by default on publish, deliberately unlike today's
`raw_json` behaviour (§30.3).

**11. How should re-import preserve local human reconciliation?**
Per-definition **ownership** (ADR-017): `generated` regenerates freely; `authored` is never touched;
`generated-then-edited` triggers a three-way merge (BASE reconstructed from the receipt, THEIRS from
the new run, OURS from the current package) with conflicts surfaced and never auto-resolved; and
`generated-then-deleted` is a **tombstone**, so deliberate removals are not resurrected on every
re-import. Accepted `inferred` mappings survive if the mapping still matches and reset to
`unreviewed` if it does not. Ownership must be recorded from the very first translated package — a
package translated before ownership tracking existed can never be safely re-imported afterwards.

**12. Can an imported package be activated while unresolved mappings remain?**
Split answer, and the split is exact. **`unresolved` AST nodes: no, never** — they evaluate to
`error`, so allowing them ships a package broken by construction. **`scaffold` definitions: yes, with
explicit human acceptance** — a scaffold has a real value (usually a plain stored value), it is
merely less automated than the source was, and a GM who accepts that should be allowed to play. The
acceptance is recorded, shown in campaign diagnostics, and re-surfaced on every re-import. Low
`confidence` never blocks on its own; it sorts the review queue. Blocking on an adapter-chosen number
would just teach adapters to lie about confidence.

**13. What minimum translation-aware changes are needed in the core type contract?**
Exactly three (§34.1): `status: 'draft' | 'published'` on the manifest; optional
`origin?: PackageOrigin`; and an `unresolved` variant in the expression node union. Each fails the
"can this be added later cheaply?" test — the union variant most strongly, since adding one
afterwards means auditing every exhaustive `switch` in the parser, checker, extractor, evaluator, and
printer. Everything else translation needs is excluded from the core contract by design.

**14. Does this change the proposed first implementation commit?**
**It widens it slightly; it does not redirect it.** Same file (`app/lib/rules/types.ts`), same message
(`feat(rules): introduce Rules Engine core type contract`), same constraint (types only, no
behaviour, nothing existing touched), plus the three concepts above — roughly fifteen lines. No
adapter types, no IR types, no receipt types.

**15. Does this change the Rules Engine phase ordering?**
Barely, and deliberately so. Phase 0 gains **T0** (characterization tests over the existing importer —
cheap, additive, and easiest to write before anything moves). Translation phases T1–T5 then run after
Phase 1 and largely parallel to Phases 2–5, with **T4 pairing naturally with Phase 5's differential
corpus** so the 5e package and the 5e adapter validate each other. §31.1's conclusion stands
unchanged: the kernel plus the sheet contract is what unblocks the roadmap, and translation adds
nothing before Phase 1 beyond three type declarations and one set of tests.

**16. Is "Canonical Eldra Rules Package" a suitable compiler target for other TTRPG sources?**
As a **compiler target: yes**, and that is the defensible claim. It canonicalizes named typed values,
stored-vs-derived, targeted and phased modifiers with declared stacking, resources and tracks,
repeating collections, dice/pool/percentile resolution under one Roll Spec, progression, and choice —
every one of which appeared in at least two of the four sources researched, wearing different
clothes. As a **canonical representation of TTRPGs: no**, and the phrase should be retired. Executable
derivation, reactions, and cross-actor mechanics become scaffolds or diagnostics; fiction-first and
narrative systems resist canonicalization outright, because the part that matters is a conversation,
not a computation. The accurate term is **canonical execution format**. Practical interoperability is
the goal; a universal ontology is not, and claiming one would invite exactly the expectations §4
forbids.

**17. What claims must Eldra explicitly avoid making about compatibility?**
Never claim: that Foundry or Roll20 systems are "supported", "compatible", or "run on" Eldra; any
compatibility percentage or system count; that importing produces a playable system without review;
that translated output is equivalent to the original; that mechanics are preserved when only
structure was; that a source's licensing permits redistribution of translated output; or that
re-import is lossless. Use *translate*, *import as draft*, *scaffold*, *assisted authoring* — never
*convert*, *migrate*, *port*, or *compatible*. The honest promise is the one worth making: **Eldra
preserves as much structured work as it safely can, tells you exactly what it could not translate and
why, and hands you an implementation-ready starting point instead of a blank package.**

---

# 35B. Implementation Compatibility — revision 3 *(revision 3)*

The Modifier Pipeline shipped against revision 2. This section classifies every relevant deployed
behavior against §16 as revised. Architecture is authoritative: where the two disagree, the
implementation changes.

The condition-result rows below were **reclassified during revision 3's own review**. They were
first recorded as "correct, retained", which was wrong: retaining them would have made §16.9's
absent-field errors, §14.8's dynamic-cycle guarantee, and §28's governing principle simultaneously
unreachable. §16.11A replaces the rule; these rows record the consequences.

| Deployed behavior | Verdict | Notes |
|---|---|---|
| Source instance presence means active | **Correct, retained** | §16.8 confirms it, and §16.7 now states explicitly that `duration` never gates activation. |
| Duration does not automatically expire | **Correct, needs documentation** | Was implicit; §16.7 now gives the explicit "write `@source:duration.remaining > 0`" pattern. |
| One-pass, non-transitive suppression from the pre-suppression set | **Correct, retained** | §16.6 confirms this is intended, not an artifact. |
| Suppression reads `suppresses: string[]` | **Must change** | Now `{ sources?, tags? }` (§16.6). Breaking. |
| Inline modifier discovery from `SourceDefinition.modifiers` | **Incomplete** | Must also resolve `{ ref }` entries (§16.10). |
| Standalone modifiers ignored entirely | **Must change** | They activate by reference and inherit Source-instance provenance (§16.10). |
| Collection items never activate Sources | **Must change** | `sourceRefField` + `SourceOverlay` (§16.8). This is the largest gap. |
| `@source:` unsupported (unparseable) | **Must change** | Seventh namespace, parser + AST + validation (§16.9). |
| Unknown modifier type defaults to `stack` | **Must change** | Now a package validation error (§16.3). |
| `base`-phase modifier applied as an override | **Must be removed** | `base` is illegal for modifiers; reject at validation (§16.4). |
| Clamp modifier returns a `RulesError` | **Correct as an interim, must change** | The right call given no discriminator existed; now `clamp: "min" \| "max"` makes it implementable (§16.12). |
| Conditions evaluated after deterministic ordering | **Correct, retained** | §16.11 step 4 < 5, and now states *why*. |
| A condition evaluating to boolean `false` excludes the modifier | **Correct, retained** | Ordinary eligibility (§16.11A). This half of the rule is right. |
| A **non-boolean** condition result excludes the modifier | **Must change** | Must produce a new `RulesError` (`modifier-condition-not-boolean`) and propagate (§16.11A). There is no truthiness in EEL (§14.3). |
| A condition returning a **`RulesError`** excludes the modifier | **Must change** | The error must propagate, enriched with provenance, never read as `false` (§16.11A). |
| An **absent `@source:` field** therefore excludes the modifier | **Must change** | Consequence of the row above. §16.9's absent-field error is decorative unless the pipeline propagates it (§16.13 example 9). |
| **Unknown runtime data** (a stale `sourceRef` on an actor item) | **Incomplete** | Not attributable to a target, so it accumulates into `SourceOverlay.diagnostics` and surfaces in §27.5 rather than propagating — the one accumulating stage (§16.11A). Nothing implements it today. |
| A **runtime cycle** reached through a condition is swallowed as "not true" | **Must change** | The most serious instance: §14.8 promises cycles are visible, and the deployed rule guarantees they are not. Must abort the target, preserve `cycle-detected` and the cycle path, add provenance (§16.13 example 8). |
| Condition errors are neither memoized nor traced | **Incomplete** | Errors memoize under the same key as any value (§15.4) and emit a terminal `op: "error"` trace step (§27.1). |
| `resolveActiveModifiers` returns `ActiveModifier[]` | **Must change** | Cannot represent failure; an empty array legitimately means "nothing applies". Now `ModifierResolution` (§16.18). Breaking, two internal call sites. |
| No stacking selection (all `add` modifiers summed) | **Incomplete** | Correct for `stack`; `highest`/`lowest`/`exclusive` unimplemented (§16.11). |
| Ordering key omits `attachmentIndex` | **Incomplete** | Key is not total without it (§15.3). |
| `ActionEffect.target` excluded from the dependency graph | **Correct, retained** | §16.16 confirms, and adds that it *must* participate in reference validation — currently a gap. |
| `ModifierDefinition.id`/`.kind` optional | **Must change** | Split into `ModifierSpec` / `ModifierDefinition` (§16.10, §16.18). Breaking. |
| Modifiers applied only to `ValueDefinition` | **Correct, needs documentation** | Roll Modifiers (§16.2) remain V2; Resource modifiers await the §12.5 loader. |

---

# Appendix — Proof Packages

Three minimal packages, all original, no proprietary rules text (§30). Representative excerpts only.

## Package A — Traditional fantasy d20-style

```jsonc
{ "packageId": "eldra.proof.d20", "version": "0.1.0", "engineApiVersion": "^1.0.0",
  "semanticRoles": { "vitality": "value:vigor", "level": "value:rank" },
  "modifierTypes": [ { "id": "equipment", "stacking": "highest" } ] }
```

**Definitions**

```jsonc
{ "id": "value:might", "storage": "stored", "valueType": "number",
  "default": 10, "constraints": { "min": 1, "max": 20 }, "tags": ["attribute"] }

{ "id": "value:might.mod", "storage": "derived", "valueType": "number",
  "formula": { "text": "floor((@value:might - 10) / 2)" } }

{ "id": "value:rank", "storage": "stored", "valueType": "number", "default": 1 }

{ "id": "value:skill.climb", "storage": "derived", "valueType": "number",
  "formula": { "text": "@value:might.mod + if(@choice:trained.climb, @value:rank, 0)" } }

{ "id": "value:guard", "storage": "derived", "valueType": "number",
  "formula": { "text": "10 + @value:agility.mod" } }          // modifiers add armour

{ "id": "value:vigor", "kind": "resource", "max": { "text": "@value:rank * 6 + @value:hardiness.mod" } }

{ "id": "collection:inventory", "kind": "collection", "sourceRefField": "sourceRef",
  "itemSchema": [ { "key": "name",      "valueType": "text" },
                  { "key": "equipped",  "valueType": "boolean", "default": false },
                  { "key": "sourceRef", "valueType": "ref", "refKind": "source" } ] }

{ "id": "source:item.scaleHauberk", "kind": "source", "label": "Scale Hauberk",
  "modifiers": [ { "ref": "modifier:armour.guard" } ] }

{ "id": "modifier:armour.guard", "kind": "modifier", "target": "value:guard", "phase": "add",
  "modifierType": "equipment", "value": { "text": "2" },
  "condition": { "text": "@source:equipped" }, "label": "Scale Hauberk" }

{ "id": "roll:strike", "dice": { "text": "1d20 + @value:might.mod" },
  "selection": { "keep": "all" },
  "successRule": { "kind": "atLeast", "threshold": { "text": "@ctx:targetGuard" } } }
```

**Stored state** `{ "value:might": 16, "value:agility": 14, "value:rank": 3 }`
**Derived** `value:might.mod = 3`, `value:guard = 14`, `value:vigor.max = 20`
**Trace for `value:guard`**

```
Base                10
Agility modifier    +2   → 12
Scale Hauberk       +2   → 14   (equipment)
Total               14
```

## Package B — Percentile horror-style *(roll-under, degrees, no levels)*

```jsonc
{ "id": "value:skill.observe", "storage": "stored", "valueType": "number",
  "default": 25, "constraints": { "min": 0, "max": 99 } }

{ "id": "value:composure", "kind": "resource",
  "max": { "text": "@value:resolve * 5" } }

{ "id": "roll:observeCheck",
  "dice": { "text": "1d100" }, "selection": { "keep": "all" },
  "successRule": { "kind": "atMost", "threshold": { "text": "@value:skill.observe" } },
  "degrees": [
    { "id": "critical", "when": "@ctx:total <= floor(@value:skill.observe / 5)" },
    { "id": "hard",     "when": "@ctx:total <= floor(@value:skill.observe / 2)" },
    { "id": "regular",  "when": "@ctx:total <= @value:skill.observe" },
    { "id": "fumble",   "when": "@ctx:total >= 96" },
    { "id": "failure",  "when": "true" } ] }

{ "id": "source:condition.shaken", "kind": "source", "tags": ["condition"],
  "modifiers": [ { "target": "value:skill.observe", "phase": "add",
                   "modifierType": "condition", "value": { "text": "-20" } } ],
  "duration": { "kind": "until-rest" } }
```

Manifest declares the one modifier type this package uses (§16.3):
`"modifierTypes": [ { "id": "condition", "stacking": "stack" } ]`. Shaken is a **declared** Source
instance (§16.8) — it lives in `ActorState.sources`, not in a collection, and needs no `@source:`
condition because its mere presence is its activation.

**Stored** `{ "value:skill.observe": 55, "value:resolve": 11, "value:composure.current": 44 }`
**Derived** `value:composure.max = 55`
**Trace for `value:skill.observe` while Shaken**

```
Base (stored)       55
Shaken             -20   → 35   (condition)
Total               35
```

**Check `roll:observeCheck`, seed `a1f…`, `1d100 = 17`** → `17 <= floor(35/2) = 17` → **hard success**.
No levels, no classes, no d20 anywhere.

## Package C — Original dice-pool science-fiction *(no classes, no levels)*

```jsonc
{ "packageId": "eldra.proof.signal", "version": "0.1.0",
  "semanticRoles": { "vitality": "value:hull", "movement.speed": "value:thrust" },
  "modifierTypes": [ { "id": "gear", "stacking": "stack" } ] }

{ "id": "value:wits", "storage": "stored", "valueType": "number",
  "default": 2, "constraints": { "min": 1, "max": 6 } }

{ "id": "value:pool.systems", "storage": "derived", "valueType": "number",
  "formula": { "text": "@value:wits + @value:training.systems" } }

{ "id": "value:stress", "kind": "resource", "max": { "text": "6" } }

{ "id": "value:hull",   "kind": "resource", "max": { "text": "10 + @value:frame" } }

{ "id": "collection:rig", "kind": "collection",
  "itemSchema": [ { "key": "name", "valueType": "text" },
                  { "key": "bonusDice", "valueType": "number", "default": 0 },
                  { "key": "equipped", "valueType": "boolean", "default": false } ] }

{ "id": "source:rule.rig", "kind": "source", "label": "Equipped rig",
  "modifiers": [ { "target": "value:pool.systems", "phase": "add", "modifierType": "gear",
                   "value": { "text": "sum(@collection:rig[equipped], \"bonusDice\")" } } ] }

{ "id": "roll:systemsCheck",
  "dice": { "text": "dice(@value:pool.systems, 6)" },
  "selection": { "keep": "all" },
  "successRule": { "kind": "countAtLeast", "threshold": 5 },
  "degrees": [ { "id": "clean",   "when": "@ctx:successes >= 3" },
               { "id": "partial", "when": "@ctx:successes >= 1" },
               { "id": "botched", "when": "true" } ] }

{ "id": "action:overload", "label": "Overload the Coupler",
  "costs": [ { "resource": "value:stress", "amount": { "text": "1" } } ],
  "prerequisites": [ { "text": "@value:stress.current < @value:stress.max" } ],
  "roll": "roll:systemsCheck",
  "outcomes": [
    { "when": { "text": "@ctx:degree = \"clean\"" },   "effects": [ /* … */ ] },
    { "when": { "text": "@ctx:degree = \"partial\"" }, "effects": [ /* … */ ] },
    { "when": { "text": "true" },
      "effects": [ { "op": "adjust", "target": "value:stress.current", "by": { "text": "1" } } ] } ] }
```

**Stored** `{ "value:wits": 3, "value:training.systems": 2, "value:stress.current": 1,
"collection:rig": [ { "name": "Diagnostic Deck", "bonusDice": 1, "equipped": true } ] }`

**Trace for `value:pool.systems`**

```
Base (wits + training)   5
Equipped rig            +1   → 6   (gear)
Total                    6
```

**Action `action:overload`** — cost 1 stress validated server-side → roll 6d6 with seed → `[6,5,3,2,5,1]`
→ 3 successes at threshold 5 → degree `clean`.

**Sheet contract excerpt**

```jsonc
{ "id": "layout:default", "tabs": [
  { "id": "crew", "sections": [
    { "id": "attrs",  "layout": "grid", "columns": 2,
      "fields": [ { "value": "value:wits", "control": "stepper" },
                  { "value": "value:pool.systems", "control": "readonly", "explain": true } ] },
    { "id": "state",  "layout": "grid", "columns": 2,
      "fields": [ { "value": "value:stress", "control": "resource-bar" },
                  { "value": "value:hull",   "control": "resource-bar" } ] },
    { "id": "gear",   "layout": "collection", "collection": "collection:rig",
      "columns": ["name", "bonusDice", "equipped"] },
    { "id": "acts",   "layout": "actions", "actions": ["action:overload"] } ] } ] }
```

**All three packages use the same five primitives, the same expression language, the same modifier
phases, and the same single Roll Spec structure.** No d20 assumption, no class assumption, no level
assumption, no hit-point assumption anywhere in the engine. The architecture holds.
