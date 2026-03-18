<script setup lang="ts">
import { useAuth } from '~/composables/useAuth'
definePageMeta({
  middleware: 'admin'
})

const { state, displayName, isAdmin, logout, fetchMe } = useAuth()

await fetchMe()
</script>

<template>
  <div class="min-h-screen bg-slate-950 text-slate-100">
    <div class="mx-auto max-w-5xl px-6 py-12">
      <div class="rounded-2xl border border-slate-800 bg-slate-900/90 p-8 shadow-2xl">
        <div class="mb-2 text-xs uppercase tracking-[0.3em] text-slate-400">
          Eldra Admin Test
        </div>

        <h1 class="text-3xl font-bold">
          Welcome, {{ displayName }}
        </h1>

        <p class="mt-3 text-slate-300">
          Your Nuxt app is now authenticated against Directus.
        </p>

        <div class="mt-8 grid gap-4 md:grid-cols-2">
          <div class="rounded-xl border border-slate-800 bg-slate-950 p-5">
            <div class="text-sm text-slate-400">Authenticated</div>
            <div class="mt-2 text-xl font-semibold">
              {{ state.authenticated ? 'Yes' : 'No' }}
            </div>
          </div>

          <div class="rounded-xl border border-slate-800 bg-slate-950 p-5">
            <div class="text-sm text-slate-400">Admin Access</div>
            <div class="mt-2 text-xl font-semibold">
              {{ isAdmin ? 'Yes' : 'No' }}
            </div>
          </div>

          <div class="rounded-xl border border-slate-800 bg-slate-950 p-5">
            <div class="text-sm text-slate-400">Email</div>
            <div class="mt-2 break-all text-xl font-semibold">
              {{ state.user?.email || 'N/A' }}
            </div>
          </div>

          <div class="rounded-xl border border-slate-800 bg-slate-950 p-5">
            <div class="text-sm text-slate-400">Role</div>
            <div class="mt-2 text-xl font-semibold">
              {{ state.user?.role?.name || 'N/A' }}
            </div>
          </div>
        </div>

        <div class="mt-8 flex flex-wrap gap-3">
          <a
            href="/"
            class="rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm font-semibold text-slate-200 hover:bg-slate-800"
          >
            Back to Home
          </a>

          <button
            type="button"
            class="rounded-xl bg-emerald-500 px-4 py-3 text-sm font-semibold text-slate-950 hover:bg-emerald-400"
            @click="logout"
          >
            Logout
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
