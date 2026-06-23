<script setup lang="ts">
type ClassResourceOption = {
  id?: string
  name?: string
  title?: string
  activation?: string
  summary?: string
  detail?: string
  markdown?: string
}

type ClassResource = {
  key: string
  usedKey?: string
  label: string
  max: number
  reset: string
  source: string
  kind: string
  unit: string
  mode: 'uses' | 'pool'
  description: string
  options?: ClassResourceOption[]
}

const props = defineProps<{
  worldId: string | number
  entityId: string | number
  sheet?: any
  resources?: ClassResource[]
}>()

const saving = ref(false)
const saveError = ref('')
const saveSuccess = ref('')
const localUses = ref<Record<string, number>>({})
const spendDrafts = ref<Record<string, number>>({})

function asObject(value: any) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {}
}

function numberValue(value: any, fallback = 0) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

function currentSheetLimitedUses() {
  const resources = asObject(props.sheet?.resources)
  return asObject(resources.limitedResourceUses ?? resources.limited_resource_uses)
}

watch(
  () => props.sheet?.resources,
  () => {
    const next: Record<string, number> = {}

    for (const [key, value] of Object.entries(currentSheetLimitedUses())) {
      next[key] = Math.max(0, Math.floor(numberValue(value, 0)))
    }

    localUses.value = next
  },
  { immediate: true, deep: true }
)

const shownResources = computed(() =>
  (Array.isArray(props.resources) ? props.resources : [])
    .map((resource: any) => ({
      ...resource,
      key: String(resource.key || resource.usedKey || resource.label || '').trim(),
      usedKey: String(resource.usedKey || resource.key || resource.label || '').trim(),
      max: Math.max(0, Math.floor(numberValue(resource.max, 0))),
      mode: resource.mode === 'pool' ? 'pool' : 'uses',
      unit: String(resource.unit || (resource.mode === 'pool' ? 'HP' : 'Use')),
      options: Array.isArray(resource.options) ? resource.options : []
    }))
    .filter((resource: any) => resource.key && resource.max > 0)
)

watch(
  shownResources,
  (resources) => {
    const next = { ...spendDrafts.value }

    for (const resource of resources) {
      const key = resource.usedKey || resource.key
      if (!next[key]) next[key] = defaultSpendAmount(resource)
      next[key] = clampSpendAmount(resource, next[key])
    }

    spendDrafts.value = next
  },
  { immediate: true, deep: true }
)

function usedCount(resource: any) {
  return Math.max(0, Math.min(resource.max, Math.floor(numberValue(localUses.value[resource.usedKey || resource.key], 0))))
}

function remainingCount(resource: any) {
  return Math.max(0, Number(resource.max || 0) - usedCount(resource))
}

function resourceStatusText(resource: any) {
  const unit = resource.unit || 'Use'

  if (resource.mode === 'pool') {
    return `${remainingCount(resource)} / ${resource.max} ${unit}`
  }

  return `${remainingCount(resource)} / ${resource.max} ${unit}${resource.max === 1 ? '' : 's'}`
}

function pipIndexes(resource: any) {
  if (resource.mode === 'pool' && Number(resource.max || 0) > 10) return []
  return Array.from({ length: Number(resource.max || 0) }, (_item, index) => index)
}

function pipAvailable(resource: any, index: number) {
  return index >= usedCount(resource)
}

function pipClass(resource: any, index: number) {
  return pipAvailable(resource, index)
    ? 'block h-3 w-3 rounded-full border border-amber-200/80 bg-amber-300/80 shadow-[0_0_10px_rgba(252,211,77,0.24)]'
    : 'block h-3 w-3 rounded-full border border-[rgba(148,163,184,0.35)] bg-transparent opacity-50'
}

function defaultSpendAmount(resource: any) {
  if (resource.mode === 'pool') return Math.min(5, Math.max(1, Number(resource.max || 1)))
  return 1
}

function clampSpendAmount(resource: any, value: any) {
  const max = Math.max(1, Number(resource.max || 1))
  return Math.max(1, Math.min(max, Math.floor(numberValue(value, defaultSpendAmount(resource)))))
}

function spendAmount(resource: any) {
  const key = resource.usedKey || resource.key
  return clampSpendAmount(resource, spendDrafts.value[key])
}

function setSpendAmount(resource: any, value: any) {
  const key = resource.usedKey || resource.key
  spendDrafts.value = {
    ...spendDrafts.value,
    [key]: clampSpendAmount(resource, value)
  }
}

function nudgeSpendAmount(resource: any, delta: number) {
  setSpendAmount(resource, spendAmount(resource) + delta)
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
    saveError.value = error?.data?.message || error?.statusMessage || error?.message || 'Failed to save class resource uses.'
  } finally {
    saving.value = false
  }
}

function setUsed(resource: any, nextUsed: number) {
  const key = resource.usedKey || resource.key
  localUses.value = {
    ...localUses.value,
    [key]: Math.max(0, Math.min(resource.max, Math.floor(numberValue(nextUsed, 0))))
  }

  void persistLimitedUses()
}

function useResource(resource: any) {
  if (saving.value) return

  if (resource.mode === 'pool') {
    const amount = Math.min(spendAmount(resource), remainingCount(resource))
    if (amount <= 0) return
    setUsed(resource, usedCount(resource) + amount)
    return
  }

  if (remainingCount(resource) <= 0) return
  setUsed(resource, usedCount(resource) + 1)
}

function restoreResource(resource: any) {
  if (saving.value) return

  if (resource.mode === 'pool') {
    const amount = Math.min(spendAmount(resource), usedCount(resource))
    if (amount <= 0) return
    setUsed(resource, usedCount(resource) - amount)
    return
  }

  undoResource(resource)
}

function undoResource(resource: any) {
  if (usedCount(resource) <= 0 || saving.value) return
  setUsed(resource, usedCount(resource) - 1)
}

function resetResource(resource: any) {
  setUsed(resource, 0)
}

function togglePip(resource: any, index: number) {
  if (saving.value) return

  if (pipAvailable(resource, index)) {
    setUsed(resource, usedCount(resource) + 1)
  } else {
    setUsed(resource, Math.max(0, Number(index)))
  }
}

function optionTitle(option: any) {
  return String(option?.title || option?.name || 'Option')
}

function optionSummary(option: any) {
  return String(option?.summary || option?.detail || option?.markdown || '').trim()
}
</script>

<template>
  <div
    v-if="shownResources.length"
    class="eldra-codex-soft rounded-none p-4"
  >
    <div class="mb-3 flex flex-wrap items-start justify-between gap-3">
      <div>
        <div class="text-xs uppercase tracking-[0.3em] text-[#9f9278]">Class Resources</div>
        <div class="mt-1 text-sm text-[#d8ceb8]">
          Track class pools and limited-use features between rests.
        </div>
      </div>

      <div class="eldra-gold-chip rounded-none border px-3 py-1 text-xs">
        {{ shownResources.length }} Resource{{ shownResources.length === 1 ? '' : 's' }}
      </div>
    </div>

    <div class="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
      <article
        v-for="resource in shownResources"
        :key="resource.key"
        class="rounded-none border border-[rgba(65,82,103,0.62)] bg-[rgba(8,17,27,0.68)] p-3"
      >
        <div class="flex items-start justify-between gap-3">
          <div class="min-w-0">
            <div class="truncate font-semibold text-white">{{ resource.label }}</div>
            <div class="mt-1 text-xs text-[#9f9278]">{{ resource.source }} · {{ resource.kind }}</div>
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

        <div
          v-if="pipIndexes(resource).length"
          class="mt-3 flex flex-wrap items-center gap-1.5"
        >
          <button
            v-for="pipIndex in pipIndexes(resource)"
            :key="`${resource.key}-${pipIndex}`"
            type="button"
            class="rounded-full p-0.5 transition hover:scale-110 focus:outline-none focus:ring-1 focus:ring-amber-200/50"
            @click.stop="togglePip(resource, pipIndex)"
          >
            <span :class="pipClass(resource, pipIndex)" />
          </button>
        </div>

        <div
          v-else
          class="mt-3 rounded-none border border-[rgba(201,164,90,0.14)] bg-[rgba(9,17,26,0.42)] p-2 text-xs"
        >
          <div class="uppercase tracking-[0.18em] text-[#9f9278]">
            {{ resource.mode === 'pool' ? 'Pool Used' : 'Used' }}
          </div>
          <div class="mt-1 font-semibold text-white">
            {{ usedCount(resource) }} / {{ resource.max }} {{ resource.unit || 'Uses' }}
          </div>
        </div>

        <div
          v-if="resource.mode === 'pool'"
          class="mt-3 rounded-none border border-[rgba(201,164,90,0.14)] bg-[rgba(9,17,26,0.42)] p-2"
        >
          <div class="mb-2 text-xs uppercase tracking-[0.18em] text-[#9f9278]">Spend / Restore Amount</div>

          <div class="grid grid-cols-[44px_1fr_44px] gap-2">
            <button
              type="button"
              class="rounded-none border border-[rgba(201,164,90,0.22)] bg-[rgba(20,17,12,0.72)] px-3 py-2 text-center text-sm font-semibold text-[#fff7df] disabled:opacity-40"
              :disabled="saving || spendAmount(resource) <= 1"
              @click.stop="nudgeSpendAmount(resource, -1)"
            >
              −
            </button>

            <input
              :value="spendAmount(resource)"
              type="number"
              inputmode="numeric"
              min="1"
              :max="resource.max"
              class="w-full rounded-none border border-[rgba(201,164,90,0.22)] bg-[rgba(2,8,14,0.72)] px-3 py-2 text-center text-sm font-semibold text-white outline-none focus:border-[#d6b56d]"
              @input="setSpendAmount(resource, ($event.target as HTMLInputElement).value)"
            >

            <button
              type="button"
              class="rounded-none border border-[rgba(201,164,90,0.22)] bg-[rgba(20,17,12,0.72)] px-3 py-2 text-center text-sm font-semibold text-[#fff7df] disabled:opacity-40"
              :disabled="saving || spendAmount(resource) >= resource.max"
              @click.stop="nudgeSpendAmount(resource, 1)"
            >
              +
            </button>
          </div>
        </div>

        <div class="mt-3 rounded-none border border-[rgba(201,164,90,0.14)] bg-[rgba(9,17,26,0.42)] p-2 text-xs">
          <div class="uppercase tracking-[0.18em] text-[#9f9278]">Reset</div>
          <div class="mt-1 font-semibold text-white">{{ resource.reset || 'Long Rest' }}</div>
        </div>

        <p
          v-if="resource.description"
          class="mt-3 text-xs leading-5 text-[#d8ceb8]"
        >
          {{ resource.description }}
        </p>

        <div
          v-if="resource.options?.length"
          class="mt-3 space-y-2"
        >
          <div class="text-xs uppercase tracking-[0.22em] text-[#9f9278]">
            Available Options
          </div>

          <div
            v-for="option in resource.options"
            :key="option.id || optionTitle(option)"
            class="rounded-none border border-[rgba(201,164,90,0.16)] bg-[rgba(20,17,12,0.48)] p-3"
          >
            <div class="flex items-start justify-between gap-2">
              <div class="font-semibold text-[#fff7df]">{{ optionTitle(option) }}</div>
              <span
                v-if="option.activation"
                class="shrink-0 rounded-none border border-[rgba(201,164,90,0.18)] bg-[rgba(201,164,90,0.08)] px-2 py-1 text-[10px] uppercase tracking-[0.14em] text-[#e9d8aa]"
              >
                {{ option.activation }}
              </span>
            </div>

            <p
              v-if="optionSummary(option)"
              class="mt-2 text-xs leading-5 text-[#d8ceb8]"
            >
              {{ optionSummary(option) }}
            </p>
          </div>
        </div>

        <div
          class="mt-3 grid gap-2"
          :class="resource.mode === 'pool' ? 'grid-cols-2' : 'grid-cols-3'"
        >
          <button
            type="button"
            class="rounded-none border border-[rgba(201,164,90,0.24)] bg-[rgba(201,164,90,0.10)] px-3 py-2 text-center text-xs font-semibold text-[#fff7df] disabled:opacity-40"
            :disabled="saving || remainingCount(resource) <= 0"
            @click.stop="useResource(resource)"
          >
            {{ resource.mode === 'pool' ? `Use ${spendAmount(resource)} ${resource.unit || 'HP'}` : 'Use' }}
          </button>

          <button
            type="button"
            class="rounded-none border border-[rgba(201,164,90,0.22)] bg-[rgba(20,17,12,0.72)] px-3 py-2 text-center text-xs font-semibold text-[#fff7df] disabled:opacity-40"
            :disabled="saving || usedCount(resource) <= 0"
            @click.stop="resource.mode === 'pool' ? restoreResource(resource) : undoResource(resource)"
          >
            {{ resource.mode === 'pool' ? `Restore ${spendAmount(resource)} ${resource.unit || 'HP'}` : 'Undo' }}
          </button>

          <button
            type="button"
            class="rounded-none border border-[rgba(201,164,90,0.22)] bg-[rgba(20,17,12,0.72)] px-3 py-2 text-center text-xs font-semibold text-[#fff7df] disabled:opacity-40"
            :class="resource.mode === 'pool' ? 'col-span-2' : ''"
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
