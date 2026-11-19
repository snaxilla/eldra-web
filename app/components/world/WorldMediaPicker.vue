<script setup lang="ts">
import { buildCardThumbnailUrl } from '~/lib/media/thumbnail-url'
// PAGE BACKGROUND PICKER UX CORRECTION -- this overlay previously had no
// focus management of its own at all, which only became a visible
// problem once it could be opened nested inside another dialog
// (WorldPagePresentationPanel.vue, inside WorldPageCustomizeButton.vue's
// UModal). Reka-UI's UModal traps Tab focus to its OWN content and sets
// `document.body.style.pointerEvents = 'none'` while open (confirmed by
// reading node_modules/reka-ui/dist/FocusScope/FocusScope.js and
// DismissableLayer.js directly, not assumed) -- neither mechanism has
// any way to know a plain Teleport like this one is covering it, so
// without this, Tab could never reach this dialog at all, and clicks
// on it could silently fail to register.
//
// `FocusScope` is reka-ui's own public primitive (the same one Reka-UI's
// own DialogContentImpl uses internally for every Dialog/Modal), and
// mounting a SECOND `trapped` FocusScope automatically pauses whichever
// one was previously active (reka-ui/dist/FocusScope/stack.js's own
// stack) -- so wrapping this dialog's content in one, rather than
// inventing a parallel mechanism, is what makes Tab/focus behave
// correctly while nested, using Reka-UI's own existing convention for
// exactly this situation. It is harmless when this picker is used
// standalone (its only other current context) -- there is no outer
// FocusScope to pause, and loop/trapped are a correct default.
import { FocusScope } from 'reka-ui'

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

// Media Gallery Thumbnail Performance pass -- the grid requests the
// `card` preset. `selectedFile.url` itself (the plain original) is NEVER
// used for display here -- it is read only by `selectFile`'s own emit,
// so "Use This Image"/double-click still return the original asset
// reference unchanged, per that fix's own contract.
//
// Owner production acceptance follow-up -- the right-hand selected-image
// side panel below used `selectedFile.url` DIRECTLY for its own preview
// `<img>`, so merely clicking a card to preview it (not "using" it) still
// downloaded the full original a second time -- confirmed as the exact
// reported gap (clicking a ~146MB Caldera image left that panel blank/
// slow). It now uses `thumbnailUrl()` too, the same derivative the grid
// already uses, reusing the SAME `failedThumbnails`/`retryTokens` state
// (keyed by file id) since both surfaces show the identical underlying
// derivative for the same file -- a failure/retry in one place is
// correctly a failure/retry for the other.
const failedThumbnails = ref<Set<string>>(new Set())
const retryTokens = ref<Record<string, number>>({})

function thumbnailUrl(file: MediaFile) {
  return buildCardThumbnailUrl(file.url, retryTokens.value[file.id])
}

function onThumbnailError(file: MediaFile) {
  failedThumbnails.value = new Set(failedThumbnails.value).add(file.id)
}

function retryThumbnail(file: MediaFile) {
  const next = new Set(failedThumbnails.value)
  next.delete(file.id)
  failedThumbnails.value = next
  retryTokens.value = { ...retryTokens.value, [file.id]: Date.now() }
}

// Tracks which file id's side-panel preview has actually finished
// loading. Compared against `selectedFile.id` (never set eagerly on
// selection) so rapidly switching the selection cannot display the
// PREVIOUS file's already-loaded image as if it were the current one --
// selecting a new file immediately makes this comparison false again,
// showing the loading placeholder, until the new image's own `load`
// event fires. Combined with `:key="selectedFile.id"` on the `<img>`
// itself (forces the DOM node to be recreated per selection, so the
// browser never paints a prior element's old pixels under a new `src`),
// this is a structural guarantee, not a timing-dependent flag.
const sidePreviewLoadedId = ref<string | null>(null)

function onSidePreviewLoad(file: MediaFile) {
  sidePreviewLoadedId.value = file.id
}

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

// Escape must close ONLY this dialog, never save, and never let an
// outer dialog (e.g. Customize Page's own UModal) see the keystroke and
// close itself instead. A capture-phase window listener runs before
// Reka-UI's own bubble-phase Escape handling (also on `window`, via
// VueUse's onKeyStroke inside its DismissableLayer) -- stopping
// propagation here means that handler never fires at all while this is
// open, regardless of what other dialog happens to be underneath.
function onCaptureKeydown(event: KeyboardEvent) {
  if (event.key !== 'Escape') return
  event.stopPropagation()
  close()
}

watch(
  () => props.open,
  (value) => {
    if (typeof window === 'undefined') return

    if (value) {
      window.addEventListener('keydown', onCaptureKeydown, { capture: true })
    } else {
      window.removeEventListener('keydown', onCaptureKeydown, { capture: true })
    }
  }
)

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
  if (typeof window !== 'undefined') {
    window.removeEventListener('keydown', onCaptureKeydown, { capture: true })
  }
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
        style="pointer-events: auto"
        @click.self="close"
      >
        <FocusScope as-child trapped loop>
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
                  <div v-if="failedThumbnails.has(file.id)" class="flex aspect-[4/3] w-full flex-col items-center justify-center gap-2 bg-black/30 px-3 text-center">
                    <span class="text-[11px] uppercase tracking-wide text-[#9f9278]">Preview unavailable</span>
                    <button
                      type="button"
                      class="eldra-button rounded-none px-2 py-1 text-[11px]"
                      @click.stop="retryThumbnail(file)"
                    >
                      Retry
                    </button>
                  </div>
                  <img
                    v-else
                    :src="thumbnailUrl(file)"
                    :alt="file.title || file.filename"
                    loading="lazy"
                    class="aspect-[4/3] w-full object-cover transition duration-200 group-hover:scale-[1.02]"
                    @error="onThumbnailError(file)"
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
                <div class="eldra-image-frame relative h-72 overflow-hidden rounded-none border bg-black/20">
                  <div
                    v-if="failedThumbnails.has(selectedFile.id)"
                    class="flex h-full flex-col items-center justify-center gap-2 px-3 text-center"
                  >
                    <span class="text-[11px] uppercase tracking-wide text-[#9f9278]">Preview unavailable</span>
                    <button
                      type="button"
                      class="eldra-button rounded-none px-2 py-1 text-[11px]"
                      @click="retryThumbnail(selectedFile)"
                    >
                      Retry
                    </button>
                  </div>
                  <template v-else>
                    <div
                      v-if="sidePreviewLoadedId !== selectedFile.id"
                      class="absolute inset-0 flex items-center justify-center text-xs text-[#9f9278]"
                    >
                      Loading preview...
                    </div>
                    <img
                      :key="selectedFile.id"
                      :src="thumbnailUrl(selectedFile)"
                      :alt="selectedFile.title || selectedFile.filename"
                      class="h-full w-full object-contain transition-opacity duration-150"
                      :class="sidePreviewLoadedId === selectedFile.id ? 'opacity-100' : 'opacity-0'"
                      @load="onSidePreviewLoad(selectedFile)"
                      @error="onThumbnailError(selectedFile)"
                    >
                  </template>
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
        </FocusScope>
      </div>
    </Transition>
  </Teleport>
</template>
