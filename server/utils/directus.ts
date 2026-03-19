import type { H3Event } from 'h3'

function getDirectusUrl() {
  const url = process.env.NUXT_PUBLIC_DIRECTUS_URL || ''
  if (!url) {
    throw createError({
      statusCode: 500,
      statusMessage: 'NUXT_PUBLIC_DIRECTUS_URL is not set'
    })
  }
  return url.replace(/\/+$/, '')
}

function getServiceToken() {
  return process.env.DIRECTUS_TOKEN || ''
}

export function getSessionToken(event: H3Event) {
  return getCookie(event, 'eldra_session') || ''
}

export async function directusRequest<T = any>(
  path: string,
  options: Parameters<typeof $fetch<T>>[1] = {}
) {
  return await $fetch<T>(path, {
    baseURL: getDirectusUrl(),
    ...options
  })
}

export async function directusServiceRequest<T = any>(
  path: string,
  options: Parameters<typeof $fetch<T>>[1] = {}
) {
  const token = getServiceToken()

  if (!token) {
    throw createError({
      statusCode: 500,
      statusMessage: 'DIRECTUS_TOKEN is not set'
    })
  }

  const headers = new Headers(options?.headers as HeadersInit | undefined)
  headers.set('Authorization', `Bearer ${token}`)

  return await $fetch<T>(path, {
    baseURL: getDirectusUrl(),
    ...options,
    headers
  })
}

export async function directusAuthedRequest<T = any>(
  event: H3Event,
  path: string,
  options: Parameters<typeof $fetch<T>>[1] = {}
) {
  const token = getSessionToken(event)

  if (!token) {
    throw createError({
      statusCode: 401,
      statusMessage: 'Not authenticated'
    })
  }

  const headers = new Headers(options?.headers as HeadersInit | undefined)
  headers.set('Authorization', `Bearer ${token}`)

  return await $fetch<T>(path, {
    baseURL: getDirectusUrl(),
    ...options,
    headers
  })
}

export async function fetchDirectusMe(event: H3Event) {
  const response = await directusAuthedRequest<any>(event, '/users/me', {
    method: 'GET',
    query: {
      fields: 'id,email,first_name,last_name,role.id,role.name,role.admin_access,role.app_access'
    }
  })

  return response?.data || response
}
