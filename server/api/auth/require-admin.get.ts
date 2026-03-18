import { fetchDirectusMe } from '../../utils/directus'

export default defineEventHandler(async (event) => {
  const user = await fetchDirectusMe(event)

  const role = user?.role || {}
  const isAdmin = !!role?.admin_access || role?.name === 'Administrator'

  if (!isAdmin) {
    throw createError({
      statusCode: 403,
      statusMessage: 'Admin access required'
    })
  }

  return {
    ok: true,
    user
  }
})
