<script setup lang="ts">
// PAGE BACKGROUND PICKER UX CORRECTION -- the square preview is now the
// single control: click it (empty or filled) to open the shared World
// Media Gallery picker and choose/upload an image there, rather than a
// separate "Set Background" button opening a native file chooser. The
// old click-to-enlarge lightbox is replaced by this -- enlarging a
// background was never asked for as a requirement here, and "no nested
// buttons" rules out keeping both an enlarge affordance and a change
// affordance on the same single button.
import { buildCardThumbnailUrl } from '~/lib/media/thumbnail-url'

const props = withDefaults(defineProps<{
  worldId: string
  pageKey: string
  title: string
  description?: string
  isolated?: boolean
  embedded?: boolean
}>(), {
  description: 'Build-mode page controls live here for this page view.',
  isolated: false,
  embedded: false
})

// WorldPageCustomizeButton.vue (the only caller that hosts this panel
// inside a UModal) listens for this to toggle its own modal's
// `dismissible` off while the picker is open -- see that file's own
// comment for why: WorldMediaPicker is a hand-rolled Teleport overlay,
// not a Reka-UI layer, so the UModal underneath has no built-in way to
// know it is covered and would otherwise treat a click on the picker's
// own backdrop (or Escape) as "outside" and close itself too. Emitted
// unconditionally (not only when embedded) -- harmless for Page Setup's
// non-modal usage, which simply has no listener for it.
const emit = defineEmits<{
  (e: 'picker-open-change', value: boolean): void
}>()

type PresentationState = {
  worldKey: string
  pageKey: string
  presentationMode: string
  backgroundFileId: string | null
  backgroundImageUrl: string | null
  // World Background Defaults pass. The page's OWN stored intent --
  // 'override' (its own image), 'inherit' (showing the World default),
  // or 'none' (explicitly nothing, even if a World default exists).
  // `backgroundFileId`/`backgroundImageUrl` above are the RESOLVED
  // values (what actually renders -- the inherited World default's own
  // image when source is 'inherit'), which is why `setPresentationMode`
  // below must never read them back as if they were this page's own
  // override.
  backgroundSource: 'override' | 'inherit' | 'none'
}

const sharedPresentationState = useState<PresentationState>('world-page-presentation', () => ({
  worldKey: '',
  pageKey: '',
  presentationMode: 'neutral',
  backgroundFileId: null,
  backgroundImageUrl: null,
  backgroundSource: 'none'
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
        backgroundImageUrl: null,
        backgroundSource: 'none'
      }
    }
  }
})

const presentationRefreshNonce = useState<number>('world-page-presentation-refresh-nonce', () => 0)
const presentationBusy = ref(false)
const presentationMessage = ref('')
const presentationMessageIsError = ref(false)
const loadingPresentation = ref(false)
const pickerOpen = ref(false)
const previewButtonRef = ref<HTMLButtonElement | null>(null)

const worldPagePresentationPanelClass = computed(() => [
  'min-w-0 overflow-hidden',
  props.embedded
    ? 'p-0 rounded-none bg-transparent shadow-none'
    : 'eldra-ornate-panel eldra-frame-corners p-5 shadow-xl'
])


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

// The small square preview's own derivative -- never the original,
// matching the Media Gallery Thumbnail Performance pass's own rule
// (app/lib/media/thumbnail-url.ts). The ACTUAL page background
// (world-workspace.vue's own backgroundImageUrl computed, which this
// component never touches) still resolves the real original unchanged
// -- this is purely this editor's own small preview.
const previewThumbnailUrl = computed(() =>
  previewImageUrl.value ? buildCardThumbnailUrl(previewImageUrl.value) : ''
)

// "File: <uuid>"/"No file selected" (a raw Directus id) and a "Page:"
// repeat of the title shown right above were removed -- neither is
// actionable to the person using this editor (owner observation: "no
// nested buttons"/scope-messaging correction). Mode is kept: it is the
// one piece of state here not already visible from the buttons' own
// active-highlight styling at a glance in every viewport width.
const previewMetaLine = computed(() => `Mode: ${currentMode.value}`)

// World Background Defaults pass. 'world-default' has nothing above it
// to inherit from (it IS the default); 'character-sheet' is a
// specialized surface the owner's instruction keeps off the inheritance
// path entirely (see world-page-presentation.ts's SPECIALIZED_PAGE_KEYS
// for the matching server-side exclusion) -- its editor keeps the single
// legacy "Clear" action instead of the two new ones.
const supportsInheritance = computed(() => props.pageKey !== 'world-default' && props.pageKey !== 'character-sheet')

const backgroundSource = computed(() => presentationState.value?.backgroundSource || 'none')

const backgroundStateLabel = computed(() => {
  if (!supportsInheritance.value) return null
  if (backgroundSource.value === 'override') return 'Local override'
  if (backgroundSource.value === 'inherit') return 'Inheriting World Default'
  return 'No background (World Default off)'
})

// The page's OWN stored override id, never the resolved/inherited
// display value -- `presentationState.value.backgroundFileId` is the
// RESOLVED value (the World default's own file id while inheriting), so
// reading it back here as if it were this page's own override would
// silently turn "inheriting" into "explicitly overridden with the same
// image" the moment an unrelated action (e.g. a mode click) re-saves.
const ownBackgroundFileId = computed(() =>
  backgroundSource.value === 'override' ? presentationState.value?.backgroundFileId || null : null
)

function fallbackState(): PresentationState {
  return {
    worldKey: String(props.worldId || ''),
    pageKey: String(props.pageKey || ''),
    presentationMode: 'neutral',
    backgroundFileId: null,
    backgroundImageUrl: null,
    backgroundSource: 'none'
  }
}

function normalizeBackgroundSource(value: unknown): 'override' | 'inherit' | 'none' {
  return value === 'override' || value === 'inherit' ? value : 'none'
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
      backgroundImageUrl: loaded?.backgroundImageUrl ? String(loaded.backgroundImageUrl) : null,
      backgroundSource: normalizeBackgroundSource(loaded?.backgroundSource)
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

async function savePresentation(nextMode: string, backgroundFileId: string | null, explicitBackgroundSource?: 'inherit' | 'none') {
  const saved = await $fetch<PresentationState>(`/api/worlds/${props.worldId}/presentation/${props.pageKey}`, {
    method: 'POST',
    body: {
      presentationMode: nextMode,
      backgroundFileId,
      ...(explicitBackgroundSource ? { backgroundSource: explicitBackgroundSource } : {})
    }
  })

  presentationState.value = {
    worldKey: String(saved.worldKey || props.worldId || ''),
    pageKey: String(saved.pageKey || props.pageKey),
    presentationMode: saved.presentationMode || nextMode,
    backgroundFileId: saved.backgroundFileId ? String(saved.backgroundFileId) : null,
    backgroundImageUrl: saved.backgroundImageUrl ? String(saved.backgroundImageUrl) : null,
    backgroundSource: normalizeBackgroundSource(saved.backgroundSource)
  }

  presentationRefreshNonce.value++

  return saved
}

async function setPresentationMode(nextMode: 'immersive' | 'muted' | 'neutral') {
  // Guards against rapid/out-of-order actions (e.g. clicking another
  // mode, or Clear, while a save from a PRIOR click is still in flight)
  // restoring stale state -- each mutating action here bails out while
  // another one of its own kind is already running, rather than relying
  // only on the buttons' own `:disabled` binding, which can lag one
  // click behind the actual busy state.
  if (presentationBusy.value) return

  presentationBusy.value = true
  presentationMessage.value = ''
  presentationMessageIsError.value = false

  try {
    // ownBackgroundFileId, not the resolved preview value -- changing
    // mode while inheriting (or while explicitly showing no background)
    // must never turn into an accidental override of this page with the
    // World default's own image.
    await savePresentation(nextMode, ownBackgroundFileId.value)
    presentationMessage.value = `Mode set to ${nextMode}.`
  } catch (error: any) {
    presentationMessage.value =
      error?.data?.statusMessage ||
      error?.data?.message ||
      error?.message ||
      'Failed to save presentation mode.'
    presentationMessageIsError.value = true
  } finally {
    presentationBusy.value = false
  }
}

function openBackgroundPicker() {
  if (presentationBusy.value) return
  pickerOpen.value = true
}

// Browsing/highlighting files in the picker never calls this -- only
// its own "Use This Image" action (or the established double-click
// convention) emits `select`, so merely opening the gallery and looking
// around, or Cancelling it, can never mutate the saved background.
async function onBackgroundSelected(file: { id: string }) {
  if (presentationBusy.value) return
  if (!file?.id) return

  presentationBusy.value = true
  presentationMessage.value = ''
  presentationMessageIsError.value = false

  try {
    // Stores the ORIGINAL asset id the picker returns -- never a
    // thumbnail URL. The square's own display below reads this back
    // through buildCardThumbnailUrl itself; the stored reference stays
    // the real id throughout, exactly as it already was for an
    // uploaded-through-the-old-flow background. Always an explicit
    // override -- the server infers this from the file id alone, no
    // backgroundSource needed here.
    await savePresentation(
      currentMode.value === 'neutral' ? 'immersive' : currentMode.value,
      String(file.id)
    )
    presentationMessage.value = 'Background saved.'
  } catch (error: any) {
    presentationMessage.value =
      error?.data?.statusMessage ||
      error?.data?.message ||
      error?.message ||
      'Failed to save background.'
    presentationMessageIsError.value = true
  } finally {
    presentationBusy.value = false
  }
}

async function clearBackground() {
  if (presentationBusy.value) return

  presentationBusy.value = true
  presentationMessage.value = ''
  presentationMessageIsError.value = false

  try {
    // Legacy single-action clear -- only reachable for pages that don't
    // support inheritance (supportsInheritance === false: Character
    // Sheet, World Default). Deliberately passes NO explicit
    // backgroundSource, unlike useWorldDefault/noBackground below: both
    // resolvePagePresentation's World-default branch and its specialized
    // -key forcing (world-page-presentation.ts) already ignore whatever
    // background_source a Character Sheet/World Default row has stored,
    // so writing one here would gain nothing while making this
    // pre-existing action newly depend on the background_source column
    // existing (see the migration script's own deployment-order note).
    await savePresentation(currentMode.value, null)
    presentationMessage.value = 'Background cleared.'
  } catch (error: any) {
    presentationMessage.value =
      error?.data?.statusMessage ||
      error?.data?.message ||
      error?.message ||
      'Failed to clear background.'
    presentationMessageIsError.value = true
  } finally {
    presentationBusy.value = false
  }
}

// The two explicit, unambiguous choices this task introduces -- replace
// the single "Clear" action above for every page that supports
// inheritance. Neither deletes the underlying media asset; both only
// change THIS page's own association, same guarantee "Clear" already
// made.
async function useWorldDefault() {
  if (presentationBusy.value) return

  presentationBusy.value = true
  presentationMessage.value = ''
  presentationMessageIsError.value = false

  try {
    await savePresentation(currentMode.value, null, 'inherit')
    presentationMessage.value = 'Now inheriting the World Default background.'
  } catch (error: any) {
    presentationMessage.value =
      error?.data?.statusMessage ||
      error?.data?.message ||
      error?.message ||
      'Failed to switch to the World Default.'
    presentationMessageIsError.value = true
  } finally {
    presentationBusy.value = false
  }
}

async function noBackground() {
  if (presentationBusy.value) return

  presentationBusy.value = true
  presentationMessage.value = ''
  presentationMessageIsError.value = false

  try {
    await savePresentation(currentMode.value, null, 'none')
    presentationMessage.value = 'Background set to none for this page.'
  } catch (error: any) {
    presentationMessage.value =
      error?.data?.statusMessage ||
      error?.data?.message ||
      error?.message ||
      'Failed to clear background.'
    presentationMessageIsError.value = true
  } finally {
    presentationBusy.value = false
  }
}

watch(pickerOpen, (isOpen, wasOpen) => {
  emit('picker-open-change', isOpen)

  // WorldMediaPicker has no focus-management of its own (confirmed: no
  // focus-trap, no restore-on-close) -- this restores focus to the
  // button that opened it specifically, which this component DOES own.
  if (!isOpen && wasOpen) {
    nextTick(() => previewButtonRef.value?.focus())
  }
})
</script>

<template>
  <div data-world-page-presentation-panel :class="worldPagePresentationPanelClass">
    <div class="flex flex-wrap items-start justify-between gap-4">
      <div>
        <div class="text-xs uppercase tracking-[0.35em] text-eldra-text-faint">
          Page Build
        </div>

        <h2 class="mt-3 text-2xl font-semibold text-white">
          {{ title }}
        </h2>
      </div>

      <div
        class="rounded-none border border-eldra-accent/22 bg-eldra-accent/8 px-3 py-2 text-[10px] uppercase tracking-[0.18em] text-eldra-accent-text"
      >
        {{ pageKey }}
      </div>
    </div>

    <div data-page-presentation-body class="mt-5 grid gap-5">
      <div data-page-presentation-preview-column class="min-w-0">
        <button
          ref="previewButtonRef"
          type="button"
          class="group relative block aspect-square w-full cursor-pointer overflow-hidden rounded-none border border-eldra-accent/30 bg-eldra-well/54 text-left shadow-[inset_0_1px_0_rgba(255,255,255,0.03)] transition hover:border-eldra-accent/58 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-eldra-accent/70 disabled:cursor-not-allowed disabled:opacity-60"
          :disabled="presentationBusy || loadingPresentation"
          :aria-label="previewThumbnailUrl ? 'Change page background image' : 'Choose a page background image from the Media Gallery'"
          @click="openBackgroundPicker"
        >
          <img
            v-if="previewThumbnailUrl"
            :src="previewThumbnailUrl"
            alt=""
            class="h-full w-full object-cover transition duration-300 group-hover:scale-[1.03]"
          >

          <div
            v-else
            class="flex h-full w-full flex-col items-center justify-center gap-3 p-5 text-center"
          >
            <UIcon name="i-lucide-image-plus" class="h-8 w-8 text-eldra-text-faint" />
            <div>
              <div class="text-sm font-semibold text-eldra-text-strong">
                Choose background
              </div>
              <div class="mt-1 text-xs leading-5 text-eldra-text-faint">
                Click to pick an image from the Media Gallery.
              </div>
            </div>
          </div>

          <div
            v-if="previewThumbnailUrl"
            class="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/0 opacity-0 transition group-hover:bg-black/55 group-hover:opacity-100 group-focus-visible:bg-black/55 group-focus-visible:opacity-100"
          >
            <span class="rounded-none border border-eldra-accent/42 bg-black/60 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.12em] text-white">
              {{ presentationBusy ? 'Saving…' : 'Change background' }}
            </span>
          </div>
        </button>

        <div class="mt-2 text-[10px] uppercase tracking-[0.16em] text-[#756a57]">
          {{ previewThumbnailUrl ? 'Click to change' : 'Click to choose' }}
        </div>
      </div>

      <WorldMediaPicker
        v-model:open="pickerOpen"
        :world-id="worldId"
        title="Choose Page Background"
        select-label="Use This Image"
        @select="onBackgroundSelected"
      />

      <div class="min-w-0">
        <div data-page-presentation-actions class="flex flex-wrap gap-2">
          <button
            type="button"
            class="rounded-none border px-4 py-2 text-sm transition"
            :class="currentMode === 'immersive'
              ? 'border-eldra-accent/58 bg-eldra-accent/16 text-eldra-text-strong'
              : 'border-eldra-accent/24 bg-eldra-panel/72 text-eldra-text-soft hover:bg-eldra-accent/10 hover:text-eldra-text-strong'"
            :disabled="presentationBusy || loadingPresentation"
            @click="setPresentationMode('immersive')"
          >
            Immersive
          </button>

          <button
            type="button"
            class="rounded-none border px-4 py-2 text-sm transition"
            :class="currentMode === 'muted'
              ? 'border-eldra-accent/58 bg-eldra-accent/16 text-eldra-text-strong'
              : 'border-eldra-accent/24 bg-eldra-panel/72 text-eldra-text-soft hover:bg-eldra-accent/10 hover:text-eldra-text-strong'"
            :disabled="presentationBusy || loadingPresentation"
            @click="setPresentationMode('muted')"
          >
            Muted
          </button>

          <button
            type="button"
            class="rounded-none border px-4 py-2 text-sm transition"
            :class="currentMode === 'neutral'
              ? 'border-eldra-accent/58 bg-eldra-accent/16 text-eldra-text-strong'
              : 'border-eldra-accent/24 bg-eldra-panel/72 text-eldra-text-soft hover:bg-eldra-accent/10 hover:text-eldra-text-strong'"
            :disabled="presentationBusy || loadingPresentation"
            @click="setPresentationMode('neutral')"
          >
            Neutral
          </button>
        </div>

        <div data-page-presentation-actions class="mt-4 flex flex-wrap gap-2">
          <template v-if="supportsInheritance">
            <button
              type="button"
              class="rounded-none border border-eldra-accent/24 bg-eldra-panel/72 px-4 py-2 text-sm text-eldra-text-soft transition hover:bg-eldra-accent/10 hover:text-eldra-text-strong disabled:opacity-50"
              :disabled="presentationBusy || loadingPresentation"
              @click="useWorldDefault"
            >
              Use World Default
            </button>

            <button
              type="button"
              class="rounded-none border border-eldra-accent/24 bg-eldra-panel/72 px-4 py-2 text-sm text-eldra-text-soft transition hover:bg-eldra-accent/10 hover:text-eldra-text-strong disabled:opacity-50"
              :disabled="presentationBusy || loadingPresentation"
              @click="noBackground"
            >
              No Background
            </button>
          </template>

          <button
            v-else
            type="button"
            class="rounded-none border border-eldra-accent/24 bg-eldra-panel/72 px-4 py-2 text-sm text-eldra-text-soft transition hover:bg-eldra-accent/10 hover:text-eldra-text-strong disabled:opacity-50"
            :disabled="presentationBusy || loadingPresentation"
            @click="clearBackground"
          >
            Clear
          </button>
        </div>

        <p class="mt-4 text-sm leading-7 text-eldra-text-dim">
          {{ description }}
        </p>

        <div
          v-if="backgroundStateLabel"
          class="mt-4 rounded-none border border-eldra-accent/22 bg-eldra-accent/8 px-3 py-2 text-[10px] uppercase tracking-[0.18em] text-eldra-accent-text"
        >
          {{ backgroundStateLabel }}
        </div>

        <div class="mt-4 rounded-none border border-eldra-accent/16 bg-eldra-well/34 px-3 py-2 text-xs leading-5 text-eldra-text-faint">
          {{ loadingPresentation ? 'Loading presentation state...' : previewMetaLine }}
        </div>

        <div
          v-if="presentationMessage"
          class="mt-4 rounded-none border px-4 py-3 text-sm"
          :class="presentationMessageIsError
            ? 'border-red-400/32 bg-red-400/10 text-red-200'
            : 'border-eldra-accent/24 bg-eldra-panel/72 text-eldra-text-soft'"
          role="status"
        >
          {{ presentationMessage }}
        </div>
      </div>
    </div>
  </div>
</template>


<style scoped>
[data-world-page-presentation-panel] {
  container-type: inline-size;
}

[data-page-presentation-body] {
  grid-template-columns: minmax(0, 1fr);
}

[data-page-presentation-preview-column] {
  width: 100%;
  max-width: 260px;
}

@container (min-width: 720px) {
  [data-page-presentation-body] {
    grid-template-columns: 240px minmax(0, 1fr);
  }

  [data-page-presentation-preview-column] {
    max-width: none;
  }
}

@container (max-width: 520px) {
  [data-page-presentation-preview-column] {
    max-width: 220px;
  }

  [data-page-presentation-actions] {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
  }

  [data-page-presentation-actions] > * {
    width: 100%;
    justify-content: center;
    text-align: center;
  }
}
</style>

