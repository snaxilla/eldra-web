<script setup lang="ts">
const route = useRoute()

const worldId = computed(() => {
  const match = route.path.match(/^\/worlds\/([^/]+)/)
  return match?.[1] || null
})

const { data: world } = await useFetch(
  () => worldId.value ? `/api/worlds/${worldId.value}` : null
)

const thumbUrl = computed(() => {
  return world.value?.banner_image_url || null
})
</script>

<template>
  <div
    v-if="worldId && world"
    class="mb-6 overflow-hidden rounded-[24px] border border-[#d7c4a0] bg-[#f8f2e8] shadow-[0_8px_22px_rgba(80,60,30,0.08)]"
  >
    <div class="flex items-center gap-4 p-4 md:p-5">
      <div
        v-if="thumbUrl"
        class="h-16 w-24 shrink-0 overflow-hidden rounded-xl border border-[#d7c4a0] bg-[#efe5d4]"
      >
        <img
          :src="thumbUrl"
          :alt="world.name"
          class="h-full w-full object-cover"
        >
      </div>

      <div class="min-w-0 flex-1">
        <div class="text-xs uppercase tracking-[0.35em] text-[#907a58]">
          Active World
        </div>

        <div class="mt-1 text-2xl font-semibold text-[#2f2419]">
          {{ world.name || 'Untitled World' }}
        </div>

        <div
          v-if="world.subtitle"
          class="mt-1 truncate text-sm text-[#5b4935]"
        >
          {{ world.subtitle }}
        </div>
      </div>

      <NuxtLink
        to="/"
        class="rounded-full border border-[#cfb07a] px-4 py-2 text-sm font-medium text-[#6b5333] transition hover:bg-[#b38a2e] hover:text-white"
      >
        Switch World
      </NuxtLink>
    </div>
  </div>
</template>
