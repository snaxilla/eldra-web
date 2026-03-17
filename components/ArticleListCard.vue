<script setup lang="ts">
defineProps<{
  article: {
    id: string
    title: string
    slug: string
    excerpt?: string
    status?: string
    visibility?: string
    updated_at?: string | null
  }
}>()
</script>

<template>
  <NuxtLink
    :to="`/article/${article.slug}`"
    class="block rounded-2xl border border-neutral-800 bg-neutral-900 p-5 transition hover:border-neutral-700 hover:bg-neutral-800"
  >
    <div class="mb-3 flex items-center justify-between gap-4">
      <h3 class="text-lg font-semibold text-neutral-100">
        {{ article.title }}
      </h3>

      <div class="rounded-full border border-neutral-700 px-2 py-1 text-xs uppercase tracking-wide text-neutral-400">
        {{ article.status || 'unknown' }}
      </div>
    </div>

    <p class="mb-4 text-sm text-neutral-300">
      {{ article.excerpt || 'No excerpt yet.' }}
    </p>

    <div class="flex items-center justify-between text-xs text-neutral-500">
      <span>{{ article.visibility || 'unknown visibility' }}</span>
      <span>{{ article.updated_at || 'no update yet' }}</span>
    </div>
  </NuxtLink>
</template>
