<script setup lang="ts">
import { onMounted, ref } from 'vue'

const color = ref(localStorage.getItem('eldra:articleBg') || 'rgba(17,21,28,0.95)')
const image = ref(localStorage.getItem('eldra:articleBgImage') || 'none')

function apply() {
  document.documentElement.style.setProperty('--article-bg', color.value)
  document.documentElement.style.setProperty('--article-bg-image', image.value)
  localStorage.setItem('eldra:articleBg', color.value)
  localStorage.setItem('eldra:articleBgImage', image.value)
}

onMounted(() => {
  // ensure CSS vars set on load
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
    // store as CSS url()
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
    <UButton size="sm" variant="ghost" color="neutral" @click="pickImage" icon="i-lucide-image">
      Background Image
    </UButton>
  </div>
</template>
