export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig()
  const baseUrl = String(config.public.directusUrl).replace(/\/$/, '')
  const token = String(config.directusToken || '')
  const body = await readBody(event)

  const lookupRes = await fetch(
    `${baseUrl}/items/app_settings?limit=1&fields=id`,
    {
      headers: {
        Authorization: `Bearer ${token}`
      }
    }
  )

  const lookupJson = await lookupRes.json()

  if (!lookupRes.ok) {
    throw createError({
      statusCode: lookupRes.status,
      statusMessage: lookupJson?.errors?.[0]?.message || lookupJson?.message || 'Failed to lookup app settings record'
    })
  }

  const record = lookupJson.data?.[0]

  if (!record?.id) {
    throw createError({
      statusCode: 500,
      statusMessage: 'No app_settings record found'
    })
  }

  const patchRes = await fetch(
    `${baseUrl}/items/app_settings/${record.id}`,
    {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    }
  )

  const patchJson = await patchRes.json()

  if (!patchRes.ok) {
    throw createError({
      statusCode: patchRes.status,
      statusMessage: patchJson?.errors?.[0]?.message || patchJson?.message || 'Failed to update app settings'
    })
  }

  return {
    success: true,
    data: patchJson.data
  }
})
