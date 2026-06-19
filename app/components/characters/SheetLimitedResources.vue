<script setup lang="ts">
const props = defineProps<{
  worldId: string | number
  entityId: string | number
  sheet?: any
  math?: any
}>()

type LimitedResourceDef = {
  key: string
  label: string
  kind: string
  max: number
  reset: string
  source: string
  description: string
}

const saving = ref(false)
const saveError = ref('')
const saveSuccess = ref('')
const localUses = ref<Record<string, number>>({})

function asObject(value: any) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {}
}

function normalizedKey(value: any) {
  return String(value ?? '')
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

function numberValue(value: any, fallback = 0) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

function sheetLevel() {
  return Math.max(1, Math.floor(numberValue(props.sheet?.level, 1)))
}

function proficiencyBonus() {
  return Math.max(2, Math.floor(numberValue(
    props.math?.proficiencyBonus ??
    props.math?.proficiency_bonus ??
    props.sheet?.proficiencyBonus ??
    props.sheet?.proficiency_bonus,
    2
  )))
}

function barbarianRageMax(level: number) {
  if (level >= 17) return 6
  if (level >= 12) return 5
  if (level >= 6) return 4
  if (level >= 3) return 3
  return 2
}

function fighterSecondWindMax(level: number) {
  if (level >= 10) return 4
  if (level >= 4) return 3
  return 2
}

function classKey() {
  return normalizedKey(props.sheet?.class_name || props.sheet?.className || '')
}

function speciesKey() {
  return normalizedKey(props.sheet?.species_name || props.sheet?.speciesName || '')
}

function currentResources() {
  return asObject(props.sheet?.resources)
}

function currentLimitedUses() {
  const resources = currentResources()
  return asObject(resources.limitedResourceUses ?? resources.limited_resource_uses)
}

watch(
  () => props.sheet?.resources,
  () => {
    const next: Record<string, number> = {}

    for (const [key, value] of Object.entries(currentLimitedUses())) {
      next[key] = Math.max(0, Math.floor(numberValue(value, 0)))
    }

    localUses.value = next
  },
  { immediate: true, deep: true }
)

const limitedResourceDefs = computed<LimitedResourceDef[]>(() => {
  const level = sheetLevel()
  const pb = proficiencyBonus()
  const cls = classKey()
  const species = speciesKey()
  const out: LimitedResourceDef[] = []

  if (cls.includes('barbarian')) {
    out.push({
      key: 'rage',
      label: 'Rage',
      kind: 'Bonus Action',
      max: barbarianRageMax(level),
      reset: 'Long Rest',
      source: 'Barbarian',
      description: 'Enter a rage as a Bonus Action. Track expended uses here until the next Long Rest.'
    })
  }

  if (cls.includes('fighter')) {
    out.push({
      key: 'second-wind',
      label: 'Second Wind',
      kind: 'Bonus Action',
      max: fighterSecondWindMax(level),
      reset: 'Short or Long Rest',
      source: 'Fighter',
      description: 'Regain hit points using Second Wind. Track expended uses here.'
    })
  }

  if (species.includes('dragonborn')) {
    out.push({
      key: 'breath-weapon',
      label: 'Breath Weapon',
      kind: 'Action',
      max: pb,
      reset: 'Long Rest',
      source: 'Dragonborn',
      description: 'Track uses of your draconic Breath Weapon. The attack/effect card still lives in Actions.'
    })
  }

  if (species.includes('aasimar')) {
    out.push({
      key: 'healing-hands',
      label: 'Healing Hands',
      kind: 'Magic Action',
      max: 1,
      reset: 'Long Rest',
      source: 'Aasimar',
      description: 'Touch a creature and restore hit points. Track the once-per-rest use here.'
    })
  }

  return out
})

function usedCount(resource: LimitedResourceDef) {
  return Math.max(0, Math.min(resource.max, Math.floor(numberValue(localUses.value[resource.key], 0))))
}

function remainingCount(resource: LimitedResourceDef) {
  return Math.max(0, resource.max - usedCount(resource))
}

function resourceStatusText(resource: LimitedResourceDef) {
  return `${remainingCount(resource)} / ${resource.max} remaining`
}

async function persistLimitedUses() {
  if (!props.worldId || !props.entityId) return

  saving.value = true
  saveError.value = ''
  saveSuccess.value = ''

  try {
    const res = await $fetch<any>(`/api/worlds/${props.worldId}/entities/${props.entityId}/sheet/resources`, {
      method: 'PATCH',
      body: {
        resources: {
          limitedResourceUses: localUses.value
        }
      }
    })

    const next = asObject(res?.resources?.limitedResourceUses ?? res?.resources?.limited_resource_uses ?? localUses.value)
    const normalized: Record<string, number> = {}

    for (const [key, value] of Object.entries(next)) {
      normalized[key] = Math.max(0, Math.floor(numberValue(value, 0)))
    }

    localUses.value = normalized
    saveSuccess.value = 'Saved.'
  } catch (error: any) {
    saveError.value = error?.data?.message || error?.statusMessage || error?.message || 'Failed to save resource uses.'
  } finally {
    saving.value = false
  }
}

function spendResource(resource: LimitedResourceDef) {
  if (remainingCount(resource) <= 0) return

  localUses.value = {
    ...localUses.value,
    [resource.key]: usedCount(resource) + 1
  }

  void persistLimitedUses()
}

function recoverResource(resource: LimitedResourceDef) {
  if (usedCount(resource) <= 0) return

  localUses.value = {
    ...localUses.value,
    [resource.key]: usedCount(resource) - 1
  }

  void persistLimitedUses()
}

function resetResource(resource: LimitedResourceDef) {
  localUses.value = {
    ...localUses.value,
    [resource.key]: 0
  }

  void persistLimitedUses()
}

function resetAllResources() {
  const next = { ...localUses.value }

  for (const resource of limitedResourceDefs.value) {
    next[resource.key] = 0
  }

  localUses.value = next
  void persistLimitedUses()
}
</script>

<template>
  <div
    v-if="limitedResourceDefs.length"
    class="eldra-codex-soft rounded-none p-4"
  >
    <div class="flex flex-wrap items-start justify-between gap-3">
      <div>
        <div class="text-xs uppercase tracking-[0.3em] text-[#9f9278]">Limited Resources</div>
        <div class="mt-1 text-sm text-[#d8ceb8]">
          Track class and species uses between rests.
        </div>
      </div>

      <button
        type="button"
        class="rounded-none border border-[rgba(201,164,90,0.24)] bg-[rgba(20,17,12,0.72)] px-3 py-2 text-xs font-semibold text-[#fff7df] transition hover:bg-[rgba(201,164,90,0.10)] disabled:opacity-50"
        :disabled="saving"
        @click="resetAllResources"
      >
        Reset All
      </button>
    </div>

    <div class="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
      <article
        v-for="resource in limitedResourceDefs"
        :key="resource.key"
        class="rounded-none border border-[rgba(65,82,103,0.62)] bg-[rgba(8,17,27,0.68)] p-3"
      >
        <div class="flex items-start justify-between gap-3">
          <div class="min-w-0">
            <div class="truncate font-semibold text-white">{{ resource.label }}</div>
            <div class="mt-1 text-xs text-[#9f9278]">
              {{ resource.source }} · {{ resource.kind }}
            </div>
          </div>

          <span
            class="shrink-0 rounded-none border px-2 py-1 text-[10px] uppercase tracking-[0.16em]"
            :class="remainingCount(resource)
              ? 'border-[rgba(201,164,90,0.22)] bg-[rgba(201,164,90,0.08)] text-[#f5e7bd]'
              : 'border-red-500/25 bg-red-500/10 text-red-200'"
          >
            {{ resourceStatusText(resource) }}
          </span>
        </div>

        <div class="mt-3 grid grid-cols-2 gap-2 text-xs">
          <div class="rounded-none border border-[rgba(201,164,90,0.14)] bg-[rgba(9,17,26,0.42)] p-2">
            <div class="uppercase tracking-[0.18em] text-[#9f9278]">Used</div>
            <div class="mt-1 font-semibold text-white">{{ usedCount(resource) }}</div>
          </div>

          <div class="rounded-none border border-[rgba(201,164,90,0.14)] bg-[rgba(9,17,26,0.42)] p-2">
            <div class="uppercase tracking-[0.18em] text-[#9f9278]">Reset</div>
            <div class="mt-1 font-semibold text-white">{{ resource.reset }}</div>
          </div>
        </div>

        <p class="mt-3 text-xs leading-5 text-[#9f9278]">
          {{ resource.description }}
        </p>

        <div class="mt-3 grid grid-cols-3 gap-2">
          <button
            type="button"
            class="rounded-none border border-[rgba(201,164,90,0.24)] bg-[rgba(201,164,90,0.10)] px-3 py-2 text-center text-xs font-semibold text-[#fff7df] disabled:opacity-40"
            :disabled="saving || remainingCount(resource) <= 0"
            @click.stop="spendResource(resource)"
          >
            Use
          </button>

          <button
            type="button"
            class="rounded-none border border-[rgba(201,164,90,0.22)] bg-[rgba(20,17,12,0.72)] px-3 py-2 text-center text-xs font-semibold text-[#fff7df] disabled:opacity-40"
            :disabled="saving || usedCount(resource) <= 0"
            @click.stop="recoverResource(resource)"
          >
            Undo
          </button>

          <button
            type="button"
            class="rounded-none border border-[rgba(201,164,90,0.22)] bg-[rgba(20,17,12,0.72)] px-3 py-2 text-center text-xs font-semibold text-[#fff7df] disabled:opacity-40"
            :disabled="saving || usedCount(resource) <= 0"
            @click.stop="resetResource(resource)"
          >
            Reset
          </button>
        </div>
      </article>
    </div>

    <div
      v-if="saveError || saveSuccess"
      class="mt-3 rounded-none border px-3 py-2 text-xs"
      :class="saveError
        ? 'border-red-400/24 bg-red-500/10 text-red-100'
        : 'border-emerald-400/24 bg-emerald-500/10 text-emerald-100'"
    >
      {{ saveError || saveSuccess }}
    </div>
  </div>
</template>
