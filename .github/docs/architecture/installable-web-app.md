# Installable Web App

Eldra can be installed from a supported desktop/mobile browser and launched in its own window, with
Eldra's own branding. This is a bounded, not-yet-committed pass -- see Status at the end.

## Inspection findings (before implementing)

- **No existing PWA mechanism.** No manifest, no service worker, no PWA Nuxt module
  (`@vite-pwa/nuxt` or similar) was present anywhere in `nuxt.config.ts`, `package.json`, or
  `app/`/`server/`. Nothing to stack a second implementation onto.
- **No existing app logo/icon asset.** `public/` has only the default Nuxt `favicon.ico`
  (untouched by this pass). The app's only existing visual brand identity is text: `AppSidebar.vue`
  renders "Eldra" / "World Platform" (expanded) or a bare "E" (collapsed), in the `eldra-display`
  font class. `app/assets/ornaments/fantasy/emblem.svg` is a real existing Eldra asset (the Fantasy
  theme's own `--eldra-ornament-emblem` decorative texture token) but is drawn as hairline strokes at
  low opacity for background texture use -- illegible at icon sizes. The new app icon (below) reuses
  that SAME motif and this app's own brand colors, redrawn bold/filled for icon legibility, rather
  than inventing new branding or using the hairline original as-is.
- **Deployment/base path.** No `app.baseURL` is configured; the app is served from the domain root.
  The manifest and all new links/icons use root-relative paths (`/manifest.webmanifest`,
  `/icons/...`) for this reason -- also what makes this self-hostable without a hardcoded domain
  (confirmed: nothing new here references `theledouxs.com` or any other fixed host; the one existing
  `directusUrl` fallback to that domain in `runtimeConfig.public` is pre-existing, untouched, and
  unrelated to this feature).
- **Authentication/redirect flow, traced, not changed.** `app/middleware/auth.ts` already redirects
  an unauthenticated visitor to `/login?redirect=<original path>` via `buildLoginRedirect`/
  `safeRedirectTarget` (`app/utils/safeRedirect.ts`) -- a same-origin-only, control-character- and
  backslash-rejecting validator with its own prior security-review history. This already correctly
  handles every case this task's §5 asks to verify (signed-out launch, a direct World/character deep
  link, return-to-path after login) for ANY `start_url`, with zero changes needed. Nothing here
  broadens redirect trust.
- **Current browser installability requirements, verified against current web.dev/MDN documentation
  (not an older tutorial's assumption):** a service worker is explicitly NOT required for Chromium
  (Chrome/Edge) to fire `beforeinstallprompt` -- only HTTPS, user-engagement heuristics, and a valid
  manifest (`name`/`short_name`, `icons` including 192px and 512px, `start_url`, `display` one of
  `standalone`/`fullscreen`/`minimal-ui`/`window-controls-overlay`, `prefer_related_applications` not
  `true`). iOS/iPadOS Safari (16.4+) has no install-prompt event at all -- "Add to Home Screen" is a
  manual step from the Share sheet, needing only an `apple-touch-icon` link and the
  `apple-mobile-web-app-*` meta tags, no manifest and no service worker.

## Implementation

### Manifest and icons

- `public/manifest.webmanifest` -- `id`/`start_url`/`scope` all `/` (stable identity across
  deployments, root-path only), `display: "standalone"`, Eldra's own panel/accent colors
  (`background_color`/`theme_color: "#0a0907"`), three icon entries (192 "any", 512 "any", 512
  "maskable").
- `app/assets/pwa/icon-source.svg` -- the one hand-authored source icon (see its own header comment
  for the exact color/motif provenance), designed with the maskable safe zone already respected
  (content within ~195px of center on a 512px canvas; the ~80% safe-zone guideline is ~205px), so the
  SAME file is reused unmodified for "any", "maskable", and the Apple touch icon -- no second design.
- `scripts/pwa/generate-icons.mjs` -- rasterizes that SVG to `public/icons/icon-192.png`,
  `icon-512.png`, `icon-maskable-512.png` (192/512/512, RGBA), and `apple-touch-icon.png` (180x180,
  alpha explicitly flattened away per Apple's own no-transparency guidance). A manual dev-time
  script (`node scripts/pwa/generate-icons.mjs`), not a build step -- the generated PNGs are
  committed like any other static asset, matching this repo's own `scripts/` convention (one-off
  tooling, not part of the app build).

### Head wiring (`nuxt.config.ts`)

- `routeRules['/manifest.webmanifest']` sets `Content-Type: application/manifest+json` explicitly --
  not every self-hosted static-file layer necessarily has `.webmanifest` in its own MIME table, and
  this is baked into the server build regardless of how a given deployment serves static files.
- `app.head.link`: `rel="manifest"` and `rel="apple-touch-icon"`.
- `app.head.meta`: `theme-color`, `mobile-web-app-capable`, `apple-mobile-web-app-capable`,
  `apple-mobile-web-app-status-bar-style`, `apple-mobile-web-app-title`.
- No service worker registration anywhere.

### Install discoverability

- `app/composables/useInstallPrompt.ts` -- captures Chromium's `beforeinstallprompt` event (calling
  `.preventDefault()` so Chrome's own mini-infobar never appears, holding the event for a later
  explicit click only), tracks "already installed" via `display-mode: standalone` +
  iOS's own `navigator.standalone`, and detects iOS/iPadOS Safari specifically (narrowly: real Safari,
  not Chrome/Firefox/Edge's iOS builds, which embed Safari's engine but have no Add to Home Screen
  flow of their own) for the one platform that needs manual instructions instead of a real prompt.
  Shared via `useState` (this app's own established cross-component client-state convention,
  `useEldraTheme.ts`) since the equivalent trigger renders in more than one place at once and all of
  them must reflect the same one-per-page-load browser signal.
- `app/components/AppInstallMenu.vue` -- a modest "Install Eldra" trigger, styled and positioned
  exactly like its existing sibling `EldraAccessibilityMenu.vue` (same `compact`/`fill` prop API, same
  button classes, same `UPopover` shape for the one state that shows information rather than acting).
  Renders NOTHING when there is no honest action to offer (already installed, or a browser with
  neither a real prompt nor a known manual path) -- never a dead button, never promises prompt support
  a browser does not provide. The real-prompt case is a plain `@click` button (never auto-opened);
  the iOS case opens a popover with the three Share-sheet steps, information only, not an action.
  Added beside `EldraAccessibilityMenu` in its exact three existing render sites --
  `AppTopbar.vue` (1), `WorldWorkspaceSidebar.vue` (2: collapsed + expanded) -- the closest thing this
  app has to an "application menu/settings" convention (there is currently no other reachable
  settings/account menu in the live UI at all: `SidebarUserPanel.vue` exists but is unused by any
  layout, confirmed by search). No new navigation section, no new route.

## Freshness and network behavior

No service worker is registered, so there is categorically nothing new that could persistently cache
API/auth requests, World/entity/catalogue/character data, protected media, or user-specific HTML --
confirmed by construction, not merely by intent. Nuxt's own existing asset versioning (hashed
`_nuxt/` filenames) is untouched. No login/session state is affected by any of this; nothing here
force-refreshes an active session.

## Verification

- **Source-traced, confirmed via production build + a real HTTP request against it** (preview server,
  `node .output/server/index.mjs`, no browser tool was available): `/manifest.webmanifest` returns
  200 with `Content-Type: application/manifest+json` and the expected JSON; `/icons/icon-192.png`,
  `/icons/icon-512.png`, `/icons/apple-touch-icon.png` all return 200 with `image/png`; a real
  rendered page (`/`, which 302s to `/login` without a session -- itself proof the existing auth
  redirect is unaffected) includes every new `<link>`/`<meta>` tag.
- **Unit tests** (24 new, all passing): `tests/composables/useInstallPrompt.test.ts` -- the pure
  `isIOSSafariUserAgent`/`isStandaloneLaunch` detection logic against real iPhone/iPad/Mac/Android/
  Chrome-on-iOS/Firefox-on-iOS user agents, plus the composable's own state-transition logic (
  `canPrompt`'s derivation, `promptInstall`'s accepted/dismissed outcomes and one-shot event
  consumption) via the same minimal `useState` stub `useAuth.test.ts` already established for a
  Nuxt-only auto-import with no real export outside the Nuxt runtime. `tests/pwa/manifest.test.ts` --
  validates the manifest's required fields against Chromium's own documented install criteria, and
  cross-checks every declared icon's actual on-disk pixel dimensions (via `sharp`) against what the
  manifest claims, plus the Apple touch icon's squareness and lack of transparency.
- **Typecheck**: 902 errors before and after (confirmed via `git stash` baseline diff), zero new
  errors in any touched/created file. **Lint**: zero new issues in any touched/created file (the one
  pre-existing `any`-typed prop in `WorldWorkspaceSidebar.vue`, far from this pass's own edits, was
  confirmed pre-existing). **Full suite**: 6535/6535 passing (323 files). **Build**: clean. `git diff
  --check`: clean.
- **NOT verified -- no browser tool was available this session.** Everything that needs an actual
  browser/OS: a real desktop Chrome/Edge install + standalone launch; the install UI's actual
  appearance/disappearance when unsupported or already installed; an iOS/iPadOS or Android device
  actually completing installation (desktop browser emulation would not prove this even if attempted,
  per this task's own instruction, so none was attempted); login and direct-link behavior as actually
  clicked through in a browser (the redirect mechanics were traced and the server-rendered HTML was
  inspected, but no live login flow was driven); narrow/mobile layout of the new menu items. Stated
  as an open gap, not claimed as proven by the checks above.

## Self-hosting / operator requirements

- **HTTPS.** Installability requires a secure context (`https://` or `localhost`) -- standard for any
  real deployment behind a reverse proxy already; no new infrastructure change made or required by
  this pass.
- **No new environment variable, credential, schema, or deployment step.** Every new path
  (`/manifest.webmanifest`, `/icons/*`) is a plain static file served exactly like
  `/favicon.ico` already is; nothing here depends on `NUXT_PUBLIC_DIRECTUS_URL` or any other
  deployment-specific value.
- To regenerate the icons after changing `app/assets/pwa/icon-source.svg`: `node
  scripts/pwa/generate-icons.mjs`, then commit the updated files under `public/icons/`.

## Status

**NOT committed.** Stopped here for review per this task's own closing instruction.
