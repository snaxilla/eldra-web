<script setup lang="ts">
const props = withDefaults(defineProps<{
  mode?: string
  sheet?: any
  levelValue?: string | number
  classEntityId?: string | number
  speciesEntityId?: string | number
  backgroundEntityId?: string | number
  subclassName?: string
  classOptions?: any[]
  speciesOptions?: any[]
  backgroundOptions?: any[]
  resolvedClass?: any
  resolvedSpecies?: any
  resolvedBackground?: any
}>(), {
  mode: 'play',
  classOptions: () => [],
  speciesOptions: () => [],
  backgroundOptions: () => []
})

const emit = defineEmits<{
  (event: 'update-level', value: string): void
  (event: 'update-class-entity-id', value: string): void
  (event: 'update-species-entity-id', value: string): void
  (event: 'update-background-entity-id', value: string): void
  (event: 'update-subclass-name', value: string): void
}>()

function eventValue(event: Event) {
  const target = event.target as HTMLInputElement | HTMLSelectElement | null
  return target?.value || ''
}
</script>

<template>
  <div>
    <div class="mt-6 hidden gap-3 md:grid md:grid-cols-2 lg:grid-cols-4">
      <label class="rounded-none border border-[rgba(201,164,90,0.22)] bg-[rgba(20,17,12,0.72)] p-4">
        <div class="text-xs uppercase tracking-[0.25em] text-[#9f9278]">Level</div>
        <input
          v-if="mode === 'build'"
          :value="levelValue"
          inputmode="numeric"
          class="eldra-input mt-2 w-full rounded-none px-3 py-2 text-2xl font-semibold text-white"
          @input="emit('update-level', eventValue($event))"
        >
        <div v-else class="mt-2 text-2xl font-semibold text-white">{{ sheet?.level || 1 }}</div>
      </label>

      <label class="rounded-none border border-[rgba(201,164,90,0.22)] bg-[rgba(20,17,12,0.72)] p-4">
        <div class="text-xs uppercase tracking-[0.25em] text-[#9f9278]">Class</div>
        <select
          v-if="mode === 'build'"
          :value="classEntityId"
          class="eldra-input mt-2 w-full rounded-none px-3 py-2 text-lg text-white"
          @change="emit('update-class-entity-id', eventValue($event))"
        >
          <option value="" class="bg-[#090909] text-[#f5e7bd]">No linked class</option>
          <option
            v-for="option in classOptions"
            :key="option.id"
            :value="option.id"
            class="bg-[#090909] text-[#f5e7bd]"
          >
            {{ option.title }}
          </option>
        </select>
        <div v-else class="mt-2 text-lg font-semibold text-white">{{ sheet?.class_name || '—' }}</div>

        <div v-if="resolvedClass" class="mt-4 space-y-1.5 border-t border-[rgba(201,164,90,0.16)] pt-3 text-xs leading-5 text-[#d8ceb8]">
          <div v-if="resolvedClass.hitDie"><span class="text-[#9f9278]">Hit Die:</span> {{ resolvedClass.hitDie }}</div>
          <div v-if="resolvedClass.savingThrows"><span class="text-[#9f9278]">Saves:</span> {{ resolvedClass.savingThrows }}</div>
          <div v-if="resolvedClass.armorProficiencies"><span class="text-[#9f9278]">Armor:</span> {{ resolvedClass.armorProficiencies }}</div>
          <div v-if="resolvedClass.weaponProficiencies"><span class="text-[#9f9278]">Weapons:</span> {{ resolvedClass.weaponProficiencies }}</div>
        </div>
      </label>

      <label class="rounded-none border border-[rgba(201,164,90,0.22)] bg-[rgba(20,17,12,0.72)] p-4">
        <div class="text-xs uppercase tracking-[0.25em] text-[#9f9278]">Species</div>
        <select
          v-if="mode === 'build'"
          :value="speciesEntityId"
          class="eldra-input mt-2 w-full rounded-none px-3 py-2 text-lg text-white"
          @change="emit('update-species-entity-id', eventValue($event))"
        >
          <option value="" class="bg-[#090909] text-[#f5e7bd]">No linked species</option>
          <option
            v-for="option in speciesOptions"
            :key="option.id"
            :value="option.id"
            class="bg-[#090909] text-[#f5e7bd]"
          >
            {{ option.title }}
          </option>
        </select>
        <div v-else class="mt-2 text-lg font-semibold text-white">{{ sheet?.species_name || '—' }}</div>

        <div v-if="resolvedSpecies" class="mt-4 space-y-1.5 border-t border-[rgba(201,164,90,0.16)] pt-3 text-xs leading-5 text-[#d8ceb8]">
          <div v-if="resolvedSpecies.size"><span class="text-[#9f9278]">Size:</span> {{ resolvedSpecies.size }}</div>
          <div v-if="resolvedSpecies.speed"><span class="text-[#9f9278]">Speed:</span> {{ resolvedSpecies.speed }}</div>
          <div v-if="resolvedSpecies.rawTraitCount"><span class="text-[#9f9278]">Traits:</span> {{ resolvedSpecies.rawTraitCount }}</div>
        </div>
      </label>

      <label class="rounded-none border border-[rgba(201,164,90,0.22)] bg-[rgba(20,17,12,0.72)] p-4">
        <div class="text-xs uppercase tracking-[0.25em] text-[#9f9278]">Background</div>
        <select
          v-if="mode === 'build'"
          :value="backgroundEntityId"
          class="eldra-input mt-2 w-full rounded-none px-3 py-2 text-lg text-white"
          @change="emit('update-background-entity-id', eventValue($event))"
        >
          <option value="" class="bg-[#090909] text-[#f5e7bd]">No linked background</option>
          <option
            v-for="option in backgroundOptions"
            :key="option.id"
            :value="option.id"
            class="bg-[#090909] text-[#f5e7bd]"
          >
            {{ option.title }}
          </option>
        </select>
        <div v-else class="mt-2 text-lg font-semibold text-white">{{ sheet?.background_name || '—' }}</div>

        <div v-if="resolvedBackground" class="mt-4 space-y-1.5 border-t border-[rgba(201,164,90,0.16)] pt-3 text-xs leading-5 text-[#d8ceb8]">
          <div v-if="resolvedBackground.skillProficiencies"><span class="text-[#9f9278]">Skills:</span> {{ resolvedBackground.skillProficiencies }}</div>
          <div v-if="resolvedBackground.toolProficiencies"><span class="text-[#9f9278]">Tools:</span> {{ resolvedBackground.toolProficiencies }}</div>
          <div v-if="resolvedBackground.featureName"><span class="text-[#9f9278]">Feature:</span> {{ resolvedBackground.featureName }}</div>
        </div>
      </label>
    </div>

    <div
      v-if="mode === 'build'"
      class="mt-3 hidden rounded-none border border-[rgba(201,164,90,0.22)] bg-[rgba(20,17,12,0.72)] p-4 md:block"
    >
      <label class="block">
        <span class="text-xs uppercase tracking-[0.25em] text-[#9f9278]">Subclass</span>
        <input
          :value="subclassName"
          class="eldra-input mt-2 w-full rounded-none px-3 py-2 text-sm text-white"
          placeholder="Optional subclass"
          @input="emit('update-subclass-name', eventValue($event))"
        >
      </label>
    </div>
  </div>
</template>
