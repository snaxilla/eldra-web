<template>
  <div class="min-h-screen bg-neutral-950 text-neutral-100">
    <header class="border-b border-neutral-800">
      <div class="mx-auto max-w-6xl px-4 py-4 flex items-center justify-between">
        <NuxtLink to="/" class="text-xl font-bold tracking-wide">
          Eldra
        </NuxtLink>

        <nav class="flex gap-4 text-sm text-neutral-300">
          <NuxtLink to="/">Articles</NuxtLink>
        </nav>
      </div>
    </header>

    <main class="mx-auto max-w-6xl px-4 py-8">
      <slot />
    </main>
  </div>
</template>
