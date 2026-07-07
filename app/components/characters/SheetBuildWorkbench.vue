<script setup lang="ts">
type WorkbenchTabKey = 'setup' | 'choices' | 'inventory' | 'spells' | 'features'

const props = withDefaults(defineProps<{
  choiceCount?: number
  inventoryCount?: number
  spellCount?: number
  featureCount?: number
  saving?: boolean
}>(), {
  choiceCount: 0,
  inventoryCount: 0,
  spellCount: 0,
  featureCount: 0,
  saving: false
})

const activeTab = ref<WorkbenchTabKey>('setup')

const tabs = computed(() => [
  {
    key: 'setup',
    label: 'Setup',
    icon: 'i-lucide-sliders-horizontal',
    count: 0,
    description: 'Level, class, species, background, abilities, and combat basics.'
  },
  {
    key: 'choices',
    label: 'Choices',
    icon: 'i-lucide-list-checks',
    count: props.choiceCount,
    description: 'Level-up picks, skill choices, spell choices, feats, and pending setup decisions.'
  },
  {
    key: 'inventory',
    label: 'Inventory',
    icon: 'i-lucide-backpack',
    count: props.inventoryCount,
    description: 'Add items, equip gear, attune magic items, and manage carried equipment.'
  },
  {
    key: 'spells',
    label: 'Spells',
    icon: 'i-lucide-sparkles',
    count: props.spellCount,
    description: 'Add known spells, prepare spells, and manage spellcasting.'
  },
  {
    key: 'features',
    label: 'Features',
    icon: 'i-lucide-badge-plus',
    count: props.featureCount,
    description: 'Review class, subclass, species, background, and feat features.'
  }
] as const)

const activeTabMeta = computed(() =>
  tabs.value.find((tab) => tab.key === activeTab.value) || tabs.value[0]
)

function setTab(tab: WorkbenchTabKey) {
  activeTab.value = tab
}

function tabButtonClass(tab: any) {
  return activeTab.value === tab.key
    ? 'border-[rgba(201,164,90,0.68)] bg-[rgba(201,164,90,0.18)] text-[#fff7df] shadow-[0_0_18px_rgba(201,164,90,0.10)]'
    : 'border-[rgba(65,82,103,0.70)] bg-[rgba(8,17,27,0.68)] text-[#d8ceb8] hover:border-[rgba(201,164,90,0.42)] hover:bg-[rgba(201,164,90,0.08)] hover:text-[#fff7df]'
}

watch(
  () => props.choiceCount,
  (count) => {
    if (Number(count || 0) > 0 && activeTab.value === 'setup') {
      activeTab.value = 'choices'
    }
  },
  { immediate: true }
)
</script>

<template>
  <section
    data-sheet-build-workbench
    class="sheet-desktop-only mt-4 hidden rounded-none border border-[rgba(201,164,90,0.30)] bg-[linear-gradient(to_bottom,rgba(12,15,20,0.92),rgba(5,8,13,0.92))] shadow-[0_18px_55px_rgba(0,0,0,0.28)] md:block"
  >
    <div class="border-b border-[rgba(201,164,90,0.18)] p-4">
      <div class="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <div class="text-xs uppercase tracking-[0.35em] text-[#9f9278]">
            Build Mode
          </div>

          <h2 class="mt-1 text-2xl font-semibold text-white">
            Character Workbench
          </h2>

          <p class="mt-2 max-w-3xl text-sm leading-6 text-[#d8ceb8]">
            {{ activeTabMeta.description }}
          </p>
        </div>

        <div class="flex flex-wrap items-center gap-2 text-xs">
          <span
            v-if="saving"
            class="rounded-none border border-amber-300/24 bg-amber-400/10 px-3 py-2 font-semibold uppercase tracking-[0.16em] text-amber-100"
          >
            Saving
          </span>

          <span
            v-if="choiceCount"
            class="rounded-none border border-amber-300/24 bg-amber-400/10 px-3 py-2 font-semibold uppercase tracking-[0.16em] text-amber-100"
          >
            {{ choiceCount }} Choice{{ choiceCount === 1 ? '' : 's' }} Pending
          </span>

          <span class="rounded-none border border-[rgba(201,164,90,0.20)] bg-black/20 px-3 py-2 uppercase tracking-[0.16em] text-[#9f9278]">
            {{ inventoryCount }} Items
          </span>

          <span class="rounded-none border border-[rgba(201,164,90,0.20)] bg-black/20 px-3 py-2 uppercase tracking-[0.16em] text-[#9f9278]">
            {{ spellCount }} Spells
          </span>

          <span class="rounded-none border border-[rgba(201,164,90,0.20)] bg-black/20 px-3 py-2 uppercase tracking-[0.16em] text-[#9f9278]">
            {{ featureCount }} Features
          </span>
        </div>
      </div>

      <div class="-mx-1 mt-4 overflow-x-auto pb-1">
        <div class="flex min-w-max gap-2 px-1">
          <button
            v-for="tab in tabs"
            :key="tab.key"
            type="button"
            class="inline-flex items-center gap-2 rounded-none border px-3 py-2 text-xs font-semibold transition"
            :class="tabButtonClass(tab)"
            @click="setTab(tab.key)"
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
    </div>

    <div class="p-4">
      <div v-if="activeTab === 'setup'" class="grid gap-4">
        <slot name="setup" />
      </div>

      <div v-else-if="activeTab === 'choices'" class="grid gap-4">
        <slot name="choices" />
      </div>

      <div v-else-if="activeTab === 'inventory'" class="grid gap-4">
        <slot name="inventory" />
      </div>

      <div v-else-if="activeTab === 'spells'" class="grid gap-4">
        <slot name="spells" />
      </div>

      <div v-else-if="activeTab === 'features'" class="grid gap-4">
        <slot name="features" />
      </div>
    </div>
  </section>
</template>
