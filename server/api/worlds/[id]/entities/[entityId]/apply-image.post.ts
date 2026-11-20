// createError/defineEventHandler/getRouterParam/readMultipartFormData are
// imported explicitly (see server/api/worlds/[id]/media/upload.post.ts)
// so this route is directly unit-testable under plain Vitest -- media
// ownership policy follow-up.
import { createError, defineEventHandler, getRequestHeader, getRouterParam, readBody, readMultipartFormData } from 'h3'
import { requireCapability } from '../../../../../utils/authorization'
import { fileBelongsToWorld } from '../../../../../utils/world-page-presentation'

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

  const entityJson = await dxFetch(`/items/entities/${entityId}?fields=*`)
  const entity = entityJson?.data || null

  if (!entity || String(entity.world_id) !== String(worldId)) {
    throw createError({
      statusCode: 404,
      statusMessage: 'Entity not found in this world'
    })
  }

  // RESTORE A CLEAR, CONSISTENT FULL-EDITOR ENTRY POINT -- the Article
  // Image control now opens WorldMediaPicker (an EXISTING asset, or a
  // fresh upload through the Gallery's own upload action) instead of a
  // bare OS file input, so this route must also accept an EXISTING file
  // reference, not only a brand-new multipart upload. Branches on
  // content-type rather than a second endpoint -- both are "apply this
  // image to this entity," the same action with two possible sources,
  // exactly like server/api/worlds/[id]/maps.vue's own upload-vs-gallery
  // treatment.
  const isMultipart = String(getRequestHeader(event, 'content-type') || '').includes('multipart/form-data')

  if (!isMultipart) {
    const body = await readBody(event)
    const imageFileId = String(body?.imageFileId || '').trim()

    if (!imageFileId) {
      throw createError({
        statusCode: 400,
        statusMessage: 'No file uploaded'
      })
    }

    const fileCheck = await dxFetch(
      `/files/${encodeURIComponent(imageFileId)}?fields[]=id&fields[]=world_id&fields[]=type`
    )

    if (!fileCheck?.data?.id || !fileBelongsToWorld(fileCheck.data.world_id, worldId)) {
      throw createError({
        statusCode: 403,
        statusMessage: 'That image does not belong to this World.'
      })
    }

    if (!String(fileCheck.data.type || '').startsWith('image/')) {
      throw createError({
        statusCode: 400,
        statusMessage: 'Selected file is not a supported image type.'
      })
    }

    const patchJson = await dxFetch(`/items/entities/${entityId}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        image: imageFileId
      })
    })

    return {
      success: true,
      fileId: imageFileId,
      imageUrl: `/api/assets/${imageFileId}`,
      entity: patchJson?.data || null
    }
  }

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
  // multipart create request as the file, stamped from the entity's own
  // already-verified owning World (checked above), never from
  // client-supplied metadata.
  const form = new FormData()
  const blob = new Blob([filePart.data], { type: filePart.type || 'application/octet-stream' })
  // FIELD ORDER IS LOAD-BEARING. Pass B review follow-up, Item 2's
  // multipart audit: Directus's own multipart file handler ignores every
  // form field placed AFTER `file` (confirmed empirically against a live
  // Directus 11.12.0). `file` must be appended LAST, or `world_id` is
  // silently dropped regardless of the value passed here.
  form.append('world_id', String(worldId))
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
