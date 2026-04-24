import { preview5eToolsMonsters } from '../../../../../app/lib/importers'

export default defineEventHandler(async (event) => {
  try {
    const body = await readBody(event)
    let payload = body?.payload ?? body

    if (typeof payload === 'string') {
      payload = JSON.parse(payload)
    }

    const preview = preview5eToolsMonsters(payload)

    return {
      items: preview.items,
      warnings: preview.warnings
    }
  } catch (error: any) {
    return {
      debug: true,
      message: error?.message || null,
      statusCode: error?.statusCode || error?.response?.status || 500,
      statusMessage: error?.statusMessage || null,
      data: error?.data || null,
      cause: error?.cause?.data || null
    }
  }
})
