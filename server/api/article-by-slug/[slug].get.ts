export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig()
  const slug = getRouterParam(event, 'slug')

  if (!slug || slug === 'null' || slug === 'undefined') {
    throw createError({
      statusCode: 400,
      statusMessage: 'Invalid slug'
    })
  }

  const url = new URL('/items/articles', config.public.directusUrl)
  url.searchParams.set('fields', 'id,title,slug,excerpt,body,status,visibility,type')
  url.searchParams.set('filter[slug][_eq]', slug)
  url.searchParams.set('limit', '1')

  const headers: Record<string, string> = {}

  if (config.directusToken) {
    headers.Authorization = `Bearer ${config.directusToken}`
  }

  const res = await $fetch<{ data: any[] }>(url.toString(), { headers })

  if (!res.data?.length) {
    throw createError({
      statusCode: 404,
      statusMessage: 'Article not found'
    })
  }

  return res.data[0]
})
