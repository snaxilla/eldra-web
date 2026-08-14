import { directusServiceRequest } from '../../../../utils/directus'
import { requireCapability } from '../../../../utils/authorization'

function cleanText(value: any) {
  return String(value || '').trim()
}

export default defineEventHandler(async (event) => {
  const worldId = cleanText(getRouterParam(event, 'id'))

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
  requireCapability(principal, 'world.entity.edit', { kind: 'world', worldId })

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

  const title =
    cleanText(parts.find((part) => part.name === 'title')?.data?.toString()) ||
    cleanText(filePart.filename) ||
    'Eldra image'

  const form = new FormData()
  const blob = new Blob([filePart.data], { type: filePart.type || 'application/octet-stream' })
  form.append('file', blob, filePart.filename || 'eldra-media-upload')

  const uploaded = await directusServiceRequest('/files', {
    method: 'POST',
    body: form
  })

  const fileId = uploaded?.data?.id ? String(uploaded.data.id) : ''

  if (!fileId) {
    throw createError({
      statusCode: 500,
      statusMessage: 'Upload succeeded but Directus did not return a file id'
    })
  }

  await directusServiceRequest(`/files/${encodeURIComponent(fileId)}`, {
    method: 'PATCH',
    body: {
      title,
      description: `Eldra media upload for world ${worldId}`
    }
  }).catch(() => null)

  return {
    id: fileId,
    title,
    filename: cleanText(uploaded?.data?.filename_download || uploaded?.data?.filename_disk || filePart.filename),
    type: cleanText(uploaded?.data?.type || filePart.type),
    filesize: Number(uploaded?.data?.filesize || filePart.data.length || 0),
    uploadedOn: uploaded?.data?.uploaded_on || uploaded?.data?.created_on || null,
    url: `/api/assets/${fileId}`
  }
})
