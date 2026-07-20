import { DATASETS, assertDatasetAdmin, datasetStatus } from '../../../utils/import-datasets'

export default defineEventHandler(async (event) => {
  await assertDatasetAdmin(event)

  const datasets = await Promise.all(
    (Object.keys(DATASETS) as Array<keyof typeof DATASETS>).map((key) => datasetStatus(key))
  )

  return {
    ok: true,
    checkedAt: new Date().toISOString(),
    datasets
  }
})
