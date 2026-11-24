import { buildDefaultEntityData } from '../systems'
import { flattenEntries } from '../content-presentation/dnd5e'
import { clean5eText } from '../world-entity-collection/catalogue-article-markdown'
import type {
  EldraImportPreviewEntity,
  EldraImportPreviewResult
} from './types'

function slugify(input: string) {
  return String(input || '')
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

// Species/Class Context Content pass -- same hardening as the identical
// `textify` in app/lib/importers/5etools-classes.ts (see that file's own
// comment for the reproduced root cause): the generic-object fallback here
// used to JSON.stringify any unrecognized shape. Delegates to
// content-presentation/dnd5e.ts's own established, tested `flattenEntries`
// instead (handles tables/lists/named sections, degrades to nothing for a
// genuinely unrecognized shape) rather than a second, independent
// reimplementation of that same flattening logic.
// Species/Class Context Content pass (owner follow-up, "useful content"
// gap): this function's own leaf-string branches used to return a raw
// 5etools string verbatim, `{@tag ...}` markup and all -- confirmed
// against the real XPHB Elf's own Darkvision/Fey Ancestry/Keen Senses/
// Trance trait text, every one of which embeds at least one `{@sense...}`/
// `{@variantrule...}`/`{@condition...}`/`{@skill...}` tag. Now cleaned via
// the SAME clean5eText the "Class Features"/"Starting Equipment" sections
// already use (via formatEntriesAsMarkdown, in the same shared module) --
// one tag-cleaning behavior across the whole traits/features pipeline,
// not a second, slightly different one introduced here.
function textify(value: any): string {
  if (value == null) return ''
  if (typeof value === 'string') return clean5eText(value)
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value)
  }
  if (Array.isArray(value)) {
    return value.map((item) => textify(item)).filter(Boolean).join('\n\n')
  }
  if (typeof value === 'object') {
    if (typeof value.entry === 'string') return clean5eText(value.entry)
    if (typeof value.entries === 'string') return clean5eText(value.entries)
    if (Array.isArray(value.entries)) return value.entries.map((item) => textify(item)).filter(Boolean).join('\n\n')
    if (Array.isArray(value.items)) return value.items.map((item) => `- ${textify(item)}`).filter(Boolean).join('\n')
    if (value.name && value.entries) return `## ${clean5eText(value.name)}\n\n${textify(value.entries)}`
  }
  return flattenEntries(value).join('\n\n')
}

function extractSpecies(payload: any): any[] {
  if (Array.isArray(payload)) return payload
  if (Array.isArray(payload?.race)) return payload.race
  if (Array.isArray(payload?.species)) return payload.species
  if (Array.isArray(payload?.data?.race)) return payload.data.race
  if (payload?.name) return [payload]
  return []
}

function normalizeSize(raw: any): string {
  return textify(raw?.size)
}

function normalizeSpeed(raw: any): string {
  const speed = raw?.speed
  if (typeof speed === 'number' || typeof speed === 'string') return String(speed)
  if (speed && typeof speed === 'object') {
    return Object.entries(speed).map(([k, v]) => `${k}: ${v}`).join(', ')
  }
  return ''
}

function normalizeAbility(raw: any): string {
  const ability = raw?.ability
  if (!ability) return ''
  if (Array.isArray(ability)) {
    return ability.map((a) => textify(a)).join('\n')
  }
  return textify(ability)
}

function setBlockValue(
  blocks: EldraImportPreviewEntity['blocks'],
  blockKey: string,
  fieldKey: string,
  value: any
) {
  const block = blocks.find((item) => item.blockKey === blockKey)
  if (!block || !block.data) return
  block.data[fieldKey] = value
}

function buildSpeciesPreview(raw: any): EldraImportPreviewEntity {
  const name = raw?.name || 'Unnamed Species'
  const source = raw?.source || ''
  const page = raw?.page != null ? String(raw.page) : ''
  const externalId = `${name}__${source || 'unknown'}`
  const slug = slugify(`${name}-${source || 'species'}`)

  const blocks = buildDefaultEntityData('dnd5e', 'species')

  setBlockValue(blocks, 'import_source', 'provider', '5etools-json')
  setBlockValue(blocks, 'import_source', 'external_id', externalId)
  setBlockValue(blocks, 'import_source', 'source_book', source)
  setBlockValue(blocks, 'import_source', 'source_page', page)
  setBlockValue(blocks, 'import_source', 'source_url', '')
  setBlockValue(blocks, 'import_source', 'imported_at', new Date().toISOString())
  setBlockValue(blocks, 'import_source', 'import_version', 'preview')
  setBlockValue(blocks, 'import_source', 'hash', '')
  setBlockValue(blocks, 'import_source', 'raw_json', raw)

  setBlockValue(blocks, 'species_core', 'name', name)
  setBlockValue(blocks, 'species_core', 'size', normalizeSize(raw))
  setBlockValue(blocks, 'species_core', 'speed', normalizeSpeed(raw))
  setBlockValue(blocks, 'species_core', 'ability_score_increase', normalizeAbility(raw))
  // --- Traits ---
const namedTraitEntries = Array.isArray(raw?.entries)
  ? raw.entries.filter((e: any) => e?.type === 'entries' && e?.name && e?.entries)
  : []

const traitSections = namedTraitEntries
  .map((e: any) => `## ${e.name}\n\n${textify(e.entries)}`)
  .join('\n\n')

setBlockValue(blocks, 'species_core', 'traits', traitSections)
// Species/Class Context Content pass -- the rail's own "Traits" meta line
// (server/utils/entity-collection-summary.ts's collectionSummaryMetaLines,
// `core.rawTraitCount || core.trait_count`) read a field this importer
// never actually set, so it was silently always empty. The count of the
// SAME named trait sections `traits` above is built from -- not a second,
// independently-derived count that could disagree with what `traits`
// itself contains.
setBlockValue(blocks, 'species_core', 'trait_count', namedTraitEntries.length)

// --- Description (fluff) ---
let description = ''

try {
  const fluffData = require('/opt/eldra/datasets/5etools-src/data/fluff-races.json')

  const match = (fluffData?.race || []).find(
    (r: any) =>
      r?.name === raw?.name &&
      r?.source === raw?.source
  )

  if (match?.entries) {
    description = textify(match.entries)
  }
} catch (err) {}

if (description) {
  setBlockValue(blocks, 'species_core', 'description', description)
}

  return {
    systemKey: 'dnd5e',
    entityType: 'species',
    title: name,
    slug,
    provider: '5etools-json',
    externalId,
    sourceBook: source,
    sourcePage: page,
    blocks,
    raw
  }
}

export function preview5eToolsSpecies(payload: any): EldraImportPreviewResult {
  const items = extractSpecies(payload).map(buildSpeciesPreview)

  return {
    provider: '5etools-json',
    systemKey: 'dnd5e',
    entityType: 'species',
    count: items.length,
    items,
    warnings: items.length ? [] : ['No species found']
  }
}
