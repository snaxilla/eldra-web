import { updateEntityRelationship } from '../../../../utils/entity-relationships'

export default defineEventHandler(async (event) => {
  const params = event.context.params || {}
  const body = await readBody(event)

  return {
    relationship: await updateEntityRelationship(
      String(params.id || ''),
      String(params.relationshipId || ''),
      body || {}
    )
  }
})
