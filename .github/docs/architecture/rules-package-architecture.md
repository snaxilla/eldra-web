# Eldra Rules Package Architecture

Status: **Approved. Not implemented.** No module, collection, field, or package described as new in
this document exists in the repository today, except where explicitly marked *(exists)*. The four
decisions §18 asked for have been made and are recorded there; the document has been updated to
reflect them rather than leaving them open.

Companion to, and subordinate in scope to,
[rules-engine.md](./rules-engine.md) (the engine that evaluates packages — §11 defines the package
*format*, which this document does not redesign),
[rules-package-infrastructure.md](./rules-package-infrastructure.md) (storage, publication,
activation — Q1–Q15 already answered),
[world-configuration.md](./world-configuration.md) (what a World owns, §A/§B/§I),
[expression-language.md](./expression-language.md) (EEL — the authoring surface for formulas), and
[content-source-architecture.md](./content-source-architecture.md) (the Content Platform this
document draws a boundary against).

**What this document adds that none of the above contains:** the **Content ↔ Rules link model**. Every
prior document defines one side of that boundary rigorously and then stops at it. `rules-engine.md`
ADR-018 names the gap explicitly and defers it — *"Referential integrity across streams… Revisit
when cross-stream references become common enough to need a real link model."* That moment has
arrived (§2.1), and §8 is the link model.

---

# 1. Executive Summary

**The Rules Platform is not missing. It is unreachable from the Content Platform.**

`app/lib/rules/` is 22 modules and ~8,400 lines of complete, tested, pure engine: parser, AST,
evaluator, dependency graph, modifier pipeline, roll engine, package validation, world config
resolution. `server/utils/world-runtime-service.ts` composes it into a live
`getWorldRuntime(worldId)` *(exists)*. None of it is broken. What does not exist is **any package
worth evaluating**, and **any path by which a Character's chosen Species, Class, or Background can
reach the engine**.

**Seven decisions carry this document.**

1. **A Rules Package defines the *slots and the laws*. A Content Pack declares *which slots a
   particular thing fills*. A Character records *which things were chosen*. The Engine computes the
   consequence.** This one sentence is the whole architecture; §8 is its mechanism and §3 is its
   justification.
2. **Content references Rules by Definition ID, in the Rules Package's own vocabulary — never by
   formula, and never the other way around.** A Class declares `grants: ["value:save.str.proficient"]`.
   It never declares what a saving throw *is*.
3. **A new artifact — the Content Entry's *Rules Facet*** — carries those references. It is produced
   at **publication** time by the content adapter, never read at runtime from raw source JSON. This
   is what makes "the Rules Engine never consumes raw 5etools data" structurally true rather than
   merely intended.
4. **`systemKey` stops being decorative and becomes a *Rules Vocabulary* identifier.** rules-engine.md
   §2.3 recorded that `systemKey` "is a decorative field, not a live seam." It becomes the live seam:
   a Rules Package **provides** a vocabulary; a Content Pack **targets** one; a mismatch is a
   **Binding Gap** (§9), not an error.
5. **Rule Categories are a closed, engine-versioned *taxonomy*, and the engine ignores them.** They
   organise authoring, sheet layout, and completeness reporting. They are deliberately NOT evaluation
   concepts — the engine's primitive set stays the five of rules-engine.md §12.1.
6. **Three supporting types the prior documents named but never shaped — Table, Progression, and
   ChoiceSet — are specified here** (§7.4–§7.6), because the first real package cannot be authored
   without them and `types.ts` explicitly declined to invent them.
7. **Character creation becomes package-and-content-declared, not Eldra-declared.** The 2024 rules
   moved Ability Score Increases and Origin Feats from Species onto Backgrounds. Eldra must be able
   to absorb that as *data*, which means no Eldra code may ever contain the sentence "a Species
   grants ability score increases" (§12).

**What I think is wrong with the current shape, stated plainly:**

- **The only published Rules Package is a self-declared non-game.** `packages/eldra-generic-d20/`'s
  own manifest reads *"Not a game — a runtime proof."* It declares one attribute (`vitality`), and
  its `value:proficiency_bonus` is `storage: "stored", default: 2` — a **constant, not a
  progression**. Any plan that treats "the World Rules Package" as an available input is planning
  against something that does not exist (§2.2).
- **The Content Platform's `data` field is a licensing and coupling hazard pointed directly at the
  engine.** `ContentPublicationCandidate.data` is untouched upstream 5etools JSON *(exists)*. It is
  correct for presentation, which already resolves it behind
  `app/lib/content-presentation/` *(exists)*. If the engine is ever allowed to read it, §30's
  licensing separation and §10's dependency direction both collapse in one commit. §8.4 forbids it
  structurally rather than by convention.
- **"Rules Package" and "Content Pack" are the same words to a user and must not be.** Both are
  versioned, both are published, both bind to a World, both have manifests and licenses. The
  vocabulary is close enough that the distinction will be lost in the UI unless it is designed
  (§3.4).

---

# 2. Current Repo Findings

**Fact** = verified this session against the repository. **Consequence** = what follows.

## 2.1 The link model ADR-018 deferred is now blocking

**Fact.** `rules-engine.md` ADR-018 ("Content and mechanics import independently") records the
cross-stream reference problem and defers it: *"Revisit when cross-stream references become common
enough to need a real link model."* Character Builder/Sheet Phase 4 (deriving proficiency from a
Class) was cancelled on exactly this: Character Assembly carries a Class's **presentation model** —
the formatted string `"Saving Throw Proficiencies: Strength, Constitution"` — and nothing else,
because `world-content-catalogue.ts` deliberately strips `data` *(exists)*.

**Consequence.** This is the first genuinely blocking cross-stream reference, and it is not an
edge case: it is the second-most-common thing a character sheet does. §8 is the revisit ADR-018
asked for.

## 2.2 The only package that exists is a proof, and it disproves the assumption

**Fact.** `packages/eldra-generic-d20/definitions.json` contains eight definitions: `value:vitality`,
`value:level`, `value:proficiency_bonus` (**stored, constant `2`**), `value:vitality.mod` (derived),
one collection, one source, two roll specs. There is no six-ability model, no save, no skill, no
progression. A repository-wide search for `value:ability` or `value:skill` returns only fixtures
inside `tests/rules/`.

**Consequence.** "Author the first real package" is not a step inside another phase; it is its own
milestone with its own review, and every phase that consumes rules is blocked behind it (§14).

## 2.3 The engine is complete and reachable; only the content is missing

**Fact.** `getWorldRuntime(worldId)` *(exists)* composes `loadWorldRulesConfig` →
`loadPublishedPackage` → `createWorldRuntime`, returning three honest states (unconfigured /
configured-but-broken / ok). `EvaluationSession` + `evaluate(definitionId, session)` *(exists)* is
the evaluation entry point. `server/utils/world-rules-roll.ts` *(exists)* already drives a real roll
through it end to end.

**Consequence.** Nothing in this document requires an engine change. Every proposal below is either
package **content**, a **manifest field**, or a **bridge module** outside `app/lib/rules/`. That
constraint is deliberate and is restated as a hard rule in §13.3.

## 2.4 The actor bridge is named as excluded work in three places

**Fact.** `world-rules-roll.ts`'s own header: *"ActorState is a minimal, empty placeholder… this
task's own NON-GOALS exclude the actor bridge."* `useCharacterSheetRolls.ts` says the same. `ActorState`
*(exists)* is fully specified in `types.ts` and populated by nobody.

**Consequence.** The bridge (§11.2) is a known, deliberately-deferred, well-specified hole — not a
discovery. It is the natural first consumer once a package exists.

## 2.5 `systemKey` is present on every content entry and read by nothing mechanical

**Fact.** `ContentPublicationCandidate.systemKey` is `'dnd5e'` on every published entry *(exists)*.
Its only live consumer is `app/lib/content-presentation/index.ts`'s resolver dispatch *(exists)*.
rules-engine.md §2.3 already recorded it as decorative.

**Consequence.** The field is in the right place with the wrong resolution. §9.1 sharpens it into a
vocabulary identifier rather than introducing a parallel field beside it.

## 2.6 Three supporting definition types are named everywhere and shaped nowhere

**Fact.** `types.ts` states it directly: *"Table, Progression, and ChoiceSet are named as 'kept'
supporting types (§12.2) but no shape for any of the three appears anywhere in the architecture
document — they are deliberately NOT modeled here rather than invented."*

**Consequence.** A 2024 D&D package needs a Progression (proficiency bonus by level) and a ChoiceSet
(pick two skills from a class list) on day one. §7.4–§7.6 specify all three, which is the smallest
addition that unblocks authoring.

## 2.7 A World can already activate a package, and a GM already has the UI

**Fact.** `server/api/worlds/[id]/rules/activate.post.ts` *(exists)* and
`app/components/admin/rules/AdminRulesActivationPanel.vue` *(exists)*, with ready/broken/empty
states already modelled.

**Consequence.** Activation is solved. This document adds exactly one thing to it: what happens when
the activated Rules Package's vocabulary does not match a bound Content Pack's (§9.3).

---

# 3. Purpose, and the Distinction That Defines It

## 3.1 Purpose

**This document defines what a Rules Package IS.** It does not define how any game works.

A Rules Package is the answer to *"what kind of game is this World running?"* — expressed as data,
versioned, immutable once published, and evaluated by an engine that knows nothing about any
specific game.

## 3.2 The distinction, stated three ways

The same boundary, from three angles, because it is the thing most likely to be lost:

| | Rules Package | Content Pack |
|---|---|---|
| Answers | *How does this game work?* | *What exists in this game?* |
| Grammar | **Verbs and laws** | **Nouns and instances** |
| Cardinality | One per World (§10.2) | Many per World *(exists)* |
| Changes when | The system changes (2014 → 2024) | The catalogue grows (a new sourcebook) |
| Authored by | A system designer | A content publisher |
| Contains | Definitions, formulas, progressions, categories | Species, Classes, Backgrounds, Spells, Items, Monsters |
| Never contains | Fireball | The ability modifier formula |

## 3.3 The load-bearing examples

Restated from this document's own brief, because they are the acceptance criteria for every
decision below:

- **A Rules Package never owns Fireball.** Fireball is one spell out of hundreds; the *rule* is what
  a spell slot is, what a saving throw against a spell resolves to, and how spell attack rolls work.
- **A Content Pack never owns the Ability Modifier formula.** Every 5e creature uses the same
  `floor((score − 10) / 2)`. Putting it on the Dwarf would mean re-deriving it on the Elf.
- **A Species references a Rule. It does not contain the Rule.** Dwarf declares *"grants Darkvision
  60ft"* by reference; the Rules Package declares what Darkvision **is**.
- **A Fighter grants proficiency. The Rules Package defines what proficiency means.** The Fighter
  declares *which* saves; the package declares that a proficient save adds the proficiency bonus.

## 3.4 The naming hazard, and the mitigation

Both artifacts are versioned, published, immutable, licensed, world-bound, and called "Pack" or
"Package." A GM will conflate them. The mitigation is not documentation, it is **UI and vocabulary
separation**, specified here so it is not left to whoever builds the screen:

- Rules are **activated** (one, exclusive, replaces). Content is **bound** (many, additive,
  accumulates). The verbs must never be swapped, in code or in copy.
- Game Admin must present them as two distinct sections, never one "Packages" list.
- A World's rules answer is singular and prominent ("This world runs *D&D 2024*"); its content
  answer is a list ("Bound content: XPHB, XMM").

---

# 4. Goals

1. A World can run a rules system Eldra's authors never anticipated, with **no change to Eldra
   application code** (inherited from rules-engine.md §3.1–§3.2, restated as this document's own
   acceptance test).
2. **The same Content Pack can run under different Rules Packages**, where the vocabularies agree —
   an XPHB content catalogue under a 2024 rules package, or under a house-ruled variant of it.
3. **Rules and Content version independently.** A monster-manual refresh must never force a rules
   review; a rules errata must never force a content re-import (ADR-018, preserved).
4. Every derived number can explain itself in terms a player understands (inherited; traces already
   exist *(exists)*).
5. **A rules edition change is a data change.** Moving Ability Score Increases from Species (2014) to
   Backgrounds (2024) must require zero Eldra code changes (§12.4).
6. **Licensing separation survives contact with the engine.** Mechanics may be authored in original
   wording; prose stays on the content side; the engine reads neither raw source nor prose (§8.4,
   inheriting rules-engine.md §30).
7. A technically capable GM can eventually author rules without writing application code.

---

# 5. Non-Goals

- **Modelling any specific game.** This document defines the container. Whether the 2024 Fighter gets
  two skills or three is package content, reviewed separately.
- **Redesigning the Rules Engine.** `app/lib/rules/` is complete and correct; §13.3 forbids changing
  it as part of adopting this document.
- **Redesigning the Content Platform.** `content-source-architecture.md`'s provider model stands
  unchanged. §8 adds one optional artifact to a content entry; it moves no existing seam.
- **Multi-package composition.** One active Rules Package per World, unchanged from rules-engine.md
  §11.6 and world-configuration.md §A.1.
- **Package marketplace, signing, or trust tiers.** Design to permit; build none (rules-engine.md
  §22.5).
- **Executable package code.** Ever, in this design (ADR-011, preserved).
- **Authoring the 2024 D&D package.** That is the *next* task, not this one (§14.1).
- **Cross-system character conversion.** Refused, not coerced (rules-engine.md §13.7).
- **Rules-driven combat automation, reactions, triggers, or an event bus.** Eldra 3.0 territory.

---

# 6. Rule Categories

## 6.1 What a category is, and what it is emphatically not

**A Rule Category is descriptive taxonomy. The engine ignores it entirely.**

This must be stated first because the temptation runs the other way. rules-engine.md §12.1 already
establishes that `tags` are "package-defined taxonomy; engine ignores," and §12.2 collapses thirty
candidate concepts into five primitives. Nothing here reopens that. A category never changes how a
definition evaluates, never appears in the dependency graph, and never gates an expression.

What it *does* do is answer four questions the engine cannot:

| Question | Asked by |
|---|---|
| Where does this definition live in the authoring tree? | Package authors, the future editor |
| Which sheet region should render it? | Character Sheet layout (§13.2) |
| Which parts of the system has this package implemented? | Completeness reporting (§6.4) |
| What must a Character Builder ask about, and in what order? | Character Builder (§12) |

## 6.2 Category vs Semantic Role — a distinction that will otherwise be lost

Both are closed, Core-owned, engine-versioned registries that packages opt into. They are not the
same mechanism and must not be merged:

| | Semantic Role *(exists)* | Rule Category *(new)* |
|---|---|---|
| Means | "This definition **is** the thing Core calls *vitality*" | "This definition **belongs to** the *Skills* area" |
| Cardinality | **One** definition per role | **Many** definitions per category |
| Declared in | `manifest.semanticRoles` | On each definition (`category`) |
| Consumed by | Core features (token bars, travel, initiative) | Authoring, layout, reporting, the Builder |
| If absent | A Core feature degrades visibly | Organisation only; nothing degrades |
| Registry owner | Eldra Core, closed | Eldra Core, closed |

## 6.3 The canonical category registry

Closed, versioned with the engine, additive-only. A package tags each definition with exactly one.
**Every category is optional** — a package that implements none of a category simply has no
definitions in it, and that is a legal, complete package.

| # | Category | Covers | Illustrative (NOT authored here) |
|---|---|---|---|
| 1 | `core.abilities` | The base attribute set and anything derived directly from it | Six abilities; the modifier formula |
| 2 | `core.proficiency` | What proficiency *is* and how it scales | Proficiency bonus progression; proficiency ranks |
| 3 | `core.skills` | The skill list and how a skill resolves | Skill list; skill → ability mapping |
| 4 | `core.saves` | The saving throw set and how one resolves | Six saves; save DC formula |
| 5 | `core.defenses` | Static defensive values | Armour Class; Difficulty Class; Dodge |
| 6 | `core.health` | Damage capacity and its loss | Hit Points; Wounds; Stress; Sanity |
| 7 | `progression` | How a character advances | Level; XP; milestones; class progression tracks |
| 8 | `character.creation` | What must be decided to make a character, and in what order | Ability score generation methods; origin choices |
| 9 | `combat` | Turn structure, attacks, damage application | Initiative; attack rolls; critical rules |
| 10 | `movement` | Speed, modes, and their costs | Walking/flying speeds; difficult terrain |
| 11 | `conditions` | Named states that modify an actor | Prone; Frightened; Poisoned |
| 12 | `spellcasting` | Magic resources and their resolution | Spell slots; preparation; spell DC |
| 13 | `equipment` | How carried things interact with rules | Encumbrance; attunement; armour proficiency |
| 14 | `resting` | Recovery procedures | Short/long rest; recovery amounts |
| 15 | `death` | The dying and death procedure | Death saves; stabilisation; massive damage |
| 16 | `currency` | Money and exchange | Denominations and conversion |
| 17 | `downtime` | Between-adventure activity | Crafting; carousing; research |
| 18 | `environment` | World conditions that modify rules | Weather; light; travel pace |

**Categories 1–8 are the *Core Character Rules*** — the subset a package must populate before a
Character Sheet can render anything meaningful, and therefore the scope of the first authored
package (§14.1).

## 6.4 Why a closed registry rather than free-form tags

Free-form tags cannot answer "does this package implement resting?", which is precisely the question
a GM evaluating a package asks and the question a completeness report must answer. A closed registry
also lets the sheet layout contract (rules-engine.md §18) address regions by category without
packages inventing region names. The cost — adding a category is an engine minor version — is the
same cost Semantic Roles already accept, for the same reason and with the same additive-only
guarantee.

Packages retain free-form `tags` *(exists)* for their own finer taxonomy. Categories are the shared
vocabulary; tags are the package's private one.

---

# 7. Rule Representation

**Decision: rules are authored as declarative data in five forms — Expressions, Tables,
Progressions, Choice Sets, and References — plus metadata. No form is executable.**

## 7.1 Expressions — the default, and why

Already decided and built (rules-engine.md §14, expression-language.md, `parser.ts`/`evaluator.ts`
*(exists)*). Restated here only for the reason it is the *default* form: a formula is the most
compact, most explainable, and most diffable representation of a rule that is genuinely
computational. `floor((@value:ability.str − 10) / 2)` is the rule, legibly, in one line.

Authored as text, parsed once at publication into a canonical AST, stored as both. Non-Turing-complete
and cost-bounded (§14.9). **Dice never appear in derived-value evaluation** (§9.5) — a Roll Spec is a
value that pure expressions may construct, consumed only by the Roll Engine.

## 7.2 When a Table is right instead

**A formula that must be reverse-engineered from a printed table should be authored as the table.**

D&D's proficiency bonus happens to fit `2 + floor((level − 1) / 4)`. Pathfinder 2e's proficiency
ranks do not fit any formula. Cyberpunk RED's death save target is a lookup. Forcing a table into a
formula produces an expression whose correctness cannot be checked against the book by reading it,
which defeats the auditability the whole design exists for.

**Rule of thumb, and it is the authoring guidance this document commits to:** if the source material
prints a table, author a Table. If the source prints a formula, author an Expression. Do not
translate between them — the printed form is the reviewable form.

## 7.3 The five forms

| Form | Use when | Engine treatment |
|---|---|---|
| **Expression** | The rule is computational and printed as a formula | Parsed to AST; walked by the evaluator *(exists)* |
| **Table** | The rule is printed as a lookup | Keyed lookup; a resolved cell is a value |
| **Progression** | The rule is an ordered track keyed to a value (usually level) | A Table with a defined key axis and grant semantics |
| **Choice Set** | The rule requires a *person* to decide | Never evaluated; resolved into `ActorState.choices` *(exists)* |
| **Reference** | The rule points at another definition | A Definition ID; the dependency graph's edges *(exists)* |

## 7.4 Table — specification

Named in rules-engine.md §12.2 as "kept"; never shaped. Specified here (§2.6).

```jsonc
{
  "id": "table:proficiency_by_level",
  "kind": "table",
  "category": "core.proficiency",
  "key": { "valueType": "number", "match": "range" },   // exact | range | enum
  "columns": [ { "key": "bonus", "valueType": "number" } ],
  "rows": [
    { "min": 1,  "max": 4,  "bonus": 2 },
    { "min": 5,  "max": 8,  "bonus": 3 }
    // ... authored content, not this document's business
  ],
  "default": { "bonus": 2 }        // required: §14.4's "no null, every value has a zero"
}
```

Three properties are load-bearing: `match` is declared rather than inferred (a range table and an
enum table are read differently and guessing is how off-by-one errors enter); `default` is
**mandatory**, preserving the engine's existing "every value has a zero" invariant rather than
introducing a null path; and rows are plain data, so a reviewer can diff them against a book.

Referenced from an expression as a function call over a declared key — the reference form, not a new
evaluation mode.

## 7.5 Progression — specification

A Progression is a Table with two additions: a **declared key axis** (what advances) and **grant
semantics** (what arriving at a row *does*).

```jsonc
{
  "id": "progression:class.martial",
  "kind": "progression",
  "category": "progression",
  "keyedBy": "value:level",
  "rows": [
    { "at": 1, "grants": ["source:feature.second_wind"] },
    { "at": 2, "grants": ["source:feature.action_surge"], "sets": { "value:attacks": 1 } }
  ]
}
```

**Why separate from Table rather than sugar over it:** a Table *resolves to a value*; a Progression
*changes an actor's active set of Sources*. Those reach the engine through different paths — the
first through expression evaluation, the second through the dynamic Source overlay (§16.8)
*(exists)*. Collapsing them would put grant semantics inside expression evaluation, which is exactly
the boundary §7.1 keeps clean.

Critically, a Progression is **referenced by content, not owned by it** (§8.3): the Rules Package
declares the *shape* of a martial progression; a Content Pack's Fighter says *"my progression is
`progression:class.martial`"* — or, where a class's track is genuinely unique, ships its own rows in
its Rules Facet against a package-declared progression *schema*. Which of those two the 2024 package
uses is an authoring decision, not an architectural one.

## 7.6 Choice Set — specification

The one form that is **never evaluated**. A Choice Set is a question, asked of a person, whose answer
becomes stored state.

```jsonc
{
  "id": "choice:skill.class",
  "kind": "choiceSet",
  "category": "character.creation",
  "prompt": "Choose your class skill proficiencies",
  "count": { "expression": "@content:class.skillChoiceCount" },  // or a literal
  "from": { "kind": "definitionsInCategory", "category": "core.skills" },
  "distinct": true,
  "writesTo": "value:skill.{selected}.proficient"
}
```

`from` is a **selector**, not a literal list, because the options usually depend on the chosen
content (a Fighter's skill list differs from a Wizard's). Selector kinds are a closed set —
`explicit` | `definitionsInCategory` | `fromContentFacet` — for the same reason the modifier phase
set is closed: an open selector language is a second expression language with none of the first
one's safety properties.

`writesTo` makes the *effect* of a choice declarative. A choice that silently means something is a
choice no trace can explain.

## 7.7 Metadata, versioning, and the dependency graph

- **Metadata** — every definition carries `id`, `category`, optional `label`, `description`, `tags`,
  and `visibility` *(exists)*. **`description` is prose and is separate from every mechanical field**,
  preserving rules-engine.md §30.2's single most effective licensing mitigation: a package can be
  mechanically complete with zero prose.
- **Versioning** — `(packageId, version)`, semver, immutable once published *(exists)*. Three
  independent versions already distinguished (§25.1): package version, `engineApiVersion`,
  `stateSchemaVersion`. §9.1 adds a fourth axis that is *not* a version — the vocabulary identifier —
  and §9.4 explains why it must not be one.
- **Dependency graph** — extracted from ASTs, modifier targets, table references, and progression
  grants at package load; topologically ordered once; cycles rejected at publication
  (`dependency-graph.ts`, `cycle-detection.ts` *(exists)*). Tables and Progressions introduce new
  **edge sources**, not a new graph — the existing extractor gains two cases and nothing else changes.

---

# 8. Separation From Content Packs — The Link Model

**This section is the document's central contribution.** It is the revisit ADR-018 deferred (§2.1).

## 8.1 The problem, concretely

A 2024 Fighter must grant proficiency in Strength and Constitution saving throws. Today:

- The Rules Package would define what a saving throw is — **but no package does** (§2.2).
- The Content Pack holds the Fighter — **as raw 5etools JSON in `data`** *(exists)*.
- `world-content-catalogue.ts` strips `data` and exposes only a **presentation model** *(exists)* —
  the string `"Saving Throw Proficiencies: Strength, Constitution"`.

Three ways to close this, two of which are wrong:

| Option | Verdict |
|---|---|
| **A.** The engine reads `data` through an adapter at evaluation time | **Rejected.** Puts 5etools shapes in the evaluation path, violates §10's dependency direction, and makes the licensing boundary (§30) a runtime concern. Explicitly forbidden by this document's own brief. |
| **B.** Parse the presentation string | **Rejected.** Presentation is lossy by design and localised by intent. Reverse-engineering it is a bug with a schedule. |
| **C.** A publication-time **Rules Facet** carrying Definition-ID references | **Adopted.** §8.2. |

## 8.2 The Rules Facet

A **Rules Facet** is an optional, structured block on a Content Pack entry that expresses — **in the
Rules Vocabulary its pack declares** — what choosing this entry does mechanically. It contains
**references and declarations only. It never contains a formula.**

Per **Decision 4** (§18.4), the vocabulary is declared **once per pack**, not per entry — an entry's
facet inherits it. `vocabulary` remains reserved on the facet itself as a future per-entry override,
and is absent in practice.

```jsonc
// The Content Pack manifest declares the vocabulary once.
{ "packageId": "eldra.content.xphb", "version": "1.0.0",
  "targets": { "vocabulary": "dnd5e.2024" } }

// A published Content Pack entry, extended. `data` is unchanged and untouched.
{
  "systemKey": "dnd5e",
  "entityType": "class",
  "slug": "fighter-xphb",
  "title": "Fighter",
  "data": { /* untouched upstream JSON — presentation's input, never the engine's */ },

  "rulesFacet": {
    // No `vocabulary` here — inherited from the pack (Decision 4).
    "grants": [
      { "set": "value:save.str.proficient", "to": true },
      { "set": "value:save.con.proficient", "to": true },
      { "set": "value:hit_die", "to": 10 }
    ],
    "choices": [
      { "choiceSet": "choice:skill.class", "count": 2,
        "from": ["value:skill.acrobatics.proficient", "value:skill.athletics.proficient" /* … */] }
    ],
    "progression": "progression:class.martial",
    "sources": ["source:feature.fighting_style"]
  }
}
```

Four rules govern it, and each closes a specific failure:

1. **Every string in a Rules Facet is a Definition ID owned by the Rules Package.** A facet naming an
   ID the active package does not define is an **unresolved reference** — surfaced as a Binding Gap
   (§9.3), never a silent no-op.
2. **A facet contains no expressions.** `{"set": "value:hit_die", "to": 10}` is a declaration. `10`
   is a literal, not a formula. The moment a facet may carry an expression, content authors begin
   writing rules, and the boundary is gone.
3. **A facet is produced at publication, never at runtime.** The content adapter emits it alongside
   the candidate, exactly where `content-pack-5etools-adapter.ts` *(exists)* emits `data` today. This
   is what makes "the engine never reads raw source" structural.
4. **A facet is optional.** A Content Pack with none is legal and useful — it is a catalogue that
   presents but does not mechanise. This preserves ADR-018's independent streams: content can ship
   before its rules facets exist.

## 8.3 Direction of reference — one way, always

```
   Rules Package  ─────────── defines ──────────▶  Definition IDs (the slots and the laws)
                                                          ▲
                                                          │ references, by ID only
                                                          │
   Content Pack   ─── rulesFacet ────────────────────────┘   (which slots THIS thing fills)
                                                          
   Character      ─── records which content was chosen ──▶  ActorState (the decisions)
                                                          
   Rules Engine   ─── evaluates ─────────────────────────▶  Derived values (the consequence)
```

**A Rules Package never references a Content Pack.** It does not know Fireball exists, cannot name
the Fighter, and must remain publishable and evaluable with zero content bound. This is the same
one-way rule §10 already applies to World Configuration, applied to the second axis — and for the
identical reason: a back-edge makes both sides unversionable independently.

The asymmetry is deliberate and worth stating plainly: **content depends on rules; rules do not
depend on content.** A rules package is a language; content packs are sentences in it.

## 8.4 What this forbids, structurally

- The engine has **no import path** to `app/lib/importers/**` or to any content module. `app/lib/rules/`
  imports nothing outside itself today *(exists)*; adopting this document must not change that
  (§13.3).
- `ContentPublicationCandidate.data` remains **presentation input only**. No rules module may read
  it. This is enforceable by a lint rule or an import test, and §14.2 recommends one — a boundary
  that is only a convention will be crossed under deadline.
- Prose stays on the content side. A Rules Facet carries IDs and literals; it carries no
  descriptions, so it is licensing-inert by construction (rules-engine.md §30.2).

## 8.5 The two-projection model, completed

The Content Platform now has exactly two projections of the same opaque `data`, produced at
different times for different consumers:

| Projection | Produced | Consumed by | Contains | Exists? |
|---|---|---|---|---|
| **Presentation** | Catalogue read time | Builder, Sheet | Human-readable prose, facts, sections | **Yes** — `app/lib/content-presentation/` |
| **Rules Facet** | **Publication** time | The Rules bridge only | Definition IDs, literals, choices | **No** — this document proposes it |

The timing difference is not incidental. Presentation is cheap, localisable, and safe to recompute
on every read. A Rules Facet is a **published fact about a content version** — it must be stable,
reviewable, and integrity-hashed with the pack, because a character was built against it.

---

# 9. Binding Model

## 9.1 Rules Vocabulary — making `systemKey` load-bearing

A **Rules Vocabulary** is a stable identifier naming a *shared set of Definition IDs*. A Rules
Package **provides** exactly one; a Content Pack's Rules Facet **targets** exactly one.

```jsonc
// Rules Package manifest — new field
{ "packageId": "eldra.rules.dnd5e-2024", "version": "1.0.0",
  "provides": { "vocabulary": "dnd5e.2024" } }

// Content Pack manifest — the counterpart, declared once per pack (Decision 4)
{ "packageId": "eldra.content.xphb", "version": "1.0.0",
  "targets": { "vocabulary": "dnd5e.2024" } }
```

This resolves §2.5: `systemKey: 'dnd5e'` is too coarse — a 2014 and a 2024 package are both `dnd5e`
and share almost no Definition IDs. `systemKey` remains the **presentation** dispatch key *(exists,
unchanged)*; `vocabulary` becomes the **rules** compatibility key.

## 9.2 Why a vocabulary and not just a package ID

Binding content to a *package* would mean a house-ruled fork of the 2024 rules — a different
`packageId` — instantly orphaning every content pack. Binding to a *vocabulary* lets a GM fork the
rules while keeping the entire catalogue, which is the single most likely real-world customisation.

A vocabulary is therefore a **compatibility promise**, not an identity: *"I define the IDs that
`dnd5e.2024` names."* Multiple packages may provide the same vocabulary. That is the point.

## 9.3 Mismatch is a Binding Gap, never an error

Eldra already has the right mechanism (rules-engine.md §19.3, world-configuration.md §F): a
**Binding Gap** is a named, user-visible, user-resolvable mapping surfaced when two independently
versioned sides do not line up. This document reuses it verbatim rather than inventing a second
failure vocabulary.

| Situation | Result |
|---|---|
| Facet vocabulary matches the active package's | Facet applies |
| Content bound, no Rules Package activated | **Content still works.** Presentation is unaffected; facets are inert |
| Vocabularies differ | **Binding Gap:** *"XPHB targets `dnd5e.2024`; this world runs `dnd5e.2014`. Mechanics from this pack will not apply."* Content still presents |
| Vocabulary matches, but a facet names an unknown Definition ID | **Binding Gap**, scoped to that entry, naming the ID |
| Entry has no facet at all | Presents; grants nothing. Legal |

**Every row degrades visibly and none throws.** This is rules-engine.md §28's "visible degradation"
applied to the new seam, and it is what makes it safe to ship content packs and rules packages on
independent schedules.

## 9.4 Vocabulary is not a version, deliberately

A vocabulary identifier must **not** carry a semver. `dnd5e.2024` is a name, not a range.

The reason is concrete: if content declared `vocabulary: "dnd5e.2024@^1.2"`, then every rules errata
that bumped a version would invalidate content that references IDs which did not change. Definition
IDs are already "opaque and permanent," and changing one is "a breaking change requiring a migration
step" (ADR-004, §12.6). **That guarantee is the compatibility contract** — a second version axis on
top of it would duplicate it and then disagree with it.

Where a vocabulary genuinely breaks, it gets a **new name** (`dnd5e.2024r2`), and the mismatch
surfaces as an ordinary Binding Gap. Renaming is loud; version-range arithmetic is quiet.

---

# 10. Activation Model, and Relationship to Worlds

## 10.1 What a World owns

Unchanged from rules-package-infrastructure.md Q13 and world-configuration.md §A. Restated because
this document adds to it:

- Which Rules Package version is **active** — `(active_package_id, active_package_version)` + integrity
- Answers to package-declared settings (`requiredTraits`, `optionalRules`)
- Roll-type surfacing
- Its own config version

**The World computes nothing.** `quality: 4` is a world fact; `1 + quality * 0.1` is a package
interpretation (§19.1).

**This document adds exactly one derived fact, stored nowhere:** the World's **active vocabulary**,
read from the active package's `provides.vocabulary`. It is not persisted, because it is a pure
function of the activated package — the same reasoning that keeps `RuntimeRulesPackage` unpersisted
(Q15).

## 10.2 Activation vs Binding — the two verbs

| | Rules Package | Content Pack |
|---|---|---|
| Verb | **Activate** | **Bind** |
| Cardinality | Exactly one, or none | Zero or many |
| Semantics | Replaces | Accumulates |
| Changing it | Gated; may require a Rules State Reset (§A.2) | Free; unbinding removes options |
| Absence means | World has no mechanics; content still presents | World has no catalogue; rules still evaluate |

Both absences are legal states, and both are already modelled — `{ configured: false }` *(exists)*
and an empty catalogue *(exists)*. A World with rules but no content is a system with no library. A
World with content but no rules is exactly Solaris today.

## 10.3 Activation flow — unchanged, plus one check

The existing flow *(exists)* is preserved. Activation gains a single **non-blocking** step: after a
package is activated, compare its `provides.vocabulary` against every bound Content Pack's facets and
surface any mismatches as Binding Gaps (§9.3). It never refuses activation — a GM may legitimately
activate rules before binding matching content.

---

# 11. Evaluation Model, and Relationship to Characters

## 11.1 What the Rules Engine consumes and returns

**Consumes** — exactly four inputs, and no others:

| Input | Supplied by | Exists? |
|---|---|---|
| **Actor State** | The Character's stored decisions | Type yes; producer no (§2.4) |
| **World** | Resolved config snapshot (`@world:` traits, optional rules) | **Yes** |
| **Rules Package** | Registry + dependency graph from the active package | **Yes** |
| **Content references** | The Character's chosen content, via Rules Facets (§8.2) | **No** — this document proposes it |

**Never consumes:** raw 5etools JSON, `ContentPublicationCandidate.data`, presentation models,
Directus rows, HTTP requests, or a Character Sheet.

**Returns** — derived values, traces, and diagnostics. Never a rendered anything, and never a
mutation of its inputs.

## 11.2 The bridge — where content becomes rules input

The missing module (§2.4). Its job is one translation and nothing else:

```
Character Assembly (species/class/background)  ─┐
Ability Scores (stored player data)            ─┼─▶  ActorState + Source overlay
Rules Facets of the chosen content             ─┘
```

Two properties are non-negotiable:

1. **Grants become derived Sources, never stored values.** A Fighter's save proficiencies are *not*
   written into `ActorState.values` at creation. They are contributed to the **dynamic Source
   overlay** (§16.8) *(exists)* on every evaluation, from the currently-chosen content.

   This is what makes re-binding correct: if a GM repins the Content Pack to a version where the
   Fighter grants different saves, the character updates. Materialising grants at creation would
   freeze a copy that silently diverges — the exact failure §13.2's stored/derived invariant exists
   to prevent.

2. **Player decisions are stored; consequences are not.** The choice *"I picked Athletics"* is stored
   in `ActorState.choices` *(exists)*. The fact *"therefore Athletics is proficient"* is derived. The
   line is the same one Phase 3 already drew for ability scores: scores are stored, modifiers are not.

## 11.3 The Character Rules Projection

The engine returns values one Definition ID at a time. A sheet needs a coherent model. The
**Character Rules Projection** is the read-model over those calls — a pure fan-out, computed on
demand, stored nowhere:

```
DerivedCharacter := for each definition the active package declares,
                    grouped by Rule Category (§6.3),
                    { id, label, category, value, proficient?, trace? }
```

Three properties: it is **derived on demand** (never persisted — ADR-003); it is **category-shaped**
(so the sheet renders regions without knowing any game); and every entry can produce a **trace** on
request *(exists)*.

## 11.4 Relationship to Characters

A Character is an `entities` row *(exists)*. Its rules state is `actor_rules_state`, keyed by
`entity_id`, added *alongside* the legacy `character_sheets` projection (world-configuration.md §A.9).
Both may exist and disagree during migration; the sheet decides per panel.

Phase 3's `ability_scores` block *(exists)* is the first real actor state in the repository, stored
under a `block_instances` key rather than in `actor_rules_state`.

**Decision 3 (§18.3) settles this: `actor_rules_state` is the canonical, rules-owned store, and
Phase 3's block migrates into it.** Two consequences follow, and both are load-bearing:

- **`block_instances` remains correct for what it was built for** — wiki-style entity content — and
  keeps `catalogue_selection`, which is a *content* reference, not rules state. The split is not
  "old vs new"; it is **content blocks vs rules state**, which is the same boundary §8 draws one
  layer down.
- **The migration must land before a second consumer of ability scores exists.** Ability scores are
  read today by exactly one surface (the Sheet). Every additional reader written against
  `block_instances` is another call site to migrate, and the engine bridge (§11.2) would be the
  second. Sequenced accordingly in §19.

---

# 12. Relationship to the Character Builder

## 12.1 The 2024 problem, stated as an architecture requirement

The 2024 rules moved **Ability Score Increases** and **Origin Feats** from Species onto **Backgrounds**,
and reduced Species largely to traits. A design that hardcodes the 2014 arrangement cannot express
2024; a design that hardcodes 2024 cannot express 2014 — and both must run side by side, because a
World may legitimately run either.

**The requirement this produces:** no Eldra code may contain the sentence *"a Species grants ability
score increases."* Not in the Builder, not in the bridge, not in a type name.

## 12.2 Consequence — the Builder's steps are declared, not coded

Today's Builder hardcodes five steps: Name, Species, Class, Background, Ability Scores *(exists)*.
That is correct for a 2024 D&D world and wrong as an architecture.

The target: the Builder renders a **Creation Plan** derived from the Rules Package's
`character.creation` category (§6.3 #8) plus the Rules Facets of whatever has been chosen so far. A
step is a Choice Set (§7.6); its options come from a selector; its answer lands in
`ActorState.choices`.

Under that model the 2014→2024 shift is a *package and content* change: in 2014 the Species facet
carries the ASI choice; in 2024 the Background facet does. **Eldra code is identical in both cases,
because it never knew which one carried it.** That is the proof §4.5 asks for.

## 12.3 What the Builder must never do

- Compute a modifier, a proficiency bonus, or any derived value. It renders what the engine returns.
- Assume any specific step exists. "Ability Scores" is a step *because a package declared it*.
- Write a derived consequence into stored state (§11.2).

## 12.4 Honest sequencing

The current hardcoded Builder is **not a defect to fix immediately**. It works, it matches the only
system Eldra has content for, and replacing it before a real package exists would be replacing
working code with an abstraction over a single case. §14 sequences it after the first package, when
there is a second arrangement to prove it against.

---

# 13. Relationship to the Character Sheet and the Rules Engine

## 13.1 The Character Sheet is a pure renderer

It reads the Character Rules Projection (§11.3) and renders it. It performs no arithmetic. This is
the same rule Phase 2 and Phase 3 already established for presentation and ability scores, extended
to derived values — and it is why `sheet.vue`'s ~8,900 lines and 168 computed properties are the
anti-pattern this architecture is measured against (rules-engine.md §29.3).

A sheet may render a value it does not understand. It must never invent one it does.

## 13.2 Layout comes from categories

Sheet regions address **Rule Categories** (§6.3), not definition IDs. A package that declares no
`spellcasting` definitions produces no spellcasting region — visible degradation, no configuration,
no per-system sheet code.

## 13.3 Relationship to the Rules Engine — the hard constraint

**Adopting this document must not change `app/lib/rules/`.**

Everything proposed here is one of: package **content** (authored, not coded), a **manifest field**
(additive, optional), a **content-side artifact** (the Rules Facet), or a **bridge module** outside
the engine. The three specified definition kinds (§7.4–§7.6) are additive to the registry's
already-open `Definition` union and change no existing kind.

If an implementation of this document finds itself editing `evaluator.ts` or `modifier-pipeline.ts`,
that is a signal the design is wrong — not a licence to proceed. `app/lib/rules/` currently contains
zero references to Directus, content, or Vue, and that is the property most worth protecting.

---

# 14. Multi-System Support

The test of any of this is whether five genuinely different systems fit **without redesign**. Each
row below is a sketch of *how it would be expressed*, not an authored package.

## 14.1 The five systems

| Concern | **D&D 2024** | **D&D 2014** | **Pathfinder 2e** | **Call of Cthulhu** | **Cyberpunk RED** |
|---|---|---|---|---|---|
| Vocabulary | `dnd5e.2024` | `dnd5e.2014` | `pf2e` | `coc7` | `cpred` |
| `core.abilities` | 6 abilities, `floor((n−10)/2)` | Identical | 6, same formula | 8 characteristics, percentile | 10 stats, raw 1–10 |
| `core.proficiency` | PB by level (Table) | Identical | **Ranks** (enum) + level scaling | *Category unpopulated* | *Category unpopulated* |
| `core.skills` | 18, ability-mapped | 18, ability-mapped | ~17, rank-based | ~60, own percentile values | ~80, stat-linked |
| `core.saves` | 6 ability saves | 3 saves (Fort/Ref/Will as defenses) | 3 saves, rank-based | Sanity + Luck rolls | *No save concept* |
| `core.health` | Hit Points | Hit Points | Hit Points + Dying | HP + **Sanity** | HP + **Humanity** + Death Save |
| Resolution | d20 + mods vs DC | Identical | d20 + mods, **4 degrees** | **d100 roll-under**, 3 success tiers | **d10 exploding** + stat + skill |
| ASI / origin | **Background** grants ASI + Origin Feat | **Species** grants ASI | Ancestry + Background + Class boosts | Occupation-driven skill points | Role + Lifepath |

## 14.2 What each system proves

- **2024 vs 2014 D&D — the sharpest test, because they are nearly identical.** Same primitives, same
  categories, same formula; the *only* structural difference is which content kind carries the ASI
  choice. Under §8, that is a Rules Facet difference between two Content Packs. **Zero Eldra code
  distinguishes them.** If this pair required a code branch anywhere, the design would have failed.
- **Pathfinder 2e** proves categories survive a different *type* of proficiency: ranks are an enum
  Value, not a number, and the four degrees of success are a Roll Spec configuration (§17.3)
  *(exists)*, not a new primitive.
- **Call of Cthulhu** proves **unpopulated categories are normal**, not degenerate. There is no
  proficiency bonus and no saving throw; those categories are simply empty, and the sheet shows no
  such regions. It also proves resolution direction is a package decision: roll-under percentile is
  a Roll Spec, not an engine mode.
- **Cyberpunk RED** proves the dice model generalises — exploding d10s are a `RollSelection`
  configuration *(exists)* — and that `core.health` is a *category*, not a hit-point concept:
  Humanity and HP sit side by side in it.
- **Across all five**, the same four engine inputs (§11.1) and the same five primitives apply. No
  system needs a sixth primitive, and none needs a category outside §6.3's registry.

## 14.3 Where the architecture genuinely stops

Stated because unstated limits become surprises (and inherited honestly from rules-engine.md §22A.14):

- **Narrative/fiction-first systems** whose rules are conversational procedures — position-and-effect
  negotiation, "say yes or roll the dice", clocks advanced by table judgement. Eldra can hold their
  values and present their tracks; it cannot canonicalise the part that matters, because the part
  that matters is a conversation.
- **Cross-actor mechanics** (opposed checks, auras) until §15.6's reserved multi-actor context is
  implemented.
- **Reactions and triggers** — no event bus (§9.1).

---

# 15. Folder and Package Layout

## 15.1 Repository layout

```
packages/
  eldra-generic-d20/            (exists) — the runtime proof; NOT a game (§2.2)
  eldra-dnd5e-2024/             (proposed) — the first real package
    manifest.json
    definitions/
      values/                   Value Definitions (stored + derived)
      tables/                   Tables (§7.4)
      progressions/             Progressions (§7.5)
      choices/                  Choice Sets (§7.6)
      collections/              Collection Definitions
      modifiers/                Reusable modifier templates
      sources/                  Things that carry modifiers (features, conditions)
      actions/                  Action Definitions
      rolls/                    Named Roll Specs
    layouts/                    Sheet layout declarations (§13.2)
    migrations/                 Versioned migration steps
    tests/                      Package self-tests (§26.3)
    i18n/                       Translation bundles
```

This is rules-engine.md §11.3's tree with `tables/`, `progressions/`, and `choices/` promoted from
"named but unshaped" to real directories (§2.6), and `definitions/content/` **removed** — under §8,
package-authored content instances belong in a Content Pack, not a Rules Package.

## 15.2 Manifest additions

Only two fields are new; everything else is unchanged *(exists)*.

```jsonc
{
  "packageId": "eldra.rules.dnd5e-2024",
  "version": "1.0.0",
  "status": "published",
  "engineApiVersion": "^1.0.0",
  "stateSchemaVersion": 1,

  "provides": { "vocabulary": "dnd5e.2024" },     // NEW — §9.1

  "categories": ["core.abilities", "core.proficiency", "core.skills", "core.saves"],
                                                   // NEW — declared coverage, §6.4

  "semanticRoles": { "level": "value:level", "proficiency": "value:proficiency_bonus" },
  "license": { "id": "CC-BY-4.0", "attribution": "…" }
}
```

`categories` is a **declaration of coverage**, not a constraint — it is what lets Game Admin answer
*"does this package implement resting?"* before activation, and what a completeness report diffs
against.

---

# 16. Rejected Alternatives

| Rejected | Why |
|---|---|
| **Rules and Content in one package** | The two change at different rates, carry different licensing risk, and are authored by different people. ADR-018 already decided this; merging would also make a monster-manual refresh force a rules review. |
| **Engine reads `ContentPublicationCandidate.data` via an adapter** | Puts 5etools shapes in the evaluation path and makes licensing a runtime concern. The single most important boundary this document defends (§8.4). |
| **Parse the presentation model to recover mechanics** | Presentation is lossy and localisable by design. A parser over it is a bug with a schedule. |
| **Content Packs contain formulas** | The moment a Species may carry an expression, every content author is a rules author and the boundary is gone. Facets carry IDs and literals only (§8.2 rule 2). |
| **Rules Packages reference content by ID** | Creates a back-edge; a package could no longer be published or evaluated without a catalogue. Rules are a language; content are sentences (§8.3). |
| **Bind content to a `packageId` rather than a vocabulary** | A house-ruled fork of the rules would orphan every content pack — the most likely real customisation, broken by construction (§9.2). |
| **Version the vocabulary (`dnd5e.2024@^1.2`)** | Duplicates the guarantee Definition IDs already provide (ADR-004) and then disagrees with it. Breaking a vocabulary should be a rename, loudly (§9.4). |
| **Rule Categories as evaluation concepts** | Reopens the 30-primitives problem §12.2 closed. Categories organise; the engine's five primitives compute. |
| **Free-form category tags instead of a closed registry** | Cannot answer "does this package implement resting?", and lets every package invent its own sheet regions (§6.4). |
| **Materialise content grants into stored state at character creation** | A stored derived value is a cache with no invalidation strategy (§13.2). Repinning content would silently diverge from the character built against it. |
| **Rebuild the Character Builder's steps generically now** | Replacing working code with an abstraction over a single case. Sequenced after a second system exists to prove it (§12.4). |
| **Author rules as executable code** | ADR-001/ADR-011, unchanged. Never, in this design. |

---

# 17. Risks

1. **The first package becomes a 2024-D&D-shaped engine by accident.** Authoring one package against
   one system is how system-specific assumptions leak into Core. *Mitigation:* §6.3's registry and
   §14.1's table were written **before** the package, and the CoC/Cyberpunk columns are the review
   check — if a proposed Core change cannot express those columns, it is a package concern.
2. **Rules Facets drift from the content they describe.** A facet is authored against a content
   version; upstream data changes. *Mitigation:* facets are published *with* the pack and covered by
   its integrity hash, so a facet cannot silently describe a different Fighter than the one shipped.
3. **The Content/Rules distinction is lost in the UI.** The most likely failure, and it is a product
   failure rather than a technical one (§3.4). *Mitigation:* two verbs, two sections, never one list.
4. **Vocabulary proliferation.** Every house rule spawning a vocabulary would fragment the catalogue.
   *Mitigation:* a fork keeps the vocabulary and changes the `packageId` — that is precisely what §9.2
   makes possible, and the guidance must be stated in Game Admin copy.
5. **`actor_rules_state` and Phase 3's `ability_scores` block become two sources of truth.** Real
   today (§11.4). *Mitigation:* **decided** — `actor_rules_state` is canonical (§18.3), and §19
   sequences the migration as Step 5a, before the bridge becomes the second reader.
6. **Category creep.** Eighteen categories is already near the limit of what an author holds in
   their head. *Mitigation:* additive-only, engine-versioned, and each addition must justify itself
   against an existing category.
7. **Authoring effort is underestimated.** A 2024 core package is a review-heavy content artifact
   with correctness that must be checked against a book, not a coding task. *Mitigation:* §14.1 scopes
   the first package to categories 1–8 and nothing else.

---

# 18. Decisions

These were the four product and licensing decisions this document could not make for itself. **All
four are now decided.** They are recorded here with their consequences, and the document above has
been updated to match rather than left contradicting them.

## 18.1 Which rules may Eldra ship, and under what license?

**Decision: mechanically complete, zero prose.**

Eldra ships formulas, tables, progressions, and Definition IDs. It ships no descriptions, no flavour
text, and no proper nouns beyond what a mechanic requires to be named.

*Consequences.* This is the strongest form of rules-engine.md §30.2's separation, and §7.7 already
makes it structurally possible: `description` is a separate optional field on every definition, so a
package can be mechanically complete while carrying none. It also means a Rules Package is
**licensing-inert by construction** rather than by review — the property that makes shipping one at
all defensible (§30.2.3's "Eldra ships no game content" policy gains its first, narrow exception, and
the exception is narrow *because* the artifact contains no content).

*What this costs.* A player reading the sheet sees "Proficiency Bonus +2" and not the paragraph
explaining what a proficiency bonus is. That prose belongs to the Content Pack, where the
Presentation layer already renders it (§8.5) — which is the correct home for it anyway.

## 18.2 Is the Rules Facet produced by the adapter, or authored by hand?

**Decision: hand-authored first.**

*Consequences.* No new tooling, no reconciliation surface, and no §22A translation-fidelity
machinery on the critical path. The set is genuinely small — XPHB is 10 Species, 12 Classes, and 16
Backgrounds (38 entries), against which Spells and Items number in the hundreds and are not needed
for Phase 4's four outputs.

*What this defers, deliberately.* Auto-generation stays available later, and the hand-authored set
becomes its test corpus: an adapter that cannot reproduce 38 reviewed facets is not ready. Doing it
by hand first is what makes that check possible.

*The boundary this preserves.* A hand-authored facet is reviewed by a person against a book. An
auto-generated one is a translation with a fidelity claim attached (§22A.6), and would have needed
review anyway — the decision trades tooling for the same review, sooner.

## 18.3 Where does actor rules state live?

**Decision: `actor_rules_state` is the canonical rules-owned store; Phase 3's `ability_scores` block
migrates into it.**

*Consequences.* Recorded in full at §11.4. In brief: `block_instances` keeps `catalogue_selection`
(a content reference) and every wiki-style entity block; `actor_rules_state` takes everything the
Rules Engine owns. The split is **content vs rules**, not old vs new.

*Timing is the risk.* Ability scores have exactly one reader today. The engine bridge (§11.2) would
be the second, and every reader written against the old location is another call site to migrate.
§19 therefore sequences the migration **before** the bridge, not alongside it.

## 18.4 Per-entry or per-pack vocabulary?

**Decision: per-pack, with per-entry reserved as a future override.**

*Consequences.* A Content Pack manifest declares `targets.vocabulary` once; every entry's facet
inherits it (§8.2). Lower ceremony, one place to check at bind time, and a Binding Gap (§9.3) can be
raised against the pack as a whole rather than entry by entry.

*Why the override stays reserved.* A pack legitimately spanning two vocabularies is imaginable but
has no current use case, and reserving the field costs nothing. This mirrors the posture the manifest
already takes with `dependencies` and `capabilities`: reserved, rejected if used, cheap to relax.

---

# 19. Recommended Implementation Sequence

Each step is a commit boundary, independently valuable, green on lint + typecheck + tests.

**Step 0 — Approval.** ✅ **Done.** This document is approved and §18's four decisions are made.

**Step 1 — Manifest and category contract.** Add `provides.vocabulary` and `categories` to
`RulesPackageManifest`; add the closed category registry to `types.ts`; add `category` to the
definition types. Type-only and additive — every existing package and test stays valid.

**Step 2 — Specify Table, Progression, and ChoiceSet.** Add the three kinds to the `Definition`
union, the registry, and the dependency-graph extractor. **This is the only step that touches
`app/lib/rules/`**, it is purely additive, and §13.3's constraint is satisfied because no existing
kind changes.

**Step 3 — Author `eldra-dnd5e-2024`, categories 1–8 only** (§14.1). Content, not code. The largest
step by effort, the smallest by architectural surface. **Mechanically complete, zero prose**
(Decision 1).

**Step 4 — The Rules Facet on the content side.** Add `rulesFacet` to `ContentPublicationCandidate`;
carry it through publication and the catalogue. Optional and absent everywhere until step 5.

**Step 5 — Hand-author facets for XPHB's 38 Species, Classes, and Backgrounds** (Decision 2). No
adapter, no reconciliation surface; this set becomes the test corpus for a future auto-generator.

**Step 5a — Migrate ability scores from `block_instances` into `actor_rules_state`** (Decision 3).
Sequenced **before** the bridge on purpose: ability scores have exactly one reader today, and Step 6
would be the second (§18.3).

**Step 6 — The bridge** (§11.2): Character Assembly + ability scores + facets → `ActorState` + Source
overlay. **This is the cancelled Phase 4, unblocked.**

**Step 7 — The Character Rules Projection and the Sheet** (§11.3, §13.1). Modifiers, proficiency
bonus, saves, skills — rendered, never computed, in the sheet.

**Step 8 — Binding Gap surfacing** (§9.3) in Game Admin.

**Later, deliberately:** the declarative Character Builder (§12.2), once a second system exists to
prove it against.

---

# 20. Project Knowledge Review

**1. What is a Rules Package?**

An immutable, versioned, content-addressed document that declares **how a game works** — as data,
never as code. It defines the *slots* (a saving throw exists, it is a boolean, it defaults to false)
and the *laws* (a proficient save adds the proficiency bonus; the bonus advances on this table). It
contains Definitions, Expressions, Tables, Progressions, Choice Sets, and metadata — organised by
Rule Category, evaluated by an engine that knows nothing about any specific game.

It never contains Fireball, never names a Fighter, and remains publishable and evaluable with zero
content bound to the World.

**2. Why must Rules and Content remain separate?**

Four independent reasons, any one sufficient:

- **They change at different rates.** A monster-manual refresh must not force a rules review, and a
  rules errata must not force re-importing a thousand spells (ADR-018).
- **They carry different licensing risk.** Mechanics can be expressed in original wording; prose and
  proper nouns cannot. Keeping them apart is the single most effective structural mitigation
  available (§30.2), and it only works if the boundary is in the *format*, not in a reviewer's care.
- **They have different authors.** A system designer writes rules; a publisher writes catalogues. One
  artifact would require both skills for every change.
- **Merging makes the modifier formula un-shareable.** Put `floor((score−10)/2)` on the Dwarf and it
  must be re-derived on the Elf, the Orc, and every monster — and then they can disagree.

The practical proof is §14.2's D&D pair: 2014 and 2024 differ *only* in which content kind carries
the ASI. Separation makes that a data difference. Fusion would make it a code branch.

**3. What does the Rules Engine consume?**

Exactly four inputs: **Actor State** (the character's stored decisions), **World** (resolved config
and traits), **Rules Package** (registry and dependency graph), and **Content references** (Rules
Facets of the chosen content — IDs and literals only).

It returns derived values, traces, and diagnostics.

It never consumes raw 5etools JSON, `ContentPublicationCandidate.data`, presentation models, Directus
rows, or a Character Sheet — and §8.4 makes that structural rather than conventional, because a
boundary that is only a convention gets crossed under deadline.

**4. What is the first implementation task after this document is approved?**

**Step 1: the manifest and category contract** — `provides.vocabulary`, `targets.vocabulary`, the
closed category registry, and `category` on definitions. It is type-only, additive, breaks nothing,
and every later step depends on it.

But the first *substantial* task is **Step 3: authoring `eldra-dnd5e-2024` for categories 1–8**,
mechanically complete and prose-free (§18.1). That is the artifact whose absence cancelled Phase 4
(§2.2), and it is content review rather than engineering — which is precisely why it deserves its own
milestone rather than being smuggled inside an implementation phase.
