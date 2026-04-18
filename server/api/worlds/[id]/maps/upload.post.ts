import { createMap, uploadFile } from '../../../../utils/directus-maps'

export default defineEventHandler(async (event) => {
  const worldId = String(getRouterParam(event, 'id') || '')

  const parts = await readMultipartFormData(event)

  const title = parts?.find(p => p.name === 'title')?.data?.toString() || ''
  const type = parts?.find(p => p.name === 'type')?.data?.toString() || 'area'
  const file = parts?.find(p => p.name === 'file')

  if (!file?.data) {
    throw createError({ statusCode: 400, statusMessage: 'Missing file' })
  }

  const uploaded = await uploadFile(file.data, file.filename!, file.type || 'image/png')

  return await createMap(worldId, title, type as any, uploaded.id)
})
