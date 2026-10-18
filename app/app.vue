<script setup lang="ts">
// Theme root: resolves platform default -> World theme -> the viewer's
// accessibility preferences and applies them to <html>.
// See .github/docs/architecture/theming.md.
useEldraThemeRoot()
</script>

<template>
  <NuxtLoadingIndicator
    color="#c9a45a"
    :height="3"
    :duration="5000"
  />
  <UApp>
    <NuxtLayout>
      <NuxtPage />
    </NuxtLayout>
  </UApp>
</template>
