import axios from 'axios'
import FormData from 'form-data'

type MapType = 'world' | 'country' | 'area' | 'detail'

export type MapRecord = {
  id: string
  title: string
  slug: string
  type: MapType
  imageUrl: string
  isDefaultWorldMap: boolean
  directusFileId: string | null
}

function serverBaseUrl() {
  const url = process.env.DIRECTUS_URL || process.env.NUXT_PUBLIC_DIRECTUS_URL || ''
  return url.replace(/\/$/, '')
}

function token() {
  return process.env.DIRECTUS_TOKEN || ''
}

function slugify(input: string) {
  return input
    .toLowerCase()
    .trim()
    .replace(/['"]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || `map-${Date.now()}`
}

async function dxFetch(path: string, options: RequestInit = {}) {
  const res = await fetch(`${serverBaseUrl()}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token()}`,
      Accept: 'application/json',
      ...(typeof options.body === 'string' ? { 'Content-Type': 'application/json' } : {}),
      ...(options.headers || {})
    }
  })

  const text = await res.text()
  let json: any = null

  try {
    json = text ? JSON.parse(text) : null
  } catch {
    json = null
  }

  if (!res.ok) {
    throw new Error(json?.errors?.[0]?.message || text || `Directus request failed (${res.status})`)
  }

  return json
}

function getFormLength(form: FormData): Promise<number> {
  return new Promise((resolve, reject) => {
    form.getLength((err, length) => {
      if (err) reject(err)
      else resolve(length)
    })
  })
}

function normalize(item: any): MapRecord {
  const fileId =
    typeof item?.image_file === 'string'
      ? item.image_file
      : item?.image_file?.id || null

  return {
    id: String(item?.id || ''),
    title: String(item?.title || ''),
    slug: String(item?.slug || ''),
    type: (item?.type || 'area') as MapType,
    imageUrl: fileId ? `/api/assets/${fileId}` : '',
    isDefaultWorldMap: Boolean(item?.is_default_world_map),
    directusFileId: fileId ? String(fileId) : null
  }
}

export async function listWorldMaps(worldId: string) {
  const params = new URLSearchParams()
  params.set('filter[world][_eq]', worldId)
  params.append('fields[]', 'id')
  params.append('fields[]', 'title')
  params.append('fields[]', 'slug')
  params.append('fields[]', 'type')
  params.append('fields[]', 'is_default_world_map')
  params.append('fields[]', 'image_file')
  params.append('fields[]', 'image_file.id')

  const json = await dxFetch(`/items/maps?${params.toString()}`)
  return (json?.data || []).map(normalize)
}

export async function uploadDirectusFile(buffer: Buffer, filename: string, mime: string) {
  const form = new FormData()

  form.append('file', buffer, {
    filename,
    contentType: mime || 'application/octet-stream'
  })

  const contentLength = await getFormLength(form)

  const res = await axios.post(`${serverBaseUrl()}/files`, form, {
    headers: {
      Authorization: `Bearer ${token()}`,
      ...form.getHeaders(),
      'Content-Length': String(contentLength)
    },
    maxBodyLength: Infinity,
    maxContentLength: Infinity,
    validateStatus: () => true
  })

  if (res.status < 200 || res.status >= 300) {
    const payload = typeof res.data === 'string' ? res.data : JSON.stringify(res.data)
    throw new Error(payload)
  }

  return res.data.data
}

export async function createWorldMap(worldId: string, title: string, type: MapType, fileId: string) {
  const existing = await listWorldMaps(worldId)
  const slug = slugify(title)

  const json = await dxFetch('/items/maps', {
    method: 'POST',
    body: JSON.stringify({
      title,
      slug,
      type,
      world: Number(worldId),
      image_file: fileId,
      is_default_world_map: existing.length === 0
    })
  })

  return normalize(json.data)
}

export async function setDefaultWorldMapByMapId(mapId: string) {
  const current = await dxFetch(`/items/maps/${mapId}?fields[]=id&fields[]=world`)
  const worldId = String(current?.data?.world || '')

  if (!worldId) {
    throw new Error('Could not determine world for selected map')
  }

  const maps = await listWorldMaps(worldId)

  for (const map of maps) {
    await dxFetch(`/items/maps/${map.id}`, {
      method: 'PATCH',
      body: JSON.stringify({
        is_default_world_map: map.id === mapId
      })
    })
  }

  return true
}
