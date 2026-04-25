<script setup lang="ts">
definePageMeta({
  layout: 'world-workspace'
})

import { render5eText } from '~/utils/render5e'

const route = useRoute()
const worldId = computed(() => String(route.params.id || ''))
const mode = useState<'play' | 'build'>('world-workspace-mode', () => 'play')

const search = ref('')
const selectedEnemyId = ref<string | null>(null)
const confirmDelete = ref(false)
const deleting = ref(false)
const deleteError = ref('')

const { data: world } = await useFetch(() => `/api/worlds/${worldId.value}`)
const { data: enemies, pending, refresh } = await useFetch(() => `/api/worlds/${worldId.value}/enemies`, {
  default: () => []
})

function initialsFor(name: string) {
  const words = String(name || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)

  if (!words.length) return '?'
  return words.map(w => w[0]?.toUpperCase() || '').join('')
}

function formatSize(value: any) {
  if (!value) return '—'
  if (Array.isArray(value)) return value.join(' / ')
  return String(value)
}

function formatAlignment(value: any) {
  if (!value) return '—'
  if (Array.isArray(value)) return value.join(' / ')
  return String(value)
}

function formatLanguages(value: any) {
  if (!value) return '—'
  if (Array.isArray(value)) return value.join(', ')
  return String(value)
}

function scoreMod(score: number | null | undefined) {
  if (typeof score !== 'number') return ''
  const mod = Math.floor((score - 10) / 2)
  return `${mod >= 0 ? '+' : ''}${mod}`
}

function actionTypeLabel(value: string) {
  if (value === 'trait') return 'Trait'
  if (value === 'bonus') return 'Bonus Action'
  if (value === 'reaction') return 'Reaction'
  if (value === 'legendary') return 'Legendary'
  if (value === 'mythic') return 'Mythic'
  if (value === 'lair') return 'Lair'
  return 'Action'
}

function looksLikeDescriptiveParagraph(value: string) {
  const text = String(value || '').trim()
  if (!text) return false
  if (text.length < 40) return false
  if (!/[a-z]/i.test(text)) return false
  if (text.includes('|')) return false
  return true
}

function findFirstDescriptiveText(value: any): string {
  if (value == null) return ''

  if (typeof value === 'string') {
    const text = value.trim()
    return looksLikeDescriptiveParagraph(text) ? text : ''
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findFirstDescriptiveText(item)
      if (found) return found
    }
    return ''
  }

  if (typeof value === 'object') {
    if (typeof value.entry === 'string') {
      const text = value.entry.trim()
      if (looksLikeDescriptiveParagraph(text)) return text
    }

    if (Array.isArray(value.entries)) {
      const found = findFirstDescriptiveText(value.entries)
      if (found) return found
    }

    if (Array.isArray(value.items)) {
      const found = findFirstDescriptiveText(value.items)
      if (found) return found
    }
  }

  return ''
}

function getEnemySummary(enemy: any) {
  const fluffSummary = findFirstDescriptiveText(enemy?.monsterProfile?.fluff_json?.entries)
  if (fluffSummary) return fluffSummary

  const storedSummary = String(enemy?.summary || '').trim()
  if (looksLikeDescriptiveParagraph(storedSummary)) return storedSummary

  return storedSummary
}

const filteredEnemies = computed(() => {
  const q = search.value.trim().toLowerCase()

  return (enemies.value || []).filter((enemy: any) => {
    if (!q) return true

    return [
      enemy?.title,
      enemy?.summary,
      enemy?.statblock?.creature_type,
      enemy?.statblock?.challenge_rating
    ]
      .filter(Boolean)
      .some((value: any) => String(value).toLowerCase().includes(q))
  })
})

const selectedEnemy = computed(() => {
  if (!selectedEnemyId.value) return null
  return (enemies.value || []).find((enemy: any) => String(enemy.id) === String(selectedEnemyId.value)) || null
})

const selectedEnemySummary = computed(() => {
  if (!selectedEnemy.value) return ''

  if (selectedEnemy.value?.monsterProfile?.fluff_markdown) {
    return selectedEnemy.value.monsterProfile.fluff_markdown
  }
  if (!selectedEnemy.value) return ''
  return getEnemySummary(selectedEnemy.value)
})

watch(filteredEnemies, (items) => {
  if (!items.length && selectedEnemyId.value) {
    selectedEnemyId.value = null
    return
  }

  if (selectedEnemyId.value) {
    const stillExists = items.some((enemy: any) => String(enemy.id) === String(selectedEnemyId.value))
    if (!stillExists) selectedEnemyId.value = null
  }
}, { deep: true })

function selectEnemy(enemy: any) {
  selectedEnemyId.value = String(enemy.id)
  confirmDelete.value = false
}

function clearSelectedEnemy() {
  selectedEnemyId.value = null
  confirmDelete.value = false
}

async function deleteEnemy() {
  if (!selectedEnemy.value) return

  deleteError.value = ''
  deleting.value = true

  try {
    const id = selectedEnemy.value.id

    await $fetch(`/api/worlds/${worldId.value}/enemies/${id}`, {
      method: 'DELETE'
    })

    await refresh()

    if (selectedEnemyId.value === String(id)) {
      selectedEnemyId.value = null
    }

    confirmDelete.value = false
  } catch (error: any) {
    deleteError.value =
      error?.data?.statusMessage ||
      error?.data?.message ||
      error?.message ||
      'Failed to delete enemy.'
  } finally {
    deleting.value = false
  }
}
</script>

<template>
  <div class="h-full overflow-y-auto bg-transparent">
    <div class="mx-auto max-w-[1900px] p-6">
      <div :class="selectedEnemy ? 'pr-[380px]' : ''" class="transition-all duration-200">
        <section class="eldra-panel rounded-[24px] p-6 shadow-xl">
          <div class="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
            <div>
              <div class="text-xs uppercase tracking-[0.35em] text-slate-500">Enemies</div>
              <h1 class="mt-2 text-3xl font-semibold text-white">{{ world?.name || 'World' }}</h1>
              <p class="mt-2 max-w-3xl text-sm text-slate-300">
                Browse imported enemies, statblocks, and actions for quick tabletop reference.
              </p>
            </div>

            <button
              type="button"
              class="rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2.5 text-sm text-slate-200 transition hover:bg-white/[0.08]"
              @click="refresh()"
            >
              Refresh
            </button>
          </div>

          <div class="mt-5">
            <input
              v-model="search"
              type="text"
              placeholder="Search enemies..."
              class="w-full rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm text-white placeholder-slate-400 outline-none transition focus:border-sky-400/30 focus:bg-white/[0.06]"
            >
          </div>
        </section>

        <section
          v-if="pending"
          class="mt-6 eldra-panel rounded-[24px] p-6 text-slate-300 shadow-xl"
        >
          Loading enemies...
        </section>

        <section
          v-else-if="!filteredEnemies.length"
          class="mt-6 eldra-empty rounded-[24px] p-10 text-center shadow-xl"
        >
          <div class="text-lg font-medium text-white">No enemies found</div>
          <p class="mt-2 text-sm text-slate-300">
            Import monsters from the Importer page, then come back here to browse them.
          </p>
        </section>

        <section
          v-else
          class="mt-6 grid gap-4 sm:grid-cols-2 2xl:grid-cols-3"
        >
          <div
            v-for="enemy in filteredEnemies"
            :key="enemy.id"
            class="group cursor-pointer overflow-hidden rounded-[24px] border border-white/10 bg-[linear-gradient(to_bottom,rgba(18,28,42,0.92),rgba(10,18,28,0.9))] shadow-xl transition duration-150 hover:-translate-y-0.5 hover:border-white/20"
            :class="selectedEnemyId === String(enemy.id)
              ? 'scale-[1.04] border-amber-300 bg-[linear-gradient(to_bottom,rgba(34,46,67,0.98),rgba(16,26,40,0.96))] shadow-[0_0_0_5px_rgba(251,191,36,0.75),0_0_40px_rgba(251,191,36,0.25),0_22px_48px_rgba(0,0,0,0.42)]'
              : 'opacity-95'"
            @click="selectEnemy(enemy)"
          >
            <div class="grid min-h-[240px] grid-cols-[112px_minmax(0,1fr)]">
              <div class="border-r border-white/10 bg-black/20">
                <img
                  v-if="enemy.imageUrl"
                  :src="enemy.imageUrl"
                  :alt="enemy.title"
                  class="h-full w-full object-cover"
                >
                <div
                  v-else
                  class="flex h-full w-full items-center justify-center bg-gradient-to-br from-slate-900/90 to-slate-800/80 text-2xl font-semibold text-slate-200"
                >
                  {{ initialsFor(enemy.title) }}
                </div>
              </div>

              <div class="flex min-w-0 flex-col p-5">
                <div class="flex items-start justify-between gap-3">
                  <div class="min-w-0">
                    <div class="truncate text-[1.55rem] font-semibold leading-tight text-white">
                      {{ enemy.title }}
                    </div>
                  </div>

                  <span class="shrink-0 rounded-full border border-red-400/20 bg-red-400/10 px-2.5 py-1 text-[11px] font-medium text-red-200">
                    CR {{ enemy.statblock?.challenge_rating || '—' }}
                  </span>
                </div>

                <div class="mt-4 space-y-1.5 text-sm text-slate-200">
                  <div><span class="text-slate-400">Type:</span> {{ enemy.statblock?.creature_type || '—' }}</div>
                  <div><span class="text-slate-400">Size:</span> {{ formatSize(enemy.statblock?.size_json) }}</div>
                  <div><span class="text-slate-400">AC:</span> {{ enemy.statblock?.armor_class ?? '—' }}</div>
                  <div><span class="text-slate-400">HP:</span> {{ enemy.statblock?.hit_points_average ?? '—' }}</div>
                </div>

                <div class="mt-auto pt-5 text-sm font-medium text-sky-200 transition group-hover:text-sky-100">
                  Select Enemy →
                </div>
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>

    <Transition enter-from-class="translate-x-full opacity-0" enter-active-class="transition duration-200" leave-to-class="translate-x-full opacity-0" leave-active-class="transition duration-200">
      <aside
        v-if="selectedEnemy"
        class="fixed right-0 top-0 z-30 h-full w-[360px] border-l border-white/10 bg-[rgba(8,16,27,0.94)] backdrop-blur"
      >
        <div class="flex h-full flex-col">
          <div class="flex items-start justify-between gap-3 border-b border-white/10 px-5 py-5">
            <div class="min-w-0">
              <div class="text-xs uppercase tracking-[0.35em] text-slate-500">Summary</div>
              <h2 class="mt-3 truncate text-2xl font-semibold text-white">{{ selectedEnemy.title }}</h2>
            </div>

            <button
              type="button"
              class="rounded-xl border border-white/10 bg-white/[0.04] p-2 text-slate-400 transition hover:bg-white/[0.08] hover:text-white"
              @click="clearSelectedEnemy"
            >
              <UIcon name="i-lucide-x" class="h-4 w-4" />
            </button>
          </div>

          <div class="flex-1 overflow-y-auto px-5 py-5 space-y-5">
            <div
              v-if="selectedEnemy.imageUrl"
              class="overflow-hidden rounded-2xl border border-white/10 bg-black/20"
            >
              <img
                :src="selectedEnemy.imageUrl"
                :alt="selectedEnemy.title"
                class="h-64 w-full object-cover"
              >
            </div>

            <div v-else class="flex h-64 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.04] text-4xl font-semibold text-slate-300">
              {{ initialsFor(selectedEnemy.title) }}
            </div>

            <div class="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
              <div class="grid grid-cols-2 gap-3 text-sm">
                <div><span class="text-slate-400">CR:</span> <span class="text-white">{{ selectedEnemy.statblock?.challenge_rating || '—' }}</span></div>
                <div><span class="text-slate-400">AC:</span> <span class="text-white">{{ selectedEnemy.statblock?.armor_class ?? '—' }}</span></div>
                <div><span class="text-slate-400">HP:</span> <span class="text-white">{{ selectedEnemy.statblock?.hit_points_average ?? '—' }}</span></div>
                <div><span class="text-slate-400">Type:</span> <span class="text-white">{{ selectedEnemy.statblock?.creature_type || '—' }}</span></div>
                <div><span class="text-slate-400">Size:</span> <span class="text-white">{{ formatSize(selectedEnemy.statblock?.size_json) }}</span></div>
                <div><span class="text-slate-400">Align:</span> <span class="text-white">{{ formatAlignment(selectedEnemy.statblock?.alignment_json) }}</span></div>
              </div>
            </div>

            <div class="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
              <div class="mb-3 text-xs uppercase tracking-[0.25em] text-slate-500">Abilities</div>
              <div class="grid grid-cols-3 gap-3 text-center">
                <div class="rounded-xl border border-white/10 bg-black/10 p-3">
                  <div class="text-[11px] uppercase tracking-[0.18em] text-slate-500">STR</div>
                  <div class="mt-1 text-lg font-semibold text-white">{{ selectedEnemy.statblock?.str_score ?? '—' }}</div>
                  <div class="text-xs text-slate-400">{{ scoreMod(selectedEnemy.statblock?.str_score) }}</div>
                </div>
                <div class="rounded-xl border border-white/10 bg-black/10 p-3">
                  <div class="text-[11px] uppercase tracking-[0.18em] text-slate-500">DEX</div>
                  <div class="mt-1 text-lg font-semibold text-white">{{ selectedEnemy.statblock?.dex_score ?? '—' }}</div>
                  <div class="text-xs text-slate-400">{{ scoreMod(selectedEnemy.statblock?.dex_score) }}</div>
                </div>
                <div class="rounded-xl border border-white/10 bg-black/10 p-3">
                  <div class="text-[11px] uppercase tracking-[0.18em] text-slate-500">CON</div>
                  <div class="mt-1 text-lg font-semibold text-white">{{ selectedEnemy.statblock?.con_score ?? '—' }}</div>
                  <div class="text-xs text-slate-400">{{ scoreMod(selectedEnemy.statblock?.con_score) }}</div>
                </div>
                <div class="rounded-xl border border-white/10 bg-black/10 p-3">
                  <div class="text-[11px] uppercase tracking-[0.18em] text-slate-500">INT</div>
                  <div class="mt-1 text-lg font-semibold text-white">{{ selectedEnemy.statblock?.int_score ?? '—' }}</div>
                  <div class="text-xs text-slate-400">{{ scoreMod(selectedEnemy.statblock?.int_score) }}</div>
                </div>
                <div class="rounded-xl border border-white/10 bg-black/10 p-3">
                  <div class="text-[11px] uppercase tracking-[0.18em] text-slate-500">WIS</div>
                  <div class="mt-1 text-lg font-semibold text-white">{{ selectedEnemy.statblock?.wis_score ?? '—' }}</div>
                  <div class="text-xs text-slate-400">{{ scoreMod(selectedEnemy.statblock?.wis_score) }}</div>
                </div>
                <div class="rounded-xl border border-white/10 bg-black/10 p-3">
                  <div class="text-[11px] uppercase tracking-[0.18em] text-slate-500">CHA</div>
                  <div class="mt-1 text-lg font-semibold text-white">{{ selectedEnemy.statblock?.cha_score ?? '—' }}</div>
                  <div class="text-xs text-slate-400">{{ scoreMod(selectedEnemy.statblock?.cha_score) }}</div>
                </div>
              </div>
            </div>

            <div class="rounded-2xl border border-white/10 bg-white/[0.04] p-4 text-sm leading-7 text-slate-200">
              <div class="mb-2 text-xs uppercase tracking-[0.25em] text-slate-500">Languages</div>
              {{ formatLanguages(selectedEnemy.statblock?.languages_json) }}
            </div>

            <div
              v-if="selectedEnemySummary"
              class="rounded-2xl border border-white/10 bg-white/[0.04] p-4 text-sm leading-7 text-slate-200"
            >
              <div class="mb-2 text-xs uppercase tracking-[0.25em] text-slate-500">Summary</div>
              {{ render5eText(selectedEnemySummary) }}
            </div>

            <div
              v-if="selectedEnemy.actions?.length"
              class="rounded-2xl border border-white/10 bg-white/[0.04] p-4"
            >
              <div class="mb-3 text-xs uppercase tracking-[0.25em] text-slate-500">Actions</div>

              <div class="space-y-4">
                <div
                  v-for="action in selectedEnemy.actions"
                  :key="`${action.action_type}-${action.id}`"
                  class="rounded-xl border border-white/10 bg-black/10 p-3"
                >
                  <div class="flex items-center justify-between gap-3">
                    <div class="font-medium text-white">{{ action.name }}</div>
                    <div class="text-[11px] uppercase tracking-[0.15em] text-slate-500">{{ actionTypeLabel(action.action_type) }}</div>
                  </div>
                  <div class="mt-2 text-sm leading-7 text-slate-200">{{ render5eText(action.text) }}</div>
                </div>
              </div>
            </div>
          </div>

          <div v-if="deleteError" class="px-5 pt-3 text-sm text-red-300">
            {{ deleteError }}
          </div>

          <div class="border-t border-white/10 p-5">
            <div v-if="mode === 'build'" class="flex gap-3 mb-3">
              <button
                v-if="!confirmDelete"
                type="button"
                class="flex-1 rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-100 hover:bg-red-500/20"
                @click="confirmDelete = true"
              >
                Delete
              </button>

              <button
                v-else
                type="button"
                class="flex-1 rounded-xl border border-red-500/30 bg-red-500/20 px-4 py-3 text-sm text-red-50 disabled:opacity-50"
                :disabled="deleting"
                @click="deleteEnemy"
              >
                {{ deleting ? 'Deleting…' : 'Confirm Delete' }}
              </button>
            </div>

            <NuxtLink
              :to="`/worlds/${worldId}/entities/${selectedEnemy.id}`"
              class="block rounded-xl border border-sky-400/20 bg-sky-400/10 px-4 py-3 text-center text-sm font-medium text-sky-100 transition hover:bg-sky-400/20"
            >
              Open Article
            </NuxtLink>
          </div>
        </div>
      </aside>
    </Transition>
  </div>
</template>
