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
// Directus returns a relational field (`role`) as a bare primary-key
// string unless its subfields are named explicitly. `normalizeUser`
// (app/composables/useAuth.ts) then turns that bare string into
// `{ admin_access: false, app_access: false }` -- it does not throw, it
// silently demotes an administrator to a non-admin. That is exactly what
// happened when login.post.ts called `/users/me` without this list while
// me.get.ts (below) requested it: an admin who had just logged in was
// bounced out of /worlds/:id/admin by middleware/admin.ts until the next
// full page load re-fetched the real role.
export const DIRECTUS_ME_FIELDS =
  'id,email,first_name,last_name,role.id,role.name,role.admin_access,role.app_access'

export async function fetchDirectusMe(event: H3Event) {
  return await directusRequest(
    `/users/me?fields=${DIRECTUS_ME_FIELDS}`,
    { method: 'GET' },
    event
  )
}
