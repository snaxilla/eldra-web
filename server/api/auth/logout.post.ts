import { directusRequest, getSessionToken } from '../../utils/directus'

export default defineEventHandler(async (event) => {
  const accessToken = getSessionToken(event)
  const refreshToken = getCookie(event, 'eldra_refresh') || ''

  if (refreshToken) {
    try {
      await directusRequest('/auth/logout', {
        method: 'POST',
        headers: accessToken
          ? { Authorization: `Bearer ${accessToken}` }
          : undefined,
        body: {
          refresh_token: refreshToken
        }
      })
    } catch {}
  }

  deleteCookie(event, 'eldra_session', { path: '/' })
  deleteCookie(event, 'eldra_refresh', { path: '/' })

  return {
    ok: true
  }
})
