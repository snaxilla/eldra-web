import { readJsonFile, uniqueSortedSources } from '../../../utils/import-source'

const FILE = '/opt/eldra/datasets/5etools-src/data/races.json'

export default defineEventHandler(async () => {
  const json = await readJsonFile(FILE)
  const allSpecies = [
    ...(Array.isArray(json?.race) ? json.race : []),
    ...(Array.isArray(json?.species) ? json.species : [])
  ]

  const sources = uniqueSortedSources(allSpecies.map((item) => item?.source)).map((source) => ({
    source
  }))

  return {
    ok: true,
    count: sources.length,
    sources
  }
})
