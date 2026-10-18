<script setup lang="ts">
// GM World theme selection (Theming Architecture, Phase 2 -- see
// .github/docs/architecture/theming.md). Edits preview immediately for the
// GM through the shared World theme state; Save persists them for everyone
// in the World. Viewers' own accessibility preferences still override
// whatever is chosen here.
import {
  MAX_PANEL_BLUR,
  MIN_PANEL_OPACITY,
  PLATFORM_DEFAULT_THEME_KEY,
  getTheme,
  listThemes,
  sanitizeWorldThemeSelection,
  type EldraWorldThemeSelection
} from '~/lib/eldra/themes'

const props = defineProps<{
  worldId: string
}>()

const themes = listThemes()
const platformDefaultLabel = getTheme(PLATFORM_DEFAULT_THEME_KEY).label

const saved = ref<EldraWorldThemeSelection>({ themeKey: null, themeOptions: {} })
const draft = ref<EldraWorldThemeSelection>({ themeKey: null, themeOptions: {} })
const busy = ref(false)
const message = ref('')

const { data: fetched } = await useFetch(() => `/api/worlds/${props.worldId}/presentation-settings`, {
  default: () => null
})

watch(fetched, (value) => {
  saved.value = sanitizeWorldThemeSelection(value)
  draft.value = sanitizeWorldThemeSelection(value)
}, { immediate: true })

const activeTheme = computed(() => getTheme(draft.value.themeKey ?? PLATFORM_DEFAULT_THEME_KEY))
const effectiveOptions = computed(() => ({ ...activeTheme.value.defaults, ...draft.value.themeOptions }))
const dirty = computed(() => JSON.stringify(draft.value) !== JSON.stringify(saved.value))

// Live preview for the GM only, until saved.
watch(draft, (value) => {
  setWorldTheme(props.worldId, value)
}, { deep: true })

function setThemeKey(event: Event) {
  const value = (event.target as HTMLSelectElement).value
  draft.value = { ...draft.value, themeKey: value || null }
}

function setOption<K extends keyof EldraWorldThemeSelection['themeOptions']>(key: K, value: EldraWorldThemeSelection['themeOptions'][K]) {
  draft.value = { ...draft.value, themeOptions: { ...draft.value.themeOptions, [key]: value } }
}

function resetOptions() {
  draft.value = { ...draft.value, themeOptions: {} }
}

function revert() {
  draft.value = { ...saved.value, themeOptions: { ...saved.value.themeOptions } }
  message.value = ''
}

async function save() {
  busy.value = true
  message.value = ''
  try {
    const result = await $fetch(`/api/worlds/${props.worldId}/presentation-settings`, {
      method: 'PATCH',
      body: draft.value
    })
    saved.value = sanitizeWorldThemeSelection(result)
    draft.value = sanitizeWorldThemeSelection(result)
    message.value = 'World theme saved.'
  } catch (error: any) {
    message.value = error?.data?.statusMessage || error?.statusMessage || 'Could not save the World theme.'
  } finally {
    busy.value = false
  }
}

onBeforeUnmount(() => {
  // Drop an unsaved preview when leaving the panel.
  if (dirty.value) setWorldTheme(props.worldId, saved.value)
})
</script>

<template>
  <section data-world-theme-settings-panel class="eldra-ornate-panel eldra-frame-corners min-w-0 p-5 shadow-xl">
    <div class="flex flex-wrap items-start justify-between gap-4">
      <div>
        <div class="text-xs uppercase tracking-[0.35em] text-eldra-text-faint">
          World Theme
        </div>

        <h2 class="mt-3 text-2xl font-semibold text-white">
          Visual Theme
        </h2>

        <p class="mt-2 max-w-2xl text-sm leading-6 text-eldra-text-soft">
          Sets the look of this World for everyone in it. Players' own accessibility settings (motion, contrast, transparency) always take precedence.
        </p>
      </div>

      <div class="rounded-none border border-eldra-accent/22 bg-eldra-accent/8 px-3 py-2 text-[10px] uppercase tracking-[0.18em] text-eldra-accent-text">
        {{ draft.themeKey ? activeTheme.label : `Default · ${platformDefaultLabel}` }}
      </div>
    </div>

    <div class="mt-5 grid gap-5 md:grid-cols-2">
      <label class="grid gap-2">
        <span class="text-[11px] uppercase tracking-[0.3em] text-eldra-text-faint">Theme</span>
        <select
          class="eldra-input rounded-none border border-eldra-accent/28 bg-[rgba(5,8,12,0.84)] px-3 py-2 text-sm text-eldra-text"
          :value="draft.themeKey ?? ''"
          @change="setThemeKey"
        >
          <option value="">
            Platform default ({{ platformDefaultLabel }})
          </option>
          <option v-for="theme in themes" :key="theme.key" :value="theme.key">
            {{ theme.label }}
          </option>
        </select>
        <span class="text-xs text-eldra-text-faint">{{ activeTheme.description }}</span>
      </label>

      <label class="flex items-center justify-between gap-3 self-start rounded-none border border-eldra-accent/22 bg-eldra-panel/72 px-3 py-3 text-sm text-eldra-text-soft">
        <span>
          <span class="block">Atmospheric effects</span>
          <span class="block text-xs text-eldra-text-faint">Optional glows and ambient motion.</span>
        </span>
        <input
          type="checkbox"
          class="h-4 w-4 accent-eldra-accent"
          :checked="effectiveOptions.atmosphere"
          @change="setOption('atmosphere', ($event.target as HTMLInputElement).checked)"
        >
      </label>

      <label class="grid gap-2">
        <span class="flex justify-between text-[11px] uppercase tracking-[0.3em] text-eldra-text-faint">
          <span>Panel opacity</span>
          <span class="tabular-nums tracking-normal">{{ Math.round(effectiveOptions.panelOpacity * 100) }}%</span>
        </span>
        <input
          type="range"
          class="accent-eldra-accent"
          :min="MIN_PANEL_OPACITY"
          max="1"
          step="0.01"
          :value="effectiveOptions.panelOpacity"
          @input="setOption('panelOpacity', Number(($event.target as HTMLInputElement).value))"
        >
      </label>

      <label class="grid gap-2">
        <span class="flex justify-between text-[11px] uppercase tracking-[0.3em] text-eldra-text-faint">
          <span>Panel blur</span>
          <span class="tabular-nums tracking-normal">{{ effectiveOptions.panelBlur }}px</span>
        </span>
        <input
          type="range"
          class="accent-eldra-accent"
          min="0"
          :max="MAX_PANEL_BLUR"
          step="1"
          :value="effectiveOptions.panelBlur"
          @input="setOption('panelBlur', Number(($event.target as HTMLInputElement).value))"
        >
      </label>
    </div>

    <div class="mt-5 flex flex-wrap items-center gap-3">
      <button
        type="button"
        class="eldra-button rounded-none border border-eldra-accent/42 bg-eldra-accent/14 px-4 py-2 text-sm text-eldra-accent-text transition hover:bg-eldra-accent/22 disabled:opacity-50"
        :disabled="busy || !dirty"
        @click="save"
      >
        {{ busy ? 'Saving…' : 'Save theme' }}
      </button>

      <button
        type="button"
        class="rounded-none border border-eldra-accent/22 px-4 py-2 text-sm text-eldra-text-dim transition hover:text-eldra-text-strong disabled:opacity-50"
        :disabled="busy || !dirty"
        @click="revert"
      >
        Revert
      </button>

      <button
        type="button"
        class="rounded-none border border-transparent px-2 py-2 text-xs uppercase tracking-[0.18em] text-eldra-text-faint transition hover:text-eldra-text-strong disabled:opacity-50"
        :disabled="busy"
        @click="resetOptions"
      >
        Use theme defaults
      </button>

      <span v-if="message" class="text-xs text-eldra-text-soft" role="status">{{ message }}</span>
    </div>
  </section>
</template>
