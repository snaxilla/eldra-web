<script setup lang="ts">
definePageMeta({
  layout: 'world-workspace'
})
</script>

<template>
  <WorldEntityInteractivePage
    entity-type="location"
    page-key="locations"
    title="Locations"
    eyebrow="Locations"
    description="Browse cities, regions, landmarks, dungeons, and other location articles in this world."
    search-placeholder="Search locations..."
    empty-message="No locations have been created yet. Create one from a map pin, or add manual location creation next."
  />
</template>
