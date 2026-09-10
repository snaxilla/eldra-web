# Eldra Design Language

**Status:** Plan — the visual constitution of the product. Approved sections below govern every future screen.
**Supersedes:** the *scope* of `eldra-character-sheet-visual-language.md` — that document is now the Character-Sheet-specific implementation of the rules defined here, not an independent visual system. Where its four-part surface vocabulary (ground/frame/well/feature) is narrower than this document's material language, this document is authoritative; the surface vocabulary itself is unchanged and carried forward verbatim.
**Does not supersede:** either prior document's Information Architecture, layout specs, component lists, routing plan, or already-shipped work (Beauty Pass Phases 0–4, Visual Language Phase 0/routing — all committed and unaffected by this document).
**Scope:** Eldra's product-wide visual identity — material, color, type, interaction, motion, and the rules a contributor checks a new screen against. **Non-scope:** no code, no CSS, no component changes, no commits. This is a reference document.

---

## 0. Why a product document now, not another screen

Every subsystem that needed to be *correct* is done: Rules Engine, Content Platform, Character system, Encounter system. The Character Sheet work already underway (`character-sheet-beauty-pass.md`, `eldra-character-sheet-visual-language.md`) diagnosed why V1 felt like a game and V2 felt like a dashboard, and prescribed a material system to close that gap — inside the sheet.

Auditing the rest of the application before writing this document turned up something the sheet-scoped work couldn't have found on its own: **the gold-ink material language those documents prescribe for the sheet is already the de facto standard almost everywhere else in Eldra.** The World collection pages (classes, species, items, spells, backgrounds, feats, races, locations, enemies), the entity article view, the workspace sidebar, the encounter pages, the timeline, and even the Leaflet map's own zoom controls are already built on `eldra-ornate-panel`, `eldra-frame-corners`, `eldra-gold-chip`, `eldra-button`, and the same gold/ink palette — richly and consistently. This was never written down as a rule. It was arrived at independently, screen by screen, and it happens to be right.

So this document's job is narrower and lower-risk than "invent Eldra's look": **name what already works, make it a rule instead of a habit, close the specific gaps where the app quietly drifted off it, and give the Character Sheet the same treatment the rest of the product already has.** Section 9 (Application Audit) shows the evidence for every claim in this paragraph.

---

## 1. What Is Eldra

Emotionally, not mechanically: **Eldra is a wizard's field codex** — part cartographer's atlas, part campaign folio, part spellbook, kept in a worn leather binding, its pages parchment, its clasps and chapter-markers gold, its working notes inked in a cooler hand than its illuminated headings. You are not opening a database of your campaign. You are opening the book that *is* your campaign.

This single metaphor resolves every material and hierarchy question below by analogy: a codex has a binding (the shell — sidebar, chrome, the thing that's always there), pages (content surfaces — parchment/frame), a few illuminated capitals per chapter (ornament, rationed), and a working margin where the owner has actually written things down in a different, plainer ink (the interactive well — anything you act on, not just read). Every material, color, and hierarchy rule in this document is that codex, made specific.

**What Eldra is not:** a SaaS admin console, a spreadsheet, a Discord bot's settings page, a mobile banking app. If a screen would look at home in any of those products with only its copy changed, it has failed this document regardless of how "clean" it is.

---

## 2. Material Language

Not colors — what things are *made of*. Every surface in the product should read as one of these, and the choice should be legible without reading a class name.

| Material | What it is | Where it already lives | Structural role it fills |
|---|---|---|---|
| **Ink** | The ground everything sits on — cool, near-black, faintly blue (`#05080d`), not warm black and not neutral gray. The page itself, the void behind the book. | Character Sheet page background (`sheet.vue:7561,8827`), the workspace content area's own gradient (`world-workspace.vue:277`, `#0b0d12→#0d1117→#10141b`) | Ground |
| **Gilt metal (gold)** | Warm aged gold, structural and occasionally glazed — clasps, hinges, chapter dividers, illuminated capitals. Never just a hairline; it should feel forged, not printed. | `eldra-gold-chip`, `eldra-button`, `eldra-ornate-panel`'s radial glaze, every collection card border in `WorldEntityInteractivePage.vue` | Frame borders, Feature-surface glow, dividers |
| **Parchment / paper** | Warm charcoal fill inside a gilt frame — the page itself. Slightly uneven, never a flat single tone (a subtle gradient, not a solid fill). | `eldra-codex-soft`, `eldra-codex-panel` | Frame fill (Reference Surface, Quiet Background) |
| **Steel (interactive ink-well)** | A *second*, cooler, distinct metal — a well cut into the page for anything the reader touches: a die, a coin, a token, a live number. Cool navy fill, steel-blue border, never gold. | `SheetDesktopOverviewDashboard.vue:269,290,314,358` (ability/save/skill rows), `admin.vue`'s party cards (`rgba(8,17,27,0.42–0.58)`) and Sheet button, `encounters/[encounterId].vue` | Interactive Well |
| **Glass** | A frosted pane over the ink ground — used sparingly, for things that float *above* the page: an open drawer, a popover, a modal. Backdrop-blur is the tell. | `backdrop-blur-xl` on every `eldra-ornate-panel`/drawer instance already in the codebase | Feature Surface (when it's an overlay, not the vitals bar) |
| **Leather** | The binding itself — near-black, warm, unornamented except at its one seam of gold. Persistent, never scrolls, never changes with content. | The workspace sidebar's own background (`world-workspace.vue`, sidebar gradient `#090806→#11100d→#070604`), `eldra-sidebar-ornate`/`eldra-sidebar-brand` | The shell chrome (sidebar, toolbar), distinct from page content |
| **Danger** | Old sealing wax — red, matte, never neon. | `border-red-900/60 bg-red-950/20 text-red-200` (already consistent everywhere: `CharacterRecoveryPanel.vue`, `CharacterActionsPanel.vue`) | Semantic — see §5 |
| **Success** | New growth — a muted, natural green, not a status-light green. | `#9ec37d` (already consistent) | Semantic — see §5 |
| **Disabled** | Faded ink — the same material, half-legible. `opacity-50` on whatever it would otherwise be, never a fourth gray. | Existing `disabled:opacity-50` convention | Applies uniformly to every material |
| **Magic (reserved)** | Not yet assigned a value. A narrow arcane accent — violet or similarly cool-and-rare — reserved exclusively for spellcasting ceremony (slot expenditure glow, cast confirmation), named here so no phase invents one under pressure. | Nowhere yet | Semantic, reserved |
| **Wood (reserved, not currently used)** | Named because the task asked for it, and because a future shelf/library metaphor (a campaign browser, a bookshelf of Worlds) might one day want it. **No current surface should claim this material** — forcing it into an existing screen would be decoration without a referent. | Nowhere; leave unused | Reserved |

**The one genuinely new rule this document adds to what §3 of the Character Sheet document already established:** Steel (the interactive well) and Leather (the shell binding) are *both* cool, dark, low-ornament materials, and they are easy to conflate. They are not the same thing. **Leather never changes and never responds to a click — it's the sidebar, the toolbar, the thing that's the same on every page. Steel is always something you did something to, or could.** A sidebar nav item hovering into a gold state is Leather with a Frame-family accent; an ability score you can click to roll is Steel. Getting this distinction wrong is exactly how a page ends up feeling like a form: everything the same material regardless of whether it does anything.

---

## 3. Visual Hierarchy

**Exactly one Feature surface per screen.** This is not new — it is already how the codebase's own `eldra-ornate-panel eldra-frame-corners` is used in every screen studied for this document (the Character Sheet's single outer card, one open drawer at a time, one Vitals Bar). State it as a rule because the one place it was violated (V2's nine identical sections) is exactly the failure both prior documents diagnosed.

**What deserves weight, ranked:**
1. The number or fact the user is at this screen *for* — HP, the die result, the map pin they clicked, the timeline event they opened. Gets the largest type, the Feature surface if it's the reason for the whole screen, or a Steel well if it's one live thing among several.
2. Identity — a name, a portrait, a title. Second-largest type, always near the top, never buried in a `<dl>`.
3. Everything else is Frame (Reference Surface) or Quiet (list rows, dividers) — no exceptions, no "just this one card is a little special."

**What must remain quiet:** anything the user reads far more often than they act on it — proficiency lists, provenance text, secondary metadata, empty states, loading states. Quiet means hairline border only, no fill distinct from the page, no gold glow.

**What may never become ornate, under any circumstance:**
- Form controls (`<input>`, `<select>`, `eldra-input`) — a control is a tool, not a treasure. Ornament on a text field reads as broken, not beautiful.
- Error and loading states — these need to be *found instantly*, not admired. Plain, high-contrast, no frame.
- Anything that repeats more than ~5 times on a screen (a list row, a table cell) — ornament repeated becomes wallpaper, which is precisely how V2's nine identical `eldra-ornate-panel` sections failed.
- Navigation chrome that is *always* on screen (sidebar, bottom nav, toolbar) — these are Leather, not Feature. They should feel permanent and unshowy, the spine of the book, not another illuminated page.

---

## 4. Typography

Eldra currently runs entirely on one typeface — Public Sans, vendored locally (`@fontsource/public-sans`, `main.css`) specifically to avoid the `@nuxt/fonts` Google Fonts build-time fetch that was already causing failures (see `nuxt.config.ts`'s own comment on this). That constraint is real and must survive any typography change below: **any new font must ship vendored the same way, never through `@nuxt/fonts`' automatic Google Fonts resolution.**

| Role | Face | Where |
|---|---|---|
| **Display** (character names, World titles, chapter-style headings) | A humanist/old-style serif with real character — not a geometric slab, not a "fantasy" display font that stops being legible past 24px. This is the one deliberate typographic addition this document proposes; it does not yet exist anywhere in the codebase. | Character name in the Vitals Bar / Identity Card, World title, entity article `<h1>` |
| **Mechanical** (kickers, labels, stat names, tab labels) | Public Sans, current treatment unchanged: `text-xs uppercase tracking-[0.3em]` — this is already correct and already distinctive; it does not need a different face, only to stay a face apart from Display once Display exists | Every `eldra-kicker`, section heading |
| **Body** (prose, descriptions, notes) | Public Sans, current treatment unchanged | Article content, notes, feature/spell descriptions |
| **Numerical** (HP, AC, ability scores, dice results, currency) | Public Sans with `tabular-nums` — already the established, correct pattern (`eldra-character-sheet-visual-language.md` §3.4). **Do not introduce a monospace face for game numbers** — monospace reads as a terminal/ledger, which is the wrong material entirely; `tabular-nums` already solves the actual problem (alignment, no jitter) without borrowing a foreign material. | HP/AC/DC, ability tiles, currency ledger |

**Where serif belongs:** display only — names and titles, the handful of places a codex would actually have illuminated lettering. Never body copy (a full page of serif at 14px reads as a legal document, not a fantasy book), never mechanical labels, never numbers.

**Where sans belongs:** everything else. Public Sans already carries the "modern readability" half of the brief correctly; the addition of a display serif is what adds "fantasy flavor" without sacrificing that.

**Where monospace belongs:** nowhere player-facing. If it is ever needed, it is for genuinely technical/debug contexts only — a raw Directus id shown to an admin, a JSON payload in a dev tool — never for a game number, ever.

---

## 5. Color Language

Not colors — meanings. The same color must mean the same thing everywhere it appears, or it stops being language and becomes decoration.

| Color | Meaning | Never means |
|---|---|---|
| **Gold** (`#c9a45a` family) | Structure, ceremony, "this is Eldra's." Borders, dividers, the one Feature glow per screen, primary actions. | A generic "brand accent" sprinkled for warmth — gold is load-bearing, not decorative. Never the color of a disabled or quiet element. |
| **Ink-navy / steel-blue** (the well family) | "This is a mechanism — press it, roll it, it changes." | Never used for something that's purely informational. If a well-colored row does nothing when clicked, that's a lie the color is telling. |
| **Green** (`#9ec37d`) | Success, healing, "your turn," growth. | **Never a primary button color.** `app.config.ts` sets Nuxt UI's default `primary: 'green'` — this is a real, live trap: any unstyled `<UButton>` on the page renders green by Nuxt UI default, which would collide with Success semantics and is never what a primary action on Eldra should look like. Every primary action must be gold (`eldra-button` or an explicitly gold-themed UI component), never the Nuxt UI default. |
| **Red** | Danger, damage, failure, "this needs attention now." | Never used decoratively; reserve its visual weight for things that are actually bad news. |
| **Gray / slate** | Structural neutrality only — a divider, a disabled state's residual outline. | Never a large fill on its own; Eldra has no screen whose dominant color is plain gray. Nuxt UI's `neutral: 'slate'` default should only ever surface as this — an outline, never a panel. |
| **Violet/arcane (reserved)** | Spellcasting ceremony only, once assigned (§2). | Not to be improvised as a generic "magic-adjacent" purple anywhere else. |

---

## 6. Interaction Language

Feeling, not implementation:

- **Buttons** should feel like pressing a seal into wax — a small resistance, then a clear commit. Primary = gold fill, unmistakably the one thing to do. Secondary = a gold hairline, present but not asking for attention. Destructive = the sealing-wax red, never playful.
- **Inputs** should feel like writing in a margin, not filling out a form — a plain ink-well rectangle, no ornament, obvious focus state, never trying to look important.
- **Drawers** should feel like a page being lifted to reveal what's underneath — slide from the edge, dim what's behind, never cover the whole screen unless the device is too small to do otherwise.
- **Cards** should feel like index cards in a box, not tiles in a dashboard — one per real thing (a spell, an item, a character), never a generic content container reused for whatever needs a box that week.
- **Tabs** should feel like tabbed dividers in a binder — a physical position you flip to, not a browser-style pill switcher.
- **Lists** should feel dense and scannable, like a table of contents — Quiet material, hairline dividers, no per-row card chrome.
- **Chips/badges** should feel like a wax seal or a guild mark — small, gold, unmistakably "this is a tag," never a generic rounded rectangle with a random color.
- **Dice** should feel like dice — physical, a little unpredictable in motion even though the result is already decided server-side (§7).
- **Animation in general** should feel like turning a page, not like a UI framework demo. If a motion could be described as "snappy" or "juicy" rather than "like something a physical object would do," it's the wrong motion for Eldra.

---

## 7. Motion Language

Ceremony is rationed, deliberately, across the *whole* product — not just the sheet:

| Moment | Ceremony | Why |
|---|---|---|
| **Rolling dice** | A real animated roll (`EldraDiceBox`, presentation-only per `eldra-character-sheet-visual-language.md` §1.5/§3.6), resolving to a server-decided number | The single highest-frequency moment of chance in the whole product; it should feel like chance even though it isn't computed client-side |
| **Opening a character** | The sheet's own load state should feel like opening a book to a bookmarked page — a brief, composed loading skeleton, never a bare "Loading…" string | First impression of "this is my character," not "this is a page fetching JSON" |
| **Resolving combat** | A clear, legible hit/miss/crit reveal in the action row (already scoped in the sheet doc's Phase 4/old-doc Phase 6) — a beat of emphasis, not a screen-shake | Combat results are the payoff of the whole Action Center; they deserve exactly one beat, not zero and not five |
| **Applying damage/healing** | A brief (150ms) tint transition on the HP well — already the established pattern (`CharacterVitalsBar.vue:70`) | Visible without being alarming; "nothing flashes at a table" stays the rule |
| **Long Rest** | No special animation beyond the existing save-indicator — rest is restorative and calm, not an event to celebrate visually | Overselling a rest with motion would contradict what rest *means* |
| **Finding treasure / adding an item** | Not yet built anywhere. Worth exactly one small ceremonial beat — an item row briefly highlighting gold as it's added to Inventory — the single new ceremony this document proposes beyond what's already scoped. Do not build a loot-drop animation library; one highlight state is the entire scope. |
| **Drawer opening** | The existing slide-from-edge (§1.7 of the sheet doc) | Already correct everywhere it's used |

**Where motion should never exist:** list scrolling, tab switching, hover states beyond a color/border transition, anything that would replay every time a value updates from a live data source (a websocket-driven encounter update should not re-animate the whole row). Avoid animation for animation's sake — a motion that doesn't correspond to a real-world action (turning a page, rolling a die, sealing a letter) doesn't belong.

---

## 8. Soundness Rules

The commandments a contributor checks a new screen against. Each is testable, not aspirational:

1. **Exactly one Feature surface per screen.** If a second one is needed, one of them is wrong.
2. **Interactive controls always sit on a Steel well, never a Frame or Quiet surface.** If clicking something does nothing, it does not get well material.
3. **Important numbers never sit on Quiet surfaces.** If a number matters enough to read at a glance, it gets at least Frame treatment and appropriate numerical typography (§4).
4. **Identity is anchored by a portrait or equivalent image first, name second, everything else after.** No identity block may lead with a `<dl>`.
5. **Leather (shell chrome — sidebar, toolbar, bottom nav) never carries Feature ornament.** It is permanent furniture, not a page.
6. **Gold is structural, never decorative.** If removing a gold accent would change nothing about what the user understands, it shouldn't be there.
7. **No repeated element (list row, card, table cell) may be ornate.** Ornament repeated past ~5 instances becomes wallpaper.
8. **Primary actions are always gold, never a framework default.** A raw, unstyled `<UButton>`/`<UBadge>`/etc. rendering in Nuxt UI's default `primary`/`neutral` tokens on a user-facing surface is a bug, not a placeholder.
9. **Every semantic color (§5) means the same thing everywhere it appears.** A palette audit that finds green used for anything but success/growth, or red for anything but danger, is a defect.
10. **Serif is display-only.** A serif anywhere in body copy, mechanical labels, or numbers is a mistake, not a style choice.
11. **Monospace is never player-facing.** Full stop.
12. **Motion corresponds to a physical action, or it doesn't ship.** "It feels snappy" is not a justification; "it feels like turning a page/rolling a die/sealing wax" is.
13. **A component's CSS class must actually deliver the material its content implies.** (This rule exists because of §9.4's `.eldra-empty` finding — a component whose text is gold-toned but whose container renders a different, unrelated material is a defect even though nothing looks obviously "broken.")

---

## 9. Application Audit

Grounded in source, not memory — every claim below was checked against the actual current codebase.

### 9.1 Character Sheet
Covered exhaustively by the two prior documents. Status: V1 proved the material language; V2's structure (shell, rails, tabs, bottom nav) is correct and shipped; V2's individual content panels are the one place in the entire product that has not yet adopted gold-ink-steel material — they're still the flat, undifferentiated boxes both prior documents diagnosed. This document changes nothing about that plan; see §12.

### 9.2 World collection pages (classes, species, items, spells, backgrounds, feats, races, locations, enemies)
All render through `WorldEntityInteractivePage.vue` (1,961 lines). Confirmed: this component is **already** built almost entirely on the gold-ink language — `eldra-ornate-panel`, `eldra-ornate-card`, `eldra-frame-corners`, `eldra-corner-runes`, `eldra-card-glyph`, `eldra-gold-chip`, `eldra-codex-soft`, backdrop-blur drawers. This is, today, the single best-executed example of the material language anywhere in the product — arguably ahead of the Character Sheet. Two stray classes (`eldra-panel`, `eldra-empty`) remain from an abandoned earlier palette (§9.4) and should be swapped for their gold-language equivalents whenever this file is next touched — not urgent, but worth a line item.

### 9.3 Articles (entity detail/wiki view)
Same component as §9.2 (`WorldEntityInteractivePage.vue` serves both list and detail). Same verdict.

### 9.4 The workspace shell (sidebar, page chrome)
`world-workspace.vue` and `WorldWorkspaceSidebar.vue` are already fully on-language: the sidebar is Leather (`eldra-sidebar-ornate`, near-black gradient, gold seam), nav items use the gold hover/active treatment, the brand mark uses the gold-lit text treatment. **Finding:** `app/assets/css/eldra-shell.css` (1,389 lines, globally loaded via `nuxt.config.ts`) is ~95% dedicated to the Character Sheet's per-character custom theming feature (`.sheet-theme-surface`, `.sheet-parchment-surface`, `.sheet-title-frame` — a real, narrow feature letting a player recolor their own sheet, out of scope for this document). But its first 47 lines define a **second, unused-by-the-shell, blue-steel palette** (`.eldra-shell-bg`: `linear-gradient(#0f1724→#132031→#162536→#18293d)`, `.eldra-panel`: `rgba(23,34,50,·)` with white-alpha borders) — the file's own header comment ("Brighter, cooler, more readable non-map shell") describes an earlier design direction that was evidently abandoned in favor of the gold-ink treatment actually shipped in `world-workspace.vue`, but never deleted. Grepped usage: `.eldra-shell-bg`/`.eldra-panel`/`.eldra-panel-soft` appear in exactly two files (`enemies.vue`, `WorldEntityInteractivePage.vue`), each using only one or two of the classes incidentally. **This is dead design intent, not a live competing system** — safe to retire once someone is in those two files for another reason (do not go looking for it unprompted per CLAUDE.md's cleanup-only-with-permission rule).
- **A more interesting finding:** `.eldra-empty` — the class `CharacterEmptyState.vue` itself uses — is defined **only** in this same blue-steel block (`eldra-shell.css:36`), never in the gold `eldra-fieldguide.css`. So the one shared empty-state component in the entire Beautification Pass currently renders its container in the abandoned blue-steel material while its icon/text colors are manually overridden inline to gold tones. This is a real, live instance of Soundness Rule #13 — worth a one-line fix (rebase `.eldra-empty` onto the gold-ink material) whenever `CharacterEmptyState.vue` is next touched; not urgent enough to justify touching it solely for this.

### 9.5 Maps
The World Map page's own chrome (buttons, `world-workspace.vue` toolbar) is gold. The Leaflet zoom control is **already explicitly gold-themed** (`eldra-fieldguide.css`'s `.leaflet-control-zoom` rules) — a genuinely well-executed detail, extending the material language into a third-party library's own chrome. No gaps found.

### 9.6 Encounters
`encounters/index.vue` and `encounters/[encounterId].vue` are already gold-ink, including well-material rows (`rgba(158,195,125` for success/turn state, matching §5's green-means-success rule already, unprompted). No gaps found.

### 9.7 Administration
`admin.vue` already uses gold structure and well-material party cards (`rgba(8,17,27,·)`), consistent with everything above. One typecheck-flagged raw `UButton`-shaped prop issue exists in this file (pre-existing, unrelated to visual language) — worth noting as a place to double-check Soundness Rule #8 (no unstyled Nuxt UI defaults) next time this file is edited, not a finding that needs action now.

### 9.8 Timeline
`timelines/index.vue` already gold-ink (`eldra-ornate-panel`, `eldra-input`, `eldra-button`). No gaps found.

### 9.9 Inventory
Lives inside the Character Sheet (`CharacterInventoryPanel.vue`); covered by §9.1's verdict and the existing implementation plan (§12 Phase 6 below).

**Overall audit conclusion:** Eldra already has a real, working, product-wide visual identity. It is not something to invent — it is something to *name*, apply the one missing material (the Steel well) to the two places that don't yet have it (V2's sheet content panels, and the couple of stray blue-steel remnants), and hold the line on going forward.

---

## 10. Anti-Patterns

Explicit, each tied to a real instance found in this or the prior two documents' research:

1. **Do not stack identical cards forever.** V2's nine byte-identical `eldra-ornate-panel` sections (`character-sheet-beauty-pass.md` §2.2) — the founding anti-pattern this whole line of work exists to fix.
2. **Do not ornament everything.** The V1 mistake (`eldra-character-sheet-visual-language.md` §1.2/§1.8) — ornament on every panel is as illegible as ornament on none.
3. **Do not use gold only as a hairline border.** V2's current `CharacterActionsPanel`/`CharacterRecoveryPanel`/`CharacterAbilityScoresPanel` treatment (`eldra-character-sheet-visual-language.md` §2.1–2.2) — a 1px outline around a neutral fill is an accent, not a material.
4. **Do not use stock icons for game concepts.** Named and deferred, not yet built, in `eldra-character-sheet-visual-language.md` §3.5 — restated here as a whole-product rule: any future World-level iconography (item types, condition types, map object types) should follow the same "generic UI icon vs. Eldra glyph" split.
5. **Do not present gameplay like CRUD.** Bare `<select>`/`<input>`/`<datalist>` dominating a page (`character-sheet-beauty-pass.md` §2.2.5) is the tell — a form is not a codex page.
6. **Do not let a second, undocumented palette survive alongside the real one.** `eldra-shell.css`'s abandoned blue-steel block (§9.4) — harmless today because it's nearly unused, but exactly the kind of drift that becomes a real inconsistency if a future contributor reaches for `.eldra-panel` because it's *there*, not because it's right.
7. **Do not let a shared component's material contradict its own content's coloring.** `.eldra-empty` (§9.4) — text says gold, container says blue-steel.
8. **Do not rely on a UI framework's default theme tokens for visible, branded chrome.** `app.config.ts`'s `primary: 'green'` is fine as an *unused* default; it becomes a defect the moment an unstyled component actually renders it as a primary action.
9. **Do not introduce a font for its own sake.** No monospace for game numbers, no serif in body copy — a typeface choice must map to a role in §4, not "this looks more fantasy."
10. **Do not animate without a physical referent.** §7's rule, restated as a prohibition: motion that exists only because a UI library makes it easy is motion that shouldn't ship.
11. **Do not force an unused material into a screen that doesn't need it.** Wood (§2) has no current home — better to leave it unassigned than invent one to check a box.

---

## 11. Style Guide Vocabulary

The reusable nouns future implementation and future prompts should use, so "put it in a card" stops being ambiguous:

| Term | Definition |
|---|---|
| **Feature Surface** | Gold-lit, `eldra-ornate-panel eldra-frame-corners`. Exactly one live at a time per screen (§3, §8 Rule 1). |
| **Reference Surface** | Parchment/Frame material, `eldra-codex-soft`. Standard content sections — the default for "a tab's worth of content." |
| **Interactive Well** | Steel material. Any row/control that does something when acted on. Never used for pure display. |
| **Quiet Background** | Hairline-only, no fill distinct from Ink. Rail rows, list rows, dividers, secondary metadata. |
| **Command Center** | A persistent, sticky header holding the handful of facts/actions a user needs without navigating — the Character Sheet's Vitals Bar is the canonical instance; an encounter's turn-order strip is a second, not-yet-built candidate for the same pattern. |
| **Drawer** | Glass-material overlay, slides from an edge, dims what's behind. One generic implementation (`CharacterDetailDrawer`), reused everywhere a "see more without leaving the list" need exists. |
| **Sidebar** | Leather. Persistent shell chrome, never content, never Feature-ornamented. |
| **Toolbar** | Leather-adjacent — a thin persistent action strip (e.g., `SheetDesktopToolbar`'s Refresh/Save/Rest row). Reference Surface at most, never Feature. |
| **Status Strip** | A thin, always-visible readout of live state that isn't important enough to be a full Command Center — e.g., a save indicator, a connection status. Quiet material, Steel-colored only if it's genuinely acting on something (e.g., a clickable retry). |
| **Identity Block** | Portrait/image first, name second (Display serif once it exists), then title/classification. The anchor of any "whose page is this" screen — Character Sheet, World, and eventually an entity article's own header. |

---

## 12. Implementation Impact — Updated Roadmap

Reviewed against every remaining phase from both prior documents. **Nothing already shipped (Beauty Pass Phases 0–4, Visual Language Phase 0/routing) is touched.** Verdicts below apply this document's material vocabulary (materials, not just elevation tiers) to what was previously scoped only at the surface-role level.

| Phase (from `eldra-character-sheet-visual-language.md` §8) | Verdict | Why |
|---|---|---|
| 0 — Routing correction | **Shipped, unaffected** | Pure navigation; no material implication. |
| 1 — Visual token/material system | **Modify, widen scope** | This document generalizes the token set from "Character Sheet's four surface roles" to "product-wide material language" (§2). Phase 1 should now define tokens for Leather and Glass alongside Ground/Frame/Well/Feature, even though the Character Sheet is still the first *consumer* of them — so a future World-page pass doesn't have to redefine the same tokens under different names. |
| 2 — Vitals Bar redesign | **Keep** | Unaffected; already scoped correctly against the Well/Feature vocabulary this document confirms. |
| 3 — Identity + Ability/Skills | **Modify** | Add: Identity Card should use the Display serif (§4) for the character name, once Phase 1 makes that face available — the first real consumer of the new typographic role. |
| 4 — Action Center redesign | **Keep** | Unaffected. |
| 5 — Recovery panel material pass | **Keep** | Unaffected — this phase already is exactly "apply Well material where V2 is currently flat," which this document reinforces rather than changes. |
| 6 — Spells/Inventory/Notes material pass | **Keep** | Unaffected. |
| 7 — Conditions/Encounter/polish | **Merge candidate** | Consider merging with a small, newly-justified addition: since §9.6 found Encounter pages already on-language, this phase's "polish" should explicitly include auditing the Encounter page against this document's Command Center concept (a persistent turn-order strip) rather than only the Character Sheet's own Conditions chips — a small scope widening, not a new phase. |
| 8 — Interaction ceremony | **Modify** | Add the one new ceremony this document proposes (§7): a brief gold highlight when an item is added to Inventory. Everything else in this phase (dice presentation, damage tint) is unchanged. |
| 9 — V1 retirement | **Keep** | Entirely unaffected; a data/routing concern, not a visual one. |

**New phase this document adds, sequenced after Phase 1 and before Phase 9, not blocking any Character-Sheet-specific phase:**

**Phase 1B — Whole-product material cleanup (small, independent, low-risk).** Once Phase 1's tokens exist: (a) retire the two stray `eldra-panel`/`eldra-empty` references in `enemies.vue` and `WorldEntityInteractivePage.vue` in favor of the gold-language equivalents, (b) rebase `.eldra-empty`'s own definition onto Parchment/Frame material so `CharacterEmptyState.vue` (and any future consumer) stops carrying a silent material mismatch, (c) spot-check `admin.vue` and any other raw Nuxt UI component usage for the green/slate-default leak named in Soundness Rule #8. This phase touches no gameplay surface, ships independently, and is the only piece of "cleanup" this document identifies as concrete enough to schedule rather than merely note. Per CLAUDE.md, still requires explicit sign-off before starting — it is proposed here, not authorized.

---

## 13. Highest-Risk Decisions

1. **Introducing a Display serif is the one genuinely new visual element in this document.** Everything else formalizes what's already shipped; a new font is new surface area — wrong font choice, or breaking the "must be vendored locally, never `@nuxt/fonts`" constraint, are the two concrete ways this goes wrong. Treat font selection itself as a small decision point when Phase 1 (or 3) actually reaches it, not something to lock in from this document alone.
2. **Naming the Steel/Leather distinction (§2) is a judgment call, not a measurement.** Both are cool, dark, low-ornament materials; the line between them (does it respond to input) is right but will need real examples reviewed against it as more of the app adopts it, not just declared once.
3. **Scope discipline on Phase 1B.** It is tempting to expand "small cleanup" into "let's fix every stray class we find" — the two items named in §9.4 are the entire justified scope; anything else discovered later is a separate, explicitly-approved decision per CLAUDE.md's cleanup rule, not an automatic addition to this phase.

---

## Appendix — Evidence Index

Files read in full or in targeted sections for this document, beyond what the two prior documents already covered: `app/assets/css/eldra-shell.css` (full structural grep + targeted reads of lines 1–47 and 1240–1389), `app/app.config.ts`, `app/app.vue`, `app/components/world/WorldWorkspaceSidebar.vue`, `app/layouts/world-workspace.vue` (root/background classes), `app/components/world/WorldEntityInteractivePage.vue` (palette grep), `app/pages/worlds/[id]/timelines/index.vue`, `app/pages/worlds/[id]/encounters/index.vue`, `app/pages/worlds/[id]/encounters/[encounterId].vue`, `app/pages/worlds/[id]/index.vue` (palette grep), `app/pages/worlds/[id]/admin.vue` (palette + prior context), plus a product-wide grep for `eldra-shell-bg`/`eldra-panel`/`eldra-panel-soft`/`eldra-empty` usage.
