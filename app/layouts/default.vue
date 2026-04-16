<script setup lang="ts">
const route = useRoute()

const activeWorldId = computed(() => {
  const match =
    route.path.match(/^\/worlds\/([^/]+)/) ||
    route.path.match(/^\/(?:play|run)\/worlds\/([^/]+)/)

  return match?.[1] || null
})

const showSidebar = computed(() => !!activeWorldId.value)
</script>

<template>
  <div class="relative min-h-screen bg-[#060c14] text-slate-100">
    <CosmicBackdrop />

    <div class="relative z-10 flex min-h-screen">
      <AppSidebar />

      <div class="flex min-w-0 flex-1 flex-col">
        <AppTopbar />

        <main class="min-w-0 flex-1">
          <div
            class="mx-auto w-full px-4 py-5 sm:px-6 lg:px-8 lg:py-6"
            :class="showSidebar ? 'max-w-[1600px]' : 'max-w-[1800px]'"
          >
            <slot />
          </div>
        </main>
      </div>
    </div>

    <MobileBottomNav />
  </div>
</template>
