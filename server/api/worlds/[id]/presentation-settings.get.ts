// GET /api/worlds/:id/presentation-settings
// The World's GM-selected theme (Theming Architecture, Phase 2 -- see
// .github/docs/architecture/theming.md). Readable by every World member:
// players inherit the GM's theme. Logic lives in
// server/utils/world-presentation-settings.ts.

import { requireCapability } from '../../../utils/authorization'
import { loadWorldPresentationSettings } from '../../../utils/world-presentation-settings'

export default defineEventHandler(async (event) => {
  const worldId = String(getRouterParam(event, 'id') || '')

  if (!worldId) {
    throw createError({ statusCode: 400, statusMessage: 'Missing world id' })
  }

  const principal = event.context.principal ?? null
  if (!principal) {
    throw createError({ statusCode: 401, statusMessage: 'Authentication required' })
  }
  requireCapability(principal, 'world.read', { kind: 'world', worldId })

  return await loadWorldPresentationSettings(worldId)
})
