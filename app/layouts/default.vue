<script setup lang="ts">
const collapsed = ref(false)

const navItems = [
  { label: 'Worlds', to: '/dev/worlds', icon: 'i-lucide-globe-2' },
  { label: 'Entities', to: '/dev/entities', icon: 'i-lucide-scroll-text' },
  { label: 'Maps', to: '/dev/maps', icon: 'i-lucide-map' }
]
</script>

<template>
  <div class="min-h-screen bg-[#08111f] text-white">
    <div class="flex min-h-screen">

      <!-- Sidebar -->
      <aside
        :class="collapsed ? 'w-20' : 'w-72'"
        class="relative overflow-hidden border-r border-white/10 transition-all duration-300"
      >
        <!-- Background Image -->
        <div class="absolute inset-0">
          <img
            src="https://picsum.photos/600/1200"
            class="h-full w-full object-cover"
          >
          <div class="absolute inset-0 bg-black/70 backdrop-blur-[2px]" />
        </div>

        <!-- Content Layer -->
        <div class="relative flex h-full flex-col">

          <!-- Header -->
          <div class="flex h-20 items-center justify-between px-4">
            <div v-if="!collapsed" class="min-w-0">
              <div class="text-2xl font-semibold tracking-wide text-white">
                Eldra
              </div>
              <div class="text-xs uppercase tracking-[0.35em] text-white/40">
                Worldbuilding
              </div>
            </div>

            <button
              class="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-white/10 text-white/70 transition hover:bg-white/20 hover:text-white"
              @click="collapsed = !collapsed"
            >
              <UIcon
                :name="collapsed ? 'i-lucide-panel-left-open' : 'i-lucide-panel-left-close'"
                class="h-5 w-5"
              />
            </button>
          </div>

          <!-- Nav -->
          <nav class="px-3 pb-6">
            <div class="mb-3 px-3 text-xs uppercase tracking-[0.3em] text-white/30" v-if="!collapsed">
              Navigation
            </div>

            <NuxtLink
              v-for="item in navItems"
              :key="item.to"
              :to="item.to"
              class="group mb-2 flex items-center gap-3 rounded-2xl border border-transparent px-3 py-3 text-white/75 transition hover:border-white/10 hover:bg-white/10 hover:text-white"
              active-class="border-white/20 bg-white/20 text-white"
            >
              <UIcon :name="item.icon" class="h-5 w-5 shrink-0" />
              <span v-if="!collapsed" class="truncate text-sm font-medium">
                {{ item.label }}
              </span>
            </NuxtLink>
          </nav>

          <!-- Footer -->
          <div
            v-if="!collapsed"
            class="mt-auto px-3 pb-3"
          >
            <div class="rounded-2xl border border-white/10 bg-white/10 p-4">
              <div class="text-xs uppercase tracking-[0.25em] text-white/40">
                Eldra Dev
              </div>
              <div class="mt-2 text-sm text-white/80">
                Building something dangerous.
              </div>
            </div>
          </div>

        </div>
      </aside>

      <!-- Main -->
      <main class="flex-1">
        <div class="mx-auto max-w-7xl px-6 py-8 md:px-8">
          <slot />
        </div>
      </main>

    </div>
  </div>
</template>
