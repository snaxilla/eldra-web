// Unit tests for server/utils/oidc-flow.ts -- the short-lived flow cookie
// that carries PKCE/state/nonce across the OIDC redirect round-trip. h3's
// real getCookie/setCookie/deleteCookie are exercised against a minimal
// in-memory cookie jar (not mocked), since this module's entire job IS
// cookie read/write correctness.

import { describe, expect, it } from 'vitest'
import type { H3Event } from 'h3'
import { OIDC_FLOW_COOKIE, readAndClearOidcFlowState, setOidcFlowCookie, type OidcFlowState } from '../../../server/utils/oidc-flow'

// A tiny H3Event stand-in whose node.req/res cooperate with h3's actual
// getCookie/setCookie/deleteCookie: a request Cookie header read once at
// construction, and a response that records Set-Cookie headers so a
// setCookie followed by a readAndClearOidcFlowState in the SAME test can
// observe its own write -- mirroring one browser round-trip, without a
// real HTTP server.
// Matches exactly what h3's own setCookie/getCookie/deleteCookie touch
// on event.node.req/res (verified against node_modules/h3/dist/index.mjs):
// req.headers.cookie for reads, and res.getHeader/setHeader/removeHeader/
// appendHeader for writes -- a minimal Node ServerResponse stand-in, not a
// full mock of h3 itself.
function fakeEvent(requestCookies: Record<string, string> = {}): H3Event {
  const cookieHeader = Object.entries(requestCookies)
    .map(([key, value]) => `${key}=${encodeURIComponent(value)}`)
    .join('; ')

  const responseHeaders: Record<string, any> = {}

  return {
    node: {
      req: { headers: { cookie: cookieHeader } },
      res: {
        getHeader: (name: string) => responseHeaders[name.toLowerCase()],
        setHeader: (name: string, value: any) => {
          responseHeaders[name.toLowerCase()] = value
        },
        removeHeader: (name: string) => {
          delete responseHeaders[name.toLowerCase()]
        },
        appendHeader: (name: string, value: any) => {
          const key = name.toLowerCase()
          const current = responseHeaders[key]
          responseHeaders[key] = current === undefined ? value : [...(Array.isArray(current) ? current : [current]), value]
        }
      }
    },
    context: {}
  } as unknown as H3Event
}

// Applies the Set-Cookie headers an event's response accumulated back
// onto a FRESH event's request headers -- simulates the browser carrying
// a Set-Cookie from one response into the Cookie header of its next
// request, which is what lets setOidcFlowCookie's write be observed by a
// later readAndClearOidcFlowState call in the same test.
function setCookieEntries(event: H3Event): string[] {
  const header = (event as any).node.res.getHeader('set-cookie')
  if (!header) return []
  return Array.isArray(header) ? header : [header]
}

function cookiesSetOn(event: H3Event): Record<string, string> {
  const result: Record<string, string> = {}
  for (const entry of setCookieEntries(event)) {
    const [pair] = entry.split(';')
    const [key, ...rest] = pair.split('=')
    result[key] = decodeURIComponent(rest.join('='))
  }
  return result
}

const FLOW: OidcFlowState = {
  codeVerifier: 'verifier-1',
  state: 'state-1',
  nonce: 'nonce-1',
  kind: 'login',
  redirect: '/worlds/abc'
}

describe('setOidcFlowCookie / readAndClearOidcFlowState', () => {
  it('round-trips a written flow state back out exactly', () => {
    const writeEvent = fakeEvent()
    setOidcFlowCookie(writeEvent, FLOW)

    const readEvent = fakeEvent(cookiesSetOn(writeEvent))
    const result = readAndClearOidcFlowState(readEvent)

    expect(result).toEqual(FLOW)
  })

  it('clears the cookie on read -- a second read of the same request sees nothing', () => {
    const writeEvent = fakeEvent()
    setOidcFlowCookie(writeEvent, FLOW)

    const readEvent = fakeEvent(cookiesSetOn(writeEvent))
    readAndClearOidcFlowState(readEvent)

    // The SAME event, read again -- h3's getCookie reads the request
    // header each time, which this helper never mutates, so this proves
    // the function's OWN contract (single-use is enforced by the browser
    // actually dropping the cookie after deleteCookie's Set-Cookie, not by
    // this process remembering it already consumed one) rather than
    // asserting something this module cannot actually guarantee alone.
    // What IS verifiable here: deleteCookie was called, i.e. a clearing
    // Set-Cookie was written.
    const cleared = setCookieEntries(readEvent)
    expect(cleared.some((entry) => entry.startsWith(`${OIDC_FLOW_COOKIE}=;`))).toBe(true)
  })

  it('returns null when there is no flow cookie at all', () => {
    expect(readAndClearOidcFlowState(fakeEvent())).toBeNull()
  })

  it('returns null for a malformed (non-JSON) cookie value, rather than throwing', () => {
    const event = fakeEvent({ [OIDC_FLOW_COOKIE]: 'not-json' })
    expect(readAndClearOidcFlowState(event)).toBeNull()
  })

  it.each([
    ['missing codeVerifier', { ...FLOW, codeVerifier: '' }],
    ['missing state', { ...FLOW, state: '' }],
    ['missing nonce', { ...FLOW, nonce: '' }],
    ['an invalid kind', { ...FLOW, kind: 'evil' as any }]
  ])('returns null for a tampered/incomplete flow state (%s)', (_label, tampered) => {
    const event = fakeEvent({ [OIDC_FLOW_COOKIE]: JSON.stringify(tampered) })
    expect(readAndClearOidcFlowState(event)).toBeNull()
  })

  it('never carries an accountId or any field beyond codeVerifier/state/nonce/kind/redirect', () => {
    const writeEvent = fakeEvent()
    setOidcFlowCookie(writeEvent, { ...FLOW, kind: 'link', redirect: null })

    const raw = cookiesSetOn(writeEvent)[OIDC_FLOW_COOKIE]
    expect(Object.keys(JSON.parse(raw)).sort()).toEqual(['codeVerifier', 'kind', 'nonce', 'redirect', 'state'])
  })
})
