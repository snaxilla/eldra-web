<script setup lang="ts">
const route = useRoute()

const {
  data: article,
  pending,
  error
} = await useFetch(`/api/article-by-slug/${route.params.slug}`)

const {
  data: blocks,
  error: blocksError
} = await useFetch(
  () => article.value ? `/api/article-blocks/${article.value.id}` : null
)
</script>

<template>
  <div v-if="pending" class="rounded-2xl border border-neutral-800 bg-neutral-900 p-6 text-neutral-300">
    Loading article...
  </div>

  <div v-else-if="error || !article" class="space-y-6">
    <div class="rounded-2xl border border-neutral-800 bg-neutral-900 p-6">
      <div class="mb-2 text-xs uppercase tracking-[0.2em] text-neutral-500">
        Article
      </div>
      <h1 class="text-3xl font-bold text-neutral-100">
        Not Found
      </h1>
      <p class="mt-3 text-neutral-300">
        There is no accessible article with the slug <span class="font-mono text-neutral-100">{{ route.params.slug }}</span>.
      </p>
    </div>
  </div>

  <div v-else class="space-y-8">
    <section class="article-panel rounded-2xl border border-neutral-800 p-6">
      <div class="mb-3 flex flex-wrap items-center gap-3 text-xs uppercase tracking-[0.2em] text-neutral-500">
        <span>{{ article.status || 'unknown status' }}</span>
        <span>•</span>
        <span>{{ article.visibility || 'unknown visibility' }}</span>
      </div>

      <h1 class="mb-4 text-4xl font-bold text-neutral-100">
        {{ article.title }}
      </h1>

      <p v-if="article.excerpt" class="mb-6 text-lg text-neutral-300">
        {{ article.excerpt }}
      </p>

      <div class="prose prose-invert max-w-none text-neutral-200" v-html="article.body" />
    </section>

    <section>
      <div class="mb-4 flex items-center justify-between">
        <h2 class="text-2xl font-semibold text-neutral-100">
          Article Blocks
        </h2>
        <div class="text-xs uppercase tracking-[0.2em] text-neutral-500">
          Structured content
        </div>
      </div>

      <div v-if="blocksError" class="rounded-2xl border border-red-900 bg-red-950/40 p-6 text-sm text-red-200">
        Failed to load blocks.
      </div>

      <div v-else-if="blocks?.length" class="space-y-4">
        <div
          v-for="block in blocks"
          :key="block.id"
          class="article-panel rounded-2xl border border-neutral-800 p-5"
        >
          <BlockRenderer :block="block" />
        </div>
      </div>

      <div v-else class="rounded-2xl border border-dashed border-neutral-800 bg-neutral-900 p-6 text-sm text-neutral-400">
        No blocks found for this article yet.
      </div>
    </section>
  </div>
</template>
