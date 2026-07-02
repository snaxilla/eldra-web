<script setup lang="ts">
const props = withDefaults(defineProps<{
  mode?: string
  abilities?: any[]
  abilityScores?: Record<string, any>
}>(), {
  mode: 'play',
  abilities: () => [],
  abilityScores: () => ({})
})

const emit = defineEmits<{
  (event: 'roll-ability', ability: any): void
  (event: 'update-ability', payload: { key: string; value: string }): void
}>()

function abilityMod(value: any) {
  const score = Number(value ?? 10)
  if (!Number.isFinite(score)) return '+0'
  const mod = Math.floor((score - 10) / 2)
  return `${mod >= 0 ? '+' : ''}${mod}`
}

function abilityInputValue(ability: any) {
  const key = String(ability?.key || '')
  return props.abilityScores?.[key] ?? ability?.value ?? 10
}

function updateAbility(ability: any, event: Event) {
  const key = String(ability?.key || '')
  if (!key) return

  const target = event.target as HTMLInputElement | null
  emit('update-ability', {
    key,
    value: target?.value || ''
  })
}
</script>

<template>
  <section class="mt-6 hidden grid-cols-2 gap-3 md:grid sm:grid-cols-3">
    <label
      v-for="ability in abilities"
      :key="ability.key"
      role="button"
      tabindex="0"
      title="Roll ability check"
      class="cursor-pointer rounded-none border border-[rgba(201,164,90,0.22)] bg-[rgba(20,17,12,0.72)] p-4 text-center transition hover:border-[rgba(201,164,90,0.45)] hover:bg-[rgba(201,164,90,0.08)]"
      @click.stop="emit('roll-ability', ability)"
      @keydown.enter.prevent="emit('roll-ability', ability)"
      @keydown.space.prevent="emit('roll-ability', ability)"
    >
      <div class="text-xs uppercase tracking-[0.25em] text-[#9f9278]">{{ ability.label }}</div>

      <input
        v-if="mode === 'build'"
        :value="abilityInputValue(ability)"
        inputmode="numeric"
        class="eldra-input mx-auto mt-2 w-24 rounded-none px-3 py-2 text-center text-3xl font-semibold text-white"
        @click.stop
        @keydown.stop
        @input="updateAbility(ability, $event)"
      >

      <div v-else class="mt-2 text-3xl font-semibold text-white">{{ ability.value ?? 10 }}</div>
      <div class="mt-1 text-sm text-[#d8ceb8]">{{ abilityMod(ability.value) }}</div>
    </label>
  </section>
</template>
