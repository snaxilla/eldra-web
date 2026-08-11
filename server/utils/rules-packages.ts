// Rules Package Loader. See .github/docs/architecture/rules-package-
// infrastructure.md §5 ("Module Map"), Q8 ("runtime package caching"), and
// §B.8 ("Minimal loader") for the design this implements:
//
//   loadPublishedPackage(packageId, version) → { manifest, definitions } | RulesPackageLoadError
//
// This module reads one `rules_packages` row, verifies it is safe to run
// (published, engine-compatible, integrity-intact), and returns a package
// ready to hand to `createWorldRuntime` (app/lib/rules/world-runtime.ts).
// It does NOT call createWorldRuntime, does not activate a package for any
// World, and does not publish rows -- see this commit's NON-GOALS.
//
// ---------------------------------------------------------------------------
// DESIGN DECISIONS
// ---------------------------------------------------------------------------
// 1. Uses `directusServiceRequest` (./directus), never a local `dxFetch`.
//    Package reads are service-token operations by design -- packages are
//    global content, and package loads happen during roll execution where
//    there may be no user session to forward (architecture doc §2.7 / §21).
//
// 2. Integrity is computed over `canonicalize(definitions)` only, never
//    the manifest -- rules-engine.md §11.2: "`integrity` is computed over
//    canonicalized definitions." The manifest's own optional `integrity`
//    field is not cross-checked against the row's `integrity_hash` column
//    here; the row column is the persistence-layer's authoritative value,
//    and cross-checking two copies of the same fact against each other is
//    exactly the kind of unrequested validation rules-package.ts's own
//    design decision 7 already declined to add one layer up.
//
// 3. `engineApiVersion` compatibility is a semver caret-range check
//    (`^X.Y.Z` -> `>=X.Y.Z <(next breaking)`, matching npm's own caret
//    semantics) or an exact match for a bare version. No `semver` package
//    dependency is introduced for this -- the architecture only asks for
//    "compatibility filtering" against one hardcoded engine version
//    (CURRENT_ENGINE_API_VERSION below), not general-purpose range
//    arithmetic, so a small self-contained comparator is the smallest
//    correct tool rather than a new dependency for one comparison.
//
// 4. Every expected failure (not found, draft, engine-incompatible,
//    integrity mismatch, malformed JSON) is a discriminated `{ ok: false,
//    stage, ... }` result, never a thrown exception -- this commit's own
//    FAILURE MODEL section ("do not throw for expected validation
//    failures... if integrity mismatches, fail loudly" -- loudly meaning
//    reported, not silently swallowed, not an uncaught exception).
//
// 5. Cache key is exactly `${packageId}@${version}#${integrityHash}`, per
//    Q8. The row is still fetched and re-verified on every call in this
//    commit -- nothing yet calls this loader repeatedly on a hot path (no
//    roll route exists until a later commit), so a second structure to
//    skip the Directus fetch itself would be optimizing for a caller that
//    does not exist yet. What the cache already buys today: the parsed
//    package object returned on a cache hit is the *same instance* as the
//    first load (verified by the cache-hit test), so a caller comparing
//    `loaded.definitions === previouslyLoaded.definitions` can rely on
//    referential stability. Skipping the Directus round-trip entirely is
//    deferred until a real repeated caller justifies the extra structure.

import { createHash } from 'node:crypto'
import { canonicalize } from '../../app/lib/rules/canonicalize'
import type { Definition, RulesPackageManifest } from '../../app/lib/rules/types'
import { directusServiceRequest } from './directus'

const COLLECTION = 'rules_packages'

// The Rules Engine's own current contract version, compared against a
// package's declared `engineApiVersion` range. rules-engine.md §11.2's own
// example manifests (and the two proof packages in §31) all declare
// "^1.0.0" -- there is no other engine version anywhere in this repo yet.
export const CURRENT_ENGINE_API_VERSION = '1.0.0'

export type LoadedRulesPackage = {
  packageId: string
  version: string
  manifest: RulesPackageManifest
  definitions: Definition[]
  integrityHash: string
}

export type PublishedPackageLoadFailure =
  | { stage: 'not-found'; packageId: string; version: string }
  | { stage: 'not-published'; status: string }
  | { stage: 'engine-incompatible'; declaredRange: string; engineVersion: string }
  | { stage: 'integrity-mismatch'; expected: string; computed: string }
  | { stage: 'deserialize'; field: string; error: string }

export type PublishedPackageLoadResult =
  | { ok: true; package: LoadedRulesPackage }
  | ({ ok: false } & PublishedPackageLoadFailure)

// ---------------------------------------------------------------------------
// Cache -- exactly one Map, holding parsed package documents. NOT a
// RuntimeRulesPackage cache (Q8: "A second-level RuntimeRulesPackage cache
// is specified and deliberately not built").
// ---------------------------------------------------------------------------

const packageCache = new Map<string, LoadedRulesPackage>()

function cacheKey(packageId: string, version: string, integrityHash: string): string {
  return `${packageId}@${version}#${integrityHash}`
}

// Exposed for tests only -- there is no production code path that needs to
// clear this cache (published rows are immutable for the process lifetime).
export function clearRulesPackageCache(): void {
  packageCache.clear()
}

// ---------------------------------------------------------------------------
// Integrity hashing -- the only module allowed to compute a hash (see
// canonicalize.ts's own header: "hashing it is server/utils/rules-
// packages.ts's job").
// ---------------------------------------------------------------------------

export function computeIntegrityHash(definitions: readonly Definition[]): string {
  const digest = createHash('sha256').update(canonicalize(definitions)).digest('hex')
  return `sha256-${digest}`
}

// ---------------------------------------------------------------------------
// engineApiVersion compatibility -- minimal caret-range / exact-match
// comparator. See design decision 3.
// ---------------------------------------------------------------------------

type SemVer = { major: number; minor: number; patch: number }

function parseSemVer(version: string): SemVer | null {
  const match = /^(\d+)\.(\d+)\.(\d+)/.exec(version.trim())
  if (!match) return null

  return { major: Number(match[1]), minor: Number(match[2]), patch: Number(match[3]) }
}

function compareSemVer(a: SemVer, b: SemVer): number {
  if (a.major !== b.major) return a.major - b.major
  if (a.minor !== b.minor) return a.minor - b.minor
  return a.patch - b.patch
}

// Standard npm caret semantics: ^1.2.3 -> >=1.2.3 <2.0.0; ^0.2.3 ->
// >=0.2.3 <0.3.0; ^0.0.3 -> >=0.0.3 <0.0.4.
function caretUpperBound(base: SemVer): SemVer {
  if (base.major > 0) return { major: base.major + 1, minor: 0, patch: 0 }
  if (base.minor > 0) return { major: 0, minor: base.minor + 1, patch: 0 }
  return { major: 0, minor: 0, patch: base.patch + 1 }
}

export function satisfiesEngineApiVersion(declaredRange: string, engineVersion: string): boolean {
  const engine = parseSemVer(engineVersion)
  if (!engine) return false

  const trimmed = declaredRange.trim()

  if (trimmed.startsWith('^')) {
    const base = parseSemVer(trimmed.slice(1))
    if (!base) return false

    const upper = caretUpperBound(base)
    return compareSemVer(engine, base) >= 0 && compareSemVer(engine, upper) < 0
  }

  const exact = parseSemVer(trimmed)
  if (!exact) return false

  return compareSemVer(engine, exact) === 0
}

// ---------------------------------------------------------------------------
// JSON field deserialization -- Directus JSON columns are typically
// returned already-parsed, but this tolerates a string encoding too
// (matches the defensive `parseMaybeJson` pattern already used in
// server/utils/character-sheet-notes.ts) rather than assuming one shape.
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

// Reads one published rules_packages row, verifies it is safe to run, and
// returns a package ready for createWorldRuntime(manifest, definitions,
// worldId, stored) -- this function never calls createWorldRuntime itself.
// Never throws for an expected failure; every stage reports its own
// discriminated failure (see PublishedPackageLoadFailure).
export async function loadPublishedPackage(
  packageId: string,
  version: string
): Promise<PublishedPackageLoadResult> {
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

  const definitionsResult = parseJsonField<Definition[]>(row.definitions, 'definitions')
  if (!definitionsResult.ok) {
    return { ok: false, stage: 'deserialize', field: 'definitions', error: definitionsResult.error }
  }

  const manifestResult = parseJsonField<RulesPackageManifest>(row.manifest, 'manifest')
  if (!manifestResult.ok) {
    return { ok: false, stage: 'deserialize', field: 'manifest', error: manifestResult.error }
  }

  const manifest = manifestResult.value
  const definitions = definitionsResult.value

  if (!satisfiesEngineApiVersion(manifest.engineApiVersion, CURRENT_ENGINE_API_VERSION)) {
    return {
      ok: false,
      stage: 'engine-incompatible',
      declaredRange: manifest.engineApiVersion,
      engineVersion: CURRENT_ENGINE_API_VERSION
    }
  }

  const computedIntegrity = computeIntegrityHash(definitions)
  const storedIntegrity = String(row.integrity_hash ?? '')

  if (computedIntegrity !== storedIntegrity) {
    return { ok: false, stage: 'integrity-mismatch', expected: storedIntegrity, computed: computedIntegrity }
  }

  const key = cacheKey(manifest.packageId, manifest.version, computedIntegrity)
  const cached = packageCache.get(key)
  if (cached) {
    return { ok: true, package: cached }
  }

  const loaded: LoadedRulesPackage = {
    packageId: manifest.packageId,
    version: manifest.version,
    manifest,
    definitions,
    integrityHash: computedIntegrity
  }

  packageCache.set(key, loaded)
  return { ok: true, package: loaded }
}
