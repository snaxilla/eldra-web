import { directusRequest } from '../../utils/directus'

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

  const me = await directusRequest('/users/me', {
    headers: {
      Authorization: `Bearer ${accessToken}`
    }
  })

  return {
    ok: true,
    user: me?.data || me
  }
})
