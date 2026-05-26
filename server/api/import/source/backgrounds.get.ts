import { matchesQuery, readJsonFile, safeSource } from '../../../utils/import-source'

const FILE = '/opt/eldra/datasets/5etools-src/data/backgrounds.json'

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const source = safeSource(String(query.source || 'all')) || 'all'
  const q = String(query.q || '').trim()
  const limitRaw = Number(query.limit ?? 50)
  const limit = Number.isFinite(limitRaw) ? Math.floor(limitRaw) : 50

  const json = await readJsonFile(FILE)
  const allBackgrounds = Array.isArray(json?.background) ? json.background : []

  const filtered = allBackgrounds
    .filter((raw) => source === 'all' || String(raw?.source || '').trim().toLowerCase() === source)
    .filter((raw) => matchesQuery([
      raw?.name,
      raw?.source,
      raw?.skillProficiencies ? JSON.stringify(raw.skillProficiencies) : '',
      raw?.toolProficiencies ? JSON.stringify(raw.toolProficiencies) : ''
    ], q))
    .sort((a, b) => {
      const byName = String(a?.name || '').localeCompare(String(b?.name || ''))
      if (byName !== 0) return byName
      return String(a?.source || '').localeCompare(String(b?.source || ''))
    })

  const items = filtered.slice(0, limit < 0 ? undefined : Math.max(0, limit)).map((raw) => ({
    kind: 'background',
    name: raw?.name || null,
    source: raw?.source || null,
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
