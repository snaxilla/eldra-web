<script setup lang="ts">
definePageMeta({
  layout: 'world-workspace'
})

const route = useRoute()
const router = useRouter()
const worldId = computed(() => String(route.params.id || ''))
const workspaceMode = useState<'play' | 'build'>('world-workspace-mode', () => 'play')

const stepIndex = ref(0)
const creating = ref(false)
const createError = ref('')
const advancedScores = ref(false)

const STANDARD_ARRAY = [15, 14, 13, 12, 10, 8]
const ABILITIES = [
  { key: 'str', label: 'STR', name: 'Strength' },
  { key: 'dex', label: 'DEX', name: 'Dexterity' },
  { key: 'con', label: 'CON', name: 'Constitution' },
  { key: 'int', label: 'INT', name: 'Intelligence' },
  { key: 'wis', label: 'WIS', name: 'Wisdom' },
  { key: 'cha', label: 'CHA', name: 'Charisma' }
] as const

const steps = [
  { key: 'identity', label: 'Identity' },
  { key: 'abilities', label: 'Abilities' },
  { key: 'review', label: 'Review' }
]

const builderForm = reactive({
  name: '',
  level: '1',
  classEntityId: '',
  speciesEntityId: '',
  backgroundEntityId: '',
  abilityScores: {
    str: '15',
    dex: '14',
    con: '13',
    int: '12',
    wis: '10',
    cha: '8'
  }
})

const { data: world } = await useFetch(() => `/api/worlds/${worldId.value}`)
const { data: worldEntities } = await useFetch(() => `/api/worlds/${worldId.value}/entities`, {
  default: () => [],
  watch: [worldId]
})

function normalizeEntityType(value: any) {
  return String(value || '').trim().toLowerCase()
}

function optionList(type: string) {
  return (Array.isArray(worldEntities.value) ? worldEntities.value : [])
    .filter((entity: any) => normalizeEntityType(entity?.entity_type || entity?.entityType) === type)
    .map((entity: any) => ({
      id: String(entity?.id || ''),
      title: String(entity?.title || 'Untitled')
    }))
    .filter((option: any) => option.id)
    .sort((a: any, b: any) => a.title.localeCompare(b.title))
}

const classOptions = computed(() => optionList('class'))
const speciesOptions = computed(() => optionList('species'))
const backgroundOptions = computed(() => optionList('background'))

function optionTitle(options: any[], id: any) {
  const needle = String(id || '')
  if (!needle) return ''
  return options.find((option: any) => String(option.id) === needle)?.title || ''
}

const selectedClassName = computed(() => optionTitle(classOptions.value, builderForm.classEntityId))
const selectedSpeciesName = computed(() => optionTitle(speciesOptions.value, builderForm.speciesEntityId))
const selectedBackgroundName = computed(() => optionTitle(backgroundOptions.value, builderForm.backgroundEntityId))

function classKey() {
  return selectedClassName.value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

function recommendedAbilityOrder() {
  const key = classKey()

  if (key.includes('barbarian')) return ['str', 'con', 'dex', 'wis', 'cha', 'int']
  if (key.includes('fighter')) return ['str', 'con', 'dex', 'wis', 'cha', 'int']
  if (key.includes('paladin')) return ['str', 'cha', 'con', 'wis', 'dex', 'int']
  if (key.includes('ranger')) return ['dex', 'wis', 'con', 'str', 'cha', 'int']
  if (key.includes('rogue')) return ['dex', 'con', 'wis', 'cha', 'int', 'str']
  if (key.includes('monk')) return ['dex', 'wis', 'con', 'str', 'cha', 'int']
  if (key.includes('wizard')) return ['int', 'con', 'dex', 'wis', 'cha', 'str']
  if (key.includes('artificer')) return ['int', 'con', 'dex', 'wis', 'cha', 'str']
  if (key.includes('cleric')) return ['wis', 'con', 'str', 'dex', 'cha', 'int']
  if (key.includes('druid')) return ['wis', 'con', 'dex', 'int', 'str', 'cha']
  if (key.includes('bard')) return ['cha', 'dex', 'con', 'wis', 'int', 'str']
  if (key.includes('sorcerer')) return ['cha', 'con', 'dex', 'wis', 'int', 'str']
  if (key.includes('warlock')) return ['cha', 'con', 'dex', 'wis', 'int', 'str']

  return ['str', 'dex', 'con', 'int', 'wis', 'cha']
}

function applyRecommendedArray() {
  const order = recommendedAbilityOrder()

  for (const [index, ability] of order.entries()) {
    ;(builderForm.abilityScores as any)[ability] = String(STANDARD_ARRAY[index] || 10)
  }
}

watch(
  () => builderForm.classEntityId,
  () => {
    if (!advancedScores.value) {
      applyRecommendedArray()
    }
  }
)

function abilityMod(value: any) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return '+0'

  const mod = Math.floor((parsed - 10) / 2)
  return `${mod >= 0 ? '+' : ''}${mod}`
}

function usedScoreByOtherAbility(score: any, abilityKey: string) {
  return Object.entries(builderForm.abilityScores)
    .some(([key, value]) => key !== abilityKey && String(value) === String(score))
}

const missingRequirements = computed(() => {
  const missing: string[] = []

  if (!builderForm.name.trim()) missing.push('Name')
  if (!builderForm.classEntityId) missing.push('Class')
  if (!builderForm.speciesEntityId) missing.push('Species')

  return missing
})

const canCreate = computed(() => !missingRequirements.value.length && !creating.value)

function nextStep() {
  if (stepIndex.value < steps.length - 1) {
    stepIndex.value += 1
  }
}

function previousStep() {
  if (stepIndex.value > 0) {
    stepIndex.value -= 1
  }
}

function goToStep(index: number) {
  stepIndex.value = index
}

async function createCharacter() {
  if (!canCreate.value) return

  creating.value = true
  createError.value = ''

  try {
    const created = await $fetch<any>(`/api/worlds/${worldId.value}/characters/builder`, {
      method: 'POST',
      body: {
        name: builderForm.name,
        level: builderForm.level,
        classEntityId: builderForm.classEntityId,
        speciesEntityId: builderForm.speciesEntityId,
        backgroundEntityId: builderForm.backgroundEntityId || null,
        abilityScores: { ...builderForm.abilityScores }
      }
    })

    const entityId = String(created?.id || created?.entity?.id || '')
    if (!entityId) {
      throw new Error('Character was created, but no entity id was returned.')
    }

    workspaceMode.value = 'build'
    await router.push(`/worlds/${worldId.value}/entities/${entityId}/sheet`)
  } catch (err: any) {
    createError.value =
      err?.data?.statusMessage ||
      err?.data?.message ||
      err?.message ||
      'Failed to create character.'
  } finally {
    creating.value = false
  }
}
</script>

<template>
  <div class="fixed inset-0 z-[9999] overflow-y-auto bg-[#05080d] md:relative md:inset-auto md:z-auto md:bg-transparent">
    <div class="pointer-events-none fixed inset-0 z-0 md:hidden">
      <div class="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(48,68,92,0.48),rgba(5,10,16,1)_62%)]"></div>
      <div class="absolute inset-0 bg-[linear-gradient(to_bottom,rgba(3,6,10,0.18),rgba(3,6,10,0.50))]"></div>
    </div>

    <div class="relative z-10 mx-auto max-w-[980px] p-3 pb-20 md:p-6">
      <div class="sticky top-0 z-30 -mx-3 border-b border-[rgba(201,164,90,0.20)] bg-[rgba(7,13,20,0.92)] px-3 py-3 shadow-[0_12px_32px_rgba(0,0,0,0.35)] backdrop-blur md:relative md:mx-0 md:border md:px-5 md:py-5">
        <div class="flex items-start justify-between gap-3">
          <div>
            <div class="text-[10px] uppercase tracking-[0.35em] text-[#9f9278]">Guided Builder</div>
            <h1 class="mt-1 text-2xl font-semibold text-white">Create Player Character</h1>
            <p class="mt-1 text-sm text-[#d8ceb8]">{{ world?.name || 'World' }}</p>
          </div>

          <NuxtLink
            :to="`/worlds/${worldId}/characters`"
            class="rounded-none border border-[rgba(201,164,90,0.32)] bg-[rgba(20,17,12,0.82)] px-3 py-2 text-xs font-semibold text-[#fff7df]"
          >
            Back
          </NuxtLink>
        </div>

        <div class="mt-4 grid grid-cols-3 gap-2">
          <button
            v-for="(step, index) in steps"
            :key="step.key"
            type="button"
            class="rounded-none border px-2 py-2 text-xs font-semibold"
            :class="stepIndex === index
              ? 'border-[rgba(201,164,90,0.58)] bg-[rgba(201,164,90,0.18)] text-[#fff7df]'
              : 'border-[rgba(65,82,103,0.62)] bg-[rgba(8,17,27,0.62)] text-[#d8ceb8]'"
            @click="goToStep(index)"
          >
            {{ index + 1 }}. {{ step.label }}
          </button>
        </div>
      </div>

      <section class="eldra-ornate-panel eldra-frame-corners mt-4 rounded-none border p-4 md:p-5">
        <div v-if="stepIndex === 0" class="grid gap-4">
          <div>
            <div class="text-xs uppercase tracking-[0.3em] text-[#9f9278]">Step 1</div>
            <h2 class="mt-2 text-xl font-semibold text-white">Who are they?</h2>
            <p class="mt-1 text-sm leading-6 text-[#d8ceb8]">Pick the big identity pieces. The detailed choices happen after the sheet exists.</p>
          </div>

          <label class="block">
            <span class="mb-2 block text-xs uppercase tracking-[0.22em] text-[#9f9278]">Character Name</span>
            <input
              v-model="builderForm.name"
              class="eldra-input w-full rounded-none px-3 py-3 text-sm text-white"
              placeholder="Dingus Khan"
            >
          </label>

          <div class="grid gap-3 md:grid-cols-2">
            <label class="block">
              <span class="mb-2 block text-xs uppercase tracking-[0.22em] text-[#9f9278]">Class</span>
              <select v-model="builderForm.classEntityId" class="eldra-input w-full rounded-none px-3 py-3 text-sm text-white">
                <option value="" class="bg-[#090909] text-[#f5e7bd]">Choose a class...</option>
                <option v-for="option in classOptions" :key="option.id" :value="option.id" class="bg-[#090909] text-[#f5e7bd]">
                  {{ option.title }}
                </option>
              </select>
            </label>

            <label class="block">
              <span class="mb-2 block text-xs uppercase tracking-[0.22em] text-[#9f9278]">Species</span>
              <select v-model="builderForm.speciesEntityId" class="eldra-input w-full rounded-none px-3 py-3 text-sm text-white">
                <option value="" class="bg-[#090909] text-[#f5e7bd]">Choose a species...</option>
                <option v-for="option in speciesOptions" :key="option.id" :value="option.id" class="bg-[#090909] text-[#f5e7bd]">
                  {{ option.title }}
                </option>
              </select>
            </label>

            <label class="block">
              <span class="mb-2 block text-xs uppercase tracking-[0.22em] text-[#9f9278]">Background</span>
              <select v-model="builderForm.backgroundEntityId" class="eldra-input w-full rounded-none px-3 py-3 text-sm text-white">
                <option value="" class="bg-[#090909] text-[#f5e7bd]">Choose later...</option>
                <option v-for="option in backgroundOptions" :key="option.id" :value="option.id" class="bg-[#090909] text-[#f5e7bd]">
                  {{ option.title }}
                </option>
              </select>
            </label>

            <label class="block">
              <span class="mb-2 block text-xs uppercase tracking-[0.22em] text-[#9f9278]">Starting Level</span>
              <select v-model="builderForm.level" class="eldra-input w-full rounded-none px-3 py-3 text-sm text-white">
                <option v-for="level in 20" :key="level" :value="String(level)" class="bg-[#090909] text-[#f5e7bd]">
                  Level {{ level }}
                </option>
              </select>
            </label>
          </div>

          <div v-if="!classOptions.length || !speciesOptions.length" class="rounded-none border border-amber-300/24 bg-amber-400/10 p-3 text-sm leading-6 text-amber-100">
            This builder needs imported class and species articles. Import PHB/XPHB classes and species first if these lists are empty.
          </div>
        </div>

        <div v-else-if="stepIndex === 1" class="grid gap-4">
          <div class="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div class="text-xs uppercase tracking-[0.3em] text-[#9f9278]">Step 2</div>
              <h2 class="mt-2 text-xl font-semibold text-white">Ability Scores</h2>
              <p class="mt-1 text-sm leading-6 text-[#d8ceb8]">Standard Array is the safe default. Recommended placement changes with class.</p>
            </div>

            <div class="flex gap-2">
              <button
                type="button"
                class="eldra-button rounded-none px-3 py-2 text-xs font-semibold"
                @click="applyRecommendedArray"
              >
                Auto-Fill
              </button>

              <button
                type="button"
                class="rounded-none border px-3 py-2 text-xs font-semibold"
                :class="advancedScores
                  ? 'border-amber-300/40 bg-amber-400/10 text-amber-100'
                  : 'border-[rgba(65,82,103,0.62)] bg-[rgba(8,17,27,0.62)] text-[#d8ceb8]'"
                @click="advancedScores = !advancedScores"
              >
                {{ advancedScores ? 'Manual On' : 'Manual' }}
              </button>
            </div>
          </div>

          <div class="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            <div
              v-for="ability in ABILITIES"
              :key="ability.key"
              class="rounded-none border border-[rgba(65,82,103,0.62)] bg-[rgba(8,17,27,0.68)] p-3"
            >
              <div class="flex items-start justify-between gap-3">
                <div>
                  <div class="text-xs uppercase tracking-[0.22em] text-[#9f9278]">{{ ability.label }}</div>
                  <div class="mt-1 text-sm text-[#d8ceb8]">{{ ability.name }}</div>
                </div>

                <div class="text-right">
                  <div class="text-2xl font-semibold text-white">{{ builderForm.abilityScores[ability.key] }}</div>
                  <div class="text-xs text-[#9f9278]">{{ abilityMod(builderForm.abilityScores[ability.key]) }}</div>
                </div>
              </div>

              <select
                v-if="!advancedScores"
                v-model="builderForm.abilityScores[ability.key]"
                class="eldra-input mt-3 w-full rounded-none px-3 py-2 text-sm text-white"
              >
                <option
                  v-for="score in STANDARD_ARRAY"
                  :key="score"
                  :value="String(score)"
                  :disabled="usedScoreByOtherAbility(score, ability.key)"
                  class="bg-[#090909] text-[#f5e7bd] disabled:text-[#756a57]"
                >
                  {{ score }}
                </option>
              </select>

              <input
                v-else
                v-model="builderForm.abilityScores[ability.key]"
                inputmode="numeric"
                class="eldra-input mt-3 w-full rounded-none px-3 py-2 text-sm text-white"
              >
            </div>
          </div>

          <div v-if="advancedScores" class="rounded-none border border-amber-300/24 bg-amber-400/10 p-3 text-xs leading-5 text-amber-100">
            Manual scores allow overrides, rolled stats, homebrew, and DM-approved nonsense.
          </div>
        </div>

        <div v-else class="grid gap-4">
          <div>
            <div class="text-xs uppercase tracking-[0.3em] text-[#9f9278]">Step 3</div>
            <h2 class="mt-2 text-xl font-semibold text-white">Review & Create</h2>
            <p class="mt-1 text-sm leading-6 text-[#d8ceb8]">This creates the PC and opens the sheet in Build mode for choices, spells, gear, and leveling polish.</p>
          </div>

          <div class="grid gap-2 md:grid-cols-2">
            <div class="rounded-none border border-[rgba(65,82,103,0.62)] bg-[rgba(8,17,27,0.68)] p-3">
              <div class="text-xs uppercase tracking-[0.22em] text-[#9f9278]">Name</div>
              <div class="mt-1 text-lg font-semibold text-white">{{ builderForm.name || 'Missing name' }}</div>
            </div>

            <div class="rounded-none border border-[rgba(65,82,103,0.62)] bg-[rgba(8,17,27,0.68)] p-3">
              <div class="text-xs uppercase tracking-[0.22em] text-[#9f9278]">Class / Species</div>
              <div class="mt-1 text-lg font-semibold text-white">
                {{ selectedClassName || 'Missing class' }} · {{ selectedSpeciesName || 'Missing species' }}
              </div>
              <div class="mt-1 text-xs text-[#9f9278]">
                {{ selectedBackgroundName || 'Background later' }} · Level {{ builderForm.level }}
              </div>
            </div>
          </div>

          <div class="grid grid-cols-3 gap-2 text-center sm:grid-cols-6">
            <div
              v-for="ability in ABILITIES"
              :key="`review-${ability.key}`"
              class="rounded-none border border-[rgba(65,82,103,0.62)] bg-[rgba(8,17,27,0.68)] p-2"
            >
              <div class="text-xs uppercase tracking-[0.18em] text-[#9f9278]">{{ ability.label }}</div>
              <div class="mt-1 text-xl font-semibold text-white">{{ builderForm.abilityScores[ability.key] }}</div>
              <div class="text-xs text-[#9f9278]">{{ abilityMod(builderForm.abilityScores[ability.key]) }}</div>
            </div>
          </div>

          <div v-if="missingRequirements.length" class="rounded-none border border-red-500/20 bg-red-500/10 p-3 text-sm text-red-200">
            Missing: {{ missingRequirements.join(', ') }}
          </div>

          <div v-if="createError" class="rounded-none border border-red-500/20 bg-red-500/10 p-3 text-sm text-red-200">
            {{ createError }}
          </div>
        </div>
      </section>

      <div class="sticky bottom-0 z-20 -mx-3 mt-4 border-t border-[rgba(201,164,90,0.20)] bg-[rgba(7,13,20,0.94)] p-3 backdrop-blur md:mx-0 md:rounded-none md:border">
        <div class="grid grid-cols-2 gap-3">
          <button
            type="button"
            class="eldra-button rounded-none px-4 py-3 text-sm font-semibold disabled:opacity-40"
            :disabled="stepIndex === 0"
            @click="previousStep"
          >
            Back
          </button>

          <button
            v-if="stepIndex < steps.length - 1"
            type="button"
            class="eldra-button rounded-none px-4 py-3 text-sm font-semibold"
            @click="nextStep"
          >
            Next
          </button>

          <button
            v-else
            type="button"
            class="eldra-button rounded-none px-4 py-3 text-sm font-semibold disabled:opacity-50"
            :disabled="!canCreate"
            @click="createCharacter"
          >
            {{ creating ? 'Creating...' : 'Create Character' }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
