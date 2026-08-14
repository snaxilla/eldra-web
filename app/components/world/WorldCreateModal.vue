<script setup lang="ts">
// Create World -- .github/docs/architecture/ownership-and-permissions.md
// (Revision 2) §5.3/§12 Phase 0's "create a world" use case, given a UI at
// last. Reuses POST /api/worlds unchanged (server/api/worlds/index.post.ts,
// server/utils/worlds.ts) -- this component is UI and orchestration only,
// per this task's own SCOPE.
//
// Deliberately one form, no wizard (this task's own UI section: "This is
// creating a World. Not publishing a game."). Errors are always mapped to
// a short, specific message keyed off the response's statusCode -- never
// `error.data` rendered wholesale -- so a raw Directus error body (e.g. a
// slug-uniqueness race the server's own pre-check didn't catch) can never
// reach the screen verbatim, per this task's own ERROR HANDLING section.

import { describeWorldCreateError } from '~/utils/describeWorldCreateError'

const emit = defineEmits<{
  created: [world: { id: string | number; slug: string }]
}>()

const open = defineModel<boolean>('open', { default: false })

// Only 'dnd5e' is implemented today (server/utils/worlds.ts's own
// DEFAULT_SYSTEM_KEY comment: "the only game system this codebase
// implements today"). A plain array -- not a hardcoded single option in
// the markup -- so a second system is a one-line addition here, not a
// template rewrite.
const SYSTEM_KEY_OPTIONS = [{ value: 'dnd5e', label: 'Dungeons & Dragons 5e' }] as const

const VISIBILITY_OPTIONS = [
  { value: 'private', label: 'Private' },
  { value: 'public', label: 'Public' }
] as const

const name = ref('')
const description = ref('')
const systemKey = ref<string>(SYSTEM_KEY_OPTIONS[0].value)
const visibility = ref<'private' | 'public'>('private')

const submitting = ref(false)
const errorMessage = ref('')

function resetForm() {
  name.value = ''
  description.value = ''
  systemKey.value = SYSTEM_KEY_OPTIONS[0].value
  visibility.value = 'private'
  errorMessage.value = ''
}

function close() {
  if (submitting.value) return
  open.value = false
  resetForm()
}

async function submit() {
  if (submitting.value) return

  const trimmedName = name.value.trim()
  if (!trimmedName) {
    errorMessage.value = 'World name is required.'
    return
  }

  submitting.value = true
  errorMessage.value = ''

  try {
    const response = await $fetch<{ world: { id: string | number; slug: string } }>('/api/worlds', {
      method: 'POST',
      body: {
        name: trimmedName,
        description: description.value.trim() || undefined,
        systemKey: systemKey.value,
        visibility: visibility.value
      }
    })

    open.value = false
    emit('created', response.world)
    resetForm()
  } catch (error) {
    errorMessage.value = describeWorldCreateError(error)
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <div
    v-if="open"
    class="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(4,9,22,0.72)] backdrop-blur-sm px-4"
    @click.self="close"
  >
    <div class="w-full max-w-lg overflow-hidden rounded-[28px] border border-white/12 bg-[rgba(8,16,27,0.92)] shadow-[0_30px_100px_rgba(0,0,0,0.55)] backdrop-blur">
      <div class="px-7 pt-7">
        <div class="text-[11px] uppercase tracking-[0.38em] text-sky-300/90">
          New Realm
        </div>
        <h2 class="mt-3 text-3xl font-semibold tracking-tight text-white">
          Create World
        </h2>
        <p class="mt-3 text-sm leading-6 text-slate-300">
          Open a new realm within the Eldra cosmos. You can refine everything
          else once you're inside.
        </p>
      </div>

      <form
        class="mt-6 space-y-5 px-7 pb-7"
        @submit.prevent="submit"
      >
        <div>
          <label class="text-xs uppercase tracking-[0.2em] text-slate-400">World Name</label>
          <input
            v-model="name"
            type="text"
            required
            autofocus
            placeholder="e.g. Varin"
            class="mt-2 w-full rounded-2xl border border-white/12 bg-white/[0.04] px-4 py-2.5 text-white placeholder:text-slate-500 focus:border-sky-300/40 focus:outline-none"
          >
        </div>

        <div>
          <label class="text-xs uppercase tracking-[0.2em] text-slate-400">Description <span class="text-slate-500">(optional)</span></label>
          <textarea
            v-model="description"
            rows="3"
            placeholder="A short sense of what this world is."
            class="mt-2 w-full resize-none rounded-2xl border border-white/12 bg-white/[0.04] px-4 py-2.5 text-white placeholder:text-slate-500 focus:border-sky-300/40 focus:outline-none"
          />
        </div>

        <div class="grid grid-cols-2 gap-4">
          <div>
            <label class="text-xs uppercase tracking-[0.2em] text-slate-400">System</label>
            <select
              v-model="systemKey"
              class="mt-2 w-full rounded-2xl border border-white/12 bg-white/[0.04] px-4 py-2.5 text-white focus:border-sky-300/40 focus:outline-none"
            >
              <option
                v-for="option in SYSTEM_KEY_OPTIONS"
                :key="option.value"
                :value="option.value"
              >
                {{ option.label }}
              </option>
            </select>
          </div>

          <div>
            <label class="text-xs uppercase tracking-[0.2em] text-slate-400">Visibility</label>
            <select
              v-model="visibility"
              class="mt-2 w-full rounded-2xl border border-white/12 bg-white/[0.04] px-4 py-2.5 text-white focus:border-sky-300/40 focus:outline-none"
            >
              <option
                v-for="option in VISIBILITY_OPTIONS"
                :key="option.value"
                :value="option.value"
              >
                {{ option.label }}
              </option>
            </select>
          </div>
        </div>

        <p
          v-if="errorMessage"
          class="rounded-2xl border border-red-400/25 bg-red-400/10 px-4 py-3 text-sm text-red-200"
        >
          {{ errorMessage }}
        </p>

        <div class="flex items-center justify-end gap-3 pt-1">
          <button
            type="button"
            class="rounded-full border border-white/12 px-5 py-2.5 text-sm font-medium text-slate-200 transition hover:border-white/25"
            :disabled="submitting"
            @click="close"
          >
            Cancel
          </button>
          <button
            type="submit"
            class="inline-flex items-center gap-2 rounded-full border border-sky-300/25 bg-sky-400/15 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-sky-400/25 disabled:cursor-not-allowed disabled:opacity-50"
            :disabled="submitting || !name.trim()"
          >
            <UIcon
              v-if="submitting"
              name="i-lucide-loader-2"
              class="h-4 w-4 animate-spin"
            />
            <span>{{ submitting ? 'Creating…' : 'Create World' }}</span>
          </button>
        </div>
      </form>
    </div>
  </div>
</template>
