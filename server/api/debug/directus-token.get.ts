export default defineEventHandler(async () => {
  return {
    hasDirectusToken: !!process.env.DIRECTUS_TOKEN,
    directusTokenLength: process.env.DIRECTUS_TOKEN ? process.env.DIRECTUS_TOKEN.length : 0,
    hasDirectusUrl: !!process.env.NUXT_PUBLIC_DIRECTUS_URL,
    directusUrl: process.env.NUXT_PUBLIC_DIRECTUS_URL || null
  }
})
