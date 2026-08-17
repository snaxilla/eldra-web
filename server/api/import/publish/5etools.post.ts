// POST /api/import/publish/5etools
// Publishes 5etools-imported content as a versioned, global Content Pack --
// the "publication target" the importer now points at, alongside (not
// instead of) the existing per-World save routes
// (server/api/import/save/5etools/*.post.ts, unchanged). Does NOT bind the
// resulting pack to any World -- see server/api/worlds/[id]/content-packs
// for that, a deliberately separate step.
//
// Reuses the SAME parsers the preview/save routes already call
// (preview5eToolsItems/Spells/Classes/Species/Backgrounds/Feats) --
// unmodified. Monsters are not supported here; preview5eToolsMonsters
// returns a structurally different shape with its own persistence
// pipeline (import-save-monsters.ts) and was never migrated onto the
// shared EldraImportPreviewEntity contract the other six importers share.
//
// This route is the seam boundary: it is the ONE place that knows both
// "there is a 5etools importer" AND "there is a Content Pack Publisher" --
// it calls the importer, adapts the result via
// content-pack-5etools-adapter.ts (NEVER hands EldraImportPreviewResult to
// the publisher directly), and only then calls
// content-pack-publishing.ts's publishContentPack, which knows nothing
// about 5etools, previews, or World-entity blocks.
//
// Thin otherwise: all pipeline logic (validate -> manifest -> canonicalize
// -> integrity -> publish) lives in and is tested against
// server/utils/content-pack-publishing.ts.

import {
  preview5eToolsBackgrounds,
  preview5eToolsClasses,
  preview5eToolsFeats,
  preview5eToolsItems,
  preview5eToolsSpecies,
  preview5eToolsSpells
} from '../../../../app/lib/importers'
import type { EldraImportPreviewResult } from '../../../../app/lib/importers/types'
import { toContentPublicationCandidates } from '../../../utils/content-pack-5etools-adapter'
import { publishContentPack, type ContentPublicationCandidate } from '../../../utils/content-pack-publishing'
import type { ContentPackLicense } from '../../../utils/content-packs'
import { requireCapability } from '../../../utils/authorization'

// Keyed by request body field name -- every one of these already exists,
// unmodified, and already returns EldraImportPreviewResult. This route,
// not the publisher, is where "which importer types make up this pack" is
// decided -- content-pack-publishing.ts only ever sees the merged result.
const SOURCE_PARSERS: Record<string, (payload: any) => EldraImportPreviewResult> = {
  items: preview5eToolsItems,
  spells: preview5eToolsSpells,
  classes: preview5eToolsClasses,
  species: preview5eToolsSpecies,
  backgrounds: preview5eToolsBackgrounds,
  feats: preview5eToolsFeats
}

function parsePayload(value: unknown, field: string): any {
  if (typeof value !== 'string') {
    return value
  }

  try {
    return JSON.parse(value)
  } catch {
    throw createError({ statusCode: 400, statusMessage: `${field} payload is not valid JSON` })
  }
}

export default defineEventHandler(async (event) => {
  const principal = event.context.principal ?? null
  if (!principal) {
    throw createError({ statusCode: 401, statusMessage: 'Authentication required' })
  }
  // Platform-scoped, not World-scoped -- ownership-and-permissions.md
  // (Revision 2) §7.5: "installing a pack is a Platform action; binding
  // one to a world is a World action." Publishing is the installation
  // half; binding (world.content.bind_pack) is separate and unaffected.
  requireCapability(principal, 'platform.contentpack.publish', { kind: 'platform' })

  const body = await readBody(event)

  const packageId = typeof body?.packageId === 'string' ? body.packageId.trim() : ''
  const version = typeof body?.version === 'string' ? body.version.trim() : ''
  const title = typeof body?.title === 'string' ? body.title.trim() : ''
  const description = typeof body?.description === 'string' ? body.description : undefined
  const license: ContentPackLicense | null =
    body?.license && typeof body.license === 'object' ? body.license : null
  const contentSchemaVersion = typeof body?.contentSchemaVersion === 'number' ? body.contentSchemaVersion : undefined

  if (!packageId || !version || !title) {
    throw createError({ statusCode: 400, statusMessage: 'packageId, version, and title are required' })
  }

  const candidates: ContentPublicationCandidate[] = []
  const warnings: string[] = []

  for (const [field, parse] of Object.entries(SOURCE_PARSERS)) {
    const raw = body?.[field]
    if (raw === undefined || raw === null) {
      continue
    }

    const preview = parse(parsePayload(raw, field))
    candidates.push(...toContentPublicationCandidates(preview))
    warnings.push(...preview.warnings.map((warning) => `[${field}] ${warning}`))
  }

  if (!candidates.length) {
    throw createError({
      statusCode: 400,
      statusMessage: 'At least one of items/spells/classes/species/backgrounds/feats must be provided'
    })
  }

  const result = await publishContentPack({
    packageId,
    version,
    title,
    description,
    license: license as ContentPackLicense,
    contentSchemaVersion,
    origin: { kind: 'translated', adapterId: '5etools-json' },
    candidates,
    warnings
  })

  if (!result.published) {
    if (result.stage === 'validation') {
      throw createError({
        statusCode: 422,
        statusMessage: 'Content Pack failed publication validation',
        data: { issues: result.issues }
      })
    }

    throw createError({
      statusCode: 409,
      statusMessage: `Content pack '${result.packageId}@${result.version}' already exists (status: '${result.status}')`
    })
  }

  return {
    published: true,
    packageId: result.package.packageId,
    version: result.package.version,
    integrityHash: result.package.integrityHash,
    entryCount: result.package.content.length,
    issues: result.issues
  }
})
