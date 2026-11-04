// Public (server/middleware/authorize.ts's PUBLIC_API_ROUTES). Lets
// app/pages/login.vue decide whether to show "Sign in with your identity
// provider" at all, without ever exposing the issuer URL, client id, or
// client secret to the browser -- only the boolean this task's own LOGIN
// UI requirement asks for.
import { defineEventHandler } from 'h3'
import { isOidcConfigured } from '../../../utils/oidc'

export default defineEventHandler(() => {
  return { configured: isOidcConfigured() }
})
