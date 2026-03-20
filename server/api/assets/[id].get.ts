export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id') || ''
  const directusUrl = (process.env.NUXT_PUBLIC_DIRECTUS_URL || '').replace(/\/+$/, '')
  const token = process.env.DIRECTUS_TOKEN || ''

  if (!id) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Asset id is required'
    })
  }

  if (!directusUrl) {
    throw createError({
      statusCode: 500,
      statusMessage: 'NUXT_PUBLIC_DIRECTUS_URL is not set'
    })
  }

  if (!token) {
    throw createError({
      statusCode: 500,
      statusMessage: 'DIRECTUS_TOKEN is not set'
    })
  }

  const upstream = await fetch(`${directusUrl}/assets/${id}`, {
    headers: {
      Authorization: `Bearer ${token}`
    }
  })

  if (!upstream.ok) {
    const errorText = await upstream.text().catch(() => '')
    throw createError({
      statusCode: upstream.status,
      statusMessage: `Directus asset fetch failed: ${errorText || upstream.status}`
    })
  }

  const contentType = upstream.headers.get('content-type') || 'application/octet-stream'
  const contentLength = upstream.headers.get('content-length')
  const cacheControl = upstream.headers.get('cache-control') || 'public, max-age=3600'

  setHeader(event, 'Content-Type', contentType)
  setHeader(event, 'Cache-Control', cacheControl)

  if (contentLength) {
    setHeader(event, 'Content-Length', contentLength)
  }

  const arrayBuffer = await upstream.arrayBuffer()
  return Buffer.from(arrayBuffer)
})
