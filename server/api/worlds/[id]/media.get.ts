import { createError, defineEventHandler, getQuery, getRouterParam } from 'h3'
import { directusServiceRequest } from '../../../utils/directus'
import { requireCapability } from '../../../utils/authorization'

function assetUrl(id: any) {
  const value = String(id || '').trim()
  return value ? `/api/assets/${value}` : ''
}

function cleanText(value: any) {
  return String(value || '').trim()
}

function normalizeFile(file: any) {
  const id = cleanText(file?.id)

  return {
    id,
    title: cleanText(file?.title || file?.filename_download || file?.filename_disk || 'Untitled image'),
    filename: cleanText(file?.filename_download || file?.filename_disk || ''),
    type: cleanText(file?.type || ''),
    filesize: Number(file?.filesize || 0),
    uploadedOn: file?.uploaded_on || file?.created_on || null,
    modifiedOn: file?.modified_on || null,
    width: file?.width || null,
    height: file?.height || null,
    description: cleanText(file?.description || ''),
    tags: Array.isArray(file?.tags) ? file.tags : [],
    url: assetUrl(id)
  }
}

export default defineEventHandler(async (event) => {
  const worldId = String(getRouterParam(event, 'id') || '').trim()

  if (!worldId) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Missing world id'
    })
  }

  // Media Gallery World-scope fix (Phase 0, Area 1). Media upload/delete
  // have always required `world.entity.edit`; this listing route never
  // did, and never scoped its Directus query to the requesting World
  // either -- it returned every image file in the instance to any
  // authenticated caller. There is no separate "world not found" branch:
  // a nonexistent worldId resolves to no membership row, so
  // requireCapability throws the same 403 it would for any World this
  // Principal holds no role in (server/utils/authorization.ts's `can()`,
  // design decision already established there) -- the same behavior
  // every other world-scoped write route in this file's own directory
  // already relies on.
  const principal = event.context.principal ?? null
  if (!principal) {
    throw createError({ statusCode: 401, statusMessage: 'Authentication required' })
  }
  requireCapability(principal, 'world.entity.edit', { kind: 'world', worldId })

  const query = getQuery(event)
  const search = cleanText(query.search)

  // `world_id` is the authoritative, queryable field media/upload.post.ts
  // now writes (directus_files has no built-in World association --
  // see scripts/directus/create-media-world-scope-schema.mjs's own
  // header). A file uploaded before that field existed has `world_id:
  // null` and is therefore excluded here for every World -- a known,
  // reported limitation, not a bug: the only other signal on those rows
  // is a free-text description, which is not authoritative proof of
  // ownership and must not be treated as such.
  const filter: any = {
    world_id: { _eq: Number(worldId) },
    type: { _starts_with: 'image/' }
  }

  if (search) {
    filter._or = [
      { title: { _icontains: search } },
      { filename_download: { _icontains: search } },
      { filename_disk: { _icontains: search } },
      { description: { _icontains: search } }
    ]
  }

  const filesRes = await directusServiceRequest('/files', {
    method: 'GET',
    query: {
      filter,
      sort: '-uploaded_on',
      limit: 240,
      fields: [
        'id',
        'title',
        'filename_download',
        'filename_disk',
        'type',
        'filesize',
        'uploaded_on',
        'created_on',
        'modified_on',
        'width',
        'height',
        'description',
        'tags'
      ].join(',')
    }
  })

  const files = Array.isArray(filesRes?.data) ? filesRes.data : []

  return {
    worldId,
    files: files.map(normalizeFile)
  }
})
