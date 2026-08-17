// Content Pack Publishing -- the pipeline that turns publication candidates
// into a published Content Pack:
//
//   Candidates -> Validate -> Manifest -> Canonicalize -> Integrity -> Publish
//
// See .github/docs/architecture/ownership-and-permissions.md (Revision 2)
// §7 (Content Packs re-derived from provenance/campaign-stability/
// licensing, not storage) and server/utils/content-packs.ts (persistence
// this module writes through). This is Content Pack Publishing ONLY: it
// produces a published Content Pack and does NOT bind it to any World
// (see server/utils/world-content-pack-binding.ts for that, a deliberately
// separate, later step -- §7.5: "installing a pack is a Platform action;
// binding one to a world is a World action").
//
// ---------------------------------------------------------------------------
// THE SEAM (why this file imports nothing from app/lib/importers)
// ---------------------------------------------------------------------------
// This module knows exactly four things: publication metadata (identity,
// license, description), publication entries (ContentPublicationCandidate,
// defined below), integrity, and versioning. It must NEVER know about
// BlockRenderer, World entity blocks, or any importer's internal
// presentation structures -- those belong to the World/wiki entity system
// (app/lib/systems' buildDefaultEntityData, EldraEntityBlockInstance),
// which has nothing to do with what a Content Pack is.
//
// `ContentPublicationCandidate` is Eldra's OWN publication contract, owned
// by the Content Pack system, not borrowed from any importer. A 5etools
// importer, a future Foundry importer, or a future Pathfinder importer are
// all free to have their own preview/parsing shapes -- none of them are
// required to produce this module's types. Translating an importer's
// output INTO a ContentPublicationCandidate[] is an explicit ADAPTER's job
// (server/utils/content-pack-5etools-adapter.ts is the one adapter that
// exists today), never this module's. This module accepts only the
// already-adapted candidate list; it has no idea a 5etools importer, or
// any importer at all, produced it.
//
// ---------------------------------------------------------------------------
// DESIGN DECISIONS
// ---------------------------------------------------------------------------
// 1. VALIDATION here answers exactly one question: "can this become a
//    Content Pack?" -- structural/publication readiness, never gameplay
//    correctness. It never asks "is this a legal longsword" the way a
//    future content resolver might; it asks "does every candidate have an
//    identity, is the pack's own identity well-formed, and is there
//    anything to publish at all." This mirrors the split rules-package-
//    infrastructure.md draws between publish-time and activation-time
//    checks, narrowed to what a package with no evaluator needs. It never
//    inspects `ContentPublicationCandidate.data` -- that field is as
//    opaque to this module as `ContentPackEntry` is to content-packs.ts.
//
// 2. Errors block publication; warnings do not -- the same severity model
//    Package Validation (app/lib/rules/package-validation.ts) already
//    established, reused as a convention (not as imported code -- Content
//    Packs remain a sibling system, per content-packs.ts's own design
//    decision, so `ContentPackPublicationIssue` is defined locally here).
//
// 3. Advisory `warnings` (e.g. from an importer's own parsing pass) are
//    accepted as opaque strings, not interpreted. This module has no
//    concept of "an importer warning" -- a caller may pass any strings it
//    wants surfaced alongside validation issues, and they are wrapped
//    verbatim as `{ severity: 'warning', code: 'external' }`. This is how
//    the 5etools route surfaces preview5eTools*'s own `warnings` without
//    this module needing to know an importer exists.
//
// 4. No `validation_issues` column exists on `content_packs` (removed from
//    Infrastructure Phase 1 specifically because nothing consumed it).
//    This module's issues are therefore NEVER persisted -- they are
//    returned to the caller as part of the publish response and nowhere
//    else.
//
// 5. INTEGRITY reuses computeContentIntegrityHash (content-packs.ts)
//    unchanged -- no second hashing mechanism. CANONICALIZE is that
//    function's own first step (app/lib/rules/canonicalize.ts), also
//    unchanged. This module never calls createHash or canonicalize
//    directly.
//
// 6. MANIFEST is built, not user-supplied wholesale -- the caller supplies
//    identity/description/license; this module fills `status: 'published'`
//    itself, so a manifest can never claim to be a draft when it was just
//    published. `origin` is NOT set here (design decision, see below) --
//    provenance (who/what produced these candidates) is the adapter's
//    fact, not this module's; a caller that wants an `origin` recorded
//    passes it through as part of the manifest input.

import { publishContentPackRelease, type ContentPackManifest, type ContentPackEntry, type ContentPackLicense, type ContentPackOrigin, type LoadedContentPack } from './content-packs'

// ---------------------------------------------------------------------------
// The publication contract -- Eldra-owned, not an importer's shape.
// ---------------------------------------------------------------------------

// A single entry ready to become part of a Content Pack's `content`. Every
// field here is publication metadata (identity + provenance); `data` is
// opaque -- this module never reads inside it, exactly as `ContentPackEntry`
// (content-packs.ts) stays opaque at the storage layer. No `blocks`, no
// World-entity or presentation concept of any kind belongs here.
export type ContentPublicationCandidate = {
  systemKey: string
  entityType: string
  title: string
  slug: string
  externalId: string
  provider: string
  sourceBook?: string
  sourcePage?: string
  data: unknown
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

export type ContentPackPublicationSeverity = 'error' | 'warning'

export type ContentPackPublicationIssue = {
  severity: ContentPackPublicationSeverity
  code: string
  message: string
}

export type ContentPackPublicationIdentity = {
  packageId: string
  version: string
  title: string
  license: ContentPackLicense | null | undefined
}

// Deliberately loose, structural checks -- "is this identifier well-formed
// enough to publish," not a real reverse-DNS/semver validator. Mirrors
// content-packs.ts's own posture on satisfiesEngineApiVersion: no new
// dependency for one shape check.
const PACKAGE_ID_PATTERN = /^[a-z0-9][a-z0-9-]*(\.[a-z0-9][a-z0-9-]*)+$/
const VERSION_PATTERN = /^\d+\.\d+\.\d+/

function candidateIdentityKey(candidate: ContentPublicationCandidate): string {
  return `${candidate.systemKey}::${candidate.entityType}::${candidate.slug}`
}

// Pure -- no I/O, exactly like app/lib/rules/package-validation.ts's own
// validatePackage. Answers "can this become a Content Pack?" only (design
// decision 1): pack identity is well-formed, there is at least one
// candidate, every candidate carries a complete identity, and no two
// candidates collide on identity. Never inspects `candidate.data`.
export function validateContentPackForPublication(
  identity: ContentPackPublicationIdentity,
  candidates: readonly ContentPublicationCandidate[]
): { ok: boolean; issues: ContentPackPublicationIssue[] } {
  const issues: ContentPackPublicationIssue[] = []

  if (!identity.packageId || !PACKAGE_ID_PATTERN.test(identity.packageId)) {
    issues.push({
      severity: 'error',
      code: 'invalid-package-id',
      message: `packageId '${identity.packageId}' must be a reverse-DNS-style identifier with at least two dot-separated segments, e.g. "eldra.srd-5.1"`
    })
  }

  if (!identity.version || !VERSION_PATTERN.test(identity.version)) {
    issues.push({
      severity: 'error',
      code: 'invalid-version',
      message: `version '${identity.version}' must start with a semver-shaped major.minor.patch, e.g. "1.0.0"`
    })
  }

  if (!identity.title || !identity.title.trim()) {
    issues.push({ severity: 'error', code: 'missing-title', message: 'title is required' })
  }

  if (!identity.license?.id || !identity.license.id.trim()) {
    issues.push({
      severity: 'error',
      code: 'missing-license',
      message: 'license.id is required -- licensing is legally load-bearing for Content Packs (ownership-and-permissions.md §7.2.3)'
    })
  }

  if (candidates.length === 0) {
    issues.push({
      severity: 'error',
      code: 'empty-content',
      message: 'At least one publication candidate is required -- there is nothing to publish'
    })
  }

  const seen = new Map<string, ContentPublicationCandidate>()
  for (const candidate of candidates) {
    if (!candidate.systemKey || !candidate.entityType || !candidate.slug || !candidate.title || !candidate.externalId) {
      issues.push({
        severity: 'error',
        code: 'incomplete-candidate',
        message: `Candidate '${candidate.title || candidate.slug || '(untitled)'}' is missing a required identity field (systemKey/entityType/slug/title/externalId)`
      })
      continue
    }

    const key = candidateIdentityKey(candidate)
    const duplicate = seen.get(key)
    if (duplicate) {
      issues.push({
        severity: 'error',
        code: 'duplicate-candidate',
        message: `Two candidates share the identity '${key}' (titles: '${duplicate.title}', '${candidate.title}') -- a Content Pack cannot contain two entries claiming the same identity`
      })
      continue
    }
    seen.set(key, candidate)
  }

  const ok = issues.every((issue) => issue.severity !== 'error')
  return { ok, issues }
}

// ---------------------------------------------------------------------------
// Manifest
// ---------------------------------------------------------------------------

export type ContentPackManifestInput = {
  packageId: string
  version: string
  title: string
  description?: string
  license: ContentPackLicense
  contentSchemaVersion?: number
  // Provenance is a caller-supplied fact, not inferred here (design
  // decision 6) -- the adapter/route that knows which importer produced
  // these candidates is the one place that knows what `origin` should say.
  origin?: ContentPackOrigin
}

// Pure. `status` is NEVER caller-suppliable -- design decision 6.
export function buildContentPackManifest(input: ContentPackManifestInput): ContentPackManifest {
  return {
    packageId: input.packageId,
    version: input.version,
    status: 'published',
    contentSchemaVersion: input.contentSchemaVersion ?? 1,
    origin: input.origin,
    title: input.title,
    description: input.description,
    license: input.license
  }
}

// ---------------------------------------------------------------------------
// Publish (orchestration)
// ---------------------------------------------------------------------------

// Named ContentPackPublication* (not ContentPackPublish*) to avoid
// colliding with content-packs.ts's own ContentPackPublishInput/
// ContentPackPublishResult -- those describe the low-level row-insert
// contract (publishContentPackRelease); these describe the high-level
// pipeline contract (validate+manifest+integrity+publish) this module
// orchestrates on top of it. Same word, deliberately different level.
export type ContentPackPublicationInput = ContentPackManifestInput & {
  candidates: ContentPublicationCandidate[]
  // Opaque advisory strings a caller wants surfaced -- see design decision
  // 3. Never interpreted, never required.
  warnings?: string[]
}

export type ContentPackPublicationResult =
  | { published: false; stage: 'validation'; issues: ContentPackPublicationIssue[] }
  | { published: false; stage: 'already-exists'; packageId: string; version: string; status: string }
  | { published: true; package: LoadedContentPack; issues: ContentPackPublicationIssue[] }

// The whole pipeline named in this file's header. Never resolves content,
// never binds to a World -- see this file's top-of-file design decisions.
// Knows nothing about importers, previews, or how `candidates` was
// assembled -- that is the caller's (an adapter's) job entirely.
export async function publishContentPack(input: ContentPackPublicationInput): Promise<ContentPackPublicationResult> {
  const identity: ContentPackPublicationIdentity = {
    packageId: input.packageId,
    version: input.version,
    title: input.title,
    license: input.license
  }

  const validation = validateContentPackForPublication(identity, input.candidates)
  const externalWarnings: ContentPackPublicationIssue[] = (input.warnings ?? []).map((message) => ({
    severity: 'warning',
    code: 'external',
    message
  }))
  const issues = [...validation.issues, ...externalWarnings]

  if (!validation.ok) {
    return { published: false, stage: 'validation', issues }
  }

  const manifest = buildContentPackManifest(input)
  const content: ContentPackEntry[] = input.candidates

  const publishResult = await publishContentPackRelease({
    packageId: input.packageId,
    version: input.version,
    title: input.title,
    contentSchemaVersion: manifest.contentSchemaVersion,
    licenseId: input.license.id,
    manifest,
    content
  })

  if (!publishResult.ok) {
    return {
      published: false,
      stage: 'already-exists',
      packageId: publishResult.packageId,
      version: publishResult.version,
      status: publishResult.status
    }
  }

  return { published: true, package: publishResult.package, issues }
}
