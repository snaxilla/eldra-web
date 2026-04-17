<script setup lang="ts">
import { computed, ref } from 'vue'

const props = defineProps<{
  worldName: string
  selectedPin: any | null
  mode: 'play' | 'build'
  collapsed: boolean
  canSeeDm: boolean
}>()

const emit = defineEmits<{
  (e: 'toggle-collapse'): void
}>()

const activeTab = ref<'info' | 'dm'>('info')

const showEdit = computed(() => props.mode === 'build')
</script>

<template>
  <aside class="flex h-full min-h-0 flex-col border-l border-white/10 bg-[rgba(7,13,22,0.94)] backdrop-blur-md">
    <div v-if="collapsed" class="flex h-full flex-col items-center justify-center gap-4 px-2">
      <button
        type="button"
        class="rounded-xl border border-white/10 bg-white/[0.04] p-2 text-slate-300 transition hover:bg-white/[0.08] hover:text-white"
        @click="emit('toggle-collapse')"
      >
        <UIcon name="i-lucide-panel-right-open" class="h-4 w-4" />
      </button>

      <div class="rotate-180 text-xs uppercase tracking-[0.28em] text-slate-500 [writing-mode:vertical-rl]">
        {{ selectedPin?.title || 'Article' }}
      </div>
    </div>

    <template v-else>
      <div class="flex items-center justify-between border-b border-white/10 px-5 py-4">
        <div class="text-sm uppercase tracking-[0.28em] text-slate-500">
          {{ worldName }}
        </div>

        <button
          type="button"
          class="rounded-xl border border-white/10 bg-white/[0.04] p-2 text-slate-300 transition hover:bg-white/[0.08] hover:text-white"
          @click="emit('toggle-collapse')"
        >
          <UIcon name="i-lucide-panel-right-close" class="h-4 w-4" />
        </button>
      </div>

      <div v-if="selectedPin" class="flex min-h-0 flex-1 flex-col">
        <div class="border-b border-white/10 px-5 py-4">
          <div class="flex items-start justify-between gap-3">
            <NuxtLink
              :to="selectedPin.articleTo || '#'"
              class="text-4xl font-semibold tracking-tight text-white transition hover:text-sky-300"
            >
              {{ selectedPin.title }}
            </NuxtLink>

            <button
              v-if="showEdit"
              type="button"
              class="rounded-xl border border-white/10 bg-white/[0.04] p-2 text-slate-300 transition hover:bg-white/[0.08] hover:text-white"
              title="Edit article"
            >
              <UIcon name="i-lucide-pencil" class="h-4 w-4" />
            </button>
          </div>

          <div class="mt-4 flex gap-2">
            <button
              type="button"
              class="rounded-full border px-3 py-1.5 text-sm font-medium transition"
              :class="activeTab === 'info'
                ? 'border-sky-300/25 bg-sky-400/10 text-sky-100'
                : 'border-white/10 bg-white/[0.04] text-slate-300'"
              @click="activeTab = 'info'"
            >
              Info
            </button>

            <button
              v-if="canSeeDm"
              type="button"
              class="rounded-full border px-3 py-1.5 text-sm font-medium transition"
              :class="activeTab === 'dm'
                ? 'border-amber-300/25 bg-amber-400/10 text-amber-100'
                : 'border-white/10 bg-white/[0.04] text-slate-300'"
              @click="activeTab = 'dm'"
            >
              DM
            </button>
          </div>
        </div>

        <div class="min-h-0 flex-1 overflow-y-auto">
          <div v-if="activeTab === 'info'" class="space-y-6 p-5">
            <div
              v-if="selectedPin.image"
              class="overflow-hidden rounded-[24px] border border-white/10 bg-[#0b1220]"
            >
              <img :src="selectedPin.image" :alt="selectedPin.title" class="h-56 w-full object-cover">
            </div>

            <section class="rounded-[24px] border border-white/10 bg-white/[0.03] p-5">
              <div class="flex items-center justify-between">
                <div class="text-xs uppercase tracking-[0.3em] text-slate-500">Summary</div>
                <button
                  v-if="showEdit"
                  type="button"
                  class="rounded-lg border border-white/10 bg-white/[0.04] p-2 text-slate-300 transition hover:bg-white/[0.08] hover:text-white"
                >
                  <UIcon name="i-lucide-pencil" class="h-4 w-4" />
                </button>
              </div>

              <p class="mt-4 whitespace-pre-wrap text-lg leading-8 text-slate-100">
                {{ selectedPin.summary }}
              </p>
            </section>
          </div>

          <div v-else class="space-y-6 p-5">
            <section
              v-if="selectedPin.dm?.enemies?.length"
              class="rounded-[24px] border border-white/10 bg-white/[0.03] p-5"
            >
              <div class="flex items-center justify-between">
                <div class="text-xs uppercase tracking-[0.3em] text-slate-500">Possible Enemies</div>
                <button
                  v-if="showEdit"
                  type="button"
                  class="rounded-lg border border-white/10 bg-white/[0.04] p-2 text-slate-300 transition hover:bg-white/[0.08] hover:text-white"
                >
                  <UIcon name="i-lucide-pencil" class="h-4 w-4" />
                </button>
              </div>

              <div class="mt-4 grid grid-cols-2 gap-3">
                <div
                  v-for="enemy in selectedPin.dm.enemies"
                  :key="enemy.name"
                  class="rounded-2xl border border-white/10 bg-[#0b1220] p-3 text-center"
                >
                  <img :src="enemy.image" :alt="enemy.name" class="mx-auto h-20 w-20 rounded-xl object-cover">
                  <div class="mt-2 text-sm font-medium text-amber-200">{{ enemy.name }}</div>
                </div>
              </div>
            </section>

            <section
              v-if="selectedPin.dm?.items?.length"
              class="rounded-[24px] border border-white/10 bg-white/[0.03] p-5"
            >
              <div class="flex items-center justify-between">
                <div class="text-xs uppercase tracking-[0.3em] text-slate-500">Possible Items</div>
                <button
                  v-if="showEdit"
                  type="button"
                  class="rounded-lg border border-white/10 bg-white/[0.04] p-2 text-slate-300 transition hover:bg-white/[0.08] hover:text-white"
                >
                  <UIcon name="i-lucide-pencil" class="h-4 w-4" />
                </button>
              </div>

              <div class="mt-4 grid grid-cols-2 gap-3">
                <div
                  v-for="item in selectedPin.dm.items"
                  :key="item.name"
                  class="rounded-2xl border border-white/10 bg-[#0b1220] p-3 text-center"
                >
                  <img :src="item.image" :alt="item.name" class="mx-auto h-20 w-20 rounded-xl object-cover">
                  <div class="mt-2 text-sm font-medium text-amber-200">{{ item.name }}</div>
                </div>
              </div>
            </section>

            <section
              v-if="selectedPin.dm?.npcs?.length"
              class="rounded-[24px] border border-white/10 bg-white/[0.03] p-5"
            >
              <div class="flex items-center justify-between">
                <div class="text-xs uppercase tracking-[0.3em] text-slate-500">NPCs</div>
                <button
                  v-if="showEdit"
                  type="button"
                  class="rounded-lg border border-white/10 bg-white/[0.04] p-2 text-slate-300 transition hover:bg-white/[0.08] hover:text-white"
                >
                  <UIcon name="i-lucide-pencil" class="h-4 w-4" />
                </button>
              </div>

              <div class="mt-4 grid grid-cols-2 gap-3">
                <div
                  v-for="npc in selectedPin.dm.npcs"
                  :key="npc.name"
                  class="rounded-2xl border border-white/10 bg-[#0b1220] p-3 text-center"
                >
                  <img :src="npc.image" :alt="npc.name" class="mx-auto h-20 w-20 rounded-xl object-cover">
                  <div class="mt-2 text-sm font-medium text-amber-200">{{ npc.name }}</div>
                </div>
              </div>
            </section>
          </div>
        </div>
      </div>

      <div v-else class="flex flex-1 items-center justify-center p-8 text-center">
        <div>
          <div class="text-xs uppercase tracking-[0.3em] text-slate-500">No selection</div>
          <div class="mt-3 text-lg text-slate-300">Select a pin on the map to inspect an article.</div>
        </div>
      </div>
    </template>
  </aside>
</template>
