import { useAuth } from '~/composables/useAuth'
export default defineNuxtRouteMiddleware(async () => {
  const { state, fetchMe } = useAuth()

  if (!state.value.ready) {
    await fetchMe()
  }

  if (!state.value.authenticated) {
    return navigateTo('/login')
  }
})
