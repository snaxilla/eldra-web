// PATCH /api/worlds/:id/rules/config  { settings?, rollTypes? }
// See .github/docs/architecture/world-configuration.md §3.1/§D.5/§E for the
// two fields a World may write onto its own configuration.
//
// Thin by design: parse/validate the request, call updateWorldRulesConfig,
// translate its result into an HTTP response. Only `settings`/`rollTypes`
// are ever read off the request body -- anything else the caller sends
// (e.g. an attempt to change the active package) is ignored, never
// forwarded. All update logic lives in and is tested against
// server/utils/world-rules-activation.ts.

import { updateWorldRulesConfig } from '../../../../utils/world-rules-activation'
import { requireCapability } from '../../../../utils/authorization'

function plainObjectOrUndefined(value: unknown): Record<string, any> | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, any>) : undefined
}

export default defineEventHandler(async (event) => {
  const worldId = String(getRouterParam(event, 'id') || '')

  if (!worldId) {
    throw createError({ statusCode: 400, statusMessage: 'Missing world id' })
  }

  const principal = event.context.principal ?? null
  if (!principal) {
    throw createError({ statusCode: 401, statusMessage: 'Authentication required' })
  }
  requireCapability(principal, 'world.rules.configure', { kind: 'world', worldId })

  const body = await readBody(event)
  const settings = plainObjectOrUndefined(body?.settings)
  const rollTypes = plainObjectOrUndefined(body?.rollTypes)

  const result = await updateWorldRulesConfig(worldId, { settings, rollTypes })

  if (!result.updated) {
    throw createError({
      statusCode: 409,
      statusMessage: 'This World has no active Rules Package configuration yet -- activate one before updating settings or roll types'
    })
  }

  return { updated: true, ...result.summary }
})
