export type EldraVisibility = 'private' | 'world' | 'public'
export type EldraEntityStatus = 'draft' | 'published' | 'archived'

export type EldraWorld = {
  id: string
  name: string
  slug: string
  systemKey: string
  description?: string
  visibility: EldraVisibility
  ownerId?: string
}

export type EldraEntity = {
  id: string
  worldId: string
  systemKey: string
  entityType: string
  title: string
  slug: string
  status: EldraEntityStatus
  visibility: EldraVisibility
  summary?: string
  createdAt: string
  updatedAt: string
}

export type EldraEntityBlockInstance = {
  id: string
  entityId: string
  blockKey: string
  label: string
  sort: number
  repeatable: boolean
  data: Record<string, any> | null
}
