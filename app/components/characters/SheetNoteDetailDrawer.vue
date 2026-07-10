<script setup lang="ts">
const props = withDefaults(defineProps<{
  open?: boolean
  mode?: 'view' | 'edit'
  note?: any | null
  draft?: any
  saving?: boolean
  saveError?: string
  worldId?: string | number
  formatNoteDate?: (value: any) => string
}>(), {
  open: false,
  mode: 'view',
  note: null,
  draft: () => ({
    id: '',
    title: '',
    body: ''
  }),
  saving: false,
  saveError: '',
  worldId: ''
})

const emit = defineEmits<{
  (event: 'close'): void
  (event: 'save'): void
  (event: 'edit'): void
  (event: 'delete-note', note: any): void
  (event: 'update-title', value: string): void
  (event: 'update-body', value: string): void
  (event: 'open-mention', mention: any): void
}>()

const draftTitle = computed({
  get: () => String(props.draft?.title || ''),
  set: (value: string) => emit('update-title', value)
})

const draftBody = computed({
  get: () => String(props.draft?.body || ''),
  set: (value: string) => emit('update-body', value)
})

const shownTitle = computed(() =>
  String(props.note?.title || props.draft?.title || 'Note').trim() || 'Note'
)

const shownBody = computed(() =>
  String(props.note?.body || props.note?.summary || props.note?.description || '').trim()
)

const updatedLabel = computed(() => {
  const raw =
    props.note?.updatedAt ||
    props.note?.updated_at ||
    props.note?.date_updated ||
    props.note?.createdAt ||
    props.note?.created_at

  if (!raw) return ''

  if (props.formatNoteDate) {
    return props.formatNoteDate(raw)
  }

  const date = new Date(raw)
  if (Number.isNaN(date.getTime())) return String(raw)

  return date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  })
})

function deleteCurrentNote() {
  emit('delete-note', {
    id: props.draft?.id || props.note?.id,
    title: props.draft?.title || props.note?.title || shownTitle.value
  })
}
</script>

<template>
  <Transition
    enter-from-class="translate-x-full opacity-0"
    enter-active-class="transition duration-200"
    leave-to-class="translate-x-full opacity-0"
    leave-active-class="transition duration-200"
  >
    <div
      v-if="open"
      data-sheet-note-drawer-shell
      class="pointer-events-none fixed inset-y-0 right-0 z-[88] flex justify-end w-full max-w-[440px]"
    >
      <aside
        data-sheet-note-detail-drawer
        class="pointer-events-auto eldra-ornate-panel eldra-frame-corners flex h-full flex-col border-l border-[rgba(201,164,90,0.30)] bg-[rgba(7,10,13,0.96)] shadow-[0_24px_80px_rgba(0,0,0,0.55)] backdrop-blur-xl w-full"
      >
        <header class="border-b border-[rgba(201,164,90,0.22)] px-5 py-4">
          <div class="flex items-start justify-between gap-3">
            <div class="min-w-0">
              <div class="text-xs uppercase tracking-[0.35em] text-[#9f9278]">
                {{ mode === 'edit' ? 'Edit Note' : 'Note Details' }}
              </div>

              <h2 class="mt-2 truncate text-2xl font-semibold text-white">
                {{ shownTitle }}
              </h2>

              <div
                v-if="updatedLabel"
                class="mt-1 text-xs text-[#9f9278]"
              >
                Updated {{ updatedLabel }}
              </div>
            </div>

            <button
              type="button"
              class="rounded-none border border-[rgba(201,164,90,0.24)] bg-[rgba(20,17,12,0.72)] p-2 text-[#b5a88d] transition hover:bg-[rgba(201,164,90,0.10)] hover:text-[#fff7df]"
              @click="emit('close')"
            >
              <UIcon name="i-lucide-x" class="h-4 w-4" />
            </button>
          </div>
        </header>

        <main class="min-h-0 flex-1 overflow-y-auto px-5 py-5">
          <div
            v-if="mode === 'edit'"
            class="grid gap-4"
          >
            <label class="block">
              <span class="mb-2 block text-xs uppercase tracking-[0.22em] text-[#9f9278]">
                Title
              </span>

              <input
                v-model="draftTitle"
                class="eldra-input w-full rounded-none px-3 py-2 text-sm text-white"
                placeholder="NPC, city, clue, quest."
              >
            </label>

            <label class="block">
              <span class="mb-2 block text-xs uppercase tracking-[0.22em] text-[#9f9278]">
                Body
              </span>

              <WorldMentionAutocompleteTextarea
                v-model="draftBody"
                :world-id="worldId"
                rows="12"
                placeholder="Write the note. Type @ to mention an NPC, location, item, spell, or article."
                textarea-class="eldra-input w-full rounded-none px-3 py-2 text-sm leading-6 text-white"
              />

              <span class="mt-2 block text-xs leading-5 text-[#9f9278]">
                Type <span class="font-semibold text-[#f5e7bd]">@</span> to mention world articles.
              </span>
            </label>

            <div
              v-if="saveError"
              class="rounded-none border border-red-500/20 bg-red-500/10 p-3 text-sm text-red-200"
            >
              {{ saveError }}
            </div>
          </div>

          <div
            v-else
            class="rounded-none border border-[rgba(201,164,90,0.18)] bg-[rgba(20,17,12,0.48)] p-4"
          >
            <div class="text-xs uppercase tracking-[0.3em] text-[#9f9278]">
              Body
            </div>

            <WorldMentionText
              v-if="shownBody"
              :world-id="worldId"
              :markdown="shownBody"
              class="eldra-rich-content mt-3 text-sm leading-6 text-[#d8ceb8]"
              @open-mention="emit('open-mention', $event)"
            />

            <p
              v-else
              class="mt-3 text-sm leading-6 text-[#9f9278]"
            >
              No note body yet.
            </p>
          </div>
        </main>

        <footer class="border-t border-[rgba(201,164,90,0.22)] p-5">
          <div
            v-if="mode === 'edit'"
            class="grid grid-cols-2 gap-3"
          >
            <button
              type="button"
              class="eldra-button rounded-none px-4 py-3 text-sm font-medium disabled:opacity-50"
              :disabled="saving"
              @click="emit('save')"
            >
              {{ saving ? 'Saving...' : 'Save Note' }}
            </button>

            <button
              type="button"
              class="eldra-button rounded-none px-4 py-3 text-sm font-medium"
              @click="emit('close')"
            >
              Cancel
            </button>

            <button
              v-if="draft?.id"
              type="button"
              class="col-span-2 rounded-none border border-red-500/24 bg-red-500/10 px-4 py-3 text-sm font-semibold text-red-100 disabled:opacity-50"
              :disabled="saving"
              @click="deleteCurrentNote"
            >
              Delete Note
            </button>
          </div>

          <div
            v-else
            class="grid grid-cols-2 gap-3"
          >
            <button
              type="button"
              class="eldra-button rounded-none px-4 py-3 text-sm font-medium"
              @click="emit('edit')"
            >
              Edit
            </button>

            <button
              type="button"
              class="eldra-button rounded-none px-4 py-3 text-sm font-medium"
              @click="emit('close')"
            >
              Close
            </button>
          </div>
        </footer>
      </aside>
    </div>
  </Transition>
</template>
