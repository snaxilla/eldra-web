export function getDirectusBaseUrl() {
  const config = useRuntimeConfig()
  return config.public.directusUrl.replace(/\/$/, '')
}

export function getDirectusToken() {
  const config = useRuntimeConfig()
  return config.directusToken
}

export async function directusRequest<T>(path: string, options: RequestInit = {}) {
  const baseUrl = getDirectusBaseUrl()
  const token = getDirectusToken()

  return await $fetch<T>(`${baseUrl}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(options.headers || {})
    }
  })
}
