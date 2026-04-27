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
  <div class="rounded-[28px] border border-white/10 bg-[linear-gradient(to_bottom,rgba(20,31,48,0.52),rgba(8,16,27,0.46))] p-5 backdrop-blur-xl shadow-[0_18px_50px_rgba(0,0,0,0.22)]">
    <input
      ref="hiddenBgInput"
      type="file"
      accept="image/*"
      class="hidden"
      @change="onBackgroundPicked"
    >

    <div class="text-xs uppercase tracking-[0.35em] text-slate-500">Page Build</div>
    <h2 class="mt-3 text-2xl font-semibold text-white">{{ title }}</h2>

    <div class="mt-4 flex flex-wrap gap-2">
      <button
        type="button"
        class="rounded-xl border px-4 py-2 text-sm transition"
        :class="currentMode === 'immersive'
          ? 'border-sky-400/30 bg-sky-400/15 text-sky-100'
          : 'border-white/10 bg-white/[0.04] text-slate-300 hover:bg-white/[0.08]'"
        :disabled="presentationBusy"
        @click="setPresentationMode('immersive')"
      >
        Immersive
      </button>

      <button
        type="button"
        class="rounded-xl border px-4 py-2 text-sm transition"
        :class="currentMode === 'muted'
          ? 'border-sky-400/30 bg-sky-400/15 text-sky-100'
          : 'border-white/10 bg-white/[0.04] text-slate-300 hover:bg-white/[0.08]'"
        :disabled="presentationBusy"
        @click="setPresentationMode('muted')"
      >
        Muted
      </button>

      <button
        type="button"
        class="rounded-xl border px-4 py-2 text-sm transition"
        :class="currentMode === 'neutral'
          ? 'border-sky-400/30 bg-sky-400/15 text-sky-100'
          : 'border-white/10 bg-white/[0.04] text-slate-300 hover:bg-white/[0.08]'"
        :disabled="presentationBusy"
        @click="setPresentationMode('neutral')"
      >
        Neutral
      </button>
    </div>

    <div class="mt-4 flex flex-wrap gap-2">
      <button
        type="button"
        class="rounded-xl border border-emerald-400/20 bg-emerald-400/10 px-4 py-2 text-sm text-emerald-100 transition hover:bg-emerald-400/20 disabled:opacity-50"
        :disabled="presentationBusy"
        @click="triggerBackgroundPicker"
      >
        {{ presentationBusy ? 'Working…' : 'Set Background' }}
      </button>

      <button
        type="button"
        class="rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2 text-sm text-slate-300 transition hover:bg-white/[0.08] disabled:opacity-50"
        :disabled="presentationBusy"
        @click="clearBackground"
      >
        Clear
      </button>
    </div>

    <div
      v-if="previewImageUrl"
      class="mt-4 overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03]"
    >
      <img :src="previewImageUrl" alt="Background preview" class="h-28 w-full object-cover">
    </div>

    <p class="mt-4 text-sm leading-7 text-slate-400">
      {{ description }}
    </p>

    <div
      v-if="presentationMessage"
      class="mt-4 rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm text-slate-200"
    >
      {{ presentationMessage }}
    </div>
  </div>
</template>
