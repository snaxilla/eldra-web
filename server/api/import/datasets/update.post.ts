import { datasetKeysForTarget, datasetStatus, assertDatasetAdmin, updateDataset } from '../../../utils/import-datasets'

export default defineEventHandler(async (event) => {
  await assertDatasetAdmin(event)

  const body = await readBody(event).catch(() => ({}))
  const keys = datasetKeysForTarget(body?.target || body?.dataset || 'src')

  const results = []
  for (const key of keys) {
    results.push(await updateDataset(key))
  }

  const datasets = await Promise.all(keys.map((key) => datasetStatus(key)))

  return {
    ok: results.every((result) => result.ok),
    updatedAt: new Date().toISOString(),
    target: body?.target || body?.dataset || 'src',
    results,
    datasets
  }
})
