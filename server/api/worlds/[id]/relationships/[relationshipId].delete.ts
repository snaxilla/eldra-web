import { deleteEntityRelationship } from '../../../../utils/entity-relationships'

export default defineEventHandler(async (event) => {
  const params = event.context.params || {}

  return await deleteEntityRelationship(
    String(params.id || ''),
    String(params.relationshipId || '')
  )
})
