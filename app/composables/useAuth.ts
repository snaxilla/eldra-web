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

type AuthMeResponse = {
  authenticated?: boolean
  user?: EldraUser | null
}

type LoginResponse = {
  ok?: boolean
  user?: EldraUser | null
}

function normalizeUser(input: any): EldraUser | null {
  if (!input) {
    return null
  }

  const user = input?.data ? input.data : input
  const role = user?.role?.data ? user.role.data : user?.role

  return {
    id: user?.id,
    email: user?.email,
    first_name: user?.first_name,
    last_name: user?.last_name,
    role: role
      ? {
          id: role?.id,
          name: role?.name,
          admin_access: !!role?.admin_access,
          app_access: !!role?.app_access
        }
      : undefined
  }
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
    const response = await $fetch<AuthMeResponse>('/api/auth/me', {
      method: 'GET',
      credentials: 'include'
    })

    const user = normalizeUser(response?.user)

    state.value.ready = true
    state.value.authenticated = !!response?.authenticated
    state.value.user = user

    return state.value
  }

  async function login(email: string, password: string) {
    const response = await $fetch<LoginResponse>('/api/auth/login', {
      method: 'POST',
      body: { email, password },
      credentials: 'include'
    })

    const user = normalizeUser(response?.user)

    state.value.ready = true
    state.value.authenticated = true
    state.value.user = user

    return {
      ok: !!response?.ok,
      user
    }
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
