import { useAuth } from '~/composables/useAuth'
import { buildLoginRedirect } from '~/utils/safeRedirect'
export default defineNuxtRouteMiddleware(async (to) => {
  const { state, fetchMe } = useAuth()

  if (!state.value.ready) {
    await fetchMe()
  }

  if (!state.value.authenticated) {
    // Same return-path preservation as middleware/admin.ts -- both call
    // the one shared builder now (see safeRedirect.ts) instead of
    // maintaining two copies of the same redirect shape.
    return navigateTo(buildLoginRedirect(to.fullPath))
  }
})
