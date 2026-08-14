// POST /api/worlds/:id/rules/activate  { packageId, version }
// See .github/docs/architecture/rules-package-infrastructure.md Q6.
//
// Thin by design: parse/validate the request, call
// activateWorldRulesPackage, translate its result into an HTTP response.
// All activation logic lives in and is tested against
// server/utils/world-rules-activation.ts -- this file makes no
// verification or persistence decisions of its own.

import { activateWorldRulesPackage } from '../../../../utils/world-rules-activation'
import type { PublishedPackageLoadFailure } from '../../../../utils/rules-packages'
import { requireCapability } from '../../../../utils/authorization'

function statusForPackageLoadFailure(failure: PublishedPackageLoadFailure): { statusCode: number; statusMessage: string } {
  switch (failure.stage) {
    case 'not-found':
      return { statusCode: 404, statusMessage: `Rules package '${failure.packageId}@${failure.version}' was not found` }
    case 'not-published':
      return { statusCode: 409, statusMessage: `Rules package is not published (status: '${failure.status}')` }
    case 'engine-incompatible':
      return {
        statusCode: 409,
        statusMessage: `Rules package requires engineApiVersion '${failure.declaredRange}', which this engine (${failure.engineVersion}) does not satisfy`
      }
    case 'integrity-mismatch':
      return { statusCode: 409, statusMessage: 'Rules package integrity check failed -- stored content does not match its recorded hash' }
    case 'deserialize':
      return { statusCode: 500, statusMessage: `Rules package '${failure.field}' could not be read: ${failure.error}` }
    default: {
      const exhaustive: never = failure
      return exhaustive
    }
  }
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
  requireCapability(principal, 'world.rules.activate', { kind: 'world', worldId })

  const body = await readBody(event)
  const packageId = typeof body?.packageId === 'string' ? body.packageId.trim() : ''
  const version = typeof body?.version === 'string' ? body.version.trim() : ''

  if (!packageId || !version) {
    throw createError({ statusCode: 400, statusMessage: 'packageId and version are required' })
  }

  const result = await activateWorldRulesPackage(worldId, packageId, version)

  if (!result.activated) {
    throw createError(statusForPackageLoadFailure(result.failure))
  }

  return { activated: true, ...result.summary }
})
