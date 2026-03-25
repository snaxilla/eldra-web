<script setup lang="ts">
const route = useRoute()

const { data: allWorlds } = await useFetch('/api/worlds')
const entityId = route.params.id

let target = '/'

for (const world of allWorlds.value || []) {
  try {
    const entities = await $fetch(`/api/worlds/${world.id}/entities`)
    const match = (entities || []).find((entity: any) => String(entity.id) === String(entityId))

    if (match) {
      target = `/worlds/${world.id}/entities/${entityId}`
      break
    }
  } catch {}
}

await navigateTo(target)
</script>

<template>
  <div />
</template>
