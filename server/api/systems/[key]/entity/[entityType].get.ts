import { buildDefaultEntityData, getBlocksForEntity, getSystemByKey } from '../../../../../app/lib/systems'

export default defineEventHandler(async (event) => {
  const key = getRouterParam(event, 'key') || ''
  const entityType = getRouterParam(event, 'entityType') || ''

  const system = getSystemByKey(key)
  if (!system) {
    throw createError({
      statusCode: 404,
      statusMessage: 'System schema not found'
    })
  }

  const entity = system.entityTypes.find((item) => item.entityType === entityType)
  if (!entity) {
    throw createError({
      statusCode: 404,
      statusMessage: 'Entity schema not found'
    })
  }

  return {
    system: {
      key: system.key,
      label: system.label,
      version: system.version
    },
    entity: {
      entityType: entity.entityType,
      label: entity.label,
      description: entity.description
    },
    blocks: getBlocksForEntity(key, entityType),
    defaults: buildDefaultEntityData(key, entityType)
  }
})
