<script setup lang="ts">
import { onMounted, ref } from 'vue'

const open = ref(false)
const imageUrl = ref('')
const selectedTheme = ref('midnight')

const themes = [
  { key: 'midnight', label: 'Midnight', bg: '#0f172a' },
  { key: 'slate', label: 'Slate', bg: '#1e293b' },
  { key: 'ink', label: 'Ink', bg: '#111827' },
  { key: 'forest', label: 'Forest', bg: '#1f3a2e' },
  { key: 'ember', label: 'Ember', bg: '#3b1f1f' },
  { key: 'parchment', label: 'Parchment', bg: '#2a241c' }
]

function applyTheme(bg: string, image: string) {
  document.documentElement.style.setProperty('--article-bg', bg)
  document.documentElement.style.setProperty('--article-bg-image', image || 'none')
}

function setTheme(key: string, bg: string) {
  selectedTheme.value = key
  applyTheme(bg, imageUrl.value ? `url("${imageUrl.value}")` : 'none')
  window.localStorage.setItem('eldra:themeKey', key)
  window.localStorage.setItem('eldra:articleBg', bg)
}

function saveImageUrl() {
  const image = imageUrl.value.trim() ? `url("${imageUrl.value.trim()}")` : 'none'
  applyTheme(window.localStorage.getItem('eldra:articleBg') || '#0f172a', image)
  window.localStorage.setItem('eldra:articleBgImage', image)
}

function clearImageUrl() {
  imageUrl.value = ''
  applyTheme(window.localStorage.getItem('eldra:articleBg') || '#0f172a', 'none')
  window.localStorage.setItem('eldra:articleBgImage', 'none')
}

onMounted(() => {
  const savedThemeKey = window.localStorage.getItem('eldra:themeKey') || 'midnight'
  const savedBg = window.localStorage.getItem('eldra:articleBg') || '#0f172a'
  const savedImage = window.localStorage.getItem('eldra:articleBgImage') || 'none'

  selectedTheme.value = savedThemeKey

  if (savedImage !== 'none') {
    imageUrl.value = savedImage.replace(/^url\(["']?/, '').replace(/["']?\)$/, '')
  }

  applyTheme(savedBg, savedImage)
})
</script>

<template>
  <div class="relative">
    <button
      type="button"
      class="inline-flex items-center gap-2 rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-neutral-200 hover:bg-neutral-800"
      @click="open = !open"
    >
      <span class="inline-block h-3 w-3 rounded-full border border-white/20 bg-[var(--article-bg)]" />
      Theme
    </button>

    <div
      v-if="open"
      class="absolute right-0 top-12 z-50 w-80 rounded-2xl border border-neutral-800 bg-neutral-950 p-4 shadow-2xl"
    >
      <div class="mb-3 text-sm font-semibold text-neutral-100">
        Article Theme
      </div>

      <div class="mb-4 grid grid-cols-2 gap-2">
        <button
          v-for="theme in themes"
          :key="theme.key"
          type="button"
          class="flex items-center gap-3 rounded-xl border px-3 py-2 text-left text-sm transition"
          :class="selectedTheme === theme.key ? 'border-neutral-500 bg-neutral-800 text-white' : 'border-neutral-800 bg-neutral-900 text-neutral-300 hover:bg-neutral-800'"
          @click="setTheme(theme.key, theme.bg)"
        >
          <span
            class="inline-block h-4 w-4 rounded-full border border-white/20"
            :style="{ backgroundColor: theme.bg }"
          />
          {{ theme.label }}
        </button>
      </div>

      <div class="mb-2 text-xs uppercase tracking-[0.2em] text-neutral-500">
        Background image
      </div>

      <input
        v-model="imageUrl"
        type="text"
        placeholder="https://example.com/background.jpg"
        class="mb-3 w-full rounded-xl border border-neutral-800 bg-neutral-900 px-3 py-2 text-sm text-neutral-200 outline-none placeholder:text-neutral-500"
      >

      <div class="flex gap-2">
        <button
          type="button"
          class="rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-neutral-200 hover:bg-neutral-800"
          @click="saveImageUrl"
        >
          Apply Image
        </button>
        <button
          type="button"
          class="rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-neutral-200 hover:bg-neutral-800"
          @click="clearImageUrl"
        >
          Clear
        </button>
      </div>
    </div>
  </div>
</template>
