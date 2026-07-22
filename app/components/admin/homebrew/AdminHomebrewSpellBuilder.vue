<script setup lang="ts">
defineProps<{
  form: any
  summaryLine: string
  levelOptions: Array<{ value: string; label: string }>
  schoolOptions: Array<{ value: string; label: string }>
  attackOptions: Array<{ value: string; label: string }>
  saveOptions: Array<{ value: string; label: string }>
  damageTypes: string[]
}>()
</script>

<template>
  <div
    data-homebrew-spell-builder
    class="mt-5 rounded-none border border-[rgba(201,164,90,0.20)] bg-[rgba(8,17,27,0.42)] p-4"
  >
    <div class="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
      <div>
        <div class="text-xs uppercase tracking-[0.3em] text-[#9f9278]">
          Spell Builder
        </div>
        <h3 class="mt-2 text-xl font-semibold text-white">
          Spell Mechanics
        </h3>
        <p class="mt-2 text-sm leading-6 text-[#d8ceb8]">
          Start from the selected template, then override the combat-useful fields before Eldra creates the draft.
        </p>
      </div>

      <div class="rounded-none border border-[rgba(201,164,90,0.18)] bg-[rgba(201,164,90,0.08)] px-3 py-2 text-xs leading-5 text-[#d8ceb8]">
        {{ summaryLine || 'No mechanics yet' }}
      </div>
    </div>

    <div class="mt-5 grid gap-4 xl:grid-cols-3">
      <label>
        <span class="mb-2 block text-xs uppercase tracking-[0.2em] text-[#9f9278]">Spell Name</span>
        <input
          v-model="form.name"
          class="eldra-input w-full rounded-none px-3 py-3 text-sm text-white"
          placeholder="Magic Missile, Fireball, etc."
        >
      </label>

      <label>
        <span class="mb-2 block text-xs uppercase tracking-[0.2em] text-[#9f9278]">Level</span>
        <select
          v-model="form.level"
          class="eldra-input w-full rounded-none px-3 py-3 text-sm text-white"
        >
          <option
            v-for="level in levelOptions"
            :key="level.value"
            :value="level.value"
            class="bg-[#090909] text-[#f5e7bd]"
          >
            {{ level.label }}
          </option>
        </select>
      </label>

      <label>
        <span class="mb-2 block text-xs uppercase tracking-[0.2em] text-[#9f9278]">School</span>
        <select
          v-model="form.school"
          class="eldra-input w-full rounded-none px-3 py-3 text-sm text-white"
        >
          <option
            v-for="school in schoolOptions"
            :key="school.value"
            :value="school.value"
            class="bg-[#090909] text-[#f5e7bd]"
          >
            {{ school.label }}
          </option>
        </select>
      </label>
    </div>

    <div class="mt-4 grid gap-4 xl:grid-cols-4">
      <label>
        <span class="mb-2 block text-xs uppercase tracking-[0.2em] text-[#9f9278]">Casting Time</span>
        <input v-model="form.castingTime" class="eldra-input w-full rounded-none px-3 py-3 text-sm text-white" placeholder="1 Action">
      </label>

      <label>
        <span class="mb-2 block text-xs uppercase tracking-[0.2em] text-[#9f9278]">Range</span>
        <input v-model="form.range" class="eldra-input w-full rounded-none px-3 py-3 text-sm text-white" placeholder="60 feet">
      </label>

      <label>
        <span class="mb-2 block text-xs uppercase tracking-[0.2em] text-[#9f9278]">Duration</span>
        <input v-model="form.duration" class="eldra-input w-full rounded-none px-3 py-3 text-sm text-white" placeholder="Instantaneous">
      </label>

      <label>
        <span class="mb-2 block text-xs uppercase tracking-[0.2em] text-[#9f9278]">Components</span>
        <input v-model="form.components" class="eldra-input w-full rounded-none px-3 py-3 text-sm text-white" placeholder="V, S, M (a tiny bell)">
      </label>
    </div>

    <div class="mt-4 flex flex-wrap gap-3">
      <label class="inline-flex items-center gap-2 rounded-none border border-[rgba(201,164,90,0.16)] bg-[rgba(20,17,12,0.52)] px-3 py-2 text-sm text-[#d8ceb8]">
        <input v-model="form.concentration" type="checkbox" class="accent-[#c9a45a]">
        Concentration
      </label>

      <label class="inline-flex items-center gap-2 rounded-none border border-[rgba(201,164,90,0.16)] bg-[rgba(20,17,12,0.52)] px-3 py-2 text-sm text-[#d8ceb8]">
        <input v-model="form.ritual" type="checkbox" class="accent-[#c9a45a]">
        Ritual
      </label>
    </div>

    <div class="mt-4 grid gap-4 xl:grid-cols-4">
      <label>
        <span class="mb-2 block text-xs uppercase tracking-[0.2em] text-[#9f9278]">Combat Mode</span>
        <select v-model="form.attackType" class="eldra-input w-full rounded-none px-3 py-3 text-sm text-white">
          <option v-for="option in attackOptions" :key="option.value" :value="option.value" class="bg-[#090909] text-[#f5e7bd]">
            {{ option.label }}
          </option>
        </select>
      </label>

      <label>
        <span class="mb-2 block text-xs uppercase tracking-[0.2em] text-[#9f9278]">Save Ability</span>
        <select v-model="form.saveAbility" class="eldra-input w-full rounded-none px-3 py-3 text-sm text-white">
          <option v-for="option in saveOptions" :key="option.value" :value="option.value" class="bg-[#090909] text-[#f5e7bd]">
            {{ option.label }}
          </option>
        </select>
      </label>

      <label>
        <span class="mb-2 block text-xs uppercase tracking-[0.2em] text-[#9f9278]">Damage / Healing</span>
        <input v-model="form.damage" class="eldra-input w-full rounded-none px-3 py-3 text-sm text-white" placeholder="8d6, 2d8, etc.">
      </label>

      <label>
        <span class="mb-2 block text-xs uppercase tracking-[0.2em] text-[#9f9278]">Damage Type</span>
        <select v-model="form.damageType" class="eldra-input w-full rounded-none px-3 py-3 text-sm text-white">
          <option v-for="type in damageTypes" :key="type || 'none'" :value="type" class="bg-[#090909] text-[#f5e7bd]">
            {{ type || 'None' }}
          </option>
        </select>
      </label>
    </div>

    <label class="mt-4 block">
      <span class="mb-2 block text-xs uppercase tracking-[0.2em] text-[#9f9278]">Class Lists / Tags</span>
      <input v-model="form.classes" class="eldra-input w-full rounded-none px-3 py-3 text-sm text-white" placeholder="Wizard, Cleric, Druid...">
    </label>

    <label class="mt-4 block">
      <span class="mb-2 block text-xs uppercase tracking-[0.2em] text-[#9f9278]">Description</span>
      <textarea v-model="form.description" rows="7" class="eldra-input w-full rounded-none px-3 py-3 text-sm leading-6 text-white" placeholder="What the spell does at the table..." />
    </label>

    <label class="mt-4 block">
      <span class="mb-2 block text-xs uppercase tracking-[0.2em] text-[#9f9278]">At Higher Levels</span>
      <textarea v-model="form.higherLevel" rows="3" class="eldra-input w-full rounded-none px-3 py-3 text-sm leading-6 text-white" placeholder="How the spell scales when cast with higher-level slots..." />
    </label>
  </div>
</template>
