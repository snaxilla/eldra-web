import axios from 'axios'
import FormData from 'form-data'

export type PinRecord = {
  id: string
  mapId: string
  entityId: number | null
  title: string
  x: number
  y: number
  color: string | null
  pinType: string | null
}

function baseUrl() {
  return (process.env.NUXT_PUBLIC_DIRECTUS_URL || process.env.DIRECTUS_URL || '').replace(/\/$/, '')
}

function token() {
  return process.env.DIRECTUS_TOKEN || ''
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
  try { json = text ? JSON.parse(text) : null } catch { json = null }

  if (!res.ok) {
    throw new Error(json?.errors?.[0]?.message || text || `Directus error (${res.status})`)
  }

  return json
}

function normalize(item: any): PinRecord {
  return {
    id: String(item?.id || ''),
    mapId: String(item?.map_id || ''),
    entityId: item?.entity_id ? Number(item.entity_id) : null,
    title: String(item?.title || ''),
    x: Number(item?.x ?? 0),
    y: Number(item?.y ?? 0),
    color: item?.color || null,
    pinType: item?.pin_type || null,
  }
}

export async function listPinsForMap(mapId: string): Promise<PinRecord[]> {
  const params = new URLSearchParams()
  params.set('filter[map_id][_eq]', mapId)
  params.append('fields[]', 'id')
  params.append('fields[]', 'map_id')
  params.append('fields[]', 'entity_id')
  params.append('fields[]', 'title')
  params.append('fields[]', 'x')
  params.append('fields[]', 'y')
  params.append('fields[]', 'color')
  params.append('fields[]', 'pin_type')
  params.set('sort', 'sort')
  params.set('limit', '500')

  const json = await dxFetch(`/items/map_pins?${params.toString()}`)
  return (json?.data || []).map(normalize)
}

export async function createPin(data: {
  mapId: string
  title: string
  x: number
  y: number
  color?: string | null
  pinType?: string | null
  entityId?: number | null
}): Promise<PinRecord> {
  const json = await dxFetch('/items/map_pins', {
    method: 'POST',
    body: JSON.stringify({
      map_id: data.mapId,
      title: data.title,
      x: data.x,
      y: data.y,
      color: data.color || null,
      pin_type: data.pinType || null,
      entity_id: data.entityId || null,
    })
  })
  return normalize(json?.data)
}

export async function updatePin(pinId: string, data: Partial<{
  title: string
  x: number
  y: number
  color: string | null
  pinType: string | null
  entityId: number | null
}>): Promise<PinRecord> {
  const body: any = {}
  if (data.title !== undefined) body.title = data.title
  if (data.x !== undefined) body.x = data.x
  if (data.y !== undefined) body.y = data.y
  if (data.color !== undefined) body.color = data.color
  if (data.pinType !== undefined) body.pin_type = data.pinType
  if (data.entityId !== undefined) body.entity_id = data.entityId

  const json = await dxFetch(`/items/map_pins/${pinId}`, {
    method: 'PATCH',
    body: JSON.stringify(body)
  })
  return normalize(json?.data)
}

export async function deletePin(pinId: string): Promise<void> {
  await dxFetch(`/items/map_pins/${pinId}`, { method: 'DELETE' })
}
