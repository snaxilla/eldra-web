export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')

  if (!id) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Missing world id'
    })
  }

  const baseUrl = (process.env.DIRECTUS_URL || process.env.NUXT_PUBLIC_DIRECTUS_URL || '').replace(/\/$/, '')
  const token = process.env.DIRECTUS_TOKEN || ''

  const res = await fetch(`${baseUrl}/items/worlds?fields=*&limit=100`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json'
    }
  })

  const json = await res.json()

  if (!res.ok) {
    throw createError({
      statusCode: res.status,
      statusMessage: json?.errors?.[0]?.message || json?.message || 'Failed to load worlds'
    })
  }

  const worlds = Array.isArray(json?.data) ? json.data : []
  const world = worlds.find((w: any) => String(w.id) === String(id))

  if (!world) {
    throw createError({
      statusCode: 404,
      statusMessage: 'World not found'
    })
  }

  return {
    ...world,
    sidebar_image_url: world?.sidebar_image ? `/api/assets/${world.sidebar_image}` : null,
    banner_image_url: world?.banner_image ? `/api/assets/${world.banner_image}` : null
  }
})
