# Eldra Character Sheet — Visual Language & V1-Replica Implementation Plan

**Status:** Plan — supersedes the *visual direction* of `character-sheet-beauty-pass.md` where the two conflict.
**Does not supersede:** that document's Information Architecture (§3), Desktop/Tablet/Mobile layout (§4–6), Component Architecture (§8), UX Flow catalogue (§9), or V1 Retirement Plan (§10). Those are correct and are carried forward by reference, not repeated in full here.
**Scope:** Visual/material language for the Character Sheet, first; a routing correction; a phased plan to make V2 *feel* like V1 while keeping V2's architecture.
**Non-scope:** Gameplay mechanics, Rules Engine, Content Pipeline, persistence model. No code, no CSS, no components in this document.

---

## 0. Why this document exists

The Beauty Pass plan's own diagnosis (its §1 and §2) is correct and has been since it was written. Read literally, it already says: V1's UX is right, V2's architecture is right, build V1's experience on V2's data. Phases 0–4 of that plan have been implemented faithfully — workspace mobile fix, section/chip primitives, a consolidated data layer, a sticky vitals bar, a three-column desktop shell with tabs and a bottom nav.

And the product still reads as an admin dashboard.

That is not a contradiction. It is what happens when a plan's **skeleton** phases ship before its **flesh** phases. Phases 0–4 built structure: where things sit, how they're reached, what stays on screen. Phases 5–9 — not yet built — are where the plan says the actual content panels get redesigned: `CharacterIdentityCard` with a portrait, `CharacterAbilityGrid` merging score+modifier+save into one tile, a redesigned Action Center, gem-strip spell slots. Until those ship, every panel on the sheet is still the flat, undifferentiated box V2 shipped with before the Beauty Pass began, just now sorted into the right tabs and rails.

There is a second, real gap, though, and it's not just "phases haven't run yet": **the Beauty Pass's own Visual System section (§7) never captured the single most material-specific thing V1 did.** V1 didn't just use gold and dark panels — it used a *second, distinct dark surface* (a cool ink-navy) reserved specifically for anything you press, roll, or act on, set against a *warm charcoal-gold* reserved for anything you read. That contrast is why V1's flat rows still felt like a physical object with parts, and its complete absence from §7 is why even a correctly-elevation-tiered V2 panel reads as one more gray rectangle. This document adds that rule. Section 3 below is the one genuinely new piece of visual grammar this document contributes; everything else is either lifted directly from V1's actual source (with file:line citations) or a refinement of what §7 already had roughly right.

**Read this document as:** a finished visual system (§3), a validated and cited diagnosis of both sheets (§1–2), and a phase plan (§8) that mostly *re-labels and re-scopes* the Beauty Pass's own remaining Phases 5–9 around that visual system, plus three things the old plan didn't have: an early routing fix, a dedicated material/token phase, and a ceremony phase.

---

## 1. V1 Reverse-Engineering — why it works, specifically

Studied directly from source, not from memory: `app/pages/worlds/[id]/entities/[entityId]/sheet.vue` (8,872 lines: script 1–7,549, template 7,550–8,787), `app/components/characters/Sheet*.vue` (30 files, ~10,500 lines), `app/assets/css/eldra-fieldguide.css` (532 lines).

### 1.1 The material is not one dark color, it's two

`eldra-fieldguide.css:2` defines `--eldra-ink: #070604` — a warm near-black. But the page's *actual* background, set directly in `sheet.vue:7561` and `:8827`, is `#05080d` — a cool, faintly blue-black. That's deliberate: the fieldguide tokens (warm ink/charcoal/gold) are the *frame* material — parchment, leather, gilt. The page background is a *different*, cooler material — closer to slate or ink-on-vellum in low light. Sit gold-warm panels on a cool-blue ground and you get depth for free; that's table-lamp-on-a-dark-room, not "dark mode."

Inside the frame, V1 goes further and uses a **third** surface family for anything interactive, and this is the load-bearing discovery of this whole document:

| Surface | Color family | Used for | Evidence |
|---|---|---|---|
| **Frame (warm)** | `rgba(20,17,12,·)`, `rgba(9,8,6,·)`, gold borders `rgba(201,164,90,·)` | Static containers: section wrappers, labels, dividers | `eldra-codex-soft`, every `<section>` wrapper in `SheetDesktopOverviewDashboard.vue` |
| **Well (cool)** | `rgba(9,17,26,·)`, `rgba(8,17,27,·)`, `rgba(12,23,33,·)`, steel border `rgba(65,82,103,·)` | Anything you press, roll, or read a live number off of: ability score buttons, saving-throw rows, skill rows, HP tile, death-save marks, mobile stat chips | `SheetDesktopOverviewDashboard.vue:269,290,314,358` (ability/save/passive/slot rows), `sheet.vue:7704,7737,7899` (mobile HP button, HP popover stat cells, slot strip) |
| **Loud (gold-lit)** | `eldra-ornate-panel` + `eldra-frame-corners`, radial gold glow, gilt corner brackets | The **one** container per screen that is currently "in play": the main sheet card, an open detail drawer | `sheet.vue:7949` (`eldra-ornate-panel eldra-frame-corners eldra-corner-runes` on the single outer content card), `SheetItemDetailDrawer.vue:24` |

The **Well** surface is the discovery. It has never been named or written down anywhere in this codebase — not in `eldra-fieldguide.css`, not in the Beauty Pass's §7. It is nonetheless used with total consistency across 30 V1 components: every single row a player *acts on* sits in a cool ink-navy well with a steel-blue border; every row that's just *structure* sits in the warm gold-charcoal frame. That's how a page with zero animation and no dice-roll footage still telegraphs "this part of the sheet is alive" at a glance. V2 has no equivalent: every row, live or static, is the same `rgba(20,17,12,0.55)` box.

### 1.2 Exactly one loud thing, and V1 already proves it

`sheet.vue:7949` applies `eldra-ornate-panel eldra-frame-corners eldra-corner-runes` to **one** element: the single outer card wrapping the entire sheet body. Every panel inside it (`SheetDesktopOverviewDashboard`'s eight sections, the Action Center, etc.) uses the calmer `eldra-codex-soft` — no corners, no runes, no glow. The only other place the loud treatment appears is a detail drawer (`SheetItemDetailDrawer.vue:24`, `SheetFeatureDetailDrawer.vue:23`) — and drawers dim/blur everything behind them (`bg-black/60 backdrop-blur-sm`) while open, so it's still functionally one loud surface at a time. The Beauty Pass's §7.2 "exactly one loud thing" rule isn't a new invention — it is a direct transcription of what V1's own source already does. This validates §7.2 completely; nothing to change there.

### 1.3 The command center: everything you need, zero scrolls

`sheet.vue:7591–7925` is one 335-line sticky mobile header holding, simultaneously: name, a small live-editable portrait thumbnail, four always-visible stat tiles (AC/Init/Speed/PB, `mobileHeaderStatCards`), the tab bar, a horizontally-scrolling spell-slot gem strip, and Rest/HP popovers. On desktop the same information is split across `SheetDesktopIdentityHeader.vue` (name/title) and the left rail of `SheetDesktopOverviewDashboard.vue` (portrait, ability scores, saves, passives) plus the center column's combat tiles. Either way, the answer to "what's my AC / how much HP / what can I do" never costs a scroll or a tab switch.

**This is functionally already what the Beauty Pass's Vitals Bar (§3.1, T0 tier) is for**, and Phase 3 already shipped a sticky vitals bar. The gap is not the mechanism, it's the *content and material* of that bar — see §2.3 below.

### 1.4 Portrait as identity anchor, not decoration

`SheetDesktopOverviewDashboard.vue:220–237` and `SheetDesktopPortraitFrame.vue`: the portrait is the **first thing** in the left rail, `aspect-[4/5]`, framed with `eldra-image-frame` (a hairline gold inset border), with a graceful "No portrait set" dashed-border fallback rather than an empty gap. On mobile, a small thumbnail sits in the sticky header (`sheet.vue:~7840`, group-hover "Change" overlay for upload). A character sheet with a face at the top of it reads as *someone's* character. V2 renders `entity.image` nowhere on the sheet at all — confirmed, `sheet-v2.vue`'s identity block is kicker + `<h1>` + a `<dl>`, no `<img>` anywhere in the file.

### 1.5 Dice ceremony (structurally deliberate, mostly retired)

`sheet.vue` mounts one persistent `<EldraDiceBox ref="diceBoxRef" />` (line 8438) and every roll — ability check, save, skill, weapon attack — funnels through `rollDiceBox()` → `diceBoxRef.value.rollResult(event, label)` (lines 2633, 2715), a real 3D physics dice animation. The Beauty Pass's own §1.8(c) is correct that this **cannot come back as-is**: V2 resolves combat server-side with a seeded RNG (`character-combat.ts`) specifically so results are reproducible and can't be spoofed client-side, and reintroducing client-side rolling would be the exact "compute it in Vue" regression the whole V2 architecture exists to prevent. What should come back is the *presentation* only: animate `EldraDiceBox` using the number the server already returned, never let it decide anything. This is scoped as its own phase below (§8, Phase 9) rather than folded into Vitals/Actions, because it is presentation-only and can ship independently once the server result shape is stable.

### 1.6 Spell slots as gems, not a table

`sheet.vue:7905–7916` (mobile strip) and `SheetDesktopOverviewDashboard.vue:365–376` (rail): each slot is a `h-4 w-4 rotate-45` (or `h-3.5` on mobile) diamond button, colored by state (`slotGemClass`), grouped by level, tap-to-toggle. This is the single highest-frequency spellcaster action reduced to one glance + one tap, and it visually reads as *tokens on a sheet* rather than *rows in a form*. The Beauty Pass's `CharacterResourcePips` (§8.2) is exactly this idea, generalized to also cover future class resources (Rage, Ki, etc.) — keep that generalization, it's correct and doesn't exist in V1.

### 1.7 Drawers as progressive disclosure

`SheetItemDetailDrawer.vue`, `SheetFeatureDetailDrawer.vue`, `SheetSpellDetailDrawer.vue`, `SheetNoteDetailDrawer.vue` all share one shape: slide in from the right (`translate-x-full` → `0`, 200ms), full height, `eldra-ornate-panel eldra-frame-corners`, backdrop dim+blur behind, gold-bordered header with a title/subtitle/close button, scrollable body, footer action row. Four near-identical files. The Beauty Pass's `CharacterDetailDrawer` (§8.1, one generic drawer) is the right call — same visual shape, one implementation, content-typed via props/slots instead of four copies.

### 1.8 What to replicate closely, adapt, or retire

| Pattern | Verdict | Note |
|---|---|---|
| Two-material surface system (warm frame / cool well) | **Replicate — this is new** | Not currently written down anywhere; §3 below formalizes it |
| Exactly one loud ornate treatment per screen | **Replicate** | Already correct in Beauty Pass §7.2; V1 source confirms it |
| Portrait as first element of identity | **Replicate** | `SheetDesktopOverviewDashboard.vue:220`, `SheetDesktopPortraitFrame.vue` |
| Spell slots as tap-to-toggle gems | **Replicate** | `CharacterResourcePips`, already scoped correctly in §8.2 |
| One generic slide-in detail drawer | **Replicate, consolidated** | `CharacterDetailDrawer`, already scoped correctly in §8.1 |
| Sticky command-center header/bar | **Replicate, promoted to all breakpoints** | Already the Vitals Bar's job; needs the material system applied |
| Dice-roll 3D animation | **Adapt** | Presentation-only, driven by server results, not client-computed. Own phase. |
| Mobile tabs living in the top sticky header | **Retire** | Bottom nav is strictly better; V2 already has it |
| Popovers absolutely-positioned inside a sticky header | **Retire** | Doesn't scale past two; V1 itself only had Rest+HP. Beauty Pass's bottom sheet (§6.2) is correct |
| Prop-drilled callback components (50–64 props) | **Retire** | Correctly identified in Beauty Pass §1.2; V2's prop-typed, page-orchestrated shape stays |
| Inline rules math in the page | **Retire** | Rules Engine's job now; do not reintroduce |
| "Manage rails" slide-in editing surfaces | **Retire** | Beauty Pass §1.6 is correct: Builder edits, Sheet displays, with the four named exceptions |

---

## 2. V2 Postmortem — blunt, grounded in current source

Read directly: `CharacterVitalsBar.vue`, `CharacterActionsPanel.vue`, `CharacterRecoveryPanel.vue`, `CharacterAbilityScoresPanel.vue`, `CharacterSheetSection.vue`, `sheet-v2.vue`.

### 2.1 The elevation-tier fix (§7.2) was actually implemented, and it wasn't enough

This needs to be said plainly because it's counterintuitive: `CharacterSheetSection.vue:45–54` correctly implements exactly the three-tier system the Beauty Pass specified — `feature` = ornate+corners, `standard` = `eldra-codex-soft`, `quiet` = hairline. `CharacterVitalsBar.vue:80` correctly uses `elevation="feature"`, and it is the only thing on the sheet that does. The "pile of identical cards" problem §2.2 of the old doc complained about, at the wrapper level, is fixed.

It doesn't read as fixed, because **elevation tier is not the only thing that makes V1's flat panels feel different from each other, and it was never going to be.** V1's "quiet" panels (`eldra-codex-soft`) still had internal texture: a background gradient, and — critically — the warm/cool material split inside them (§1.1). V2's "standard" panels are `eldra-codex-soft` on the outside and **completely flat, single-tone `rgba(20,17,12,0.55)` boxes on the inside**, with no distinction between a row you read (a description) and a row you act on (a damage button). Compare directly:

- `CharacterActionsPanel.vue:173`: every action card is `rounded-none border border-[rgba(201,164,90,0.20)] bg-[rgba(20,17,12,0.55)]` — identical whether the card has a Resolve button or not.
- `CharacterRecoveryPanel.vue:187,258,298,323`: Hit Points, Hit Dice, Rest, and Death Saves are four *visually identical* boxes — same border, same fill, same padding — stacked vertically. This is, verbatim, four rows in an admin settings panel.
- `CharacterAbilityScoresPanel.vue:61`: six tiles, same flat box, score only (no modifier — the exact split-modifier problem §2.3.2 of the old doc already named, still present, unfixed).

The elevation-tier rule was necessary and correctly shipped. It was never sufficient, because it operates one level higher than where the "feels like a form" problem actually lives.

### 2.2 Why the current gold treatment reads as an accent, not a material

Gold is present everywhere in V2 — `eldra-input`, `eldra-button`, `eldra-gold-chip`, every border. But it appears exclusively as a 1px `rgba(201,164,90,0.20–0.34)` outline around a neutral fill. There is no panel anywhere in `sheet-v2.vue` with the gold radial-glow or gradient fill V1's `eldra-ornate-panel`/`eldra-codex-panel` use even in their "quiet" tier. A hairline border reads as "this box has a gold-themed app applied to it." A gradient fill reads as "this surface is made of something." V2 has only ever done the former.

### 2.3 Why the vitals bar fails emotionally despite being technically correct

`CharacterVitalsBar.vue` does everything the spec asked: `elevation="feature"` (the one ornate panel on the page), `text-3xl` tabular numbers, a combat-emphasis top edge, a save indicator. It is still the least "V1" thing on the page, for three concrete reasons:

1. **No identity anchor.** It's a name string and two `CharacterStatChip`s (Level, Class) — no portrait, no image, nothing to look at besides text. V1's command center always had a face in it.
2. **No well/frame contrast.** HP, AC, DC, and Attack are four label/number pairs rendered identically, in the same warm-gold typography, side by side. V1 distinguished "the number you're about to change" (navy well, e.g. the mobile HP button `sheet.vue:7704`, `rgba(26,35,48,0.90)` with a gold glow shadow) from "the number you're just reading." Every number in `CharacterVitalsBar` gets the same treatment regardless of whether tapping it does anything.
3. **No glow, no depth.** V1's HP button carries `shadow-[0_0_18px_rgba(201,164,90,0.14)]` — a genuine light-source cue on the single most important number on the page. `CharacterVitalsBar` has no shadow beyond the section wrapper's own.

None of this requires new layout. It requires the material system in §3, applied to the one component that already exists.

### 2.4 Why the current rails/Play tab don't feel like play

They're not rails yet in the visual sense — they're `CharacterSheetSection`s at `standard` elevation stacked in a column, correctly positioned (Phase 4 shipped that) but carrying zero of the density, well-surface, or ornament rules that made V1's rails feel like a reference sheet rather than a settings list. The Play tab specifically (`CharacterActionsPanel`) has no filter bar, no timing grouping, no visual separation between resolvable and passive actions beyond a conditionally-rendered button — it is a list of `<article>`s. This is exactly what the Beauty Pass's own Phase 6 (Action Center redesign) is scoped to fix; it simply hasn't run yet.

### 2.5 Why the portrait absence specifically matters

A character sheet with no image anywhere reads as a **record**, not a **character**. This is possibly the single fastest fix available: `entity.image` already exists on every character (V1 renders it), and CLAUDE.md's own Entity system (`app/lib/eldra/types.ts`) already carries it. Nothing about surfacing it is new work in the data layer — it's a missing `<img>` tag in the identity area, already scoped in the old doc's Phase 5 (`CharacterIdentityCard`).

### 2.6 Why the iconography complaint is real but secondary

Lucide icons are used correctly per the old doc's §7.5 (swords/user/sparkles/backpack/notebook-pen on the five tabs, per this session's own Phase 4 work). They are not the reason the sheet feels generic — a correctly-chosen generic icon set was never going to fix a page whose *surfaces* are generic. Custom glyphs (§4.5 below) are worth having eventually, but shipping them before the material system in §3 would be decorating a problem that's actually structural.

### 2.7 Why the bottom nav works despite everything else failing

`CharacterSheetNav.vue`'s `bottom` variant (built this session's Phase 4) is the one place V2's execution is **already better than V1**, not just architecturally cleaner: V1 never had a bottom nav — its mobile tabs lived in the top sticky header (§1.8, correctly identified as V1's worst mobile decision in the old doc's §1.2.6). V2's bottom nav is thumb-reachable, uses icon+label+top-edge-rule (never color alone, per §7.6), and needs no rework. **Keep it exactly as built.** The user's own brief confirms this independently.

### 2.8 What survives from V2's current visual work

- `CharacterSheetSection`'s three-tier elevation system — correct, keep.
- The bottom nav (`CharacterSheetNav` `bottom` variant) — correct, keep, do not restyle beyond the material-system pass everything gets.
- `useCharacterSheetLayout.ts`'s tab/URL-sync/breakpoint mechanism — correct, keep.
- `CharacterSheetShell`/`CharacterSheetDesktopLayout`'s rail/center/tab structure — correct, keep. The columns are in the right place; only their *contents'* materials need work.
- Container-query-driven panels (`CharacterDerivedPanel`, `CharacterAbilityScoresPanel`) — correct pattern, keep; the panels themselves still need the visual redesign already scoped in the old doc's §8.2/Phase 5.
- Every server-side/data-layer decision (§2.1 of the old doc) — untouched by this document, entirely correct, do not revisit.

---

## 3. The Canonical Visual Language

Applies to the Character Sheet first. Should guide the rest of the app later, but this document does not scope that migration.

### 3.1 Material metaphor

Eldra is made of three things, stacked in this order from back to front:

1. **The ground** — a cool ink-blue-black (`#05080d`), not warm black. This is the "table" everything sits on.
2. **Gilt frame** — warm charcoal (`rgba(20,17,12,·)` → `rgba(9,8,6,·)`) bordered and occasionally glazed with aged gold (`#c9a45a` family). This is parchment-and-leather: the sheet itself, its dividers, its labels.
3. **Ink wells** — a *third* material, cool navy (`rgba(9,17,26,·)` → `rgba(12,23,33,·)`), steel-bordered (`rgba(65,82,103,·)`). This is where the pen touches the page: anything you click, roll, or that displays a number that changes.

A fourth, rarer material — **gold-lit** (radial glow + gilt corner brackets, `eldra-ornate-panel eldra-frame-corners`) — is reserved by the ornament rule in §3.3, not a general-purpose surface.

### 3.2 Color roles

Not colors — roles. Each role should resolve to specific values in an implementation phase, but the role is the contract:

| Role | Existing token(s) | Meaning |
|---|---|---|
| **Ground** | `#05080d` | The page background. Never a panel surface. |
| **Primary surface (frame)** | `rgba(20,17,12,0.72–0.88)`, `eldra-codex-soft` | Standard section containers — the parchment |
| **Secondary surface (well)** | `rgba(9,17,26,·)` / `rgba(8,17,27,·)` / `rgba(12,23,33,·)`, border `rgba(65,82,103,·)` | **New role.** Anything interactive: buttons, rollable rows, live-editable fields, stat chips that respond to a tap |
| **Feature surface (gold-lit)** | `eldra-ornate-panel eldra-frame-corners` | The one loud thing per screen (§3.3) |
| **Quiet surface** | Hairline border only, no fill distinct from ground | Rail rows, list rows, accordion dividers |
| **Gold structure** | `#c9a45a`, borders at `0.20–0.42` alpha | Dividers, hairline borders, static chrome |
| **Gold accent (text)** | `#f5e7bd` / `#fff7df` | Titles, emphasized labels, the brightest text on the page |
| **Muted text** | `#9f9278` (labels/kickers), `#6f6754` (provenance/meta) | Anything secondary |
| **Important text / body** | `#d8ceb8` | Prose, descriptions |
| **Success** | `#9ec37d` | Healing, saves succeeded, "your turn" |
| **Danger** | `red-500`/`red-900` family, already established | Damage, saves failed, HP = 0 |
| **Magic / casting** *(new, optional)* | Not yet defined — recommend reserving a narrow violet/arcane accent distinct from gold | Spell-specific ceremony only (slot expenditure glow, cast confirmation) — do not implement until Phase 9; named here so it isn't invented ad hoc mid-phase |
| **Disabled** | Existing `disabled:opacity-50` convention | Unchanged |

The one net-new role is **secondary surface (well)**. Every other role already exists somewhere in the codebase; this document's job is naming and generalizing them, not inventing them.

### 3.3 Ornament rules

**Exactly one loud (gold-lit) thing per screen.** This is already correct in the codebase (§1.2) and already correctly specified in the Beauty Pass §7.2. Restated with the well-surface addition:

- **Gold-lit** (`eldra-ornate-panel eldra-frame-corners`, corner runes optional): the Vitals Bar, and nothing else, on the main sheet view. An open detail drawer may also carry it, because it dims everything behind it — never two gold-lit surfaces visible and un-dimmed at once.
- **Primary (frame)**: every standard tab-content section. Gets a background gradient and a gold hairline border, but no corner brackets, no glow, no blur.
- **Secondary (well)**: any row *inside* a primary surface that is interactive — a roll, a toggle, a live number. This is the addition: previously nothing signaled "this row is different from the row above it that's just a label." Now the well material does that job, with zero new components and zero new interaction patterns — it's a fill/border swap on existing rows.
- **Quiet**: rail list rows, accordion dividers — hairline only, no fill.
- **Never ornate**: form controls (`eldra-input`, `<select>`), empty states, error/loading states, drawers-behind-a-drawer.

### 3.4 Typography rules

Carried forward from Beauty Pass §7.3 essentially unchanged — it was correct — with one addition (well-surface numbers get the glow treatment, not new sizing):

| Role | Treatment |
|---|---|
| Character name | `text-2xl`–`text-4xl font-semibold`, `#fff7df` — the brightest text on the page, always |
| Section heading (kicker) | `text-xs uppercase tracking-[0.3em] text-[#9f9278]` — unchanged, already correct |
| Vital number (HP/AC/DC/Attack) | `text-3xl`/`text-4xl font-semibold tabular-nums`, sitting on a **well** surface when it's the thing you'd tap to change, plain on **frame** when read-only |
| Ability score + modifier | Merged into one tile (already scoped in old doc's Phase 5): score `text-2xl tabular-nums`, modifier `text-lg font-semibold` beside it, not subordinate |
| Body / mechanical labels | `text-sm leading-6 text-[#d8ceb8]` / `text-xs text-[#9f9278]` — unchanged |
| Chips / badges | `eldra-gold-chip` — unchanged |
| Table / list rows | Compact density per §7.4 of the old doc — unchanged |

Numbers should feel inked, not like KPI tiles: this is achieved by (a) `tabular-nums` everywhere a value can change, already specified, and (b) the well-surface material behind any number the player would act on, which is new.

### 3.5 Iconography rules

Beauty Pass §7.5's Lucide vocabulary stays for generic UI and for the five tab icons — it's correctly chosen and already shipped. Generic icons remain acceptable for generic actions: close, search, settings, back, the five tab glyphs.

Reserve a **future** custom glyph set for game-specific concepts that currently borrow generic icons or have none: actions, spells, conditions, rests, dice, damage, healing, armor, class features. Do not build this set now — naming the need is sufficient for this document. When it is built, it should replace icons in the well-surface rows first (where a glyph reinforces "this is a game object," not just "this is a button").

### 3.6 Motion / ceremony

Pick a small number of tactile moments; do not overanimate (per the old doc's §7.9 "nothing flashes at a table" rule, which stays):

1. **Dice roll** — `EldraDiceBox`, retired as a *calculation* mechanism (§1.5), reintroduced as a *presentation* layer animating a server-resolved result. Scoped as its own phase (§8, Phase 9) because it is purely additive and has no dependency on any other visual work.
2. **Damage/healing application** — a brief (150ms, matching the existing combat-emphasis transition already in `CharacterVitalsBar.vue:70`) tint flash on the HP well when a Recovery action lands, not a shake or a bounce.
3. **Slot expenditure** — the gem's rotate-45 fill state changes with a short `transition` (already how V1 does it, `SheetDesktopOverviewDashboard.vue:369` `transition hover:scale-110`); keep it that restrained.
4. **Rest** — no special animation; the existing save-indicator pattern (§7.8 of the old doc) is sufficient feedback.
5. **Drawer opening** — the existing `translate-x-full` slide (§1.7) is already correct ceremony; keep it verbatim via `CharacterDetailDrawer`.

Five moments, all either already built (drawer slide, gem transition) or scoped to a single phase (dice presentation, damage tint). No new ceremony beyond this list without a separate proposal.

---

## 4. Canonical Sheet Target

This section deliberately does **not** redesign layout. The Beauty Pass's §4 (Desktop), §5 (Tablet), §6 (Mobile) are already the correct target and already match this document's brief almost exactly — three-column desktop dashboard, portrait/identity anchor in the left rail, sticky vitals command center, action-center-as-default-tab, bottom nav on mobile with V1's command-center density above it. Re-reading them against this document's material system in §3, the only adjustments are:

**Desktop** (§4 of the old doc, unchanged structurally): apply frame/well/gold-lit materials to the existing three-column grid. Left rail (identity, abilities, skills) uses frame+well (ability tiles and skill rows are wells; everything else is frame). Right rail (spell slots, hit dice, rest, conditions) is the same. Center column tab content is frame, with well rows wherever an action card has a Resolve/Cast/Toggle control. Vitals bar is the one gold-lit surface.

**Mobile** (§6, unchanged structurally): the sticky vitals area gets full command-center density (per §1.3's V1 reference) — identity, HP/AC/DC compact wells, condition chips — and the already-shipped bottom nav stays exactly as built. No new mobile mechanism; this is a materials-and-content pass on what Phase 3–4 already built.

**Tablet** (§5, unchanged): landscape "desktop minus one rail," portrait "phone plus," both already correctly specified; apply the same material pass.

If a future session finds a genuine layout gap while implementing §8's phases below, that's a normal implementation discovery — but the working assumption going in is: **the layout is done. The skin is not.**

---

## 5. Routing Correction Plan

### 5.1 The problem, confirmed against current source

Grepped directly, current state:

**Routes still pointing at legacy V1** (`/worlds/:id/entities/:entityId/sheet`):
- `app/pages/worlds/[id]/characters/index.vue:198,766` — the **roster's own "Open Sheet" link**. This is the one the user hits every time.
- `app/pages/worlds/[id]/admin.vue:361`
- `app/pages/worlds/[id]/characters/builder.vue:2939` (legacy Builder's completion redirect)
- `app/components/world/WorldEntityContextDrawer.vue:155` — the world entity drawer's sheet link

**Routes already correctly pointing at V2** (`/worlds/:id/characters/:characterId/sheet-v2`):
- `app/pages/worlds/[id]/characters/create-v2.vue:325` (new Builder's completion redirect)
- `app/pages/worlds/[id]/characters/[characterId]/abilities.vue`, `proficiencies.vue` (×2 links each)

So the two systems are exactly as parallel as the old doc's §10.1 already found: a character built through the *new* Builder is only reachable from the new Builder's own sub-pages. Every general-purpose entry point (roster, admin, entity drawer, legacy Builder) still hard-links V1.

### 5.2 The detection signal already exists — confirmed

`useCharacterSheet.ts` calls `.../assembly`, which returns `{ available: false, reason: 'no-catalogue-selection' }` for a character with no `catalogue_selection` block (this session's Phase 4 work already built the `assembly.available` branch into `sheet-v2.vue` — a character without it renders `CharacterEmptyState`, not a crash). This is precisely "can this character render on the canonical sheet," with no new schema needed. The old doc's §10.2 table stands:

| Character has | Canonical sheet |
|---|---|
| `catalogue_selection` block | V2 |
| `character_sheets` row only, no `catalogue_selection` | V1, until migrated |
| Neither | V2's existing "nothing to assemble" empty state |

### 5.3 Canonical route choice

Recommend **`/worlds/:id/characters/:characterId/sheet`** (drop the `-v2` suffix) as the permanent canonical URL once V1 is fully retired — `-v2` is an implementation detail that shouldn't outlive the thing it's versioned against. Until V1 retirement is complete (old doc's Phase E/F, unchanged), `sheet-v2` can remain a working alias so nothing currently linking it breaks mid-migration.

### 5.4 Early implementation phase (this document's Phase 0, §8 below)

Do **not** implement this now — per the task brief — but the shape is:

1. Add a resolver at the canonical URL (or reuse the existing `/assembly` call) that checks `catalogue_selection` presence and either renders the V2 sheet directly or transparently serves V1's content at the same URL shape, per §5.2's table.
2. Point exactly four call sites at the canonical route: `characters/index.vue` (roster, both references), `admin.vue`, `WorldEntityContextDrawer.vue`. These are the only remaining V1-hardcoded links.
3. Leave `builder.vue` (legacy Builder) alone for now beyond its redirect target — teaching it to write `catalogue_selection` or marking it legacy-only is the old doc's Phase C, a separate, later decision.
4. Users should never see or need to know "V1" / "V2" / "sheet-v2" as concepts after this phase. One "Open Sheet" action, one URL shape, resolved server-side by data shape.

This is not a new plan — it is the old doc's §10 Phase B, promoted to run **before** any visual work, because it's the fastest way to stop the user from hand-typing a URL, and it's independent of every other phase in this document.

---

## 6. Beauty Pass Work — Classification

| Area | Verdict | Why |
|---|---|---|
| Phase 0 — Workspace mobile shell fix | **Keep** | Confirmed shipped and correct (`world-workspace.vue` off-canvas drawer below `md`). No visual language implication. |
| Phase 1 — `CharacterSheetSection`, `CharacterStatChip`, `CharacterEmptyState`, `CharacterSaveIndicator` | **Keep, restyle** | Structure is right; `CharacterSheetSection`'s elevation tiers need the well-surface addition (§3.3) applied to their *contents*, not the wrapper itself. |
| Phase 2 — `useCharacterSheet`, `useCharacterMutations`, extracted Encounter/Conditions | **Keep** | Pure data-layer work, zero visual surface. Untouched by this document. |
| Phase 3 — `CharacterVitalsBar`, `CharacterRecoveryPanel` split | **Keep structure, rework visuals** | The split (display vs. action) is correct and stays. The Vitals Bar needs identity/portrait + well-surface treatment (§2.3). Recovery panel needs its four boxes differentiated by well/frame, not left identical (§2.1). |
| Phase 4 — `CharacterSheetShell`, `CharacterSheetDesktopLayout`, `CharacterSheetNav`, `useCharacterSheetLayout` | **Keep entirely** | Rails, tabs, bottom nav, URL sync, breakpoint mechanism — all structurally correct per §2.7 and §4 of this document. Only the *contents* placed inside these regions need visual work; the shell itself needs nothing. |
| Phase 5 (old doc) — Ability grid, skills, level, `CharacterIdentityCard` | **Supersede scope, keep intent** | Still the right content work (merge score+modifier+save, add portrait, add level). This document's §8 Phase 3–4 absorb it with the material system applied from the start, rather than building it plain and restyling later. |
| Phase 6 (old doc) — Action Center redesign | **Supersede scope, keep intent** | Same reasoning — becomes this document's §8 Phase 5. |
| Phase 7 (old doc) — Spell slot tracker | **Supersede scope, keep intent** | Becomes this document's §8 Phase 6. Gem pattern (§1.6) is already fully specified; just needs the well-surface material. |
| Phase 8 (old doc) — Inventory/Notes | **Supersede scope, keep intent** | Becomes this document's §8 Phase 6 (bundled with Spells — see phase sizing note below). |
| Phase 9 (old doc) — Conditions/Encounter/polish | **Supersede scope, keep intent** | Becomes this document's §8 Phase 7 groundwork, plus dice/ceremony split into its own §8 Phase 8. |
| §10 — V1 Retirement Plan | **Keep entirely, resequence** | Phase B (routing) is promoted to run first (this document's §8 Phase 0), everything else (A/C/D/E/F) is unchanged and stays last. |

No architectural, data-layer, or server-side decision from the old document is revisited anywhere in this document.

---

## 7. What NOT to change, restated

Per the task's non-goals and reinforced by everything found above: no gameplay mechanics, no Rules Engine changes, no Content Pipeline changes, no persistence model changes, no server-side calculation of anything currently computed by the Rules Engine, no reintroduction of client-side dice *resolution* (only *presentation*, §3.6), no new abstractions beyond what's named above (no fifth material, no sixth tab, no GM-only surface — that's Eldra 2.1 per the old doc's own open question #1).

---

## 8. Implementation Plan

Each phase is independently shippable, Sonnet-sized, and states what must not change. Phase numbers below are this document's own; where a phase absorbs an old-doc phase, that's noted.

### Phase 0 — Canonical routing correction

**Goal.** Stop the roster (and admin, and the entity drawer) from hard-linking legacy V1. One "Open Sheet" action, resolved by data shape.
**Files.** `characters/index.vue`, `admin.vue`, `WorldEntityContextDrawer.vue`, a new resolver (route or reused `/assembly` check).
**Risk.** Medium — touches the most heavily-used navigation entry point in the app (the roster).
**Why first.** Independent of every visual phase below; delivers the user's most urgent complaint immediately; and de-risks every subsequent phase by confirming which characters actually render on which sheet before more work is built on top of V2's rendering path.
**Must not change.** V1's own rendering, the legacy Builder, any Directus schema, `character_sheets` collection. This phase resolves *which* sheet is opened, never *what* either sheet does.
**Manual test.** Roster "Open Sheet" for a `catalogue_selection` character lands on V2; for a legacy-only character lands on V1 with no error; admin and entity-drawer links match.

### Phase 1 — Visual token / material system

**Goal.** Name and centralize the three-material system (§3.1–3.2) as reusable tokens/utility classes: ground, frame, well, gold-lit, gold structure/accent, muted/important text. No component redesign yet — this phase makes the vocabulary available.
**Files.** `app/assets/css/eldra-fieldguide.css` (extend, don't replace), possibly a new small CSS module for the well-surface family specifically since it doesn't exist yet anywhere.
**Risk.** Low — additive only; nothing currently uses the new well tokens, so nothing can regress.
**Why second.** Every content phase after this one (§8 Phase 2–7) needs the well-surface vocabulary to exist before it can be applied.
**Must not change.** Any existing `eldra-*` class's current values — this phase adds, it does not redefine.
**Manual test.** New tokens/classes render correctly in isolation (a scratch page or Storybook-style check); no existing page's appearance changes.

### Phase 2 — Vitals Bar redesign (identity + well material)

**Goal.** Fix §2.3's three concrete gaps: add a portrait/identity anchor, apply well-surface material to actionable numbers, add the gold-glow depth cue to HP specifically.
**Files.** `CharacterVitalsBar.vue`.
**Risk.** Medium — the single most-visible component on the page.
**Why third.** Highest-leverage single change; the Vitals Bar is visible on every tab, every breakpoint.
**Must not change.** Any prop contract, any value source (still 100% Rules Engine output), the sticky/scroll mechanism from Phase 3 (old doc).
**Manual test.** Portrait renders (or graceful fallback per §1.4); HP/AC/DC sit on well surfaces where actionable; HP carries a visible glow; combat-emphasis tint (existing) still works; no layout shift versus current.

### Phase 3 — Identity anchor + Ability/Skills redesign (absorbs old Phase 5)

**Goal.** `CharacterIdentityCard` (portrait, name, level, species/class/background) in the left rail; `CharacterAbilityGrid` merging score+modifier+save into one tile; skills as well-surface rows.
**Files.** `CharacterAbilityScoresPanel.vue` → `CharacterAbilityGrid`, new `CharacterIdentityCard`, `characterDerivedValues.ts` (region selection only, no new calculation).
**Risk.** Low–Medium — reads existing derived output only, per old doc's Phase 5 risk assessment (unchanged).
**Why fourth.** Establishes the identity anchor the Vitals Bar's compact mobile view also needs, and the drawer primitive later phases reuse.
**Must not change.** No new Rules Engine categories; `progression`/`combat` surfacing uses categories that already exist per §1.8a of the old doc.
**Manual test.** Portrait shows in left rail; level appears in identity and vitals bar; STR 16 shows score+modifier+save in one tile; ability tiles and skill rows sit on well surfaces.

### Phase 4 — Action Center redesign (absorbs old Phase 6)

**Goal.** Structured filter bar, well-surface rows for resolvable actions, clear result presentation — V1's Action Center idea (§1.3 of old doc), rebuilt on structured `ContentAction` data.
**Files.** `CharacterActionsPanel.vue` → split per old doc's §8.2 (`CharacterActionCard`, `CharacterActionFilterBar`, `CharacterTargetPicker`, `CharacterCombatResult`).
**Risk.** Medium — combat resolution is live gameplay; server untouched, but presentation of results changes.
**Why fifth.** Default tab, densest interaction; later tabs reuse its list/filter/well/drawer patterns.
**Must not change.** `character-combat.ts`, resolution logic, any calculation — this phase presents existing `CombatOutcome` data more legibly, it does not change what's computed.
**Manual test.** Filter by category, resolvable-only toggle; resolve melee/ranged/spell/save actions; results render with clear hit/miss/crit hierarchy on well surfaces; unresolvable actions show no control.

### Phase 5 — Recovery panel material pass

**Goal.** Differentiate `CharacterRecoveryPanel`'s four sections (HP correction, Hit Dice, Rest, Death Saves) by well/frame material instead of four identical boxes (§2.1).
**Files.** `CharacterRecoveryPanel.vue`.
**Risk.** Low — presentation only; every mutation/emit contract unchanged.
**Why sixth.** Small, isolated, and removes one of the two most-cited "admin dashboard" examples found during research (§2.1).
**Must not change.** `RecoveryActionType`, emit shapes, clamping logic — all unchanged.
**Manual test.** Same as old doc's Phase 3 manual checklist (damage applies temp-first, death saves appear at 0 HP) — behavior identical, only material differs.

### Phase 6 — Spells / Inventory / Notes material pass (absorbs old Phases 7–8)

**Goal.** Gem-strip spell slot tracker (`CharacterResourcePips`, §1.6), well-surface treatment for equip/attune toggles and prepared-spell rows, search in Inventory, autosave indicator in Notes.
**Files.** `CharacterSpellcastingPanel.vue`, `CharacterInventoryPanel.vue`, `CharacterNotesPanel.vue`.
**Risk.** Low–Medium.
**Why bundled.** All three are the old doc's lowest-risk remaining content phases (its own §11 marks Inventory/Notes "Low," Spells "Low–Med"); bundling keeps the phase count sane without raising risk.
**Must not change.** `spellcasting.test.ts`, `inventory.test.ts` behavior; no new mutation types.
**Manual test.** Slots expend/restore as gems; casters/non-casters see correct UI; equip toggles AC in the vitals bar; search filters inventory; all six note fields still autosave.

### Phase 7 — Conditions, Encounter, and remaining polish (absorbs old Phase 9, minus dice)

**Goal.** Condition chips well-surfaced in the vitals bar with tap-to-manage; turn/round state; replace `window.prompt()` in the encounter page; final empty/error/loading state sweep for the new materials.
**Files.** `CharacterConditionsPanel.vue`, `CharacterEncounterPanel.vue`, `encounters/[encounterId].vue`.
**Risk.** Low–Medium.
**Must not change.** Encounter test suite behavior; no-automation rule on expired conditions.
**Manual test.** Per old doc's Phase 9 checklist, unchanged.

### Phase 8 — Interaction ceremony (dice presentation, damage tint)

**Goal.** Reintroduce `EldraDiceBox` as a presentation layer only, animating server-resolved rolls (§1.5, §3.6); add the 150ms damage/heal tint.
**Files.** Wherever combat/roll results currently render (from Phase 4 above), `EldraDiceBox.client.vue` (reuse, do not redesign the dice library itself).
**Risk.** Low — purely additive visual feedback; if removed, nothing about correctness changes.
**Why late.** Depends on Phase 4's `CombatOutcome` presentation being settled; a genuinely optional phase that can also be dropped or deferred without blocking anything else.
**Must not change.** `character-combat.ts`'s server-side resolution — the dice animation must visualize a result it is handed, never produce one.
**Manual test.** Rolling an attack/save shows a dice animation resolving to the exact number the server already returned; disabling the animation (e.g., reduced-motion) still shows the correct result instantly.

### Phase 9 — V1 retirement (old doc §10, Phases C–F, unchanged)

**Goal.** Stop creating V1-only characters, migrate or archive existing ones, redirect, then delete. Exactly as specified in the old document's §10.3 table — not repeated here since nothing about it changes.
**Must not change.** No phase deletes data; migration is manual and reviewed per CLAUDE.md's deployment procedure; `character_sheets` collection is not dropped by this plan.

### Phase summary

| # | Phase | Absorbs (old doc) | Risk | Independent value |
|---|---|---|---|---|
| 0 | Routing correction | §10 Phase B | Medium | Yes — fixes the user's most immediate complaint |
| 1 | Visual token / material system | — (new) | Low | Enables every phase after it |
| 2 | Vitals Bar redesign | — (new content on existing component) | Medium | Yes — highest-visibility single change |
| 3 | Identity + Ability/Skills | Phase 5 | Low–Med | Yes |
| 4 | Action Center redesign | Phase 6 | Medium | Yes |
| 5 | Recovery panel material pass | — (new content on existing component) | Low | Yes |
| 6 | Spells/Inventory/Notes material pass | Phases 7–8 | Low–Med | Yes |
| 7 | Conditions/Encounter/polish | Phase 9 (minus dice) | Low–Med | Yes |
| 8 | Interaction ceremony | Open question #4 | Low | Optional, additive |
| 9 | V1 retirement | §10 Phases C–F | Varies | Final |

---

## 9. Risks and Open Questions (additions only — old doc's §12 stands)

1. **The well-surface material is genuinely new vocabulary.** Unlike everything else in this document, it has no existing CSS class to lift verbatim — Phase 1 has to actually name and value it. Get one component (Vitals Bar, Phase 2) reviewed against it before applying it everywhere in Phase 3+.
2. **Phase 0 (routing) touches the roster**, the single most-used navigation surface for characters. Old doc's Risk #1 (Phase 0 workspace fix touching every page) is the right template for how carefully to test this: manual sweep of every entry point in §5.1, both character types.
3. **Magic/casting accent color (§3.2) is named but not valued.** Do not invent a value under phase pressure — if Phase 6 needs it, treat picking it as a small decision point, not a default.
4. **Scope discipline under "make it feel like Eldra again."** The user's brief is emotionally clear and that's valuable, but "feels right" is not a test criterion. Every phase above ends in a concrete, checkable manual test list for exactly this reason — hold to those, not to a vibe check, when deciding a phase is done.

---

## Appendix — Evidence Index

Every specific claim in §1–2 above is backed by a file:line citation inline. Files read in full for this document beyond what the old Beauty Pass audit already covered: `eldra-fieldguide.css`, `SheetDesktopOverviewDashboard.vue`, `SheetDesktopIdentityHeader.vue`, `SheetDesktopPortraitFrame.vue`, `SheetTabBar.vue`, `SheetRestControls.vue`, `SheetAbilityGrid.vue`, `SheetCombatPanel.vue`, `SheetDesktopToolbar.vue`, `SheetSaveStatus.vue`, `SheetItemDetailDrawer.vue`, `SheetFeatureDetailDrawer.vue`, `sheet.vue` (targeted sections: 1–200, 7550–7995, 8785–8871), `CharacterVitalsBar.vue`, `CharacterActionsPanel.vue`, `CharacterRecoveryPanel.vue`, `CharacterAbilityScoresPanel.vue`, `world-workspace.vue` (routing/responsive sections), plus a full routing grep across `app/pages`, `app/components`, `server`.
