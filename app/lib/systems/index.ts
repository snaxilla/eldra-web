import type {
  EldraSchemaBlock,
  EldraSchemaRegistrySummary,
  EldraSystemSchema
} from './types'
import { dnd5eSystem } from './dnd5e'

const systems: Record<string, EldraSystemSchema> = {
  [dnd5eSystem.key]: dnd5eSystem
}

export function getAllSystems(): EldraSystemSchema[] {
  return Object.values(systems)
}

export function getSystemByKey(key: string): EldraSystemSchema | null {
  return systems[key] || null
}

export function getSystemSummary(key: string): EldraSchemaRegistrySummary | null {
  const system = getSystemByKey(key)
  if (!system) {
    return null
  }

  return {
    key: system.key,
    label: system.label,
    version: system.version,
    description: system.description,
    importerSupport: system.importerSupport || [],
    entityTypes: system.entityTypes.map((entity) => ({
      entityType: entity.entityType,
      label: entity.label,
      blockCount: entity.blocks.length
    })),
    sharedBlockCount: system.sharedBlocks.length
  }
}

export function getAllSystemSummaries(): EldraSchemaRegistrySummary[] {
  return getAllSystems()
    .map((system) => getSystemSummary(system.key))
    .filter(Boolean) as EldraSchemaRegistrySummary[]
}

export function getBlockByKey(systemKey: string, blockKey: string): EldraSchemaBlock | null {
  const system = getSystemByKey(systemKey)
  if (!system) {
    return null
  }

  return system.sharedBlocks.find((block) => block.key === blockKey) || null
}

export function getBlocksForEntity(systemKey: string, entityType: string): EldraSchemaBlock[] {
  const system = getSystemByKey(systemKey)
  if (!system) {
    return []
  }

  const entity = system.entityTypes.find((item) => item.entityType === entityType)
  if (!entity) {
    return []
  }

  return entity.blocks
    .map((blockKey) => getBlockByKey(systemKey, blockKey))
    .filter(Boolean) as EldraSchemaBlock[]
}

export function buildDefaultBlockData(systemKey: string, blockKey: string) {
  const block = getBlockByKey(systemKey, blockKey)
  if (!block) {
    return null
  }

  return Object.fromEntries(
    block.fields.map((field) => [field.key, field.default ?? null])
  )
}

export function buildDefaultEntityData(systemKey: string, entityType: string) {
  const blocks = getBlocksForEntity(systemKey, entityType)

  return blocks.map((block, index) => ({
    blockKey: block.key,
    label: block.label,
    repeatable: !!block.repeatable,
    sort: index + 1,
    data: buildDefaultBlockData(systemKey, block.key)
  }))
}
