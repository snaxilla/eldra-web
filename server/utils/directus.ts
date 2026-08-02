import type { H3Event } from 'h3'
import { createHash } from 'node:crypto'

// TEMPORARY DIAGNOSTIC ONLY -- remove once the runtime-vs-manual token
// contradiction is resolved. Not used for auth/security, only to compare
// a runtime request's token against a manually-tested token without
// logging the secret itself.
function hashToken(token: string) {
  return createHash('sha256').update(token).digest('hex')
}

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

  // TEMPORARY DIAGNOSTIC INSTRUMENTATION -- observational only, does not
  // alter the request, headers, auth, or response handling. Remove once
  // the runtime-vs-manual token/403 contradiction is resolved.
  const debugMethod = String(options.method || 'GET').toUpperCase()
  const debugUrl = `${baseUrl}${path}`
  const debugTokenRaw = String(headers.Authorization || '').replace(/^Bearer\s+/i, '')
  const debugTokenHash = debugTokenRaw ? hashToken(debugTokenRaw) : '(no token)'
  console.log(`[directus-debug] request method=${debugMethod} url=${debugUrl} token_sha256=${debugTokenHash}`)

  return await $fetch(`${baseUrl}${path}`, {
    ...options,
    headers,
    onResponse({ response }: any) {
      console.log(`[directus-debug] response method=${debugMethod} url=${debugUrl} status=${response.status} body=${JSON.stringify(response._data)}`)
    },
    onResponseError({ response }: any) {
      console.log(`[directus-debug] response method=${debugMethod} url=${debugUrl} status=${response.status} body=${JSON.stringify(response._data)}`)
    }
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

export async function fetchDirectusMe(event: H3Event) {
  return await directusRequest(
    '/users/me?fields=id,email,first_name,last_name,role.id,role.name,role.admin_access,role.app_access',
    { method: 'GET' },
    event
  )
}
