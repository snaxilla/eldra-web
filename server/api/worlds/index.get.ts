import { directusServiceRequest } from '../../utils/directus'

function normalizeWorld(row: any) {
  return {
    id: row.id,
    name: row.name || 'Untitled World',
    slug: row.slug || '',
    system_key: row.system_key || row.systemKey || '',
    systemKey: row.system_key || row.systemKey || '',
    description: row.description || '',
    visibility: row.visibility || 'private',
    owner_id: row.owner_id ?? null,
    banner_image_url: null,
    sidebar_image_url: null
  }
}

export default defineEventHandler(async () => {
  const res = await directusServiceRequest('/items/worlds', {
    method: 'GET',
    query: {
      sort: 'name',
      limit: -1,
      fields: 'id,name,slug,system_key,description,visibility,owner_id'
    }
  })

  return (Array.isArray(res?.data) ? res.data : []).map(normalizeWorld)
})
