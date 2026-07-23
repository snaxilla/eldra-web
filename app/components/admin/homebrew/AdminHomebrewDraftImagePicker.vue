<script setup lang="ts">
import WorldMediaPicker from '~/components/world/WorldMediaPicker.vue'

const props = defineProps<{
  worldId: string | number
  fileId?: string
  imageUrl?: string
  title?: string
}>()

const emit = defineEmits<{
  (event: 'update:fileId', value: string): void
  (event: 'update:imageUrl', value: string): void
  (event: 'update:title', value: string): void
}>()

const pickerOpen = ref(false)

function cleanText(value: any) {
  return String(value ?? '').trim()
}

const previewUrl = computed(() => {
  const explicit = cleanText(props.imageUrl)
  if (explicit) return explicit

  const id = cleanText(props.fileId)
  return id ? `/api/assets/${id}` : ''
})

const imageLabel = computed(() =>
  cleanText(props.title) ||
  cleanText(props.fileId) ||
  'Selected image'
)

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
  const nextFileId = fileIdFrom(file)
  const nextImageUrl = fileUrlFrom(file, nextFileId)

  if (!nextFileId && !nextImageUrl) return

  emit('update:fileId', nextFileId)
  emit('update:imageUrl', nextImageUrl)
  emit('update:title', fileTitleFrom(file, nextFileId))
}

function clearImage() {
  emit('update:fileId', '')
  emit('update:imageUrl', '')
  emit('update:title', '')
}
</script>

<template>
  <div
    data-homebrew-draft-image-picker
    class="mt-5 rounded-none border border-[rgba(201,164,90,0.20)] bg-[rgba(8,17,27,0.42)] p-4"
  >
    <div class="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
      <div>
        <div class="text-xs uppercase tracking-[0.3em] text-[#9f9278]">
          Draft Image
        </div>
        <h3 class="mt-2 text-xl font-semibold text-white">
          Gallery Image
        </h3>
        <p class="mt-2 max-w-2xl text-sm leading-6 text-[#d8ceb8]">
          Pick or upload a gallery image now so the draft is ready for collection cards, enemy previews, articles, and Foundry export later.
        </p>
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
          v-if="previewUrl || fileId"
          type="button"
          class="rounded-none border border-[rgba(201,164,90,0.24)] bg-[rgba(20,17,12,0.72)] px-4 py-2 text-sm font-semibold text-[#fff7df]"
          @click="clearImage"
        >
          Clear
        </button>
      </div>
    </div>

    <div
      v-if="previewUrl"
      class="mt-4 grid gap-4 md:grid-cols-[160px_minmax(0,1fr)]"
    >
      <div class="overflow-hidden rounded-none border border-[rgba(201,164,90,0.24)] bg-[rgba(4,8,14,0.72)]">
        <img
          :src="previewUrl"
          :alt="imageLabel"
          class="h-44 w-full object-cover object-top"
        >
      </div>

      <div class="rounded-none border border-[rgba(201,164,90,0.12)] bg-[rgba(4,8,14,0.40)] p-4">
        <div class="text-[10px] uppercase tracking-[0.2em] text-[#9f9278]">
          Selected
        </div>
        <div class="mt-2 break-words text-sm font-semibold text-[#fff7df]">
          {{ imageLabel }}
        </div>
        <div
          v-if="fileId"
          class="mt-2 break-all text-xs text-[#9f9278]"
        >
          File: {{ fileId }}
        </div>
      </div>
    </div>

    <div
      v-else
      class="mt-4 rounded-none border border-dashed border-[rgba(201,164,90,0.22)] bg-[rgba(4,8,14,0.34)] p-4 text-sm leading-6 text-[#9f9278]"
    >
      No image selected yet. The gallery picker can select an existing media file or upload a new one.
    </div>

    <WorldMediaPicker
      v-model:open="pickerOpen"
      :world-id="worldId"
      title="Choose Draft Image"
      select-label="Use Image"
      @select="selectImage"
    />
  </div>
</template>
