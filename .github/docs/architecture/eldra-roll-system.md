# Eldra Roll System — Server-Authoritative Dice for Tabletop Play

**Status:** Plan — implementation roadmap, not yet started. No code in this commit.
**Scope:** A general-purpose, server-authoritative dice-rolling surface for the Character Sheet and, eventually, the whole World: click-to-roll abilities/saves/skills/attacks/spells, free-typed custom rolls, persisted history, visibility (private vs. table), and the seams for a future DM screen, realtime table rolls, 3D dice, and dice skins.
**Non-scope:** Rewriting `app/lib/rules/roll-engine.ts`/`roll-service.ts` (the Rules Engine's own package-declared Roll Spec executor — untouched, see §1). Rewriting `server/utils/character-combat.ts`'s attack/damage resolution math (untouched in every phase below except an *additive* history write in Phase 3). Character ownership/permissions beyond what `server/utils/authorization.ts` already enforces today. Any Directus schema change, npm install, or app behavior change — this document proposes them; none are applied here.

---

## 0. Why this document — and why it is not inventing a roll system from nothing

Eldra already rolls dice, server-side, in two places, both correctly server-authoritative:

1. **`app/lib/rules/roll-engine.ts` / `roll-service.ts`** — executes a `RollSpec` (a Rules-Package-*declared* Definition, e.g. `roll:check`), using `app/lib/rules/rng.ts`'s `createSeededRng` (a deterministic, non-cryptographic PRNG seeded once via `node:crypto`'s `randomBytes`, see `server/utils/world-rules-roll.ts:154`). Reached today through `POST /api/worlds/:id/rules/roll`, which already enforces a capability named `world.roll.execute` (`server/utils/authorization.ts:99`, already mapped to Owner/GM/Player roles).
2. **`server/utils/character-combat.ts`** — Combat Resolution's attack/save/damage rolls. Reuses the *identical* `createSeededRng`, server-generates its own `randomBytes(16)` seed, and is already fully live, tested gameplay code (`tests/server/utils/character-combat.test.ts`).

Neither one is what this document is building, and the distinction is load-bearing, not cosmetic:

| | Rules Engine Roll Service | This document's system |
|---|---|---|
| What it executes | A **Rules-Package-authored `RollSpec`** — an EEL Expression that may reference `@value:`/`@world:`/`@collection:`, with author-declared `selection`/`reroll`/`successRule` | **Eldra-authored** roll sources (ability/save/skill/attack/spell/custom) whose bonus is already a known number by the time a roll is requested |
| Randomness | Deterministic seeded PRNG (`mulberry32`/`xmur3`) — *not* cryptographic by design; rng.ts's own header: "the requirement is reproducibility, not secrecy" | True CSPRNG per die (OpenDice, `crypto.getRandomValues`), no seed, no replay — see §1 |
| Notation | None — a RollSpec's dice come from an object built by EEL constructor functions (`keepHighest(4d6,3)`), never a string a player types | Standard tabletop notation a player or the sheet types/derives (`4d6kh3`, `1d20+7`) |
| Persistence | None — `RollEvent` is an in-memory return value only (`roll-service.ts`'s own header: "does NOT own... Chat, Timeline... produces runtime events only") | **The point of this document** — every roll is a durable, queryable event |
| Visibility | Declared in the architecture (`rules-engine.md` §24.3: `public\|owner\|gm`) but **"In V1 nothing enforces this"** (verbatim) | **The point of this document** — enforced from Phase 1 |
| Consumers today | World Configuration's "roll types" (`AdminRulesRollTypesEditor.vue`), a GM-authored, package-level concept | Character Sheet rows a player clicks, plus a free-text custom roll |

**Both systems are correct for what they do and neither is being replaced.** This document adds a new, additive layer — persistence, visibility, history, realtime, presentation — on top of Eldra's own roll *mechanics*, and for the mechanics themselves it adopts a different, purpose-built library (OpenDice, §1) rather than routing sheet clicks through the Rules Engine's RollSpec abstraction, because a sheet click has no Rules-Package Expression to evaluate — the bonus is already a known number (§4). Two existing, narrower prototypes are explicitly superseded by this plan and are named as such in the Phase Plan (§14):

- **`app/composables/useCharacterSheetRolls.ts`** — its own header already says what it is: "Seed generation here is client-side (`Math.random()`-based) purely to prove the... wiring end to end... a real, production-ready call site must eventually generate its seed server-side... Flagged here, not solved here." **This document is that real call site.** Phase 2 retires it.
- **`app/components/EldraDiceBox.client.vue`** is *not* superseded — it is **reused**. It already has a canonical, RollEvent-driven, presentation-only entry point (`rollResult(event, label)`, `EldraDiceBox.client.vue:400`) that treats its input as 100% authoritative and never reads the physics engine's own settled dice faces (a documented, verified limitation of the installed `@3d-dice/dice-box@1.1.4`, `EldraDiceBox.client.vue:385-399`). Phase 7 extends this component's existing contract for the new event shape; it does not replace it. See §11.

Every fact above was read from the file cited, not recalled — see the Evidence Index (§18).

---

## 1. Research: OpenDice, verified

The brief's assumptions were checked against the real package (`npm view opendice`, then `npm pack opendice@2.0.0` into a scratch directory — **not installed into this project**; its `README.md`, `package.json`, and compiled `dist/*.d.ts` were read directly).

| Assumption | Verdict |
|---|---|
| Available as `opendice` on npm | **Confirmed.** `opendice@2.0.0`, published ~1 week before this document, 5 versions on the registry (1.1.0→2.0.0). |
| Rolls `1d20+4`, `2d6`, `4d6kh3` | **Confirmed**, plus more: `2d20adv`/`2d20dis` (advantage/disadvantage sugar), `4d6kl3` (keep lowest), `2d6min3`/`totalmin3` (bounds), `1d6!`/`1d6!p` (exploding/penetrating), `1d6x10` (group multiplier), a trailing tag (`2d10 fire`, opt-in via `ParseOptions.tags`). |
| CSPRNG / modulo-bias-resistant | **Confirmed**, and stronger than a paraphrase suggests: `crypto.getRandomValues` (never `Math.random`), rejection-sampled per die (`rng.ts`: "draw a 32-bit value, reject any landing in the short remainder... redraw"), **one independent CSPRNG word per die** — dice are never derived from one shared draw. |
| Returns every die, not just the total | **Confirmed**, and richer than "every die": each `DieGroup` reports `results` (every die, including ones dropped by adv/dis/keep/bound), `kept`, `keptFlags` (aligned marker per result), `advantageState`, `multiplier`, `naturalHigh`/`naturalLow`. |
| Knows notation, not game rules | **Confirmed, verbatim from its own README**: *"It has no rules of its own... Whether a high roll is good, what a label stands for, whether a total passes or fails — all of that is the caller's."* |
| Eldra must own game meaning | **Confirmed as the correct division of labor** — matches Eldra's own existing precedent exactly: `character-actions.ts`/`character-derived.ts` already own "what a modifier means"; OpenDice would only ever own "what the dice showed." |

Additional facts pulled from the compiled types (`dist/roll.d.ts`, `dist/formula.d.ts`, `dist/rng.d.ts`) that the brief didn't ask about but the implementation needs:

```ts
// The exact shape roll() returns — app/lib/rolls/dice-adapter.ts wraps this.
interface DieGroup {
  sides: number
  sign: 1 | -1
  results: number[]      // every die, including dropped ones
  keptFlags: boolean[]   // aligned to results
  kept: number[]
  advantageState: 'normal' | 'advantage' | 'disadvantage'
  multiplier: number
  total: number           // this group's signed contribution
  naturalHigh: boolean    // true only when exactly one die was kept and it showed its top face
  naturalLow: boolean
}
interface RollResult {
  formula: string
  dice: DieGroup[]         // MULTIPLE groups possible: "1d8+1d4+3" is two groups
  modifier: number         // sum of flat numbers
  modifiers: number[]      // each flat modifier separately ("+1 -6", never collapsed to "-5")
  total: number
  tag?: string
}
interface RollContext {
  advantage?: 'advantage' | 'disadvantage'   // applied to the sole eligible dice group
  bonuses?: (number | string)[]              // extra terms: plain numbers OR formula fragments
  rand?: () => number                        // TEST-ONLY escape hatch — see the trust note below
  tags?: Iterable<string> & object
}
function roll(formula: string, ctx?: RollContext): RollResult
function parseFormula(input: string, opts?: { tags?: Iterable<string> & object }): Formula  // throws on malformed input; validate-without-rolling
```

**Documented limits** (`dist/formula.js`, `dist/rng.js` — exact values, not estimates): `MAX_DICE = 1000` per formula (counting every term), `MAX_EXPLOSIONS = 100` per die, `MAX_SIDES = 2**32`, `MAX_FORMULA_LENGTH = 1000` characters, at most 100 recognized tags, and the running total may never exceed `Number.MAX_SAFE_INTEGER`. Every one of these throws a specific, human-readable `Error` rather than silently clamping — exactly what §13's "never let the client submit an arbitrary result" needs: a malformed or hostile formula is rejected before it ever reaches a die.

**Package facts relevant to adoption:** MIT license, **zero runtime dependencies**, ships as ES modules only (`"exports": {".": {"import": "./dist/index.js"}}` — no CommonJS build; Eldra's server code is already all-ESM `import`, so this is a non-issue, confirmed by grepping `server/**` for `require(` — none found), requires Node ≥ 20 (Eldra's CI runs Node 22, local dev observed at Node 20.20.2 — both satisfy this). Extracted from a real production app (OpenFray, per its own README), not a toy.

**The one deliberate trust note, verbatim from the README, and why it matters for §13:** *"The options you pass are read as you passed them, so other code sharing the page cannot inject its own randomness... The `rand` option supplies raw unsigned 32-bit integers. Malformed values throw, but opendice cannot tell whether valid values are fair, so the source is yours to guard."* `RollContext.rand` exists for **tests only**. Production roll requests must never construct a `RollContext` from anything a request body supplies — see §7 and §13.

**Still needing verification when Phase 0 actually starts** (nothing here blocks writing this document, but nothing here should be treated as settled either):
- Exact browser/edge-runtime behavior of `crypto.getRandomValues` under Nitro's Node preset in production (should be identical to plain Node — `node-server` preset — but confirm once `pnpm add opendice` actually happens).
- Whether OpenDice's benchmark claims (256-word CSPRNG buffering) matter at Eldra's actual roll volume — almost certainly not; noted only so a future session doesn't over-invest in it.

---

## 2. Core architecture

**The server decides reality. The client makes reality feel magical.**

```
Player clicks "Roll" on a sheet row
        │
        ▼
Client: POST /api/worlds/:id/rolls  { sourceType, sourceKey, actorCharacterId, visibility, ... }
        │  (client never sends dice results, a total, or a formula it expects honored verbatim
        │   for anything but a `custom` roll — and even then, the SERVER still rolls it)
        ▼
Server: resolve capability (world.roll.execute) → derive the expression for this source
        (re-reading the actor's own already-computed derived value, never trusting a client number)
        → roll via OpenDice (app/lib/rolls/dice-adapter.ts)
        → build a RollEventRecord → persist it (roll_events) → decide visibility
        → return it to the requester; broadcast it to the table if visibility says to
        │
        ▼
Client: renders the returned RollEventRecord (roll tray, §9) and hands it, unmodified,
        to EldraDiceBox.client.vue's existing `rollResult()` (§11) — dice tumble,
        the number shown was never computed by the animation
```

The client's job list, unchanged from the brief and consistent with everything Eldra already does for Combat Resolution (`character-combat.ts` results already flow this exact way into `CharacterActionsPanel.vue`):

- Request a roll (name a *source*, not a result).
- Show a pending state while the request is in flight.
- Animate dice **after** the server has answered, using the server's own numbers.
- Render the result and the running history.
- **Never** compute, guess, or locally adjust the number shown.

---

## 3. Roll sources vs. Rules Engine Roll Specs — the one recurring judgment call

Every roll type in §4 below answers the same question differently: *"where does the bonus/expression come from, and can the server trust it without re-deriving it?"* The rule, stated once here so §4's table doesn't have to repeat it eight times:

> **The server re-derives from the same already-tested Rules Engine output the Character Sheet itself reads — it never evaluates a fresh Expression, and it never trusts a client-supplied number for anything that has a Rules Engine source of truth.** This mirrors `rules-engine.md` §17.5's existing principle verbatim ("Costs are validated server-side against freshly re-evaluated state, never against client-sent numbers") and `world-rules-roll.ts`'s own precedent (seed is *never* accepted from a request body, even under a field name that looks like it should be).

Concretely: for an ability/save/skill/spell-save roll, the server calls the **already-existing, already-tested** `getDerivedCharacter` (`server/utils/character-derived.ts`) a second time — exactly the "recompute, don't trust" pattern `world-rules-roll.ts` already established for its own seed — and reads the one `DerivedValue` the request named by category+id, the same category-based, never-hardcoded-ability-name lookup `characterDerivedValues.ts`'s `findDerivedNumber` already performs client-side (§4.1–4.3). For an attack/spell-attack roll, it calls the already-existing `getCharacterActions` (`server/utils/character-actions.ts`) and reads the one action's `attackBonus`. **No new evaluation path is built.** This is strictly less new code than routing through `roll-engine.ts`'s RollSpec abstraction would be, and it sidesteps that abstraction's real cost here: a RollSpec's `dice` field is an author-time EEL Expression object (built with constructor functions like `keepHighest`), not something a runtime "roll my Stealth check" request can cheaply improvise one of per click.

---

## 4. Roll source types

| Type | Required input | Server validation | Expression derivation | Stored | Shown to player |
|---|---|---|---|---|---|
| **`ability`** | `actorCharacterId`, `sourceKey` (`value:ability.<x>.mod`) | Character exists, requester may act as it (§13), World has an active Rules Package | Re-read `derived.byCategory['core.abilities']`, find the entry whose id equals `sourceKey`, its number is the bonus | `expression: "1d20"`, `modifiers: [mod]`, full `RollResult` | "Strength Check: 14 (roll 14) + 0" style, per §9 |
| **`saving_throw`** | same, `sourceKey` (`value:save.<x>.bonus`) | same | `derived.byCategory['core.saves']` lookup | same shape | "Wisdom Save" |
| **`skill`** | same, `sourceKey` (`value:skill.<x>.bonus`) | same | `derived.byCategory['core.skills']` lookup | same shape | "Stealth Check" |
| **`action_attack`** | `actorCharacterId`, `sourceId` (the `CharacterAction.id`) | Character exists + owns/uses that action; action must actually carry a `resolution` of kind `attack-roll` | Re-read `getCharacterActions`, find the one action, use its `attackBonus`; `advantage` passed through `RollContext.advantage` only if the *caller-visible* conditions already justify it (see the honest gap noted in §13 — advantage SOURCE trust is not yet enforceable past the character-sheet UI's own say-so) | `expression`, per-die results, `total` | "Longsword Attack: 18 vs AC" |
| **`spell_attack`** | `actorCharacterId` | Character exists, `spellcastingIsCaster` true | `derived.byCategory['spellcasting']`, `value:spellcasting.attack_bonus` | same | "Spell Attack" |
| **`spell_save`** | `actorCharacterId` **of the character making the save** (the defender, not the caster — see the note below), `metadata.dc`, `metadata.spellName` | Defender character exists; `dc` is a plain recorded number, not re-derived (it belongs to the *caster's* sheet, already resolved client-side when the spell was cast/targeted) | `derived.byCategory['core.saves']` lookup **for the defender** | same, plus `metadata: { dc, spellName, savingAbility }` | "Dexterity Save vs. DC 15 (Fireball)" |
| **`damage`** | `sourceId` (the resolved `CombatOutcome`/action) | N/A in Phase 3 — see below | **Not re-rolled by this system in Phase 3.** The numbers `character-combat.ts` already rolled are recorded verbatim as history; `expression` is the action's own damage string, for display only | `RollResult`-shaped record built FROM the existing `CombatOutcome.damage`, not from a fresh OpenDice call | "1d8+3 slashing → 7" |
| **`custom`** | `expression` (free text), `visibility` | `parseFormula(expression)` must not throw; length/dice/sides ceilings are OpenDice's own (§1); if it throws, the request is rejected with the library's own message, never silently coerced | The client-typed string, verbatim | `expression` = exactly what was typed | "2d6+3: 4, 5 (+3) = 12" |

**Why `damage` doesn't call OpenDice yet, explicitly:** `character-combat.ts` is live, tested gameplay code with its own seed/reproducibility contract (`rng.ts`'s `createSeededRng`, shared with the Rules Engine). Re-rolling damage a second time through a different RNG for the same combat action would either (a) produce a **second, different number** for one attack — a genuine correctness bug, or (b) require re-deriving the exact damage dice/modifier and discarding the number combat already committed, for no benefit. Recording the already-computed result as history is strictly additive and carries zero risk to a shipped system. Whether `character-combat.ts`'s own dice math should later move onto OpenDice is named as a separate, explicitly-deferred decision in §15, not assumed here.

---

## 5. Visibility model

**Phase 1 ships exactly two states**, matching the brief:

- **`private`** — visible to the roller and to anyone holding `world.roll.see_gm` in this World.
- **`table`** — visible to everyone who can read this World (`world.read`).

**Named, not yet built, so nothing invents a third incompatible vocabulary later:**

| Future mode | Sketch |
|---|---|
| `gm_only` | Like `private`, but the roller themself does not see the number either (a GM-secret check *about* a player, not *for* them) |
| `party` | Visible to every Player-role member, hidden from Observers |
| `whisper` | Visible to roller + one named recipient |
| `blind_dm` | The roller sees nothing at all until a GM reveals it — this is `rules-engine.md` §24.4's own **"Secret rolls"** concept, verbatim: *"Server-generated, seed and result stored, visible to GM, revealable later. The audit log records the reveal."* `POST /rolls/:id/reveal` (§7) is that exact, already-named reveal action — not a new idea. |
| `encounter_only` | Visible only to characters currently in the active Encounter |

**This reuses capabilities that already exist and are already enforced**, rather than inventing a new permission vocabulary:

- `world.roll.execute` — already gates `POST /api/worlds/:id/rules/roll` (`server/api/worlds/[id]/rules/roll.post.ts:80`); the new `POST /rolls` endpoint enforces the identical capability the identical way.
- `world.roll.see_gm` — already exists in `WORLD_ROLE_CAPABILITIES` (`server/utils/authorization.ts:199-205`: granted to Owner/GM only) but **has never been checked anywhere in the codebase** (grepped; zero call sites). This document is its first consumer: `GET /rolls` filters out any row with `visibility: 'private'` whose `roller_user_id` isn't the requester, unless the requester's `Principal` also holds `world.roll.see_gm` for this World.
- `world.roll.override` — reserved, unused today, matches `rules-engine.md` §17.8's "GM override" concept (*"Any proposed outcome can be replaced by a GM before commit... Requires the permissions work in §24 to be meaningful"*) — a future GM-adjusts-a-result action, not scoped here.

**Reconciling with `rules-engine.md` §24.3's own three-state vocabulary** (`visibility: "public" | "owner" | "gm"`, declared on Value/Action/Roll Definitions, "In V1 nothing enforces this"): this document's `private`/`table` map onto `owner`/`public` respectively, and a future `gm_only` maps onto `gm`. Two vocabularies exist because they classify different things — §24.3 classifies a *Definition* (can anyone ever see this Value?), this document classifies a *roll event* (who can see this one roll that already happened) — but they must never drift into incompatible meanings, so this mapping is the contract a future session should preserve rather than reinvent.

**Never trust client-provided visibility for anything that matters:** the request body may *suggest* `table`/`private`, but the server is the one that (a) confirms the requester actually holds `world.roll.execute` at all, (b) refuses to honor `private` as a way to hide a roll from someone who holds `world.roll.see_gm` — private hides from *other players*, never from the GM — and (c) for every future mode above, the READ side (`GET /rolls`) is where visibility is actually enforced (filtering server-side before serialization, exactly as `rules-engine.md` §24.3 already mandates: *"GM-only values must be filtered server-side before serialization — filtering them client-side is not privacy"*), not the write side trusting a flag.

---

## 6. Data model

**A dedicated `roll_events` Directus collection — not `block_instances`, not `entities`.**

Why not `block_instances`: that pattern (`server/utils/character-notes.ts:47-48`, and every other `character-*.ts` block module) is a **find-then-PATCH-or-POST upsert** keyed by `(entity_id, block_key)` — "the current state of one named thing," always exactly one row per key. A roll is the opposite shape: an unbounded, ever-growing, **append-only** stream with no natural single key to upsert against. Forcing rolls into `block_instances` would mean either one ever-growing JSON array inside a single row (no server-side filtering/pagination, a write-amplification and row-size problem from day one) or synthesizing a fake unique key per roll to fit an upsert pattern designed for the opposite use case.

Why not `entities`: rolls are not wiki content, have no title/slug/visibility-as-a-page, and are never edited after creation — `EldraEntity`'s whole shape (`app/lib/eldra/types.ts`) is aimed at browsable, editable World content.

**Proposed collection: `roll_events`.**

```ts
// Proposed — app/lib/rolls/types.ts (a new, pure module, no I/O, mirroring
// app/lib/characters/*.ts and app/lib/encounters/*.ts's own convention:
// this file has zero Directus/H3 imports, so it is directly unit-testable).

export type RollSourceType =
  | 'ability' | 'saving_throw' | 'skill'
  | 'action_attack' | 'spell_attack' | 'spell_save'
  | 'damage' | 'custom'

export type RollVisibility = 'private' | 'table'
// Future, named but not implemented (§5): 'gm_only' | 'party' | 'whisper' | 'blind_dm' | 'encounter_only'

// One die-group as OpenDice reports it, restated (not imported — app/lib/**
// must not carry a hard runtime dependency on a third-party shape leaking
// past its own adapter; mirrors how characterDerivedValues.ts restates
// server/utils/character-derived.ts's DerivedValue rather than importing it).
export type RollDieGroup = {
  sides: number
  sign: 1 | -1
  results: number[]
  keptFlags: boolean[]
  kept: number[]
  advantageState: 'normal' | 'advantage' | 'disadvantage'
  multiplier: number
  total: number
  naturalHigh: boolean
  naturalLow: boolean
}

export type RollEventRecord = {
  id: string                        // Directus-assigned (uuid — verify against the live schema, §15)
  worldId: string
  encounterId: string | null
  actorCharacterId: string | null   // null for a bare custom roll with no associated character
  rollerUserId: string              // the authenticated Directus user who requested it — never client-asserted
  label: string                     // "Stealth Check", "Longsword Attack" — display only, never parsed
  sourceType: RollSourceType
  sourceKey: string | null          // e.g. 'value:skill.stealth.bonus' — the Rules Engine id this came from
  sourceId: string | null           // e.g. a CharacterAction id, for action_attack/spell_attack/damage
  expression: string                // the formula actually rolled, e.g. "1d20", "2d6+3"
  dice: RollDieGroup[]
  modifier: number
  modifiers: number[]
  total: number
  visibility: RollVisibility
  createdAt: string                 // ISO 8601, server-stamped
  metadata: Record<string, unknown> // spell_save's { dc, spellName, savingAbility }; extensible without a schema change
}
```

**Proposed Directus schema** (fields on `roll_events`; types to be confirmed against the *live* schema before running the script — see the callout below):

| Field | Type | Notes |
|---|---|---|
| `id` | uuid, PK | Directus-generated |
| `world_id` | *match `worlds.id`'s real type* | required |
| `encounter_id` | *match `encounters`' real id type*, nullable | |
| `actor_character_id` | *match `entities.id`'s real type*, nullable | a "character" is an `entities` row (CLAUDE.md §3) |
| `roller_user_id` | uuid (Directus `directus_users.id` is uuid) | required — **never** taken from the request body; always `event.context.principal.accountId` |
| `label` | string | required |
| `source_type` | string (enum-like; Directus `data_type: string` with a `meta.options.choices` for the admin UI) | required |
| `source_key` | string, nullable | |
| `source_id` | string, nullable | |
| `expression` | string | required |
| `dice` | json | the `RollDieGroup[]` array |
| `modifier` | integer | |
| `modifiers` | json | `number[]` |
| `total` | integer | |
| `visibility` | string | required, default `'private'` (fail closed — see §13) |
| `created_at` | timestamp | Directus `date_created`-style, server-set |
| `metadata` | json | free-form, extensible |

> **Verify before writing the schema script.** `scripts/directus/create-scene-layer-objects-schema.mjs` itself contains a scar from exactly this mistake (its own comment: *"map_id was originally created as integer; maps.id is actually uuid"*, requiring a self-healing `ensureFieldType` migration helper). Before authoring `create-roll-events-schema.mjs`, `GET /fields/worlds`, `/fields/entities` (or wherever character rows actually live — confirm against `character-sheets.ts`), and confirm `directus_users.id` against a live instance, and use whichever of this file's own `uuidField`/`integerField`/`stringField` helpers actually matches. Getting this wrong is exactly the failure mode that file's own history warns about, and its `ensureFieldType` helper exists specifically to self-heal it if it happens anyway.

**Example `roll_events` row (JSON, as `POST /rolls` would return it and `GET /rolls` would list it):**

```json
{
  "id": "0e1e6d8e-6c8e-4d3f-9c2a-6a1b7e2f9c11",
  "worldId": "42",
  "encounterId": null,
  "actorCharacterId": "1187",
  "rollerUserId": "b6f1b8b0-9e2f-4b0a-9b0e-1e2f3a4b5c6d",
  "label": "Stealth Check",
  "sourceType": "skill",
  "sourceKey": "value:skill.stealth.bonus",
  "sourceId": null,
  "expression": "1d20",
  "dice": [
    {
      "sides": 20, "sign": 1,
      "results": [14], "keptFlags": [true], "kept": [14],
      "advantageState": "normal", "multiplier": 1, "total": 14,
      "naturalHigh": false, "naturalLow": false
    }
  ],
  "modifier": 5,
  "modifiers": [5],
  "total": 19,
  "visibility": "table",
  "createdAt": "2026-09-12T14:03:11.482Z",
  "metadata": {}
}
```

**Pruning/volume** (flagged, not solved — see §15): an append-only table with no delete path will grow unbounded across a long campaign. No pruning is proposed in Phase 1–6; a future retention policy (e.g., "keep the last N rolls per World, archive the rest") is named as an open question, not designed here, since nothing in the brief asked for one and guessing a retention window would be exactly the kind of unrequested scope CLAUDE.md's AI Rules warn against.

---

## 7. API design

### `POST /api/worlds/:id/rolls`

Thin route, all orchestration in `server/utils/roll-events.ts` (matching the codebase's own "routes stay thin, `server/utils/*.ts` owns logic" convention, and mirroring `server/api/worlds/[id]/rules/roll.post.ts`'s own shape almost exactly).

```ts
// Request
{
  sourceType: 'ability' | 'saving_throw' | 'skill' | 'action_attack' | 'spell_attack' | 'spell_save' | 'damage' | 'custom',
  actorCharacterId?: string,
  sourceKey?: string,     // required for ability/saving_throw/skill
  sourceId?: string,      // required for action_attack/spell_attack/damage
  expression?: string,    // required for custom ONLY — every other type derives its own
  label?: string,         // display label; server may override/ignore for non-custom types
  visibility?: 'private' | 'table',  // defaults to 'private' if omitted (fail closed, §13)
  encounterId?: string,
  metadata?: { dc?: number; spellName?: string; savingAbility?: string }  // spell_save only
}

// Response: 201, body = the RollEventRecord (§6), verbatim — "do not reshape,
// do not recompute totals, do not decorate," the exact discipline
// world-rules-roll.ts's own design decision 4 already states for RollEvent.
```

**What the server explicitly refuses to accept from this body, ever:** a `total`, a `dice`/`results` array, a `seed`, or an `expression` for anything except `custom`. For `custom`, the *expression string* is accepted — but the server still rolls it (§1's `roll(formula)`), and `parseFormula` validates it first; a malformed formula is a `400`, never silently coerced or partially honored.

### `GET /api/worlds/:id/rolls`

```ts
// Query: ?encounterId=&actorCharacterId=&limit=&cursor=
// Response: { rolls: RollEventRecord[], nextCursor: string | null }
```

Visibility filtering happens **inside this handler**, server-side, before serialization (§5) — never as a client-side "hide the private ones" step.

### Later — named now so Phase 4–6 don't invent shapes ad hoc

```
GET  /api/worlds/:id/rolls/stream         # SSE, see §10 — a live feed of newly-created RollEventRecords
POST /api/worlds/:id/rolls/:rollId/reveal # rules-engine.md §24.4's own "revealable later" — requires world.roll.override
```

`reveal` response: the same `RollEventRecord`, with `visibility` transitioned (e.g. `blind_dm` → `table`) and a `metadata.revealedAt`/`revealedBy` stamp — no recomputation, the numbers were already fixed at roll time.

---

## 8. Sheet integration

**Clickable roll targets**, per §4: ability rows, saving-throw rows, skill rows (all three already exist as `CharacterAbilityGrid.vue`/`CharacterSaveList.vue`/`CharacterSkillList.vue` — see the Desktop IA pass; each already has a natural row-click hook since `CharacterSkillList.vue` already emits `select` for the context drawer), action attacks and spell attacks and spell saves (`CharacterActionsPanel.vue`), damage rolls (recorded, not yet re-rolled, §4).

**Language:** the brief's instruction to retire "Resolve" in favor of roll/action language is not yet done — confirmed directly against the current `CharacterActionsPanel.vue` (`Resolving…` / `Resolve` still present as of this document). Phase 3 (§14) is where this actually changes:

| Old | New |
|---|---|
| "Resolve" (attack/save actions) | "Roll Attack" / "Roll Save" (depending on `resolution.kind`) |
| — (no damage button exists yet) | "Roll Damage" |
| — | "Cast" for a non-attack, non-save spell already flagged in the Actions Panel's own note as *"still a real, castable action, just not one this system resolves automatically"* |
| — | "Use" for a passive/utility action with no resolution mechanic at all |

**Composable:** a new `app/composables/useWorldRolls.ts` replaces `useCharacterSheetRolls.ts` (Phase 2). Shape:

```ts
export function useWorldRolls(worldId: Ref<string>) {
  const history = ref<RollEventRecord[]>([])
  const pending = ref(false)

  async function requestRoll(input: RollRequestInput): Promise<RollEventRecord> { /* POST /rolls */ }

  return { history, pending, requestRoll }
}
```

`useCharacterSheetRolls.ts` itself is not deleted in Phase 2 — CLAUDE.md forbids deleting files without approval — it is simply stopped from being the call site any sheet component uses; a later, separately-approved cleanup pass removes it once nothing references it.

---

## 9. Roll history UI

**A new, dedicated tray — not the existing `WorldEntityContextDrawer`.** That drawer's whole shape (title/eyebrow/detail-lines/summary/chips, one entity at a time, §5's "detail" content mode already extended for the Character Sheet's action/spell/item drawer) is built for *one thing's* detail, not a live, ever-growing list. Forcing a roll feed into it would mean fighting its layout rather than reusing it.

Proposed: `app/components/world/WorldRollTray.vue` — **world-scoped, not sheet-scoped**, living in `components/world/` (not `components/characters/`) because table rolls, once Phase 6 exists, are a World-wide concern (visible from the World Map, an Encounter page, anywhere — not just the sheet that happens to have triggered one). Glass material (Design Language §2: "a frosted pane over the ink ground... for things that float above the page"), docked bottom-right on desktop, a bottom sheet on mobile — matching Beauty Pass §6.2's already-established bottom-sheet pattern for exactly this class of "float above without leaving the page" UI.

**First version shows**, per the brief: who rolled, what they rolled (label), the expression, individual dice (dimmed for any die a keep rule dropped — OpenDice's own `keptFlags` makes this a direct render, no computation), the modifier, the total, visibility (a small badge — "Private"/"Table"), and a relative timestamp.

A future **GM/admin roll log** (§14 Phase 5) is the same `GET /rolls` endpoint with `world.roll.see_gm` unlocking the `private` rows, presented as a fuller page/panel rather than a tray — no new endpoint, no new persistence.

---

## 10. Realtime / table rolls

**Recommendation: extend the pattern that already exists and is already deployed — do not add a new transport.**

`server/utils/inventory-transfer-realtime-bridge.ts` is Eldra's own, already-shipped answer to "push an event to connected clients on this stack": an in-process `Map` of connected SSE clients (`registerInventoryTransferRealtimeClient`), a matching predicate, and a `broadcastInventoryTransferRealtimeEvent` fan-out — explicitly labeled `transport: 'eldra-local-sse'` in its own payload. This works today, in production, behind the same Dokploy/Traefik setup this document's system will run behind, with zero additional infrastructure (no Redis, no pub/sub service, no WebSocket upgrade handling).

Proposed: `server/utils/roll-realtime-bridge.ts`, structurally identical — `registerRollRealtimeClient({ worldId, send })`, `broadcastRollEvent(record)` — and `server/api/worlds/[id]/rolls/stream.get.ts`, an SSE endpoint mirroring `server/api/worlds/[id]/entities/[entityId]/sheet/realtime/transfer-events.get.ts`'s own shape.

**Why SSE over WebSocket or Directus realtime:** one-directional (server → client) is all a roll broadcast ever needs — the client never needs to push anything over this channel, it already has `POST /rolls` for that. A WebSocket would add bidirectional plumbing this feature doesn't use. Directus's own realtime (WebSocket-based, subscribing to collection changes) is a real option but would mean every roll write goes through Directus's WebSocket layer specifically for broadcast timing, adding a dependency on Directus realtime being enabled/reachable in every deployment — SSE from the already-thin Nuxt server layer has one fewer moving part and matches the codebase's own precedent exactly.

**Named limitation, honestly:** like `inventory-transfer-realtime-bridge.ts`, an in-process `Map` means broadcast only reaches clients connected to *the same Nitro process*. Eldra's current deployment (CLAUDE.md's Deployment Checklist: a single Dokploy-managed container) has exactly one process, so this is not a gap today — it becomes one only if the deployment is ever horizontally scaled, at which point both this bridge and its inventory-transfer sibling would need a shared pub/sub layer (Redis, or Directus realtime as the shared bus). Not a Phase 6 problem; named for whoever eventually scales the deployment.

**Fallback:** if SSE proves awkward in some client environment, `GET /rolls?since=<cursor>` polling is the documented degrade path (the brief's own "polling fallback") — the `GET /rolls` endpoint already supports cursor-based paging (§7), so polling is not a separate code path, just a client that calls the same endpoint on an interval instead of holding an SSE connection open.

---

## 11. 3D dice — extending what already exists, not building new

**Eldra already has this.** `EldraDiceBox.client.vue`'s `rollResult(event, label)` (line 400) already:

- Treats its `event` argument as fully authoritative (`event.result` is the only source for every number shown).
- Runs `@3d-dice/dice-box@1.1.4`'s physics purely for show — its own comment: *"the individual tumbling dice may visually settle on different pips than `RollResult.rolls` reports... its own settled values are never read, trusted, or displayed anywhere."*
- Falls back gracefully (a timer-based `settle()`) if the physics engine never fires its completion callback.

**What Phase 7 actually is:** a new `summarizeRollEventRecord` sibling to the existing `summarizeRollEvent` in `app/utils/diceBoxRollSummary.ts`, understanding this document's `RollEventRecord.dice: RollDieGroup[]` (multiple groups, `sides`/`results`/`kept` per OpenDice's shape) rather than the Rules Engine's single-group `dice.count/faces` shape — and calling `EldraDiceBox`'s existing `rollResult()` with `{ ok: true, eventId: record.id, result: <adapted shape> }`. **`EldraDiceBox.client.vue` itself needs no change** — it already reads `event.ok`/`event.result`/`event.eventId` generically.

**Correcting the brief's assumption, explicitly:** the brief names `@3d-dice/dice-box-threejs` as the likely future renderer "because it supports predetermined outcomes." Eldra does not currently use that package — it uses `@3d-dice/dice-box@1.1.4` (confirmed in `package.json`), and that package's *lack* of a predetermined-outcome hook is not a gap Eldra stumbled into unknowingly — it's a **documented, deliberately-worked-around limitation**, already shipped, already correct (decorative physics, authoritative number). Whether `-threejs` genuinely supports frame-accurate predetermined faces is **unverified** — nothing in this research touched that package. Given the brief's own admission that *"frame-perfect physics synchronization is NOT required"* and *"everyone seeing a public roll must see the same die faces and total"* is already satisfied today by "same authoritative number, decorative-but-unsynchronized physics," the low-risk default for Phase 7 is: **change nothing about the renderer**, only adapt the data shape. Switching renderers to chase frame-accurate faces is a separate, larger decision (new dependency, bundle-size cost, §15) that should be raised on its own once product actually asks for synchronized *physics*, not just a synchronized *number*.

---

## 12. Dice skins / themes

Named in the brief, not designed here. `@3d-dice/dice-box`'s own theming API (already partially exercised — `EldraDiceBox.client.vue`'s prewarm config references an `assetPath`) is the natural hook once Phase 7 ships; a player-facing skin picker is Phase 8, and its scope (per-player preference storage, a skin catalogue, whether skins are free or a monetization surface) is explicitly out of this document's scope to invent.

---

## 13. Security / trust boundaries

- **Server is authoritative.** Every number a player sees came from a server response to `POST /rolls`, never from client-side arithmetic.
- **Client never provides final die faces, a total, or a seed.** OpenDice's `RollContext.rand` is a test-only escape hatch (§1) and must never be constructed from request-body data in production code — this is a code-review-gate-worthy invariant, the same weight `rules-engine.md` §17.4 already gives seed provenance.
- **Client may request a roll *source*** (`sourceType`/`sourceKey`/`sourceId`), never a pre-computed bonus or expression except for `custom`, and even then the server still rolls it.
- **Server validates World access** (`world.read` at minimum) and **`world.roll.execute`** before doing anything (§5, §7) — identical enforcement to the already-shipped `/rules/roll` endpoint.
- **An honest, currently-unclosed gap:** "the server validates that the user can roll for that actor" is only *partially* true today, and this document does not paper over it. Character ownership does not exist yet in Eldra (CLAUDE.md's Eldra 2.1 roadmap item; confirmed no `owner_account_id`/equivalent field exists anywhere in the character data model today). Until that ships, `world.roll.execute` is enforced at the **World** level only — any World member holding that capability can request a roll naming any character in that World as `actorCharacterId`. This is not a new hole this system creates; it is the exact same trust boundary every other Character Sheet mutation (`useCharacterMutations.ts`) already operates under today. Flagged in §15, not solved here.
- **Server stores the result before broadcasting it** — a `roll_events` row exists before `broadcastRollEvent` ever fires, so a crash mid-broadcast never leaves a roll that happened but was never recorded.
- **GM visibility must not depend on client cooperation** — enforced entirely in `GET /rolls`'s server-side filter (§5), never by a client choosing not to render a row it received.
- **Fail closed on visibility:** an omitted or malformed `visibility` in a `POST /rolls` body defaults to `private`, never `table` — the safer failure direction when in doubt.
- **Rate limiting** is not designed in this document (nothing in the brief asked for it beyond `rules-engine.md` §24.5's generic "per-user rate limits on evaluation-heavy endpoints" note) but is named in §15 as a real risk given a roll endpoint is, structurally, an easy target for a client that fires it in a tight loop.

---

## 14. Phase plan

Each phase is independently shippable, matches the codebase's own "small, reviewable diffs" convention, and states what it must not touch.

### Phase 0 — OpenDice spike and adapter contract

**Goal.** `pnpm add opendice`; write `app/lib/rolls/dice-adapter.ts`, a thin pure wrapper: `rollFormula(expression: string, ctx?: { advantage?; bonuses?: (number|string)[] }): RollDieGroup[] & totals`, translating OpenDice's `RollResult` into this document's `RollEventRecord`-shaped dice/modifier/total fields (§6). No persistence, no API route yet.
**Files.** `package.json` (new dependency), `app/lib/rolls/dice-adapter.ts`, `app/lib/rolls/types.ts` (§6's types).
**Non-goals.** No route, no Directus schema, no UI change, no touching `roll-engine.ts`/`rng.ts`/`character-combat.ts`.
**Tests.** Pure-function unit tests (plain Vitest, no Nuxt auto-import, matching `tests/rules/roll-engine.test.ts`'s own convention): formula validation rejects malformed input via `parseFormula`; `1d20+7` round-trips into one `RollDieGroup` with the right `sides`/`total`; `4d6kh3` reports 4 `results` and exactly 3 `kept`/`keptFlags: true`; advantage/disadvantage via `RollContext.advantage` produces `advantageState` correctly; negative bonuses via `RollContext.bonuses: [-2]` work without the string-concatenation workaround `useCharacterSheetRolls.ts` needed.
**Manual verification.** None beyond the test suite — nothing is reachable from the UI yet.

### Phase 1 — Roll event model + server-authoritative custom roll endpoint

**Goal.** `roll_events` Directus collection (§6) provisioned via `scripts/directus/create-roll-events-schema.mjs`, added to `scripts/directus/bootstrap.mjs`'s sequence. `server/utils/roll-events.ts` (create/list, both against Directus via the existing `directusRequest`/`directusServiceRequest` client — CLAUDE.md's "the only sanctioned way to talk to Directus," not a new local `dxFetch`). `POST /api/worlds/:id/rolls` and `GET /api/worlds/:id/rolls`, `custom` source type only.
**Files.** `scripts/directus/create-roll-events-schema.mjs`, `scripts/directus/bootstrap.mjs` (append), `server/utils/roll-events.ts`, `server/api/worlds/[id]/rolls/index.post.ts`, `server/api/worlds/[id]/rolls/index.get.ts`.
**Non-goals.** No sheet UI wiring yet (that's Phase 2) — this phase is reachable only via direct API calls / a scratch test page. No visibility beyond the two Phase-1 states. No realtime.
**Tests.** `server/utils/roll-events.ts` unit-tested with Directus mocked at the module boundary (matching `character-combat.test.ts`'s own convention of mocking one collaborator, keeping the rest real). Capability enforcement tested (missing `world.roll.execute` → 403, matching the existing `/rules/roll` route's own tested behavior).
**Manual verification.** `curl -X POST .../rolls -d '{"sourceType":"custom","expression":"2d6+3","visibility":"table"}'` returns a 201 with a real `RollEventRecord`; a malformed expression (`"99999999d6"`) returns 400 with OpenDice's own limit message; `GET /rolls` lists it back; deploying introduces new schema, so `node scripts/directus/bootstrap.mjs` must be run manually per CLAUDE.md's Deployment Checklist — call this out explicitly in the PR.

### Phase 2 — Character Sheet click-to-roll for abilities/saves/skills

**Goal.** `app/composables/useWorldRolls.ts` (§8); wire `CharacterAbilityGrid.vue`/`CharacterSaveList.vue`/`CharacterSkillList.vue` row clicks to `requestRoll({ sourceType: 'ability'|'saving_throw'|'skill', sourceKey, actorCharacterId })`. Server derives the bonus per §3/§4 (re-reading `getDerivedCharacter`, never trusting a client-sent bonus). Retires `useCharacterSheetRolls.ts` as an active call site (file stays on disk per CLAUDE.md's no-unapproved-deletion rule).
**Files.** `app/composables/useWorldRolls.ts` (new), the three panels above (add a roll click handler alongside their existing `select`-to-drawer handler — a skill row now does two things: open detail on most of the row, roll on an explicit control, matching how `CharacterActionsPanel.vue` already separates "open detail" from "Resolve" as two distinct affordances on one row), `server/utils/roll-events.ts` (extend with the `ability`/`saving_throw`/`skill` derivation path from §3).
**Non-goals.** No attack/spell rolls yet (Phase 3). No "Resolve" language change yet (Phase 3) — that's scoped to the Actions tab specifically, not these rows.
**Tests.** `server/utils/roll-events.ts`'s new derivation path unit-tested against a real `getDerivedCharacter` call (mirroring `character-combat.test.ts`'s "Rules Runtime itself is REAL... built via createWorldRuntime from the actual eldra-dnd5e-2024 package on disk" convention, not a mock of the Rules Engine).
**Manual verification.** Clicking a Stealth row on a real character rolls `1d20` + that character's real, currently-displayed Stealth bonus; the number shown matches what `CharacterSkillList.vue` already displays as the static bonus; a second click produces a different roll (no caching/staleness).

### Phase 3 — Actions tab roll integration and removal of "Resolve"

**Goal.** `CharacterActionsPanel.vue`'s attack/save controls become "Roll Attack"/"Roll Save" per §8's table, calling `requestRoll({ sourceType: 'action_attack'|'spell_attack'|'spell_save', sourceId })`; a `damage` roll_events row is recorded (not re-rolled, §4) alongside `character-combat.ts`'s existing resolution response, additively.
**Files.** `CharacterActionsPanel.vue`, `server/utils/character-combat.ts` (additive `roll_events` write only — its own dice math is untouched), `server/utils/roll-events.ts` (action-derivation path from §3, `damage`-recording path from §4).
**Non-goals.** `character-combat.ts`'s RNG (`rng.ts`'s `createSeededRng`) is **not** replaced with OpenDice in this phase — see §4's explicit reasoning and §15's deferred decision.
**Tests.** `tests/server/utils/character-combat.test.ts` must stay green unchanged (server math untouched); new tests cover only the additive `roll_events` write.
**Manual verification.** Resolving a melee attack still applies damage exactly as before; a new roll_events row now exists recording that same attack, visible in the tray (§9, once Phase 4 ships it) with the same numbers combat's own response already showed.

### Phase 4 — Roll history tray

**Goal.** `WorldRollTray.vue` (§9), polling `GET /rolls` (no realtime dependency yet — Phase 6 upgrades the transport, not the UI's data contract).
**Files.** `app/components/world/WorldRollTray.vue`, mounted from `world-workspace.vue` (a persistent, world-scoped surface, not sheet-scoped, matching §9's own reasoning) or from the Character Sheet page directly if product prefers it scoped narrower initially — a small decision point, not an architectural one.
**Non-goals.** No GM-only content shown yet (Phase 5) — the tray only ever requests as the current user and only ever sees what `GET /rolls` already filters to.
**Tests.** None beyond existing coverage — this is presentation-only against an already-tested endpoint; if a component-test harness exists by this phase, add one, per Beauty Pass's own precedent of not blocking on a harness that doesn't exist yet.
**Manual verification.** Rolling from Phase 2/3 populates the tray in near-real-time (polling interval TBD, e.g. 5s); dropped dice from a `kh`/`kl` roll render dimmed per `keptFlags`.

### Phase 5 — GM-visible roll log / future DM screen hook

**Goal.** `world.roll.see_gm` actually enforced (§5) — a GM/Owner sees `private` rows from other players; a fuller "Roll Log" panel/page (reusing `GET /rolls`, no new endpoint) as the seed of a future DM screen.
**Files.** `server/utils/roll-events.ts` (visibility filter, if not already complete from Phase 1), a new admin-adjacent page or panel (exact placement is a product decision, not architecturally load-bearing — could be `admin.vue`-adjacent or its own route).
**Non-goals.** No `blind_dm`/reveal flow yet (Phase 6 or later — `POST /rolls/:id/reveal` is named in §7 but not built here).
**Tests.** `GET /rolls` visibility filtering tested directly: a Player principal never receives another player's `private` row; a GM principal does.
**Manual verification.** Log in as a Player, confirm the tray never shows another player's private rolls; log in as GM, confirm it does.

### Phase 6 — Public table rolls with realtime broadcast

**Goal.** `server/utils/roll-realtime-bridge.ts` + `GET /rolls/stream` (§10), `WorldRollTray.vue` upgraded from polling to SSE (its data contract from Phase 4 does not change, only the transport).
**Files.** As named in §10, plus `WorldRollTray.vue`'s fetch call swapped for an `EventSource`.
**Non-goals.** No horizontal-scaling fix for the in-process bridge limitation (§10, §15) — matches the exact scope `inventory-transfer-realtime-bridge.ts` itself already shipped at.
**Tests.** The bridge's registration/broadcast/matching logic unit-tested the same way its inventory-transfer sibling would be (no existing test found for that file — flagged as a pre-existing gap, not one this phase need fix, but new code here should not repeat it: add tests for the new bridge even if the old one has none).
**Manual verification.** Two browser sessions in the same World; a `table` roll from one appears in the other's tray within the polling/SSE interval with no page reload; a `private` roll never appears in the other session at all.

### Phase 7 — 3D dice presentation using predetermined results

**Goal.** `summarizeRollEventRecord` (§11) adapting `RollEventRecord` into `EldraDiceBox.client.vue`'s existing `rollResult()` input shape; wire the roll tray's (or the sheet's) roll buttons to call `rollResult()` after `requestRoll()` resolves.
**Files.** `app/utils/diceBoxRollSummary.ts` (new sibling function), the click handlers from Phase 2/3 (add a `rollResult()` call after the await), **not** `EldraDiceBox.client.vue` itself (§11 — no change needed).
**Non-goals.** No renderer swap to `@3d-dice/dice-box-threejs` or any other package — see §11's explicit correction of the brief's assumption. That remains a separate, later, explicitly-approved decision if frame-accurate faces are ever actually requested.
**Tests.** `summarizeRollEventRecord` unit-tested the same way `diceBoxRollSummary.test.ts` already tests its sibling — pure function, no DOM.
**Manual verification.** Clicking a roll shows the existing dice-box animation, settling on the already-shown authoritative number exactly as Combat Resolution's rolls already do today via `rollResult()`.

### Phase 8 — Dice skins / themes

**Goal.** Not designed in this document (§12) — scoping this phase is itself the first deliverable when it starts.
**Files, tests, manual verification.** TBD at that time.

### Phase checklist

- [ ] Phase 0 — OpenDice spike and adapter contract
- [ ] Phase 1 — Roll event model + server-authoritative custom roll endpoint
- [ ] Phase 2 — Character Sheet click-to-roll (abilities/saves/skills)
- [ ] Phase 3 — Actions tab roll integration, retire "Resolve" language
- [ ] Phase 4 — Roll history tray
- [ ] Phase 5 — GM-visible roll log
- [ ] Phase 6 — Public table rolls + realtime broadcast
- [ ] Phase 7 — 3D dice presentation (predetermined results)
- [ ] Phase 8 — Dice skins/themes

---

## 15. Risks / open questions

| # | Risk | Notes |
|---|---|---|
| 1 | **Exact OpenDice result shape** for multi-group formulas (`1d8+1d4+3`) feeding the sheet's single-number displays | §1/§6 already account for `dice: DieGroup[]` being plural; every roll TYPE in §4 happens to produce exactly one group today (ability/skill/save are always `1d20`), so this is currently theoretical — flagged for when `custom` rolls (which CAN produce multiple groups) reach the tray UI. |
| 2 | **Notation limits are OpenDice's, not Eldra's, to choose** | `MAX_DICE=1000`/`MAX_SIDES=2^32`/etc. (§1) are hardcoded in the library. If Eldra ever needs a *tighter* limit (e.g. reject `500d6` even though OpenDice would allow it, for abuse-prevention reasons narrower than the library's own), that's an Eldra-side pre-check before calling `roll()`, not a library configuration — not designed here because nothing in the brief asked for a limit tighter than OpenDice's own. |
| 3 | **Advantage/disadvantage SOURCE trust** | `RollContext.advantage` is honored by OpenDice mechanically, but *whether* a given roll should have advantage (a condition, a class feature, a spell) is decided client-side today and not independently re-derived server-side in this plan — the same trust-boundary gap §13 names for actor ownership generally. A future phase could re-derive advantage eligibility from the character's own conditions the same way §3 re-derives bonuses, but that is real, separate work not scoped here. |
| 4 | **Critical hit semantics live in Eldra, not OpenDice** | Confirmed and by design (§1's own research finding) — a natural 20 is visible on the `DieGroup.naturalHigh` flag; deciding that a natural 20 means "critical hit, double damage dice" is `character-combat.ts`'s job (already does this today) or, for the new ability/skill rolls, simply not a concept that applies (a Stealth check has no "critical success" rule in 5e) — no code anywhere should hardcode "20 = crit" outside combat resolution. |
| 5 | **Persistence volume / pruning** | No retention policy proposed (§6) — an open question for whoever revisits this after real usage data exists. |
| 6 | **Realtime deployment behind Dokploy/Traefik** | The in-process bridge (§10) works today because there is one process; it silently stops broadcasting cross-process the moment the deployment scales horizontally, with no error — this needs to be caught by a human noticing "rolls stopped appearing for other players" if it ever happens, since nothing in this design detects it. |
| 7 | **Permissions for GM visibility** | `world.roll.see_gm` exists and is mapped to roles already (§5) but has zero existing call sites — Phase 5 is genuinely the first code to exercise it, so its exact behavior under `temporarySingleUserMode`'s Phase-2-migration-gap fallback (`authorization.ts:368-374`) should be explicitly tested, not assumed to "just work" by analogy to capabilities that already have callers. |
| 8 | **Public table roll recipient rules** | "Everyone in the World" (via `world.read`) is Phase 1–4's definition of `table`; whether a `table` roll should actually mean "everyone in the *active Encounter*" once encounters are common is a real product question `encounter_only` (§5) exists to eventually answer, not resolved now. |
| 9 | **3D dice renderer bundle size** | Not currently a live risk (§11 — no renderer swap proposed); becomes one only if a future, separate decision adopts `@3d-dice/dice-box-threejs` or similar, at which point its bundle-size cost (a full three.js dependency vs. the currently-installed physics-only `@3d-dice/dice-box`) should be measured before committing. |
| 10 | **Character-level roll authorization gap** | Named plainly in §13 — not closable until Eldra 2.1's character-ownership milestone ships. This document does not attempt to build ownership early to close it; that would be exactly the kind of unrequested, out-of-scope architectural expansion CLAUDE.md's AI Rules warn against. |
| 11 | **Whether `character-combat.ts` should ever migrate its own dice math onto OpenDice** | Explicitly deferred (§4, §14 Phase 3) — a separate, larger, higher-risk decision touching live, tested gameplay code, not assumed or scheduled by this document. |

---

## 16. Test strategy summary

Matches the codebase's existing, only-gate-that-exists convention (CLAUDE.md: "no automated test suite beyond lint + typecheck + unit tests" is inaccurate as written elsewhere in this repo's own docs — there ARE ~1,950+ Vitest unit tests, see `tests/`; lint/typecheck/`pnpm build` remain the CI gates):

- **Pure modules** (`app/lib/rolls/dice-adapter.ts`, `app/lib/rolls/types.ts`, `app/utils/diceBoxRollSummary.ts`'s new sibling) — plain Vitest, no Nuxt auto-import, explicit imports, mirroring `tests/rules/roll-engine.test.ts` and `tests/utils/diceBoxRollSummary.test.ts`'s own existing conventions exactly.
- **Server orchestration** (`server/utils/roll-events.ts`) — Directus mocked at the module boundary; for any path that re-derives a Rules Engine value (Phase 2's ability/save/skill derivation), the Rules Runtime itself stays REAL (built from the actual `eldra-dnd5e-2024` package on disk), matching `character-combat.test.ts`'s own explicit precedent, not a stubbed Rules Engine.
- **Capability enforcement** — every new route tested for both the 401 (no principal) and 403 (wrong capability) cases, matching `server/api/worlds/[id]/rules/roll.post.ts`'s already-tested shape.
- **Determinism where it matters** — OpenDice's `RollContext.rand` (test-only, §1/§13) is the seam a test uses to pin a specific roll for assertion purposes, exactly the same role `character-combat.test.ts` already gives `createSeededRngMock` today, never a path production code touches.

---

## 17. Project Knowledge Review

**1. Why should Eldra use OpenDice instead of writing dice notation parsing from scratch?**

Because the parsing problem here is not the same problem `app/lib/rules/roll-engine.ts` already solved. That module executes RollSpecs an author already built as structured objects via EEL constructor functions (`keepHighest(4d6,3)`) — it has never needed to parse a *string* a player free-typed, and its DiceSpec model doesn't expose the notation grammar (`kh`/`kl`/`adv`/`dis`/`!`/`!p`/`min`/`max`/`x`) a real tabletop player expects at all. Hand-writing that grammar, its edge cases (`2d20adv` needing at least two dice, suffix binding to a group vs. the whole sum, `4d6x10+5` not double-counting the multiplier), and its exhaustive "show every die, including dropped ones" result shape from scratch would be re-deriving a solved, tested, MIT-licensed, zero-dependency library extracted from a real production app — directly against CLAUDE.md's own "reuse existing systems before introducing new abstractions" and "prefer extraction/moving code over rewriting it," applied here to *an external system already doing the job* rather than an internal one.

**2. Why must Eldra keep roll authority server-side?**

Because a dice roll's entire value *as a game fact* depends on nobody being able to have influenced it after the fact — the product goal stated at the top of the brief, "a trustworthy roll system for tabletop play," is meaningless if a client could compute or adjust the number shown. This is not a new principle for Eldra: `rules-engine.md` §15.8 already states the server is "authoritative... for all randomness," `§17.4` already requires an explicit, server-generated seed for every Rules Engine roll, and `character-combat.ts`/`world-rules-roll.ts` already enforce exactly this for the two roll paths that predate this document. This document extends that same, already-established principle to a third, broader surface rather than introducing it for the first time.

**3. Why is 3D dice presentation rather than authority?**

Because the physical die shown on screen and the game fact it represents are two different things that only *look* connected. `EldraDiceBox.client.vue` already proves this in production: `@3d-dice/dice-box@1.1.4`'s physics simulation has no hook to force a die to land on a chosen face, so the die you watch tumble may show different pips than the number Eldra reports — and that's fine, because the number was never coming from the physics engine in the first place. Letting the animation decide the result would mean the "trustworthy" number in the brief's own product goal is actually just whatever a client-side physics library happened to simulate that frame — the opposite of authoritative, and impossible to make fair or auditable across two different players' devices, which may not even render the same physics step-for-step.

**4. What is the first implementation phase after this document is approved?**

**Phase 0** (§14): `pnpm add opendice` and `app/lib/rolls/dice-adapter.ts` — a pure wrapper around `roll()`, unit-tested, with zero API route, zero Directus schema, and zero UI change. Nothing else in this document is reachable until that adapter exists and its tests pass.

---

## 18. Appendix — Evidence Index

Files read in full or in targeted sections while researching this document, beyond CLAUDE.md (read in full, per this task's own first instruction):

**OpenDice itself** — `npm view opendice`, then `npm pack opendice@2.0.0` into `/tmp/.../scratchpad/opendice-research/` (not installed into this project): `README.md`, `package.json`, `dist/index.d.ts`, `dist/roll.d.ts`, `dist/formula.d.ts`, `dist/rng.d.ts`, `dist/rng.js`, `dist/formula.js`.

**Eldra's existing roll systems** — `app/lib/rules/roll-engine.ts`, `app/lib/rules/roll-service.ts`, `app/lib/rules/rng.ts`, `app/composables/useCharacterSheetRolls.ts`, `server/utils/world-rules-roll.ts`, `server/api/worlds/[id]/rules/roll.post.ts`, `server/utils/character-combat.ts` (targeted grep for RNG usage), `app/components/EldraDiceBox.client.vue` (targeted sections, including its own documented `@3d-dice/dice-box@1.1.4` limitation), `app/utils/diceBoxRollSummary.ts`, `tests/rules/roll-service.test.ts`, `tests/server/utils/character-combat.test.ts` (targeted).

**Permissions/ownership** — `server/utils/authorization.ts` (full), `server/utils/world-memberships.ts` (targeted grep), `.github/docs/architecture/ownership-and-permissions.md` (targeted: §8.5–8.7 capability table), `app/middleware/admin.ts`, `app/composables/useAuth.ts` (targeted grep, `isAdmin` vs. World-role distinction).

**Rules Engine architecture** — `.github/docs/architecture/rules-engine.md` §17 (Action/Check/Roll Model, full), §24 (Permissions, full).

**Existing realtime precedent** — `server/utils/inventory-transfer-realtime-bridge.ts` (full), locating its SSE route via grep.

**Directus/persistence conventions** — `scripts/directus/create-scene-layer-objects-schema.mjs` (targeted, the schema-script helper convention and its own `maps.id` type-mismatch scar), `server/utils/character-notes.ts` (targeted, `block_instances` shape).

**Character Sheet desktop IA context** (for §8's row-click integration points) — `app/components/characters/CharacterActionsPanel.vue`, `CharacterSkillList.vue`, `CharacterReferencePanels.vue`, `CharacterAbilityGrid.vue`, `CharacterSaveList.vue` (current on-disk state, post-Desktop-IA-pass).
