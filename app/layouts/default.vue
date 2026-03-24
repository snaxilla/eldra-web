<script setup lang="ts">
const collapsed = ref(false)
const route = useRoute()
const sidebarImage = ref<string | null>(null)

const activeWorldId = computed(() => {
  const match = route.path.match(/^\/worlds\/([^/]+)/)
  return match?.[1] || null
})

const navItems = computed(() => {
  const worldId = activeWorldId.value

  return [
    { label: 'Worlds', to: '/', icon: 'i-lucide-globe-2' },
    { label: 'Entities', to: worldId ? `/worlds/${worldId}/entities` : '/', icon: 'i-lucide-scroll-text' },
    { label: 'Maps', to: worldId ? `/worlds/${worldId}/maps` : '/', icon: 'i-lucide-map' }
  ]
})

async function loadSidebarImage() {
  try {
    if (activeWorldId.value) {
      const world = await $fetch<{ sidebar_image_url?: string | null }>(`/api/worlds/${activeWorldId.value}`)
      if (world?.sidebar_image_url) {
        sidebarImage.value = world.sidebar_image_url
        return
      }
    }

    const appSettings = await $fetch<{ sidebar_image_url?: string | null }>('/api/admin/app-settings')
    sidebarImage.value = appSettings?.sidebar_image_url || null
  } catch (e) {
    console.error('Failed to load sidebar image', e)
    sidebarImage.value = null
  }
}

onMounted(loadSidebarImage)

watch(
  () => route.fullPath,
  () => {
    loadSidebarImage()
  }
)
</script>

<template>
  <div class="h-screen overflow-hidden bg-[#ece3d4] text-[#2f2419]">
    <div class="absolute inset-0 bg-[linear-gradient(180deg,#f3ecdf_0%,#e9decd_100%)]" />

    <aside
      :class="collapsed ? 'w-20' : 'w-72'"
      class="fixed inset-y-0 left-0 z-40 overflow-hidden border-r border-[#b89a5a]/25 transition-all duration-300"
    >
      <div class="absolute inset-0">
        <img
          :src="sidebarImage || 'https://picsum.photos/seed/eldra-sidebar/900/1600'"
          alt="Sidebar background"
          class="h-full w-full object-cover"
        >
        <div class="absolute inset-0 bg-gradient-to-b from-black/50 via-black/35 to-black/55" />
        <div class="absolute inset-0 bg-[#3a2b18]/18" />
      </div>

      <div class="relative flex h-full flex-col backdrop-blur-[2px]">
        <div class="flex h-24 items-center justify-between px-4">
          <div v-if="!collapsed" class="min-w-0">
            <div class="text-2xl font-semibold tracking-wide text-[#fff8ec]">
              Eldra
            </div>
            <div class="text-xs uppercase tracking-[0.35em] text-[#ead7ae]/85">
              Worldbuilding
            </div>
          </div>

          <button
            class="inline-flex h-11 w-11 items-center justify-center rounded-xl border border-[#e2c27a]/35 bg-black/20 text-[#f3dfb0] transition hover:bg-black/30 hover:text-white"
            @click="collapsed = !collapsed"
          >
            <UIcon
              :name="collapsed ? 'i-lucide-panel-left-open' : 'i-lucide-panel-left-close'"
              class="h-5 w-5"
            />
          </button>
        </div>

        <nav class="px-3 pb-6">
          <div
            v-if="!collapsed"
            class="mb-3 px-3 text-xs uppercase tracking-[0.3em] text-[#f0dfb8]/75"
          >
            Navigation
          </div>

          <NuxtLink
            v-for="item in navItems"
            :key="item.to + item.label"
            :to="item.to"
            class="group mb-2 flex items-center gap-3 rounded-2xl border border-transparent px-3 py-3 text-[#fff4de]/85 transition hover:border-[#e2c27a]/30 hover:bg-black/20 hover:text-white"
            active-class="border-[#e2c27a]/35 bg-[rgba(255,248,231,0.16)] text-white shadow-[0_0_0_1px_rgba(226,194,122,0.08)]"
          >
            <UIcon :name="item.icon" class="h-5 w-5 shrink-0" />
            <span v-if="!collapsed" class="truncate text-sm font-medium">
              {{ item.label }}
            </span>
          </NuxtLink>
        </nav>

        <div v-if="!collapsed" class="mt-auto px-3 pb-3">
          <div class="rounded-2xl border border-[#e2c27a]/30 bg-black/20 p-4">
            <div class="text-xs uppercase tracking-[0.25em] text-[#f0dfb8]/75">
              Eldra Dev
            </div>
            <div class="mt-2 text-sm text-[#fff4de]/88">
              Build the world. Make it inviting.
            </div>
          </div>
        </div>
      </div>
    </aside>

    <main
      :class="collapsed ? 'ml-20' : 'ml-72'"
      class="relative z-10 h-screen overflow-y-auto transition-all duration-300"
    >
      <div class="mx-auto max-w-7xl px-6 py-8 md:px-8">
        <WorldContextBar />
        <slot />
      </div>
    </main>
  </div>
</template>
