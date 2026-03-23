<script setup lang="ts">
const sidebarImage = ref<string | null>(null)
const selectedFile = ref<File | null>(null)

const loading = ref(false)
const message = ref('')

async function load() {
  const res = await $fetch('/api/admin/app-settings')
  sidebarImage.value = res.sidebar_image_url
}

onMounted(load)

function onFileChange(event: Event) {
  const input = event.target as HTMLInputElement
  selectedFile.value = input.files?.[0] || null
}

async function apply() {
  if (!selectedFile.value) return

  loading.value = true
  message.value = ''

  try {
    const formData = new FormData()
    formData.append('file', selectedFile.value)

    // upload to Directus
    const uploadRes = await $fetch<{ file_id: string }>('/api/admin/upload-setting-image', {
      method: 'POST',
      body: formData
    })

    // save to settings
    await $fetch('/api/admin/app-settings', {
      method: 'PATCH',
      body: {
        sidebar_image: uploadRes.file_id
      }
    })

    message.value = '✅ Sidebar image updated'
    selectedFile.value = null

    await load()
  } catch (e) {
    console.error(e)
    message.value = '❌ Failed to update sidebar image'
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="space-y-6">
    <h1 class="text-2xl font-semibold">Appearance</h1>

    <div class="rounded-xl border border-[#d7c4a0] bg-[#f8f2e8] p-5 space-y-4">
      <div class="font-medium">Sidebar Image</div>

      <img
        v-if="sidebarImage"
        :src="sidebarImage"
        class="h-40 w-full object-cover rounded-lg border"
      />

      <input type="file" accept="image/*" @change="onFileChange" />

      <button
        class="px-4 py-2 rounded-lg bg-[#b38a2e] text-white disabled:opacity-50"
        :disabled="!selectedFile || loading"
        @click="apply"
      >
        {{ loading ? 'Uploading...' : 'Apply' }}
      </button>

      <div v-if="message" class="text-sm">
        {{ message }}
      </div>
    </div>
  </div>
</template>
