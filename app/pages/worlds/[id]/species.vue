<script setup lang="ts">
definePageMeta({
  layout: 'world-workspace'
})
</script>

<template>
  <WorldEntityInteractivePage
    entity-type="species"
    page-key="species"
    title="Species"
    eyebrow="Species"
    description="Browse imported species and race references for this world."
    search-placeholder="Search species..."
  />
</template>
