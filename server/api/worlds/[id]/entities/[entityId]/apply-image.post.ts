import { directusServiceRequest } from '../../../../../utils/directus'

function extractUploadedFileId(payload: any): string | null {
  const candidate =
    payload?.data?.id ||
    payload?.id ||
    payload?.data?.[0]?.id ||
    payload?.[0]?.id ||
    payload?.file?.id ||
    payload?.data?.file?.id ||
    payload?.files?.[0]?.id ||
    payload?.data?.files?.[0]?.id ||
    null

  return candidate ? String(candidate) : null
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

  const parts = await readMultipartFormData(event)
  const filePart = parts?.find((part) => part.name === 'file')

  if (!filePart?.data?.length) {
    throw createError({
      statusCode: 400,
      statusMessage: 'No file uploaded'
    })
  }

  const entityRes = await directusServiceRequest(`/items/entities/${entityId}`, {
    method: 'GET',
    query: { fields: '*' }
  })

  const entity = entityRes?.data || null

  if (!entity || String(entity.world_id) !== String(worldId)) {
    throw createError({
      statusCode: 404,
      statusMessage: 'Entity not found in this world'
    })
  }

  const config = useRuntimeConfig()
  const baseUrl = String(config.public.directusUrl || '').replace(/\/$/, '')
  const token = String(config.directusToken || '')

  if (!baseUrl) {
    throw createError({
      statusCode: 500,
      statusMessage: 'Directus URL is not configured'
    })
  }

  const form = new FormData()
  const blob = new Blob([filePart.data], {
    type: filePart.type || 'application/octet-stream'
  })

  form.append('file', blob, filePart.filename || 'entity-image-upload')

  const uploadRes = await fetch(`${baseUrl}/files`, {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    body: form
  })

  const uploadJson = await uploadRes.json().catch(() => null)

  if (!uploadRes.ok) {
    throw createError({
      statusCode: uploadRes.status || 500,
      statusMessage:
        uploadJson?.errors?.[0]?.message ||
        uploadJson?.message ||
        'Failed to upload image to Directus'
    })
  }

  const fileId = extractUploadedFileId(uploadJson)

  if (!fileId) {
    throw createError({
      statusCode: 500,
      statusMessage: 'Upload succeeded but no file id was returned'
    })
  }

  await directusServiceRequest(`/items/entities/${entityId}`, {
    method: 'PATCH',
    body: {
      image: fileId
    }
  })

  return {
    ok: true,
    file_id: fileId,
    asset_url: `/api/assets/${fileId}`
  }
})
