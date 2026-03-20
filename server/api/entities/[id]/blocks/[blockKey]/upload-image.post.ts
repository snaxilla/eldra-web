import { directusServiceRequest } from '../../../../../../utils/directus'

function getDirectusUrl() {
  const url = process.env.NUXT_PUBLIC_DIRECTUS_URL || ''
  if (!url) {
    throw createError({
      statusCode: 500,
      statusMessage: 'NUXT_PUBLIC_DIRECTUS_URL is not set'
    })
  }
  return url.replace(/\/+$/, '')
}

export default defineEventHandler(async (event) => {
  const entityId = Number(getRouterParam(event, 'id') || '')
  const blockKey = getRouterParam(event, 'blockKey') || ''

  if (!entityId || !blockKey) {
    throw createError({
      statusCode: 400,
      statusMessage: 'entity id and blockKey are required'
    })
  }

  const parts = await readMultipartFormData(event)

  if (!parts?.length) {
    throw createError({
      statusCode: 400,
      statusMessage: 'No multipart form data received'
    })
  }

  const filePart = parts.find((part) => part.name === 'file' && part.data)
  if (!filePart) {
    throw createError({
      statusCode: 400,
      statusMessage: 'A file field named "file" is required'
    })
  }

  const titlePart = parts.find((part) => part.name === 'title')
  const title = titlePart?.data ? String(titlePart.data) : filePart.filename || 'upload'

  const blockRes = await directusServiceRequest('/items/block_instances', {
    method: 'GET',
    query: {
      filter: {
        _and: [
          { entity_id: { _eq: entityId } },
          { block_key: { _eq: blockKey } }
        ]
      },
      limit: 1,
      fields: 'id,data'
    }
  })

  const block = blockRes?.data?.[0]

  if (!block) {
    throw createError({
      statusCode: 404,
      statusMessage: `Block not found for entity ${entityId} and key ${blockKey}`
    })
  }

  const form = new FormData()
  const mimeType = filePart.type || 'application/octet-stream'
  const filename = filePart.filename || 'upload.bin'
  const blob = new Blob([filePart.data], { type: mimeType })

  form.append('file', blob, filename)
  form.append('title', title)

  const fileRes = await directusServiceRequest('/files', {
    method: 'POST',
    body: form
  })

  const uploadedFile = fileRes?.data

  if (!uploadedFile?.id) {
    throw createError({
      statusCode: 500,
      statusMessage: 'Directus file upload failed'
    })
  }

  const nextData = {
    ...(block.data || {}),
    image: uploadedFile.id
  }

  await directusServiceRequest(`/items/block_instances/${block.id}`, {
    method: 'PATCH',
    body: {
      data: nextData
    }
  })

  await directusServiceRequest(`/items/entities/${entityId}`, {
    method: 'PATCH',
    body: {
      updated_at: new Date().toISOString()
    }
  })

  return {
    ok: true,
    entityId,
    blockKey,
    blockInstanceId: block.id,
    file: {
      id: uploadedFile.id,
      title: uploadedFile.title || title,
      filename_download: uploadedFile.filename_download || filename,
      type: uploadedFile.type || mimeType,
      assetUrl: `${getDirectusUrl()}/assets/${uploadedFile.id}`
    }
  }
})
