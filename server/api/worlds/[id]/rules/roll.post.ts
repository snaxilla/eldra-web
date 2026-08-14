// POST /api/worlds/:id/rules/roll  { rollType, actorId?, context? }
// See .github/docs/architecture/rules-package-infrastructure.md Q10 and
// this commit's own OBJECTIVE: "the one supported way for browser clients
// to execute Rules rolls."
//
// Thin by design, matching every other route in this milestone: all
// orchestration lives in and is tested against
// server/utils/world-rules-roll.ts (requestWorldRoll) -- this file only
// parses/validates the request, translates a pre-flight rejection into an
// HTTP status, and otherwise returns the RollEvent verbatim (OUTPUT: "Do
// not reshape. Do not recompute totals. Do not decorate.").
//
// `statusForPackageLoadFailure` duplicates activate.post.ts's own
// same-named helper rather than importing across route files (this
// codebase's established convention is routes importing from server/utils,
// never from a sibling route) -- it is HTTP status-mapping glue over an
// already-defined, already-stable failure vocabulary (PublishedPackageLoadFailure),
// not Rules Engine logic, so the small duplication costs less than the
// cross-route coupling importing it would add.

import { requestWorldRoll, type WorldRollRequestFailure } from '../../../../utils/world-rules-roll'
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

function statusForRollFailure(failure: WorldRollRequestFailure): { statusCode: number; statusMessage: string } {
  switch (failure.stage) {
    case 'unconfigured':
      return { statusCode: 409, statusMessage: 'This World has no active Rules Package -- activate one before rolling' }
    case 'unknown-roll-type':
      return { statusCode: 400, statusMessage: `'${failure.rollType}' is not a roll type this World currently surfaces` }
    case 'package-load':
      return statusForPackageLoadFailure(failure.failure)
    case 'runtime-construction':
      return { statusCode: 500, statusMessage: "This World's Rules runtime could not be built -- see GET .../rules/summary for details" }
    default: {
      const exhaustive: never = failure
      return exhaustive
    }
  }
}

function sanitizeTags(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined
  const tags = value.filter((tag): tag is string => typeof tag === 'string')
  return tags.length ? tags : undefined
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
  requireCapability(principal, 'world.roll.execute', { kind: 'world', worldId })

  const body = await readBody(event)
  const rollType = typeof body?.rollType === 'string' ? body.rollType.trim() : ''
  if (!rollType) {
    throw createError({ statusCode: 400, statusMessage: 'rollType is required' })
  }

  const actorId = typeof body?.actorId === 'string' ? body.actorId : null

  // Only purpose/tags are ever read off the request body -- seed and
  // world are always server-controlled (world-rules-roll.ts design
  // decision 2); nothing else the caller sends is forwarded.
  const context =
    body?.context && typeof body.context === 'object'
      ? {
          purpose: typeof body.context.purpose === 'string' ? body.context.purpose : undefined,
          tags: sanitizeTags(body.context.tags)
        }
      : undefined

  const result = await requestWorldRoll(worldId, { rollType, actorId, context })

  if (!result.ok) {
    throw createError(statusForRollFailure(result.failure))
  }

  return result.event
})
