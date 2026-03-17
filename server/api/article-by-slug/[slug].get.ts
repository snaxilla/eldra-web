export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig()
  const slug = getRouterParam(event, 'slug')

  if (!slug) {
    throw createError({ statusCode: 400 })
  }

  const url = new URL('/items/articles', config.public.directusUrl)
  url.searchParams.set('fields', '*,type.*')
  url.searchParams.set('filter[slug][_eq]', slug)
  url.searchParams.set('limit', '1')

  const res = await $fetch<{ data: any[] }>(url.toString())

  if (!res.data?.length) {
    throw createError({ statusCode: 404 })
  }

  return res.data[0]
})
