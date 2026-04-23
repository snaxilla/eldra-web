<script setup lang="ts">
const route = useRoute()

const worldId = computed(() => String(route.params.id || ''))

const mode = useState<'play' | 'build'>('world-workspace-mode', () => 'play')

const showPinsCookie = useCookie<string>('eldra-show-pins', {
  default: () => 'true'
})
const showPins = useState<boolean>('world-map-show-pins', () => showPinsCookie.value != 'false')

watch(showPins, (value) => {
  showPinsCookie.value = value ? 'true' : 'false'
})

const leftCollapsed = useState<boolean>('world-workspace-left-collapsed', () => false)

const { data: world } = await useFetch(() => `/api/worlds/${worldId.value}`)

const pageKey = computed(() => {
  const parts = String(route.path || '').split('/').filter(Boolean)
  const worldIndex = parts.findIndex(p => p === 'worlds')

  if (worldIndex === -1) return 'global'
  const maybePage = parts[worldIndex + 2]

  return maybePage || 'world-map'
})

const {
  data: fetchedPresentation,
  refresh: refreshPresentation
} = await useFetch(() => `/api/worlds/${worldId.value}/presentation/${pageKey.value}`, {
  default: () => ({
    worldKey: String(worldId.value || ''),
    pageKey: String(pageKey.value || 'world-map'),
    presentationMode: 'neutral',
    backgroundFileId: null,
    backgroundImageUrl: null
  }),
  watch: [worldId, pageKey]
})

const presentationState = ref({
  worldKey: '',
  pageKey: '',
  presentationMode: 'neutral',
  backgroundFileId: null as string | null,
  backgroundImageUrl: null as string | null
})

watch(
  fetchedPresentation,
  (value) => {
    if (!value) return
    presentationState.value = {
      worldKey: String(value.worldKey || worldId.value || ''),
      pageKey: String(value.pageKey || pageKey.value || ''),
      presentationMode: String(value.presentationMode || 'neutral'),
      backgroundFileId: value.backgroundFileId ? String(value.backgroundFileId) : null,
      backgroundImageUrl: value.backgroundImageUrl ? String(value.backgroundImageUrl) : null
    }
  },
  { immediate: true, deep: true }
)

const presentationMode = computed(() => String(presentationState.value.presentationMode || 'neutral'))
const backgroundImageUrl = computed(() => {
  if (presentationState.value.backgroundImageUrl) {
    return String(presentationState.value.backgroundImageUrl)
  }
  if (presentationState.value.backgroundFileId) {
    return `/api/assets/${presentationState.value.backgroundFileId}`
  }
  return ''
})

const bgBusy = ref(false)
const bgMessage = ref('')
const hiddenBgInput = ref<HTMLInputElement | null>(null)

// Future permission note:
// This is intentionally Build Mode only for now.
// Later this should become: Build Mode + canEditPresentation/DM/Admin permission.
const canEditPresentation = computed(() => mode.value === 'build')

async function setPresentationMode(nextMode: 'immersive' | 'muted' | 'neutral') {
  bgBusy.value = true
  bgMessage.value = ''

  try {
    const saved = await $fetch<{
      success: boolean
      worldKey: string
      pageKey: string
      presentationMode: string
      backgroundFileId: string | null
      backgroundImageUrl: string | null
    }>(`/api/worlds/${worldId.value}/presentation/${pageKey.value}`, {
      method: 'POST',
      body: {
        presentationMode: nextMode,
        backgroundFileId: presentationState.value.backgroundFileId || null
      }
    })

    presentationState.value = {
      worldKey: saved.worldKey,
      pageKey: saved.pageKey,
      presentationMode: saved.presentationMode || nextMode,
      backgroundFileId: saved.backgroundFileId || null,
      backgroundImageUrl: saved.backgroundImageUrl || (saved.backgroundFileId ? `/api/assets/${saved.backgroundFileId}` : null)
    }

    await refreshPresentation()
    bgMessage.value = `Mode set to ${nextMode}.`
  } catch (error: any) {
    bgMessage.value =
      error?.data?.statusMessage ||
      error?.data?.message ||
      error?.message ||
      'Failed to save presentation mode.'
  } finally {
    bgBusy.value = false
  }
}

function triggerBackgroundUpload() {
  hiddenBgInput.value?.click()
}

async function onBackgroundFileChange(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]

  if (!file) return

  bgBusy.value = true
  bgMessage.value = ''

  try {
    const form = new FormData()
    form.append('file', file)

    const uploaded = await $fetch<{ success: boolean; fileId: string | null; imageUrl: string | null }>(
      `/api/worlds/${worldId.value}/presentation/upload-background`,
      {
        method: 'POST',
        body: form
      }
    )

    const saved = await $fetch<{
      success: boolean
      worldKey: string
      pageKey: string
      presentationMode: string
      backgroundFileId: string | null
      backgroundImageUrl: string | null
    }>(`/api/worlds/${worldId.value}/presentation/${pageKey.value}`, {
      method: 'POST',
      body: {
        presentationMode: presentationMode.value === 'neutral' ? 'immersive' : presentationMode.value,
        backgroundFileId: uploaded.fileId
      }
    })

    presentationState.value = {
      worldKey: saved.worldKey,
      pageKey: saved.pageKey,
      presentationMode: saved.presentationMode || 'immersive',
      backgroundFileId: saved.backgroundFileId || uploaded.fileId || null,
      backgroundImageUrl:
        saved.backgroundImageUrl ||
        uploaded.imageUrl ||
        (saved.backgroundFileId ? `/api/assets/${saved.backgroundFileId}` : null)
    }

    await refreshPresentation()
    bgMessage.value = 'Background updated.'
  } catch (error: any) {
    bgMessage.value =
      error?.data?.statusMessage ||
      error?.data?.message ||
      error?.message ||
      'Failed to upload background.'
  } finally {
    bgBusy.value = false
    input.value = ''
  }
}

async function clearBackground() {
  bgBusy.value = true
  bgMessage.value = ''

  try {
    const saved = await $fetch<{
      success: boolean
      worldKey: string
      pageKey: string
      presentationMode: string
      backgroundFileId: string | null
      backgroundImageUrl: string | null
    }>(`/api/worlds/${worldId.value}/presentation/${pageKey.value}`, {
      method: 'POST',
      body: {
        presentationMode: presentationMode.value,
        backgroundFileId: null
      }
    })

    presentationState.value = {
      worldKey: saved.worldKey,
      pageKey: saved.pageKey,
      presentationMode: saved.presentationMode || presentationMode.value,
      backgroundFileId: null,
      backgroundImageUrl: null
    }

    await refreshPresentation()
    bgMessage.value = 'Background cleared.'
  } catch (error: any) {
    bgMessage.value =
      error?.data?.statusMessage ||
      error?.data?.message ||
      error?.message ||
      'Failed to clear background.'
  } finally {
    bgBusy.value = false
  }
}
</script>

<template>
  <div class="h-screen w-screen overflow-hidden text-slate-100 bg-[#07101a]">
    <div
      class="grid h-full"
      :style="{ gridTemplateColumns: leftCollapsed ? '68px minmax(0,1fr)' : '280px minmax(0,1fr)' }"
    >
      <WorldWorkspaceSidebar
        :world="world"
        :collapsed="leftCollapsed"
        :mode="mode"
        @toggle-collapse="leftCollapsed = !leftCollapsed"
        @set-mode="mode = $event"
      />

      <div class="min-w-0 overflow-hidden relative">

        <!-- neutral base -->
        <div class="absolute inset-0 bg-[linear-gradient(to_bottom,#09111a,#0b1521_40%,#0d1826)]"></div>

        <!-- obvious diagnostic background layer -->
        <div
          v-if="backgroundImageUrl && presentationMode !== 'neutral'"
          class="absolute inset-0 bg-cover bg-center bg-no-repeat transition-opacity duration-300"
          :style="{
            backgroundImage: `url('${backgroundImageUrl}')`,
            opacity: presentationMode === 'immersive' ? '0.55' : '0.22',
            filter: presentationMode === 'immersive'
              ? 'saturate(1.02) contrast(1.02)'
              : 'grayscale(0.10) saturate(0.78) brightness(0.90)'
          }"
        />

        <!-- readability overlays -->
        <div
          v-if="presentationMode !== 'neutral'"
          class="absolute inset-0"
          :style="{
            background: presentationMode === 'immersive'
              ? 'linear-gradient(to bottom, rgba(5,10,18,0.40), rgba(8,14,22,0.52) 32%, rgba(9,17,26,0.66) 72%, rgba(10,18,28,0.78))'
              : 'linear-gradient(to bottom, rgba(7,12,19,0.58), rgba(8,14,22,0.72) 38%, rgba(9,17,26,0.84))'
          }"
        />

        <div class="relative h-full w-full overflow-hidden">
          <slot />
        </div>

        <!-- build-mode presentation controls -->
        <div
          v-if="canEditPresentation"
          class="absolute right-4 top-4 z-40 w-[290px] rounded-2xl border border-white/10 bg-[rgba(8,16,27,0.9)] p-4 shadow-2xl backdrop-blur"
        >
          <div class="flex items-start justify-between gap-3">
            <div>
              <div class="text-[11px] uppercase tracking-[0.3em] text-slate-500">Presentation</div>
              <div class="mt-1 text-sm font-semibold text-white">{{ pageKey }}</div>
            </div>

            <div class="rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-[10px] uppercase tracking-[0.2em] text-slate-400">
              Build
            </div>
          </div>

          <div class="mt-4 grid grid-cols-3 gap-2">
            <button
              type="button"
              class="rounded-xl border px-3 py-2 text-xs font-medium transition"
              :class="presentationMode === 'immersive'
                ? 'border-sky-300/30 bg-sky-400/15 text-sky-100'
                : 'border-white/10 bg-white/[0.04] text-slate-300 hover:bg-white/[0.08]'"
              :disabled="bgBusy"
              @click="setPresentationMode('immersive')"
            >
              Immersive
            </button>

            <button
              type="button"
              class="rounded-xl border px-3 py-2 text-xs font-medium transition"
              :class="presentationMode === 'muted'
                ? 'border-sky-300/30 bg-sky-400/15 text-sky-100'
                : 'border-white/10 bg-white/[0.04] text-slate-300 hover:bg-white/[0.08]'"
              :disabled="bgBusy"
              @click="setPresentationMode('muted')"
            >
              Muted
            </button>

            <button
              type="button"
              class="rounded-xl border px-3 py-2 text-xs font-medium transition"
              :class="presentationMode === 'neutral'
                ? 'border-sky-300/30 bg-sky-400/15 text-sky-100'
                : 'border-white/10 bg-white/[0.04] text-slate-300 hover:bg-white/[0.08]'"
              :disabled="bgBusy"
              @click="setPresentationMode('neutral')"
            >
              Neutral
            </button>
          </div>

          <div class="mt-3 flex gap-2">
            <button
              type="button"
              class="flex-1 rounded-xl border border-emerald-400/20 bg-emerald-400/10 px-4 py-2 text-sm font-medium text-emerald-100 transition hover:bg-emerald-400/20 disabled:opacity-50"
              :disabled="bgBusy"
              @click="triggerBackgroundUpload"
            >
              {{ bgBusy ? 'Working…' : 'Set Background' }}
            </button>

            <button
              type="button"
              class="rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2 text-sm text-slate-200 transition hover:bg-white/[0.08] disabled:opacity-50"
              :disabled="bgBusy"
              @click="clearBackground"
            >
              Clear
            </button>
          </div>

          <input
            ref="hiddenBgInput"
            type="file"
            accept="image/*"
            class="hidden"
            @change="onBackgroundFileChange"
          >

          <div
            v-if="backgroundImageUrl"
            class="mt-3 overflow-hidden rounded-xl border border-white/10 bg-black/20"
          >
            <img :src="backgroundImageUrl" alt="Background preview" class="h-24 w-full object-cover">
          </div>

          <div class="mt-3 text-xs text-slate-500">
            Future state: Build Mode plus DM/Admin permission only.
          </div>

          <div
            v-if="bgMessage"
            class="mt-3 rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-xs text-slate-300"
          >
            {{ bgMessage }}
          </div>
        </div>

      </div>
    </div>
  </div>
</template>
