// DELIBERATELY NOT in server/middleware/authorize.ts's PUBLIC_API_ROUTES --
// starting a 'link' flow requires an already-authenticated caller (today,
// that means signed in via Directus; see this task's own ACCOUNT LINKING
// requirement: "a user already authenticated to Eldra through Directus").
// The middleware's deny-by-default enforcement already guarantees
// `event.context.principal` is a real Principal by the time this handler
// runs -- if it is not, the middleware itself rejects the request with 401
// before this file ever executes, so there is no principal check to
// duplicate here.
//
// This starts the IDENTICAL OIDC round-trip login.get.ts does -- same
// buildAuthorizationRequest call, same flow cookie shape -- except
// `kind: 'link'`. It does NOT put the caller's accountId into the flow
// cookie: see server/utils/oidc-flow.ts's own header for why the link
// target is always re-derived from the live session at callback time
// instead.
import { createError, defineEventHandler, sendRedirect } from 'h3'
import { buildAuthorizationRequest, isOidcConfigured } from '../../../utils/oidc'
import { setOidcFlowCookie } from '../../../utils/oidc-flow'

export default defineEventHandler(async (event) => {
  if (!isOidcConfigured()) {
    throw createError({ statusCode: 404, statusMessage: 'Identity provider sign-in is not configured.' })
  }

  const request = await buildAuthorizationRequest()

  setOidcFlowCookie(event, {
    codeVerifier: request.codeVerifier,
    state: request.state,
    nonce: request.nonce,
    kind: 'link',
    redirect: null
  })

  return sendRedirect(event, request.authorizationUrl)
})
