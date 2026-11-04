// Public (server/middleware/authorize.ts's PUBLIC_API_ROUTES) -- starting
// a 'login' flow requires no existing Eldra session, by design: this is
// the entry point for someone who is not signed in at all. Contrast with
// link.get.ts, which starts the identical OIDC round-trip but requires an
// ALREADY-authenticated caller, because a 'link' flow's whole point is
// attaching a verified identity to a session that already exists.
//
// A plain browser navigation (an <a href>, not an XHR) -- it redirects the
// browser to the provider, so there is nothing for a client-side caller to
// do with a JSON response here.
import { createError, defineEventHandler, getQuery, sendRedirect } from 'h3'
import { safeRedirectTarget } from '../../../../app/utils/safeRedirect'
import { buildAuthorizationRequest, isOidcConfigured } from '../../../utils/oidc'
import { setOidcFlowCookie } from '../../../utils/oidc-flow'

export default defineEventHandler(async (event) => {
  if (!isOidcConfigured()) {
    throw createError({ statusCode: 404, statusMessage: 'Identity provider sign-in is not configured.' })
  }

  const query = getQuery(event)
  const redirect = safeRedirectTarget(query.redirect)

  const request = await buildAuthorizationRequest()

  setOidcFlowCookie(event, {
    codeVerifier: request.codeVerifier,
    state: request.state,
    nonce: request.nonce,
    kind: 'login',
    redirect,
    initiatingAccountId: null
  })

  return sendRedirect(event, request.authorizationUrl)
})
