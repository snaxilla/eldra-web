import { useAuth } from '~/composables/useAuth'
export default defineNuxtRouteMiddleware(async (to) => {
  const { state, fetchMe, isAdmin } = useAuth()

  if (!state.value.ready) {
    await fetchMe()
  }

  if (!state.value.authenticated) {
    // Record where they were actually going so login can return them to it
    // (e.g. /worlds/:id/admin) instead of dropping them on the world list.
    return navigateTo({ path: '/login', query: { redirect: to.fullPath } })
  }

  if (!isAdmin.value) {
    return navigateTo('/')
  }
})
