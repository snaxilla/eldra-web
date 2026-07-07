import {
  listInventoryTransfersForSheet,
  listTransferTargets
} from '../../../../../../utils/character-sheet-inventory-transfers'

export default defineEventHandler(async (event) => {
  const params = event.context.params || {}
  const query = getQuery(event)

  const worldId = String(params.id || '')
  const entityId = String(params.entityId || '')

  if (String(query.targets || '') === '1') {
    return await listTransferTargets(worldId, entityId)
  }

  return await listInventoryTransfersForSheet(worldId, entityId)
})
