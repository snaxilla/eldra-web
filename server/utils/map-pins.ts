type ResolvedPinRecord = {
  id: string
  mapId: string
  entityId: number | null
  linkedMapId: string | null
  title: string
  x: number
  y: number
  color: string | null
  pinType: string | null
  icon: string | null
  summary: string | null
  imageFileId: string | null
  imageUrl: string | null
  inheritFromEntity: boolean
  entity: null | {
    id: number
    title: string
    slug: string | null
    entity_type: string | null
    summary: string | null
    image_url: string | null
  }
  linkedMap: null | {
    id: string
    title: string
    slug: string | null
    imageUrl: string | null
  }
  resolvedTitle: string
  resolvedSummary: string | null
  resolvedImageUrl: string | null
  hasLinkedEntity: boolean
  hasLinkedMap: boolean
}

function baseUrl() {
  return (process.env.DIRECTUS_URL || process.env.NUXT_PUBLIC_DIRECTUS_URL || '').replace(/\/$/, '')
}

function token() {
  return process.env.DIRECTUS_TOKEN || ''
}

async function dxFetch(path: string, options: RequestInit = {}) {
  const url = `${baseUrl()}${path}`

  const res = await fetch(url, {
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
  } catch {
    json = null
  }

  if (!res.ok) {
    throw new Error(
      json?.errors?.[0]?.message ||
      json?.message ||
      text ||
      `Directus error (${res.status}) at ${url}`
    )
  }

  return json
}

function extractEntityImageUrl(entity: any, blocks: any[] = []) {
  const entityImage = entity?.image

  if (entityImage) {
    if (typeof entityImage === 'string') {
      return `/api/assets/${entityImage}`
    }

    if (typeof entityImage === 'object') {
      if (entityImage.image_url) return entityImage.image_url
      if (entityImage.file_id) return `/api/assets/${entityImage.file_id}`
      if (entityImage.id) return `/api/assets/${entityImage.id}`
    }
  }
  for (const block of blocks) {
    const image = block?.data?.image

    if (!image) continue

    if (typeof image === 'string') {
      return `/api/assets/${image}`
    }

    if (typeof image === 'object') {
      if (image.image_url) return image.image_url
      if (image.file_id) return `/api/assets/${image.file_id}`
      if (image.id) return `/api/assets/${image.id}`
    }
  }

  return null
}

function extractEntitySummary(entity: any, blocks: any[] = []) {
  if (entity?.summary) return String(entity.summary)

  for (const block of blocks) {
    if (block?.data?.summary) return String(block.data.summary)
    if (block?.data?.description) return String(block.data.description)
    if (block?.data?.bio) return String(block.data.bio)
  }

  return null
}

function extractLocationCore(blocks: any[] = []) {
  const block = blocks.find((item: any) => {
    const key = String(item?.block_key || item?.blockKey || '')
    return key === 'location_core'
  })

  const data = block?.data && typeof block.data === 'object' ? block.data : null
  if (!data) return null

  return {
    locationType: data.locationType ?? data.location_type ?? data.type ?? null,
    population: data.population ?? null,
    linkedMapId: data.linkedMapId ?? data.linked_map_id ?? null,
    parentLocationId: data.parentLocationId ?? data.parent_location_id ?? null
  }
}

async function loadEntityPreview(entityId: number | null) {
  if (!entityId) return null

  const entityJson = await dxFetch(`/items/entities/${entityId}?fields=*`)
  const entity = entityJson?.data

  if (!entity) return null

  const blocksJson = await dxFetch(
    `/items/block_instances?filter[entity_id][_eq]=${entityId}&sort=sort&fields=*`
  )

  const blocks = Array.isArray(blocksJson?.data) ? blocksJson.data : []

  return {
    id: Number(entity.id),
    title: String(entity.title || ''),
    slug: entity.slug ? String(entity.slug) : null,
    entity_type: entity.entity_type ? String(entity.entity_type) : null,
    summary: extractEntitySummary(entity, blocks),
    image_url: extractEntityImageUrl(entity, blocks),
    location_core: extractLocationCore(blocks),
  }
}

async function loadLinkedMapPreview(linkedMapId: string | null) {
  if (!linkedMapId) return null

  const mapJson = await dxFetch(`/items/maps/${linkedMapId}?fields=*`)
  const map = mapJson?.data
  if (!map) return null

  let imageUrl: string | null = null
  if (map.image) {
    imageUrl = `/api/assets/${String(map.image)}`
  } else if (map.image_file) {
    imageUrl = `/api/assets/${String(map.image_file)}`
  }

  return {
    id: String(map.id),
    title: String(map.title || 'Untitled Map'),
    slug: map.slug ? String(map.slug) : null,
    imageUrl,
  }
}

function normalizeBoolean(value: any) {
  if (value === true) return true
  if (value === false) return false
  if (value === 1 || value === '1') return true
  if (value === 0 || value === '0') return false
  if (value == null) return true
  return Boolean(value)
}

async function resolvePin(item: any): Promise<ResolvedPinRecord> {
  const entityId = item?.entity_id ? Number(item.entity_id) : null
  const linkedMapId = item?.linked_map_id ? String(item.linked_map_id) : null

  const [entity, linkedMap] = await Promise.all([
    loadEntityPreview(entityId),
    loadLinkedMapPreview(linkedMapId),
  ])

  const pinTitle = item?.title ? String(item.title) : ''
  const pinSummary = item?.summary ? String(item.summary) : null
  const pinImageFileId = item?.image ? String(item.image) : null
  const pinImageUrl = pinImageFileId ? `/api/assets/${pinImageFileId}` : null
  const pinIcon = item?.icon ? String(item.icon) : null
  const inheritFromEntity = normalizeBoolean(item?.inherit_from_entity)

  const resolvedTitle = pinTitle || entity?.title || linkedMap?.title || 'Untitled Pin'
  const resolvedSummary = pinSummary || (inheritFromEntity ? entity?.summary || null : null)
  const resolvedImageUrl = pinImageUrl || (inheritFromEntity ? entity?.image_url || null : null)

  return {
    id: String(item?.id || ''),
    mapId: String(item?.map_id || ''),
    entityId,
    linkedMapId,
    title: pinTitle,
    x: Number(item?.x ?? 0),
    y: Number(item?.y ?? 0),
    color: item?.color ? String(item.color) : null,
    pinType: item?.pin_type ? String(item.pin_type) : null,
    icon: pinIcon,
    summary: pinSummary,
    imageFileId: pinImageFileId,
    imageUrl: pinImageUrl,
    inheritFromEntity,
    entity,
    linkedMap,
    resolvedTitle,
    resolvedSummary,
    resolvedImageUrl,
    hasLinkedEntity: !!entity,
    hasLinkedMap: !!linkedMap,
  }
}

export async function listPinsForMap(mapId: string): Promise<ResolvedPinRecord[]> {
  const params = new URLSearchParams()
  params.set('filter[map_id][_eq]', mapId)
  params.append('fields[]', 'id')
  params.append('fields[]', 'map_id')
  params.append('fields[]', 'entity_id')
  params.append('fields[]', 'linked_map_id')
  params.append('fields[]', 'title')
  params.append('fields[]', 'x')
  params.append('fields[]', 'y')
  params.append('fields[]', 'color')
  params.append('fields[]', 'pin_type')
  params.append('fields[]', 'icon')
  params.append('fields[]', 'summary')
  params.append('fields[]', 'image')
  params.append('fields[]', 'inherit_from_entity')
  params.set('sort', 'sort')
  params.set('limit', '500')

  const json = await dxFetch(`/items/map_pins?${params.toString()}`)
  const items = Array.isArray(json?.data) ? json.data : []

  return await Promise.all(items.map(resolvePin))
}

export async function createPin(data: {
  mapId: string
  title: string
  x: number
  y: number
  color?: string | null
  pinType?: string | null
  icon?: string | null
  entityId?: number | null
  linkedMapId?: string | null
  summary?: string | null
  image?: string | null
  inheritFromEntity?: boolean
}) {
  const json = await dxFetch('/items/map_pins', {
    method: 'POST',
    body: JSON.stringify({
      map_id: data.mapId,
      title: data.title,
      x: data.x,
      y: data.y,
      color: data.color || null,
      pin_type: data.pinType || null,
      icon: data.icon || null,
      entity_id: data.entityId || null,
      linked_map_id: data.linkedMapId || null,
      summary: data.summary || null,
      image: data.image || null,
      inherit_from_entity: data.inheritFromEntity ?? true,
    })
  })

  return await resolvePin(json?.data)
}

export async function updatePin(pinId: string, data: Partial<{
  title: string
  x: number
  y: number
  color: string | null
  pinType: string | null
  icon: string | null
  entityId: number | null
  linkedMapId: string | null
  summary: string | null
  image: string | null
  inheritFromEntity: boolean
}>) {
  const body: any = {}

  if (data.title !== undefined) body.title = data.title
  if (data.x !== undefined) body.x = data.x
  if (data.y !== undefined) body.y = data.y
  if (data.color !== undefined) body.color = data.color
  if (data.pinType !== undefined) body.pin_type = data.pinType
  if (data.icon !== undefined) body.icon = data.icon
  if (data.entityId !== undefined) body.entity_id = data.entityId
  if (data.linkedMapId !== undefined) body.linked_map_id = data.linkedMapId
  if (data.summary !== undefined) body.summary = data.summary
  if (data.image !== undefined) body.image = data.image
  if (data.inheritFromEntity !== undefined) body.inherit_from_entity = data.inheritFromEntity

  const json = await dxFetch(`/items/map_pins/${pinId}`, {
    method: 'PATCH',
    body: JSON.stringify(body)
  })

  return await resolvePin(json?.data)
}

export async function deletePin(pinId: string): Promise<void> {
  await dxFetch(`/items/map_pins/${pinId}`, {
    method: 'DELETE'
  })
}
