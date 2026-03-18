import { useAuth } from '~/composables/useAuth'

export default defineNuxtPlugin(async () => {
  const { state, fetchMe } = useAuth()

  if (!state.value.ready) {
    try {
      await fetchMe()
    } catch {
      state.value.ready = true
      state.value.authenticated = false
      state.value.user = null
    }
  }
})
