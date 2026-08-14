import { preview5eToolsFeats } from '../../../../../app/lib/importers'
import { persistImportedEntities } from '../../../../utils/import-save'
import { requireCapability } from '../../../../utils/authorization'

export default defineEventHandler(async (event) => {
  const body = await readBody(event)

  if (!body?.worldId) {
    throw createError({ statusCode: 400, statusMessage: 'worldId is required' })
  }

  const principal = event.context.principal ?? null
  if (!principal) {
    throw createError({ statusCode: 401, statusMessage: 'Authentication required' })
  }
  requireCapability(principal, 'world.content.bind_pack', { kind: 'world', worldId: String(body.worldId) })

  const preview = preview5eToolsFeats(body.payload)

  const result = await persistImportedEntities({
    worldId: body.worldId,
    mode: body.mode || 'create',
    items: preview.items
  })

  return {
    ...result,
    warnings: preview.warnings
  }
})
