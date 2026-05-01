import { matchesQuery, readJsonFile, safeSource } from '../../../utils/import-source'

const FILE = '/opt/eldra/datasets/5etools-src/data/races.json'

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const source = safeSource(String(query.source || 'all')) || 'all'
  const q = String(query.q || '').trim()
  const limitRaw = Number(query.limit || 50)
  const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? limitRaw : 50

  const json = await readJsonFile(FILE)
  const allSpecies = [
    ...(Array.isArray(json?.race) ? json.race : []).map((raw: any) => ({ kind: 'race', raw })),
    ...(Array.isArray(json?.species) ? json.species : []).map((raw: any) => ({ kind: 'species', raw }))
  ]

  const filtered = allSpecies
    .filter(({ raw }) => source === 'all' || String(raw?.source || '').trim().toLowerCase() === source)
    .filter(({ raw }) => matchesQuery([
      raw?.name,
      raw?.source,
      raw?.size,
      raw?.speed
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
    size: raw?.size || null,
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
