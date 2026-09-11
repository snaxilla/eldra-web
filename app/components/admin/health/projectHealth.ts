// Pure, framework-free helpers behind the Game Admin "Project Health" tab
// (AdminProjectHealthPanel.vue). Mirrors rulesSummary.ts's own established
// precedent exactly, for the same reason that file states: state
// classification is the one piece of an admin health surface where getting
// it wrong has real consequences (a false "Healthy" hides a real problem;
// a false "Warning" trains a developer to ignore the panel), and this repo
// has no component-rendering test harness -- pulling the decision logic
// into plain functions is what makes it unit-testable at all.
//
// ONLY FOUR STATES EXIST -- this task's own STATUS section: "Do not invent
// additional states." Every classifier below returns exactly one of
// HealthStatus; nothing here ever returns a fifth value.

export type HealthStatus = 'healthy' | 'warning' | 'needs-attention' | 'not-configured'

export type PackageListing = { packageId: string; version: string }

// ---------------------------------------------------------------------------
// Versioning -- a small, self-contained major.minor.patch comparator. Same
// posture as server/utils/content-sources/refresh.ts's own comparator (see
// that file's header): no semver dependency for one shape check, only the
// major.minor.patch PREFIX is read. Duplicated rather than imported from
// refresh.ts because that module is server-only (imports directusService
// Request transitively) and this one must run in the browser -- the two
// copies are already an established pattern in this codebase (rules-
// packages.ts, content-pack-publishing.ts, refresh.ts, and
// AdminContentPackBuilderPanel.vue each carry their own).
// ---------------------------------------------------------------------------

function parseVersionTriple(version: string): [number, number, number] | null {
  const match = /^(\d+)\.(\d+)\.(\d+)/.exec(version)
  if (!match) return null
  return [Number(match[1]), Number(match[2]), Number(match[3])]
}

export function compareVersions(a: string, b: string): number {
  const pa = parseVersionTriple(a)
  const pb = parseVersionTriple(b)
  if (!pa || !pb) return a.localeCompare(b)
  const [aMajor, aMinor, aPatch] = pa
  const [bMajor, bMinor, bPatch] = pb
  if (aMajor !== bMajor) return aMajor - bMajor
  if (aMinor !== bMinor) return aMinor - bMinor
  return aPatch - bPatch
}

// The newest published version for `packageId` among `listings`, or `null`
// when none exist -- a legitimate "unknown" (e.g. the published-packages
// list failed to load, or nothing has ever been published under this id),
// never conflated with "this IS the latest" by a classifier below.
export function latestVersionFor(packageId: string, listings: readonly PackageListing[]): string | null {
  let latest: string | null = null
  for (const listing of listings) {
    if (listing.packageId !== packageId) continue
    if (!latest || compareVersions(listing.version, latest) > 0) latest = listing.version
  }
  return latest
}

// ---------------------------------------------------------------------------
// Rules Package Card
// ---------------------------------------------------------------------------

export type RulesPackageHealth = {
  status: HealthStatus
  activePackageId: string | null
  activeVersion: string | null
  integrityHash: string | null
  latestVersion: string | null
  // `null` means "cannot tell" (no published listing to compare against) --
  // distinct from `false` ("definitely behind"). A classifier never reports
  // `warning` off a `null` comparison; see classifyRulesHealth.
  isLatest: boolean | null
  brokenStage: string | null
}

// `summary` is whatever GET /api/worlds/:id/rules/summary returned
// (server/utils/world-runtime-service.ts's WorldRulesSummary) -- read
// exactly like rulesSummary.ts's own classifyRulesSummary reads it (never
// trusting a malformed/absent response as anything but "not configured").
export function classifyRulesHealth(summary: unknown, publishedListings: readonly PackageListing[]): RulesPackageHealth {
  const notConfigured: RulesPackageHealth = {
    status: 'not-configured',
    activePackageId: null,
    activeVersion: null,
    integrityHash: null,
    latestVersion: null,
    isLatest: null,
    brokenStage: null
  }

  if (!summary || typeof summary !== 'object' || !(summary as Record<string, unknown>).configured) {
    return notConfigured
  }

  const record = summary as Record<string, unknown>

  if (record.ok === false) {
    return {
      status: 'needs-attention',
      activePackageId: null,
      activeVersion: null,
      integrityHash: null,
      latestVersion: null,
      isLatest: null,
      brokenStage: typeof record.stage === 'string' ? record.stage : 'unknown'
    }
  }

  const activePackageId = String(record.packageId ?? '')
  const activeVersion = String(record.packageVersion ?? '')
  const latestVersion = latestVersionFor(activePackageId, publishedListings)
  const isLatest = latestVersion === null ? null : compareVersions(activeVersion, latestVersion) >= 0

  return {
    status: isLatest === false ? 'warning' : 'healthy',
    activePackageId,
    activeVersion,
    integrityHash: typeof record.integrityHash === 'string' ? record.integrityHash : null,
    latestVersion,
    isLatest,
    brokenStage: null
  }
}

// ---------------------------------------------------------------------------
// Content Pack Card
// ---------------------------------------------------------------------------

export type ContentPackHealth = {
  status: HealthStatus
  packageId: string
  boundVersion: string
  // Whether (packageId, boundVersion) actually appears in the published
  // listing at all -- false means the World is bound to a version that no
  // longer resolves (an integrity/version mismatch at bind time, or the
  // publish that produced it was never real), always `needs-attention`.
  publishedVersionExists: boolean
  latestVersion: string | null
  isLatest: boolean | null
  refreshAvailable: boolean
}

export function classifyContentPackHealth(input: {
  packageId: string
  boundVersion: string
  publishedListings: readonly PackageListing[]
  refreshAvailable: boolean
}): ContentPackHealth {
  const { packageId, boundVersion, publishedListings, refreshAvailable } = input

  const publishedVersionExists = publishedListings.some(
    (listing) => listing.packageId === packageId && listing.version === boundVersion
  )
  const latestVersion = latestVersionFor(packageId, publishedListings)

  if (!publishedVersionExists) {
    return {
      status: 'needs-attention',
      packageId,
      boundVersion,
      publishedVersionExists,
      latestVersion,
      isLatest: null,
      refreshAvailable
    }
  }

  const isLatest = latestVersion === null ? null : compareVersions(boundVersion, latestVersion) >= 0

  return {
    status: isLatest === false ? 'warning' : 'healthy',
    packageId,
    boundVersion,
    publishedVersionExists,
    latestVersion,
    isLatest,
    refreshAvailable
  }
}

// ---------------------------------------------------------------------------
// Content Pack -> Refresh target resolution
// ---------------------------------------------------------------------------

export type ContentSourceRegistryLike = readonly {
  key: string
  collections: readonly { key: string; suggestedPackageId: string }[]
}[]

// Maps a bound Content Pack's `packageId` back to the (gameSystemKey,
// collectionKey) pair that could refresh it, via the registry's own
// `suggestedPackageId` -- the exact same identity
// AdminContentPackBuilderPanel.vue's own Refresh section already resolves
// FORWARD from. `null` when no registry entry suggests this exact
// packageId (e.g. it was published under a custom name) -- Refresh is then
// correctly reported unavailable rather than guessed at, since
// content-sources/refresh.ts's own orchestrator needs a real provider, not
// just a packageId.
export function resolveContentSourceForPackageId(
  packageId: string,
  registry: ContentSourceRegistryLike
): { gameSystemKey: string; collectionKey: string } | null {
  for (const system of registry) {
    for (const collection of system.collections) {
      if (collection.suggestedPackageId === packageId) {
        return { gameSystemKey: system.key, collectionKey: collection.key }
      }
    }
  }
  return null
}
