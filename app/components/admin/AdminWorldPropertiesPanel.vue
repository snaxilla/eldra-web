<script setup lang="ts">
// World Properties -- Game Admin -> World Properties -> change name ->
// Save. Renames a World's display name only; see renameWorld's own
// header (server/utils/worlds.ts) for the full identity/scope guarantee
// this preserves (id, slug, every foreign-keyed relationship untouched --
// this panel only ever PATCHes `name`).
//
// Save/Revert/dirty-tracking mirrors WorldThemeSettingsPanel.vue's own
// established convention exactly (draft/saved refs, a `dirty` computed
// comparison, Save/Revert disabled when `!dirty`) -- the closest existing
// World-settings panel, already using the same `world.settings.edit`
// capability server-side.
//
// THREE separate ways to lose this draft, each needing its own guard
// (beforeunload alone only covers the first):
//   1. Hard refresh/tab close -- `beforeunload` below, same precedent as
//      StudioEntityEditor.vue.
//   2. Router navigation away from /worlds/:id/admin entirely (Back link,
//      browser back/forward, following a link to another World) -- a REAL
//      Vue Router navigation. `onBeforeRouteLeave` works in any component
//      rendered under the matched route, not only the route's own page
//      component (see edit.vue's own use of it for the same reason), so
//      it's placed directly here rather than split into a dirty-change
//      emit + a parent-owned guard like edit.vue/StudioEntityEditor --
//      that split exists there because StudioEntityEditor is reused across
//      a dialog AND a full page with different navigation semantics in
//      each; this panel only ever has the one context, so the split would
//      be an abstraction nothing here asks for.
//   3. Switching to another Game Admin rail section -- admin.vue's section
//      chain is `v-else-if`, so switching away unmounts this component
//      (destroying `draft`) rather than merely hiding it; this is NOT a
//      router navigation, so `onBeforeRouteLeave` never fires for it.
//      admin.vue's own rail-select handler reads this panel's exposed
//      `dirty` (via `defineExpose` below, a template ref, and a synchronous
//      check at the moment of switching -- not a continuous emit, since
//      the parent only ever needs the answer right when the user clicks
//      another section) and confirms before switching away.
import { onBeforeRouteLeave } from 'vue-router'
import { worldDataCacheKey, WORLDS_LIST_CACHE_KEY } from '~/lib/eldra/world-cache-keys'

const props = defineProps<{
  worldId: string | number
}>()

const worldId = computed(() => String(props.worldId || ''))

type WorldRecord = {
  id: string | number
  name: string
  slug: string
  capabilities?: string[]
}

const { data: world, pending } = await useFetch<WorldRecord>(
  () => `/api/worlds/${worldId.value}`,
  { key: () => worldDataCacheKey(worldId.value) }
)

const saved = ref('')
const draft = ref('')
const busy = ref(false)
const message = ref('')
const messageIsError = ref(false)

watch(
  world,
  (value) => {
    saved.value = value?.name || ''
    draft.value = value?.name || ''
  },
  { immediate: true }
)

// Established validation/limits -- the SAME rule createWorld itself
// applies at creation time (server/api/worlds/index.post.ts: "required,
// non-empty"), plus an explicit length ceiling matching Directus's own
// default VARCHAR(255) column width (server/utils/worlds.ts's
// MAX_WORLD_NAME_LENGTH) rather than inventing an unrelated app-specific
// number -- mirrored here so the Save button can fail closed client-side
// before ever reaching the server, not just rely on the server's own
// rejection.
const MAX_NAME_LENGTH = 255

const trimmedDraft = computed(() => draft.value.trim())
// Compared TRIMMED, not raw -- typing trailing/leading whitespace alone
// (which renameWorld's own trim would discard anyway) must not enable
// Save for what the server would correctly treat as a no-op, and must
// not disable Cancel/Revert when it is the only thing that changed.
const dirty = computed(() => trimmedDraft.value !== saved.value)
const isEmpty = computed(() => trimmedDraft.value.length === 0)
const isTooLong = computed(() => trimmedDraft.value.length > MAX_NAME_LENGTH)
const canSave = computed(() => dirty.value && !isEmpty.value && !isTooLong.value && !busy.value)

const canEdit = computed(() => {
  const capabilities = world.value?.capabilities
  // Absent entirely (route not yet loaded, or an older cached payload
  // from before `capabilities` existed) reads as "unknown, not denied" --
  // the form stays enabled and the real answer is the server's own
  // requireCapability check on Save, exactly like every other Game Admin
  // panel's own posture (no panel in this page pre-emptively hides its
  // form based on a client-side capability guess).
  return !Array.isArray(capabilities) || capabilities.includes('world.settings.edit')
})

function revert() {
  draft.value = saved.value
  message.value = ''
  messageIsError.value = false
}

async function save() {
  if (!canSave.value) return

  busy.value = true
  message.value = ''
  messageIsError.value = false

  try {
    const result: any = await $fetch(`/api/worlds/${worldId.value}`, {
      method: 'PATCH',
      body: { name: trimmedDraft.value }
    })

    saved.value = result?.world?.name ?? trimmedDraft.value
    draft.value = saved.value
    message.value = result?.changed === false ? 'No change to save.' : 'Saved.'

    // The rename itself already succeeded above -- a failure refreshing
    // OTHER views' cached copies (sidebar heading, World Selector listing)
    // is a separate, lesser problem and must never be reported as though
    // the save failed. Caught and appended on its own, not folded into the
    // outer catch below.
    try {
      // Updates the sidebar heading (world-workspace.vue) and the World
      // Selector listing (index.vue) immediately -- neither requires a
      // sign-out or a full application restart. Both targets are harmless
      // to refresh even if the listing page is not currently mounted: a
      // refreshed Nuxt payload is simply what that page reads the next
      // time it does mount.
      await Promise.all([
        refreshNuxtData(worldDataCacheKey(worldId.value)),
        refreshNuxtData(WORLDS_LIST_CACHE_KEY)
      ])
    } catch {
      message.value = `${message.value} Other open views may not reflect the new name until reloaded.`
    }
  } catch (error: any) {
    // The draft is deliberately NOT reset here -- a failed Save (network
    // error, a 403 from a capability that changed underneath the user,
    // Directus unavailable) must never discard what the user typed.
    message.value =
      error?.data?.statusMessage ||
      error?.statusMessage ||
      error?.message ||
      'Could not save the World name.'
    messageIsError.value = true
  } finally {
    busy.value = false
  }
}

function beforeUnloadGuard(event: BeforeUnloadEvent) {
  if (!dirty.value) return
  event.preventDefault()
  event.returnValue = ''
}

// Real Vue Router navigation (Back link, browser back/forward, a link to
// another World) -- distinct from switching Game Admin rail sections,
// which never goes through the router at all (see admin.vue's own guard
// for that case, which reads `dirty` below via defineExpose).
onBeforeRouteLeave(() => {
  if (!dirty.value) return true
  return window.confirm('Discard unsaved changes?')
})

defineExpose({ dirty })

if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', beforeUnloadGuard)
  onBeforeUnmount(() => window.removeEventListener('beforeunload', beforeUnloadGuard))
}
</script>

<template>
  <section data-world-properties-panel class="eldra-ornate-panel eldra-frame-corners min-w-0 p-5 shadow-xl">
    <div class="flex flex-wrap items-start justify-between gap-4">
      <div>
        <div class="text-xs uppercase tracking-[0.35em] text-eldra-text-faint">
          World Properties
        </div>

        <h2 class="mt-3 text-2xl font-semibold text-white">
          World Name
        </h2>

        <p class="mt-2 max-w-2xl text-sm leading-6 text-eldra-text-soft">
          Renames this World for everyone who sees it. The World itself, its id, its stable URL slug, and every
          existing character, map, membership, and content reference are unaffected.
        </p>
      </div>
    </div>

    <div v-if="pending" class="mt-5 text-sm text-eldra-text-faint">
      Loading...
    </div>

    <template v-else>
      <div class="mt-5 grid gap-2 md:max-w-md">
        <label class="grid gap-2">
          <span class="text-[11px] uppercase tracking-[0.3em] text-eldra-text-faint">Name</span>
          <input
            v-model="draft"
            type="text"
            :maxlength="MAX_NAME_LENGTH + 1"
            :disabled="busy || !canEdit"
            class="eldra-input rounded-none border border-eldra-accent/28 bg-[rgba(5,8,12,0.84)] px-3 py-2 text-sm text-eldra-text"
            placeholder="World name"
            @keyup.enter="canSave && save()"
          >
        </label>

        <p v-if="isEmpty" class="text-xs text-red-300">
          World name is required.
        </p>
        <p v-else-if="isTooLong" class="text-xs text-red-300">
          World name must be {{ MAX_NAME_LENGTH }} characters or fewer.
        </p>
      </div>

      <div
        v-if="!canEdit"
        class="mt-4 rounded-none border border-amber-400/22 bg-amber-400/8 px-3 py-2 text-xs text-amber-100"
      >
        You do not have permission to rename this World.
      </div>

      <div class="mt-5 flex flex-wrap items-center gap-3">
        <button
          type="button"
          class="eldra-button rounded-none border border-eldra-accent/42 bg-eldra-accent/14 px-4 py-2 text-sm text-eldra-accent-text transition hover:bg-eldra-accent/22 disabled:opacity-50"
          :disabled="!canSave"
          @click="save"
        >
          {{ busy ? 'Saving...' : 'Save' }}
        </button>

        <button
          type="button"
          class="rounded-none border border-eldra-accent/22 px-4 py-2 text-sm text-eldra-text-dim transition hover:text-eldra-text-strong disabled:opacity-50"
          :disabled="busy || !dirty"
          @click="revert"
        >
          Cancel
        </button>

        <span
          v-if="message"
          class="text-xs"
          :class="messageIsError ? 'text-red-300' : 'text-eldra-text-soft'"
          role="status"
        >
          {{ message }}
        </span>
      </div>
    </template>
  </section>
</template>
