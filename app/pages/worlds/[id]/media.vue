<script setup lang="ts">
definePageMeta({
  layout: 'world-workspace'
})

type MediaFile = {
  id: string
  title: string
  filename: string
  type: string
  filesize: number
  uploadedOn: string | null
  modifiedOn: string | null
  width: number | null
  height: number | null
  description: string
  url: string
}

const route = useRoute()
const worldId = computed(() => String(route.params.id || ''))

const search = ref('')
const uploadInput = ref<HTMLInputElement | null>(null)
const uploading = ref(false)
const uploadError = ref('')
const deleteError = ref('')
const deleteSuccess = ref('')
const deletingId = ref('')
const selectedFile = ref<MediaFile | null>(null)

const { data, pending, refresh } = await useFetch(() => `/api/worlds/${worldId.value}/media`, {
  query: {
    search
  },
  default: () => ({
    worldId: worldId.value,
    files: [] as MediaFile[]
  })
})

const files = computed<MediaFile[]>(() => {
  const value: any = data.value || {}
  return Array.isArray(value.files) ? value.files : []
})

const filteredFiles = computed(() => files.value)

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

function formatDate(value: any) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  })
}

function selectFile(file: MediaFile) {
  selectedFile.value = file
}

function closePreview() {
  selectedFile.value = null
}

async function copyUrl(file: MediaFile) {
  try {
    await navigator.clipboard.writeText(file.url)
    deleteSuccess.value = 'Asset URL copied.'
    window.setTimeout(() => {
      if (deleteSuccess.value === 'Asset URL copied.') deleteSuccess.value = ''
    }, 2000)
  } catch {
    deleteError.value = 'Could not copy URL.'
  }
}

async function onUploadSelected(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]

  if (!file) return

  uploading.value = true
  uploadError.value = ''
  deleteError.value = ''
  deleteSuccess.value = ''

  try {
    const form = new FormData()
    form.append('file', file)
    form.append('title', file.name)

    await $fetch(`/api/worlds/${worldId.value}/media/upload`, {
      method: 'POST',
      body: form
    })

    await refresh()
  } catch (error: any) {
    uploadError.value =
      error?.data?.statusMessage ||
      error?.data?.message ||
      error?.message ||
      'Failed to upload image.'
  } finally {
    uploading.value = false
    if (input) input.value = ''
  }
}

async function deleteFile(file: MediaFile) {
  const ok = window.confirm(`Delete "${file.title || file.filename || file.id}" from Directus files?`)
  if (!ok) return

  deletingId.value = file.id
  deleteError.value = ''
  deleteSuccess.value = ''

  try {
    await $fetch(`/api/worlds/${worldId.value}/media/${file.id}`, {
      method: 'DELETE'
    })

    if (selectedFile.value?.id === file.id) selectedFile.value = null

    deleteSuccess.value = 'Image deleted.'
    await refresh()
  } catch (error: any) {
    deleteError.value =
      error?.data?.statusMessage ||
      error?.data?.message ||
      error?.message ||
      'Could not delete image.'
  } finally {
    deletingId.value = ''
  }
}
</script>

<template>
  <div class="h-full overflow-y-auto bg-transparent">
    <div class="mx-auto max-w-[1500px] p-6">
      <section class="eldra-ornate-panel eldra-frame-corners eldra-corner-runes rounded-none border p-6 backdrop-blur-xl">
        <div class="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div class="text-xs uppercase tracking-[0.35em] text-[#9f9278]">World Media</div>
            <h1 class="mt-3 text-4xl font-semibold tracking-tight text-white">Media Gallery</h1>
            <p class="mt-2 max-w-3xl text-sm leading-7 text-[#d8ceb8]">
              Upload, preview, copy, and delete Directus images used by this world.
            </p>
          </div>

          <div class="flex flex-wrap items-center gap-3">
            <input
              ref="uploadInput"
              type="file"
              accept="image/*"
              class="hidden"
              @change="onUploadSelected"
            >

            <button
              type="button"
              class="eldra-button rounded-none px-4 py-2 text-sm font-semibold disabled:opacity-50"
              :disabled="uploading"
              @click="uploadInput?.click()"
            >
              {{ uploading ? 'Uploading...' : 'Upload Image' }}
            </button>
          </div>
        </div>

        <div class="mt-6 grid gap-3 md:grid-cols-[minmax(0,1fr)_auto]">
          <input
            v-model="search"
            type="search"
            placeholder="Search filename, title, or description..."
            class="eldra-input rounded-none px-4 py-3 text-sm"
          >

          <button
            type="button"
            class="eldra-button rounded-none px-4 py-3 text-sm"
            @click="refresh"
          >
            Refresh
          </button>
        </div>

        <div v-if="uploadError" class="mt-4 rounded-none border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-200">
          {{ uploadError }}
        </div>

        <div v-if="deleteError" class="mt-4 rounded-none border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-200">
          {{ deleteError }}
        </div>

        <div v-if="deleteSuccess" class="mt-4 rounded-none border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">
          {{ deleteSuccess }}
        </div>
      </section>

      <section class="mt-6">
        <div v-if="pending" class="eldra-ornate-panel eldra-frame-corners rounded-none border p-8 text-center text-[#d8ceb8]">
          Loading media...
        </div>

        <div v-else-if="!filteredFiles.length" class="eldra-ornate-panel eldra-frame-corners rounded-none border p-10 text-center">
          <div class="text-xl font-semibold text-white">No images found</div>
          <p class="mt-2 text-sm text-[#9f9278]">
            Upload your first image to start building the gallery.
          </p>
        </div>

        <div v-else class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
          <article
            v-for="file in filteredFiles"
            :key="file.id"
            class="eldra-ornate-panel eldra-frame-corners group overflow-hidden rounded-none border backdrop-blur-xl"
          >
            <button
              type="button"
              class="block w-full bg-black/20 text-left"
              @click="selectFile(file)"
            >
              <img
                :src="file.url"
                :alt="file.title || file.filename"
                loading="lazy"
                class="aspect-[4/3] w-full object-cover transition duration-200 group-hover:scale-[1.02]"
              >
            </button>

            <div class="border-t border-[rgba(201,164,90,0.22)] p-4">
              <div class="truncate text-sm font-semibold text-[#fff7df]">
                {{ file.title || file.filename || file.id }}
              </div>

              <div class="mt-1 truncate text-xs text-[#9f9278]">
                {{ file.filename || file.id }}
              </div>

              <div class="mt-3 flex flex-wrap gap-2 text-[11px] text-[#9f9278]">
                <span class="eldra-gold-chip rounded-none border px-2 py-1">{{ file.type || 'image' }}</span>
                <span class="rounded-none border border-[rgba(201,164,90,0.18)] px-2 py-1">{{ formatBytes(file.filesize) }}</span>
                <span v-if="formatDate(file.uploadedOn)" class="rounded-none border border-[rgba(201,164,90,0.18)] px-2 py-1">{{ formatDate(file.uploadedOn) }}</span>
              </div>

              <div class="mt-4 flex gap-2">
                <button
                  type="button"
                  class="eldra-button flex-1 rounded-none px-3 py-2 text-xs"
                  @click="copyUrl(file)"
                >
                  Copy URL
                </button>

                <button
                  type="button"
                  class="rounded-none border border-red-500/25 bg-red-500/10 px-3 py-2 text-xs text-red-200 transition hover:bg-red-500/20 disabled:opacity-50"
                  :disabled="deletingId === file.id"
                  @click="deleteFile(file)"
                >
                  {{ deletingId === file.id ? 'Deleting...' : 'Delete' }}
                </button>
              </div>
            </div>
          </article>
        </div>
      </section>
    </div>

    <Teleport to="body">
      <Transition
        enter-from-class="opacity-0"
        enter-active-class="transition duration-150"
        leave-to-class="opacity-0"
        leave-active-class="transition duration-150"
      >
        <div
          v-if="selectedFile"
          class="fixed inset-0 z-[9999] flex items-center justify-center bg-[#050505]/90 p-4 backdrop-blur-sm"
          @click.self="closePreview"
        >
          <div class="relative max-h-[92vh] max-w-[92vw]">
            <button
              type="button"
              class="absolute right-3 top-3 z-10 rounded-none border border-white/15 bg-black/65 px-3 py-2 text-sm text-white backdrop-blur transition hover:bg-black/85"
              @click="closePreview"
            >
              Close
            </button>

            <img
              :src="selectedFile.url"
              :alt="selectedFile.title || selectedFile.filename"
              class="max-h-[78vh] max-w-[92vw] rounded-none border border-[rgba(201,164,90,0.28)] object-contain shadow-2xl"
            >

            <div class="mt-3 rounded-none border border-[rgba(201,164,90,0.22)] bg-[rgba(20,17,12,0.88)] px-4 py-3 text-sm text-[#d8ceb8]">
              <div class="font-semibold text-[#fff7df]">{{ selectedFile.title || selectedFile.filename }}</div>
              <div class="mt-1 text-xs text-[#9f9278]">{{ selectedFile.id }}</div>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>
  </div>
</template>
