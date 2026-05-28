import { createNoteForSheet } from '../../../../../../utils/character-sheet-notes'

export default defineEventHandler(async (event) => {
  const params = event.context.params || {}
  const body = await readBody(event)

  return await createNoteForSheet(
    String(params.id || ''),
    String(params.entityId || ''),
    body || {}
  )
})
