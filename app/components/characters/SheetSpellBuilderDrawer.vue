<script setup lang="ts">
const props = withDefaults(defineProps<{
  open?: boolean
  search?: string
  advanced?: boolean
  levelFilter?: string
  levelOptions?: any[]
  cards?: any[]
  saving?: boolean
  saveError?: string
  saveSuccess?: string
  spellIdFn?: (spell: any) => string
  spellTitleFn?: (spell: any) => string
  spellLevelTextFn?: (spell: any) => string
  isRecommendedFn?: (spell: any) => boolean
  isKnownFn?: (spell: any) => boolean
  isPreparedFn?: (spell: any) => boolean
}>(), {
  open: false,
  search: '',
  advanced: false,
  levelFilter: 'all',
  levelOptions: () => [],
  cards: () => [],
  saving: false,
  saveError: '',
  saveSuccess: ''
})

const emit = defineEmits<{
  (event: 'close'): void
  (event: 'save'): void
  (event: 'update-search', value: string): void
  (event: 'update-level-filter', value: string): void
  (event: 'toggle-advanced'): void
  (event: 'open-spell', spell: any): void
  (event: 'add-spell', spell: any): void
  (event: 'prepare-spell', spell: any): void
}>()

function inputValue(event: Event) {
  const target = event.target as HTMLInputElement | null
  return target?.value || ''
}

function spellId(spell: any) {
  return props.spellIdFn?.(spell) || String(spell?.id || spell?.value || spell?.title || spell?.name || 'spell')
}

function spellTitle(spell: any) {
  return props.spellTitleFn?.(spell) || String(spell?.title || spell?.name || 'Untitled Spell')
}

function spellLevelText(spell: any) {
  return props.spellLevelTextFn?.(spell) || String(spell?.levelText || spell?.level_label || 'Spell')
}

function isRecommended(spell: any) {
  return props.isRecommendedFn?.(spell) ?? true
}

function isKnown(spell: any) {
  return props.isKnownFn?.(spell) ?? false
}

function isPrepared(spell: any) {
  return props.isPreparedFn?.(spell) ?? false
}
</script>

<template>
  <Transition
    enter-from-class="translate-x-full opacity-0"
    enter-active-class="transition duration-200"
    leave-to-class="translate-x-full opacity-0"
    leave-active-class="transition duration-200"
  >
    <div
      v-if="open"
      class="fixed inset-0 z-[260] bg-black/60 backdrop-blur-sm md:pointer-events-none md:bg-transparent md:backdrop-blur-none"
      @click.self="emit('close')"
    >
      <aside data-eldra-context-rail-panel class="eldra-context-rail-fixed eldra-context-rail-panel eldra-ornate-panel fixed bottom-0 right-0 top-0 flex h-full w-full flex-col border-l backdrop-blur-xl md:pointer-events-auto">
        <div class="flex items-start justify-between gap-3 border-b border-[rgba(201,164,90,0.22)] px-5 py-4">
          <div class="min-w-0">
            <div class="text-xs uppercase tracking-[0.35em] text-[#9f9278]">Build Mode</div>
            <h2 class="mt-2 truncate text-2xl font-semibold text-white">Manage Spells</h2>

            <div class="mt-1 text-xs text-[#9f9278]">
              Recommended by default. Advanced overrides are allowed but marked.
            </div>
          </div>

          <button
            type="button"
            class="rounded-none border border-[rgba(201,164,90,0.24)] bg-[rgba(20,17,12,0.72)] p-2 text-[#b5a88d] transition hover:bg-[rgba(201,164,90,0.10)] hover:text-[#fff7df]"
            @click="emit('close')"
          >
            <UIcon name="i-lucide-x" class="h-4 w-4" />
          </button>
        </div>

        <div class="flex-1 overflow-y-auto px-5 py-5">
          <div class="grid gap-3">
            <label class="block">
              <span class="mb-2 block text-xs uppercase tracking-[0.22em] text-[#9f9278]">Search Spells</span>
              <input
                :value="search"
                type="text"
                class="eldra-input w-full rounded-none px-3 py-2 text-sm text-white"
                placeholder="Search Magic Missile, Shield, Fire Bolt..."
                @input="emit('update-search', inputValue($event))"
              >
            </label>

            <div class="flex flex-wrap gap-2">
              <button
                v-for="option in levelOptions"
                :key="option.key"
                type="button"
                class="rounded-none border px-3 py-1.5 text-xs font-semibold"
                :class="levelFilter === option.key
                  ? 'border-[rgba(201,164,90,0.58)] bg-[rgba(201,164,90,0.16)] text-[#fff7df]'
                  : 'border-[rgba(65,82,103,0.62)] bg-[rgba(8,17,27,0.62)] text-[#d8ceb8]'"
                @click="emit('update-level-filter', option.key)"
              >
                {{ option.label }}
              </button>
            </div>

            <button
              type="button"
              class="flex items-center justify-between gap-3 rounded-none border px-3 py-2 text-left text-xs"
              :class="advanced
                ? 'border-amber-300/40 bg-amber-400/10 text-amber-100'
                : 'border-[rgba(65,82,103,0.62)] bg-[rgba(8,17,27,0.62)] text-[#d8ceb8]'"
              @click="emit('toggle-advanced')"
            >
              <span>
                {{ advanced ? 'Advanced Override Mode Enabled' : 'Recommended Spells Only' }}
              </span>
              <span class="text-[#9f9278]">
                {{ advanced ? 'Showing all imported spells' : 'Tap to show off-list spells' }}
              </span>
            </button>

            <div
              v-if="advanced"
              class="rounded-none border border-amber-300/24 bg-amber-400/10 p-3 text-xs leading-5 text-amber-100"
            >
              Advanced mode lets this character learn or prepare spells outside normal class access. Use it for feats, boons, homebrew, weird plot nonsense, or DM-approved chaos.
            </div>

            <div
              v-if="saveError"
              class="rounded-none border border-red-500/20 bg-red-500/10 p-3 text-sm text-red-200"
            >
              {{ saveError }}
            </div>

            <div
              v-if="saveSuccess"
              class="rounded-none border border-emerald-500/20 bg-emerald-500/10 p-3 text-sm text-emerald-200"
            >
              {{ saveSuccess }}
            </div>
          </div>

          <div class="mt-4 grid gap-2">
            <article
              v-for="spell in cards"
              :key="`spell-builder-${spellId(spell)}`"
              class="min-w-0 overflow-hidden rounded-none border p-3"
              :class="isRecommended(spell)
                ? 'border-[rgba(65,82,103,0.62)] bg-[rgba(8,17,27,0.68)]'
                : 'border-amber-300/28 bg-amber-400/8'"
            >
              <div class="flex items-start justify-between gap-3">
                <button
                  type="button"
                  class="min-w-0 flex-1 text-left"
                  @click.stop="emit('open-spell', spell)"
                >
                  <div class="truncate font-semibold text-white">{{ spellTitle(spell) }}</div>
                  <div class="mt-1 text-xs text-[#9f9278]">
                    {{ spellLevelText(spell) }}
                  </div>
                </button>

                <div class="flex shrink-0 flex-col items-end gap-1">
                  <span
                    class="rounded-none border px-2 py-0.5 text-[10px] uppercase tracking-[0.14em]"
                    :class="isRecommended(spell)
                      ? 'border-[rgba(201,164,90,0.20)] bg-[rgba(201,164,90,0.08)] text-[#f5e7bd]'
                      : 'border-amber-300/30 bg-amber-400/10 text-amber-100'"
                  >
                    {{ isRecommended(spell) ? 'Recommended' : 'Override' }}
                  </span>

                  <span v-if="isKnown(spell)" class="text-[10px] text-emerald-200">Known</span>
                  <span v-if="isPrepared(spell)" class="text-[10px] text-[#c9a45a]">Prepared</span>
                </div>
              </div>

              <div class="mt-3 grid grid-cols-3 gap-2">
                <button
                  type="button"
                  class="rounded-none border border-[rgba(201,164,90,0.24)] bg-[rgba(20,17,12,0.72)] px-2 py-2 text-xs font-semibold text-[#fff7df]"
                  @click.stop="emit('open-spell', spell)"
                >
                  Details
                </button>

                <button
                  type="button"
                  class="rounded-none border border-[rgba(201,164,90,0.24)] bg-[rgba(201,164,90,0.10)] px-2 py-2 text-xs font-semibold text-[#fff7df] disabled:opacity-45"
                  :disabled="isKnown(spell)"
                  @click.stop="emit('add-spell', spell)"
                >
                  {{ isRecommended(spell) ? 'Add Known' : 'Add Override' }}
                </button>

                <button
                  type="button"
                  class="rounded-none border border-[rgba(201,164,90,0.34)] bg-[rgba(201,164,90,0.14)] px-2 py-2 text-xs font-semibold text-[#fff7df] disabled:opacity-45"
                  :disabled="isPrepared(spell)"
                  @click.stop="emit('prepare-spell', spell)"
                >
                  Prepare
                </button>
              </div>
            </article>

            <div
              v-if="!cards.length"
              class="rounded-none border border-dashed border-[rgba(201,164,90,0.22)] p-4 text-sm text-[#9f9278]"
            >
              No spells match that search/filter.
            </div>
          </div>
        </div>

        <div class="border-t border-[rgba(201,164,90,0.22)] p-5">
          <div class="grid grid-cols-2 gap-3">
            <button
              type="button"
              class="eldra-button rounded-none px-4 py-3 text-sm font-medium"
              @click="emit('close')"
            >
              Close
            </button>

            <button
              type="button"
              class="eldra-button rounded-none px-4 py-3 text-sm font-medium disabled:opacity-50"
              :disabled="saving"
              @click="emit('save')"
            >
              {{ saving ? 'Saving...' : 'Save Spells' }}
            </button>
          </div>
        </div>
      </aside>
    </div>
  </Transition>
</template>
