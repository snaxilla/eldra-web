<script setup lang="ts">
import { onMounted, ref } from 'vue'

const color = ref('#0b1220')
const image = ref('none')

function apply() {
  if (!import.meta.client) return

  document.documentElement.style.setProperty('--article-bg', color.value)
  document.documentElement.style.setProperty('--article-bg-image', image.value)

  localStorage.setItem('eldra:articleBg', color.value)
  localStorage.setItem('eldra:articleBgImage', image.value)
}

onMounted(() => {
  if (!import.meta.client) return

  const savedColor = localStorage.getItem('eldra:articleBg')
  const savedImage = localStorage.getItem('eldra:articleBgImage')

  if (savedColor) color.value = savedColor
  if (savedImage) image.value = savedImage

  apply()
})

function pickColor(e: Event) {
  const c = (e.target as HTMLInputElement).value
  color.value = c
  apply()
}

function pickImage() {
  if (!import.meta.client) return

  const url = window.prompt('Enter image URL (leave blank to disable):', '')
  if (!url) {
    image.value = 'none'
  } else {
    image.value = `url('${url.replace(/'/g, "\\'")}')`
  }

  apply()
}
</script>

<template>
  <div class="flex items-center gap-3">
    <input
      type="color"
      :value="color"
      @input="pickColor"
      title="Choose article background color"
      class="h-8 w-8 rounded"
    />
    <button
      type="button"
      class="inline-flex items-center gap-2 rounded px-3 py-1 text-sm border border-neutral-700 hover:bg-neutral-900"
      @click="pickImage"
    >
      Background Image
    </button>
  </div>
</template>
