export default defineNuxtConfig({
  compatibilityDate: '2025-01-01',
  devtools: { enabled: false },
  modules: ['@nuxt/ui'],

  // Fonts are bundled locally via @fontsource (see app/assets/css/main.css);
  // disable Nuxt UI's @nuxt/fonts integration so builds never download fonts.
  ui: {
    fonts: false
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
