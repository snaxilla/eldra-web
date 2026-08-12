// GET /api/worlds/:id/rules/summary
// See .github/docs/architecture/rules-package-infrastructure.md §5 (module
// map: this route reads server/utils/world-runtime-service.ts) and Q10
// ("How should Character Sheets discover the active package?" -- this is
// the first of that two-step flow's endpoints; the second, POST .../roll,
// is explicitly out of scope for this commit).
//
// Thin by design: parse the route param, call getWorldRuntime, hand the
// result to summarizeWorldRuntime for response shaping. All logic --
// including which fields are safe to expose -- lives in and is tested
// against server/utils/world-runtime-service.ts; this file performs no I/O
// of its own and makes no shaping decisions.

import { getWorldRuntime, summarizeWorldRuntime } from '../../../../utils/world-runtime-service'

export default defineEventHandler(async (event) => {
  const worldId = String(getRouterParam(event, 'id') || '')

  if (!worldId) {
    throw createError({ statusCode: 400, statusMessage: 'Missing world id' })
  }

  const result = await getWorldRuntime(worldId)
  return summarizeWorldRuntime(result)
})
