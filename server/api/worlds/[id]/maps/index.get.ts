export default defineEventHandler(async (event) => {
  const worldId = String(getRouterParam(event, 'id') || '')

  const baseUrl = (process.env.DIRECTUS_URL || process.env.NUXT_PUBLIC_DIRECTUS_URL || '').replace(/\/$/, '')
  const token = process.env.DIRECTUS_TOKEN || ''

  const url =
    `${baseUrl}/items/maps` +
    `?filter%5Bworld%5D%5B_eq%5D=${encodeURIComponent(worldId)}` +
    `&fields%5B%5D=id` +
    `&fields%5B%5D=title` +
    `&fields%5B%5D=slug` +
    `&fields%5B%5D=type` +
    `&fields%5B%5D=is_default_world_map` +
    `&fields%5B%5D=image_file` +
    `&fields%5B%5D=image_file.id`

  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json'
    }
  })

  const text = await res.text()

  return {
    ok: res.ok,
    status: res.status,
    url,
    raw: text
  }
})
