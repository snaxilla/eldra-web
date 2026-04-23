function baseUrl() {
  return (process.env.DIRECTUS_URL || process.env.NUXT_PUBLIC_DIRECTUS_URL || '').replace(/\/$/, '')
}

function token() {
  return process.env.DIRECTUS_TOKEN || ''
}

function slugify(value: string) {
  return String(value || '')
    .toLowerCase()
    .trim()
    .replace(/['"]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 120)
}

async function dxFetch(path: string, options: RequestInit = {}) {
  const res = await fetch(`${baseUrl()}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token()}`,
      ...(typeof options.body === 'string' ? { 'Content-Type': 'application/json' } : {}),
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
      statusMessage:
        json?.errors?.[0]?.message ||
        json?.message ||
        text ||
        `Directus error (${res.status})`
    })
  }

  return json
}

async function uploadImageToDirectus(filePart: any) {
  if (!filePart?.data) return null

  const form = new FormData()
  const blob = new Blob([filePart.data], {
    type: filePart.type || 'application/octet-stream'
  })

  form.append('file', blob, filePart.filename || 'character-image')

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

export default defineEventHandler(async (event) => {
  const worldId = String(getRouterParam(event, 'id') || '')
  if (!worldId) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Missing world id'
    })
  }

  const parts = await readMultipartFormData(event)
  if (!parts?.length) {
    throw createError({
      statusCode: 400,
      statusMessage: 'No form data received'
    })
  }

  const getField = (name: string) => {
    const part = parts.find((p) => p.name === name)
    return part?.data ? Buffer.from(part.data).toString('utf8') : ''
  }

  const title = String(getField('title') || '').trim()
  const summary = String(getField('summary') || '').trim()
  const archetypeRaw = String(getField('characterType') || '').trim().toLowerCase()

  const characterType =
    archetypeRaw === 'pc' ? 'pc' :
    archetypeRaw === 'npc_sheet' ? 'npc_sheet' :
    'npc'

  if (!title) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Character name is required'
    })
  }

  const imagePart = parts.find((p) => p.name === 'image' && p.type && String(p.type).startsWith('image/'))
  const imageId = imagePart ? await uploadImageToDirectus(imagePart) : null

  const baseSlug = slugify(title) || 'character'
  const slug = `${baseSlug}-${Date.now().toString().slice(-6)}`

  const worldValue = /^\d+$/.test(worldId) ? Number(worldId) : worldId

  const payload: Record<string, any> = {
    world: worldValue,
    title,
    slug,
    summary: summary || null,
    entity_type: characterType
  }

  if (imageId) {
    payload.image = imageId
  }

  const created = await dxFetch('/items/entities', {
    method: 'POST',
    body: JSON.stringify(payload)
  })

  const entity = created?.data || null

  return {
    success: true,
    id: entity?.id,
    title: entity?.title || title,
    slug: entity?.slug || slug,
    summary: entity?.summary || summary || '',
    entity_type: entity?.entity_type || characterType,
    image: entity?.image || imageId || null,
    imageUrl: entity?.image ? `/api/assets/${entity.image}` : imageId ? `/api/assets/${imageId}` : null
  }
})
