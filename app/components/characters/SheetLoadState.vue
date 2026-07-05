<script setup lang="ts">
defineProps<{
  pending?: boolean
  error?: any
}>()

function errorMessage(error: any) {
  return error?.data?.statusMessage || error?.message || 'Failed to load sheet.'
}
</script>

<template>
  <div
    v-if="pending"
    class="rounded-none border border-[rgba(201,164,90,0.24)] bg-[linear-gradient(to_bottom,rgba(20,17,12,0.78),rgba(7,6,4,0.78))] p-5 shadow-[0_18px_55px_rgba(0,0,0,0.24)]"
  >
    <div class="flex flex-wrap items-center justify-between gap-4">
      <div>
        <div class="text-xs uppercase tracking-[0.35em] text-[#9f9278]">
          Character Sheet
        </div>
        <div class="mt-2 text-2xl font-semibold text-white">
          Preparing sheet...
        </div>
        <p class="mt-2 text-sm leading-6 text-[#d8ceb8]">
          Loading character data, inventory, spells, features, and equipment effects.
        </p>
      </div>

      <div class="flex items-center gap-3 rounded-none border border-[rgba(201,164,90,0.22)] bg-black/20 px-4 py-3 text-sm text-[#f5e7bd]">
        <UIcon
          name="i-lucide-loader-circle"
          class="h-5 w-5 animate-spin"
        />
        <span>Loading</span>
      </div>
    </div>

    <div class="mt-6 grid gap-4 lg:grid-cols-[260px_minmax(0,1fr)_320px]">
      <div class="grid gap-4">
        <div class="h-72 animate-pulse rounded-none border border-[rgba(201,164,90,0.16)] bg-white/[0.04]"></div>
        <div class="h-32 animate-pulse rounded-none border border-[rgba(201,164,90,0.16)] bg-white/[0.04]"></div>
      </div>

      <div class="grid content-start gap-4">
        <div class="grid gap-3 sm:grid-cols-5">
          <div
            v-for="index in 5"
            :key="`stat-skeleton-${index}`"
            class="h-28 animate-pulse rounded-none border border-[rgba(201,164,90,0.16)] bg-white/[0.04]"
          ></div>
        </div>

        <div class="h-32 animate-pulse rounded-none border border-[rgba(201,164,90,0.16)] bg-white/[0.04]"></div>
        <div class="h-64 animate-pulse rounded-none border border-[rgba(201,164,90,0.16)] bg-white/[0.04]"></div>
      </div>

      <div class="grid content-start gap-4">
        <div class="h-48 animate-pulse rounded-none border border-[rgba(201,164,90,0.16)] bg-white/[0.04]"></div>
        <div class="h-56 animate-pulse rounded-none border border-[rgba(201,164,90,0.16)] bg-white/[0.04]"></div>
      </div>
    </div>
  </div>

  <div
    v-else-if="error"
    class="rounded-none border border-red-500/20 bg-red-500/10 p-4 text-sm text-red-200"
  >
    {{ errorMessage(error) }}
  </div>
</template>
