import { createWorldMap, uploadDirectusFile } from '../../../utils/map-data'

export default defineEventHandler(async (event) => {
  const worldId = String(getRouterParam(event, 'id') || '')

  if (!worldId) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Missing world id'
    })
  }

  const parts = await readMultipartFormData(event)

  const title = parts?.find((p) => p.name === 'title')?.data?.toString() || ''
  const type = (parts?.find((p) => p.name === 'type')?.data?.toString() || 'area') as 'world' | 'country' | 'area' | 'detail'
  const file = parts?.find((p) => p.name === 'file')

  if (!title.trim()) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Missing title'
    })
  }

  if (!file?.data || !file.filename) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Missing file'
    })
  }

  const uploaded = await uploadDirectusFile(file.data, file.filename, file.type || 'application/octet-stream')
  return await createWorldMap(worldId, title.trim(), type, String(uploaded.id))
})
