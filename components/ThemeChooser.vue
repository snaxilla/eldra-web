<script setup lang="ts">
import { onMounted, ref } from 'vue'

const color = ref(localStorage.getItem('eldra:articleBg') || '#0b1220')
const image = ref(localStorage.getItem('eldra:articleBgImage') || 'none')

function apply() {
  document.documentElement.style.setProperty('--article-bg', color.value)
  document.documentElement.style.setProperty('--article-bg-image', image.value)
  localStorage.setItem('eldra:articleBg', color.value)
  localStorage.setItem('eldra:articleBgImage', image.value)
}

onMounted(() => {
  apply()
})

function pickColor(e: Event) {
  const c = (e.target as HTMLInputElement).value
  color.value = c
  apply()
}

function pickImage() {
  const url = prompt('Enter image URL (leave blank to disable):', '')
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
    <button type="button" class="inline-flex items-center gap-2 rounded px-3 py-1 text-sm border border-neutral-700 hover:bg-neutral-900"
      @click="pickImage"
    >
      <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M21 15v4a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h4" stroke-width="1.5"/></svg>
      Background Image
    </button>
  </div>
</template>
