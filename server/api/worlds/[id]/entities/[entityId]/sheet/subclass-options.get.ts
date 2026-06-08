import { loadSubclassOptionsForSheet } from '../../../../../../utils/character-sheet-subclasses'

export default defineEventHandler(async (event) => {
  const params = event.context.params || {}

  return await loadSubclassOptionsForSheet(
    String(params.id || ''),
    String(params.entityId || '')
  )
})
