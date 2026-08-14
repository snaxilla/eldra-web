import { requireCapability } from '../../../../../utils/authorization'

function baseUrl() {
  return (process.env.DIRECTUS_URL || process.env.NUXT_PUBLIC_DIRECTUS_URL || '').replace(/\/$/, '')
}

function token() {
  return process.env.DIRECTUS_TOKEN || ''
}

async function dxFetch(path: string, options: any = {}) {
  const res = await fetch(`${baseUrl()}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token()}`,
      ...(options.headers || {})
    }
  })

  const text = await res.text()
  let json: any = null

  try {
    json = text ? JSON.parse(text) : null
  } catch {}

  if (!res.ok) {
    throw createError({
      statusCode: res.status,
      statusMessage: json?.errors?.[0]?.message || json?.message || text || `Directus request failed (${res.status})`
    })
  }

  return json
}

export default defineEventHandler(async (event) => {
  const worldId = getRouterParam(event, 'id')
  const entityId = getRouterParam(event, 'entityId')

  if (!worldId || !entityId) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Missing world or entity id'
    })
  }

  const principal = event.context.principal ?? null
  if (!principal) {
    throw createError({ statusCode: 401, statusMessage: 'Authentication required' })
  }
  requireCapability(principal, 'world.entity.edit', { kind: 'world', worldId: String(worldId) })

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

  const entityJson = await dxFetch(`/items/entities/${entityId}?fields=*`)
  const entity = entityJson?.data || null

  if (!entity || String(entity.world_id) !== String(worldId)) {
    throw createError({
      statusCode: 404,
      statusMessage: 'Entity not found in this world'
    })
  }

  const form = new FormData()
  const blob = new Blob([filePart.data], { type: filePart.type || 'application/octet-stream' })
  form.append('file', blob, filePart.filename || 'entity-image-upload')

  const uploadRes = await fetch(`${baseUrl()}/files`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token()}`
    },
    body: form
  })

  const uploadText = await uploadRes.text()
  let uploadJson: any = null

  try {
    uploadJson = uploadText ? JSON.parse(uploadText) : null
  } catch {}

  if (!uploadRes.ok) {
    throw createError({
      statusCode: uploadRes.status,
      statusMessage:
        uploadJson?.errors?.[0]?.message ||
        uploadJson?.message ||
        uploadText ||
        `Directus upload error (${uploadRes.status})`
    })
  }

  const fileId = uploadJson?.data?.id ? String(uploadJson.data.id) : null

  if (!fileId) {
    throw createError({
      statusCode: 500,
      statusMessage: 'Upload succeeded but no file id was returned'
    })
  }

  const patchJson = await dxFetch(`/items/entities/${entityId}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      image: fileId
    })
  })

  return {
    success: true,
    fileId,
    imageUrl: `/api/assets/${fileId}`,
    entity: patchJson?.data || null
  }
})
