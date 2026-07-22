<script setup lang="ts">
const props = defineProps<{
  modelValue: string
  types: Array<{
    key: string
    label: string
    description: string
    icon: string
  }>
}>()

const emit = defineEmits<{
  (event: 'update:modelValue', value: string): void
}>()

function selectType(value: string) {
  emit('update:modelValue', value)
}
</script>

<template>
  <div class="eldra-ornate-panel eldra-frame-corners rounded-none border border-[rgba(201,164,90,0.24)] bg-[rgba(10,12,14,0.64)] p-5 backdrop-blur">
    <div class="text-xs uppercase tracking-[0.3em] text-[#9f9278]">
      Homebrew Forge
    </div>
    <h2 class="mt-2 text-2xl font-semibold text-white">
      New Homebrew
    </h2>
    <p class="mt-2 text-sm leading-6 text-[#d8ceb8]">
      Create a draft entity from an existing imported or homebrew template. Eldra clones the structured mechanics so this can become Foundry-ready later.
    </p>

    <div class="mt-5 grid gap-3">
      <button
        v-for="type in types"
        :key="type.key"
        type="button"
        class="rounded-none border p-3 text-left transition"
        :class="modelValue === type.key
          ? 'border-[rgba(201,164,90,0.60)] bg-[rgba(201,164,90,0.16)] text-[#fff7df]'
          : 'border-[rgba(201,164,90,0.16)] bg-[rgba(8,17,27,0.42)] text-[#d8ceb8] hover:border-[rgba(201,164,90,0.36)] hover:bg-[rgba(201,164,90,0.08)]'"
        @click="selectType(type.key)"
      >
        <div class="flex items-start gap-3">
          <UIcon :name="type.icon" class="mt-0.5 h-4 w-4 shrink-0 text-[#c9a45a]" />
          <div class="min-w-0">
            <div class="text-sm font-semibold text-white">{{ type.label }}</div>
            <div class="mt-1 text-xs leading-5 text-[#9f9278]">{{ type.description }}</div>
          </div>
        </div>
      </button>
    </div>
  </div>
</template>
