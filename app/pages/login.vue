<script setup lang="ts">
import { useAuth } from '~/composables/useAuth'
definePageMeta({
  layout: false
})

const { login, state } = useAuth()

const email = ref('')
const password = ref('')
const loading = ref(false)
const errorMessage = ref('')

async function submit() {
  errorMessage.value = ''
  loading.value = true

  try {
    await login(email.value, password.value)

    const target = state.value.user?.role?.admin_access ? '/admin' : '/'
    await navigateTo(target)
  } catch (error: any) {
    errorMessage.value =
      error?.data?.statusMessage ||
      error?.statusMessage ||
      'Login failed'
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="min-h-screen bg-slate-950 text-slate-100">
    <div class="mx-auto flex min-h-screen max-w-md items-center px-6">
      <div class="w-full rounded-2xl border border-slate-800 bg-slate-900/90 p-8 shadow-2xl">
        <div class="mb-6">
          <div class="text-xs uppercase tracking-[0.3em] text-slate-400">
            Worldbuilding Hub
          </div>
          <h1 class="mt-2 text-3xl font-bold">
            Eldra Login
          </h1>
          <p class="mt-2 text-sm text-slate-400">
            Sign in with your Directus account.
          </p>
        </div>

        <form class="space-y-4" @submit.prevent="submit">
          <div>
            <label class="mb-2 block text-sm text-slate-300">Email</label>
            <input
              v-model="email"
              type="email"
              autocomplete="username"
              class="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-slate-100 outline-none ring-0 placeholder:text-slate-500 focus:border-slate-500"
              placeholder="you@example.com"
              required
            />
          </div>

          <div>
            <label class="mb-2 block text-sm text-slate-300">Password</label>
            <input
              v-model="password"
              type="password"
              autocomplete="current-password"
              class="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-slate-100 outline-none ring-0 placeholder:text-slate-500 focus:border-slate-500"
              placeholder="••••••••"
              required
            />
          </div>

          <p v-if="errorMessage" class="rounded-xl border border-red-900 bg-red-950/60 px-4 py-3 text-sm text-red-300">
            {{ errorMessage }}
          </p>

          <button
            type="submit"
            class="w-full rounded-xl bg-emerald-500 px-4 py-3 font-semibold text-slate-950 transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-70"
            :disabled="loading"
          >
            {{ loading ? 'Signing in...' : 'Sign In' }}
          </button>
        </form>

        <div class="mt-6 text-center text-sm text-slate-500">
          After login, admin users are sent to the admin test page.
        </div>
      </div>
    </div>
  </div>
</template>
