import { readdir } from 'node:fs/promises'

export default defineEventHandler(async () => {
  const dir = '/opt/eldra/datasets/5etools-src/data/bestiary'
  const files = await readdir(dir)

  const baseFiles = files
    .filter((name) => /^bestiary-[a-z0-9-]+\.json$/i.test(name))
    .sort()

  const fluffSet = new Set(
    files.filter((name) => /^fluff-bestiary-[a-z0-9-]+\.json$/i.test(name))
  )

  const sources = baseFiles.map((file) => {
    const source = file.replace(/^bestiary-/, '').replace(/\.json$/, '')
    const fluffFile = `fluff-bestiary-${source}.json`

    return {
      source,
      file,
      fluffFile,
      hasFluff: fluffSet.has(fluffFile)
    }
  })

  return {
    ok: true,
    count: sources.length,
    sources
  }
})
