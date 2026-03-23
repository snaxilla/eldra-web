<template>
  <div class="flex h-screen bg-zinc-950 text-white">
    <aside class="w-64 border-r border-zinc-800 bg-zinc-900">
      <div class="p-4 text-lg font-semibold">
        Eldra
      </div>

      <nav class="space-y-1 px-2">
        <NuxtLink to="/dev/worlds" class="nav-link">Worlds</NuxtLink>
        <NuxtLink to="/dev/entities" class="nav-link">Entities</NuxtLink>
        <NuxtLink to="/dev/maps" class="nav-link">Maps</NuxtLink>
      </nav>
    </aside>

    <main class="flex-1 overflow-y-auto">
      <slot />
    </main>
  </div>
</template>

<style scoped>
.nav-link {
  display: block;
  padding: 10px 12px;
  border-radius: 10px;
  color: #d4d4d8;
}

.nav-link:hover {
  background: #18181b;
  color: white;
}
</style>
