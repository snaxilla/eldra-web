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

  try {
    return await $fetch(`${baseUrl}${path}`, {
      ...options,
      headers
    })
  } catch (error: any) {
    // TEMPORARY: surface the complete, unmodified Directus error payload
    // as the Eldra API's own error response, so it's visible directly in
    // the browser Network tab instead of being collapsed/summarized.
    // Does not alter the request, headers, or auth above.
    const directusBody = error?.data ?? error?.response?._data ?? null

    throw createError({
      statusCode: error?.response?.status || error?.statusCode || 502,
      statusMessage: 'Directus request failed',
      message: JSON.stringify(directusBody ?? { message: error?.message || String(error) }),
      data: directusBody
    })
  }
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
