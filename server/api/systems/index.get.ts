import { getAllSystemSummaries } from '../../../app/lib/systems'

export default defineEventHandler(async () => {
  return {
    systems: getAllSystemSummaries()
  }
})
