# Character Sheet Beautification Pass

**Status:** Plan — approved for phased implementation
**Scope:** UX, product, and component architecture for the canonical Character Sheet
**Non-scope:** Gameplay systems, Rules Engine architecture, Content Pack architecture, persistence model

---

## 0. Purpose

Define the **canonical Character Sheet experience** that replaces the legacy V1 sheet entirely.

This is not "make the V2 page less ugly." V2 has the correct architecture and the wrong
experience. V1 has the wrong architecture and — in several specific, identifiable ways — the
right experience. This document specifies how to rebuild V1's hard-earned table-facing UX on
V2's architecture, in independently shippable phases.

### How to use this document

- **Sections 1–2** are the audits. Read them to understand *why* each decision below was made.
- **Sections 3–8** are the design. This is the target state.
- **Section 9** is the flow catalogue — the acceptance criteria for "does it actually work at a table."
- **Sections 10–11** are the execution plan. Each phase is intended to be one implementation task.
- **Section 12** is the risk register and open questions. Read before starting any phase.

### What was audited

| Area | Files |
|---|---|
| V1 sheet | `app/pages/worlds/[id]/entities/[entityId]/sheet.vue` (8,872 lines) |
| V1 components | 30 × `app/components/characters/Sheet*.vue` (~11,400 lines) |
| V2 sheet | `app/pages/worlds/[id]/characters/[characterId]/sheet-v2.vue` (1,486 lines) |
| V2 components | 8 × `app/components/characters/Character*.vue` (~1,600 lines) |
| Supporting systems | `character-assembly`, `character-derived`, `character-actions`, `character-combat`, `character-recovery`, `character-actor-bridge` |
| Encounter UI | `app/pages/worlds/[id]/encounters/**`, `app/lib/encounters/` |
| Rules Package | `packages/eldra-dnd5e-2024/` (definitions inventoried by category) |
| Shell constraints | `app/layouts/world-workspace.vue`, `app/components/world/WorldWorkspaceSidebar.vue`, `app/assets/css/*` |

---

## 1. V1 Audit

### 1.1 What V1 did well — and precisely why

**1. A persistent vitals + navigation command center.**
`sheet.vue:7591–7925` is a 335-line sticky mobile header that keeps six things on screen at all
times: character name, portrait, four stat tiles (`AC / Init / Spd / PB`, from
`mobileHeaderStatCards`, `sheet.vue:5818`), the tab bar, a horizontally-scrollable spell-slot
strip, and popovers for Rest and HP.

*Why this matters:* during play, a player looks at their sheet for one of three reasons — "what's
my AC," "how much HP do I have," "what can I do." V1 answers the first two without a scroll or a
tap, from any tab. That is the single biggest UX difference between the two sheets.

**2. A true three-column desktop dashboard.**
`SheetDesktopOverviewDashboard.vue:216`:
```
xl:grid-cols-[300px_340px_minmax(0,1fr)]
2xl:grid-cols-[320px_380px_minmax(0,1fr)]
```
Semantically `<aside> / <main> / <aside>`:

| Column | Width | Contents |
|---|---|---|
| Left | 300–320px | Character card + portrait + "Manage Character", Ability Scores, Saving Throws, Passives |
| Center | 340–380px | Combat stat tiles (HP spans 2 columns), Skills, Proficiencies / Training, At A Glance |
| Right | fluid | Defenses / Conditions, quick actions, action surfaces |

*Why this matters:* this is the physical layout of a paper character sheet, and it uses a 2560px
monitor as a 2560px monitor. Reference data (abilities, saves, skills) is stable and belongs in
fixed-width rails; the working surface (what you're doing right now) gets the fluid column.

**3. A unified, filterable Action Center.**
`SheetActionCenter.vue` — segmented tabs (Actions / Spells / Inventory / Features & Traits /
Notes), a **sticky filter bar** (`sticky top-0 z-10`, line 821) with timing filters
(All / Attack / Action / Bonus Action / Reaction / Other, line 101), a bounded scroll region
(`max-h-[560px] overflow-y-auto`, line 841), and per-panel search.

*Why this matters:* "what can I do right now" is one question, not five. Filtering by timing is
how a player actually thinks on their turn ("what are my bonus actions?"). Bounding the scroll
region keeps the surrounding context visible instead of losing it above the fold.

**4. Tap-to-spend spell slot gems.**
`sheet.vue:7907–7920` — each slot is a 14px rotated-45° button; tapping expends it. Grouped by
level, horizontally scrollable, live in the sticky header.

*Why this matters:* it is the highest-frequency spellcaster interaction in play, reduced to one
tap from anywhere on the sheet, with the state legible at a glance.

**5. Count badges on navigation.**
`sheetTabCounts` (`sheet.vue:759`) feeds inventory/spell/feature counts and pending level-up
choices into the tab bar.

*Why this matters:* it surfaces "you have unspent choices" without a modal, and gives a sense of
scale before you navigate.

**6. Progressive disclosure via detail drawers.**
Dedicated drawers for item, spell, feature, and note detail
(`SheetItemDetailDrawer`, `SheetSpellDetailDrawer`, `SheetFeatureDetailDrawer`,
`SheetNoteDetailDrawer`).

*Why this matters:* lists stay dense and scannable; full rules text is one tap away and doesn't
navigate you off your current context.

**7. Explicit play/build separation.**
`mode === 'build'` gates editing affordances; `mobileSheetTabs` even hides the Stats tab outside
build mode (`sheet.vue:745`).

*Why this matters:* the sheet is calm during play and capable during prep, without two pages.

**8. Visible save state.**
`SheetSaveStatus.vue` plus inline per-region `saving / error / success` text.

*Why this matters:* an autosaving sheet that never says "saved" is an anxiety generator at a table
where someone just took 14 damage.

**9. Standard-action affordances.**
`standardActionCards` (`sheet.vue:658`) lists Attack / Dash / Disengage / Dodge / Help / Hide /
Ready / Use Object with descriptions.

*Why this matters (with a caveat):* new players do not know what their options are. Listing the
universal actions is genuinely valuable. **But V1 hardcoded them in Vue, which V2 must not do** —
see §1.9.

### 1.2 What V1 did poorly

1. **8,872 lines in one page component**, 7,547 of them script. No composables, no extraction.
2. **Prop-drilled callbacks.** `SheetDesktopOverviewDashboard` takes ~50 props including ~20
   function props (`rollAbilityCheck`, `castSpell`, `toggleSpellSlot`, …). `SheetActionCenter`
   takes 64 props. This is a page component wearing a component's clothes.
3. **Inline rules math.** Modifiers, save bonuses, slot progression, and spell mechanics are
   computed in the page. This is precisely what the Rules Engine now owns.
4. **Legacy persistence.** `character_sheets` via `PUT /api/worlds/:id/entities/:id/sheet` — a
   whole-document save called from **11 distinct sites** in the page, plus one from a child
   component (`SheetLevelSetupChoices.vue:230`).
5. **String-heuristic classification.** `timingFilter()` (`SheetActionCenter.vue:118`) infers
   action timing by substring-matching prose. Fragile and system-specific.
6. **Top-mounted mobile navigation.** The mobile tab bar lives inside the sticky *top* header
   (`SheetTabBar.vue:34`, `variant="mobile"`). On a phone that is the furthest point from the
   thumb. V1 got the sticky header right and the navigation position wrong.
7. **Popover-in-header pattern doesn't scale.** Rest and HP popovers are absolutely positioned
   inside a sticky header with manual `z-[80]` and click-outside handling — fine for two, unusable
   for six.
8. **No container queries.** All responsiveness is viewport-based, so panels can't adapt when the
   column they live in changes width.

### 1.3 Layout patterns that survive

| Pattern | Verdict | Target |
|---|---|---|
| 3-column desktop dashboard (`aside/main/aside`) | **Survives** | §4 |
| Fixed-width reference rails + fluid working column | **Survives** | §4 |
| Persistent vitals strip | **Survives, promoted** to all breakpoints | §3.1 |
| Bounded-scroll list regions with sticky filter bar | **Survives** | §6.3 |
| Stat tiles (2-col grid, HP spanning 2) | **Survives** | §4 |
| Horizontally scrollable resource strip | **Survives** | §3.1 |
| Mobile tab bar inside the top header | **Retired** — moves to bottom nav | §6.1 |
| Popovers anchored in a sticky header | **Retired** — becomes sheet/drawer | §6.2 |

### 1.4 Interactions that survive

- Tap a spell-slot gem to expend / restore it.
- Tap a stat tile to open the thing that changes it (HP tile → HP editor).
- Filter a combined action list by timing.
- Search within a list without leaving it.
- Tap a list row to open a detail drawer; the list keeps its scroll position.
- Count badges on navigation.
- Explicit play/build mode.
- Visible, per-region save state.

### 1.5 V1 components conceptually reused (idea kept, code replaced)

| V1 component | Idea worth keeping | V2 successor |
|---|---|---|
| `SheetDesktopOverviewDashboard` | 3-column dashboard, region grouping | `CharacterSheetDesktopLayout` (§8) |
| `SheetActionCenter` | Unified filterable action surface | `CharacterActionsPanel` + `CharacterActionFilterBar` |
| `SheetTabBar` | Nav with count badges, two variants | `CharacterSheetNav` (3 variants) |
| `SheetCombatPanel` | Compact combat summary | `CharacterVitalsBar` |
| `SheetRestControls` | Short/Long rest affordance | `CharacterRecoveryPanel` |
| `SheetAbilityGrid` | Ability tile grid | `CharacterAbilityGrid` (now score **+ modifier + save**) |
| `Sheet*DetailDrawer` (×4) | Progressive disclosure | one generic `CharacterDetailDrawer` |
| `SheetSaveStatus` | Persistent save feedback | `CharacterSaveIndicator` |
| `SheetCurrencyLedger` | Currency tracking | **Blocked** — see §1.8 |
| `SheetClassResources` | Limited-use resource pips | **Blocked** — see §1.8 |

### 1.6 V1 components retired completely

Retired because their concern now belongs to the Builder, the Rules Engine, or the Content
Pipeline — not the sheet:

`SheetLevelManager`, `SheetLevelSetupChoices`, `SheetSelectedFeats`, `FeatChoicePanel`,
`ClassSubclassChoicePanel`, `ClassSpellChoicePanel`, `ClassEquipmentChoicePanel`,
`BackgroundChoicePanel`, `SheetManageCharacterRail`, `SheetManageInventoryRail`,
`SheetManageSpellsRail`, `SheetManageContextRail`, `SheetDesktopToolbar`,
`SheetDesktopIdentityHeader`, `SheetDesktopPortraitFrame`, `SheetDesktopOverviewCards`,
`SheetStatsTab`, `SheetActionsTab`, `SheetInventoryTab`, `SheetSpellsTab`, `SheetFeaturesTab`,
`SheetNotesTab`, `SheetSpellBuilderDrawer`.

> The "Manage rails" pattern (a slide-in editing rail per domain) is retired deliberately. V2's
> model is that **the Sheet displays and the Builder edits**, with three standing exceptions
> (Inventory, Health, Spellcasting) that change *during play*. Conditions is the fourth. Rails
> re-introduce a parallel editing surface that the Builder already owns.

### 1.7 V1 features already rebuilt in V2

Identity/Species/Class/Background · Ability scores · Ability modifiers · Proficiency bonus ·
Saving throws · Skills · Armor Class · Hit Points · Temporary HP · Death Saves · Hit Dice ·
Short/Long Rest · Damage & healing application · Inventory (equip/attune/quantity) ·
Notes · Spell slots · Prepared/known spells · Spell Save DC · Spell Attack Bonus ·
Actions list · Attack resolution · Content presentation (traits/features) · Conditions ·
Encounter/initiative.

### 1.8 V1 features with **no** V2 equivalent

Split by cause — this distinction determines whether the Beauty Pass can fix it.

**(a) UI gaps — fixable inside this pass:**

| Gap | Note |
|---|---|
| **Character level not displayed anywhere** | `value:level` exists in the package (`progression`) but `progression` is not in `DERIVED_SHEET_REGIONS` and the identity header shows only Species/Class/Background. A character sheet that never states the character's level. **Fix in Phase 5.** |
| Portrait / character image | `entity.image` exists; V2 never renders it. |
| Melee/Ranged Attack Bonus not in any summary | `combat` category exists but is not a rendered region; the values appear only attached to individual action rows. |
| No search anywhere | V1 had search in 4 panels. |
| No detail drawers | V2 renders full prose inline, so lists cannot stay dense. |
| No save-state indicator | Per-panel `saving` booleans exist but are only used to disable buttons. |
| No play/build distinction | V2 is always in "display" mode with 4 editable exceptions. |

**(b) Rules Package gaps — *blocked*, out of scope for this pass:**

Verified absent from `packages/eldra-dnd5e-2024/definitions.json`:

| Missing | Consequence |
|---|---|
| **Speed** (no `movement` category) | Cannot show Speed. V1 showed it in the header. |
| **Initiative** | Cannot show an initiative modifier. Encounter initiative is rolled as `1d20 + dex.mod` in `encounter-actions.ts` without a package Value. |
| **Passive Perception** | V1 had a "Passives" section. |
| **Currency** | Rule Category 16, explicitly deferred in `inventory.ts`. |
| **Class resources** (Rage, Ki, Channel Divinity…) | `SheetClassResources.vue` has no V2 counterpart. |
| **Feats** | No feat Definitions; noted in `content-rules/dnd5e-2024.ts`. |

> **These must not be reintroduced by computing them in Vue.** That is exactly the V1 mistake
> the architecture exists to prevent. They require Rules Package authoring, which is a separate
> milestone. The sheet design in §3 reserves space for them so they can appear without a
> redesign — see §3.3.

**(c) Deliberately not returning:** dice rolling in the browser. V1 rolled ability checks, saves,
skills, and weapon attacks client-side via `EldraDiceBox`. V2 resolves attacks **server-side**
with a seeded, reproducible RNG (`character-combat.ts`). A 3D dice *presentation* layer could
later animate a server result, but the sheet must never compute a roll again.

### 1.9 V1 UX ideas worth preserving even though the code is not

1. **"Everything you can do, in one filterable place."** Preserve the surface; replace
   `timingFilter()`'s prose-matching with structured filtering on `ContentAction.category` and
   the presence of `ContentAction.resolution`.
2. **Universal actions are worth listing.** Dash/Dodge/Disengage/Help/Hide/Ready are genuinely
   useful to new players — but they must arrive as **content or Rules Package data**, never as a
   Vue array. Until then, the Actions panel shows only what the pipeline produces, and the empty
   state explains why. *(Recorded as a Rules Package follow-up, not a Beauty Pass item.)*
3. **The sheet should feel calm during play and capable during prep.**
4. **Never make a player scroll to find their HP.**
5. **Density is a feature, not a bug** — for reference data. Prose still needs room.

---

## 2. V2 Audit

### 2.1 What V2 does architecturally right

This is the part worth protecting, and it is substantial:

- **Clean layering.** Content Pack → Content Presentation / Content Actions → Rules Facets →
  Rules Package → Rules Engine → Actor Bridge → Derived Projection → Sheet. Each boundary is
  documented and tested.
- **Zero calculation in Vue.** Every number is Rules Engine output. `CharacterDerivedPanel`
  explicitly cannot compute anything.
- **Game-agnostic rendering.** The sheet selects **Rule Categories**, not Definition IDs
  (`DERIVED_SHEET_REGIONS`), so a non-D&D package renders without a code change.
- **Pure, testable mutation modules.** `app/lib/characters/*.ts` and `app/lib/encounters/*.ts`
  are pure, total, non-mutating, and re-validated on read.
- **Orchestrators, not god-objects.** `character-recovery`, `character-combat`,
  `encounter-actions` each read → ask the engine → apply a pure function → persist.
- **Consistent persistence.** Every player-authored block uses the same `block_instances`
  find-then-PATCH-or-POST shape. No `character_sheets` dependency.
- **Visible degradation everywhere.** Missing content, unconfigured rules, and broken packages
  are distinct, rendered states — never silent zeros.
- **1,935 passing tests.**

### 2.2 What V2 does visually wrong — bluntly

**It is a pile of cards.** Nine `<section>` elements with byte-identical wrapper classes:

```
eldra-ornate-panel eldra-frame-corners rounded-none border
border-[rgba(201,164,90,0.24)] bg-[rgba(10,12,14,0.64)] p-5 backdrop-blur
```

Copy-pasted nine times (`sheet-v2.vue`, verified). Consequences:

1. **No visual hierarchy.** Hit Points, Notes, and Species prose have identical visual weight.
   Nothing on the page tells you what matters. The eye has no entry point.
2. **Ornate frames on everything = ornate frames on nothing.** `eldra-ornate-panel` +
   `eldra-frame-corners` is expensive chrome; applied to all nine sections it becomes noise and
   costs ~9 backdrop-blur layers.
3. **Every section header is the same 10px `tracking-[0.3em]` gold kicker.** No size, weight, or
   color differentiation between "Health" and "Notes."
4. **Numbers are not typographically privileged.** AC, HP, and Save DC render at
   `text-base`/`text-lg` inside dense label/value rows. On a real sheet these are the largest
   glyphs on the page.
5. **The page is a form, not a sheet.** Bare `<select>`, `<input>`, and `<datalist>` elements
   dominate Spellcasting, Encounter, and Conditions. It reads as a database admin panel.
6. **No iconography.** V1 used Lucide icons throughout; V2 uses none. Every affordance is a word.
7. **Empty and error states are unstyled prose.** `"Nothing yet -- equip a weapon, prepare a
   spell..."` as bare text where V1 had composed empty states.
8. **The `--` literal leaks into the UI.** Em-dashes written as `--` appear in user-facing copy
   (e.g. the Actions empty state). Fine in code comments; wrong on screen.

### 2.3 What V2 does structurally wrong

**1. Section order is close to worst-case for play.**

Actual order: Identity → Ability Scores → Derived → **Inventory** → **Notes** → **Health** →
Spellcasting → Actions → Encounter/Conditions → Species/Class/Background prose.

Health is **6th**. Actions is **8th**. Notes — the least time-critical content on the sheet —
is **5th**, above both. On a phone that is roughly two full screens of scrolling to reach your
hit points during combat.

**2. Ability scores are split from their modifiers.**
`CharacterAbilityScoresPanel` renders the raw score (`16`) only. The modifier (`+3`) — the
number actually used at the table — lives in a *different card* (the Derived panel's "Abilities"
region), as does the save bonus. Reading "STR 16 (+3), Save +5" requires looking in two places.

**3. The page component is accumulating a V1-shaped script.**
1,486 lines: 20 `ref`s, 27 `computed`, 21 functions, 5 `watch`, **6 `useFetch` calls**. Encounter
and Conditions logic (~130 lines) is inline in the page rather than in a component. This is the
early shape of the exact sprawl V2 exists to avoid.

**4. Sequential request waterfall + server-side redundancy.**

Three blocking `await useFetch` calls run in sequence (`assembly`, `derived`, `actions`), plus
three lazy ones. Worse, on the server:

```
GET /assembly  → assembleCharacter                                    (1×)
GET /derived   → assembleCharacter + runtime + evaluate                (1×)
GET /actions   → assembleCharacter + getDerivedCharacter(→ assemble)   (2×)
```

**`assembleCharacter` runs 4× per page load**, each doing an entity read, a 7-block read, and a
full World Content Catalogue resolution. `getWorldRuntime` (package load + registry + dependency
graph) runs 2×. Combat resolution costs up to **5** assemblies.

**5. `pending` states are ignored at page level.** `derivedPending` and `actionsPending` exist but
the page renders its skeleton off `assembly` alone, so regions pop in.

**6. Two sections silently render nothing useful.** The `combat` and `progression` categories are
computed by the engine and never surfaced (§1.8a).

### 2.4 Mobile: what V2 does well

- Touch targets are disciplined: `min-h-11` (44px) is used consistently across every panel's
  buttons; death-save marks are `size-11`.
- Death saves, hit dice, and slot steppers are one-tap, no keyboard.
- `inputmode="numeric"` on numeric fields.
- Single column never breaks horizontally.
- Genuine accessibility care: `aria-label`, `aria-pressed`, `sr-only`, `:disabled` on every
  action button.

### 2.5 Mobile: what V2 does poorly

**1. The workspace shell is not responsive — this is the blocking defect.**
`app/layouts/world-workspace.vue:144`:
```js
gridTemplateColumns: leftCollapsed ? '68px minmax(0,1fr)' : '280px minmax(0,1fr)'
```
No breakpoint. `WorldWorkspaceSidebar.vue` contains **zero** responsive utilities. On a 390px
phone the sidebar consumes 280px, leaving **110px** of content — or 322px if the user knows to
collapse it. **No amount of work inside the sheet fixes this.** It is Phase 0.

**2. The sheet template has essentially no responsive layout.** Across 542 template lines, exactly
two responsive utilities are used — `sm:px-6` and `sm:py-10`. Both are padding.

**3. Nothing is sticky.** No vitals bar, no nav. Every lookup is a scroll.

**4. No bottom navigation.** Nine stacked sections with no way to jump.

**5. Nothing is collapsible.** Species/Class/Background prose sections are fully expanded, pushing
everything else down.

**6. `window.prompt()` for initiative override** (`encounters/[encounterId].vue`). Native prompts
are a poor mobile experience and unstyleable.

### 2.6 Desktop: what V2 does well

- `CharacterDerivedPanel` and `CharacterAbilityScoresPanel` use **container queries**
  (`@container`, `@sm:grid-cols-2`, `@2xl:grid-cols-3`, `@2xl:grid-cols-6`). This is the correct
  modern primitive and should become the house standard — those panels will adapt automatically
  when placed into rails.
- Semantic markup (`<dl>/<dt>/<dd>`, `<article>`, `<section>`).

### 2.7 Desktop: what V2 does poorly

**It is a stretched mobile page.** `max-w-4xl` (896px) single column at every breakpoint. On a
1920px display roughly 54% of the viewport is empty; on 2560px, 65%. Nine cards stack vertically
in a narrow ribbon. There is no rail, no dashboard, no sticky summary, no use of width. V1's
`xl:grid-cols-[300px_340px_minmax(0,1fr)]` is strictly better and already exists in this codebase.

### 2.8 Component verdicts

| Component | Verdict | Action |
|---|---|---|
| `CharacterDerivedPanel` | **Keep** | Container queries + visible-error handling are right. Add compact density variant. |
| `ContentPresentationPanel` | **Keep** | Shared with Builder; works. |
| `CharacterAbilityScoresPanel` | **Redesign** | Merge score + modifier + save into one tile → `CharacterAbilityGrid`. |
| `CharacterHealthPanel` | **Split** | Display/quick-adjust → `CharacterVitalsBar`; rest/hit dice/death saves → `CharacterRecoveryPanel`. |
| `CharacterActionsPanel` | **Redesign + split** | Extract `CharacterActionCard`, `CharacterActionFilterBar`, `CharacterTargetPicker`, `CharacterCombatResult`. |
| `CharacterSpellcastingPanel` | **Split** | Slot tracker → `CharacterSpellSlotTracker` (promotable to vitals bar); list → `CharacterSpellList`. |
| `CharacterInventoryPanel` | **Keep + refine** | Best-structured V2 panel (6 responsive utilities). Add search, move detail to drawer. |
| `CharacterNotesPanel` | **Keep + refine** | Add autosave indicator. |
| Encounter/Conditions (inline in page) | **Extract** | → `CharacterEncounterPanel`, `CharacterConditionsPanel`. |
| The 9 copy-pasted `<section>` wrappers | **Consolidate** | → `CharacterSheetSection`. |

---

## 3. Canonical Information Architecture

### 3.1 Placement tiers

Six tiers, in descending priority. Every item in §3.2 is assigned exactly one **per breakpoint**.

| Tier | Definition | Rule |
|---|---|---|
| **T0 — Vitals Bar** | Sticky, visible from every tab, every breakpoint | HP, AC, Save DC / Attack, conditions, turn state. Never scrolls away. |
| **T1 — Rail** | Persistent side column (desktop/tablet-landscape only) | Reference data you *read* but rarely change. On smaller screens it becomes a T2 tab — never removed. |
| **T2 — Tab** | Primary navigation destination | One question per tab. 5 tabs maximum. |
| **T3 — Accordion** | Collapsible within a tab | Long prose; collapsed by default on phone, expanded on desktop. |
| **T4 — Drawer** | Overlay opened from a list row | Full detail without losing list position. |
| **T5 — Builder** | A different page entirely | Character creation/level-up decisions. |

**The capability rule:** an item may change tier between breakpoints. It may **never** be removed
at a breakpoint. Nothing is desktop-only.

### 3.2 Assignment

| Item | Desktop | Tablet | Phone | Why |
|---|---|---|---|---|
| Name, portrait, level, Species/Class/Background | T1 left rail | T1 left rail (landscape) / T0 compact (portrait) | T0 compact + T2 *Character* | Identity is orientation, not action. Compact on phone: name + level + class in the bar. |
| **Hit Points / Temp HP** | **T0** | **T0** | **T0** | The most-consulted number in play. Never more than zero taps away. |
| **Armor Class** | **T0** | **T0** | **T0** | Consulted on every incoming attack. |
| Spell Save DC / Spell Attack | T0 (casters) | T0 (casters) | T0 (casters) | Quoted aloud constantly by casters; hidden entirely for non-casters. |
| **Active Conditions** | **T0** chips | **T0** chips | **T0** chips | Changes how every other number is used. Must be impossible to forget. |
| Encounter turn state | T0 badge | T0 badge | T0 badge | "Is it my turn" is a glance, not a navigation. |
| **Spell slots** | T1 right rail | T0 strip | T0 strip | Highest-frequency caster interaction (V1 gem pattern). |
| Hit Dice | T0 (compact) + T2 *Play* | same | same | Read in the bar, spent in the panel. |
| Death Saves | T2 *Play*, auto-promoted to T0 when HP = 0 | same | same | Irrelevant until it is the only thing that matters. |
| Recovery (rest, spend die, damage/heal) | T2 *Play* | T2 *Play* | T2 *Play* | Deliberate actions, not glances. |
| **Actions** (+ resolve) | T2 *Play* (default tab), fluid column | T2 | T2 (default tab) | The primary working surface. |
| Combat results | Inline in the action row | same | same | Result belongs to the thing that caused it. |
| Ability scores **+ modifiers + saves** | T1 left rail | T1 left rail / T2 | T2 *Character* | Read constantly, changed almost never. One tile per ability — never split across cards. |
| Skills | T1 left rail (scroll) | T2 *Character* | T2 *Character* | 18 rows: too tall for a phone bar, ideal for a desktop rail. |
| Proficiencies / training | T2 *Character* T3 | T2 T3 | T2 T3 | Consulted at edges of play. |
| Derived (other categories) | T2 *Character* T3 | T2 T3 | T2 T3 | Diagnostic completeness; must remain reachable and game-agnostic. |
| Spells (prepared/known) | T2 *Spells* | T2 | T2 | Prepared first, known second, cantrips separate. |
| Spell detail | **T4 drawer** | T4 | T4 | Keeps lists dense. |
| Inventory / equipment / attunement | T2 *Inventory* | T2 | T2 | Equip state feeds AC and Actions. |
| Item detail | **T4 drawer** | T4 | T4 | Same. |
| Species/Class/Background prose, traits | T2 *Character* T3 (expanded) | T3 | T3 (collapsed) | Reference; must not push vitals off screen. |
| Notes | T2 *Notes* | T2 | T2 | Long-form; never above Health. |
| Pending choices | T0 badge → T5 Builder | same | same | Surface urgency on the sheet; resolve it in the Builder. |
| Ability/skill *editing* | T5 Builder | T5 | T5 | Existing `abilities.vue` / `proficiencies.vue`. Unchanged. |

### 3.3 Reserved slots for blocked content

The Rules Package gaps in §1.8b get **reserved, self-hiding slots** so they appear without a
redesign the day the package declares them:

- **Vitals Bar** renders any `combat`-category Value tagged for summary display — Initiative and
  Speed will land there automatically.
- **`CharacterAbilityGrid`** already has the tile footprint for a passive score.
- **`CharacterResourcePips`** (spell-slot gem component) is written generically over
  `{ label, max, used }` so class resources reuse it verbatim.
- **Inventory** reserves a currency footer region.

Each renders nothing when its data is absent — the same "absence is legal, and must stay visible"
posture used throughout the codebase.

### 3.4 The five tabs

| Tab | Question it answers | Contents |
|---|---|---|
| **Play** *(default)* | "What can I do right now?" | Actions + resolve, recovery, hit dice, death saves, encounter |
| **Character** | "Who am I and what am I good at?" | Abilities, saves, skills, proficiencies, features/traits, derived detail |
| **Spells** | "What can I cast?" | Slots, prepared, known, cantrips |
| **Inventory** | "What am I carrying?" | Items, equipped, attunement |
| **Notes** | "What do I remember?" | Six note fields |

Five tabs is the ceiling: it fits a phone bottom bar at 44px targets without scrolling, and maps
1:1 to the desktop center column's segmented control.

---

## 4. Desktop Design (≥ 1280px)

```
┌──────────────────────────────────────────────────────────────────────────┐
│ VITALS BAR (sticky)                                                      │
│ Kaelen · Lv 3 Wizard   [HP 14/22 ▾] [AC 12] [DC 14] [+6] [◈◈◇ L1]        │
│                              [Poisoned ×] [Prone ×]   ● Your turn · R2   │
├────────────────┬───────────────────────────────────────┬─────────────────┤
│ LEFT RAIL      │ CENTER (fluid)                        │ RIGHT RAIL      │
│ 300–320px      │                                       │ 300–340px       │
│ sticky, scroll │ [Play][Character][Spells][Inv][Notes] │ sticky          │
│                │ ───────────────────────────────────── │                 │
│ Portrait       │ ┌─ filter bar (sticky) ─────────────┐ │ Spell Slots     │
│ Name / Level   │ │ All · Weapon · Spell · Feature    │ │ ◈◈◇◇ L1         │
│ Species/Class  │ │ ☑ Resolvable only   [search]      │ │ ◈◇   L2         │
│ /Background    │ └───────────────────────────────────┘ │                 │
│                │                                       │ Hit Dice 2/3    │
│ ABILITIES      │  ┌──────────┐ ┌──────────┐            │ [Spend]         │
│ ┌────┐┌────┐   │  │ Longsword│ │ Fire Bolt│            │                 │
│ │STR ││DEX │   │  │ Melee +6 │ │ Spell +6 │            │ Rest            │
│ │ 16 ││ 14 │   │  │ 1d8 slash│ │ 1d10 fire│            │ [Short][Long]   │
│ │ +3 ││ +2 │   │  │ [Resolve]│ │ [Resolve]│            │                 │
│ │Sv+5││Sv+2│   │  └──────────┘ └──────────┘            │ Conditions      │
│ └────┘└────┘   │                                       │ [+ Apply]       │
│  … ×6          │  (2-up ≥1280, 3-up ≥1600)             │                 │
│                │                                       │ Encounter       │
│ SKILLS (18)    │                                       │ Round 2         │
│ Acrobatics +2  │                                       │ Now: Kaelen     │
│ …              │                                       │ Next: Bram      │
└────────────────┴───────────────────────────────────────┴─────────────────┘
```

**Grid:** `xl:grid-cols-[300px_minmax(0,1fr)_300px]`, `2xl:grid-cols-[320px_minmax(0,1fr)_340px]`.
Adopted directly from V1's proven dashboard, with the right column repurposed from
"more content" to "live play state."

**Scroll behavior.** Three independent scroll regions. Rails are
`sticky top-[var(--vitals-h)] max-h-[calc(100dvh-var(--vitals-h))] overflow-y-auto`; the center
column scrolls the page. The vitals bar never moves. This is what makes it feel powerful rather
than long: reference data stays put while you work.

**Region rationale.**
- *Left rail = identity + reference.* Changes rarely, read constantly, fixed height budget.
- *Center = the working surface.* Only region that changes with the tab; gets all spare width.
- *Right rail = live play state.* Resources you spend and statuses you track — adjacent to the
  center column so acting and tracking are in one visual sweep.
- *Vitals bar = the numbers you say out loud.*

**Density.** Rails run in compact density (`text-sm`, `py-1.5`, hairline dividers). The center
runs in comfortable density. Container queries make each panel adapt to its column automatically.

---

## 5. Tablet Design

Tablet is **not** a narrow desktop and **not** a large phone. It is touch-first at desktop-ish
width, and orientation changes the answer.

### 5.1 Landscape (≥ 1024px, coarse pointer) — "desktop minus one rail"

`lg:grid-cols-[280px_minmax(0,1fr)]` — left rail + center. The **right rail folds into the
vitals bar**: spell slots become a horizontal strip; hit dice, rest, and conditions become
vitals-bar popovers.

- All touch targets ≥ 44px, including rail rows (no hover-only affordances).
- Detail opens in a **side sheet** (420px, right-anchored) — the tablet analogue of the desktop
  drawer, keeping the list visible.
- Left rail is collapsible to a 64px icon strip for more working width.

### 5.2 Portrait (768–1023px) — "phone plus"

Single column, but wider than a phone:

- Vitals bar keeps two rows (identity + stats).
- Tabs render as a **top segmented control** (not bottom nav — thumbs reach the top on a
  held-in-two-hands tablet, and a bottom bar wastes the tall canvas).
- Panels use their `@container` breakpoints to go 2-up.
- Drawers become **bottom sheets** at 70dvh.

### 5.3 Foldables

Treated as a width problem, not a device class. The grid switches at `lg`; unfolding a
Fold-class device crosses 1024px and picks up the rail with no special casing. Because layout is
driven by container queries inside panels, panel content reflows on fold without a resize
listener.

---

## 6. Mobile Design (< 768px)

```
┌─────────────────────────────┐
│ ← Kaelen · Lv 3 Wizard   ⋮  │  sticky top, 1 row
│ [HP 14/22][AC 12][DC 14]    │  tap → sheet
│ [Poisoned][Prone]  ● Turn   │
├─────────────────────────────┤
│                             │
│  (active tab content)       │  scrolls
│                             │
│                             │
├─────────────────────────────┤
│  [− HP]  [+ HP]   [Resolve] │  quick action bar (contextual)
├─────────────────────────────┤
│  ⚔     👤     ✨    🎒    📝 │  bottom nav, 44px targets
│ Play Charac Spells Inv Notes│
└─────────────────────────────┘
```

### 6.1 Navigation moves to the bottom

V1's single clearest mobile mistake was putting tabs in the top header. The bottom bar is the
thumb-reachable zone; five items at 44px fit a 320px viewport with room to spare. Active tab is
indicated by icon fill + label weight + a top edge rule — never color alone.

### 6.2 Sheets replace popovers

Every V1 header popover becomes a **bottom sheet**: dismissible by swipe or backdrop, focus-
trapped, `max-h-[85dvh]`, and safe-area-inset aware. HP adjust, rest, conditions, target picker,
and all detail views use one `CharacterBottomSheet` primitive.

**`window.prompt()` is removed** from the encounter page in the same pass.

### 6.3 Combat-first defaults

- Default tab is **Play**.
- The **quick action bar** sits above the bottom nav and is contextual: damage/heal steppers
  normally; when a target is selected in the Actions tab it becomes `Resolve`; when HP = 0 it
  becomes the death-save tracker.
- Damage/heal is a stepper plus a numeric field — never keyboard-only.
- Spell slots are a horizontal gem strip in the vitals bar (V1's pattern, preserved).

### 6.4 Collapsible prose

All T3 accordions default **collapsed** on phone and **expanded** on desktop — a prop on
`CharacterSheetSection`, not a separate component.

### 6.5 Capability parity checklist

Every capability must be reachable on a phone in ≤ 2 taps from its tab:
apply damage/healing · spend hit die · short/long rest · death saves · resolve an action ·
pick a target · expend/restore a spell slot · prepare a spell · add/remove/equip/attune an item ·
apply/remove/tick a condition · join/leave an encounter · edit every note field ·
read any trait, spell, or item in full.

---

## 7. Visual System

### 7.1 Foundations already in place

`app/assets/css/eldra-shell.css` (51KB, globally loaded) and `eldra-fieldguide.css` define the
house language: `eldra-ornate-panel`, `eldra-codex-soft`, `eldra-codex-panel`, `eldra-panel-soft`,
`eldra-button`, `eldra-input`, `eldra-gold-chip`, `eldra-kicker`, `eldra-title`,
`eldra-frame-corners`, `eldra-corner-runes`, `eldra-empty`, `eldra-detail-drawer`,
`eldra-gold-divider`.

**Colors are already established and are not being redesigned:** gold `#c9a45a` / `#f5e7bd` /
`#fff7df`, muted `#9f9278` / `#6f6754` / `#d8ceb8`, ink `rgba(20,17,12,·)` / `rgba(10,12,14,·)`,
success `#9ec37d`, danger `red-*`.

> Note: `app/assets/css/eldra-panels.css` exists but is imported nowhere. Confirm before deleting.

### 7.2 Panel elevation — the single most important visual fix

Stop applying one treatment to everything. Three tiers:

| Tier | Class | Used for | Chrome |
|---|---|---|---|
| **Feature** | `eldra-ornate-panel eldra-frame-corners` | Vitals bar only — max **1** per screen | Full ornate frame, corner runes |
| **Standard** | `eldra-codex-soft` | Tab content sections | Soft border, no corners, no blur |
| **Quiet** | `eldra-panel-soft` / hairline | Rail rows, list rows, accordions | Hairline divider only |

This alone converts "pile of cards" into a hierarchy: exactly one thing on screen is loud.

### 7.3 Typography

| Role | Treatment |
|---|---|
| Vital number (HP, AC, DC) | `text-3xl`/`text-4xl` `font-semibold` `tabular-nums` `text-[#fff7df]` |
| Ability score | `text-2xl` `tabular-nums` |
| Ability modifier | `text-lg` `font-semibold` — visually **subordinate to nothing**, sits beside the score |
| Section heading | `text-xs uppercase tracking-[0.3em] text-[#9f9278]` *(existing kicker — keep)* |
| Sub-heading | `text-[0.65rem] uppercase tracking-[0.2em]` |
| Body / prose | `text-sm leading-6 text-[#d8ceb8]` |
| Meta / provenance | `text-xs text-[#6f6754]` |

**`tabular-nums` on every number that can change** — prevents steppers from jittering.

### 7.4 Spacing & density

Two density modes as a `CharacterSheetSection` prop:

| | Compact (rails, lists) | Comfortable (center, prose) |
|---|---|---|
| Section padding | `p-3` | `p-5` |
| Row height | `min-h-9` | `min-h-11` |
| Gap | `gap-1.5` | `gap-3` |

Interactive targets stay ≥ 44px in **both** modes — density reduces padding, never touch area.

### 7.5 Icons

Adopt V1's Lucide vocabulary (already a dependency, used throughout V1):

`i-lucide-swords` Play/attack · `i-lucide-user` Character · `i-lucide-sparkles` Spells ·
`i-lucide-backpack` Inventory · `i-lucide-notebook-pen` Notes · `i-lucide-heart` HP ·
`i-lucide-shield` AC · `i-lucide-campfire` Rest · `i-lucide-skull` Death saves ·
`i-lucide-dices` Hit dice · `i-lucide-alert-triangle` Conditions · `i-lucide-swords` Encounter.

Icons **accompany** labels; they never replace them except in the collapsed rail (where they
carry `aria-label` + tooltip).

### 7.6 Badges, chips, status

- **Count badge** — nav only, `eldra-gold-chip`, suppressed at 0.
- **Condition chip** — `eldra-gold-chip` + optional duration + `×` remove; danger tint at
  duration 0 to signal "expired, awaiting a decision" (never auto-removed — matches
  `encounter.ts`'s no-automation rule).
- **Turn indicator** — green `#9ec37d` fill **plus** a "Your turn" label. Never color alone.
- **Provenance** — `text-xs text-[#6f6754]`, always last in a card.

### 7.7 Buttons

| Role | Style |
|---|---|
| Primary (Resolve, Apply, Long Rest) | `eldra-button` — gold fill |
| Secondary (Short Rest, Spend Die) | Gold hairline border, transparent |
| Destructive (Remove, Leave, Damage) | `border-red-500/20 bg-red-500/10 text-red-200` |
| Stepper (±) | `size-11` square, hairline |
| Ghost (nav, filters) | Text + underline on active |

Every action button must express `:disabled` **and** a `saving` state.

### 7.8 States

- **Empty** — icon + one-line explanation + the action that fixes it, in `eldra-empty`.
  All user-facing `--` must become real em-dashes.
- **Loading** — skeletons matching final geometry (rails, tiles, rows). Never a bare
  "Loading…" string where content will appear.
- **Error** — existing red-tint pattern; must state *what failed* and *what still works*
  (V2's `rules-unconfigured` vs `rules-broken` distinction is already correct — keep it).
- **Saving** — a single `CharacterSaveIndicator` in the vitals bar, not per-panel text.

### 7.9 Combat emphasis

When the character is in an active encounter **and it is their turn**, the vitals bar gains a
green top edge and the Play tab gains a dot. At HP = 0 the bar shifts to a danger tint and the
death-save tracker promotes to T0. No animation beyond a 150ms tint transition; nothing flashes
at a table.

---

## 8. Component Architecture

Hard rule: **no component over ~400 lines; the page component under ~200.** The page wires
data to layout and owns nothing else.

### 8.1 Layout & chrome

| Component | Responsibility | ~Lines |
|---|---|---|
| `CharacterSheetShell` | Breakpoint orchestration; named slots `vitals`/`left`/`center`/`right`/`nav`. Owns no data. | 120 |
| `CharacterSheetDesktopLayout` | 3-column grid + sticky rails | 80 |
| `CharacterVitalsBar` | T0 bar: HP, AC, DC/attack, conditions, turn, save indicator | 250 |
| `CharacterSheetNav` | `variant: 'tabs' \| 'bottom' \| 'rail'`, count badges | 120 |
| `CharacterSheetSection` | Standard wrapper: heading, `elevation`, `density`, `collapsible` | 90 |
| `CharacterBottomSheet` | Mobile sheet / tablet side sheet / desktop drawer | 140 |
| `CharacterQuickActionBar` | Contextual mobile action strip | 110 |

### 8.2 Content panels

| Component | Notes | ~Lines |
|---|---|---|
| `CharacterIdentityCard` | Portrait, name, **level**, species/class/background | 120 |
| `CharacterAbilityGrid` | **Score + modifier + save in one tile** (replaces the split) | 130 |
| `CharacterSkillList` | 18 rows, compact, groupable by ability via existing `ability:` tags | 110 |
| `CharacterDerivedPanel` | **Keep as-is** + density prop | 110→130 |
| `CharacterHealthPanel` → `CharacterRecoveryPanel` | Rest, hit dice, death saves, damage/heal | 220 |
| `CharacterActionsPanel` | List + orchestration only | 160 |
| `CharacterActionCard` | One action row | 130 |
| `CharacterActionFilterBar` | Sticky filters, structured (see §8.4) | 90 |
| `CharacterTargetPicker` | Target selection, sheet on mobile | 100 |
| `CharacterCombatResult` | Hit/miss/crit/damage presentation | 110 |
| `CharacterSpellSlotTracker` | Gem strip; promotable to vitals bar | 120 |
| `CharacterSpellList` | Prepared / known / cantrips | 180 |
| `CharacterInventoryPanel` | Keep + search; detail → drawer | 300 |
| `CharacterNotesPanel` | Keep + autosave indicator | 140 |
| `CharacterConditionsPanel` | **Extract from page** | 180 |
| `CharacterEncounterPanel` | **Extract from page** | 190 |
| `CharacterFeatureList` | Traits/features; detail → drawer | 150 |
| `CharacterDetailDrawer` | One generic drawer (replaces V1's four) | 130 |
| `CharacterEmptyState` | Icon + message + action | 60 |
| `CharacterStatChip` | Label/value/icon chip | 50 |
| `CharacterResourcePips` | Generic `{label,max,used}` pips — reused by slots **and** future class resources | 90 |

### 8.3 Data layer

| Module | Responsibility |
|---|---|
| `app/composables/useCharacterSheet.ts` | Single entry point. Fetches assembly + derived + actions **in parallel**, exposes `identity`, `derived`, `actions`, `vitals`, `pending`, `error`, `refresh()`. Removes 6 scattered `useFetch` calls. |
| `app/composables/useCharacterSheetLayout.ts` | Active tab (URL-synced, matching V1's `?tab=` pattern), breakpoint, rail collapse, drawer stack. |
| `app/composables/useCharacterMutations.ts` | Wraps recovery/combat/inventory/spellcasting/conditions POSTs with shared optimistic + rollback + `saving` state. |
| `app/components/characters/characterSheetRegions.ts` | Extends existing `characterDerivedValues.ts`: which Rule Categories render where, per tier. |

> **Boundary preserved:** composables call `server/api/**` only. No new server logic; no Vue
> calculation. `characterDerivedValues.ts`'s category-based (never ID-based) selection stays.

### 8.4 Structured action filtering

V1 filtered by substring-matching prose (`timingFilter()`). The replacement filters on data the
pipeline already produces:

- **Category** — `ContentAction.category` (`weapon` / `unarmed` / `spell` / `species` / `class` /
  `background`).
- **Resolvable** — presence of `ContentAction.resolution`.
- **Text** — client-side match on `name` + `actionType`.

No prose heuristics, no D&D-specific strings in Vue.

---

## 9. UX Flows

Format: **must be visible** → what is on screen with zero interaction. **One tap** → reachable
in a single interaction.

| # | Flow | Must be visible | One tap |
|---|---|---|---|
| 1 | Open during normal play | Name, level, class, HP, AC, conditions, Play tab | Any of the 5 tabs |
| 2 | Open during combat | All of #1 **plus** turn indicator + round | Resolve an action |
| 3 | **Takes damage** | Current HP, temp HP, AC | Damage stepper/field in vitals bar → applied |
| 4 | **Heals** | Current/max HP | Heal control, same surface as #3 |
| 5 | **Spends Hit Die** | Hit dice remaining | `Spend` (right rail desktop / Play tab mobile) |
| 6 | **Resolves an attack** | Action list with attack bonus + damage | Target already selected → `Resolve`; result renders in the same row |
| 7 | **Casts a spell** | Slot availability | Expend gem → cast; spell attack/save DC already on the card |
| 8 | **Checks a class feature** | Feature names in Character tab | Row → drawer with full text, list position preserved |
| 9 | **Equips armor** | Inventory with equip toggles | Toggle → AC in vitals bar updates |
| 10 | **Reviews conditions** | Condition chips in vitals bar | Chip → detail + remove/tick |
| 11 | **Edits notes** | Notes tab | Tab → field focused, autosave indicated |
| 12 | **GM opens a PC** | Same sheet, same data | Identical to player view *(no GM-only surface in this pass — ownership lands in 2.1)* |
| 13 | **Phone** | Vitals bar + bottom nav + Play tab | Every capability in §6.5 |
| 14 | **Desktop** | Vitals + both rails + Play tab | No scroll needed for abilities, saves, HP, AC, slots, conditions |

**Flow 3 is the benchmark.** In V2 today: scroll past 5 sections, find Health, type a number,
press Apply. In the target: the number is already on screen and the control is in the bar.

---

## 10. V1 Retirement Plan

### 10.1 Current entry points (audited)

**→ V1** (`/worlds/:id/entities/:entityId/sheet`):
`characters/index.vue:198` (roster `sheetUrl`) · `characters/index.vue:766` (roster card) ·
`admin.vue:361` · `builder.vue:2939` (Builder completion) ·
`WorldEntityContextDrawer.vue:155`.

**→ V2** (`/worlds/:id/characters/:characterId/sheet-v2`):
`create-v2.vue:325` · `abilities.vue` (×2 back links) · `proficiencies.vue` (×2 back links).

> **The roster never links to V2.** A character created by `create-v2` is reachable only from the
> Builder-context pages. The two systems are fully parallel today.

### 10.2 The detection signal already exists

`assembleCharacter` returns `{ available: false, reason: 'no-catalogue-selection' }` for any
character without a `catalogue_selection` block. That is precisely "V1-only." No new schema, no
new flag.

| Character has | Canonical sheet |
|---|---|
| `catalogue_selection` block | **V2** |
| `character_sheets` row only | V1 (until Phase D) |
| Neither | V2 with its existing "nothing to assemble" state |

### 10.3 Phases

| Phase | Goal | Actions | Gate to exit |
|---|---|---|---|
| **A** | Beautify V2 | §11 Phases 0–9. V1 untouched and reachable. | Canonical sheet ships and is preferred by users |
| **B** | Route resolver | Add canonical route `/worlds/:id/characters/:characterId/sheet`. Add `GET .../sheet-target` (or reuse `/assembly`) to classify. Point roster, admin, and entity drawer at the canonical route. Keep `sheet-v2` as an alias. | Every entry point uses the canonical route; both kinds of character land correctly |
| **C** | Stop creating V1-only characters | Route "New Character" to `create-v2`. Either teach `builder.vue` to write `catalogue_selection`, or mark it legacy-only. | No new character lacks `catalogue_selection` for 1 release |
| **D** | Migrate or archive | `scripts/directus/migrate-v1-characters.mjs`: for each `character_sheets` row, resolve class/species/background against the World catalogue and write `catalogue_selection` + `ability_scores` + `health` + `inventory`. Report unmigratable ones. Follows the manual-migration procedure in CLAUDE.md's Deployment Checklist. | Migration report reviewed; remaining V1-only characters explicitly archived |
| **E** | Redirect | `/entities/:id/sheet` → 302 to canonical. Page becomes a redirect stub. | One release with no V1 render and no regressions |
| **F** | Delete | Remove `entities/[entityId]/sheet.vue`, the ~23 retired `Sheet*.vue` (§1.6), and — only if nothing else reads them — `character-sheets.ts`, `character-sheet-math.ts`, `character-sheet-resolver.ts`, `character-sheet-inventory*.ts`, `character-sheet-notes.ts`, `character-sheet-subclasses.ts`, `character-sheet-safe.ts`, and `/api/worlds/[id]/entities/[entityId]/sheet.*`. | Build + tests green; `character_sheets` collection retained read-only for one further release |

**Rules.** No phase deletes data. Phase D is manual and reviewed (per CLAUDE.md's deployment
procedure). Phase F is gated on a full release of Phase E with no rollback. The
`character_sheets` Directus collection is **not** dropped by this plan.

> **Not in scope:** `character-sheet-inventory-transfers.ts` and
> `inventory-transfer-realtime-bridge.ts` are used by the item-transfer system beyond the V1
> sheet. Retiring them needs its own analysis.

---

## 11. Implementation Plan

Each phase is independently shippable and sized for a single implementation task.

---

### Phase 0 — Workspace shell mobile fix *(blocking prerequisite)*

**Goal.** Make `world-workspace` usable below 768px so the sheet can be made mobile-usable at all.

**Files.** `app/layouts/world-workspace.vue`, `app/components/world/WorldWorkspaceSidebar.vue`,
`app/composables/useSidebar.ts`.

**Change.** Below `md`, the sidebar leaves the grid and becomes an overlay drawer (hamburger in
the page header); at `md`+ behavior is exactly as today.

**Risk.** **High** — affects every `worlds/[id]/**` page.
**Testing.** No unit tests exist for layouts; rely on `typecheck` + `build` + manual sweep.
**Manual.** World map, characters roster, entity article, timelines, encounters, both sheets — at
375px, 768px, 1280px. Sidebar collapse persists. Map page (own scroll container) unaffected.
**Why first.** Every mobile requirement in §6 is unreachable while a 280px sidebar sits beside a
390px viewport. Shipping the sheet redesign first would ship it un-testable on phones.

> If the team prefers to de-risk: ship Phase 0 alone, observe one release, then continue.

---

### Phase 1 — Foundations: section, chips, empty states

**Goal.** Replace the nine copy-pasted panel wrappers with one component and establish the
elevation/density system. **Zero behavior change.**

**Files.** `sheet-v2.vue` (template only).
**Created.** `CharacterSheetSection`, `CharacterStatChip`, `CharacterEmptyState`,
`CharacterSaveIndicator`.

**Risk.** **Low** — purely presentational.
**Testing.** `pnpm run test` (no change expected), `typecheck`, `build`.
**Manual.** Every section still renders with correct heading; elevation tiers visibly differ;
em-dashes replace `--` in all user-facing copy.
**Why before next.** Every later phase moves sections between regions. Doing that against nine
divergent copy-pasted wrappers multiplies the work and the risk.

---

### Phase 2 — Data layer consolidation

**Goal.** One composable, parallel fetching, and Encounter/Conditions extracted from the page.

**Files.** `sheet-v2.vue` (script; target < 400 lines after this phase).
**Created.** `useCharacterSheet.ts`, `useCharacterMutations.ts`, `CharacterEncounterPanel.vue`,
`CharacterConditionsPanel.vue`.

**Change.** Replace 6 sequential `useFetch` with parallel resolution. Move ~130 lines of inline
encounter/condition logic into components.

**Risk.** **Medium** — touches every data path on the page.
**Testing.** Existing 1,935 tests must stay green. Add component-level tests for the two
extracted panels if a component test harness exists; otherwise cover via the pure modules already
tested.
**Manual.** Health/inventory/spell/action/condition mutations all still persist and roll back on
error. Encounter join/leave/conditions work from the sheet.
**Why before next.** Phases 3–9 re-parent components across layout regions; that is only safe once
data comes from a composable rather than page-local refs.

---

### Phase 3 — Vitals Bar + Recovery split

**Goal.** The single highest-impact change: HP, AC, Save DC, conditions, and turn state stop
scrolling away.

**Files.** `sheet-v2.vue`, `CharacterHealthPanel.vue` → `CharacterRecoveryPanel.vue`.
**Created.** `CharacterVitalsBar`, `CharacterRecoveryPanel`, `CharacterBottomSheet`.

**Change.** Sticky vitals bar at all breakpoints. Damage/heal moves into the bar (bottom sheet on
mobile). Rest, hit dice, and death saves stay in a panel. Death saves auto-promote to the bar at
HP = 0.

**Risk.** **Medium** — sticky positioning inside the shell's `overflow-hidden` container needs
care; use `sticky` within the page's own scroll container, not `fixed`.
**Testing.** `tests/lib/characters/health.test.ts` unchanged (pure module untouched).
**Manual.** Bar stays fixed while scrolling, on all five tabs, at 375/768/1280/2560px. Damage
applies temp-HP-first. Death saves appear at 0 HP. No overlap with the workspace sidebar.
**Why before next.** It is independently valuable (flows 1–5 improve immediately even with today's
single-column body) and it defines `--vitals-h`, which the rails in Phase 4 offset against.

---

### Phase 4 — Shell, navigation, and the desktop 3-column layout

**Goal.** The structural payoff: rails on desktop, tabs everywhere, bottom nav on phone.

**Files.** `sheet-v2.vue` (template becomes a layout wiring file).
**Created.** `CharacterSheetShell`, `CharacterSheetDesktopLayout`, `CharacterSheetNav`,
`useCharacterSheetLayout.ts`.

**Change.** Implement §3.4 tabs, §4 desktop grid, §5 tablet variants, §6.1 bottom nav. Tab state
syncs to `?tab=` (V1's pattern). Sections re-parent into rails/center per §3.2.

**Risk.** **High** — largest single visual change.
**Testing.** `typecheck` + `build`; add a unit test for the tab-normalisation helper.
**Manual.** All five tabs at 375 / 768 / 1024 landscape / 1280 / 2560px. Rails scroll
independently and stick below the vitals bar. Deep link `?tab=spells` restores. Back/forward
work. Nothing is unreachable at any width.
**Why before next.** Phases 5–9 refine content *inside* regions; those regions must exist first.

---

### Phase 5 — Character tab: ability grid, skills, level, features

**Goal.** Fix the split-modifier problem and put the character's **level** on the sheet.

**Files.** `CharacterAbilityScoresPanel.vue`, `characterDerivedValues.ts`.
**Created.** `CharacterAbilityGrid`, `CharacterSkillList`, `CharacterProficiencyPanel`,
`CharacterFeatureList`, `CharacterDetailDrawer`, `CharacterIdentityCard`.

**Change.** One tile per ability carrying **score + modifier + save bonus**, composed from
existing derived values. Add `progression` (level, XP) to the rendered regions and surface level
in identity. Add `combat` (melee/ranged attack bonus) to the summary. Feature detail → drawer.

**Risk.** **Low–Medium** — reads existing derived output only.
**Testing.** Extend `tests/server/utils/character-derived.test.ts` only if region config changes
server-side (it should not — this is client-side region selection).
**Manual.** STR 16 shows `16 / +3 / Save +5` in one tile. Level renders in identity and vitals
bar. Attack bonuses appear in the Character tab. Feature drawer preserves list scroll. Non-D&D
package still renders (category-driven, no hardcoded IDs).
**Why before next.** Establishes the drawer primitive that Spells and Inventory reuse.

---

### Phase 6 — Play tab: actions, filters, targeting, results

**Goal.** Rebuild V1's Action Center on structured V2 data.

**Files.** `CharacterActionsPanel.vue`.
**Created.** `CharacterActionCard`, `CharacterActionFilterBar`, `CharacterTargetPicker`,
`CharacterCombatResult`.

**Change.** Sticky filter bar with **structured** filters (§8.4). Target picker becomes a sheet on
mobile, inline on desktop, and remembers the last target. Results render in-row with clear
hit/miss/crit hierarchy.

**Risk.** **Medium** — combat resolution is live gameplay.
**Testing.** `tests/server/utils/character-combat.test.ts` must stay green (server untouched).
**Manual.** Filter by category; toggle resolvable-only; resolve melee, ranged, spell-attack, and
saving-throw actions; verify target HP updates and the result reads correctly; confirm
unresolvable actions show no Resolve control.
**Why before next.** Actions is the default tab and the densest interaction; Spells and Inventory
reuse its list/filter/drawer patterns.

---

### Phase 7 — Spells tab and the slot tracker

**Goal.** Restore V1's tap-to-spend gems and separate prepared from known.

**Files.** `CharacterSpellcastingPanel.vue`.
**Created.** `CharacterSpellSlotTracker`, `CharacterSpellList`, `CharacterResourcePips`.

**Change.** Gem-strip slot tracker (right rail on desktop, vitals strip on tablet/phone).
Prepared / known / cantrip grouping. Spell detail → drawer. Pips written generically so future
class resources reuse them.

**Risk.** **Low–Medium.**
**Testing.** `tests/lib/characters/spellcasting.test.ts` unchanged.
**Manual.** Full/half/pact casters each show correct slots; expend and restore; non-casters see
no spell UI anywhere; homebrew spells still listed.
**Why before next.** Inventory is simpler and benefits from the list/drawer patterns settled here.

---

### Phase 8 — Inventory and Notes tabs

**Goal.** Bring the two best-structured existing panels up to the new system.

**Files.** `CharacterInventoryPanel.vue`, `CharacterNotesPanel.vue`.
**Created.** `CharacterItemRow`, reuse `CharacterDetailDrawer`.

**Change.** Add search. Move item detail to the drawer. Group by equipped/carried. Surface
attunement count against its limit. Notes gain an autosave indicator and a mobile-friendly
field switcher. Reserve the currency footer slot (renders nothing today).

**Risk.** **Low.**
**Testing.** `tests/lib/characters/inventory.test.ts` unchanged.
**Manual.** Add/remove catalogue and custom items; equip → AC changes in vitals bar; attune to
the limit; search filters; all six note fields save.
**Why before next.** Lowest-risk remaining work; leaves Phase 9 to integration polish.

---

### Phase 9 — Conditions, encounter integration, and polish

**Goal.** Finish flows 10 and 12, and remove the remaining rough edges.

**Files.** `CharacterConditionsPanel.vue`, `CharacterEncounterPanel.vue`,
`app/pages/worlds/[id]/encounters/[encounterId].vue`.

**Change.** Condition chips in the vitals bar with tap-to-manage. Turn state and round in the bar.
**Replace `window.prompt()`** in the encounter page with a proper control. Loading skeletons.
Final empty/error-state pass.

**Risk.** **Low–Medium.**
**Testing.** Encounter tests unchanged (`encounter.test.ts`, `encounter-actions.test.ts`,
`encounter-view.test.ts`).
**Manual.** Apply/remove/tick conditions from the sheet and the DM panel; join/leave; turn
indicator matches the DM panel; expired (0-duration) conditions are marked, never auto-removed.
**Why last.** Depends on the vitals bar (3), shell (4), and sheet primitive (3).

---

### Phase 10 *(optional)* — Performance

**Goal.** Remove the 4× `assembleCharacter` fan-out (§2.3.4).

**Change.** Allow `getDerivedCharacter` and `getCharacterActions` to accept an already-built
blueprint, and add a composed `GET /api/worlds/:id/characters/:characterId/sheet` that assembles
once and passes it down.

**Risk.** **Medium** — touches shared server utils on hot paths.
**Testing.** All existing server tests must stay green unchanged; add coverage for the composed
endpoint.
**Why optional/last.** Purely an optimisation; correctness is already established. It changes **no
persistence model and no rules logic** — it composes existing utilities the way
`character-derived.ts` already composes `assembleCharacter`. Ship only if measurement justifies it.

---

### Phase summary

| # | Phase | Risk | Ships value alone |
|---|---|---|---|
| 0 | Workspace mobile fix | High | Yes (all pages) |
| 1 | Foundations | Low | Visual consistency |
| 2 | Data layer | Medium | Maintainability + speed |
| 3 | Vitals bar | Medium | **Yes — biggest UX win** |
| 4 | Shell + nav + desktop | High | **Yes — biggest structural win** |
| 5 | Character tab | Low–Med | Yes (level, modifiers) |
| 6 | Play tab | Medium | Yes |
| 7 | Spells tab | Low–Med | Yes |
| 8 | Inventory + Notes | Low | Yes |
| 9 | Conditions + polish | Low–Med | Yes |
| 10 | Performance | Medium | Optional |

---

## 12. Risks and Open Questions

### Risks

| # | Risk | Mitigation |
|---|---|---|
| 1 | **Phase 0 touches every world page.** | Ship alone; manual sweep of all `worlds/[id]/**` routes; the map page owns its own scroll container and must be checked explicitly. |
| 2 | **No component/E2E test harness.** Only `lint` + `typecheck` + 1,935 unit tests exist; none cover Vue rendering. | Keep pure modules and server utils untouched wherever possible so the existing suite remains meaningful; every phase carries an explicit manual checklist. Consider a component-test harness as separate work. |
| 3 | **Sticky positioning inside `overflow-hidden`.** The shell nests two `overflow-hidden` containers. | Use `sticky` inside the page's own scroll container; never `fixed` (it would overlay the sidebar). Verify on iOS Safari, where sticky + `dvh` is historically fragile. |
| 4 | **Phase 4 is the largest visual change.** | It is deliberately preceded by 1–3 so it is pure re-parenting, not rewriting. |
| 5 | **Regressing "no calculation in Vue."** Adding a vitals bar invites computing a modifier "just for display." | Every number in the bar must come from `derived`. Code review gate on each phase. |
| 6 | **`--` in user-facing copy.** | Phase 1 sweeps all user-visible strings. |
| 7 | **Migration (Retirement D) may not resolve cleanly.** V1 characters reference content that may no longer be bound. | Migration must report rather than guess; unmigratable characters are archived, never rewritten. Follows CLAUDE.md's manual, reviewed deployment procedure. |
| 8 | **Sheet churn during Beauty Pass.** `sheet-v2.vue` is under active development. | Phases are ordered so each leaves the page smaller and better-factored than it found it. |

### Open questions

1. **GM view.** Flow 12 assumes GM and player see the same sheet. A real GM view (secret notes,
   hidden HP) needs ownership and permissions, which the roadmap places in **Eldra 2.1**.
   *Recommendation: no GM-only surface in this pass.*
2. **Universal actions** (Dash/Dodge/Disengage/…). V1 hardcoded them. They should be Rules
   Package or Content Pack data. *Recommendation: out of scope; note as a package follow-up.*
3. **Rules Package gaps** (§1.8b): Speed, Initiative, Passive Perception, Currency, class
   resources, feats. *Recommendation: reserved slots now (§3.3), authoring as a separate
   milestone. Do not compute in Vue.*
4. **Dice presentation.** Should `EldraDiceBox` animate server-resolved rolls?
   *Recommendation: not in this pass; revisit after Phase 6.*
5. **`eldra-panels.css`** is imported nowhere. *Recommendation: confirm, then delete in a
   cleanup pass — per CLAUDE.md, do not delete unprompted.*
6. **Portrait upload.** V1 supported it; V2 has no portrait at all. Phase 5 displays
   `entity.image`; whether the sheet should *upload* is a Builder question.
7. **Compact mode toggle.** Should density be user-preference rather than breakpoint-derived?
   *Recommendation: breakpoint-derived first; add a toggle only if asked for.*

---

## Appendix — File Inventory

**V2 sheet:** `app/pages/worlds/[id]/characters/[characterId]/sheet-v2.vue` (1,486)
**V1 sheet:** `app/pages/worlds/[id]/entities/[entityId]/sheet.vue` (8,872)

**V2 components (keep/evolve):** `CharacterInventoryPanel` (375) · `CharacterSpellcastingPanel`
(357) · `CharacterHealthPanel` (351) · `CharacterActionsPanel` (308) · `ContentPresentationPanel`
(179) · `CharacterNotesPanel` (116) · `CharacterDerivedPanel` (110) ·
`CharacterAbilityScoresPanel` (73) · `characterDerivedValues.ts` (123)

**V1 components (retire per §1.6):** 30 × `Sheet*.vue` + 4 choice panels, ~11,400 lines total.

**Server (unchanged by this plan):** `character-assembly` · `character-derived` ·
`character-actions` · `character-combat` · `character-recovery` · `character-actor-bridge` ·
`character-health` · `character-inventory` · `character-notes` · `character-spellcasting` ·
`encounter-actions` · `encounter-view` · `encounter-persistence`

**Rules Package:** `packages/eldra-dnd5e-2024/` — 12 categories, 102 definitions
(`core.abilities` 12 · `core.saves` 12 · `core.skills` 36 · `core.health` 11 · `spellcasting` 13 ·
`equipment` 6 · `character.creation` 4 · `progression` 3 · `combat` 2 · `core.defenses` 1 ·
`core.proficiency` 1 · `conditions` 1)

**Shell:** `app/layouts/world-workspace.vue` · `app/components/world/WorldWorkspaceSidebar.vue`
**CSS:** `main.css` (34) · `eldra-shell.css` (51KB, global) · `eldra-fieldguide.css` (13KB) ·
`eldra-panels.css` (564B, **unimported**)
