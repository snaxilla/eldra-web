<script setup lang="ts">
defineProps<{
  reviewRows: any[][]
  checks: Array<{
    status: 'ok' | 'warn' | 'error'
    label: string
    detail: string
  }>
  blockingCount: number
  warningCount: number
}>()

function reviewValue(value: any, fallback = '—') {
  const text = String(value ?? '').trim()
  return text || fallback
}

function checkClass(status: 'ok' | 'warn' | 'error') {
  if (status === 'error') {
    return 'border-red-400/25 bg-red-500/10 text-red-100'
  }

  if (status === 'warn') {
    return 'border-amber-300/25 bg-amber-400/10 text-amber-100'
  }

  return 'border-emerald-300/20 bg-emerald-400/10 text-emerald-100'
}
</script>

<template>
  <div
    data-homebrew-draft-review
    class="mt-5 rounded-none border border-[rgba(201,164,90,0.20)] bg-[rgba(8,17,27,0.42)] p-4"
  >
    <div class="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
      <div>
        <div class="text-xs uppercase tracking-[0.3em] text-[#9f9278]">
          Draft Review
        </div>
        <h3 class="mt-2 text-xl font-semibold text-white">
          Ready Check
        </h3>
        <p class="mt-2 text-sm leading-6 text-[#d8ceb8]">
          Quick sanity pass before Eldra creates the structured draft.
        </p>
      </div>

      <div class="flex flex-wrap gap-2">
        <span class="rounded-none border border-red-400/20 bg-red-500/10 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-red-100">
          {{ blockingCount }} blockers
        </span>
        <span class="rounded-none border border-amber-300/20 bg-amber-400/10 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-amber-100">
          {{ warningCount }} warnings
        </span>
      </div>
    </div>

    <div class="mt-4 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
      <div
        v-for="row in reviewRows"
        :key="`${row[0]}-${row[1]}`"
        class="rounded-none border border-[rgba(201,164,90,0.12)] bg-[rgba(4,8,14,0.42)] p-3"
      >
        <div class="text-[10px] uppercase tracking-[0.18em] text-[#9f9278]">
          {{ row[0] }}
        </div>
        <div class="mt-1 break-words text-sm font-semibold text-[#fff7df]">
          {{ reviewValue(row[1]) }}
        </div>
      </div>
    </div>

    <div class="mt-4 grid gap-2">
      <div
        v-for="check in checks"
        :key="`${check.status}-${check.label}`"
        class="rounded-none border px-3 py-2 text-sm leading-6"
        :class="checkClass(check.status)"
      >
        <span class="font-semibold">{{ check.label }}:</span>
        <span class="ml-1">{{ check.detail }}</span>
      </div>
    </div>
  </div>
</template>
