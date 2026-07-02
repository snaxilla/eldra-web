<script setup lang="ts">
const props = withDefaults(defineProps<{
  mode?: string
  hasSpellcastingMath?: boolean
  spellcastingAbilityLabel?: string
  spellcastingStatCards?: any[]
  shownKnownSpells?: any[]
  shownPreparedSpells?: any[]
  availableSpellCards?: any[]
  spellSearch?: string
  spellSaving?: boolean
  spellSaveError?: string
  spellSaveSuccess?: string
  preparedSpellCards?: any[]
  knownSpellCards?: any[]
  speciesGrantedSpellCards?: any[]
  featChoiceSpells?: any[]
  featChoiceSpellCards?: any[]
  spellPanelOpen?: (key: string) => boolean
  spellPanelChevron?: (key: string) => string
  spellOptionLevelLabel?: (spell: any) => string
  isPreparedSpell?: (id: any) => boolean
}>(), {
  mode: 'play',
  hasSpellcastingMath: false,
  spellcastingAbilityLabel: '',
  spellcastingStatCards: () => [],
  shownKnownSpells: () => [],
  shownPreparedSpells: () => [],
  availableSpellCards: () => [],
  spellSearch: '',
  spellSaving: false,
  spellSaveError: '',
  spellSaveSuccess: '',
  preparedSpellCards: () => [],
  knownSpellCards: () => [],
  speciesGrantedSpellCards: () => [],
  featChoiceSpells: () => [],
  featChoiceSpellCards: () => []
})

const emit = defineEmits<{
  (event: 'open-builder'): void
  (event: 'save-spells'): void
  (event: 'update-search', value: string): void
  (event: 'open-spell', spell: any): void
  (event: 'add-known', spell: any): void
  (event: 'prepare-spell', spell: any): void
  (event: 'remove-prepared', spell: any): void
  (event: 'remove-known', spell: any): void
  (event: 'toggle-spell-panel', key: string): void
}>()

function inputValue(event: Event) {
  const target = event.target as HTMLInputElement | null
  return target?.value || ''
}

function panelOpen(key: string) {
  return props.spellPanelOpen?.(key) ?? true
}

function panelChevron(key: string) {
  return props.spellPanelChevron?.(key) || (panelOpen(key) ? 'i-lucide-chevron-up' : 'i-lucide-chevron-down')
}

function levelLabel(spell: any) {
  return props.spellOptionLevelLabel?.(spell) || 'Open spell details'
}

function spellPrepared(spell: any) {
  return props.isPreparedSpell?.(spell?.id) ?? false
}
</script>

<template>
  <section class="mt-6 grid gap-4 lg:grid-cols-2">
    <!-- Mobile Spell Builder Entry -->
    <div
      v-if="mode === 'build'"
      class="eldra-codex-soft rounded-none p-4 lg:col-span-2 md:hidden"
    >
      <div class="flex items-center justify-between gap-3">
        <div>
          <div class="text-xs uppercase tracking-[0.3em] text-[#9f9278]">Spell Builder</div>
          <div class="mt-1 text-sm text-[#d8ceb8]">
            Add known spells, prepare spells, or intentionally use advanced overrides.
          </div>
        </div>

        <button
          type="button"
          class="eldra-button rounded-none px-3 py-2 text-xs font-semibold"
          @click="emit('open-builder')"
        >
          Manage Spells
        </button>
      </div>

      <div class="mt-3 grid grid-cols-3 gap-2 text-xs">
        <div class="rounded-none border border-[rgba(65,82,103,0.62)] bg-[rgba(8,17,27,0.68)] p-2">
          <div class="uppercase tracking-[0.18em] text-[#9f9278]">Known</div>
          <div class="mt-1 text-lg font-semibold text-white">{{ shownKnownSpells.length }}</div>
        </div>

        <div class="rounded-none border border-[rgba(65,82,103,0.62)] bg-[rgba(8,17,27,0.68)] p-2">
          <div class="uppercase tracking-[0.18em] text-[#9f9278]">Prepared</div>
          <div class="mt-1 text-lg font-semibold text-white">{{ shownPreparedSpells.length }}</div>
        </div>

        <div class="rounded-none border border-[rgba(65,82,103,0.62)] bg-[rgba(8,17,27,0.68)] p-2">
          <div class="uppercase tracking-[0.18em] text-[#9f9278]">Available</div>
          <div class="mt-1 text-lg font-semibold text-white">{{ availableSpellCards.length }}</div>
        </div>
      </div>
    </div>

    <div
      v-if="hasSpellcastingMath"
      class="eldra-codex-soft rounded-none p-4 lg:col-span-2"
    >
      <div class="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div class="text-xs uppercase tracking-[0.3em] text-[#9f9278]">Spellcasting Math</div>
        <div class="eldra-gold-chip rounded-none border px-3 py-1 text-xs">
          {{ spellcastingAbilityLabel }}
        </div>
      </div>

      <div class="grid grid-cols-3 gap-2 text-xs">
        <div
          v-for="stat in spellcastingStatCards"
          :key="`tab-spellcasting-stat-${stat.key}`"
          class="rounded-none border border-[rgba(65,82,103,0.62)] bg-[rgba(8,17,27,0.68)] p-2"
        >
          <div class="uppercase tracking-[0.18em] text-[#9f9278]">{{ stat.label }}</div>
          <div class="mt-1 text-lg font-semibold text-white">{{ stat.value }}</div>
          <div class="mt-0.5 text-[10px] text-[#9f9278]">{{ stat.note }}</div>
        </div>
      </div>
    </div>

    <div
      v-if="mode === 'build'"
      class="hidden md:block eldra-codex-soft rounded-none p-4 lg:col-span-2"
    >
      <div class="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div class="text-xs uppercase tracking-[0.3em] text-[#9f9278]">Spellbook Builder</div>
          <div class="mt-1 text-sm text-[#d8ceb8]">
            Search accessible spells, add them to the spellbook, then prepare what this character has ready.
          </div>
        </div>

        <button
          type="button"
          class="eldra-button rounded-none px-4 py-2 text-sm font-semibold disabled:opacity-50"
          :disabled="spellSaving"
          @click="emit('save-spells')"
        >
          {{ spellSaving ? 'Saving...' : 'Save Spells' }}
        </button>
      </div>

      <div class="mt-4">
        <label class="mb-2 block text-xs uppercase tracking-[0.25em] text-[#9f9278]">Search Spells</label>
        <input
          :value="spellSearch"
          type="text"
          placeholder="Search accessible spells..."
          class="eldra-input w-full rounded-none px-4 py-3 text-sm text-white placeholder-[#756a57]"
          @input="emit('update-search', inputValue($event))"
        >
      </div>

      <div
        v-if="spellSaveError"
        class="mt-3 rounded-none border border-red-500/20 bg-red-500/10 p-3 text-sm text-red-200"
      >
        {{ spellSaveError }}
      </div>

      <div
        v-if="spellSaveSuccess"
        class="mt-3 rounded-none border border-emerald-500/20 bg-emerald-500/10 p-3 text-sm text-emerald-200"
      >
        {{ spellSaveSuccess }}
      </div>
    </div>

    <div
      v-if="mode === 'build'"
      class="hidden md:block eldra-codex-soft rounded-none p-4 lg:col-span-2"
    >
      <div class="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div class="text-xs uppercase tracking-[0.3em] text-[#9f9278]">Available Class Spells</div>
          <div class="mt-1 text-sm text-[#d8ceb8]">
            Filtered by the linked class spell list. Feat-granted spells are handled separately below.
          </div>
        </div>

        <div class="eldra-gold-chip rounded-none border px-3 py-1 text-xs">
          {{ availableSpellCards.length }} Available
        </div>
      </div>

      <div
        v-if="availableSpellCards.length"
        class="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3"
      >
        <article
          v-for="spell in availableSpellCards"
          :key="spell.id"
          class="rounded-none border border-[rgba(201,164,90,0.18)] bg-[rgba(20,17,12,0.52)] p-4 text-sm text-[#d8ceb8]"
        >
          <div class="flex items-start justify-between gap-3">
            <button
              type="button"
              class="min-w-0 flex-1 text-left transition hover:text-[#fff7df]"
              @click.stop="emit('open-spell', spell)"
            >
              <div class="font-medium text-white">{{ spell.title }}</div>
              <div class="mt-1 text-xs text-[#9f9278]">{{ levelLabel(spell) || 'Spell' }}</div>
            </button>

            <button
              type="button"
              class="eldra-button shrink-0 rounded-none px-3 py-1.5 text-xs"
              @click.stop="emit('open-spell', spell)"
            >
              Details
            </button>
          </div>

          <div class="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              class="eldra-button rounded-none px-3 py-2 text-xs"
              @click="emit('add-known', spell)"
            >
              Add Known
            </button>

            <button
              type="button"
              class="eldra-button rounded-none px-3 py-2 text-xs"
              @click="emit('prepare-spell', spell)"
            >
              Prepare
            </button>
          </div>
        </article>
      </div>

      <div
        v-else
        class="mt-4 rounded-none border border-dashed border-[rgba(201,164,90,0.22)] p-4 text-sm text-[#9f9278]"
      >
        No available class spells match this sheet. Link a spellcasting class, import that class's spells, or clear the search.
      </div>
    </div>

    <div class="eldra-codex-soft rounded-none p-4">
      <div
        role="button"
        tabindex="0"
        class="flex w-full cursor-pointer flex-wrap items-center justify-between gap-3 text-left"
        @click="emit('toggle-spell-panel', 'prepared')"
        @keydown.enter.prevent="emit('toggle-spell-panel', 'prepared')"
        @keydown.space.prevent="emit('toggle-spell-panel', 'prepared')"
      >
        <div>
          <div class="text-xs uppercase tracking-[0.3em] text-[#9f9278]">Prepared Spells</div>
          <div class="mt-1 text-sm text-[#d8ceb8]">Spells currently prepared and ready to cast.</div>
        </div>

        <div class="eldra-gold-chip rounded-none border px-3 py-1 text-xs">
          {{ shownPreparedSpells.length }} Prepared
        </div>
        <UIcon :name="panelChevron('prepared')" class="h-4 w-4 text-[#9f9278]" />
      </div>

      <div v-show="panelOpen('prepared')">
        <div
          v-if="preparedSpellCards.length"
          class="mt-4 space-y-2"
        >
          <div
            v-for="spell in preparedSpellCards"
            :key="spell.id"
            class="rounded-none border border-[rgba(201,164,90,0.18)] bg-[rgba(20,17,12,0.52)] p-3 text-sm text-[#d8ceb8]"
          >
            <div class="flex items-start justify-between gap-3">
              <button
                type="button"
                class="min-w-0 flex-1 text-left transition hover:text-[#fff7df]"
                @click.stop="emit('open-spell', spell)"
              >
                <div class="font-medium text-white">{{ spell.title }}</div>
                <div class="mt-1 text-xs text-[#9f9278]">{{ levelLabel(spell) || 'Open spell details' }}</div>
              </button>

              <button
                v-if="mode === 'build'"
                type="button"
                class="shrink-0 rounded-none border border-red-500/20 bg-red-500/10 px-2 py-1 text-xs text-red-200 transition hover:bg-red-500/20"
                @click="emit('remove-prepared', spell)"
              >
                Unprepare
              </button>
            </div>
          </div>
        </div>

        <div
          v-else
          class="mt-4 rounded-none border border-dashed border-[rgba(201,164,90,0.22)] p-4 text-sm text-[#9f9278]"
        >
          {{ shownPreparedSpells.length ? 'No prepared spells match the current search.' : 'No prepared spells selected yet.' }}
        </div>
      </div>
    </div>

    <div class="eldra-codex-soft rounded-none p-4">
      <div
        role="button"
        tabindex="0"
        class="flex w-full cursor-pointer flex-wrap items-center justify-between gap-3 text-left"
        @click="emit('toggle-spell-panel', 'known')"
        @keydown.enter.prevent="emit('toggle-spell-panel', 'known')"
        @keydown.space.prevent="emit('toggle-spell-panel', 'known')"
      >
        <div>
          <div class="text-xs uppercase tracking-[0.3em] text-[#9f9278]">Known / Spellbook</div>
          <div class="mt-1 text-sm text-[#d8ceb8]">Spells this character knows or has in their spellbook.</div>
        </div>

        <div class="eldra-gold-chip rounded-none border px-3 py-1 text-xs">
          {{ shownKnownSpells.length }} Spell{{ shownKnownSpells.length === 1 ? '' : 's' }}
        </div>
        <UIcon :name="panelChevron('known')" class="h-4 w-4 text-[#9f9278]" />
      </div>

      <div v-show="panelOpen('known')">
        <div
          v-if="knownSpellCards.length"
          class="mt-4 space-y-2"
        >
          <div
            v-for="spell in knownSpellCards"
            :key="spell.id"
            class="rounded-none border border-[rgba(201,164,90,0.18)] bg-[rgba(20,17,12,0.52)] p-3 text-sm text-[#d8ceb8]"
          >
            <div class="flex items-start justify-between gap-3">
              <button
                type="button"
                class="min-w-0 flex-1 text-left transition hover:text-[#fff7df]"
                @click.stop="emit('open-spell', spell)"
              >
                <div class="font-medium text-white">{{ spell.title }}</div>
                <div class="mt-1 text-xs text-[#9f9278]">{{ levelLabel(spell) || 'Open spell details' }}</div>
              </button>

              <div
                v-if="mode === 'build'"
                class="flex shrink-0 flex-col gap-2"
              >
                <button
                  v-if="!spellPrepared(spell)"
                  type="button"
                  class="eldra-button rounded-none px-2 py-1 text-xs"
                  @click="emit('prepare-spell', spell)"
                >
                  Prepare
                </button>

                <button
                  v-else
                  type="button"
                  class="rounded-none border border-[rgba(201,164,90,0.22)] bg-[rgba(201,164,90,0.10)] px-2 py-1 text-xs text-[#f5e7bd]"
                  disabled
                >
                  Prepared
                </button>

                <button
                  type="button"
                  class="rounded-none border border-red-500/20 bg-red-500/10 px-2 py-1 text-xs text-red-200 transition hover:bg-red-500/20"
                  @click="emit('remove-known', spell)"
                >
                  Remove
                </button>
              </div>
            </div>
          </div>
        </div>

        <div
          v-else
          class="mt-4 rounded-none border border-dashed border-[rgba(201,164,90,0.22)] p-4 text-sm text-[#9f9278]"
        >
          {{ shownKnownSpells.length ? 'No known spells match the current search.' : 'No known spells selected yet.' }}
        </div>
      </div>
    </div>

    <div
      v-if="speciesGrantedSpellCards.length"
      class="eldra-codex-soft rounded-none p-4 lg:col-span-2"
    >
      <div class="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div class="text-xs uppercase tracking-[0.3em] text-[#9f9278]">Species / Lineage Spells</div>
          <div class="mt-1 text-sm text-[#d8ceb8]">Spells granted by selected species traits or lineage choices.</div>
        </div>

        <div class="eldra-gold-chip rounded-none border px-3 py-1 text-xs">
          {{ speciesGrantedSpellCards.length }} Spell{{ speciesGrantedSpellCards.length === 1 ? '' : 's' }}
        </div>
      </div>

      <div class="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
        <button
          v-for="spell in speciesGrantedSpellCards"
          :key="`species-granted-spell-${spell.id}`"
          type="button"
          class="block rounded-none border border-[rgba(201,164,90,0.18)] bg-[rgba(20,17,12,0.52)] p-3 text-left text-sm text-[#d8ceb8] transition hover:border-[rgba(201,164,90,0.42)] hover:bg-[rgba(201,164,90,0.10)]"
          @click.stop="emit('open-spell', spell)"
        >
          <div class="font-medium text-white">{{ spell.title }}</div>
          <div class="mt-1 text-xs text-[#9f9278]">
            {{ levelLabel(spell) || 'Species Spell' }}
            <span v-if="spell.grantLevel"> · Level {{ spell.grantLevel }}</span>
          </div>
        </button>
      </div>
    </div>

    <div class="eldra-codex-soft rounded-none p-4 lg:col-span-2">
      <div class="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div class="text-xs uppercase tracking-[0.3em] text-[#9f9278]">Feat Choice Spells</div>
          <div class="mt-1 text-sm text-[#d8ceb8]">Spells selected from feat-driven choices like Magic Initiate.</div>
        </div>

        <div class="eldra-gold-chip rounded-none border px-3 py-1 text-xs">
          {{ featChoiceSpells.length }} Spell{{ featChoiceSpells.length === 1 ? '' : 's' }}
        </div>
      </div>

      <div
        v-if="featChoiceSpellCards.length"
        class="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-3"
      >
        <button
          v-for="spell in featChoiceSpellCards"
          :key="spell.id"
          type="button"
          class="block rounded-none border border-[rgba(201,164,90,0.18)] bg-[rgba(20,17,12,0.52)] p-3 text-left text-sm text-[#d8ceb8] transition hover:border-[rgba(201,164,90,0.42)] hover:bg-[rgba(201,164,90,0.10)]"
          @click.stop="emit('open-spell', spell)"
        >
          <div class="font-medium text-white">{{ spell.title }}</div>
          <div class="mt-1 text-xs text-[#9f9278]">{{ levelLabel(spell) || 'Open spell details' }}</div>
        </button>
      </div>

      <div
        v-else
        class="mt-4 rounded-none border border-dashed border-[rgba(201,164,90,0.22)] p-4 text-sm text-[#9f9278]"
      >
        {{ featChoiceSpells.length ? 'No feat choice spells match the current search.' : 'No feat-granted spell choices selected yet.' }}
      </div>
    </div>
  </section>
</template>
