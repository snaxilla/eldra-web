<script setup lang="ts">
const { data: worlds, pending, error } = await useFetch('/api/worlds')

function excerpt(text?: string, max = 160) {
  if (!text) return 'No description yet.'
  return text.length > max ? `${text.slice(0, max).trim()}...` : text
}
</script>

<template>
  <div class="space-y-8">
    <section class="rounded-[30px] border border-[#d7c4a0] bg-[#f8f2e8] p-8 shadow-[0_10px_24px_rgba(80,60,30,0.10)]">
      <div class="max-w-3xl">
        <div class="text-xs uppercase tracking-[0.35em] text-[#907a58]">
          Eldra
        </div>

        <h1 class="mt-3 text-4xl font-semibold tracking-[0.04em] text-[#2f2419] md:text-5xl">
          Choose a World
        </h1>

        <p class="mt-4 text-base leading-7 text-[#4f4030]">
          Step into one of your worlds and keep building. Each world carries its own atmosphere,
          story, and visual identity.
        </p>
      </div>
    </section>

    <section v-if="pending" class="rounded-[30px] border border-[#d7c4a0] bg-[#f8f2e8] p-8">
      <div class="text-[#4f4030]">Loading worlds...</div>
    </section>

    <section v-else-if="error" class="rounded-[30px] border border-red-300 bg-red-50 p-8">
      <div class="text-red-700">Failed to load worlds.</div>
    </section>

    <section
      v-else-if="!worlds || !worlds.length"
      class="rounded-[30px] border border-[#d7c4a0] bg-[#f8f2e8] p-8"
    >
      <div class="text-[#4f4030]">No worlds found yet.</div>
    </section>

    <section v-else class="grid grid-cols-1 gap-6 xl:grid-cols-2">
      <NuxtLink
        v-for="world in worlds"
        :key="world.id"
        :to="`/dev/worlds/${world.id}`"
        class="group overflow-hidden rounded-[30px] border border-[#d7c4a0] bg-[#f8f2e8] shadow-[0_10px_24px_rgba(80,60,30,0.10)] transition hover:-translate-y-1 hover:shadow-[0_16px_34px_rgba(80,60,30,0.16)]"
      >
        <div class="relative h-64 overflow-hidden">
          <img
            :src="world.banner_image_url || 'https://picsum.photos/seed/eldra-world-card/1200/600'"
            :alt="world.name"
            class="h-full w-full object-cover transition duration-500 group-hover:scale-[1.03]"
          >
          <div class="absolute inset-0 bg-gradient-to-t from-[rgba(27,19,12,0.55)] via-[rgba(27,19,12,0.12)] to-transparent" />

          <div class="absolute inset-x-0 bottom-0 p-6">
            <div class="text-xs uppercase tracking-[0.35em] text-[#f0dfb8]">
              World
            </div>
            <h2 class="mt-2 text-3xl font-semibold text-[#fff8ec]">
              {{ world.name || 'Untitled World' }}
            </h2>
            <p
              v-if="world.subtitle"
              class="mt-2 text-sm leading-6 text-[#f2e7d2]"
            >
              {{ world.subtitle }}
            </p>
          </div>
        </div>

        <div class="p-6">
          <p class="text-sm leading-7 text-[#4f4030]">
            {{ excerpt(world.description) }}
          </p>

          <div class="mt-5 flex items-center justify-between">
            <div class="text-xs uppercase tracking-[0.35em] text-[#907a58]">
              Open World
            </div>

            <div class="rounded-full border border-[#cfb07a] px-4 py-2 text-sm font-medium text-[#6b5333] transition group-hover:bg-[#b38a2e] group-hover:text-white">
              Enter
            </div>
          </div>
        </div>
      </NuxtLink>
    </section>
  </div>
</template>
