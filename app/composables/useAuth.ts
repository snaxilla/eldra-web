type EldraUserRole = {
  id?: string
  name?: string
  admin_access?: boolean
  app_access?: boolean
}

type EldraUser = {
  id?: string
  email?: string
  first_name?: string
  last_name?: string
  role?: EldraUserRole
}

export const useAuthState = () =>
  useState<{
    ready: boolean
    authenticated: boolean
    user: EldraUser | null
  }>('eldra-auth', () => ({
    ready: false,
    authenticated: false,
    user: null
  }))

export function useAuth() {
  const state = useAuthState()

  const isAdmin = computed(() => {
    const role = state.value.user?.role
    return !!role?.admin_access || role?.name === 'Administrator'
  })

  const displayName = computed(() => {
    const user = state.value.user
    const first = user?.first_name?.trim() || ''
    const last = user?.last_name?.trim() || ''
    const full = `${first} ${last}`.trim()
    return full || user?.email || 'Guest User'
  })

  async function fetchMe() {
    const response = await $fetch<{
      authenticated: boolean
      user: EldraUser | null
    }>('/api/auth/me', {
      method: 'GET',
      credentials: 'include'
    })

    state.value.ready = true
    state.value.authenticated = !!response?.authenticated
    state.value.user = response?.user || null

    return state.value
  }

  async function login(email: string, password: string) {
    const response = await $fetch<{
      ok: boolean
      user: EldraUser
    }>('/api/auth/login', {
      method: 'POST',
      body: { email, password },
      credentials: 'include'
    })

    state.value.ready = true
    state.value.authenticated = true
    state.value.user = response.user

    return response
  }

  async function logout() {
    await $fetch('/api/auth/logout', {
      method: 'POST',
      credentials: 'include'
    })

    state.value.ready = true
    state.value.authenticated = false
    state.value.user = null

    await navigateTo('/login')
  }

  return {
    state,
    isAdmin,
    displayName,
    fetchMe,
    login,
    logout
  }
}
