import { readBody, createError } from 'h3'
import { readdir, readFile } from 'node:fs/promises'
import { join, basename } from 'node:path'

import { persistImportedEntities } from '../../utils/import-save'
import { requireCapability } from '../../utils/authorization'

import { preview5eToolsSpells } from '../../../app/lib/importers/5etools-spells'
import { preview5eToolsItems } from '../../../app/lib/importers/5etools-items'
import { preview5eToolsBackgrounds } from '../../../app/lib/importers/5etools-backgrounds'
import { preview5eToolsFeats } from '../../../app/lib/importers/5etools-feats'
import { preview5eToolsSpecies } from '../../../app/lib/importers/5etools-species'
import { preview5eToolsClasses } from '../../../app/lib/importers/5etools-classes'

const DATA_ROOT = '/opt/eldra/datasets/5etools-src/data'

type DatasetKey =
  | 'spells'
  | 'items'
  | 'backgrounds'
  | 'feats'
  | 'species'
  | 'classes'

type SourceMode = 'all' | 'one' | 'custom'

function normalizeSourceCode(value: string | null | undefined) {
  return String(value || '').trim().toUpperCase()
}

function getPreviewFn(dataset: DatasetKey) {
  switch (dataset) {
    case 'spells': return preview5eToolsSpells
    case 'items': return preview5eToolsItems
    case 'backgrounds': return preview5eToolsBackgrounds
    case 'feats': return preview5eToolsFeats
    case 'species': return preview5eToolsSpecies
    case 'classes': return preview5eToolsClasses
  }
}

function getCollectionKeys(dataset: DatasetKey): string[] {
  switch (dataset) {
    case 'spells': return ['spell']
    case 'items': return ['item', 'baseitem', 'magicvariant']
    case 'backgrounds': return ['background']
    case 'feats': return ['feat']
    case 'species': return ['race', 'species']
    case 'classes': return ['class']
  }
}

function fileLooksRelevant(dataset: DatasetKey, filePath: string) {
  const name = basename(filePath).toLowerCase()
  const normalized = filePath.toLowerCase()

  switch (dataset) {
    case 'spells':
      return normalized.includes('/spells/') && name.endsWith('.json')

    case 'classes':
      return normalized.includes('/class/') && name.endsWith('.json')

    case 'items':
      return (
        name.startsWith('items') ||
        normalized.includes('/items/') ||
        name.includes('item')
      ) && name.endsWith('.json')

    case 'backgrounds':
      return name.includes('background') && name.endsWith('.json')

    case 'feats':
      return name.includes('feat') && name.endsWith('.json')

    case 'species':
      return (
        name.includes('race') ||
        name.includes('species')
      ) && name.endsWith('.json')
  }
}

async function walkJsonFiles(root: string, dataset: DatasetKey, out: string[] = []) {
  const entries = await readdir(root, { withFileTypes: true })

  for (const entry of entries) {
    const full = join(root, entry.name)

    if (entry.isDirectory()) {
      await walkJsonFiles(full, dataset, out)
      continue
    }

    if (!entry.isFile() || !entry.name.endsWith('.json')) {
      continue
    }

    if (fileLooksRelevant(dataset, full)) {
      out.push(full)
    }
  }

  return out
}

function extractEntitiesFromJson(parsed: any, dataset: DatasetKey): any[] {
  const keys = getCollectionKeys(dataset)
  const found: any[] = []

  for (const key of keys) {
    if (Array.isArray(parsed?.[key])) {
      found.push(...parsed[key])
    }

    if (Array.isArray(parsed?.data?.[key])) {
      found.push(...parsed.data[key])
    }
  }

  return found
}

async function loadDatasetEntries(dataset: DatasetKey): Promise<any[]> {
  const files = await walkJsonFiles(DATA_ROOT, dataset)
  const rows: any[] = []

  for (const file of files) {
    try {
      const raw = await readFile(file, 'utf8')
      const parsed = JSON.parse(raw)
      const extracted = extractEntitiesFromJson(parsed, dataset)

      if (extracted.length) {
        rows.push(...extracted)
      }
    } catch {
      // ignore bad/irrelevant files
    }
  }

  return rows
}

function filterBySource(rows: any[], source: string | null) {
  if (!source) return rows

  const wanted = normalizeSourceCode(source)

  return rows.filter((row) => normalizeSourceCode(row?.source) === wanted)
}

function dedupeRows(rows: any[]) {
  const seen = new Set<string>()
  const output: any[] = []

  for (const row of rows) {
    const key = [
      normalizeSourceCode(row?.source),
      String(row?.name || '').trim().toLowerCase()
    ].join('::')

    if (!key || seen.has(key)) continue

    seen.add(key)
    output.push(row)
  }

  return output
}

export default defineEventHandler(async (event) => {
  const body = await readBody(event)

  const worldId = Number(body?.worldId)
  const dataset = String(body?.dataset || '') as DatasetKey
  const mode = String(body?.mode || 'upsert')
  const sourceMode = String(body?.sourceMode || 'all') as SourceMode
  const source = body?.source ? String(body.source).trim() : null

  if (!worldId || !dataset) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Missing worldId or dataset'
    })
  }

  const principal = event.context.principal ?? null
  if (!principal) {
    throw createError({ statusCode: 401, statusMessage: 'Authentication required' })
  }
  requireCapability(principal, 'world.content.bind_pack', { kind: 'world', worldId: String(worldId) })

  if (!['spells', 'items', 'backgrounds', 'feats', 'species', 'classes'].includes(dataset)) {
    throw createError({
      statusCode: 400,
      statusMessage: `Unsupported dataset: ${dataset}`
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
      matched: 0,
      created: [],
      updated: [],
      skipped: []
    }
  }

  const allRows = await loadDatasetEntries(dataset)
  const effectiveSource = sourceMode === 'all' ? null : source
  const filteredRows = dedupeRows(filterBySource(allRows, effectiveSource))

  if (!filteredRows.length) {
    return {
      dataset,
      source: effectiveSource,
      mode,
      matched: 0,
      created: [],
      updated: [],
      skipped: []
    }
  }

  const previewFn = getPreviewFn(dataset)
  const preview = previewFn(filteredRows)

  if (!preview?.items?.length) {
    return {
      dataset,
      source: effectiveSource,
      mode,
      matched: filteredRows.length,
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
    mode,
    matched: filteredRows.length,
    ...persisted
  }
})
