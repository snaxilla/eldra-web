import { updateNoteForSheet } from '../../../../../../../utils/character-sheet-notes'

export default defineEventHandler(async (event) => {
  const params = event.context.params || {}
  const body = await readBody(event)

  return await updateNoteForSheet(
    String(params.id || ''),
    String(params.entityId || ''),
    String(params.noteId || ''),
    body || {}
  )
})
