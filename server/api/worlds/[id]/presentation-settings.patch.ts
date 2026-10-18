// PATCH /api/worlds/:id/presentation-settings  { themeKey?, themeOptions? }
// GM theme selection (Theming Architecture, Phase 2 -- see
// .github/docs/architecture/theming.md). Gated by the same
// `world.settings.edit` capability as per-page presentation
// (presentation/[pageKey].post.ts). Logic lives in
// server/utils/world-presentation-settings.ts.

import { requireCapability } from '../../../utils/authorization'
import {
  parseWorldPresentationSettingsPatch,
  saveWorldPresentationSettings
} from '../../../utils/world-presentation-settings'

export default defineEventHandler(async (event) => {
  const worldId = String(getRouterParam(event, 'id') || '')

  if (!worldId) {
    throw createError({ statusCode: 400, statusMessage: 'Missing world id' })
  }

  const principal = event.context.principal ?? null
  if (!principal) {
    throw createError({ statusCode: 401, statusMessage: 'Authentication required' })
  }
  requireCapability(principal, 'world.settings.edit', { kind: 'world', worldId })

  const patch = parseWorldPresentationSettingsPatch(await readBody(event))
  return await saveWorldPresentationSettings(worldId, patch)
})
