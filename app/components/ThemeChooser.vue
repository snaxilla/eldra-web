<script setup lang="ts">
import { onMounted, ref } from 'vue'

const open = ref(false)

const themeOptions = [
  {
    key: 'midnight',
    label: 'Midnight',
    page: '#020617',
    panel: '#0f172a'
  },
  {
    key: 'forest',
    label: 'Forest',
    page: '#081c15',
    panel: '#1b4332'
  },
  {
    key: 'ember',
    label: 'Ember',
    page: '#1a0f0f',
    panel: '#3b1f1f'
  },
  {
    key: 'parchment',
    label: 'Parchment',
    page: '#2b2620',
    panel: '#4a4032'
  },
  {
    key: 'storm',
    label: 'Storm',
    page: '#0b132b',
    panel: '#1c2541'
  },
  {
    key: 'plum',
    label: 'Plum',
    page: '#140f1f',
    panel: '#2d1e40'
  }
]

const selectedTheme = ref('midnight')
const pageImageUrl = ref('')
const panelImageUrl = ref('')

function applyTheme(page: string, panel: string, pageImage: string, panelImage: string) {
  document.documentElement.style.setProperty('--page-bg', page)
  document.documentElement.style.setProperty('--panel-bg', panel)
  document.documentElement.style.setProperty('--page-bg-image', pageImage || 'none')
  document.documentElement.style.setProperty('--panel-bg-image', panelImage || 'none')
}

function saveTheme(key: string, page: string, panel: string) {
  selectedTheme.value = key
  const pageImage = window.localStorage.getItem('eldra:pageBgImage') || 'none'
  const panelImage = window.localStorage.getItem('eldra:panelBgImage') || 'none'

  applyTheme(page, panel, pageImage, panelImage)

  window.localStorage.setItem('eldra:themeKey', key)
  window.localStorage.setItem('eldra:pageBg', page)
  window.localStorage.setItem('eldra:panelBg', panel)
}

function savePageImage() {
  const value = pageImageUrl.value.trim()
  const cssValue = value ? `url("${value}")` : 'none'
  const page = window.localStorage.getItem('eldra:pageBg') || '#020617'
  const panel = window.localStorage.getItem('eldra:panelBg') || '#0f172a'
  const panelImage = window.localStorage.getItem('eldra:panelBgImage') || 'none'

  applyTheme(page, panel, cssValue, panelImage)
  window.localStorage.setItem('eldra:pageBgImage', cssValue)
}

function savePanelImage() {
  const value = panelImageUrl.value.trim()
  const cssValue = value ? `url("${value}")` : 'none'
  const page = window.localStorage.getItem('eldra:pageBg') || '#020617'
  const panel = window.localStorage.getItem('eldra:panelBg') || '#0f172a'
  const pageImage = window.localStorage.getItem('eldra:pageBgImage') || 'none'

  applyTheme(page, panel, pageImage, cssValue)
  window.localStorage.setItem('eldra:panelBgImage', cssValue)
}

function clearImages() {
  pageImageUrl.value = ''
  panelImageUrl.value = ''

  const page = window.localStorage.getItem('eldra:pageBg') || '#020617'
  const panel = window.localStorage.getItem('eldra:panelBg') || '#0f172a'

  applyTheme(page, panel, 'none', 'none')
  window.localStorage.setItem('eldra:pageBgImage', 'none')
  window.localStorage.setItem('eldra:panelBgImage', 'none')
}

onMounted(() => {
  const savedThemeKey = window.localStorage.getItem('eldra:themeKey') || 'midnight'
  const savedPage = window.localStorage.getItem('eldra:pageBg') || '#020617'
  const savedPanel = window.localStorage.getItem('eldra:panelBg') || '#0f172a'
  const savedPageImage = window.localStorage.getItem('eldra:pageBgImage') || 'none'
  const savedPanelImage = window.localStorage.getItem('eldra:panelBgImage') || 'none'

  selectedTheme.value = savedThemeKey

  if (savedPageImage !== 'none') {
    pageImageUrl.value = savedPageImage.replace(/^url\(["']?/, '').replace(/["']?\)$/, '')
  }

  if (savedPanelImage !== 'none') {
    panelImageUrl.value = savedPanelImage.replace(/^url\(["']?/, '').replace(/["']?\)$/, '')
  }

  applyTheme(savedPage, savedPanel, savedPageImage, savedPanelImage)
})
</script>

<template>
  <div class="relative">
    <button
      type="button"
      class="inline-flex items-center gap-2 rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-neutral-200 hover:bg-neutral-800"
      @click="open = !open"
    >
      <span class="inline-block h-3 w-3 rounded-full border border-white/20 bg-[var(--panel-bg)]" />
      Theme
    </button>

    <div
      v-if="open"
      class="absolute right-0 top-12 z-50 w-96 rounded-2xl border border-neutral-800 bg-neutral-950 p-4 shadow-2xl"
    >
      <div class="mb-3 text-sm font-semibold text-neutral-100">
        Eldra Theme
      </div>

      <div class="mb-2 text-xs uppercase tracking-[0.2em] text-neutral-500">
        Presets
      </div>

      <div class="mb-4 grid grid-cols-2 gap-2">
        <button
          v-for="theme in themeOptions"
          :key="theme.key"
          type="button"
          class="flex items-center gap-3 rounded-xl border px-3 py-2 text-left text-sm transition"
          :class="selectedTheme === theme.key ? 'border-neutral-500 bg-neutral-800 text-white' : 'border-neutral-800 bg-neutral-900 text-neutral-300 hover:bg-neutral-800'"
          @click="saveTheme(theme.key, theme.page, theme.panel)"
        >
          <span class="flex gap-1">
            <span class="inline-block h-4 w-4 rounded-full border border-white/20" :style="{ backgroundColor: theme.page }" />
            <span class="inline-block h-4 w-4 rounded-full border border-white/20" :style="{ backgroundColor: theme.panel }" />
          </span>
          {{ theme.label }}
        </button>
      </div>

      <div class="mb-2 text-xs uppercase tracking-[0.2em] text-neutral-500">
        Page background image
      </div>
      <input
        v-model="pageImageUrl"
        type="text"
        placeholder="https://example.com/page-bg.jpg"
        class="mb-3 w-full rounded-xl border border-neutral-800 bg-neutral-900 px-3 py-2 text-sm text-neutral-200 outline-none placeholder:text-neutral-500"
      />
      <button
        type="button"
        class="mb-4 rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-neutral-200 hover:bg-neutral-800"
        @click="savePageImage"
      >
        Apply Page Image
      </button>

      <div class="mb-2 text-xs uppercase tracking-[0.2em] text-neutral-500">
        Panel background image
      </div>
      <input
        v-model="panelImageUrl"
        type="text"
        placeholder="https://example.com/panel-bg.jpg"
        class="mb-3 w-full rounded-xl border border-neutral-800 bg-neutral-900 px-3 py-2 text-sm text-neutral-200 outline-none placeholder:text-neutral-500"
      />
      <div class="flex gap-2">
        <button
          type="button"
          class="rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-neutral-200 hover:bg-neutral-800"
          @click="savePanelImage"
        >
          Apply Panel Image
        </button>
        <button
          type="button"
          class="rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-neutral-200 hover:bg-neutral-800"
          @click="clearImages"
        >
          Clear Images
        </button>
      </div>
    </div>
  </div>
</template>
