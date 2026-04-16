<script setup lang="ts">
</script>

<template>
  <div class="min-h-screen bg-[#0b1119] text-slate-100">
    <div class="flex min-h-screen">
      <AppSidebar />

      <div class="flex min-w-0 flex-1 flex-col">
        <AppTopbar />

        <main class="min-w-0 flex-1">
          <div class="mx-auto w-full max-w-[1600px] px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
            <slot />
          </div>
        </main>
      </div>
    </div>

    <MobileBottomNav />
  </div>
</template>
