<template>
  <div class="min-h-screen bg-neutral-950 text-neutral-100">
    <AppSidebar />

    <div
      :style="{ paddingLeft: collapsed ? '5rem' : '18rem' }"
      class="min-w-0"
    >
      <header class="fixed top-0 z-20 w-full border-b border-neutral-800 bg-neutral-950/80 backdrop-blur">
        <div class="mx-auto flex max-w-7xl items-center justify-between px-6 py-3">
          <div>
            <div class="text-xs uppercase tracking-[0.25em] text-neutral-500">Worldbuilding Hub</div>
            <div class="text-lg font-semibold text-neutral-100">Eldra</div>
          </div>

          <div class="flex items-center gap-3">
            <UInput icon="i-lucide-search" placeholder="Search the world..." class="w-64" />
            <ThemeChooser />
            <UButton color="neutral" variant="soft" icon="i-lucide-log-in">Login</UButton>
          </div>
        </div>
      </header>

      <!-- main content must sit below the fixed header -->
      <main class="mx-auto max-w-7xl px-6 py-28">
        <slot />
      </main>
    </div>
  </div>
</template>

<script setup lang="ts">
import ThemeChooser from '~/components/ThemeChooser.vue'
const collapsed = useSidebar()
</script>
