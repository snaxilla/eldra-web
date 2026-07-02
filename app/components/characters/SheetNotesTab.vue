<script setup lang="ts">
const props = withDefaults(defineProps<{
  noteSearch?: string
  notes?: any[]
  noteCount?: number
  noteSaveError?: string
  noteSaveSuccess?: string
  formatNoteDate?: (value: any) => string
  shortText?: (value: any, limit?: number) => string
}>(), {
  noteSearch: '',
  notes: () => [],
  noteCount: 0
})

const emit = defineEmits<{
  (event: 'update-search', value: string): void
  (event: 'add-note'): void
  (event: 'open-note', note: any): void
}>()

function inputValue(event: Event) {
  const target = event.target as HTMLInputElement | null
  return target?.value || ''
}

function noteDate(value: any) {
  return props.formatNoteDate?.(value) || ''
}

function notePreview(value: any) {
  if (props.shortText) return props.shortText(value, 220)

  const text = String(value || '').replace(/\s+/g, ' ').trim()
  return text.length > 220 ? `${text.slice(0, 220).trim()}...` : text
}
</script>

<template>
  <section class="mt-0 grid gap-3 md:mt-6">
    <div class="eldra-codex-soft rounded-none p-4">
      <div class="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div class="text-xs uppercase tracking-[0.3em] text-[#9f9278]">Notes</div>
          <div class="mt-1 text-sm text-[#d8ceb8]">
            Searchable note cards for NPCs, cities, clues, quests, and table reminders.
          </div>
        </div>

        <div class="flex items-center gap-2">
          <div class="eldra-gold-chip rounded-none border px-3 py-1 text-xs">
            {{ noteCount }} Note{{ noteCount === 1 ? '' : 's' }}
          </div>

          <button
            type="button"
            class="eldra-button rounded-none px-3 py-2 text-xs font-semibold"
            @click="emit('add-note')"
          >
            Add Note +
          </button>
        </div>
      </div>

      <div class="mt-4">
        <label class="mb-2 block text-xs uppercase tracking-[0.22em] text-[#9f9278]">Search Notes</label>
        <input
          :value="noteSearch"
          type="text"
          class="eldra-input w-full rounded-none px-3 py-2 text-sm text-white"
          placeholder="Search NPC, city, quest, clue..."
          @input="emit('update-search', inputValue($event))"
        >
      </div>

      <div
        v-if="noteSaveError"
        class="mt-3 rounded-none border border-red-500/20 bg-red-500/10 p-3 text-sm text-red-200"
      >
        {{ noteSaveError }}
      </div>

      <div
        v-if="noteSaveSuccess"
        class="mt-3 rounded-none border border-emerald-500/20 bg-emerald-500/10 p-3 text-sm text-emerald-200"
      >
        {{ noteSaveSuccess }}
      </div>

      <div
        v-if="notes.length"
        class="mt-4 grid gap-2 md:grid-cols-2 xl:grid-cols-3"
      >
        <article
          v-for="note in notes"
          :key="note.id"
          class="min-w-0 overflow-hidden rounded-none border border-[rgba(65,82,103,0.62)] bg-[rgba(8,17,27,0.68)] p-3"
        >
          <div class="flex min-w-0 items-start justify-between gap-3">
            <div class="min-w-0">
              <div class="max-w-full truncate font-semibold text-white">
                {{ note.title || 'Untitled Note' }}
              </div>

              <div
                v-if="noteDate(note.updatedAt)"
                class="mt-1 text-xs text-[#9f9278]"
              >
                Updated {{ noteDate(note.updatedAt) }}
              </div>
            </div>

            <button
              type="button"
              class="shrink-0 rounded-none border border-[rgba(201,164,90,0.22)] bg-[rgba(20,17,12,0.72)] px-2 py-1 text-xs text-[#f5e7bd]"
              @click.stop="emit('open-note', note)"
            >
              Details
            </button>
          </div>

          <p class="mt-3 break-words text-xs leading-5 text-[#9f9278]">
            {{ notePreview(note.body) || 'No note body yet.' }}
          </p>
        </article>
      </div>

      <div
        v-else
        class="mt-4 rounded-none border border-dashed border-[rgba(201,164,90,0.22)] p-4 text-sm text-[#9f9278]"
      >
        {{ noteCount ? 'No notes match that search.' : 'No notes yet. Add one for an NPC, city, clue, or quest.' }}
      </div>
    </div>
  </section>
</template>
