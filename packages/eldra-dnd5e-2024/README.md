# eldra.rules.dnd5e-2024

The Core Character Rules for the 2024 ruleset, and Eldra's first real Rules Package.

Authored against
[rules-package-architecture.md](../../.github/docs/architecture/rules-package-architecture.md)
Step 3. It is intended to read as a **reference implementation**: someone authoring Pathfinder 2e,
Call of Cthulhu, or Cyberpunk RED later should be able to follow this structure without reading the
engine.

---

## What this package is

It defines **the slots and the laws**:

- Which abilities exist, and how a score becomes a modifier.
- What a proficiency bonus is, and how it advances with level.
- Which saving throws and skills exist, which ability each uses, and what being *proficient* in one
  actually does.
- The slots a character's hit points live in.
- The constraints that govern generating ability scores at character creation.

## What this package is not

It contains **no content**. No species, classes, backgrounds, spells, items, or monsters — those
belong exclusively to Content Packs. There is no Fighter here, and no Fireball.

The practical test, and it passes: this package is **publishable and evaluable with zero Content
Packs bound and zero world configuration answered**. Every formula reads only `@value:`. Nothing
reads `@world:` or `@content:`.

---

## Structure

Two files, matching the layout the publish script reads:

| File | Contents |
|---|---|
| `manifest.json` | Identity, license, provided vocabulary, declared category coverage, semantic roles |
| `definitions.json` | All 71 definitions, grouped by category in authoring order |

### Definition naming

Identifiers follow `<kind>:<domain>.<slug>[.<facet>]`, and they are permanent — a label may be
renamed freely, an id may not (changing one is a breaking change requiring a migration step).

| Pattern | Example | Meaning |
|---|---|---|
| `value:ability.<key>` | `value:ability.str` | A stored ability score |
| `value:ability.<key>.mod` | `value:ability.str.mod` | Its derived modifier |
| `value:save.<key>.proficient` | `value:save.con.proficient` | Stored: is this save proficient? |
| `value:save.<key>.bonus` | `value:save.con.bonus` | Derived: the resulting bonus |
| `value:skill.<slug>.proficient` | `value:skill.stealth.proficient` | Stored: is this skill proficient? |
| `value:skill.<slug>.bonus` | `value:skill.stealth.bonus` | Derived: the resulting bonus |

The `.proficient` / `.bonus` pairing is the package's central shape, and it is the one worth
copying: **the stored half is a player decision, the derived half is a consequence.** Nothing
derived is ever stored.

### Categories

Every definition declares exactly one Rule Category, and the manifest declares the same set as its
coverage. A test asserts the two agree.

| Category | Definitions | Holds |
|---|---|---|
| `core.abilities` | 12 | Six scores, six modifiers |
| `core.proficiency` | 1 | The proficiency bonus |
| `core.saves` | 12 | Six proficiency flags, six bonuses |
| `core.skills` | 36 | Eighteen proficiency flags, eighteen bonuses |
| `core.health` | 3 | Current, maximum, and temporary hit point slots |
| `progression` | 3 | Level, experience points, the advancement table |
| `character.creation` | 4 | Point buy budget and cost table, standard array, the skill ChoiceSet |

### Tags

Tags are this package's own finer taxonomy; the engine ignores them. The load-bearing one is
`ability:<key>` on every skill and save, which lets a consumer group skills by ability **without
parsing formulas**. A test checks each tag against the ability its formula actually reads, because
the same fact expressed twice will otherwise drift.

---

## Authoring decisions worth copying

**Stored versus derived is the whole design.** A score is stored; a modifier is derived. A
proficiency flag is stored; a bonus is derived. If a value can be recomputed from other values, it
carries a formula and is never written down — a persisted derived value is a cache with no
invalidation strategy.

**Every stored value declares a default.** That is what lets a blank character evaluate: abilities
default to 10, level to 1, proficiency flags to `false`. The package produces coherent numbers
before anyone has entered anything.

**Formulas, not tables, wherever the rule is genuinely closed-form.** The proficiency bonus is
authored as `2 + floor((@value:level - 1) / 4)` rather than as a twenty-row table. This is a
deliberate departure from the "if the book prints a table, author a table" guidance, for a
load-bearing reason: **table lookup is not evaluated yet.** A `lookup(table:x, key)` expression
parses and passes validation but returns an error at evaluation time, so authoring the proficiency
bonus as a table would produce a package that validates and then silently fails to compute. The
formula is verified against the full 1–20 printed progression by test instead.

The three tables in this package are therefore all **reference data that nothing evaluates**:
experience thresholds, point buy costs, and the standard array. That is a legitimate use — they are
declarative facts a consumer reads directly — but no formula depends on one.

**Prose lives in Content Packs, not here.** No definition carries a `description`. Labels name
things (`"Strength Save"`); they never explain them. This is a licensing boundary as much as a
stylistic one, and it is enforced by test rather than by care.

---

## Deliberate absences

**No Progression definitions.** The `progression` category is populated by values and a table, but
contains no `kind: "progression"` definition. Every progression *track* in the 2024 ruleset —
features gained per level, ability score improvements, subclass timing — is **class-specific**, and
classes are Content. A Rules Package that shipped a class progression would have crossed the
boundary it exists to hold. The `progression` kind exists in the vocabulary precisely so a Content
Pack can declare one; that this package needs none is evidence the boundary is drawn in the right
place.

**One ChoiceSet, with a count of zero.** `choice:skill.proficiency` declares the *shape* of a skill
proficiency choice — where options come from, and where the answer is written. How many to pick, and
which are offered, come from the Content Pack entry that references it. Zero is the correct count
when no content supplies one.

**No roll specs, no modifiers, no conditions.** Out of scope for Core Character Rules. A saving
throw's *bonus* is defined here; the d20 roll that uses it is not.

**Hit point maximum is stored, not derived.** It depends on class hit dice (content) and, at the
table's option, on dice actually rolled. It is a player-and-GM decision, so it is stored.

---

## Before this package can be used

1. **It must be published.** `scripts/directus/publish-starter-package.mjs` accepts a `packageDir`
   argument but its `main()` currently hardcodes the starter package, so publishing this one needs a
   one-line change to read the directory from `process.argv`.
2. **It must be activated** on a World, through the existing Game Admin rules activation panel.
3. **Nothing consumes it yet.** The bridge from a Character to `ActorState` is a later step; until it
   exists, this package evaluates correctly but no surface displays the result.
