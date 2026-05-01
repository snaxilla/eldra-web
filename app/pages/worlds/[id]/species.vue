<script setup lang="ts">
definePageMeta({
  layout: 'world-workspace'
})
</script>

<template>
  <WorldEntityCollectionPage
    entity-type="species"
    title="Species"
    eyebrow="Species"
    description="Browse imported species entries for this world."
    search-placeholder="Search species..."
    empty-message="No species have been imported into this world yet."
  />
</template>
