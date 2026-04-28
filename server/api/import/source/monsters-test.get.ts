import { readFile } from 'node:fs/promises'

export default defineEventHandler(async () => {
  const basePath = '/opt/5etools-src/data/bestiary/bestiary-xmm.json'
  const fluffPath = '/opt/5etools-src/data/bestiary/fluff-bestiary-xmm.json'

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
})
