<script setup lang="ts">
const props = defineProps<{
  worldId: string | number
  classEntity?: any
  level?: number | string
}>()

const emit = defineEmits<{
  (event: 'update:payload', payload: Record<string, any>): void
  (event: 'update:complete', complete: boolean): void
}>()

const selectedSubclassId = ref('')

function asArray(value: any) {
  if (Array.isArray(value)) return value
  if (Array.isArray(value?.data)) return value.data
  if (Array.isArray(value?.items)) return value.items
  if (Array.isArray(value?.options)) return value.options
  return []
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

function characterLevel() {
  const parsed = Number(props.level || 1)
  if (!Number.isFinite(parsed)) return 1
  return Math.max(1, Math.min(20, Math.floor(parsed)))
}

function subclassUnlockLevel() {
  return 3
}

const shouldChooseSubclass = computed(() =>
  Boolean(props.classEntity?.id) &&
  characterLevel() >= subclassUnlockLevel()
)

const subclassOptionsUrl = computed(() => {
  if (!props.worldId || !props.classEntity?.id || !shouldChooseSubclass.value) return ''

  const params = new URLSearchParams()
  params.set('classEntityId', String(props.classEntity.id))
  params.set('className', String(props.classEntity.title || ''))

  return `/api/worlds/${props.worldId}/class-subclass-options?${params.toString()}`
})

const {
  data: subclassOptionPayload,
  pending,
  refresh
} = await useFetch(subclassOptionsUrl, {
  default: () => [],
  watch: [subclassOptionsUrl]
})

const subclassOptions = computed(() =>
  asArray(subclassOptionPayload.value)
    .map((option: any) => ({
      ...option,
      id: String(option.id || option.value || '').trim(),
      title: cleanText(option.title || option.name || option.label || ''),
      source: cleanText(option.source || option.sourceBook || ''),
      page: cleanText(option.page || option.sourcePage || ''),
      summary: cleanText(option.summary || option.description || option.detail || '')
    }))
    .filter((option: any) => option.id && option.title)
)

const selectedSubclass = computed(() =>
  subclassOptions.value.find((option: any) => String(option.id) === String(selectedSubclassId.value)) || null
)

const selectedSubclassFeatures = computed(() =>
  Array.isArray(selectedSubclass.value?.features)
    ? selectedSubclass.value.features
    : []
)

function featureLevelLabel(feature: any) {
  return feature?.level ? `Level ${feature.level}` : 'Feature'
}


const choicesComplete = computed(() =>
  !shouldChooseSubclass.value || Boolean(selectedSubclass.value)
)

const payload = computed(() => {
  const selected = selectedSubclass.value
  if (!selected) return {}

  return {
    'class-subclass': {
      label: 'Class Subclass',
      values: [selected.title],
      value: selected.id,
      valueLabel: selected.title,
      note: 'Chosen in Guided Builder.',
      meta: {
        subclassEntityId: /^\d+$/.test(String(selected.id || '')) ? selected.id : '',
        subclassLookupId: selected.id,
        subclassName: selected.title,
        source: selected.source,
        page: selected.page
      }
    }
  }
})

watch(
  () => [props.classEntity?.id, characterLevel()],
  () => {
    selectedSubclassId.value = ''
  }
)

watch(
  payload,
  (value) => emit('update:payload', value),
  { immediate: true, deep: true }
)

watch(
  choicesComplete,
  (complete) => emit('update:complete', complete),
  { immediate: true }
)

function sourceLabel(option: any) {
  return [
    option.source || '',
    option.page ? `p. ${option.page}` : ''
  ].filter(Boolean).join(' · ')
}
</script>

<template>
  <div
    v-if="shouldChooseSubclass"
    class="rounded-none border border-[rgba(201,164,90,0.22)] bg-[rgba(20,17,12,0.52)] p-3"
  >
    <div class="flex flex-wrap items-start justify-between gap-3">
      <div>
        <div class="text-[10px] uppercase tracking-[0.24em] text-[#9f9278]">Required Class Subclass</div>
        <div class="mt-1 text-sm font-semibold text-white">
          {{ classEntity?.title || 'Class' }} Subclass
        </div>
        <div class="mt-1 text-xs leading-5 text-[#9f9278]">
          Starting at level {{ characterLevel() }} requires a subclass choice.
        </div>
      </div>

      <div
        class="rounded-none border px-2 py-0.5 text-[10px]"
        :class="choicesComplete ? 'border-emerald-400/25 bg-emerald-400/10 text-emerald-100' : 'border-amber-300/25 bg-amber-400/10 text-amber-100'"
      >
        {{ choicesComplete ? 'Complete' : 'Needed' }}
      </div>
    </div>

    <div
      v-if="pending"
      class="mt-3 rounded-none border border-[rgba(201,164,90,0.18)] bg-[rgba(20,17,12,0.42)] p-3 text-xs text-[#9f9278]"
    >
      Loading subclass options...
    </div>

    <div
      v-else-if="!subclassOptions.length"
      class="mt-3 rounded-none border border-amber-300/20 bg-amber-400/10 p-3 text-xs leading-5 text-amber-100"
    >
      No imported subclass options found for this class yet.
      <button
        type="button"
        class="underline decoration-amber-200/40 underline-offset-4"
        @click="refresh"
      >
        Refresh
      </button>
    </div>

    <label v-else class="mt-3 block">
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
          {{ option.title }}{{ sourceLabel(option) ? ` · ${sourceLabel(option)}` : '' }}
        </option>
      </select>
    </label>

    <div
      v-if="selectedSubclass?.summary"
      class="mt-3 rounded-none border border-[rgba(65,82,103,0.50)] bg-[rgba(8,17,27,0.52)] p-3 text-xs leading-5 text-[#d8ceb8]"
    >
      <div class="mb-1 text-[10px] uppercase tracking-[0.22em] text-[#9f9278]">Subclass Summary</div>
      {{ selectedSubclass.summary }}
    </div>

    <div
      v-if="selectedSubclassFeatures.length"
      class="mt-3 rounded-none border border-[rgba(201,164,90,0.18)] bg-[rgba(20,17,12,0.42)] p-3"
    >
      <div class="text-[10px] uppercase tracking-[0.24em] text-[#9f9278]">What This Subclass Does</div>

      <div class="mt-2 grid gap-2">
        <article
          v-for="feature in selectedSubclassFeatures"
          :key="`${feature.name}-${feature.level || 'feature'}`"
          class="rounded-none border border-[rgba(65,82,103,0.50)] bg-[rgba(8,17,27,0.52)] p-2 text-xs leading-5"
        >
          <div class="flex flex-wrap items-center justify-between gap-2">
            <div class="font-semibold text-white">{{ feature.name }}</div>
            <div class="rounded-none border border-[rgba(201,164,90,0.18)] bg-[rgba(201,164,90,0.08)] px-2 py-0.5 text-[10px] uppercase tracking-[0.16em] text-[#f5e7bd]">
              {{ featureLevelLabel(feature) }}
            </div>
          </div>

          <p v-if="feature.summary" class="mt-1 text-[#d8ceb8]">
            {{ feature.summary }}
          </p>

          <div v-if="feature.source || feature.page" class="mt-1 text-[10px] text-[#9f9278]">
            {{ [feature.source, feature.page ? `p. ${feature.page}` : ''].filter(Boolean).join(' · ') }}
          </div>
        </article>
      </div>
    </div>

    <div
      v-if="Object.keys(payload).length"
      class="mt-3 rounded-none border border-[rgba(201,164,90,0.18)] bg-[rgba(20,17,12,0.42)] p-3"
    >
      <div class="text-[10px] uppercase tracking-[0.24em] text-[#9f9278]">Subclass Builder Benefit</div>
      <div class="mt-2 rounded-none border border-[rgba(65,82,103,0.50)] bg-[rgba(8,17,27,0.52)] p-2 text-xs leading-5">
        <span class="font-semibold text-white">{{ payload['class-subclass'].label }}:</span>
        <span class="text-[#d8ceb8]"> {{ payload['class-subclass'].values.join(', ') }}</span>
      </div>
    </div>
  </div>
</template>
