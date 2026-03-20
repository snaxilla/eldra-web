import { preview5eToolsFeats } from '../../../../../app/lib/importers'
import { persistImportedEntities } from '../../../../utils/import-save'

export default defineEventHandler(async (event) => {
  const body = await readBody(event)

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
