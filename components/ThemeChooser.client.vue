<script setup lang="ts">
import { onMounted, ref } from 'vue'

const color = ref('#0b1220')
const image = ref('none')
const mounted = ref(false)

function applyTheme() {
  document.documentElement.style.setProperty('--article-bg', color.value)
  document.documentElement.style.setProperty('--article-bg-image', image.value)
}

onMounted(() => {
  const savedColor = window.localStorage.getItem('eldra:articleBg')
  const savedImage = window.localStorage.getItem('eldra:articleBgImage')

  if (savedColor) color.value = savedColor
  if (savedImage) image.value = savedImage

  applyTheme()
  mounted.value = true
})

function pickColor(e: Event) {
  const value = (e.target as HTMLInputElement).value
  color.value = value
  applyTheme()
  window.localStorage.setItem('eldra:articleBg', color.value)
}

function pickImage() {
  const url = window.prompt('Enter image URL (leave blank to disable):', '')
  if (!url) {
    image.value = 'none'
  } else {
    image.value = `url('${url.replace(/'/g, "\\'")}')`
  }

  applyTheme()
  window.localStorage.setItem('eldra:articleBgImage', image.value)
}
</script>

<template>
  <div v-if="mounted" class="flex items-center gap-3">
    <input
      type="color"
      :value="color"
      @input="pickColor"
      title="Choose article background color"
      class="h-8 w-8 rounded border border-neutral-700 bg-transparent"
    />
    <button
      type="button"
      class="inline-flex items-center gap-2 rounded-lg border border-neutral-700 px-3 py-2 text-sm text-neutral-200 hover:bg-neutral-900"
      @click="pickImage"
    >
      Background
    </button>
  </div>
</template>
