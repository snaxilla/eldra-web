// GET /api/content/studio/search?worldId=&q=&category=&packageId=&image=&limit=&offset=
//
// Content Studio Browse (Phase 2). Read-only: it resolves the World's
// existing catalogue and filters it. It mints nothing, persists nothing,
// and creates no identity for the legacy content it lists.
//
// NO SECOND DATA PIPELINE: the rows come from getWorldContentCatalogue,
// the same projection the gameplay surfaces and the category pages read.
// Studio therefore cannot disagree with them about what a World has.
//
// TWO PERMISSIONS, BOTH REQUIRED. Studio is a platform authoring surface
// that reads one World's content, so the caller must hold the platform
// capability AND have access to that specific World. A platform content
// author is not thereby a member of every World (`can()` returns false
// for a World with no membership row -- Platform Admin is not a World
// superuser), and a World member is not thereby a content author.

import { defineEventHandler, getQuery } from 'h3'

import { parseStudioSearchQuery, runStudioSearch } from '../../../../app/components/admin/studio/studioSearchQuery'
import { requireCapability } from '../../../utils/authorization'
import { badRequest, requirePlatformCapability } from '../../../utils/content-workspace-http'
import { getWorldContentCatalogue } from '../../../utils/world-content-catalogue'

export default defineEventHandler(async (event) => {
  const principal = requirePlatformCapability(event, 'platform.contentworkspace.view')

  const query = getQuery(event) as Record<string, unknown>
  const worldId = typeof query.worldId === 'string' ? query.worldId.trim() : ''
  if (!worldId) badRequest(['worldId is required'])

  requireCapability(principal, 'world.read', { kind: 'world', worldId })

  const parsed = parseStudioSearchQuery(query)
  if (!parsed.ok) badRequest(parsed.problems)

  const catalogue = await getWorldContentCatalogue(worldId)

  // A pack that failed to load is surfaced rather than silently
  // narrowing the result set -- otherwise Studio would quietly show
  // fewer entries than the World actually binds.
  const unavailablePacks = catalogue.packs
    .filter((pack): pack is typeof pack & { ok: false } => pack.ok === false)
    .map((pack) => ({ packageId: pack.packageId, version: pack.version, reason: pack.failure.stage }))

  const result = runStudioSearch(catalogue, parsed.value)

  return {
    worldId,
    ...result,
    unavailablePacks,
    boundPackCount: catalogue.packs.length
  }
})
