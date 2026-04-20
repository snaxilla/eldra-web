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

  const json = await res.json()

  if (!res.ok) {
    throw createError({
      statusCode: res.status,
      statusMessage: json?.errors?.[0]?.message || 'Failed to load maps'
    })
  }

  return (json?.data || []).map((item: any) => {
    const fileId =
      typeof item?.image_file === 'string'
        ? item.image_file
        : item?.image_file?.id || null

    return {
      id: item?.id ?? '',
      title: item?.title ?? '',
      slug: item?.slug ?? '',
      type: item?.type ?? 'area',
      imageUrl: fileId ? `/api/assets/${fileId}` : '',
      isDefaultWorldMap: Boolean(item?.is_default_world_map),
      directusFileId: fileId
    }
  })
})
