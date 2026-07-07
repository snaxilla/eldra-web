import {
  loadActiveCharacterSheet,
  loadInventoryRows
} from '../../../../../../utils/character-sheet-inventory'

export default defineEventHandler(async (event) => {
  const params = event.context.params || {}
  const worldId = String(params.id || '')
  const entityId = String(params.entityId || '')
  const sheet = await loadActiveCharacterSheet(worldId, entityId)

  return {
    sheetId: sheet.id,
    inventory: await loadInventoryRows(sheet.id)
  }
})
