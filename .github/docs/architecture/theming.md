# Eldra Theming Architecture

Status: **Phase 2 (foundation) implemented.** Phase 3 (Fantasy visual overhaul, map-under-glass
World Map shell) not started.

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
| `--eldra-ornament-corner`, `--eldra-ornament-divider` | Ornament assets (`url(...)` or `none`) |
| `--eldra-motion-duration` | Motion |

Derived, stable names: `--eldra-accent`, `--eldra-accent-soft`, `--eldra-accent-faint`,
`--eldra-border`, `--eldra-border-strong`, `--eldra-text`, `--eldra-text-strong`,
`--eldra-text-muted`. The legacy names in `eldra-fieldguide.css` (`--eldra-gold`, `--eldra-panel`,
`--eldra-muted`, ...) are now aliases of these, and every gold literal inside that stylesheet reads
`--eldra-accent-rgb`.

**Tailwind utilities** (registered with `@theme inline` in `main.css`, so they track runtime
values): `bg-eldra-panel`, `border-eldra-accent/24`, `text-eldra-muted`, `text-eldra-text-strong`,
`bg-eldra-well/50`, `font-eldra-display`, and so on. New and migrated markup should use these
instead of `border-[rgba(201,164,90,0.24)]`-style literals.

**Darkglass primitive:** `.eldra-glass` uses the panel color, `--eldra-panel-alpha` and
`--eldra-panel-blur`. It has an opaque fallback where `backdrop-filter` is unsupported and becomes
solid under reduced transparency or high contrast. It is defined, but not yet applied to the shell
(Phase 3).

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
4. **Assets**: put ornament SVGs under `app/assets/ornaments/<theme>/` and reference them from the
   ornament tokens. Fonts must be vendored locally (`@fontsource/*`), never fetched from Google
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
  overrides, invalid/missing configuration, World scoping, CSS import order.
- `tests/server/utils/world-presentation-settings.test.ts`: load, save and patch parsing against a
  fake Directus, the 502-vs-absent distinction, and clamping on write.
- `tests/server/api/worlds/[id]/presentation-settings.test.ts`: real `can()`. Players can read, only
  `world.settings.edit` can write, and unknown keys get 400.
