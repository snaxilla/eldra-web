import { directusServiceRequest } from '../../../utils/directus'

function assetUrl(id: any) {
  const value = String(id || '').trim()
  return value ? `/api/assets/${value}` : ''
}

function cleanText(value: any) {
  return String(value || '').trim()
}

function normalizeFile(file: any) {
  const id = cleanText(file?.id)

  return {
    id,
    title: cleanText(file?.title || file?.filename_download || file?.filename_disk || 'Untitled image'),
    filename: cleanText(file?.filename_download || file?.filename_disk || ''),
    type: cleanText(file?.type || ''),
    filesize: Number(file?.filesize || 0),
    uploadedOn: file?.uploaded_on || file?.created_on || null,
    modifiedOn: file?.modified_on || null,
    width: file?.width || null,
    height: file?.height || null,
    description: cleanText(file?.description || ''),
    tags: Array.isArray(file?.tags) ? file.tags : [],
    url: assetUrl(id)
  }
}

export default defineEventHandler(async (event) => {
  const worldId = String(getRouterParam(event, 'id') || '').trim()

  if (!worldId) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Missing world id'
    })
  }

  const query = getQuery(event)
  const search = cleanText(query.search)

  const filter: any = {
    type: { _starts_with: 'image/' }
  }

  if (search) {
    filter._or = [
      { title: { _icontains: search } },
      { filename_download: { _icontains: search } },
      { filename_disk: { _icontains: search } },
      { description: { _icontains: search } }
    ]
  }

  const filesRes = await directusServiceRequest('/files', {
    method: 'GET',
    query: {
      filter,
      sort: '-uploaded_on',
      limit: 240,
      fields: [
        'id',
        'title',
        'filename_download',
        'filename_disk',
        'type',
        'filesize',
        'uploaded_on',
        'created_on',
        'modified_on',
        'width',
        'height',
        'description',
        'tags'
      ].join(',')
    }
  })

  const files = Array.isArray(filesRes?.data) ? filesRes.data : []

  return {
    worldId,
    files: files.map(normalizeFile)
  }
})
