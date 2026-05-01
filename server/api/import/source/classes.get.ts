import { matchesQuery, readJsonFile, safeSource } from '../../../utils/import-source'

const CLASS_DIR = '/opt/eldra/datasets/5etools-src/data/class'
const CLASS_FILES = [
  'class-artificer.json',
  'class-barbarian.json',
  'class-bard.json',
  'class-cleric.json',
  'class-druid.json',
  'class-fighter.json',
  'class-monk.json',
  'class-mystic.json',
  'class-paladin.json',
  'class-ranger.json',
  'class-rogue.json',
  'class-sidekick.json',
  'class-sorcerer.json',
  'class-warlock.json',
  'class-wizard.json'
]

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const source = safeSource(String(query.source || 'all')) || 'all'
  const q = String(query.q || '').trim()
  const limitRaw = Number(query.limit || 50)
  const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? limitRaw : 50

  const allClasses: any[] = []

  for (const file of CLASS_FILES) {
    try {
      const json = await readJsonFile(`${CLASS_DIR}/${file}`)
      const classes = Array.isArray(json?.class) ? json.class : []
      allClasses.push(...classes)
    } catch {}
  }

  const filtered = allClasses
    .filter((raw) => source === 'all' || String(raw?.source || '').trim().toLowerCase() === source)
    .filter((raw) => matchesQuery([
      raw?.name,
      raw?.source,
      raw?.primaryAbility ? JSON.stringify(raw.primaryAbility) : '',
      raw?.hd?.faces
    ], q))
    .sort((a, b) => {
      const byName = String(a?.name || '').localeCompare(String(b?.name || ''))
      if (byName !== 0) return byName
      return String(a?.source || '').localeCompare(String(b?.source || ''))
    })

  const items = filtered.slice(0, limit).map((raw) => ({
    kind: 'class',
    name: raw?.name || null,
    source: raw?.source || null,
    hitDie: raw?.hd?.faces || null,
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
