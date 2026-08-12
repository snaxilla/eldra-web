import { useAuth } from '~/composables/useAuth'
export default defineNuxtRouteMiddleware(async (to) => {
  const { state, fetchMe } = useAuth()

  if (!state.value.ready) {
    await fetchMe()
  }

  if (!state.value.authenticated) {
    // Same return-path preservation as middleware/admin.ts.
    return navigateTo({ path: '/login', query: { redirect: to.fullPath } })
  }
})
