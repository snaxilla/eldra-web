import { devBlocks, devEntities, devWorlds } from './dev-data'
import type { EldraEntity, EldraEntityBlockInstance, EldraWorld } from './types'

export function getWorlds(): EldraWorld[] {
  return devWorlds
}

export function getWorldBySlug(slug: string): EldraWorld | null {
  return devWorlds.find((world) => world.slug === slug) || null
}

export function getWorldById(id: string): EldraWorld | null {
  return devWorlds.find((world) => world.id === id) || null
}

export function getEntities(): EldraEntity[] {
  return devEntities
}

export function getEntitiesForWorld(worldId: string): EldraEntity[] {
  return devEntities.filter((entity) => entity.worldId === worldId)
}

export function getEntityById(id: string): EldraEntity | null {
  return devEntities.find((entity) => entity.id === id) || null
}

export function getEntityByWorldAndSlug(worldId: string, slug: string): EldraEntity | null {
  return devEntities.find((entity) => entity.worldId === worldId && entity.slug === slug) || null
}

export function getBlocksForEntity(entityId: string): EldraEntityBlockInstance[] {
  return devBlocks
    .filter((block) => block.entityId === entityId)
    .sort((a, b) => a.sort - b.sort)
}
