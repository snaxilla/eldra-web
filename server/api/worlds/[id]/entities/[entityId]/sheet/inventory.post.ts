import { createInventoryItemForSheet } from '../../../../../../utils/character-sheet-inventory'

export default defineEventHandler(async (event) => {
  const params = event.context.params || {}
  const body = await readBody(event)

  return await createInventoryItemForSheet(
    String(params.id || ''),
    String(params.entityId || ''),
    body || {}
  )
})
