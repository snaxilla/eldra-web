<script setup lang="ts">
const props = defineProps<{
  level?: number | string
  className?: string
  choiceCount?: number
  saving?: boolean
}>()

const emit = defineEmits<{
  (event: 'save-level', level: number): void
  (event: 'level-up'): void
}>()

const draftLevel = ref('1')

const levelOptions = computed(() =>
  Array.from({ length: 20 }, (_item, index) => index + 1)
)

function clampLevel(value: any) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return 1
  return Math.max(1, Math.min(20, Math.floor(parsed)))
}

const currentLevel = computed(() => clampLevel(props.level || 1))
const targetLevel = computed(() => clampLevel(draftLevel.value))
const levelDelta = computed(() => targetLevel.value - currentLevel.value)

watch(
  () => props.level,
  (value) => {
    draftLevel.value = String(clampLevel(value || 1))
  },
  { immediate: true }
)

function saveLevel() {
  emit('save-level', targetLevel.value)
}

function levelUp() {
  emit('level-up')
}
</script>

<template>
  <div class="eldra-codex-soft rounded-none p-4">
    <div class="flex flex-wrap items-start justify-between gap-3">
      <div class="min-w-0">
        <div class="text-xs uppercase tracking-[0.3em] text-[#9f9278]">Level Manager</div>
        <div class="mt-1 text-sm text-[#d8ceb8]">
          Set this character’s current level. Level-gated actions and features update from the saved sheet level.
        </div>
      </div>

      <button
        type="button"
        class="eldra-button shrink-0 rounded-none px-3 py-2 text-xs font-semibold disabled:opacity-50"
        :disabled="saving || currentLevel >= 20"
        @click="levelUp"
      >
        Level Up
      </button>
    </div>

    <div class="mt-3 grid grid-cols-3 gap-2 text-xs">
      <div class="rounded-none border border-[rgba(65,82,103,0.62)] bg-[rgba(8,17,27,0.68)] p-2">
        <div class="uppercase tracking-[0.18em] text-[#9f9278]">Current</div>
        <div class="mt-1 text-lg font-semibold text-white">{{ currentLevel }}</div>
      </div>

      <div class="rounded-none border border-[rgba(65,82,103,0.62)] bg-[rgba(8,17,27,0.68)] p-2">
        <div class="uppercase tracking-[0.18em] text-[#9f9278]">Choices</div>
        <div class="mt-1 text-lg font-semibold text-white">{{ choiceCount || 0 }}</div>
      </div>

      <div class="rounded-none border border-[rgba(65,82,103,0.62)] bg-[rgba(8,17,27,0.68)] p-2">
        <div class="uppercase tracking-[0.18em] text-[#9f9278]">Class</div>
        <div class="mt-1 truncate text-lg font-semibold text-white">{{ className || '—' }}</div>
      </div>
    </div>

    <div class="mt-3 grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
      <label class="block">
        <span class="mb-1 block text-xs uppercase tracking-[0.18em] text-[#9f9278]">Target Level</span>
        <select
          v-model="draftLevel"
          class="eldra-input w-full rounded-none px-3 py-2 text-sm text-white"
        >
          <option
            v-for="levelOption in levelOptions"
            :key="levelOption"
            :value="String(levelOption)"
            class="bg-[#090909] text-[#f5e7bd]"
          >
            Level {{ levelOption }}
          </option>
        </select>
      </label>

      <button
        type="button"
        class="rounded-none border border-[rgba(201,164,90,0.24)] bg-[rgba(20,17,12,0.72)] px-4 py-2 text-sm font-semibold text-[#fff7df] transition hover:bg-[rgba(201,164,90,0.10)] disabled:opacity-50"
        :disabled="saving || targetLevel === currentLevel"
        @click="saveLevel"
      >
        {{ saving ? 'Saving...' : 'Apply Level' }}
      </button>
    </div>

    <div
      v-if="levelDelta"
      class="mt-3 rounded-none border border-[rgba(201,164,90,0.18)] bg-[rgba(20,17,12,0.42)] p-3 text-xs leading-5 text-[#d8ceb8]"
    >
      <span class="font-semibold text-white">
        {{ levelDelta > 0 ? `Raising ${levelDelta} level${levelDelta === 1 ? '' : 's'}` : `Lowering ${Math.abs(levelDelta)} level${Math.abs(levelDelta) === 1 ? '' : 's'}` }}.
      </span>
      This changes the saved sheet level now. Full guided level-up choices come in the next slice.
    </div>
  </div>
</template>
