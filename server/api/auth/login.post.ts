import { DIRECTUS_ME_FIELDS, directusRequest } from '../../utils/directus'

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

  if (!accessToken) {
    throw createError({
      statusCode: 401,
      statusMessage: 'Login failed'
    })
  }

  // 🔥 FIXED COOKIE CONFIG
  setCookie(event, 'eldra_session', accessToken, {
    httpOnly: true,
    secure: false,          // 👈 KEY CHANGE
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 8
  })

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
