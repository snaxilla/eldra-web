import { deleteInventoryItemForSheet } from '../../../../../../../utils/character-sheet-inventory'

export default defineEventHandler(async (event) => {
  const params = event.context.params || {}

  return await deleteInventoryItemForSheet(
    String(params.id || ''),
    String(params.entityId || ''),
    String(params.inventoryId || '')
  )
})
