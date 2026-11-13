import { directusServiceRequest } from './directus'
function baseUrl() {
  return (process.env.DIRECTUS_URL || process.env.NUXT_PUBLIC_DIRECTUS_URL || '').replace(/\/$/, '')
}

function token() {
  return process.env.DIRECTUS_TOKEN || ''
}

export function slugify(value: string) {
  return String(value || '')
    .toLowerCase()
    .trim()
    .replace(/['"]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 120)
}

export async function dxFetch(path: string, options: RequestInit = {}) {
  return await directusServiceRequest(path, {
    ...options,
    headers: {
      Accept: 'application/json',
      ...(typeof options.body === 'string' ? { 'Content-Type': 'application/json' } : {}),
      ...(options.headers || {})
    }
  })
}

// `worldId` stamps `directus_files.world_id` in the SAME multipart create
// request as the file itself -- media ownership policy follow-up.
// Optional, and never defaulted by this shared helper: both current
// callers (characters/create.post.ts, characters/[characterId]/
// update.post.ts) already have an already-authorized World in scope at
// the call site and pass it explicitly, so this function never invents
// or guesses an owner on a caller's behalf.
export async function uploadImageToDirectus(filePart: any, worldId?: string | number) {
  if (!filePart?.data) return null

  const form = new FormData()
  const blob = new Blob([filePart.data], {
    type: filePart.type || 'application/octet-stream'
  })

  // Item 2 E2E integration (Pass B review follow-up) caught a real bug
  // here against a live Directus 11.12.0: Directus's multipart file
  // handler ignores every form field that comes AFTER `file` in request
  // order -- `world_id` was silently dropped on every upload through this
  // helper, regardless of the argument passed, confirmed empirically
  // (curl against the disposable instance: `file` first -> world_id null;
  // `file` last -> world_id set). `file` must be appended LAST.
  if (worldId !== undefined && worldId !== null && String(worldId).trim()) {
    form.append('world_id', String(worldId))
  }

  form.append('file', blob, filePart.filename || 'entity-image')

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
      statusMessage:
        json?.errors?.[0]?.message ||
        json?.message ||
        text ||
        `Directus upload error (${res.status})`
    })
  }

  return json?.data?.id ? String(json.data.id) : null
}

export async function getWorldSystemKey(worldId: string) {
  const numericWorldId = /^\d+$/.test(String(worldId)) ? Number(worldId) : worldId

  try {
    const json = await dxFetch(`/items/worlds/${numericWorldId}?fields=id,system_key`)
    const world = json?.data || null
    if (world?.system_key) return String(world.system_key)
  } catch {}

  return 'dnd5e'
}

type CreateEntityArgs = {
  worldId: string
  title: string
  summary?: string | null
  imageId?: string | null
  entityType: string
  extra?: Record<string, any>
}

export async function createEntityRecord(args: CreateEntityArgs) {
  const {
    worldId,
    title,
    summary = null,
    imageId = null,
    entityType,
    extra = {}
  } = args

  if (!String(title || '').trim()) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Title is required'
    })
  }

  const systemKey = await getWorldSystemKey(worldId)
  const baseSlug = slugify(title) || 'entity'
  const slug = `${baseSlug}-${Date.now().toString().slice(-6)}`

  const payload: Record<string, any> = {
    world_id: Number(worldId),
    system_key: systemKey,
    title: String(title).trim(),
    slug,
    summary: summary ? String(summary).trim() : null,
    entity_type: String(entityType || '').trim(),
    status: 'draft',
    visibility: 'world',
    ...extra
  }

  if (imageId) {
    payload.image = imageId
  }

  Object.keys(payload).forEach((key) => {
    if (payload[key] === undefined) {
      delete payload[key]
    }
  })

  const created = await dxFetch('/items/entities', {
    method: 'POST',
    body: JSON.stringify(payload)
  })

  const entity = created?.data || null

  return {
    success: true,
    id: entity?.id,
    title: entity?.title || payload.title,
    slug: entity?.slug || slug,
    summary: entity?.summary || payload.summary || '',
    entity_type: entity?.entity_type || payload.entity_type,
    system_key: entity?.system_key || systemKey,
    world_id: entity?.world_id || Number(worldId),
    image: entity?.image || imageId || null,
    imageUrl: entity?.image ? `/api/assets/${entity.image}` : imageId ? `/api/assets/${imageId}` : null
  }
}
