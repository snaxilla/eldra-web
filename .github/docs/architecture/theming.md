# Eldra Theming Architecture

Status: **Phase 2 (foundation), Phase 3A (World Map), Phase 3B-1 (World Map polish) and Phase 3B-2
(global Nuxt UI integration, shared UI polish) implemented.** Cyberpunk and page-by-page migration
are not started.

Eldra lets the Game Master control how a World *looks*. That choice is a presentation decision,
deliberately **independent of the game system**: a D&D World can run a Horror theme, a Cyberpunk
World can run Fantasy. Themes are configuration plus CSS, never a separate component tree.

Related: [eldra-design-language.md](eldra-design-language.md) (materials, hierarchy, where ornament
is and is not allowed). That document describes *what* Fantasy means; this one describes the
machinery that lets it, and future themes, be applied.

---

## 1. The three levels

Resolved by the pure `resolveTheme()` in [app/lib/eldra/themes.ts](../../../app/lib/eldra/themes.ts),
each level overriding the previous one:

| Level | Source | Who controls it | Scope |
|---|---|---|---|
| 1. Platform default | `PLATFORM_DEFAULT_THEME_KEY` (`'fantasy'`) | Eldra | Everywhere, and everything outside a World |
| 2. World theme | `world_presentation_settings` row | The GM (`world.settings.edit`) | Every viewer inside that World |
| 3. Accessibility | `eldra-a11y` cookie | Each viewer, for themselves | Every page, every World |

Rules:

- **Outside a World** (dashboard, login, platform admin) only level 1 applies. `isPathInWorld()`
  decides; a World's theme never leaks into another World or into platform pages.
- **Players inherit** the GM's selection. There is no per-player theme override.
- **Accessibility always wins.** A GM option can never re-enable something a viewer turned off:
  - *Reduce transparency* sets panel opacity to 1 and blur to 0.
  - *High contrast* does the same, disables atmosphere, and strengthens muted text and borders.
  - *Reduce motion* disables atmosphere and collapses animation and transition durations.
- **Invalid configuration never breaks the shell.** An unknown stored key resolves to the platform
  default. Options are clamped (panel opacity ≥ `MIN_PANEL_OPACITY` = 0.55 for readability, blur
  ≤ 24px), unknown fields are dropped, and a failed settings fetch falls back to level 1.

## 2. Moving parts

```
app/lib/eldra/themes.ts               Registry (ELDRA_THEMES), sanitizers, resolveTheme(), isPathInWorld()
app/assets/css/themes/tokens.css      Structural/derived semantic tokens + .eldra-glass primitive
app/assets/css/themes/fantasy.css     Fantasy token values (also the :root platform default)
app/assets/css/themes/accessibility.css  [data-eldra-*] overrides -- imported LAST
app/assets/css/main.css               Import order + Tailwind bridge (@theme inline) + gold scale
app/composables/useEldraTheme.ts      useWorldThemeState / setWorldTheme / useAccessibilityPreferences / useEldraThemeRoot
app/app.vue                           Calls useEldraThemeRoot() once
app/layouts/world-workspace.vue       Loads the World's selection into useWorldThemeState
app/components/world/WorldThemeSettingsPanel.vue   GM picker (Game Admin → Page Setup)
app/components/EldraAccessibilityMenu.vue          Viewer preferences (workspace sidebar, top bar)
server/utils/world-presentation-settings.ts        Persistence boundary (load/parse/save)
server/api/worlds/[id]/presentation-settings.get.ts    world.read
server/api/worlds/[id]/presentation-settings.patch.ts  world.settings.edit
scripts/directus/create-world-presentation-settings-schema.mjs   Schema (run via bootstrap.mjs)
```

### Runtime flow

1. `useEldraThemeRoot()` (in `app.vue`) computes `resolveTheme({ world, accessibility })`. It reads
   `world` from `useWorldThemeState()` only when the current route is inside that World.
2. The result goes onto `<html>` through `useHead`:
   - `data-eldra-theme="<key>"`
   - `data-eldra-motion`, `data-eldra-contrast`, `data-eldra-transparency`, `data-eldra-atmosphere`
   - inline `--eldra-panel-alpha` / `--eldra-panel-blur`
3. The theme's `nuxtUi` palette is written into app config `ui.colors`, so Nuxt UI components
   follow the theme.
4. Everything is reactive. A GM's edit in the settings panel previews instantly (GM only), and Save
   persists it. Other viewers pick it up on their next World load. There is no live push yet.
5. Accessibility preferences live in a cookie rather than localStorage, so SSR renders the correct
   attributes on first paint.

### Nested scopes and existing systems

- **Character Sheet personal presentation** (`sheet.vue`'s `sheetTheme`, localStorage,
  `.sheet-theme-surface[data-sheet-*]`) is unchanged. It is a per-user preference scoped to its own
  element and its own `data-sheet-*` attribute namespace, so it nests inside the World theme
  without conflict. It currently uses literal colors rather than theme tokens. Moving it onto
  tokens is optional future work.
- **World Page Presentation** (`world_page_presentations`, per-page background image and
  immersive/muted/neutral mode) is unchanged and orthogonal: it controls *what is behind* a page,
  not the theme.
- **Legacy `useTheme.ts`** (`useThemeState('eldra-theme')`, used by `ArticleListCard`,
  `BlockRenderer`, `DashboardCard`) is untouched. Its only writer, `ThemeChooser.vue`, had no
  consumers anywhere and was removed in Phase 2, so those components always ran on defaults
  already.

## 3. Tokens

Colors are stored as RGB channel triplets so any alpha can be derived:
`rgb(var(--eldra-accent-rgb) / 0.34)`.

| Token | Meaning |
|---|---|
| `--eldra-accent-rgb`, `--eldra-accent-bright-rgb` | Structural accent (Fantasy: antique gold) and its highlight |
| `--eldra-ink-rgb`, `--eldra-charcoal-rgb` | Ground |
| `--eldra-panel-rgb`, `--eldra-panel-strong-rgb` | Darkglass panel fill |
| `--eldra-well-rgb` | Interactive "steel" well |
| `--eldra-text-rgb`, `--eldra-text-strong-rgb`, `--eldra-text-muted-rgb`, `--eldra-parchment-rgb` | Text |
| `--eldra-panel-alpha`, `--eldra-panel-blur` | Darkglass, set at runtime from theme options |
| `--eldra-radius`, `--eldra-shadow-panel`, `--eldra-glow-accent` | Shape and depth |
| `--eldra-font-display`, `--eldra-font-body`, `--eldra-tracking-kicker` | Typography |
| `--eldra-ornament-corner-{tl,tr,bl,br}`, `--eldra-ornament-divider`, `--eldra-ornament-emblem` | Ornament assets (`url(...)` or `none`), used as CSS masks |
| `--eldra-ornament-color`, `--eldra-ornament-size`, `--eldra-ornament-inset` | Ornament paint and geometry (`transparent` = no ornaments) |
| `--eldra-glass-sheen`, `--eldra-leather-rgb` | Glass top sheen; sidebar "leather" binding |
| `--eldra-display-tracking`, `--eldra-display-weight` | Display type treatment |
| `--eldra-motion-duration` | Motion |

Derived, stable names: `--eldra-accent`, `--eldra-accent-soft`, `--eldra-accent-faint`,
`--eldra-border`, `--eldra-border-strong`, `--eldra-text`, `--eldra-text-strong`,
`--eldra-text-muted`. The legacy names in `eldra-fieldguide.css` (`--eldra-gold`, `--eldra-panel`,
`--eldra-muted`, ...) are now aliases of these, and every gold literal inside that stylesheet reads
`--eldra-accent-rgb`.

**Tailwind utilities** (registered with `@theme inline` in `main.css`, so they track runtime
values): `bg-eldra-panel`, `border-eldra-accent/24`, `text-eldra-muted`, `text-eldra-text-strong`,
`bg-eldra-well/50`, `font-eldra-display`, and so on. The text ramp is `text-eldra-text-strong` →
`text-eldra-text` → `text-eldra-text-soft` → `text-eldra-text-dim` → `text-eldra-text-faint`. Use
`text-eldra-accent-text` for gold-tinted labels. New and migrated markup should use these
instead of `border-[rgba(201,164,90,0.24)]`-style literals.

**Darkglass primitive:** `.eldra-glass` uses the panel color, `--eldra-panel-alpha` and
`--eldra-panel-blur`. It has an opaque fallback where `backdrop-filter` is unsupported and becomes
solid under reduced transparency or high contrast.

### Shared surface primitives (Phase 3A, `themes/surfaces.css`)

These classes contain no theme colors; a test enforces that. A theme restyles them purely through
tokens.

| Class | Use |
|---|---|
| `.eldra-glass-surface` | Major floating panels (sidebar over the map, contextual inspector, map layer panel). Combine with `eldra-ornate-panel`; overrides its fill. Opaque fallback without `backdrop-filter`. |
| `.eldra-glass-section` / `.eldra-glass-row` | Light groupings *inside* a glass panel (inspector details, editor notes). No ornament; the outer frame carries the weight. |
| `.eldra-ornament-frame` (`--compact`) | Empty `aria-hidden` child of a `relative isolate` host. Draws the theme's four corner ornaments beneath content, `pointer-events: none`. |
| `.eldra-ornament-divider` | Header flourish or rule (`aria-hidden`). |
| `.eldra-ornament-emblem` | Small motif (Fantasy: compass rose) beside a brand or heading. |
| `.eldra-display` | Display typography. Only for titles, World names and place names: never inputs, dense lists, technical text or body copy. |
| `.eldra-map-control` | Quiet glass for small map controls (breadcrumbs, tool bar). The active state is `aria-pressed="true"`, not a color-only ring. |
| `.eldra-sidebar-ornate` | Workspace sidebar "leather" background, moved here from a hardcoded utility. |

Ornament SVGs live in `app/assets/ornaments/<theme>/`, are referenced from the theme's CSS file, and
are inlined by Vite. They work offline and need no runtime fetch. Because they are masks, one asset
works in any color, and accessibility can dim them (high contrast lowers `--eldra-ornament-color`).

Native checkboxes, radios and range inputs inside glass panels take `accent-color:
var(--eldra-accent)`. They stay native controls with no ornament.

**Fonts are all bundled locally.**
- **Cinzel** (display) comes from `@fontsource/cinzel` (latin subset, weights 500/600). The Fantasy
  theme sets `--eldra-font-display` to it, with serif fallbacks.
- **Public Sans** (body) comes from `@fontsource/public-sans` (weights 400–700, all subsets declared;
  browsers fetch only the unicode ranges they need).
- Both are imported in `main.css`, and Nuxt UI's `@nuxt/fonts` integration is disabled
  (`ui.fonts: false` in `nuxt.config.ts`). The production build performs no font downloads and works
  offline.
- A future theme's fonts must follow the same pattern.

### Surface hierarchy and page backdrops (Phase 3C)

Every glass level is **derived** from the GM's panel opacity and blur (`--eldra-panel-alpha`,
`--eldra-panel-blur`; Game Admin → theme). There are no new GM controls. Raising or lowering the GM
values moves every level together, and the accessibility overrides (alpha 1, blur 0) make every
level solid. The tokens are in `themes/tokens.css`. A theme may re-declare the offsets, never the GM
values.

| Level | Token | Default derivation | Used by |
|---|---|---|---|
| L1 navigation | `--eldra-surface-nav-alpha` | panel alpha | `.eldra-glass-surface`: the workspace sidebar over the map or over a page backdrop |
| L2 cards | `--eldra-surface-card-alpha`, `--eldra-surface-card-blur` | panel alpha, ¾ blur | `.eldra-ornate-card` (roster, collections) |
| L3 reading | `--eldra-surface-reading-alpha` | panel alpha + 0.10 | `.eldra-ornate-panel` (articles, admin, page headers), `.eldra-sheet-panel` (V2 sheet) |
| L4 inspectors | `--eldra-surface-inspector-alpha` | panel alpha | `WorldEntityContextDrawer`; any fixed `.eldra-ornate-panel` |
| L5 overlays | `--eldra-surface-overlay-alpha` | max(panel alpha, 0.94) | `.eldra-glass-menu`; inputs and wells stay near-opaque |

**Page backdrops.** A GM page background (Page Setup) is drawn once by `world-workspace.vue`,
**behind the whole workspace**: both grid columns, with the sidebar lifted above it. Every surface is
then glass over the same artwork, as on the World Map. Strength comes from tokens:
`--eldra-backdrop-{immersive,muted}-opacity` and `--eldra-backdrop-{immersive,muted}-scrim` (the scrim
uses the theme's own ground colors).
- **Neutral** shows no artwork.
- Over a backdrop the sidebar becomes `.eldra-glass-surface`. Over the plain ground it keeps its
  solid binding.
- The World Map draws its own scene and gets no page backdrop.
- Upload, the media library, persistence and positioning are unchanged; only the drawing moved.

### Full-bleed World Map shell (Phase 3A)

Only on the World Map route (`pageKey === 'world-map'`, i.e. `/worlds/:id`), and only at `md` and
up, `world-workspace.vue` takes the workspace sidebar out of the grid and floats it
(`absolute`, `z-40`) over a single full-width map column, adding `.eldra-glass-surface`.

- Every other page keeps the two-column grid, and below `md` every page keeps the existing
  off-canvas drawer.
- Collapse still toggles 280px/68px. It no longer resizes the map container, so Leaflet's
  coordinate space only changes on a window resize, which Leaflet already tracks.
- The layout sets `--eldra-map-inset-left` (sidebar width + 12px at `md`+ on the map, `0`
  elsewhere). Left-anchored map overlays (breadcrumbs, tool bar, layer panel, Leaflet zoom) offset by
  it so the floating sidebar never covers them.
- The contextual inspector (`WorldEntityContextDrawer`) was already `fixed` over the content. It
  now shares the same glass and ornaments on every page that uses it.

#### Viewport insets (Phase 3B-1)

The renderer constrains panning with `maxBounds` and `maxBoundsViscosity: 1`, and the initial view
"covers" the viewport. Under floating panels, the strip of map beneath a panel could never be
panned out from under it, at any zoom.

`WorldMapLeaflet.client.vue` therefore takes an optional `viewportInsets: { left, right }` prop, in
screen pixels:

- `maxBounds` is widened horizontally by those pixels, converted to map units at the current zoom
  (CRS.Simple: 1 unit = 2^zoom px). It is recomputed on `zoomend` and when the insets change, so map
  edges can be dragged exactly clear of a panel at every zoom.
- The initial view is shifted so the map's center lands in the middle of the uncovered area.
- Coordinates, emitted click coordinates, cover zoom and scene data are untouched. With no insets
  (prop absent or zero) the renderer behaves exactly as before.

Where the insets come from:

- **Left:** published by `world-workspace.vue` as `useState('world-map-viewport-inset-left')`. It is
  292 or 80 (expanded or collapsed) on the desktop full-bleed map, and 0 on mobile and on every other
  page.
- **Right:** added by the map page while the inspector (380px) or the pin/overlay editor (420px) is
  open. It only applies when the left inset is non-zero, i.e. at desktop widths.

**Atmospheric effects:** mark optional decorative elements with `data-eldra-atmospheric`. They are
hidden whenever the resolved theme has atmosphere off.

## 4. Persistence

`world_presentation_settings`: one row per World. A missing row is legal and means "platform
default".

| Field | Type | Notes |
|---|---|---|
| `id` | integer (auto) | |
| `world_id` | integer, required, unique | `worlds.id` |
| `theme_key` | string(64), nullable | Registry key; null/unknown ⇒ platform default |
| `theme_options` | json, nullable | `{ panelOpacity?, panelBlur?, atmosphere? }`, sanitized on read and write |
| `created_at`, `updated_at` | timestamptz | |

API:

- `GET /api/worlds/:id/presentation-settings` (requires `world.read`) returns
  `{ worldId, themeKey, themeOptions }`.
- `PATCH` with the same body shape requires `world.settings.edit`. It is a partial patch: omitted
  fields keep their stored values. An unknown `themeKey` returns 400.

A Directus failure (including the collection not existing yet, which Directus reports as 403)
returns **502**, not "no row". The workspace layout treats any fetch failure as the platform
default, so an unprovisioned instance degrades gracefully.

### Deployment

The collection is additive. It touches no existing collection.

1. Deploy the application.
2. Run `node scripts/directus/bootstrap.mjs` against the real `DIRECTUS_URL`/`DIRECTUS_TOKEN`. It is
   idempotent and now includes `create-world-presentation-settings-schema.mjs`. To run only this
   script: `pnpm run directus:create-world-presentation-settings`.
3. **Verify item CRUD, not just schema** (see CLAUDE.md, Deployment Checklist): as a GM, save a
   theme in Game Admin → Page Setup, reload, and confirm it persisted. Then open the World as a
   Player and confirm the GET succeeds.

Until step 2 runs, the app behaves exactly as before: platform default, and a GM save fails with a
visible 502 message.

## 5. Adding a theme

Example: Cyberpunk. No component changes are required.

1. **Registry**: add an entry to `ELDRA_THEMES` in `app/lib/eldra/themes.ts`:
   ```ts
   {
     key: 'cyberpunk',
     label: 'Cyberpunk',
     description: 'Neon cyan and magenta, angular frames.',
     defaults: { panelOpacity: 0.8, panelBlur: 8, atmosphere: true },
     nuxtUi: { primary: 'cyan', neutral: 'zinc' }
   }
   ```
2. **Tokens**: create `app/assets/css/themes/cyberpunk.css` under
   `:root[data-eldra-theme="cyberpunk"] { ... }` and re-declare only the tokens that differ
   (`--eldra-accent-rgb: 0 240 255;`, `--eldra-radius: 2px;`, `--eldra-font-display: ...;`,
   ornament `url()`s, ...).
3. **Import** it in `main.css` between `fantasy.css` and `accessibility.css`. The order is enforced
   by a test.
4. **Assets**: put ornament SVGs under `app/assets/ornaments/<theme>/` (opaque shapes; they are
   used as masks) and reference them from the ornament tokens. Cyberpunk would supply angular
   corner brackets and set `--eldra-ornament-color` to its neon accent. A theme without ornaments
   simply omits them. Fonts must be vendored locally (`@fontsource/*`), never fetched from Google
   Fonts at build time (eldra-design-language.md §4).
5. **Nuxt UI palette**: if the theme names a palette Tailwind does not ship, register its scale in
   `main.css` `@theme static` (as `--color-gold-*` is).
6. **Tests**: `tests/lib/themes/themes.test.ts` already checks every registry entry for unique keys,
   complete definitions, in-range defaults and a matching CSS import.

The GM picker lists the new theme automatically.

**Current limit:** about 1,400 hardcoded gold literals remain as Tailwind arbitrary classes across
Vue templates. Until those surfaces migrate to tokens, a non-gold theme would still show gold
there. Phase 3 migrates the shell, navigation, inspector and dialogs. The rest is a mechanical
follow-up.

## 6. Tests

- `tests/lib/themes/themes.test.ts`: registry, platform fallback, World inheritance, accessibility
  overrides, invalid/missing configuration, World scoping, CSS import order (accessibility last
  overall), no hardcoded colors in shared surfaces, ornaments non-interactive.
- `tests/lib/themes/surfaceHierarchy.test.ts`: every surface level derives from the GM panel
  opacity/blur, the shared glass classes fill from those tokens, accessibility reaches them, and the
  page backdrop uses its tokens and stays off in neutral.
- `tests/server/utils/world-presentation-settings.test.ts`: load, save and patch parsing against a
  fake Directus, the 502-vs-absent distinction, and clamping on write.
- `tests/server/api/worlds/[id]/presentation-settings.test.ts`: real `can()`. Players can read, only
  `world.settings.edit` can write, and unknown keys get 400.

## 7. Nuxt UI integration (Phase 3B-2)

- **Color mode:** Nuxt UI bundles `@nuxtjs/color-mode` with preference `system`, which put Nuxt UI
  components in light mode for light-OS users inside the dark app. `nuxt.config.ts` now sets
  `colorMode: { preference: 'dark', fallback: 'dark' }`. The module stays installed, so an
  explicitly stored preference is honored and SSR keeps its no-flash script. Nothing in the app
  used color mode or `dark:` variants.
- **Palette:** each registry entry's `nuxtUi.primary`/`neutral` are written to app config at runtime.
  Fantasy is `gold`/`slate`. Success, warning, error and info are never themed (a test enforces
  this), so status colors keep their meaning.
- **Surfaces (`themes/nuxt-ui.css`):** Nuxt UI's `--ui-bg*`, `--ui-text*`, `--ui-border*` and
  `--ui-radius` are mapped onto Eldra tokens in both color modes. Every Nuxt UI component (buttons,
  inputs, selects, tables, cards…) follows the active theme with no per-page overrides.
- **Overlays (`app.config.ts` slots, theme-agnostic classes only):**
  - Modals and slideovers use `.eldra-glass-surface` and `.eldra-ornamented` (the pseudo-element
    corner ornaments, 32px on modals) with a display-font title.
  - Popovers, dropdown and context menus, selects and tooltips use the quieter, more opaque
    `.eldra-glass-menu`, with no ornament.

## 8. Remaining theme-incompatible surfaces

Phase 3B-2 migrated the shared shell onto tokens: the workspace and platform sidebars, top bar,
bottom nav, workspace ground, inspector, relationships panel, collection cards
(`WorldEntityInteractivePage`), presentation and theme panels, and every map editor. A test guards
these files against reintroducing literal Fantasy colors. The shared `.eldra-button`,
`.eldra-input` and `.eldra-ornate-panel` classes read tokens too.

About **1,230 gold literals in 113 files** remain, mostly page-specific. The largest are
`pages/worlds/[id]/admin.vue`, `entities/[entityId]/index.vue`, `eldra-shell.css` (Character Sheet
parchment rules, which also match class strings via `[class*=…]` selectors), `importer.vue`, the
Character Sheet (`sheet.vue`, `SheetActionCenter.vue`, `SheetActionsTab.vue`), `EldraRichTextEditor`,
`enemies.vue`, the character builder pages and `AdminMembersPanel`.

Under a non-gold theme these stay gold. They are best migrated page by page with the same
mechanical class mapping (`-[rgba(201,164,90,A)]` → `-eldra-accent/A`, the text ramp hexes →
`text-eldra-text-*`), except for the Character Sheet. The Sheet's `[class*="bg-[rgba(20,17,12"…]`
CSS selectors depend on the literal class strings, so it must be migrated together with
`eldra-shell.css`.

## 9. Recommendations for a Cyberpunk theme

1. Add a registry entry, e.g. `nuxtUi: { primary: 'cyan', neutral: 'zinc' }`, with lower default
   blur and slightly higher opacity (neon reads best on crisper glass).
2. Create `themes/cyberpunk.css` under `:root[data-eldra-theme="cyberpunk"]`:
   - `--eldra-accent-rgb` set to neon cyan (`0 240 255`) and `--eldra-accent-bright-rgb` to magenta;
   - a cool `--eldra-panel-rgb`;
   - a re-tuned text ramp (`--eldra-text-*-rgb`);
   - `--eldra-ui-radius: 0.125rem`;
   - a vendored geometric display face (`@fontsource/*`) in `--eldra-font-display`, and
     `--eldra-display-tracking: 0.12em`.
3. Ornaments: put angular corner brackets and a scanline or chevron divider under
   `app/assets/ornaments/cyberpunk/`. Set `--eldra-ornament-color` to the accent and consider a
   larger `--eldra-ornament-size`. The emblem could be a hex or circuit glyph.
4. Glow: override `--eldra-glass-sheen` with a faint accent gradient and `--eldra-shadow-panel` with
   an accent-tinted outer glow. Put any animated effects behind `[data-eldra-atmospheric]` so reduced
   motion and high contrast drop them automatically.
5. Before shipping, migrate the remaining page literals listed in §8 for the pages that matter
   (at least the Character Sheet), or they will stay gold.
6. Tests: the registry, CSS-import-order and migrated-file guards cover the new theme automatically.
   Add a contrast check of the new text ramp against the panel fill at the clamped minimum opacity.
