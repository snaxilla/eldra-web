import { readFile, readdir } from 'node:fs/promises'

const BESTIARY_DIR = '/opt/eldra/datasets/5etools-src/data/bestiary'

function safeSource(value: string) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '')
}

function fluffKeyOf(entry: any) {
  const name = String(entry?.name || '').trim().toLowerCase()
  const source = String(entry?.source || '').trim().toLowerCase()
  return `${name}::${source}`
}

function matchesQuery(monster: any, q: string) {
  if (!q) return true

  const needle = q.toLowerCase()

  const typeValue = (() => {
    if (typeof monster?.type === 'string') return monster.type
    if (monster?.type && typeof monster.type === 'object') {
      const base = String(monster.type.type || '').trim()
      const tags = Array.isArray(monster.type.tags)
        ? monster.type.tags.map((t: any) => String(t))
        : []
      return [base, ...tags].filter(Boolean).join(' ')
    }
    return ''
  })()

  return [
    monster?.name,
    monster?.source,
    typeof monster?.cr === 'string' ? monster.cr : null,
    typeValue
  ]
    .filter(Boolean)
    .some((value) => String(value).toLowerCase().includes(needle))
}

async function readJson(path: string) {
  const raw = await readFile(path, 'utf8')
  return JSON.parse(raw)
}

async function loadOneSource(source: string) {
  const basePath = `${BESTIARY_DIR}/bestiary-${source}.json`
  const fluffPath = `${BESTIARY_DIR}/fluff-bestiary-${source}.json`

  const baseJson = await readJson(basePath)
  const monsters = Array.isArray(baseJson?.monster) ? baseJson.monster : []

  let fluff: any[] = []
  try {
    const fluffJson = await readJson(fluffPath)
    fluff = Array.isArray(fluffJson?.monsterFluff) ? fluffJson.monsterFluff : []
  } catch {
    fluff = []
  }

  const fluffMap = new Map<string, any>()
  for (const entry of fluff) {
    const key = fluffKeyOf(entry)
    if (key !== '::') fluffMap.set(key, entry)
  }

  return {
    source,
    basePath,
    fluffPath,
    monsters,
    fluff,
    fluffMap
  }
}

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const source = safeSource(String(query.source || 'all')) || 'all'
  const q = String(query.q || '').trim()
  const limitRaw = Number(query.limit || 50)
  const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? limitRaw : 50

  try {
    let sourcesToLoad: string[] = []

    if (source === 'all') {
      const files = await readdir(BESTIARY_DIR)
      sourcesToLoad = files
        .filter((name) => /^bestiary-[a-z0-9-]+\.json$/i.test(name))
        .map((name) => name.replace(/^bestiary-/, '').replace(/\.json$/, ''))
        .sort()
    } else {
      sourcesToLoad = [source]
    }

    const loaded = await Promise.all(sourcesToLoad.map((src) => loadOneSource(src)))

    let totalMonsterCount = 0
    let totalFluffCount = 0
    const items: any[] = []

    for (const dataset of loaded) {
      totalMonsterCount += dataset.monsters.length
      totalFluffCount += dataset.fluff.length

      for (const monster of dataset.monsters) {
        if (!matchesQuery(monster, q)) continue

        const key = fluffKeyOf(monster)
        const matchedFluff = dataset.fluffMap.get(key) || null

        items.push({
          name: monster?.name || null,
          source: monster?.source || dataset.source || null,
          cr: monster?.cr || null,
          type: monster?.type || null,
          size: monster?.size || null,
          hasFluff: !!matchedFluff,
          monster,
          fluff: matchedFluff
        })
      }
    }

    items.sort((a, b) => {
      const byName = String(a?.name || '').localeCompare(String(b?.name || ''))
      if (byName !== 0) return byName
      return String(a?.source || '').localeCompare(String(b?.source || ''))
    })

    const sliced = items.slice(0, limit)

    return {
      ok: true,
      source,
      q,
      totalMonsterCount,
      filteredCount: items.length,
      returnedCount: sliced.length,
      fluffCount: totalFluffCount,
      matchedCount: sliced.filter((it: any) => it.hasFluff).length,
      items: sliced
    }
  } catch (error: any) {
    throw createError({
      statusCode: 500,
      statusMessage: error?.message || 'Failed to read source files'
    })
  }
})
