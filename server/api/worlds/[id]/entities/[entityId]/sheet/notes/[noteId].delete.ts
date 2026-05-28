import { deleteNoteForSheet } from '../../../../../../../utils/character-sheet-notes'

export default defineEventHandler(async (event) => {
  const params = event.context.params || {}

  return await deleteNoteForSheet(
    String(params.id || ''),
    String(params.entityId || ''),
    String(params.noteId || '')
  )
})
