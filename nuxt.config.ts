export default defineNuxtConfig({
  compatibilityDate: '2025-01-01',
  devtools: { enabled: false },
  modules: ['@nuxt/ui'],
  css: ['~/assets/css/main.css'],

  runtimeConfig: {
    // PRIVATE (server only)
    directusToken: process.env.DIRECTUS_TOKEN || 'g5xg68le7V-Ra5u2Dae_fmoSI3eO-weh',

    public: {
      directusUrl:
        process.env.NUXT_PUBLIC_DIRECTUS_URL ||
        'http://ledouxvps-directus-269351-187-77-194-11.traefik.me'
    }
  },

  app: {
    head: {
      title: 'Eldra'
    }
  }
})
