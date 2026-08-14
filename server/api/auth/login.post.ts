// Username Login task: accepts `username` (a Player's username OR an
// existing administrator's real email -- see resolveLoginEmail's own
// comment for how the two are told apart) rather than requiring `email`
// directly. `body?.email` is still accepted as a fallback identifier key
// -- there is exactly one caller of this route today (app/composables/useAuth.ts,
// updated in the same commit to send `username`), so this is pure defensive
// slack, not a real second contract to maintain.
//
// Nothing below this point changed: resolveLoginEmail runs BEFORE the
// unchanged Directus call and never throws (see its own comment), so
// there is no new error path -- a resolved-but-wrong email fails through
// the exact same uncaught-and-unwrapped `/auth/login` rejection a bad
// email already did before this task, which is what keeps "unknown
// username" and "incorrect password" behaving exactly like today's failed
// login without this file adding any new try/catch.
//
// createError/defineEventHandler/readBody are imported explicitly (the
// same reason server/middleware/authorize.ts does) so this route is
// directly unit-testable under plain Vitest.
import { createError, defineEventHandler, readBody } from 'h3'
import { DIRECTUS_ME_FIELDS, directusRequest, setSessionCookies } from '../../utils/directus'
import { resolveLoginEmail } from '../../utils/players'

export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  const identifier = typeof body?.username === 'string' ? body.username : typeof body?.email === 'string' ? body.email : ''
  const password = body?.password

  if (!identifier || !password) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Username and password are required'
    })
  }

  const email = resolveLoginEmail(identifier)

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
