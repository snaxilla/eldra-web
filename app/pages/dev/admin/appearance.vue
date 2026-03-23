<script setup lang="ts">
const sidebarImage = ref<string | null>(null)
const loading = ref(false)

async function load() {
  const res = await $fetch('/api/admin/app-settings')
  sidebarImage.value = res.sidebar_image_url
}

onMounted(load)

async function upload(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return

  loading.value = true

  try {
    const formData = new FormData()
    formData.append('file', file)

    const uploadRes = await $fetch<{ file_id: string }>('/api/admin/upload-setting-image', {
      method: 'POST',
      body: formData
    })

    await $fetch('/api/admin/app-settings', {
      method: 'PATCH',
      body: {
        sidebar_image: uploadRes.file_id
      }
    })

    await load()
  } catch (e) {
    console.error(e)
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="space-y-6">
    <h1 class="text-2xl font-semibold">Appearance</h1>

    <div class="rounded-xl border border-[#d7c4a0] bg-[#f8f2e8] p-5">
      <div class="mb-3 font-medium">Sidebar Image</div>

      <img
        v-if="sidebarImage"
        :src="sidebarImage"
        class="mb-4 h-40 w-full object-cover rounded-lg"
      />

      <input type="file" accept="image/*" @change="upload" />

      <div v-if="loading" class="mt-2 text-sm">
        Uploading...
      </div>
    </div>
  </div>
</template>
