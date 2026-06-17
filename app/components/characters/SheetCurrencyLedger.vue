<script setup lang="ts">
const props = defineProps<{
  sheet?: any
}>()

function asObject(value: any) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {}
}

function coinNumber(value: any) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? Math.max(0, Math.floor(parsed)) : 0
}

const currency = computed(() => {
  const resources = asObject(props.sheet?.resources)
  const nested = asObject(resources.currency || resources.coins || resources.coinage)

  return {
    pp: coinNumber(nested.pp ?? resources.pp),
    gp: coinNumber(nested.gp ?? resources.gp),
    sp: coinNumber(nested.sp ?? resources.sp),
    cp: coinNumber(nested.cp ?? resources.cp)
  }
})

const totalCoins = computed(() =>
  currency.value.pp +
  currency.value.gp +
  currency.value.sp +
  currency.value.cp
)

const coinRows = computed(() => [
  {
    key: 'pp',
    label: 'PP',
    name: 'Platinum',
    value: currency.value.pp,
    icon: 'i-lucide-gem'
  },
  {
    key: 'gp',
    label: 'GP',
    name: 'Gold',
    value: currency.value.gp,
    icon: 'i-lucide-coins'
  },
  {
    key: 'sp',
    label: 'SP',
    name: 'Silver',
    value: currency.value.sp,
    icon: 'i-lucide-circle-dollar-sign'
  },
  {
    key: 'cp',
    label: 'CP',
    name: 'Copper',
    value: currency.value.cp,
    icon: 'i-lucide-circle'
  }
])

const currencySummary = computed(() =>
  `${totalCoins.value} Coin${totalCoins.value === 1 ? '' : 's'} carried.`
)
</script>

<template>
  <div class="eldra-codex-soft rounded-none p-4">
    <div class="flex flex-wrap items-start justify-between gap-3">
      <div>
        <div class="text-xs uppercase tracking-[0.3em] text-[#9f9278]">Currency Ledger</div>
        <div class="mt-1 text-sm text-[#d8ceb8]">{{ currencySummary }}</div>
      </div>

      <div class="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
        <div
          v-for="coin in coinRows"
          :key="coin.key"
          class="rounded-none border border-[rgba(201,164,90,0.24)] bg-[rgba(20,17,12,0.62)] px-3 py-2 text-right"
        >
          <div class="flex items-center justify-end gap-1.5 text-xs text-[#9f9278]">
            <UIcon :name="coin.icon" class="h-3.5 w-3.5 text-[#c9a45a]" />
            <span>{{ coin.label }}</span>
          </div>
          <div class="mt-0.5 text-sm font-semibold text-white">
            {{ coin.value }} {{ coin.label }}
          </div>
        </div>
      </div>
    </div>

    <div
      v-if="totalCoins"
      class="mt-3 grid gap-2 rounded-none border border-[rgba(65,82,103,0.46)] bg-[rgba(8,17,27,0.42)] p-3 text-xs sm:grid-cols-4"
    >
      <div
        v-for="coin in coinRows"
        :key="`detail-${coin.key}`"
        class="flex items-center justify-between gap-2"
      >
        <span class="text-[#9f9278]">{{ coin.name }}</span>
        <span class="font-semibold text-[#f5e7bd]">{{ coin.value }}</span>
      </div>
    </div>
  </div>
</template>
