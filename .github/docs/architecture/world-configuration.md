# Eldra World Configuration Architecture

Status: **Proposed (revision 1). Not implemented.** No code in this document exists in the
repository today.

Companion to [rules-engine.md](./rules-engine.md) and
[expression-language.md](./expression-language.md). Read §19 of rules-engine.md first — this
document is the concrete V1 realization of that contract, plus the four areas §19 never covered
(package selection, optional rules, default roll types, actor binding).

---

# 1. Executive Summary

The Rules Engine answers *"how does this game work?"* It is complete: parser, AST, evaluator,
modifier runtime, source overlay, roll engine, roll service, package validation — 6,937 lines under
`app/lib/rules/`, 524 passing tests. It has never been run against a real Rules Package, because
**nothing in Eldra can say which package a World uses.** There is no storage for a package, no
loader, no selection, and `@world:` — the one namespace that connects rules to a setting — parses
and then fails at evaluation with a `RulesError`.

World Configuration is the layer that answers *"which game are we playing in this world?"* It is
small. It is deliberately smaller than §19 implies, because §19 was written for a Transportation
use case that is still two milestones away, while the immediate need is far narrower: **bind a
World to a published package version, supply the settings that package declared it needs, and hand
the engine a frozen snapshot.**

The core claim:

> World Configuration owns exactly four facts about a World: **which package version is active**,
> **what the world answers for the settings that package declared**, **which of the package's roll
> types are surfaced**, and **which package-declared defaults this world overrode.** It owns no
> mechanics, defines no Values, and computes nothing.

Five decisions carry this design, and each closes an ambiguity that is currently blocking code:

1. **World is the campaign.** Campaign does not exist in this repository — eight prose mentions,
   zero schema, zero code (§2.2). Every "campaign" in rules-engine.md reads as "World" in V1. This
   is not a deferral; it is the observation that Eldra already has exactly one container and adding
   a second before Users exist would be inventing a boundary with nothing on either side of it.

2. **`@world:<kind>.<key>` is a fixed two-segment lookup.** Not arbitrary nested drilling, not an
   opaque flat key. `evaluator.ts:87-95` explicitly names this as *"a real, currently-undecided
   ambiguity"* and refuses to guess. This document decides it: exactly two segments, resolved as
   `snapshot.traits[kind][key]`. `@world:a.b.c` is a validation error; `@world:restVariant` is a
   validation error.

3. **Optional rules are world-config traits under one reserved kind, `rules`.** `@world:rules.gritty`
   is not a second mechanism — it is the §19 trait contract with an engine-reserved `kind`. One
   namespace, one resolver, one validation path.

4. **Default roll types are package-declared, never engine-declared and never Semantic Roles.**
   Semantic Roles are a *closed, engine-owned* registry (§12.4 rule 5); roll types are open and
   package-invented. Routing "Luck Roll" through the role registry would require an engine version
   bump per roll type — precisely the coupling Semantic Roles exist to prevent. `manifest.rollTypes[]`
   declares them, each pointing at a package-defined `RollSpec`; the World enables, reorders, and
   rebinds within a closed operation set.

5. **Nothing migrates.** `character_sheets` is not altered, `worlds` gains no column, the 5etools
   importer is not touched, and a World with no config row behaves exactly as it does today. The
   entire feature is additive and reversible, following the `scene_layer_objects`-alongside-`map_pins`
   precedent this team has already executed successfully.

**What I think is wrong with the framing of this task**, stated plainly since the decision standard
asks for correctness over agreeableness:

- **"Semantic role bindings, overrideable by the World" is a trap, and I recommend against it in
  V1.** A world rebinding `vitality` from the package's `value:hull` to `value:morale` is a
  mechanics change wearing a settings costume — it silently changes what token bars, damage UI, and
  death states read, with no migration story and no validation that the substitute is even the same
  type. There is no known use case. Package-owned only; adding the override later is a new optional
  field (cheap), retracting it is not (expensive).
- **World-authored roll types are not V1.** Creating a roll type means authoring a `RollSpec`, which
  means authoring a Definition, which means package editing. That is the Package Authoring
  milestone, not this one. V1 lets a World enable/disable/reorder/rebind what the package declared.
- **§19's world-config *definitions* (Road Types, currencies, calendars) should not ship in V1.**
  They exist for Transportation, which needs Phase 3 traversal that does not exist. Shipping the
  `@world:<kind>.<key>` *syntax* now with only the `rules` kind populated costs nothing and lands
  the mechanism once; shipping a `world_config_definitions` CRUD surface with no consumer is
  scaffolding.

---

# 2. Current Repo Findings

Separated into **Fact** (verified this session) and **Consequence**.

## 2.1 The Rules Engine is complete and entirely unreachable from the application

**Fact.** `app/lib/rules/` contains 19 modules totalling 6,937 lines. The only application consumer
is `app/composables/useCharacterSheetRolls.ts`, which constructs a throwaway in-memory package per
roll:

```ts
const ROLL_SPEC_ID: DefinitionId = 'roll:character-sheet.d20-check'
const ACTOR_STATE: ActorState = { actorId: 'character-sheet',
  packageId: 'eldra.character-sheet.ad-hoc', /* … */ values: {}, collections: {}, … }
```

Its own header says why: *"No RulesPackage/ActorState bridge exists yet for the D&D 5e character
sheet system."*

**Consequence.** This file is the exact shape of the hole World Configuration fills, and it is the
best available acceptance test: when a real package and a real ActorState exist, `ROLL_SPEC_ID` and
`ACTOR_STATE` both disappear.

## 2.2 Campaign does not exist

**Fact.** `grep -rniE "campaign"` across `app/` and `server/` returns **8 matches, all prose**: two
UI description strings (`admin.vue:534`, `timelines/index.vue:143`), four comments inside
`app/lib/rules/`, one dev-fixture description, and `ActorState.campaignExtensions` (a type field
with no producer). No collection, no route, no type, no schema script.

**Consequence.** §31.8's open question 1 ("Is a campaign a first-class object yet?") is answered:
no. World Configuration is world-scoped, and `campaignExtensions` stays an unpopulated reserved
field.

## 2.3 Users exist, but only as Directus identities

**Fact.** `useAuth.ts` normalizes `{id, email, first_name, last_name, role:{admin_access,
app_access}}` from `directus_users`. `worlds` carries `owner_id`. There is no Eldra user profile
collection, no character ownership, no per-world membership, no player/GM distinction.

**Consequence.** Permissions (§24), roll visibility, and secret rolls have no subject to attach to.
Everything in §J of this document is correctly deferred, and the deferral is a fact about the repo,
not a scheduling preference.

## 2.4 `@world` parses, passes reference validation, and fails only at evaluation

**Fact.** Three-layer state, verified module by module:

| Layer | File | Behavior for `@world:x.y` |
|---|---|---|
| AST | `ast.ts:50` | `ReferenceNamespace` includes `'world'` |
| Parser | `parser.ts:115` | accepts `'world'` |
| Reference validation | `reference-validation.ts:114` | `KNOWN_NAMESPACES` includes `'world'` — **passes** |
| Dependency graph | `dependency-graph.ts:35` | contributes **no edge** (documented) |
| Type validation | `type-validation.ts:36,50` | explicitly not covered |
| Evaluator | `evaluator.ts:623-628` | `RulesError`: *"not resolvable in the current runtime model"* |

**Consequence.** The work is genuinely small and precisely located. A package may already ship
`@world:` expressions that validate cleanly and then fail at runtime — which is the single most
important thing this milestone fixes. Note the asymmetry: reference validation *accepts* `@world:`
today, so nothing warns an author before publication.

## 2.5 The evaluator refuses to guess `@world` semantics, and says so

**Fact.** `evaluator.ts:87-95`:

> *"resolving `@world:roadType.speedFactor` would require deciding whether the path means
> nested-object drilling (`world.roadType.speedFactor`) or a flat key (mirroring how
> `value:might.mod` is one flat DefinitionId, not `.mod` drilling into `might`) — a real, currently-
> undecided ambiguity, not a gap in this commit's effort."*

**Consequence.** §F of this document exists specifically to close this. `WorldConfigSnapshotRef` and
`ActorStateRef` are `Record<string, any>` in `types.ts:261-262` for the same reason and get real
shapes here.

## 2.6 `systemKey` is decorative, exactly as §2.3 of rules-engine.md claimed

**Fact.** `worlds.system_key` is read in two places for display (`index.vue:107`), and
`app/lib/systems/index.ts` uses it to look up entity *block schemas*. Every importer hardcodes
`systemKey: 'dnd5e'`. Nothing branches on it mechanically.

**Consequence.** `system_key` must not be repurposed as the package selector. It is an entity-block
concern with live consumers; overloading it would couple content authoring to rules binding. World
Configuration gets its own storage.

## 2.7 There is already a world-scoped keyed-config precedent

**Fact.** `world_page_presentations` (`presentation/[pageKey].get.ts:56`) stores per-world,
per-key configuration in its own collection keyed by `world_key` + `page_key`, rather than as
columns on `worlds`.

**Consequence.** This is the pattern to follow, and it is the direct argument against adding
`rules_package_id` to `worlds`.

## 2.8 The legacy character sheet shape is small, regular, and mappable

**Fact.** `character_sheets` (from `scripts/directus/create-character-sheet-schema.mjs:247-302`):

- Envelope: `world_id`, `entity_id`, `sheet_type`, `name`, `level`, `is_active`, `visibility`
- 5e nouns: `class_name`, `subclass_name`, `species_name`, `background_name`, and their
  `*_entity_id` counterparts
- JSON: `ability_scores`, `combat_stats`, `proficiencies`, `resources`, `spellcasting`, `features`,
  `notes`, `choices`

`ability_scores` defaults to `{str,dex,con,int,wis,cha}` (all `10`); `combat_stats` defaults to
`{armorClass, maxHp, currentHp, tempHp, initiative, speed, hitDice, deathSaves:{successes,failures}}`
(`character-sheets.ts:188-213`).

`character_sheet_inventory`: `sheet_id`, `item_entity_id`, `name`, `quantity`, `equipped`,
`attuned`, `container`, `notes`, `sort`, `data`.

**Consequence.** The bridge in §G is a genuinely small pure function, and `equipped` maps directly
onto §16.8's collection-item source activation. This is the strongest evidence that the Character
Sheet bridge is tractable without touching `sheet.vue`.

## 2.9 Directus collections in use today

**Fact.** From `grep -rhoE "/items/[a-z_]+" server/`: `app_settings`, `articles`,
`block_instances`, `character_sheet_inventory`, `character_sheet_inventory_transfers`,
`character_sheets`, `entities`, `entity_actions`, `entity_relationships`, `entity_statblocks`,
`eras`, `events`, `map_pins`, `maps`, `monster_profiles`, `world_page_presentations`, `worlds`
(plus `scene_layer_objects` via `server/utils/scene-layer-objects.ts`).

`worlds` fields: `id`, `name`, `slug`, `system_key`, `description`, `visibility`, `owner_id`.

**Fact.** `rules_packages`, `actor_rules_state`, `world_rules_config`, and every other collection
named in §21 of rules-engine.md **do not exist** — zero matches outside the architecture docs.

## 2.10 A realtime transport precedent exists, and it is in-process only

**Fact.** `server/utils/inventory-transfer-realtime-bridge.ts` maintains an SSE client map on
`globalThis.__eldraInventoryTransferLocalEventBus`, keyed by `worldId`/`sheetId`/`entityId`.

**Consequence.** When Chat arrives it has a working precedent — and a known limitation: a
`globalThis` bus is single-process and does not survive horizontal scaling. Worth naming now so
Session Runtime does not inherit it by accident.

## 2.11 Game Admin already has a home

**Fact.** `app/pages/worlds/[id]/admin.vue` has a tab set: `overview`, `party`, `grants`,
`homebrew`, `setup`, `transfers`, `relationships`.

**Consequence.** The Rules admin surface is a **new tab in an existing page**, not a new page —
consistent with CLAUDE.md's "evolve existing systems rather than introducing parallel
implementations."

---

# 3. Proposed V1 World Configuration Model

## 3.1 The four facts

A World's configuration is exactly:

```
World Rules Config
├── binding        which (packageId, version) is active, + integrity witness
├── settings       values for the traits the package declared it needs   → @world:
├── rollTypes      which package-declared roll types are surfaced, where, and bound to what
└── overrides      the closed set of package defaults this world changed
```

Plus one derived, never-stored artifact:

```
WorldConfigSnapshot   frozen at EvaluationSession construction, the sole backing of @world:
```

## 3.2 The boundary, restated for V1

| Question | Owner |
|---|---|
| Which package/version is active | **World Configuration** |
| What `@world:rules.gritty` evaluates to | **World Configuration** (value) / **Rules Package** (declaration + meaning) |
| Which roll types appear on the sheet | **World Configuration** (selection) / **Rules Package** (definition) |
| What a roll type *does* | **Rules Package** |
| Which Value plays `vitality` | **Rules Package** (V1 — not overrideable) |
| Sheet layout | **Rules Package** (§18.2 / ADR-007) |
| Sheet visuals, components, theming | **Eldra Core** |
| Setting vocabulary (Road Types, currencies) | **World Configuration** — *V2, deferred* |

**One-way, always:** rules read world config; world config never reads rules. (ADR-006, unchanged.)

## 3.3 Absence is a legal, meaningful state

A World with no `world_rules_config` row is **unconfigured**, and unconfigured is not an error. It
means: no package is active, no `@world:` reference can be evaluated (any attempt is a `RulesError`,
as today), the Rules Engine is not in the request path, and the legacy character sheet works exactly
as it does now.

This is what makes the whole milestone additive and reversible, and it is the answer to "what
happens to Sam's existing worlds": nothing.

---

# A. World vs Campaign vs Rules Package

1. **One active Rules Package per World in V1?** **Yes.** §11.6 unchanged: one container, one
   package, one pinned version. Two packages defining `value:strength` have no principled
   resolution.

2. **Can a World switch packages after creation?** **Yes, with a hard gate.** Free while no
   `actor_rules_state` row exists for that World. Once any actor is bound, switching to a *different
   `packageId`* requires an explicit, typed, confirmed **Reset Rules State** action that deletes
   every `actor_rules_state` row for the World and is refused unless the operator types the World
   name. Switching to a *different version of the same `packageId`* is a migration (§25), deferred.

   This deliberately diverges from §31.8 Q4's "no in V1" recommendation, for a repo-grounded reason:
   there are zero real packages today, so the first months of use *are* package churn. Forbidding
   the switch would force World deletion as the workaround — strictly more destructive than the
   gated reset.

3. **Is Campaign separate in the current repo?** **No.** Verified: 8 prose mentions, no schema, no
   code (§2.2).

4. **Should World Configuration be world-scoped for V1?** **Yes**, with `world_id` as a plain
   integer column. No polymorphic `scope_kind`/`scope_id` pair. If Campaigns arrive (roadmap 2.1),
   the migration is one added column and a backfill on a table holding roughly one row per World —
   cheap and bounded. Polymorphism now is theoretical flexibility with a concrete cost.

5. **Where does package selection live?** `world_rules_config.active_package_id` +
   `active_package_version`. **Not** on `worlds` (§2.7 precedent, and config needs its own version
   counter and JSON sections).

6. **What happens to existing characters when the active package changes?** Legacy
   `character_sheets` rows are untouched and unaffected — they reference no package. `actor_rules_state`
   rows are the only package-bound data, and they are governed by the gate in (2).

7. **Multiple active packages?** **No.**

8. **Deferred to V2?** **Yes** — `manifest.dependencies` stays rejected-if-non-empty (§11.5).
   `manifest.modules` covers the realistic need ("this world doesn't use psionics") at a fraction of
   the cost, and ships in V1.

9. **Interaction with the existing entity/character sheet model?** The **Entity remains the
   identity.** A character is an `entities` row; `character_sheets` is its legacy 5e projection;
   `actor_rules_state` is its canonical rules projection, added *alongside*, keyed by `entity_id`.
   Both may exist simultaneously and disagree — the sheet decides which it reads, per-panel, during
   the Character Sheet V2 migration. This is `scene_layer_objects` alongside `map_pins`, again.

10. **The smallest V1 that supports real gameplay?** See §18 PKR-1. In one line: *a published
    package in Directus, a config row pinning it, `@world:` resolving, and the sheet's roll buttons
    reading `rollTypes` instead of a hardcoded constant.*

---

# B. Rules Package Installation and Selection

1. **Canonical storage model for V1: Directus `rules_packages`, per §21.1.** Not JSON files on
   disk, for a decisive repo-grounded reason: **the production container ships only `.output`** — no
   `package.json`, no `scripts/`, no source (CLAUDE.md Deployment Checklist). A disk-backed package
   directory would be unreachable in production. Repo-committed JSON under `packages/` is
   *authoring source material* only; the runtime reads Directus exclusively.

2. **Validation at import time, selection time, or both? Both, asymmetrically.**
   - **Import/publish:** full `validatePackage(manifest, definitions)` — already implemented. Errors
     block publication; warnings do not.
   - **Activation:** compatibility only — `status === 'published'`, `engineApiVersion` satisfied by
     the running engine, `integrity` matches the stored hash. Re-running full validation is
     redundant because published releases are immutable (§25.2).

3. **Invalid packages: stored as drafts.** A failed import produces a `draft` row with its
   `PackageValidationIssue[]` persisted alongside. Drafts are never activatable and never
   evaluatable (§11.8). Nothing is silently discarded.

4. **Version identification:** semver `version`, unique on `(package_id, version)`.

5. **Multiple versions coexist? Yes** — required for pinning and rollback.

6. **What does a World reference? `(package_id, version)`** — the immutable release identity. Not a
   database row id (which would break if a row were ever recreated), not an embedded snapshot copy
   (which would create a second source of truth). The config row also stores `active_package_integrity`
   as a **witness, not a key**: a mismatch on load is a loud error, never a silent divergence.

7. **Rollback:** repin to the prior `(package_id, version)`. Old releases are immutable and still
   present, so rollback is always available (§25.4). V1 rollback is only safe while
   `stateSchemaVersion` is unchanged between the two versions; otherwise it needs §25's migration
   tooling and is refused.

8. **Minimal loader:**

   ```
   server/utils/rules-packages.ts
     loadPublishedPackage(packageId, version) → { manifest, definitions } | RulesPackageLoadError
   ```

   In-process LRU cache keyed by `(packageId, version, integrity)` — safe precisely because releases
   are immutable (§21.6). **Must use `directusServiceRequest` from `server/utils/directus.ts`, not a
   16th copy of `dxFetch`** — §21 says so explicitly and CLAUDE.md flags the duplication as debt.
   This is new code with no legacy excuse.

9. **Explicitly deferred:** package composition/`dependencies`, `capabilities` (must stay empty —
   §23.4), the self-test runner (§26.3), migration execution (§25), export, signing/trust tiers
   (§22.5), and re-import (§22A.11).

---

# C. Semantic Roles

1. **Package-owned, not world-overrideable in V1.** Reasons in §1. The manifest field
   (`semanticRoles`) already exists in `types.ts:621` and is already validated.

2. **Can a World override package `semanticRoles`? No.** Revisit when a real use case appears;
   adding an optional `roleOverrides` map later is non-breaking.

3. **Roles required for V1: none by the engine** (§12.4 rule 1 — a narrative package binding zero
   roles is valid). A **recommended set** drives visible degradation notices in Game Admin:
   `vitality`, `level`, `identity.name`, and (proposed below) `inventory`.

   On the examples this task raised, and why most are *not* roles:

   | Candidate | Decision | Why |
   |---|---|---|
   | primary ability scores | **Not a role** — use `ValueDefinition.tags` | A role maps to *one* `DefinitionId`; "the ability scores" is a set. The tier-1 generated sheet (§18.3) groups by tag, which already exists (`types.ts:311`). |
   | guard / defense | **Not a role in V1** | No Eldra core subsystem consumes it until combat (3.0). Adding an unconsumed role is vocabulary growth with no reader. |
   | initiative | **Already exists** | `SemanticRole` includes `'initiative'`. |
   | health / current resource | **Already exists** | `'vitality'`. |
   | default roll types | **Not a role** — see §D | Open, package-invented vocabulary; the role registry is closed and engine-owned. |
   | inventory collection | **ADD `'inventory'`** | The sheet and the existing inventory-transfer system need to know *which* Collection is the inventory. Maps to one `DefinitionId` (a `CollectionDefinition`). This is the one genuine gap. |
   | equipped state field | **Not a role** — already structural | `CollectionDefinition.sourceRefField` (§16.8, `types.ts:357`) already names the activation field. A role would duplicate it. |

   **Net change to the closed registry: exactly one addition, `inventory`.** Per §12.4 rule 5 this
   is a minor engine version bump and cannot break existing packages, because binding is optional.

4. **How does the Character Sheet use roles?** Only for *chrome*, never for math: the HP bar reads
   `vitality`, the level-up affordance reads `level`, the inventory panel reads `inventory`, cards
   and tokens read `identity.name`. The legacy 5e sheet ignores all of this and keeps its own math.

5. **Unbound role?** Visible degradation, never an error (§12.4 rule 3): the feature is absent and
   the Rules admin tab lists it under **Binding gaps** with the reason.

6. **Where is role validation owned?** Split, and the split already exists in code:
   - *Does the role's target resolve to a real definition?* → **Package Validation**
     (`validateSemanticRoles`, already implemented and already composed into `validatePackage`).
   - *Is a role that a subsystem wants unbound?* → **World Configuration validation**, as a
     **warning** surfaced in admin. Never blocks activation.

7. **Imported packages?** Adapters may emit role bindings — §22A.8 observes that Foundry Simple
   Worldbuilding's `primaryTokenAttribute: "health"` *is literally a `vitality` binding*. Roles left
   unbound after translation become reconciliation tasks, not errors.

---

# D. Default Roll Types

The governing constraint, from the Roll Service commit: *"Do not hardcode: Luck Roll, Initiative,
Death Saves, Attack Rolls. The Roll Service executes RollSpecs only."* That invariant holds
completely — nothing below teaches the engine any roll's name.

1. **Declared in `manifest.rollTypes[]`** — package-declared. The World selects and surfaces.

2. **Semantic roles, a separate table, or both? A separate declaration — explicitly not roles.**
   Semantic Roles are a *closed registry versioned with the engine* (§12.4 rule 5). Roll types are
   inherently open ("Morale Check", "Luck Roll", "Corruption Test"). Routing them through the role
   registry would mean an engine version bump per roll type — exactly the coupling roles exist to
   prevent. They are also not *capability discovery*: the engine never needs to know a Luck Roll
   exists, only the UI does.

3. **Does each roll type reference a `RollSpec` `DefinitionId`? Yes — mandatory.** This is the whole
   mechanism. `rollSpec` must resolve to a `kind: 'roll'` definition, checked by Package Validation.

4. **Can Game Admin create custom roll types? Not in V1.** Creating one means authoring a `RollSpec`,
   which means authoring a Definition, which is the Package Authoring milestone. V1 admin can
   enable, disable, reorder, and rebind.

5. **Can a World override package defaults? Yes — within a closed operation set**, in the exact
   spirit of ADR-012:
   - `enabled: boolean` — surface it or not
   - `order: number` — presentation order
   - `rollSpec: DefinitionId` — rebind to a **different package-declared** `RollSpec`
   - `visibility` — override the spec's default broadcast policy (inert until §J)

   Explicitly **not** permitted: authoring a new roll type, editing a `RollSpec`, or supplying an
   expression.

6. **How does a future GM toolbar discover them?** `surfaces` includes `'gm-toolbar'`. The toolbar
   reads resolved config; it never reads the package directly.

7. **How do Character Sheets discover them?** `surfaces` includes `'sheet'`. This is what replaces
   `useCharacterSheetRolls.ts`'s hardcoded `ROLL_SPEC_ID`.

8. **How does this stay system-agnostic?** The engine never reads `rollType.id`. It executes
   `rollType.rollSpec` through the existing `requestRoll`. IDs and labels are display and config
   keys only. A percentile horror package and a dice-pool SF package declare their own roll types
   with no engine change — the Appendix proof packages already prove the `RollSpec` side.

9. **V1 vs V2.**
   - **V1:** declaration, validation, world selection/override, sheet + toolbar discovery.
   - **V2:** admin-authored roll types, roll-type inputs/parameters (e.g. "choose a DC"), per-actor
     roll types, roll types on non-character entities.

**Luck Roll, concretely:**

```jsonc
// Rules Package — definitions/rolls/luck.json
{ "id": "roll:luck", "kind": "roll",
  "dice": { "text": "1d20" },
  "successRule": { "kind": "none" } }

// Rules Package — manifest.rollTypes[]
{ "id": "luck", "label": "Luck Roll", "rollSpec": "roll:luck",
  "surfaces": ["gm-toolbar", "sheet"], "visibility": "public" }

// World — world_rules_config.roll_types
{ "luck": { "enabled": true, "order": 3 } }
```

Zero engine knowledge of luck. A world that doesn't want it sets `enabled: false`.

---

# E. Optional Rules

1. **Declared in `manifest.optionalRules[]`.** The package declares key, type, label, default, and
   allowed values; the World supplies the chosen value.

2. **Shape: typed — `boolean | number | enum`.** Not arbitrary config, not free-form JSON. This
   mirrors `ValueDefinition.valueType` discipline and is what makes both sides validatable. An
   `enum` declares its `options`; a `number` may declare `min`/`max`.

3. **Can Rules Expressions read them? Yes — that is the primary consumer.** An optional rule nobody
   reads is a settings row with no effect.

4. **Does this use `@world`? Yes**, under the engine-reserved kind `rules`:
   `@world:rules.<optionalRuleKey>`. This is not a second mechanism — it is §19's trait contract
   with a reserved `kind`, which is exactly the shape this task's own example (`@world:rules.flanking`)
   already implies. One namespace, one resolver, one validation path.

5. **V1 shape of `@world` access:** §F.

6. **Validation responsibility.** This splits cleanly, and the `rules` half is unusually strong
   because *both sides live in the package*:
   - `manifest.optionalRules[]` well-formedness (unique keys, type/`options`/`default` coherence,
     no collision with a real world-config kind) → **Package Validation**.
   - `@world:rules.X` references a **declared** optional rule → **Package Validation**. This is a
     genuinely closed check and should be added — it catches typos before publication.
   - The World's supplied value matches the declared type and `options` → **World Config
     Validation**.

7. **Effect on caches and existing actor state.** Changing an optional rule bumps
   `world_config_version`, which changes `contextHash`, which means every subsequently constructed
   `EvaluationSession` is a new one. **No actor state changes** — optional rules are read at
   evaluation, never written into stored state (§13.2). Existing in-flight sessions are immutable
   snapshots and finish on the old value. See §K.

8. **Per-world, campaign, scene, or character in V1? Per-world only.** Narrowest coherent model.
   Per-scene is a Scene Graph concern with no rules consumer yet; per-character would make an
   optional rule an actor value, which is what `custom` (§13.5) already is.

---

# F. `@world` and Evaluation Context

This section closes the ambiguity `evaluator.ts:87-95` refused to guess at.

1. **Is `@world` backed by World Configuration? Yes, exclusively.** `EvaluationContext.world` is a
   `WorldConfigSnapshot`, produced by World Configuration resolution and injected at session
   construction. There is no other producer.

2. **Valid syntax: exactly `@world:<kind>.<key>` — two segments, always.**

   ```
   @world:rules.flanking          ✓   optional rule (reserved kind)
   @world:rules.restVariant       ✓
   @world:calendar.currentSeason  ✓   world-config trait (V2 data, V1 syntax)
   @world:roadType.quality        ✓   §19's own example
   @world:restVariant             ✗   one segment — no kind, no home in the §19 data model
   @world:a.b.c                   ✗   three segments
   ```

   **Rationale.** §19's entire contract is `{kind, traits}`. A one-segment reference has no `kind`,
   so there is nowhere in the data model for it to resolve. Fixing the depth at two makes resolution
   total, makes the `rules` reservation natural, and — critically — means the answer is **neither**
   of the two options the evaluator comment posed: not arbitrary nested drilling, and not a flat
   opaque key, but a fixed two-level lookup.

3. **Path-based or flat? Fixed depth 2**, resolved as `snapshot.traits[kind][key]`. `kind` and `key`
   each follow the existing single identifier grammar (`[a-zA-Z_][a-zA-Z0-9_]*`,
   expression-language.md §8.4 / §10) — no new grammar.

4. **Value types: `number | text | boolean` only.** No lists, no `ref`, no `diceSpec` in V1. Lists
   are excluded for a concrete language reason: EEL has no membership function, which is exactly why
   expression-language.md §8.1's revision-3 note had to retract a `tags`-based filter example as
   never-satisfiable. Adding list traits before adding a membership function would repeat that
   mistake.

5. **Static for a session? Yes — frozen at construction.** Same discipline as `sourceOverlay`, which
   `EvaluationSession` already builds exactly once in its constructor (design decision 7). A trait
   cannot change mid-evaluation, so memoized values can never be stale within a session.

6. **Missing key — three distinct cases, deliberately different:**

   | Case | Result |
   |---|---|
   | Declared in `requiredTraits` with a `default`, world supplies nothing | **Use the default; record a Binding Gap** (§19.3) |
   | `@world:rules.X` where `X` is not a declared optional rule | **Package Validation error** — never reaches runtime |
   | `@world:<kind>.<key>` where the trait is not declared in `requiredTraits` | **`RulesError`** at evaluation |

   The third case is deliberately *not* a type-appropriate zero. §14.4's "no null, every value has a
   zero" governs *unset Values*; an undeclared reference is an authoring error, and an undeclared
   `@value:` is already a reference-validation error today. Silently returning `0` for an undeclared
   trait would produce a wrong number a player sees — the outcome §28 exists to prevent.

7. **How are `@world` keys validated?**
   - `rules.*` → **Package Validation** (closed: both declaration and reference are in the package).
   - `<kind>.<key>` → **Package Validation** checks the reference is declared in
     `manifest.requiredTraits`; **World Config Validation** checks the world supplies it or a default
     exists, emitting a Binding Gap otherwise.
   - Reference validation should additionally **reject wrong-arity `@world:` paths** (one or three+
     segments). It currently accepts anything, because `'world'` is in `KNOWN_NAMESPACES` (§2.4).

8. **Which module owns resolution?** New `app/lib/rules/world-config.ts` — pure, no I/O: the
   snapshot type, `resolveWorldConfig()`, `validateWorldConfig()`, and the lookup the evaluator
   calls. Server-side loading lives in `server/utils/world-rules-config.ts`. This keeps §21.6's rule
   intact: **Directus is never in the evaluation path.**

9. **Does `@world` create dependency graph edges? No.** A trait is a session constant, not a
   definition — there is no node to point at and nothing to invalidate within a session.
   `dependency-graph.ts:35` already documents that non-`value`/`collection` namespaces contribute no
   edges; this decision confirms that behavior rather than changing it.

10. **Cache keys:** `worldConfigVersion` participates in `contextHash`. See §K.

---

# G. Character Sheet Bridge

The governing constraint is CLAUDE.md's: `sheet.vue` is ~8,900 lines, under active churn, and is the
roadmap's #1/#2 priority. **This milestone does not refactor it.** It adds one read-only projection
and replaces one hardcoded constant.

1. **Should Character Sheet V1 be driven by semantic roles?** **No for the existing 5e sheet; yes
   for the generated sheet.** The existing sheet keeps `character-sheet-math.ts` untouched. Roles
   drive only new chrome, and only where a role is bound.

2. **Does the Rules Package define sheet layout? Yes** — §18.2 / ADR-007: structure, semantics, and
   layout intent. Never markup.

3. **Does World Configuration define sheet layout? No.** Layout is a rules concern, not a setting
   concern. World Configuration has no layout field, in V1 or V2.

4. **Is layout deferred to Game Admin?** Only tier 3 (user reordering/hiding, §18.3), which is V2.
   Tier 1 (auto-generated) is what makes a new package usable on day one and is the only tier this
   milestone needs.

5. **The smallest bridge:** one pure function, one file.

   ```
   server/utils/character-sheet-actor-state.ts
     characterSheetToActorState(sheetRow, inventoryRows, manifest) → ActorState
   ```

   **Read-only and one-way.** Legacy → `ActorState`, never the reverse. It writes nothing, migrates
   nothing, and deleting the file restores the status quo exactly. It is 5e-package-specific by
   construction and therefore belongs in `server/utils/` (a package-adapter concern), not in
   `app/lib/rules/` (the system-agnostic engine).

6. **Legacy field mapping.** Package definition IDs shown are the starter package's; the mapping
   table lives with the adapter, not in the engine:

   | Legacy | → `ActorState` | Note |
   |---|---|---|
   | `ability_scores.{str…cha}` | `values['value:str' …]` | Direct; stored |
   | `level` | `values['value:level']` | Stored; binds the `level` role |
   | `combat_stats.currentHp` | `values['value:hp.current']` | Stored — a genuine user decision (§13.3) |
   | `combat_stats.maxHp` | `values['value:hp.max']` | **Honest gap:** legacy *stores* this; the package should *derive* it. V1 carries it as stored and flags it. Resolving this is Character Sheet V2 work. |
   | `combat_stats.tempHp`, `speed`, `armorClass` | `values[…]` | Stored in V1, same caveat |
   | `combat_stats.deathSaves` | *not mapped* | Needs a package-declared Resource; deferred |
   | `choices` | `choices` | Direct — same concept, same shape |
   | `proficiencies` | `choices` | Proficiency is a resolved choice, not a Value |
   | `character_sheet_inventory` rows | `collections['collection:inventory']` | See (7) |
   | `spellcasting`, `features`, `notes` | *not mapped* | Needs Progressions/ChoiceSets, which `types.ts` deliberately does not model yet |

   The unmapped rows are the honest measure of the gap: the bridge covers stats, level, HP, choices,
   and inventory — enough for checks, saves, skills, and equipment modifiers, which is exactly what
   the sheet's roll buttons and AC need.

7. **Inventory collections.** Each `character_sheet_inventory` row becomes a
   `CollectionInstanceItem` with `instanceId` = the row id (stable across reordering — `sort` is a
   separate field), plus `name`, `quantity`, `equipped`, `attuned`, `container`, and a `sourceRef`
   derived from `item_entity_id`. The starter package declares
   `sourceRefField: 'sourceRef'`, so **every item with a resolving `sourceRef` activates a Source
   instance** via §16.8 Path 2. "Only while equipped" is then the modifier's own
   `condition: { text: "@source:equipped" }` — which is §16.13's worked example 1, verbatim.

8. **How are Source instances derived?** Two paths, per §16.8: collection-derived (above, works
   today) and declared (`ActorState.sources`). **Legacy has no conditions store**, so the bridge
   emits `sources: []`. Active conditions become available when `actor_rules_state` exists — that is
   the first thing canonical state buys that the bridge cannot.

9. **How should sheet roll buttons discover RollSpecs?** From resolved World Config `rollTypes`
   filtered to `surfaces` containing `'sheet'`. This deletes `ROLL_SPEC_ID` and the ad-hoc in-memory
   package from `useCharacterSheetRolls.ts` and replaces them with the real registry, graph, and
   `ActorState` from the bridge. **This is the single highest-value integration in the milestone**:
   it is small, it is visible, and it turns the completed Roll Engine into something a player
   actually touches.

10. **What can remain legacy?** Everything else, indefinitely. §31.8 Q3's recommendation — *a
    long-lived adapter is acceptable* — is adopted. The sheet leaves legacy math **panel by panel**,
    each behind the bridge, never in one cutover.

---

# H. Game Admin

1. **Minimum surface before real use — one new tab** in `app/pages/worlds/[id]/admin.vue`
   (`{ key: 'rules', label: 'Rules', icon: 'i-lucide-scale' }`), containing:
   - Active package + version, with the activation gate from §A.2
   - Installed package list (global) with `status` and validation summary
   - Validation results: `PackageValidationIssue[]` grouped by severity, each with `definitionId`
     and `message` (the type already carries exactly these — `types.ts:648`)
   - Optional rules editor, generated from `manifest.optionalRules[]` declarations
   - Roll types: enable / disable / reorder / rebind
   - **Binding gaps** and **unbound recommended roles**, read-only, with reasons

2. **What can wait:** package authoring/editing, migration and upgrade UI, import history browsing,
   the reconciliation workspace (§22A.7), per-definition diffs, the self-test runner, homebrew
   override editing, trace/explain inspection.

3. **Edit Rules Packages directly, or create World Overrides? World Overrides only.** A published
   package is immutable (§25.2); an editable one is a `draft`, and V1 has no draft editor. This is
   not a limitation to apologize for — it is what makes rollback and pinning meaningful.

4. **Drafts:** created by import, carrying their validation issues. Editable in V1 only by
   re-importing (replace-in-place while `draft`). Publication is the validating transition and is
   irreversible.

5. **Validation errors shown** grouped by severity, then by `definitionId`, with the message
   verbatim. Warnings never block. The one warning that already exists — an unattached standalone
   modifier (§16.10 decision 6, "dead content, not incorrect content") — should read as an advisory,
   not a defect.

6. **Safest import workflow:**
   ```
   upload → parse → validatePackage → show diagnostics
     → [errors]  stop; keep as draft
     → [clean]   publish (compute integrity) → install
     → activation is a SEPARATE, explicit action, never automatic
   ```
   Never auto-activate. Never auto-publish.

7. **Can a user manually edit generated definitions? Not in V1.** V2, in the reconciliation
   workspace, which §11.7 correctly identifies as the first real authoring UI.

8. **How are local/homebrew changes preserved across re-import?** V1 **does not support re-import**
   — you install a new version and repin. This is the honest answer: three-way merge (§22A.11)
   requires receipts, which requires the translation milestone. Saying "re-import is safe" before
   that machinery exists is exactly how §31.11's predicted data loss happens.

   Note that Eldra's existing **homebrew system is world-scoped content** (`server/utils/homebrew/`,
   filtered by `world_id`, producing `entities`) — it is *content*, not *mechanics*, and per ADR-018
   the two import independently. Homebrew is unaffected by this milestone.

---

# I. Importers and Translation

1. **Does World Configuration know about source adapters? No.**
2. **Does it know only about native Rules Packages? Yes** — it stores `(package_id, version)` and
   nothing else about provenance. `manifest.origin` travels inside the package (§11.9) and is
   display-only.
3. **Where are import receipts stored?** A future `rules_package_receipts` collection, keyed by
   package, **outside** the package (§22A.3 / ADR-013). **Deferred** — V1 stores `manifest.origin`
   only, which is the five fields that survive publication.
4. **How does a World choose between imported package versions?** Identically to any other version:
   pin `(package_id, version)`. Translation provenance never affects selection.
5. **How are homebrew overrides layered?** Through the closed World Override set (§21.5 / ADR-012) —
   never by mutating a package.
6. **How does re-import avoid destroying local work?** It doesn't yet, and V1 does not offer it
   (§H.8).
7. **V1: nothing changes.** The existing 5etools importer (`app/lib/importers/*`,
   `server/api/import/**`) is **not touched**. It imports content entities and writes `import_source`
   blocks with `provider`/`external_id`/`source_book`/`source_page`/`source_url` — verified present
   and populated. Per ADR-018, content and mechanics import independently, so nothing about this
   milestone requires the content importer to move first.

The current docs are consistent here; nothing in §22A needs redesign.

---

# J. Users, Sessions, Multiplayer, and Chat

1. **Where does Chat belong? A future Session Runtime subsystem** — not World Configuration, not the
   Rules Engine. World Configuration's *only* involvement is holding default roll **visibility**
   policy, and even that is inert until there is someone to hide a roll from.

2. **Prerequisites, all verified absent:**
   - **Users beyond Directus identities** — no profile, no membership, no player/GM distinction
     (§2.3)
   - **Ownership** — no character or world ownership model (roadmap 2.1)
   - **Sessions and presence** — no concept of "who is at the table right now"
   - **A multi-process-safe transport** — the SSE precedent
     (`inventory-transfer-realtime-bridge.ts`) uses a `globalThis` client map, which is
     single-process only (§2.10)

   Without identity there is no addressee, no visibility model, and no meaningful persistence
   semantics for a message. A chat built now would be a log, and it would have to be replaced.

3. **How do RollEvents eventually flow to Chat?** The shape is already right and already
   deterministic:
   ```
   requestRoll(request) → RollEvent{ eventId, rollSpecId, actorId, ok, seed, result }
         → SessionRuntime.publish(RollEvent, visibility)
         → subscribers (chat log, 3D dice, GM panel)
   ```
   `EldraDiceBox` is already a `RollEvent` consumer that generates no randomness of its own, so Chat
   becomes the *second* consumer of an existing contract rather than a new representation. That was
   the point of the paused Chat commit, and it survives intact.

4. **Roll visibility:** `public | gm | self | blind`.

5. **Who owns default visibility? The `RollSpec` declares it; the World's roll-type entry may
   override it.** Two levels, not three. Note this is a **different vocabulary** from §24.3's
   `Visibility` (`public | owner | gm`), which classifies *data*. Broadcast policy and data
   classification are different concerns and must not be collapsed into one enum — `blind` (rolled
   now, revealed later) has no meaning as a data classification.

6. **Deferred:** everything else in this section. The one thing to do *now* is nothing — which is
   itself the decision.

---

# K. Cache and Invalidation

1. **Which config changes require invalidating caches?**

   | Change | Invalidates |
   |---|---|
   | `active_package_id` / `active_package_version` | Everything — different registry and graph |
   | Optional rule value | All derived values (any may read `@world:rules.*`) |
   | World-config trait value | All derived values |
   | Roll type enable/order/rebind | **Nothing** — presentation only, never read during evaluation |
   | Binding resolution | All derived values (it changes a resolved trait) |

2. **Are EvaluationSessions immutable snapshots? Yes** — and this is already true in the
   implementation rather than a new requirement: the session holds one `ActorState`, one
   `EvaluationContext`, and a `sourceOverlay` built exactly once in the constructor. This document
   formalizes it: **a session never observes a configuration change.**

3. **Does changing World Configuration create a new `contextHash`? Yes**, via
   `worldConfigVersion`.

4. **How do `actorStateVersion` and `worldConfigVersion` interact?** As independent dimensions of
   the §15.4 compound key. They must stay separate: editing one character must not invalidate every
   other character's cached values, and flipping a world setting must invalidate all of them.

5. **Future cache key:**
   ```
   (packageId, packageVersion, worldConfigVersion, actorId, actorStateVersion, purpose, tagsHash)
   ```
   `seed` is excluded deliberately — it affects rolls, never derived values (§15.6: *"rolls only"*).

6. **V1: one integer column, and nothing else.** `world_rules_config.world_config_version`,
   monotonically incremented on every write. No hashing, no cross-session cache, no changes to
   `EvaluationSession` — sessions remain per-request, so the existing per-session memo cache is
   already correct. The column exists **so that a future cross-session cache has something to key
   on**, which is the cheapest possible way to avoid a retrofit.

---

# 5. Data Model Sketch

Following §21's pattern — *fixed envelope columns + typed JSON sections + one translation module* —
and the `world_page_presentations` precedent for world-scoped config.

## 5.1 `rules_packages` (new, global) — §21.1

| Column | Type | Why a column |
|---|---|---|
| `id` | uuid | PK |
| `package_id` | string | Queried, joined |
| `version` | string | Queried, pinned |
| `status` | string | `draft` \| `published` — filtering |
| `engine_api_version` | string | Compatibility filtering |
| `state_schema_version` | integer | Migration decisions |
| `title` | string | Listing UI |
| `integrity_hash` | string | Verification; identity when published |
| `license_id` | string | Compliance surfacing (§30) |
| `created_at` | timestamp | |
| `manifest` | json | Whole manifest |
| `definitions` | json | All definitions incl. compiled ASTs |
| `layouts` | json | §18 |
| `validation_issues` | json | `PackageValidationIssue[]` from the last validation |

Unique on `(package_id, version)`. Published rows are **never updated**.

`migrations` (§21.1) is omitted from V1 — there is no migration executor, and an unread column
invites the assumption that one exists.

## 5.2 `world_rules_config` (new, world-scoped) — the World Configuration home

| Column | Type | Why |
|---|---|---|
| `id` | uuid | PK |
| `world_id` | integer | One row per world; matches existing conventions |
| `active_package_id` | string | Selection |
| `active_package_version` | string | Selection |
| `active_package_integrity` | string | Witness — mismatch is a loud error |
| `world_config_version` | integer | Cache key (§K.6); bumped on every write |
| `settings` | json | `{ [kind]: { [key]: scalar } }` — includes reserved kind `rules` |
| `roll_types` | json | `{ [rollTypeId]: { enabled, order?, rollSpec?, visibility? } }` |
| `overrides` | json | The closed override set (§21.5) |
| `bindings` | json | Resolved binding gaps (§19.3) |
| `created_at`, `updated_at` | timestamp | |

Unique on `world_id`. **Absence is legal** and means "unconfigured" (§3.3).

## 5.3 `actor_rules_state` (new) — §21.2, *needed before Character Sheet V2, not before package install*

Exactly §21.2: `world_id`, `entity_id`, `package_id`, `package_version`, `state_schema_version`,
`enabled_modules`, and json `values`, `collections`, `choices`, `sources`, `custom`,
`campaign_extensions`. **No derived values, ever.**

## 5.4 Deferred collections

`actor_rules_snapshots` (§13.4), `rules_audit_log` (§27.4), `rules_package_receipts` (§22A.3),
`world_config_definitions` (§19 setting vocabulary — until Transportation Phase 3).

## 5.5 What must not change

- **`character_sheets` — do not ALTER** (§21.3). Add alongside; retire only when nothing reads it.
- **`worlds` — no new column.** Config lives in its own row (§2.7).
- **`worlds.system_key` — do not repurpose.** It has live entity-block consumers (§2.6).
- **`map_pins`, `scene_layer_objects`, `entities`, `block_instances`** — untouched.
- **The 5etools importer and its `import_source` blocks** — untouched.

---

# 6. TypeScript Contract Sketch

Proposed shapes. **Not implemented; no file below exists.**

## 6.1 Manifest additions — `app/lib/rules/types.ts`

```ts
// World-config traits this package reads via @world:<kind>.<key>  (§19.2)
export type RequiredTraitDeclaration = {
  kind: string
  trait: string
  valueType: 'number' | 'text' | 'boolean'
  default: number | string | boolean          // REQUIRED — this is what makes
}                                             // binding gaps degrade instead of fail

// Optional rules, read via @world:rules.<key>  (§E)
export type OptionalRuleDeclaration = {
  key: string
  label: string
  description?: string
} & (
  | { valueType: 'boolean'; default: boolean }
  | { valueType: 'number';  default: number; min?: number; max?: number }
  | { valueType: 'enum';    default: string; options: string[] }
)

// Default roll types  (§D) — engine never reads `id`, only `rollSpec`
export type RollTypeSurface = 'sheet' | 'gm-toolbar' | 'entity'

export type RollTypeDeclaration = {
  id: string
  label: string
  rollSpec: DefinitionId          // must resolve to kind: 'roll'
  surfaces: RollTypeSurface[]
  visibility?: RollVisibility     // default broadcast policy (§J) — inert in V1
  order?: number
}

// Broadcast policy — deliberately NOT §24.3's `Visibility` (§J.5)
export type RollVisibility = 'public' | 'gm' | 'self' | 'blind'

// Added to RulesPackageManifest:
//   requiredTraits?: RequiredTraitDeclaration[]
//   optionalRules?:  OptionalRuleDeclaration[]
//   rollTypes?:      RollTypeDeclaration[]
```

## 6.2 The snapshot — replaces `WorldConfigSnapshotRef`

```ts
export type WorldTraitValue = number | string | boolean

// Backs @world: entirely. Frozen at EvaluationSession construction (§F.5).
// Two levels, exactly — snapshot.traits[kind][key]  (§F.2)
export type WorldConfigSnapshot = {
  worldId: string
  packageId: string
  packageVersion: string
  worldConfigVersion: number
  traits: Record<string, Record<string, WorldTraitValue>>   // 'rules' is reserved
}
```

`EvaluationContext.world` narrows from `WorldConfigSnapshotRef` to
`WorldConfigSnapshot | undefined`. `undefined` means unconfigured, and every `@world:` reference
then produces a `RulesError` — today's behavior, preserved for unconfigured worlds.

## 6.3 Stored config and resolution — `app/lib/rules/world-config.ts` (new, pure)

```ts
export type WorldRollTypeOverride = {
  enabled: boolean
  order?: number
  rollSpec?: DefinitionId        // must be a package-declared RollSpec
  visibility?: RollVisibility
}

export type StoredWorldRulesConfig = {
  worldId: string
  activePackageId: string
  activePackageVersion: string
  worldConfigVersion: number
  settings: Record<string, Record<string, WorldTraitValue>>
  rollTypes: Record<string, WorldRollTypeOverride>
  overrides: WorldOverride[]
  bindings: Record<string, WorldTraitValue>
}

// A Binding Gap is a named, user-resolvable mapping — never a runtime failure (§19.3)
export type BindingGap = {
  kind: string
  trait: string
  declaredDefault: WorldTraitValue
  reason: string
}

export type ResolvedWorldConfig = {
  snapshot: WorldConfigSnapshot
  rollTypes: ResolvedRollType[]        // package declarations ∘ world overrides, ordered
  gaps: readonly BindingGap[]
  unboundRecommendedRoles: readonly SemanticRole[]
  issues: readonly PackageValidationIssue[]   // reuses the existing diagnostic shape
}

export function resolveWorldConfig(
  manifest: RulesPackageManifest,
  stored: StoredWorldRulesConfig | null
): ResolvedWorldConfig

export function lookupWorldTrait(
  snapshot: WorldConfigSnapshot,
  kind: string,
  key: string
): WorldTraitValue | undefined
```

`resolveWorldConfig` is **total** — it never throws and always returns a snapshot, because a missing
world value falls back to the package's required `default` and records a gap. That is what ADR-006's
"mismatches surface as user-resolvable binding gaps, never runtime failures" means in code.

## 6.4 The closed override set — §21.5 / ADR-012

```ts
export type WorldOverride =
  | { op: 'setConstant';   target: DefinitionId; value: RuleValue }
  | { op: 'disableDefinition'; target: DefinitionId }
  | { op: 'addModifier';   source: DefinitionId; modifier: ModifierSpec }
  | { op: 'resolveBinding'; kind: string; trait: string; value: WorldTraitValue }
```

Four operations. No deep merge, no formula editing, no arbitrary patches. Extend one operation at a
time, deliberately, when a specific need recurs.

## 6.5 Server loaders (no engine dependency on Directus — §21.6)

```ts
// server/utils/rules-packages.ts  — MUST use directusServiceRequest, not a new dxFetch
export function loadPublishedPackage(packageId: string, version: string):
  Promise<{ manifest: RulesPackageManifest; definitions: Definition[] }>

// server/utils/world-rules-config.ts
export function loadWorldRulesConfig(worldId: string): Promise<StoredWorldRulesConfig | null>
export function saveWorldRulesConfig(worldId: string, patch: Partial<StoredWorldRulesConfig>): Promise<void>
```

---

# 7. Runtime Flow

```
request (worldId, entityId, purpose)
   │
   ├─ loadWorldRulesConfig(worldId) ──────────► null? → UNCONFIGURED
   │                                                     legacy path; engine not invoked
   ├─ loadPublishedPackage(pkgId, version)    [in-process LRU, keyed by integrity]
   │     └─ verify status/engineApiVersion/integrity
   │
   ├─ RulesRegistry.create(definitions)
   ├─ DependencyGraph.build(registry)
   │
   ├─ resolveWorldConfig(manifest, stored) → { snapshot, rollTypes, gaps, … }
   │
   ├─ ActorState:
   │     canonical → actor_rules_state row
   │     legacy    → characterSheetToActorState(sheetRow, inventoryRows, manifest)
   │
   ├─ new EvaluationSession(registry, graph, actorState, {
   │       purpose, world: snapshot, tags, seed
   │     })                                   ← sourceOverlay built once, here
   │
   └─ evaluate(definitionId, session)
         └─ @world:<kind>.<key> → snapshot.traits[kind][key]     ← the one new branch
```

Two properties worth stating explicitly, because they are what make this safe:

- **Directus appears exactly twice, both before evaluation begins** (§21.6).
- **The only change inside the evaluator is one reference branch.** Everything else is assembly.

---

# 8. Package Install / Selection Flow

```
INSTALL
  upload bundle (or POST manifest + definitions)
    → parse
    → validatePackage(manifest, definitions)          [already implemented]
    → errors?   store as draft with validation_issues; STOP
    → clean?    compute integrity → status: published → insert rules_packages row

SELECT (activate for a world)
  choose (packageId, version)
    → assert status === 'published'
    → assert engineApiVersion satisfied by running engine
    → assert integrity matches
    → does any actor_rules_state row exist for this world?
         no  → activate
         yes → same packageId?  → version change = migration (§25, DEFERRED → refuse)
                different pkgId? → require explicit Reset Rules State (type world name)
    → write world_rules_config; bump world_config_version

ROLLBACK
  repin to the previous (packageId, version)
    → refuse if state_schema_version differs (needs §25 tooling)
```

Publication is the only validating transition, and it is the same transition whether the content was
hand-authored or translated (§11.8).

---

# 9. Character Sheet Bridge Flow

```
sheet.vue  (unchanged math, unchanged layout)
   │
   ├─ existing legacy computeds ──────────────► displayed values     [UNCHANGED]
   │
   └─ roll button clicked
         │
         ├─ resolvedRollTypes.filter(surfaces ∋ 'sheet')     ← replaces ROLL_SPEC_ID
         ├─ characterSheetToActorState(...)                  ← replaces ACTOR_STATE
         ├─ requestRoll({ rollSpecId, registry, graph, actorState, context })
         └─ RollEvent → EldraDiceBox.rollResult(event, label)   [UNCHANGED consumer]
```

The 3D dice path does not change at all — it already consumes `RollEvent` and generates no
randomness of its own. What changes is that the `RollSpec` becomes real, package-defined, and
world-selected instead of a per-click anonymous construction.

**Sequencing note.** The `ActorState` bridge is *not* required for the roll-type change to land — a
`RollSpec` whose dice expression is self-contained (`1d20+5`) reads nothing from actor state. So
"roll buttons discover package roll types" can ship **before** the bridge, and should.

---

# 10. Default Roll Type Model (including Luck Roll)

```
Rules Package                     World Configuration              Consumer
─────────────────────────────     ──────────────────────────       ─────────────────
definitions/rolls/luck.json       roll_types: {                    GM toolbar
  { id: "roll:luck",                "luck":  { enabled: true,        surfaces ∋ 'gm-toolbar'
    kind: "roll",                              order: 3 },
    dice: "1d20",                   "morale":{ enabled: false }    Character sheet
    successRule: {kind:"none"} }   }                                 surfaces ∋ 'sheet'

manifest.rollTypes: [
  { id: "luck", label: "Luck Roll",
    rollSpec: "roll:luck",
    surfaces: ["gm-toolbar","sheet"],
    visibility: "public" } ]
```

**Resolution:** `resolvedRollTypes = manifest.rollTypes` ∘ `world.rollTypes`, dropping
`enabled: false`, sorted by world `order` then declaration `order` then declaration index.

**Validation:**

| Rule | Owner |
|---|---|
| `rollSpec` resolves to a `kind: 'roll'` definition | Package Validation |
| `rollTypes[].id` unique | Package Validation |
| `surfaces` entries are known | Package Validation |
| World override `rollSpec` is a package-declared `RollSpec` | World Config Validation |
| World references a roll type the package doesn't declare | World Config Validation (**warning** — stale config after upgrade, not corruption) |

**The engine reads none of this.** `requestRoll` receives a `rollSpecId` and executes it. "Luck" is a
label and a config key, nowhere else.

---

# 11. `@world` Semantics — Summary

| Question | Decision |
|---|---|
| Syntax | `@world:<kind>.<key>` — exactly two segments |
| Resolution | `snapshot.traits[kind][key]` — fixed depth, not drilling, not a flat key |
| Reserved kind | `rules` → optional rules |
| Value types | `number \| text \| boolean` |
| Lifetime | Frozen at `EvaluationSession` construction |
| Undeclared trait read | `RulesError` |
| Declared but unsupplied | Declared `default` + a **Binding Gap** |
| `@world:rules.X` undeclared | **Package Validation error** (never reaches runtime) |
| Wrong arity (1 or 3+ segments) | Reference validation error (**new** — currently accepted) |
| Dependency edges | **None** |
| Owner | `app/lib/rules/world-config.ts` (pure) |
| Cache participation | via `worldConfigVersion` in `contextHash` |

---

# 12. Game Admin Requirements

See §H. Condensed:

| Capability | Milestone |
|---|---|
| View active package + version | **V1** |
| Activate / switch package (gated) | **V1** |
| View validation results | **V1** |
| Edit optional rules | **V1** |
| Enable/disable/reorder/rebind roll types | **V1** |
| View binding gaps + unbound roles | **V1** |
| Import a package | **V1** |
| Reset Rules State (destructive, confirmed) | **V1** |
| Edit world overrides | V1.5 |
| Upgrade/migrate package version | V2 (needs §25) |
| Author/edit definitions | V2 (needs authoring UI) |
| Re-import with merge | V2 (needs receipts) |
| Trace / explain inspector | V2 |

---

# 13. Importer Interaction

See §I. Condensed: **World Configuration is adapter-blind.** It stores `(package_id, version)`. A
translated package and a hand-authored package are the same artifact type (§11.7) and are selected
identically. The existing 5etools *content* importer is untouched and independent (ADR-018).

---

# 14. Chat / Multiplayer Placement

See §J. Condensed: **Chat belongs to a future Session Runtime**, gated on Users, ownership,
sessions/presence, and a multi-process-safe transport — all verified absent. `RollEvent` is already
the right payload and already deterministic, so Chat arrives as a second consumer of an existing
contract. World Configuration's only future role is holding default roll visibility, which is inert
until there is someone to hide a roll from.

---

# 15. Validation Ownership Matrix

Extending §16.14's table. Existing rows unchanged; **new rows introduced by World Configuration**:

| Rule | Owner |
|---|---|
| `@world:` reference has exactly two path segments | reference validation *(new)* |
| `@world:rules.X` names a declared `optionalRules` key | package structural validation *(new)* |
| `@world:<kind>.<key>` is declared in `requiredTraits` | package structural validation *(new)* |
| `requiredTraits[].default` present and matches `valueType` | package structural validation *(new)* |
| `optionalRules[].key` unique; `default` matches `valueType`; `enum` has `options` | package structural validation *(new)* |
| `optionalRules` key does not collide with a real world-config kind | package structural validation *(new)* |
| `rollTypes[].rollSpec` resolves to `kind: 'roll'` | reference validation *(new)* |
| `rollTypes[].id` unique; `surfaces` known | package structural validation *(new)* |
| `semanticRoles` targets resolve | package validation *(already implemented)* |
| World setting value matches declared type/options | **world config validation** *(new module)* |
| World roll-type override targets a package-declared `RollSpec` | **world config validation** *(new)* |
| World references an undeclared roll type (**warning**) | **world config validation** *(new)* |
| Required trait unsupplied → **Binding Gap**, use default | **world config validation** *(new)* |
| Recommended semantic role unbound (**warning**) | **world config validation** *(new)* |
| Package `status === 'published'` at activation | activation check *(new)* |
| `engineApiVersion` satisfied | activation check *(new)* |
| `integrity` matches stored witness | package loader *(new)* |
| Undeclared `@world:` trait at runtime | evaluator *(new)* |

The pattern matches §16.14's existing static/runtime pairs: **package validation catches what is
knowable from the package alone; world config validation catches what needs both sides; the
evaluator catches only what is genuinely undecidable earlier.**

---

# 16. Cache and Versioning Model

See §K. The V1 commitment is deliberately one column:

- `world_rules_config.world_config_version`, incremented on every write.
- `EvaluationSession` is unchanged. Sessions are per-request and already immutable snapshots.
- No cross-session cache is built. The version column exists so one can be added later without a
  retrofit — which is the cheapest possible hedge.

Three versions stay independent (§25.1): `engineApiVersion`, package `version`,
`stateSchemaVersion`. `worldConfigVersion` is a **fourth, world-local** counter and must not be
conflated with any of them.

---

# 17. Migration Strategy from Current Legacy Data

**There is no data migration in V1. This is the design, not an omission.**

| Existing data | What happens |
|---|---|
| `worlds` | Unchanged. No new column. |
| `worlds.system_key` | Unchanged, still decorative, still read by entity-block lookup |
| `character_sheets` | **Never ALTERed** (§21.3). Read-only source for the bridge. |
| `character_sheet_inventory` | Read-only source for the bridge |
| `entities`, `block_instances` | Unchanged |
| 5etools imported content | Unchanged |
| `map_pins`, `scene_layer_objects` | Unchanged |

**A World with no `world_rules_config` row behaves exactly as it does today.** The Rules Engine is
not in its request path.

Sequencing, for data safety:

1. Add `rules_packages` + `world_rules_config`. Nothing reads them. Zero risk.
2. Install and publish a package. Still nothing reads it.
3. Activate on **one** world. Only that world's roll buttons change behavior.
4. Add the bridge. Read-only, one-way, deletable.
5. Add `actor_rules_state` only when the sheet is ready to write canonical state.

Every step is independently revertible, and no step destroys data. This is the same progression that
took `scene_layer_objects` to production alongside `map_pins`, including the part where the legacy
collection stays in use indefinitely.

**On "nuking test data":** nothing in this milestone requires it. If test worlds are deleted, that is
an unrelated housekeeping choice — World Configuration neither needs nor benefits from a clean slate,
because unconfigured worlds are already a legal state.

---

# 18. Recommended Implementation Sequence

Narrow commits, in dependency order. Each is independently reviewable and independently revertible.

## Must happen before real package import

**Commit 1 — World Configuration contract and `@world` semantics** *(pure, no I/O)*
`app/lib/rules/types.ts` (manifest additions, `WorldConfigSnapshot`, `RollVisibility`),
`app/lib/rules/world-config.ts` (new), `app/lib/rules/evaluator.ts` (one reference branch),
`app/lib/rules/reference-validation.ts` (`@world:` arity), `tests/rules/world-config.test.ts`,
`tests/rules/evaluator.test.ts`.
*Closes the ambiguity `evaluator.ts:87-95` flagged. Fully testable with zero infrastructure.*

**Commit 2 — Package validation for the new manifest sections**
`app/lib/rules/package-validation.ts`, `tests/rules/package-validation.test.ts`.
*`optionalRules`/`requiredTraits`/`rollTypes` well-formedness; `@world:rules.X` and `rollSpec`
reference checks.*

**Commit 3 — World config resolution and validation** *(pure)*
`app/lib/rules/world-config.ts`, `tests/rules/world-config-resolution.test.ts`.
*`resolveWorldConfig`, binding gaps, roll-type composition, unbound-role warnings.*

**Commit 4 — `rules_packages` schema + loader**
`scripts/directus/create-rules-packages-schema.mjs`, `server/utils/rules-packages.ts`,
`server/api/rules-packages/**`.
*Uses `directusServiceRequest`. Requires a manual `bootstrap.mjs` run per the Deployment Checklist.*

**Commit 5 — `world_rules_config` schema + persistence + API**
`scripts/directus/create-world-rules-config-schema.mjs`, `server/utils/world-rules-config.ts`,
`server/api/worlds/[id]/rules-config/**`.

**Commit 6 — Starter package + import/publish endpoint**
`packages/eldra-generic-d20/` (authoring source), `server/api/rules-packages/import.post.ts`.
*A minimal hand-authored d20 package: ability Values, a proficiency Value, `roll:check`, `roll:luck`,
`collection:inventory` with `sourceRefField`, one optional rule, `vitality`/`level`/`inventory` role
bindings. This is the first package the engine ever runs — it is real content, not scaffolding.*

**Commit 7 — Game Admin Rules tab (read-only)**
`app/pages/worlds/[id]/admin.vue` (one new tab), `app/components/admin/rules/*`.
*Active package, validation results, binding gaps, unbound roles. No editing yet.*

## Must happen before Character Sheet V2

**Commit 8 — Package activation + optional-rule and roll-type editing**
Admin write paths, the activation gate, Reset Rules State.

**Commit 9 — Sheet roll-button discovery**
`app/composables/useCharacterSheetRolls.ts`, `sheet.vue` (call sites only).
*Deletes `ROLL_SPEC_ID` and the ad-hoc package. **Highest visible value in the milestone** — and it
does not need the bridge (§9).*

**Commit 10 — `actor_rules_state` schema + persistence**
`scripts/directus/create-actor-rules-state-schema.mjs`, `server/utils/actor-rules-state.ts`.

**Commit 11 — Legacy → ActorState bridge** *(read-only, one-way)*
`server/utils/character-sheet-actor-state.ts`, `tests/…`.

**Commit 12 — Tier-1 generated sheet, behind a flag**
`app/components/characters/GeneratedSheet.vue`. *Proves the package end-to-end without touching
`sheet.vue`'s layout.*

## Can wait until multiplayer

Roll visibility enforcement, Session Runtime, Chat, secret rolls, per-user permissions, server-side
seed generation (currently a flagged `Math.random()` in `useCharacterSheetRolls.ts`).

## Can wait until Game Admin polish

World override editing, migration/upgrade tooling (§25), translation receipts and re-import
(§22A.11), the reconciliation workspace, self-test runner, trace/explain inspector,
`world_config_definitions` and Transportation traits (§19/§20).

---

# 19. Project Knowledge Review

**1. What is the smallest World Configuration V1 that lets Sam nuke test data and start building a
real world?**

Commits 1–7, and nothing else: `@world:` resolves, `rules_packages` and `world_rules_config` exist,
one starter package is published and activatable, and the Rules admin tab shows what is active and
what is missing.

The framing needs one correction, though: **nothing here requires nuking test data.** An
unconfigured world is a legal state (§3.3), `character_sheets` is never altered, and `worlds` gains
no column — so existing test worlds keep working untouched, and a new "real" world is just a world
with a config row. If test data gets deleted, that is independent housekeeping. The smallest V1 is
additive, and that is deliberately its most important property.

**2. What must exist before importing real Rules Packages?**

Five things, all in commits 1–6:
- `rules_packages` with the draft/published transition (§11.8) — publication is the validating gate
- `loadPublishedPackage` with integrity + `engineApiVersion` verification
- Manifest support for `optionalRules`/`requiredTraits`/`rollTypes`, or packages cannot declare what
  they need
- `validatePackage` extended to cover those sections (it already covers everything else)
- An import endpoint that stores failures as drafts rather than discarding them

Not required: adapters, receipts, re-import, migrations, an authoring UI.

**3. What must exist before the Character Sheet can fully leave legacy math?**

More than this milestone delivers, and the honest list is:
- `actor_rules_state` (commit 10) — canonical state, including active conditions, which the bridge
  structurally cannot supply (§G.8)
- A 5e package at real parity: ability Values, proficiency, skills, saves, AC as a derived Value with
  Modifiers, spell slots as Resources
- **Progression, ChoiceSet, and Table definitions** — named in §12.2 as "kept" but deliberately not
  modeled in `types.ts` because no shape appears anywhere in the architecture. Classes, subclasses,
  and feats cannot be expressed without them. **This is the largest unquantified gap in the whole
  Rules Engine**, and it will surface the moment someone tries to author a real 5e package.
- Layouts (§18.2) and traces (§18.5's "why is this 17?" affordance)

Per §31.8 Q3, a **long-lived adapter is acceptable** — the sheet leaves legacy math panel by panel,
never in one cutover.

**4. Where does Luck Roll belong?**

In the **Rules Package**: a `roll:luck` `RollSpec` plus a `manifest.rollTypes[]` entry naming it,
with `surfaces: ['gm-toolbar', 'sheet']`. The **World** enables, orders, or disables it. The engine
never learns the word "luck" — it executes a `rollSpecId`. Not a Semantic Role (that registry is
closed and engine-owned), not World Configuration vocabulary (that has no mechanics), not the engine.

**5. Where does Chat belong, and why is it not now?**

A future **Session Runtime** subsystem. Not now because its four prerequisites are all verified
absent: users beyond bare Directus identities, ownership, sessions/presence, and a multi-process-safe
transport (the existing SSE bridge is a `globalThis` map). Without identity a message has no
addressee, roll visibility has no subject, and "GM-only" cannot be enforced. `RollEvent` is already
the right payload and already deterministic, so Chat will arrive as the *second* consumer of an
existing contract — which is exactly why building it early would have produced a throwaway.

**6. What is the first implementation commit after this architecture is approved?**

**Commit 1 — World Configuration contract and `@world` semantics.** Pure TypeScript under
`app/lib/rules/`, no Directus, no UI, no schema, fully unit-testable on day one. It closes the
ambiguity `evaluator.ts:87-95` explicitly refused to guess at, and it is the dependency of every
other commit in the sequence. It also matches the rhythm every prior Rules Engine commit followed:
pure logic first, tested, before any infrastructure.
