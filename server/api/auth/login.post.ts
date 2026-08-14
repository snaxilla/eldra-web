import { DIRECTUS_ME_FIELDS, directusRequest, setSessionCookies } from '../../utils/directus'

export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  const { email, password } = body

  if (!email || !password) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Email and password are required'
    })
  }

  const loginResponse = await directusRequest('/auth/login', {
    method: 'POST',
    body: { email, password }
  })

  const accessToken =
    loginResponse?.data?.access_token ||
    loginResponse?.access_token

  // Previously discarded -- the actual regression this fixes. Directus's
  // access tokens default to a 15-minute TTL, and nothing renewed one
  // once it expired, because the refresh_token Directus already returns
  // here was never captured or stored. server/api/auth/logout.post.ts and
  // server/api/auth/me.get.ts both already read/delete an `eldra_refresh`
  // cookie that this handler alone is responsible for ever setting -- see
  // server/utils/directus.ts's refreshDirectusSession for the other half.
  const refreshToken =
    loginResponse?.data?.refresh_token ||
    loginResponse?.refresh_token

  if (!accessToken) {
    throw createError({
      statusCode: 401,
      statusMessage: 'Login failed'
    })
  }

  setSessionCookies(event, accessToken, refreshToken)

  // `fields` is REQUIRED here: without it Directus returns `role` as a bare
  // id string, which useAuth's normalizeUser silently reduces to
  // `admin_access: false` -- demoting an administrator for the rest of the
  // client session. Shares one field list with fetchDirectusMe so the two
  // cannot diverge again (see DIRECTUS_ME_FIELDS).
  const me = await directusRequest(`/users/me?fields=${DIRECTUS_ME_FIELDS}`, {
    headers: {
      Authorization: `Bearer ${accessToken}`
    }
  })

  return {
    ok: true,
    user: me?.data || me
  }
})
