# D&D 2024 Character Rules Completeness Audit

Status: research/architecture deliverable, produced read-only. No source files, package
files, or Directus state were modified to produce this document.

Methodology / evidence provenance, per the requesting task's own standard ("point to real
repository/source evidence, do not rely on memory"):

- **D&D rules claims** are sourced from direct reads of the real 5etools XPHB dataset at
  `/opt/eldra/datasets/5etools-src/data/` (specifically `class/class-*.json` for all 12 real
  PHB classes and `feats.json`) performed during this audit — not from trained-in knowledge of
  D&D 2024 rules text. Every class-level table, ASI/Epic Boon level, hit die, caster
  progression, and feat category count below is a direct extraction from that corpus.
- **Eldra architecture claims** are sourced from direct reads of this repository's own files
  performed during this audit (file existence, line counts, import graphs, grep evidence), plus
  facts established in this same working session's own prior, already-verified implementation
  and production-verification work (Package Sync Phase 1, Character Progression Phase 1C, Hotfix
  1, the Content Source membership audit, and the Recovery phase) — all of which were themselves
  grounded in real file reads and a real production smoke test against Solaris (world_id=4,
  entity 1649), not recalled from memory. Where a claim rests on that earlier verified work
  rather than a fresh read performed in this audit, it is marked accordingly.
- Where full exhaustive extraction (e.g., every one of 48 subclasses' every feature at every
  level) was not performed in this pass due to effort-budget constraints, that is stated
  explicitly rather than silently extrapolated. This is itself a **Tooling Backlog** finding
  (§19): exhaustive per-subclass extraction is exactly the kind of work a `pnpm rules:audit`
  tool should automate and keep current, not something to re-derive by hand each time.

---

## 1. Executive Summary

**The target milestone is reachable only through Eldra's V2 (rules-engine) character track —
not V1.** Eldra currently has **two parallel, independently-routed character runtime systems**,
confirmed by direct inspection this pass:

| | V1 (legacy) | V2 (rules-engine) |
|---|---|---|
| Canonical page | `app/pages/worlds/[id]/entities/[entityId]/sheet.vue` (8,872 lines) | `app/pages/worlds/[id]/characters/[characterId]/sheet-v2.vue` (1,551 lines) |
| Data model | `character_sheets` Directus record | `catalogue_selection` + Rules Package evaluation (`character-actor-bridge.ts` → `character-derived.ts`) |
| Business logic | `server/utils/character-sheet-*.ts` (math, resolver, subclasses, inventory, inventory-transfers, notes) | `server/utils/character-actor-bridge.ts`, `character-derived.ts`, `character-progression-plan.ts`, `character-cast.ts`, `character-recovery.ts` |
| Content source | Hand-authored per-character fields | `app/lib/rules/*` Rules Engine + Content Packs (ContentRef-addressed) |
| Rules-engine aware? | No — zero references to `RulesRegistry`/`EvaluationSession`/`character-derived` found in the file | Yes — this is the engine's only consumer |

A thin router page, `app/pages/worlds/[id]/characters/[characterId]/sheet.vue` (41 lines), plus
`app/middleware/character-sheet-resolve.ts`, is the single canonical URL every entry point now
links to; it redirects each character to V2 if it has a `catalogue_selection`, otherwise to
legacy V1. This is a deliberate, in-progress migration (per its own header comment referencing
`.github/docs/architecture/eldra-character-sheet-visual-language.md` Phase 0), consistent with
CLAUDE.md's guidance that apparent duplication may be intentional — it is, here, and should not
be "cleaned up." But it means **every gap identified below is a V2 gap**; V1 is frozen/legacy
and out of scope for new 2024-rules capability.

**Two findings dominate everything else in this audit — both are generic engine-primitive gaps,
not content gaps, and both block large swaths of the Coverage Matrix simultaneously:**

1. **`RulesFacetGrant` can only `set` an absolute value; it cannot increment a current one.**
   This was already a known, documented gap in the engine's own source comments before this
   audit. This audit's new finding is *how central* that gap is: the single most-repeated
   character-building action in the entire 2024 ruleset — **Ability Score Improvement, which
   every one of the 12 classes grants at levels 4/8/12/16 without exception** — turns out to be
   architecturally *nothing but* a feat choice (see §4), and the winning feat's own real
   structure (`ability:[{choose:{from:[6 abilities], amount:2}}, {choose:{...count:2}}]`,
   `feats.json`) requires a **relative** +2/+1-and-+1 increase, capped at 20. The current grant
   shape cannot express this. Every one of 48 ASI occurrences across 12 classes × 4 levels is
   blocked on this one primitive.
2. **There is no generic "Resource" Definition kind.** The engine's 9 Definition kinds are
   `value | collection | modifier | source | roll | action | table | progression | choiceSet`
   (`app/lib/rules/types.ts`) — none model "a pool with a current amount, a max, a spend
   operation, and a recovery trigger." Spell slots — the one resource V2 *does* partially
   handle — are handled by bespoke, spell-slot-specific code in `character-cast.ts` and
   `character-derived.ts` (slot-count tables keyed by caster type), not a reusable primitive.
   Every other class resource (Rage uses, Bardic Inspiration, Channel Divinity, Wild Shape uses,
   Ki points, Sorcery Points, Superiority Dice, Second Wind, Action Surge, Arcane Recovery, Lay
   on Hands pool, Relentless Endurance-style once-per-rest features, etc. — all confirmed present
   across the 12 classes' `classFeatures` lists) has **no home** in the engine today and would
   need bespoke code per resource, exactly as spell slots did, unless this primitive is built
   first.

**Correction (Phase 2A0, 2026-09-30): V2 has its own native, ongoing inventory persistence —
the original claim below overstated the gap.** `server/utils/character-inventory.ts`
(`INVENTORY_BLOCK_KEY = 'inventory'`, its own `block_instances` block, completely independent of
V1's `character-sheet-inventory.ts`) is wired end-to-end: `PUT .../characters/:id/inventory` →
`useCharacterMutations.ts`'s `inventory` domain → real UI (`CharacterInventoryPanel.vue`,
`SheetInventoryTab.vue`, `SheetManageInventoryRail.vue`). What is still genuinely absent is
narrower: **no path grants starting equipment automatically from a class/background choice at
creation** — `create-v2.vue` has no equipment step, and (confirmed this pass, see §2/§20)
`app/lib/content-rules/dnd5e-2024.ts` itself documents, in its own header, that starting
equipment/gold/tool proficiencies are not authored as content at all (no `value:tool.*`
Definition exists, currency is not part of this package). A freshly created V2 character starts
with zero items; a player or GM must add every item by hand via the inventory panel after
creation. This is a content/creation gap, not a persistence-architecture gap — see §20 for the
corrected Inventory Architecture picture.

**Subclasses are structurally sound but feature-incomplete as content.** The subclass
*selection* primitive (Level 3 choice, `fromContentCatalogue`, verified end-to-end against
Solaris) is real, tested, and correctly scoped to exactly the 48 native-XPHB subclasses (see
§5) — **this is now true for all 12 classes, not just Wizard**: a real browser defect (Bob, a
Level-1 Barbarian, no Subclass choice at Level 3) exposed that this section's own prior claim had
only ever been verified for Wizard; corrected and fixed 2026-10-01, see §5's own correction note
and the new Progression Coverage Ledger. What is **still not yet authored** is each subclass's
own level-by-level feature content (Level 3/6/10/14 subclass features) — only the selection slot
itself and the base class progression are wired today.

**ASI/Feats, Resources, Actions, and Equipment are the four systems furthest from complete.**
Creation, base class progression scaffolding, and Spellcasting-the-choice-and-slot-count-layer
are comparatively far along. See the Coverage Matrix (§12) for the full breakdown.

---

## 2. Creation Audit

**Updated 2026-09-30 (Phase 2A0) — both open flags from the original pass are now closed by
direct code trace.** `server/api/worlds/[id]/characters/create-v2.post.ts` and
`app/pages/worlds/[id]/characters/create-v2.vue` were read in full this pass, along with their
shared pure module `app/components/characters/builder/characterBuilderSelection.ts` and the
content corpus they consume (`app/lib/content-rules/dnd5e-2024.ts`).

**Canonical entry point, confirmed**: `characters/index.vue` offers two creation links —
`create-v2` ("Create Character," primary filled button) and legacy `builder` ("Guided PC
Builder," secondary outline button, V1). `create-v2` is the canonical, higher-weight path; this
matches the pre-existing understanding and is re-confirmed rather than assumed. `builder.vue`
(V1) still exists and is still linked, not removed — consistent with CLAUDE.md's "apparent
duplication may be intentional" guidance; it is out of scope for this milestone regardless.

**`create-v2`'s real step set (`BuilderStepKey`, a fixed TypeScript union)**: `identity → species
→ class → background → proficiencies → abilities → review`. Every step present is generic and
content-driven for what it does cover:
- Species/Class/Background: `CharacterBuilderOptionPicker` against `GET /api/worlds/:id/catalogue`,
  with a live preview (`ContentPresentationPanel.vue`, the same component the Sheet uses).
- **Proficiencies step is a genuinely generic, package-declared choice renderer** — confirmed by
  direct read of `declaredChoices()` (`characterBuilderSelection.ts:269`): it iterates
  `draft[key].rulesFacet.choices` for all three of species/class/background with **no hardcoded
  choice name, category, or shape** — any `RulesFacetChoice` any of the three facets declares
  would render here automatically. `create-v2.post.ts` independently re-derives the identical
  `declaredChoices` list server-side and validates against it — the generic behavior is
  server-enforced, not merely a client convenience.
- Ability Scores: `CharacterAbilityScoreEditor.vue` against `app/lib/characters/ability-scores.ts`.
  **Four methods are declared** (`AbilityScoreMethod = 'standard-array' | 'point-buy' | 'manual'
  | 'roll'`), but `roll` is explicitly listed in `UNAVAILABLE_ABILITY_SCORE_METHODS` and is
  permanently incomplete per `isCompleteForMethod` (`// 'roll' is stubbed and can never be
  complete`) — i.e., **3 of 4 declared methods actually work; `roll` is a structurally-present,
  intentionally-disabled stub**, not a hidden bug.

**What is absent from creation, and why — the first broken boundary is CONTENT, not UI, for
every one of the browser-observed gaps.** `app/lib/content-rules/dnd5e-2024.ts`'s own header
comments (read in full this pass, lines 32–117) are direct, first-party confirmation, predating
this audit, of exactly these gaps:
- **ASI**: "needs an 'increase by' operation a Rules Facet deliberately does not have" — matches
  this audit's own independently-derived §1/§4 finding exactly, now with a source citation.
- **Origin Feat**: "Origin Feats need feat Definitions, which the Core Character Rules package
  does not declare (feats are not one of its seven categories)" — more foundational than a
  missing choiceSet pattern: the package's Definition vocabulary has no Feat concept at all yet.
- **Starting equipment / gold / tool proficiencies**: "no `value:tool.*` Definition exists to
  name, and currency (Category 16) is not part of this package." Confirmed structurally: a
  grep of the entire corpus file finds exactly one choiceSet id in use anywhere —
  `choice:skill.proficiency` — on any of the 12 classes or 2 authored species (`elf-xphb`,
  `human-xphb`). No Fighting Style, Weapon Mastery, or equipment/gold choiceSet exists anywhere
  in the file.
- **Spell prepared/known count limits**: explicitly deferred — "the vendored dataset's own
  `preparedSpellsProgression` arrays... do not reduce to [a] closed-form rule this task could
  verify by test... authoring a formula from an unverified guess would be worse than leaving the
  gap stated."
- **Species mechanics generally**: "8 of 10 XPHB species declare no skill proficiencies at all"
  — most species content (Darkvision, speed, resistances) is out of scope for what this package's
  category set (movement/conditions/combat not covered) can express, independent of the Builder.

So: none of "Builder doesn't ask about Fighting Style / Weapon Mastery / Origin Feat / starting
equipment / spells" is a Builder UX limitation on its own — the Builder's proficiency step would
render any of these automatically if they were declared. **The first broken boundary for all
five is the Rules Facet content layer**, and for ASI/Origin Feat specifically it traces one level
deeper, to missing engine primitives (increment-grant) and missing Definition vocabulary (feat
category) respectively — both already identified in §1/§14 of this audit, now corroborated by
the content author's own documentation rather than inferred solely from this audit's own reading.

**Duplicate proficiency handling, traced and confirmed** (§12's own flag closed): direct read of
`validateChoiceSelection()` (`app/lib/characters/rules-choices.ts:166`) shows it checks (a) no
duplicate selection within the same choice, (b) each selection is inside that choice's own
`options` list, (c) exact count — and has **no cross-facet awareness of values already granted
by a different facet**. A Background that grants Medicine outright (`grants`) and a Class that
separately offers Medicine as one of its N selectable skills (`choices`) will let the player pick
Medicine again: the server **accepts it** (legal within that one choice's own option list) and
the pick is **wasted** (the underlying `value:skill.medicine.proficient` grant is a boolean
`set`, not additive — a second `set: true` changes nothing). The smallest missing generic
concept is **cross-facet already-granted-value exclusion at choice-option-construction time** —
`declaredChoices`/`toResolvableChoice` would need visibility into every other facet's resolved
`grants` (and other choices' resolved selections) for this character before building `options`,
not a new validation rule layered after the fact.

**Classification: A. COMPLETE** for the choice-rendering/validation *mechanism* itself (generic,
server-enforced, proven for the one choice type currently authored); **C. CONTENT MISSING** for
Fighting Style, Weapon Mastery, Origin Feat, starting equipment/gold, tool proficiencies, and
spell prepared/known limits (all confirmed absent from the Rules Facet corpus, for the specific
documented reasons above — not oversights); **D. ENGINE PRIMITIVE MISSING** underlying two of
those (ASI's increment-grant, Origin Feat's missing Feat Definition category); **D. ENGINE
PRIMITIVE MISSING** for duplicate-proficiency exclusion specifically (a real, confirmed,
previously-unverified gap, not merely "likely absent" as the original pass hedged); **B.
FOUNDATION EXISTS** for Ability Score assignment (3 of 4 methods genuinely work; `roll` is an
intentional stub, not a silent gap).

---

## 3. Class 1–20 Audit (all 12 PHB classes)

Real, corpus-extracted per-class structural facts (source: `class-<name>.json`, `source ===
'XPHB'` row, this audit):

| Class | Hit Die | Caster Progression | Spellcasting Ability | ASI Levels | Epic Boon Level | Distinct feature-bearing levels (1–20) |
|---|---|---|---|---|---|---|
| Barbarian | d12 | — | — | 4, 8, 12, 16 | 19 | 20 |
| Bard | d8 | full | CHA | 4, 8, 12, 16 | 19 | 16 |
| Cleric | d8 | full | WIS | 4, 8, 12, 16 | 19 | 15 |
| Druid | d8 | full | WIS | 4, 8, 12, 16 | 19 | 16 |
| Fighter | d10 | — | — | **4, 6, 8, 12, 14, 16** | 19 | 20 |
| Monk | d8 | — | — | 4, 8, 12, 16 | 19 | 20 |
| Paladin | d10 | artificer (half) | CHA | 4, 8, 12, 16 | 19 | 18 |
| Ranger | d10 | artificer (half) | WIS | 4, 8, 12, 16 | 19 | 20 |
| Rogue | d8 | — | — | **4, 8, 10, 12, 16** | 19 | 20 |
| Sorcerer | d6 | full | CHA | 4, 8, 12, 16 | 19 | 16 |
| Warlock | d8 | pact | CHA | 4, 8, 12, 16 | 19 | 17 |
| Wizard | d6 | full | INT | 4, 8, 12, 16 | 19 | 14 |

Notable, non-obvious real findings from this table:

- **Fighter and Rogue are structural outliers on ASI cadence** — Fighter gets *six* ASI/feat
  opportunities (4/6/8/12/14/16, i.e., an extra one at 6 and 14) and Rogue gets *five*
  (4/8/10/12/16, extra at 10). A generic "ASI at levels 4/8/12/16" assumption, if hardcoded
  anywhere during future implementation, would silently under-grant two classes. This must be
  driven from real per-class `classFeatures` data, never a shared constant.
- **Level 19 is uniformly "Epic Boon," not a fifth ASI**, for all 12 classes — confirmed by the
  `classFeatures` reference literally being a different feature name ("Epic Boon") at level 19
  in every class file, and by the real feat corpus having a dedicated `EB` category (12 feats)
  distinct from the `G` (43) category ASI belongs to.
- **casterProgression has three distinct non-null shapes**: `full` (Bard/Cleric/Druid/
  Sorcerer/Wizard), `artificer` (half-caster: Paladin/Ranger), and `pact` (Warlock, its own
  Pact Magic slot table, not the standard multiclass slot table). Any generic "spell slot
  primitive" (see §6, §19 Resource primitive) must key off all three, not just full/half.
- Barbarian/Fighter/Monk/Rogue have `casterProgression: None` — no spellcasting engine work is
  in scope for these four at all except where a subclass grants limited casting (e.g., Eldritch
  Knight/Arcane Trickster) — **subclass-granted spellcasting was not independently verified this
  pass**; flagged as a required check before Spellcasting can be marked complete for those two
  subclasses specifically.

**Classification per class**: **B. FOUNDATION EXISTS** for base progression scaffolding
(species/class/subclass/background slots generically consume `progression` rows per
`character-actor-bridge.ts`'s `SLOT_ORDER`), but **D. ENGINE PRIMITIVE MISSING** for ASI (blocked
on the increment-grant gap, §1/§4) and **C. CONTENT MISSING** for the bulk of non-ASI class
features at levels 5–20, which were not confirmed as authored content in the current
`eldra.rules.dnd5e-2024@0.11.0` package this pass (only Level 1–3 structural wiring was
re-verified; deeper-level content authoring status is a Package Authoring Backlog item, §17, not
independently re-audited feature-by-feature here given budget).

---

## 4. ASI / Feat Audit

Real corpus evidence, `feats.json`, `source === 'XPHB'` (77 total native feats):

| Category | Count | Meaning | Prerequisite pattern |
|---|---|---|---|
| `G` (General) | 43 | Standard ASI-tier feats, includes "Ability Score Improvement" itself | Level-gated (mostly level 4) |
| `O` (Origin) | 10 | Background-granted at character creation, not from class ASI slots | **All `prerequisite: None`** — Alert, Crafter, Healer, Lucky, Magic Initiate, Musician, Savage Attacker, Skilled, Tavern Brawler, Tough |
| `FS` (Fighting Style) | 10 | Fighter/Paladin/Ranger Fighting Style choice, represented as feats in 2024 rules | Class-gated |
| `FS:P` | 1 | Paladin-specific Fighting Style variant | — |
| `FS:R` | 1 | Ranger-specific Fighting Style variant | — |
| `EB` (Epic Boon) | 12 | Level-19 alternative to standard ASI | Level 19 |

**The single most important structural finding of this audit**: 2024-rules ASI is *not* a
separate mechanic from feats. Every class's level-4/8/12/16 (or class-specific variant, §3)
`classFeatures` entry is literally a feature named "Ability Score Improvement" whose text reads
*"You gain the Ability Score Improvement feat or another feat of your choice for which you
qualify."* The stat-increase behavior lives entirely inside the one specific feat also named
"Ability Score Improvement" (`feats.json`), whose real structure is:

```
{
  category: "G",
  prerequisite: [{ level: 4 }],
  repeatable: true,
  repeatableHidden: true,
  ability: [
    { choose: { from: [6 abilities], amount: 2 }, hidden: true },
    { choose: { from: [6 abilities], count: 2 }, hidden: true }
  ]
}
```

i.e., pick either +2 to one ability or +1 to two abilities, capped at 20 — expressed as a
**relative increase**, not an absolute set.

**This means the Eldra implementation shape should be: one generic "Feat Selection"
`choiceSet` (fed by `fromContentCatalogue`, same primitive Subclass selection already
successfully uses) reused at every ASI level across all 12 classes, resolving to a
`ProgressionRow.choices` entry — not a class-specific or level-specific bespoke mechanic.** The
only missing *engine* primitive is the increment-capable grant (§1); once that exists, ASI
becomes a **content-authoring task** (Package Authoring Backlog, §17: "author the ASI/feat
progression row once per class, generically," not 12 bespoke implementations).

Origin feats (10, zero prerequisites) are architecturally simpler — they slot into Background's
existing `grants`, which `RulesFacetGrant`'s `set` operation likely already supports today for
any Origin feat whose effect is itself a `set` (e.g., granting a fixed proficiency), but would
hit the same increment gap for any Origin feat that also touches an ability score. Fighting
Style feats (10 + 2 variants) are a pure `choiceSet` — no increment dependency, and structurally
closer to "ready to author" than ASI is.

**Classification: D. ENGINE PRIMITIVE MISSING** (blocked on relative-grant primitive) for
standard ASI and any ability-touching Origin/Epic Boon feat; **C. CONTENT MISSING** (not
`D.`) for Fighting Style and non-ability Origin feats, which need only authoring once the
generic Feat Selection `choiceSet` pattern exists.

---

## 5. Subclass Audit (48 native-XPHB subclasses, 4 per class)

**CORRECTION (ALL-CLASS PROGRESSION CONTRACT AUDIT, 2026-10-01):** this section's own prior
"Classification: A. COMPLETE for subclass selection (all 48, all 12 classes)" was **wrong, and
overstated from genuinely Wizard-only evidence.** The Tonso Fun Jr. smoke test cited below tested
exactly one class (Wizard) — the one class `progression:class.subclass-selection` had ever been
wired into. The other 11 classes' facets never referenced that Progression at all, so a real
Barbarian's Level 1→3 Level Manager preview showed pure automatic numeric progression with **no**
Subclass choice, despite this section's own claim. Caught by real browser acceptance (Bob, a
Level-1 Barbarian), not by this audit. This section now separates four previously-conflated
claims, per the audit's own standing caveat about not treating "subclass selection" as one
monolithic status:

1. **Subclass catalogue identity** — `subclass.source === 'XPHB'` (distinct from `classSource`,
   which only means "compatible with this class edition") yields exactly 4 subclasses × 12
   classes = 48. Re-confirmed, not re-derived, this pass: a direct read-only query against
   Solaris's actually-bound Content Pack (`eldra.solaris.xphb@1.0.8`) found all 48 present with
   correct `parentClassSlug` values. **A. COMPLETE** — this was never the actual gap.
2. **Subclass selection engine** — the `choiceSet`/`fromContentCatalogue`/parent-class-filtering
   machinery (`character-derived.ts`'s `parentClassSlug` resolution, `character-progression-
   plan.ts`'s `confirmProgression` wrong-class rejection). **A. COMPLETE** — proven generic and
   class-agnostic by this pass's own 74-test `character-progression-all-class-subclass.test.ts`
   (every one of the 12 real classes' own real ProgressionPlan, 4 real options each, wrong-class
   rejection for each), not merely asserted.
3. **All-class subclass PACKAGE AUTHORING** — whether each of the 12 classes' own `RulesFacet`
   actually *references* `progression:class.subclass-selection` at all. **This was the real
   gap**, now fixed: all 12 class facets in `app/lib/content-rules/dnd5e-2024.ts` reference it
   (previously only `wizard-xphb`'s did). Verified against the real corpus that all 12 classes
   genuinely select their subclass at Level 3 (a real 2024 PHB standardization — 2014 D&D varied
   this per class) before concluding one shared Progression (not a per-class cadence variant,
   unlike ASI/Feat, §4) was the correct fix — package/content authoring only, zero application
   branching on class name. **A. COMPLETE**, Tonso's own smoke test re-confirmed still passing,
   Wizard unaffected by the fix.
4. **Subclass-internal feature progression** (a subclass's own LATER feature, e.g. a Level 6/10
   feature, as opposed to the subclass-selection feature itself at Level 3) — **still the
   unresolved gap this section's own prior text correctly flagged**, now given a stable,
   CI-tracked identity rather than prose: see the **Progression Coverage Ledger** below. Blocked
   on the same missing primitive the Subclass Resource Audit (§7) already named
   (`subclass-internal-feature-level-gating` — no mechanism for a subclass facet's own feature to
   activate at a level later than the subclass's own selection level). **D. ENGINE PRIMITIVE
   MISSING**, not implemented this pass (out of this task's own explicit scope — subclass
   *selection* was the authorized fix, not subclass-internal feature runtime).

**Real production smoke test** (prior phase, re-confirmed still current this session, now
genuinely representative rather than the sole evidence for a global claim): Tonso Fun Jr. (entity
1649, Solaris) reaches Level 3 with a "Subclass" choice presenting exactly the 4 real Wizard
subclasses (Abjurer/Diviner/Evoker/Illusionist) as `ContentRef` options.

**What is still not yet authored** (unchanged by this pass — subclass *selection* was the fix,
subclass *feature content* was never in this task's scope): each subclass's own level-gated
feature rows (typically Level 3, 6, 10, 14 for most 2024 subclasses). The class-level base
progression (§3) is separately tracked from subclass-level content — a subclass choice resolving
correctly is not the same claim as "that subclass's Level 6 feature is implemented."

### Progression Coverage Ledger (new this pass)

The Bob/Barbarian defect was a symptom of a broader process gap: nothing previously caught "a
real corpus choice nobody wired into any class facet" except manual browsing. A machine-readable,
CI-enforced ledger now exists for this:
[`app/lib/content-rules/dnd5e-2024-progression-coverage.ts`](../../../app/lib/content-rules/dnd5e-2024-progression-coverage.ts)
classifies every choice-bearing feature discovered across all 12 classes' real XPHB corpus
(subclass selection, ASI/Feat, Epic Boon, Fighting Style, Weapon Mastery, Expertise, Metamagic,
Eldritch Invocations, Mystic Arcanum, spell acquisition/preparation per casting class, 7 genuine
subclass-internal selectable features, 2 Level-1 Background creation gaps, and 2 text-signal
false positives given their own honest classification rather than silently dropped) into exactly
one of `IMPLEMENTED` / `ENGINE_BLOCKED` / `CONTENT_BLOCKED` / `MILESTONE_DEFERRED` /
`SOURCE_BLOCKED`. Enforced by
[`tests/rules/dnd5e-2024-progression-coverage.test.ts`](../../../tests/rules/dnd5e-2024-progression-coverage.test.ts),
which independently re-derives the candidate feature set from the real corpus
(`/opt/eldra/datasets/5etools-src/data/class/class-*.json`) using a documented detection
heuristic (known-name set + `optionalfeatures`-tag/strong-choice-phrasing text signal) and fails
if the corpus and ledger ever disagree in either direction — including a dedicated fixture
proving a ledger missing a real discovered feature fails the check, so this is a real gate and
not merely "the ledger file parses." The ledger's own header documents its detection heuristic's
honest limitations (text-signal false positives are possible and are individually classified,
never silently dropped).

---

## 6. Spellcasting Audit

Real corpus facts (§3): three distinct `casterProgression` shapes (`full`, `artificer` [half],
`pact`) across 8 of 12 classes that cast natively (Bard, Cleric, Druid, Paladin, Ranger,
Sorcerer, Warlock, Wizard); the remaining 4 (Barbarian, Fighter, Monk, Rogue) cast only via
specific subclasses (Eldritch Knight, Arcane Trickster, etc.) — **subclass-granted casting was
not independently re-verified this pass.**

Eldra-side: spell slot counts, the Spellcasting choice UI (`CharacterSpellcastingPanel.vue`),
and the cast-resolution pipeline (`server/utils/character-cast.ts`, confirmed this pass via
direct read — `classifySpellCastCapability`, `resolveCastableSpell`, slot tables keyed by
caster type via `SLOT_TABLE_BY_CASTER_TYPE`) are real, V2-native, and materially further along
than most other systems audited here. `character-derived.ts` computes slot tables per caster
type as a `derived.derived.tables` entry.

**Updated 2026-09-30 (Phase 2A0) — the persistence flag is now fully closed, in Eldra's favor.**
Full trace, orb click through reload, through direct code read:

- **Persisted location**: `block_instances`, `block_key: 'spellcasting'`
  (`server/utils/character-spellcasting.ts`, `CHARACTER_SPELLCASTING_BLOCK_KEY`), the same
  polymorphic per-entity store `health`/`inventory`/`notes`/`ability_scores`/`rules_choices` use.
  Not a new mechanism.
- **Stored shape**: `{ spells: StoredSpellEntry[], expendedSlots: Record<string, number> }`,
  keyed by slot level as a string (`'1'`–`'9'`); an absent key means zero expended. The same
  shape serves full/half casters (several nonzero levels) and Pact casters (exactly one nonzero
  level) with no special-casing.
- **Manual orb click**: `CharacterResourceOrbs.vue` emits `expend`/`restore` (position-based, not
  identity-based — filled orbs are consumed first) → `CharacterCommandResources.vue` relays →
  `useCharacterMutations.ts`'s `spellcasting.expendSlot/restoreSlot` → pure `expendSlot`/
  `restoreSlot` (`app/lib/characters/spellcasting.ts`) computes the next map →
  `persistSpellcasting` → `PUT .../characters/:id/spellcasting` → `saveCharacterSpellcasting`.
  **Persists immediately**, synchronously with the click (optimistic-set-then-persist-then-
  rollback-on-failure, the same pattern every other mutation domain in this file uses).
- **Cast path**: `server/utils/character-cast.ts`'s `expendSpellSlotAuthoritatively()` (line 501)
  calls the exact same `loadCharacterSpellcasting → expendSlot → saveCharacterSpellcasting`
  sequence as the manual orb path — **same authority, same block, same function**, not a
  parallel/divergent write path.
- **The literal `expendedSlots: {}` the original audit flagged (`character-cast.ts:427`) is
  confirmed deliberate, not a bug or an unfinished path.** It appears only inside
  `checkSpellSlotAvailability`'s first step, which exists solely to compute `max`/legality from
  the Rules Engine table — the function's own comment (lines 418–426) states this explicitly:
  "the ACTUAL expended count is read fresh from persistence below, immediately before the
  mutating write, rather than trusted from this earlier read" — and two lines later (440–441) it
  does exactly that (`loadCharacterSpellcasting` → real `expended` count). This two-step shape
  exists specifically to narrow (not eliminate) a real, separately and honestly documented race
  condition (`character-cast.ts`'s own "KNOWN, UN-SOLVED RACE: TWO CLIENTS, ONE LAST SLOT"
  section, lines 119–135): the block-write has no optimistic-concurrency check, so two truly
  simultaneous Casts against a character's last slot of a level can both pass the availability
  check before either writes, silently losing one decrement. Documented, not hidden; out of
  scope to fix in this phase.
- **Reload path**: `useCharacterSheet.ts`'s `blueprint` watcher (lines 327–338) seeds
  `spellcastingExpendedSlots.value` from `value?.expendedSlots` on every assembly fetch;
  `character-assembly.ts` (lines 503–504) populates that field from
  `spellcasting?.expendedSlots ?? {}`, i.e., a fresh `loadCharacterSpellcasting` read on every
  page load. **A browser reload reads the persisted value — confirmed, not assumed.**
- **Long Rest**: `character-recovery.ts`'s `'long-rest'` branch unconditionally sets
  `resetSpellSlots = true`; when true, it loads the current spellcasting block and saves it back
  with `expendedSlots: resetAllSlots()` (`{}`) — **every caster type, no special-casing**,
  exactly matching RAW. Confirmed by direct read, not inferred.
- **Short Rest**: sets `resetSpellSlots = numbers.isPactCaster` — **ordinary (full/half) slots
  are explicitly NOT reset on a Short Rest; only a Pact caster's slots are**, matching 2024 RAW
  exactly (Warlock recovers on a short rest, nobody else does).
- **Pact Magic**: uses the **exact same persisted representation** as full/half casters — same
  block, same `expendedSlots` shape, same key-by-slot-level scheme. The only difference is in
  `deriveSpellSlotLevels`: for `casterType === 'pact'`, the Pact table (`table:spellcasting.
  slots_pact`) declares one shared `slot_level`/`slots` pair rather than nine per-level columns,
  so the function returns a single-entry array instead of up to nine — a display/derivation
  difference only, not a persistence-model difference.

**Spell selection/preparation counts** (`classTableGroups` → `rowsSpellProgression`): confirmed
this pass that **no legal class-spell-list filtering exists anywhere in the add-spell path** —
`spellOptions` (`useCharacterSheet.ts`) is the World catalogue's entire `spells` array with no
class-list narrowing, and nothing in `character-spellcasting.ts`/`app/lib/characters/
spellcasting.ts` checks a spell's class list before accepting it. A player can add any spell in
the bound catalogue to any character regardless of class. Separately, no enforced maximum
known/prepared count exists (matches the content-rules file's own documented deferral, §2).
These are two distinct, now-confirmed gaps: content exists (catalogue), persistence exists
(spellcasting block), but eligibility enforcement and count limits do not.

**Subclass-granted casting** (Eldritch Knight/Arcane Trickster-style): still not independently
verified this pass — genuinely out of scope for this phase's two named unknowns; remains an open
item for a future check, not silently assumed either way.

**Classification**: **A. COMPLETE** for maximum derivation, manual expenditure persistence, Cast
expenditure persistence, reload restoration, and Long Rest recovery — all five traced end-to-end
with exact file/function evidence and no unresolved step. **A. COMPLETE** for Pact Magic using
the shared representation. **B. FOUNDATION EXISTS** for Short Rest (correctly scoped to Pact only,
by design, matching RAW — not a gap). **C. CONTENT MISSING** for class-spell-list eligibility and
known/prepared count limits (confirmed absent, not merely unverified). **F. UX MISSING** remains
for multi-client race safety (documented, deliberately out of scope this phase) and for
subclass-granted casting (status still genuinely unknown).

---

## 7. Resource Audit

**Updated 2026-10-01 (Phase 2A.2) — the generic-primitive gap this section originally identified
is now CLOSED.** `ResourceDefinition` (`kind: 'resource'`, `app/lib/rules/types.ts`) already
existed pre-Phase-2A.2 as a working "derived maximum" primitive (`evaluator.ts`'s `case
'resource'` already evaluated `max` exactly like a Value's `formula` — confirmed by direct read
before implementation) but the §12.5-documented "expands into two Values... a resourceOf
back-link" sugar had never been implemented anywhere (a repo-wide grep found zero hits beyond
the one doc comment); in practice `kind: 'resource'` was nothing more than a labeled maximum,
with no current/expended/recovery concept at all — this section's original finding. Phase 2A.2's
own corpus audit (direct extraction from `/opt/eldra/datasets/5etools-src/data/class/class-*.json`
`classFeature`/`subclassFeature` entries and `classTableGroups`, all 12 classes) found the real
shapes needed and added exactly two small, additive fields rather than a new Definition kind:
`recovery?: {trigger: 'short-rest'|'long-rest'; amount: 'full'|RuleValue|Expression}[]` and
`presentation?: {style: 'pool'|'dice'; dieSize?: RuleValue|Expression}`.

**Authored this phase, all against REAL corpus-extracted level tables/formulas** (`packages/
eldra-dnd5e-2024/definitions.json`, `app/lib/content-rules/dnd5e-2024.ts`): Rage (Barbarian,
always-on L1), Second Wind (Fighter, L1), Action Surge + Indomitable (Fighter, level-gated at
2/9), Channel Divinity (Cleric L2 and Paladin L3 — two SEPARATE Resource Definitions, named by
table SHAPE never by class — `resource:channel_divinity.standard`/`.extended`, mirroring
`progression:class.asi-standard`/`asi-extended`'s own precedent), Wild Shape (Druid, L2), Bardic
Inspiration (Bard, always-on L1 — max is `max(1, Charisma modifier)`, die size 1d6→1d12),
Sorcery Points (Sorcerer, L2, max = Level directly), Focus Points (Monk, L2, same shape),
Lay on Hands (Paladin, always-on L1, `5 × level`), Superiority Dice (Battle Master subclass,
step-function max 4/5/6, die size d8→d12), **Favored Enemy (Ranger, always-on L1, table-shaped
max — DONE, follow-up pass)**, and **Tireless (Ranger, level-gated L10, max = Wisdom modifier —
DONE, follow-up pass)**. Level-scaling max is authored as a nested-`if` level-breakpoint
expression throughout, not a Table reference — Table `lookup()` is confirmed still unimplemented
in the evaluator (see this section's own TABLE LOOKUP BACKLOG below). **Rogue confirmed to have
no native resource to author** (Sneak Attack is a damage modifier, not a pool).

**Font of Inspiration (Bard, Level 5) — DONE, follow-up pass.** The real corpus text ("you now
regain all your expended uses of Bardic Inspiration when you finish a Short Rest or Long Rest")
is a LEVEL-GATED change to an existing resource's own recovery rule set, not a new resource.
Investigated whether the architecture could express this generically: yes, with one small,
additive extension — `ResourceRecoveryRule.condition?: Expression`, mirroring `ModifierSpec.
condition` one layer over in the Modifier Pipeline (the identical "absent = unconditional"
shape, no new concept). `resource:bardic_inspiration` now declares a Long-Rest entry
(unconditional) and a Short-Rest entry gated by `@value:level>=5`; `character-derived.ts` filters
inactive rules out before `character-recovery.ts` ever sees them, so the rest orchestrator
contains **zero Bard-specific branching** (confirmed by reading the diff — it still only reads
the already-resolved `DerivedResource.recovery` array). The one remaining real-corpus nuance —
"expend a spell slot to regain one use" — is a spell-slot-interaction feature (category G).
Left unmodeled, honestly, as a second, independent recovery TRIGGER this phase's closed
`ResourceRecoveryTrigger` vocabulary (`'short-rest' | 'long-rest'`) does not include; see
NON-REST RECOVERY below.

**Lay on Hands large-pool UI — DONE, follow-up pass.** `ResourcePresentation.style` gained a
third value, `'points'` (`app/lib/rules/types.ts`), package-authored (never inferred from
`max`). `CharacterResourceOrbs.vue` renders a compact `remaining / max` readout plus an amount
input and Spend/Restore buttons for a `'points'` pool instead of one orb per unit — proven at
Level 20 (max 100) to never generate 100 orb controls. The manual expend/restore route now
accepts an optional `amount` (structurally validated as a positive integer only; the server's
existing `expendResource`/`restoreResource` clamp against the real max/zero regardless of what
is sent, so this adds no new authority surface). This is resource ACCOUNTING only — Lay on
Hands' actual healing/target-application effect remains unimplemented, as it always was.

**NON-REST RECOVERY, found and deferred, honestly, with the exact missing primitive named**:
Arcane Recovery (Wizard) and Sorcerous Restoration (Sorcerer) are RECOVERY FEATURES that modify
an existing resource/spell-slot pool rather than owning one of their own (category E) —
explicitly out of the base primitive's scope. Tides of Chaos (Sorcerer, Wild Magic subclass) is
a genuine THIRD recovery trigger this architecture does not yet model: it recovers on "cast a
Sorcerer spell with a spell slot," not on a rest at all — `ResourceRecoveryTrigger`'s closed
`'short-rest' | 'long-rest'` vocabulary would need a third member (e.g. `'spell-cast'`) to
express it honestly; deferred rather than faked as a rest. Relentless Rage (Barbarian) is a
save-DC escalation, not a resource (category H). Arcane Ward (Wizard, Abjurer subclass) is a
derived HP-shield that recharges via an Abjuration spell-cast trigger and drains via damage —
structurally closer to Temporary HP than to a spend/rest-recovery pool, and NOT resource-shaped
for this primitive. See §SUBCLASS AUDIT below for Psionic Power (Psi Warrior/Soulknife) and the
full 48-subclass classification.

**Classification: A. COMPLETE** for the generic primitive (Definition shape, acquisition,
level-gated recovery-rule upgrades, large-pool presentation, persistence, derived-character
exposure, UI, rest recovery, action-consumption foundation). **A. COMPLETE** for every
base-class resource identified as fitting the primitive (11 of 11 — zero "ready but not
authored" rows remain). **C. CONTENT MISSING**, each with a named reason, for the handful that
do not fit today (NON-REST RECOVERY list above) or that need a not-yet-built subclass-level-gate
primitive (SUBCLASS AUDIT below). **A. COMPLETE** still for spell slots (unchanged, still
bespoke — coexistence, not migration, per this phase's own explicit instruction).

### Final Resource Corpus — every candidate, final classification

| Resource | Owner | Status | Reason |
|---|---|---|---|
| Rage | Barbarian | **AUTHORED** | — |
| Second Wind | Fighter | **AUTHORED** | — |
| Action Surge | Fighter | **AUTHORED** | — |
| Indomitable | Fighter | **AUTHORED** | — |
| Channel Divinity (standard) | Cleric | **AUTHORED** | — |
| Channel Divinity (extended) | Paladin | **AUTHORED** | — |
| Wild Shape (uses) | Druid | **AUTHORED** | Shapeshift effect itself out of scope |
| Bardic Inspiration | Bard | **AUTHORED** | Font of Inspiration's spell-slot-conversion option deferred (NON-REST RECOVERY) |
| Sorcery Points | Sorcerer | **AUTHORED** | — |
| Focus Points | Monk | **AUTHORED** | — |
| Lay on Hands | Paladin | **AUTHORED** | Points presentation; healing effect itself out of scope |
| Superiority Dice | Battle Master (subclass) | **AUTHORED** | — |
| Favored Enemy | Ranger | **AUTHORED** | — |
| Tireless | Ranger | **AUTHORED** | — |
| Pact Magic | Warlock | **ALREADY SUPPORTED ELSEWHERE** | Covered under Spellcasting (§6), its own bespoke slot table |
| Sneak Attack | Rogue | **NOT A RESOURCE** | Damage modifier, not a pool — verified absence |
| Arcane Recovery | Wizard | **DEFERRED** | Category E recovery feature (modifies spell slots), not a pool |
| Sorcerous Restoration | Sorcerer | **DEFERRED** | Category E recovery feature (modifies Sorcery Points) |
| Relentless Rage | Barbarian | **NOT A RESOURCE** | Save-DC escalation (category H) |
| Tides of Chaos | Sorcerer (Wild Magic subclass) | **DEFERRED** | Needs an unbuilt 3rd recovery trigger ("cast a spell with a slot"), not short/long rest |
| Arcane Ward | Wizard (Abjurer subclass) | **NOT A RESOURCE** | Derived HP-shield, recharges via spell-cast, drains via damage — kin to Temp HP, not this primitive |
| War Priest | Cleric (War Domain subclass) | **DEFERRED** | Fits the primitive; blocked on a subclass-internal feature-level gate (see SUBCLASS AUDIT) |
| Warding Flare | Cleric (Light Domain subclass) | **DEFERRED** | Same subclass-level-gate blocker |
| Dark One's Own Luck | Warlock (Fiend Patron subclass) | **DEFERRED** | Same subclass-level-gate blocker |
| Psionic Power (Psionic Energy dice) | Fighter (Psi Warrior)/Rogue (Soulknife) subclasses | **DEFERRED** | Identified as resource-shaped (same die-pool shape as Superiority Dice); not individually corpus-verified this pass — see SUBCLASS AUDIT |
| Every other subclass feature (~45 names, 48 subclasses) | various | **NOT A RESOURCE** (batch, by structural pattern) | Damage riders, spell-like abilities, AC/resistance bonuses, one-time triggers — see SUBCLASS AUDIT for the full list and methodology caveat |

No "ready but not authored" or "time-boxed out" rows remain for any CLASS-level (non-subclass)
resource.

### Subclass Resource Audit (all 48 native-XPHB subclasses)

Scanned every `subclassFeature` across all 12 classes' real XPHB subclasses for resource-shaped
keywords, then pulled full text for every plausible candidate. Findings:

- **Superiority Dice** (Battle Master) — **AUTHORED**, proves subclass acquisition generically.
- **War Priest** (Cleric, War Domain, L3), **Warding Flare** (Cleric, Light Domain, L3), **Dark
  One's Own Luck** (Warlock, Fiend Patron, L6) — all three real, corpus-verified, structurally
  clean finite pools (`max(1, ability modifier)`, the identical shape Bardic Inspiration/Tireless
  already prove) — **DEFERRED, not authored, for a real correctness reason caught before
  authoring**: a subclass facet is consumed unconditionally the moment `subclassRef` resolves
  (the ordinary SLOT_ORDER 'subclass' slot), with no subclass-INTERNAL level gate analogous to
  `ProgressionRow.resources`. Battle Master has no such gap only because its subclass-selection
  level and Combat Superiority's own level happen to coincide (both 3) — Cleric/Warlock select
  their subclass at level 1 while these three features are real level-3/level-6 features, so
  wiring them today would grant access 2–5 levels early. **Missing primitive, precisely named**:
  a subclass-scoped, feature-level-keyed resource-acquisition row (the subclass-facet
  counterpart of `ProgressionRow.resources`).
- **Psionic Power** (Fighter/Psi Warrior, Rogue/Soulknife) — identified by name as a Psionic
  Energy dice pool, the same structural shape as Superiority Dice; full text not individually
  pulled this pass (time-boxed) — **DEFERRED**, flagged for the next systematic subclass pass,
  not silently omitted.
- **Tides of Chaos** (Sorcerer, Wild Magic) and **Arcane Ward** (Wizard, Abjurer) — see the
  Final Resource Corpus table above; both real and corpus-verified, both **NOT resource-shaped
  for this primitive** (non-rest trigger; derived HP-shield, respectively).
- **Inspiring Smite** (Paladin, Oath of Glory) and **Elemental Burst** (Monk, Warrior of the
  Elements) — verified by text: both CONSUME an already-authored resource (Channel Divinity,
  Focus Points respectively) rather than owning a new one. **NOT a new resource.**
- **Divine Fury** (Barbarian, Path of the Zealot) — verified by text: a passive damage rider
  while Rage is active. **NOT a resource** (category H).
- **Every remaining subclass feature name** (~45 across the other subclasses/levels — Frenzy,
  Agile Strikes, Blessed Healer, Land's Aid, Know Your Enemy, Psychic Veil, Clockwork Spells,
  Steps of the Fey, Arcane Charge, and the rest of the list the corpus scan produced) —
  classified **NOT A RESOURCE** by structural pattern (damage riders, spell-like/narrative
  abilities, AC/resistance/save bonuses, one-time triggers) rather than individually
  text-verified one by one this pass. Methodology caveat, stated plainly: this is a
  PATTERN classification, not a byte-for-byte corpus read for all ~45 — the risk of a missed
  genuine pool among them is judged low (none matched the resource-shaped keyword scan that
  correctly caught every finite pool authored/deferred above) but is not a zero-risk guarantee.
  Flagged here, not hidden, as the honest limit of this pass's effort budget — a future
  `pnpm rules:audit` tool (§20 Tooling Backlog) is exactly the mechanism that should make this
  exhaustive rather than pattern-based.

### Table Lookup Backlog

**Confirmed, not fixed, this phase (required by explicit instruction):** `evaluator.ts`'s `case
'lookup'` returns a `RulesError` unconditionally ("Table is not modeled") — `lookup(table:x,
key)` parses but has never been evaluable. Every level-scaling Resource max authored this phase
(Rage, Second Wind, Action Surge, Indomitable, Channel Divinity ×2, Wild Shape, Favored Enemy,
and the die-size columns for Bardic Inspiration/Superiority Dice) uses a nested-`if`
level-breakpoint expression specifically because of this gap, mirroring the one existing
production precedent for nested `if()` (Spellcasting Ability Mod's own formula). **Backlog
item**: implement generic Table `lookup()` evaluation (`kind: 'value'`-shaped: match mode
exact/range/enum against `TableKeyDeclaration`, return the matching row's named column, fall
back to `default`) — a pure `app/lib/rules/evaluator.ts` change, no persistence/content impact.
**Candidates that could later simplify to a Table reference once built**, with zero behavior
change: every nested-`if` resource max named above, plus the die-size expressions. No current
behavior depends on staying as nested-`if` — this is a pure authoring-ergonomics backlog item,
not a correctness gap.

---

## 8. Rest/Recovery Audit

**Updated 2026-10-01 (Phase 2A.2).** `server/utils/character-recovery.ts`'s Short Rest/Long Rest
actions now ALSO generically recover every acquired Resource whose own `recovery` declaration
names that trigger — zero resource-id or class-name branching added (verified directly: the
recovery block reads only `resourceRecoveryTrigger` and each `DerivedResource`'s own `recovery`
array). Proven against real authored resources: Rage's asymmetric Short-Rest(+1)/Long-Rest(full)
recovery, and Second Wind/Indomitable's differing triggers on the SAME character in the SAME
call. HP/hit-die recovery (this section's original scope) is unchanged.

**Classification: A. COMPLETE** for HP/hit-die recovery (unchanged) and for generic Resource rest
recovery (new, Phase 2A.2) — both now proven end-to-end with real authored content, not merely
wired.

---

## 9. Action Audit

`action` is one of the engine's 9 native Definition kinds (`app/lib/rules/types.ts`), and
`CharacterActionsPanel.vue` plus `character-cast.ts`'s `resolveCastableSpell`/cast-resolution
pipeline confirm real, non-trivial Action-kind usage exists in V2 today for spell attacks (the
`classifySpellCastCapability` four-way split — `supported-spell-attack`/`supported-save-damage`/
`supported-save-context`/`supported-healing` — was directly read this pass). Non-spell actions
(weapon attacks, class-resource-consuming actions like Second Wind/Rage/Channel Divinity, once
the Resource primitive exists) were not independently verified this pass as having equivalent
Action-kind representations.

**Classification: B. FOUNDATION EXISTS** for spell-action resolution specifically;
**unclassified, unverified this pass** for non-spell actions generally, though structurally
likely to follow the same `action` Definition kind once other blocking primitives (§1, §7) exist.

---

## 10. Derived Value Audit

Not independently deep-audited this pass beyond what other sections already establish
(`character-derived.ts` composes assembly → runtime → bridge → `evaluate()`, resolving
content-choice stubs via `getWorldContentCatalogue`, per this session's own prior verified
work). `characterDerivedValues.ts` (`app/components/characters/`) and its category-based
lookup (`findDerivedNumber`/`findDerivedBoolean`, confirmed via `useCharacterSheet.ts`'s own
header comment read this pass) is the sheet's read path for derived numbers generally.

**Classification: B. FOUNDATION EXISTS.** No specific derived-value gap was identified or ruled
out this pass; a dedicated audit of which derived categories exist vs. which 2024 rules require
(AC formulas by armor type, saving throw proficiency bonuses, spell save DC, passive
scores, carrying capacity, etc.) was not performed and should be a discrete follow-up, not
assumed from this section alone.

---

## 11. Equipment Audit

As established in §1: **no facet/grant/progression pathway was found connecting starting
equipment or ongoing inventory to V2** (`app/lib/content-rules/*`, `character-actor-bridge.ts`,
`character-derived.ts` — zero hits for inventory/equipment logic; all real inventory logic
lives in V1's `character-sheet-inventory.ts`/`character-sheet-inventory-transfers.ts`, per
CLAUDE.md's own System 3 description). The real corpus's `startingEquipment` structure
(`{additionalFromBackground, defaultData, entries}`, confirmed present per-class) has no
apparent consumer in V2 at all.

This is architecturally different from the Pins/`scene_layer_objects` situation CLAUDE.md
documents as an intentional, deferred, design-approved gap — there is no equivalent design
proposal or explicit deferral decision on record for V2 equipment; it appears to simply not
have been reached yet.

**Classification: D. ENGINE PRIMITIVE MISSING** (no facet shape for equipment grants) combined
with **E. PERSISTENCE MISSING** (no V2-native inventory persistence — V1's exists but is a
separate collection/system) and **F. UX MISSING** (no V2 equipment UI). This is the most
complete-across-all-three-axes gap in the entire audit.

---

## 12. Duplicate/Prerequisite Audit

Real corpus evidence: the ASI feat itself is `repeatable: true, repeatableHidden: true` — i.e.,
2024 rules explicitly allow taking "Ability Score Improvement" (the feat) multiple times, with
`repeatableHidden` suggesting the UI shouldn't surface it as a normal duplicate-prevention case.
Other feats' `prerequisite` shapes seen this pass are simple (`[{level: N}]`); no cross-feat
mutual-exclusion or feat-that-requires-another-feat prerequisite shape was observed in the
sampled data, though only a subset of the 77 native feats' full `prerequisite` arrays were
inspected (category/prerequisite-existence was queried in bulk; full prerequisite-shape
diversity across all 77 was not).

No Eldra-side duplicate-selection or prerequisite-enforcement logic was located or ruled out
this pass — `ChoiceSetSelector`'s four variants (`explicit`/`definitionsInCategory`/
`fromContentFacet`/`fromContentCatalogue`) describe *how a choice's candidate list is built*,
not whether a candidate can be excluded for having already been taken or for failing a
prerequisite. This looks like it would need to be expressed either as a choiceSet
filter capability (not currently present in the 4-variant selector union) or as a separate
validation pass at confirm-time (`character-progression-plan.ts`'s `confirmProgression`) —
**neither was confirmed to exist this pass.**

**Classification: D. ENGINE PRIMITIVE MISSING, unverified — likely absent.** This is a
second-order dependency: it only becomes load-bearing once Feat Selection (§4) is actually
built, since that is the first choice type in the 2024 ruleset with real repeatability/
prerequisite nuance (Fighting Style feats, by contrast, are typically each-once; Origin feats
have no prerequisite at all).

---

## 13. Coverage Matrix

Columns per the requested schema. This is a representative sample across the areas audited,
not an exhaustive row-per-feature matrix (48 subclasses × ~4 levels × 12 classes' full feature
lists would run to several hundred rows; full expansion is explicitly a Tooling Backlog
candidate, §19, not hand-authored here).

| Rules Area | Class/Subclass | Level | Feature | Source Identity | Mechanic Category | Current Eldra Status | Existing Primitive | Missing Primitive | Persistence Need | UX Need | Dependencies | Recommended Phase |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| ASI/Feat | All 12 | 4/8/12/16 | Ability Score Improvement (as feat choice) | XPHB `classFeatures` + XPHB `feats.json` "Ability Score Improvement" | Choice + relative grant | D. ENGINE PRIMITIVE MISSING | `choiceSet` (via `fromContentCatalogue`) | Increment-capable `RulesFacetGrant` | Yes — chosen feat + resulting ability totals | Feat picker (can likely reuse Subclass picker pattern) | Increment-grant primitive | Wave 1 |
| ASI/Feat | All 12 | 19 | Epic Boon (as feat choice) | XPHB `classFeatures` + `feats.json` `EB` category | Choice | D. ENGINE PRIMITIVE MISSING (shares dependency w/ above) | `choiceSet` | Same as above (12 EB feats vary in effect shape) | Yes | Same picker, gated to EB pool | Increment-grant primitive | Wave 1 (content), after Wave 1 (engine) |
| ASI/Feat | All (Fighter/Paladin/Ranger) | 1 (Fighter/Ranger)/2 (Paladin) | Fighting Style | `feats.json` `FS`/`FS:P`/`FS:R` | Pure choice, no increment | C. CONTENT MISSING | `choiceSet` (`fromContentCatalogue`) | None — ready today | Yes — chosen style | Picker | None | Wave 0 (content-only) |
| Subclass | All 12 (48 total) | 3 (real, all 12, verified) | Subclass selection | XPHB `subclass[]`, `source==='XPHB'` | Choice | A. COMPLETE (corrected 2026-10-01 — was Wizard-only until the ALL-CLASS PROGRESSION CONTRACT AUDIT; see §5) | `fromContentCatalogue` `choiceSet` | — | Yes — verified (`subclassRef`) | Verified all 12 classes (74-test `character-progression-all-class-subclass.test.ts`) + Tonso Fun Jr. (Wizard) smoke test | — | Done |
| Subclass-internal | All 7 discovered (Lore/Battle Master/Archfey/Fiend/Diviner/Evoker/Illusionist) | varies (3/6/10/14) | Subclass's own later selectable feature | XPHB `class-*.json` `subclassFeature[]` (native-source-filtered) | Choice | D. ENGINE PRIMITIVE MISSING | — | `subclass-internal-feature-level-gating` | Depends on feature | Depends on feature | Blocks on same primitive as War Priest/Warding Flare/Dark One's Own Luck (§7) | Not scheduled (tracked in Progression Coverage Ledger) |
| Subclass | All 48 | 3/6/10/14 (typical) | Subclass feature content | XPHB `class-*.json` `subclass[].subclassFeatures` | Progression rows | C. CONTENT MISSING, unaudited per-subclass | `progression` | — (primitive exists) | Depends on feature | Depends on feature | None known | Wave 2 (authoring) |
| Resource | Barbarian | 1+ | Rage uses | XPHB `classFeatures`/`classTableGroups` | Pool: current/max, spend, recover-on-rest | **A. COMPLETE** (Phase 2A.2) | `resource:rage` (kind:'resource') | — | Yes — `resources` block, confirmed | `CharacterResourceOrbs.vue` (generic) | — | Done |
| Resource | Fighter | 1/2/9 | Second Wind / Action Surge / Indomitable | XPHB `classFeatures`/`classTableGroups` | Pool (×3, level-gated acquisition) | **A. COMPLETE** (Phase 2A.2) | `resource:second_wind`/`action_surge`/`indomitable` | — | Yes | Generic | — | Done |
| Resource | Bard | 1+ | Bardic Inspiration | XPHB `classFeatures` | Pool, ability-derived max, dice presentation | **A. COMPLETE** (Phase 2A.2) | `resource:bardic_inspiration` | — | Yes | Generic, die-size badge | — | Done. Deferred refinement: Level-5 Font of Inspiration's Short-Rest/spell-slot-conversion upgrade (see §7) |
| Resource | Cleric, Paladin | 2, 3 | Channel Divinity | XPHB `classFeatures` | Pool (two separate tables) | **A. COMPLETE** (Phase 2A.2) | `resource:channel_divinity.standard`/`.extended` | — | Yes | Generic | — | Done |
| Resource | Druid | 2 | Wild Shape (uses only — shapeshift mechanics themselves out of scope) | XPHB `classFeatures` | Pool | **A. COMPLETE** (Phase 2A.2) | `resource:wild_shape` | — | Yes | Generic | — | Done |
| Resource | Sorcerer | 2+ | Sorcery Points | XPHB `classFeatures` | Pool, max = level directly | **A. COMPLETE** (Phase 2A.2) | `resource:sorcery_points` | — | Yes | Generic | — | Done. Deferred: Sorcerous Restoration (SR partial recovery, a category-E recovery feature) |
| Resource | Monk | 2+ | Focus Points | XPHB `classFeatures` | Pool, max = level directly | **A. COMPLETE** (Phase 2A.2) | `resource:focus_points` | — | Yes | Generic | — | Done |
| Resource | Paladin | 1+ | Lay on Hands | XPHB `classFeatures` | Pool, max = 5×level, VARIABLE per-use spend | **A. COMPLETE** (Phase 2A.2, incl. large-pool UI follow-up) | `resource:lay_on_hands`, `presentation.style:'points'` | — | Yes | Generic compact points control, amount input, server-bounded | — | Done |
| Resource | Fighter/Battle Master (subclass) | 3/7/15 | Superiority Dice | XPHB `subclassFeature` | Pool, step-function max, dice presentation | **A. COMPLETE** (Phase 2A.2) | `resource:superiority_dice` | — | Yes | Generic, die-size badge | — | Done — proves resource acquisition is not class-slot-specific. Production caveat: requires the Battle Master subclass to exist in a published Content Pack (not yet imported anywhere); mechanism proven via the real Rules Package + direct facet fixtures |
| Resource | Wizard | 1+ | Arcane Recovery | XPHB `classFeatures` | One-time-per-long-rest slot recovery action | C. CONTENT MISSING (reclassified, Phase 2A.2 — primitive exists, this is a category-E recovery FEATURE, not a pool, by design excluded from the base Resource primitive) | — | A recovery-feature mechanism (modifies another resource/spell-slot pool rather than owning one) | N/A | Action button | None — honestly deferred, not blocked | Wave 2 candidate, small |
| Resource | Ranger | 1/10 | Favored Enemy (free Hunter's Mark casts) / Tireless (temp HP charges) | XPHB `classFeatures` | Pool ×2 | **A. COMPLETE** (Phase 2A.2 follow-up) | `resource:favored_enemy`, `resource:tireless` | — | Yes | Generic | — | Done |
| Resource | Rogue | — | (none native) | XPHB `classFeatures` (Sneak Attack is a damage modifier, not a pool) | N/A | **A. COMPLETE** — confirmed, not merely absent | N/A | — | N/A | N/A | — | Done — honestly verified absence |
| Spellcasting | Full/half/pact casters (8) | varies | Spell slot counts + expenditure persistence | `classTableGroups.rowsSpellProgression`; `block_instances`/`spellcasting` | Derived table + persisted pool | **A. COMPLETE** (updated Phase 2A0 — full trace, see §6) | Bespoke slot-table code + `character-spellcasting.ts` block | — | Confirmed — orb, Cast, and reload all use one authoritative path | `CharacterSpellcastingPanel.vue`, `CharacterResourceOrbs.vue` | — | None — done. Known limitation: no optimistic-concurrency on the block write (documented multi-client race, out of scope) |
| Spellcasting | All 8 native casters | — | Class spell-list eligibility on add; known/prepared count limits | Catalogue `spells`; XPHB `preparedSpellsProgression` (not closed-form) | Validation | **C. CONTENT MISSING** (updated Phase 2A0 — confirmed absent, not unverified) | Catalogue + spellcasting block both exist | Class-list filter on spell add; count-limit enforcement | N/A | Spell picker currently unfiltered | None structural — needs either a closed-form formula or authored table | Wave 2 (content/validation), after deciding the count-limit formula |
| Spellcasting | Barbarian/Fighter/Monk/Rogue | subclass-gated | Subclass spellcasting (EK/AT-style) | XPHB subclass data | Progression + slot table variant | Unverified this pass | Unknown | Unknown | Unknown | Unknown | Subclass content (§5) | Needs dedicated check |
| Equipment | All 12 | — | Ongoing inventory tracking (add/remove/equip/attune) | `block_instances`/`inventory` | Persisted collection | **A. COMPLETE** (correction, Phase 2A0 — audit originally understated this, see §1) | `character-inventory.ts`, `CharacterInventoryPanel.vue`, `SheetInventoryTab.vue` | — | Confirmed — V2-native, independent of V1 | Confirmed — real panels exist | — | None — done |
| Equipment | All 12 | 1 | Starting equipment GRANT from class/background at creation | `startingEquipment` (real corpus structure, confirmed unauthored) | Grant (items, possibly choice-of-package) | **C. CONTENT MISSING** (narrowed, Phase 2A0 — not an engine/persistence gap, see §2) | `collectionFields` (item-level AC/category/slot only) | Equipment-grant facet shape (creation-time, distinct from ongoing inventory) | Persistence already exists (inventory block) | `create-v2` has no equipment step | Package authoring decision: how to express "package A vs B / gold alternative" as a facet | Wave 2, after a small facet-shape decision (not a full design proposal — the inventory persistence question from the original audit is resolved) |
| Rest/Recovery | All | — | HP / hit dice recovery | Core rules | Trigger-based value reset | B. FOUNDATION EXISTS | `character-recovery.ts` | — | Confirmed wired | `CharacterRecoveryPanel.vue` | — | Done (as far as verified) |
| Prerequisite/Duplicate | Feats generally | — | Repeatable/prerequisite enforcement | `feats.json` `repeatable`/`prerequisite` | Validation | D. ENGINE PRIMITIVE MISSING, likely absent | none confirmed | ChoiceSet filter or confirm-time validation hook | N/A | Depends | Feat Selection primitive (§4) | Wave 1, alongside Feat Selection |
| Prerequisite/Duplicate | Species/Class/Background (any) | creation | Cross-facet already-granted-value exclusion (e.g., Background grants Medicine, Class still offers it) | `rules-choices.ts` `validateChoiceSelection` | Validation | **D. ENGINE PRIMITIVE MISSING** (confirmed, Phase 2A0 — was "likely absent," now proven, see §2) | `validateChoiceSelection` (within-choice dedup only) | Cross-facet grant visibility at option-construction time | N/A | Silent — no error, just a wasted pick | None — orthogonal to Feat Selection, needed even for today's skill-only choices | Wave 1 candidate — small, self-contained, and live today (not gated on Feat Selection) |

---

## 14. Generic Missing Primitives

Ranked by how many downstream Coverage Matrix rows each unblocks:

1. **Increment-capable `RulesFacetGrant`** (relative `+N` / `+N to two of a set`, capped).
   Unblocks: ASI (all 12 classes × 4-6 levels), Epic Boon where ability-touching, any
   ability-touching Origin feat.
2. ~~**Resource Definition kind**~~ — **DONE (Phase 2A.2, 2026-10-01).** Extended the EXISTING
   `ResourceDefinition` (`max` already evaluated correctly pre-2A.2) with two small, additive
   fields (`recovery`, `presentation`) rather than adding a new Definition kind — the corpus audit
   found this sufficient; no giant union was needed. Unblocked: §7 (11 of ~14 real candidate
   resources authored, 3 honestly deferred as category E/UI-caveat), §8 (generic rest recovery),
   a Resource Action Consumption foundation (`server/utils/character-resource-actions.ts`, proven
   against synthetic Action content — no real Action references a cost yet, by design).
3. **Feat Selection as a first-class, reusable `choiceSet` pattern** (distinct from but
   layered on top of #1 — Fighting Style/Origin feats need only this, not #1; ASI/Epic Boon
   need both).
   Unblocks: §4 in full.
4. **Equipment/Inventory facet shape for V2**, plus an explicit decision on whether V2 reuses
   V1's `character-sheet-inventory.ts` persistence or gets its own (a real architectural
   decision, not a pure engine-primitive gap — see §20).
   Unblocks: §11 in full.
5. **ChoiceSet-level or confirm-time prerequisite/repeatability validation.**
   Unblocks: §12, becomes load-bearing once #3 exists.

---

## 15. Dependency Graph

```
                      [#1 Increment Grant]
                              │
                              ▼
[#3 Feat Selection pattern] ──► [ASI content, all 12 classes]
        │                              │
        │                              ▼
        │                     [Epic Boon content, all 12]
        ▼
[#5 Prereq/repeat validation] ◄── (needed once Feat Selection ships)

[#2 Resource primitive — DONE, 2026-10-01] ──► [Rage / Bardic Insp. / Channel Div. (×2 tables) /
                              Sorcery Pts / Focus Pts / Second Wind / Action Surge /
                              Indomitable / Wild Shape / Lay on Hands / Superiority Dice — DONE]
        │
        ▼
[Rest/Recovery hooks — DONE, generic, zero class/resource-id branching]
        │
        ▼
[Arcane Recovery / Sorcerous Restoration — deferred, category E "recovery
 feature", not a pool]  [Favored Enemy / Tireless — DONE, Phase 2A.2 follow-up]

[Subclass selection — DONE] ──► [#? Subclass feature content authoring]
                                  (independent of #1/#2/#3; pure authoring
                                   once progression rows are written)

[#4 Equipment facet + persistence decision] ──► [Starting equipment content,
                                                   all 12 classes]
                                                          │
                                                          ▼
                                          [Ongoing inventory — may fold
                                           into V1's existing system
                                           rather than duplicating it]

Spellcasting slot-count math — DONE (bespoke) ──► [#2 Resource primitive now EXISTS
                                                     (2026-10-01) but spell slots were
                                                     deliberately NOT migrated to it this
                                                     phase, per explicit instruction —
                                                     coexist, migrate later if ever]
        │
        ▼
[Expended-slot persistence — CONFIRMED (Phase 2A0), unchanged by Phase 2A.2]
```

No cycles. `#1` and `#2` are mutually independent (neither blocks the other) and are the two
highest-leverage, lowest-dependency starting points.

---

## 16. Implementation Waves

Organized by generic primitive, per the requesting task's explicit instruction — never by
class.

**Wave 0 (no engine changes needed, content/authoring only):**
- Fighting Style feat content (10 + 2 variants) — `choiceSet` pattern already supports this.
- Verify (not build) expended-spell-slot persistence path end-to-end — this is a read/trace
  task, not new code, and should happen before anything in Wave 1 that assumes slot state is
  durable.
- Non-ability Origin feat content (of the 10, however many don't touch ability scores) —
  needs auditing which Origin feats are increment-free before assuming all 10 fit here.

**Wave 1 (engine primitives):**
- Build the increment-capable grant (#1).
- ~~Build the Resource Definition kind (#2).~~ **DONE (Phase 2A.2)** — extended the existing kind
  rather than adding a new one.
- Build the reusable Feat Selection `choiceSet` pattern (#3), reusing the Subclass-selection
  `fromContentCatalogue` precedent.
- Decide and build the Equipment facet shape + persistence approach (#4) — requires the design
  decision in §20 first.

**Wave 2 (content authoring, unblocked by Wave 1, one pass per concept across all 12 classes —
not per-class passes):**
- Author ASI/Epic Boon progression rows for all 12 classes in one pass.
- ~~Author each class's resource(s)~~ **DONE for all 9 of 12 classes with a native resource, plus
  1 subclass (Phase 2A.2 + follow-up pass)**: Rage (Barbarian), Second Wind/Action Surge/
  Indomitable (Fighter), Bardic Inspiration (Bard), Channel Divinity (Cleric, Paladin), Wild
  Shape (Druid), Sorcery Points (Sorcerer), Focus Points (Monk), Lay on Hands (Paladin), Favored
  Enemy/Tireless (Ranger), Superiority Dice (Battle Master subclass). Nothing remains
  "ready but not authored." Arcane Recovery (Wizard)/Sorcerous Restoration (Sorcerer) are
  category-E recovery features, deliberately excluded from the base primitive, not
  class-authoring debt; Warlock's Pact Magic is already covered under Spellcasting (§6); Rogue
  confirmed to have none.
- Author starting equipment for all 12 classes in one pass.
- Author subclass feature content for all 48 subclasses (largest single content-authoring
  item; consider a dedicated sub-wave or the Tooling Backlog audit tool, §19, to track
  completion systematically rather than by feel).

**Wave 3 (validation/UX):**
- Prerequisite/repeatability validation (#5) — layer onto Wave 1's Feat Selection.
- Non-spell Action-kind coverage (weapon attacks, resource-consuming actions) — the CONSUMPTION
  side now has a proven foundation (`server/utils/character-resource-actions.ts`, Phase 2A.2,
  `ActionCost` authoritatively resolved/checked/deducted); what remains is authoring real Actions
  with `costs` (none exist yet — by design, out of this phase's scope) and weapon-attack
  Action-kind coverage generally, both independent of the Resource primitive itself now that it
  exists.
- Subclass-granted spellcasting (Eldritch Knight/Arcane Trickster-style) — needs its own
  dedicated verification pass; status currently unknown, not merely incomplete.

---

## 17. Package Authoring Backlog

Explicitly organized to avoid whack-a-mole per-class authoring, per the requesting task's own
instruction:

- **One pass**: author the ASI/Feat progression row (referencing the Wave 1 Feat Selection
  primitive) across all 12 classes at their real, class-specific ASI levels from §3's table
  (note Fighter's 6 levels and Rogue's 5 — do not assume the 4/8/12/16 default for these two).
- **One pass**: author Epic Boon at level 19 across all 12 classes.
- ~~**One pass per resource type**~~ **DONE (Phase 2A.2 + follow-up pass)** for Rage (Barbarian),
  Bardic Inspiration (Bard, incl. the Font of Inspiration level-5 recovery upgrade), Channel
  Divinity (Cleric + Paladin, two separate tables as anticipated), Wild Shape (Druid), Second
  Wind + Action Surge + Indomitable (Fighter), Focus Points (Monk), Lay on Hands (Paladin, incl.
  large-pool UI), Sorcery Points (Sorcerer), Favored Enemy + Tireless (Ranger), Superiority Dice
  (Battle Master subclass). Confirmed Rogue has no native resource. Nothing remains unauthored
  that honestly fits the primitive at the CLASS level. Deliberately excluded (category E, not a
  pool): Arcane Recovery (Wizard), Sorcerous Restoration (Sorcerer). Deliberately excluded
  (needs an unbuilt non-rest trigger): Tides of Chaos (Sorcerer/Wild Magic subclass).
  Deliberately deferred (needs an unbuilt subclass-level-gate primitive): War Priest/Warding
  Flare (Cleric subclasses), Dark One's Own Luck (Warlock subclass) — see §7's own SUBCLASS
  AUDIT. Pact Magic (Warlock) stays under Spellcasting (§6), unchanged.
- **One pass**: starting equipment across all 12 classes.
- **One pass, largest item**: subclass feature content across all 48 subclasses — recommend
  subdividing by feature level (all 48 subclasses' Level 3 features in one sub-pass, then all
  Level 6, etc.) rather than by subclass, to keep each sub-pass mechanically similar.
- Fighting Style and non-ability Origin feats can be authored immediately (Wave 0, no engine
  dependency).

---

## 18. Builder Backlog

**Updated 2026-09-30 (Phase 2A0) — deep-audited this pass; both original flags resolved (§2).**
Starting-proficiency choices are already surfaced (the generic Proficiencies step renders
whatever `choice:skill.proficiency` declares — confirmed working); the remaining gaps are
content, not Builder UX, so the Builder Backlog is now narrower and more concrete than
originally scoped:
- **No new Builder step should be built for Fighting Style/Weapon Mastery/Origin Feat/starting
  equipment/spells until the corresponding content-rules facet exists** — the generic
  Proficiencies step will render Fighting Style and non-ability Origin Feat choices automatically
  the moment they're authored as `choiceSet` entries (Wave 0 content, per §16); no Builder code
  change is needed for those two specifically.
- **Starting equipment and spell selection are structurally different from the proficiencies
  step** — they don't fit the existing `ResolvableChoice` (flat option-list) shape cleanly
  (an equipment package choice may bundle multiple items; a spell choice needs class-list
  filtering the current engine doesn't do anywhere, per §6). These will likely need their own
  Builder step(s) and their own choice-resolution shape, not a rename of the Proficiencies step.
  This is real Builder-side design work, but it is gated on the underlying content/engine
  primitives (§14), not schedulable on its own.
- **Cross-facet duplicate-proficiency exclusion** (§2, §13) is a live bug today, independent of
  every other gap in this document — it affects the one choice type (`choice:skill.proficiency`)
  that already works end-to-end. Recommend fixing this ahead of, or alongside, Wave 1's other
  items rather than deferring it behind larger primitives it doesn't actually depend on.
- Ability Score method: no Builder work needed for `standard-array`/`point-buy`/`manual` (all
  three confirmed working); `roll` is an intentional stub (`UNAVAILABLE_ABILITY_SCORE_METHODS`)
  — implementing it is a real, scoped, independent task whenever prioritized, not a bug to fix
  incidentally.

## 19. Sheet Backlog

**Updated 2026-10-01 (Phase 2A.2) — the resource-tracker UI item below is now DONE.**
`CharacterResourceOrbs.vue`'s predicted "genuinely resource-agnostic" design held exactly as
anticipated: extended with one small additive field (`dieFaces?: number`, package-driven, never
inferred from a name) and a new generic adapter (`genericResourcesToCharacterResources`,
`characterResourcePresentation.ts`) — zero rewrite, zero per-resource component (confirmed: no
`RageCounter.vue`/`SorceryPointCounter.vue`/etc. exists). `CharacterCommandResources.vue` now
renders Spell Slots AND every acquired generic Resource side by side, routing expend/restore
clicks generically (branches only on the ONE hardcoded `'spell-slots'` group id, never a
resource id or class name). Manual expend/restore is server-authoritative end to end
(`PUT .../resources`, `server/utils/character-resources.ts`) — the Sheet never computes or
trusts a maximum itself, it reflects whatever the server returns.

**Updated 2026-09-30 (Phase 2A0).**
- **Correction**: the V2 sheet already has a real inventory surface
  (`CharacterInventoryPanel.vue`, `SheetInventoryTab.vue`, `SheetManageInventoryRail.vue`,
  wired to `character-inventory.ts`'s own `block_instances` block) — the original Sheet Backlog
  item calling this "currently has none" was based on the original audit's overstated §11 claim
  and is now void. What the Sheet still lacks is a way to receive *starting* equipment
  automatically at creation, not a way to hold items at all (see §2, §13).
- Expended-slot persistence is now **confirmed working end-to-end** (§6) — the original caution
  about "layering new resource UI on an unverified pattern" no longer applies, and Phase 2A.2
  confirms the `CharacterResourceOrbs` pattern did extend cleanly, exactly as predicted.

## 20. Tooling Backlog

- **`pnpm rules:audit dnd5e-2024` (concept, not implemented)**: a read-only script that walks
  the real 5etools XPHB corpus (`class/class-*.json`, `feats.json`, `subclass[]` arrays) and
  cross-references every `classFeatures`/`subclassFeatures` reference against the currently
  published `eldra.rules.dnd5e-2024` package's actual `progression` rows, producing exactly
  this audit's Coverage Matrix mechanically instead of by hand. This would directly solve the
  §5/§13 "48 subclasses, not exhaustively checked per-level" gap and keep it current as content
  is authored, rather than requiring a fresh manual audit like this one each time a gap is
  suspected. This is the single highest-value tooling investment given the user's stated
  motivation for commissioning this audit in the first place.
- **`SELECTION_REVIEW_REQUIRED`** (recorded, not implemented — from this session's earlier
  Package Sync work): a Content Source classification state for "provider has eligible
  candidates absent from the published selection" — relevant here because Wave 2's bulk
  content-authoring passes will repeatedly hit exactly this situation (e.g., authoring Level 6
  subclass features means the provider now has candidates the last-published selection
  doesn't include) and currently has no automated detection; each Wave 2 pass would need a
  manual `publishContentSourceSelection` re-curation, same as the original subclass rollout
  required.

## 21. Feature-Complete Acceptance Checklist

Objectively testable, one line per milestone capability (see task's own 10-capability
definition):

1. [ ] Create a legal Level-1 character for each of the 12 classes via the Builder, with no
   manual Directus edits required.
2. [ ] Every creation-time choice (species/class/subclass-if-applicable-at-1/background,
   ability scores, starting proficiencies, starting equipment) is selectable in the UI, not
   just structurally possible in the data model.
3. [ ] Starting equipment/resources/spells for a fresh Level-1 character match the real XPHB
   `startingEquipment`/`startingProficiencies`/spell-list data for that class, verifiable by
   diffing the character's state against the corpus.
4. [x] A character of each class can be advanced, one level at a time, from 1 to 20 with no
   manually-patched Directus fields — **DONE for every currently-`IMPLEMENTED` choice, all 12
   classes (§23, 2026-10-02)**: `planProgression`/`confirmProgression` genuinely complete a real
   Level 1→20 round trip for all 12 classes with zero manual Directus edits, proven executably.
   This does NOT mean a resulting Level-20 character is RAW-complete (Weapon Mastery, Fighting
   Style, Metamagic, Eldritch Invocations, Epic Boon, spell acquisition, and subclass-internal
   features are simply absent from the plan today, per §23's own Milestone Gap List) — only that
   the progression ENGINE itself does not block or corrupt the walk.
5. [x] Every mandatory progression choice (subclass, ASI/feat at the real per-class levels from
   §3, spell selection where applicable) is presented and resolvable in the UI at the correct
   level — **DONE for Subclass + ASI/General Feat (incl. its nested ability-distribution choice)
   for all 12 classes, and Scholar/Expertise for Wizard specifically (§23, 2026-10-02)**. Spell
   selection remains the one named exception: still `CONTENT_BLOCKED` for all 8 casting classes
   (§6, §23) — not yet presentable or resolvable anywhere.
6. [ ] Every automatic consequence that is structurally representable today (HP increases,
   proficiency bonus increases, spell slot table changes) applies without manual intervention.
7. [ ] The character sheet (V2) is usable for an ordinary session: HP/AC/saves/skills visible
   and correct, actions listed, no missing-data errors.
8. [x] Class/subclass resources appear on the sheet with correct current/max and can be
   spent/recovered from the UI — **DONE (Phase 2A.2, 2026-10-01, incl. follow-up pass)** for
   all 9 of 12 classes with a native resource, plus 1 subclass (Rage, Second Wind/Action
   Surge/Indomitable, Bardic Inspiration incl. its level-5 recovery upgrade, Channel Divinity
   ×2, Wild Shape, Sorcery Points, Focus Points, Lay on Hands incl. its large-pool compact UI,
   Favored Enemy/Tireless, Superiority Dice). Zero "ready but not authored" rows remain.
   Wizard/Sorcerer's recovery-feature mechanics (Arcane Recovery, Sorcerous Restoration) and
   three subclass resources blocked on a not-yet-built subclass-level-gate primitive (War
   Priest, Warding Flare, Dark One's Own Luck) are honestly deferred, each with a named reason
   (§7). Checked per real corpus-extracted level tables, not merely wired.
9. [ ] Spells can be cast to the degree the current architecture supports (native 8 casters at
   minimum), with slot expenditure persisting across a reload — this specifically requires
   resolving §6's open persistence-verification flag first.
10. [ ] A character refreshed mid-session (browser reload) shows identical authoritative state
    to before the reload — no re-derivation drift, no lost choices.

## 22. Recommended Next Implementation Phase

**Updated 2026-10-01 (Phase 2A.2) — both of this section's own prior recommendations (the
increment-capable grant, Phase 2A.1; the Resource Definition kind, this phase) are now DONE,
along with the Feat Selection `choiceSet` pattern (#3) and real feat prerequisite/repeatability
validation (#5's feat-specific case — confirmed live in `confirmProgression`, Phase 2A.1). Three
of the five Generic Missing Primitives (§14) are now closed. This changes the recommendation:**

**Next: Equipment/Inventory facet shape for V2 (#4).** It is now the single largest remaining
UNBUILT generic primitive — every other §14 item is either done (#1/#2/#3) or narrower than
originally scoped (#5's only remaining open case is cross-facet duplicate-proficiency exclusion,
below). Starting equipment content for all 12 classes (§11, Wave 2) is entirely blocked on it,
and the real `startingEquipment` XPHB structure (`{additionalFromBackground, defaultData,
entries}`) still has no facet shape decision on record. This requires a real architectural
decision first (§20: does a Package-vs-Package choice, or a gold-alternative, get its own
ChoiceSet selector shape, or a different mechanism?), not just an engine change — scope it as a
design proposal before implementation, the same discipline this phase's own HARD STOP gate
applied to the Resource primitive.

**Small, independent, parallel candidate — cross-facet duplicate-proficiency exclusion** (§2,
§13, §18): still open, still self-contained, still a real live gap in the one choice type that
already works end-to-end. Cheap enough to fold into the same phase as Equipment, or ship first
on its own.

**Also ready, not blocking**: subclass feature content authoring for the 48 real subclasses
(the largest single CONTENT item in the whole audit, §16's own recommendation to subdivide by
feature level stands); a subclass-scoped, feature-level-keyed resource-acquisition primitive
(unblocks War Priest/Warding Flare/Dark One's Own Luck, §7's own SUBCLASS AUDIT — small,
additive, the same shape as #2's own `ProgressionRow.resources`); a third `ResourceRecoveryTrigger`
member for non-rest recovery (unblocks Tides of Chaos); non-spell Action-kind coverage (weapon
attacks) now that the Resource Action Consumption foundation exists for the resource-consuming
half of it. (Ranger's Favored Enemy/Tireless are DONE as of this phase's own follow-up pass —
no longer open.)

---

**Prior recommendation (2026-09-30, Phase 2A0; retained for history) — both prerequisite
verifications that section originally called for are now done (§2, §6). Phase 2A remains the
correct next implementation phase; the evidence gathered this pass strengthens rather than
changes that recommendation.**

**Phase 2A — Engine primitives (Wave 1's first two items):** build the increment-capable
`RulesFacetGrant` extension and the Resource Definition kind. Both remain pure `app/lib/rules/`
engine changes touching no content. The case for this is now stronger than originally stated,
for two reasons discovered this pass:
1. Spell slots — the one resource-shaped mechanic already fully built — are proven end-to-end
   correct and persistence-safe (§6), which means a generic Resource primitive has a working
   reference implementation to generalize from, not just a design sketch.
2. The content-rules file's own author has already independently identified and documented the
   exact same two blockers (§2's citations) before this audit existed, for ASI and Origin Feat
   specifically — this is convergent, first-party evidence, not a conclusion this audit reached
   alone.

**Recommendation on Resource vs. bespoke spell-slot persistence — coexist initially, migrate
later, do not replace immediately.** Spell slots' bespoke implementation (`character-cast.ts`,
`character-spellcasting.ts`) is fully correct, tested by this trace, and has a known, honestly
documented, low-severity limitation (the multi-client race, §6) that a generic Resource
primitive would not automatically fix without its own concurrency design. Rewriting a working,
verified system to be the Resource primitive's first consumer, on day one of that primitive
existing, would risk regressing what is currently this audit's single most complete subsystem
for no immediate capability gain — the other nine-plus resources (§7) have nothing today, so
building the primitive against THEM first, and revisiting spell slots as a later, optional
migration once the primitive has proven itself, is the lower-risk sequencing.

**New, small, independent candidate for Wave 1 — cross-facet duplicate-proficiency exclusion**
(§2, §13, §18): confirmed this pass to be a real, live, low-complexity gap in the one choice
type that already works today, with no dependency on the increment-grant or Resource primitive.
Worth scheduling alongside or just before the two engine primitives, since it is self-contained
and currently causes a silent, confusing wasted-pick bug for real players today.

**Explicitly not recommended next**: full Equipment/Inventory architecture work (§11/§20) before
Phase 2A — but the scope of what's left there is now narrower than originally stated. Ongoing
inventory persistence is done; what remains is authoring a creation-time equipment-grant facet
shape, which is a content/facet-shape decision, not the "extend V1 vs. build V2-native"
architectural fork the original audit posed (that fork is resolved: V2 already has its own
native inventory system, so any equipment-grant work builds on it, not on a still-open design
choice).

## 23. Level 1→20 Acceptance (2026-10-02)

Answers one question executably, not by manual browser checklist: for each of the 12 real
native-XPHB classes, if a real Level-1 character previews progression all the way to Level 20,
which choices SHOULD Eldra surface, which DOES it actually surface, and do those two ever
disagree. New suite:
[`tests/server/utils/character-progression-level-1-to-20.test.ts`](../../../tests/server/utils/character-progression-level-1-to-20.test.ts)
(84 tests) — real on-disk Rules Package, real `RulesFacet` corpus via `findRulesFacet`, real
`planProgression`/`confirmProgression`, cross-referenced against the checked-in
[Progression Coverage Ledger](../../../app/lib/content-rules/dnd5e-2024-progression-coverage.ts).
One data-driven test body for all 12 classes — no twelve-synthetic-Wizard-copies pattern.

**Headline result: no regression found.** Every ledger entry classified `IMPLEMENTED` for every
one of the 12 classes is actually present in the real Level 1→20 plan, at the correct level,
with the correct `kind`/`count`, non-empty legal options — asserted, not assumed. No
`IMPLEMENTED`-but-absent case exists today.

### What SHOULD appear vs. what DOES appear, per class

| Class | Implemented choices expected | Implemented choices present | Known blocked choices (ledger, exact) | Unexpected missing | Level 1→20 automated status |
|---|---|---|---|---|---|
| Barbarian | 2 (Subclass, ASI×4) | 2/2 | 2: Epic Boon, Weapon Mastery | None | PASS |
| Bard | 2 (Subclass, ASI×4) | 2/2 | 4: Epic Boon, Expertise, Spellcasting, Magical Discoveries (College of Lore, subclass-internal) | None | PASS |
| Cleric | 2 (Subclass, ASI×4) | 2/2 | 2: Epic Boon, Spellcasting | None | PASS |
| Druid | 2 (Subclass, ASI×4) | 2/2 | 2: Epic Boon, Spellcasting | None | PASS |
| Fighter | 2 (Subclass, ASI×6) | 2/2 | 4: Epic Boon, Fighting Style, Weapon Mastery, Combat Superiority (Battle Master, subclass-internal) | None | PASS |
| Monk | 2 (Subclass, ASI×4) | 2/2 | 2: Epic Boon, Heightened Focus (text-signal false positive, MILESTONE_DEFERRED) | None | PASS |
| Paladin | 2 (Subclass, ASI×4) | 2/2 | 4: Epic Boon, Fighting Style, Weapon Mastery, Spellcasting | None | PASS |
| Ranger | 2 (Subclass, ASI×4) | 2/2 | 5: Epic Boon, Fighting Style, Weapon Mastery, Expertise, Spellcasting | None | PASS |
| Rogue | 2 (Subclass, ASI×5) | 2/2 | 3: Epic Boon, Weapon Mastery, Expertise | None | PASS |
| Sorcerer | 2 (Subclass, ASI×4) | 2/2 | 4: Epic Boon, Metamagic, Spellcasting, Sorcery Incarnate (text-signal false positive, MILESTONE_DEFERRED) | None | PASS |
| Warlock | 2 (Subclass, ASI×4) | 2/2 | 6: Epic Boon, Eldritch Invocations, Mystic Arcanum, Spellcasting, Steps of the Fey (Archfey, subclass-internal), Fiendish Resilience (Fiend, subclass-internal) | None | PASS |
| Wizard | 3 (Subclass, ASI×4, Scholar/Expertise) | 3/3 | 5: Epic Boon, Spellcasting, The Third Eye (Diviner, subclass-internal), Sculpt Spells (Evoker, subclass-internal), Illusory Reality (Illusionist, subclass-internal) | None | PASS |

Exact counts per class are read live from the ledger by the test file itself
(`DND5E_2024_PROGRESSION_COVERAGE`), never hand-copied here — this table is a snapshot of that
same data for a human reader, not a second source of truth.

### Bob — the one authorized manual browser test

Derived from the real plan, not memory. A Level-1 Barbarian previewing Level 1→20 in the Level
Manager **should see**, in order:

1. **Level 3** — "Requires: Subclass (choose 1)" — exactly 4 options: Path of the Berserker,
   Path of the Wild Heart, Path of the World Tree, Path of the Zealot.
2. **Level 4** — "Requires: Feat (choose 1)" — the General feat catalogue (including Ability
   Score Improvement, whose own selection reveals a second, nested "choose 2 abilities to
   increase by 1" control).
3. **Level 8** — the same Feat choice again (Ability Score Improvement remains legally
   selectable — it is explicitly repeatable).
4. **Level 12** — the same Feat choice again.
5. **Level 16** — the same Feat choice again.

Every other level (1–2, 5–7, 9–11, 13–15, 17–20) shows only automatic numeric consequences (HP,
proficiency bonus, Rage uses, etc.), no required choice.

**Known missing/blocked, not a defect** — these will NOT appear anywhere in this preview today,
by design, pending future authoring work: Weapon Mastery (should be a Level-1 creation-time
choice — Builder gap, not a Level-Up gap), Epic Boon (Level 19 — classified `CONTENT_BLOCKED`),
any subclass-internal feature beyond the Level-3 selection itself (Barbarian's own real
subclasses have none of the 7 currently-discovered subclass-internal choices, so this is
expected-empty for Barbarian specifically, not merely unverified).

### Level 20 derivation (representative, not exhaustive)

Verified via real multi-level hypothetical evaluation, composing correctly through Level 20:
Barbarian's Rage pool scales 2 (L1) → 6 (L20); proficiency bonus 2 → 6; HP increases
monotonically. Fighter's Action Surge/Indomitable are acquired at exactly L2/L9, not before.
Monk's Focus Points and Sorcerer's Sorcery Points are acquired at L2 and scale with level.
Paladin's Lay on Hands scales 5 (L1) → 100 (L20), matching the real `5 × level` rule. Ranger's
Tireless is acquired at exactly L10, not before. An ASI picked at an earlier level genuinely
moves a later derived ability score (Barbarian: base STR/DEX 12 → 14 after 2 of 4 real ASI
thresholds applied +1 STR/+1 DEX each) — dependent evaluation composes correctly, not merely
per-level in isolation.

### Feat mechanics (prerequisite filtering / repeatability)

Verified against the real validation machinery using two clearly-labeled synthetic probe feats
(the main 1→20 path never depends on either): an unmet ability prerequisite is rejected at
Confirm; a non-repeatable feat already owned is excluded from a LATER choice's own legal options
(caught even before Confirm, at the options-resolution stage) — stricter and earlier than this
audit originally assumed, confirmed by reading the real result rather than guessing; the same
repeatable feat (Ability Score Improvement) can legally be selected at two different ASI
thresholds.

### Subclass-internal progression

For the first real subclass option selected in each of the 12 class tests, every ledger entry
identifying a subclass-internal choice-bearing feature for that exact subclass is confirmed
classified `ENGINE_BLOCKED` with a stated blocker (`subclass-internal-feature-level-gating`) —
never silently surfaced as a working choice, never silently dropped from the ledger either.

### Plan validity — Outcome A, confirmed for all 12 classes

Per this audit's own PLAN VALIDITY question: once every currently `IMPLEMENTED` required choice
is answered, the plan reaches **Outcome A (`valid: true`)** for all 12 classes — every blocked
mechanic is simply absent from the declared requirements today, never present-but-unresolved.
`confirmProgression` then succeeds through Level 20 for all 12 classes: the selected subclass
persists in the returned progression record, and every repeated Ability Score Improvement
acquisition remains owned (one `feats[]` entry per real ASI threshold).

### UX stress audit

Inspected [`CharacterProgressionPanel.vue`](../../../app/components/characters/CharacterProgressionPanel.vue)
(the real Level Manager plan renderer — explicitly documented in its own header as a "Game Admin
Level Manager surface," gated behind the same `canEditCharacter` hint every other admin-only
Sheet control uses, not a player-facing surface) against the shape a real Level 1→20 plan
actually produces:

- **Level sections**: 19 (`steps` for levels 2–20) render unconditionally via a single `v-for`
  — no pagination, no virtualization, no lazy mount. Cheap today: 14 of 19 sections render only
  a one-line "No automatic changes at this level" placeholder for every class.
- **Choice groups**: 2–3 per class today (Subclass once, Feat Selection repeated 4–6 times,
  Wizard's Scholar once) — small now, but each `choice:feat.selection` group's own OPTION list is
  the real General-feat catalogue (dozens of entries), rendered as a full radio/checkbox list
  with no search/filter/collapse.
- **Auto-re-preview behavior**: confirmed correct, not a redraw risk — the plan stays rendered
  during a re-preview with a "Recalculating…" label alongside it (a Phase 2A.1 UX-correction fix
  for a real prior defect), never blanked and rebuilt from scratch.
- **Does the UI become impractically long today?** No — current real choice volume (2–3 groups,
  19 mostly-empty level sections) renders as a short, scrollable admin page. **Will it, as
  blocked mechanics are implemented?** Likely yes — Fighting Style, Weapon Mastery, Metamagic,
  Eldritch Invocations, spell acquisition, and Epic Boon would each add their own choice group at
  their own level(s), and a full 1→20 preview would eventually show a long vertical list mixing
  many different mechanics across many levels at once.
- **Recommendation**: this is exactly right for an *admin/debugging* tool and should not be
  redesigned for that purpose. A future **player-facing Level-Up Wizard should level ONE level at
  a time** (one screen, one level's own choices, confirm, repeat) rather than exposing a giant
  1→20 administrative plan — this audit's own real plan-size trajectory is evidence FOR that
  design, not merely a guess. No visual redesign performed this pass, per this task's own scope
  boundary.

### Milestone gap list — Create Level 1 → Play → Level 20 entirely in app

Grouped by dependency, not by class. Each item's current status is cited against the section of
this audit that already established it; nothing here is asserted without an existing citation.

1. **Creation/Builder** (blocks the "Create Level 1" half specifically — §2, §11, §14 #3/#4):
   Origin Feat selection, Fighting Style/Weapon Mastery selection where acquired at character
   creation, starting spell/cantrip selection, starting equipment/gold. None of these block a
   Level 1→20 *progression* preview (they are Level-1-only, already-passed-by-the-time-Level-Up-
   starts choices) — they block only the "created entirely in-app" half of the milestone.
2. **Class Progression — Content Authoring** (this audit's own primary subject, §23 above):
   Weapon Mastery (5 classes), Fighting Style (3 classes), base-class Expertise (Bard/Ranger/
   Rogue — the SAME already-proven mechanism Wizard's Scholar uses, simply unauthored for these
   three), Epic Boon (all 12, Level 19) — all `CONTENT_BLOCKED`, meaning the engine/UI already
   supports the shape and only package authoring remains.
3. **Class Progression — Engine Primitives** (§14, §23 above): Metamagic (Sorcerer) and Eldritch
   Invocations (Warlock) need a new "accumulating known-options from a catalogue category,
   learned permanently, with a level-scaling count" ChoiceSet shape — distinct from both ordinary
   Feat Selection and fixed-count Expertise, neither engine-ready nor content-ready today.
4. **Subclass Progression** (§5, §7, §23 above): subclass *selection* is complete for all 12
   classes (this audit's own headline fix). Subclass *feature content* beyond the Level-3
   selection itself (the ~190 individual feature rows across 48 subclasses, §5) remains
   unauthored; the 7 currently-discovered subclass-internal CHOICE-bearing features additionally
   need a new `subclass-internal-feature-level-gating` primitive before any of them could be
   authored at all (the same primitive already blocking War Priest/Warding Flare/Dark One's Own
   Luck, §7).
5. **Spell Acquisition** (§6, §23 above): no class-spell-list filtering and no known/prepared
   count enforcement exists anywhere in the engine — confirmed absent, not merely unverified.
   Blocks Mystic Arcanum (Warlock) and ordinary spell/cantrip acquisition for all 8 casting
   classes equally.
6. **Equipment** (§11, §14 #4, §22's own standing recommendation): starting equipment/gold has no
   facet shape decision on record; explicitly out of scope for this audit and for the task that
   requested it.
7. **Feature Runtime** (§7, §23 above): even once subclass-internal features are authored, no
   generic mechanism exists today for a subclass's own LATER feature (resources, actions,
   effects) to activate — this is downstream of #4 above, not independent of it.
8. **Level-Up Player UX** (§23's own UX STRESS AUDIT above): the current Level Manager is
   correctly an admin tool, not a reusable player surface; a dedicated, one-level-at-a-time
   Player Level-Up Wizard is unbuilt, reusing the same `useCharacterProgression`/`planProgression`/
   `confirmProgression` contract this audit just proved correct through Level 20 for every
   currently-implemented choice.

**What is NOT a gap**: the progression ENGINE itself (plan/confirm, dependent evaluation,
nested choices, ordering, validity, Level 20 derivation composing correctly) — proven this pass,
for the first time, executably, for all 12 real classes at once. Every remaining gap above is a
CONTENT or NEW-PRIMITIVE gap the engine is structurally ready to receive, or a UX-surface gap
independent of correctness.

## 24. Choice Eligibility & Systematic Content Coverage (Phase 2B, 2026-10-02)

**Part A — generic Choice Eligibility.** Closes the real, previously-confirmed cross-facet
duplicate-proficiency bug (§2, §13, §18): a Background's direct `grants` now makes the identical
option ineligible in a different slot's/row's own separate `choices` entry, and a dynamic
prerequisite ("must already be proficient") is now expressible without a special-cased validator.

Traced first (mandatory before implementing): option resolution has ActorState access only
inside `character-actor-bridge.ts` (`buildActorState`) — never in the pure `rules-choices.ts`
helpers (`toResolvableChoice`/`validateChoiceSelection`, which the Builder also calls with no
registry at all) and never in `validateChoiceSelection` itself, which only re-validates an answer
against an already-filtered options list. Server validation already re-resolves legality at
Confirm/save time by construction, since the ineligible option is removed from `options` before
`validateChoiceSelection` ever runs — a crafted request naming it fails the EXISTING "not one of
the offered options" check, no new authority mechanism needed. Creation (`create-v2.post.ts`) and
progression (the bridge) do **not** share one authority path — `create-v2.post.ts` has no Rules
Registry access by design (catalogue-only), so it needed its own, narrower application of the
same principle (see below) rather than reusing the bridge wholesale.

**Model, the smallest extension justified by the real corpus** (never one global "already-owned
is illegal" rule — Feat Selection's own real repeatability, resolved entirely in
`character-derived.ts`'s `ownedFeatRefs`, is untouched and proves a blanket rule would have been
wrong):
- `ChoiceSetDefinition.excludeIfAlreadyActive?: boolean` (`app/lib/rules/types.ts`) — set on
  `choice:skill.proficiency` and `choice:skill.expertise` only. An option already active is
  dropped from that ChoiceSet's own offered list, wherever it is asked.
- `RulesFacetChoice.requiresActive?: (DefinitionId | null)[]` (`app/lib/content-rules/types.ts`,
  mirrored on `ProgressionRow.choices[]`, `app/lib/rules/types.ts`) — parallel to `from`; names,
  per option, a DIFFERENT value that must already be active (Expertise's real prerequisite: the
  matching `.proficient` Value). Applied via the new pure `filterEligibleOptions`
  (`app/lib/characters/rules-choices.ts`), called from both real option-construction sites in the
  bridge (creation `facet.choices`, progression `row.choices`) before `toResolvableChoice`/
  `toResolvableProgressionChoice` build `options` — so the filtered list is simultaneously what
  the client is offered AND what the server validates against.
- `character-actor-bridge.ts` gained a small pre-pass seeding every slot's/feat's own direct
  `grants` into `values` BEFORE any choice is resolved, regardless of SLOT_ORDER position — the
  exact mechanism the real cross-facet bug needed (Background is LAST in SLOT_ORDER; without this,
  an EARLIER-evaluated Class choice could never see a LATER Background's own direct grant).
  Deliberately `grants` only, never `sources`, to avoid double-pushing a SourceInstance the
  unchanged main loop would push again.
- `create-v2.post.ts` has no registry access, so it applies a narrower, explicitly-scoped
  equivalent: collect every one of the three slots' own direct `grants` up front, then exclude any
  OTHER slot's choice option that exactly matches one. Correct for today's real corpus (the only
  creation-time `fromContentFacet` choice is Skill Proficiency); documented as narrower than the
  bridge's own generality, not silently assumed equivalent.
- Choice order is deterministic by construction, never incidental iteration order: SLOT_ORDER
  (species → class → subclass → background) for creation choices, then each Progression's own
  `rows` in the order the Definition declares them, with a GRANTS-only pre-pass running before any
  of it — reported honestly rather than left implicit.

**Real regression proven** (`tests/server/api/worlds/[id]/characters/create-v2.post.test.ts`, new
describe block, real Sage + Wizard content, never synthetic-only): Arcana (Sage's own real direct
grant) is absent from Wizard's own skill-proficiency choice's legal options; a crafted request
naming it is rejected (400) even when paired with an otherwise-legal second pick; a fully legal
alternate succeeds and persists; Background's own grants need no answer at all.

**Real regression found and fixed in Wizard's own existing Scholar row** (`wizard-xphb:scholar`,
already `A. COMPLETE`/`IMPLEMENTED` before this phase): the real XPHB prerequisite ("a skill in
which you have proficiency") was never enforced — any of the 6 skills was offered unconditionally,
proficient or not. Fixed via `requiresActive`, the same generic mechanism, never a special-cased
Scholar/Expertise validator.

**Part B — CONTENT_BLOCKED ledger pass.** Every entry enumerated directly from the ledger
(`app/lib/content-rules/dnd5e-2024-progression-coverage.ts`), never from the summary list, per
this phase's own instruction. Outcomes:

| Feature | Prior status | New status | Why |
|---|---|---|---|
| Base-class Expertise (Bard L2+L9, Ranger L9, Rogue L6) | CONTENT_BLOCKED | **IMPLEMENTED** | Real XPHB rule is genuinely unrestricted ("two of your skill proficiencies of your choice") — authored using this phase's own new `requiresActive` eligibility, three new Progression Definitions, zero class-name branching |
| Rogue's own Level-1 half of Expertise | (new entry) | CONTENT_BLOCKED | Genuine creation-time grant, owned by a future Creation/Builder phase — never merged into the Level-6 row as if one combined grant |
| Fighting Style (Fighter L1, Paladin/Ranger L2) | CONTENT_BLOCKED | **ENGINE_BLOCKED** | Real XPHB structure is a FEAT category ('FS') — the real option resolver (`character-derived.ts`) is hardcoded to `category === 'general'` only; no authoring alone can close this |
| Epic Boon (all 12, L19) | CONTENT_BLOCKED | **ENGINE_BLOCKED** | Same root blocker as Fighting Style (`category: 'epic-boon'`) — corrected, not merely re-labeled |
| Origin Feat | ENGINE_BLOCKED (stale reason) | ENGINE_BLOCKED (corrected reason) | Prior reason ("no Feat category exists at all") is stale — `choice:feat.selection` is real and proven; the real blocker is the identical feat-category-filter gap (`category: 'O'`), plus a separate Builder-surface gap |
| Weapon Mastery (5 classes, L1) | CONTENT_BLOCKED | **ENGINE_BLOCKED** | Real XPHB rule lets the player CHANGE one mastered weapon on every Long Rest — no primitive exists for a Content-Catalogue-backed choice that can be legally re-answered after its first answer |
| Mystic Arcanum / Spellcasting (all casting classes) | CONTENT_BLOCKED | **ENGINE_BLOCKED** | "No class-spell-list filtering exists" names a missing capability, not unauthored content — explicitly owned by the future Spell Acquisition phase |

New shared blocker constant `FEAT_CATEGORY_FILTER_BLOCKER` names the Fighting Style/Epic
Boon/Origin Feat primitive precisely: the real Feat Selection option resolver is hardcoded to only
ever offer `featMechanics.category === 'general'`, with no declarative way for a different
ChoiceSet to request a different real category. **No** `"time-boxed out"`/`"ready but not
authored"` rows remain for any entry this pass touched — every one now carries an exact status and
an exact, named reason.

**Level 1→20 acceptance extended, not merely re-asserted.** The existing all-class suite
(`tests/server/utils/character-progression-level-1-to-20.test.ts`) is data-driven from the ledger
itself, so newly-`IMPLEMENTED` base-class Expertise is automatically exercised by the same
IMPLEMENTED CONTRACT/PLAN VALIDITY tests, with real `ProgressionPlan` behavior asserted (correct
level, correct kind, legal options narrowed to real proficiencies, tentative answers, Confirm
succeeding through Level 20) — not merely "the Definition exists."

**Regression preserved**: all 12 subclass choices, ASI/General Feat (incl. nested ASI, still
collision-free), Generic Resources and resource-interaction performance, Tonso, Bob's subclass
progression, spell slots/Cast/Rest — all unchanged, all still green (3550/3550).

---

## 25. CRITICAL PATH TO CHARACTER INFRASTRUCTURE COMPLETE (2026-10-06)

Status: read-only roadmap audit. No application, package, or Rules/Content state was changed to
produce this section. Baseline verified this pass: Rules `eldra.rules.dnd5e-2024@0.18.0` CURRENT,
Content `eldra.solaris.xphb` CURRENT, Actions None (`pnpm packages:sync --world Solaris`, dry run).
Ledger tests (`tests/rules/dnd5e-2024-progression-coverage.test.ts`,
`tests/rules/dnd5e-2024-origin-feat-acquisition.test.ts`): 131 passing.

### 25.0 Evidence basis and limits

- **Ledger**: 104 rows, evaluated by bundling `app/lib/content-rules/dnd5e-2024-progression-coverage.ts`
  (IMPLEMENTED 44, ENGINE_BLOCKED 56, CONTENT_BLOCKED 2, MILESTONE_DEFERRED 2). The ledger's
  `ref(...)`-generated rows were included; a literal-source parse undercounts them.
- **Corpus**: `/opt/eldra/datasets/5etools-src/data` (`class/class-*.json`, `races.json`,
  `backgrounds.json`, `feats.json`, `items-base.json`, `optionalfeatures.json`,
  `generated/gendata-spell-source-lookup.json`). Source scope is **XPHB only**; PHB 2014 features
  (e.g. Warlock "Pact Boon", L3) are out of scope.
- **Discovery heuristic**: the ledger's own detector (`discoverClassLevelFeatures`) was run as
  written. It matched 94 class features (including the known-name set). A structural pass
  (`"type": "options"` blocks, choose/choice/select/learn phrasing) over all XPHB class features
  found real build decisions the detector misses (§25.3).
- **Not verified this pass** (stated, not extrapolated): Battle Master maneuver increments beyond
  Level 3; Paladin/Ranger/Rogue Weapon Mastery increments beyond Level 1; the exact Gnome/Elf/Tiefling
  lineage spell lists; the Wizard per-level spellbook learning counts; the Metamagic and Eldritch
  Invocation option text beyond counts and levels. These are named in the census rows as
  "verify in phase".

### 25.1 Definitions

**MILESTONE A — CHARACTER LEGALITY.** Every mandatory character-building and level-progression
decision of the XPHB Player's Handbook, for every class, background, species, and feat, can be made
by the player, is persisted, survives reload, and resolves through Level 20. "Mandatory" means the
PHB makes the player choose or the rule grants something that must be recorded. A decision that is
merely *optional flexibility* ("you may replace…") is not Milestone A if the original legal answer
remains valid.

**MILESTONE B — FULL MECHANICAL AUTOMATION.** Eldra executes every feature, modifier, reaction,
damage rider, resource effect, and per-use effect. Out of scope for Milestone A.

**Silent-drop defect (new, critical).** Today a character can complete creation, and can select a
General feat, with mandatory decisions never recorded. Verified for the four feats named below, and
for species lineage and background ability and tool bonuses (no facet exists for them). The Builder's completeness gate
(`missingRequirements`, `app/components/characters/builder/characterBuilderSelection.ts:498`)
checks only: name, species/class/background, facet-declared choices, content choices, and ability
scores. It does not check any ledger-blocked decision. In the four feat facets checked
(`fey-touched-xphb`, `chef-xphb`, `keen-mind-xphb`, `heavily-armored-xphb`), only the ability choice is
authored; none declares its spell, tool, skill, or proficiency decision. The result is a legal-looking character with an incomplete
record. This is the first thing to fix, and it does not need a new primitive (§25.15, Phase 0).

### 25.2 Stale audit items (corrected by this section; earlier sections not rewritten)

| # | Audit location | Audit says | Repository truth (evidence) |
|---|---|---|---|
| S1 | §1 Exec Summary, finding 2 | No Resource Definition kind | Resource kind exists (`ResourceDefinition` extended with `recovery`/`presentation`, Phase 2A.2; §14 #2 already says DONE) |
| S2 | §1 Exec Summary, finding 1; §14 #1 | `RulesFacetGrant` cannot increment; ASI blocked on it | ASI is implemented for all 12 classes (ledger ASI rows IMPLEMENTED; `source:asi.increase.*`, `choice:feat.asi-ability-increase`) |
| S3 | §23 milestone list, item 2 | Weapon Mastery is CONTENT_BLOCKED | Ledger: ENGINE_BLOCKED (creation); primary blocker is mutable re-answer + item vocabulary, not content |
| S4 | §23 milestone list, item 2 | Fighting Style is CONTENT_BLOCKED | Fighter L1 IMPLEMENTED; Paladin/Ranger L2 IMPLEMENTED for plain FS; only the variant options (Blessed/Druidic) remain blocked |
| S5 | §23 milestone list, item 2 | Expertise for Bard/Ranger/Rogue is CONTENT_BLOCKED | Bard L2/L9, Ranger L9, Rogue L6 IMPLEMENTED. Rogue L1 still CONTENT_BLOCKED. Ranger L2 Deft Explorer expertise is not in the ledger (§25.3) |
| S6 | §23 milestone list, item 1; §24 | Origin Feat selection not implemented | Fixed Origin acquisition IMPLEMENTED for 8 Backgrounds (Phase 2C.3A, commit `eef7b48`); 8 choice-bearing Backgrounds remain blocked |
| S7 | §6 Spellcasting | "no class-spell-list filtering exists anywhere in the engine" | True for the V2 engine. V1 has a working class-list path: `server/api/worlds/[id]/class-spell-options.get.ts` reads the same `gendata-spell-source-lookup.json`, used by `ClassSpellChoicePanel.vue` and `FeatChoicePanel.vue`. Two parallel mechanisms; V2 must reuse one, not add a third |
| S8 | §2 / §11 / §14 #4 | Starting equipment is "out of scope" | Required for Milestone A (every class and background has a mandatory A/B or gold choice) |
| S9 | §5 Subclass | Only selection and feature content "unauthored" | Undercounted: 224 fixed and 48 choice spell-grant entries across XPHB subclasses (§25.11) are not in the ledger at all |
| S10 | §23 / §24 coverage claim | Ledger discovery is "complete" for choice-bearing features | Discovery misses `options`-block features and several phrasings (§25.3) |

Ledger corrections found in this pass (must be made in the ledger, not in this document):

- `warlock-xphb:eldritch-invocations` levels are `[1,2,5,6,7,8,9,10]`. The corpus table
  (`Invocations` column) increases at **L1, L2, L5, L7, L9, L12, L15, L18** (1→3→5→6→7→8→9→10).
  Levels 6, 8, 10 are wrong; 12, 15, 18 are missing.
- `fighter-xphb:weapon-mastery` and four other Weapon Mastery rows: the leading blocker is
  item/proficiency vocabulary; re-answer is optional and deferrable (§25.8).
- Blessed Warrior and Druidic Warrior rows say "never legal". Only the variant option is illegal.
  The plain Fighting Style options remain legal, so Milestone A is not blocked by them.
- `background:origin-feat:choice-acquisition` names "spell/cantrip acquisition" for Magic Initiate;
  it should cite the spell primitive (§25.6) explicitly.
- `barbarian-xphb:epic-boon-effects` (and the other 11 Epic Boon rows): the "Boon of Skill" nested
  proficiency and expertise decisions are Milestone A (a player selecting Boon of Skill cannot
  complete it), while the remaining Boon effects are runtime. Split the nested decision out.
- `sorcerer-xphb:sorcery-incarnate`, `monk-xphb:heightened-focus`: the ledger already calls these
  false positives. They should leave the coverage ledger rather than sit as MILESTONE_DEFERRED rows.

### 25.3 Discovery gaps: real build decisions not in the ledger

The structural pass found these real decisions. Each is absent from the ledger.

| ID | Class / feature | Level | Decision | Corpus basis |
|---|---|---|---|---|
| D-01 | Cleric Divine Order | 1 | Protector OR Thaumaturge | `type:options` block, `refClassFeature` |
| D-02 | Druid Primal Order | 1 | Magician OR Warden | same |
| D-03 | Cleric Blessed Strikes | 7 | Divine Strike OR Potent Spellcasting | `type:options` / refClassFeature |
| D-04 | Druid Elemental Fury | 7 | Potent Spellcasting OR Primal Strike | same |
| D-05 | Barbarian Wild Heart: Aspect of the Wilds | 6 | one of the options; changeable each Long Rest | "gain one of the following options of your choice" |
| D-06 | Ranger Hunter: Defensive Tactics | 7 | one of the feature options; replaceable on Short/Long Rest | same pattern |
| D-07 | Ranger Gloom Stalker: Iron Mind | 7 | proficiency in Int or Cha saves (conditional on existing proficiency) | corpus text |
| D-08 | Barbarian Primal Knowledge | 3 | one additional skill from the Barbarian skill list | "proficiency in another skill of your choice" |
| D-09 | Ranger Deft Explorer: Expertise | 2 | Expertise in one skill you are proficient in (+ two languages) | corpus text; ledger has only the L9 expertise |
| D-10 | Bard Magical Secrets | 10 (every prepared-spell increase from 10) | any new prepared spell from Bard/Cleric/Druid/Wizard lists | corpus text |
| D-11 | Wizard Spell Mastery | 18 | one 1st- and one 2nd-level spellbook spell (action casting time) | corpus text |
| D-12 | Wizard Signature Spells | 20 | two 3rd-level spellbook spells | corpus text |
| D-13 | Sorcerer Draconic: Elemental Affinity | 6 | one damage type (from ancestry list) | "Choose one of those types" |
| D-14 | Druid Land: circle terrain | 3 (subclass) | terrain type, which selects the Circle Spells list | subclass `additionalSpells` `name` variants |
| D-15 | Paladin Oath, Cleric Domain, Druid Circle, Warlock Patron, Sorcerer Origin, Wizard School, Ranger/Monk/Rogue/Fighter subclasses | 3+ | fixed spell grants (§25.11) | structured `additionalSpells` |
| D-16 | Species (6 of 10): see §25.5 | 1 | lineage / ancestry / origin feat | `races.json` |
| D-17 | Background ability bonus (16) | 1 | two weighted choices across the Background's three listed abilities | `backgrounds.json` `ability` |
| D-18 | Background tool proficiencies (16) | 1 | 11 fixed tools, 5 choose-one/three choices | `backgrounds.json` `toolProficiencies` |
| D-19 | Class tool choices: Bard (3 instruments), Monk (1 artisan tool or instrument); fixed tools for Rogue (Thieves' Tools) and Druid (Herbalism Kit) | 1 | tool / instrument proficiency | class `startingProficiencies` |
| D-20 | Class armor and weapon proficiency grants | 1 | fixed, all classes (Protector/Warden depend on them) | class `startingProficiencies` |
| D-21 | General / Epic feats with nested non-ability decisions: 5 spell (Fey-Touched, Ritual Caster, Shadow-Touched, Telekinetic, Telepathic), 2 tool (Chef, Poisoner), 4 armor/weapon (Heavily/Lightly/Moderately Armored, Martial Weapon Training), 4 skill/tool/language (Keen Mind, Observant, Skill Expert, Boon of Skill) | 4+ / 19 | nested decision | `feats.json`; facets author only the ability choice (verified for four of them) |
| D-22 | Starting equipment, A/B packages and gold alternative: 12 classes + 16 backgrounds | 1 | mandatory package choice | class and background `startingEquipment` |
| D-23 | Per-level spell counts: Cantrips and Prepared Spells, 8 casters, levels 1–20 | 1–20 | count enforcement and increments | class `classTableGroups` |
| D-24 | Wizard spellbook learning and copying | 1–20 | spellbook membership is the source for prepared/Spell Mastery/Signature | Spellcasting feature text (counts: verify in phase) |
| D-25 | Languages (Rogue Thieves' Cant + one, Ranger Deft Explorer + two, species/background language grants) | 1+ | language choice | **corpus has no structured language grant**: prose only (see F-class, §25.4) |

Not a decision (checked and excluded): Cleric Divine Intervention, Fighter Studied Attacks, Monk
Empowered Strikes, Cleric Divine Strike, Druid Primal Strike, Barbarian Brutal Strike, Druid Natural
Recovery, Druid Nature's Ward, Wizard Memorize Spell (replacement; §25.12), Sorcerer Tamed Surge,
Warlock Celestial Resilience and Searing Vengeance, Ranger Beast Master Exceptional Training, Aasimar
Celestial Revelation (chosen per transformation, runtime). These are combat-time or per-use choices.

### 25.4 Remaining-blocker census

Columns: **ID** · **Feature / decision** · **Owner** · **Level** · **C/P** (creation/progression) ·
**Ledger** · **First broken boundary** · **Missing primitive or authoring** · **A?** (Milestone A
critical) · **R?** (runtime-only) · **Deps**.

Ledger keys are shorthand for the rows in `dnd5e-2024-progression-coverage.ts`. "NOT LISTED" means no
row exists.

**Creation (Level 1)**

| ID | Feature / decision | Owner | Lvl | C/P | Ledger | First broken boundary | Primitive or authoring | A? | R? | Deps |
|---|---|---|---|---|---|---|---|---|---|---|
| C-01 | Spellcasting L1 selection (cantrips + prepared), 8 casters | Wizard, Cleric, Druid, Bard, Sorcerer, Warlock, Paladin, Ranger | 1 | C | ENGINE_BLOCKED ×8 | Builder never asks; silent drop | P2 + P3 | YES | no | P2, P3 |
| C-02 | Weapon Mastery initial kinds | Barb 2, Fighter 3, Paladin 2, Ranger 2, Rogue 2 | 1 | C | ENGINE_BLOCKED ×5 | no weapon-kind vocabulary; silent drop | P1 (weapon kinds, 40 base weapons, 8 properties) + choice | YES | no | P1 |
| C-03 | Weapon Mastery later replacement | same 5 | 1 + LR | P | in C-02 | re-answer | mutable choice | NO (optional) | no | defer |
| C-04 | Cleric Divine Order (Protector / Thaumaturge) | Cleric | 1 | C | NOT LISTED | Protector needs armor/weapon proficiency vocabulary; Thaumaturge needs a cantrip | P1 + P2 + feature-option choice (P6) | YES | no | P1, P2, P6 |
| C-05 | Druid Primal Order (Magician / Warden) | Druid | 1 | C | NOT LISTED | Warden needs armor/weapon vocab; Magician needs a cantrip | P1 + P2 + P6 | YES | no | P1, P2, P6 |
| C-06 | Rogue Expertise (L1, 2 skills) | Rogue | 1 | C | CONTENT_BLOCKED | no Builder surface for a class skill-expertise picker | Builder surface (C) + creation `facet.choices` authoring (D) | YES | no | none |
| C-07 | Fighter Fighting Style (L1) | Fighter | 1 | C | IMPLEMENTED | — | — | done | effects only | — |
| C-08 | Background skills (16) | all | 1 | C | implemented (facet grants) | — | — | done | — | — |
| C-09 | Background ability bonus (16) | all | 1 | C | NOT LISTED | no facet, no ability distribution; every character's derived scores miss it | P7 (bounded ability distribution) | YES | no | P7 |
| C-10 | Background tool proficiencies (16: 11 fixed, 5 choice) | all | 1 | C | NOT LISTED | no tool vocabulary | P1 + one generic proficiency choice | YES | no | P1 |
| C-11 | Background Origin feat, fixed (8 backgrounds, 6 feats) | Criminal, Guard, Farmer, Hermit, Merchant, Wayfarer, Sailor, Soldier | 1 | C | IMPLEMENTED | — | — | done | effects only (C-17..C-22) | — |
| C-12 | Background Origin feat, choice (Crafter, Musician, Skilled, Magic Initiate) → Artisan, Entertainer, Charlatan, Noble, Scribe, Acolyte, Guide, Sage | 8 backgrounds | 1 | C | ENGINE_BLOCKED | blocked by tool/instrument/skill-or-tool/spell primitives | Crafter, Musician, Skilled: P1 only (see §25.7). Magic Initiate: P2 + P3 | YES | no | P1 (5 bg), P2+P3 (3 bg) |
| C-13 | Species: Human Origin feat choice (anyFromCategory O, count 1) | Human | 1 | C | NOT LISTED | no species facet; option set includes C-12's blocked feats | authoring + `creationUnavailable` honoured on feat offers (generic extension of 2C.3A) | YES | no | P1, P2 for full option set |
| C-14 | Species: Elf lineage (Drow / High Elf / Wood Elf) + spellcasting ability | Elf | 1 | C | NOT LISTED | lineage never asked; spells and ability choice missing | P2 (lineage cantrips) + P7 (ability choose) + authoring | YES | no | P2, P7 |
| C-15 | Species: Gnome lineage (Forest / Rock) + ability | Gnome | 1 | C | NOT LISTED | same | P2 + P7 + authoring | YES | no | P2, P7 |
| C-16 | Species: Tiefling legacy (Abyssal / Chthonic / Infernal) + ability + resistance choice | Tiefling | 1 | C | NOT LISTED | same, and resistance choice has no damage-type vocabulary | P1 (damage types), P2, P7, authoring | YES | resistance is R | P1, P2, P7 |
| C-17 | Species: Dragonborn ancestry (damage type, 5 options) | Dragonborn | 1 | C | NOT LISTED | no damage-type vocabulary | P1 (damage types) + authoring | YES | effect R | P1 |
| C-18 | Species: Goliath giant ancestry (choose 1 of 6 boons) | Goliath | 1 | C | NOT LISTED | no boon vocabulary | authoring (boon as Definition) | YES | effect R | P1 (partial) |
| C-19 | Species: Aasimar Celestial Revelation | Aasimar | 3 (per transform) | P | NOT LISTED | chosen per use | — | NO | R | — |
| C-20 | Class tool choices: Bard 3 instruments; Monk 1 artisan / instrument | Bard, Monk | 1 | C | NOT LISTED | no instrument vocabulary | P1 + generic choice | YES | no | P1 |
| C-21 | Class fixed tools: Rogue Thieves' Tools; Druid Herbalism Kit | Rogue, Druid | 1 | C | NOT LISTED | no tool vocabulary | P1 + grant | YES | no | P1 |
| C-22 | Class armor/weapon proficiency grants | all 12 | 1 | C | NOT LISTED | no armor/weapon vocabulary | P1 | YES (representation) | no | P1 |
| C-23 | Starting equipment A/B, gold alternative | 12 classes + 16 backgrounds | 1 | C | ENGINE_BLOCKED (bg only) | no creation grant | P8 (equipment grants) | YES | no | P1 (weapon/armor refs), P8 |
| C-24 | Expertise via Deft Explorer (Ranger) — at L2 (not L1) | Ranger | 2 | P | NOT LISTED (ledger has L9 only) | missing row | authoring (existing expertise primitive) | YES | no | none |
| C-25 | Ability Score Improvement at L4/6/8/… and General feat ability | all | 4+ | P | IMPLEMENTED | — | — | done | — | — |
| C-26 | Languages (Rogue Thieves' Cant +1; Ranger +2; species / background language grants) | several | 1–2 | C/P | NOT LISTED | **no structured language grant in the corpus** | F-class: policy decision (§25.4 F) | policy | no | policy |

**Progression (Level 2–20)**

| ID | Feature / decision | Owner | Lvl | C/P | Ledger | First broken boundary | Primitive or authoring | A? | R? | Deps |
|---|---|---|---|---|---|---|---|---|---|---|
| P-01 | Paladin Fighting Style (L2), plain options | Paladin | 2 | P | IMPLEMENTED | — | — | done | — | — |
| P-02 | Paladin/Ranger FS variants Blessed Warrior / Druidic Warrior | Paladin, Ranger | 2 | P | ENGINE_BLOCKED | variant option only | P2 (cantrips) | NO (plain options legal) | — | P2 |
| P-03 | Barbarian Primal Knowledge (skill) | Barbarian | 3 | P | NOT LISTED | missing row | authoring | YES | no | none |
| P-04 | Subclass selection L3 | all 12 | 3 | P | IMPLEMENTED | — | — | done | — | — |
| P-05 | Sorcerer Metamagic: 2 options at L2, +2 at L10, +2 at L17 (6 picks total) | Sorcerer | 2/10/17 | P | ENGINE_BLOCKED | no accumulating shape; no Metamagic option category | P5 | YES | options' effects R | P5 |
| P-06 | Warlock Eldritch Invocations: 10 picks total, increases at L1, 2, 5, 7, 9, 12, 15, 18 | Warlock | 1–18 | C/P | ENGINE_BLOCKED (levels wrong) | accumulating shape; prerequisites | P5 + prerequisite evaluation | YES | effects R | P5 |
| P-07 | Warlock Mystic Arcanum (6th–9th spell, one each at L11, 13, 15, 17) | Warlock | 11–17 | P | ENGINE_BLOCKED | no spell acquisition, no level filter | P2 + P3 | YES | no | P2, P3 |
| P-08 | Fighter Champion Additional Fighting Style | Fighter (Champion) | 7 | P | ENGINE_BLOCKED | subclass-internal gating | P4 | YES | no | P4 |
| P-09 | Fighter Fighting Style replacement | Fighter | any | P | ENGINE_BLOCKED | re-answer ("you can replace") | mutable choice | NO (optional) | no | defer |
| P-10 | Fighter / Barbarian / Ranger / Paladin / Rogue Weapon Mastery increases | Barb, Fighter (verified 2→3→4, 3→4→5→6) | 4/10/16 | P | NOT LISTED | additive weapon-kind count | P1 + additive choice | YES | no | P1 |
| P-11 | Expertise: Bard L2/L9, Ranger L9, Rogue L6 | — | 2–9 | P | IMPLEMENTED | — | — | done | — | — |
| P-12 | Epic Boon acquisition L19 (12 classes) | all | 19 | P | IMPLEMENTED | — | — | done | — | — |
| P-13 | Epic Boon nested: Boon of Skill (proficiency + expertise) | all (if selected) | 19 | P | inside epic-boon-effects (ENGINE_BLOCKED) | nested decision silently dropped | P1 + expertise nested choice + `requiresActive` | YES (conditional) | effects R | P1 |
| P-14 | Bard Magical Lore Magical Discoveries (2 spells, Cleric/Druid/Wizard) | Bard (Lore) | 6 | P | ENGINE_BLOCKED | subclass gating + spell acquisition | P4 + P2 | YES | no | P4, P2 |
| P-15 | Bard Magical Secrets (any-list spells at each prepared increase from L10) | Bard | 10–20 | P | NOT LISTED | missing row, spell acquisition | P2 + P3 + authoring | YES | no | P2, P3 |
| P-16 | Wizard Memorize Spell (swap) | Wizard | 5 | P | NOT LISTED | optional replacement | mutable choice | NO | no | defer |
| P-17 | Wizard Spell Mastery (L18) and Signature Spells (L20) | Wizard | 18, 20 | P | NOT LISTED | spellbook-restricted spell choices | P3 (spellbook) + P2 | YES | no | P2, P3 |
| P-18 | Cleric Blessed Strikes (Divine Strike / Potent Spellcasting) | Cleric | 7 | P | NOT LISTED | options block | P6 | YES | effects R | P6 |
| P-19 | Druid Elemental Fury (Potent Spellcasting / Primal Strike) | Druid | 7 | P | NOT LISTED | options block | P6 | YES | effects R | P6 |
| P-20 | Barbarian Aspect of the Wilds (one option; replaceable) | Barbarian (Wild Heart) | 6 | P | NOT LISTED | options block, subclass gating | P4 + P6 | YES (acquisition) | effects R | P4, P6 |
| P-21 | Ranger Defensive Tactics (one option; replaceable) | Ranger (Hunter) | 7 | P | NOT LISTED | options block, subclass gating | P4 + P6 | YES (acquisition) | effects R | P4, P6 |
| P-22 | Ranger Iron Mind (Int or Cha save, conditional) | Ranger (Gloom Stalker) | 7 | P | NOT LISTED | conditional Definition-path choice | authoring (existing save-proficiency Definitions) + condition | YES | no | none |
| P-23 | Sorcerer Draconic Elemental Affinity (one damage type) | Sorcerer (Draconic) | 6 | P | NOT LISTED | no damage-type vocabulary | P1 + authoring | YES | resistance R | P1 |
| P-24 | Battle Master Combat Superiority maneuvers (3 at L3, further increments: verify) | Fighter (Battle Master) | 3+ | P | ENGINE_BLOCKED | subclass gating + accumulating shape | P4 + P5 | YES | dice effects R | P4, P5 |
| P-25 | Eldritch Knight and Arcane Trickster third-caster progression (`1/3`, Int) | Fighter, Rogue (subclass) | 3+ | P | NOT LISTED | no third-caster slot table (package defines full/half/pact only) | P4 + new slot table (`table:spellcasting.slots_third`) | YES | no | P4 |
| P-26 | Subclass fixed spell grants: 224 entries across 29 subclasses (L3–L19) | 29 subclasses | 3–19 | P | NOT LISTED | no grant type for spells | P4 + P2 (catalogue refs for the fixed spells) | YES | no | P4, P2 |
| P-27 | Subclass choice spells: 48 entries across 7 subclasses (Bard Lore 2; Eldritch Knight 5; Arcane Trickster 5; Abjurer, Diviner, Evoker, Illusionist 9 each, school-filtered) | 7 subclasses | 3–9 | P | NOT LISTED | no school/class-filtered spell choice | P4 + P2 | YES | no | P4, P2 |
| P-28 | Druid Land circle terrain (selects Circle Spells list) | Druid (Land) | 3 | P | NOT LISTED | subclass nested choice | P4 + authoring | YES | no | P4 |
| P-29 | Druid Natural Recovery, Wizard Third Eye, Warlock Fiendish Resilience, Sculpt Spells, Illusory Reality, Monk Elemental Epitome | several | 6–17 | P | mixed | per-rest or per-cast choices | runtime / per-use | NO | R | defer |
| P-30 | Heightened Focus; Sorcery Incarnate | Monk; Sorcerer | 10; 7 | — | MILESTONE_DEFERRED | not decisions | remove rows | NO | — | — |

**Feats (any level via ASI or Epic)**

| ID | Feature / decision | Owner | Lvl | C/P | Ledger | First broken boundary | Primitive or authoring | A? | R? | Deps |
|---|---|---|---|---|---|---|---|---|---|---|
| F-01 | General feats with nested spell choice (Fey-Touched, Ritual Caster, Shadow-Touched, Telekinetic, Telepathic) | any | 4+ | P | NOT LISTED | feat selection accepted; spell choice never recorded | P2 + P3 (immediate guard: P0) | YES | effects R | P0, P2 |
| F-02 | General feats with nested tool choice (Chef, Poisoner) | any | 4+ | P | NOT LISTED | same | P1 | YES | no | P0, P1 |
| F-03 | General feats with nested armor/weapon proficiency (Heavily / Lightly / Moderately Armored, Martial Weapon Training) | any | 4+ | P | NOT LISTED | same, and fixed proficiency never recorded | P1 | YES | no | P0, P1 |
| F-04 | General/Epic feats with nested skill/tool/language (Keen Mind, Observant, Skill Expert) | any | 4+ | P | NOT LISTED | same | P1 + skill choice on feat | YES | no | P0, P1 |
| F-05 | Origin feats: 6 IMPLEMENTED, effects blocked (Alert, Tough, Healer, Lucky, Tavern Brawler, Savage Attacker) | Backgrounds | 1 | C | ENGINE_BLOCKED / CONTENT_BLOCKED | — | effects | NO | R | defer |

**Equipment**

| ID | Feature / decision | Owner | Lvl | C/P | Ledger | First broken boundary | Primitive or authoring | A? | R? | Deps |
|---|---|---|---|---|---|---|---|---|---|---|
| E-01 | Starting equipment A/B (C-23) | — | 1 | C | in C-23 | — | P8 | YES | no | P8 |
| E-02 | Ongoing inventory (add / equip / attune) | — | any | P | IMPLEMENTED (V2 inventory block) | — | — | done | — | — |

### 25.5 Species census (XPHB, 10 species)

| Species | Mandatory non-skill decision | Facet today | Status |
|---|---|---|---|
| Human | Origin feat choice (count 1) | skill choice only | C-13 |
| Elf | Lineage (Drow / High / Wood), spellcasting ability | skill choice only | C-14 |
| Gnome | Lineage (Forest / Rock), spellcasting ability | none | C-15 |
| Tiefling | Legacy (Abyssal / Chthonic / Infernal), ability, resistance | none | C-16 |
| Dragonborn | Draconic ancestry (damage type) | none | C-17 |
| Goliath | Giant ancestry (1 of 6 boons) | none | C-18 |
| Aasimar | Celestial Revelation (per transformation) | none | C-19, runtime |
| Dwarf, Halfling, Orc | none (fixed traits) | none | no gap |

### 25.6 Spell Acquisition: separated primitives

The earlier "Spell Acquisition" grouping hides four engine requirements. They are separable, and
the separation changes the order of work.

1. **Spell catalogue reference with filter** (P2). A ContentRef choice over the spell catalogue
   with class list, spell level, and school filters. The data exists (`gendata-spell-source-lookup.json`,
   XPHB class and school per spell; 391 XPHB spells). Today the only content-catalogue selector is
   `category` plus `variants` (`ContentCatalogueFilter`). Blast radius: every caster's L1 cantrip and
   prepared choices, Mystic Arcanum, Bard Lore and Magical Secrets, Wizard Spell Mastery and Signature,
   the two variant Fighting Styles, Thaumaturge and Magician, Magic Initiate, the five General spell
   feats, Elf and Gnome and Tiefling lineage spells, and the subclass choice spells.
2. **Count enforcement** (P3). Cantrip and prepared counts per class and level, from the corpus tables
   (§25.10). Caster counts verified (Wizard cantrips 3→5 and prepared 4→25; Bard 2→4 and 4→22;
   Cleric 3→5 and 4→22; Druid 2→4 and 4→22; Sorcerer 4→6 and 2→22; Paladin prepared 2→15 with no
   cantrips; Ranger prepared 2→15; Warlock cantrips 2→4, prepared 2→15, plus slots). Paladin and
   Ranger start at **Level 1**, so the ledger's L1 rows for them are correct.
3. **Spellbook membership** (P3 extension). Wizard prepared spells come from a spellbook
   (Spellcasting feature, Ritual Adept). Spell Mastery and Signature Spells choose from that book.
4. **Per-level acquisition** (P3 extension). The prepared count rises at most levels (Wizard increases
   at every level from 2 to 20 except Level 12, where the count is flat at 16; all counts above). Each increase is a
   new mandatory choice unless the spell count is enforced as a maximum only. That needs a decision:
   **the corpus says "prepared", so this is a maximum to fill at each increase, not a fixed sequence**.
   Confirm the rule text in the phase before choosing the model.

Blocked (not counted as separate primitives): spell **replacement / change** (Wizard Memorize Spell,
Magical Secrets' replacement clause, Long Rest prepared changes). Optional flexibility; deferred.

### 25.7 Tools, instruments, and mixed proficiency (Crafter, Musician, Skilled)

The three do **not** need three primitives. One generic, Definition-backed proficiency choice with a
category filter and a count covers them:

- Crafter: choose 3 from the artisan's tools category.
- Musician: choose 3 from the musical instrument category.
- Skilled: choose 3 from the union of skills and tools (mixed).

All three need a proficiency vocabulary (P1) that does not exist today: the package has no
`value:tool.*`, no instrument, no gaming-set, no artisan-tool, no weapon-category, no armor-category,
and no language definitions (verified by listing `packages/eldra-dnd5e-2024/definitions.json`).
The existing choice-set machinery (`choice:skill.proficiency`, `ChoiceSet` with `from` and `count`,
Definition-path eligibility) is the right host. The only new shape is a mixed `from` (skills and
tools in one choice), which can be expressed as a union of two `from` lists if the engine supports
it; verify in the phase.

> **Corrected in §25.23:** P1 does not unlock these Backgrounds. Their Origin feats are now
> representable, but ability, equipment, and Weapon Mastery blockers keep them unavailable.

Originally written as: Unlocked by P1 alone: Artisan, Entertainer, Charlatan, Noble, Scribe (5 Backgrounds, 3 Origin
feats). Acolyte, Guide, and Sage remain blocked on Magic Initiate (P2 + P3).

### 25.8 Weapon Mastery re-audit

- **Creation**: Barbarian 2, Fighter 3, Paladin 2, Ranger 2, Rogue 2 weapon kinds at Level 1 (corpus
  text, verified for all five).
- **Class coverage**: 5 classes at Level 1. Count increases verified only for Barbarian
  (2 → 3 at L4 → 4 at L10) and Fighter (3 → 4 at L4 → 5 at L10 → 6 at L16). Paladin, Ranger, and
  Rogue increases: verify in phase.
- **Option identity**: 40 XPHB base weapons, every one with a mastery property; 8 mastery properties
  (Cleave, Graze, Nick, Push, Sap, Slow, Topple, Vex). Source: `items-base.json`. Note that
  `items.json` has no base weapons and only one mastery-bearing variant (Psychic Blade).
  Eligibility is "kinds of weapons you have proficiency with", which needs C-22 (weapon categories).
- **Persistence**: a Content-Catalogue-backed selection of weapon kinds; no existing choice type
  holds an item reference beyond inventory.
- **Re-selection**: "whenever you finish a Long Rest, you can change one" (Barbarian, Fighter) and
  "you can change the kinds you chose" (Paladin, Ranger, Rogue). **Optional.** The original legal
  answer remains legal. **Not Milestone A** (initial acquisition is Milestone A).

Initial Weapon Mastery is therefore: P1 (weapon kinds) + one additive choice per count. Replacement
is deferred.

### 25.9 Starting equipment and gold

Required for Milestone A. Every class (12) has an A/B package and `additionalFromBackground: true`.
Every XPHB background (16) has an A/B package with a gold alternative (e.g. Charlatan `value: 1500`).
The package defines no equipment grant shape (the ledger's `background:starting-equipment` row confirms).

Existing V2 inventory already solves storage: `server/utils/character-inventory.ts`
(`INVENTORY_BLOCK_KEY = 'inventory'`, own `block_instances` block), with add, equip, and attune
operations and UI. The gap is **creation grants only**:

- fixed item grants (references to base items, with quantity and display name);
- A/B package selection (a choice between two fixed bundles, plus the gold alternative);
- gold as a currency value (no currency exists in the package);
- item ContentRefs resolved against the World's bound content.

Classification: P8. Architectural risk MEDIUM. Milestone A YES. Do not describe inventory as missing.

### 25.10 Optional-feature accumulation

Metamagic and Eldritch Invocations share one shape. Both are "learn N options total from a catalogue
category, count rising by level, kept permanently, with optional prerequisites." Metamagic: 2 at L2,
2 at L10, 2 at L17 (6 total), from 10 XPHB options. Invocations: 10 picks total (1, +2, +2, +1, +1, +1,
+1, +1 at the eight increase levels), from 28 XPHB options, with prerequisites. Battle Master
maneuvers are the same shape inside a subclass.

One generic accumulating primitive covers the initial and additive acquisitions:

- a catalogue category for optional features (Metamagic, Invocations, maneuvers);
- a count that rises by level (a table or authored delta rows; the same decision as §25.6 item 4);
- option prerequisites (level, pact, spell, feat), evaluated against the derived state;
- permanence (no re-answer).

**Replacement** is separate and optional. The corpus wording for Metamagic and Invocations is
permanent: no replacement clause was found in the rule text read this pass. So replacement can be
deferred beyond Milestone A for these two. Verify in the phase.

Risk MEDIUM. Milestone A YES. Dependencies: P2 (for prerequisites that need spells) and the option
category in the catalogue.

### 25.11 Subclass-internal feature-level gating

Real count, from the XPHB subclass corpus (48 subclasses):

- **Persisted build decisions gated to a later subclass level: 8.** Champion Additional Fighting
  Style (L7, ledger), Bard Lore Magical Discoveries (L6, ledger), Battle Master Combat Superiority
  maneuvers (L3, ledger), Wild Heart Aspect of the Wilds (L6), Hunter Defensive Tactics (L7),
  Gloom Stalker Iron Mind (L7), Draconic Elemental Affinity (L6), Druid Land circle terrain (L3).
- **Ledger subclass rows that are per-use, per-rest, or per-cast (runtime, not gating): 5.** Steps of
  the Fey (L3), Fiendish Resilience (L10), The Third Eye (L10), Sculpt Spells (L6), Illusory Reality
  (L14). The 7 ledger subclass rows therefore split 2 persisted and 5 runtime.
- **Fixed spell grants gated by subclass level**: **224 entries across 29 subclasses** (L3–L19). The
  largest families: Paladin Oaths (4), Cleric Domains (4 with spells), Warlock Patrons (4), Sorcerer
  Origins (3), Druid Circles (4), Wizard Schools (fixed portions).
- **Choice spells gated by subclass level**: **48 entries across 7 subclasses** (Bard Lore; Eldritch
  Knight and Arcane Trickster; Abjurer, Diviner, Evoker, Illusionist).
- **Subclass-only casting**: Eldritch Knight and Arcane Trickster (`casterProgression 1/3`, Int).
  Needs a third-caster slot table, which the package does not define.
- **Per-use or per-rest effects (not gating)**: Divine Strike, Primal Strike, Brutal Strike, Elemental
  Burst, Elemental Epitome, Sculpt Spells, Illusory Reality, Third Eye, Fiendish Resilience, Bulwark
  of Force, Beguiling Twist, Steps of the Fey, Misty Escape, Exceptional Training, Natural Recovery.
  These are runtime (Milestone B), with the exception of the choice itself where it persists.

One generic primitive, **subclass-internal feature-level gating** (a subclass facet's own grant or
choice that activates at a level later than the subclass selection), unlocks: 8 persisted build
decisions, 224 + 48 structured spell-grant entries, the third-caster table for 2 subclasses. That is
8 + 272 + 2 rows behind one primitive. The 272 are entries, not distinct spells.

### 25.12 Mutable and re-answerable choices

| Rule | Corpus wording | Milestone A? | Reason |
|---|---|---|---|
| Weapon Mastery change | "whenever you finish a Long Rest, you can change one" (Barbarian, Fighter); "you can change the kinds" (Paladin, Ranger, Rogue) | NO | optional; initial answer stays legal |
| Fighting Style replacement | "you can replace the feat you chose" (Fighter, each level) | NO | "may" |
| Aspect of the Wilds / Defensive Tactics replacement | "you can change your choice" on rest | NO | "can" |
| Wizard Memorize Spell (L5) | swap a prepared spell | NO | optional flexibility |
| Magical Secrets replacement clause | "whenever you replace a spell prepared for this class" | NO | optional |
| Long Rest prepared-spell change (casters) | prepared list can change | NO | optional, legal state persists |
| Fiendish Resilience, Third Eye (per rest) | choose each rest | NO | runtime per rest |
| Sorcerer Metamagic / Warlock Invocations | permanent (no replacement found in text read) | — | not re-answerable; no deferral needed |

Test for classification: a rule is Milestone A **only** if a legal character cannot exist without the
re-answer. None of the rows above meets that test, so they are deferrable.

### 25.13 Blast-radius table (ranked)

Counts are real corpus rows or features. "Classes" and "Backgrounds" list only those affected.

| Rank | Primitive | Exact blockers unlocked | Classes | Backgrounds | Subclasses | Creation impact | Progression impact | Deps | Risk | Milestone A |
|---|---|---|---|---|---|---|---|---|---|---|
| 0 | **Phase 0: silent-drop guard** (no new primitive) | every ledger-blocked and NOT LISTED decision (§25.3): 25 rows | 12 | 16 | — | refuses or shows outstanding for mandatory decisions the Builder cannot answer | refuses feat selection with unrecorded nested decisions (F-01..F-04) | none | LOW | YES (correctness) |
| 1 | **P1 Proficiency vocabulary** (weapon kinds and categories, armor categories, artisan tools, instruments, gaming sets, skills+tools mixed, damage types) | C-02, C-10, C-20, C-21, C-22, C-16, C-17, P-10, P-23, P-13, F-02, F-03, F-04, Crafter, Musician, Skilled, Divine Order (Protector), Primal Order (Warden), Weapon Mastery option identity (40 weapons, 8 properties) | 12 (all, via Weapon Mastery and armor/weapon grants) | 5 unlocked directly (Artisan, Entertainer, Charlatan, Noble, Scribe) + 16 tool grants | — | 5 Backgrounds' Origin unlocked; 16 background tool grants recorded; C-02 Weapon Mastery; Divine/Primal Order half-unlocked | P-10 counts; Weapon Mastery increases | none | MEDIUM | YES |
| 2 | **P2 Spell catalogue ContentRef with class / level / school filter** | C-01, C-04 (Thaumaturge), C-05 (Magician), C-14/C-15/C-16 (lineage spells), P-02, P-07, P-14, P-15, P-17, P-27, F-01, Magic Initiate (3 Backgrounds, and the Human option), P-26 | 8 casters + Cleric/Druid option grants | 3 (Acolyte, Guide, Sage) | 7 (choice) + 29 (fixed, via P4) | every caster's L1 selection; Magic Initiate creation | all arcanum/magical-secrets/mastery picks | V1 reuse (S7) | MEDIUM | YES |
| 3 | **P3 Spell counts, spellbook, per-level acquisition** | C-01 counts, P-07, P-15, P-17, F-01 counts, P-26 counts, Magic Initiate counts | 8 casters | 3 (via Magic Initiate) | 7 | exact L1 cantrip and prepared counts | per-level prepared increases L2–L20 (8 casters × 19 increases) | P2 | MEDIUM-HIGH (the per-level model choice) | YES |
| 4 | **P4 Subclass-internal feature-level gating** | P-08, P-14, P-20, P-21, P-24, P-25, P-26 (224), P-27 (48), P-28, D-03 choices | Fighter, Rogue (EK/AT), Barbarian, Ranger, Druid, Bard, Sorcerer, Wizard, Paladin, Warlock, Cleric, Monk | — | 48 subclasses in total; 29 with fixed grants; 7 with choice spells; 2 with third-caster | none (subclass selects at L3) | 13 build decisions + 272 structured entries | P2 for catalogue refs | HIGH (activation semantics, derived slots) | YES |
| 5 | **P5 Accumulating options (catalogue category + count by level + prerequisites)** | P-05 (6 picks), P-06 (10 picks, 28 options), P-24 maneuvers | Sorcerer, Warlock, Fighter (BM) | — | Battle Master | — | Metamagic 3 levels; Invocations 8 levels; maneuvers | P2 for spell prerequisites | MEDIUM | YES |
| 6 | **P6 Feature-option choice (one of N features at a level)** | D-01, D-02, D-03/P-18, D-04/P-19, D-05/P-20, D-06/P-21 | Cleric (2), Druid (2), Barbarian (1), Ranger (1) | — | Wild Heart, Hunter | Divine Order, Primal Order at creation | Blessed Strikes L7, Elemental Fury L7, Aspect L6, Defensive Tactics L7 | P1, P2, P4 | LOW–MEDIUM | YES |
| 7 | **P7 Bounded ability distribution** (two weighted structures per Background; spellcasting-ability choose for lineages) | C-09 (16 Backgrounds × 2 structures), C-14, C-15, C-16 ability parts | 12 (every character) | 16 | — | every creation's derived ability scores | none | none | MEDIUM (extends `asi.increase` sources) | YES |
| 8 | **P8 Creation equipment grants (A/B, gold, item refs)** | C-23 (12 classes + 16 backgrounds) | 12 | 16 | — | every creation | none | P1 (weapon/armor refs) | MEDIUM | YES |
| 9 | **Species decision facets** (authoring on P1/P2/P7) | C-13, C-14, C-15, C-16, C-17, C-18 | — | — | — | 6 species | — | P1, P2, P7 | LOW (authoring) | YES |
| 10 | **Authoring-only rows** (Deft Explorer expertise L2; Barbarian Primal Knowledge L3; Ranger Iron Mind L7; Rogue Expertise L1 with Builder surface) | C-06, C-24, P-03, P-22 | Ranger, Barbarian, Rogue | — | Gloom Stalker | Rogue L1 | Ranger L2, Barbarian L3, Ranger L7 | none | LOW | YES |
| 11 | **Mutable / re-answerable choice** | C-03, P-09, P-16, P-20 replacement, P-21 replacement | 5 + Fighter + Wizard | — | Wild Heart, Hunter | — | — | — | MEDIUM | **NO** |
| 12 | **Runtime / per-use effects** | Fighting Style effects ×13, Origin effects ×6, Epic Boon effects ×11 (excluding Boon of Skill), per-use subclass features (§25.11), Aasimar Revelation | all | 8 | many | none | none | — | HIGH (combat automation) | NO |
| 13 | **Languages policy** | C-26, D-25 | several | several | — | — | — | policy decision | policy | policy |

Ranking note: P1 has the largest breadth (12 classes and 16 backgrounds touch it). P4 has the
largest count (272 entries). P2 is the largest single dependency: nothing in the caster or
spell-feat path finishes without it.

### 25.14 Dependency graph

```
Phase 0 (silent-drop guard)  ── no dependencies ──────────────────────────── must land first
   │
   ├── P1 Proficiency vocabulary ─┬── Crafter / Musician / Skilled (5 Backgrounds)
   │                              ├── background tools (16)  ──┐
   │                              ├── class tools (Bard, Monk, Rogue, Druid)
   │                              ├── armor/weapon grants (12)
   │                              ├── Weapon Mastery option identity + increases
   │                              ├── Divine Order (Protector) / Primal Order (Warden)
   │                              └── Elemental Affinity, Dragonborn, Tiefling resistance
   │
   ├── P7 Bounded ability distribution ── background ability (16), lineage ability (3)
   │
   ├── P8 Creation equipment grants ── needs P1 for weapon/armor refs
   │
   ├── P2 Spell catalogue + filters ─┬── P3 counts / spellbook / per-level
   │                                 │      ├── Mystic Arcanum (4 levels)
   │                                 │      ├── Magical Secrets (L10+)
   │                                 │      ├── Spell Mastery (L18), Signature (L20)
   │                                 │      └── Magic Initiate (3 Backgrounds, Human option)
   │                                 ├── Thaumaturge / Magician (needs P6 for Divine/Primal Order)
   │                                 ├── General spell feats (5)
   │                                 ├── lineage spells (Elf, Gnome, Tiefling)
   │                                 └── Blessed / Druidic variants (non-blocking)
   │
   ├── P4 Subclass feature-level gating ─┬── subclass fixed grants (224 entries; needs P2)
   │                                     ├── subclass choice spells (48 entries; needs P2)
   │                                     ├── Champion L7 FS
   │                                     ├── Druid Land circle choice
   │                                     ├── Aspect / Defensive Tactics (needs P6)
   │                                     ├── Eldritch Knight / Arcane Trickster slots (third-caster table)
   │                                     └── Battle Master maneuvers (needs P5)
   │
   ├── P5 Accumulating options ── Metamagic (6), Invocations (10); maneuvers (needs P4)
   │
   ├── P6 Feature-option choice ── Divine/Primal Order (creation), Blessed Strikes, Elemental Fury,
   │                               Aspect, Defensive Tactics
   │
   ├── Authoring-only (leaf): Deft Explorer (L2), Primal Knowledge (L3), Iron Mind (L7),
   │   Rogue Expertise L1 Builder surface, Epic Boon Boon of Skill nested (after P1)
   │
   └── Species facets (leaf authoring, after P1/P2/P7): Human, Elf, Gnome, Tiefling, Dragonborn, Goliath

Unlocks other primitives: P1, P2, P3, P4, P7, P6 (P6 unlocks Divine/Primal Order, which in turn
unlock Cleric/Druid creation). Leaf implementation work: species facets, authoring-only rows,
equipment grants (after P1), per-level count tables.
```

### 25.15 Critical path (ordered; each phase has an exit condition)

**Phase 0 — Silent-drop guard.** Refuse feat selection (and any creation) whose mandatory nested
decision cannot be recorded, and show each ledger-blocked decision as an outstanding Sheet item.
Recommended approval point: this changes creation behaviour and needs your decision on whether to
refuse or to allow creation with outstanding decisions. The current Sheet already reports outstanding
choices.
*Exit:* a Fey-Touched, Chef, Keen Mind, or Cleric character with Divine Order unrecorded cannot be
completed silently; the Builder and the feat-selection path both refuse, with tests for each family.

**Phase 1A — P1 Proficiency vocabulary.** Definitions for weapon kinds and categories (40 weapons,
8 mastery properties), armor categories, artisan tools, musical instruments, gaming sets, damage types.
Generic proficiency choice with a category filter, count, and optional mixed skills+tools.
*Exit:* Crafter, Musician, Skilled, Artisan, Entertainer, Charlatan, Noble, Scribe are creation-available;
all 16 background tool grants are recorded; Bard, Monk, Rogue, Druid tools recorded; Weapon Mastery L1
kinds recorded and validated; Protector and Warden grants recorded.

**Phase 1B — P7 Bounded ability distribution.** Background ability (both structures) and lineage
spellcasting-ability choices.
*Exit:* derived ability scores equal the PHB result for each of the 16 Backgrounds in a fixture matrix;
Elf, Gnome, and Tiefling spellcasting ability is recorded.

**Phase 2 — P2 Spell catalogue reference with class / level / school filters.** Reuse the existing
class-list lookup. Consolidate with the V1 path; do not add a third.
*Exit:* Wizard, Cleric, Druid, Bard, Sorcerer, Warlock, Paladin, and Ranger can each pick a legal L1
spell; an illegal class or level is refused server-side; Mystic Arcanum level filter works.

**Phase 3 — P3 Counts, spellbook, per-level acquisition.** Cantrip and prepared counts from the
corpus tables; spellbook membership for Wizard; per-level prepared increases.
*Exit:* for every caster class, the derived cantrip and prepared counts equal the corpus table at
every level 1–20; Magic Initiate (Acolyte, Guide, Sage) becomes creation-available; Wizard Spell
Mastery and Signature Spells choose from the spellbook.

**Phase 2B (parallel with Phase 3) — P6 Feature-option choice, creation half.** Divine Order and Primal
Order, with Thaumaturge and Magician depending on P2.
*Exit:* a Cleric and a Druid at L1 can complete Divine Order and Primal Order with either option.

**Phase 4 — P4 Subclass-internal feature-level gating.** Mechanism; then fixed grants (224), choice
spells (48), third-caster slots, Champion L7, Druid Land circle.
*Exit:* for each of 48 subclasses, every fixed and choice spell and every subclass build decision is
legal at its level; Eldritch Knight and Arcane Trickster compute slots from the new table.

**Phase 5 — P5 Accumulating options and P6 remainder.** Metamagic, Invocations (with prerequisites),
Battle Master maneuvers, Aspect of the Wilds, Defensive Tactics, Blessed Strikes, Elemental Fury.
*Exit:* Sorcerer reaches 6 Metamagic picks at L17; Warlock reaches 10 Invocations at L18 with each
prerequisite enforced; every L4–L20 option choice resolves.

**Phase 6 — Authoring-only and species facets.** Deft Explorer (L2), Primal Knowledge (L3), Iron Mind
(L7), Rogue Expertise L1 surface, Boon of Skill nested, six species facets, Human Origin option set
(with the 2C.3A `creationUnavailable` rule applied to feat offers).
*Exit:* each species' mandatory decision is answerable and persisted; Human's Origin choice offers
only creation-available feats.

**Phase 7 — P8 Creation equipment grants.** A/B packages and gold alternative for 12 classes and 16 backgrounds.
*Exit:* a created character's inventory matches the chosen package (verified per class and background);
gold is recorded.

**Phase 8 — Milestone A exit sweep.** Corpus-derived mandatory-decision manifest test (§25.17), all
ledger rows classified, and the polish gate (§25.18) passes.

Each phase lands under its own ledger rows and tests. No phase depends on combat automation.

### 25.16 Parallel work

Genuine parallelism after the named foundation:

- After **P1**: Weapon Mastery authoring; 16 background tool grants; Bard, Monk, Rogue, Druid tool
  choices; Divine/Primal armor-weapon options; Epic Boon Boon of Skill nested.
- After **P2**: Magic Initiate; Mystic Arcanum authoring (per-level lists); Bard Lore and Magical
  Secrets authoring; the five General spell feats; the three lineage spell lists.
- After **P4**: subclass fixed-grant authoring, which is data-only and splits by subclass (48
  subclasses, each independent); subclass choice spells; Druid Land circle.
- **Independent of P1–P5**: P7 (ability distribution) and P8 (equipment grants; weapon references
  wait for P1). Authoring-only rows (Deft Explorer, Primal Knowledge, Iron Mind).
- **Not parallel**: P3 counts depend on P2's spell references; P5 depends on P2 for prerequisites.

### 25.17 Deferred to polish (does not block Milestone A)

Runtime and automation (Milestone B):

- Fighting Style effects (13 rows) and Fighting Style replacement.
- Origin Feat effects (Alert, Tough, Healer, Lucky, Tavern Brawler, Savage Attacker).
- Epic Boon effects (11 rows, excluding Boon of Skill's nested decision).
- Per-use and per-attack subclass features (§25.11), Aasimar Revelation, and the Monk, Cleric, and
  Druid strike choices.
- Combat automation generally (damage riders, reactions, resistances, initiative).

Optional flexibility (mutable):

- Weapon Mastery change; Fighting Style replacement; Aspect and Defensive Tactics replacement;
  Memorize Spell; Magical Secrets replacement; Long Rest prepared-spell changes; per-rest choices.

Presentation and UX:

- Character Decisions / Acquired Features presentation (`.github/docs/architecture/character-decisions-presentation-backlog.md`).
- Sheet beauty pass; player-facing Level-Up Wizard (the Level Manager is an admin tool today).
- Interaction polish.

Policy (not an engine gap):

- Languages (D-25, C-26): the corpus has no structured language grant. Decide whether language choices
  are recorded as notes or a free-text field. It does not affect dice or derivations.

Other:

- Removing the two false-positive ledger rows and correcting the Invocation levels (§25.2).

### 25.18 Polish gate (objective, testable)

Eldra may declare **CHARACTER INFRASTRUCTURE COMPLETE** when every item below holds. Each is an
automated test or a recorded dry-run, not a judgement.

- **G1 — Creation, all classes.** For each of the 12 native XPHB classes, a Level 1 character can be
  created entirely in-app, with every mandatory Level 1 decision either recorded or refused. The
  test derives the decision list from the corpus (not a hand-written list).
- **G2 — Backgrounds.** Each of the 16 XPHB Backgrounds is either creation-available (its Origin feat,
  tools, ability bonus, and equipment recorded) or explicitly blocked with a reason. No Background is
  silently partial.
- **G3 — Species.** Each of the 10 XPHB species has its mandatory lineage, ancestry, origin, or ability
  decision recorded.
- **G4 — Progression to Level 20.** For each class, the derived cantrip, prepared, Invocation, Metamagic,
  maneuver, and Weapon Mastery counts equal the corpus table at every level 1–20. Every progression
  choice resolves.
- **G5 — Persistence.** A fresh reload preserves every choice made at creation and at every level
  (extend the existing round-trip tests to these rows).
- **G6 — Ledger completeness in both directions.** The structural discovery (§25.17) finds every
  mandatory decision, and every discovered decision maps to a ledger row. No row remains
  ENGINE_BLOCKED, CONTENT_BLOCKED, or NOT LISTED with Milestone A = YES.
- **G7 — Runtime exemptions are explicit.** Every non-IMPLEMENTED row is either a named runtime effect
  (Milestone B) or a named optional mutable choice, listed in one set the test checks.
- **G8 — No silent drop.** The Builder's completeness gate and the feat-selection path refuse, or
  surface as outstanding, every ledger-blocked decision (Phase 0 test).
- **G9 — Package.** Rules and Content are CURRENT with no PUBLISH_REQUIRED or REFRESH_REQUIRED action
  in the dry run; Actions None.

Until G1–G9 pass, the work is "finish infrastructure" and no Sheet beauty, Level-Up Wizard, or polish
work starts.

### 25.19 Test-suite gap

What exists: the all-class Level 1→20 progression tests (proving the engine for the choices already
implemented), Builder acceptance tests, the corpus and ledger contract tests, and persistence
round trips for Fighter, Paladin/Ranger, Origin, and Epic Boon.

What is missing, and the smallest set that would prove "any native XPHB legal character can be
represented":

1. **Structural mandatory-decision discovery test.** Generated from the corpus with the structural
   signals (options blocks, `additionalSpells`, tool and proficiency `choose`, weighted `ability`,
   `startingEquipment`, feat nested decisions). It fails if a discovered decision has no ledger row.
   This closes the discovery gap (§25.3) that the current test cannot see.
2. **Count-table test.** For each caster and each accumulating class, derived counts equal the corpus
   table at every level (§25.10). Today only slot tables are tested.
3. **Equivalence-class acceptance.** Not combinatorial. Ten representative characters, each a
   distinct equivalence class:
   - full caster (Wizard): spellbook, Spell Mastery and Signature;
   - half caster (Paladin): L1 prepared, Fighting Style variant, Weapon Mastery;
   - pact caster (Warlock): Invocations, Mystic Arcanum;
   - subclass caster (Eldritch Knight): third-caster slots, fixed grants;
   - options features (Cleric): Divine Order (both options), Blessed Strikes;
   - accumulator (Sorcerer): Metamagic at L2, L10, L17;
   - non-caster weapon class (Fighter): Weapon Mastery increases, Champion L7;
   - lineage species (Elf or Tiefling): lineage, ability, spells, resistance;
   - blocked and supported Backgrounds: one per blocker family (tool, instrument, skill-or-tool,
     spell) plus one supported with tool grants;
   - Human: the Origin option set.
4. **Silent-drop refusal tests** (Phase 0), one per family (feat nested spell, tool, armor, skill).

### 25.20 Package and verification record (this pass)

- Rules: `eldra.rules.dnd5e-2024@0.18.0`, CURRENT (no change made).
- Content: `eldra.solaris.xphb`, CURRENT (no change made).
- Actions: None.
- Writes: zero (dry run only: `pnpm packages:sync --world Solaris`).
- Tests run: ledger and origin contract tests (131 passing). No code changed. Full suite not re-run
  (no code changed in this pass).
- Application and package code: unchanged. Only this audit document was modified.

### 25.21 PHASE 0 — NO SILENT DROP + MANDATORY-DECISION DISCOVERY (2026-10-06)

Status: implemented (application and audit infrastructure). No Rules Definition, Content facet
semantics, or package version changed; `packages/eldra-dnd5e-2024` stays `0.18.0`. Package sync
dry run: Rules CURRENT, Content CURRENT, Actions None. The decision index is application metadata
generated from the corpus, not package semantics, so no package change was needed.

**Product decision (fail closed):** a character is not creation-complete or progression-complete
while a mandatory XPHB decision Eldra cannot record exists. "Cannot be completed yet" is preferred
over silently dropping a mandatory decision.

#### Architecture (three pure modules, one generated index, one generator)

| Module | Role |
|---|---|
| `app/lib/content-rules/mandatory-decisions.ts` | Structural discovery. Reads the 5etools XPHB records and yields every mandatory decision with stable identity: owner, granted-by, level, timing, family, mandatory flag, cardinality, corpus source. |
| `app/lib/content-rules/mandatory-decision-coverage.ts` | The coverage contract. Named rules classify each decision (implemented / blocked / optional / false-positive / runtime-effect) and name the ledger rows they account for. |
| `app/lib/content-rules/creation-completeness.ts` | The fail-closed authority. `creationUnresolvedDecisions` and `progressionUnresolvedDecisions` return what blocks a selection or a level range; `describeUnresolved` and `decisionPhrase` are the one wording used by the server and the Builder. |
| `scripts/content-rules/generate-mandatory-decisions.ts` + `write-mandatory-decisions.ts` | Loads the corpus and writes `app/lib/content-rules/dnd5e-2024-mandatory-decisions.json` (630 decisions). Run: `pnpm exec vite-node scripts/content-rules/write-mandatory-decisions.ts`. |

The runtime does not read `/opt/eldra/datasets` (the production image does not ship it). It reads
the committed index. A drift test fails when the committed index no longer equals a fresh detection
over the corpus, so a regeneration is always a reviewed diff.

#### Discovery contract (structure first; phrases only where no structure exists)

Structural signals, in order: explicit `options` blocks over features (refClassFeature / refFeat /
refSubclassFeature); `choose`/`any` in proficiency, tool, weapon, armor, skill, resist, weighted ability,
`additionalSpells`, A/B `startingEquipment`, and feat `anyFromCategory`; table columns (`classTableGroups`)
whose value rises by level (Cantrips, Prepared Spells, Invocations, Weapon Mastery); feature tags
(`{@filter …|feats|category=X}`, `{@filter …|optionalfeatures|…}`, `{@5etools feat|feats.html}`,
`{@variantrule Expertise}`); subclass-selection from the first subclass feature level.

Documented PHRASE exceptions (no structured form exists in the corpus): "gain two Metamagic options of
your choice from …"; "Choose one of those types"; "Choose a level 1 and a level 2 spell"; "gain a level 7
Warlock Spell of your choice"; "starts with six level 1 Wizard spells"; "Whenever you gain a Wizard level
after 1, add two … spells"; "Choose one of your skill proficiencies with which you lack Expertise";
"one other language of your choice"; "proficiency in … saving throws (your choice)"; "weapon mastery
properties of two kinds". Each is named in code with a `PHRASE` comment.

Feats granted by a background are discovered as grants (`feat-grant`) and their own nested decisions are
attributed to the granting background (`grantedBy`), so Origin acquisition sits in the same contract.

#### Mandatory versus optional (rule)

A surface is mandatory when the character cannot be legally complete without an answer. A clause that
lets the player REPLACE or CHANGE an answer already given ("you can replace", "you can change",
"whenever you … change") is an OPTIONAL `replacement` surface (`mandatory: false`) and never blocks. Proof
in the corpus: Fighting Style replacement, Weapon Mastery change, Memorize Spell, Aspect of the Wilds and
Defensive Tactics replacement, and the Long Rest prepared-spell change are all `replacement`.

#### Runtime exemption (rule)

A feature whose first sentence is a per-use trigger ("Whenever you activate…", "Once on each of your
turns…", "Whenever you finish a rest…") is a runtime effect and produces no decision. Proof: Divine Strike,
Primal Strike, Empowered Strikes, Sculpt Spells, Power of the Wilds, Steps of the Fey, Illusory Reality,
Fiendish Resilience, The Third Eye produce zero mandatory decisions (discovery suite).

#### Bidirectional coverage contract (proven, with bite)

- **A.** Every discovered decision matches exactly one coverage rule. Real corpus: 630 decisions, 0
  unclassified, 0 ambiguous. Result: 105 implemented, 490 blocked, 35 optional.
- **B.** Every rule matches at least one decision, or is an explicit `false-positive` / `runtime-effect` rule
  that matches zero by design. Every ledger row (104) is claimed by a rule, and every rule's ledger id exists.
- **Bite.** A synthetic unclassified mandatory decision violates the contract. Removing the rule that covers
  a real decision leaves it uncovered. A ledger row no rule claims violates it. A rule naming a non-existent
  ledger row violates it. All four are tests (`tests/rules/mandatory-decision-coverage.test.ts`).

False positives are represented, not buried: Steps of the Fey, Fiendish Resilience, The Third Eye,
Sculpt Spells, Illusory Reality (per-use or per-rest choices during play), Heightened Focus, Sorcery
Incarnate (no decision). Runtime effect ledger rows (Epic Boon effects ×12, Fighting Style effects ×10,
Origin feat effects ×6) are documented Milestone B accountability, not decisions.

The §25 D-01..D-25 items are regression fixtures in `tests/rules/mandatory-decision-discovery.test.ts`,
not detector inputs. All 25 are discovered. The structural pass also found decisions §25 did not list,
among them Barbarian Wild Heart's Level-3 Rage of the Wilds, Ranger Hunter's Prey at Level 3, the Wizard
spellbook (six starting spells and two per level after 1), the Warlock Mystic Arcanum at 13/15/17, feat
grants on every background, class starting equipment, and the feat skill choices (Keen Mind, Observant,
Skill Expert).

#### Enforcement points (server is authority; Builder is presentation)

- **create-v2 POST:** the species, class, background, and feats acquired at creation are checked before
  `createEntityRecord`. A blocked selection returns HTTP 400 with the decision named, and zero rows are
  written (`tests/server/api/worlds/[id]/characters/create-v2-fail-closed.test.ts`).
- **planProgression (Preview):** the levels crossed (from, to], the subclass in effect (persisted or chosen
  in this transition), and any feat acquired in this transition are checked. A crossed blocked decision makes
  the plan invalid and lists it in `plan.unresolvedDecisions`.
- **confirmProgression:** refuses with `unsupported-decision` (HTTP 409) regardless of client state, before
  any write. A crafted Confirm carrying a valid fingerprint is refused by the same plan
  (`tests/server/utils/character-progression-plan.test.ts`, PHASE 0 block).
- **Builder:** an option that owns a blocked decision is shown disabled with a plain reason. `isDraftComplete`
  and the Create gate include the same blockers, so Create stays disabled. The reason never shows a rule id,
  status word, or corpus field path (`tests/components/characters/builder/creationBlockerPresentation.test.ts`).
- **Level Manager:** a blocked plan names each unresolved decision in plain words and no longer shows the
  generic "resolve every required choice" line for a decision Eldra cannot answer.

#### Historical characters (unchanged read, tested)

Fail-closed applies to authoritative mutation only. `assembleCharacter` never calls the authority and never
writes. A historical Elf Wizard with an unrecorded lineage assembles for display, and the read path performs no
write (`tests/server/utils/character-assembly-historical-fail-closed.test.ts`). No migration, no retroactive grant.

#### Production availability impact (measured, this pass)

| Surface | Creatable under the contract | Blocked (examples and reason families) |
|---|---|---|
| Species | **3 of 10**: Dwarf, Halfling, Orc | Aasimar (fixed spell grant), Dragonborn and Tiefling (damage-type choice; Tiefling also lineage), Elf and Gnome and Goliath (lineage or ancestry), Human (Origin feat choice) |
| Classes | **0 of 12** | Every class owns a Level-1 decision Eldra cannot record: caster spell counts and spell choices (8), Weapon Mastery (5), Divine Order and Primal Order (Cleric and Druid), Rogue Expertise (Level 1), Warlock Invocations, plus fixed armor, weapon, and tool proficiency grants and starting equipment for all 12 |
| Backgrounds | **0 of 16** | Every background owns an ability score bonus and a starting-equipment choice; every background's tool proficiency (fixed or choice) is unrecordable; the 8 Origin backgrounds whose feat has a choice (Crafter, Musician, Skilled, Magic Initiate) are also blocked by that feat's choice |
| Complete species × class × background combinations | **0 of 1,920** | — |

Production-impact consequence: under the fail-closed contract, creating a native XPHB character is refused
until the blocking primitives (proficiency vocabulary, spell acquisition and counts, ability distribution,
starting equipment, option and feature choices) land. This is the product decision you approved; it is not a
defect of the contract. Level-up is refused across any level whose crossed decisions are blocked. Most caster
level-ups are blocked at Level 2 (prepared-spell increase), and a Fighter with the Battle Master subclass is
blocked at Level 3.

The earlier "supported" Origin backgrounds (Criminal, Guard, Farmer, Hermit, Merchant, Wayfarer, Sailor,
Soldier) were not creation-complete: each owns the background ability bonus and tool proficiency that the
contract now refuses. The fixed Origin feat itself is implemented (`impl:origin-fixed-feat`). Report, not
regression: the fail-closed behavior wins, as the approval states.

#### Ledger corrections in this phase

- `warlock-xphb:eldritch-invocations` levels corrected to the corpus increases: 1, 2, 5, 7, 9, 12, 15, 18
  (10 picks total). The earlier list `[1, 2, 5, 6, 7, 8, 9, 10]` was wrong.
- The discovery detector, not the ledger, now defines what exists. The ledger remains the accountability
  contract: every row is claimed by a rule, and every rule's ledger id is a real row.

#### Known residuals (stated, not hidden)

- Corpus scope is XPHB. PHB 2014 features are out of scope (e.g. Warlock Pact Boon).
- The language choices (Thieves' Cant, Deft Explorer) are discovered; the corpus has no structured species or
  background language grant, so species and background languages are not discovered (policy decision).
- Phrase exceptions (listed above) are the only prose-derived surfaces. Each is named and tested.
- Feat-granted proficiencies are fixed grants; they block only where Eldra cannot record them.
- Silent-drop of a fixed grant that is not a mandatory decision (e.g. Tough's hit point effect) remains a
  runtime-effect concern (Milestone B), not a creation blocker.

### 25.22 TEST AUTHORITY AUDIT, NO-STUB POLICY, AND THE ACCEPTED TEMPORARY STATE (2026-10-06)

**Product decisions, accepted:**

- **Option 1: the temporary creation outage is accepted.** Phase 0's fail-closed behaviour is the desired product
  behaviour. The mandatory-decision contract is not weakened, and no mandatory PHB state is exempted to restore
  availability.
- **Mandatory state is represented, not demoted.** Required fixed state (armor training, weapon proficiency,
  tool proficiency, starting state) belongs to the authoritative character record, so it is represented and
  persisted. It is not demoted to prose, notes, or non-blocking metadata. Milestone A requires mandatory character
  state to be represented and persisted, not only mandatory player clicks.
- **Silent drop is a regression.** A new mandatory XPHB decision discovered in the corpus without a classification
  fails CI. A decision classified as blocked prevents the relevant authoritative mutation. This is a permanent
  architecture invariant.

**Accepted temporary availability (real authority, derived from the corpus, `tests/lib/content-rules/creation-availability.test.ts`):**

| Measure | Baseline | Derivation |
|---|---|---|
| Species individually creation-complete | 3 of 10 | population from the corpus, each through the real authority |
| Classes creation-complete | 0 of 12 | population from the corpus |
| Backgrounds creation-complete | 0 of 16 | population from the corpus |
| Complete native species × class × background combinations | 0 of 1,920 | every combination through the real authority |

No name is hardcoded by class or background. The population is recorded in the decision index (an entity with no
decision never appears among the owners, so availability reads the population, not the owners). When a primitive
lands, the test's baseline is updated only after explaining the change. A computed result that differs from the
baseline is a STOP.

**Discovery accepted:** 630 decisions. By owner: class 356, subclass 168, background 64, feat 32, species 10. By
classification: implemented 105, blocked 490, optional 35. D-01 through D-25 are preserved as regression fixtures,
not detector inputs, and all are discovered (`tests/rules/mandatory-decision-discovery.test.ts`).

**Structural detection preserved:** options blocks; `choose` and `any` fields; proficiency, tool, weapon, armor,
skill, and resistance choices; weighted abilities; additional spells (nested innate and daily grants included);
equipment alternatives; category choices; table-count increases; feat and optional-feature tags; subclass selection.
Phrase exceptions are named and narrow (§25.21). They are not extended casually.

**Bidirectional coverage preserved** (`tests/rules/mandatory-decision-coverage.test.ts`): every decision → exactly one
rule; every rule → a real decision, or an explicit false positive or runtime effect; every ledger row → claimed by a
rule; every rule's ledger id → a real row. Bite tests: a synthetic unclassified decision fails; removing the rule for a
real decision fails; an unclaimed ledger row fails; a phantom ledger reference fails.

**False positives kept visible, as zero-match rules and not fake decisions:** Steps of the Fey, Fiendish Resilience,
The Third Eye, Sculpt Spells, Illusory Reality, Heightened Focus, Sorcery Incarnate.

**Corrected Warlock acquisition levels preserved:** Eldritch Invocations at 1, 2, 5, 7, 9, 12, 15, 18.

**Optional flexibility is non-blocking:** Fighting Style replacement, Weapon Mastery replacement, Memorize Spell,
prepared-spell replacement where optional, and Aspect and Defensive Tactics replacement. An optional replacement
does not block Milestone A, because the original legal answer may remain.

**Runtime effects are non-blocking:** runtime automation does not block legality unless it contains a mandatory
persistent character-building decision. Milestone A is character-state legality; Milestone B is automation.

#### Test authority audit: every test file that stubs or references the completeness authority

Classification is by claim, not by file name. Exactly one category per file:

- **UNIT (mechanics isolation).** May stub the authority, through the single named helper
  `tests/helpers/completeness-stub.ts`. Its assertions are about another subsystem, and it makes no claim that a real
  PHB character can be created or progressed.
- **ACCEPTANCE (production-path, real authority).** Must never stub. A test that reports production availability, or
  claims that a real character is created or progresses, is ACCEPTANCE.
- **AUTHORITY (real authority, tests the authority itself).** Counted with ACCEPTANCE: it uses the real authority and
  never stubs it.

| File | Category | Basis |
|---|---|---|
| `tests/components/characters/builder/characterBuilderSelection.test.ts` | UNIT | Builder draft and payload shape (a presentation primitive). The payload assertions use a complete draft, which real content cannot produce, so the authority is stubbed. |
| `tests/components/characters/builder/creationChoiceEligibility.test.ts` | UNIT | Choice eligibility routing. |
| `tests/server/api/worlds/[id]/characters/create-v2-fighter-mechanics.test.ts` | UNIT | Fighting Style routing, write order, and Origin routing (feat persistence). Renamed from `…-fighter-acceptance` (approved) so that the name carries no production-completeness claim. |
| `tests/server/api/worlds/[id]/characters/create-v2.post.test.ts` | UNIT | Choice validation, ability scores, health seeding, and Definition-path eligibility (the Sage fixture keeps its grants and strips only the availability declaration). |
| `tests/server/utils/character-progression-plan.test.ts` | UNIT | Plan mechanics (choice answering, plan shape, confirm writes, persistence, fingerprints). |
| `tests/server/utils/character-progression-level-1-to-20.test.ts` | UNIT | Derivation (proficiency, HP, resource thresholds), feat mechanics, Epic Boon mechanics, nested ASI, and plan contract. |
| `tests/server/utils/character-progression-all-class-subclass.test.ts` | UNIT | Subclass requirement presence and option shape. |
| `tests/server/utils/character-progression-published-package.test.ts` | UNIT | Package publication and version mechanics. |
| `tests/server/api/worlds/[id]/characters/create-v2-fail-closed.test.ts` | ACCEPTANCE | Real Elf, Fighter, Cleric, ability-bonus refusals, and all 8 creation-unavailable backgrounds refused, with zero writes. |
| `tests/server/utils/character-progression-fail-closed.test.ts` | ACCEPTANCE | Wizard Level 1→2 Preview invalid, Confirm refused (`unsupported-decision`), crafted Confirm refused, and Fighter Level 1→2 still green. |
| `tests/server/utils/character-assembly-historical-fail-closed.test.ts` | ACCEPTANCE | A historical Elf Wizard still assembles; the read path performs no write. |
| `tests/lib/content-rules/creation-availability.test.ts` | ACCEPTANCE | The real availability baseline, derived. |
| `tests/lib/content-rules/creation-completeness.test.ts` | AUTHORITY | Creation and progression answers, and the plain-words refusal wording. |
| `tests/components/characters/builder/creationBlockerPresentation.test.ts` | ACCEPTANCE | Builder presentation of real blockers, and no internal identifier in any reason. |
| `tests/rules/mandatory-decision-discovery.test.ts` | AUTHORITY | Discovery over the real corpus; D-01 to D-25; drift; mandatory versus optional; runtime exemption. |
| `tests/rules/mandatory-decision-coverage.test.ts` | AUTHORITY | The bidirectional contract, with bite tests. |
| `tests/rules/completeness-stub-policy.test.ts` | POLICY (meta) | Enforces this table in CI. |

**Corrections made in this pass** (each made after finding the problem, and verified by `git diff --numstat`):

1. The progression plan file's real-authority block (four fail-closed tests) moved out of a mechanics file into
   `character-progression-fail-closed.test.ts`, an ACCEPTANCE file with no stub. The plan file's switch is removed.
2. The Fighter file's titles claimed that real creations are "accepted through the real POST route". Retitled as
   mechanics (completeness stubbed). Its blocked-Background refusals moved to the real-authority create-v2 file.
3. The Barbarian "BOB ACCEPTANCE" describes and the "Confirm succeeds through Level 20" claim were retitled as mechanics
   (completeness stubbed). Real Barbarian progression is refused by the real authority, and the Wizard Level 1→2 real
   refusal is the production-path progression acceptance.
4. The historical-read file stubbed the authority with trap spies. It now uses the real authority. The "read never
   consults the authority" claim is a static assertion in the policy test.
5. Inline vi.mock stubs were replaced by one named helper, `tests/helpers/completeness-stub.ts`, with the boundary
   comment in each UNIT file. No "allow everything" seam exists anywhere else.
6. **Incident, recorded for the record:** during this pass I replaced stub blocks with a search that matched a later
   closing brace. Seven test files lost 989 lines. I restored them from git, which reverted only this phase's own edits
   (those files were committed at 2C.3A with no other uncommitted work), then reapplied the intended edits with asserts.
   `git diff --numstat` now shows only the intended changes. The plan file has one intended import change.

**Naming debt resolved (approved rename):** the Fighter mechanics file was renamed from `create-v2-fighter-acceptance.test.ts`
to `create-v2-fighter-mechanics.test.ts`. Its behaviour is unchanged. The policy manifest and the audit reference the new name.

#### No-stub policy (permanent)

- **UNIT** files may stub the authority, only through `tests/helpers/completeness-stub.ts`, and only for assertions about
  another subsystem. They must carry the boundary comment and must not claim that a real PHB character can be created or
  progressed.
- **ACCEPTANCE and AUTHORITY** files must use the real authority. They must never stub it, and they must never use an
  allow-everything seam.
- **The Polish Gate (G1 to G9) is ACCEPTANCE.** It MUST NEVER stub mandatory-decision discovery, mandatory-decision
  coverage, creation completeness, or progression completeness. The gate is meaningful only against production
  authority.
- `tests/rules/completeness-stub-policy.test.ts` enforces this in CI. It fails on an unlisted stub, a stale UNIT entry, an
  ACCEPTANCE file that stubs, a UNIT file without its boundary comment, an allow-everything name, or a read-path import of
  the authority. Bite-tested: inserting a real stub into an acceptance file fails CI, and the file is restored
  byte-identical.

#### Current authoritative baseline

Species 3 of 10; classes 0 of 12; backgrounds 0 of 16; complete combinations 0 of 1,920. The first Phase-0 blockers are
listed in §25.21. Expected change: these numbers improve as P1, P7, P2, and the other primitives land.

### 25.23 PROFICIENCY / TRAINING VOCABULARY + GENERIC FILTERED PROFICIENCY CHOICES (P1, 2026-10-06)

**Result.** P1 represents the proficiency state that Phase 0 identified as missing: armor, weapon, tool,
and saving-throw training, as package facts and generic filtered choices, persisted and judged by the
same authority. Creation availability did **not** move. P1 unblocks the proficiency decisions, not the
Backgrounds: every class and background still has a blocker that P1 does not own (see Remaining blockers).

**Correction to §25.7.** §25.7 says P1 alone unlocks Artisan, Entertainer, Charlatan, Noble, and Scribe.
That is false. Those Backgrounds keep their ability-bonus, equipment, and Weapon Mastery blockers, so they
remain creation-unavailable. §25.7 is not rewritten; this section supersedes it.

#### Vocabulary census (corpus-derived, XPHB)

| Family | Corpus source | Package Value form | Count |
| --- | --- | --- | --- |
| Armor training | class/species/feat `armor` (light, medium, heavy, shield) | `value:armor.<category>.proficient` | 4 |
| Weapon training | class `weapons` (simple, martial); Monk and Rogue filtered martial weapons; Tavern Brawler (improvised); Martial Weapon Training (martial) | `value:weapon.<group>.proficient` | 5 |
| Tool identities | Background/class/feat tool entries; items-base.json and items.json | `value:tool.<slug>.proficient`, one per identity | 37 (17 artisan, 10 instrument, 4 gaming-set, 6 other) |
| Skills | class/species/feat/background `skills` | `value:skill.<x>.proficient` and `.expertise` (unchanged) | 18 |
| Saving throws | class `proficiency` (12 classes); Resilient `savingThrowProficiencies` | `value:save.<x>.proficient` (unchanged singular model) | 6 |

**Semantic families are deliberately separate.** Armor training, weapon training, tool proficiency,
skill proficiency, and saving throws are different Values and never merged, even though English calls
them all "proficiency". Weapon *training* (groups) is separate from Weapon *Mastery* (kinds, §25.8).

**Why tools are Definition-backed Values, not item ContentRefs.** A tool proficiency is persistent
boolean state. Mixed skill-or-tool choices (Skilled) need every option to be a Definition id, so one
choice can target both families. An item ContentRef cannot be a skill option and would split the state.

**Languages and damage types are NOT in P1.** Languages: the corpus gives species and background
languages only as prose ("one other language of your choice"), with no structured grant, so there is no
creation-grade shape. This is a policy decision and stays blocked. Damage types (Dragonborn, Tiefling,
Elemental Affinity, Resistance) are a separate vocabulary and stay blocked.

#### State model

- **Fixed grants** are package facet grants (`{ set, to: true }`) on the class, background, or feat facet.
  Every class grants its armor, weapon, and saving-throw Values; eleven backgrounds grant a fixed tool;
  Chef, Poisoner, Heavily Armored, Lightly Armored, Moderately Armored, Martial Weapon Training, and
  Tavern Brawler grant theirs on the feat facet.
- **Choices** are package facet choices (`{ choiceSet, count, from }`) over Definition ids. The universe
  is the corpus's own list, so a facet offering a narrower or wider list does not cover the decision.
- **Answers** persist through `rules_choices` under the creation key `slot:choiceSetId`, and are judged by
  the creation-choice eligibility authority that the Builder also shows.
- **Already-owned** options are excluded by the existing Phase 2B rule (`directlyGrantedValues`). Charlatan's
  Skilled offers 55 options, 52 eligible; Deception, Sleight of Hand, and the fixed Forgery Kit are
  disabled as already acquired. The per-choice `excludeIfAlreadyActive` package flag exists but the
  creation authority reads facets only, so the global rule is what applies. Recorded, not changed here.

#### Generic choice (no bespoke pickers)

One generic `choiceSet` per proficiency decision. There is no CrafterToolPicker, MusicianPicker, or
SkilledPicker. Crafter (choose 3 of 8 artisan tools), Musician (choose 3 instruments), Skilled (choose 3
skills or tools), Artisan (choose 1 artisan tool), Bard (choose 3 instruments), and Monk (choose 1 artisan
tool or instrument) all resolve through `resolveCreationChoices`. Verified: Artisan 17 offered, Crafter 8,
Charlatan's Skilled 55 offered (52 eligible), Bard instruments 10.

#### Discovery changes (the detector was fixed, not weakened)

Discovery went from 630 to 647 decisions. Every addition is a real surface the corpus declares:

- Class saving-throw grants: 12 (one per class). Previously undiscovered.
- Skilled: the corpus key is plural (`skillToolLanguageProficiencies`, `choose` as a list). The detector
  read the singular key and found nothing. Now 4 decisions: the standalone feat plus one per granting
  Background (Charlatan, Noble, Scribe). Cardinality is the corpus count, 3.
- Resilient: a saving-throw choice (`savingThrowProficiencies`), 1 decision, blocked.
- Crafter, Musician, and class/background tool details now carry their exact tokens, so coverage checks them.

Net: 17 new decisions (12 + 1 + 4). Each is either implemented or blocked; none is dropped.

#### Coverage (the real authority decides)

`impl:proficiency-facet` matches a proficiency decision only when `proficiencyCovered` is true: the owning
facet (or, for a Background-granted feat, that Background) grants every named Value, or offers a choice whose
`from` set equals the decision's universe with the same count. `blk:feat-nested-proficiency` covers the
complement for feats. The two Background and class blocked rules were removed because after P1 they match
zero decisions, which the contract forbids; an uncovered proficiency now classifies as `unclassified` and
blocks, the fail-closed default.

Counts (Phase-0 baseline in §25.21 → P1):

| | Decisions | Implemented | Blocked | Optional |
| --- | --- | --- | --- | --- |
| Phase 0 (§25.21) | 630 | 105 | 490 | 35 |
| P1 | 647 | 176 | 436 | 35 |

Derived from the totals: 56 existing blocked decisions became implemented, 15 new decisions are
implemented (12 saves, 3 granted Skilled), and 2 new decisions are blocked (standalone Skilled and Resilient).

#### Creation availability: before and after (unchanged)

| | Before (Phase 0) | After (P1) |
| --- | --- | --- |
| Species | 3 / 10 | 3 / 10 |
| Classes | 0 / 12 | 0 / 12 |
| Backgrounds | 0 / 16 | 0 / 16 |
| Complete combinations | 0 / 1,920 | 0 / 1,920 |

Verified by `tests/lib/content-rules/creation-availability.test.ts`, which asserts exact equality with the
baseline. The movement that P1 earns is in the proficiency decisions, not the creation scoreboard.

#### Remaining blockers for the proficiency-touched Backgrounds

- Artisan, Entertainer, Charlatan, Noble, Scribe: background ability bonus (P7), background equipment,
  class starting equipment (every class), Weapon Mastery (class level 1 for Barbarian, Fighter, Paladin,
  Ranger, Rogue), and the Human Origin feat choice (species). Their Origin feat (Crafter, Musician,
  Skilled) is representable and no longer blocks them.
- Acolyte, Guide, Sage: Magic Initiate spell acquisition (P2/P3), unchanged.

#### Weapon Mastery dependency

Weapon Mastery needs weapon *kinds* (for example, a specific dagger). Kinds live in the corpus item data
(items-base.json), not in Eldra's curated content, so selecting them is a content selection expansion. That
is a STOP per the P1 scope and remains blocked. P1 weapon Values are groups (simple, martial, improvised,
martial_light, martial_finesse_light) and do not apply any mastery property.

#### Transaction safety (create-v2 POST)

The `rules_choices` creation write no longer swallows failure. Write order: entity, then catalogue_selection
(loud), then progression (loud), then ability scores (soft, unchanged), then rules_choices (loud), then
health (loud). The write sequence is not transactional. A failure after the entity exists leaves earlier
rows in place, and no rollback is claimed. The fail-loud case is tested: a failed rules_choices write
rejects the request, and no health is written after it.

#### Known discovery gap (not fixed in P1)

The Boon of Skill feat's `skillProficiencies` entry is an object with no `choose` or `any` key, so the
detector emits nothing for it. It is a pre-existing gap from Phase 0 and needs a corpus-structure review
before it is classified. It is recorded here rather than silently suppressed.

#### Package version and sync

`eldra.rules.dnd5e-2024` is bumped **0.18.0 → 0.19.0** (approved; manifest only, package id unchanged). Final dry run
`pnpm run packages:sync -- --world Solaris` (no `--apply`):

- Rules: `PUBLISH_REQUIRED`, `eldra.rules.dnd5e-2024@0.19.0` (authored version not yet published).
- Content: `REFRESH_REQUIRED` for `eldra.solaris.xphb` (compiled content differs from the published version).
- Actions: `PUBLISH_RULES`, `REFRESH_CONTENT`, `ACTIVATE_RULES`, `BIND_CONTENT`.
- Preflight (dangling references, 0.19.0 against the proposed content): zero. Every grant target, choice set,
  and offered option of the 94 facets that own a discovered decision resolves to a declared Definition
  (223 Definitions). Facets owning no decision are outside this check.
- Selection expansion: none proposed. Writes: none (dry run).

#### Armor-training prerequisite regression (proof that the armor Values participate)

`tests/server/utils/character-progression-armor-prerequisite.test.ts`, with no completeness stub. Real XPHB record:
Heavily Armored (`prerequisite: [{ level: 4, proficiency: [{ armor: "medium" }] }]`), resolved through the real
feat-mechanics resolver, judged by the real `planProgression` against the real 0.19.0 runtime. Only the class differs:

- Wizard (no medium training in its facet): Heavily Armored is offered-and-refused, reason `prerequisite-unmet`.
- Cleric (its facet grants `value:armor.medium.proficient`): Heavily Armored is offered, and not refused.

#### Architecture follow-ups (recorded, not changed in P1)

- `excludeIfAlreadyActive` is set on the P1 choice sets but is not read by the facet-only creation authority.
  Current behavior is correct: the global Phase 2B `directlyGrantedValues` rule provides the exclusion. Redesign
  of the per-choice flag is an architecture follow-up, not P1 scope.
- Boon of Skill emits no decision. A named Phase-0 discovery gap; it needs a corpus-structure review (§25.23
  "Known discovery gap") and is not fixed here.
- Weapon Mastery is a STOP boundary (see "Weapon Mastery dependency"). It requires a separate deliberate
  content-selection and weapon-identity phase. Solaris selection was not expanded.
- Languages remain a policy gap. No structured language vocabulary was invented.
- Damage types remain outside P1.

#### Deferred (reported, not in P1)

Resilient saving-throw choice (feat-nested proficiency); Keen Mind, Observant, Skill Expert, and Boon of Skill
skill choices (expertise for Skill Expert and Boon); damage-type vocabulary (Dragonborn, Tiefling, Elemental
Affinity); languages (policy); Weapon Mastery (needs selection expansion, STOP); Magic Initiate (P2/P3);
P7 ability distribution; caster counts (P3); Divine and Primal Order (P6); Rogue Level-1 Expertise picker;
Blessed and Druidic Warrior; starting equipment (P8).

#### Verification

- `pnpm run test`: all passing (see the final run recorded with this section).
- `pnpm run typecheck`: the normalized metric is the unique (file, diagnostic-code) pair count. Baseline 243,
  P1 candidate 243, new 0. Raw output (1,175 lines) carries established baseline debt and is not the metric.
  The historical 301 figure is not reproducible and is no longer reported.
- `pnpm run build`: passes.
- `git diff --check`: clean.
- `pnpm run lint`: not run; it is the accepted pre-existing configuration issue.

### 25.24 BACKGROUND ABILITY SCORE DISTRIBUTION (P7, 2026-10-07)

**Result.** All 16 native-XPHB Backgrounds' ability-distribution decision is now implemented, through
one generic bounded-distribution primitive and a dedicated `source:background.increase.*` family.
Creation availability did not move (and was not required to): every Background still has its
separate, unrelated starting-equipment blocker (P8). The meaningful P7 metric is the 16
blocked-to-implemented decisions, not the scoreboard.

#### Corpus truth (mandatory first step, verified against all 16)

Every XPHB Background's `ability` field is **two alternative modes** -- the 5etools renderer's own
"Choose one of: (a) ... (b) ..." for a length-2 `ability` array (`Renderer.getAbilityData`,
5etools-src/js/render.js) -- over the SAME three abilities: `choose.weighted` with `weights: [2, 1]`
(one ability +2, a different one +1) and `choose.weighted` with `weights: [1, 1, 1]` (all three +1).
No Background differs: every mode pair shares its three abilities, every mode totals 3, and the
largest single weight across both modes is 2. This matches §25's expected rule exactly (choose among
exactly three Background abilities, +2/+1 or +1/+1/+1), with no exception requiring a stop.

The weighted shape is unique to `backgrounds.json`; no class, species, or feat record in the corpus
uses `choose.weighted`. The per-slot semantics (5etools-src/js/statgen/statgen-ui-comp-levelone-
entitybase.js) confirm each weight is one DISTINCT ability pick, never a second weight on the same
ability within one mode -- which is why the two real outcomes are "+2 to one, +1 to a different one"
and "+1 to each of all three," never "+2 to one and +1 to the same one."

#### Raw structure -> discovery

`backgroundAbilityDistribution` (`app/lib/content-rules/mandatory-decisions.ts`) reads the two modes
directly: it requires every mode to name the same ability set and the same total, then records that
total (3, always) and the largest single weight across every mode (2, always) as the decision's
`detail` (`weighted-abilities:<abilities>;total:<n>;max:<n>`). A Background whose modes disagree
(hypothetical future content) returns `null` and is recorded as `unrecognized` -- still a decision,
still blocked, never silently dropped. The 630-decision Phase-0 artifact already discovered one
ability-distribution decision per Background (16); P7 does not add decisions, it corrects what that
decision's `detail`/cardinality says (cardinality 3, the real total, not 2, the mode COUNT) so coverage
can verify it against the facet.

#### Current V2 Builder ability-score architecture (traced before implementation)

Builder base-score method (standard array / point buy / manual) -> `draft.abilityScores` ->
create-v2 POST `abilityScores` -> `saveCharacterAbilityScores` (a separate persisted block,
unrelated to `rules_choices`) -> `buildActorState` sets `values['value:ability.<x>']` to that stored
number verbatim (`character-actor-bridge.ts`, the ONE place ability scores become Definition ids) ->
the EvaluationSession/DependencyGraph apply every active Source's `phase: 'add'` modifier on top.
**Base** is the stored number in `values['value:ability.<x>']`, read directly off ActorState, never
re-derived. **Derived** is `evaluate('value:ability.<x>', session)`, which sums base plus every
active Source targeting it. A Background increase is implemented entirely as a Source activation: it
never writes to the base block, and the architectural invariant (base + Background + ASI + Epic Boon
+ future modifiers, composing) holds by construction, not by a special case.

#### Source/modifier provenance

Reusing `source:asi.increase.<ability>` was considered and rejected. The ASI family's own ChoiceSet
(`choice:feat.asi-ability-increase`) carries `resultCap: 20`, a real ASI-specific RAW ceiling that
does not apply to a Background increase identically (see Ability cap, below); sharing the Source
would also erase provenance (a Sheet or a future audit could no longer tell a Background's +2 from an
ASI's +2 on the same ability). A new family, `source:background.increase.<ability>` (6 Sources, one
per ability, `phase: 'add'`, `value: 1`, mirroring `source:asi.increase.*`'s own shape), keeps the
identity distinct while reusing the exact same Modifier pipeline. Repeated activation (two selections
of the same option) produces two Source instances, which the existing `stack` policy sums to +2 --
proven in `tests/server/utils/character-background-ability-distribution.test.ts`.

#### The generic bounded-distribution primitive

`ChoiceSetDefinition.maxPerOption` (optional, `app/lib/rules/types.ts`): only meaningful when
`distinct: false`; the most times ONE option may appear in the answer. `choice:background.ability-
distribution` declares `count: 0` (count comes from the facet, as every ChoiceSet already does),
`distinct: false`, `maxPerOption: 2`, `effect: 'activate-source'`. Every Background facet declares one
choice over this ChoiceSet, with `count: 3` and its own three Background Sources as `from` -- no
Background-name branching anywhere in the application code.

**Proof the shape is exactly right** (`tests/rules/background-ability-distribution.test.ts`): with 3
options and `count: 3, maxPerOption: 2`, every ordering of every 3-multiset with no option above 2 is
legal, and the full legal set is exactly `{AAB, AAC, ABB, BBC, ACC, BCC, ABC}` -- 7 outcomes, which are
precisely +2/+1 (six ways: pick-2 x pick-1 over 3 options) and +1/+1/+1 (one way). `[A,A,A]` is refused
by the per-option ceiling itself, with no distribution-mode selector anywhere in the Definition or the
validator.

`validateChoiceSelection` (`app/lib/characters/rules-choices.ts`) enforces the ceiling: after the
existing count check, for `distinct === false` with `maxPerOption` set, any option appearing more
than `maxPerOption` times in the answer is rejected (`"<option>" can be selected at most N times.`).
This is the SAME function the bridge and create-v2 POST already call -- no second validator.

#### Already-active / duplicate semantics

The existing Phase 2B "already acquired" rule (`directlyGrantedValues`, a FIXED grant's target) never
applies to a repeatable Source choice: `resolveCreationChoices` now seeds its cross-choice `acquired`
set only from a `distinct` answer's selections (P7), so a Background's own repeated pick is never
treated as "already acquired" on its second occurrence, and it never excludes an unrelated choice
elsewhere either. Proven directly in the rules and Builder test files.

#### Builder: presentation, switching, validity

- **Presentation**: `declaredChoices`/`creationChoicePresentation` now carry `distinct`/`maxPerOption`
  from the package's own `ChoiceSetRule` (threaded through `BuilderCreationContext.choiceSetRule`,
  echoed by `GET /api/worlds/:id/rules/choice-options`, read from the live registry). The EXISTING
  generic picker (`CharacterChoiceSetPicker.vue`) was extended, not replaced: a `distinct: false`
  choice with `count > 1` now renders one `<select>` per slot (reusing the SAME positional draft
  helpers `CharacterProgressionPanel.vue`'s own non-distinct rendering already uses), each option
  disabled once it has reached `maxPerOption` in the OTHER slots. No `BackgroundAbilityPicker.vue` was
  created. Option labels now also resolve for Source definitions (previously Value-only), so a
  Background Source option reads its real label rather than its raw id -- a side effect that also
  improves the pre-existing ASI ability picker's labels.
- **Switching Background**: the choice's key (`background:choice:background.ability-distribution`) is
  the SAME for every Background (it names the package ChoiceSet, not the content); what changes is the
  facet's own `from` list. The EXISTING generic `pruneChoices`/`dropIllegal` path already drops any
  selected value no longer in the new Background's eligible list, so a stale distribution is pruned
  down to an incomplete (never silently "complete") answer with zero Background-specific code.
  Switching the ABILITY-SCORE METHOD never touches `draft.choices.selections`, so eligibility stays
  keyed to the selected Background alone, as required.
- **A real hazard this task's own review caught**: `setChoiceSelections` pruned with the DEFAULT
  context (no package rule) before this task, which would have silently stripped a legal repeated
  pick in the live Builder the instant it was recorded. Fixed: `setChoiceSelections` now takes the
  creation context and the page threads it through (`create-v2.vue`). Recorded here because it was a
  real correctness bug found while implementing P7, not a hypothetical.

#### Server authority -- rejection matrix

All against the SAME `validateChoiceSelection` the bridge and the Builder's own completeness check use
(`tests/rules/background-ability-distribution.test.ts`): (1) +2/+1 accepted; (2) +1/+1/+1 accepted;
(3) +3 to one ability rejected (ceiling); (4) an ability outside the Background's three rejected (not
offered); (5) too few (2) rejected; (6) too many (4) rejected; (7) malformed (non-array, non-string
entries) rejected; (8) a stale answer naming a DIFFERENT Background's abilities rejected (not offered
here); (9) an absent answer is not itself a server rejection -- `create-v2.post.ts`'s own documented
invariant ("a character may be created with its choices still outstanding... a legal state") is
preserved, unredesigned; what gates on it is the Builder's own step completeness, proven in the
Builder browser-shape test.

#### Persistence and the base-score invariant

The answer persists through the existing `rules_choices` architecture under the creation key
`background:choice:background.ability-distribution` -- no `background_abilities` block, no base-score
mutation. `tests/server/utils/character-background-ability-distribution.test.ts` proves, through the
REAL engine (RulesRegistry/DependencyGraph/EvaluationSession, no mock): after a +2/+1 and after a
+1/+1/+1 answer, `ActorState.values['value:ability.<x>']` (base) is byte-identical to what was
submitted, while `evaluate('value:ability.<x>', session)` (derived) is base plus the increase. A fresh
read with no Builder draft reproduces this from `rulesChoices` alone.

`tests/server/api/worlds/[id]/characters/create-v2-fighter-mechanics.test.ts` (UNIT, mechanics
isolation, already on the stub policy's list) proves the real CREATE route persists a +2/+1 and a
+1/+1/+1 answer through `saveCharacterRulesChoices`, and that a crafted +3 answer is rejected before
any write (entity creation included) -- labeled explicitly as mechanics isolation, since Criminal's
real-authority creation is separately refused today by starting equipment (P8), a claim this test does
not make.

#### Composition

- **ASI**: Background +2 Dex, then a later ASI +2 Dex (the real `choice:feat.asi-ability-increase`,
  attached to a test slot as a labeled mechanics-isolation fixture -- see that test file's own
  header): derived Dex is base + 4. Base stays untouched throughout.
- **Epic Boon**: Background +2 Dex composes with Boon of Fortitude's real ability-increase choice
  (`choice:feat.epic-boon-ability`, the SAME `source:asi.increase.*` family ASI uses): derived Dex
  is base + 3. Two proofs, kept distinct (each Epic Boon has its OWN permitted ability list, so
  legality is never assumed): a **corpus-legality** check, read directly from `feats.json`, that
  Boon of Fortitude's real `ability` field permits all six abilities (Dexterity included), and that
  the package's authored facet offers exactly that universe, with no widening; and a separate
  **engine-composition** check, using that real, unmodified facet (its SLOT attachment is a labeled
  test-fixture choice, not a change to its own ability list), that the Background Source family
  does not collide with or shadow the Epic Boon's.

#### Ability cap

The 2024 PHB's "none of these increases can raise a score above 20" is NOT present in the XPHB corpus
background entries (checked directly; zero matches for "above 20"/"maximum"/"exceed" in any XPHB
Background's `entries`). `resultCap` is a per-ChoiceSet, package-authored field (ASI's own is 20; Epic
Boon's own is 30) -- Background's ChoiceSet declares none, so no cap is enforced structurally for a
Background increase. This is NOT invented from memory: it is the literal absence of a structural cap
in the data this phase could find. **Reported, not fixed**: an explicit Background-specific
`resultCap` may be worth authoring later if a canonical source is found; until then, a Background
increase is capped only by the engine's own absolute `constraints.max: 30` on the ability Value
itself (unreachable in practice under standard array or point buy, reachable only with the manual
method at very high base scores).

#### Discovery and coverage

| | Decisions | Implemented | Blocked | Optional |
| --- | --- | --- | --- | --- |
| P1 (§25.23) | 647 | 176 | 436 | 35 |
| P7 | 647 | 192 | 420 | 35 |

No new decisions: this is the SAME 16 ability-distribution decisions Phase 0 already discovered,
reclassified from blocked to implemented now that the package represents them. `blk:background-
ability` (the Phase-0 blocked rule) was removed because, like P1's two removed proficiency rules, it
now matches zero decisions, which the coverage contract forbids; an unrecognized future ability
structure still falls to `unclassified` and blocks, fail-closed, unchanged.

#### Availability (unchanged, as expected)

| | Species | Classes | Backgrounds | Combinations |
| --- | --- | --- | --- | --- |
| Before P7 | 3 / 10 | 0 / 12 | 0 / 16 | 0 / 1,920 |
| After P7 | 3 / 10 | 0 / 12 | 0 / 16 | 0 / 1,920 |

Verified by the same exact-equality baseline test as P1. Every Background's remaining blocker is
starting equipment (P8), untouched and unweakened by this phase.

#### Package version and sync

Manifest stays at 0.19.0 in this pass (not bumped, per instruction). Final dry run
(`pnpm run packages:sync -- --world Solaris`, no `--apply`): Rules `SOURCE_VERSION_COLLISION`
(0.19.0 already published with different content); Content `REFRESH_REQUIRED` for
`eldra.solaris.xphb`; actions `REFRESH_CONTENT`, `BIND_CONTENT`. Preflight: zero dangling references
across 230 Definitions (223 + 6 Background Sources + 1 ChoiceSet) and the 94 facets that own a
discovered decision. No selection expansion. No mutation. Recommendation: bump to **0.20.0**
(additive -- a new optional ChoiceSet field, a new Source family, new facet choices; no existing
Definition or facet shape changed incompatibly).

#### Deferred (reported, not in P7)

Starting equipment (P8, the remaining Background blocker); Weapon Mastery (STOP, needs a content
selection/identity phase); the Background ability-increase `resultCap` gap (above); Resilient, Keen
Mind, Observant, Skill Expert, Boon of Skill (P1 deferrals, unchanged); languages and damage types
(policy gaps, unchanged); Magic Initiate (P2/P3); `excludeIfAlreadyActive` architecture cleanup (P1
deferral, unchanged).

#### Verification

- `pnpm run test`: 189 files, 3,942 tests, all passing (44 new: 23 rules, 10 Builder, 8 real-engine
  composition and corpus-legality, 3 creation-route round-trip).
- `pnpm run typecheck`: unique (file, diagnostic-code) pairs: 243 baseline, 243 candidate, 0 new.
- `pnpm run build`: passes.
- `git diff --check`: clean.
- `pnpm run lint`: not run; the accepted pre-existing configuration issue.

### 25.25 SPELL CATALOGUE + AUTHORITATIVE SPELL OPTION FILTERING (P2, 2026-10-07)

**Result.** P2 answers exactly the one question it set out to answer -- given a package-authored
spell-selection filter, which real XPHB spell ContentRefs are legal options -- and nothing more. No
mandatory decision moves blocked -> implemented. No class spell choice, Magic Initiate completion,
Mystic Arcanum acquisition, or Fighting Style cantrip exists after this phase; all of that is P3.

#### Spell data authority (mandatory first step, verified against the real corpus)

- **391 XPHB spells**, counted directly from `spells/*.json` filtered to `source === 'XPHB'` --
  matches the prior audit's figure; re-verified rather than assumed.
- **Identity**: `name`, `level` (0 cantrip, 1-9 leveled), `school` (single-letter code, e.g. `V`),
  `ritual`/`concentration` (`meta.ritual`/`meta.concentration`) are on the spell record itself.
  **Class-list membership is NOT** -- verified directly that no XPHB (or PHB) spell record carries
  an inline `classes` field; 2014's `classes.fromClassList` is gone from this corpus entirely. The
  ONLY authoritative source is the separate generated file `generated/gendata-spell-source-lookup.
  json`, keyed lowercase-source then lowercase-name, with direct membership nested under
  `.class.<SOURCE>.<ClassName>: true` (verified against Fireball, Acid Splash, Cure Wounds).
  `.subclass` in that same file is a DIFFERENT mechanic (a subclass's own always-prepared grant,
  e.g. Eldritch Knight's bonus spells) and is never merged into class-list membership -- P4's scope.
- **The eight spellcasting classes**, derived two independent ways and cross-checked rather than
  assumed: the class corpus's own `spellcastingAbility` field, and the aggregated class-list
  membership across all 391 spells. Both agree exactly: Bard, Cleric, Druid, Paladin, Ranger,
  Sorcerer, Warlock, Wizard. No discrepancy from the prior audit's "8 casters" to report.

#### Content selection -- the STOP gate did NOT trigger

Queried the LIVE `eldra.solaris.xphb` Content Pack directly (`getWorldContentCatalogue`, the real
production function, via the same local jiti/runtime-shim `scripts/directus/packages-sync.mjs`
itself uses -- no new query mechanism): **391 of 391 XPHB spells are already curated as Content
entries** (`catalogue.spells.length === 391`), accounting exactly for the Pack's own
`entryCount: 771` (10 species + 12 classes + 16 backgrounds + 77 feats + 217 items + 391 spells +
48 subclasses). Zero missing. No selection expansion was required, proposed, or made. The content-
source definition (`server/utils/content-sources/dnd5e/xphb.ts`) already lists `spells` as a full
category alongside feats/items, uniformly for every book this pipeline compiles -- not a partial or
curated subset.

#### Spell content identity

A spell's canonical identity is the SAME ContentRef (`packageId`/`slug`, `packageId::slug`
transport) every other catalogue category already uses. No `DefinitionId` was created for an
individual spell -- spells remain content entities; Rules state references them only through
ContentRefs, exactly as the architecture requires.

#### Normalized spell metadata -- reused, then extended by exactly one field

`CanonicalSpellMechanics` (`app/lib/spell-mechanics/types.ts`) already normalizes `level`, `school`
(the real label, e.g. "Evocation"), `ritual`, and `concentration`, computed unconditionally for
every spell catalogue entry by the SAME resolver the Cast action system already uses
(`resolveDnd5eSpellMechanics`, wired into `getWorldContentCatalogue` since "Character Sheet Body
Phase 1B.1"). P2 reuses this directly -- it does not duplicate it, and does not dump the raw spell
record into a RulesFacet. The one real gap, confirmed by the audit above, is class-list membership;
P2 adds exactly one additive field, `CanonicalSpellMechanics.classLists?: readonly string[]`,
sourced at Content COMPILE time (never a live corpus read at request time -- the 5etools dataset
directory is a local/CI build input; the Dockerfile-built production image ships `.output` only and
cannot read it). `server/utils/content-sources/dnd5e/5etools-dataset.ts` gained
`classListsFor`/`enrichSpellClassLists`, wired into the ONE generic collection-compile path
(`5etools-collection.ts`'s `loadCategory`) for every book's `spells` category, not an XPHB-specific
branch.

> **P2 DEPLOYMENT REQUIRES CONTENT REFRESH.** Solaris's CURRENTLY PUBLISHED spell entries (version
> 1.0.16, compiled before this phase) do not yet carry `classLists` -- the currently-published data
> predates this phase's compiled metadata. After this phase's code is deployed, `spellOptionVerdict`
> against the live catalogue fails closed on `classList` for every spell until a Content refresh
> runs (`REFRESH_CONTENT` + `BIND_CONTENT` -- see Package version and sync below). That failure
> mode is intentional and safe (absence is never treated as "matches anything" -- see Filters
> below; proven directly in both `5etools-spell-class-lists.test.ts`'s own "currently-published
> shape, pre-refresh" case and `spell-option-eligibility.test.ts`'s own "published-old-content"
> case), not a bug to work around -- it is the reason this phase did not run the refresh itself
> (dry run only).

The resolver, the type, and the compile-time code are real and tested against the real corpus;
only the already-published data has not yet picked it up.

**A pre-existing, out-of-scope finding, not fixed here, recorded as a named backlog item** (CLAUDE.md's
own "Current Technical Debt" section has the full identification: exact files, what they read, why
it is unsafe, and the desired direction): two LEGACY endpoints
(`server/api/worlds/[id]/spell-options.get.ts`, `.../class-spell-options.get.ts`) already read
`gendata-spell-source-lookup.json` LIVE, at request time, against the legacy World-Entity/
`block_instances` system (not the V2 Content Pack/ContentRef architecture this phase extends). That
only works because this dev/ops environment happens to have the dataset directory mounted; per this
project's own deployment notes, the real production container ships `.output` only, with no source
tree, so that live read would silently return `{}` (empty lookup, every call degrading to "no
options") in a true production deployment. P2 does not touch or rely on either endpoint, and does
not repeat that pattern -- the new resolver reads class-list membership only from already-compiled
Content data, never from a live corpus file.

#### Filter vocabulary (the smallest the corpus actually requires)

`SpellCatalogueFilter` (`app/lib/rules/types.ts`, alongside `ContentCatalogueFilter`, never bolted
onto it -- that type is feat vocabulary, `category`/`variants`, and stays exactly that):
`classList?: readonly string[]` (OR within itself -- any one named class is enough), `level?:
number` (exact match; cantrip is 0), `school?: string` (the real label). All declared dimensions
AND together. `ChoiceSetSelector`'s `fromContentCatalogue.filter` is now `ContentCatalogueFilter |
SpellCatalogueFilter`, chosen by the selector's own `category` ('feats' vs 'spells'), additive and
backward compatible -- every existing feat-shaped filter is still exactly one of the two union
members.

**Level**: supports exact level only (0-9), which is everything any real Milestone-A rule needs --
no range operator was added. **School**: audited the real corpus directly for a Milestone-A rule
that requires it (Eldritch Knight's and Arcane Trickster's real XPHB Spellcasting features were
checked for a school restriction; neither has one -- 2024 removed it). **No current Milestone-A
rule requires school filtering.** It is supported anyway because the metadata is already canonical
and the check is free (`mechanics.school` already existed for Cast), per this phase's own
instruction to support a cheap, already-canonical dimension generically -- never claimed as
"required" when it is not. **Deferred, not supported**: ritual, damage type, casting time,
components, concentration, source -- no Milestone-A selection rule audited here needs any of them;
adding filter vocabulary nobody needs is explicitly out of scope.

#### Category routing and the resolver

`spellOptionVerdict` (`app/lib/spell-mechanics/spell-option-eligibility.ts`) is a NEW, independent
pure function -- not bolted onto `featOptionVerdict`, mirroring its fail-closed POSTURE (absent
filter refuses, unrecognized field refuses, absent mechanics refuses) without sharing its code, for
the same reason `SpellCatalogueFilter` is a separate type from `ContentCatalogueFilter`: a spell has
no category/variant, a feat has no level/school/class-list.

`'spells'` is now a second recognized `fromContentCatalogue` destination, alongside `'feats'`, in
the ONE place that is safe to extend without deciding P3's persistence shape:
`app/lib/characters/creation-content-choices.ts`'s `resolveCreationContentChoices` (CREATION-time
only, answers persisted through the already category-agnostic `rules_choices`/`choices.selections`
mechanism -- no new persistence shape). It was deliberately NOT wired into
`character-progression-plan.ts`'s or `character-derived.ts`'s PERSISTED-ACQUISITION routing (the
branches that write a confirmed answer into `progression.feats[]`), because doing so would force
deciding the Wizard spellbook/known/prepared persistence shape -- exactly the premature design
decision this phase's own instructions require a STOP on. The pure resolver itself
(`spellOptionVerdict`, `SpellCatalogueFilter`, `CanonicalSpellMechanics.classLists`) has no
creation-vs-progression dependency; P3 can call it from either surface with no change here. An
unrecognized category still fails closed exactly as before (unchanged, verified by the existing
test asserting it).

Server authority: `create-v2.post.ts` now independently re-resolves a 'spells' choice the same way
it already does for 'feats' -- against `catalogue.spells` (the real World Content Catalogue, fetched
server-side), never a client-submitted level/class/school fact. The Builder's `creationContext` was
threaded the same real `catalogue.spells` data the page already fetches (zero added request cost --
the full catalogue, spells included, is already sent to the client today). No real facet declares a
`'spells'` choice yet, so this is proven today only through tests that declare one on a synthetic
facet -- exactly this phase's own required posture ("the underlying resolver/transport must not be
tied to one surface," never "fake a count to prove the resolver works").

#### Magic Initiate, Fighting Style cantrips, class spellcasting, Mystic Arcanum, subclass spells -- the P2/P3 boundary

Every one of these remains blocked after P2, unchanged:

- **Magic Initiate**: P2 can now answer "which cantrips are legal for Cleric/Druid/Wizard" and
  "which level-1 spells are legal for those lists" with the real resolver. It does NOT implement
  choosing two cantrips, choosing one level-1 spell, the spellcasting-ability choice, persisted
  count state, or Spell Change. Still blocked (Acolyte, Guide, Sage) -- P2/P3's own boundary,
  unchanged from P1's report.
- **Blessed Warrior / Druidic Warrior**: the legal cantrip option universe may now be knowable, but
  every nested decision still needs correct cardinality/persistence authoring (P3). Still blocked.
- **Class spellcasting** (all 8 casters): P2 solves the legal option universe per class/level/
  school. It does NOT solve count (cantrips known, spells known/prepared), known/prepared/spellbook
  state, or per-level acquisition. No class spell-count or spell-choice decision is implemented
  (verified directly: every `spell-choice`/`spell-grant`/`spell-count` decision in the census still
  classifies as blocked after this phase).
- **Mystic Arcanum**: the legal Warlock option universe by level may be resolvable; acquisition
  cadence/count/persistence remain P3 (or later). Not marked implemented.
- **Subclass spells**: P2 establishes the spell identity/filtering primitive a subclass spell grant
  would need; P4's own subclass-level gating is untouched and not implemented here.

#### Phase 0

| | Decisions | Implemented | Blocked | Optional |
| --- | --- | --- | --- | --- |
| P7 (§25.24) | 647 | 192 | 420 | 35 |
| P2 | 647 | 192 | 420 | 35 |

Unchanged, verified directly (not assumed): every `spell-choice`/`spell-grant`/`spell-count`
decision in the census still classifies `blocked`. Discovery was not suppressed or altered.

#### Availability (unchanged, as expected -- P2 is foundational, not a creation unblock)

| | Species | Classes | Backgrounds | Combinations |
| --- | --- | --- | --- | --- |
| Before P2 | 3 / 10 | 0 / 12 | 0 / 16 | 0 / 1,920 |
| After P2 | 3 / 10 | 0 / 12 | 0 / 16 | 0 / 1,920 |

#### Package version and sync

**No Rules bump.** P2 changed Rules ENGINE types (`app/lib/rules/types.ts`: the additive
`SpellCatalogueFilter` type and a widened `ChoiceSetSelector.filter` union) and application/Content-
compile code, but touched neither `packages/eldra-dnd5e-2024/definitions.json` nor `manifest.json`
-- the Rules Package's own published content is byte-identical to what is live. Verified directly,
not assumed: the dry run reports Rules **`CURRENT`** at 0.20.0, no collision. Content is
`REFRESH_REQUIRED` for `eldra.solaris.xphb` (the class-list compile-time enrichment would produce
different compiled content than the currently published version) -- actions `REFRESH_CONTENT`,
`BIND_CONTENT`. Preflight: zero dangling references across 230 Definitions (unchanged from P7) and
the 94 decision-owning facets (unchanged). No selection expansion. No mutation; dry run only.

#### Verification

- `pnpm run test`: 192 files, 3,982 tests, all passing (40 new: 5 creation-content-choices
  'spells' authority, 19 real-corpus spell-option-eligibility, 8 class-list enrichment, 5 spell
  corpus authority / Phase-0-unchanged, 3 `classLists` resolver unit).
- `pnpm run typecheck`: unique (file, diagnostic-code) pairs: 243 baseline, 243 candidate, 0 new.
- `pnpm run build`: passes.
- `git diff --check`: clean.
- `pnpm run lint`: not run; the accepted pre-existing configuration issue.

### 25.26 SPELL ACQUISITION STATE + COUNT ARCHITECTURE AUDIT (P3A, 2026-10-08)

**AUDIT ONLY. No implementation. No Rules/Content/manifest change. No commit.**

**Production state confirmed empirically** (not assumed from the prior turn's framing): the P2
Content refresh was applied out-of-band before this audit. `pnpm run packages:sync -- --world
Solaris` (dry run) reports Rules `CURRENT` at 0.20.0, Content `CURRENT` (`eldra.solaris.xphb` is
now version 1.0.17, up from 1.0.16), Actions `None`. Queried the live catalogue directly: all
391/391 XPHB spells now carry `spellMechanics.classLists` (Fireball's own live entry verified:
`classLists: ["Sorcerer","Wizard"]`). P3A's entire premise -- that canonical filtering metadata is
already live -- holds.

#### Eight-class spell model (corpus truth, not memory)

Every one of the eight classes' level-1 Spellcasting/Pact Magic feature is now a **single 2024
shape**, with the SAME structural fields on the class record itself (verified directly; no feature
text was read from memory):

| Field | What it is |
| --- | --- |
| `preparedSpellsProgression` | 20-element array, levels 1-20: the TOTAL count of leveled (level 1+) spells "on your list" at that level. Not a delta. |
| `preparedSpellsChange` | `"level"` (Bard, Sorcerer, Warlock) or `"restLong"` (Cleric, Druid, Paladin, Ranger, Wizard) -- WHEN the count-holding list's *contents* may be swapped. Governs REPLACEMENT only, never the count itself. |
| `cantripProgression` | 20-element array, levels 1-20: TOTAL cantrip count at that level. Absent for Paladin and Ranger (they get none). |
| `spellcastingAbility` | Rules Engine output already (unrelated to count). |
| `casterProgression` | `full` / `artificer` (= half, the 5etools label for the slot table) / `pact`. |

**2024 genuinely unifies "spells known" and "spells prepared" into one term and one mechanical
shape: "Prepared Spells of Level 1+".** Verified directly in every one of the eight classes' own
feature text (Bard, Cleric, Druid, Paladin, Ranger, Sorcerer, Warlock, Wizard): each says "You
prepare the list of level 1+ spells... To start, choose N spells... The number of spells on your
list increases as you gain \<Class\> levels... Whenever that number increases, choose additional
spells until the number on your list matches the number in the table." **None of the eight
mentions a spellcasting-ability-modifier term in this formula** (checked by searching every
Spellcasting/Pact Magic feature's text for "modifier"; zero matches across all eight) -- this is a
real, confirmed 2024 RAW simplification from 2014's "ability modifier + level": the table value
IS the final count, with no ability-score dependency at all. Do not reintroduce one.

What differs between classes is the ELIGIBLE POOL the N spells are drawn from, and the swap cadence:

| Class | Pool for leveled spells | Swap cadence | Cantrips | Cantrip swap cadence | Max spell level by L20 |
| --- | --- | --- | --- | --- | --- |
| Bard | Full Bard list | on level-up | 2 base, +1 at 4/10 (table) | on level-up | 9 |
| Cleric | Full Cleric list | on Long Rest | 3 base, +1 at 4/10 | on level-up | 9 |
| Druid | Full Druid list | on Long Rest | 2 base, +1 at 4/10 | on level-up | 9 |
| Paladin | Full Paladin list | on Long Rest | none | n/a | 5 |
| Ranger | Full Ranger list | on Long Rest | none | n/a | 5 |
| Sorcerer | Full Sorcerer list | on level-up | 4 base, +1 at 4/10 | on level-up | 9 |
| Warlock | Full Warlock list, level <= current Pact Magic slot level | on level-up | 2 base, +1 at 4/10 | on level-up | 9 (via Mystic Arcanum; Pact slots cap at 5) |
| Wizard | **Spellbook subset only** (not the full list) | on Long Rest | 3 base, +1 at 4/10 | on Long Rest | 9 |

Real `preparedSpellsProgression` arrays (level 1 -> 20), verified against the raw class JSON, not
retyped from memory:

```
Bard:      [4,5,6,7,9,10,11,12,14,15,16,16,17,17,18,18,19,20,21,22]
Cleric:    [4,5,6,7,9,10,11,12,14,15,16,16,17,17,18,18,19,20,21,22]
Druid:     [4,5,6,7,9,10,11,12,14,15,16,16,17,17,18,18,19,20,21,22]
Paladin:   [2,3,4,5,6,6,7,7,9,9,10,10,11,11,12,12,14,14,15,15]
Ranger:    [2,3,4,5,6,6,7,7,9,9,10,10,11,11,12,12,14,14,15,15]
Sorcerer:  [2,4,6,7,9,10,11,12,14,15,16,16,17,17,18,18,19,20,21,22]
Warlock:   [2,3,4,5,6,7,8,9,10,10,11,11,12,12,13,13,14,14,15,15]
Wizard:    [4,5,6,7,9,10,11,12,14,15,16,16,17,18,19,21,22,23,24,25]
```

Cantrip progressions (absent rows = no cantrips):

```
Bard:     [2,2,2,3,3,3,3,3,3,4,4,4,4,4,4,4,4,4,4,4]
Cleric:   [3,3,3,4,4,4,4,4,4,5,5,5,5,5,5,5,5,5,5,5]
Druid:    [2,2,2,3,3,3,3,3,3,4,4,4,4,4,4,4,4,4,4,4]
Sorcerer: [4,4,4,5,5,5,5,5,5,6,6,6,6,6,6,6,6,6,6,6]
Warlock:  [2,2,2,3,3,3,3,3,3,4,4,4,4,4,4,4,4,4,4,4]
Wizard:   [3,3,3,4,4,4,4,4,4,5,5,5,5,5,5,5,5,5,5,5]
```

Wizard-only fields: `spellsKnownProgressionFixed: [6,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2]` (the
**spellbook**, a DIFFERENT count from prepared: 6 at level 1, +2 every level after) and
`spellsKnownProgressionFixedAllowLowerLevel: true` (each addition may be of any level the Wizard can
currently cast, not only the newest). Warlock-only: `spellsKnownProgressionFixedByLevel: {"11":
{"6":1}, "13":{"7":1}, "15":{"8":1}, "17":{"9":1}}` -- Mystic Arcanum, verified against its own real
feature text: one FIXED, independent, exact-level slot per tier (level 6 at 11, 7 at 13, 8 at 15, 9
at 17), each cast once free per Long Rest, each independently replaceable "whenever you gain a
Warlock level" -- **not** part of the ordinary prepared-spell count or pool.

**Special state models, named precisely**:
- **Wizard**: two-tier gate. The SPELLBOOK (what you *know*, cumulative, never shrinks) bounds the
  PREPARED list (what you can *cast right now*, a subset of the spellbook, re-choosable every Long
  Rest). Preparing a spell NOT in the spellbook is illegal.
- **Warlock**: Pact Magic slots (already exists, unmodified by this audit) are orthogonal to spell
  identity. The ordinary prepared-list mechanic applies (pool = Warlock list, filtered to level <=
  current max Pact slot level -- itself already Rules Engine output), PLUS the four independent
  Mystic Arcanum tier-slots described above.
- **Paladin/Ranger**: ordinary full-caster shape (NOT the 2014 "half of X, round down, min 1"
  formula -- 2024 states the total directly in the table, confirmed by the table values
  themselves, e.g. Paladin L1 = 2, not "half of (1+Cha mod)"), just starting at level 1 with a
  smaller table and no cantrips.
- **Cleric/Druid/Paladin/Ranger**: `preparedSpellsChange: "restLong"` -- their day-to-day swap
  privilege is explicitly MORE flexible than Bard/Sorcerer/Warlock/Wizard's (restLong is a stronger
  swap right than Wizard's own restLong, since Wizard is pool-gated by spellbook first). This does
  NOT change what is mandatory for Milestone A (see Mandatory vs Optional below).

#### State families -- which are genuinely distinct

| Family | Distinct? | Why |
| --- | --- | --- |
| Cantrips | YES, from leveled spells | Separate count column (`cantripProgression`), separate pool rule (level 0), separate swap cadence per class (not always equal to `preparedSpellsChange`) |
| Leveled "prepared" spells (all 8 classes) | ONE family across all 8 | Identical mechanical shape (count + pool + swap cadence), differing only in which pool/cadence -- confirmed above. Modeling "known" casters and "prepared" casters as two families would be a DISTINCTION THE 2024 CORPUS ITSELF DOES NOT MAKE. |
| Wizard spellbook | YES, from prepared | A SUPERSET gate on the pool, with its OWN independent count/cadence (`spellsKnownProgressionFixed`, additive only, no swap -- it never shrinks) |
| Fixed/always-prepared grants (`additionalSpells.prepared` on the class/subclass/species/feat record) | YES, from player-chosen spells | Package-DERIVABLE facts (Druid's "speak with animals"@1, Ranger's "hunter's mark"@1, Paladin's "divine smite"@2, Bard's "power word heal/kill"@20, Warlock's "contact other plane"@9), never a player choice -- see Fixed grants below |
| Mystic Arcanum | YES, from ordinary prepared spells | Independent exact-level tier slots, not pooled against the ordinary count (confirmed above) |
| Pact Magic SLOTS (not spell identity) | Already exists, unmodified | Numeric derivation only (`table:spellcasting.slots_pact`); P3 never touches it |

Not merged merely because every value is a Spell ContentRef (per this task's own instruction): six
genuinely separate concepts, reducible to exactly **three storable shapes** (see State models below):
a bounded count-pool (cantrips, leveled prepared spells, Mystic Arcanum tiers all fit this ONE
shape with different parameters), a cumulative-only membership set (spellbook), and a derived,
unstored fact (fixed grants).

#### Current `spellcasting` block -- audited, not redesigned

**This is NOT legacy. It is the current, intentionally partial canonical store, already shaped for
exactly what P3 needs.** `app/lib/characters/spellcasting.ts`'s own header states its scope
verbatim: "Persist only: Known spells, Prepared spells, Expended spell slots... A single
`known`/`prepared` boolean pair per entry... serves every 2024 caster archetype uniformly,
deliberately not modeling the RAW distinction between 'prepares from the class list'... and
'learns a fixed number of spells'... and any enforced maximum, is a deliberate, stated absence
**this pass** rather than an oversight." That deferred enforcement is exactly P3's job.

- **Stored shape**: `{ spells: StoredSpellEntry[], expendedSlots: Record<string, number> }`.
  `StoredSpellEntry = { instanceId, ref?: {packageId, slug} | name?: string, known: boolean,
  prepared: boolean }` -- a spell is EITHER a catalogue ContentRef OR a player-typed custom name
  (mirrors `StoredInventoryItem` exactly), with two independent booleans.
- **Writers** (all in `server/utils/`): `character-spellcasting.ts`'s `saveCharacterSpellcasting`
  (full replace), called from exactly three places: `spellcasting.put.ts` (the GENERIC, UNPROTECTED
  full-replace route -- `requireCapability('world.character.edit_any')` only, zero count/level/
  class-list legality check), `character-recovery.ts` (Long/Short Rest resets `expendedSlots` only,
  read-modify-write, `spells` untouched), `character-cast.ts` (spending a slot, same read-modify-
  write, `spells` untouched). **Creation (`create-v2.post.ts`) and progression
  (`character-progression-plan.ts`'s `confirmProgression`) currently NEVER write to this block --
  confirmed by grep, zero call sites.** A brand-new character's `spells` array is `[]` until a
  player manually PUTs it.
- **Reader**: `character-assembly.ts`'s `resolveSpells(spellcasting?.spells ?? [], catalogue.spells,
  catalogue.packs)` -- the ONLY path Cast/the Sheet gets available spells from. **Confirmed: a spell
  not in `spellcasting.spells[]` is not castable, regardless of where it came from** (class choice,
  Magic Initiate, a fixed grant). This is the deciding fact for the rules_choices-vs-spell-state
  question below.
- **Slots** (`expendedSlots`) are out of scope for P3 -- already fully derived/tracked, unmodified.
- **Canonical, not legacy.** Generically writable today (no protection like `catalogue_selection`/
  `progression`). See Mutation authority below for the recommendation.

#### rules_choices vs. canonical spell state -- not every Spell ContentRef belongs in the same place

Two genuinely different concerns, both real:

- **A. The ACQUISITION DECISION** -- "which N spells, from which pool, does this choice resolve to"
  -- is a character-building CHOICE, structurally identical to every ContentRef choice P1/P2 already
  built (a package-declared ChoiceSet, `category: 'spells'`, a `SpellCatalogueFilter`, a `count`).
  Its ANSWER, while being validated/transported, is exactly `rules_choices`-shaped (a creation or
  progression key -> a list of ContentRef strings) -- no different from a feat pick.
- **B. The DURABLE OWNERSHIP RECORD** -- "which spells does this character actually have, known or
  prepared, right now" -- is NOT naturally a `rules_choices` row, because (confirmed above) Cast
  reads ONLY `spellcasting.spells[]`. A choice answer that stayed parked in `rules_choices` forever
  would be invisible to Cast and to the Sheet's spell list.

**Recommended synthesis** (not implemented in this audit): A is the TRANSPORT/validation layer at
the moment of acquisition (creation, or a progression level crossed); its CONFIRMED answer is then
APPLIED by merging it into B, the canonical `spellcasting` block -- exactly mirroring how P7's
Background ability answer is transported through `rules_choices` but takes effect by activating a
Source, except here the "effect" is a block write (spell identity is inventory-shaped, not a
numeric modifier). Magic Initiate's picks are case A at the moment of choosing, and ALSO need to
reach B (the spellcasting block) to ever be castable -- so "A vs. B" is not "either/or" per
decision, it is "A, then write-through to B" for every spell acquisition uniformly, including
Magic Initiate's.

#### Source of truth after reload, by family

| Family | Persisted record that makes it true after a hard reload |
| --- | --- |
| Leveled prepared spells (any of 8 classes) | `spellcasting.spells[]` entries with `known: true, prepared: true` (merged in by creation/progression confirm, see below) |
| Cantrips | Same store, same entries, distinguished by the spell's own `level === 0` (via `spellMechanics`), not a new field |
| Wizard spellbook | Same store; `known: true` marks spellbook membership; `prepared: true` additionally marks it as currently prepared (a spell can be `known` without `prepared`, never the reverse for Wizard) |
| Mystic Arcanum | Same store; identified by the acquiring feature/level + the spell's own level matching the tier (6/7/8/9), not a new boolean (see State models) |
| Fixed/always-prepared grants | **Derived, not persisted** -- read live from the package facet's own fixed-spell declaration at assembly time (once that facet field exists; see Fixed grants below). Stable and automatic; storing a duplicate copy risks drift the moment a package Definition changes. |
| Magic Initiate / Fey-Touched / Ritual Caster / Shadow-Touched / Telekinetic / Telepathic / Blessed-Druidic Warrior cantrips | The SAME `spellcasting.spells[]` store (so Cast can see them), reached via a nested feat ChoiceSet answer at the moment the feat is acquired, exactly like A -> B above |

No family is reconstructed from the Builder draft, from level alone, or from prose, at reload --
every mandatory family above either reads the persisted block or derives from an immutable package
fact.

#### Count tables -- can existing Rules expressions/tables encode them?

**Not cleanly, and this is a real, precisely-named blocker.** The engine's `table:` kind (Table
Definitions) is the natural fit for a 20-row, level-keyed lookup -- `table:spellcasting.slots_full`
already proves the SHAPE works for slots. But `preparedSpellsProgression`/`cantripProgression` are
PER-CLASS data (8 different 20-element arrays), and today's Rules Package convention keeps per-class
facts on the FACET (`RulesFacet`), not as 8 separate Table Definitions keyed by class. The honest
options are: (a) one Table per class (8 new Tables, mirroring the slots tables' own per-class-type
pattern, but per CLASS not per caster-TYPE, since `full`/`half`/`pact` already collapses 8 classes
into 3 slot tables, while prepared counts do NOT collapse that way -- Paladin and Ranger share a
slots type but Paladin/Ranger's prepared counts are IDENTICAL to each other but NOT to any other
class, so a `half` table would still work for exactly these two); or (b) the array lives on the
FACET itself as a new, package-authored field (mirroring how `classTableGroups`' per-class delta
rows already feed `tableCountDecisions` in discovery) and the ENGINE never evaluates it directly --
the APPLICATION layer (creation/progression, same posture as `ContentCatalogueFilter`/
`SpellCatalogueFilter`) reads it to compute the requirement. Given `SpellCatalogueFilter` and the
`'spells'` category routing already live entirely at the application layer (P2), **(b) is the
pattern already established and requires no new engine evaluator work** -- it is additive facet
authoring, not a Table-evaluator feature. No missing table-evaluation capability blocks this; the
blocker, if any, is only the AUTHORING of 8 arrays onto 8 class facets (and the half-caster/
full-caster count tables, 1-2 shared arrays for Paladin/Ranger if a shared-type pattern is
preferred) -- a small, mechanical content task, not a new engine capability.

#### Delta vs. total, and the Level 1 -> N jump requirement

`preparedSpellsProgression`/`cantripProgression` ARE total-at-level values (confirmed above, "the
number of spells on your list increases... until the number matches the number in the table").
**The generic model must therefore compute, at any target level N (never assuming sequential
one-level steps): required count = table[N]; owned count = count of entries in `spellcasting.
spells[]` matching this family's filter (class, kind); delta = required - owned, if positive.** A
Level 1 -> 8 jump (the Level Manager's own real capability) asks for exactly ONE delta computed
against table[8], not seven sequential deltas -- the SAME "resolve the whole target state at once"
posture `character-progression-plan.ts`'s existing level-jump machinery already uses for feats/ASI/
subclass selection (it already walks `step.requiredChoices` per crossed level and lets the UI/
Confirm answer them together; spell counts fit the identical per-level-row shape, one more
`requiredChoices` entry per level crossed whose `count` is that level's own delta, not a cumulative
re-ask of everything already owned). This is not a new capability to invent; it is one more
decision family flowing through the existing per-level-row walk.

#### Wizard spellbook, deep audit

- Initial size: 6 level-1 spells (mandatory, from the class's own recommended list or player choice,
  drawn from the Wizard spell list at level 1).
- Per-level addition: +2 "whenever you gain a Wizard level after 1" -- MANDATORY (a core class
  feature granting arcane-research spells, not optional flavor), cumulative, additive-only (a
  spellbook never loses an entry).
- Level restriction: each addition "must be of a level for which you have spell slots" -- i.e.,
  level <= current max castable level; `spellsKnownProgressionFixedAllowLowerLevel: true` means a
  LOWER-level spell is always a legal addition too (not only the newest tier).
- Preparation's relation to the spellbook: preparation CHOOSES a subset of the spellbook (never
  spells outside it) up to `preparedSpellsProgression[level]`; the spellbook membership is the
  SUPERSET gate, preparation the subset, exactly the two-tier model named above.
- **Milestone A boundary, as instructed**: spellbook ACQUISITION (which spells got written into the
  book, growing by the mandatory +2/level formula) is MANDATORY and must be persisted and validated.
  Day-to-day PREPARATION changes (swapping which spellbook entries are currently `prepared`) are
  OPTIONAL flexibility -- a Wizard whose spellbook is complete and whose CURRENT prepared set is any
  legal subset of it is already a legally complete character; which specific subset is prepared
  right now does not block Milestone A.

#### Cleric / Druid -- is day-to-day preparation deferrable?

**Yes, with the SAME mandatory/optional split as every other prepared caster, confirmed by the
corpus's own two-feature structure.** "Prepared Spells of Level 1+" (the COUNT, growing with level)
is one feature; "Changing Your Prepared Spells" (the SWAP privilege, gated on Long Rest for both) is
a SEPARATE, later feature in the same text block. The corpus itself draws this exact line. Cleric/
Druid need a persisted, valid, correctly-SIZED set of prepared spells to be legally complete
(MANDATORY); which Long Rest most recently changed that set, or whether it has ever been changed
since the count last grew, is never itself a legality question (OPTIONAL). No assumption was made
here -- this is the literal corpus wording.

#### Paladin / Ranger

Confirmed: both begin spellcasting at Level 1 (their own `preparedSpellsProgression[0]` is 2, not 0
or absent), no cantrips, `casterProgression: "artificer"` (5etools' own label for the half-caster
slot table), swap cadence `restLong`. Mechanically identical in SHAPE to every other prepared
caster; the only class-specific facts are the (smaller) count table and the absence of cantrips.

#### Bard / Sorcerer

Cumulative acquisition, swap cadence `level` (narrower than Cleric/Druid/Paladin/Ranger/Wizard's
`restLong` -- may only change spell identity when gaining a class level, never mid-tier). Mandatory
for Milestone A: the count and the INITIAL + cumulative choices. Optional: exercising the per-level-
up replace privilege -- an unexercised replace right never makes an otherwise-legal, correctly-sized
list illegal.

#### Warlock

Pact Magic SLOT derivation (`table:spellcasting.slots_pact`, `SLOT_TABLE_BY_CASTER_TYPE.pact`) is
unmodified and out of scope -- confirmed already fully implemented and untouched by this audit.
Missing character-BUILDING state, precisely: (1) 2 initial Warlock cantrips + 2 initial prepared
spells at level 1, both growing per their own tables; (2) the four Mystic Arcanum tier picks at
levels 11/13/15/17, each its own independent exact-level slot. Both fit the SAME generic bounded-
count-pool shape (see State models), with Mystic Arcanum needing `count: 1` per tier and an
exact-level `SpellCatalogueFilter`, not a special primitive.

#### Fixed / always-prepared spells -- derive, do not duplicate

The RAW class JSON already structurally encodes every fixed grant this audit found, under
`additionalSpells.prepared`: Druid ("speak with animals"@1, "find familiar"@2), Ranger ("hunter's
mark"@1), Paladin ("divine smite"@2, "find steed"@5), Bard ("power word heal/kill"@20), Warlock
("contact other plane"@9). **These are package-DERIVABLE, never a player choice, and never belong
in `spellcasting.spells[]` as a stored duplicate** -- preferred: derive them at assembly time from a
NEW RulesFacet field (the current facets, per the §25.21/P1 audit, do not yet encode
`additionalSpells` at all -- `blk:subclass-spells`/`blk:feat-nested-spells` are exactly the still-
blocked decisions this gap produces). Authoring that facet field is real work, but it is CONTENT
authoring (mirroring how P1 authored proficiency facets), not a new persistence concept -- it feeds
the SAME `resolveSpells` presentation path that spellcasting.spells[] already feeds, as an
ADDITIONAL, derived source, never written to the stored block.

#### P2/P3/P4/P5 boundaries, named exactly

- **P2 (done)**: legal spell OPTION universe (classList/level/school filtering). Unchanged by this
  audit.
- **P3 (this audit's target, not yet implemented)**: count requirement computation (delta vs.
  total, any level jump), canonical ownership persistence (reusing `spellcasting.spells[]`),
  creation-time and progression-time write-through from a `'spells'`-category ChoiceSet answer,
  Wizard spellbook as a second, superset state, Mystic Arcanum as 4 exact-level tier slots.
- **P4 (subclass-internal gating, untouched)**: 142 `blk:subclass-spells` + 2
  `blk:subclass-casting-class` decisions -- subclass spell grants/choices and third-caster slot
  tables. P3's state model is DESIGNED to receive a subclass grant later (the same `spellcasting.
  spells[]` entries, written by a subclass-owned `additionalSpells` facet once P4 authors it) but
  does not itself gate on subclass selection.
- **P5 (accumulator-shaped decisions, e.g. Invocations/Metamagic)**: unrelated to spells directly,
  named only because the discovery/coverage map below must not misclassify any accumulator-owned
  decision as spell-family; none of the 332 spell-family decisions are accumulator-owned.
- **Feat configuration (facet-authoring-dependent, separate from the generic P3 model)**: Magic
  Initiate, Fey-Touched, Ritual Caster, Shadow-Touched, Telekinetic, Telepathic (11 `blk:feat-
  nested-spells` decisions), Blessed Warrior/Druidic Warrior (2 `blk:feat-nested-blessed-druidic`),
  and one `blk:species-lineage` decision (a lineage-granted spell variant). Each needs its OWN
  feat/species facet declaring a nested `'spells'`-category (or variant) ChoiceSet -- the generic
  P3 model makes this POSSIBLE, but does not make any one of these 14 decisions implemented by
  itself; each needs its own facet authored. Reported as dependent follow-on content work, not
  bundled into "P3 alone."

#### Magic Initiate -- P3 boundary, explicit

P3's state model CAN support Magic Initiate's two cantrips + one level-1 spell as a nested feat
ChoiceSet (category 'spells', `SpellCatalogueFilter.classList` set to whichever of Cleric/Druid/
Wizard the player chose), with the chosen spells written through to `spellcasting.spells[]` (known:
true, prepared: true, no count-growth -- Magic Initiate grants a FIXED one-time set, not a
progression). The spellcasting-ABILITY choice for those spells is Definition-backed (an
ability-key `source:`-shaped answer, like every other ability-affecting feat pick) and is
SEPARATE from the spell-identity choice. **Not implemented here.** Still blocked; needs its own
facet (the `variant-choice` wrapping which list, plus the nested spell picks) authored as a
follow-on.

#### Blessed Warrior / Druidic Warrior

Their cantrip acquisition (one Cleric or Druid cantrip, once, fixed) fits a NESTED FEAT CHOICE
(category 'spells', `level: 0`, `classList` fixed to the Fighting Style's own named class) -- not
class spellcasting state, since it is not tied to a class's own `preparedSpellsProgression`/
`cantripProgression` at all; it is a feat-granted, one-time pick. Same write-through to
`spellcasting.spells[]` as Magic Initiate. **Not implemented here.**

#### Mystic Arcanum -- resolved above, restated for this heading

Ordinary Warlock spell ownership with SPECIAL use semantics (free cast, Long-Rest recharge, no slot
spent), **not** a separate acquired-feature state family at the STORAGE layer: it is 4 independent
`count: 1`, exact-level bounded-count-pool decisions, using the identical generic shape every other
prepared-spell decision uses. Its "specialness" (free cast, no slot) is a CAST-time concern already
unrelated to P3's acquisition/count/persistence scope.

#### Persistence model options (3 candidates, 1 recommendation)

**Model 1 -- Reuse `spellcasting.spells[]` as the single canonical store, RECOMMENDED.**
- Stored shape: unchanged (`StoredSpellEntry[]` + `expendedSlots`, already exists).
- Creation flow: `create-v2.post.ts` gains a new, protected write (after `rules_choices`, mirroring
  its existing write order) that merges the confirmed `'spells'`-category creation answers into
  `spellcasting.spells[]` via `known: true, prepared: true` entries (new function,
  `saveCharacterSpellcasting`, called where `saveCharacterHealth` already is -- same non-
  transactional posture as every other P1-era creation write).
- Progression flow: `confirmProgression` gains the same merge, for every crossed level's spell-count
  delta, after `progression`/`rules_choices`.
- Level 1->N jump: the delta model above -- one `requiredChoices` row per crossed level whose count
  is that level's own table delta, computed once against the target level, not sequentially.
- Reload: `resolveSpells` already reads this store; nothing new to build there.
- Fixed grants: derived (see above), never written here.
- Feat-granted spells (Magic Initiate, etc.): same merge target, written by the SAME mechanism once
  each feat's facet exists.
- Cast compatibility: perfect -- Cast already reads only this store; no new read path needed.
- Spellcasting-block compatibility: this IS the existing block; zero schema migration.
- Backward compatibility: perfect -- an existing character's `spells: []` or arbitrary hand-entered
  state is untouched; completeness authority treats an under-filled list as BLOCKED (same as today,
  just for a NAMED reason now), never erased or rewritten without the character owner acting.
- Pros: zero new storage concept, reuses a store already explicitly built for this, zero Cast/
  Recovery/Cast-slot regression risk (none of those three existing writers change). Cons: the
  "mandatory vs. optional" line (which entries are the REQUIRED ones vs. a GM's free-form addition)
  lives in the VALIDATION layer, not a stored flag -- acceptable, since completeness authority
  already works this way for every other family (it classifies decisions, not stored records).

**Model 2 -- A new `spellProgression` block, parallel to `spellcasting`, tracking acquisition
HISTORY (which choice granted which entry, at which level) separately from the sheet's free-form
`spellcasting.spells[]`.**
- Pros: a clean separation between "what the engine granted" and "what the player has since edited
  on the sheet" -- closer to how `catalogue_selection`/`progression` are protected and separate from
  freely-editable blocks.
- Cons: TWO stores can drift (an entry removed from `spellcasting.spells[]` by a GM edit would still
  show as "acquired" in `spellProgression`, or vice versa); Cast would need to reconcile both or
  this phase would need to decide which one Cast trusts, reopening the exact "generic PUT can
  silently diverge from engine-authoritative state" question this task flags for `spellcasting`
  itself; strictly more storage and more consumers to keep honest for no capability
  `rules_choices`-style transport-plus-merge (Model 1) doesn't already give. **Rejected**: adds a
  second source of truth the task's own instructions (and the existing architecture's precedent)
  argue against inventing without a forcing requirement, and none was found.

**Model 3 -- Keep spell answers ENTIRELY in `rules_choices`, with Cast's `resolveSpells` widened to
ALSO read resolved `rules_choices` answers directly (no write-through to `spellcasting.spells[]` at
all).**
- Pros: no new write path into `spellcasting`; reuses `rules_choices` end to end.
- Cons: **breaks the confirmed architectural fact that Cast reads only `spellcasting.spells[]`** --
  would require a NEW resolution path threading every historical creation/progression `rules_choices`
  key through Cast, duplicating/re-deriving "which choices were ever spell choices" logic that P1/P2
  already solved once for the CREATION/PROGRESSION side only; day-to-day prepared-spell SWAPS (the
  optional flexibility every class explicitly RAW-permits) would have no home at all, since
  `rules_choices` answers are keyed to a specific creation/progression DECISION, not a freely
  re-editable sheet state. **Rejected**: works against the existing Cast architecture instead of
  with it, and has no answer for day-to-day flexibility.

**Recommendation: Model 1.** It is the smallest change, reuses a store built for exactly this
purpose, and regresses nothing (Cast, Recovery, the generic PUT, and every existing consumer stay
exactly as they are; P3 only adds two NEW writers, at creation and at progression confirm).

#### Backward compatibility

An existing character with `spellcasting: null` (never saved), an empty `spells: []`, or
hand-entered historical state loads exactly as it does today -- `loadCharacterSpellcasting`'s
"absence is legal" posture is unchanged, `resolveSpells` degrades identically, and Model 1 adds no
migration (no schema change, same `StoredSpellEntry` shape). A character predating P3 simply reads
as "has fewer prepared spells than the current table requires" the moment completeness authority
starts checking it -- the SAME kind of newly-named (not newly-caused) blocker P1 and P7 already
established for proficiency and ability-distribution. No destructive migration is needed or
proposed.

#### Mutation authority

**Recommendation: do NOT protect `spellcasting.put.ts` the way `catalogue_selection`/`progression`
are protected.** Those two are IDENTITY (written once, at a specific controlled moment, never
freely re-editable). `spellcasting` is SHEET state like `inventory`/`health` -- a GM already needs
to freely add homebrew spells, correct a mis-entered prepared flag, or hand-wave an exception, and
taking that away would be a real regression with no Milestone-A benefit. Instead: creation and
progression confirm become two NEW, additional writers (read-merge-write, the exact pattern
`character-recovery.ts`/`character-cast.ts` already use for `expendedSlots`), and Phase-0
completeness authority performs READ-ONLY validation against whatever is currently stored --
exactly how every other family's authority already works (it classifies decisions by inspecting
STATE, it does not lock down every writer of that state). This also means a GM who manually
over-grants a spell through the generic PUT does not "break" anything: completeness authority
checks for AT LEAST the required count from the required pool, never an exact-match ceiling, so
extra sheet-added spells are harmless.

#### Mandatory vs. optional, classified exactly

| Decision | Classification | Why |
| --- | --- | --- |
| Initial spell/cantrip selection (any class) | **MANDATORY** | A character legally cannot exist without it; the corpus states a hard minimum count at level 1 |
| Count increases at later levels | **MANDATORY** | "Whenever that number increases, choose additional spells until the number... matches the table" -- stated as a requirement, not an option |
| Wizard spellbook additions | **MANDATORY** | A core class feature with a fixed formula (+2/level), not flavor |
| Mystic Arcanum tier acquisition | **MANDATORY** | A named, leveled class feature with a fixed schedule |
| Fixed/always-prepared grants | **MANDATORY, but AUTOMATIC** (derived, no player decision) | The corpus grants them unconditionally; nothing to persist as a player answer |
| Replacement clauses (any class's "Changing Your Prepared Spells"/cantrip replace) | **OPTIONAL FLEXIBILITY** | The corpus's own two-feature split (count feature vs. separate change feature); an unexercised replace right never makes an existing, correctly-sized, pool-valid list illegal |
| Daily/Long-Rest prepared-spell changes | **OPTIONAL FLEXIBILITY** | Same reasoning; which VALID subset is currently prepared is never itself a legality fact |
| "Memorize Spell" / any other day-to-day flavor mechanic | **OPTIONAL FLEXIBILITY** | Not found as a named XPHB mechanic in this audit under that name; if it refers to the general swap privilege, it is covered by the row above |

#### Discovery / coverage map (classifications read, not modified)

| Coverage rule | Count | Owner kind | P3 (generic model) relevance |
| --- | --- | --- | --- |
| `blk:caster-counts` | 143 | class | Directly resolved by the count/delta model |
| `blk:caster-l1-spell-choice` | 5 | class | Directly resolved (identity choice at L1) |
| `blk:class-spell-choice-other` | 22 | class | Directly resolved (identity choices beyond L1, incl. Wizard spellbook growth, Magical Secrets' broad-list cases) |
| `blk:mystic-arcanum` | 4 | class (Warlock) | Directly resolved, as 4 independent tier slots |
| `blk:feat-nested-spells` | 11 | feat | Needs the generic model PLUS per-feat facet authoring (Magic Initiate, Fey-Touched, Ritual Caster, Shadow-Touched, Telekinetic, Telepathic) |
| `blk:feat-nested-blessed-druidic` | 2 | feat | Needs the generic model PLUS facet authoring (Blessed/Druidic Warrior) |
| `blk:species-lineage` | 1 | species | Needs the generic model PLUS species facet authoring (lineage spell variant) |
| `blk:subclass-spells` | 142 | subclass | **P4's scope.** Untouched by P3. |
| `blk:subclass-casting-class` | 2 | subclass | **P4's scope.** Untouched by P3. |

Total spell-family (`spell-choice`/`spell-grant`/`spell-count`) decisions: **332** (class 174,
subclass 144, feat 13, species 1). `174 = 143 + 22 + 5 + 4` exactly -- every class-owned spell
decision accounted for. Magic Initiate's own background-granted decision is classified under
`blk:feat-nested-spells` with family `variant-choice` (choosing WHICH of Cleric/Druid/Wizard), one
level outside this family filter but blocked by the identical rule and dependent on the identical
follow-on authoring. No classification was changed to produce these counts; they are a read of the
existing, unmodified coverage map.

#### Blast radius (exact, not estimated)

**P3's generic model ALONE (no per-feat/species facet authoring) could transition exactly 174
decisions from blocked to implemented** -- every class-owned spell-family decision
(`143 + 22 + 5 + 4`), broken down:

| Class | Spell-family decisions owned |
| --- | --- |
| Bard | 2 creation-visible + its own share of the 143/22 level-walk decisions |
| Cleric | 2 creation-visible + its own share |
| Druid | 2 creation-visible + its own share |
| Paladin | 2 creation-visible + its own share |
| Ranger | 2 creation-visible + its own share |
| Sorcerer | 3 creation-visible + its own share |
| Warlock | 3 creation-visible + its own share (incl. Mystic Arcanum's 4) |
| Wizard | 3 creation-visible + its own share (incl. spellbook growth) |

(The "creation-visible" counts above are each class's own Level-1 decisions, already confirmed
individually via `creationUnresolvedDecisions`; the full 174 spans every level 1-20 row each class's
table actually changes at, listed exactly in the Eight-class matrix above.)

**NOT unlocked by P3 alone**: the 144 subclass-owned decisions (P4), and the 14 feat/species-owned
decisions (11 + 2 + 1) pending their own facet authoring -- a real, separate, smaller follow-on, not
automatically bundled into "P3."

#### Availability forecast (real authority, not a promise)

**No class becomes individually creation-complete after P3 alone.** Checked directly, per class,
what remains besides spell-family decisions:

| Class | Remaining non-spell blockers after P3 alone |
| --- | --- |
| Bard | starting equipment (P8) only |
| Cleric | starting equipment (P8), Divine Order feature-option (unrelated accumulator/option gap) |
| Druid | starting equipment (P8), Primal Order feature-option |
| Paladin | starting equipment (P8), Weapon Mastery |
| Ranger | starting equipment (P8), Weapon Mastery |
| Sorcerer | starting equipment (P8) only |
| Warlock | starting equipment (P8), Eldritch Invocations (accumulator) |
| Wizard | starting equipment (P8) only |

Every one of the 8 casters still has starting equipment (P8) blocking it at minimum; four
(Bard/Sorcerer/Wizard, and effectively Cleric/Druid once their unrelated feature-option gap is also
counted) would be down to EXACTLY ONE remaining blocker family. The three Magic-Initiate backgrounds
(Acolyte/Guide/Sage) each currently show 3 blockers (background equipment, the fixed-feat-
unsupported classification, and the feat-nested variant-choice); if Magic Initiate's OWN facet is
ALSO authored (a follow-on beyond "P3 alone," per the Boundaries section), both the origin-feat and
the nested-spell blockers would flip the same way P1's Crafter/Musician/Skilled did, leaving ONLY
background equipment. **Do not promise scoreboard movement**: the creation availability scoreboard
(species/classes/backgrounds/combinations) does NOT move after P3 alone, because equipment (P8)
independently blocks every one of the 8 casters and all 16 backgrounds regardless of spell state.
The meaningful P3 metric is the 174-decision delta above, not the scoreboard.

#### Implementation slices (derived from this audit, dependency-ordered)

1. **P3.1 -- Canonical count/pool primitive.** Author the per-class `preparedSpellsProgression`/
   `cantripProgression` arrays (and Warlock's Mystic Arcanum tiers, Wizard's spellbook increments) as
   package-authored facet data (additive facet fields, no engine change -- see Count tables above).
   Exit: every class facet carries its own real count data, verified against the corpus arrays
   above, with a bidirectional test (facet <-> corpus) mirroring every prior phase's pattern.
2. **P3.2 -- The generic bounded count-pool choice.** One new category-'spells' ChoiceSet shape per
   decision (level, count = that level's delta, `SpellCatalogueFilter` = the class's pool at that
   point), reusing P2's resolver/routing unchanged. Exit: `resolveCreationContentChoices`/
   progression's content routing offer and validate a real class's Level-1 spell choice end to end,
   proven with synthetic and real-corpus fixtures (no real facet wired yet).
3. **P3.3 -- Creation write-through.** `create-v2.post.ts` merges confirmed 'spells' answers into
   `spellcasting.spells[]` (new protected write, Model 1). Exit: a real creation round-trip (one
   class, Level 1) persists the correct prepared/cantrip set and survives reload.
4. **P3.4 -- Progression write-through + level-jump delta.** `confirmProgression` computes and
   applies the delta for every crossed level in one jump (1 -> N), not sequentially. Exit: a Level 1
   -> 8 jump test produces the exact total the table requires, in one write.
5. **P3.5 -- Phase-0 reclassification.** Flip the 174 class-owned decisions' coverage rule from
   blocked to implemented, gated on the facet data from P3.1 actually existing -- mirrors P1/P7's own
   "coverage checks the facet, not the mere existence of code" pattern exactly. Exit: discovery/
   coverage tests show exactly 174 decisions reclassified, zero elsewhere, availability scoreboard
   unchanged (equipment still blocks), both proven by test.
6. **(Follow-on, not P3 core) Feat/species facet authoring** for the 14 feat/species-owned
   decisions and fixed-grant facet authoring for the derived-grant family -- each its own small,
   independent slice once P3.1-P3.5 exist.

#### Test strategy (equivalence classes, not combinatorics)

Six equivalence classes cover every real mechanical shape found in this audit; no per-spell
combinatorial matrix is proposed:

1. **Prepared caster, Long-Rest swap** (Cleric or Druid) -- count/pool/level-jump/reload.
2. **Prepared caster, level-up-only swap** (Bard or Sorcerer) -- same, differing cadence (cadence
   itself is OPTIONAL-flexibility, so this class mainly re-proves the SAME mandatory behavior under
   a different optional rule, confirming cadence never affects legality).
3. **Wizard** (spellbook superset + prepared subset) -- the only two-tier case; prepared-outside-
   spellbook must be rejected.
4. **Half-caster starting at Level 1** (Paladin or Ranger) -- smaller table, no cantrips, confirms
   the model does not assume a caster tier starts above Level 1.
5. **Pact caster** (Warlock) -- ordinary prepared-shape spells, cantrips, AND the 4 independent
   Mystic Arcanum tier slots, proven distinct from the ordinary pool.
6. **Feat-granted spells** (a synthetic fixture mirroring Magic Initiate's shape, since no real
   facet exists yet) -- proves the SAME generic model a class uses also serves a feat-nested
   acquisition, write-through to `spellcasting.spells[]` included.

#### Package sync (dry run only, confirms the given production state)

```
RULES:    eldra.rules.dnd5e-2024@0.20.0 -- CURRENT
CONTENT:  eldra.solaris.xphb -- CURRENT (now 1.0.17; the P2 refresh ran)
ACTIONS:  None
```

No mutation. No selection expansion. Matches the expected state exactly -- no STOP condition.

### 25.27 SPELL REQUIREMENT MODEL + COUNT AUTHORITY + CANONICAL SPELL-STATE VALIDATION (P3.1, 2026-10-07)

**Implemented this pass: §25.26's planned P3.1 facet primitive, PLUS the pure validator originally
implied as "the shared authority consumed by later P3 slices."** No ChoiceSet/routing work (that
remains P3.2, unchanged below), no creation/progression writes, no mutation of the 174 class-owned
spell decisions' classification. No commit. No `packages:sync --apply`.

#### Requirement model (package data, not application branches)

One new optional field on the existing `RulesFacet` type (`app/lib/content-rules/types.ts`):
`spellRequirements?: SpellRequirement[]`, flowing through the SAME generic facet-attach pipeline
(`attachRulesFacets`, `server/utils/content-sources/dnd5e/5etools-collection.ts`) already used by
every other facet field -- zero pipeline changes, confirmed by inspection (the whole facet object is
spread onto compiled candidates verbatim).

```ts
type SpellRequirementPoolKind = 'cantrip' | 'spell' | 'spellbook' | 'arcanum'

type SpellRequirement = {
  id: DefinitionId
  pool: SpellRequirementPoolKind
  filter: SpellCatalogueFilter          // reused verbatim from P2, no new filter syntax
  totalByLevel: readonly number[]       // TOTAL at level, index 0 = level 1; never a delta
  requiresMembershipPool?: DefinitionId // Wizard-only: gates this pool by another pool's legal set
}
```

Four pool identities, not eight class branches: `cantrip` (class cantrip totals), `spell` (the
unified 2024 "Prepared Spells of Level 1+" mechanic, every leveled caster), `spellbook` (Wizard's
cumulative membership superset), `arcanum` (Warlock's four independent Mystic Arcanum tiers). All
eight classes' facets in `app/lib/content-rules/dnd5e-2024.ts` now carry a `spellRequirements` array
authored from this shape -- `grep -c "spellRequirements"` confirms exactly 8 (one per class facet).

#### Eight classes -- authored counts, re-derived from the real corpus, not the §25.26 audit's tables

A new test file, `tests/lib/content-rules/spell-requirements-corpus.test.ts` (19 tests, all passing),
reads the real class JSON directly from `/opt/eldra/datasets/5etools-src/data/class/` at test time --
never trusting §25.26's written arrays, never trusting this session's own scratch notes -- and
independently recomputes: `cantripProgression` per class (present for Bard/Cleric/Druid/Sorcerer/
Warlock/Wizard, absent for Paladin/Ranger -- re-confirmed empirically), `preparedSpellsProgression`
per class (all 8, length 20), Wizard's cumulative spellbook total from `spellsKnownProgressionFixed`'s
increment array (6 at level 1, +2/level, running sum reaching 44 at level 20), and Warlock's four
Mystic Arcanum tiers from `spellsKnownProgressionFixedByLevel` (`{11:{6:1}, 13:{7:1}, 15:{8:1},
17:{9:1}}`, each independently re-expanded into its own 20-row 0/1 `totalByLevel`). Every authored
facet array is asserted equal to this independent recomputation. All 19 pass.

#### Spell state -- `known`/`prepared` flags, audited not renamed

`spellcasting.spells[]`'s existing `StoredSpellEntry.known`/`.prepared` booleans (§25.26's confirmed
canonical, non-legacy store) are sufficient to represent every pool without a schema change:
- `spell` pool reads `prepared` -- the corpus's own verb for the unified leveled mechanic ("you
  PREPARE the list of level 1+ spells").
- `cantrip`, `spellbook`, `arcanum` pools read `known` -- the corpus's own verb ("you KNOW two
  cantrips"; spellbook/Arcanum are membership, not day-to-day preparation).
- Wizard's two-tier gate needs no third flag: a spell can be `known: true` (spellbook member) without
  `prepared: true` (currently castable), never the reverse -- exactly the existing two independent
  booleans, used as-is.
- Counting semantics, determined from corpus wording, not assumed: `cantrip`/`spell`/`arcanum` are
  EXACT-count pools (over-count is illegal, since the corpus states a fixed "number on your list");
  `spellbook` is a cumulative MINIMUM (over-count is never illegal, since spellbook entries are only
  ever added, never removed -- test 16 proves `owned=7 > required=6` still satisfied).
- The same spell ContentRef legally satisfying two pools at once (Wizard spellbook AND prepared) is
  not duplicate corruption -- each pool is evaluated with its own independent legal-identity Set;
  proven by test 18 (one Wizard's 6 spellbook entries, 4 of them also prepared, both pools satisfied
  simultaneously against their own real required counts).

#### Validator (`app/lib/characters/spell-requirements.ts`, new file)

One pure function, `validateSpellRequirements({requirements, characterLevel, candidates,
spellSlotLevels})`, returning a `SpellRequirementResult[]` (per requirement: `required`, `owned`,
`satisfied`, and a typed `issues[]` -- `missing`, `over-count`, `illegal-wrong-class-list`,
`illegal-wrong-level`, `illegal-unresolved`, `illegal-not-in-membership-pool`). Fails closed: a
candidate with no resolved `CanonicalSpellMechanics` (`illegal-unresolved`), the wrong class list or
above the legal max spell level (reusing P2's `spellOptionVerdict` for classList/level legality --
never reimplemented), or (Wizard only) a `spell`-pool candidate not already a legal `spellbook`
member, are all reported as illegal, never silently dropped or silently counted. Too few is `missing`,
never `illegal`. No `requirement.pool` outside the four known kinds is accepted (fails closed with a
full-`missing` result rather than silently passing).

- **Max selectable spell level**: derived generically as `Math.max(...spellSlotLevels.map(s =>
  s.level))` from the CALLER-supplied, already-existing `deriveSpellSlotLevels` output -- works
  uniformly for full/half casters (highest nonzero slot column) and Pact casters (the single pact
  slot's own level). No new slot table authored or duplicated; `table:spellcasting.slots_full/half/
  pact` remain the single source of truth.
- **Wizard's two-tier gate**: generic, not Wizard-specific code. A `spell`-pool requirement can name
  another requirement's id via `requiresMembershipPool`; the validator runs in two passes
  (ungated requirements first, caching each one's legal-identity Set; gated requirements second,
  looking up the real cached Set) so evaluation order in the facet array never matters. Only Wizard's
  facet actually sets the field -- the mechanism itself names no class.
- **Mystic Arcanum**: no new primitive -- each tier is an ordinary `arcanum` pool requirement with an
  exact `filter.level` and a `totalByLevel` that is 0 until its real acquisition level, then 1. Four
  instances of the one generic shape, not a special case in the validator.
- **Level-jump safety**: `required = requirement.totalByLevel[characterLevel - 1]`, a direct table
  lookup against the TARGET level only -- no sequential-level mutation assumption anywhere in the
  function. Proven at Level 1, a mid-range level, and Level 20 (tests 19-21, using Bard's real facet).
- **P2 reuse, not duplication**: `spellOptionVerdict` (P2's fail-closed classList/level/school
  resolver) is called directly for class-list and non-gated exact-level checks; the validator adds
  only the level-1..maxSpellLevel range check for gated pools and the membership-pool check, both of
  which are outside P2's own scope.
- **No mutation**: the function reads `candidates`/`requirements`/`spellSlotLevels` and returns a new
  result array; nothing it touches is written back.

#### Cast / slots -- regression status

No existing file under `server/utils/character-cast.ts`, `character-recovery.ts`, or
`app/lib/characters/spellcasting.ts`'s slot derivation was modified. `resolveSpells` (private to
`character-assembly.ts`, intentionally left unexported rather than redesigned) is unchanged. A new
test extends the PRE-EXISTING `describe('assembleCharacter -- spellcasting', ...)` block in
`tests/server/utils/character-assembly.test.ts` (test 27): a spell persisted exactly as before
(`known: true, prepared: true` in `spellcasting.spells[]`) remains visible through the real,
unmodified `assembleCharacter` entry point with `status: 'resolved'`, AND separately satisfies a
`spell`-pool `SpellRequirement` when fed through the new validator -- proving the new authority layer
sits beside Cast's existing read path without altering it. File now passes 44/44 (43 pre-existing + 1
new).

#### Historical compatibility

No migration; no automatic mutation. A character with `spellcasting: null`, an empty `spells: []`, or
hand-entered incomplete state still loads -- the validator reports `missing`/`illegal` issues without
touching stored data (tests 25-26). This is the same "newly-named, not newly-caused" blocker posture
P1/P7/§25.26 already established for proficiency, ability distribution, and spell count respectively.

#### Mutation authority -- restated, not changed

`spellcasting.put.ts` remains the generic, unprotected full-replace route; this pass does NOT add
`requireCapability`/count/legality enforcement to it. **Recorded explicitly, per instruction: this is
not a decision that the generic PUT is the final authoritative mutation API.** §25.26's Model 1 (two
NEW, additional writers at creation and progression confirm, read-merge-write, mirroring
`character-recovery.ts`/`character-cast.ts`'s existing pattern for `expendedSlots`) remains the
recommended path once P3.2-P3.4 exist; the generic PUT is not being cemented as approved architecture
by this pass's inaction on it.

#### Phase 0 -- unchanged, verified not assumed

`DND5E_2024_MANDATORY_DECISIONS.length` is still 647 (192 implemented / 420 blocked / 35 optional --
`tests/lib/content-rules/spell-corpus-authority.test.ts`'s existing assertion, re-run this pass,
unchanged). The 174 class-owned spell-family decisions (`blk:caster-counts` 143 +
`blk:class-spell-choice-other` 22 + `blk:caster-l1-spell-choice` 5 + `blk:mystic-arcanum` 4) remain
BLOCKED -- `mandatory-decisions.ts`/`mandatory-decision-coverage.ts` were not touched this pass, by
design. **The validator existing is not the same as a player being able to satisfy it**: creation and
progression still have no write path into `spellcasting.spells[]` (P3.3/P3.4, not yet built), so
completeness has nothing new to ask yet. Availability scoreboard unchanged: Species 3/10, Classes
0/12, Backgrounds 0/16, Combinations 0/1,920 (equipment, P8, still blocks every caster independently
of spell state, exactly as §25.26 forecast).

#### P3 slices -- renumbering check against §25.26's plan

§25.26 planned P3.1 as facet-authoring only. This pass delivered that PLUS the validator (originally
only implied, not its own numbered slice) -- in the user's own framing, "the shared authority
consumed by later P3 slices." The remaining slices are UNCHANGED from §25.26's own numbering, since
nothing here does their work:
- **P3.2 -- the generic bounded count-pool ChoiceSet.** One category-`'spells'` ChoiceSet shape per
  decision, reusing P2's resolver/routing unchanged, now ALSO able to call this pass's validator to
  self-check a proposed answer before it is ever offered as resolved. Not started.
- **P3.3 -- creation write-through.** `create-v2.post.ts` merges confirmed `'spells'` answers into
  `spellcasting.spells[]` (§25.26 Model 1). Not started.
- **P3.4 -- progression write-through + level-jump delta.** `confirmProgression` applies the delta for
  every crossed level in one jump. Not started. (This pass's validator computes the TARGET total, not
  a delta; P3.4 still owns `delta = target - owned`.)
- **P3.5 -- Phase-0 reclassification.** Flips the 174 decisions from blocked to implemented, gated on
  P3.3/P3.4 actually existing. Not started, and must not be started early -- explicitly not done here.

#### Package impact

`app/lib/content-rules/dnd5e-2024.ts` is Content-facet data (hand-authored, merged into compiled
Content candidates at Content Pack build time), not the Rules Package
(`packages/eldra-dnd5e-2024/definitions.json`/`manifest.json`) -- neither file was touched this pass.
Confirmed empirically, not merely by the P2-precedent reasoning in §25.25/§25.26:

```
pnpm run packages:sync -- --world Solaris   (DRY RUN, no --apply)

RULES:    eldra.rules.dnd5e-2024@0.20.0 -- CURRENT          (unchanged; definitions/manifest untouched)
CONTENT:  eldra.solaris.xphb -- REFRESH_REQUIRED            (expected: compiled candidates now carry
                                                               the new spellRequirements facet data)
ACTIONS:  REFRESH_CONTENT (eldra.solaris.xphb), BIND_CONTENT (eldra.solaris.xphb)
```

No `SOURCE_VERSION_COLLISION`, no `ERROR` -- no STOP condition. Zero Directus writes (the script
returns before any apply-path code runs when `--apply` is absent; confirmed by reading
`scripts/directus/packages-sync.mjs`'s `main()`, not merely by the printed "DRY RUN" line). **No Rules
version bump recommended** -- Rules truth did not change, only Content's compiled facet data did; the
existing `eldra.rules.dnd5e-2024@0.20.0` remains correct. Content refresh (`REFRESH_CONTENT` +
`BIND_CONTENT`) is a real, pending action but is NOT run in this pass (no `--apply` was issued).

#### Files

- Modified: `app/lib/content-rules/types.ts` (new `spellRequirements` facet field + two new exported
  types), `app/lib/content-rules/dnd5e-2024.ts` (8 class facets each gain a `spellRequirements` array),
  `tests/server/utils/character-assembly.test.ts` (one new test, existing describe block).
- Created: `app/lib/characters/spell-requirements.ts` (the validator), `tests/lib/content-rules/
  spell-requirements-corpus.test.ts` (19 tests), `tests/lib/characters/spell-requirements.test.ts`
  (26 tests).

#### Verification

`pnpm run test`: 194 files / 4030 tests passed (full suite, including the 45 new tests above and the
existing 647/192/420/35 census + availability-scoreboard assertions, all unchanged and re-passing).
`pnpm run typecheck`: 243 unique (file, diagnostic-code) pairs -- identical count to the established
baseline, zero of them in any file touched this pass (all pre-existing, unrelated to P3.1: `server/
utils/import-*.ts`, `map-data.ts`, `map-pins.ts`, `map-tiles.ts`, `players.ts`, `roll-events.ts`,
`rules-packages.ts`, `world-memberships.ts`, `world-rules-roll.ts`, `worlds.ts`, `nuxt.config.ts`).
Zero new diagnostics. `pnpm run build`: succeeds. `git diff --check`: clean, no whitespace/conflict
markers. No commit made. No `packages:sync --apply` run.

### 25.28 GENERIC SPELL ACQUISITION PLAN + MISSING-SELECTION OPTION RESOLUTION (P3.2, 2026-10-07)

**Implemented this pass: a pure acquisition PLANNER on top of P3.1's validator -- which requirements
are satisfied, how many selections are missing, which real catalogue spells would legally fill each
one, and a tentative-answer mechanism that lets a hypothetical pick for one requirement (Wizard's
spellbook) immediately feed another requirement's legality (prepared) within the SAME planning call.**
No spellcasting/rules_choices/progression writes, no Builder/Level Manager UI, no Magic Initiate/
Blessed/Druidic Warrior/subclass work, no Phase-0 reclassification. No commit. No
`packages:sync --apply`.

#### Why this never re-implements P3.1's own interpretation

`validateSpellRequirements` was NOT replaced, and its public signature/behavior is unchanged (all 89
pre-existing P3.1/Cast-regression tests re-pass, byte-for-byte, after the refactor below). Five pieces
were exported, narrowly, from `app/lib/characters/spell-requirements.ts` for the planner to reuse
directly rather than reinterpret:
- `evaluate` -- the per-requirement candidate classifier. The planner calls it TWICE per requirement:
  once (indirectly, via the new `evaluateRequirements`) against the character's EFFECTIVE state, and
  once directly against a synthetic "every catalogue entry, flags forced true" probe, to discover
  which NOT-YET-OWNED spells would be legal if selected. Same function, two different candidate lists
  -- never two different rules.
- `evaluateRequirements` -- the dependency-ordered two-pass orchestration, EXTRACTED verbatim from
  `validateSpellRequirements`'s own loop body (a pure refactor; `validateSpellRequirements` is now a
  thin wrapper: compute `maxSpellLevel`, call this, map through `toResult`). Confirms the "unknown or
  cyclic `requiresMembershipPool` reference fails closed" behavior already built into the `?? new
  Set()` fallback (see this file's own updated header) -- no separate cycle detector was needed, since
  an id that is not yet in the legal-sets map (unknown, or part of a cycle neither side resolves
  first) already produces an EMPTY membership set, and an empty set satisfies nothing.
- `toResult`, `maxSpellLevelOf`, `flagFor`, `KNOWN_POOL_KINDS` -- the remaining small, pure pieces
  the planner needed to avoid re-deriving required/owned/satisfied shaping, the slot-derived max
  level, the pool-to-flag mapping, or the fail-closed-on-unrecognized-pool rule a second time.

A new test (`spell-acquisition-plan.test.ts`'s own "agreement with P3.1's own validator" describe
block) proves the two can never disagree: with `tentative: []`, every requirement's `target`/
`legalCount`/`satisfied`/`issues` from the planner is asserted equal, field for field, to
`validateSpellRequirements`'s own `required`/`owned`/`satisfied`/`issues` for the identical
requirements/candidates/level/slots.

#### Plan model

New file `app/lib/characters/spell-acquisition-plan.ts`, one function:
```ts
function planSpellAcquisition(input: {
  requirements: readonly SpellRequirement[]
  characterLevel: number
  candidates: readonly SpellStateCandidate[]       // current effective state (persisted, + any fixed grants the caller already expresses as a candidate)
  catalogue: readonly SpellCatalogueEntry[]          // packageId/slug/title/spellMechanics -- mirrors CreationSpellEntry (P2) exactly, restated not re-exported
  spellSlotLevels: readonly SpellSlotLevel[]
  tentative?: readonly TentativeSpellSelection[]     // { requirementId, ref } -- hypothetical, not-yet-persisted answers, this call only
}): SpellAcquisitionPlan
```
`SpellAcquisitionPlan = { characterLevel, requirements: SpellAcquisitionRequirementPlan[], complete }`.
Each `SpellAcquisitionRequirementPlan` carries `requirementId`, `pool`, `target` (P3.1's `required`,
renamed for this surface), `legalCount` (P3.1's `owned`), `missing` (`max(0, target - legalCount)`),
`satisfied` (false whenever ANY issue is present, even one that doesn't affect `missing` --
no-automatic-repair, inherited from `toResult`), `selected` (P3.1 `spellIdentityOf` identities),
`options` (legal, not-yet-selected catalogue refs -- `[]` whenever `missing` is 0), and `issues`
(P3.1's own `SpellRequirementIssue` union plus two planner-only kinds: `tentative-duplicate`,
`tentative-unresolved`). `complete` is true only when every requirement is satisfied.

#### Tentative answers

A `TentativeSpellSelection` names one requirement and one catalogue `ContentRef`. Each surviving one
(not a duplicate ref for the same requirement, not an unresolved ref) becomes a synthetic
`SpellStateCandidate` carrying ONLY the flag its requirement's pool reads (`flagFor`) -- never both.
Persisted candidates and every tentative row are then merged BY IDENTITY (OR-ing `known`/`prepared`,
preferring whichever row has resolved mechanics) into the EFFECTIVE state the planner evaluates --
exactly the shape a real save into `spellcasting.spells[]` would eventually produce. A tentative
answer that is itself illegal for its requirement (wrong class list, wrong level, not in the
resulting membership pool, unresolved ContentRef) is never silently absorbed: it either never joins
the effective state (unresolved/duplicate -- a dedicated planner-only issue) or joins it and then
fails to land in that requirement's own `legal` set, surfacing as the SAME `SpellRequirementIssue`
kind P3.1 already uses (`illegal-wrong-class-list`/`illegal-wrong-level`/
`illegal-not-in-membership-pool`), attached to that identity. Purity: `candidates`/`tentative` are
only ever read, never mutated (tests 27-28).

#### Wizard dependency, within one call

Wizard's `spell` requirement names the `spellbook` requirement via `requiresMembershipPool`
(unchanged since P3.1). The planner's merge step means a TENTATIVE spellbook addition is already
part of the effective spellbook the SAME call's prepared-pool evaluation reads as its membership
gate -- no save/reload/then-prepare round trip (tests 14-18): an empty Level-1 Wizard shows a
spellbook deficit of 6 and zero prepared OPTIONS (nothing to draw from yet); six tentative spellbook
picks satisfy the spellbook AND simultaneously become legal prepared OPTIONS; a tentative prepared
pick naming a spell NOT among those six is refused with `illegal-not-in-membership-pool`; the same
spell may tentatively satisfy both pools at once (submitted as two separate tentative selections,
one per requirement id) with each pool counting it independently, never flagged as duplicate
corruption.

#### Option resolution

Options reuse `spellOptionVerdict` (via `evaluate`, unchanged since P3.1) for class-list/level
legality -- never a second filtering implementation. A spell already legally counted toward a
requirement's OWN pool is excluded from that requirement's own options (never re-offered); the SAME
spell remains a legal option for a DIFFERENT requirement it does not yet satisfy (tests 9-10, Wizard's
own spellbook-vs-prepared case). Options are computed only when `missing > 0`, matching this phase's
own CORE GOAL ("legal ContentRefs for each MISSING selection," not an open-ended enumeration of every
spell that could ever extend a cumulative-minimum pool like `spellbook`).

#### Class equivalence, level jumps, fixed grants

Tested against the REAL authored facets: a cantrip caster (Sorcerer), a non-Wizard ordinary caster
(Cleric), a Level-1 half caster (Paladin -- confirmed non-zero at Level 1, no cantrips, no 2014
"starts at Level 2" assumption anywhere in this code), and Warlock (ordinary cantrip/spell pools plus
the four independent Mystic Arcanum tiers, each appearing only once its own acquisition level is
reached via the same direct `totalByLevel[level - 1]` lookup P3.1 already uses -- never a sequential
walk, proven again directly through the planner at Level 1/8/20 on Bard's real facet). A Mystic
Arcanum pick and an ordinary Warlock spell pick, submitted as tentative answers in the SAME call,
never consume each other's counts (test 23). No real package facet authors a fixed/always-prepared
grant yet (confirmed unchanged since §25.26); two synthetic tests prove the mechanism is already
capable of receiving one as effective state (a candidate carrying the pool's OWN flag counts; one
carrying the WRONG flag never reduces `missing`) -- no code change would be needed the day a real one
is authored.

#### Proposed answer-key shape (reported, not persisted)

`spellRequirementAnswerKey(slot, at, requirement)` reuses `progressionChoiceKey` VERBATIM --
`slot`/`at` are the same creation/progression identity concepts every other Content/Definition choice
already keys by (creation: `at: CREATION_LEVEL`, exactly like `creation-content-choices.ts`'s own
`'spells'` category declarations; progression: the crossed row's own `at`), and `requirement.id` is
already a stable, package-authored `DefinitionId`. No new key-building rule, no class-name parsing,
no spell-name parsing, no persistence -- this phase only reports the shape and proves it by equality
against the existing function, it does not write anywhere.

#### P3.3 / P3.4 consumption contract

Both future surfaces consume the SAME `planSpellAcquisition` output:
- **P3.3 (creation)**: no `spellcasting` block exists yet, so `candidates: []`; `characterLevel: 1`.
  A real submitted creation answer becomes a `TentativeSpellSelection` for planning/preview, and (not
  built here) a confirmed write merges the accepted selections into a new `spellcasting.spells[]` via
  `known`/`prepared` exactly as `flagFor` already determines per pool.
- **P3.4 (progression)**: `candidates` comes from the character's real persisted
  `spellcasting.spells[]`; `characterLevel` is the TARGET level of a (possibly multi-level) jump; the
  SAME `missing`/`options` per requirement is what a Level 1->8 jump needs, computed directly against
  the target row, never per intermediate level.

Neither surface needs its own spell-legality logic; both read `SpellAcquisitionPlan.requirements[]`
and render/submit against its `options`/`missing`.

#### Phase 0 -- unchanged, verified not assumed

647 total / 192 implemented / 420 blocked / 35 optional, re-asserted by the pre-existing test, still
passing. The 174 class-owned spell-family decisions remain BLOCKED -- `mandatory-decisions.ts`/
`mandatory-decision-coverage.ts` untouched. Availability scoreboard unchanged: Species 3/10, Classes
0/12, Backgrounds 0/16, Combinations 0/1,920 (the pre-existing test for this, also re-run, still
passes). A planner existing is not a player workflow existing -- creation/progression still have no
write path into `spellcasting.spells[]` (P3.3/P3.4, not yet built).

#### Package impact

`app/lib/characters/spell-acquisition-plan.ts` and the `spell-requirements.ts` refactor are pure
application code -- no `RulesFacet` field, no Content-rule data, no Rules Package definition touched.
Confirmed empirically:
```
pnpm run packages:sync -- --world Solaris   (DRY RUN, no --apply)

RULES:    eldra.rules.dnd5e-2024@0.20.0 -- CURRENT
CONTENT:  eldra.solaris.xphb -- CURRENT
ACTIONS:  None
```
No collision, no STOP, zero writes (dry run; no `--apply` passed). Content shows `CURRENT` (not
`REFRESH_REQUIRED`, unlike P3.1's own pass) because nothing compiled into a Content candidate changed
this time -- the planner reads the SAME `spellRequirements` facet data P3.1 already authored, through
code that lives entirely outside the Content compilation pipeline.

#### Dependency topology hardening (same pass, added before acceptance)

The ORIGINAL posture ("an unknown or cyclic `requiresMembershipPool` reference falls back to an empty
membership Set, which already fails closed") was correct for PREVENTING an illegal spell selection
from becoming legal, but insufficient as a CONFIGURATION diagnostic: a malformed package declaration
looked identical to a legitimately empty, well-formed membership pool ("you have zero legal
members"), with no signal that the real problem was the requirement's own authoring, not the
character's state.

`detectRequirementTopologyIssues` (new, exported from `spell-requirements.ts`) is the smallest pure
check that closes this gap, run once per `evaluateRequirements` call, before pass 2:
- **Unknown** -- `requiresMembershipPool` names an id not present in the same requirements array.
- **Self** -- a requirement names itself.
- **Cycle** -- a bounded walk from the requirement's own id, following `requiresMembershipPool`
  pointers and recording every id seen, revisits an already-seen id. This single generic walk also
  catches a 3+-requirement cycle with no extra code (verified directly: a synthetic X->Y->Z->X chain
  flags all three), and correctly flags a requirement that merely DEPENDS on a self-referencing or
  cyclic node even when it is not itself part of the loop (the walk passes through the broken node a
  second time either way) -- no separate "propagate brokenness" step was needed; it falls out of the
  one bounded traversal. No general graph library was added; the walk is bounded by
  `requirements.length` and always terminates.

A requirement with a detected topology issue short-circuits to `{legal: new Set(), issues: [the
issue]}` in `evaluateRequirements` -- no candidate (persisted, tentative, or catalogue-probed) is ever
evaluated against it, so no acquisition of any kind can make a topologically malformed requirement
appear satisfied. New issue kind on `SpellRequirementIssue`: `{kind:
'invalid-requirement-dependency', reason: 'unknown'|'self'|'cycle', membershipPoolId}` -- attached to
the REQUIREMENT, never to a spell identity, since no candidate caused it.

The real Wizard dependency (`spell` requires `spellbook`) was re-verified well-formed both directly
(`detectRequirementTopologyIssues` returns zero issues for the real authored facet) and through the
planner (the spellbook requirement's plan carries no `invalid-requirement-dependency` issue) -- it
remains green, with no class-name branch anywhere in the check.

Bite proof performed (not committed): the pass-2 short-circuit was temporarily disabled, the four new
unknown/self/cycle unit tests were confirmed to FAIL against the un-hardened code (falling back to an
ordinary `{kind: 'missing', count: 1}` with no configuration signal -- exactly the insufficiency this
hardening fixes), then the short-circuit was restored and the full suite re-confirmed green.

#### Files

- Modified: `app/lib/characters/spell-requirements.ts` (five narrow exports + one pure extract-method
  refactor of `validateSpellRequirements`'s own loop body into `evaluateRequirements`, now ALSO
  running `detectRequirementTopologyIssues` -- see above -- plus one new exported function and one
  new `SpellRequirementIssue` member; zero behavior change for any well-formed requirement, all 89
  pre-existing P3.1 tests still re-pass unchanged), `tests/lib/characters/spell-requirements.test.ts`
  (6 new topology tests).
- Created: `app/lib/characters/spell-acquisition-plan.ts` (the planner),
  `tests/lib/characters/spell-acquisition-plan.test.ts` (34 tests: the 28 requested, a
  validator-agreement test, two fixed-grant-shaped tests, the answer-key-shape test, and 2 topology
  tests proving the hardening is visible through the planner too).

#### Verification

`pnpm run test`: 195 files / **4070 tests** passed (full suite, including the 8 additional hardening
tests above and the existing 647/192/420/35 census + availability-scoreboard assertions, unchanged
and re-passing). `pnpm run typecheck`: 243 unique (file, diagnostic-code) pairs -- identical to the
established baseline, zero new, none in any file touched this pass. `pnpm run build`: succeeds.
`git diff --check`: clean. `pnpm packages:sync -- --world Solaris` (dry run): Rules
`eldra.rules.dnd5e-2024@0.20.0` CURRENT, Content `eldra.solaris.xphb` CURRENT, Actions None -- no
package change, confirmed empirically, not merely expected.

### 25.29 RULES HOTFIX -- HALF-CASTER LEVEL-1 SPELL SLOTS (0.21.0, 2026-10-07)

**Correction, not a new phase.** Discovered while deriving P3.3's mandatory Level-1 matrix (P3.3
itself was stopped pending this fix and has not resumed -- see its own section once it exists).
`table:spellcasting.slots_half`'s `key: 1` row authored `slot_1: 0`; the real XPHB corpus grants
Paladin and Ranger (both `casterProgression: "artificer"`, 2024's half-caster shape) **two Level-1
slots at character Level 1** -- confirmed directly against both classes' own `rowsSpellProgression`
table, which are identical to each other and to every other row (2-20) our package already had
correct. Only the Level-1 row was wrong; nothing else moved.

**Real-world impact (independent of P3)**: `deriveSpellSlotLevels` returned `[]` for a Level-1
Paladin/Ranger, so Cast's `checkSpellSlotAvailability` refused every Level-1 cast with
`invalid-cast-level`, even though 2024 RAW grants two real slots. This is a production Cast bug the
2024 corpus itself disproves, not a design question.

**Fix**: one field, `packages/eldra-dnd5e-2024/definitions.json`, `table:spellcasting.slots_half`,
row `key: 1`, `slot_1: 0 -> 2`. Rows 2-20 unchanged (verified unchanged, not merely left alone --
`tests/rules/dnd5e-2024-package.test.ts`'s new all-20-row corpus comparison asserts every row against
the real Paladin/Ranger table). No application code changed -- `deriveSpellSlotLevels`, Cast, the
Sheet, and P3's own spell-requirement/planner infrastructure already read the table generically; none
of them contain a Paladin/Ranger branch, and none needed one.

**Version**: `eldra.rules.dnd5e-2024` `0.20.0 -> 0.21.0`, following this package's own established
convention (every manifest/definitions change bumps the minor digit, with no patch-level precedent).

**Tests**: `tests/rules/dnd5e-2024-package.test.ts` -- the stale "no slots at level 1" assertion/title
corrected to the real value, boundary assertions at levels 2/5/9/17/20 (proving rows 2-20 untouched),
a full 20-row corpus-vs-package comparison for both Paladin and Ranger (test-time corpus read only,
no runtime dependency), and a real-facet-driven derivation proof (`findRulesFacet` -> the real
`caster_type.half` grant -> `deriveSpellSlotLevels` -> `maxSpellLevelOf`) for both class slugs via one
parametrized test, proving no Paladin/Ranger branch exists in the generic path itself.
`tests/server/utils/character-cast.test.ts` -- a Level-1 Paladin with one prepared Level-1 spell now
casts successfully through the real Cast authority path (bite-proven: reverting the row to `0`
reproduces the exact pre-fix failure, confirmed, then restored).

Not part of this correction: P3.3 (Level-1 creation spell acquisition) remains stopped, as it was
when this bug was found -- this hotfix does not resume it.

### 25.30 SPELL ACQUISITION PROVENANCE AUDIT (architecture audit only, no implementation, 2026-10-07)

**Discovered resuming P3.3, which remains stopped.** Building the required Wizard Level-1 integration
test (cantrip + spellbook + prepared all real and satisfied simultaneously), `planSpellAcquisition`
never reached `complete: true`.

**Root cause**: `evaluate()` (`app/lib/characters/spell-requirements.ts`, shared by P3.1's
`validateSpellRequirements` and P3.2's `planSpellAcquisition`, unchanged by P3.3) walks EVERY
candidate carrying a requirement's own flag (`known`/`prepared`), with no way to tell "this candidate
was acquired for THIS requirement" from "this candidate happens to carry the same broad flag because
ANOTHER requirement on the same class ALSO reads it." Wizard's `cantrip`, `spellbook`, and (Warlock's)
`arcanum` all read `known`. A real cantrip gets correctly counted toward `cantrip`, but ALSO gets
walked against `spellbook` (same flag), fails `spellbook`'s implicit "must be level 1+" floor, and is
pushed as a spurious `illegal-wrong-level` issue onto `spellbook` -- which makes `spellbook.satisfied`
false even though its own count (6/6) is exactly right. Symmetrically, real spellbook spells pollute
`cantrip`'s issues. Verified directly against a correctly-filled real Wizard state. Two heuristic
fixes were tried (silently drop non-gated wrong-level mismatches; drop only if legal elsewhere) and
both were REJECTED -- each broke the existing, approved P3.1 test "a wrong-level pick is refused for
that tier" (test 23), which deliberately wants a wrong-level candidate flagged against the SPECIFIC
tier it was tested against. No heuristic can distinguish the two cases; they require explicit
provenance. **Not fixed. No code changed.** This section is an architecture audit of the fix only.

#### Current stored shape, traced

`StoredSpellEntry` (`app/lib/characters/spellcasting.ts`): `{instanceId, ref?: {packageId, slug},
name?, known: boolean, prepared: boolean}` -- a "ref XOR name" rule, no other fields. Consumers,
traced directly:
- **Normalization** (`normalizeStoredSpellcasting`): reads exactly these fields, drops anything else,
  defaults `known`/`prepared` to `false` if not literally `true`.
- **Assembly** (`character-assembly.ts`'s `resolveSpells`): spreads the WHOLE stored entry (`{...entry,
  status, title, ...}`) into `AssembledSpellEntry` -- any new field added to `StoredSpellEntry`
  reaches the Sheet automatically, no code change needed there.
- **Cast** (`character-cast.ts`): reads `known`/`prepared`/`ref`/`instanceId`/`spellMechanics` (via the
  resolved catalogue entry) -- never anything else. Confirmed by tracing every read site.
- **Recovery** (`character-recovery.ts`): touches only `expendedSlots`, never `spells[]`.
- **Generic PUT** (`.../spellcasting.put.ts`): a FULL REPLACE -- `normalizeStoredSpellcasting(body)`,
  whatever the client sends, no catalogue re-verification (deliberately, matching `inventory.put.ts`).
- **The one real client of that PUT**, `useCharacterMutations.ts`'s `persistSpellcasting` (called by
  every Sheet-side spell mutation -- add/remove/toggle-flag/expend/restore, all funneled through this
  ONE function): rebuilds `StoredSpellEntry[]` from the in-memory `AssembledSpellEntry[]` by hand,
  explicitly listing `{instanceId, ref/name, known, prepared}` -- **any field not in that literal would
  be silently dropped on the very next Sheet-side spell edit**, because this is a full-replace PUT, not
  a patch. This is the one finding with real teeth for GENERIC PUT IMPLICATIONS below.

#### Existing acquisition-provenance precedent

`StoredAcquiredFeat` (`app/lib/characters/progression.ts`): `{featRef: ClassRef, choiceKey: string}` --
a ContentRef paired with the STABLE `progressionChoiceKey(slot, at, choiceSetId)` string that granted
it, persisted directly in `progression.feats[]`. Exactly the pattern needed: the acquired reference
and a small, stable provenance tag, co-located, one record, no second store. `rules_choices`'s own
content-choice answers (P2C.2B) already encode a ContentRef as a plain string
(`serializeContentRef`) inside the SAME generic `Record<string, DefinitionId[]>` shape Definition
answers use -- confirming ContentRefs-as-strings is already an established, unremarkable pattern in
this codebase, not a new idea P3.3 would be inventing.

#### Requirement id stability

Every `SpellRequirement.id` (e.g. `spell-requirement.wizard-xphb.spellbook`) is a literal, hand-authored
string in `app/lib/content-rules/dnd5e-2024.ts` -- stable across reload (same source, same string every
read), stable across a Content refresh (the facet source itself, not a database row, is what would have
to change for the id to change -- the same stability every other hand-authored `DefinitionId` in this
codebase already has), and unique by construction (namespaced `spell-requirement.<class-slug>.<pool>
[.tier]` -- two classes can never collide, and this ALREADY satisfies the multiclass future-proofing
requirement below with zero extra work). **A requirement id is sufficient provenance by itself** --
no additional class/slot/level context is needed, because the id already encodes "which class, which
pool, which tier" in its own string.

#### Three models

**Model A -- provenance co-located on the spellcasting row (RECOMMENDED).** Add one optional field:
`StoredSpellEntry.requirementIds?: readonly string[]` -- every `SpellRequirement.id` this physical row's
acquisition satisfies. ONE row, multiple memberships (Magic Missile: `['spell-requirement.wizard-xphb
.spellbook', 'spell-requirement.wizard-xphb.spell']`), no duplicate rows. Canonical acquisition truth
AND canonical effective truth are the SAME record -- there is nothing to derive, nothing to drift.
`known`/`prepared` remain independently stored (never derived from `requirementIds`), preserving every
existing consumer and every legacy row untouched.

**Model B -- separate acquisition-provenance store, `spellcasting.spells[]` as a derived/merged
projection.** Rejected. This is §25.26/P3A's own Model 2 (`spellProgression`, rejected there for
"adds a second source of truth... strictly more storage and more consumers to keep honest for no
capability Model 1 doesn't already give"), re-litigated here for the identical reason: Cast and the
Sheet would need either a NEW merge step on every read (duplicating `resolveSpells`'s existing
contract) or direct provenance-store access (violating "Cast should stay ignorant of provenance").

**Model C -- requirement-scoped ContentRefs in `rules_choices`, `spellcasting.spells[]` as the
write-time-merged effective state.** Architecturally real (reuses the exact `rules_choices` content-
choice-answer shape P2C.2B already established, keyed by `progressionChoiceKey(slot, at,
requirement.id)` -- literally P3.2's own proposed answer key), but does NOT by itself fix `evaluate()`:
the validator builds candidates from the SPELLCASTING block, never from `rules_choices`, so `evaluate()`
would still need per-candidate provenance from SOMEWHERE -- meaning Model C would have to carry Model
A's own field anyway to close the actual bug, making it an ADDITIVE acquisition-history layer on top
of Model A, not a substitute for it. Not chosen for the core fix (not the smallest model that closes
the bug); worth keeping in mind if a future phase wants an audit trail of "which specific choice
granted this" distinct from "which pool does this currently satisfy."

#### Recommendation

**Model A.** `StoredSpellEntry.requirementIds?: readonly string[]`, additive, optional, backward
compatible by construction (absence already means "legal, legacy, evaluated under today's heuristic").

#### Wizard proof (Level 1: 3 cantrips, 6 spellbook, 4 prepared, real requirement ids)

```
cantrip x3:     requirementIds: ['spell-requirement.wizard-xphb.cantrip']
spellbook 1-4:  requirementIds: ['spell-requirement.wizard-xphb.spellbook', 'spell-requirement.wizard-xphb.spell']
spellbook 5-6:  requirementIds: ['spell-requirement.wizard-xphb.spellbook']
```
Re-evaluating `cantrip`: only rows tagged for it are even walked -> exactly 3, satisfied, zero
cross-contamination from the 6 spellbook rows (they are never inspected for `cantrip` at all, not
merely excluded after inspection). Re-evaluating `spellbook`: only rows tagged for it -> 6, satisfied.
Re-evaluating `spell` (depends on `spellbook` membership): only rows tagged for `spell` -> the 4
overlapping rows, each ALSO confirmed already-legal for `spellbook` (membership check, unchanged
mechanism, now fed a correctly-scoped set) -> satisfied. All three simultaneously true. **Proven.**

#### Warlock proof (Level 20: cantrip, ordinary spell, Arcanum 6/7/8/9)

Each of the 4 Arcanum entries is tagged with its OWN tier id only (`[...arcanum.6]`,
`[...arcanum.7]`, ...). Evaluating `arcanum.6` walks ONLY rows tagged for `arcanum.6` -- the
`arcanum.7` row is never a candidate for `arcanum.6`'s evaluation, structurally, not by a level
comparison. No contamination among tiers, cantrip, or the ordinary pool. **Proven.**

#### Feat collision proof (Magic Initiate)

A future Magic-Initiate-granted Wizard cantrip is tagged with ITS OWN requirement id (e.g.
`spell-requirement.feat.magic-initiate.<id>`), never the class's `spell-requirement.wizard-xphb
.cantrip`. Evaluating the CLASS cantrip requirement walks only rows tagged for that exact id -- the
Magic Initiate cantrip is never inspected, regardless of sharing `level: 0`, `classLists: ['Wizard']`,
and `known: true`. The collision this task flagged as critical cannot occur under explicit
provenance, by construction, not by a heuristic that happens to work today.

#### Test 23, revisited

Test 23's own candidate must be explicitly tagged (by whatever constructed it -- the planner's
tentative-merge step, matching its own submission intent) `requirementIds: [tier6.id]` to be
evaluated AS a tier6 candidate at all. Tagged that way, `evaluate()` walks it for tier6, finds
level 7 != 6, and flags `illegal-wrong-level` on tier6 -- test 23's exact existing assertion,
unchanged. The SAME candidate, if instead submitted for `arcanum.7` (a DIFFERENT tentative
selection, tagged `[tier7.id]`), is never even walked for tier6 -- resolving the tension this audit
opened with: explicit provenance makes "submitted for X, wrong for X" (still illegal, as test 23
wants) and "acquired for Y, incidentally resembles X" (never evaluated against X at all) cleanly
distinguishable, where level/classList/flag heuristics could not be.

#### Validator fix shape (not implemented)

`SpellStateCandidate` gains `requirementIds?: readonly string[]`. `evaluate()`'s per-candidate loop
gains ONE additional guard, checked immediately after the existing flag check: `if (candidate
.requirementIds && !candidate.requirementIds.includes(requirement.id)) continue`. A candidate WITH
tags participates ONLY in requirements it is explicitly tagged for (no heuristic). A candidate
WITHOUT tags (every legacy row, every row a GM free-typed through the generic PUT with no provenance
concept) falls back to EXACTLY today's flag-based evaluation -- the same pre-existing ambiguity,
never worse, exactly the "legacy ambiguity the validator may report" the backward-compatibility
posture already permits. `toResult`/`evaluateRequirements`/`planSpellAcquisition` need no change --
the fix is local to `evaluate()`'s own filter line.

#### Tentative answers already have this

P3.2's `TentativeSpellSelection = {requirementId, ref}` already carries exactly the provenance the
persisted side lacks -- planning-time candidates are ALREADY correct by construction (each tentative
names its own intended requirement). The gap is purely on the PERSISTED side: nothing carries that
same fact across a save/reload today. The fix is to have the WRITE step (already drafted for P3.3,
`buildAcceptedSpellEntries`) ALSO accumulate `requirementIds` per merged identity, mirroring exactly
how it already OR-merges `known`/`prepared` -- no new write path, one more accumulated field.

#### Write path implications (not implemented)

- **P3.3 creation**: `buildAcceptedSpellEntries` stamps `requirementIds` per merged row from the
  accepted tentative answers it already processes.
- **P3.4 progression**: the same merge function, reused, accumulating `requirementIds` for spells
  added at a newly-crossed level, consistent with "one plan authority."
- **A future validated preparation-change workflow**: a well-defined provenance add/remove (drop the
  `spell`/prepared-pool id from a swapped-out spell's list, or delete the row if it then has no
  provenance left; add it to a swapped-in spell's list, creating the row if new) -- mechanical,
  because `requirementIds` is an explicit set, not a derived heuristic. Day-to-day preparation
  changes remain OPTIONAL flexibility (§25.26/P3A), now simply WELL-DEFINED rather than ambiguous.

#### Generic PUT, revised

The endpoint's AUTHORIZATION posture needs no change (still `world.character.edit_any`, still
unprotected against arbitrary rewrites, exactly as previously recorded). But there is a concrete,
previously-unflagged mechanical risk: `useCharacterMutations.ts`'s `persistSpellcasting` -- the ONE
function every Sheet-side spell mutation already funnels through -- rebuilds `StoredSpellEntry[]` by
hand, explicitly listing `{instanceId, ref/name, known, prepared}`. Adding `requirementIds` without
ALSO updating this one function to forward it unchanged would mean the VERY NEXT ordinary Sheet-side
spell edit after creation (toggling a flag, adding a custom spell, anything) silently DESTROYS every
tag on the whole character, via the existing full-replace PUT -- not because the route needs
protecting, but because its one real caller doesn't yet know this field exists. A future
implementation must update `persistSpellcasting` in the SAME change that adds the field, or ship the
two atomically. This does not change the recommendation to leave the PUT itself unprotected; it adds
one concrete must-do to whichever phase implements Model A.

#### Package impact

Application storage schema only. `StoredSpellEntry` gains one optional field in the `spellcasting`
block's JSON shape (`app/lib/characters/spellcasting.ts` + its normalization in
`server/utils/character-spellcasting.ts`) -- the exact same kind of change `StoredAcquiredFeat
.choiceKey` already was for `progression.feats[]`. `SpellRequirement.id` itself is unchanged; this
only stores a REFERENCE to an id that already exists. Zero Rules Package change, zero Content facet
change. A future `packages:sync` dry run implementing this would be expected to show Rules CURRENT,
Content CURRENT, Actions None.

#### Backward compatibility

`normalizeStoredSpellcasting` would gain one additive read (an array of non-empty strings, or
absent) -- never fails the record. A historical row with no `requirementIds` degrades to exactly
today's behavior (flag-based evaluation, including today's pre-existing cross-pool ambiguity for any
historical Wizard who already has both cantrips and spellbook/prepared spells saved) -- the same
"newly-named, not newly-caused" posture P1/P7/P3A already established elsewhere. No destructive
migration; a character re-saved through a NEW provenance-aware write path (progression confirm, or a
future preparation-change workflow) gains tags going forward, never retroactively rewritten.

#### P3.3 worktree, preserved exactly

No application code was touched during this audit. The P3.3-owned files already in progress when this
audit began remain exactly as they were, uncommitted, unstaged:
`app/components/characters/builder/characterBuilderSelection.ts`,
`app/pages/worlds/[id]/characters/create-v2.vue`,
`server/api/worlds/[id]/characters/create-v2.post.ts`,
`server/utils/character-spell-acquisition.ts` (new file),
`tests/components/characters/builder/characterBuilderSelection.test.ts`,
`tests/server/api/worlds/[id]/characters/create-v2.post.test.ts`. P3.3 remains paused pending
direction on this provenance fix; this section is analysis only.

### 25.31 SPELL REQUIREMENT PROVENANCE -- IMPLEMENTED (P3.2.1, 2026-10-07)

**Model A, accepted and implemented.** P3.3 remains paused; nothing in this phase touches the
paused P3.3-owned files (confirmed: diffed against the exact snapshot taken before this phase
began, byte-identical throughout).

#### Stored shape

`StoredSpellEntry` (`app/lib/characters/spellcasting.ts`) gains one additive, optional field:
```ts
requirementIds?: readonly string[]
```
Every package-authored `SpellRequirement.id` this physical row's acquisition satisfies. ONE row,
multiple memberships (Magic Missile: `known: true, prepared: true, requirementIds:
['...spellbook', '...spell']`), never two physical rows. `normalizeStoredSpellcasting` reads it
additively: valid non-empty strings retained verbatim (duplicates and order preserved -- no
destructive dedup write; `evaluate()` uses set semantics at READ time instead), a non-array or
all-invalid result folds to the field being ABSENT (never a stray `[]`), and every existing
envelope/entry validation rule is unchanged.

#### Evaluation

`evaluate()` (`app/lib/characters/spell-requirements.ts`) gains one guard, checked immediately
after the existing flag check and before any legality check: a candidate with a non-empty
`requirementIds` participates in a requirement IFF that requirement's id is in the list -- P2/P3.1's
own legality checks (class list, level, membership, unresolved mechanics) still run in full
afterward for every candidate that passes this gate; provenance answers "does this candidate even
apply," never "is it legal." A candidate with an absent OR EMPTY `requirementIds` falls back to
EXACTLY the pre-P3.2.1 flag-only heuristic -- untouched, including its known cross-pool-collision
limitation for untagged rows (see below). `toResult`/`evaluateRequirements`/`planSpellAcquisition`
needed no change; the fix is local to this one guard.

Two new exported pure helpers: `mergeSpellStateCandidate(base, next)` (OR known/prepared, UNION
requirementIds via a Set, never emits an empty array when neither side has one) and
`orphanedProvenanceIdentities(requirements, candidates)` (identities whose EVERY tag is unknown to
the current requirement set -- never silently re-routed to some other requirement; a partial match
is not orphaned).

#### Wizard proof (real requirement ids, explicitly tagged)

3 cantrips tagged `[cantripId]`, 2 spellbook-only tagged `[spellbookId]`, 4 spellbook+prepared
tagged `[spellbookId, spellId]` on the SAME rows -- `validateSpellRequirements` returns `complete`
(`allSpellRequirementsSatisfied`), cantrip owned 3/zero issues, spellbook owned 6/zero issues,
prepared owned 4/zero issues. Zero cross-pool issues in either direction. Proven both at the
validator level (`tests/lib/characters/spell-requirements.test.ts`) and end-to-end through the
PLANNER with TENTATIVE answers (`tests/lib/characters/spell-acquisition-plan.test.ts`'s own new
P3.2.1 test) -- the exact original bug reproduction, now `complete: true`.

#### Warlock proof (real requirement ids, Level 20)

Real cantrip/ordinary targets plus one candidate per Arcanum tier (6/7/8/9), each tagged ONLY its
own tier id. All four tiers independently satisfied; zero contamination among tiers, cantrip, or
the ordinary pool.

#### Test 23

Updated (not replaced) to explicitly tag its candidate `requirementIds: [tier6.id]`, matching how a
real acquisition would actually arrive -- the exact original assertion (`illegal-wrong-level` on
tier6 for a level-7 pick) is unchanged. New companion: the identical level-7 spell, tagged ONLY for
tier7, produces zero issues on tier6 (`[{kind: 'missing', count: 1}]` only) -- it is never even a
tier6 candidate. The tension this phase's own audit (§25.30) opened with is resolved exactly as
predicted.

#### Feat collision (Magic Initiate, synthetic id)

A cantrip tagged `['spell-requirement.feat.magic-initiate.synthetic']` against a Wizard CLASS
`cantrip` requirement: `owned: 0`, `issues: [{kind: 'missing', count: 3}]` -- never counted, never
even flagged illegal, despite matching on level/classList/flag. Magic Initiate itself remains
unauthored; this proves only that the mechanism isolates correctly once it is.

#### P3.2 alignment

`planSpellAcquisition`'s tentative-candidate construction now stamps `requirementIds:
[requirement.id]` (the tentative answer already names its requirement; this only preserves that
fact onto the synthetic candidate), and its merge step now calls the shared
`mergeSpellStateCandidate` instead of a hand-rolled known/prepared-only merge. No change to any
public signature; all 34 pre-existing P3.2 tests re-pass unchanged, plus the one new end-to-end
proof above.

#### Writers audited, proven, not merely inspected

- **Sheet** (`useCharacterMutations.ts`'s `persistSpellcasting`, the one function every Sheet-side
  spell edit already funnels through): previously rebuilt `StoredSpellEntry[]` from a fixed field
  list, which would have silently dropped `requirementIds` on the very next ordinary edit after
  creation. Fixed by extracting `toStoredSpellEntry` (a pure, directly-testable function, mirroring
  `characterBuilderSelection.ts`'s own "no DOM test environment" extraction convention) and having
  `persistSpellcasting` map through it instead of hand-listing fields.
- **Assembly** (`character-assembly.ts`'s `resolveSpells`): already spreads the stored entry
  verbatim; a new regression proves `requirementIds` survives, so a future edit cannot silently
  regress this.
- **Cast** (`character-cast.ts`): read-modify-write touching only `expendedSlots`
  (`{...stored, expendedSlots: next}`); a new regression casts through a tagged `spells[]` and
  proves it is byte-identical in the save call, only `expendedSlots` changed.
- **Recovery** (`character-recovery.ts`): identical shape, identical new regression.
- **Generic PUT**: normalization alone (already fixed above) is what it relies on; no route code
  change. Authorization posture unchanged (still `world.character.edit_any`, still a full replace).
  Recorded explicitly: this remains technical debt for a future validated day-to-day preparation
  workflow, NOT the final authoritative mutation API -- unchanged conclusion from §25.27.

#### Backward compatibility

A historical row with no `requirementIds` degrades to exactly the pre-P3.2.1 heuristic -- the same
"newly-named, not newly-caused" posture already established elsewhere, never worse. No destructive
migration; no automatic provenance inference written back to storage.

#### Homebrew / multiclass

Requirement ids are opaque, package-authored strings; nothing in `evaluate()`,
`mergeSpellStateCandidate`, or `orphanedProvenanceIdentities` parses one for a class name or pool
kind. A homebrew class authoring its own stable ids uses the identical mechanism with zero
application branching. Ids already encode class identity in their own string
(`spell-requirement.<class-slug>.<pool>`), so a future multi-class character needs no additional
ownership field -- confirmed, not newly added.

#### Package impact

Confirmed empirically, not merely expected: `pnpm packages:sync -- --world Solaris` (dry run) --
Rules `eldra.rules.dnd5e-2024@0.21.0` CURRENT, Content `eldra.solaris.xphb` CURRENT, Actions None.
Pure application storage-schema and type change; zero Rules/Content impact.

#### Files

- Modified: `app/lib/characters/spellcasting.ts` (field + normalization + `toStoredSpellEntry`),
  `app/lib/characters/spell-requirements.ts` (field + `evaluate()` guard + two new helpers),
  `app/lib/characters/spell-acquisition-plan.ts` (tentative tagging + shared merge, narrow
  adaptation, no public signature change), `app/composables/useCharacterMutations.ts`
  (`persistSpellcasting` now maps through `toStoredSpellEntry`), and the test files for each of the
  above plus `tests/server/utils/character-assembly.test.ts`,
  `tests/server/utils/character-recovery.test.ts`, `tests/server/utils/character-cast.test.ts`.
- Untouched (confirmed byte-identical against the pre-phase snapshot): every paused P3.3-owned file.

#### Verification

`pnpm run test` (full suite): 195 files, 4109 tests collected; **4087 passed**, 22 failed -- all 22
confirmed, by diffing against the snapshot taken before this phase began, to be PRE-EXISTING
failures in two test files (`create-v2-fail-closed.test.ts`,
`create-v2-fighter-mechanics.test.ts`) that exercise the PAUSED, incomplete P3.3 wiring in
`create-v2.post.ts` against fixtures that happen to use the real Wizard class (which now has real
spell requirements) for unrelated mechanics (Phase-0 refusal messages, Origin Feat routing,
rules_choices persistence) -- the exact check this phase's own snapshot confirms already existed,
unmodified, before P3.2.1 began. Excluding those two files: **193 files, 4052 tests, zero
failures** -- zero regressions from this phase's own changes. `pnpm run typecheck`: 243 unique
(file, diagnostic-code) pairs, identical to the established baseline, zero new, none in any file
this phase touched. `pnpm run build`: succeeds. `git diff --check`: clean. No commit made. No
`packages:sync --apply` run.

### 25.32 P3.3A -- CREATION SPELL ACQUISITION AUTHORITY + PERSISTENCE (2026-10-08)

**Resumed from the P3.2.1-preserved worktree, byte-for-byte, and completed.** This section covers
the SERVER half only: plan rebuild, rejection matrix, canonical provenance-tagged write. The CORRECTION
below this section's own original text: an earlier report in this same pass said "Builder files:
unchanged (confirmed)," which was READ as "Builder presentation was never built." That reading was
wrong, but the sentence itself was ambiguous enough to cause it -- the Builder presentation work
(§25.33) was ALREADY built, in full, in the SAME working session, BEFORE the P3.2.1 collision was
discovered and this whole effort paused; "unchanged" meant exactly that: the already-complete
Builder code needed zero further changes once provenance (P3.2.1) and the server authority (this
section) were done, since the Builder only ever touches TENTATIVE, planning-time state, never a
persisted `requirementIds`. §25.33 documents that work directly, including the additional browser-
shape tests this round added to close real coverage gaps the first pass left (every caster
archetype, not only Wizard). P3.4 (progression) and P3.5 (174-decision reclassification) remain
untouched and out of scope.

#### Wizard success path, re-run first (the exact scenario that exposed the P3.2.1 collision)

3 real cantrips, 6 real spellbook spells, 4 of those 6 also prepared, submitted as one tentative
plan: `planSpellAcquisition` reports `complete: true`; the write-side (`buildAcceptedSpellEntries`)
persists exactly 9 physical rows (not 10 -- the 4 overlapping spells never duplicate), each tagged
with exactly the requirement id(s) its acquisition actually satisfies; a FRESH reload (no Builder,
no tentative state -- just the persisted rows re-resolved against the catalogue) re-validates
`complete: true` with zero cantrip/spellbook contamination in either direction. Proven at the unit
level (`tests/server/utils/character-spell-acquisition.test.ts`) and through the real HTTP route
(`tests/server/api/.../create-v2-spell-acquisition.test.ts`'s own Success Matrix item C).

#### Paladin/Ranger on Rules 0.21.0

Both resolve to `casterTypeOf -> 'half'` (the real class facet's own `caster_type.half` grant);
`creationSpellSlotLevels('half', the real slots_half table)` now correctly returns a Level-1 slot
with `max: 2` (the Rules Hotfix's own fix), so the legal maximum spell level at Level-1 creation is
genuinely `1`, derived through the SAME canonical `deriveSpellSlotLevels`/`SLOT_TABLE_BY_CASTER_TYPE`
machinery Cast and the Sheet already use -- no override, no class branch. Proven as Success Matrix
item D.

#### P3.2.1 provenance: no workaround, no heuristic

`buildAcceptedSpellEntries` (the ONLY place canonical spell rows are constructed) derives
`requirementIds` SERVER-SIDE from each accepted answer's own `requirementId` -- the client never
submits provenance. The merge for a spell satisfying two requirements at once reuses
`mergeSpellStateCandidate` (P3.2.1's own exported helper) verbatim: `known`/`prepared` OR,
`requirementIds` UNION, one physical row. No second, independently-maintained merge rule was
introduced; no heuristic (level/classList/flag inference) was added anywhere in this phase.

#### Builder (unchanged from the paused worktree -- confirmed, not merely assumed)

`characterBuilderSelection.ts`/`create-v2.vue` deal ONLY in tentative, planning-time state
(`draft.spellSelections`); persisted `requirementIds` is a server-write-side concept the Builder
never touches. P3.2.1 added no field or behavior the Builder needed to react to, confirmed by the
Builder's own test file re-passing unchanged (56 -> 63 tests across this whole P3.3 effort, zero
regressions at any point) and by inspection: nothing in `spellRequirementSections`/
`spellAcquisitionPresentation` reads or writes a `StoredSpellEntry`.

#### Payload / server authority (unchanged from the paused worktree's own design)

Transport: `spellSelections: {requirementId, ref: {packageId, slug}}[]` -- requirement identity and
a Spell ContentRef only, never class list/level/school/pool/flags. Server rebuilds the Level-1 plan
from the SAME package facet + World catalogue already resolved for every other check in this route,
through `planSpellAcquisition` (P3.2) unchanged.

#### Ordering decision: Phase 0 runs BEFORE spell acquisition (corrected this pass)

The ORIGINAL paused wiring checked spell acquisition before Phase-0's own `creationUnresolvedDecisions`
check. This produced 22 pre-existing test failures (discovered, not introduced, by P3.2.1's own full-
suite run) in two UNRELATED test files that use Wizard/Cleric as a convenience fixture for Origin-
feat/rules_choices mechanics and Phase-0-refusal mechanics, with no spell answers in mind at all.
Reordering to run Phase 0 FIRST is the architecturally correct fix, not a workaround: "can this
species/class/background/feat combination be represented at all" is a more fundamental gate than
"did you also answer this already-supported class's spell questions," so a combination Phase 0
cannot represent is refused regardless of spell state -- a player is never asked to resolve spell
selections for a character that cannot be created anyway. All 22 pre-existing failures are fixed by
this reordering plus (for the two mechanics-isolation describe blocks that complete successfully,
where Phase 0 is stubbed and spell validation IS reached) a legal, fixed, always-satisfied Wizard
spell answer supplied by the test fixture itself -- never a change to spell legality/validation
logic.

#### Server rejection matrix (10 cases, all before `createEntityRecord`, zero writes)

Missing selection, unknown requirement id, unknown spell ref, wrong package, wrong class list,
wrong spell level, duplicate same-requirement spell, Wizard prepared spell outside the effective
spellbook, over-count (extra selection beyond target), and a malformed `requiresMembershipPool`
dependency (injected via a crafted facet, proving P3.2's own topology hardening is reachable through
the real route) -- plus malformed payload shape and the non-caster "no write at all" case. All 12
proven through the real route in `create-v2-spell-acquisition.test.ts`.

#### Success matrix (5 archetypes, real facets, real planner, real write-through)

A. Bard (cantrip + ordinary). B. Cleric (prepared caster). C. Wizard (spellbook -> prepared
dependency). D. Paladin (half caster, Rules 0.21.0). E. Warlock (ordinary pools; Mystic Arcanum
correctly requests zero selections at Level 1 and is never offered).

#### Persistence write order (final)

entity -> `catalogue_selection` -> progression -> **spellcasting** (new, FAIL LOUDLY, no `.catch`) ->
ability scores -> rules_choices -> health. Unchanged from the paused worktree's own design; reasoning
unchanged (spellcasting is mandatory once a class declares requirements, exactly like
`saveCharacterRulesChoices`/`saveCharacterHealth`'s existing fail-loud posture, for the identical
reason -- a completed-looking caster silently missing its spells is the bug this phase exists to
prevent).

#### Persistence sensitivity (Wizard + Warlock, proven, not assumed)

For both, a fresh-reload validation against the REAL persisted (tagged) rows is `complete: true`;
the IDENTICAL rows with `requirementIds` stripped (simulating historical/untagged state) reproduce
the exact pre-P3.2.1 cross-pool collision (`complete: false`) -- proving reload correctness
genuinely depends on persisted provenance, not on any lingering tentative answer. The original,
tagged rows are never mutated by this proof.

#### Generic PUT

Unchanged posture: still not protected, still explicitly not the final authoritative mutation API.
Creation now uses the validated, authoritative write-through described above; day-to-day
preparation changes remain future, separately-validated work.

#### Phase 0 / availability

Unchanged, re-verified: 647 total / 192 implemented / 420 blocked / 35 optional. The 174 class-owned
spell decisions remain BLOCKED -- `mandatory-decisions.ts`/`mandatory-decision-coverage.ts`
untouched. Availability: Species 3/10, Classes 0/12, Backgrounds 0/16, Combinations 0/1,920,
unchanged (equipment and other Phase-0 blockers are independent of spell state).

#### Package impact

Pure application/UI/server-persistence work. Confirmed empirically:
```
RULES:    eldra.rules.dnd5e-2024@0.21.0 -- CURRENT
CONTENT:  eldra.solaris.xphb -- CURRENT
ACTIONS:  None
```

#### Files

- Modified (the paused worktree, completed): `app/components/characters/builder/
  characterBuilderSelection.ts` (unchanged this pass, confirmed), `app/pages/worlds/[id]/characters/
  create-v2.vue` (unchanged this pass, confirmed), `server/api/worlds/[id]/characters/
  create-v2.post.ts` (Phase-0/spell-check reordering), `server/utils/character-spell-acquisition.ts`
  (`buildAcceptedSpellEntries` now derives and merges `requirementIds`), `tests/server/api/worlds/
  [id]/characters/create-v2.post.test.ts`, `tests/server/api/worlds/[id]/characters/
  create-v2-fail-closed.test.ts` (fixed by the reordering alone, zero fixture changes),
  `tests/server/api/worlds/[id]/characters/create-v2-fighter-mechanics.test.ts` (fixed with a legal
  default Wizard spell answer), `tests/rules/completeness-stub-policy.test.ts` (new UNIT_STUBBING
  entry).
- Created: `tests/server/utils/character-spell-acquisition.test.ts` (26 tests), `tests/server/api/
  worlds/[id]/characters/create-v2-spell-acquisition.test.ts` (18 tests: 5 success-matrix + 1
  round-trip + 12 rejection-matrix).

#### Verification (P3.3A alone, superseded by §25.33's combined final numbers)

`pnpm run test`: 197 files / 4153 tests -- all passing at the time this section was first written.
`pnpm run typecheck`: 243 unique (file, diagnostic-code) pairs, identical to the established
baseline, zero new. `pnpm run build`: succeeds. `git diff --check`: clean. `pnpm packages:sync --
--world Solaris` (dry run): Rules CURRENT at 0.21.0, Content CURRENT, Actions None -- zero writes.
No commit made. No `packages:sync --apply` run.

### 25.33 P3.3B -- V2 BUILDER SPELL ACQUISITION PRESENTATION (2026-10-08)

**The Builder half of P3.3, confirmed already implemented (same session, before the P3.2.1 pause),
verified line-by-line against every P3.3B requirement, and extended with the browser-shape test
coverage the first pass was missing.** No Builder code changed this round -- the existing
implementation already satisfied every requirement traced below; only test coverage was added.

#### Trace: smallest insertion point (confirmed, not redesigned)

`CharacterBuilderDraft` gained exactly one field, `spellSelections: Record<string, string[]>` --
`SpellRequirement.id` -> a list of `serializeContentRef`-encoded refs. Nothing else in the draft
shape changed. `toCreatePayload` gained exactly one additional field,
`spellSelections: TentativeSpellSelection[]`, sourced from `effectiveSpellSelections(draft)`.

#### Draft representation (P3.2's own shape, nothing more)

The draft stores ONLY `{requirementId -> ref[]}`. It does NOT store `known`, `prepared`,
`requirementIds`, class list, spell level, school, or any label -- all of those are derived, either
by `planSpellAcquisition` (presentation-time) or by the server (`buildAcceptedSpellEntries`,
write-time). The draft is sufficient, and only sufficient, to reconstruct a
`TentativeSpellSelection[]` and call `planSpellAcquisition` again.

#### Builder plan (reuses P3.2 verbatim, zero re-implementation)

`spellAcquisitionPresentation(draft, context)` calls `planSpellAcquisition` with: `requirements`
from the selected class's own real facet (`draft.class?.rulesFacet?.spellRequirements`),
`characterLevel: 1`, `candidates: []` (nothing persisted yet at creation), `catalogue:
context.spells` (the real World catalogue, already fetched for the page), `spellSlotLevels` the
fixed, corpus-proven `CREATION_SPELL_SLOT_LEVELS` constant (see that constant's own header: a
provable Level-1-only fact, re-confirmed against Rules 0.21.0's corrected half-caster table, never
a client-trusted legality substitute -- the server independently re-derives the real value and is
the only side ever treated as authoritative), and `tentative` built from the draft. The resulting
plan is the ONLY source `spellRequirementSections`/`isSpellStepComplete`/`missingRequirements` read
from -- no Vue-level spell filtering exists anywhere.

#### Generic presentation (no class-specific component, confirmed)

`spellRequirementSections` renders one section per requirement with `target > 0` (Mystic Arcanum's
four Level-1 requirements, always target 0, correctly produce no section -- not via an `if arcanum`
special case, simply because the generic `target > 0` filter already excludes them). Labels come
from `spellPoolLabel(pool)`, a fixed four-entry map keyed by the POOL KIND enum
(`cantrip`/`spell`/`spellbook`/`arcanum` -- P3.1's own closed vocabulary, not a class name):
Cantrips / Prepared Spells / Spellbook / Mystic Arcanum. **On the LABELS section's own "STOP and
report if package-authored labels are required" instruction**: not triggered -- these four words
describe the GENERIC POOL KIND (already a closed, class-agnostic enum fixed since P3.1), not any
one class's own terminology; a homebrew class whose own `SpellRequirement.pool` is `'spellbook'`
would see the identical "Spellbook" label, correctly, because it genuinely has a spellbook-shaped
mechanic -- the label names the MECHANIC SHAPE, never a class. No requirement-id parsing, no
class-slug branching, anywhere in this path.

#### Option control

Reuses `CharacterChoiceSetPicker`'s existing SLOT-MODE rendering (`distinct: false, maxPerOption:
1`) -- the same machinery Ability Score Improvement's own repeatable choice already exercises, and
the smallest existing control in this codebase for "N independent slots, each one option, no
repeats." No searchable/autocomplete component exists anywhere in `app/` (checked: zero
`USelectMenu`/`UInputMenu`/combobox usage) so building one would have been a new design-system
piece inside a feature-correctness phase -- explicitly out of scope. **Recorded as Player UX
backlog**, not silently accepted as final: see `project_spell_selection_ux_backlog` (session
memory) for the exact drop-in replacement path once a beauty pass is scheduled.

#### Distinctness

Enforced by the SAME `maxPerOption: 1` slot-mode mechanism already proven for ASI -- a spell
selected in one slot is disabled in every other slot of the SAME requirement, never across
different requirements (Wizard: the same spell may be picked for spellbook AND prepared, two
separate requirement keys, two separate pickers).

#### Wizard (the critical case, confirmed working within one plan recomputation)

A tentative spellbook pick becomes part of the EFFECTIVE spellbook the SAME `spellAcquisitionPresentation`
call's prepared-pool evaluation reads as its membership gate -- no save/reload/then-prepare round
trip. A prepared pick naming a spell outside the resulting effective spellbook is refused
(`illegal-not-in-membership-pool`), proven directly at the Builder plan level (new test 9). Removing
a spellbook pick that a prepared pick depends on is handled GENERICALLY: nothing deletes the stale
prepared answer from the draft, but the NEXT plan recomputation (triggered by any draft change,
exactly like every other Builder answer in this codebase) re-evaluates it against the NEW effective
spellbook and reports it unsatisfied -- the same "re-validate on read, never delete on write"
posture `pruneChoices`/`effectiveContentChoices` already established for Definition/content
choices, extended here with zero Wizard-specific code.

#### Ordering

Dependency order comes from `requiresMembershipPool`, resolved by `planSpellAcquisition`'s own
(P3.2) two-pass evaluation -- the Builder never orders sections by array position or by checking
for "Wizard" anywhere; it renders whatever `plan.requirements` returns, in that order.

#### Class equivalence (browser-shape matrix, this round's own added coverage)

Fighter (no section at all), Sorcerer (cantrip + ordinary, both generic sections), Cleric (ordinary
prepared requirement, no spellbook dependency), Paladin AND Ranger (a real Level-1 section with real
Level-1 legal options -- the mandatory regression for the Rules 0.21.0 half-caster correction),
Warlock (cantrip + ordinary sections, zero Arcanum control, no special-case code), Wizard (all three
sections simultaneously, exact real counts 3/6/4).

#### Class switching

`effectiveSpellSelections` filters the draft to only the CURRENTLY selected class's own live
requirement ids -- a prior class's answers are invisible to both presentation
(`spellRequirementSections` renders nothing for them) and submission (never appear in the payload).
The draft entry itself is NOT deleted on switch (switching back re-validates it against the current
plan rather than losing it), matching this module's own established "re-validate on read" rule. No
hidden stale answer can ever reach payload authority, because `effectiveSpellSelections` is the
ONLY path `toCreatePayload` reads from.

#### Builder completeness

`isSpellStepComplete` participates in `isStepComplete('spells', ...)` and `isDraftComplete` exactly
like every other step. This is Builder MECHANICS only -- it does not and must not bypass the real
Phase-0 production blocker (`creationBlockerMessages`), which independently still refuses every
real class today for unrelated reasons (starting equipment, etc.) regardless of spell state; proven
explicitly by test 12's own design (it tests the spell-payload SHAPE directly via
`effectiveSpellSelections`, not through the full `toCreatePayload` gate, precisely because routing
around the real Phase-0 gate to make a payload test pass would have been exactly the kind of
production-completeness weakening this phase was told never to introduce).

#### Payload

`spellSelections: {requirementId, ref: {packageId, slug}}[]` only -- no `known`/`prepared`/
`requirementIds`/class list/level/school. Proven directly: every submitted entry's own key set is
exactly `['ref', 'requirementId']`.

#### Browser-shape tests added this round

`tests/components/characters/builder/characterBuilderSelection.test.ts` gained a new describe block
(10 tests) closing the exact gaps a prior pass left (only Wizard/Cleric/Fighter were covered):
Fighter (no section), Sorcerer (cantrip+ordinary), Cleric (ordinary prepared, no spellbook),
Paladin and Ranger (Level-1 half-caster baseline), Warlock (no Arcanum control), Wizard (3/6/4 all
at once), Wizard prepared-outside-spellbook refusal at the Builder plan level, a generic
same-requirement duplicate refusal (Cleric), and the payload transport-shape proof. Combined with
the pre-existing 7 tests (real caster/missing requirements, legal answer reduces missing, duplicate
refused, Wizard dependency, class switch, step completeness, non-caster), the file now covers all
12 scenarios this phase's own BROWSER-SHAPE TESTS section asked for.

#### DOM coverage, stated honestly

What IS tested: the pure Builder presentation/state boundary (`characterBuilderSelection.ts`'s own
exported functions), in Node, against the SAME normalized draft/context/plan shapes the real
`create-v2.vue` page constructs and reads -- not merely `planSpellAcquisition` in isolation. What is
NOT tested here: the actual rendered DOM (`CharacterChoiceSetPicker.vue`'s template, `create-v2.vue`'s
own compact/roomy markup) -- this repository's vitest config has no DOM environment (`environment:
'node'`), matching every other Builder-adjacent test file's own documented limitation. **Live
browser acceptance of the actual rendered Wizard flow (and the other four archetypes) is still
required after deployment**, and is not claimed here.

#### Phase 0 / availability (unchanged, re-verified)

647 total / 192 implemented / 420 blocked / 35 optional. Species 3/10, Classes 0/12, Backgrounds
0/16, Combinations 0/1,920.

#### Package impact

No package touched by this section at all (pure `app/components/characters/builder/` + its tests).
Confirmed via the same dry run §25.32 already ran: Rules CURRENT at 0.21.0, Content CURRENT,
Actions None.

#### Files

- Unchanged (confirmed, not redesigned): `app/components/characters/builder/
  characterBuilderSelection.ts`, `app/pages/worlds/[id]/characters/create-v2.vue`.
- Modified: `tests/components/characters/builder/characterBuilderSelection.test.ts` (+10 tests, one
  new describe block).

#### Verification (combined P3.3A + P3.3B, final)

`pnpm run test`: **197 files / 4163 tests -- all passing**, full suite, no exclusions.
`pnpm run typecheck`: 243 unique (file, diagnostic-code) pairs, identical to the established
baseline, zero new. `pnpm run build`: succeeds. `git diff --check`: clean. `pnpm packages:sync --
--world Solaris` (dry run): Rules CURRENT at 0.21.0, Content CURRENT, Actions None -- zero writes.
No commit made. No `packages:sync --apply` run.

### 25.34 P3.4 -- PROGRESSION SPELL ACQUISITION + LEVEL MANAGER WRITE-THROUGH (2026-10-08)

#### Scope

Makes the existing P3.2 target-state acquisition planner (`planSpellAcquisition`) usable during the
Game Admin Level Manager's own Preview/Confirm cycle (`server/utils/character-progression-plan.ts`'s
`planProgression`/`confirmProgression`). The SAME shared authority P3.1/P3.2/P3.3 already built --
`evaluateRequirements`/`evaluate`/`toResult`/`mergeSpellStateCandidate`/`planSpellAcquisition` --
is reused verbatim; this phase adds exactly one new server util
(`server/utils/character-progression-spell-acquisition.ts`, P3.3's creation-side sibling) and wires
its output into the planner, never a second interpretation of count/pool/membership/filtering
legality.

#### Target-state model, not an adjacent delta

A class's `SpellRequirement.totalByLevel` is already a CUMULATIVE target at any given level (P3.1's
own model). `buildProgressionSpellPlan` therefore calls `planSpellAcquisition` exactly ONCE, at
`targetLevel`, against the character's REAL PERSISTED `spellcasting.spells[]` (via
`character-assembly.ts`'s own already-resolved `AssembledSpellEntry[]`, never reconstructed from
`rules_choices`/progression history) -- `missing` is always `(target at targetLevel) - (currently
legal)`, never a sum of per-level deltas. A direct Level 1 -> 20 jump produces the complete deficit
in ONE Preview, proven directly (`tests/server/utils/character-progression-spell-acquisition.test.ts`'s
own Wizard 1->2/1->8/1->20 suite) and through the full Preview/Confirm route
(`tests/server/utils/character-progression-plan-spell-acquisition.test.ts`'s SUCCESS MATRIX/SECOND
LEVEL-UP). The EXISTING per-level `buildLevelStep` walk (automatic consequences, Definition/content
choices) is untouched -- spell acquisition deliberately does NOT reuse it.

#### Preview/Confirm contract

`planProgression` computes `spellPlan: ProgressionSpellPlan | null` (null for a class with no
`spellRequirements` at all) alongside the existing `steps`/`unresolvedChoiceIds`/
`unresolvedDecisions`, and folds its own completeness into `plan.valid` (`unresolvedChoiceIds.length
=== 0 && unresolvedDecisions.length === 0 && (spellPlan === null || spellPlan.complete)`) -- a
caster's spell deficit blocks Confirm exactly like an unanswered Definition choice, and an answered
Definition choice never bypasses a real spell deficit (or vice versa), per this phase's own LEVEL
MANAGER VALIDITY requirement.

`confirmProgression` rebuilds the IDENTICAL plan from the submitted `answers` (never trusting the
client's remembered plan) and checks, in order: Phase 0 unresolved decisions -> structural
preconditions (no-class-recorded / multiclass-not-supported, moved EARLIER than both choice families
this phase -- see WRITE ORDER / ORDERING below) -> the new spell plan's own completeness
(`reason: 'unresolved-spell-selection'`, 409) -> the existing Definition/content choice validity.
A crafted illegal/missing/duplicate/wrong-tier spell answer is refused before any write, proven by
the REJECTION MATRIX (12 cases: missing, unknown requirement, unknown ContentRef, wrong package,
wrong class list, wrong spell level, duplicate same-pool spell, over-count, Wizard prepared-outside-
membership, wrong Arcanum tier, stale fingerprint, and the generic "answers at a key naming no real
requirement changes nothing" case) -- every one asserts zero write
(`saveCharacterProgressionMock`/`saveCharacterSpellcastingMock` never called).

#### Ordering correction found while implementing (not a pre-existing bug)

The EXISTING `no-class-recorded`/`multiclass-not-supported` checks lived AFTER the Definition/
content choice validity check in the pre-P3.4 code. Adding the spell check in that same late
position broke an existing, approved test
(`confirmProgression -- persistence, ordering, and idempotency > refuses to guess when more than
one class entry exists`): a multiclass character with an otherwise-valid (nothing crossed) plan now
hit the NEW spell check first and reported `unresolved-spell-selection` instead of
`multiclass-not-supported`. Moved BOTH structural checks earlier (right after the Phase 0 check, before
either choice family) -- more fundamental than "is this one specific required-selection family
answered," since neither choice family's completeness is even a well-formed question for a character
this single-class-assuming planner cannot represent at all. This is a correction, not a scope change:
the checks' own logic is byte-identical, only their position moved.

#### WRITE ORDER (deliberate, and why)

Three writes may now occur on a single Confirm: `rules_choices` (existing, Phase 1B/1C), `progression`
/level (existing), `spellcasting` (new). Order: **rules_choices -> progression -> spellcasting**,
spellcasting strictly LAST.

Reasoning (extends, never reorders, the existing pair's own documented rationale at this file's own
header): writing spellcasting BEFORE the level write risks a WORSE partial-state failure than either
existing write's own accepted residual risk -- a bounded pool (cantrip/`spell`/arcanum) validates
against `totalByLevel[level - 1]`, so persisting NEW spells while the character's OWN persisted level
is still the OLD one could leave it showing a real, player-visible OVER-COUNT (too many spells for its
displayed level) if the level write then failed to happen at all. Writing it LAST means a failure here
instead leaves the character at the NEW level with its OLD (now under-target) spell state -- the SAME
"missing N more" degradation this system already tolerates for every untouched completeness gap, and
self-healing on the next Level Manager use for this class (the target-state planner always re-asks for
whatever is still missing, regardless of which level first surfaced it). FAIL LOUDLY (no `.catch`) --
the same posture create-v2.post.ts's own identical write already takes.

**Residual risk, reported honestly (per this phase's own instruction):** if `progression` succeeds but
`spellcasting` then fails, the character is now AT the new level with an incomplete spell state, and
re-confirming the EXACT SAME target level is impossible (`targetLevel <= currentLevel` now holds,
`not-advancement`). Recovery is NOT blocked, only indirect: the NEXT Level Manager Preview to any
HIGHER target re-surfaces the unmet deficit (target-state, not a delta, so nothing already-missing is
ever lost), or a GM can use the existing generic `spellcasting` PUT as a manual fallback (already
documented technical debt, unchanged by this phase). Judged the least-bad of the two orderings
available with no cross-collection transaction in this codebase -- not "materially worse" than the
existing accepted risk, so this was implemented directly rather than escalated.

#### FINAL FAILURE POSTURE -- proven, not merely argued (2026-10-08 follow-up)

The residual risk above was argued from the code's own structure; this follow-up proves it directly.
A new, focused mechanics-isolation test
(`tests/server/utils/character-progression-plan-spell-acquisition.test.ts`'s own `FINAL FAILURE
POSTURE` describe block) arranges a real Wizard Level 1 -> 2 Confirm that is otherwise fully valid
(Scholar answered, every spell requirement answered, `plan.valid: true`), then makes ONLY the new
`saveCharacterSpellcasting` write reject. Proven:

1. **Confirm fails loudly** -- the call REJECTS (`await expect(...).rejects.toThrow(...)`), never
   swallowed into a quiet `{ ok: false }`.
2. **No rollback is claimed or performed** -- `saveCharacterRulesChoices` and `saveCharacterProgression`
   were both already called (and, per their own mocks, succeeded) before the failing write; nothing
   here invents a compensating undo.
3. **Persisted `progression` reflects the new target level** -- asserted directly against the exact
   object `saveCharacterProgression` was called with (`classes[0].level === 2`).
4. **Persisted `spellcasting` remains old/incomplete** -- the write never landed; no repair or
   reconciliation workflow is invented for this case.
5. **A FRESH, independent re-evaluation of that EXACT partial state still reports a real, visible
   deficit.** `planProgression` itself would correctly refuse to even preview this exact state
   (`targetLevel === currentLevel` now that progression already advanced -> `not-advancement`) --
   so the invariant is proven one layer down, at the lowest authority boundary that actually answers
   "is this spell state complete at this level": `planSpellAcquisition` (P3.2) called directly with
   the real Wizard requirements, the real Level-2 slot table, and the TRUE (empty) persisted
   candidate set. `freshPlan.complete` is `false`, and spellbook/`spell`/cantrip each independently
   report `missing > 0`. **`progression.level` reaching the target is never treated as the spell
   state also being complete** -- the missing state stays detectable, fail-closed, by construction.

Repair/reconciliation UX for this exact partial state is explicitly NOT built in this phase --
recorded here as technical debt, not silently assumed away. No Level Manager redesign was undertaken
to provide one.

#### FINGERPRINT -- the literal ask vs. the actual protection (reported, not silently substituted)

This phase's own brief asked that the fingerprint change whenever a spell answer changes. Investigated
directly: the EXISTING `fingerprintFor(currentLevel, packageIntegrityHash, contentBindingFingerprint)`
is deliberately answer-independent (this file's own header: "there are no choices today whose ANSWERS
could also go stale independently"). Extending it to also hash the submitted `answers` map was
prototyped and REJECTED after tracing its effect against the existing, approved test
`confirmProgression re-derives everything -- a valid fresh fingerprint plus a real answer succeeds`:
that test (and the real workflow it proves) previews with NO answers, then confirms DIRECTLY with the
real final answer under the SAME fingerprint -- an answer-sensitive fingerprint would reject this
exact, already-accepted pattern as "stale" purely because the answers differ from what was hashed at
preview time, which is not what staleness means here.

**The real protection was already in place and is stronger than a fingerprint check:** `confirmProgression`
rebuilds the ENTIRE plan (Definition/content choices AND the new spell plan) from the SUBMITTED
answers on every call, and refuses if incomplete/illegal -- regardless of what the fingerprint
encodes. Proven directly
(`tests/server/utils/character-progression-plan-spell-acquisition.test.ts`'s own FINGERPRINT
describe block): two previews with different (irrelevant) answers under the SAME starting state
produce the IDENTICAL fingerprint by design, and confirming under that fingerprint with incomplete
spell answers is STILL refused (`unresolved-spell-selection`) -- not because the fingerprint caught
anything, but because full re-validation did. The shared fingerprint formula was left unmodified. If
an answer-sensitive fingerprint is still wanted as a UX nicety (e.g. so a stale PREVIEW can be flagged
before the illegal-answer message appears), that is a separate, larger change to the fingerprint's own
opaque contract (every existing confirm test's own "(fingerprint, answers)" pairing would need
re-auditing) and was not undertaken without explicit sign-off.

#### WIZARD -- the critical two-tier case

Proven at Level 1 -> 2 (totals genuinely increase: spellbook 6 -> 8, cantrip 3 -> 4), Level 1 -> 8
(spellbook target 20, the exact `20 - 6 = 14` deficit this phase's own brief cites), and Level 1 -> 20
(spellbook 44, prepared 25, cantrip 5, each independently `target - persisted`) --
`tests/server/utils/character-progression-spell-acquisition.test.ts`. DEPENDENT EVALUATION: a NEW
tentative spellbook pick becomes a legal PREPARED option within the SAME `buildProgressionSpellPlan`
call, no save/reload/prepare round trip (`mergeSpellStateCandidate` merging tentative + persisted
candidates before the membership-gated `spell` pool is evaluated). The full real walk (Scholar @2,
Subclass @3, two ASI thresholds @4/@8, answered ALONGSIDE the spell deficit in one Confirm) is proven
end-to-end in `character-progression-plan-spell-acquisition.test.ts`'s SUCCESS MATRIX C, including the
canonical write: spellbookTarget + cantripTarget physical rows, the `spell`-tagged (prepared) refs
merging onto the SAME rows as their spellbook membership (never a second physical row).

#### WARLOCK -- four independent Arcanum tiers

Proven that tiers 6/7/8/9 each have a nonzero target ONLY at targets 11/13/15/17 respectively (and
every combination in between), with zero cross-tier contamination (an already-satisfied Arcanum-6
never leaks into Arcanum-7's own count at Level 13) --
`tests/server/utils/character-progression-spell-acquisition.test.ts`. SECOND LEVEL-UP proven through
the full route: Confirm to Level 11 (Arcanum-6), then a LATER Confirm to Level 13 only requests
Arcanum-7 -- Arcanum-6 is never re-asked, and its own physical row survives untouched through the
canonical merge (`character-progression-plan-spell-acquisition.test.ts`).

#### HALF CASTERS -- Paladin/Ranger

`progressionSpellSlotLevels` proven to grow strictly between Level 2 and Level 20 for BOTH classes
independently, off the REAL Rules 0.21.0 corrected `table:spellcasting.slots_half` -- no 2014
assumption, no class branch. The full Preview/Confirm route for Paladin/Ranger specifically was NOT
additionally driven through the integration harness in this phase (their own Level-2 Fighting Style
choice is an unrelated required family this phase did not need to re-prove); the pure target-level
legality proof above is the acceptance evidence for D/E, reported honestly rather than claimed via a
test that doesn't exist.

#### OTHER CASTERS -- Bard/Sorcerer, Cleric/Druid

Sorcerer (cantrip + ordinary) and Cleric (ordinary prepared, no spellbook) proven end-to-end through
Confirm, Level 1 -> 2 (the one real target level with zero unrelated required choices for either
class) -- SUCCESS MATRIX A/B.

#### REPEAT PREVIEW / fresh reload

After a successful Confirm, re-deriving the written rows as the new persisted state and previewing a
HIGHER target level shows the already-answered portion still legally owned (`legalCount` preserved)
and `missing` equal to only the INCREMENTAL deficit, never the full total again --
`character-progression-plan-spell-acquisition.test.ts`'s REPEAT PREVIEW block (Sorcerer) and the
SECOND LEVEL-UP block (Warlock) both prove this independently.

#### PERSISTENCE SENSITIVITY

Wizard (the real cross-pool collision) and Sorcerer (a simpler single-pool case), per this phase's own
explicit "Wizard + one non-Wizard" instruction: Confirm-written rows validate `spellPlan.complete` on
a fresh reload; a BROKEN COPY with every `requirementIds` stripped reproduces the real pre-P3.2.1
cross-pool collision for Wizard (`complete: false`) without ever mutating the original write (asserted
via `Object.freeze` + a post-probe re-check of the SAME written object).

#### Canonical write -- a DIFFERENT merge function from P3.3's, not a generalization of it

`buildProgressionAcceptedSpellEntries` (new, `character-progression-spell-acquisition.ts`) PATCHES the
character's EXISTING persisted rows (by identity, preserving `instanceId` and any unrelated tag) and
adds exactly one NEW row per genuinely new identity -- `buildAcceptedSpellEntries` (P3.3, creation)
is correct only for creation's own `candidates: []` starting point and was deliberately NOT reused or
generalized for progression, which must never rebuild the array from scratch. Proven: an untouched
existing row survives byte-for-byte; a newly-accepted identity across TWO requirements at once (e.g.
Wizard spellbook+prepared) gets exactly one row; an identity that already has a row gains a SECOND
tag on the SAME row when a later confirm also accepts it under another requirement; retrying the
identical accepted answers twice reproduces the exact same rows (idempotent).

#### P3.3 regression

Zero changes to `server/api/worlds/[id]/characters/create-v2.post.ts`, `character-spell-acquisition.ts`,
or the Builder's own P3.3B presentation. The full suite (including every P3.3 creation/Builder test)
remains green. P3.3's own live DOM acceptance remains deferred for the same, unrelated Phase 0 reason
already recorded (§25.32/§25.33) -- not reopened by this phase.

#### Browser acceptance status

The Level Manager's spell section (`CharacterProgressionPanel.vue`, new template block +
`selectSpellOption` handler, reusing the Builder's own "plain `<select>` per missing slot" control --
no new searchable/autocomplete component, same backlog note as P3.3B) is wired through the identical
generic `answer`/`setAnswer` wire protocol every existing Definition choice already uses -- zero
changes to `useCharacterProgression.ts`/`sheet-v2.vue`'s own handlers, which were already fully
generic. **Live browser acceptance is deferred for the SAME reason P3.3's was** (§25.32/§25.33): the
real production Phase 0 completeness gate still blocks every real caster class on OTHER, unrelated
mandatory decisions (starting equipment, weapon mastery, etc.) regardless of spell-progression
mechanics, so a real admin cannot yet reach a confirmable Level-Up for any real caster in production.
This is not a P3.4 failure, and the creation gate was not weakened to expose it.

#### P3.5 boundary (untouched)

Zero reclassification. The 174 class-owned spell decisions (`blk:caster-counts`/
`blk:caster-l1-spell-choice`/`blk:class-spell-choice-other` in `mandatory-decision-coverage.ts`)
remain `blocked` -- the mechanism to CORRECTLY resolve them now exists (creation AND progression
alike), but the Phase 0 classification itself is P3.5's own, separate, not-yet-started job. Phase 0
counts unchanged: 647 total / 192 implemented / 420 blocked / 35 optional. Availability unchanged:
Species 3/10, Classes 0/12, Backgrounds 0/16, Combinations 0/1,920.

#### Package impact

Zero. `packages/eldra-dnd5e-2024` untouched -- confirmed via `pnpm packages:sync --world Solaris`
(dry run): Rules CURRENT at 0.21.0, Content CURRENT, Actions None.

#### Files

- New: `server/utils/character-progression-spell-acquisition.ts`, `tests/helpers/
  satisfying-spell-fixture.ts`, `tests/server/utils/character-progression-spell-acquisition.test.ts`
  (32 tests, pure-module), `tests/server/utils/character-progression-plan-spell-acquisition.test.ts`
  (21 tests, full Preview/Confirm integration, including the FINAL FAILURE POSTURE proof above).
- Modified: `app/lib/characters/progression-plan.ts` (`ProgressionSpellPlan`/
  `ProgressionSpellRequirementPlan` types, `spellPlan` field on `ProgressionPlan`),
  `app/lib/characters/spell-acquisition-plan.ts` (`spellPoolLabel` promoted here from the Builder,
  `extractTentativeSpellSelections` added), `app/components/characters/builder/
  characterBuilderSelection.ts` (re-exports the promoted `spellPoolLabel`, no logic change),
  `server/utils/character-progression-plan.ts` (`CurrentProgressionState` gained `spells`/
  `expendedSlots`/`classFacet`; `planProgression`/`confirmProgression` wired to the new spell
  authority; structural-precondition checks moved earlier -- see ORDERING CORRECTION above),
  `app/components/characters/CharacterProgressionPanel.vue` (spell section, generic, no class name),
  `tests/rules/completeness-stub-policy.test.ts` (+1 `UNIT_STUBBING` entry), four existing
  progression test files (`character-progression-plan.test.ts`,
  `character-progression-all-class-subclass.test.ts`, `character-progression-level-1-to-20.test.ts`,
  `character-progression-published-package.test.ts`) given satisfying persisted spell-state
  fixtures wherever a caster class was already used as a convenience fixture for unrelated
  mechanics -- the identical remediation P3.3 already applied to
  `create-v2-fighter-mechanics.test.ts`'s own Wizard fixture.

#### Verification

`pnpm run test`: **199 files / 4216 tests -- all passing** (4163 pre-existing + 53 new), full suite,
no exclusions. `pnpm run typecheck`: 243 unique (file, diagnostic-code) pairs, identical to the
established baseline, zero new. `pnpm run build`: succeeds. `git diff --check`: clean.
`pnpm packages:sync --world Solaris` (dry run): Rules CURRENT at 0.21.0, Content CURRENT, Actions
None -- zero writes. No commit made. No `packages:sync --apply` run.
