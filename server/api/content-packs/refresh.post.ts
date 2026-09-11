// POST /api/content-packs/refresh
// { gameSystemKey, collectionKey, packageId? }
//
// Developer Workflow: Refresh Content Package. See
// server/utils/content-sources/refresh.ts's own header for what this does
// and why it is not republish.
//
// RESOLUTION mirrors publish.post.ts's own RESOLUTION step exactly -- same
// two lookups (getProvider, getSourceCollection), same 404-before-I/O
// posture, same packageId defaulting rule (an omitted/blank packageId
// defaults to collection.suggestedPackageId). This route adds no new
// resolution logic of its own, only a different orchestrator call
// (refreshContentSource instead of publishContentSourceSelection).
//
// AUTHORIZATION: gated on `platform.contentpack.publish` -- identical to
// every other route in this workflow. Refresh still ends in an actual
// publish, so it carries the same privilege as Publish, never a lesser one.

import { createError, defineEventHandler, readBody } from 'h3'

import { requireCapability } from '../../utils/authorization'
import { getGameSystem, getSourceCollection } from '../../../app/lib/content-sources/registry'
import { getProvider } from '../../utils/content-sources'
import { refreshContentSource } from '../../utils/content-sources/refresh'

export default defineEventHandler(async (event) => {
  const principal = event.context.principal ?? null
  if (!principal) {
    throw createError({ statusCode: 401, statusMessage: 'Authentication required' })
  }
  requireCapability(principal, 'platform.contentpack.publish', { kind: 'platform' })

  const body = await readBody(event)
  const gameSystemKey = typeof body?.gameSystemKey === 'string' ? body.gameSystemKey.trim() : ''
  const collectionKey = typeof body?.collectionKey === 'string' ? body.collectionKey.trim() : ''

  const provider = getProvider(gameSystemKey, collectionKey)
  const collection = getSourceCollection(gameSystemKey, collectionKey)
  if (!provider || !collection || !getGameSystem(gameSystemKey)) {
    throw createError({ statusCode: 404, statusMessage: 'Unknown content source' })
  }

  const submittedPackageId = typeof body?.packageId === 'string' ? body.packageId.trim() : ''
  const packageId = submittedPackageId || collection.suggestedPackageId

  const outcome = await refreshContentSource({ provider, collection, packageId })

  if (!outcome.refreshed) {
    if (outcome.stage === 'not-found') {
      throw createError({
        statusCode: 404,
        statusMessage: `No published version of '${outcome.packageId}' exists yet -- publish it once before refreshing`
      })
    }

    if (outcome.stage === 'load-failed') {
      throw createError({
        statusCode: 502,
        statusMessage: `Failed to load the previously published '${outcome.packageId}@${outcome.version}' to refresh from`,
        data: { reason: outcome.reason }
      })
    }

    if (outcome.stage === 'validation') {
      throw createError({
        statusCode: 422,
        statusMessage: 'Content Pack failed publication validation',
        data: { issues: outcome.issues }
      })
    }

    throw createError({
      statusCode: 409,
      statusMessage: `Content Pack ${outcome.packageId}@${outcome.version} already exists (status: ${outcome.status})`
    })
  }

  return outcome
})
