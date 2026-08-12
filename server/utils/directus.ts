import type { H3Event } from 'h3'

function getRuntimeDirectusConfig() {
  const config = useRuntimeConfig()

  const baseUrl = String(
    process.env.DIRECTUS_URL ||
    (config as any).directusUrl ||
    process.env.NUXT_PUBLIC_DIRECTUS_URL ||
    config.public.directusUrl ||
    ''
  ).replace(/\/$/, '')

  const serviceToken = String(
    process.env.DIRECTUS_TOKEN ||
    config.directusToken ||
    ''
  )

  if (!baseUrl) {
    throw createError({
      statusCode: 500,
      statusMessage: 'Directus URL is not configured'
    })
  }

  return { baseUrl, serviceToken }
}

export function getSessionToken(event: H3Event) {
  return getCookie(event, 'eldra_session') || ''
}

export async function directusServiceRequest(path: string, options: any = {}) {
  const { baseUrl, serviceToken } = getRuntimeDirectusConfig()

  const headers: Record<string, string> = {
    ...(options.headers || {})
  }

  if (!headers.Authorization && serviceToken) {
    headers.Authorization = `Bearer ${serviceToken}`
  }

  return await $fetch(`${baseUrl}${path}`, {
    ...options,
    headers
  })
}

export async function directusRequest(path: string, options: any = {}, event?: H3Event) {
  const { baseUrl, serviceToken } = getRuntimeDirectusConfig()

  const headers: Record<string, string> = {
    ...(options.headers || {})
  }

  if (!headers.Authorization) {
    const sessionToken = event ? getSessionToken(event) : ''
    const tokenToUse = sessionToken || serviceToken

    if (tokenToUse) {
      headers.Authorization = `Bearer ${tokenToUse}`
    }
  }

  return await $fetch(`${baseUrl}${path}`, {
    ...options,
    headers
  })
}

// The field set EVERY "who am I" read must request, shared so the two
// callers can never drift apart again.
//
// Two separate traps are encoded in this one string.
//
// 1. Directus returns a relational field (`role`) as a bare primary-key
//    string unless its subfields are named explicitly. `normalizeUser`
//    (app/composables/useAuth.ts) then cannot read anything off it.
//
// 2. `admin_access`/`app_access` live on `directus_policies`, NOT on
//    `directus_roles`, as of Directus 11. Verified against the deployed
//    instance (11.12.0): `GET /fields/directus_roles` lists no
//    `admin_access`. Requesting `role.admin_access` anyway does not
//    error -- Directus answers HTTP 200 and silently reduces the WHOLE
//    selection to `{ id }`:
//
//      fields=id,email,role.id,role.name              -> full record
//      fields=...,role.admin_access                   -> {"id":"..."}
//
//    That returned a user with no role at all, so `isAdmin` was false
//    while `authenticated` stayed true, and middleware/admin.ts
//    redirected every administrator out of /worlds/:id/admin to '/'.
//
// Policies are read from both the role and the user, because Directus 11
// allows either to carry them. See app/utils/directusAccess.ts for the
// matching read side.
export const DIRECTUS_ME_FIELDS =
  'id,email,first_name,last_name,role.id,role.name,' +
  'role.policies.policy.admin_access,role.policies.policy.app_access,' +
  'policies.policy.admin_access,policies.policy.app_access'

export async function fetchDirectusMe(event: H3Event) {
  return await directusRequest(
    `/users/me?fields=${DIRECTUS_ME_FIELDS}`,
    { method: 'GET' },
    event
  )
}
