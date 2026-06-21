<script setup lang="ts">
const props = defineProps<{
  worldId: string | number
  entityId: string | number
  sheet?: any
  level?: number | string
}>()

const emit = defineEmits<{
  (event: 'saved', payload: any): void
}>()

const selectedSubclassId = ref('')
const saving = ref(false)
const saveError = ref('')
const saveSuccess = ref('')

function asObject(value: any) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {}
}

function asArray(value: any) {
  if (Array.isArray(value)) return value
  if (Array.isArray(value?.data)) return value.data
  if (Array.isArray(value?.items)) return value.items
  if (Array.isArray(value?.options)) return value.options
  if (Array.isArray(value?.subclasses)) return value.subclasses
  return []
}

function numberValue(value: any, fallback = 0) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

function cleanText(value: any) {
  return String(value ?? '')
    .replace(/\{@(?:class|subclass|classFeature|subclassFeature|feat|spell|item|filter|book|action|race|species)\s+([^|}]+)(?:\|[^}]*)?\}/gi, '$1')
    .replace(/\{@(?:i|b|dice|damage|hit|dc|scaledice|scaledamage)\s+([^}]+)\}/gi, '$1')
    .replace(/\{@[^}]+\}/g, '')
    .replace(/[#*_`]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function sheetLevel() {
  return Math.max(1, Math.min(20, Math.floor(numberValue(props.level || props.sheet?.level, 1))))
}

function hasClass() {
  return Boolean(
    props.sheet?.class_entity_id ||
    props.sheet?.classEntityId ||
    props.sheet?.class_name ||
    props.sheet?.className
  )
}

function hasSubclass() {
  return Boolean(
    props.sheet?.subclass_entity_id ||
    props.sheet?.subclassEntityId ||
    cleanText(props.sheet?.subclass_name || props.sheet?.subclassName)
  )
}

function subclassUnlockLevel() {
  // 2024 classes generally select subclass at level 3.
  // Older/homebrew exceptions can be made data-driven in the next pass.
  return 3
}

const needsSubclassChoice = computed(() =>
  hasClass() &&
  !hasSubclass() &&
  sheetLevel() >= subclassUnlockLevel()
)

const subclassOptionsUrl = computed(() =>
  props.worldId && props.entityId && needsSubclassChoice.value
    ? `/api/worlds/${props.worldId}/entities/${props.entityId}/sheet/subclass-options`
    : ''
)

const {
  data: subclassOptionPayload,
  pending: subclassOptionsPending,
  refresh: refreshSubclassOptions
} = await useFetch(subclassOptionsUrl, {
  default: () => [],
  watch: [subclassOptionsUrl]
})

const subclassOptions = computed(() =>
  asArray(subclassOptionPayload.value)
    .map((option: any) => {
      const id = String(option?.id ?? option?.value ?? option?.entity_id ?? option?.entityId ?? '').trim()
      const title = cleanText(
        option?.title ??
        option?.label ??
        option?.name ??
        option?.subclassName ??
        option?.subclass_name ??
        ''
      )

      return {
        ...option,
        id,
        value: id,
        title,
        label: title,
        source: cleanText(option?.source || option?.sourceBook || option?.source_book || ''),
        page: cleanText(option?.page || option?.sourcePage || option?.source_page || ''),
        summary: cleanText(option?.summary || option?.description || option?.detail || '')
      }
    })
    .filter((option: any) => option.id && option.title)
    .sort((a: any, b: any) => String(a.title || '').localeCompare(String(b.title || '')))
)

const selectedSubclass = computed(() =>
  subclassOptions.value.find((option: any) => String(option.id) === String(selectedSubclassId.value)) || null
)

watch(
  subclassOptions,
  (options) => {
    if (!options.length) {
      selectedSubclassId.value = ''
      return
    }

    if (!options.some((option: any) => String(option.id) === String(selectedSubclassId.value))) {
      selectedSubclassId.value = ''
    }
  },
  { immediate: true }
)

function optionSourceLabel(option: any) {
  return [
    option?.source || '',
    option?.page ? `p. ${option.page}` : ''
  ].filter(Boolean).join(' · ')
}

async function saveSubclassChoice() {
  const option = selectedSubclass.value
  if (!option || saving.value) return

  saving.value = true
  saveError.value = ''
  saveSuccess.value = ''

  try {
    const saved = await $fetch(`/api/worlds/${props.worldId}/entities/${props.entityId}/sheet`, {
      method: 'PATCH',
      body: {
        subclassName: option.title,
        subclassEntityId: option.id
      }
    })

    saveSuccess.value = `${option.title} saved.`
    emit('saved', saved)
  } catch (error: any) {
    saveError.value =
      error?.data?.statusMessage ||
      error?.data?.message ||
      error?.statusMessage ||
      error?.message ||
      'Failed to save subclass choice.'
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <div
    v-if="needsSubclassChoice"
    class="eldra-codex-soft rounded-none p-4"
  >
    <div class="flex flex-wrap items-start justify-between gap-3">
      <div>
        <div class="text-xs uppercase tracking-[0.3em] text-[#9f9278]">Level Setup Choices</div>
        <div class="mt-1 text-sm text-[#d8ceb8]">
          This character has reached level {{ sheetLevel() }} and needs setup choices resolved.
        </div>
      </div>

      <div class="eldra-gold-chip rounded-none border px-3 py-1 text-xs">
        1 Choice
      </div>
    </div>

    <div class="mt-4 rounded-none border border-[rgba(65,82,103,0.62)] bg-[rgba(8,17,27,0.68)] p-3">
      <div class="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div class="font-semibold text-white">Choose Subclass</div>
          <div class="mt-1 text-xs leading-5 text-[#9f9278]">
            Subclass selection unlocks at level {{ subclassUnlockLevel() }}.
          </div>
        </div>

        <span class="rounded-none border border-amber-300/24 bg-amber-400/10 px-2 py-1 text-[10px] uppercase tracking-[0.16em] text-amber-100">
          Required
        </span>
      </div>

      <div
        v-if="subclassOptionsPending"
        class="mt-3 rounded-none border border-[rgba(201,164,90,0.18)] bg-[rgba(20,17,12,0.42)] p-3 text-sm text-[#9f9278]"
      >
        Loading subclass options...
      </div>

      <div
        v-else-if="!subclassOptions.length"
        class="mt-3 rounded-none border border-amber-300/20 bg-amber-400/10 p-3 text-sm leading-6 text-amber-100"
      >
        No imported subclass options were found for this class yet.
        <button
          type="button"
          class="ml-1 underline decoration-amber-200/40 underline-offset-4"
          @click="refreshSubclassOptions"
        >
          Refresh
        </button>
      </div>

      <div v-else class="mt-3 grid gap-3 md:grid-cols-[minmax(0,1fr)_auto] md:items-end">
        <label class="block">
          <span class="mb-1 block text-xs uppercase tracking-[0.18em] text-[#9f9278]">Subclass</span>
          <select
            v-model="selectedSubclassId"
            class="eldra-input w-full rounded-none px-3 py-2 text-sm text-white"
          >
            <option value="" class="bg-[#090909] text-[#f5e7bd]">Choose...</option>
            <option
              v-for="option in subclassOptions"
              :key="option.id"
              :value="option.id"
              class="bg-[#090909] text-[#f5e7bd]"
            >
              {{ option.title }}{{ optionSourceLabel(option) ? ` · ${optionSourceLabel(option)}` : '' }}
            </option>
          </select>
        </label>

        <button
          type="button"
          class="rounded-none border border-[rgba(201,164,90,0.24)] bg-[rgba(20,17,12,0.72)] px-4 py-2 text-sm font-semibold text-[#fff7df] transition hover:bg-[rgba(201,164,90,0.10)] disabled:opacity-50"
          :disabled="saving || !selectedSubclass"
          @click="saveSubclassChoice"
        >
          {{ saving ? 'Saving...' : 'Save Subclass' }}
        </button>
      </div>

      <div
        v-if="selectedSubclass?.summary"
        class="mt-3 rounded-none border border-[rgba(201,164,90,0.14)] bg-[rgba(20,17,12,0.42)] p-3 text-xs leading-5 text-[#d8ceb8]"
      >
        {{ selectedSubclass.summary }}
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
  </div>
</template>
