<script setup lang="ts">
definePageMeta({
  layout: 'world-workspace'
})

const route = useRoute()
const worldId = computed(() => String(route.params.id || ''))
const entityId = computed(() => String(route.params.entityId || ''))
const mode = useState<'play' | 'build'>('world-workspace-mode', () => 'play')

const sheetSaving = ref(false)
const sheetSaveError = ref('')
const sheetSaveSuccess = ref('')

const sheetForm = reactive({
  name: '',
  level: '1',
  className: '',
  subclassName: '',
  speciesName: '',
  backgroundName: '',
  abilityScores: {
    str: '10',
    dex: '10',
    con: '10',
    int: '10',
    wis: '10',
    cha: '10'
  },
  combatStats: {
    armorClass: '',
    maxHp: '',
    currentHp: '',
    tempHp: '0',
    initiative: '',
    speed: '',
    hitDice: ''
  }
})

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

function asObject(value: any) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {}
}

function stringValue(value: any, fallback = '') {
  if (value === null || value === undefined) return fallback
  return String(value)
}

function syncFormFromSheet() {
  const currentSheet = sheet.value
  if (!currentSheet) return

  const abilityScores = asObject(currentSheet.ability_scores)
  const combatStats = asObject(currentSheet.combat_stats)

  sheetForm.name = stringValue(currentSheet.name || entity.value?.title || '')
  sheetForm.level = stringValue(currentSheet.level || 1)
  sheetForm.className = stringValue(currentSheet.class_name)
  sheetForm.subclassName = stringValue(currentSheet.subclass_name)
  sheetForm.speciesName = stringValue(currentSheet.species_name)
  sheetForm.backgroundName = stringValue(currentSheet.background_name)

  sheetForm.abilityScores.str = stringValue(abilityScores.str, '10')
  sheetForm.abilityScores.dex = stringValue(abilityScores.dex, '10')
  sheetForm.abilityScores.con = stringValue(abilityScores.con, '10')
  sheetForm.abilityScores.int = stringValue(abilityScores.int, '10')
  sheetForm.abilityScores.wis = stringValue(abilityScores.wis, '10')
  sheetForm.abilityScores.cha = stringValue(abilityScores.cha, '10')

  sheetForm.combatStats.armorClass = stringValue(combatStats.armorClass)
  sheetForm.combatStats.maxHp = stringValue(combatStats.maxHp)
  sheetForm.combatStats.currentHp = stringValue(combatStats.currentHp)
  sheetForm.combatStats.tempHp = stringValue(combatStats.tempHp, '0')
  sheetForm.combatStats.initiative = stringValue(combatStats.initiative)
  sheetForm.combatStats.speed = stringValue(combatStats.speed)
  sheetForm.combatStats.hitDice = stringValue(combatStats.hitDice)
}

watch(
  () => sheet.value?.id,
  () => {
    syncFormFromSheet()
  },
  { immediate: true }
)

const abilityScores = computed(() => {
  const scores = sheet.value?.ability_scores
  return asObject(scores)
})

const combatStats = computed(() => {
  const stats = sheet.value?.combat_stats
  return asObject(stats)
})

function shownAbilityScore(key: 'str' | 'dex' | 'con' | 'int' | 'wis' | 'cha') {
  if (mode.value === 'build') return sheetForm.abilityScores[key]

  const score = abilityScores.value[key]
  return score === null || score === undefined || score === '' ? 10 : score
}

function shownCombatStat(key: string) {
  if (mode.value === 'build') {
    return (sheetForm.combatStats as any)[key]
  }

  const value = combatStats.value[key]
  return value === null || value === undefined || value === '' ? '' : value
}

function abilityMod(value: any) {
  const score = Number(value)
  if (!Number.isFinite(score)) return '—'

  const mod = Math.floor((score - 10) / 2)
  return `${mod >= 0 ? '+' : ''}${mod}`
}

const abilityList = computed(() => [
  { key: 'str', label: 'STR', value: shownAbilityScore('str') },
  { key: 'dex', label: 'DEX', value: shownAbilityScore('dex') },
  { key: 'con', label: 'CON', value: shownAbilityScore('con') },
  { key: 'int', label: 'INT', value: shownAbilityScore('int') },
  { key: 'wis', label: 'WIS', value: shownAbilityScore('wis') },
  { key: 'cha', label: 'CHA', value: shownAbilityScore('cha') }
])

async function saveSheet() {
  if (sheetSaving.value) return

  sheetSaving.value = true
  sheetSaveError.value = ''
  sheetSaveSuccess.value = ''

  try {
    const saved = await $fetch(`/api/worlds/${worldId.value}/entities/${entityId.value}/sheet`, {
      method: 'PATCH',
      body: {
        name: sheetForm.name,
        level: sheetForm.level,
        className: sheetForm.className,
        subclassName: sheetForm.subclassName,
        speciesName: sheetForm.speciesName,
        backgroundName: sheetForm.backgroundName,
        abilityScores: { ...sheetForm.abilityScores },
        combatStats: { ...sheetForm.combatStats }
      }
    })

    data.value = saved as any
    syncFormFromSheet()
    sheetSaveSuccess.value = 'Sheet saved.'
  } catch (err: any) {
    sheetSaveError.value =
      err?.data?.statusMessage ||
      err?.data?.message ||
      err?.message ||
      'Failed to save sheet.'
  } finally {
    sheetSaving.value = false
  }
}
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

        <div class="flex flex-wrap gap-2">
          <button
            type="button"
            class="eldra-button rounded-none px-4 py-2 text-sm"
            @click="refresh()"
          >
            Refresh Sheet
          </button>

          <button
            v-if="mode === 'build'"
            type="button"
            class="eldra-button rounded-none px-4 py-2 text-sm font-semibold disabled:opacity-50"
            :disabled="sheetSaving"
            @click="saveSheet"
          >
            {{ sheetSaving ? 'Saving...' : 'Save Sheet' }}
          </button>
        </div>
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
            <div class="min-w-0 flex-1">
              <div class="text-xs uppercase tracking-[0.35em] text-[#9f9278]">Character Sheet</div>

              <input
                v-if="mode === 'build'"
                v-model="sheetForm.name"
                class="eldra-input mt-2 w-full rounded-none px-4 py-2 text-3xl font-semibold text-white sm:text-4xl"
                placeholder="Character name"
              >

              <h1 v-else class="mt-2 text-4xl font-semibold text-white">
                {{ sheet?.name || entity?.title || 'Character' }}
              </h1>

              <p class="mt-2 text-sm text-[#d8ceb8]">
                Mobile-first mechanical sheet foundation.
              </p>
            </div>

            <div class="eldra-gold-chip rounded-none border px-3 py-1.5 text-xs uppercase tracking-[0.18em]">
              {{ sheet?.sheet_type || 'dnd5e' }}
            </div>
          </div>

          <div v-if="sheetSaveError" class="mt-4 rounded-none border border-red-500/20 bg-red-500/10 p-3 text-sm text-red-200">
            {{ sheetSaveError }}
          </div>

          <div v-if="sheetSaveSuccess" class="mt-4 rounded-none border border-emerald-500/20 bg-emerald-500/10 p-3 text-sm text-emerald-200">
            {{ sheetSaveSuccess }}
          </div>

          <div class="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <label class="rounded-none border border-[rgba(201,164,90,0.22)] bg-[rgba(20,17,12,0.72)] p-4">
              <div class="text-xs uppercase tracking-[0.25em] text-[#9f9278]">Level</div>
              <input
                v-if="mode === 'build'"
                v-model="sheetForm.level"
                inputmode="numeric"
                class="eldra-input mt-2 w-full rounded-none px-3 py-2 text-2xl font-semibold text-white"
              >
              <div v-else class="mt-2 text-2xl font-semibold text-white">{{ sheet?.level || 1 }}</div>
            </label>

            <label class="rounded-none border border-[rgba(201,164,90,0.22)] bg-[rgba(20,17,12,0.72)] p-4">
              <div class="text-xs uppercase tracking-[0.25em] text-[#9f9278]">Class</div>
              <input
                v-if="mode === 'build'"
                v-model="sheetForm.className"
                class="eldra-input mt-2 w-full rounded-none px-3 py-2 text-lg text-white"
                placeholder="e.g. Fighter"
              >
              <div v-else class="mt-2 text-lg font-semibold text-white">{{ sheet?.class_name || '—' }}</div>
            </label>

            <label class="rounded-none border border-[rgba(201,164,90,0.22)] bg-[rgba(20,17,12,0.72)] p-4">
              <div class="text-xs uppercase tracking-[0.25em] text-[#9f9278]">Species</div>
              <input
                v-if="mode === 'build'"
                v-model="sheetForm.speciesName"
                class="eldra-input mt-2 w-full rounded-none px-3 py-2 text-lg text-white"
                placeholder="e.g. Human"
              >
              <div v-else class="mt-2 text-lg font-semibold text-white">{{ sheet?.species_name || '—' }}</div>
            </label>

            <label class="rounded-none border border-[rgba(201,164,90,0.22)] bg-[rgba(20,17,12,0.72)] p-4">
              <div class="text-xs uppercase tracking-[0.25em] text-[#9f9278]">Background</div>
              <input
                v-if="mode === 'build'"
                v-model="sheetForm.backgroundName"
                class="eldra-input mt-2 w-full rounded-none px-3 py-2 text-lg text-white"
                placeholder="e.g. Soldier"
              >
              <div v-else class="mt-2 text-lg font-semibold text-white">{{ sheet?.background_name || '—' }}</div>
            </label>
          </div>

          <div v-if="mode === 'build'" class="mt-3 rounded-none border border-[rgba(201,164,90,0.22)] bg-[rgba(20,17,12,0.72)] p-4">
            <label class="block">
              <span class="text-xs uppercase tracking-[0.25em] text-[#9f9278]">Subclass</span>
              <input
                v-model="sheetForm.subclassName"
                class="eldra-input mt-2 w-full rounded-none px-3 py-2 text-sm text-white"
                placeholder="Optional subclass"
              >
            </label>
          </div>

          <section class="mt-6 grid gap-3 sm:grid-cols-3">
            <label
              v-for="ability in abilityList"
              :key="ability.key"
              class="rounded-none border border-[rgba(201,164,90,0.22)] bg-[rgba(20,17,12,0.72)] p-4 text-center"
            >
              <div class="text-xs uppercase tracking-[0.25em] text-[#9f9278]">{{ ability.label }}</div>

              <input
                v-if="mode === 'build'"
                v-model="sheetForm.abilityScores[ability.key]"
                inputmode="numeric"
                class="eldra-input mx-auto mt-2 w-24 rounded-none px-3 py-2 text-center text-3xl font-semibold text-white"
              >

              <div v-else class="mt-2 text-3xl font-semibold text-white">{{ ability.value ?? 10 }}</div>
              <div class="mt-1 text-sm text-[#d8ceb8]">{{ abilityMod(ability.value) }}</div>
            </label>
          </section>

          <section class="mt-6 grid gap-4 lg:grid-cols-2">
            <div class="eldra-codex-soft rounded-none p-4">
              <div class="text-xs uppercase tracking-[0.3em] text-[#9f9278]">Combat</div>

              <div class="mt-4 grid grid-cols-2 gap-3 text-sm">
                <label class="rounded-none border border-[rgba(201,164,90,0.18)] bg-[rgba(20,17,12,0.52)] p-3">
                  <div class="text-[#9f9278]">Armor Class</div>
                  <input
                    v-if="mode === 'build'"
                    v-model="sheetForm.combatStats.armorClass"
                    inputmode="numeric"
                    class="eldra-input mt-2 w-full rounded-none px-3 py-2 text-xl text-white"
                  >
                  <div v-else class="mt-1 text-xl font-semibold text-white">{{ shownCombatStat('armorClass') || '—' }}</div>
                </label>

                <label class="rounded-none border border-[rgba(201,164,90,0.18)] bg-[rgba(20,17,12,0.52)] p-3">
                  <div class="text-[#9f9278]">Hit Points</div>
                  <div v-if="mode === 'build'" class="mt-2 grid grid-cols-2 gap-2">
                    <input
                      v-model="sheetForm.combatStats.currentHp"
                      inputmode="numeric"
                      placeholder="Current"
                      class="eldra-input w-full rounded-none px-3 py-2 text-sm text-white"
                    >
                    <input
                      v-model="sheetForm.combatStats.maxHp"
                      inputmode="numeric"
                      placeholder="Max"
                      class="eldra-input w-full rounded-none px-3 py-2 text-sm text-white"
                    >
                  </div>
                  <div v-else class="mt-1 text-xl font-semibold text-white">
                    {{ shownCombatStat('currentHp') || '—' }} / {{ shownCombatStat('maxHp') || '—' }}
                  </div>
                </label>

                <label class="rounded-none border border-[rgba(201,164,90,0.18)] bg-[rgba(20,17,12,0.52)] p-3">
                  <div class="text-[#9f9278]">Initiative</div>
                  <input
                    v-if="mode === 'build'"
                    v-model="sheetForm.combatStats.initiative"
                    inputmode="numeric"
                    class="eldra-input mt-2 w-full rounded-none px-3 py-2 text-xl text-white"
                  >
                  <div v-else class="mt-1 text-xl font-semibold text-white">{{ shownCombatStat('initiative') || '—' }}</div>
                </label>

                <label class="rounded-none border border-[rgba(201,164,90,0.18)] bg-[rgba(20,17,12,0.52)] p-3">
                  <div class="text-[#9f9278]">Speed</div>
                  <input
                    v-if="mode === 'build'"
                    v-model="sheetForm.combatStats.speed"
                    class="eldra-input mt-2 w-full rounded-none px-3 py-2 text-xl text-white"
                    placeholder="30 ft"
                  >
                  <div v-else class="mt-1 text-xl font-semibold text-white">{{ shownCombatStat('speed') || '—' }}</div>
                </label>

                <label v-if="mode === 'build'" class="col-span-2 rounded-none border border-[rgba(201,164,90,0.18)] bg-[rgba(20,17,12,0.52)] p-3">
                  <div class="text-[#9f9278]">Hit Dice</div>
                  <input
                    v-model="sheetForm.combatStats.hitDice"
                    class="eldra-input mt-2 w-full rounded-none px-3 py-2 text-sm text-white"
                    placeholder="e.g. 1d10"
                  >
                </label>
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
