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
import { formatAccountDisplayName } from '../../utils/accounts'
import { listPlatformGrants, resolveAccountForIdentity } from '../../utils/eldra-accounts'
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

  // `unauthenticated: true` (Phase 1 authorization preflight, finding A):
  // Directus's `/auth/login` takes its credential in the request BODY and
  // needs no Authorization header -- but directusRequest is now
  // fail-closed and rejects a call it cannot authenticate as a user, so
  // the two endpoints that are legitimately credential-free have to say
  // so. Before that change this call silently carried the Directus
  // SERVICE token, which was harmless here only because `/auth/login`
  // ignores it.
  const loginResponse = await directusRequest('/auth/login', {
    method: 'POST',
    unauthenticated: true,
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

  // COOKIES ARE SET LAST, AND THAT ORDERING IS THE POINT.
  //
  // This handler used to call setSessionCookies HERE, immediately after
  // Directus accepted the password and before any Eldra resolution had
  // run. Every step below it can fail -- the Eldra Account lookup and the
  // platform-grant read both talk to the identity store -- and when one
  // did, the response was an error but the browser had ALREADY been given
  // a valid `eldra_session`. That combination is worse than either
  // failure alone:
  //
  //   1. Login returns an error, so the user believes they are signed out.
  //   2. They are not: `eldra_session` is set, so /api/auth/me stops
  //      short-circuiting on "no cookie" and starts calling the identity
  //      store too -- where it fails the same way.
  //   3. `await fetchMe()` is unguarded in app/middleware/auth.ts,
  //      app/middleware/admin.ts, app/pages/index.vue and
  //      app/pages/login.vue, all of which run during SSR -- so every
  //      page errors, INCLUDING /login.
  //   4. There is no in-app way out: reaching the login form to retry is
  //      itself one of the broken pages, and nothing clears the cookie.
  //
  // Setting cookies only once every required resolution has succeeded
  // turns that dead end into an ordinary failed login: an error, no
  // cookie, /login still renders, the app still usable as signed-out. It
  // matters most in the window before the identity collections are
  // provisioned, but the ordering is correct independent of that -- a
  // session should not outlive the request that was supposed to establish
  // it.
  //
  // Nothing below needs the cookie to run: the /users/me call authorizes
  // with the access token explicitly, from the login response in hand.

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

  // Phase 1: the same `accountId` / `platformCapabilities` pair
  // server/api/auth/me.get.ts returns. Without it the browser would hold a
  // logged-in session with no known capabilities until its next /me call,
  // and app/middleware/admin.ts (which only calls fetchMe when state is
  // not yet ready) would bounce a freshly-logged-in administrator straight
  // back out of the admin workspace.
  const row = me?.data || me
  const account = await resolveAccountForIdentity({
    provider: 'directus',
    providerSubject: String(row?.id ?? ''),
    displayName: formatAccountDisplayName(row)
  })
  const platformCapabilities = await listPlatformGrants(account.id)

  // Everything required has resolved -- only now does the browser get a
  // session.
  setSessionCookies(event, accessToken, refreshToken)

  return {
    ok: true,
    user: row,
    accountId: account.id,
    platformCapabilities
  }
})
