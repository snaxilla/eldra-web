<script setup lang="ts">
definePageMeta({
  layout: 'world-workspace'
})
</script>

<template>
  <WorldEntityInteractivePage
    entity-type="item"
    page-key="items"
    title="Items"
    eyebrow="Items"
    description="Browse imported items, equipment, and magical objects."
    search-placeholder="Search items..."
  />
</template>
