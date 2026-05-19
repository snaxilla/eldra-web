import { readFile } from 'node:fs/promises'
import { dxFetch } from '../../../utils/entity-factory'

const LOOKUP_FILE = '/opt/eldra/datasets/5etools-src/data/generated/gendata-spell-source-lookup.json'

function normalizeLookupKey(value: any) {
  return String(value || '')
    .trim()
    .toLowerCase()
}

function normalizeClassKey(value: any) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
}

async function readSpellLookup() {
  try {
    return JSON.parse(await readFile(LOOKUP_FILE, 'utf8'))
  } catch {
    return {}
  }
}

function findLookupEntry(lookup: any, source: any, name: any) {
  const sourceKey = normalizeLookupKey(source)
  const nameKey = normalizeLookupKey(name)

  if (!nameKey) return null

  const direct = lookup?.[sourceKey]?.[nameKey]
  if (direct) return direct

  for (const sourceBlock of Object.values(lookup || {}) as any[]) {
    if (sourceBlock?.[nameKey]) return sourceBlock[nameKey]
  }

  return null
}

function collectClassNamesFromSection(section: any, out: Set<string>) {
  if (!section || typeof section !== 'object') return

  for (const sourceBlock of Object.values(section) as any[]) {
    if (!sourceBlock || typeof sourceBlock !== 'object') continue

    for (const className of Object.keys(sourceBlock)) {
      if (className) out.add(className)
    }
  }
}

function classNamesFromLookupEntry(entry: any) {
  const names = new Set<string>()

  collectClassNamesFromSection(entry?.class, names)
  collectClassNamesFromSection(entry?.classVariant, names)

  return Array.from(names).sort((a, b) => a.localeCompare(b))
}

function blockByKey(blocks: any[], key: string) {
  return blocks.find((block) => String(block?.block_key || block?.blockKey || '') === key) || null
}

async function loadBlocksForSpellIds(ids: string[]) {
  const rows: any[] = []

  for (let i = 0; i < ids.length; i += 100) {
    const chunk = ids.slice(i, i + 100)
    const params = new URLSearchParams()

    params.set('filter[entity_id][_in]', chunk.join(','))
    params.set('filter[block_key][_in]', 'spell_core,import_source')
    params.set('limit', '-1')
    params.append('fields[]', 'entity_id')
    params.append('fields[]', 'block_key')
    params.append('fields[]', 'data')

    const res = await dxFetch(`/items/block_instances?${params.toString()}`).catch(() => null)
    if (Array.isArray(res?.data)) rows.push(...res.data)
  }

  if (rows.length >= ids.length) return rows

  const fallbackRows: any[] = []

  for (const id of ids) {
    const params = new URLSearchParams()

    params.set('filter[entity_id][_eq]', id)
    params.set('limit', '-1')
    params.append('fields[]', 'entity_id')
    params.append('fields[]', 'block_key')
    params.append('fields[]', 'data')

    const res = await dxFetch(`/items/block_instances?${params.toString()}`).catch(() => null)
    if (Array.isArray(res?.data)) {
      fallbackRows.push(...res.data.filter((row: any) => ['spell_core', 'import_source'].includes(String(row?.block_key || ''))))
    }
  }

  return fallbackRows
}

export default defineEventHandler(async (event) => {
  const worldId = String(getRouterParam(event, 'id') || '').trim()

  if (!worldId) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Missing world id'
    })
  }

  const lookup = await readSpellLookup()

  const params = new URLSearchParams()
  params.set('filter[world_id][_eq]', worldId)
  params.set('filter[entity_type][_eq]', 'spell')
  params.set('limit', '-1')
  params.append('fields[]', 'id')
  params.append('fields[]', 'title')
  params.append('fields[]', 'slug')
  params.append('fields[]', 'entity_type')

  const spellRes = await dxFetch(`/items/entities?${params.toString()}`)
  const spells = Array.isArray(spellRes?.data) ? spellRes.data : []
  const ids = spells.map((spell: any) => String(spell.id)).filter(Boolean)

  const blockRows = await loadBlocksForSpellIds(ids)
  const blocksByEntityId = new Map<string, any[]>()

  for (const block of blockRows) {
    const key = String(block?.entity_id || '')
    if (!key) continue

    if (!blocksByEntityId.has(key)) blocksByEntityId.set(key, [])
    blocksByEntityId.get(key)?.push(block)
  }

  const items = spells.map((spell: any) => {
    const blocks = blocksByEntityId.get(String(spell.id)) || []
    const spellCore = blockByKey(blocks, 'spell_core')?.data || {}
    const importSource = blockByKey(blocks, 'import_source')?.data || {}
    const raw = importSource?.raw_json || {}

    const source = raw?.source || importSource?.source_book || ''
    const name = raw?.name || spellCore?.name || spell?.title || ''
    const lookupEntry = findLookupEntry(lookup, source, name)
    const classes = classNamesFromLookupEntry(lookupEntry)
    const levelNumber = Number(spellCore?.level ?? raw?.level)

    return {
      id: String(spell.id),
      title: String(spell.title || name || 'Untitled Spell'),
      slug: spell.slug ? String(spell.slug) : null,
      level: Number.isFinite(levelNumber) ? levelNumber : null,
      source: source ? String(source) : null,
      classes,
      classKeys: classes.map(normalizeClassKey),
      hasLookup: Boolean(lookupEntry)
    }
  }).sort((a: any, b: any) => {
    const levelA = a.level ?? 999
    const levelB = b.level ?? 999
    if (levelA !== levelB) return levelA - levelB
    return a.title.localeCompare(b.title)
  })

  return {
    ok: true,
    count: items.length,
    items
  }
})
