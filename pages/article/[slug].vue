<script setup>
const route = useRoute()

const { data: article } = await useFetch(
  `/api/article-by-slug/${route.params.slug}`
)

const { data: blocks } = await useFetch(
  () => article.value ? `/api/article-blocks/${article.value.id}` : null
)
</script>

<template>
  <div v-if="!article">Loading...</div>

  <div v-else>
    <h1 class="text-4xl mb-4">{{ article.title }}</h1>

    <div v-html="article.body" class="mb-8" />

    <BlockRenderer
      v-for="b in blocks || []"
      :key="b.id"
      :block="b"
    />
  </div>
</template>
