<script setup lang="ts">
import WorldMentionText from '~/components/world/WorldMentionText.vue'
const props = withDefaults(defineProps<{
  open: boolean
  entity: any | null
  worldId?: string | number
  mode?: 'play' | 'build'
  allowBuildActions?: boolean
  readMoreLabel?: string
}>(), {
  mode: 'play',
  allowBuildActions: false,
  readMoreLabel: 'Read More'
})

const route = useRoute()

const emit = defineEmits<{
  close: []
  readMore: [entity: any]
  openMap: [entity: any]
  openMention: [mention: any]
}>()

const nestedContextEntity = ref<any | null>(null)
const contextHistory = ref<any[]>([])

const activeEntity = computed(() => nestedContextEntity.value || props.entity)

const canGoBack = computed(() => contextHistory.value.length > 0)

watch(
  () => props.entity,
  () => {
    nestedContextEntity.value = null
    contextHistory.value = []
  }
)

watch(
  () => props.open,
  (open) => {
    if (!open) {
      nestedContextEntity.value = null
      contextHistory.value = []
    }
  }
)

const drawerWorldId = computed(() =>
  String(props.worldId || route.params.id || activeEntity.value?.worldId || activeEntity.value?.world_id || '').trim()
)

function titleCase(value: any) {
  return String(value || '')
    .replace(/_/g, ' ')
    .replace(/-/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (letter) => letter.toUpperCase())
}

const entityTitle = computed(() =>
  String(activeEntity.value?.title || activeEntity.value?.name || activeEntity.value?.label || 'Linked Context')
)

const rawEntityType = computed(() =>
  String(
    activeEntity.value?.entityType ||
    activeEntity.value?.entity_type ||
    activeEntity.value?.type ||
    activeEntity.value?.kind ||
    'Entity'
  ).trim()
)

const displayType = computed(() =>
  String(
    activeEntity.value?.displayType ||
    activeEntity.value?.display_type ||
    activeEntity.value?.subtype ||
    activeEntity.value?.subType ||
    activeEntity.value?.locationType ||
    activeEntity.value?.location_type ||
    rawEntityType.value ||
    'Entity'
  ).trim()
)

const entitySummary = computed(() =>
  String(
    activeEntity.value?.summary ||
    activeEntity.value?.description ||
    activeEntity.value?.detail ||
    activeEntity.value?.markdown ||
    ''
  ).trim()
)

const entityImageUrl = computed(() =>
  String(activeEntity.value?.imageUrl || activeEntity.value?.image_url || activeEntity.value?.image || '').trim()
)

const entityUrl = computed(() =>
  String(activeEntity.value?.url || activeEntity.value?.articleUrl || activeEntity.value?.article_url || '').trim()
)

const entityTags = computed(() => {
  const raw = activeEntity.value?.tags || activeEntity.value?.keywords || []
  if (Array.isArray(raw)) return raw.map((tag: any) => String(tag || '').trim()).filter(Boolean)
  return []
})

const isResolved = computed(() => activeEntity.value?.resolved !== false)

const eyebrowLabel = computed(() =>
  isResolved.value ? (titleCase(displayType.value) || 'Entity') : 'Unresolved'
)

const detailHeading = computed(() => {
  const base = titleCase(rawEntityType.value || 'Entity')
  return `${base || 'Entity'} Details`
})

const detailLines = computed(() => {
  if (!isResolved.value) return []

  const provided = activeEntity.value?.detailLines || activeEntity.value?.detail_lines
  if (Array.isArray(provided)) {
    const lines = provided.map((line: any) => String(line || '').trim()).filter(Boolean)
    if (lines.length) return lines
  }

  const lines: string[] = []
  const type = titleCase(displayType.value || rawEntityType.value || 'Entity')

  if (type) lines.push(`Type: ${type}`)

  return lines
})

const chipTags = computed(() => {
  const tags = [...entityTags.value]

  if (entityUrl.value && !tags.some((tag) => tag.toLowerCase() === 'linked article')) {
    tags.push('Linked Article')
  }

  if (!tags.length && isResolved.value) tags.push('Entity')

  return Array.from(new Set(tags.filter(Boolean)))
})

const destinationMapTitle = computed(() =>
  String(activeEntity.value?.destinationMapTitle || activeEntity.value?.destination_map_title || '').trim()
)

const destinationMapUrl = computed(() =>
  String(activeEntity.value?.destinationMapUrl || activeEntity.value?.destination_map_url || '').trim()
)

function openDestinationMap() {
  emit('openMap', activeEntity.value)
}

function close() {
  nestedContextEntity.value = null
  contextHistory.value = []
  emit('close')
}

function goBackContext() {
  const previous = contextHistory.value.pop()
  nestedContextEntity.value = previous || null
}

const imageLightboxOpen = ref(false)

function openImageLightbox() {
  if (!entityImageUrl.value) return
  imageLightboxOpen.value = true
}

function closeImageLightbox() {
  imageLightboxOpen.value = false
}

function onLightboxKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') closeImageLightbox()
}

watch(imageLightboxOpen, (open) => {
  if (!import.meta.client) return

  if (open) {
    window.addEventListener('keydown', onLightboxKeydown)
  } else {
    window.removeEventListener('keydown', onLightboxKeydown)
  }
})

onBeforeUnmount(() => {
  if (!import.meta.client) return
  window.removeEventListener('keydown', onLightboxKeydown)
})

function openNestedMention(mention: any) {
  const current = activeEntity.value

  if (current) {
    contextHistory.value.push(current)
  }

  nestedContextEntity.value = mention || null
  emit('openMention', mention)
}

function readMore() {
  if (entityUrl.value) return
  emit('readMore', activeEntity.value)
}
</script>

<template>
  <Transition
    enter-from-class="translate-x-full opacity-0"
    enter-active-class="transition duration-200"
    leave-to-class="translate-x-full opacity-0"
    leave-active-class="transition duration-200"
  >
    <div
      v-if="open"
      class="eldra-ornate-panel eldra-frame-corners fixed right-0 top-0 z-30 h-full w-[380px] border-l backdrop-blur"
    >
      <div class="flex h-full flex-col">
        <div class="flex items-start justify-between gap-3 border-b border-[rgba(201,164,90,0.22)] px-5 py-4">
          <div class="min-w-0">
            <button
              v-if="canGoBack"
              type="button"
              class="mb-3 inline-flex items-center gap-1 text-xs uppercase tracking-[0.24em] text-[#9f9278] transition hover:text-white"
              @click="goBackContext"
            >
              <UIcon name="i-lucide-arrow-left" class="h-4 w-4" />
              Back
            </button>

            <div class="text-xs uppercase tracking-[0.35em] text-[#9f9278]">
              {{ eyebrowLabel }}
            </div>

            <div class="mt-1 break-words text-xl font-semibold text-white">
              {{ entityTitle }}
            </div>
          </div>

          <button
            class="shrink-0 text-[#9f9278] transition hover:text-white"
            type="button"
            @click="close"
          >
            <UIcon name="i-lucide-x" class="h-5 w-5" />
          </button>
        </div>

        <div class="flex-1 overflow-y-auto p-5">
          <button
            v-if="entityImageUrl"
            type="button"
            class="eldra-image-frame group mb-5 block w-full overflow-hidden rounded-none border bg-black/20 text-left transition hover:brightness-110"
            title="View image"
            @click="openImageLightbox"
          >
            <img
              :src="entityImageUrl"
              :alt="entityTitle"
              class="h-56 w-full object-cover"
            >

            <div class="border-t border-[rgba(201,164,90,0.18)] bg-[rgba(5,5,5,0.62)] px-3 py-2 text-[10px] uppercase tracking-[0.26em] text-[#9f9278] transition group-hover:text-[#f5e7bd]">
              Click to view image
            </div>
          </button>

          <div
            v-if="detailLines.length"
            class="eldra-codex-soft mt-5 rounded-none p-4"
          >
            <div class="text-xs uppercase tracking-[0.3em] text-[#9f9278]">
              {{ detailHeading }}
            </div>

            <div class="mt-3 grid gap-2 text-sm leading-6 text-[#d8ceb8]">
              <div
                v-for="line in detailLines"
                :key="line"
                class="rounded-none border border-[rgba(201,164,90,0.18)] bg-[rgba(20,17,12,0.52)] px-3 py-2"
              >
                {{ line }}
              </div>
            </div>
          </div>

          <div class="eldra-codex-soft mt-5 rounded-none p-4">
            <div class="text-xs uppercase tracking-[0.3em] text-[#9f9278]">
              Summary
            </div>

            <WorldMentionText
              v-if="entitySummary"
              :world-id="drawerWorldId || 0"
              :markdown="entitySummary"
              class="mt-3 text-sm leading-7 text-[#d8ceb8]"
              @open-mention="openNestedMention"
            />

            <p
              v-else-if="entitySummary"
              class="mt-3 whitespace-pre-wrap text-sm leading-7 text-[#d8ceb8]"
            >
              {{ entitySummary }}
            </p>

            <p
              v-else
              class="mt-3 text-sm leading-7 text-[#9f9278]"
            >
              {{ isResolved ? 'No summary yet.' : 'No matching world entity was found for this mention.' }}
            </p>
          </div>

          <div class="mt-6 flex flex-wrap gap-2">
            <div
              v-for="tag in chipTags"
              :key="tag"
              class="eldra-gold-chip rounded-none border px-3 py-1 text-xs"
            >
              {{ tag }}
            </div>

            <div
              v-if="!isResolved"
              class="eldra-gold-chip rounded-none border px-3 py-1 text-xs"
            >
              Unresolved
            </div>
          </div>

          <div
            v-if="destinationMapTitle"
            class="eldra-codex-soft mt-5 rounded-none p-4"
          >
            <div class="text-xs uppercase tracking-[0.3em] text-[#9f9278]">
              Destination Map
            </div>
            <div class="mt-2 text-sm font-medium text-white">
              {{ destinationMapTitle }}
            </div>
          </div>

          <div
            v-if="allowBuildActions && mode === 'build'"
            class="eldra-codex-soft mt-5 rounded-none p-4"
          >
            <div class="text-xs uppercase tracking-[0.3em] text-[#9f9278]">
              Build Mode
            </div>
            <div class="mt-3 text-sm leading-7 text-[#d8ceb8]">
              Build controls are provided by the host page. This shared context drawer only handles the quick-glance entity summary.
            </div>
          </div>
        </div>

        <div
          v-if="isResolved && (entityUrl || !entityUrl)"
          class="border-t border-[rgba(201,164,90,0.22)] p-5"
        >
          <div class="flex gap-3">
            <NuxtLink
              v-if="entityUrl"
              :to="entityUrl"
              class="eldra-button flex-1 rounded-none px-4 py-3 text-center text-sm font-medium"
            >
              {{ readMoreLabel }}
            </NuxtLink>

            <button
              v-else
              type="button"
              class="eldra-button flex-1 rounded-none px-4 py-3 text-center text-sm font-medium"
              @click="readMore"
            >
              {{ readMoreLabel }}
            </button>

            <NuxtLink
              v-if="destinationMapUrl"
              :to="destinationMapUrl"
              class="eldra-button flex-1 rounded-none px-4 py-3 text-center text-sm font-medium"
            >
              Open Map
            </NuxtLink>

            <button
              v-else-if="destinationMapTitle"
              type="button"
              class="eldra-button flex-1 rounded-none px-4 py-3 text-center text-sm font-medium"
              @click="openDestinationMap"
            >
              Open Map
            </button>
          </div>
        </div>
      </div>
    </div>
  </Transition>

  <Teleport to="body">
    <Transition
      enter-from-class="opacity-0"
      enter-active-class="transition duration-150"
      leave-to-class="opacity-0"
      leave-active-class="transition duration-150"
    >
      <div
        v-if="imageLightboxOpen"
        class="fixed inset-0 z-[220] flex items-center justify-center bg-black/88 p-4 backdrop-blur-sm"
        @click.self="closeImageLightbox"
      >
        <button
          type="button"
          class="absolute right-5 top-5 rounded-none border border-[rgba(201,164,90,0.34)] bg-[rgba(20,17,12,0.82)] p-3 text-[#c9a45a] transition hover:bg-[rgba(201,164,90,0.16)] hover:text-[#fff7df]"
          @click="closeImageLightbox"
        >
          <UIcon name="i-lucide-x" class="h-6 w-6" />
        </button>

        <figure class="max-h-[92vh] max-w-[94vw]">
          <img
            :src="entityImageUrl"
            :alt="entityTitle"
            class="max-h-[86vh] max-w-[94vw] rounded-none border border-[rgba(201,164,90,0.38)] object-contain shadow-2xl"
          >

          <figcaption class="mt-3 text-center text-xs uppercase tracking-[0.28em] text-[#c9a45a]">
            {{ entityTitle }}
          </figcaption>
        </figure>
      </div>
    </Transition>
  </Teleport>
</template>
