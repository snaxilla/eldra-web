// Content Studio Browse -- query parsing, filtering, and pagination.
// Content Workspaces & Studio Phase 2 (§12.2).
//
// Pure: no I/O, no Vue, no Directus, and NO GAME SYSTEM. It operates on
// the catalogue projection `getWorldContentCatalogue` already produces
// (server/utils/world-content-catalogue.ts), so Studio reads exactly what
// the gameplay surfaces read -- there is no second data pipeline here.
// Adding a category to the catalogue adds it to Studio with no change
// below; nothing here names a game system, an entity type literal, or a
// 5etools field.
//
// IT MINTS NOTHING. Browsing legacy content persists nothing and creates
// no identity: a row without a `contentEntityId` is addressed by its
// stable, lineage-scoped legacy address instead (§7.3). That address is
// computed for display and lookup only.

import { legacyAddress } from '../../../lib/content-identity'
import type { PresentationEntry } from '../../../lib/content-presentation'

// The catalogue's own category keys. Derived from the projection rather
// than restated as a game-specific list.
export const STUDIO_CATEGORY_KEYS = [
  'species',
  'classes',
  'backgrounds',
  'feats',
  'items',
  'spells',
  'monsters',
  'subclasses',
  'featureOptions'
] as const

export type StudioCategoryKey = (typeof STUDIO_CATEGORY_KEYS)[number]

// Display labels live with the keys so the panel does not invent its own.
export const STUDIO_CATEGORY_LABELS: Readonly<Record<StudioCategoryKey, string>> = {
  species: 'Species',
  classes: 'Classes',
  backgrounds: 'Backgrounds',
  feats: 'Feats',
  items: 'Items',
  spells: 'Spells',
  monsters: 'Monsters',
  subclasses: 'Subclasses',
  featureOptions: 'Feature options'
}

export const STUDIO_DEFAULT_LIMIT = 25
export const STUDIO_MAX_LIMIT = 100

export type StudioImageFilter = 'any' | 'with-image' | 'without-image'

export type StudioSearchQuery = {
  q: string
  categories: StudioCategoryKey[]
  packageIds: string[]
  image: StudioImageFilter
  limit: number
  offset: number
}

export const EMPTY_STUDIO_QUERY: StudioSearchQuery = {
  q: '',
  categories: [],
  packageIds: [],
  image: 'any',
  limit: STUDIO_DEFAULT_LIMIT,
  offset: 0
}

function isCategoryKey(value: unknown): value is StudioCategoryKey {
  return typeof value === 'string' && (STUDIO_CATEGORY_KEYS as readonly string[]).includes(value)
}

// Accepts either repeated params or one comma-separated value, which is
// what a URL built by hand and one built by the panel each produce.
function readList(raw: unknown): string[] {
  const values = Array.isArray(raw) ? raw : [raw]
  const out: string[] = []
  for (const value of values) {
    if (typeof value !== 'string') continue
    for (const part of value.split(',')) {
      const trimmed = part.trim()
      if (trimmed && !out.includes(trimmed)) out.push(trimmed)
    }
  }
  return out
}

function readBoundedInteger(raw: unknown, fallback: number, min: number, max: number, problems: string[], name: string): number {
  if (raw === undefined || raw === null || raw === '') return fallback
  const text = Array.isArray(raw) ? String(raw[0]) : String(raw)
  if (!/^\d+$/.test(text)) {
    problems.push(`${name} must be a whole number`)
    return fallback
  }
  const value = Number(text)
  if (value < min || value > max) {
    problems.push(`${name} must be between ${min} and ${max}`)
    return fallback
  }
  return value
}

export type ParsedStudioQuery = { ok: true; value: StudioSearchQuery } | { ok: false; problems: string[] }

export function parseStudioSearchQuery(raw: Record<string, unknown>): ParsedStudioQuery {
  const problems: string[] = []

  const q = typeof raw.q === 'string' ? raw.q.trim().slice(0, 120) : ''

  const categories: StudioCategoryKey[] = []
  for (const value of readList(raw.category ?? raw.categories)) {
    if (isCategoryKey(value)) categories.push(value)
    else problems.push(`'${value}' is not a content category`)
  }

  const packageIds = readList(raw.packageId ?? raw.packageIds)

  let image: StudioImageFilter = 'any'
  if (raw.image !== undefined && raw.image !== '') {
    if (raw.image === 'any' || raw.image === 'with-image' || raw.image === 'without-image') image = raw.image
    else problems.push("image must be 'any', 'with-image', or 'without-image'")
  }

  const limit = readBoundedInteger(raw.limit, STUDIO_DEFAULT_LIMIT, 1, STUDIO_MAX_LIMIT, problems, 'limit')
  const offset = readBoundedInteger(raw.offset, 0, 0, 1_000_000, problems, 'offset')

  if (problems.length) return { ok: false, problems }
  return { ok: true, value: { q, categories, packageIds, image, limit, offset } }
}

// ---------------------------------------------------------------------------
// Search
// ---------------------------------------------------------------------------

// Only what Studio Browse needs. Deliberately not the whole catalogue
// entry: `data` is already stripped by the catalogue projection, and raw
// JSON is never Studio's interface.
export type StudioResultRow = {
  address: string
  contentEntityId: string | null
  category: StudioCategoryKey
  title: string
  slug: string
  systemKey: string
  entityType: string
  packageId: string
  packageVersion: string
  provider: string
  sourceBook: string | null
  sourcePage: string | null
  imageUrl: string | null
  description: string | null
  // The catalogue already computed this for every entry; carrying it
  // through on the PAGE SLICE only lets the detail rail reuse
  // ContentPresentationPanel.vue -- the same renderer the Character
  // Sheet and Builder use -- instead of Studio growing a second
  // presentation path. Null for a category the resolver does not
  // present (monsters, feats, subclasses today).
  presentation: PresentationEntry | null
  // Pass A has no override channels, so nothing is customized yet. The
  // field exists so the row shape does not change when they arrive.
  customized: boolean
}

type CatalogueEntryLike = {
  packageId?: unknown
  packageVersion?: unknown
  systemKey?: unknown
  title?: unknown
  slug?: unknown
  provider?: unknown
  sourceBook?: unknown
  sourcePage?: unknown
  contentEntityId?: unknown
  presentation?: (PresentationEntry & { image?: { url?: unknown } | null }) | null
}

type CatalogueLike = Partial<Record<StudioCategoryKey, readonly CatalogueEntryLike[]>>

// The catalogue groups by category; the entity type is per category and
// is what the legacy address needs. Taken from the catalogue's own
// grouping, not re-derived from any system's vocabulary.
const ENTITY_TYPE_BY_CATEGORY: Readonly<Record<StudioCategoryKey, string>> = {
  species: 'species',
  classes: 'class',
  backgrounds: 'background',
  feats: 'feat',
  items: 'item',
  spells: 'spell',
  monsters: 'enemy',
  subclasses: 'subclass',
  featureOptions: 'featureOption'
}

function text(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function optionalText(value: unknown): string | null {
  return typeof value === 'string' && value ? value : null
}

function firstParagraph(presentation: CatalogueEntryLike['presentation']): string | null {
  const description = presentation?.description
  if (!Array.isArray(description)) return null
  const paragraph = description.find((entry) => typeof entry === 'string' && entry.trim())
  return typeof paragraph === 'string' ? paragraph.trim() : null
}

function toRow(entry: CatalogueEntryLike, category: StudioCategoryKey): StudioResultRow | null {
  const packageId = text(entry.packageId)
  const slug = text(entry.slug)
  const systemKey = text(entry.systemKey)
  const entityType = ENTITY_TYPE_BY_CATEGORY[category]

  let address: string
  try {
    address = legacyAddress({ packageId, systemKey, entityType, slug })
  } catch {
    // An entry whose address cannot be formed is not browseable by a
    // stable address, and inventing one would be the exact guess this
    // design forbids. Skipped rather than shown under a fabricated id.
    return null
  }

  const contentEntityId = typeof entry.contentEntityId === 'string' ? entry.contentEntityId : null

  return {
    address,
    contentEntityId,
    category,
    title: text(entry.title),
    slug,
    systemKey,
    entityType,
    packageId,
    packageVersion: text(entry.packageVersion),
    provider: text(entry.provider),
    sourceBook: optionalText(entry.sourceBook),
    sourcePage: optionalText(entry.sourcePage),
    imageUrl: optionalText(entry.presentation?.image?.url),
    description: firstParagraph(entry.presentation),
    presentation: (entry.presentation as PresentationEntry | null) ?? null,
    customized: false
  }
}

export type StudioFacet = { key: string; label: string; count: number }

export type StudioSearchResult = {
  rows: StudioResultRow[]
  total: number
  limit: number
  offset: number
  categoryFacets: StudioFacet[]
  packageFacets: StudioFacet[]
}

function matchesQuery(row: StudioResultRow, needle: string): boolean {
  if (!needle) return true
  const haystack = `${row.title} ${row.slug} ${row.sourceBook ?? ''}`.toLowerCase()
  return haystack.includes(needle)
}

function matchesImage(row: StudioResultRow, filter: StudioImageFilter): boolean {
  if (filter === 'with-image') return row.imageUrl !== null
  if (filter === 'without-image') return row.imageUrl === null
  return true
}

// Facet counts reflect every OTHER active filter but not the facet's own
// dimension, so selecting one category does not drive the remaining
// categories' counts to zero and make the rail unusable.
function countFacet(rows: readonly StudioResultRow[], key: (row: StudioResultRow) => string): Map<string, number> {
  const counts = new Map<string, number>()
  for (const row of rows) counts.set(key(row), (counts.get(key(row)) ?? 0) + 1)
  return counts
}

export function runStudioSearch(catalogue: CatalogueLike, query: StudioSearchQuery): StudioSearchResult {
  const all: StudioResultRow[] = []
  for (const category of STUDIO_CATEGORY_KEYS) {
    for (const entry of catalogue[category] ?? []) {
      const row = toRow(entry, category)
      if (row) all.push(row)
    }
  }

  const needle = query.q.toLowerCase()
  const categorySet = new Set(query.categories)
  const packageSet = new Set(query.packageIds)

  const textAndImage = all.filter((row) => matchesQuery(row, needle) && matchesImage(row, query.image))
  const forCategoryFacets = textAndImage.filter((row) => packageSet.size === 0 || packageSet.has(row.packageId))
  const forPackageFacets = textAndImage.filter((row) => categorySet.size === 0 || categorySet.has(row.category))

  const matched = forCategoryFacets.filter((row) => categorySet.size === 0 || categorySet.has(row.category))

  matched.sort((a, b) => a.title.localeCompare(b.title) || a.address.localeCompare(b.address))

  const categoryCounts = countFacet(forCategoryFacets, (row) => row.category)
  const packageCounts = countFacet(forPackageFacets, (row) => row.packageId)

  return {
    rows: matched.slice(query.offset, query.offset + query.limit),
    total: matched.length,
    limit: query.limit,
    offset: query.offset,
    categoryFacets: STUDIO_CATEGORY_KEYS
      .map((key) => ({ key, label: STUDIO_CATEGORY_LABELS[key], count: categoryCounts.get(key) ?? 0 }))
      .filter((facet) => facet.count > 0),
    packageFacets: [...packageCounts.entries()]
      .map(([key, count]) => ({ key, label: key, count }))
      .sort((a, b) => a.key.localeCompare(b.key))
  }
}
