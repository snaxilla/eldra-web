// The client's "who am I" endpoint. Public (see PUBLIC_API_ROUTES in
// server/middleware/authorize.ts), so it resolves identity itself rather
// than reading event.context.principal.
//
// PHASE 1 ADDED `accountId` AND `platformCapabilities`. Until now the
// browser decided whether to show administrative UI by reading Directus's
// own `admin_access` policy flag off the user payload
// (app/composables/useAuth.ts's `isAdmin`). That is the same implicit
// "Directus Administrator means Eldra administrator" derivation
// server/utils/authorization.ts just stopped making server-side, and
// leaving it in place on the client would have left the two disagreeing:
// the admin UI visible, every request behind it 403. The client now reads
// the SAME explicit grants the server enforces.
//
// The Directus `user` payload is still returned unchanged -- it carries
// the email and name the UI displays, and removing fields from it is not
// this phase's job.
import { fetchDirectusMe } from '../../utils/directus'
import { formatAccountDisplayName } from '../../utils/accounts'
import { getAccountById, listPlatformGrants, resolveAccountForIdentity } from '../../utils/eldra-accounts'
import { clearEldraSessionCookie, getEldraSessionToken, resolveEldraSession } from '../../utils/eldra-sessions'

export default defineEventHandler(async (event) => {
  // OIDC-issued session, checked FIRST and never cross-trusted with the
  // Directus branch below -- same fixed order and "never both"
  // reasoning as server/utils/authorization.ts's own
  // resolveAuthenticatedAccount, which this duplicates rather than calls
  // directly only because this route additionally needs to clear a
  // bad/expired cookie, which that shared function (used by every OTHER
  // route via the deny-by-default middleware) deliberately does not do.
  const eldraSessionToken = getEldraSessionToken(event)
  if (eldraSessionToken) {
    const session = await resolveEldraSession(eldraSessionToken)
    const account = session ? await getAccountById(session.accountId) : null

    if (!account || account.status !== 'active') {
      clearEldraSessionCookie(event)
      return {
        authenticated: false,
        user: null,
        accountId: null,
        platformCapabilities: []
      }
    }

    const platformCapabilities = await listPlatformGrants(account.id)

    return {
      authenticated: true,
      // No Directus user record exists for an OIDC-only identity -- `email`
      // is the one display field app/composables/useAuth.ts's displayName
      // computed falls back to, seeded from the Account's own display
      // name rather than left null (which would otherwise render as
      // "Guest User" for a signed-in Account). Never the provider's raw
      // claims, and no token/secret of any kind.
      user: { email: account.displayName },
      accountId: account.id,
      platformCapabilities
    }
  }

  const token = getCookie(event, 'eldra_session')

  if (!token) {
    return {
      authenticated: false,
      user: null,
      accountId: null,
      platformCapabilities: []
    }
  }

  let user: any
  try {
    user = await fetchDirectusMe(event)
  } catch {
    // Only a rejected SESSION clears cookies. Everything below this point
    // is authorization data, and a failure to read it must not look like
    // being signed out -- see the next try-less block.
    deleteCookie(event, 'eldra_session', { path: '/' })
    deleteCookie(event, 'eldra_refresh', { path: '/' })

    return {
      authenticated: false,
      user: null,
      accountId: null,
      platformCapabilities: []
    }
  }

  // Deliberately NOT wrapped: if the Eldra Account or its grants cannot be
  // read, this request fails. Returning `authenticated: true` with no
  // capabilities would log the browser into a UI stripped of everything it
  // is actually allowed to do, and returning `authenticated: false` would
  // sign a valid session out over a transient read failure. Failing loudly
  // is the only answer that does not lie.
  const row = user?.data ?? user
  const account = await resolveAccountForIdentity({
    provider: 'directus',
    providerSubject: String(row?.id ?? ''),
    displayName: formatAccountDisplayName(row)
  })
  const platformCapabilities = await listPlatformGrants(account.id)

  return {
    authenticated: true,
    user,
    accountId: account.id,
    platformCapabilities
  }
})
