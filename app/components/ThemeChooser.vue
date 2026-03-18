<script setup lang="ts">
import { onMounted, ref, watch } from 'vue'

const { theme } = useThemeStyles()

const open = ref(false)
const pageImageUrl = ref('')

const themeOptions = [
  { key: 'midnight', label: 'Midnight', pageBg: '#020617', panelBg: '#0f172a' },
  { key: 'forest', label: 'Forest', pageBg: '#081c15', panelBg: '#1b4332' },
  { key: 'ember', label: 'Ember', pageBg: '#1a0f0f', panelBg: '#3b1f1f' },
  { key: 'parchment', label: 'Parchment', pageBg: '#2b2620', panelBg: '#4a4032' },
  { key: 'storm', label: 'Storm', pageBg: '#0b132b', panelBg: '#1c2541' },
  { key: 'plum', label: 'Plum', pageBg: '#140f1f', panelBg: '#2d1e40' },
  { key: 'rose', label: 'Rose', pageBg: '#2f1f2c', panelBg: '#b57aa1' },
  { key: 'lilac', label: 'Lilac', pageBg: '#1c1730', panelBg: '#7f6bb3' }
]

function setPreset(preset: { key: string, pageBg: string, panelBg: string }) {
  theme.value.key = preset.key
  theme.value.pageBg = preset.pageBg
  theme.value.panelBg = preset.panelBg
}

function applyPageImage() {
  theme.value.pageBgImage = pageImageUrl.value.trim()
}

function clearImage() {
  pageImageUrl.value = ''
  theme.value.pageBgImage = ''
}

onMounted(() => {
  const raw = window.localStorage.getItem('eldra:theme')
  if (raw) {
    try {
      const saved = JSON.parse(raw)
      theme.value = {
        key: saved.key || 'midnight',
        pageBg: saved.pageBg || '#020617',
        panelBg: saved.panelBg || '#0f172a',
        pageBgImage: saved.pageBgImage || ''
      }
    } catch {}
  }

  pageImageUrl.value = theme.value.pageBgImage || ''
})

watch(
  theme,
  (value) => {
    if (import.meta.client) {
      window.localStorage.setItem('eldra:theme', JSON.stringify(value))
    }
  },
  { deep: true }
)
</script>

<template>
  <div class="relative">
    <button
      type="button"
      class="inline-flex items-center gap-2 rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-neutral-200 hover:bg-neutral-800"
      @click="open = !open"
    >
      <span class="inline-block h-3 w-3 rounded-full border border-white/20" :style="{ backgroundColor: theme.panelBg }" />
      Theme
    </button>

    <div
      v-if="open"
      class="absolute right-0 top-12 z-50 w-[28rem] rounded-2xl border border-neutral-800 bg-neutral-950 p-4 shadow-2xl"
    >
      <div class="mb-3 text-sm font-semibold text-neutral-100">
        Eldra Theme
      </div>

      <div class="mb-2 text-xs uppercase tracking-[0.2em] text-neutral-500">
        Presets
      </div>

      <div class="mb-4 grid grid-cols-2 gap-2">
        <button
          v-for="preset in themeOptions"
          :key="preset.key"
          type="button"
          class="flex items-center gap-3 rounded-xl border px-3 py-2 text-left text-sm transition"
          :class="theme.key === preset.key ? 'border-neutral-500 bg-neutral-800 text-white' : 'border-neutral-800 bg-neutral-900 text-neutral-300 hover:bg-neutral-800'"
          @click="setPreset(preset)"
        >
          <span class="flex gap-1">
            <span class="inline-block h-4 w-4 rounded-full border border-white/20" :style="{ backgroundColor: preset.pageBg }" />
            <span class="inline-block h-4 w-4 rounded-full border border-white/20" :style="{ backgroundColor: preset.panelBg }" />
          </span>
          {{ preset.label }}
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
      <div class="flex gap-2">
        <button
          type="button"
          class="rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-neutral-200 hover:bg-neutral-800"
          @click="applyPageImage"
        >
          Apply Image
        </button>
        <button
          type="button"
          class="rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-neutral-200 hover:bg-neutral-800"
          @click="clearImage"
        >
          Clear
        </button>
      </div>
    </div>
  </div>
</template>
