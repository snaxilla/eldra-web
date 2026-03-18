<script setup lang="ts">
defineProps<{ article: any }>()

const { cardStyle, hoverStyle } = useThemeStyles()
</script>

<template>
  <NuxtLink
    v-if="article.slug"
    :to="`/article/${article.slug}`"
    :style="cardStyle"
    class="block rounded-2xl border p-5 transition"
    @mouseenter="$el.style.backgroundColor = hoverStyle.backgroundColor"
    @mouseleave="$el.style.backgroundColor = cardStyle.backgroundColor"
  >
    <div class="mb-3 flex items-center justify-between gap-4">
      <h3 class="text-lg font-semibold text-neutral-100">
        {{ article.title }}
      </h3>

      <div class="rounded-full border px-2 py-1 text-xs uppercase tracking-wide text-neutral-400">
        {{ article.status }}
      </div>
    </div>

    <p class="mb-4 text-sm text-neutral-300">
      {{ article.excerpt }}
    </p>

    <div class="flex items-center justify-between text-xs text-neutral-500">
      <span>{{ article.visibility }}</span>
      <span>{{ article.updated_at }}</span>
    </div>
  </NuxtLink>
</template>
