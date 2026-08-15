// Content Pack Loader.
// Content Packs are the Gameplay Content sibling of Rules Packages'
// Mechanics -- see .github/docs/architecture/ownership-and-permissions.md
// (Revision 2) §7 and server/utils/rules-packages.ts, whose shape this
// module deliberately mirrors: persistence + loading + listing + integrity
// verification for one global, immutable, versioned collection.
//
// This is Infrastructure Phase 1 ONLY: persistence, loading, and World
// binding (see world-content-packs.ts / world-content-pack-binding.ts). It
// does NOT implement importing, content resolution, or Character Sheet
// integration -- `content` is an opaque JSON payload nothing here
// interprets.
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

import { createHash } from 'node:crypto'
import { canonicalize } from '../../app/lib/rules/canonicalize'
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
}

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
      fields: 'package_id,version,title,content_schema_version',
      sort: ['package_id', '-version'],
      limit: -1
    }
  })

  const rows = Array.isArray(res?.data) ? res.data : []
  return rows.map((row: any) => ({
    packageId: String(row.package_id ?? ''),
    version: String(row.version ?? ''),
    title: String(row.title ?? ''),
    contentSchemaVersion: Number(row.content_schema_version ?? 0)
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
