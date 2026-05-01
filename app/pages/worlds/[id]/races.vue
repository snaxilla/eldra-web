<script setup lang="ts">
definePageMeta({
  layout: 'world-workspace'
})
</script>

<template>
  <WorldEntityCollectionPage
    entity-type="species"
    title="Races"
    eyebrow="Races"
    description="Browse imported races and species references for this world."
    search-placeholder="Search races..."
    empty-message="No races or species have been imported into this world yet."
  />
</template>
