import { readFile } from 'node:fs/promises'

export default defineEventHandler(async () => {
  const basePath = '/opt/eldra/datasets/5etools-src/data/bestiary/bestiary-xmm.json'
  const fluffPath = '/opt/eldra/datasets/5etools-src/data/bestiary/fluff-bestiary-xmm.json'

  try {
    const baseRaw = await readFile(basePath, 'utf8')
    const fluffRaw = await readFile(fluffPath, 'utf8')

    const baseJson = JSON.parse(baseRaw)
    const fluffJson = JSON.parse(fluffRaw)

    const monsters = Array.isArray(baseJson?.monster) ? baseJson.monster : []
    const fluff = Array.isArray(fluffJson?.monsterFluff) ? fluffJson.monsterFluff : []

    return {
      ok: true,
      basePath,
      fluffPath,
      monsterCount: monsters.length,
      fluffCount: fluff.length,
      firstMonster: monsters[0]?.name || null,
      firstFluff: fluff[0]?.name || null
    }
  } catch (error: any) {
    return {
      ok: false,
      basePath,
      fluffPath,
      errorMessage: error?.message || String(error),
      errorCode: error?.code || null
    }
  }
})
