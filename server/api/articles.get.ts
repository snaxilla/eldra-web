export default defineEventHandler(async () => {
  const config = useRuntimeConfig()

  const url = new URL('/items/articles', config.public.directusUrl)
  url.searchParams.set('fields', 'id,title,slug,excerpt,status,visibility,created_at,updated_at')
  url.searchParams.set('filter[status][_eq]', 'published')
  url.searchParams.set('sort', '-updated_at')

  const res = await $fetch<{ data: any[] }>(url.toString())
  return res.data
})
