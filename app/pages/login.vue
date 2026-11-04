<script setup lang="ts">
import { useAuth } from '~/composables/useAuth'
import { resolvePostLoginDestination } from '~/utils/safeRedirect'
definePageMeta({
  layout: false
})

const { login, state, fetchMe } = useAuth()
const route = useRoute()

// Authentication Flow Cleanup -- AUTHENTICATED USER VISITING LOGIN. Resolved
// here, in top-level <script setup> (blocking SSR + client-side navigation
// via Vue's Suspense), not `onMounted` -- an `onMounted` redirect would
// still paint the login form first on every server-rendered response,
// which is exactly the flicker this task's AUTHORITY/SSR REQUIREMENT rules
// out. A visitor who already has a valid session and lands on /login
// (a stale bookmark, browser back, or the "you must be signed in" link
// clicked after already signing in elsewhere) is sent straight to whatever
// they were actually trying to reach instead of being asked to log in
// again.
if (!state.value.ready) {
  await fetchMe()
}

if (state.value.authenticated) {
  await navigateTo(resolvePostLoginDestination(route.query.redirect))
}

// Accepts a Player's username OR an existing administrator's real email --
// see server/utils/players.ts's resolveLoginEmail for how the server tells
// the two apart. Named `username` (not `email`) throughout, per Username
// Login's own LOGIN UX section: "The page should speak entirely in terms
// of Username. No Directus terminology. No email terminology."
const username = ref('')
const password = ref('')
const loading = ref(false)
const errorMessage = ref('')

// OIDC (provider-agnostic Beta identity provider sign-in). The button
// below is shown ONLY when GET /api/auth/oidc/config reports `configured:
// true` -- server/utils/oidc.ts's own isOidcConfigured(), never a
// client-side guess. No issuer URL, client id, or secret ever reaches
// this page; `configured` is the only field that endpoint returns.
const { data: oidcConfig } = await useFetch('/api/auth/oidc/config')
const oidcConfigured = computed(() => !!oidcConfig.value?.configured)

// Carries the SAME `?redirect=` this page already honors for the
// Directus form through to the OIDC flow, so "sign in with your identity
// provider" lands a visitor wherever middleware/auth.ts or admin.ts
// originally sent them here from. server/api/auth/oidc/login.get.ts
// re-validates this with the same safeRedirectTarget this page already
// imports -- a tampered value here is simply dropped server-side, never
// trusted because it round-tripped through this page first.
const oidcLoginHref = computed(() => {
  const redirect = typeof route.query.redirect === 'string' ? route.query.redirect : ''
  return redirect ? `/api/auth/oidc/login?redirect=${encodeURIComponent(redirect)}` : '/api/auth/oidc/login'
})

// Generic, user-facing text for the reason codes
// server/api/auth/oidc/callback.get.ts redirects back with -- every one of
// those codes was already scrubbed of provider/library detail server-side
// (see server/utils/oidc.ts's completeAuthorizationCodeGrant); this is
// purely a code-to-sentence mapping, not a second place that decides what
// is safe to show.
const OIDC_ERROR_MESSAGES: Record<string, string> = {
  cancelled: 'Sign-in was cancelled.',
  'invalid-state': 'Your sign-in session could not be verified. Please try again.',
  'invalid-response': 'Identity provider response was incomplete. Please try again.',
  'not-configured': 'Identity provider sign-in is not configured.',
  'no-flow': 'Your sign-in session expired before it finished. Please try again.',
  'account-inactive': 'This account is inactive. Contact an administrator.'
}

const oidcErrorCode = typeof route.query.oidc_error === 'string' ? route.query.oidc_error : ''
if (oidcErrorCode) {
  errorMessage.value = OIDC_ERROR_MESSAGES[oidcErrorCode] || 'Sign-in was not completed. Please try again.'
}

async function submit() {
  errorMessage.value = ''
  loading.value = true

  try {
    await login(username.value, password.value)

    // Return the user to whatever route sent them here (recorded by
    // middleware/auth.ts or middleware/admin.ts), or the World Selection
    // page otherwise. Login's ONLY job is authenticating -- it no longer
    // has an opinion about role-based destinations (the previous
    // `admin_access ? '/admin' : '/'` branch routed every administrator
    // through the "ELDRA ADMIN TEST" diagnostic page on every login, which
    // is the exact defect Authentication Flow Cleanup traced and removed;
    // /admin remains reachable deliberately, via the sidebar's own "Admin"
    // link, just never as an automatic login destination).
    await navigateTo(resolvePostLoginDestination(route.query.redirect))
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

        <!-- Shown only when an OIDC provider (e.g. Authentik, Zitadel --
             never named here, per this task's provider-agnostic
             requirement) is configured server-side. A plain navigation,
             not a form submit: the browser needs to actually leave this
             page for the provider's own login UI. -->
        <template v-if="oidcConfigured">
          <div class="my-6 flex items-center gap-3 text-xs uppercase tracking-wide text-slate-500">
            <span class="h-px flex-1 bg-slate-800" />
            <span>or</span>
            <span class="h-px flex-1 bg-slate-800" />
          </div>

          <a
            :href="oidcLoginHref"
            class="block w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-center font-semibold text-slate-100 transition hover:border-slate-500"
          >
            Sign in with your identity provider
          </a>
        </template>
      </div>
    </div>
  </div>
</template>
