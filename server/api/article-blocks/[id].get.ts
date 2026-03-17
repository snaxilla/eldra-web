export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig()
  const id = getRouterParam(event, 'id')

  const url = new URL('/items/block_instances', config.public.directusUrl)
  url.searchParams.set('fields', 'id,template,data,sort,visibility')
  url.searchParams.set('filter[article][_eq]', id)
  url.searchParams.set('sort', 'sort')

  const res = await $fetch<{ data: any[] }>(url.toString())
  return res.data
})
