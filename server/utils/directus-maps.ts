import axios from 'axios'
import FormData from 'form-data'

type MapType = 'world' | 'country' | 'area' | 'detail'

type DirectusMapRecord = {
  id: string | number
  title: string
  slug: string
  type: MapType
  imageUrl: string
  isDefaultWorldMap: boolean
  directusFileId: string | null
}

const MAPS_COLLECTION = 'maps'

const FIELD_MAP = {
  id: 'id',
  title: 'title',
  slug: 'slug',
  type: 'type',
  world: 'world',
  file: 'image_file',
  isDefaultWorldMap: 'is_default_world_map'
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
      ...(typeof options.body === 'string' ? { 'Content-Type': 'application/json' } : {}),
      ...(options.headers || {})
    }
  })

  if (!res.ok) {
    throw new Error(await res.text())
  }

  return res.json()
}

function extractFileId(value: any): string | null {
  if (!value) return null
  if (typeof value === 'string') return value
  if (typeof value === 'object' && value.id) return String(value.id)
  return null
}

function fileUrl(fileId: string | null) {
  if (!fileId) return ''
  return `/api/assets/${fileId}`
}

function normalize(item: any): DirectusMapRecord {
  const fileId = extractFileId(item?.[FIELD_MAP.file])

  return {
    id: item?.[FIELD_MAP.id],
    title: item?.[FIELD_MAP.title],
    slug: item?.[FIELD_MAP.slug] || '',
    type: item?.[FIELD_MAP.type],
    imageUrl: fileUrl(fileId),
    isDefaultWorldMap: Boolean(item?.[FIELD_MAP.isDefaultWorldMap]),
    directusFileId: fileId
  }
}

function getFormLength(form: FormData): Promise<number> {
  return new Promise((resolve, reject) => {
    form.getLength((err, length) => {
      if (err) reject(err)
      else resolve(length)
    })
  })
}

export async function listMaps(worldId: string) {
  const params = new URLSearchParams()
  params.set('filter[world][_eq]', worldId)
  params.set('fields[]', '*')
  params.set('fields[]', 'image_file.*')

  const res = await dxFetch(`/items/${MAPS_COLLECTION}?${params.toString()}`)
  return (res.data || []).map(normalize)
}

export async function uploadFile(buffer: Buffer, filename: string, mime: string) {
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

export async function createMap(worldId: string, title: string, type: MapType, fileId: string) {
  const existing = await listMaps(worldId)
  const slug = slugify(title)

  const res = await dxFetch(`/items/${MAPS_COLLECTION}`, {
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

  return normalize(res.data)
}

export async function setDefault(worldId: string, mapId: string) {
  const rawList = await dxFetch(`/items/${MAPS_COLLECTION}?filter[world][_eq]=${encodeURIComponent(worldId)}&fields[]=id`)
  const rows = rawList.data || []

  for (const row of rows) {
    await dxFetch(`/items/${MAPS_COLLECTION}/${row.id}`, {
      method: 'PATCH',
      body: JSON.stringify({
        is_default_world_map: String(row.id) === String(mapId)
      })
    })
  }

  return true
}
