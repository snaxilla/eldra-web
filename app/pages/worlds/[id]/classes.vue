<script setup lang="ts">
definePageMeta({
  layout: 'world-workspace'
})
</script>

<template>
  <WorldEntityCollectionPage
    entity-type="class"
    title="Classes"
    eyebrow="Classes"
    description="Browse imported class references and player-facing class content."
    search-placeholder="Search classes..."
    empty-message="No classes have been imported into this world yet."
  />
</template>
