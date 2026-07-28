<script setup lang="ts">
import WorldMediaPicker from '~/components/world/WorldMediaPicker.vue'

type ImageOverlayDraft = {
  objectId: string
  name: string
  imageFileId: string
  imageUrl: string
  opacity: number
}

const props = defineProps<{
  open: boolean
  editingOverlay: ImageOverlayDraft | null
  worldId: string | number
  savingOverlay: boolean
  saveError: string
}>()

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'save'): void
  (e: 'remove'): void
}>()

const pickerOpen = ref(false)

function cleanText(value: any) {
  return String(value ?? '').trim()
}

const previewUrl = computed(() => cleanText(props.editingOverlay?.imageUrl))
const overlayLabel = computed(() => cleanText(props.editingOverlay?.name) || 'Image Overlay')

function fileIdFrom(file: any) {
  return cleanText(
    file?.id ??
    file?.fileId ??
    file?.file_id ??
    file?.directusFileId ??
    file?.directus_file_id ??
    file?.data?.id ??
    ''
  )
}

function fileUrlFrom(file: any, fileId: string) {
  return cleanText(
    file?.url ??
    file?.imageUrl ??
    file?.image_url ??
    file?.assetUrl ??
    file?.asset_url ??
    file?.data?.url ??
    ''
  ) || (fileId ? `/api/assets/${fileId}` : '')
}

function fileTitleFrom(file: any, fileId: string) {
  return cleanText(
    file?.title ??
    file?.filename_download ??
    file?.filename ??
    file?.name ??
    file?.data?.title ??
    ''
  ) || fileId
}

function selectImage(file: any) {
  if (!props.editingOverlay) return

  const nextFileId = fileIdFrom(file)
  const nextImageUrl = fileUrlFrom(file, nextFileId)

  if (!nextFileId && !nextImageUrl) return

  props.editingOverlay.imageFileId = nextFileId
  props.editingOverlay.imageUrl = nextImageUrl
  if (!cleanText(props.editingOverlay.name)) {
    props.editingOverlay.name = fileTitleFrom(file, nextFileId) || 'Image Overlay'
  }
}

function clearImage() {
  if (!props.editingOverlay) return

  props.editingOverlay.imageFileId = ''
  props.editingOverlay.imageUrl = ''
}

function removeOverlay() {
  emit('remove')
}
</script>

<template>
  <Teleport to="body">
    <Transition
      enter-from-class="translate-x-full opacity-0"
      enter-active-class="transition duration-200"
      leave-to-class="translate-x-full opacity-0"
      leave-active-class="transition duration-200"
    >
      <div
        v-if="open && editingOverlay"
        class="eldra-ornate-panel eldra-frame-corners fixed right-0 top-0 z-40 h-full w-[420px] border-l backdrop-blur"
      >
        <div class="flex h-full flex-col">
          <header class="border-b border-[rgba(201,164,90,0.22)] px-5 py-4">
            <div class="text-xs uppercase tracking-[0.35em] text-[#9f9278]">
              Image Overlay
            </div>
            <div class="mt-2 flex items-start justify-between gap-4">
              <div>
                <h2 class="text-2xl font-semibold text-white">
                  {{ cleanText(editingOverlay.objectId) ? 'Edit Overlay' : 'Create Overlay' }}
                </h2>
                <p class="mt-1 text-sm text-[#9f9278]">
                  Author one scene-owned overlay object for the current map.
                </p>
              </div>

              <button
                type="button"
                class="rounded-none border border-[rgba(201,164,90,0.24)] px-3 py-2 text-sm text-[#d8ceb8] transition hover:bg-[rgba(201,164,90,0.10)] hover:text-white"
                @click="emit('close')"
              >
                Close
              </button>
            </div>
          </header>

          <div class="flex-1 overflow-y-auto px-5 py-5">
            <div class="space-y-5">
              <div v-if="saveError" class="rounded-none border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-200">
                {{ saveError }}
              </div>

              <div>
                <label class="mb-1.5 block text-xs uppercase tracking-[0.25em] text-[#9f9278]">Name</label>
                <input
                  v-model="editingOverlay.name"
                  type="text"
                  placeholder="e.g. Province Banner"
                  class="eldra-input w-full rounded-none px-4 py-2.5 text-sm placeholder-[#756a57]"
                >
              </div>

              <div>
                <div class="mb-1.5 flex items-center justify-between gap-3">
                  <label class="block text-xs uppercase tracking-[0.25em] text-[#9f9278]">Opacity</label>
                  <span class="text-xs text-[#9f9278]">{{ Math.round((editingOverlay.opacity || 0) * 100) }}%</span>
                </div>
                <input
                  v-model.number="editingOverlay.opacity"
                  type="range"
                  min="0"
                  max="1"
                  step="0.05"
                  class="w-full"
                >
              </div>

              <div>
                <label class="mb-1.5 block text-xs uppercase tracking-[0.25em] text-[#9f9278]">Image</label>

                <div
                  v-if="previewUrl"
                  class="eldra-image-frame mb-3 overflow-hidden rounded-none border bg-black/20"
                >
                  <img
                    :src="previewUrl"
                    :alt="overlayLabel"
                    class="h-40 w-full object-cover"
                  >
                </div>

                <div class="flex flex-wrap gap-2">
                  <button
                    type="button"
                    class="eldra-button rounded-none px-4 py-2 text-sm font-semibold"
                    @click="pickerOpen = true"
                  >
                    {{ previewUrl ? 'Change Image' : 'Choose / Upload Image' }}
                  </button>

                  <button
                    v-if="previewUrl"
                    type="button"
                    class="rounded-none border border-[rgba(201,164,90,0.24)] bg-[rgba(20,17,12,0.72)] px-4 py-2 text-sm font-semibold text-[#fff7df]"
                    @click="clearImage"
                  >
                    Clear
                  </button>
                </div>

                <div
                  v-if="previewUrl"
                  class="mt-3 rounded-none border border-[rgba(201,164,90,0.12)] bg-[rgba(4,8,14,0.40)] p-4"
                >
                  <div class="text-[10px] uppercase tracking-[0.2em] text-[#9f9278]">
                    Selected
                  </div>
                  <div class="mt-2 break-words text-sm font-semibold text-[#fff7df]">
                    {{ overlayLabel }}
                  </div>
                  <div class="mt-2 break-all text-xs text-[#9f9278]">
                    {{ cleanText(editingOverlay.imageFileId) || previewUrl }}
                  </div>
                </div>

                <div
                  v-else
                  class="mt-3 rounded-none border border-dashed border-[rgba(201,164,90,0.22)] bg-[rgba(4,8,14,0.34)] p-4 text-sm leading-6 text-[#9f9278]"
                >
                  Select or upload a single image to represent the overlay.
                </div>
              </div>

              <div class="eldra-codex-soft rounded-none px-4 py-2 text-xs text-[#9f9278]">
                The overlay uses the current map bounds and is toggled through the Image Overlays layer.
              </div>
            </div>
          </div>

          <div class="border-t border-[rgba(201,164,90,0.22)] p-5">
            <div class="flex gap-3">
              <button
                type="button"
                class="eldra-button flex-1 rounded-none py-2.5 text-sm"
                @click="emit('close')"
              >
                Cancel
              </button>

              <button
                v-if="cleanText(editingOverlay.objectId)"
                type="button"
                class="rounded-none border border-red-400/20 bg-red-500/10 px-4 py-2.5 text-sm font-medium text-red-100 transition hover:bg-red-500/20"
                @click="removeOverlay"
              >
                Remove
              </button>

              <button
                type="button"
                class="eldra-button flex-1 rounded-none py-2.5 text-sm font-medium disabled:opacity-50"
                :disabled="!previewUrl || savingOverlay"
                @click="emit('save')"
              >
                {{ savingOverlay ? 'Saving…' : (cleanText(editingOverlay.objectId) ? 'Update Overlay' : 'Create Overlay') }}
              </button>
            </div>
          </div>
        </div>

        <WorldMediaPicker
          v-model:open="pickerOpen"
          :world-id="worldId"
          title="Choose Overlay Image"
          select-label="Use Image"
          @select="selectImage"
        />
      </div>
    </Transition>
  </Teleport>
</template>
