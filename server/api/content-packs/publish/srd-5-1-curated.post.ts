// POST /api/content-packs/publish/srd-5-1-curated
// { packageId, version, selection: { species/classes/backgrounds/feats/items/spells: string[] } }
//
// COMPATIBILITY WRAPPER as of Step 5 of
// .github/docs/architecture/content-source-architecture.md's
// Implementation Sequence (§12) -- this task's own KEEP section: "Keep
// publish/srd-5-1-curated.post.ts as a compatibility wrapper. It should
// resolve srd51Provider then delegate into the generic publish
// implementation." The Builder no longer calls this route (it posts
// { gameSystemKey: 'dnd5e', collectionKey: 'srd-5.1', ... } to the generic
// POST /api/content-packs/publish instead -- see
// AdminContentPackBuilderPanel.vue), but this route is not deleted: route
// retirement is Step 7, explicitly out of scope here, and any other caller
// (a bookmark, a script, a stale client build) still gets the exact same
// behavior it always did.
//
// DELEGATION: this route resolves a fixed provider (srd51Provider) and a
// fixed registry entry (getSourceCollection('dnd5e', 'srd-5.1')) and hands
// both to the SAME publishContentSourceSelection
// (server/utils/content-sources/publish.ts) the generic route calls --
// not a second implementation. There is no dataset access, no membership
// predicate, no category loop, and no manifest assembly left in this file
// at all.
//
// PACKAGE ID: deliberately NOT defaulted to `collection.suggestedPackageId`
// here, unlike the generic route -- this task's own IMPORTANT section:
// "Publishing behavior must remain identical." An empty `packageId` has
// always been rejected by validateContentPackForPublication through this
// route (a pinned test asserts it); introducing a default here would
// silently change that. See publish.ts's own header for why this decision
// belongs to each caller, not the shared function.
//
// TITLE / DESCRIPTION NOW COME FROM THE REGISTRY: this route used to
// hardcode `title: packageId || '(untitled)'` and a curated-specific
// description string. As of this step both are `collection.label` /
// `collection.description` -- the same values the generic route would
// produce for (dnd5e, srd-5.1) -- retiring that workaround per the
// architecture doc's §2.7. `license` is unchanged in value (the registry's
// SRD 5.1 license text is byte-identical to what this route used to
// hardcode).
//
// AUTHORIZATION: unchanged -- gated on `platform.contentpack.publish`,
// identical to every sibling content-pack route.

import { createError, defineEventHandler, readBody } from 'h3'

import { requireCapability } from '../../../utils/authorization'
import { getSourceCollection } from '../../../../app/lib/content-sources/registry'
import { srd51Provider } from '../../../utils/content-sources/dnd5e/srd-5-1'
import { publishContentSourceSelection } from '../../../utils/content-sources/publish'

const srd51Collection = getSourceCollection('dnd5e', 'srd-5.1')

export default defineEventHandler(async (event) => {
  const principal = event.context.principal ?? null
  if (!principal) {
    throw createError({ statusCode: 401, statusMessage: 'Authentication required' })
  }
  requireCapability(principal, 'platform.contentpack.publish', { kind: 'platform' })

  if (!srd51Collection) {
    // Should never happen -- srd-5.1 is registered in both the provider
    // registry and app/lib/content-sources/registry.ts by construction.
    // Guarded only so TypeScript can narrow the type below; a real 500
    // here would mean the two registries have drifted apart, a bug in the
    // codebase, not a caller error.
    throw createError({ statusCode: 500, statusMessage: 'SRD 5.1 is not registered in the Content Source registry' })
  }

  const body = await readBody(event)
  const packageId = typeof body?.packageId === 'string' ? body.packageId.trim() : ''
  const version = typeof body?.version === 'string' ? body.version.trim() : ''
  const selection = body?.selection && typeof body.selection === 'object' ? body.selection : {}

  const outcome = await publishContentSourceSelection({
    provider: srd51Provider,
    collection: srd51Collection,
    packageId,
    version,
    selection
  })

  if (!outcome.published) {
    if (outcome.stage === 'validation') {
      throw createError({
        statusCode: 422,
        statusMessage: 'Curated SRD 5.1 Content Pack failed publication validation',
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
