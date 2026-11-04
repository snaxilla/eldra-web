// Public (server/middleware/authorize.ts's PUBLIC_API_ROUTES) -- the
// provider redirects the browser here with no Eldra session of its own
// yet for a 'login' flow, so this route must be reachable unauthenticated.
// A 'link' flow's safety does NOT come from this route requiring
// authentication (it cannot: the only thing distinguishing login from link
// at this point is the flow cookie) -- it comes from re-deriving the link
// target from the caller's LIVE session below, which a login flow has no
// equivalent of at all.
//
// COOKIES ARE SET LAST, same discipline as server/api/auth/login.post.ts:
// every resolution step below (flow-state validation, OIDC verification,
// Account resolution/linking) can fail, and none of them should be able to
// leave the browser holding a session cookie for a request that overall
// did not succeed.
//
// NEVER FALLS BACK TO EMAIL. If `linkIdentityToAccount` reports a
// collision, this route refuses and reports it -- it does not retry by
// matching on email or display name, and it makes no write in that branch
// (enforced inside linkIdentityToAccount itself).
import { createError, defineEventHandler, getRequestURL, sendRedirect } from 'h3'
import { resolveAuthenticatedAccount } from '../../../utils/authorization'
import { linkIdentityToAccount, resolveAccountForIdentity } from '../../../utils/eldra-accounts'
import { createEldraSession, setEldraSessionCookie } from '../../../utils/eldra-sessions'
import { completeAuthorizationCodeGrant, isOidcConfigured } from '../../../utils/oidc'
import { readAndClearOidcFlowState } from '../../../utils/oidc-flow'

// Reason codes surfaced to app/pages/login.vue via `?oidc_error=`. Every
// one of these is already a code, never the library/provider's own
// message text -- see server/utils/oidc.ts's completeAuthorizationCodeGrant
// for where the generic-message mapping actually happens; this route adds
// only the two outcomes that exist above that function (no flow cookie,
// link target lost mid-flow).
type OidcLoginFailureCode =
  | 'cancelled'
  | 'invalid-state'
  | 'invalid-response'
  | 'not-configured'
  | 'no-flow'
  | 'account-inactive'

function redirectToLoginWithError(event: any, code: OidcLoginFailureCode) {
  return sendRedirect(event, `/login?oidc_error=${encodeURIComponent(code)}`)
}

// No dedicated account-settings page exists yet (out of scope for this
// task -- see CLAUDE.md's "no Setup Wizard" instruction and this task's
// own NON-GOALS). Linking outcomes land back on '/' with a query flag a
// future account page can read; this is a known, reported limitation, not
// an oversight.
function redirectHomeWithLinkOutcome(event: any, outcome: 'linked' | 'already-linked' | 'collision') {
  return sendRedirect(event, `/?oidc_link=${encodeURIComponent(outcome)}`)
}

export default defineEventHandler(async (event) => {
  const flow = readAndClearOidcFlowState(event)
  if (!flow) {
    return redirectToLoginWithError(event, 'no-flow')
  }

  if (!isOidcConfigured()) {
    return redirectToLoginWithError(event, 'not-configured')
  }

  const currentUrl = getRequestURL(event)
  const result = await completeAuthorizationCodeGrant(currentUrl, {
    codeVerifier: flow.codeVerifier,
    state: flow.state,
    nonce: flow.nonce
  })

  if (!result.ok) {
    if (flow.kind === 'link') {
      // A link attempt that failed verification is reported the same way
      // a login failure is -- there is no account-settings surface yet to
      // show a link-specific error on (see redirectHomeWithLinkOutcome's
      // own note).
      return redirectToLoginWithError(event, result.reason)
    }
    return redirectToLoginWithError(event, result.reason)
  }

  const { identity } = result

  if (flow.kind === 'link') {
    // THE re-derivation this task's CRITICAL ARCHITECTURE GATE and ACCOUNT
    // LINKING requirements both call for: the target Account comes from
    // the CALLER'S OWN LIVE session right now, never from anything carried
    // in the flow cookie (which never held one -- see oidc-flow.ts). If
    // the session that started this link is gone (expired, logged out,
    // revoked mid-flow), this is NOT treated as "link to whoever this
    // identity already resolves to" -- that would silently create or
    // repoint an Account from an OIDC identity alone, exactly what "never
    // merge or link identities based on email or display name" and "no
    // permission grant/transfer during linking" exist to prevent for the
    // adjacent email case. It fails instead.
    const callerAccount = await resolveAuthenticatedAccount(event)
    if (!callerAccount) {
      return redirectToLoginWithError(event, 'invalid-state')
    }

    // FINGERPRINT CHECK (security review, OIDC architecture audit): if
    // the live session changed between link.get.ts recording who started
    // this and right now -- a shared/kiosk browser, or a logout/login in
    // another tab while the caller was away at the identity provider --
    // refuse rather than silently linking to whichever Account happens to
    // be live now. See oidc-flow.ts's own header for why trusting this
    // ONLY as an equality check (never as the link target itself) does
    // not reopen the client-influenced-target vector this flow cookie was
    // built to avoid.
    if (flow.initiatingAccountId !== callerAccount.id) {
      return redirectToLoginWithError(event, 'invalid-state')
    }

    const linkResult = await linkIdentityToAccount({
      accountId: callerAccount.id,
      provider: identity.issuer,
      providerSubject: identity.subject
    })

    // No session cookie is touched here at all -- the caller was already
    // signed in via whatever session resolved callerAccount above, and
    // linking never upgrades, replaces, or re-issues it.
    return redirectHomeWithLinkOutcome(event, linkResult.outcome)
  }

  // flow.kind === 'login'. First OIDC login creates (or reuses, on every
  // later login) the Eldra Account for this (issuer, subject) -- with NO
  // platform grants and NO World memberships, per this task's own ACCOUNT
  // CREATION requirement. resolveAccountForIdentity enforces that: it
  // never grants anything, only resolves-or-creates the bare Account row.
  const account = await resolveAccountForIdentity({
    provider: identity.issuer,
    providerSubject: identity.subject,
    displayName: identity.displayName || identity.email || identity.subject
  })

  if (account.status !== 'active') {
    // Same fail-closed reading server/utils/authorization.ts's
    // resolveAuthenticatedAccount already applies to a suspended Account
    // on the Directus path: a suspended Account must not be handed a
    // session just because its underlying identity verified cleanly.
    return redirectToLoginWithError(event, 'account-inactive')
  }

  const session = await createEldraSession(account.id)
  setEldraSessionCookie(event, session.token, session.expiresAt)

  return sendRedirect(event, flow.redirect || '/')
})
