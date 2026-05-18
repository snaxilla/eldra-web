<script setup lang="ts">
definePageMeta({
  layout: 'world-workspace'
})
</script>

<template>
  <WorldEntityInteractivePage
    entity-type="feat"
    page-key="feats"
    title="Feats"
    eyebrow="Feats"
    description="Browse imported feats and character-build options for this world."
    search-placeholder="Search feats..."
    empty-message="No feats have been imported yet. Use the World Importer to add feats from 5etools."
  />
</template>
