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

const entitySlug = computed(() =>
  String(props.entity?.slug || '').trim()
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
  isResolved.value ? titleCase(displayType.value).toUpperCase() : 'UNRESOLVED'
)

const detailTypeLabel = computed(() =>
  titleCase(displayType.value || rawEntityType.value || 'Entity')
)

function close() {
  emit('close')
}

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
    <aside
      v-if="open"
      class="fixed right-0 top-0 z-40 flex h-full w-[420px] max-w-[100vw] flex-col border-l border-[rgba(201,164,90,0.30)] bg-[linear-gradient(to_bottom,rgba(20,17,12,0.94),rgba(6,5,4,0.92))] shadow-2xl backdrop-blur-xl"
    >
      <header class="border-b border-[rgba(201,164,90,0.20)] px-5 py-5">
        <div class="flex items-start justify-between gap-4">
          <div class="min-w-0">
            <div class="text-xs uppercase tracking-[0.35em] text-[#9f9278]">
              {{ eyebrowLabel }}
            </div>

            <h2 class="mt-3 break-words text-2xl font-semibold leading-tight text-[#fff7df]">
              {{ entityTitle }}
            </h2>

            <div
              v-if="entitySlug"
              class="mt-2 text-xs uppercase tracking-[0.24em] text-[#9f9278]"
            >
              {{ entitySlug }}
            </div>
          </div>

          <button
            type="button"
            class="rounded-none border border-[rgba(201,164,90,0.24)] bg-[rgba(20,17,12,0.62)] p-2 text-[#c9a45a] transition hover:bg-[rgba(201,164,90,0.14)] hover:text-[#fff7df]"
            @click="close"
          >
            <UIcon name="i-lucide-x" class="h-5 w-5" />
          </button>
        </div>
      </header>

      <div class="flex-1 overflow-y-auto p-5">
        <div
          v-if="entityImageUrl"
          class="mb-5 overflow-hidden rounded-none border border-[rgba(201,164,90,0.24)] bg-[rgba(5,5,5,0.52)]"
        >
          <img
            :src="entityImageUrl"
            :alt="entityTitle"
            class="max-h-64 w-full object-cover"
          />
        </div>

        <section
          v-if="isResolved && detailTypeLabel"
          class="mb-5 rounded-none border border-[rgba(201,164,90,0.22)] bg-[rgba(12,10,7,0.58)] p-4"
        >
          <div class="mb-4 text-xs uppercase tracking-[0.30em] text-[#9f9278]">
            {{ titleCase(rawEntityType || 'Entity').toUpperCase() }} Details
          </div>

          <div class="rounded-none border border-[rgba(201,164,90,0.18)] bg-[rgba(5,5,5,0.36)] px-4 py-3 text-sm text-[#f5e7bd]">
            Type: {{ detailTypeLabel }}
          </div>
        </section>

        <section
          class="rounded-none border border-[rgba(201,164,90,0.22)] bg-[rgba(12,10,7,0.58)] p-5"
        >
          <div class="mb-4 text-xs uppercase tracking-[0.30em] text-[#9f9278]">
            Summary
          </div>

          <div class="text-sm leading-7 text-[#f5e7bd]">
            {{ entitySummary || (isResolved ? 'No summary has been written for this entity yet.' : 'No matching world entity was found for this mention.') }}
          </div>
        </section>

        <div
          v-if="entityTags.length"
          class="mt-5 flex flex-wrap gap-2"
        >
          <span
            v-for="tag in entityTags"
            :key="tag"
            class="rounded-none border border-[rgba(201,164,90,0.34)] bg-[rgba(201,164,90,0.14)] px-3 py-1 text-xs font-medium text-[#f5e7bd]"
          >
            {{ tag }}
          </span>
        </div>

        <div class="mt-5 flex flex-wrap gap-2">
          <NuxtLink
            v-if="entityUrl"
            :to="entityUrl"
            class="rounded-none border border-[rgba(201,164,90,0.34)] bg-[rgba(201,164,90,0.12)] px-4 py-2 text-sm font-semibold text-[#f5e7bd] transition hover:bg-[rgba(201,164,90,0.20)]"
          >
            Open Full Article
          </NuxtLink>

          <button
            v-else-if="isResolved"
            type="button"
            class="rounded-none border border-[rgba(201,164,90,0.34)] bg-[rgba(201,164,90,0.12)] px-4 py-2 text-sm font-semibold text-[#f5e7bd] transition hover:bg-[rgba(201,164,90,0.20)]"
            @click="readMore"
          >
            {{ readMoreLabel }}
          </button>
        </div>

        <div
          v-if="allowBuildActions && mode === 'build'"
          class="mt-6 rounded-none border border-[rgba(201,164,90,0.20)] bg-[rgba(12,10,7,0.58)] p-4 text-sm text-[#d8ceb8]"
        >
          Build actions for this context can be injected by the host page. This shared drawer does not create map pins or articles by itself.
        </div>
      </div>

      <footer
        v-if="isResolved && !entityUrl"
        class="border-t border-[rgba(201,164,90,0.20)] p-5"
      >
        <button
          type="button"
          class="w-full rounded-none border border-[rgba(201,164,90,0.34)] bg-[rgba(20,17,12,0.70)] px-4 py-3 text-sm font-semibold text-[#f5e7bd] transition hover:bg-[rgba(201,164,90,0.16)]"
          @click="readMore"
        >
          {{ readMoreLabel }}
        </button>
      </footer>
    </aside>
  </Transition>
</template>
