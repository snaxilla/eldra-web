import { getWorlds } from '../../../app/lib/eldra'

export default defineEventHandler(async () => {
  return {
    worlds: getWorlds()
  }
})
