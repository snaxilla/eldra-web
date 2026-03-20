<script setup lang="ts">
import EntityBlockCard from '~/components/EntityBlockCard.vue'
import EntityTypeBadge from '~/components/EntityTypeBadge.vue'

const route = useRoute()
const entityId = computed(() => String(route.params.id || ''))

const { data, error, refresh } = await useFetch(() => `/api/entities/${entityId.value}`)

const uploadError = ref('')
const uploadSuccess = ref('')
const uploadingBlockKey = ref('')

async function uploadImage(blockKey: string, files: FileList | null) {
  uploadError.value = ''
  uploadSuccess.value = ''

  const file = files?.[0]
  if (!file) return

  uploadingBlockKey.value = blockKey

  try {
    const form = new FormData()
    form.append('title', `${data.value?.entity?.title || 'Entity'} image`)
    form.append('file', file)

    await $fetch(`/api/entities/${entityId.value}/blocks/${blockKey}/upload-image`, {
      method: 'POST',
      body: form
    })

    uploadSuccess.value = `Uploaded image for ${blockKey}`
    await refresh()
  } catch (error: any) {
    uploadError.value =
      error?.data?.statusMessage ||
      error?.statusMessage ||
      'Image upload failed'
  } finally {
    uploadingBlockKey.value = ''
  }
}
</script>

<template>
  <div class="min-h-screen bg-neutral-950 px-6 py-10 text-neutral-100">
    <div class="mx-auto max-w-6xl">
      <div v-if="error" class="rounded-2xl border border-red-900 bg-red-950/40 p-4 text-red-300">
        Failed to load entity.
      </div>

      <template v-else-if="data">
        <div class="mb-8 flex flex-wrap items-start justify-between gap-4">
          <div>
            <div class="text-xs uppercase tracking-[0.3em] text-neutral-500">
              {{ data.world?.name || 'Unknown World' }}
            </div>
            <h1 class="mt-2 text-3xl font-bold">
              {{ data.entity.title }}
            </h1>
            <div class="mt-2 flex flex-wrap items-center gap-3">
              <EntityTypeBadge :type="data.entity.entityType" />
              <span class="rounded-full border border-neutral-700 bg-neutral-900 px-3 py-1 text-xs text-neutral-300">
                {{ data.entity.status }}
              </span>
              <span class="rounded-full border border-neutral-700 bg-neutral-900 px-3 py-1 text-xs text-neutral-300">
                {{ data.entity.visibility }}
              </span>
            </div>
          </div>

          <NuxtLink
            to="/dev/worlds"
            class="rounded-xl border border-neutral-700 bg-neutral-900 px-4 py-3 text-sm text-neutral-200 hover:bg-neutral-800"
          >
            Back to Worlds
          </NuxtLink>
        </div>

        <div class="mb-6 grid gap-4 md:grid-cols-2">
          <div class="rounded-2xl border border-neutral-800 bg-neutral-900 p-4">
            <div class="text-xs uppercase tracking-[0.2em] text-neutral-500">Slug</div>
            <div class="mt-2 text-sm text-neutral-200">{{ data.entity.slug }}</div>
          </div>

          <div class="rounded-2xl border border-neutral-800 bg-neutral-900 p-4">
            <div class="text-xs uppercase tracking-[0.2em] text-neutral-500">Updated</div>
            <div class="mt-2 text-sm text-neutral-200">{{ data.entity.updatedAt || '—' }}</div>
          </div>
        </div>

        <div v-if="uploadSuccess" class="mb-4 rounded-xl border border-emerald-900 bg-emerald-950/40 p-4 text-emerald-300">
          {{ uploadSuccess }}
        </div>

        <div v-if="uploadError" class="mb-4 rounded-xl border border-red-900 bg-red-950/40 p-4 text-red-300">
          {{ uploadError }}
        </div>

        <div class="grid gap-6">
          <div
            v-for="block in data.blocks"
            :key="block.id"
            class="space-y-3"
          >
            <div class="flex flex-wrap items-center justify-between gap-3">
              <div class="text-sm text-neutral-400">
                Upload image into <span class="font-semibold text-neutral-200">{{ block.blockKey }}</span>
              </div>

              <label class="cursor-pointer rounded-xl border border-neutral-700 bg-neutral-900 px-4 py-3 text-sm text-neutral-200 hover:bg-neutral-800">
                <span>{{ uploadingBlockKey === block.blockKey ? 'Uploading...' : 'Choose Image' }}</span>
                <input
                  type="file"
                  accept="image/*"
                  class="hidden"
                  @change="uploadImage(block.blockKey, ($event.target as HTMLInputElement).files)"
                >
              </label>
            </div>

            <EntityBlockCard :block="block" />
          </div>
        </div>
      </template>
    </div>
  </div>
</template>
