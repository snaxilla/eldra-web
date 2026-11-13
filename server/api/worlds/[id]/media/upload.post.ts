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

  // Media ownership policy follow-up -- `world_id` (and title/description,
  // which used to ride a SEPARATE, failure-swallowed PATCH after this same
  // POST) are set in the SAME multipart request that creates the file,
  // closing a real gap the old two-request shape had: the previous PATCH
  // was `.catch(() => null)`'d, so a PATCH failure would have reported
  // this route's own full `200` success while silently leaving the file
  // with `world_id: null` (and no title/description) -- a File that is
  // fully created but not fully owned, reported as if it were. With
  // everything in one request, there is no such partial-success window:
  // either the create succeeds with ownership attached, or nothing is
  // created at all.
  //
  // FIELD ORDER IS LOAD-BEARING. Item 2's E2E integration (Pass B review
  // follow-up) caught, against a live Directus 11.12.0, that Directus's
  // multipart file handler ignores every form field placed AFTER `file`
  // -- confirmed empirically (curl against the disposable instance: with
  // `file` appended first, `world_id`/`title`/`description` all silently
  // stayed null/filename-derived; with `file` appended LAST, all three
  // stuck). The ORIGINAL field order here had `file` first, meaning this
  // route's own stated fix for the "File created but not fully owned"
  // gap was never actually effective in production -- every uploaded
  // Media Gallery file has had `world_id: null` regardless of this code.
  // `file` must be appended last.
  const uploadForm = new FormData()
  const blob = new Blob([file.data], { type: file.mimeType || 'application/octet-stream' })
  uploadForm.append('title', title)
  uploadForm.append('description', `Eldra media upload for world ${worldId}`)
  uploadForm.append('world_id', worldId)
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
