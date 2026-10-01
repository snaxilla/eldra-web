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
4. [ ] A character of each class can be advanced, one level at a time, from 1 to 20 with no
   manually-patched Directus fields.
5. [ ] Every mandatory progression choice (subclass, ASI/feat at the real per-class levels from
   §3, spell selection where applicable) is presented and resolvable in the UI at the correct
   level.
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
