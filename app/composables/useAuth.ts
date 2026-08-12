import { resolveAccessFlag } from '~/utils/directusAccess'

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

  // Access flags come from POLICIES in Directus 11, never from the role
  // itself -- see app/utils/directusAccess.ts for the full reasoning and
  // the silent-collapse behavior that made reading `role.admin_access`
  // look like a working check. Derived into the existing
  // `role.admin_access` shape so `isAdmin` and every other reader keep
  // working unchanged; this fixes where the value comes FROM, not what
  // the authorization model is.
  const adminAccess = resolveAccessFlag(user, 'admin_access')
  const appAccess = resolveAccessFlag(user, 'app_access')

  return {
    id: user?.id,
    email: user?.email,
    first_name: user?.first_name,
    last_name: user?.last_name,
    // A user can hold policies directly, with no role at all, so grants
    // must survive even when `role` is absent -- otherwise a roleless
    // admin would normalize back to a non-admin.
    role: role || adminAccess || appAccess
      ? {
          id: role?.id,
          name: role?.name,
          admin_access: adminAccess,
          app_access: appAccess
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
    // On the server, `credentials: 'include'` means nothing and Nuxt does
    // NOT forward the browser's Cookie header to an internal $fetch, so
    // /api/auth/me sees no `eldra_session` and reports the user as
    // unauthenticated. Route middleware runs during SSR, so without this
    // forwarding every FULL page load of a guarded route (a refresh, or
    // opening /worlds/:id/admin directly) bounced a logged-in user to
    // /login. Client-side navigation was unaffected, which is why the
    // failure only appeared on reload.
    const headers = import.meta.server ? useRequestHeaders(['cookie']) : undefined

    const response = await $fetch<AuthMeResponse>('/api/auth/me', {
      method: 'GET',
      credentials: 'include',
      headers
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
