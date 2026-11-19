export default defineNuxtConfig({
  compatibilityDate: '2025-01-01',
  devtools: { enabled: false },
  // Content Workspaces & Studio Phase 0, Area 3 -- @nuxt/eslint was already
  // an installed devDependency (package.json), but was never registered as
  // a Nuxt module, so its setup() (which generates .nuxt/eslint.config.mjs
  // via Nuxt's own template system) never ran. eslint.config.mjs at the
  // repo root has always imported that generated file -- `pnpm run lint`
  // failed in a clean tree with ERR_MODULE_NOT_FOUND because nothing had
  // ever produced it. Registering the module here is the fix: `nuxt
  // prepare` (or any dev/build) now generates it like any other Nuxt
  // template.
  modules: ['@nuxt/ui', '@nuxt/eslint'],

  // Fonts are bundled locally via @fontsource (see app/assets/css/main.css);
  // disable Nuxt UI's @nuxt/fonts integration so builds never download fonts.
  ui: {
    fonts: false
  },

  // Eldra's interface is designed dark-only. Nuxt UI installs
  // @nuxtjs/color-mode with preference 'system', which put Nuxt UI
  // components in light mode for light-OS users inside the dark app.
  // Default to dark instead; color-mode stays installed, so an explicitly
  // stored preference is still honored and SSR keeps its no-flash script.
  colorMode: {
    preference: 'dark',
    fallback: 'dark'
  },
  css: ['~/assets/css/main.css', '~/assets/css/eldra-shell.css'],

  // Installable Web App -- guarantees the manifest's content-type
  // regardless of how a given self-hosted deployment serves static files
  // (not every static-file layer's MIME table necessarily knows
  // .webmanifest -> application/manifest+json out of the box).
  routeRules: {
    '/manifest.webmanifest': {
      headers: { 'Content-Type': 'application/manifest+json' }
    }
  },

  runtimeConfig: {
    // PRIVATE (server only)
    directusToken: process.env.DIRECTUS_TOKEN || '',

    public: {
      directusUrl:
        process.env.NUXT_PUBLIC_DIRECTUS_URL ||
        'https://directus.theledouxs.com'
    }
  },

  app: {
    head: {
      title: 'Eldra',
      // Installable Web App -- manifest.webmanifest and the generated
      // icons (public/icons/, from app/assets/pwa/icon-source.svg via
      // scripts/pwa/generate-icons.mjs) are all deployment-relative paths,
      // never an absolute domain, so this works unmodified on any
      // self-hosted origin. No service worker: current Chromium
      // installability criteria (web.dev's own install-criteria doc, MDN's
      // "Making PWAs installable" guide) require only HTTPS + a valid
      // manifest with the fields below -- a service worker is explicitly
      // not one of them, and Offline gameplay is out of scope here, so
      // none is registered. iOS/iPadOS Safari's "Add to Home Screen" (16.4+)
      // has no install-prompt event and no manifest requirement at all; it
      // reads the apple-touch-icon link and the apple-mobile-web-app-*
      // meta tags below instead.
      link: [
        { rel: 'manifest', href: '/manifest.webmanifest' },
        { rel: 'apple-touch-icon', href: '/icons/apple-touch-icon.png' }
      ],
      meta: [
        { name: 'theme-color', content: '#0a0907' },
        { name: 'mobile-web-app-capable', content: 'yes' },
        { name: 'apple-mobile-web-app-capable', content: 'yes' },
        { name: 'apple-mobile-web-app-status-bar-style', content: 'black-translucent' },
        { name: 'apple-mobile-web-app-title', content: 'Eldra' }
      ]
    }
  }
})
