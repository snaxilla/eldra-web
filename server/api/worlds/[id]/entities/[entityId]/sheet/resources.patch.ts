import { dxFetch } from '../../../../../../utils/entity-factory'
import { requireCapability } from '../../../../../../utils/authorization'

function asObject(value: any) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {}
}

function safeNumber(value: any) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? Math.max(0, Math.floor(parsed)) : 0
}

function normalizeLimitedResourceUses(value: any) {
  const out: Record<string, number> = {}

  for (const [key, rawValue] of Object.entries(asObject(value))) {
    const normalizedKey = String(key || '').trim()
    if (!normalizedKey) continue

    out[normalizedKey] = safeNumber(rawValue)
  }

  return out
}

function mergeResources(existing: any, patch: any, resetLimitedResourceUses = false) {
  const existingResources = asObject(existing)
  const patchResources = asObject(patch)
  const patchLimitedUses = normalizeLimitedResourceUses(
    patchResources.limitedResourceUses ?? patchResources.limited_resource_uses
  )

  return {
    ...existingResources,
    ...patchResources,
    limitedResourceUses: resetLimitedResourceUses
      ? patchLimitedUses
      : {
          ...normalizeLimitedResourceUses(existingResources.limitedResourceUses ?? existingResources.limited_resource_uses),
          ...patchLimitedUses
        }
  }
}

async function findActiveSheet(worldId: string, entityId: string) {
  const params = new URLSearchParams()
  params.set('filter[world_id][_eq]', String(worldId))
  params.set('filter[entity_id][_eq]', String(entityId))
  params.set('filter[is_active][_eq]', 'true')
  params.set('fields', 'id,resources')
  params.set('limit', '1')

  const res = await dxFetch(`/items/character_sheets?${params.toString()}`)
  return Array.isArray(res?.data) ? res.data[0] : null
}

export default defineEventHandler(async (event) => {
  const worldId = String(getRouterParam(event, 'id') || '')
  const entityId = String(getRouterParam(event, 'entityId') || '')
  const body = await readBody(event)

  if (!worldId || !entityId) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Missing world or entity id'
    })
  }

  const principal = event.context.principal ?? null
  if (!principal) {
    throw createError({ statusCode: 401, statusMessage: 'Authentication required' })
  }
  requireCapability(principal, 'world.character.edit_any', { kind: 'world', worldId })

  const sheet = await findActiveSheet(worldId, entityId)

  if (!sheet?.id) {
    throw createError({
      statusCode: 404,
      statusMessage: 'Active character sheet not found'
    })
  }

  const resetLimitedResourceUses = body?.resetLimitedResourceUses === true ||
    body?.resources?.resetLimitedResourceUses === true

  const resources = mergeResources(sheet.resources, body?.resources, resetLimitedResourceUses)

  const patched = await dxFetch(`/items/character_sheets/${sheet.id}`, {
    method: 'PATCH',
    body: JSON.stringify({
      resources
    })
  })

  return {
    success: true,
    sheetId: sheet.id,
    resources: patched?.data?.resources || resources
  }
})
