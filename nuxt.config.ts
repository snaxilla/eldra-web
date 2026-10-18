export default defineNuxtConfig({
  compatibilityDate: '2025-01-01',
  devtools: { enabled: false },
  modules: ['@nuxt/ui'],

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
