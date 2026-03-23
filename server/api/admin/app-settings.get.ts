export default defineEventHandler(async () => {
  const baseUrl = 'http://ledouxvps-directus-269351-187-77-194-11.traefik.me'
  const token = 'g5xg68le7V-Ra5u2Dae_fmoSI3eO-weh'

  const res = await fetch(
    `${baseUrl}/items/app_settings?limit=1&fields=*`,
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

  return {
    ...record,
    sidebar_image_url: record?.sidebar_image ? `/api/assets/${record.sidebar_image}` : null
  }
})
