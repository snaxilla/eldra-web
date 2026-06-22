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
const selectedFeatureForDrawer = ref<any | null>(null)

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

function normalizedKey(value: any) {
  return cleanText(value)
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

function shortText(value: any, limit = 280) {
  const text = cleanText(value)
  if (!text) return ''
  return text.length > limit ? `${text.slice(0, limit).trim()}...` : text
}

function numberValue(value: any, fallback = 0) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

function characterLevel() {
  return Math.max(1, Math.min(20, Math.floor(numberValue(props.level, 1))))
}

function classNameText() {
  return cleanText(props.classEntity?.title || props.classEntity?.name || '')
}

function fallbackSubclassUnlockLevel() {
  const key = normalizedKey(classNameText())

  if (key.includes('cleric')) return 1
  if (key.includes('sorcerer')) return 1
  if (key.includes('warlock')) return 1
  if (key.includes('druid')) return 2
  if (key.includes('wizard')) return 2

  return 3
}

const subclassOptionsUrl = computed(() => {
  if (!props.worldId || !props.classEntity?.id) return ''

  const params = new URLSearchParams()
  params.set('classEntityId', String(props.classEntity.id))
  params.set('className', classNameText())

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
    .map((option: any) => {
      const unlockLevel = Math.max(1, Math.min(20, Math.floor(numberValue(
        option.unlockLevel ?? option.unlock_level ?? option.level,
        fallbackSubclassUnlockLevel()
      ))))

      const features = asArray(option.features)
        .map((feature: any) => ({
          name: cleanText(feature.name || feature.title || 'Subclass Feature'),
          level: Number(feature.level || 0) || unlockLevel,
          source: cleanText(feature.source || option.source || option.sourceBook || ''),
          page: cleanText(feature.page || ''),
          summary: shortText(feature.summary || feature.detail || feature.description || '', 360),
          detail: cleanText(feature.detail || feature.summary || feature.description || '')
        }))
        .filter((feature: any) => feature.name)

      return {
        ...option,
        id: String(option.id || option.value || '').trim(),
        title: cleanText(option.title || option.name || option.label || ''),
        source: cleanText(option.source || option.sourceBook || ''),
        page: cleanText(option.page || option.sourcePage || ''),
        summary: cleanText(option.summary || option.description || option.detail || ''),
        detail: cleanText(option.detail || option.summary || option.description || ''),
        unlockLevel,
        features
      }
    })
    .filter((option: any) => option.id && option.title)
    .sort((a: any, b: any) =>
      Number(a.unlockLevel || 99) - Number(b.unlockLevel || 99) ||
      String(a.title || '').localeCompare(String(b.title || ''))
    )
)

const subclassUnlockLevel = computed(() => {
  const levels = subclassOptions.value
    .map((option: any) => Number(option.unlockLevel || 0))
    .filter((level: number) => Number.isFinite(level) && level > 0)

  return levels.length ? Math.min(...levels) : fallbackSubclassUnlockLevel()
})

const shouldChooseSubclass = computed(() =>
  Boolean(props.classEntity?.id) &&
  characterLevel() >= subclassUnlockLevel.value
)

const selectedSubclass = computed(() =>
  subclassOptions.value.find((option: any) => String(option.id) === String(selectedSubclassId.value)) || null
)

const selectedSubclassFeatures = computed(() => {
  const selected = selectedSubclass.value
  if (!selected) return []

  if (selected.features?.length) return selected.features

  const summary = cleanText(selected.summary || selected.detail)
  if (!summary) return []

  return [{
    name: `${selected.title} Overview`,
    level: selected.unlockLevel || subclassUnlockLevel.value,
    source: selected.source,
    page: selected.page,
    summary: shortText(summary, 360),
    detail: selected.detail || summary
  }]
})

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
        subclassUnlockLevel: selected.unlockLevel || subclassUnlockLevel.value,
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
    selectedFeatureForDrawer.value = null
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

function featureLevelLabel(feature: any) {
  return feature?.level ? `Level ${feature.level}` : 'Feature'
}

function openFeatureDrawer(feature: any) {
  selectedFeatureForDrawer.value = feature
}

function closeFeatureDrawer() {
  selectedFeatureForDrawer.value = null
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
          {{ classNameText() || 'Class' }} Subclass
        </div>
        <div class="mt-1 text-xs leading-5 text-[#9f9278]">
          This class chooses a subclass at level {{ subclassUnlockLevel }}.
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
      No imported or source subclass options found for this class yet.
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
          {{ option.title }} · Level {{ option.unlockLevel }}{{ sourceLabel(option) ? ` · ${sourceLabel(option)}` : '' }}
        </option>
      </select>
    </label>

    <div
      v-if="selectedSubclass && selectedSubclassFeatures.length"
      class="mt-3 rounded-none border border-[rgba(201,164,90,0.18)] bg-[rgba(20,17,12,0.42)] p-3"
    >
      <div class="text-[10px] uppercase tracking-[0.24em] text-[#9f9278]">What This Subclass Does</div>

      <div class="mt-2 grid gap-2">
        <article
          v-for="feature in selectedSubclassFeatures"
          :key="`${feature.name}-${feature.level || 'feature'}`"
          role="button"
          tabindex="0"
          class="cursor-pointer rounded-none border border-[rgba(65,82,103,0.50)] bg-[rgba(8,17,27,0.52)] p-2 text-xs leading-5 transition hover:border-[rgba(201,164,90,0.45)] hover:bg-[rgba(201,164,90,0.08)]"
          @click="openFeatureDrawer(feature)"
          @keydown.enter.prevent="openFeatureDrawer(feature)"
          @keydown.space.prevent="openFeatureDrawer(feature)"
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

          <div class="mt-2 text-[10px] uppercase tracking-[0.16em] text-[#c9a45a]">
            Click for full details
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

    <Transition
      enter-from-class="opacity-0"
      enter-active-class="transition duration-150"
      leave-to-class="opacity-0"
      leave-active-class="transition duration-150"
    >
      <div
        v-if="selectedFeatureForDrawer"
        class="fixed inset-0 z-[260] flex items-center justify-center bg-black/72 p-4 backdrop-blur-sm"
        @click.self="closeFeatureDrawer"
      >
        <aside class="eldra-ornate-panel eldra-frame-corners max-h-[86dvh] w-full max-w-2xl overflow-y-auto rounded-none border p-5">
          <div class="flex items-start justify-between gap-3">
            <div>
              <div class="text-xs uppercase tracking-[0.3em] text-[#9f9278]">Subclass Feature</div>
              <h2 class="mt-2 text-2xl font-semibold text-white">{{ selectedFeatureForDrawer.name }}</h2>
              <div class="mt-1 text-xs text-[#9f9278]">
                {{ featureLevelLabel(selectedFeatureForDrawer) }}
              </div>
            </div>

            <button
              type="button"
              class="rounded-none border border-[rgba(201,164,90,0.24)] bg-[rgba(20,17,12,0.72)] p-2 text-[#b5a88d] transition hover:bg-[rgba(201,164,90,0.10)] hover:text-[#fff7df]"
              @click="closeFeatureDrawer"
            >
              <UIcon name="i-lucide-x" class="h-4 w-4" />
            </button>
          </div>

          <div class="mt-5 whitespace-pre-line text-sm leading-7 text-[#d8ceb8]">
            {{ selectedFeatureForDrawer.detail || selectedFeatureForDrawer.summary || 'No feature text found.' }}
          </div>
        </aside>
      </div>
    </Transition>
  </div>
</template>
