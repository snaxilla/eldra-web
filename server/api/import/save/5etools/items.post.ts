import { preview5eToolsItems } from '../../../../../app/lib/importers'
import { persistImportedEntities } from '../../../../utils/import-save'
import { requireCapability } from '../../../../utils/authorization'

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

    const principal = event.context.principal ?? null
    if (!principal) {
      throw createError({ statusCode: 401, statusMessage: 'Authentication required' })
    }
    requireCapability(principal, 'world.content.bind_pack', { kind: 'world', worldId: String(worldId) })

    if (typeof payload === 'string') {
      payload = JSON.parse(payload)
    }

    const preview = preview5eToolsItems(payload)

    if (!preview.items.length) {
      return {
        mode,
        created: [],
        updated: [],
        skipped: [],
        warnings: preview.warnings
      }
    }

    const result = await persistImportedEntities({
      worldId,
      mode,
      items: preview.items
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
