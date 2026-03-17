<template>
  <div class="flex min-h-screen bg-neutral-950 text-neutral-100">
    <AppSidebar />

    <div class="min-w-0 flex-1">
      <header class="border-b border-neutral-800 bg-neutral-950/80 backdrop-blur">
        <div class="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
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
            <UButton color="neutral" variant="soft" icon="i-lucide-log-in">
              Login
            </UButton>
          </div>
        </div>
      </header>

      <main class="mx-auto max-w-7xl px-6 py-8">
        <slot />
      </main>
    </div>
  </div>
</template>
