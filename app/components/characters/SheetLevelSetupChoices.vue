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
const selectedFeatureForDrawer = ref<any | null>(null)
const saving = ref(false)
const saveError = ref('')
const saveSuccess = ref('')

function asArray(value: any) {
  if (Array.isArray(value)) return value
  if (Array.isArray(value?.data)) return value.data
  if (Array.isArray(value?.items)) return value.items
  if (Array.isArray(value?.options)) return value.options
  if (Array.isArray(value?.subclasses)) return value.subclasses
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

function sheetLevel() {
  return Math.max(1, Math.min(20, Math.floor(numberValue(props.level || props.sheet?.level, 1))))
}

function classNameText() {
  return cleanText(props.sheet?.class_name || props.sheet?.className || '')
}

function classEntityId() {
  return String(props.sheet?.class_entity_id || props.sheet?.classEntityId || '').trim()
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

function hasClass() {
  return Boolean(classEntityId() || classNameText())
}

function hasSubclass() {
  return Boolean(
    props.sheet?.subclass_entity_id ||
    props.sheet?.subclassEntityId ||
    cleanText(props.sheet?.subclass_name || props.sheet?.subclassName)
  )
}

const subclassOptionsUrl = computed(() => {
  if (!props.worldId || !hasClass()) return ''

  const params = new URLSearchParams()
  if (classEntityId()) params.set('classEntityId', classEntityId())
  if (classNameText()) params.set('className', classNameText())

  return `/api/worlds/${props.worldId}/class-subclass-options?${params.toString()}`
})

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

const needsSubclassChoice = computed(() =>
  hasClass() &&
  !hasSubclass() &&
  sheetLevel() >= subclassUnlockLevel.value
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

function featureLevelLabel(feature: any) {
  return feature?.level ? `Level ${feature.level}` : 'Feature'
}

function openFeatureDrawer(feature: any) {
  selectedFeatureForDrawer.value = feature
}

function closeFeatureDrawer() {
  selectedFeatureForDrawer.value = null
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
        subclassEntityId: /^\d+$/.test(String(option.id || '')) ? option.id : null
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
            {{ classNameText() || 'This class' }} chooses a subclass at level {{ subclassUnlockLevel }}.
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
        No imported or source subclass options were found for this class yet.
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
              {{ option.title }} · Level {{ option.unlockLevel }}{{ optionSourceLabel(option) ? ` · ${optionSourceLabel(option)}` : '' }}
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
        v-if="saveError || saveSuccess"
        class="mt-3 rounded-none border px-3 py-2 text-xs"
        :class="saveError
          ? 'border-red-400/24 bg-red-500/10 text-red-100'
          : 'border-emerald-400/24 bg-emerald-500/10 text-emerald-100'"
      >
        {{ saveError || saveSuccess }}
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
