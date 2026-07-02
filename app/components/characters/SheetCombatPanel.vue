<script setup lang="ts">
const props = withDefaults(defineProps<{
  mode?: string
  combatStats?: Record<string, any>
  shownStats?: Record<string, any>
}>(), {
  mode: 'play',
  combatStats: () => ({}),
  shownStats: () => ({})
})

const emit = defineEmits<{
  (event: 'update-combat-stat', payload: { key: string; value: string }): void
}>()

function shown(key: string) {
  return props.shownStats?.[key] || '—'
}

function draft(key: string) {
  return props.combatStats?.[key] || ''
}

function updateStat(key: string, event: Event) {
  const target = event.target as HTMLInputElement | null
  emit('update-combat-stat', {
    key,
    value: target?.value || ''
  })
}
</script>

<template>
  <section class="mt-6 hidden gap-4 md:grid">
    <div class="eldra-codex-soft rounded-none p-4">
      <div class="text-xs uppercase tracking-[0.3em] text-[#9f9278]">Combat</div>

      <div class="mt-4 grid grid-cols-2 gap-3 text-sm">
        <label class="rounded-none border border-[rgba(201,164,90,0.18)] bg-[rgba(20,17,12,0.52)] p-3">
          <div class="text-[#9f9278]">Armor Class</div>
          <input
            v-if="mode === 'build'"
            :value="draft('armorClass')"
            inputmode="numeric"
            class="eldra-input mt-2 w-full rounded-none px-3 py-2 text-xl text-white"
            @input="updateStat('armorClass', $event)"
          >
          <div v-else class="mt-1 text-xl font-semibold text-white">{{ shown('armorClass') }}</div>
        </label>

        <label class="rounded-none border border-[rgba(201,164,90,0.18)] bg-[rgba(20,17,12,0.52)] p-3">
          <div class="text-[#9f9278]">Hit Points</div>
          <div v-if="mode === 'build'" class="mt-2 grid grid-cols-2 gap-2">
            <input
              :value="draft('currentHp')"
              inputmode="numeric"
              placeholder="Current"
              class="eldra-input w-full rounded-none px-3 py-2 text-sm text-white"
              @input="updateStat('currentHp', $event)"
            >
            <input
              :value="draft('maxHp')"
              inputmode="numeric"
              placeholder="Max"
              class="eldra-input w-full rounded-none px-3 py-2 text-sm text-white"
              @input="updateStat('maxHp', $event)"
            >
          </div>
          <div v-else class="mt-1 text-xl font-semibold text-white">
            {{ shown('currentHp') }} / {{ shown('maxHp') }}
          </div>
        </label>

        <label class="rounded-none border border-[rgba(201,164,90,0.18)] bg-[rgba(20,17,12,0.52)] p-3">
          <div class="text-[#9f9278]">Initiative</div>
          <input
            v-if="mode === 'build'"
            :value="draft('initiative')"
            inputmode="numeric"
            class="eldra-input mt-2 w-full rounded-none px-3 py-2 text-xl text-white"
            @input="updateStat('initiative', $event)"
          >
          <div v-else class="mt-1 text-xl font-semibold text-white">{{ shown('initiative') }}</div>
        </label>

        <label class="rounded-none border border-[rgba(201,164,90,0.18)] bg-[rgba(20,17,12,0.52)] p-3">
          <div class="text-[#9f9278]">Speed</div>
          <input
            v-if="mode === 'build'"
            :value="draft('speed')"
            class="eldra-input mt-2 w-full rounded-none px-3 py-2 text-xl text-white"
            placeholder="30 ft"
            @input="updateStat('speed', $event)"
          >
          <div v-else class="mt-1 text-xl font-semibold text-white">{{ shown('speed') }}</div>
        </label>

        <label class="col-span-2 rounded-none border border-[rgba(201,164,90,0.18)] bg-[rgba(20,17,12,0.52)] p-3">
          <div class="text-[#9f9278]">Hit Dice</div>
          <input
            v-if="mode === 'build'"
            :value="draft('hitDice')"
            class="eldra-input mt-2 w-full rounded-none px-3 py-2 text-sm text-white"
            placeholder="e.g. 1d10"
            @input="updateStat('hitDice', $event)"
          >
          <div v-else class="mt-1 text-xl font-semibold text-white">{{ shown('hitDice') }}</div>
        </label>
      </div>
    </div>
  </section>
</template>
