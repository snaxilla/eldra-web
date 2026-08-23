// Content Pack Persistence.
// Content Packs are the Gameplay Content sibling of Rules Packages'
// Mechanics -- see .github/docs/architecture/ownership-and-permissions.md
// (Revision 2) §7 and server/utils/rules-packages.ts, whose shape this
// module deliberately mirrors: persistence + loading + listing + integrity
// verification for one global, immutable, versioned collection.
//
// Infrastructure Phase 1 covered persistence, loading, and World binding
// (see world-content-packs.ts / world-content-pack-binding.ts) -- `content`
// was opaque, and nothing wrote a row. Content Pack Publishing (Phase 2)
// adds the write path (publishContentPackRelease below), called by
// server/utils/content-pack-publishing.ts's pipeline, invoked from a Nitro
// API route -- unlike rules_packages' publish-starter-package.mjs, this
// does NOT need to be a standalone script (Content Pack publishing runs
// from the existing importer's Nitro routes, which already have
// `directusServiceRequest` available), so the write path lives directly in
// this module -- the same "load + save together" shape
// world-rules-config.ts already uses, rather than rules-packages.ts's
// load-only shape.
//
// This module still does NOT implement content resolution or Character
// Sheet integration -- `content` remains an opaque JSON payload nothing
// here interprets, even on the write path: publishContentPackRelease
// stores exactly what it is given.
//
// ---------------------------------------------------------------------------
// DESIGN DECISIONS
// ---------------------------------------------------------------------------
// 1. Uses `directusServiceRequest` (./directus), never a local dxFetch --
//    same reasoning as rules-packages.ts: Content Pack reads are global,
//    service-token operations, and may happen with no user session to
//    forward.
//
// 2. Integrity is computed over `canonicalize(content)` only, never the
//    manifest -- mirrors rules-packages.ts's own integrity rule exactly
//    (rules-engine.md §11.2's "computed over canonicalized definitions",
//    generalized here to "canonicalized content").
//
// 3. No engine/compatibility check. rules-packages.ts's `engineApiVersion`
//    check exists because a real executor (the Rules Engine) evaluates
//    package content; nothing evaluates Content Pack content yet (content
//    resolution is explicitly out of scope for this phase). Loading only
//    verifies status and integrity -- there is no third axis to check.
//
// 4. Every expected failure is a discriminated `{ ok: false, stage, ... }`
//    result, never a thrown exception -- exactly rules-packages.ts's
//    FAILURE MODEL, generalized to Content Packs.
//
// 5. Cache key is `${packageId}@${version}#${integrityHash}`, identical in
//    shape and rationale to rules-packages.ts's cache: published rows are
//    immutable, so a key including the integrity hash can never be stale.
//
// 6. Three loaders, not one -- the task separates "Content Pack loading",
//    "Manifest loading", and "Metadata loading" as distinct capabilities:
//      - listPublishedContentPacks -- METADATA: envelope columns only, for
//        a listing UI. Never touches manifest/content.
//      - loadContentPackManifest   -- MANIFEST: the (potentially much
//        smaller) manifest alone, status-checked but NOT integrity-
//        verified (integrity is defined over `content`, which this loader
//        never reads) -- for display/admin surfaces that need pack
//        metadata without paying for a multi-megabyte content payload.
//      - loadPublishedContentPack  -- FULL: manifest + content, status- and
//        integrity-verified. The only loader a future World binding
//        (world-content-pack-binding.ts) or content resolver may trust as
//        "safe to use".
//
// 7. (Phase 2) publishContentPackRelease performs ZERO validation of its
//    own -- validation ("can this become a Content Pack?") is
//    content-pack-publishing.ts's job, exactly mirroring how
//    activateWorldRulesPackage performs zero of its own verification
//    because loadPublishedPackage already did it (world-rules-
//    activation.ts design decision 1). This function's only two
//    responsibilities are: refuse a duplicate (package_id, version) --
//    published rows are immutable, mirroring publish-starter-package.mjs's
//    "a duplicate published (package_id, version) aborts... insert-only" --
//    and compute+store the integrity hash via the SAME
//    computeContentIntegrityHash this module's loaders already verify
//    against, so a pack this function just published is guaranteed to pass
//    loadPublishedContentPack's own integrity check on the very next read.

import { createHash } from 'node:crypto'
import { canonicalize } from '../../app/lib/rules/canonicalize'
import type { RulesVocabularyId } from '../../app/lib/rules/types'
import { directusServiceRequest } from './directus'

const COLLECTION = 'content_packs'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
//
// Deliberately self-contained rather than importing RulesPackageManifest's
// sibling types from app/lib/rules/types.ts -- Content Packs and Rules
// Packages are SIBLINGS (ownership-and-permissions.md §7: "Rules Package ->
// Mechanics, Content Pack -> Gameplay Content"), not one built on the
// other. The four envelope shapes below happen to look similar because
// both systems are "immutable versioned package" envelopes, not because
// Content Packs depend on the Rules Engine.

export type ContentPackStatus = 'draft' | 'published'

export type ContentPackOrigin = {
  kind: 'authored' | 'translated'
  adapterId?: string
  adapterVersion?: string
  sourceId?: string
  sourceHash?: string
}

export type ContentPackAuthor = {
  name: string
  url?: string
}

export type ContentPackLicense = {
  id: string
  notice?: string
  attribution?: string
}

// rules-package-architecture.md §9.1 -- Step 1. The Rules Vocabulary this
// pack's content is authored AGAINST; the counterpart to a Rules Package's
// own `provides.vocabulary`.
//
// PER-PACK, not per-entry (§18.4, Decision 4): one declaration, one place
// to check at bind time, and a mismatch raises a single Binding Gap against
// the pack rather than one per entry. A per-entry override is reserved for
// a pack that legitimately spans two vocabularies -- imaginable, no current
// use case, and free to add later.
//
// The type is imported from the Rules Engine, which is the correct
// direction and already-established here (this module imports
// `canonicalize` from the same place). A vocabulary is a RULES concept --
// the Rules Package provides it, content merely names it -- so it is
// defined there. §8.3's one-way rule permits content to depend on rules and
// forbids the reverse; a type-only import is the lightest possible form of
// that dependency, and is erased at runtime.
export type ContentPackTargets = {
  vocabulary: RulesVocabularyId
}

export type ContentPackManifest = {
  packageId: string
  version: string
  status: ContentPackStatus
  contentSchemaVersion: number
  origin?: ContentPackOrigin
  title: string
  description?: string
  authors?: ContentPackAuthor[]
  license: ContentPackLicense
  integrity?: string
  // OPTIONAL, and it must stay optional: every already-published pack
  // (XPHB, XDMG, XMM) has no `targets`, and each must keep loading, binding,
  // and resolving unchanged. A pack with none declares no rules
  // compatibility and simply participates in no check -- which is the
  // correct reading of "content that presents but does not mechanise"
  // (§8.2 rule 4).
  //
  // Cannot affect any existing integrity hash: computeContentIntegrityHash
  // below hashes `content` (the entries) and never the manifest.
  targets?: ContentPackTargets
}

// Opaque in this phase -- no importer or content-resolution consumer
// exists yet (task NON-GOALS), so no entry shape is defined here. A future
// importer/resolver commit gives this a real type.
export type ContentPackEntry = unknown

export type LoadedContentPack = {
  packageId: string
  version: string
  manifest: ContentPackManifest
  content: ContentPackEntry[]
  integrityHash: string
}

export type ContentPackLoadFailure =
  | { stage: 'not-found'; packageId: string; version: string }
  | { stage: 'not-published'; status: string }
  | { stage: 'integrity-mismatch'; expected: string; computed: string }
  | { stage: 'deserialize'; field: string; error: string }

export type ContentPackLoadResult =
  | { ok: true; package: LoadedContentPack }
  | ({ ok: false } & ContentPackLoadFailure)

export type ContentPackManifestLoadFailure =
  | { stage: 'not-found'; packageId: string; version: string }
  | { stage: 'not-published'; status: string }
  | { stage: 'deserialize'; field: string; error: string }

export type ContentPackManifestLoadResult =
  | { ok: true; manifest: ContentPackManifest }
  | ({ ok: false } & ContentPackManifestLoadFailure)

export type ContentPackListing = {
  packageId: string
  version: string
  title: string
  contentSchemaVersion: number
  // Added for the Game Admin "Content Packs" tab's Bind list (Content Pack
  // Binding UI task) -- the same license_id column publishContentPackRelease
  // already writes (design decision 7's own payload), just not previously
  // selected by this listing query. Still METADATA only (design decision 6):
  // the row's own `license_id` column, never the manifest's embedded
  // license object.
  licenseId: string | null
}

// PUBLISH (Phase 2). Everything publishContentPackRelease needs to insert
// one row -- already-validated, already-built by the caller (content-pack-
// publishing.ts). This module never invents any of these values.
export type ContentPackPublishInput = {
  packageId: string
  version: string
  title: string
  contentSchemaVersion: number
  licenseId: string | null
  manifest: ContentPackManifest
  content: ContentPackEntry[]
}

export type ContentPackPublishFailure = {
  stage: 'already-exists'
  packageId: string
  version: string
  status: string
}

export type ContentPackPublishResult =
  | { ok: true; package: LoadedContentPack }
  | ({ ok: false } & ContentPackPublishFailure)

// ---------------------------------------------------------------------------
// Cache -- exactly one Map, holding parsed FULL package documents. Manifest-
// only and metadata loads are never cached (they are already cheap: a
// metadata load is one shallow-column query, and a manifest load skips the
// heavy `content` column entirely -- see design decision 6).
// ---------------------------------------------------------------------------

const contentPackCache = new Map<string, LoadedContentPack>()

function cacheKey(packageId: string, version: string, integrityHash: string): string {
  return `${packageId}@${version}#${integrityHash}`
}

// Exposed for tests only -- no production code path needs to clear this
// cache (published rows are immutable for the process lifetime).
export function clearContentPackCache(): void {
  contentPackCache.clear()
}

// ---------------------------------------------------------------------------
// Integrity hashing -- the only module allowed to compute a hash, mirroring
// rules-packages.ts's own rule. Reuses app/lib/rules/canonicalize.ts, which
// is generic recursive key-sorted JSON serialization with no Rules-domain
// coupling (no import of any Rules type, no reference to Expressions or
// Definitions) -- reusing it here avoids a parallel re-implementation of
// the identical algorithm.
// ---------------------------------------------------------------------------

export function computeContentIntegrityHash(content: readonly ContentPackEntry[]): string {
  const digest = createHash('sha256').update(canonicalize(content)).digest('hex')
  return `sha256-${digest}`
}

// ---------------------------------------------------------------------------
// JSON field deserialization -- identical defensive handling to
// rules-packages.ts's parseJsonField (Directus JSON columns are typically
// already-parsed, but this tolerates a string encoding too).
// ---------------------------------------------------------------------------

function parseJsonField<T>(
  value: unknown,
  field: string
): { ok: true; value: T } | { ok: false; error: string } {
  if (value === null || value === undefined) {
    return { ok: false, error: `${field} is missing` }
  }

  if (typeof value === 'string') {
    try {
      return { ok: true, value: JSON.parse(value) as T }
    } catch (error) {
      return { ok: false, error: `${field} is not valid JSON: ${(error as Error).message}` }
    }
  }

  return { ok: true, value: value as T }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

// METADATA loading -- envelope columns only, never manifest/content. For a
// pack picker / listing UI. Mirrors listPublishedRulesPackages exactly.
export async function listPublishedContentPacks(): Promise<ContentPackListing[]> {
  const res: any = await directusServiceRequest(`/items/${COLLECTION}`, {
    method: 'GET',
    query: {
      filter: { status: { _eq: 'published' } },
      fields: 'package_id,version,title,content_schema_version,license_id',
      sort: ['package_id', '-version'],
      limit: -1
    }
  })

  const rows = Array.isArray(res?.data) ? res.data : []
  return rows.map((row: any) => ({
    packageId: String(row.package_id ?? ''),
    version: String(row.version ?? ''),
    title: String(row.title ?? ''),
    contentSchemaVersion: Number(row.content_schema_version ?? 0),
    licenseId: row.license_id ?? null
  }))
}

// MANIFEST loading -- the manifest alone, status-checked but NOT integrity-
// verified (integrity is defined over `content`, which this never reads).
// Never cached -- see cache note above; a manifest-only read is already
// cheap.
export async function loadContentPackManifest(
  packageId: string,
  version: string
): Promise<ContentPackManifestLoadResult> {
  const res: any = await directusServiceRequest(`/items/${COLLECTION}`, {
    method: 'GET',
    query: {
      filter: {
        _and: [
          { package_id: { _eq: packageId } },
          { version: { _eq: version } }
        ]
      },
      limit: 1,
      fields: 'status,manifest'
    }
  })

  const row = Array.isArray(res?.data) ? res.data[0] : null

  if (!row) {
    return { ok: false, stage: 'not-found', packageId, version }
  }

  const status = String(row.status ?? '')
  if (status !== 'published') {
    return { ok: false, stage: 'not-published', status }
  }

  const manifestResult = parseJsonField<ContentPackManifest>(row.manifest, 'manifest')
  if (!manifestResult.ok) {
    return { ok: false, stage: 'deserialize', field: 'manifest', error: manifestResult.error }
  }

  return { ok: true, manifest: manifestResult.value }
}

// FULL load: manifest + content, status- and integrity-verified. The only
// loader safe to treat as "this pack's content may be trusted" -- mirrors
// loadPublishedPackage (rules-packages.ts) exactly, minus the engine-
// compatibility stage (see design decision 3).
export async function loadPublishedContentPack(
  packageId: string,
  version: string
): Promise<ContentPackLoadResult> {
  const res: any = await directusServiceRequest(`/items/${COLLECTION}`, {
    method: 'GET',
    query: {
      filter: {
        _and: [
          { package_id: { _eq: packageId } },
          { version: { _eq: version } }
        ]
      },
      limit: 1,
      fields: '*'
    }
  })

  const row = Array.isArray(res?.data) ? res.data[0] : null

  if (!row) {
    return { ok: false, stage: 'not-found', packageId, version }
  }

  const status = String(row.status ?? '')
  if (status !== 'published') {
    return { ok: false, stage: 'not-published', status }
  }

  const contentResult = parseJsonField<ContentPackEntry[]>(row.content, 'content')
  if (!contentResult.ok) {
    return { ok: false, stage: 'deserialize', field: 'content', error: contentResult.error }
  }

  const manifestResult = parseJsonField<ContentPackManifest>(row.manifest, 'manifest')
  if (!manifestResult.ok) {
    return { ok: false, stage: 'deserialize', field: 'manifest', error: manifestResult.error }
  }

  const manifest = manifestResult.value
  const content = contentResult.value

  const computedIntegrity = computeContentIntegrityHash(content)
  const storedIntegrity = String(row.integrity_hash ?? '')

  if (computedIntegrity !== storedIntegrity) {
    return { ok: false, stage: 'integrity-mismatch', expected: storedIntegrity, computed: computedIntegrity }
  }

  const key = cacheKey(manifest.packageId, manifest.version, computedIntegrity)
  const cached = contentPackCache.get(key)
  if (cached) {
    return { ok: true, package: cached }
  }

  const loaded: LoadedContentPack = {
    packageId: manifest.packageId,
    version: manifest.version,
    manifest,
    content,
    integrityHash: computedIntegrity
  }

  contentPackCache.set(key, loaded)
  return { ok: true, package: loaded }
}

// Inserts one published content_packs row -- design decision 7. Refuses
// (writes nothing) if a row for (packageId, version) already exists,
// regardless of its status -- published rows are immutable, and this
// phase never writes drafts (mirrors rules_packages' "V1 only ever writes
// published" -- there is no draft workflow to resume here either).
export async function publishContentPackRelease(
  input: ContentPackPublishInput
): Promise<ContentPackPublishResult> {
  const existingRes: any = await directusServiceRequest(`/items/${COLLECTION}`, {
    method: 'GET',
    query: {
      filter: {
        _and: [
          { package_id: { _eq: input.packageId } },
          { version: { _eq: input.version } }
        ]
      },
      limit: 1,
      fields: 'status'
    }
  })

  const existing = Array.isArray(existingRes?.data) ? existingRes.data[0] : null
  if (existing) {
    return {
      ok: false,
      stage: 'already-exists',
      packageId: input.packageId,
      version: input.version,
      status: String(existing.status ?? '')
    }
  }

  const integrityHash = computeContentIntegrityHash(input.content)
  const now = new Date().toISOString()

  await directusServiceRequest(`/items/${COLLECTION}`, {
    method: 'POST',
    body: {
      package_id: input.packageId,
      version: input.version,
      status: 'published',
      content_schema_version: input.contentSchemaVersion,
      title: input.title,
      integrity_hash: integrityHash,
      license_id: input.licenseId,
      created_at: now,
      manifest: input.manifest,
      content: input.content
    }
  })

  const loaded: LoadedContentPack = {
    packageId: input.packageId,
    version: input.version,
    manifest: input.manifest,
    content: input.content,
    integrityHash
  }

  // Pre-populate the load cache with the exact object just published --
  // same referential-stability property loadPublishedContentPack's own
  // cache-hit test already relies on, so a caller that publishes and then
  // immediately loads never pays for a redundant round trip or a
  // redundant integrity recomputation.
  contentPackCache.set(cacheKey(input.packageId, input.version, integrityHash), loaded)

  return { ok: true, package: loaded }
}
