<script setup lang="ts">
const props = withDefaults(defineProps<{
  worldId: string
  pageKey: string
  title: string
  description?: string
}>(), {
  description: 'Build-mode page controls live here for this page view.'
})

const presentationState = useState<{
  worldKey: string
  pageKey: string
  presentationMode: string
  backgroundFileId: string | null
  backgroundImageUrl: string | null
}>('world-page-presentation')

const presentationRefreshNonce = useState<number>('world-page-presentation-refresh-nonce', () => 0)
const presentationBusy = ref(false)
const presentationMessage = ref('')
const hiddenBgInput = ref<HTMLInputElement | null>(null)

const currentMode = computed(() => String(presentationState.value?.presentationMode || 'neutral'))
const previewImageUrl = computed(() => {
  if (presentationState.value?.backgroundImageUrl) {
    return String(presentationState.value.backgroundImageUrl)
  }
  if (presentationState.value?.backgroundFileId) {
    return `/api/assets/${presentationState.value.backgroundFileId}`
  }
  return ''
})

async function setPresentationMode(nextMode: 'immersive' | 'muted' | 'neutral') {
  presentationBusy.value = true
  presentationMessage.value = ''

  try {
    const saved = await $fetch<{
      worldKey: string
      pageKey: string
      presentationMode: string
      backgroundFileId: string | null
      backgroundImageUrl: string | null
    }>(`/api/worlds/${props.worldId}/presentation/${props.pageKey}`, {
      method: 'POST',
      body: {
        presentationMode: nextMode,
        backgroundFileId: presentationState.value?.backgroundFileId || null
      }
    })

    presentationState.value = {
      worldKey: String(saved.worldKey || props.worldId || ''),
      pageKey: String(saved.pageKey || props.pageKey),
      presentationMode: saved.presentationMode || nextMode,
      backgroundFileId: saved.backgroundFileId || null,
      backgroundImageUrl: saved.backgroundImageUrl || null
    }

    presentationRefreshNonce.value++
    presentationMessage.value = `Mode set to ${nextMode}.`
  } catch (error: any) {
    presentationMessage.value =
      error?.data?.statusMessage ||
      error?.data?.message ||
      error?.message ||
      'Failed to save presentation mode.'
  } finally {
    presentationBusy.value = false
  }
}

function triggerBackgroundPicker() {
  hiddenBgInput.value?.click()
}

async function onBackgroundPicked(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input?.files?.[0]
  if (!file) return

  presentationBusy.value = true
  presentationMessage.value = ''

  try {
    const formData = new FormData()
    formData.append('file', file)

    const uploaded = await $fetch<any>(`/api/worlds/${props.worldId}/presentation/upload-background`, {
      method: 'POST',
      body: formData
    })

    const uploadedFileId =
      uploaded?.backgroundFileId ||
      uploaded?.fileId ||
      uploaded?.id ||
      uploaded?.data?.id ||
      null

    if (!uploadedFileId) {
      throw new Error('Upload did not return a file id.')
    }

    const saved = await $fetch<{
      worldKey: string
      pageKey: string
      presentationMode: string
      backgroundFileId: string | null
      backgroundImageUrl: string | null
    }>(`/api/worlds/${props.worldId}/presentation/${props.pageKey}`, {
      method: 'POST',
      body: {
        presentationMode: currentMode.value === 'neutral' ? 'immersive' : currentMode.value,
        backgroundFileId: String(uploadedFileId)
      }
    })

    presentationState.value = {
      worldKey: String(saved.worldKey || props.worldId || ''),
      pageKey: String(saved.pageKey || props.pageKey),
      presentationMode: saved.presentationMode || 'immersive',
      backgroundFileId: saved.backgroundFileId || String(uploadedFileId),
      backgroundImageUrl: saved.backgroundImageUrl || null
    }

    presentationRefreshNonce.value++
    presentationMessage.value = 'Background updated.'
  } catch (error: any) {
    presentationMessage.value =
      error?.data?.statusMessage ||
      error?.data?.message ||
      error?.message ||
      'Failed to upload background.'
  } finally {
    presentationBusy.value = false
    if (input) input.value = ''
  }
}

async function clearBackground() {
  presentationBusy.value = true
  presentationMessage.value = ''

  try {
    const saved = await $fetch<{
      worldKey: string
      pageKey: string
      presentationMode: string
      backgroundFileId: string | null
      backgroundImageUrl: string | null
    }>(`/api/worlds/${props.worldId}/presentation/${props.pageKey}`, {
      method: 'POST',
      body: {
        presentationMode: currentMode.value,
        backgroundFileId: null
      }
    })

    presentationState.value = {
      worldKey: String(saved.worldKey || props.worldId || ''),
      pageKey: String(saved.pageKey || props.pageKey),
      presentationMode: saved.presentationMode || 'neutral',
      backgroundFileId: null,
      backgroundImageUrl: null
    }

    presentationRefreshNonce.value++
    presentationMessage.value = 'Background cleared.'
  } catch (error: any) {
    presentationMessage.value =
      error?.data?.statusMessage ||
      error?.data?.message ||
      error?.message ||
      'Failed to clear background.'
  } finally {
    presentationBusy.value = false
  }
}
</script>

<template>
  <div class="eldra-ornate-panel eldra-frame-corners p-5 shadow-xl">
    <input
      ref="hiddenBgInput"
      type="file"
      accept="image/*"
      class="hidden"
      @change="onBackgroundPicked"
    >

    <div class="text-xs uppercase tracking-[0.35em] text-[#9f9278]">Page Build</div>
    <h2 class="mt-3 text-2xl font-semibold text-white">{{ title }}</h2>

    <div class="mt-4 flex flex-wrap gap-2">
      <button
        type="button"
        class="rounded-none border px-4 py-2 text-sm transition"
        :class="currentMode === 'immersive'
          ? 'border-[rgba(201,164,90,0.58)] bg-[rgba(201,164,90,0.16)] text-[#fff7df]'
          : 'border-[rgba(201,164,90,0.24)] bg-[rgba(20,17,12,0.72)] text-[#d8ceb8] hover:bg-[rgba(201,164,90,0.10)] hover:text-[#fff7df]'"
        :disabled="presentationBusy"
        @click="setPresentationMode('immersive')"
      >
        Immersive
      </button>

      <button
        type="button"
        class="rounded-none border px-4 py-2 text-sm transition"
        :class="currentMode === 'muted'
          ? 'border-[rgba(201,164,90,0.58)] bg-[rgba(201,164,90,0.16)] text-[#fff7df]'
          : 'border-[rgba(201,164,90,0.24)] bg-[rgba(20,17,12,0.72)] text-[#d8ceb8] hover:bg-[rgba(201,164,90,0.10)] hover:text-[#fff7df]'"
        :disabled="presentationBusy"
        @click="setPresentationMode('muted')"
      >
        Muted
      </button>

      <button
        type="button"
        class="rounded-none border px-4 py-2 text-sm transition"
        :class="currentMode === 'neutral'
          ? 'border-[rgba(201,164,90,0.58)] bg-[rgba(201,164,90,0.16)] text-[#fff7df]'
          : 'border-[rgba(201,164,90,0.24)] bg-[rgba(20,17,12,0.72)] text-[#d8ceb8] hover:bg-[rgba(201,164,90,0.10)] hover:text-[#fff7df]'"
        :disabled="presentationBusy"
        @click="setPresentationMode('neutral')"
      >
        Neutral
      </button>
    </div>

    <div class="mt-4 flex flex-wrap gap-2">
      <button
        type="button"
        class="eldra-button rounded-none px-4 py-2 text-sm disabled:opacity-50"
        :disabled="presentationBusy"
        @click="triggerBackgroundPicker"
      >
        {{ presentationBusy ? 'Working…' : 'Set Background' }}
      </button>

      <button
        type="button"
        class="rounded-none border border-[rgba(201,164,90,0.24)] bg-[rgba(20,17,12,0.72)] px-4 py-2 text-sm text-[#d8ceb8] transition hover:bg-[rgba(201,164,90,0.10)] hover:text-[#fff7df] disabled:opacity-50"
        :disabled="presentationBusy"
        @click="clearBackground"
      >
        Clear
      </button>
    </div>

    <div
      v-if="previewImageUrl"
      class="eldra-image-frame mt-4 overflow-hidden rounded-none border bg-black/20"
    >
      <img :src="previewImageUrl" alt="Background preview" class="h-28 w-full object-cover">
    </div>

    <p class="mt-4 text-sm leading-7 text-[#b5a88d]">
      {{ description }}
    </p>

    <div
      v-if="presentationMessage"
      class="mt-4 rounded-none border border-[rgba(201,164,90,0.24)] bg-[rgba(20,17,12,0.72)] px-4 py-3 text-sm text-[#d8ceb8]"
    >
      {{ presentationMessage }}
    </div>
  </div>
</template>
