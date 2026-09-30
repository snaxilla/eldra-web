// Character Progression Phase 1C -- the Subclass importer, mirroring
// 5etools-classes.ts's own shape exactly (same externalId/slug formula,
// same textify/setBlockValue helpers restated rather than shared, matching
// this directory's own established "each importer is self-contained"
// convention).
//
// ---------------------------------------------------------------------------
// STABLE IDENTITY -- STRUCTURAL, NEVER PROSE
// ---------------------------------------------------------------------------
// `externalId`/`slug` use the IDENTICAL formula 5etools-classes.ts already
// uses for a class (`${name}__${source}` / slugify(`${name}-${source}`)) --
// both read from native 5etools fields (`name`, `source`), never from
// filename or description prose.
//
// ---------------------------------------------------------------------------
// PARENT CLASS -- STRUCTURAL, NEVER INFERRED FROM NAME
// ---------------------------------------------------------------------------
// `parentClassSlug` is derived from `className`+`classSource` using the
// SAME slug formula the class importer uses for THAT class -- e.g. a
// subclass row `{ className: 'Wizard', classSource: 'XPHB' }` produces
// `parentClassSlug: 'wizard-xphb'`, byte-identical to the slug
// preview5eToolsClasses already assigns the real Wizard (XPHB) class entry.
// This is what lets progression evaluation filter "subclasses whose parent
// is THIS selected class" as a plain string-equality check against an
// already-resolved class slug, with no name parsing on either side.
//
// ---------------------------------------------------------------------------
// SOURCE ASYMMETRY -- SEE THE MEMBERSHIP PREDICATE, NOT THIS FILE
// ---------------------------------------------------------------------------
// This importer does not filter by source/classSource at all -- filtering
// is the membership predicate's job (5etools-dataset.ts's
// `isSubclassFromClassSource`), applied before a raw row ever reaches
// `buildSubclassPreview`. This file only ever normalizes whatever rows it
// is handed.

import { buildDefaultEntityData } from '../systems'
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

function textify(value: any): string {
  if (value == null) return ''
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return String(value)
  }
  if (Array.isArray(value)) {
    return value.map((item) => textify(item)).filter(Boolean).join('\n\n')
  }
  if (typeof value === 'object') {
    if (typeof value.entry === 'string') return value.entry
    if (typeof value.entries === 'string') return value.entries
    if (Array.isArray(value.entries)) return value.entries.map((item: any) => textify(item)).filter(Boolean).join('\n\n')
    if (Array.isArray(value.items)) return value.items.map((item: any) => `- ${textify(item)}`).filter(Boolean).join('\n')
    if (value.name && value.entries) return `## ${value.name}\n\n${textify(value.entries)}`
  }
  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return String(value)
  }
}

function extractSubclasses(payload: any): any[] {
  if (Array.isArray(payload)) return payload
  if (Array.isArray(payload?.subclass)) return payload.subclass
  if (Array.isArray(payload?.data?.subclass)) return payload.data.subclass
  if (payload?.name) return [payload]
  return []
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

// Character Progression Phase 1C's own structural derivation -- see this
// file's header. `className`/`classSource` are native 5etools fields on
// every subclass row (verified against class-wizard.json AND
// class-fighter.json, per the corpus audit); this function invents nothing.
function deriveParentClassSlug(raw: any): string {
  const className = raw?.className || ''
  const classSource = raw?.classSource || ''
  return slugify(`${className}-${classSource || 'class'}`)
}

function buildSubclassPreview(raw: any): EldraImportPreviewEntity {
  const name = raw?.name || 'Unnamed Subclass'
  const source = raw?.source || ''
  const page = raw?.page != null ? String(raw.page) : ''
  const externalId = `${name}__${source || 'unknown'}`
  const slug = slugify(`${name}-${source || 'subclass'}`)
  const parentClassSlug = deriveParentClassSlug(raw)

  const blocks = buildDefaultEntityData('dnd5e', 'subclass')

  setBlockValue(blocks, 'import_source', 'provider', '5etools-json')
  setBlockValue(blocks, 'import_source', 'external_id', externalId)
  setBlockValue(blocks, 'import_source', 'source_book', source)
  setBlockValue(blocks, 'import_source', 'source_page', page)
  setBlockValue(blocks, 'import_source', 'source_url', '')
  setBlockValue(blocks, 'import_source', 'imported_at', new Date().toISOString())
  setBlockValue(blocks, 'import_source', 'import_version', 'preview')
  setBlockValue(blocks, 'import_source', 'hash', '')
  setBlockValue(blocks, 'import_source', 'raw_json', raw)

  setBlockValue(blocks, 'subclass_core', 'name', name)
  setBlockValue(blocks, 'subclass_core', 'class_name', raw?.className || '')
  setBlockValue(blocks, 'subclass_core', 'description', textify(raw?.entries))

  return {
    systemKey: 'dnd5e',
    entityType: 'subclass',
    title: name,
    slug,
    provider: '5etools-json',
    externalId,
    sourceBook: source,
    sourcePage: page,
    blocks,
    raw,
    // Carried through by content-pack-5etools-adapter.ts's own
    // toContentPublicationCandidate -- see that function and
    // content-pack-publishing.ts's own ContentPublicationCandidate.parentClassSlug
    // doc comment.
    parentClassSlug
  }
}

export function preview5eToolsSubclasses(payload: any): EldraImportPreviewResult {
  const items = extractSubclasses(payload).map(buildSubclassPreview)

  return {
    provider: '5etools-json',
    systemKey: 'dnd5e',
    entityType: 'subclass',
    count: items.length,
    items,
    warnings: items.length ? [] : ['No subclasses found']
  }
}
