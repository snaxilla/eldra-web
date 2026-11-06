// createError/defineEventHandler/getRequestHeader/getRouterParam are
// imported explicitly (see server/api/worlds/[id]/members/index.get.ts)
// so this route is directly unit-testable under plain Vitest.
import { createError, defineEventHandler, getRequestHeader, getRouterParam } from 'h3'
import { directusServiceRequest } from '../../../../utils/directus'
import { requireCapability } from '../../../../utils/authorization'
import { DEFAULT_MAX_UPLOAD_BYTES, MultipartFileTooLargeError, readStreamingMultipartForm } from '../../../../utils/streaming-multipart'

// Media Gallery follow-up pass. Same root cause as the Maps upload route
// fixed in 8fe6f78: this route called h3's own readMultipartFormData,
// whose hand-rolled parser buffers the whole body then walks it byte by
// byte into a plain JS array -- the exact RangeError: Invalid array
// length reported for a large map image uploaded through the Media
// Gallery (POST /api/worlds/:id/media/upload). Swapped for the same
// shared streaming parser, with the same established size limit (this
// route previously had no limit of its own, documented or otherwise).
export const MAX_MEDIA_UPLOAD_BYTES = DEFAULT_MAX_UPLOAD_BYTES

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

  const declaredLength = Number(getRequestHeader(event, 'content-length') || 0)
  if (Number.isFinite(declaredLength) && declaredLength > MAX_MEDIA_UPLOAD_BYTES) {
    console.warn(
      `[media/upload] rejecting world ${worldId} upload before parsing: declared Content-Length ${declaredLength} exceeds ${MAX_MEDIA_UPLOAD_BYTES}`
    )
    throw createError({
      statusCode: 413,
      statusMessage: `Image is too large. The upload limit is ${Math.floor(MAX_MEDIA_UPLOAD_BYTES / (1024 * 1024))} MB.`
    })
  }

  let form: Awaited<ReturnType<typeof readStreamingMultipartForm>>
  try {
    form = await readStreamingMultipartForm(event.node.req, event.node.req.headers, {
      maxFileBytes: MAX_MEDIA_UPLOAD_BYTES
    })
  } catch (error: any) {
    if (error instanceof MultipartFileTooLargeError) {
      console.warn(`[media/upload] world ${worldId} upload exceeded the size limit: ${error.message}`)
      throw createError({
        statusCode: 413,
        statusMessage: `Image is too large. The upload limit is ${Math.floor(MAX_MEDIA_UPLOAD_BYTES / (1024 * 1024))} MB.`
      })
    }

    console.error(`[media/upload] world ${worldId} failed while parsing the upload body:`, error?.message || error)
    throw createError({
      statusCode: 400,
      statusMessage: 'The uploaded file could not be read. Please try again or use a smaller image.'
    })
  }

  const { fields, file } = form

  if (!file && !Object.keys(fields).length) {
    throw createError({
      statusCode: 400,
      statusMessage: 'No file uploaded'
    })
  }

  if (!file?.data?.length || !String(file.mimeType || '').startsWith('image/')) {
    throw createError({
      statusCode: 400,
      statusMessage: 'No image file found in upload'
    })
  }

  const title = cleanText(fields.title) || cleanText(file.filename) || 'Eldra image'

  const uploadForm = new FormData()
  const blob = new Blob([file.data], { type: file.mimeType || 'application/octet-stream' })
  uploadForm.append('file', blob, file.filename || 'eldra-media-upload')

  const uploaded = await directusServiceRequest('/files', {
    method: 'POST',
    body: uploadForm
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
    filename: cleanText(uploaded?.data?.filename_download || uploaded?.data?.filename_disk || file.filename),
    type: cleanText(uploaded?.data?.type || file.mimeType),
    filesize: Number(uploaded?.data?.filesize || file.data.length || 0),
    uploadedOn: uploaded?.data?.uploaded_on || uploaded?.data?.created_on || null,
    url: `/api/assets/${fileId}`
  }
})
