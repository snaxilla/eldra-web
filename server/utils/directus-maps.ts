type MapType = 'world' | 'country' | 'area' | 'detail'

type DirectusMapRecord = {
  id: string | number
  title: string
  type: MapType
  imageUrl: string
  isDefaultWorldMap: boolean
  directusFileId: string | null
}

const MAPS_COLLECTION = 'maps'

const FIELD_MAP = {
  id: 'id',
  title: 'title',
  type: 'type',
  world: 'world',
  file: 'image_file',
  isDefaultWorldMap: 'is_default_world_map'
}

function baseUrl() {
  const url = process.env.NUXT_PUBLIC_DIRECTUS_URL || process.env.DIRECTUS_URL || ''
  return url.replace(/\/$/, '')
}

function token() {
  return process.env.DIRECTUS_TOKEN || ''
}

async function dxFetch(path: string, options: RequestInit = {}) {
  const res = await fetch(`${baseUrl()}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token()}`,
      ...(options.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }),
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
  return `${baseUrl()}/assets/${fileId}`
}

function normalize(item: any): DirectusMapRecord {
  const fileId = extractFileId(item?.[FIELD_MAP.file])

  return {
    id: item?.[FIELD_MAP.id],
    title: item?.[FIELD_MAP.title],
    type: item?.[FIELD_MAP.type],
    imageUrl: fileUrl(fileId),
    isDefaultWorldMap: Boolean(item?.[FIELD_MAP.isDefaultWorldMap]),
    directusFileId: fileId
  }
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
  const blob = new Blob([buffer], { type: mime || 'application/octet-stream' })

  form.append('file', blob, filename)

  const res = await fetch(`${baseUrl()}/files`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token()}`
    },
    body: form
  })

  if (!res.ok) {
    throw new Error(await res.text())
  }

  const json = await res.json()
  return json.data
}

export async function createMap(worldId: string, title: string, type: MapType, fileId: string) {
  const existing = await listMaps(worldId)

  const res = await dxFetch(`/items/${MAPS_COLLECTION}`, {
    method: 'POST',
    body: JSON.stringify({
      title,
      type,
      world: Number(worldId),
      image_file: fileId,
      is_default_world_map: existing.length === 0
    })
  })

  return normalize(res.data)
}

export async function setDefault(worldId: string, mapId: string) {
  const maps = await listMaps(worldId)

  for (const m of maps) {
    await dxFetch(`/items/${MAPS_COLLECTION}/${m.id}`, {
      method: 'PATCH',
      body: JSON.stringify({
        is_default_world_map: String(m.id) === String(mapId)
      })
    })
  }

  return true
}
