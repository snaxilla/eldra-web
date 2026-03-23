export default defineEventHandler(() => {
  const config = useRuntimeConfig()

  return {
    hasDirectusToken: !!config.directusToken,
    directusTokenLength: String(config.directusToken || '').length,
    directusTokenPrefix: String(config.directusToken || '').slice(0, 6),
    directusUrl: config.public.directusUrl || null
  }
})
