<script setup lang="ts">
const route = useRoute()
await navigateTo(`/worlds/${route.params.id}`)
</script>

<template>
  <div />
</template>
