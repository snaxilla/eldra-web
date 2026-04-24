import { preview5eToolsMonsters } from '../../../../../app/lib/importers'
import { persistImportedMonsters } from '../../../../utils/import-save-monsters'

export default defineEventHandler(async (event) => {
  try {
    const body = await readBody(event)
    const worldId = body?.worldId
    const mode = body?.mode || 'create'
    let payload = body?.payload ?? body

    if (!worldId) {
      throw createError({
        statusCode: 400,
        statusMessage: 'worldId is required'
      })
    }

    if (typeof payload === 'string') {
      payload = JSON.parse(payload)
    }

    const preview = preview5eToolsMonsters(payload)

    if (!preview.items.length) {
      return {
        mode,
        created: [],
        updated: [],
        skipped: [],
        warnings: preview.warnings
      }
    }

    const result = await persistImportedMonsters({
      worldId,
      mode,
      items: preview.items as any
    })

    return {
      ...result,
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
