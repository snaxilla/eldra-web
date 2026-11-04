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
// `kind: 'link'`. The link TARGET is never taken from this flow cookie:
// see server/utils/oidc-flow.ts's own header for why it is always
// re-derived from the live session at callback time instead.
//
// `initiatingAccountId` (security review, OIDC architecture audit) records
// WHICH Account was live when this flow started, read here straight off
// `event.context.principal` (already resolved by the deny-by-default
// middleware -- no extra lookup needed). It is carried only as a
// fingerprint callback.get.ts checks against whatever Account the live
// session resolves to AT COMPLETION time, to catch the Eldra session in
// this browser having changed while the caller was away at the identity
// provider (a shared/kiosk browser, or a logout/login in another tab) --
// see oidc-flow.ts's own header for why this cannot be used to point a
// link at an attacker-chosen Account.
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
    redirect: null,
    initiatingAccountId: event.context.principal?.accountId ?? null
  })

  return sendRedirect(event, request.authorizationUrl)
})
