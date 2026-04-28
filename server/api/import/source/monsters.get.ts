import { readFile } from 'node:fs/promises'

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

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const source = safeSource(String(query.source || ''))

  if (!source) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Missing source query parameter'
    })
  }

  const basePath = `/opt/eldra/datasets/5etools-src/data/bestiary/bestiary-${source}.json`
  const fluffPath = `/opt/eldra/datasets/5etools-src/data/bestiary/fluff-bestiary-${source}.json`

  try {
    const baseRaw = await readFile(basePath, 'utf8')
    const baseJson = JSON.parse(baseRaw)
    const monsters = Array.isArray(baseJson?.monster) ? baseJson.monster : []

    let fluff: any[] = []
    try {
      const fluffRaw = await readFile(fluffPath, 'utf8')
      const fluffJson = JSON.parse(fluffRaw)
      fluff = Array.isArray(fluffJson?.monsterFluff) ? fluffJson.monsterFluff : []
    } catch {
      fluff = []
    }

    const fluffMap = new Map<string, any>()

    for (const entry of fluff) {
      const key = fluffKeyOf(entry)
      if (key !== '::') fluffMap.set(key, entry)
    }

    const items = monsters.map((monster: any) => {
      const key = fluffKeyOf(monster)
      const matchedFluff = fluffMap.get(key) || null

      return {
        name: monster?.name || null,
        source: monster?.source || null,
        cr: monster?.cr || null,
        type: monster?.type || null,
        size: monster?.size || null,
        hasFluff: !!matchedFluff,
        monster,
        fluff: matchedFluff
      }
    })

    return {
      ok: true,
      source,
      basePath,
      fluffPath,
      monsterCount: monsters.length,
      fluffCount: fluff.length,
      matchedCount: items.filter((it: any) => it.hasFluff).length,
      items
    }
  } catch (error: any) {
    throw createError({
      statusCode: 500,
      statusMessage: error?.message || 'Failed to read source files'
    })
  }
})
