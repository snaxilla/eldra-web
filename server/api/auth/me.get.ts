import { fetchDirectusMe } from '../../utils/directus'

export default defineEventHandler(async (event) => {
  const token = getCookie(event, 'eldra_session')

  if (!token) {
    return {
      authenticated: false,
      user: null
    }
  }

  try {
    const user = await fetchDirectusMe(event)

    return {
      authenticated: true,
      user
    }
  } catch {
    deleteCookie(event, 'eldra_session', { path: '/' })
    deleteCookie(event, 'eldra_refresh', { path: '/' })

    return {
      authenticated: false,
      user: null
    }
  }
})
