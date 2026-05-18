import { readJsonFile, uniqueSortedSources } from '../../../utils/import-source'

const FILE = '/opt/eldra/datasets/5etools-src/data/feats.json'

export default defineEventHandler(async () => {
  const json = await readJsonFile(FILE)
  const allFeats = Array.isArray(json?.feat) ? json.feat : []

  const sources = uniqueSortedSources(allFeats.map((item) => item?.source)).map((source) => ({
    source
  }))

  return {
    ok: true,
    count: sources.length,
    sources
  }
})
