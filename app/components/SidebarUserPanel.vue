<script setup lang="ts">
import { watchEffect } from 'vue'
import { useAuth } from '~/composables/useAuth'

const { state, displayName, isAdmin, fetchMe, logout } = useAuth()

// 🔥 This is the fix: always ensure auth state resolves
watchEffect(async () => {
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
</script>

<template>
  <div class="mt-auto border-t border-neutral-800 p-4">
    <template v-if="state.authenticated">
      <div class="text-sm font-medium text-neutral-200 truncate">
        {{ displayName }}
      </div>

      <div class="mt-1 text-xs text-neutral-500 truncate">
        {{ state.user?.email }}
      </div>

      <div class="mt-3 flex flex-col gap-2">
        <NuxtLink
          v-if="isAdmin"
          to="/admin"
          class="rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-neutral-200 hover:bg-neutral-800"
        >
          Admin
        </NuxtLink>

        <button
          type="button"
          class="rounded-lg border border-red-900 bg-red-950/60 px-3 py-2 text-left text-sm text-red-300 hover:bg-red-950"
          @click="logout"
        >
          Logout
        </button>
      </div>
    </template>

    <NuxtLink
      v-else
      to="/login"
      class="block rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-center text-sm text-neutral-200 hover:bg-neutral-800"
    >
      Login
    </NuxtLink>
  </div>
</template>
