<script setup lang="ts">
const props = defineProps<{
  type: {
    key: string
    label: string
    description?: string
    icon?: string
  }
  search: string
  templates: any[]
  filteredTemplates: any[]
  pending: boolean
  selectedTemplateId: string
}>()

const emit = defineEmits<{
  (event: 'update:search', value: string): void
  (event: 'select', template: any): void
}>()

const searchModel = computed({
  get: () => props.search,
  set: (value: string) => emit('update:search', value)
})

function templateSubtitle(template: any) {
  return [
    template?.sourceBook,
    template?.sourcePage ? `p.${template.sourcePage}` : '',
    template?.entityType,
    template?.blockCount ? `${template.blockCount} blocks` : ''
  ].filter(Boolean).join(' · ')
}

function selectTemplate(template: any) {
  emit('select', template)
}
</script>

<template>
  <div class="eldra-ornate-panel eldra-frame-corners rounded-none border border-[rgba(201,164,90,0.24)] bg-[rgba(10,12,14,0.64)] p-5 backdrop-blur">
    <div class="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
      <div>
        <div class="text-xs uppercase tracking-[0.3em] text-[#9f9278]">
          Template Library
        </div>
        <h2 class="mt-2 text-2xl font-semibold text-white">
          {{ type.label }} Templates
        </h2>
        <p class="mt-2 text-sm leading-6 text-[#d8ceb8]">
          Pick an existing {{ type.label.toLowerCase() }} as the starting mechanical shape.
        </p>
      </div>

      <div class="rounded-none border border-[rgba(201,164,90,0.18)] bg-[rgba(201,164,90,0.08)] px-3 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-[#d8ceb8]">
        {{ templates.length }} templates
      </div>
    </div>

    <input
      v-model="searchModel"
      class="eldra-input mt-5 w-full rounded-none px-3 py-3 text-sm text-white"
      :placeholder="`Search ${type.label.toLowerCase()} templates...`"
    >

    <div
      v-if="pending"
      class="mt-4 rounded-none border border-dashed border-[rgba(201,164,90,0.20)] p-5 text-sm text-[#9f9278]"
    >
      Loading templates...
    </div>

    <div
      v-else-if="!filteredTemplates.length"
      class="mt-4 rounded-none border border-dashed border-[rgba(201,164,90,0.20)] p-5 text-sm text-[#9f9278]"
    >
      No templates found for this type.
    </div>

    <div
      v-else
      class="mt-4 grid max-h-[520px] gap-3 overflow-y-auto pr-1"
    >
      <button
        v-for="template in filteredTemplates"
        :key="template.id"
        type="button"
        class="rounded-none border p-4 text-left transition"
        :class="String(selectedTemplateId) === String(template.id)
          ? 'border-[rgba(201,164,90,0.60)] bg-[rgba(201,164,90,0.16)]'
          : 'border-[rgba(201,164,90,0.16)] bg-[rgba(8,17,27,0.42)] hover:border-[rgba(201,164,90,0.36)] hover:bg-[rgba(201,164,90,0.08)]'"
        @click="selectTemplate(template)"
      >
        <div class="flex flex-wrap items-start justify-between gap-3">
          <div class="min-w-0">
            <div class="text-lg font-semibold text-white">
              {{ template.title }}
            </div>
            <div class="mt-1 text-[10px] uppercase tracking-[0.18em] text-[#9f9278]">
              {{ templateSubtitle(template) || type.label }}
            </div>
          </div>

          <span class="shrink-0 rounded-none border border-[rgba(201,164,90,0.20)] bg-[rgba(201,164,90,0.08)] px-2 py-1 text-[10px] uppercase tracking-[0.14em] text-[#d8ceb8]">
            {{ template.blockCount || 0 }} blocks
          </span>
        </div>

        <p
          v-if="template.summary"
          class="mt-3 line-clamp-2 text-sm leading-6 text-[#d8ceb8]"
        >
          {{ template.summary }}
        </p>

        <div
          v-if="template.coreBlockKeys?.length"
          class="mt-3 flex flex-wrap gap-2"
        >
          <span
            v-for="key in template.coreBlockKeys.slice(0, 5)"
            :key="`${template.id}-${key}`"
            class="rounded-none border border-[rgba(65,82,103,0.58)] bg-[rgba(8,17,27,0.58)] px-2 py-1 text-[10px] uppercase tracking-[0.14em] text-[#9f9278]"
          >
            {{ key }}
          </span>
        </div>
      </button>
    </div>
  </div>
</template>
