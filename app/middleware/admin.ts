import { useAuth } from '~/composables/useAuth'
export default defineNuxtRouteMiddleware(async () => {
  const { state, fetchMe, isAdmin } = useAuth()

  if (!state.value.ready) {
    await fetchMe()
  }

  if (!state.value.authenticated) {
    return navigateTo('/login')
  }

  if (!isAdmin.value) {
    return navigateTo('/')
  }
})
