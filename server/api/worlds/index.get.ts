export default defineEventHandler(async () => {
  const baseUrl = 'http://ledouxvps-directus-269351-187-77-194-11.traefik.me'
  const token = 'g5xg68le7V-Ra5u2Dae_fmoSI3eO-weh'

  const res = await fetch(
    `${baseUrl}/items/worlds?fields=*&sort=name`,
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
      statusMessage: json?.errors?.[0]?.message || json?.message || 'Failed to load worlds'
    })
  }

  const worlds = Array.isArray(json.data) ? json.data : []

  return worlds.map((world: any) => ({
    ...world,
    banner_image_url: world?.banner_image ? `/api/assets/${world.banner_image}` : null,
    sidebar_image_url: world?.sidebar_image ? `/api/assets/${world.sidebar_image}` : null
  }))
})
