<script setup lang="ts">
import { onMounted, ref } from 'vue'

const color = ref('#0b1220')
const image = ref('none')
const ready = ref(false)

function apply() {
  document.documentElement.style.setProperty('--article-bg', color.value)
  document.documentElement.style.setProperty('--article-bg-image', image.value)
}

onMounted(() => {
  const savedColor = window.localStorage.getItem('eldra:articleBg')
  const savedImage = window.localStorage.getItem('eldra:articleBgImage')

  if (savedColor) color.value = savedColor
  if (savedImage) image.value = savedImage

  apply()
  ready.value = true
})

function pickColor(e: Event) {
  const c = (e.target as HTMLInputElement).value
  color.value = c
  apply()
  window.localStorage.setItem('eldra:articleBg', color.value)
}

function pickImage() {
  const url = window.prompt('Enter image URL (leave blank to disable):', '')
  if (!url) {
    image.value = 'none'
  } else {
    image.value = `url('${url.replace(/'/g, "\\'")}')`
  }

  apply()
  window.localStorage.setItem('eldra:articleBgImage', image.value)
}
</script>

<template>
  <div v-if="ready" class="flex items-center gap-3">
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
