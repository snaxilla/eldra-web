<script setup lang="ts">
const props = withDefaults(defineProps<{
  worldId: string
  pageKey: string
  title: string
  description?: string
  isolated?: boolean
}>(), {
  description: 'Build-mode page controls live here for this page view.',
  isolated: false
})

type PresentationState = {
  worldKey: string
  pageKey: string
  presentationMode: string
  backgroundFileId: string | null
  backgroundImageUrl: string | null
}

const sharedPresentationState = useState<PresentationState>('world-page-presentation', () => ({
  worldKey: '',
  pageKey: '',
  presentationMode: 'neutral',
  backgroundFileId: null,
  backgroundImageUrl: null
}))

const localPresentationState = ref<PresentationState | null>(null)

const presentationState = computed<PresentationState | null>({
  get() {
    return props.isolated ? localPresentationState.value : sharedPresentationState.value
  },
  set(value) {
    if (props.isolated) {
      localPresentationState.value = value
    } else {
      sharedPresentationState.value = value || {
        worldKey: String(props.worldId || ''),
        pageKey: String(props.pageKey || ''),
        presentationMode: 'neutral',
        backgroundFileId: null,
        backgroundImageUrl: null
      }
    }
  }
})

const presentationRefreshNonce = useState<number>('world-page-presentation-refresh-nonce', () => 0)
const presentationBusy = ref(false)
const presentationMessage = ref('')
const hiddenBgInput = ref<HTMLInputElement | null>(null)
const loadingPresentation = ref(false)
const backgroundLightboxOpen = ref(false)

const currentMode = computed(() => String(presentationState.value?.presentationMode || 'neutral'))

const previewFileId = computed(() =>
  presentationState.value?.backgroundFileId
    ? String(presentationState.value.backgroundFileId)
    : ''
)

const previewImageUrl = computed(() => {
  if (presentationState.value?.backgroundImageUrl) {
    return String(presentationState.value.backgroundImageUrl)
  }

  if (presentationState.value?.backgroundFileId) {
    return `/api/assets/${presentationState.value.backgroundFileId}`
  }

  return ''
})

const previewMetaLine = computed(() => {
  const parts = [
    `Mode: ${currentMode.value}`,
    previewFileId.value ? `File: ${previewFileId.value}` : 'No file selected',
    `Page: ${props.pageKey || 'unknown'}`
  ]

  return parts.join(' · ')
})

function fallbackState(): PresentationState {
  return {
    worldKey: String(props.worldId || ''),
    pageKey: String(props.pageKey || ''),
    presentationMode: 'neutral',
    backgroundFileId: null,
    backgroundImageUrl: null
  }
}

async function loadPresentationState() {
  if (!props.worldId || !props.pageKey) return

  loadingPresentation.value = true

  try {
    const loaded = await $fetch<PresentationState>(`/api/worlds/${props.worldId}/presentation/${props.pageKey}`)

    presentationState.value = {
      worldKey: String(loaded?.worldKey || props.worldId || ''),
      pageKey: String(loaded?.pageKey || props.pageKey || ''),
      presentationMode: String(loaded?.presentationMode || 'neutral'),
      backgroundFileId: loaded?.backgroundFileId ? String(loaded.backgroundFileId) : null,
      backgroundImageUrl: loaded?.backgroundImageUrl ? String(loaded.backgroundImageUrl) : null
    }
  } catch {
    presentationState.value = fallbackState()
  } finally {
    loadingPresentation.value = false
  }
}

watch(
  () => [props.worldId, props.pageKey],
  () => {
    void loadPresentationState()
  },
  { immediate: true }
)

async function savePresentation(nextMode: string, backgroundFileId: string | null) {
  const saved = await $fetch<PresentationState>(`/api/worlds/${props.worldId}/presentation/${props.pageKey}`, {
    method: 'POST',
    body: {
      presentationMode: nextMode,
      backgroundFileId
    }
  })

  presentationState.value = {
    worldKey: String(saved.worldKey || props.worldId || ''),
    pageKey: String(saved.pageKey || props.pageKey),
    presentationMode: saved.presentationMode || nextMode,
    backgroundFileId: saved.backgroundFileId ? String(saved.backgroundFileId) : null,
    backgroundImageUrl: saved.backgroundImageUrl ? String(saved.backgroundImageUrl) : null
  }

  presentationRefreshNonce.value++

  return saved
}

async function setPresentationMode(nextMode: 'immersive' | 'muted' | 'neutral') {
  presentationBusy.value = true
  presentationMessage.value = ''

  try {
    await savePresentation(nextMode, presentationState.value?.backgroundFileId || null)
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

    await savePresentation(
      currentMode.value === 'neutral' ? 'immersive' : currentMode.value,
      String(uploadedFileId)
    )

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
    await savePresentation(currentMode.value, null)
    backgroundLightboxOpen.value = false
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

function openBackgroundLightbox() {
  if (!previewImageUrl.value) return
  backgroundLightboxOpen.value = true
}

function closeBackgroundLightbox() {
  backgroundLightboxOpen.value = false
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

    <div class="flex flex-wrap items-start justify-between gap-4">
      <div>
        <div class="text-xs uppercase tracking-[0.35em] text-[#9f9278]">
          Page Build
        </div>

        <h2 class="mt-3 text-2xl font-semibold text-white">
          {{ title }}
        </h2>
      </div>

      <div
        class="rounded-none border border-[rgba(201,164,90,0.22)] bg-[rgba(201,164,90,0.08)] px-3 py-2 text-[10px] uppercase tracking-[0.18em] text-[#f5e7bd]"
      >
        {{ pageKey }}
      </div>
    </div>

    <div class="mt-5 grid gap-5 lg:grid-cols-[240px_minmax(0,1fr)]">
      <div>
        <button
          type="button"
          class="group block aspect-square w-full overflow-hidden rounded-none border border-[rgba(201,164,90,0.30)] bg-[rgba(8,17,27,0.54)] text-left shadow-[inset_0_1px_0_rgba(255,255,255,0.03)] transition hover:border-[rgba(201,164,90,0.58)]"
          :class="previewImageUrl ? 'cursor-zoom-in' : 'cursor-default'"
          :disabled="!previewImageUrl"
          @click="openBackgroundLightbox"
        >
          <img
            v-if="previewImageUrl"
            :src="previewImageUrl"
            alt="Background preview"
            class="h-full w-full object-cover transition duration-300 group-hover:scale-[1.03]"
          >

          <div
            v-else
            class="flex h-full w-full flex-col items-center justify-center gap-3 p-5 text-center"
          >
            <UIcon name="i-lucide-image" class="h-8 w-8 text-[#9f9278]" />
            <div>
              <div class="text-sm font-semibold text-[#fff7df]">
                No background selected
              </div>
              <div class="mt-1 text-xs leading-5 text-[#9f9278]">
                Upload a background to preview it here.
              </div>
            </div>
          </div>
        </button>

        <div class="mt-2 text-[10px] uppercase tracking-[0.16em] text-[#756a57]">
          {{ previewImageUrl ? 'Click preview to enlarge' : 'Square preview' }}
        </div>
      </div>

      <div class="min-w-0">
        <div class="flex flex-wrap gap-2">
          <button
            type="button"
            class="rounded-none border px-4 py-2 text-sm transition"
            :class="currentMode === 'immersive'
              ? 'border-[rgba(201,164,90,0.58)] bg-[rgba(201,164,90,0.16)] text-[#fff7df]'
              : 'border-[rgba(201,164,90,0.24)] bg-[rgba(20,17,12,0.72)] text-[#d8ceb8] hover:bg-[rgba(201,164,90,0.10)] hover:text-[#fff7df]'"
            :disabled="presentationBusy || loadingPresentation"
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
            :disabled="presentationBusy || loadingPresentation"
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
            :disabled="presentationBusy || loadingPresentation"
            @click="setPresentationMode('neutral')"
          >
            Neutral
          </button>
        </div>

        <div class="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            class="eldra-button rounded-none px-4 py-2 text-sm disabled:opacity-50"
            :disabled="presentationBusy || loadingPresentation"
            @click="triggerBackgroundPicker"
          >
            {{ presentationBusy ? 'Working…' : 'Set Background' }}
          </button>

          <button
            type="button"
            class="rounded-none border border-[rgba(201,164,90,0.24)] bg-[rgba(20,17,12,0.72)] px-4 py-2 text-sm text-[#d8ceb8] transition hover:bg-[rgba(201,164,90,0.10)] hover:text-[#fff7df] disabled:opacity-50"
            :disabled="presentationBusy || loadingPresentation"
            @click="clearBackground"
          >
            Clear
          </button>
        </div>

        <p class="mt-4 text-sm leading-7 text-[#b5a88d]">
          {{ description }}
        </p>

        <div class="mt-4 rounded-none border border-[rgba(201,164,90,0.16)] bg-[rgba(8,17,27,0.34)] px-3 py-2 text-xs leading-5 text-[#9f9278]">
          {{ loadingPresentation ? 'Loading presentation state...' : previewMetaLine }}
        </div>

        <div
          v-if="presentationMessage"
          class="mt-4 rounded-none border border-[rgba(201,164,90,0.24)] bg-[rgba(20,17,12,0.72)] px-4 py-3 text-sm text-[#d8ceb8]"
        >
          {{ presentationMessage }}
        </div>
      </div>
    </div>

    <Teleport to="body">
      <Transition
        enter-from-class="opacity-0"
        enter-active-class="transition duration-150"
        leave-to-class="opacity-0"
        leave-active-class="transition duration-150"
      >
        <div
          v-if="backgroundLightboxOpen"
          class="fixed inset-0 z-[9999] flex items-center justify-center bg-[#050505]/92 p-4 backdrop-blur-sm"
          @click.self="closeBackgroundLightbox"
        >
          <div class="flex max-h-[94vh] w-full max-w-6xl flex-col overflow-hidden rounded-none border border-[rgba(201,164,90,0.32)] bg-[linear-gradient(to_bottom,rgba(16,14,10,0.98),rgba(7,6,4,0.98))] shadow-2xl">
            <header class="flex items-start justify-between gap-4 border-b border-[rgba(201,164,90,0.22)] px-5 py-4">
              <div>
                <div class="text-xs uppercase tracking-[0.35em] text-[#9f9278]">
                  Background Preview
                </div>

                <h3 class="mt-1 text-2xl font-semibold text-white">
                  {{ title }}
                </h3>

                <div class="mt-1 text-xs text-[#9f9278]">
                  {{ previewMetaLine }}
                </div>
              </div>

              <button
                type="button"
                class="rounded-none border border-[rgba(201,164,90,0.24)] px-3 py-2 text-sm text-[#d8ceb8] transition hover:bg-[rgba(201,164,90,0.10)] hover:text-white"
                @click="closeBackgroundLightbox"
              >
                Close
              </button>
            </header>

            <div class="min-h-0 flex-1 bg-black/40 p-4">
              <img
                :src="previewImageUrl"
                alt="Full background preview"
                class="mx-auto max-h-[78vh] w-full object-contain"
              >
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>
  </div>
</template>
