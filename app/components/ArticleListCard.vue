<script setup lang="ts">
defineProps<{
  article: {
    id: string
    title: string
    slug?: string | null
    excerpt?: string
    status?: string
    visibility?: string
    updated_at?: string | null
  }
}>()
</script>

<template>
  <NuxtLink
    v-if="article.slug"
    :to="`/article/${article.slug}`"
    class="themed-soft block rounded-2xl border border-neutral-800 p-5 transition hover:border-neutral-700 hover:brightness-110"
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

  <div
    v-else
    class="themed-soft block rounded-2xl border border-dashed border-neutral-800 p-5 opacity-70"
  >
    <div class="mb-3 flex items-center justify-between gap-4">
      <h3 class="text-lg font-semibold text-neutral-100">
        {{ article.title }}
      </h3>

      <div class="rounded-full border border-neutral-700 px-2 py-1 text-xs uppercase tracking-wide text-neutral-400">
        no slug
      </div>
    </div>

    <p class="mb-4 text-sm text-neutral-300">
      {{ article.excerpt || 'No excerpt yet.' }}
    </p>

    <div class="text-xs text-neutral-500">
      Add a slug in Directus before this article can be opened.
    </div>
  </div>
</template>
