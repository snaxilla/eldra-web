<script setup lang="ts">
defineProps<{
  form: any
  summaryLine: string
  sizeOptions: Array<{ value: string; label: string }>
  typeOptions: string[]
  alignmentOptions: Array<{ value: string; label: string }>
}>()

const abilityKeys = [
  { key: 'str', label: 'STR' },
  { key: 'dex', label: 'DEX' },
  { key: 'con', label: 'CON' },
  { key: 'int', label: 'INT' },
  { key: 'wis', label: 'WIS' },
  { key: 'cha', label: 'CHA' }
]
</script>

<template>
  <div
    data-homebrew-enemy-builder
    class="mt-5 rounded-none border border-[rgba(201,164,90,0.20)] bg-[rgba(8,17,27,0.42)] p-4"
  >
    <div class="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
      <div>
        <div class="text-xs uppercase tracking-[0.3em] text-[#9f9278]">
          Enemy Builder
        </div>
        <h3 class="mt-2 text-xl font-semibold text-white">
          Statblock Mechanics
        </h3>
        <p class="mt-2 text-sm leading-6 text-[#d8ceb8]">
          Build the combat-facing creature profile Eldra will use for reference, sheets, and eventual battle map export.
        </p>
      </div>

      <div class="rounded-none border border-[rgba(201,164,90,0.18)] bg-[rgba(201,164,90,0.08)] px-3 py-2 text-xs leading-5 text-[#d8ceb8]">
        {{ summaryLine || 'No enemy mechanics yet' }}
      </div>
    </div>

    <div class="mt-5 grid gap-4 xl:grid-cols-4">
      <label class="xl:col-span-2">
        <span class="mb-2 block text-xs uppercase tracking-[0.2em] text-[#9f9278]">Enemy Name</span>
        <input
          v-model="form.name"
          class="eldra-input w-full rounded-none px-3 py-3 text-sm text-white"
          placeholder="Bandit Captain, Gravebound Knight..."
        >
      </label>

      <label>
        <span class="mb-2 block text-xs uppercase tracking-[0.2em] text-[#9f9278]">Size</span>
        <select
          v-model="form.size"
          class="eldra-input w-full rounded-none px-3 py-3 text-sm text-white"
        >
          <option
            v-for="size in sizeOptions"
            :key="size.value"
            :value="size.value"
            class="bg-[#090909] text-[#f5e7bd]"
          >
            {{ size.label }}
          </option>
        </select>
      </label>

      <label>
        <span class="mb-2 block text-xs uppercase tracking-[0.2em] text-[#9f9278]">Type</span>
        <select
          v-model="form.creatureType"
          class="eldra-input w-full rounded-none px-3 py-3 text-sm text-white"
        >
          <option
            v-for="type in typeOptions"
            :key="type"
            :value="type"
            class="bg-[#090909] text-[#f5e7bd]"
          >
            {{ type }}
          </option>
        </select>
      </label>
    </div>

    <div class="mt-4 grid gap-4 xl:grid-cols-5">
      <label>
        <span class="mb-2 block text-xs uppercase tracking-[0.2em] text-[#9f9278]">Alignment</span>
        <select
          v-model="form.alignment"
          class="eldra-input w-full rounded-none px-3 py-3 text-sm text-white"
        >
          <option
            v-for="alignment in alignmentOptions"
            :key="alignment.value || 'none'"
            :value="alignment.value"
            class="bg-[#090909] text-[#f5e7bd]"
          >
            {{ alignment.label }}
          </option>
        </select>
      </label>

      <label>
        <span class="mb-2 block text-xs uppercase tracking-[0.2em] text-[#9f9278]">CR</span>
        <input
          v-model="form.challengeRating"
          class="eldra-input w-full rounded-none px-3 py-3 text-sm text-white"
          placeholder="2, 1/4, 13..."
        >
      </label>

      <label>
        <span class="mb-2 block text-xs uppercase tracking-[0.2em] text-[#9f9278]">XP</span>
        <input
          v-model="form.xp"
          class="eldra-input w-full rounded-none px-3 py-3 text-sm text-white"
          placeholder="450"
        >
      </label>

      <label>
        <span class="mb-2 block text-xs uppercase tracking-[0.2em] text-[#9f9278]">AC</span>
        <input
          v-model="form.armorClass"
          class="eldra-input w-full rounded-none px-3 py-3 text-sm text-white"
          placeholder="15"
        >
      </label>

      <label>
        <span class="mb-2 block text-xs uppercase tracking-[0.2em] text-[#9f9278]">HP</span>
        <input
          v-model="form.hitPoints"
          class="eldra-input w-full rounded-none px-3 py-3 text-sm text-white"
          placeholder="65 (10d8 + 20)"
        >
      </label>
    </div>

    <label class="mt-4 block">
      <span class="mb-2 block text-xs uppercase tracking-[0.2em] text-[#9f9278]">Speed</span>
      <input
        v-model="form.speed"
        class="eldra-input w-full rounded-none px-3 py-3 text-sm text-white"
        placeholder="30 ft., fly 60 ft."
      >
    </label>

    <div class="mt-5 grid gap-3 md:grid-cols-3 xl:grid-cols-6">
      <label
        v-for="ability in abilityKeys"
        :key="ability.key"
        class="rounded-none border border-[rgba(201,164,90,0.16)] bg-[rgba(20,17,12,0.42)] p-3"
      >
        <span class="mb-2 block text-center text-xs uppercase tracking-[0.2em] text-[#9f9278]">
          {{ ability.label }}
        </span>
        <input
          v-model="form[ability.key]"
          inputmode="numeric"
          class="eldra-input w-full rounded-none px-3 py-3 text-center text-xl font-semibold text-white"
        >
      </label>
    </div>

    <div class="mt-5 grid gap-4 xl:grid-cols-2">
      <label>
        <span class="mb-2 block text-xs uppercase tracking-[0.2em] text-[#9f9278]">Saving Throws</span>
        <input
          v-model="form.savingThrows"
          class="eldra-input w-full rounded-none px-3 py-3 text-sm text-white"
          placeholder="Dex +5, Wis +2"
        >
      </label>

      <label>
        <span class="mb-2 block text-xs uppercase tracking-[0.2em] text-[#9f9278]">Skills</span>
        <input
          v-model="form.skills"
          class="eldra-input w-full rounded-none px-3 py-3 text-sm text-white"
          placeholder="Perception +4, Stealth +7"
        >
      </label>

      <label>
        <span class="mb-2 block text-xs uppercase tracking-[0.2em] text-[#9f9278]">Senses</span>
        <input
          v-model="form.senses"
          class="eldra-input w-full rounded-none px-3 py-3 text-sm text-white"
          placeholder="darkvision 60 ft., passive Perception 14"
        >
      </label>

      <label>
        <span class="mb-2 block text-xs uppercase tracking-[0.2em] text-[#9f9278]">Languages</span>
        <input
          v-model="form.languages"
          class="eldra-input w-full rounded-none px-3 py-3 text-sm text-white"
          placeholder="Common, Draconic"
        >
      </label>
    </div>

    <div class="mt-5 grid gap-4 xl:grid-cols-4">
      <label>
        <span class="mb-2 block text-xs uppercase tracking-[0.2em] text-[#9f9278]">Vulnerabilities</span>
        <input
          v-model="form.vulnerabilities"
          class="eldra-input w-full rounded-none px-3 py-3 text-sm text-white"
        >
      </label>

      <label>
        <span class="mb-2 block text-xs uppercase tracking-[0.2em] text-[#9f9278]">Resistances</span>
        <input
          v-model="form.resistances"
          class="eldra-input w-full rounded-none px-3 py-3 text-sm text-white"
        >
      </label>

      <label>
        <span class="mb-2 block text-xs uppercase tracking-[0.2em] text-[#9f9278]">Immunities</span>
        <input
          v-model="form.immunities"
          class="eldra-input w-full rounded-none px-3 py-3 text-sm text-white"
        >
      </label>

      <label>
        <span class="mb-2 block text-xs uppercase tracking-[0.2em] text-[#9f9278]">Condition Immunities</span>
        <input
          v-model="form.conditionImmunities"
          class="eldra-input w-full rounded-none px-3 py-3 text-sm text-white"
        >
      </label>
    </div>

    <label class="mt-5 block">
      <span class="mb-2 block text-xs uppercase tracking-[0.2em] text-[#9f9278]">Description / Lore</span>
      <textarea
        v-model="form.description"
        rows="4"
        class="eldra-input w-full rounded-none px-3 py-3 text-sm leading-6 text-white"
        placeholder="What this creature is and how it behaves..."
      />
    </label>

    <div class="mt-5 grid gap-4 xl:grid-cols-2">
      <label>
        <span class="mb-2 block text-xs uppercase tracking-[0.2em] text-[#9f9278]">Traits</span>
        <textarea
          v-model="form.traits"
          rows="6"
          class="eldra-input w-full rounded-none px-3 py-3 text-sm leading-6 text-white"
          placeholder="Pack Tactics: The enemy has advantage..."
        />
      </label>

      <label>
        <span class="mb-2 block text-xs uppercase tracking-[0.2em] text-[#9f9278]">Actions</span>
        <textarea
          v-model="form.actions"
          rows="6"
          class="eldra-input w-full rounded-none px-3 py-3 text-sm leading-6 text-white"
          placeholder="Multiattack: The enemy makes two attacks..."
        />
      </label>

      <label>
        <span class="mb-2 block text-xs uppercase tracking-[0.2em] text-[#9f9278]">Bonus Actions</span>
        <textarea
          v-model="form.bonusActions"
          rows="4"
          class="eldra-input w-full rounded-none px-3 py-3 text-sm leading-6 text-white"
        />
      </label>

      <label>
        <span class="mb-2 block text-xs uppercase tracking-[0.2em] text-[#9f9278]">Reactions</span>
        <textarea
          v-model="form.reactions"
          rows="4"
          class="eldra-input w-full rounded-none px-3 py-3 text-sm leading-6 text-white"
        />
      </label>
    </div>

    <label class="mt-5 block">
      <span class="mb-2 block text-xs uppercase tracking-[0.2em] text-[#9f9278]">Legendary Actions</span>
      <textarea
        v-model="form.legendaryActions"
        rows="4"
        class="eldra-input w-full rounded-none px-3 py-3 text-sm leading-6 text-white"
      />
    </label>
  </div>
</template>
