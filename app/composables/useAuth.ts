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
  accountId?: string | null
  platformCapabilities?: string[]
}

type LoginResponse = {
  ok?: boolean
  user?: EldraUser | null
  accountId?: string | null
  platformCapabilities?: string[]
}

// The capability that means "administers this Eldra platform" for the
// purposes of showing administrative UI (app/middleware/admin.ts, the
// Game Admin workspace). One capability out of the platform set rather
// than "holds any" -- a future Account granted only, say,
// platform.contentpack.publish is not an administrator and must not be
// shown an administrator's workspace.
const PLATFORM_ADMIN_CAPABILITY = 'platform.settings.manage'

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
    // The Eldra Account id (server/utils/eldra-accounts.ts) -- NOT the
    // Directus user id `user.id` carries. Held so the UI can name the
    // signed-in Account without inventing an identity of its own.
    accountId: string | null
    // The Account's explicitly granted platform capabilities, exactly as
    // the server resolved them from eldra_platform_grants.
    platformCapabilities: string[]
  }>('eldra-auth', () => ({
    ready: false,
    authenticated: false,
    user: null,
    accountId: null,
    platformCapabilities: []
  }))

export function useAuth() {
  const state = useAuthState()

  // PHASE 1: now reads Eldra's own explicit platform grants, not Directus's
  // `admin_access` policy flag / "Administrator" role name.
  //
  // This is the client half of removing "Directus Administrator means Eldra
  // administrator" (server/utils/authorization.ts's can() dropped the
  // server half). The two must agree: left on the old derivation, a
  // Directus Administrator holding no Eldra grant would still be SHOWN the
  // admin workspace and then get 403 from every request inside it.
  //
  // `user.role.admin_access` is still normalized and still present on the
  // user object -- it describes the Directus account, which is a separate
  // system with separately granted permissions, and nothing in Eldra's
  // authorization reads it any more.
  const platformCapabilities = computed(() => state.value.platformCapabilities || [])

  function hasPlatformCapability(capability: string) {
    return platformCapabilities.value.includes(capability)
  }

  const isAdmin = computed(() => hasPlatformCapability(PLATFORM_ADMIN_CAPABILITY))

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
    state.value.accountId = response?.accountId ?? null
    state.value.platformCapabilities = response?.platformCapabilities ?? []

    return state.value
  }

  // `username` accepts a Player's username OR an existing administrator's
  // real email -- server/utils/players.ts's resolveLoginEmail (called from
  // server/api/auth/login.post.ts) is what tells the two apart. This
  // composable does not need to know which one it was handed.
  async function login(username: string, password: string) {
    const response = await $fetch<LoginResponse>('/api/auth/login', {
      method: 'POST',
      body: { username, password },
      credentials: 'include'
    })

    const user = normalizeUser(response?.user)

    state.value.ready = true
    state.value.authenticated = true
    state.value.user = user
    state.value.accountId = response?.accountId ?? null
    state.value.platformCapabilities = response?.platformCapabilities ?? []

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
    state.value.accountId = null
    state.value.platformCapabilities = []

    await navigateTo('/login')
  }

  return {
    state,
    isAdmin,
    platformCapabilities,
    hasPlatformCapability,
    displayName,
    fetchMe,
    login,
    logout
  }
}
