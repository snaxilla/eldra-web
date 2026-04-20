export default defineEventHandler(async (event) => {
  const id = String(getRouterParam(event, 'id') || '')

  if (!id) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Missing asset id'
    })
  }

  const baseUrl = (process.env.DIRECTUS_URL || process.env.NUXT_PUBLIC_DIRECTUS_URL || '').replace(/\/$/, '')
  const token = process.env.DIRECTUS_TOKEN || ''

  if (!baseUrl || !token) {
    throw createError({
      statusCode: 500,
      statusMessage: 'Missing Directus configuration'
    })
  }

  const res = await fetch(`${baseUrl}/assets/${encodeURIComponent(id)}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: '*/*'
    }
  })

  if (!res.ok) {
    const text = await res.text()
    throw createError({
      statusCode: res.status,
      statusMessage: text || `Failed to load asset ${id}`
    })
  }

  const contentType = res.headers.get('content-type')
  const contentLength = res.headers.get('content-length')
  const cacheControl = res.headers.get('cache-control')
  const etag = res.headers.get('etag')

  if (contentType) setHeader(event, 'content-type', contentType)
  if (contentLength) setHeader(event, 'content-length', contentLength)
  if (cacheControl) setHeader(event, 'cache-control', cacheControl)
  else setHeader(event, 'cache-control', 'public, max-age=3600')
  if (etag) setHeader(event, 'etag', etag)

  return res.body
})
