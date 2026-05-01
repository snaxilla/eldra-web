import { matchesQuery, readJsonFile, safeSource } from '../../../utils/import-source'

const SPELLS_DIR = '/opt/eldra/datasets/5etools-src/data/spells'
const SPELL_FILES = [
  'spells-aag.json',
  'spells-ai.json',
  'spells-aitfr-avt.json',
  'spells-bmt.json',
  'spells-efa.json',
  'spells-egw.json',
  'spells-frhof.json',
  'spells-ftd.json',
  'spells-ggr.json',
  'spells-idrotf.json',
  'spells-llk.json',
  'spells-phb.json',
  'spells-sato.json',
  'spells-scc.json',
  'spells-tce.json',
  'spells-xge.json',
  'spells-xphb.json'
]

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const source = safeSource(String(query.source || 'all')) || 'all'
  const q = String(query.q || '').trim()
  const limitRaw = Number(query.limit || 50)
  const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? limitRaw : 50

  const allSpells: any[] = []

  for (const file of SPELL_FILES) {
    try {
      const json = await readJsonFile(`${SPELLS_DIR}/${file}`)
      const spells = Array.isArray(json?.spell) ? json.spell : []
      allSpells.push(...spells)
    } catch {}
  }

  const filtered = allSpells
    .filter((item) => source === 'all' || String(item?.source || '').trim().toLowerCase() === source)
    .filter((item) => matchesQuery([
      item?.name,
      item?.source,
      item?.school,
      item?.level,
      item?.time?.[0]?.unit
    ], q))
    .sort((a, b) => {
      const byName = String(a?.name || '').localeCompare(String(b?.name || ''))
      if (byName !== 0) return byName
      return String(a?.source || '').localeCompare(String(b?.source || ''))
    })

  const items = filtered.slice(0, limit).map((item) => ({
    kind: 'spell',
    name: item?.name || null,
    source: item?.source || null,
    level: item?.level ?? null,
    school: item?.school || null,
    raw: item
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
