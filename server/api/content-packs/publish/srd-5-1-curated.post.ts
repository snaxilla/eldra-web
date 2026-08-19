// POST /api/content-packs/publish/srd-5-1-curated
// { packageId, version, selection: { species/classes/backgrounds/feats/items/spells: string[] } }
//
// Curated Content Pack Publishing -- completes the workflow started by
// GET /api/content-packs/preview/srd-5-1: Import -> Preview -> Curate ->
// Publish. Where publish/srd-5-1.post.ts is the ONE hardcoded "publish
// everything SRD 5.1 has, under fixed identity 'eldra.content.srd-5.1'"
// milestone action (left untouched -- this task's own instruction is to
// implement Curated Publishing, not redesign that route), this route lets
// a GM publish a Content Pack containing ONLY the entries they selected in
// the Preview UI (AdminContentPackBuilderPanel.vue), under a
// GM-supplied packageId/version.
//
// PROVIDER: dataset access, the SRD 5.1 membership predicate, category
// loading, importer wiring, and adapter invocation all live behind
// `srd51Provider` (server/utils/content-sources/dnd5e/srd-5-1.ts) as of
// Step 2 of .github/docs/architecture/content-source-architecture.md's
// Implementation Sequence (§12) -- this route no longer touches the
// dataset directly. It regenerates the SAME full candidate list
// preview/srd-5-1.get.ts would (same provider, hence same importers, same
// SRD filter, same adapter). The only new step this route adds is
// filtering each category's regenerated candidates down to the
// externalIds the client says were selected, BEFORE calling
// publishContentPack -- the selection is the caller's INTENT, never their
// DATA: `title`/`sourceBook`/`data` are always re-derived from the
// provider here, never trusted from the request body, so a tampered
// client payload can at most publish a different SUBSET of the real
// dataset, never fabricated content.
//
// PACKAGE NAME: the Builder UI collects one identity field, "Package
// Name" -- there is no separate title/description input (this task's own
// UI section lists only "Package Name, Version, Publish"). That single
// value is used as both `packageId` (validateContentPackForPublication's
// existing reverse-DNS-shaped identifier check governs whether it is
// well-formed -- no new validation invented here) and `title` (a plain,
// defensible reuse given no separate field exists). `license`/`description`
// /`origin` are fixed to the same SRD 5.1 / OGL-1.0a metadata
// publish/srd-5-1.post.ts already hardcodes, since Phase 1's only Import
// Source is, and remains, "5etools SRD 5.1" -- not re-collected from the
// GM because nothing in this phase varies it.
//
// VALIDATION: "no entries selected" / "package name empty" / "version
// empty" are NOT re-checked here -- they fall straight through to
// validateContentPackForPublication (via publishContentPack), which
// already rejects all three (empty-content / invalid-package-id /
// invalid-version). Continuing to use that existing validator, not a
// second one, is this task's own explicit instruction.
//
// NOT BINDING: this route only publishes. Binding a World to the resulting
// pack is the caller's separate next step via the existing
// POST /api/worlds/:id/content-packs (world-content-pack-binding.ts) --
// unchanged, untouched, and never invoked from here.

import { createError, defineEventHandler, readBody } from 'h3'

import { requireCapability } from '../../../utils/authorization'
import { srd51Provider } from '../../../utils/content-sources/dnd5e/srd-5-1'
import { publishContentPack, type ContentPublicationCandidate } from '../../../utils/content-pack-publishing'

function readSelectionFor(body: any, categoryKey: string): Set<string> {
  const raw = body?.selection?.[categoryKey]
  if (!Array.isArray(raw)) return new Set()
  return new Set(raw.filter((value): value is string => typeof value === 'string'))
}

export default defineEventHandler(async (event) => {
  const principal = event.context.principal ?? null
  if (!principal) {
    throw createError({ statusCode: 401, statusMessage: 'Authentication required' })
  }
  requireCapability(principal, 'platform.contentpack.publish', { kind: 'platform' })

  const body = await readBody(event)
  const packageId = typeof body?.packageId === 'string' ? body.packageId.trim() : ''
  const version = typeof body?.version === 'string' ? body.version.trim() : ''

  const candidates: ContentPublicationCandidate[] = []
  const warnings: string[] = []
  const counts: Record<string, number> = {}
  for (const category of srd51Provider.categories) {
    counts[category.key] = 0
  }

  for (const category of srd51Provider.categories) {
    const selectedIds = readSelectionFor(body, category.key)
    if (selectedIds.size === 0) continue

    try {
      const { candidates: categoryCandidates, warnings: categoryWarnings } = await srd51Provider.loadCategory(category.key)
      warnings.push(...categoryWarnings.map((message) => `[${category.label}] ${message}`))

      const selected = categoryCandidates.filter((candidate) => selectedIds.has(candidate.externalId))
      counts[category.key] = selected.length
      candidates.push(...selected)
    } catch (error: any) {
      // One category's regeneration failing never fails the whole publish
      // -- mirrors preview/srd-5-1.get.ts's own per-category isolation.
      warnings.push(`[${category.label}] Failed to regenerate selected entries: ${error?.message || 'unknown error'}`)
    }
  }

  const result = await publishContentPack({
    packageId,
    version,
    title: packageId || '(untitled)',
    description: 'Curated selection of System Reference Document 5.1 content, chosen by a Game Master from the 5etools SRD 5.1 import.',
    license: {
      id: 'OGL-1.0a',
      notice: 'This Content Pack includes material from the System Reference Document 5.1 ("SRD 5.1"), licensed under the Open Game License Version 1.0a. Portions of the Materials used are property of Wizards of the Coast LLC and are used with permission under the OGL 1.0a.',
      attribution: 'System Reference Document 5.1. Copyright Wizards of the Coast LLC.'
    },
    origin: {
      kind: 'translated',
      adapterId: srd51Provider.adapterId,
      sourceId: srd51Provider.collectionKey
    },
    candidates,
    warnings
  })

  if (!result.published) {
    if (result.stage === 'validation') {
      throw createError({
        statusCode: 422,
        statusMessage: 'Curated SRD 5.1 Content Pack failed publication validation',
        data: { issues: result.issues }
      })
    }

    throw createError({
      statusCode: 409,
      statusMessage: `Content Pack ${result.packageId}@${result.version} already exists (status: ${result.status})`
    })
  }

  return {
    published: true,
    packageId: result.package.packageId,
    version: result.package.version,
    integrityHash: result.package.integrityHash,
    counts,
    issues: result.issues
  }
})
