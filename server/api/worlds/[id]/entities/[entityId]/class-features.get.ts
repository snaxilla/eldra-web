import { readFile } from 'node:fs/promises'
import { directusServiceRequest } from '../../../../../utils/directus'

const CLASS_DIR = '/opt/eldra/datasets/5etools-src/data/class'

function slugifyClassName(value: any) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function clean5eText(value: any): string {
  return String(value || '')
    .replace(/\{@(?:filter|spell|item|creature|class|race|variantrule|condition|skill|action|sense|damage|book|hazard|reward|feat|classFeature|subclassFeature|optionalfeature|status)\s+([^|}]+)(?:\|[^}]*)?\}/g, '$1')
    .replace(/\{@(?:i|b|dice|damage|hit|dc|scaledice|scaledamage)\s+([^}]+)\}/g, '$1')
    .replace(/\{@[^}]+\}/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function entriesToMarkdown(value: any): string {
  if (!value) return ''
  if (typeof value === 'string') return clean5eText(value)
  if (Array.isArray(value)) return value.map(entriesToMarkdown).filter(Boolean).join('\n\n')

  if (typeof value === 'object') {
    const parts: string[] = []
    if (value.name) parts.push(`### ${clean5eText(value.name)}`)
    if (value.entry) parts.push(clean5eText(value.entry))
    if (value.entries) parts.push(entriesToMarkdown(value.entries))
    if (value.items) parts.push(entriesToMarkdown(value.items))
    return parts.filter(Boolean).join('\n\n')
  }

  return ''
}

function parseFeatureRef(ref: any) {
  const rawRef = typeof ref === 'string' ? ref : ref?.classFeature || ref?.name || ''
  const parts = String(rawRef || '').split('|')

  return {
    rawRef,
    name: parts[0] || '',
    className: parts[1] || '',
    classSource: parts[2] || '',
    level: Number(parts[3] || 0) || null
  }
}

function featureMatches(feature: any, ref: ReturnType<typeof parseFeatureRef>) {
  if (String(feature?.name || '').toLowerCase() !== ref.name.toLowerCase()) return false
  if (ref.className && String(feature?.className || '').toLowerCase() !== ref.className.toLowerCase()) return false
  if (ref.level && Number(feature?.level || 0) !== ref.level) return false

  if (ref.classSource) {
    const featureClassSource = String(feature?.classSource || '').toLowerCase()
    const refClassSource = String(ref.classSource || '').toLowerCase()
    if (featureClassSource && featureClassSource !== refClassSource) return false
  }

  return true
}

async function readClassDataset(className: string) {
  const slug = slugifyClassName(className)
  const raw = await readFile(`${CLASS_DIR}/class-${slug}.json`, 'utf8')
  return JSON.parse(raw)
}

async function readClassFluff(className: string) {
  const slug = slugifyClassName(className)

  try {
    const raw = await readFile(`${CLASS_DIR}/fluff-class-${slug}.json`, 'utf8')
    return JSON.parse(raw)
  } catch {
    return null
  }
}

function sourceRank(source: any) {
  const src = String(source || '').trim().toLowerCase()
  if (src === 'xphb') return 0
  if (src === 'phb') return 1
  return 2
}

function chooseClassFluff(fluffDataset: any, rawClass: any) {
  const items = Array.isArray(fluffDataset?.classFluff) ? fluffDataset.classFluff : []
  const className = String(rawClass?.name || '').trim().toLowerCase()
  const classSource = String(rawClass?.source || '').trim().toLowerCase()

  return items
    .filter((item: any) => String(item?.name || '').trim().toLowerCase() === className)
    .sort((a: any, b: any) => {
      const aSource = String(a?.source || '').trim().toLowerCase()
      const bSource = String(b?.source || '').trim().toLowerCase()

      if (aSource === classSource && bSource !== classSource) return -1
      if (bSource === classSource && aSource !== classSource) return 1

      return sourceRank(aSource) - sourceRank(bSource)
    })[0] || null
}

function firstFluffText(fluff: any): string {
  const text = entriesToMarkdown(fluff?.entries || [])
    .replace(/^#+\s+/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()

  if (!text) return ''

  return (
    text
      .split('\n\n')
      .map((part) => part.trim())
      .find((part) => part.length > 80) ||
    text.split('\n\n')[0] ||
    ''
  )
}

function firstFluffImageUrl(fluff: any): string {
  const images = Array.isArray(fluff?.images) ? fluff.images : []

  for (const image of images) {
    const path =
      image?.href?.path ||
      image?.path ||
      image?.href?.url ||
      image?.url ||
      ''

    if (!path) continue
    if (/^https?:\/\//i.test(path)) return path

    return `/api/5etools-img/${String(path).replace(/^\/+/, '')}`
  }

  return ''
}

export default defineEventHandler(async (event) => {
  const worldId = String(getRouterParam(event, 'id') || '')
  const entityId = String(getRouterParam(event, 'entityId') || '')

  if (!worldId || !entityId) {
    throw createError({ statusCode: 400, statusMessage: 'Missing world or entity id' })
  }

  const entityRes = await directusServiceRequest(`/items/entities/${entityId}`, {
    method: 'GET',
    query: { fields: '*' }
  })

  const entity = entityRes?.data || null

  if (!entity || String(entity.world_id) !== String(worldId)) {
    throw createError({ statusCode: 404, statusMessage: 'Entity not found' })
  }

  if (String(entity.entity_type || '') !== 'class') {
    return { ok: true, entityId, features: [], markdown: '' }
  }

  const blocksRes = await directusServiceRequest('/items/block_instances', {
    method: 'GET',
    query: {
      filter: { entity_id: { _eq: entityId } },
      sort: 'sort',
      limit: -1,
      fields: '*'
    }
  })

  const blocks = Array.isArray(blocksRes?.data) ? blocksRes.data : []
  const importBlock = blocks.find((block: any) => String(block?.block_key || '') === 'import_source')
  const rawClass = importBlock?.data?.raw_json || null

  if (!rawClass?.name) {
    return { ok: true, entityId, features: [], markdown: '' }
  }

  const dataset = await readClassDataset(rawClass.name)
  const fluffDataset = await readClassFluff(rawClass.name)
  const matchedFluff = chooseClassFluff(fluffDataset, rawClass)

  const datasetFeatures = Array.isArray(dataset?.classFeature) ? dataset.classFeature : []
  const refs = Array.isArray(rawClass?.classFeatures) ? rawClass.classFeatures : []

  const features = refs
    .map(parseFeatureRef)
    .map((ref) => {
      const feature = datasetFeatures.find((candidate: any) => featureMatches(candidate, ref))

      if (!feature) {
        return {
          name: ref.name,
          level: ref.level,
          source: ref.classSource || rawClass.source || null,
          found: false,
          markdown: ''
        }
      }

      return {
        name: feature.name,
        level: feature.level,
        source: feature.source,
        found: true,
        entries: feature.entries || [],
        markdown: entriesToMarkdown(feature.entries || [])
      }
    })

  const markdown = features
    .map((feature: any) => {
      const title = feature.level ? `## Level ${feature.level}: ${feature.name}` : `## ${feature.name}`
      const body = feature.markdown || '_Feature details not found in local 5etools data._'
      return `${title}\n\n${body}`
    })
    .join('\n\n---\n\n')

  const fallbackSummary =
    firstFluffText(matchedFluff) ||
    features.find((feature: any) => String(feature?.markdown || '').trim())?.markdown?.split('\n\n')?.[0] ||
    ''

  return {
    ok: true,
    entityId,
    className: rawClass.name,
    classSource: rawClass.source || null,
    summary: fallbackSummary,
    imageUrl: firstFluffImageUrl(matchedFluff),
    fluff: matchedFluff,
    featureCount: features.length,
    foundCount: features.filter((feature: any) => feature.found).length,
    features,
    markdown
  }
})
