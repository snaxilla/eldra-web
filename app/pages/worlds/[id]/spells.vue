<script setup lang="ts">
definePageMeta({
  layout: 'world-workspace'
})
</script>

<template>
  <WorldEntityCollectionPage
    entity-type="spell"
    title="Spells"
    eyebrow="Spells"
    description="Browse imported spells and spell references for this world."
    search-placeholder="Search spells..."
    empty-message="No spells have been imported into this world yet."
  />
</template>
