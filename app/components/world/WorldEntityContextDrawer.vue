<script setup lang="ts">
const props = withDefaults(defineProps<{
  open: boolean
  entity: any | null
  mode?: 'play' | 'build'
  allowBuildActions?: boolean
  readMoreLabel?: string
}>(), {
  mode: 'play',
  allowBuildActions: false,
  readMoreLabel: 'Read More'
})

const emit = defineEmits<{
  close: []
  readMore: [entity: any]
}>()

function titleCase(value: any) {
  return String(value || '')
    .replace(/_/g, ' ')
    .replace(/-/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (letter) => letter.toUpperCase())
}

const entityTitle = computed(() =>
  String(props.entity?.title || props.entity?.name || props.entity?.label || 'Linked Context')
)

const rawEntityType = computed(() =>
  String(
    props.entity?.entityType ||
    props.entity?.entity_type ||
    props.entity?.type ||
    props.entity?.kind ||
    'Entity'
  ).trim()
)

const displayType = computed(() =>
  String(
    props.entity?.displayType ||
    props.entity?.display_type ||
    props.entity?.subtype ||
    props.entity?.subType ||
    props.entity?.locationType ||
    props.entity?.location_type ||
    rawEntityType.value ||
    'Entity'
  ).trim()
)

const entitySummary = computed(() =>
  String(
    props.entity?.summary ||
    props.entity?.description ||
    props.entity?.detail ||
    props.entity?.markdown ||
    ''
  ).trim()
)

const entityImageUrl = computed(() =>
  String(props.entity?.imageUrl || props.entity?.image_url || props.entity?.image || '').trim()
)

const entityUrl = computed(() =>
  String(props.entity?.url || props.entity?.articleUrl || props.entity?.article_url || '').trim()
)

const entityTags = computed(() => {
  const raw = props.entity?.tags || props.entity?.keywords || []
  if (Array.isArray(raw)) return raw.map((tag: any) => String(tag || '').trim()).filter(Boolean)
  return []
})

const isResolved = computed(() => props.entity?.resolved !== false)

const eyebrowLabel = computed(() =>
  isResolved.value ? (titleCase(displayType.value) || 'Entity') : 'Unresolved'
)

const detailHeading = computed(() => {
  const base = titleCase(rawEntityType.value || 'Entity')
  return `${base || 'Entity'} Details`
})

const detailLines = computed(() => {
  if (!isResolved.value) return []

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

function close() {
  emit('close')
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

function readMore() {
  if (entityUrl.value) return
  emit('readMore', props.entity)
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
        <div class="flex items-center justify-between border-b border-[rgba(201,164,90,0.22)] px-5 py-4">
          <div>
            <div class="text-xs uppercase tracking-[0.35em] text-[#9f9278]">
              {{ eyebrowLabel }}
            </div>

            <div class="mt-1 text-xl font-semibold text-white">
              {{ entityTitle }}
            </div>
          </div>

          <button
            class="text-[#9f9278] transition hover:text-white"
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

            <p
              v-if="entitySummary"
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
