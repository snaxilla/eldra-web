<script setup lang="ts">
defineProps<{
  item?: any | null
  worldId: string | number
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
      v-if="item"
      class="fixed inset-0 z-[140] bg-black/60 backdrop-blur-sm md:pointer-events-none md:bg-transparent md:backdrop-blur-none"
      @click.self="emit('close')"
    >
      <aside data-eldra-context-rail-panel class="eldra-context-rail-fixed eldra-context-rail-panel eldra-ornate-panel eldra-frame-corners fixed bottom-0 right-0 top-0 flex h-full w-full flex-col border-l backdrop-blur-xl md:pointer-events-auto">
        <div class="flex items-start justify-between gap-3 border-b border-[rgba(201,164,90,0.22)] px-5 py-4">
          <div class="min-w-0">
            <div class="text-xs uppercase tracking-[0.35em] text-[#9f9278]">Item Details</div>
            <h2 class="mt-2 truncate text-2xl font-semibold text-white">
              {{ item.name || 'Item' }}
            </h2>
            <div class="mt-1 text-xs text-[#9f9278]">
              {{ item.itemType || 'Item' }}
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
              v-if="item.damage"
              class="rounded-none border border-[rgba(201,164,90,0.16)] bg-[rgba(20,17,12,0.48)] p-3"
            >
              <span class="text-[#9f9278]">Damage:</span>
              <span class="text-[#fff7df]">{{ item.damage }}</span>
            </div>

            <div
              v-if="item.damageType"
              class="rounded-none border border-[rgba(201,164,90,0.16)] bg-[rgba(20,17,12,0.48)] p-3"
            >
              <span class="text-[#9f9278]">Damage Type:</span>
              <span class="text-[#fff7df]">{{ item.damageType }}</span>
            </div>

            <div
              v-if="item.rarity"
              class="rounded-none border border-[rgba(201,164,90,0.16)] bg-[rgba(20,17,12,0.48)] p-3"
            >
              <span class="text-[#9f9278]">Rarity:</span>
              <span class="text-[#fff7df]">{{ item.rarity }}</span>
            </div>

            <div
              v-if="item.weight !== '' && item.weight !== null && item.weight !== undefined"
              class="rounded-none border border-[rgba(201,164,90,0.16)] bg-[rgba(20,17,12,0.48)] p-3"
            >
              <span class="text-[#9f9278]">Weight:</span>
              <span class="text-[#fff7df]">{{ item.weight }}</span>
            </div>

            <div
              v-if="item.value"
              class="rounded-none border border-[rgba(201,164,90,0.16)] bg-[rgba(20,17,12,0.48)] p-3"
            >
              <span class="text-[#9f9278]">Value:</span>
              <span class="text-[#fff7df]">{{ item.value }}</span>
            </div>
          </div>

          <div class="mt-5 rounded-none border border-[rgba(201,164,90,0.18)] bg-[rgba(20,17,12,0.48)] p-4">
            <section
              v-if="item && (
                (item.armorClass !== '' && item.armorClass !== null && item.armorClass !== undefined) ||
                item.requiresAttunement ||
                item.source
              )"
              class="border-b border-[rgba(201,164,90,0.18)] px-5 py-4"
            >
              <div class="text-xs uppercase tracking-[0.35em] text-[#9f9278]">
                Item Properties
              </div>

              <div class="mt-3 grid gap-2 text-sm">
                <div
                  v-if="item.armorClass !== '' && item.armorClass !== null && item.armorClass !== undefined"
                  class="rounded-none border border-[rgba(201,164,90,0.18)] bg-[rgba(20,17,12,0.52)] p-3"
                >
                  <span class="text-[#9f9278]">Armor Class:</span>
                  <span class="text-[#fff7df]">{{ item.armorClass }}</span>
                </div>

                <div
                  v-if="item.requiresAttunement"
                  class="rounded-none border border-[rgba(201,164,90,0.18)] bg-[rgba(20,17,12,0.52)] p-3"
                >
                  <span class="text-[#9f9278]">Attunement:</span>
                  <span class="text-[#fff7df]">Required</span>
                </div>

                <div
                  v-if="item.source"
                  class="rounded-none border border-[rgba(201,164,90,0.18)] bg-[rgba(20,17,12,0.52)] p-3"
                >
                  <span class="text-[#9f9278]">Source:</span>
                  <span class="text-[#fff7df]">{{ item.source }}</span>
                </div>
              </div>
            </section>


            <div class="text-xs uppercase tracking-[0.3em] text-[#9f9278]">Description</div>
            <p class="mt-3 whitespace-pre-line text-sm leading-6 text-[#d8ceb8]">
              {{ item.description || item.notes || 'No item description has been imported for this item yet.' }}
            </p>
          </div>
        </div>

        <div class="border-t border-[rgba(201,164,90,0.22)] p-5">
          <div class="flex gap-3">
            <NuxtLink
              v-if="item.linkedItemId"
              :to="`/worlds/${worldId}/entities/${item.linkedItemId}`"
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
