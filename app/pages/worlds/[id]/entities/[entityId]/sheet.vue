<script setup lang="ts">
definePageMeta({
  layout: 'world-workspace'
})

const route = useRoute()
const worldId = computed(() => String(route.params.id || ''))
const entityId = computed(() => String(route.params.entityId || ''))

const {
  data,
  pending,
  error,
  refresh
} = await useAsyncData(
  () => `character-sheet-${worldId.value}-${entityId.value}`,
  () => $fetch(`/api/worlds/${worldId.value}/entities/${entityId.value}/sheet`, {
    method: 'POST'
  }),
  {
    watch: [worldId, entityId]
  }
)

const entity = computed(() => data.value?.entity || null)
const sheet = computed(() => data.value?.sheet || null)
const inventory = computed(() => Array.isArray(data.value?.inventory) ? data.value.inventory : [])

const abilityScores = computed(() => {
  const scores = sheet.value?.ability_scores
  return scores && typeof scores === 'object'
    ? scores
    : { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 }
})

const combatStats = computed(() => {
  const stats = sheet.value?.combat_stats
  return stats && typeof stats === 'object' ? stats : {}
})

function abilityMod(value: any) {
  const score = Number(value)
  if (!Number.isFinite(score)) return '—'

  const mod = Math.floor((score - 10) / 2)
  return `${mod >= 0 ? '+' : ''}${mod}`
}

const abilityList = computed(() => [
  { key: 'str', label: 'STR', value: abilityScores.value.str },
  { key: 'dex', label: 'DEX', value: abilityScores.value.dex },
  { key: 'con', label: 'CON', value: abilityScores.value.con },
  { key: 'int', label: 'INT', value: abilityScores.value.int },
  { key: 'wis', label: 'WIS', value: abilityScores.value.wis },
  { key: 'cha', label: 'CHA', value: abilityScores.value.cha }
])
</script>

<template>
  <div class="h-full overflow-y-auto bg-transparent">
    <div class="mx-auto max-w-[1100px] p-4 sm:p-6">
      <div class="mb-4 flex flex-wrap items-center justify-between gap-3">
        <NuxtLink
          :to="`/worlds/${worldId}/entities/${entityId}`"
          class="eldra-button rounded-none px-4 py-2 text-sm"
        >
          Back to Article
        </NuxtLink>

        <button
          type="button"
          class="eldra-button rounded-none px-4 py-2 text-sm"
          @click="refresh()"
        >
          Refresh Sheet
        </button>
      </div>

      <section class="eldra-ornate-panel eldra-frame-corners eldra-corner-runes rounded-none border p-5 shadow-xl">
        <div v-if="pending" class="text-[#d8ceb8]">
          Loading character sheet...
        </div>

        <div v-else-if="error" class="rounded-none border border-red-500/20 bg-red-500/10 p-4 text-sm text-red-200">
          {{ error?.data?.statusMessage || error?.message || 'Failed to load sheet.' }}
        </div>

        <template v-else>
          <div class="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <div class="text-xs uppercase tracking-[0.35em] text-[#9f9278]">Character Sheet</div>
              <h1 class="mt-2 text-4xl font-semibold text-white">
                {{ sheet?.name || entity?.title || 'Character' }}
              </h1>
              <p class="mt-2 text-sm text-[#d8ceb8]">
                Mobile-first mechanical sheet foundation. Editing comes next.
              </p>
            </div>

            <div class="eldra-gold-chip rounded-none border px-3 py-1.5 text-xs uppercase tracking-[0.18em]">
              {{ sheet?.sheet_type || 'dnd5e' }}
            </div>
          </div>

          <div class="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div class="rounded-none border border-[rgba(201,164,90,0.22)] bg-[rgba(20,17,12,0.72)] p-4">
              <div class="text-xs uppercase tracking-[0.25em] text-[#9f9278]">Level</div>
              <div class="mt-2 text-2xl font-semibold text-white">{{ sheet?.level || 1 }}</div>
            </div>

            <div class="rounded-none border border-[rgba(201,164,90,0.22)] bg-[rgba(20,17,12,0.72)] p-4">
              <div class="text-xs uppercase tracking-[0.25em] text-[#9f9278]">Class</div>
              <div class="mt-2 text-lg font-semibold text-white">{{ sheet?.class_name || '—' }}</div>
            </div>

            <div class="rounded-none border border-[rgba(201,164,90,0.22)] bg-[rgba(20,17,12,0.72)] p-4">
              <div class="text-xs uppercase tracking-[0.25em] text-[#9f9278]">Species</div>
              <div class="mt-2 text-lg font-semibold text-white">{{ sheet?.species_name || '—' }}</div>
            </div>

            <div class="rounded-none border border-[rgba(201,164,90,0.22)] bg-[rgba(20,17,12,0.72)] p-4">
              <div class="text-xs uppercase tracking-[0.25em] text-[#9f9278]">Background</div>
              <div class="mt-2 text-lg font-semibold text-white">{{ sheet?.background_name || '—' }}</div>
            </div>
          </div>

          <section class="mt-6 grid gap-3 sm:grid-cols-3">
            <div
              v-for="ability in abilityList"
              :key="ability.key"
              class="rounded-none border border-[rgba(201,164,90,0.22)] bg-[rgba(20,17,12,0.72)] p-4 text-center"
            >
              <div class="text-xs uppercase tracking-[0.25em] text-[#9f9278]">{{ ability.label }}</div>
              <div class="mt-2 text-3xl font-semibold text-white">{{ ability.value ?? 10 }}</div>
              <div class="mt-1 text-sm text-[#d8ceb8]">{{ abilityMod(ability.value) }}</div>
            </div>
          </section>

          <section class="mt-6 grid gap-4 lg:grid-cols-2">
            <div class="eldra-codex-soft rounded-none p-4">
              <div class="text-xs uppercase tracking-[0.3em] text-[#9f9278]">Combat</div>

              <div class="mt-4 grid grid-cols-2 gap-3 text-sm">
                <div class="rounded-none border border-[rgba(201,164,90,0.18)] bg-[rgba(20,17,12,0.52)] p-3">
                  <div class="text-[#9f9278]">Armor Class</div>
                  <div class="mt-1 text-xl font-semibold text-white">{{ combatStats.armorClass || '—' }}</div>
                </div>

                <div class="rounded-none border border-[rgba(201,164,90,0.18)] bg-[rgba(20,17,12,0.52)] p-3">
                  <div class="text-[#9f9278]">Hit Points</div>
                  <div class="mt-1 text-xl font-semibold text-white">
                    {{ combatStats.currentHp || '—' }} / {{ combatStats.maxHp || '—' }}
                  </div>
                </div>

                <div class="rounded-none border border-[rgba(201,164,90,0.18)] bg-[rgba(20,17,12,0.52)] p-3">
                  <div class="text-[#9f9278]">Initiative</div>
                  <div class="mt-1 text-xl font-semibold text-white">{{ combatStats.initiative || '—' }}</div>
                </div>

                <div class="rounded-none border border-[rgba(201,164,90,0.18)] bg-[rgba(20,17,12,0.52)] p-3">
                  <div class="text-[#9f9278]">Speed</div>
                  <div class="mt-1 text-xl font-semibold text-white">{{ combatStats.speed || '—' }}</div>
                </div>
              </div>
            </div>

            <div class="eldra-codex-soft rounded-none p-4">
              <div class="text-xs uppercase tracking-[0.3em] text-[#9f9278]">Inventory</div>

              <div v-if="inventory.length" class="mt-4 space-y-2">
                <div
                  v-for="item in inventory"
                  :key="item.id"
                  class="rounded-none border border-[rgba(201,164,90,0.18)] bg-[rgba(20,17,12,0.52)] p-3 text-sm text-[#d8ceb8]"
                >
                  <div class="flex items-center justify-between gap-3">
                    <span class="font-medium text-white">{{ item.name }}</span>
                    <span>x{{ item.quantity || 1 }}</span>
                  </div>
                  <div v-if="item.notes" class="mt-1 text-xs text-[#9f9278]">{{ item.notes }}</div>
                </div>
              </div>

              <div v-else class="mt-4 rounded-none border border-dashed border-[rgba(201,164,90,0.22)] p-4 text-sm text-[#9f9278]">
                Inventory is empty. DM/Admin item assignment hooks will land later.
              </div>
            </div>
          </section>
        </template>
      </section>
    </div>
  </div>
</template>
