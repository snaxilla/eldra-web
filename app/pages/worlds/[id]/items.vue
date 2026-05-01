<script setup lang="ts">
definePageMeta({
  layout: 'world-workspace'
})
</script>

<template>
  <WorldEntityCollectionPage
    entity-type="item"
    title="Items"
    eyebrow="Items"
    description="Browse imported items, equipment, and magical objects for this world."
    search-placeholder="Search items..."
    empty-message="No items have been imported into this world yet."
  />
</template>
