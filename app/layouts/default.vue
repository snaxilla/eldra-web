<script setup lang="ts">
const collapsed = ref(false)

const navItems = [
  { label: 'Worlds', to: '/dev/worlds', icon: 'i-lucide-globe-2' },
  { label: 'Entities', to: '/dev/entities', icon: 'i-lucide-scroll-text' },
  { label: 'Maps', to: '/dev/maps', icon: 'i-lucide-map' }
]
</script>

<template>
  <div class="h-screen overflow-hidden bg-[#16110d] text-white">
    <div class="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(120,86,43,0.18),transparent_32%),radial-gradient(circle_at_top_right,rgba(214,178,94,0.08),transparent_22%),linear-gradient(180deg,#1a1410_0%,#130f0c_45%,#0d0a08_100%)]" />

    <aside
      :class="collapsed ? 'w-20' : 'w-72'"
      class="fixed inset-y-0 left-0 z-40 overflow-hidden border-r border-[#b89a5a]/20 transition-all duration-300"
    >
      <div class="absolute inset-0">
        <img
          src="https://picsum.photos/seed/eldra-sidebar/900/1600"
          alt="Sidebar background"
          class="h-full w-full object-cover"
        >
        <div class="absolute inset-0 bg-gradient-to-b from-black/70 via-black/55 to-black/80" />
        <div class="absolute inset-0 bg-[#2b2012]/25" />
      </div>

      <div class="relative flex h-full flex-col backdrop-blur-[2px]">
        <div class="flex h-24 items-center justify-between px-4">
          <div v-if="!collapsed" class="min-w-0">
            <div class="text-2xl font-semibold tracking-wide text-[#f5efe2]">
              Eldra
            </div>
            <div class="text-xs uppercase tracking-[0.35em] text-[#d6c19a]/70">
              Worldbuilding
            </div>
          </div>

          <button
            class="inline-flex h-11 w-11 items-center justify-center rounded-xl border border-[#d6b25e]/25 bg-black/25 text-[#f3dfb0] transition hover:bg-black/40 hover:text-white"
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
            class="mb-3 px-3 text-xs uppercase tracking-[0.3em] text-[#d6c19a]/55"
          >
            Navigation
          </div>

          <NuxtLink
            v-for="item in navItems"
            :key="item.to"
            :to="item.to"
            class="group mb-2 flex items-center gap-3 rounded-2xl border border-transparent px-3 py-3 text-[#f2ead8]/80 transition hover:border-[#d6b25e]/20 hover:bg-black/25 hover:text-white"
            active-class="border-[#d6b25e]/30 bg-[rgba(214,178,94,0.12)] text-white shadow-[0_0_0_1px_rgba(214,178,94,0.06)]"
          >
            <UIcon :name="item.icon" class="h-5 w-5 shrink-0" />
            <span v-if="!collapsed" class="truncate text-sm font-medium">
              {{ item.label }}
            </span>
          </NuxtLink>
        </nav>

        <div v-if="!collapsed" class="mt-auto px-3 pb-3">
          <div class="rounded-2xl border border-[#d6b25e]/20 bg-black/25 p-4">
            <div class="text-xs uppercase tracking-[0.25em] text-[#d6c19a]/55">
              Eldra Dev
            </div>
            <div class="mt-2 text-sm text-[#f2ead8]/80">
              Forge the world first. Polish the tools second.
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
        <slot />
      </div>
    </main>
  </div>
</template>
