import { buildDefaultEntityData } from '../systems'
import { describeClassPrimaryAbility, flattenEntries } from '../content-presentation/dnd5e'
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

// Species/Class Context Content pass -- ROOT CAUSE of "Class descriptions
// sometimes display raw JSON": this function's own generic-object branch
// used to fall back to `JSON.stringify(value, null, 2)` for any shape it
// didn't specifically recognize. Measured against the real XPHB Fighter:
// `primaryAbility` is `[{str:true},{dex:true}]` -- an array of plain
// `{abilityCode: true}` objects that matched NONE of the recognized
// `.entry`/`.entries`/`.items`/`.name+.entries` shapes, so every class's
// own primary-ability field was serialized to literal, visible JSON text
// wherever this value reached a block/meta-line (not a theoretical risk --
// reproduced with real data, see the fixture in this module's own tests).
//
// Fixed at the actual cause in two parts:
// 1. `normalizePrimaryAbility` below no longer routes through this generic
//    function at all for that one semantically-special field -- it reuses
//    content-presentation/dnd5e.ts's own `describeClassPrimaryAbility`,
//    the SAME already-correct, already-used-elsewhere ability-grouping
//    logic the full article/Character Creator presentation already relies
//    on, rather than a second, independent reimplementation of it here.
// 2. This function's own generic fallback, for any OTHER shape neither
//    this function nor a caller specifically recognizes, now delegates to
//    that same module's `flattenEntries` (the established, tested 5etools
//    entries-tree flattener -- handles tables, lists, and named sections;
//    degrades to nothing rather than ever stringifying an object) instead
//    of JSON.stringify. A shape with no recognizable text inside it
//    therefore degrades to an empty contribution, never visible JSON.
//
// Species/Class Context Content pass (owner follow-up, "useful content"
// gap): this function's leaf-string branches used to return a raw
// 5etools string verbatim, `{@tag ...}` markup and all (e.g. a class's
// own top-level `entries` description can embed `{@variantrule...}`/
// `{@condition...}` tags). Now cleaned via the same clean5eText the
// "Class Features"/"Starting Equipment" sections already use (via
// formatEntriesAsMarkdown, in the same shared module) -- one tag-cleaning
// behavior across the whole class description/features pipeline.
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

function extractClasses(payload: any): any[] {
  if (Array.isArray(payload)) return payload
  if (Array.isArray(payload?.class)) return payload.class
  if (Array.isArray(payload?.data?.class)) return payload.data.class
  if (payload?.name) return [payload]
  return []
}

function normalizeHitDie(raw: any): string {
  const hd = raw?.hd
  if (!hd) return ''
  if (typeof hd === 'number' || typeof hd === 'string') return String(hd)
  if (typeof hd === 'object') {
    if (hd.faces) return `d${hd.faces}`
    if (hd.number && hd.faces) return `${hd.number}d${hd.faces}`
  }
  return textify(hd)
}

function normalizePrimaryAbility(raw: any): string {
  return describeClassPrimaryAbility(raw?.primaryAbility)
}

function normalizeProficiencyList(value: any): string {
  if (!value) return ''
  if (Array.isArray(value)) {
    return value.map((item) => textify(item)).filter(Boolean).join(', ')
  }
  return textify(value)
}

function normalizeSavingThrows(raw: any): string {
  return normalizeProficiencyList(raw?.proficiency)
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

function buildClassPreview(raw: any): EldraImportPreviewEntity {
  const name = raw?.name || 'Unnamed Class'
  const source = raw?.source || ''
  const page = raw?.page != null ? String(raw.page) : ''
  const externalId = `${name}__${source || 'unknown'}`
  const slug = slugify(`${name}-${source || 'class'}`)

  const blocks = buildDefaultEntityData('dnd5e', 'class')

  setBlockValue(blocks, 'import_source', 'provider', '5etools-json')
  setBlockValue(blocks, 'import_source', 'external_id', externalId)
  setBlockValue(blocks, 'import_source', 'source_book', source)
  setBlockValue(blocks, 'import_source', 'source_page', page)
  setBlockValue(blocks, 'import_source', 'source_url', '')
  setBlockValue(blocks, 'import_source', 'imported_at', new Date().toISOString())
  setBlockValue(blocks, 'import_source', 'import_version', 'preview')
  setBlockValue(blocks, 'import_source', 'hash', '')
  setBlockValue(blocks, 'import_source', 'raw_json', raw)

  setBlockValue(blocks, 'class_core', 'name', name)
  setBlockValue(blocks, 'class_core', 'hit_die', normalizeHitDie(raw))
  setBlockValue(blocks, 'class_core', 'primary_ability', normalizePrimaryAbility(raw))
  setBlockValue(blocks, 'class_core', 'saving_throws', normalizeSavingThrows(raw))
  setBlockValue(blocks, 'class_core', 'armor_proficiencies', normalizeProficiencyList(raw?.startingProficiencies?.armor))
  setBlockValue(blocks, 'class_core', 'weapon_proficiencies', normalizeProficiencyList(raw?.startingProficiencies?.weapons))
  setBlockValue(blocks, 'class_core', 'tool_proficiencies', normalizeProficiencyList(raw?.startingProficiencies?.tools))
  setBlockValue(blocks, 'class_core', 'description', textify(raw?.entries))

  return {
    systemKey: 'dnd5e',
    entityType: 'class',
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

export function preview5eToolsClasses(payload: any): EldraImportPreviewResult {
  const items = extractClasses(payload).map(buildClassPreview)

  return {
    provider: '5etools-json',
    systemKey: 'dnd5e',
    entityType: 'class',
    count: items.length,
    items,
    warnings: items.length ? [] : ['No classes found']
  }
}
