import {
  createInventoryItemForSheet,
  loadActiveCharacterSheet,
  loadInventoryRows,
  updateInventoryItemForSheet
} from '../../../../utils/character-sheet-inventory'

function clean(value: any) {
  return String(value ?? '').trim()
}

function positiveInt(value: any, fallback = 1) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed < 1) return fallback
  return Math.floor(parsed)
}

function normalizeCurrency(value: any) {
  const key = clean(value).toLowerCase()

  if (['gold', 'gp', 'g'].includes(key)) return 'Gold'
  if (['silver', 'sp', 's'].includes(key)) return 'Silver'
  if (['copper', 'cp', 'c'].includes(key)) return 'Copper'

  return ''
}

function currencyRowName(currency: string) {
  return `Currency: ${currency}`
}

function isCurrencyRow(row: any, currency: string) {
  return clean(row?.name).toLowerCase() === currencyRowName(currency).toLowerCase()
}

export default defineEventHandler(async (event) => {
  const worldId = String(getRouterParam(event, 'id') || '')
  const body = await readBody(event)
  const targetEntityId = clean(body?.targetEntityId || body?.target_entity_id)
  const action = clean(body?.action || body?.type).toLowerCase()

  if (!worldId || !targetEntityId) {
    throw createError({
      statusCode: 400,
      statusMessage: 'World id and target entity id are required'
    })
  }

  if (action === 'currency' || body?.currency || body?.currencyType) {
    const currency = normalizeCurrency(body?.currency || body?.currencyType)
    const amount = positiveInt(body?.amount || body?.quantity, 1)

    if (!currency) {
      throw createError({
        statusCode: 400,
        statusMessage: 'Currency must be Gold, Silver, or Copper'
      })
    }

    const sheet = await loadActiveCharacterSheet(worldId, targetEntityId)
    const rows = await loadInventoryRows(sheet.id)
    const existing = rows.find((row: any) => isCurrencyRow(row, currency))

    if (existing?.id) {
      const current = positiveInt(existing.quantity, 0)
      const result = await updateInventoryItemForSheet(
        worldId,
        targetEntityId,
        String(existing.id),
        {
          name: currencyRowName(currency),
          quantity: current + amount,
          notes: clean(body?.notes || existing.notes || 'Granted by Game Admin')
        }
      )

      return {
        granted: true,
        grantType: 'currency',
        currency,
        amount,
        targetEntityId,
        item: result.item,
        inventory: result.inventory
      }
    }

    const result = await createInventoryItemForSheet(worldId, targetEntityId, {
      name: currencyRowName(currency),
      quantity: amount,
      notes: clean(body?.notes || 'Granted by Game Admin')
    })

    return {
      granted: true,
      grantType: 'currency',
      currency,
      amount,
      targetEntityId,
      item: result.item,
      inventory: result.inventory
    }
  }

  const itemEntityId = clean(body?.itemEntityId || body?.item_entity_id)
  const itemName = clean(body?.name || body?.itemName)
  const quantity = positiveInt(body?.quantity, 1)

  if (!itemEntityId && !itemName) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Grant item requires an imported item or custom item name'
    })
  }

  const result = await createInventoryItemForSheet(worldId, targetEntityId, {
    itemEntityId: itemEntityId || null,
    name: itemName || null,
    quantity,
    notes: clean(body?.notes || 'Granted by Game Admin')
  })

  return {
    granted: true,
    grantType: 'item',
    targetEntityId,
    itemEntityId,
    name: itemName,
    quantity,
    item: result.item,
    inventory: result.inventory
  }
})
