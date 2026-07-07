import { handleInventoryTransferAction } from '../../../../../../utils/character-sheet-inventory-transfers'

export default defineEventHandler(async (event) => {
  const params = event.context.params || {}
  const body = await readBody(event)

  return await handleInventoryTransferAction(
    String(params.id || ''),
    String(params.entityId || ''),
    body || {}
  )
})
