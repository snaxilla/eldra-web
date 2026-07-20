import { load5etoolsSourceLabels } from '../../../utils/5etools-source-labels'

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const bustCache = query.refresh === '1' || query._t !== undefined

  const labels = await load5etoolsSourceLabels({ bustCache })

  return {
    ok: true,
    count: Object.keys(labels).length,
    labels,
    sources: Object.entries(labels).map(([code, label]) => ({
      code,
      label
    }))
  }
})
