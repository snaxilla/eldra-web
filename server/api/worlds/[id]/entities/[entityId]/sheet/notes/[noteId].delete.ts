import { deleteNoteForSheet } from '../../../../../../../utils/character-sheet-notes'
import { requireCapability } from '../../../../../../../utils/authorization'

export default defineEventHandler(async (event) => {
  const params = event.context.params || {}
  const worldId = String(params.id || '')

  const principal = event.context.principal ?? null
  if (!principal) {
    throw createError({ statusCode: 401, statusMessage: 'Authentication required' })
  }
  requireCapability(principal, 'world.character.edit_any', { kind: 'world', worldId })

  return await deleteNoteForSheet(
    String(params.id || ''),
    String(params.entityId || ''),
    String(params.noteId || '')
  )
})
