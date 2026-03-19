import { defineNuxtPlugin, useRoute } from '#app'
import { watch } from 'vue'
import { useAuth } from '~/composables/useAuth'

export default defineNuxtPlugin(async () => {
  const route = useRoute()
  const { state, fetchMe } = useAuth()

  async function ensureAuthLoaded() {
    try {
      await fetchMe()
    } catch {
      state.value.ready = true
      state.value.authenticated = false
      state.value.user = null
    }
  }

  if (!state.value.ready) {
    await ensureAuthLoaded()
  }

  watch(
    () => route.fullPath,
    async () => {
      await ensureAuthLoaded()
    }
  )
})
