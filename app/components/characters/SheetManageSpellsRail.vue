<script setup lang="ts">
const props = withDefaults(defineProps<{
  spellSearch?: string
  spellSaving?: boolean
  spellSaveError?: string
  spellSaveSuccess?: string
  availableSpellCards?: any[]
  knownSpellCards?: any[]
  preparedSpellCards?: any[]
  speciesGrantedSpellCards?: any[]
  featChoiceSpellCards?: any[]
  spellOptionLevelLabel?: (spell: any) => string
  isPreparedSpell?: (id: any) => boolean
}>(), {
  spellSearch: '',
  spellSaving: false,
  spellSaveError: '',
  spellSaveSuccess: '',
  availableSpellCards: () => [],
  knownSpellCards: () => [],
  preparedSpellCards: () => [],
  speciesGrantedSpellCards: () => [],
  featChoiceSpellCards: () => []
})

const emit = defineEmits<{
  (event: 'update-search', value: string): void
  (event: 'save-spells'): void
  (event: 'open-spell', spell: any): void
  (event: 'add-known', spell: any): void
  (event: 'prepare-spell', spell: any): void
  (event: 'remove-known', spell: any): void
  (event: 'remove-prepared', spell: any): void
}>()

const showAllAvailable = ref(false)

const visibleAvailableSpellCards = computed(() =>
  showAllAvailable.value
    ? props.availableSpellCards
    : props.availableSpellCards.slice(0, 40)
)

function inputValue(event: Event) {
  return String((event.target as HTMLInputElement)?.value || '')
}

function spellTitle(spell: any) {
  return String(spell?.title || spell?.name || 'Spell')
}

function spellLevel(spell: any) {
  return props.spellOptionLevelLabel?.(spell) || 'Spell'
}

function spellId(spell: any) {
  return String(spell?.id ?? spell?.entity?.id ?? '').trim()
}

function isPrepared(spell: any) {
  const id = spellId(spell)
  return Boolean(id && props.isPreparedSpell?.(id))
}
</script>

<template>
  <section class="space-y-4">
    <div
      v-if="spellSaveError"
      class="rounded-none border border-red-500/20 bg-red-500/10 p-3 text-sm text-red-200"
    >
      {{ spellSaveError }}
    </div>

    <div
      v-if="spellSaveSuccess"
      class="rounded-none border border-emerald-500/20 bg-emerald-500/10 p-3 text-sm text-emerald-200"
    >
      {{ spellSaveSuccess }}
    </div>

    <section class="rounded-none border border-[rgba(201,164,90,0.22)] bg-[rgba(20,17,12,0.58)] p-4">
      <div class="mb-3 flex items-center justify-between gap-3">
        <div>
          <div class="text-xs uppercase tracking-[0.3em] text-[#9f9278]">Add Spells</div>
          <div class="mt-1 text-sm text-[#d8ceb8]">Search class spells and add them to this sheet.</div>
        </div>

        <button
          type="button"
          class="eldra-button rounded-none px-3 py-2 text-xs font-semibold disabled:opacity-50"
          :disabled="spellSaving"
          @click="emit('save-spells')"
        >
          {{ spellSaving ? 'Saving...' : 'Save' }}
        </button>
      </div>

      <label class="block">
        <span class="mb-2 block text-[10px] uppercase tracking-[0.22em] text-[#9f9278]">Search</span>
        <input
          :value="spellSearch"
          type="search"
          class="eldra-input w-full rounded-none px-3 py-2 text-sm text-white"
          placeholder="Cure Wounds, Shield, Fireball..."
          @input="emit('update-search', inputValue($event))"
        >
      </label>

      <div class="mt-4 space-y-2">
        <article
          v-for="spell in visibleAvailableSpellCards"
          :key="`available-spell-${spellId(spell)}`"
          class="rounded-none border border-[rgba(65,82,103,0.62)] bg-[rgba(8,17,27,0.68)] p-3"
        >
          <div class="flex items-start justify-between gap-3">
            <div class="min-w-0">
              <div class="truncate text-sm font-semibold text-white">{{ spellTitle(spell) }}</div>
              <div class="mt-1 text-xs text-[#9f9278]">{{ spellLevel(spell) }}</div>
            </div>

            <button
              type="button"
              class="shrink-0 rounded-none border border-[rgba(201,164,90,0.24)] bg-[rgba(20,17,12,0.72)] px-2 py-1.5 text-xs font-semibold text-[#fff7df]"
              @click.stop="emit('open-spell', spell)"
            >
              Details
            </button>
          </div>

          <div class="mt-3 grid grid-cols-2 gap-2">
            <button
              type="button"
              class="rounded-none border border-[rgba(201,164,90,0.24)] bg-[rgba(201,164,90,0.10)] px-2 py-2 text-xs font-semibold text-[#fff7df] disabled:opacity-50"
              :disabled="spellSaving"
              @click="emit('add-known', spell)"
            >
              Learn
            </button>

            <button
              type="button"
              class="rounded-none border border-emerald-300/24 bg-emerald-400/10 px-2 py-2 text-xs font-semibold text-emerald-100 disabled:opacity-50"
              :disabled="spellSaving"
              @click="emit('prepare-spell', spell)"
            >
              Prepare
            </button>
          </div>
        </article>

        <button
          v-if="availableSpellCards.length > visibleAvailableSpellCards.length"
          type="button"
          class="w-full rounded-none border border-[rgba(201,164,90,0.20)] bg-[rgba(20,17,12,0.52)] px-3 py-2 text-xs font-semibold text-[#d8ceb8]"
          @click="showAllAvailable = true"
        >
          Show {{ availableSpellCards.length - visibleAvailableSpellCards.length }} More
        </button>

        <div
          v-if="!availableSpellCards.length"
          class="rounded-none border border-dashed border-[rgba(201,164,90,0.22)] p-5 text-sm text-[#9f9278]"
        >
          No available spells match the current search.
        </div>
      </div>
    </section>

    <section class="rounded-none border border-[rgba(201,164,90,0.22)] bg-[rgba(20,17,12,0.42)] p-4">
      <div class="mb-3 text-xs uppercase tracking-[0.3em] text-[#9f9278]">
        Prepared Spells
        <span class="ml-1 text-[#d8ceb8]">({{ preparedSpellCards.length }})</span>
      </div>

      <div
        v-if="preparedSpellCards.length"
        class="space-y-2"
      >
        <article
          v-for="spell in preparedSpellCards"
          :key="`prepared-spell-${spellId(spell)}`"
          class="rounded-none border border-[rgba(65,82,103,0.62)] bg-[rgba(8,17,27,0.68)] p-3"
        >
          <div class="flex items-start justify-between gap-3">
            <div class="min-w-0">
              <div class="truncate text-sm font-semibold text-white">{{ spellTitle(spell) }}</div>
              <div class="mt-1 text-xs text-[#9f9278]">{{ spellLevel(spell) }}</div>
            </div>

            <button
              type="button"
              class="shrink-0 rounded-none border border-[rgba(201,164,90,0.24)] bg-[rgba(20,17,12,0.72)] px-2 py-1.5 text-xs font-semibold text-[#fff7df]"
              @click.stop="emit('open-spell', spell)"
            >
              Details
            </button>
          </div>

          <button
            type="button"
            class="mt-3 w-full rounded-none border border-red-500/30 bg-red-500/12 px-2 py-2 text-xs font-semibold text-red-100 disabled:opacity-50"
            :disabled="spellSaving"
            @click="emit('remove-prepared', spell)"
          >
            Remove Prepared
          </button>
        </article>
      </div>

      <div
        v-else
        class="rounded-none border border-dashed border-[rgba(201,164,90,0.22)] p-5 text-sm text-[#9f9278]"
      >
        No prepared spells yet.
      </div>
    </section>

    <section class="rounded-none border border-[rgba(201,164,90,0.22)] bg-[rgba(20,17,12,0.42)] p-4">
      <div class="mb-3 text-xs uppercase tracking-[0.3em] text-[#9f9278]">
        Known Spells
        <span class="ml-1 text-[#d8ceb8]">({{ knownSpellCards.length }})</span>
      </div>

      <div
        v-if="knownSpellCards.length"
        class="space-y-2"
      >
        <article
          v-for="spell in knownSpellCards"
          :key="`known-spell-${spellId(spell)}`"
          class="rounded-none border border-[rgba(65,82,103,0.62)] bg-[rgba(8,17,27,0.68)] p-3"
        >
          <div class="flex items-start justify-between gap-3">
            <div class="min-w-0">
              <div class="truncate text-sm font-semibold text-white">{{ spellTitle(spell) }}</div>
              <div class="mt-1 text-xs text-[#9f9278]">{{ spellLevel(spell) }}</div>
            </div>

            <button
              type="button"
              class="shrink-0 rounded-none border border-[rgba(201,164,90,0.24)] bg-[rgba(20,17,12,0.72)] px-2 py-1.5 text-xs font-semibold text-[#fff7df]"
              @click.stop="emit('open-spell', spell)"
            >
              Details
            </button>
          </div>

          <div class="mt-3 grid grid-cols-2 gap-2">
            <button
              type="button"
              class="rounded-none border border-emerald-300/24 bg-emerald-400/10 px-2 py-2 text-xs font-semibold text-emerald-100 disabled:opacity-50"
              :disabled="spellSaving || isPrepared(spell)"
              @click="emit('prepare-spell', spell)"
            >
              {{ isPrepared(spell) ? 'Prepared' : 'Prepare' }}
            </button>

            <button
              type="button"
              class="rounded-none border border-red-500/30 bg-red-500/12 px-2 py-2 text-xs font-semibold text-red-100 disabled:opacity-50"
              :disabled="spellSaving"
              @click="emit('remove-known', spell)"
            >
              Remove
            </button>
          </div>
        </article>
      </div>

      <div
        v-else
        class="rounded-none border border-dashed border-[rgba(201,164,90,0.22)] p-5 text-sm text-[#9f9278]"
      >
        No known spells yet.
      </div>
    </section>

    <section
      v-if="speciesGrantedSpellCards.length || featChoiceSpellCards.length"
      class="rounded-none border border-[rgba(201,164,90,0.16)] bg-[rgba(8,17,27,0.38)] p-4"
    >
      <div class="mb-3 text-xs uppercase tracking-[0.3em] text-[#9f9278]">
        Granted Spells
      </div>

      <div class="space-y-2">
        <article
          v-for="spell in [...speciesGrantedSpellCards, ...featChoiceSpellCards]"
          :key="`granted-spell-${spellId(spell)}`"
          class="rounded-none border border-[rgba(65,82,103,0.52)] bg-black/15 p-3"
        >
          <div class="flex items-start justify-between gap-3">
            <div class="min-w-0">
              <div class="truncate text-sm font-semibold text-white">{{ spellTitle(spell) }}</div>
              <div class="mt-1 text-xs text-[#9f9278]">{{ spellLevel(spell) }}</div>
            </div>

            <button
              type="button"
              class="shrink-0 rounded-none border border-[rgba(201,164,90,0.24)] bg-[rgba(20,17,12,0.72)] px-2 py-1.5 text-xs font-semibold text-[#fff7df]"
              @click.stop="emit('open-spell', spell)"
            >
              Details
            </button>
          </div>
        </article>
      </div>
    </section>
  </section>
</template>
