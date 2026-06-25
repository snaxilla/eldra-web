<script setup lang="ts">
type MediaFile = {
  id: string
  title: string
  filename: string
  type: string
  filesize: number
  uploadedOn: string | null
  modifiedOn?: string | null
  width?: number | null
  height?: number | null
  description?: string
  url: string
}

const props = withDefaults(defineProps<{
  open: boolean
  worldId: string | number
  title?: string
  selectLabel?: string
}>(), {
  title: 'Choose Image',
  selectLabel: 'Select Image'
})

const emit = defineEmits<{
  (e: 'update:open', value: boolean): void
  (e: 'select', file: MediaFile): void
}>()

const search = ref('')
const files = ref<MediaFile[]>([])
const loading = ref(false)
const uploadInput = ref<HTMLInputElement | null>(null)
const uploading = ref(false)
const error = ref('')
const selectedFile = ref<MediaFile | null>(null)

let searchTimer: ReturnType<typeof setTimeout> | null = null

const isOpen = computed({
  get: () => props.open,
  set: (value: boolean) => emit('update:open', value)
})

function close() {
  isOpen.value = false
  selectedFile.value = null
  error.value = ''
}

function cleanText(value: any) {
  return String(value || '').trim()
}

async function loadMedia() {
  const worldId = cleanText(props.worldId)
  if (!worldId) return

  loading.value = true
  error.value = ''

  try {
    const response: any = await $fetch(`/api/worlds/${worldId}/media`, {
      query: {
        search: search.value
      }
    })

    files.value = Array.isArray(response?.files) ? response.files : []
  } catch (err: any) {
    error.value =
      err?.data?.statusMessage ||
      err?.data?.message ||
      err?.message ||
      'Could not load media gallery.'
    files.value = []
  } finally {
    loading.value = false
  }
}

watch(
  () => props.open,
  (value) => {
    if (value) loadMedia()
  },
  { immediate: true }
)

watch(
  () => props.worldId,
  () => {
    if (props.open) loadMedia()
  }
)

watch(search, () => {
  if (!props.open) return

  if (searchTimer) clearTimeout(searchTimer)
  searchTimer = setTimeout(() => loadMedia(), 250)
})

function formatBytes(value: number) {
  const bytes = Number(value || 0)
  if (!bytes) return 'Unknown size'

  const units = ['B', 'KB', 'MB', 'GB']
  let size = bytes
  let index = 0

  while (size >= 1024 && index < units.length - 1) {
    size /= 1024
    index += 1
  }

  return `${size.toFixed(index === 0 ? 0 : 1)} ${units[index]}`
}

function pickFile(file: MediaFile) {
  selectedFile.value = file
}

function selectFile(file: MediaFile | null = selectedFile.value) {
  if (!file) return
  emit('select', file)
  close()
}

async function onUploadSelected(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]

  if (!file) return

  uploading.value = true
  error.value = ''

  try {
    const form = new FormData()
    form.append('file', file)
    form.append('title', file.name)

    const uploaded: any = await $fetch(`/api/worlds/${props.worldId}/media/upload`, {
      method: 'POST',
      body: form
    })

    await loadMedia()

    const uploadedId = cleanText(uploaded?.id)
    const found = uploadedId ? files.value.find((item) => String(item.id) === uploadedId) : null
    selectedFile.value = found || uploaded || null
  } catch (err: any) {
    error.value =
      err?.data?.statusMessage ||
      err?.data?.message ||
      err?.message ||
      'Failed to upload image.'
  } finally {
    uploading.value = false
    if (input) input.value = ''
  }
}

onBeforeUnmount(() => {
  if (searchTimer) clearTimeout(searchTimer)
})
</script>

<template>
  <Teleport to="body">
    <Transition
      enter-from-class="opacity-0"
      enter-active-class="transition duration-150"
      leave-to-class="opacity-0"
      leave-active-class="transition duration-150"
    >
      <div
        v-if="isOpen"
        class="fixed inset-0 z-[9999] bg-[#050505]/88 p-3 backdrop-blur-sm md:p-6"
        @click.self="close"
      >
        <div class="eldra-ornate-panel eldra-frame-corners mx-auto flex h-full max-h-[92vh] max-w-6xl flex-col overflow-hidden rounded-none border bg-[linear-gradient(to_bottom,rgba(16,14,10,0.98),rgba(7,6,4,0.98))] shadow-2xl">
          <header class="flex flex-wrap items-start justify-between gap-4 border-b border-[rgba(201,164,90,0.22)] px-5 py-4">
            <div>
              <div class="text-xs uppercase tracking-[0.35em] text-[#9f9278]">World Media</div>
              <h2 class="mt-1 text-2xl font-semibold text-white">{{ title }}</h2>
              <p class="mt-1 text-sm text-[#9f9278]">
                Pick an existing image or upload a new one.
              </p>
            </div>

            <div class="flex items-center gap-2">
              <input
                ref="uploadInput"
                type="file"
                accept="image/*"
                class="hidden"
                @change="onUploadSelected"
              >

              <button
                type="button"
                class="eldra-button rounded-none px-4 py-2 text-sm disabled:opacity-50"
                :disabled="uploading"
                @click="uploadInput?.click()"
              >
                {{ uploading ? 'Uploading...' : 'Upload' }}
              </button>

              <button
                type="button"
                class="rounded-none border border-[rgba(201,164,90,0.24)] px-3 py-2 text-sm text-[#d8ceb8] transition hover:bg-[rgba(201,164,90,0.10)] hover:text-white"
                @click="close"
              >
                Close
              </button>
            </div>
          </header>

          <div class="grid min-h-0 flex-1 grid-cols-1 md:grid-cols-[minmax(0,1fr)_320px]">
            <main class="min-h-0 overflow-y-auto p-5">
              <div class="mb-4 flex gap-2">
                <input
                  v-model="search"
                  type="search"
                  placeholder="Search images..."
                  class="eldra-input w-full rounded-none px-4 py-3 text-sm"
                >

                <button
                  type="button"
                  class="eldra-button rounded-none px-4 py-3 text-sm"
                  @click="loadMedia"
                >
                  Refresh
                </button>
              </div>

              <div
                v-if="error"
                class="mb-4 rounded-none border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-200"
              >
                {{ error }}
              </div>

              <div
                v-if="loading"
                class="eldra-codex-soft rounded-none border border-[rgba(201,164,90,0.18)] p-8 text-center text-[#d8ceb8]"
              >
                Loading images...
              </div>

              <div
                v-else-if="!files.length"
                class="eldra-codex-soft rounded-none border border-[rgba(201,164,90,0.18)] p-8 text-center"
              >
                <div class="text-lg font-semibold text-white">No images found</div>
                <p class="mt-2 text-sm text-[#9f9278]">Upload an image to use it here.</p>
              </div>

              <div v-else class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                <button
                  v-for="file in files"
                  :key="file.id"
                  type="button"
                  class="group overflow-hidden rounded-none border text-left transition"
                  :class="selectedFile?.id === file.id
                    ? 'border-[rgba(251,191,36,0.8)] bg-[rgba(201,164,90,0.14)]'
                    : 'border-[rgba(201,164,90,0.22)] bg-[rgba(20,17,12,0.62)] hover:border-[rgba(201,164,90,0.48)] hover:bg-[rgba(201,164,90,0.10)]'"
                  @click="pickFile(file)"
                  @dblclick="selectFile(file)"
                >
                  <img
                    :src="file.url"
                    :alt="file.title || file.filename"
                    loading="lazy"
                    class="aspect-[4/3] w-full object-cover transition duration-200 group-hover:scale-[1.02]"
                  >

                  <div class="border-t border-[rgba(201,164,90,0.18)] p-3">
                    <div class="truncate text-sm font-semibold text-[#fff7df]">
                      {{ file.title || file.filename || file.id }}
                    </div>
                    <div class="mt-1 truncate text-xs text-[#9f9278]">
                      {{ file.filename || file.id }}
                    </div>
                  </div>
                </button>
              </div>
            </main>

            <aside class="min-h-0 border-t border-[rgba(201,164,90,0.22)] bg-black/20 p-5 md:border-l md:border-t-0">
              <template v-if="selectedFile">
                <div class="eldra-image-frame overflow-hidden rounded-none border bg-black/20">
                  <img
                    :src="selectedFile.url"
                    :alt="selectedFile.title || selectedFile.filename"
                    class="max-h-72 w-full object-contain"
                  >
                </div>

                <div class="mt-4">
                  <div class="text-lg font-semibold text-[#fff7df]">
                    {{ selectedFile.title || selectedFile.filename }}
                  </div>
                  <div class="mt-1 break-all text-xs text-[#9f9278]">
                    {{ selectedFile.id }}
                  </div>
                </div>

                <div class="mt-4 grid gap-2 text-xs text-[#9f9278]">
                  <div>{{ selectedFile.type || 'image' }}</div>
                  <div>{{ formatBytes(selectedFile.filesize) }}</div>
                  <div v-if="selectedFile.width || selectedFile.height">
                    {{ selectedFile.width || '?' }} × {{ selectedFile.height || '?' }}
                  </div>
                </div>

                <button
                  type="button"
                  class="eldra-button mt-5 w-full rounded-none px-4 py-3 text-sm font-semibold"
                  @click="selectFile()"
                >
                  {{ selectLabel }}
                </button>
              </template>

              <template v-else>
                <div class="eldra-codex-soft rounded-none border border-[rgba(201,164,90,0.18)] p-5 text-sm leading-7 text-[#9f9278]">
                  Select an image to preview it, then insert it into the article.
                  Double-clicking an image inserts it immediately.
                </div>
              </template>
            </aside>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>
