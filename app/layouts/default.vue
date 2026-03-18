<template>
  <div class="min-h-screen bg-neutral-950 text-neutral-100">
    <AppSidebar />

    <div
      :style="{
        marginLeft: collapsed ? '5rem' : '18rem'
      }"
      class="min-h-screen transition-all duration-200"
    >
      <header
        :style="{
          left: collapsed ? '5rem' : '18rem',
          width: collapsed ? 'calc(100% - 5rem)' : 'calc(100% - 18rem)'
        }"
        class="fixed top-0 z-30 border-b border-neutral-800 bg-neutral-950/90 backdrop-blur transition-all duration-200"
      >
        <div class="flex items-center justify-between px-6 py-3">
          <div>
            <div class="text-xs uppercase tracking-[0.25em] text-neutral-500">
              Worldbuilding Hub
            </div>
            <div class="text-lg font-semibold text-neutral-100">
              Eldra
            </div>
          </div>

          <div class="flex items-center gap-3">
            <UInput
              icon="i-lucide-search"
              placeholder="Search the world..."
              class="w-64"
            />
            <ThemeChooser />
            <UButton color="neutral" variant="soft" icon="i-lucide-log-in">
              Login
            </UButton>
          </div>
        </div>
      </header>

      <main class="px-6 pb-8 pt-24">
        <slot />
      </main>
    </div>
  </div>
</template>

<script setup lang="ts">
const collapsed = useSidebar()
</script>
