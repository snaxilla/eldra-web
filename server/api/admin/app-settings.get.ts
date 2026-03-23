export default defineEventHandler(async () => {
  const config = useRuntimeConfig()
  const baseUrl = String(config.public.directusUrl).replace(/\/$/, '')
  const token = String(config.directusToken || '')

  const res = await fetch(
    `${baseUrl}/items/app_settings?limit=1&fields=*,sidebar_image.*`,
    {
      headers: {
        Authorization: `Bearer ${token}`
      }
    }
  )

  const json = await res.json()

  if (!res.ok) {
    throw createError({
      statusCode: res.status,
      statusMessage: json?.errors?.[0]?.message || json?.message || 'Failed to load app settings'
    })
  }

  const record = json.data?.[0] || null
  const file = record?.sidebar_image

  return {
    ...record,
    sidebar_image_url: file ? `/api/assets/${typeof file === 'string' ? file : file.id}` : null
  }
})
