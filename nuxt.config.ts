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
      title: 'Eldra'
    }
  }
})
