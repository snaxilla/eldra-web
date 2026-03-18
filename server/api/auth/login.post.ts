import { directusRequest } from '../../utils/directus'

export default defineEventHandler(async (event) => {
  const body = await readBody<{
    email?: string
    password?: string
  }>(event)

  const email = (body?.email || '').trim().toLowerCase()
  const password = body?.password || ''

  if (!email || !password) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Email and password are required'
    })
  }

  const loginResponse = await directusRequest<any>('/auth/login', {
    method: 'POST',
    body: {
      email,
      password
    }
  })

  const accessToken =
    loginResponse?.data?.access_token ||
    loginResponse?.access_token ||
    ''

  const refreshToken =
    loginResponse?.data?.refresh_token ||
    loginResponse?.refresh_token ||
    ''

  const expires =
    loginResponse?.data?.expires ||
    loginResponse?.expires ||
    60 * 60 * 8

  if (!accessToken) {
    throw createError({
      statusCode: 401,
      statusMessage: 'Login failed'
    })
  }

  setCookie(event, 'eldra_session', accessToken, {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    path: '/',
    maxAge: typeof expires === 'number' && expires > 0 ? expires : 60 * 60 * 8
  })

  if (refreshToken) {
    setCookie(event, 'eldra_refresh', refreshToken, {
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 24 * 30
    })
  }

  const meResponse = await directusRequest<any>('/users/me', {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${accessToken}`
    },
    query: {
      fields: 'id,email,first_name,last_name,role.id,role.name,role.admin_access,role.app_access'
    }
  })

  const user = meResponse?.data || meResponse || null

  return {
    ok: true,
    user
  }
})
