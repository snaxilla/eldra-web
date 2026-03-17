export default defineEventHandler(async () => {
  const config = useRuntimeConfig()

  const url = new URL('/items/articles', config.public.directusUrl)
  url.searchParams.set('fields', 'id,title,slug,excerpt,body,status,visibility,type,created_at,updated_at')
  url.searchParams.set('sort', '-updated_at')

  const headers: Record<string, string> = {}

  if (config.directusToken) {
    headers.Authorization = `Bearer ${config.directusToken}`
  }

  const res = await $fetch<{ data: any[] }>(url.toString(), { headers })
  return res.data
})
