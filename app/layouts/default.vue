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
  <div class="min-h-screen bg-[#0b1119] text-slate-100">
    <div class="flex min-h-screen">
      <AppSidebar />

      <div class="flex min-w-0 flex-1 flex-col">
        <AppTopbar />

        <main class="min-w-0 flex-1">
          <div
            class="mx-auto w-full px-4 py-6 sm:px-6 lg:px-8 lg:py-8"
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
