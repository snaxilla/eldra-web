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

function clean5eInlineText(value: any) {
  return cleanText(value)
    .replace(/\{@(?:filter|spell|item|creature|class|race|variantrule|condition|skill|action|sense|damage|book|hazard|reward|feat|classFeature|subclassFeature|optionalfeature|status)\s+([^|}]+)(?:\|[^}]*)?\}/g, '$1')
    .replace(/\{@dice\s+([^|}]+)(?:\|[^}]*)?\}/g, '$1')
    .replace(/\{@damage\s+([^|}]+)(?:\|[^}]*)?\}/g, '$1')
    .replace(/\{@hit\s+([^|}]+)(?:\|[^}]*)?\}/g, '$1')
    .replace(/\{@dc\s+([^|}]+)(?:\|[^}]*)?\}/g, 'DC $1')
    .replace(/\{@[a-zA-Z]+\s+([^|}]+)(?:\|[^}]*)?\}/g, '$1')
    .replace(/\s+/g, ' ')
    .trim()
}

function entriesToText(value: any): string {
  if (value === null || value === undefined) return ''

  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return clean5eInlineText(value)
  }

  if (Array.isArray(value)) {
    return value
      .map((item) => entriesToText(item))
      .filter(Boolean)
      .join('\n\n')
      .trim()
  }

  if (typeof value === 'object') {
    const parts: string[] = []

    if (value.name) {
      parts.push(`## ${clean5eInlineText(value.name)}`)
    }

    if (typeof value.entry === 'string') {
      parts.push(clean5eInlineText(value.entry))
    }

    if (Array.isArray(value.entries)) {
      parts.push(entriesToText(value.entries))
    }

    if (Array.isArray(value.items)) {
      parts.push(
        value.items
          .map((item: any) => `- ${entriesToText(item)}`)
          .filter(Boolean)
          .join('\n')
      )
    }

    return parts.filter(Boolean).join('\n\n').trim()
  }

  return ''
}

function parseSubclassFeatureRef(ref: any) {
  const rawRef = typeof ref === 'string'
    ? ref
    : cleanText(ref?.subclassFeature || ref?.classFeature || ref?.name || '')

  const parts = rawRef.split('|').map((part) => part.trim())
  const name = parts[0] || ''
  const className = parts[1] || ''
  const classSource = parts[2] || ''
  const levelRaw = parts[3] || ''
  const source = parts[4] || ''

  const level = Number(levelRaw)

  return {
    rawRef,
    name,
    className,
    classSource,
    level: Number.isFinite(level) ? level : null,
    source
  }
}

function featureMatchesRef(feature: any, ref: any, subclass: any) {
  const featureName = normalizeKey(feature?.name)
  const refName = normalizeKey(ref?.name)
  const featureClass = normalizeKey(feature?.className)
  const refClass = normalizeKey(ref?.className)
  const subclassShort = normalizeKey(subclass?.shortName || subclass?.name)
  const featureSubclassShort = normalizeKey(feature?.subclassShortName || feature?.subclassName)

  if (!featureName || !refName || featureName !== refName) return false

  if (ref.level !== null && Number(feature?.level) !== Number(ref.level)) return false

  if (refClass && featureClass && refClass !== featureClass) return false

  if (featureSubclassShort && subclassShort && featureSubclassShort !== subclassShort) return false

  return true
}

function buildSubclassFeaturePreview(feature: any, fallbackRef: any) {
  return {
    title: cleanText(feature?.name || fallbackRef?.name || 'Subclass Feature'),
    level: Number(feature?.level ?? fallbackRef?.level ?? 0) || null,
    source: cleanText(feature?.source || fallbackRef?.source || ''),
    page: feature?.page ?? null,
    description: entriesToText(feature?.entries)
  }
}

function resolveSubclassFeaturePreviews(rawSubclass: any, json: any) {
  const refs = Array.isArray(rawSubclass?.subclassFeatures)
    ? rawSubclass.subclassFeatures
    : []

  const featureRows = Array.isArray(json?.subclassFeature)
    ? json.subclassFeature
    : []

  return refs
    .map((ref: any) => {
      const parsedRef = parseSubclassFeatureRef(ref)
      const found = featureRows.find((feature: any) =>
        featureMatchesRef(feature, parsedRef, rawSubclass)
      )

      return buildSubclassFeaturePreview(found || {}, parsedRef)
    })
    .filter((feature: any) => feature.title)
    .sort((a: any, b: any) => {
      const levelSort = Number(a.level || 0) - Number(b.level || 0)
      if (levelSort !== 0) return levelSort
      return String(a.title || '').localeCompare(String(b.title || ''))
    })
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

      const featurePreviews = resolveSubclassFeaturePreviews(raw, json)

      subclasses.push({
        name,
        shortName: cleanText(raw?.shortName || ''),
        source,
        classSource,
        recommended,
        page: raw?.page ?? null,
        featureCount: featurePreviews.length || (Array.isArray(raw?.subclassFeatures) ? raw.subclassFeatures.length : 0),
        description: subclassDescription(raw) || featurePreviews.map((feature) => `${feature.title}: ${feature.description}`).filter(Boolean).join('\n\n'),
        features: featurePreviews
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
