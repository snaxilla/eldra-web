// Canonical content identity -- Content Workspaces & Studio, Phase 1.
// Design: .github/docs/architecture/content-workspaces-and-studio.md §7
// (identity rules) and §8.2 (identity keys).
//
// Pure: no I/O, no Directus, no game system. This module only NAMES
// things; nothing in it selects a winner or collapses entries (that is
// the Phase 5 resolver, which consumes `evidenceKeys`).
//
// The one rule everything here serves: identity is DECLARED, never
// inferred. A matching slug, title, or name-derived externalId is not
// evidence of anything, so no function below ever emits a key from them
// without the owning packageId in it.

// ---------------------------------------------------------------------------
// contentEntityId
// ---------------------------------------------------------------------------

const BASE32_ALPHABET = 'abcdefghijklmnopqrstuvwxyz234567'
const CONTENT_ENTITY_ID_PATTERN = /^ce_[a-z2-7]{26}$/
const RANDOM_BYTE_COUNT = 16

function defaultRandomBytes(count: number): Uint8Array {
  return globalThis.crypto.getRandomValues(new Uint8Array(count))
}

// 128 random bits as 26 lowercase base32 characters. Deliberately neither
// a content hash nor derived from externalId: both would change exactly
// when identity must not.
export function mintContentEntityId(randomBytes: (count: number) => Uint8Array = defaultRandomBytes): string {
  const bytes = randomBytes(RANDOM_BYTE_COUNT)
  if (bytes.length !== RANDOM_BYTE_COUNT) {
    throw new Error(`mintContentEntityId needs exactly ${RANDOM_BYTE_COUNT} random bytes, got ${bytes.length}`)
  }

  let bits = 0
  let bitCount = 0
  let encoded = ''

  for (const byte of bytes) {
    bits = (bits << 8) | byte
    bitCount += 8
    while (bitCount >= 5) {
      encoded += BASE32_ALPHABET[(bits >>> (bitCount - 5)) & 31]
      bitCount -= 5
    }
    bits &= (1 << bitCount) - 1
  }

  if (bitCount > 0) {
    encoded += BASE32_ALPHABET[(bits << (5 - bitCount)) & 31]
  }

  return `ce_${encoded}`
}

export function isContentEntityId(value: unknown): value is string {
  return typeof value === 'string' && CONTENT_ENTITY_ID_PATTERN.test(value)
}

// ---------------------------------------------------------------------------
// Address segments
// ---------------------------------------------------------------------------

// Same shape content-pack-publishing.ts already requires of a packageId.
const PACKAGE_ID_PATTERN = /^[a-z0-9][a-z0-9-]*(\.[a-z0-9][a-z0-9-]*)+$/
const MAX_SEGMENT_LENGTH = 200

export function isPackageId(value: unknown): value is string {
  return typeof value === 'string' && value.length <= MAX_SEGMENT_LENGTH && PACKAGE_ID_PATTERN.test(value)
}

// A segment of an address (`systemKey`, `entityType`, `slug`). Permissive
// on purpose -- every slug already published must stay addressable -- but
// it can never contain the `::` separator or whitespace, which is what
// keeps an address unambiguous to split.
export function isAddressSegment(value: unknown): value is string {
  return typeof value === 'string'
    && value.length > 0
    && value.length <= MAX_SEGMENT_LENGTH
    && !/\s/.test(value)
    && !value.includes('::')
}

// ---------------------------------------------------------------------------
// Legacy compatibility address (§7.3) -- always lineage-scoped
// ---------------------------------------------------------------------------

export type LegacyBaseRef = {
  packageId: string
  systemKey: string
  entityType: string
  slug: string
}

export function isLegacyBaseRef(value: unknown): value is LegacyBaseRef {
  if (!value || typeof value !== 'object') return false
  const ref = value as Record<string, unknown>
  return isPackageId(ref.packageId)
    && isAddressSegment(ref.systemKey)
    && isAddressSegment(ref.entityType)
    && isAddressSegment(ref.slug)
}

// The formula content-pack-publishing.ts's candidateIdentityKey uses for
// duplicate detection INSIDE one pack. Exposed so a test can pin the two
// together; it is never an identity across packages.
export function intraPackIdentityKey(systemKey: string, entityType: string, slug: string): string {
  return `${systemKey}::${entityType}::${slug}`
}

export function legacyAddress(ref: LegacyBaseRef): string {
  if (!isLegacyBaseRef(ref)) {
    throw new Error('legacyAddress needs a well-formed { packageId, systemKey, entityType, slug }')
  }
  return `legacy:${ref.packageId}::${intraPackIdentityKey(ref.systemKey, ref.entityType, ref.slug)}`
}

export function parseLegacyAddress(address: string): LegacyBaseRef | null {
  if (typeof address !== 'string' || !address.startsWith('legacy:')) return null
  const parts = address.slice('legacy:'.length).split('::')
  if (parts.length !== 4) return null
  const [packageId, systemKey, entityType, slug] = parts as [string, string, string, string]
  const ref = { packageId, systemKey, entityType, slug }
  return isLegacyBaseRef(ref) ? ref : null
}

// ---------------------------------------------------------------------------
// Structured source references
// ---------------------------------------------------------------------------

// Where an accepted base came from. `packageId`/`version` are present when
// it was read from a published release; `collection` when it was read
// straight from a provider. Recorded from what the importer OBSERVED.
export type BaseSourceRef = {
  provider: string
  externalId: string
  packageId?: string
  version?: string
  collection?: { gameSystemKey: string; collectionKey: string }
  sourceBook?: string
  sourcePage?: string
  // Carried so attribution survives curation (R7): the license of the
  // release or collection the base was read from, and the adapter that
  // produced it.
  license?: { id: string; notice?: string; attribution?: string }
  origin?: { adapterId?: string; sourceId?: string }
}

export type CuratedFromRef = {
  packageId: string
  version: string
  externalId: string
  slug: string
  baseDataHash: string
}

export function validateBaseSourceRef(value: unknown): string[] {
  const problems: string[] = []
  if (!value || typeof value !== 'object') return ['base source ref must be an object']
  const ref = value as Record<string, unknown>

  if (typeof ref.provider !== 'string' || !ref.provider) problems.push('provider is required')
  if (typeof ref.externalId !== 'string' || !ref.externalId) problems.push('externalId is required')

  const hasPackage = ref.packageId !== undefined || ref.version !== undefined
  if (hasPackage) {
    if (!isPackageId(ref.packageId)) problems.push('packageId is malformed')
    if (typeof ref.version !== 'string' || !/^\d+\.\d+\.\d+/.test(ref.version)) problems.push('version is malformed')
  }

  if (ref.collection !== undefined) {
    const collection = ref.collection as Record<string, unknown> | null
    if (!collection || !isAddressSegment(collection.gameSystemKey) || !isAddressSegment(collection.collectionKey)) {
      problems.push('collection must name a gameSystemKey and a collectionKey')
    }
  }

  if (!hasPackage && ref.collection === undefined) {
    problems.push('a base source ref must name either a published release or a provider collection')
  }

  return problems
}

// ---------------------------------------------------------------------------
// Identity keys (§8.2)
// ---------------------------------------------------------------------------

// The fields of an entry that carry identity. Deliberately excludes
// title, externalId, and sourceBook: they are not identity.
export type IdentityCarrier = {
  packageId: string
  systemKey: string
  entityType: string
  slug: string
  contentEntityId?: string
  baseRefs?: readonly LegacyBaseRef[]
  slugAliases?: readonly string[]
  curatedFrom?: Pick<CuratedFromRef, 'packageId' | 'slug'>
}

// Which lineages a lineage explicitly declares it supersedes (E4).
export type LineageIndex = {
  supersededBy(packageId: string): readonly string[]
}

export const EMPTY_LINEAGE_INDEX: LineageIndex = { supersededBy: () => [] }

export function lineageIndexFrom(supersedes: Readonly<Record<string, readonly string[]>>): LineageIndex {
  return { supersededBy: (packageId) => supersedes[packageId] ?? [] }
}

export function primaryKey(entry: IdentityCarrier): string {
  if (entry.contentEntityId !== undefined) {
    if (!isContentEntityId(entry.contentEntityId)) {
      throw new Error(`Malformed contentEntityId '${entry.contentEntityId}'`)
    }
    return `ce:${entry.contentEntityId}`
  }
  return legacyAddress(entry)
}

// Every key an entry EXPLICITLY claims. One branch per evidence kind in
// §7.4's closed list; there is no heuristic branch.
export function evidenceKeys(entry: IdentityCarrier, lineages: LineageIndex = EMPTY_LINEAGE_INDEX): string[] {
  const keys = new Set<string>([primaryKey(entry)])
  const address = (packageId: string, slug: string) =>
    legacyAddress({ packageId, systemKey: entry.systemKey, entityType: entry.entityType, slug })

  // E1 is primaryKey itself. A ce-keyed entry also claims its own
  // lineage-scoped address, so it collapses onto its predecessor release.
  if (entry.contentEntityId !== undefined) keys.add(address(entry.packageId, entry.slug))

  // E2
  if (entry.curatedFrom) keys.add(address(entry.curatedFrom.packageId, entry.curatedFrom.slug))

  // E3 -- a ref for another system or entity type claims nothing here.
  for (const ref of entry.baseRefs ?? []) {
    if (!isLegacyBaseRef(ref)) throw new Error('Malformed baseRefs entry')
    if (ref.systemKey === entry.systemKey && ref.entityType === entry.entityType) {
      keys.add(address(ref.packageId, ref.slug))
    }
  }

  // E5 -- this entry's own lineage only.
  for (const alias of entry.slugAliases ?? []) keys.add(address(entry.packageId, alias))

  // E4 -- for this entry's slug and aliases only.
  for (const superseded of lineages.supersededBy(entry.packageId)) {
    keys.add(address(superseded, entry.slug))
    for (const alias of entry.slugAliases ?? []) keys.add(address(superseded, alias))
  }

  return [...keys]
}

export function sharesEvidence(a: IdentityCarrier, b: IdentityCarrier, lineages: LineageIndex = EMPTY_LINEAGE_INDEX): boolean {
  const keysOfA = new Set(evidenceKeys(a, lineages))
  return evidenceKeys(b, lineages).some((key) => keysOfA.has(key))
}
