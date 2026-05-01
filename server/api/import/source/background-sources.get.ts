import { readJsonFile, uniqueSortedSources } from '../../../utils/import-source'

const FILE = '/opt/eldra/datasets/5etools-src/data/backgrounds.json'

export default defineEventHandler(async () => {
  const json = await readJsonFile(FILE)
  const allBackgrounds = Array.isArray(json?.background) ? json.background : []

  const sources = uniqueSortedSources(allBackgrounds.map((item) => item?.source)).map((source) => ({
    source
  }))

  return {
    ok: true,
    count: sources.length,
    sources
  }
})
