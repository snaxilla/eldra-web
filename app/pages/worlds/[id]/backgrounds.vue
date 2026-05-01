<script setup lang="ts">
definePageMeta({
  layout: 'world-workspace'
})
</script>

<template>
  <WorldEntityCollectionPage
    entity-type="background"
    title="Backgrounds"
    eyebrow="Backgrounds"
    description="Browse imported backgrounds and character origin content."
    search-placeholder="Search backgrounds..."
    empty-message="No backgrounds have been imported into this world yet."
  />
</template>
