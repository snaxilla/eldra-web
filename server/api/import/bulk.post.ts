import { readBody, createError } from 'h3'
import { persistImportedEntities } from '../../utils/import-save'

import { preview5eToolsSpells } from '../../../app/lib/importers/5etools-spells'
import { preview5eToolsItems } from '../../../app/lib/importers/5etools-items'
import { preview5eToolsBackgrounds } from '../../../app/lib/importers/5etools-backgrounds'
import { preview5eToolsFeats } from '../../../app/lib/importers/5etools-feats'
import { preview5eToolsSpecies } from '../../../app/lib/importers/5etools-species'
import { preview5eToolsClasses } from '../../../app/lib/importers/5etools-classes'

function getPreviewFn(dataset: string) {
  switch (dataset) {
    case 'spells': return preview5eToolsSpells
    case 'items': return preview5eToolsItems
    case 'backgrounds': return preview5eToolsBackgrounds
    case 'feats': return preview5eToolsFeats
    case 'species': return preview5eToolsSpecies
    case 'classes': return preview5eToolsClasses
    default:
      throw createError({
        statusCode: 400,
        statusMessage: `Unsupported dataset: ${dataset}`
      })
  }
}

function getDatasetUrl(dataset: string) {
  switch (dataset) {
    case 'spells': return 'https://5e.tools/data/spells/spells-phb.json'
    case 'items': return 'https://5e.tools/data/items-base.json'
    case 'backgrounds': return 'https://5e.tools/data/backgrounds.json'
    case 'feats': return 'https://5e.tools/data/feats.json'
    case 'species': return 'https://5e.tools/data/races.json'
    case 'classes': return 'https://5e.tools/data/class/class-phb.json'
    default:
      throw createError({
        statusCode: 400,
        statusMessage: `No dataset URL configured for ${dataset}`
      })
  }
}

function getCollectionKey(dataset: string) {
  switch (dataset) {
    case 'spells': return 'spell'
    case 'items': return 'item'
    case 'backgrounds': return 'background'
    case 'feats': return 'feat'
    case 'species': return 'race'
    case 'classes': return 'class'
    default:
      throw createError({
        statusCode: 400,
        statusMessage: `No collection key configured for ${dataset}`
      })
  }
}

function filterPayloadBySource(payload: any, dataset: string, source: string | null) {
  if (!source) return payload

  const key = getCollectionKey(dataset)

  if (Array.isArray(payload)) {
    return payload.filter((item) => String(item?.source || '').trim() === source)
  }

  if (Array.isArray(payload?.[key])) {
    return {
      ...payload,
      [key]: payload[key].filter((item: any) => String(item?.source || '').trim() === source)
    }
  }

  if (Array.isArray(payload?.data?.[key])) {
    return {
      ...payload,
      data: {
        ...payload.data,
        [key]: payload.data[key].filter((item: any) => String(item?.source || '').trim() === source)
      }
    }
  }

  return payload
}

export default defineEventHandler(async (event) => {
  const body = await readBody(event)

  const worldId = Number(body?.worldId)
  const dataset = String(body?.dataset || '')
  const mode = String(body?.mode || 'upsert')
  const sourceMode = String(body?.sourceMode || 'all')
  const source = body?.source ? String(body.source).trim() : null

  if (!worldId || !dataset) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Missing worldId or dataset'
    })
  }

  if (!['all', 'one', 'custom'].includes(sourceMode)) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Invalid source mode'
    })
  }

  if ((sourceMode === 'one' || sourceMode === 'custom') && !source) {
    return {
      dataset,
      source: null,
      mode,
      created: [],
      updated: [],
      skipped: []
    }
  }

  const datasetUrl = getDatasetUrl(dataset)

  let payload: any

  try {
    const res = await fetch(datasetUrl)
    payload = await res.json()
  } catch {
    throw createError({
      statusCode: 500,
      statusMessage: `Failed to load dataset JSON for ${dataset}`
    })
  }

  const effectiveSource = sourceMode === 'all' ? null : source
  const filteredPayload = filterPayloadBySource(payload, dataset, effectiveSource)

  const previewFn = getPreviewFn(dataset)
  const preview = previewFn(filteredPayload)

  if (!preview?.items?.length) {
    return {
      dataset,
      source: effectiveSource,
      mode,
      created: [],
      updated: [],
      skipped: []
    }
  }

  const persisted = await persistImportedEntities({
    worldId,
    mode,
    items: preview.items
  })

  return {
    dataset,
    source: effectiveSource,
    ...persisted
  }
})
