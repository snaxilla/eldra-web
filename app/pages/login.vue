<script setup lang="ts">
import { useAuth } from '~/composables/useAuth'
import { safeRedirectTarget } from '~/utils/safeRedirect'
definePageMeta({
  layout: false
})

const { login, state } = useAuth()
const route = useRoute()

// Accepts a Player's username OR an existing administrator's real email --
// see server/utils/players.ts's resolveLoginEmail for how the server tells
// the two apart. Named `username` (not `email`) throughout, per Username
// Login's own LOGIN UX section: "The page should speak entirely in terms
// of Username. No Directus terminology. No email terminology."
const username = ref('')
const password = ref('')
const loading = ref(false)
const errorMessage = ref('')

async function submit() {
  errorMessage.value = ''
  loading.value = true

  try {
    await login(username.value, password.value)

    // Return the user to whatever route sent them here (recorded by
    // middleware/auth.ts or middleware/admin.ts). Falls back to the
    // previous behavior when there is no redirect to honor.
    const requested = safeRedirectTarget(route.query.redirect)
    const target = requested || (state.value.user?.role?.admin_access ? '/admin' : '/')
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
            Sign in to continue.
          </p>
        </div>

        <form class="space-y-4" @submit.prevent="submit">
          <div>
            <!-- "Username or Email": existing administrators still sign in
                 with a real email (Username Login's own REGRESSION section
                 permits this label specifically to avoid stranding them);
                 a Player created through Eldra only ever has a username. -->
            <label class="mb-2 block text-sm text-slate-300">Username or Email</label>
            <input
              v-model="username"
              type="text"
              autocomplete="username"
              class="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-slate-100 outline-none ring-0 placeholder:text-slate-500 focus:border-slate-500"
              placeholder="Username"
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
