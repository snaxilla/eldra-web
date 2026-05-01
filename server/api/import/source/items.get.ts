import { matchesQuery, readJsonFile, safeSource } from '../../../utils/import-source'

const ITEM_FILES = [
  '/opt/eldra/datasets/5etools-src/data/items.json',
  '/opt/eldra/datasets/5etools-src/data/items-base.json'
]

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const source = safeSource(String(query.source || 'all')) || 'all'
  const q = String(query.q || '').trim()
  const limitRaw = Number(query.limit || 50)
  const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? limitRaw : 50

  const allItems: any[] = []

  for (const file of ITEM_FILES) {
    try {
      const json = await readJsonFile(file)

      for (const item of Array.isArray(json?.item) ? json.item : []) {
        allItems.push({ kind: 'item', raw: item })
      }

      for (const item of Array.isArray(json?.baseitem) ? json.baseitem : []) {
        allItems.push({ kind: 'baseitem', raw: item })
      }

      for (const item of Array.isArray(json?.magicvariant) ? json.magicvariant : []) {
        allItems.push({ kind: 'magicvariant', raw: item })
      }
    } catch {}
  }

  const filtered = allItems
    .filter(({ raw }) => source === 'all' || String(raw?.source || '').trim().toLowerCase() === source)
    .filter(({ raw }) => matchesQuery([
      raw?.name,
      raw?.source,
      raw?.type,
      raw?.itemType,
      raw?.rarity
    ], q))
    .sort((a, b) => {
      const byName = String(a?.raw?.name || '').localeCompare(String(b?.raw?.name || ''))
      if (byName !== 0) return byName
      return String(a?.raw?.source || '').localeCompare(String(b?.raw?.source || ''))
    })

  const items = filtered.slice(0, limit).map(({ kind, raw }) => ({
    kind,
    name: raw?.name || null,
    source: raw?.source || null,
    itemType: raw?.type || raw?.itemType || null,
    rarity: raw?.rarity || null,
    raw
  }))

  return {
    ok: true,
    source,
    q,
    filteredCount: filtered.length,
    returnedCount: items.length,
    items
  }
})
