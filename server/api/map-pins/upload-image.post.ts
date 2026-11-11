// createError/defineEventHandler/getRequestHeader are imported explicitly
// (see server/api/worlds/[id]/media/upload.post.ts) so this route is
// directly unit-testable under plain Vitest.
import { createError, defineEventHandler, getRequestHeader } from 'h3'
import { directusServiceRequest } from '../../utils/directus'
import { requireCapability } from '../../utils/authorization'
import { DEFAULT_MAX_UPLOAD_BYTES, MultipartFileTooLargeError, readStreamingMultipartForm } from '../../utils/streaming-multipart'

// `directusServiceRequest` returns `Promise<unknown>` (no generic -- see
// its own signature in server/utils/directus.ts); these two helpers
// VALIDATE that unknown response's shape before reading any field from
// it, rather than trusting an untyped `.data.xyz` chain. Narrowing
// `unknown`/`object` down to an indexable record is the one `as`
// TypeScript itself requires for this (there is no built-in narrowing
// from `object` to `Record<string, unknown>`); nothing here casts to a
// specific, unverified interface, and no field is read without first
// confirming its container is actually an object.
function readRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' ? (value as Record<string, unknown>) : null
}

function readDirectusDataRecord(response: unknown): Record<string, unknown> | null {
  return readRecord(readRecord(response)?.data)
}

// Media ownership policy follow-up -- this route previously had NONE of
// the following, confirmed by direct read of its pre-existing source:
//   - any authentication or capability check at all
//   - any World context of any kind (no route param, no body field)
//   - the shared streaming multipart parser (used h3's own
//     readMultipartFormData instead -- the same RangeError-on-large-file
//     class of bug already fixed on every sibling upload route)
//   - env-based Directus access -- it called a HARDCODED production
//     Directus URL and a HARDCODED bearer token literally in source
// All four are fixed here together, because the first (world
// verification) cannot be added without the second and third (knowing
// WHICH map/World this upload belongs to, safely parsed), and leaving a
// hardcoded production credential in a file this task was already
// rewriting for ownership-stamping purposes would be irresponsible, not
// merely "preserving existing behavior" -- there is no behavior here
// worth preserving unmodified.
//
// map-pins routes are not nested under worlds/[id] -- resolve worldId via
// the pin's MAP, same lookup server/api/map-pins/index.post.ts's own
// pin-creation route already uses (identical comment there), extended
// here to an upload that has no pin yet (a pin image can be uploaded
// before the pin itself is saved -- see app/pages/worlds/[id]/index.vue's
// `uploadPinImage`). The client now sends `mapId` as an explicit form
// field alongside `file`; this route never trusts a client-supplied
// `worldId` directly -- only `mapId`, which is then resolved to its real
// World server-side via Directus, exactly like every other
// ownership-verified upload route in this codebase.
export const MAX_PIN_IMAGE_UPLOAD_BYTES = DEFAULT_MAX_UPLOAD_BYTES

export default defineEventHandler(async (event) => {
  const declaredLength = Number(getRequestHeader(event, 'content-length') || 0)
  if (Number.isFinite(declaredLength) && declaredLength > MAX_PIN_IMAGE_UPLOAD_BYTES) {
    throw createError({
      statusCode: 413,
      statusMessage: `Image is too large. The upload limit is ${Math.floor(MAX_PIN_IMAGE_UPLOAD_BYTES / (1024 * 1024))} MB.`
    })
  }

  let form: Awaited<ReturnType<typeof readStreamingMultipartForm>>
  try {
    form = await readStreamingMultipartForm(event.node.req, event.node.req.headers, {
      maxFileBytes: MAX_PIN_IMAGE_UPLOAD_BYTES
    })
  } catch (error) {
    if (error instanceof MultipartFileTooLargeError) {
      throw createError({
        statusCode: 413,
        statusMessage: `Image is too large. The upload limit is ${Math.floor(MAX_PIN_IMAGE_UPLOAD_BYTES / (1024 * 1024))} MB.`
      })
    }

    throw createError({
      statusCode: 400,
      statusMessage: 'The uploaded file could not be read. Please try again or use a smaller image.'
    })
  }

  const { fields, file } = form
  const mapId = String(fields.mapId || '').trim()

  if (!mapId) {
    throw createError({
      statusCode: 400,
      statusMessage: 'mapId is required'
    })
  }

  if (!file?.data?.length || !String(file.mimeType || '').startsWith('image/')) {
    throw createError({
      statusCode: 400,
      statusMessage: 'No image file found in upload'
    })
  }

  const principal = event.context.principal ?? null
  if (!principal) {
    throw createError({ statusCode: 401, statusMessage: 'Authentication required' })
  }

  const mapRes = await directusServiceRequest(`/items/maps/${encodeURIComponent(mapId)}`, {
    method: 'GET',
    query: { fields: 'id,world' }
  })
  const mapData = readDirectusDataRecord(mapRes)
  const worldId = mapData?.world !== undefined && mapData.world !== null ? String(mapData.world) : ''
  if (!worldId) {
    throw createError({ statusCode: 404, statusMessage: 'Map not found' })
  }

  requireCapability(principal, 'world.map.edit', { kind: 'world', worldId })

  const uploadForm = new FormData()
  // Buffer<ArrayBufferLike> (every Buffer's actual declared type since
  // @types/node made Buffer generic) does not structurally satisfy
  // BlobPart's ArrayBufferView<ArrayBuffer> -- the DOM/webworker lib
  // requires the backing buffer to be a concrete ArrayBuffer, not the
  // broader ArrayBufferLike (which also covers SharedArrayBuffer).
  // Re-wrapping via `new Uint8Array(file.data)` resolves to the
  // ArrayLike<number> constructor overload, which IS typed
  // Uint8Array<ArrayBuffer> -- verified directly against this project's
  // own installed TypeScript/@types/node and lib set, not assumed. This
  // copies the bytes once; a pin image is small enough that the copy is
  // not worth avoiding at the cost of an unchecked buffer-type assertion.
  const blob = new Blob([new Uint8Array(file.data)], { type: file.mimeType || 'application/octet-stream' })
  uploadForm.append('file', blob, file.filename || 'pin-image-upload')
  uploadForm.append('world_id', worldId)

  const uploaded = await directusServiceRequest('/files', {
    method: 'POST',
    body: uploadForm
  })

  const createdFile = readDirectusDataRecord(uploaded)
  const fileId = createdFile?.id !== undefined && createdFile.id !== null ? String(createdFile.id) : ''

  if (!fileId) {
    throw createError({
      statusCode: 500,
      statusMessage: 'Upload succeeded but Directus did not return a file id'
    })
  }

  return {
    file_id: fileId,
    image_url: `/api/assets/${fileId}`
  }
})
