import { preview5eToolsSpells } from '../../../../../app/lib/importers'

export default defineEventHandler(async (event) => {
  const body = await readBody(event)

  let payload = body?.payload ?? body?.json ?? body

  if (typeof payload === 'string') {
    try {
      payload = JSON.parse(payload)
    } catch {
      throw createError({
        statusCode: 400,
        statusMessage: 'Payload is not valid JSON'
      })
    }
  }

  return preview5eToolsSpells(payload)
})
