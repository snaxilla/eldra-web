export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig()
  const id = getRouterParam(event, 'id')

  if (!id || id === 'null' || id === 'undefined') {
    throw createError({
      statusCode: 400,
      statusMessage: 'Invalid article id'
    })
  }

  const url = new URL('/items/block_instances', config.public.directusUrl)
  url.searchParams.set('fields', 'id,article,template,data,sort,visibility')
  url.searchParams.set('filter[article][_eq]', id)
  url.searchParams.set('sort', 'sort')

  const headers: Record<string, string> = {}

  if (config.directusToken) {
    headers.Authorization = `Bearer ${config.directusToken}`
  }

  const res = await $fetch<{ data: any[] }>(url.toString(), { headers })
  return res.data
})
