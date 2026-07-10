<script setup lang="ts">
defineProps<{
  feature?: any | null
}>()

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
      v-if="feature"
      class="fixed inset-0 z-[140] bg-black/60 backdrop-blur-sm md:pointer-events-none md:bg-transparent md:backdrop-blur-none"
      @click.self="emit('close')"
    >
      <aside data-sheet-detail-rail class="eldra-ornate-panel eldra-frame-corners fixed bottom-0 right-0 top-0 flex h-full flex-col border-l backdrop-blur-xl md:pointer-events-auto w-full max-w-[440px]">
        <div class="flex items-start justify-between gap-3 border-b border-[rgba(201,164,90,0.22)] px-5 py-4">
          <div class="min-w-0">
            <div class="text-xs uppercase tracking-[0.35em] text-[#9f9278]">Feature Details</div>
            <h2 class="mt-2 truncate text-2xl font-semibold text-white">
              {{ feature.title || 'Feature' }}
            </h2>
            <div class="mt-1 text-xs text-[#9f9278]">
              {{ feature.type || 'Feature' }}
              <span v-if="feature.level"> · Level {{ feature.level }}</span>
              <span v-if="feature.source"> · {{ feature.source }}</span>
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
          <div class="grid gap-2 text-sm">
            <div
              v-if="feature.level"
              class="rounded-none border border-[rgba(201,164,90,0.16)] bg-[rgba(20,17,12,0.48)] p-3"
            >
              <span class="text-[#9f9278]">Level:</span>
              <span class="text-[#fff7df]">{{ feature.level }}</span>
            </div>

            <div
              v-if="feature.page"
              class="rounded-none border border-[rgba(201,164,90,0.16)] bg-[rgba(20,17,12,0.48)] p-3"
            >
              <span class="text-[#9f9278]">Page:</span>
              <span class="text-[#fff7df]">{{ feature.page }}</span>
            </div>
          </div>

          <div class="mt-5 rounded-none border border-[rgba(201,164,90,0.18)] bg-[rgba(20,17,12,0.48)] p-4">
            <div class="text-xs uppercase tracking-[0.3em] text-[#9f9278]">Description</div>
            <p class="mt-3 whitespace-pre-line text-sm leading-6 text-[#d8ceb8]">
              {{ feature.description || 'No feature description has been imported for this feature yet.' }}
            </p>
          </div>
        </div>

        <div class="border-t border-[rgba(201,164,90,0.22)] p-5">
          <div class="flex gap-3">
            <NuxtLink
              v-if="feature.articleUrl"
              :to="feature.articleUrl"
              class="flex-1 eldra-button rounded-none px-4 py-3 text-center text-sm font-medium"
              @click="emit('close')"
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
