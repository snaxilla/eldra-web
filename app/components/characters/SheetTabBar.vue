<script setup lang="ts">
type SheetTab = {
  key: string
  label: string
  icon?: string
}

const props = withDefaults(defineProps<{
  tabs: SheetTab[]
  activeTab: string
  counts?: Record<string, number>
  variant?: 'mobile' | 'desktop'
}>(), {
  counts: () => ({}),
  variant: 'desktop'
})

const emit = defineEmits<{
  (event: 'select', tabKey: string): void
}>()

function tabCount(tabKey: string) {
  const count = Number(props.counts?.[tabKey] || 0)
  return Number.isFinite(count) && count > 0 ? count : 0
}

function selectTab(tabKey: string) {
  emit('select', tabKey)
}
</script>

<template>
  <nav
    v-if="variant === 'mobile'"
    class="overflow-x-auto pb-1"
  >
    <div class="flex min-w-max gap-1.5">
      <button
        v-for="tab in tabs"
        :key="`mobile-${tab.key}`"
        type="button"
        class="inline-flex min-w-[68px] flex-col items-center justify-center gap-1 rounded-none border px-2 py-2 text-[11px] font-semibold transition"
        :class="activeTab === tab.key
          ? 'border-[rgba(201,164,90,0.72)] bg-[rgba(201,164,90,0.18)] text-[#fff7df] shadow-[0_0_18px_rgba(201,164,90,0.10)]'
          : 'border-[rgba(65,82,103,0.72)] bg-[rgba(12,23,33,0.86)] text-[#cbd5e1]'"
        @click="selectTab(tab.key)"
      >
        <UIcon
          v-if="tab.icon"
          :name="tab.icon"
          class="h-4 w-4"
        />
        <span>
          {{ tab.label }}
          <span
            v-if="tabCount(tab.key)"
            class="text-[#9f9278]"
          >
            ({{ tabCount(tab.key) }})
          </span>
        </span>
      </button>
    </div>
  </nav>

  <nav
    v-else
    class="overflow-x-auto"
  >
    <div class="flex min-w-max gap-2">
      <button
        v-for="tab in tabs"
        :key="tab.key"
        type="button"
        class="rounded-none border px-4 py-2 text-sm font-semibold transition"
        :class="activeTab === tab.key
          ? 'border-[rgba(201,164,90,0.58)] bg-[rgba(201,164,90,0.18)] text-[#fff7df]'
          : 'border-[rgba(201,164,90,0.24)] bg-[rgba(20,17,12,0.72)] text-[#d8ceb8] hover:bg-[rgba(201,164,90,0.10)] hover:text-[#fff7df]'"
        @click="selectTab(tab.key)"
      >
        <span>{{ tab.label }}</span>
        <span
          v-if="tabCount(tab.key)"
          class="ml-1 text-[#9f9278]"
        >
          ({{ tabCount(tab.key) }})
        </span>
      </button>
    </div>
  </nav>
</template>
