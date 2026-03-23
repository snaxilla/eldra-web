<script setup lang="ts">
const route = useRoute()
const worldId = route.params.id
</script>

<template>
  <div class="space-y-6 p-6">
    <div class="relative h-56 overflow-hidden rounded-2xl border border-zinc-800">
      <img
        src="https://picsum.photos/1200/400"
        class="h-full w-full object-cover opacity-70"
      >
      <div class="absolute inset-0 flex items-center justify-center">
        <h1 class="text-4xl font-bold tracking-wide">
          World {{ worldId }}
        </h1>
      </div>
    </div>

    <div class="grid grid-cols-1 gap-6 xl:grid-cols-3">
      <div class="xl:col-span-2 rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
        <h2 class="mb-4 text-lg font-semibold">Recent Entities</h2>

        <div class="space-y-3">
          <div class="card">Entity 1</div>
          <div class="card">Entity 2</div>
          <div class="card">Entity 3</div>
        </div>
      </div>

      <div class="rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
        <h2 class="mb-4 text-lg font-semibold">Quick Links</h2>

        <div class="grid grid-cols-2 gap-3">
          <div class="quick-card">NPC</div>
          <div class="quick-card">City</div>
          <div class="quick-card">Faction</div>
          <div class="quick-card">Item</div>
        </div>
      </div>
    </div>

    <div class="overflow-hidden rounded-2xl border border-zinc-800">
      <img
        src="https://picsum.photos/1200/500"
        class="w-full object-cover"
      >
    </div>
  </div>
</template>

<style scoped>
.card {
  padding: 12px;
  border-radius: 12px;
  background: #18181b;
}

.quick-card {
  padding: 16px;
  border-radius: 12px;
  background: #18181b;
  text-align: center;
}
</style>
