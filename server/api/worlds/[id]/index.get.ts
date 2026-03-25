export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')

  if (!id) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Missing world id'
    })
  }

  const baseUrl = 'http://ledouxvps-directus-269351-187-77-194-11.traefik.me'
  const token = 'g5xg68le7V-Ra5u2Dae_fmoSI3eO-weh'

  const res = await fetch(
    `${baseUrl}/items/worlds?filter[id][_eq]=${id}&limit=1&fields=*`,
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
      statusMessage: json?.errors?.[0]?.message || json?.message || 'Failed to load world'
    })
  }

  const world = json?.data?.[0]

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
