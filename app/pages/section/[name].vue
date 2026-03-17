<script setup lang="ts">
const route = useRoute()
</script>

<template>
  <div class="space-y-6">
    <div class="rounded-2xl border border-neutral-800 bg-neutral-900 p-6">
      <div class="mb-2 text-xs uppercase tracking-[0.2em] text-neutral-500">
        Section
      </div>
      <h1 class="text-3xl font-bold capitalize text-neutral-100">
        {{ route.params.name }}
      </h1>
      <p class="mt-3 text-neutral-300">
        This section is a placeholder for the future module page.
      </p>
    </div>

    <div class="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      <div class="rounded-2xl border border-neutral-800 bg-neutral-900 p-5 text-sm text-neutral-300">
        Coming soon: filtered index view
      </div>
      <div class="rounded-2xl border border-neutral-800 bg-neutral-900 p-5 text-sm text-neutral-300">
        Coming soon: section-specific widgets
      </div>
      <div class="rounded-2xl border border-neutral-800 bg-neutral-900 p-5 text-sm text-neutral-300">
        Coming soon: user pinning and bookmarks
      </div>
    </div>
  </div>
</template>
