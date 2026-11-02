import { directusRequest, getSessionToken } from '../../utils/directus'

export default defineEventHandler(async (event) => {
  const accessToken = getSessionToken(event)
  const refreshToken = getCookie(event, 'eldra_refresh') || ''

  if (refreshToken) {
    try {
      // `unauthenticated: true` for the same reason as
      // server/api/auth/login.post.ts: `/auth/logout` authenticates by
      // the refresh_token in its body, so a logout whose access token has
      // already expired (the common case -- 15-minute Directus access
      // tokens behind an 8-hour cookie) must still be able to revoke the
      // refresh token. Without the opt-in, fail-closed directusRequest
      // would reject exactly that call; with it, no Authorization header
      // is sent at all rather than the service token being substituted.
      await directusRequest('/auth/logout', {
        method: 'POST',
        unauthenticated: true,
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
