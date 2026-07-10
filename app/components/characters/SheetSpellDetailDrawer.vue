<script setup lang="ts">
import { renderMarkdown } from '~/utils/renderMarkdown'

withDefaults(defineProps<{
  spellId?: string | number | null
  title?: string
  pending?: boolean
  metaLines?: string[]
  description?: string
  higherLevel?: string
  articleUrl?: string
}>(), {
  title: 'Spell',
  pending: false,
  metaLines: () => [],
  description: '',
  higherLevel: '',
  articleUrl: ''
})

const emit = defineEmits<{
  (event: 'close'): void
}>()
</script>

<template>
  <Transition
    enter-from-class="translate-x-full opacity-0"
    enter-active-class="transition duration-200"
    leave-to-class="translate-x-full opacity-0"
    leave-active-class="transition duration-200"
  >
    <div
      v-if="spellId"
      class="fixed inset-0 z-[170] bg-black/55 backdrop-blur-sm md:pointer-events-none md:bg-transparent md:backdrop-blur-none"
      @click.self="emit('close')"
    >
      <aside data-sheet-standard-context-rail class="eldra-ornate-panel eldra-frame-corners fixed bottom-0 right-0 top-0 flex h-full w-full flex-col border-l backdrop-blur-xl md:pointer-events-auto md:w-[440px]">
        <div class="flex items-start justify-between gap-3 border-b border-[rgba(201,164,90,0.22)] px-5 py-4">
          <div class="min-w-0">
            <div class="text-xs uppercase tracking-[0.35em] text-[#9f9278]">Spell Details</div>
            <h2 class="mt-2 truncate text-2xl font-semibold text-white">
              {{ title || 'Spell' }}
            </h2>
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
            v-if="pending"
            class="text-sm text-[#d8ceb8]"
          >
            Loading spell...
          </div>

          <template v-else>
            <div
              v-if="metaLines.length"
              class="grid gap-2"
            >
              <div
                v-for="line in metaLines"
                :key="line"
                class="rounded-none border border-[rgba(201,164,90,0.18)] bg-[rgba(20,17,12,0.52)] px-3 py-2 text-sm text-[#d8ceb8]"
              >
                {{ line }}
              </div>
            </div>

            <section class="eldra-codex-soft mt-5 rounded-none p-4">
              <div class="text-xs uppercase tracking-[0.3em] text-[#9f9278]">Description</div>

              <div
                v-if="description"
                class="eldra-rich-content mt-4 text-sm leading-7"
                v-html="renderMarkdown(description)"
              ></div>

              <p
                v-else
                class="mt-4 text-sm leading-7 text-[#9f9278]"
              >
                No spell description available.
              </p>
            </section>

            <section
              v-if="higherLevel"
              class="eldra-codex-soft mt-5 rounded-none p-4"
            >
              <div class="text-xs uppercase tracking-[0.3em] text-[#9f9278]">At Higher Levels</div>
              <div
                class="eldra-rich-content mt-4 text-sm leading-7"
                v-html="renderMarkdown(higherLevel)"
              ></div>
            </section>
          </template>
        </div>

        <div class="border-t border-[rgba(201,164,90,0.22)] p-5">
          <div class="flex gap-3">
            <NuxtLink
              v-if="articleUrl"
              :to="articleUrl"
              class="flex-1 eldra-button rounded-none px-4 py-3 text-center text-sm font-medium"
            >
              Open Full Article
            </NuxtLink>

            <button
              type="button"
              class="flex-1 eldra-button rounded-none px-4 py-3 text-sm font-medium"
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
