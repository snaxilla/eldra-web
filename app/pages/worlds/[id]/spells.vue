<script setup lang="ts">
definePageMeta({
  layout: 'world-workspace'
})
</script>

<template>
  <WorldEntityInteractivePage
    entity-type="spell"
    page-key="spells"
    title="Spells"
    eyebrow="Spells"
    description="Browse imported spells and spell references for this world."
    search-placeholder="Search spells..."
  />
</template>
