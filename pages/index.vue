<script setup>
const { data: articles } = await useFetch('/api/articles')
</script>

<template>
  <div>
    <h1 class="text-3xl mb-6">Articles</h1>

    <div v-for="a in articles" :key="a.id" class="mb-4">
      <NuxtLink :to="`/article/${a.slug}`" class="text-xl font-bold">
        {{ a.title }}
      </NuxtLink>

      <div class="text-sm text-neutral-400">
        {{ a.excerpt }}
      </div>
    </div>
  </div>
</template>
