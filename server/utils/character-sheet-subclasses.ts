import { readFile, readdir } from 'node:fs/promises'
import { join } from 'node:path'
import { directusServiceRequest } from './directus'
import { loadActiveCharacterSheet } from './character-sheet-inventory'

const CLASS_DATA_DIR = '/opt/eldra/datasets/5etools-src/data/class'

function cleanText(value: any) {
  return String(value ?? '').trim()
}

function normalizeKey(value: any) {
  return cleanText(value)
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function slugify(value: any) {
  return normalizeKey(value).replace(/\s+/g, '-')
}

async function readJsonFile(file: string) {
  return JSON.parse(await readFile(file, 'utf8'))
}

async function loadLinkedClassData(sheet: any) {
  const classId = sheet?.class_entity_id ?? sheet?.classEntityId

  if (!classId) {
    return {
      entity: null,
      raw: null
    }
  }

  try {
    const entityRes = await directusServiceRequest(`/items/entities/${classId}?fields=id,title,slug`)
    const params = new URLSearchParams()
    params.set('filter[entity_id][_eq]', String(classId))
    params.set('fields', 'block_key,data')
    params.set('limit', '-1')

    const blocksRes = await directusServiceRequest(`/items/block_instances?${params.toString()}`)
    const blocks = Array.isArray(blocksRes?.data) ? blocksRes.data : []
    const importBlock = blocks.find((block: any) => String(block?.block_key || '') === 'import_source')
    const raw = importBlock?.data?.raw_json || null

    return {
      entity: entityRes?.data || null,
      raw
    }
  } catch {
    return {
      entity: null,
      raw: null
    }
  }
}

function subclassTitle(raw: any) {
  return cleanText(raw?.name || raw?.shortName || raw?.subclassName || 'Subclass')
}

function subclassDescription(raw: any) {
  if (typeof raw?.entries === 'string') return raw.entries.trim()

  if (Array.isArray(raw?.entries)) {
    return raw.entries
      .map((entry: any) => {
        if (typeof entry === 'string') return entry
        if (entry?.name && Array.isArray(entry?.entries)) {
          return `${entry.name}: ${entry.entries.map((item: any) => typeof item === 'string' ? item : '').filter(Boolean).join(' ')}`
        }
        return ''
      })
      .filter(Boolean)
      .join('\n\n')
      .trim()
  }

  return ''
}

function sourcePriority(source: any) {
  const key = cleanText(source).toUpperCase()
  const order = ['XPHB', 'PHB', 'TCE', 'XGE', 'DMG', 'SCAG', 'EGW']
  const index = order.indexOf(key)
  return index >= 0 ? index : order.length
}

async function classDataFilesForClass(className: string) {
  const files = await readdir(CLASS_DATA_DIR)
  const slug = slugify(className)
  const direct = `class-${slug}.json`

  const ordered = [
    direct,
    ...files.filter((file) => file.startsWith('class-') && file.endsWith('.json') && file !== direct)
  ]

  return Array.from(new Set(ordered))
    .filter((file) => file !== 'index.json' && file !== 'foundry.json')
    .map((file) => join(CLASS_DATA_DIR, file))
}

export async function loadSubclassOptionsForSheet(worldId: string, entityId: string) {
  const sheet = await loadActiveCharacterSheet(worldId, entityId)
  const linked = await loadLinkedClassData(sheet)
  const className = cleanText(
    linked.raw?.name ||
    linked.entity?.title ||
    sheet?.class_name ||
    sheet?.className
  )
  const preferredSource = cleanText(linked.raw?.source || sheet?.class_source || sheet?.classSource).toUpperCase()

  if (!className) {
    return {
      className: '',
      preferredSource,
      count: 0,
      subclasses: []
    }
  }

  const classKey = normalizeKey(className)
  const subclasses: any[] = []
  const seen = new Set<string>()

  for (const file of await classDataFilesForClass(className)) {
    let json: any

    try {
      json = await readJsonFile(file)
    } catch {
      continue
    }

    const rawSubclasses = Array.isArray(json?.subclass) ? json.subclass : []

    for (const raw of rawSubclasses) {
      const rawClassName = cleanText(raw?.className || raw?.class_name)

      if (rawClassName && normalizeKey(rawClassName) !== classKey) {
        continue
      }

      const name = subclassTitle(raw)
      if (!name) continue

      const source = cleanText(raw?.source || '')
      const classSource = cleanText(raw?.classSource || raw?.class_source || '')
      const key = `${normalizeKey(name)}|${source}|${classSource}`

      if (seen.has(key)) continue
      seen.add(key)

      const recommended = Boolean(
        !preferredSource ||
        source.toUpperCase() === preferredSource ||
        classSource.toUpperCase() === preferredSource
      )

      subclasses.push({
        name,
        shortName: cleanText(raw?.shortName || ''),
        source,
        classSource,
        recommended,
        page: raw?.page ?? null,
        featureCount: Array.isArray(raw?.subclassFeatures) ? raw.subclassFeatures.length : 0,
        description: subclassDescription(raw)
      })
    }
  }

  subclasses.sort((a, b) => {
    if (a.recommended !== b.recommended) return a.recommended ? -1 : 1

    const sourceSort = sourcePriority(a.source) - sourcePriority(b.source)
    if (sourceSort !== 0) return sourceSort

    return a.name.localeCompare(b.name)
  })

  return {
    className,
    preferredSource,
    count: subclasses.length,
    subclasses
  }
}
