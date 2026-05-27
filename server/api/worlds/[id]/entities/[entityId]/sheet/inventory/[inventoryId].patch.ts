import { updateInventoryItemForSheet } from '../../../../../../../utils/character-sheet-inventory'

export default defineEventHandler(async (event) => {
  const params = event.context.params || {}
  const body = await readBody(event)

  return await updateInventoryItemForSheet(
    String(params.id || ''),
    String(params.entityId || ''),
    String(params.inventoryId || ''),
    body || {}
  )
})
