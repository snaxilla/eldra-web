import { matchesQuery, readJsonFile, safeSource } from '../../../utils/import-source'

const FILE = '/opt/eldra/datasets/5etools-src/data/feats.json'

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const source = safeSource(String(query.source || 'all')) || 'all'
  const q = String(query.q || '').trim()
  const limitRaw = Number(query.limit || 50)
  const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? limitRaw : 50

  const json = await readJsonFile(FILE)
  const allFeats = Array.isArray(json?.feat) ? json.feat : []

  const filtered = allFeats
    .filter((raw) => source === 'all' || String(raw?.source || '').trim().toLowerCase() === source)
    .filter((raw) => matchesQuery([
      raw?.name,
      raw?.source,
      raw?.category,
      raw?.prerequisite ? JSON.stringify(raw.prerequisite) : '',
      raw?.entries ? JSON.stringify(raw.entries) : ''
    ], q))
    .sort((a, b) => {
      const byName = String(a?.name || '').localeCompare(String(b?.name || ''))
      if (byName !== 0) return byName
      return String(a?.source || '').localeCompare(String(b?.source || ''))
    })

  const items = filtered.slice(0, limit).map((raw) => ({
    kind: 'feat',
    name: raw?.name || null,
    source: raw?.source || null,
    category: raw?.category || null,
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
