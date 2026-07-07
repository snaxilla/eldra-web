<script setup lang="ts">
type ManagePanelKey = 'inventory' | 'spells'

const props = withDefaults(defineProps<{
  activePanel?: ManagePanelKey | string
  inventoryCount?: number
  spellCount?: number
  saving?: boolean
}>(), {
  activePanel: 'inventory',
  inventoryCount: 0,
  spellCount: 0,
  saving: false
})

const emit = defineEmits<{
  (event: 'update-panel', value: ManagePanelKey): void
  (event: 'close'): void
}>()

const tabs = computed(() => [
  {
    key: 'inventory',
    label: 'Inventory',
    icon: 'i-lucide-backpack',
    count: props.inventoryCount,
    description: 'Add items, equip gear, attune items, and manage carried inventory.'
  },
  {
    key: 'spells',
    label: 'Spells',
    icon: 'i-lucide-sparkles',
    count: props.spellCount,
    description: 'Learn, prepare, remove, and inspect spells.'
  }
] as const)

const activePanelKey = computed<ManagePanelKey>(() => {
  const key = String(props.activePanel || 'inventory')
  return tabs.value.some((tab) => tab.key === key)
    ? key as ManagePanelKey
    : 'inventory'
})

const activeTab = computed(() =>
  tabs.value.find((tab) => tab.key === activePanelKey.value) || tabs.value[0]
)

function setPanel(value: ManagePanelKey) {
  emit('update-panel', value)
}

function tabClass(key: string) {
  return activePanelKey.value === key
    ? 'border-[rgba(201,164,90,0.70)] bg-[rgba(201,164,90,0.18)] text-[#fff7df] shadow-[0_0_18px_rgba(201,164,90,0.10)]'
    : 'border-[rgba(65,82,103,0.70)] bg-[rgba(8,17,27,0.72)] text-[#d8ceb8] hover:border-[rgba(201,164,90,0.42)] hover:bg-[rgba(201,164,90,0.08)] hover:text-[#fff7df]'
}
</script>

<template>
  <aside
    data-sheet-manage-context-rail
    class="sheet-desktop-only eldra-ornate-panel eldra-frame-corners eldra-corner-runes fixed right-0 top-0 z-[78] hidden h-screen w-[460px] overflow-y-auto border-l border-[rgba(201,164,90,0.32)] bg-[linear-gradient(to_bottom,rgba(12,15,20,0.98),rgba(5,8,13,0.98))] shadow-[-24px_0_70px_rgba(0,0,0,0.42)] md:block"
  >
    <header class="sticky top-0 z-10 border-b border-[rgba(201,164,90,0.20)] bg-[rgba(8,10,12,0.96)] p-4 backdrop-blur">
      <div class="flex items-start justify-between gap-4">
        <div class="min-w-0">
          <div class="text-xs uppercase tracking-[0.35em] text-[#9f9278]">
            Manage Character
          </div>

          <h2 class="mt-1 truncate text-2xl font-semibold text-white">
            {{ activeTab.label }}
          </h2>

          <p class="mt-2 text-sm leading-5 text-[#d8ceb8]">
            {{ activeTab.description }}
          </p>
        </div>

        <button
          type="button"
          class="shrink-0 rounded-none border border-[rgba(201,164,90,0.24)] bg-[rgba(20,17,12,0.72)] px-3 py-2 text-sm font-semibold text-[#d8ceb8] transition hover:bg-white/5 hover:text-white"
          @click="emit('close')"
        >
          Close
        </button>
      </div>

      <div
        v-if="saving"
        class="mt-3 rounded-none border border-amber-300/24 bg-amber-400/10 px-3 py-2 text-xs font-semibold uppercase tracking-[0.16em] text-amber-100"
      >
        Saving
      </div>

      <div class="-mx-1 mt-4 overflow-x-auto pb-1">
        <div class="flex min-w-max gap-2 px-1">
          <button
            v-for="tab in tabs"
            :key="tab.key"
            type="button"
            class="inline-flex items-center gap-2 rounded-none border px-3 py-2 text-xs font-semibold transition"
            :class="tabClass(tab.key)"
            @click="setPanel(tab.key)"
          >
            <UIcon
              :name="tab.icon"
              class="h-4 w-4"
            />

            <span>{{ tab.label }}</span>

            <span
              v-if="tab.count"
              class="rounded-none border border-[rgba(201,164,90,0.20)] bg-black/20 px-1.5 py-0.5 text-[10px] text-[#9f9278]"
            >
              {{ tab.count }}
            </span>
          </button>
        </div>
      </div>
    </header>

    <main class="p-4">
      <div v-if="activePanelKey === 'inventory'">
        <slot name="inventory" />
      </div>

      <div v-else-if="activePanelKey === 'spells'">
        <slot name="spells" />
      </div>
    </main>
  </aside>
</template>
