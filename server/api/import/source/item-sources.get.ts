import { readJsonFile, uniqueSortedSources } from '../../../utils/import-source'

const ITEM_FILES = [
  '/opt/eldra/datasets/5etools-src/data/items.json',
  '/opt/eldra/datasets/5etools-src/data/items-base.json'
]

export default defineEventHandler(async () => {
  const allItems: any[] = []

  for (const file of ITEM_FILES) {
    try {
      const json = await readJsonFile(file)
      allItems.push(...(Array.isArray(json?.item) ? json.item : []))
      allItems.push(...(Array.isArray(json?.baseitem) ? json.baseitem : []))
      allItems.push(...(Array.isArray(json?.magicvariant) ? json.magicvariant : []))
    } catch {}
  }

  const sources = uniqueSortedSources(allItems.map((item) => item?.source)).map((source) => ({
    source
  }))

  return {
    ok: true,
    count: sources.length,
    sources
  }
})
