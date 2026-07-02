<script setup lang="ts">
const props = withDefaults(defineProps<{
  open?: boolean
  mode?: 'view' | 'edit' | string
  note?: any | null
  draft?: any
  saving?: boolean
  saveError?: string
  formatNoteDate?: (value: any) => string
}>(), {
  open: false,
  mode: 'view',
  draft: () => ({})
})

const emit = defineEmits<{
  (event: 'close'): void
  (event: 'save'): void
  (event: 'edit'): void
  (event: 'delete-note', payload: any): void
  (event: 'update-title', value: string): void
  (event: 'update-body', value: string): void
}>()

function inputValue(event: Event) {
  const target = event.target as HTMLInputElement | HTMLTextAreaElement | null
  return target?.value || ''
}

function noteDate(value: any) {
  return props.formatNoteDate?.(value) || ''
}

const drawerTitle = computed(() =>
  props.draft?.title || props.note?.title || 'New Note'
)

function deleteCurrentNote() {
  emit('delete-note', {
    id: props.draft?.id,
    title: props.draft?.title
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
      class="fixed inset-0 z-[140] bg-black/60 backdrop-blur-sm md:pointer-events-none md:bg-transparent md:backdrop-blur-none"
      @click.self="emit('close')"
    >
      <aside class="eldra-ornate-panel eldra-frame-corners fixed bottom-0 right-0 top-0 flex h-full w-full flex-col border-l backdrop-blur-xl md:pointer-events-auto md:w-[440px]">
        <div class="flex items-start justify-between gap-3 border-b border-[rgba(201,164,90,0.22)] px-5 py-4">
          <div class="min-w-0">
            <div class="text-xs uppercase tracking-[0.35em] text-[#9f9278]">Note</div>
            <h2 class="mt-2 truncate text-2xl font-semibold text-white">
              {{ drawerTitle }}
            </h2>
            <div
              v-if="note?.updatedAt && mode === 'view' && noteDate(note.updatedAt)"
              class="mt-1 text-xs text-[#9f9278]"
            >
              Updated {{ noteDate(note.updatedAt) }}
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

        <div class="flex-1 overflow-y-auto px-5 py-5">
          <div
            v-if="mode === 'edit'"
            class="grid gap-4"
          >
            <label class="block">
              <span class="mb-2 block text-xs uppercase tracking-[0.22em] text-[#9f9278]">Title</span>
              <input
                :value="draft?.title || ''"
                class="eldra-input w-full rounded-none px-3 py-2 text-sm text-white"
                placeholder="NPC, city, clue, quest..."
                @input="emit('update-title', inputValue($event))"
              >
            </label>

            <label class="block">
              <span class="mb-2 block text-xs uppercase tracking-[0.22em] text-[#9f9278]">Body</span>
              <textarea
                :value="draft?.body || ''"
                rows="12"
                class="eldra-input w-full rounded-none px-3 py-2 text-sm leading-6 text-white"
                placeholder="Write the note..."
                @input="emit('update-body', inputValue($event))"
              />
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
            <div class="text-xs uppercase tracking-[0.3em] text-[#9f9278]">Body</div>
            <p class="mt-3 whitespace-pre-line break-words text-sm leading-6 text-[#d8ceb8]">
              {{ note?.body || 'No note body yet.' }}
            </p>
          </div>
        </div>

        <div class="border-t border-[rgba(201,164,90,0.22)] p-5">
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
        </div>
      </aside>
    </div>
  </Transition>
</template>
