// createError/defineEventHandler/getRouterParam/readMultipartFormData are
// imported explicitly (see server/api/worlds/[id]/media/upload.post.ts)
// so this route is directly unit-testable under plain Vitest -- media
// ownership policy follow-up.
import { createError, defineEventHandler, getRouterParam, readMultipartFormData } from 'h3'
import { requireCapability } from '../../../../utils/authorization'

function baseUrl() {
  return (process.env.DIRECTUS_URL || process.env.NUXT_PUBLIC_DIRECTUS_URL || '').replace(/\/$/, '')
}

function token() {
  return process.env.DIRECTUS_TOKEN || ''
}

export default defineEventHandler(async (event) => {
  const worldId = String(getRouterParam(event, 'id') || '')

  if (!worldId) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Missing world id'
    })
  }

  const principal = event.context.principal ?? null
  if (!principal) {
    throw createError({ statusCode: 401, statusMessage: 'Authentication required' })
  }
  requireCapability(principal, 'world.settings.edit', { kind: 'world', worldId })

  const parts = await readMultipartFormData(event)

  if (!parts?.length) {
    throw createError({
      statusCode: 400,
      statusMessage: 'No file uploaded'
    })
  }

  const filePart = parts.find((part) => part.type && String(part.type).startsWith('image/'))

  if (!filePart?.data) {
    throw createError({
      statusCode: 400,
      statusMessage: 'No image file found in upload'
    })
  }

  // Media ownership policy follow-up -- `world_id` rides the SAME
  // multipart create request as the file, stamped from the already-
  // verified `worldId` route param/capability check above, never from
  // client-supplied metadata.
  const form = new FormData()
  const blob = new Blob([filePart.data], { type: filePart.type || 'application/octet-stream' })
  form.append('file', blob, filePart.filename || 'background-upload')
  form.append('world_id', worldId)

  const res = await fetch(`${baseUrl()}/files`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token()}`
    },
    body: form
  })

  const text = await res.text()
  let json: any = null
  try {
    json = text ? JSON.parse(text) : null
  } catch {}

  if (!res.ok) {
    throw createError({
      statusCode: res.status,
      statusMessage: json?.errors?.[0]?.message || json?.message || text || `Directus upload error (${res.status})`
    })
  }

  const fileId = json?.data?.id ? String(json.data.id) : null

  return {
    success: true,
    fileId,
    imageUrl: fileId ? `/api/assets/${fileId}` : null
  }
})
