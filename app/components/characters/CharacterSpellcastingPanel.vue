<script setup lang="ts">
// Spellcasting for Character Sheet V2 -- the Spellcasting System's editable
// surface. Shaped like CharacterHealthPanel.vue and CharacterInventoryPanel.vue
// combined, because this task is exactly their intersection: read-only Rules
// Engine summaries (Spellcasting Ability, Spell Save DC, Spell Attack Bonus --
// Health's Maximum HP role) sitting above two editable collections (Spell
// Slots -- Health's Hit Dice role; Known/Prepared Spells -- Inventory's carried
// items role).
//
// NOT ONE NUMBER IS COMPUTED HERE. `abilityMod`/`saveDc`/`attackBonus`/
// `isCaster` all arrive as PROPS already evaluated by the Rules Engine
// (server/utils/character-derived.ts's `spellcasting` category, read via
// `findDerivedNumber`/`findDerivedBoolean` exactly as Health's own summary
// props are). `slotLevels` (max per spell level) is picked from the active
// package's Spell Slot progression Table by the PAGE (sheet-v2.vue), which
// knows this character's caster type and level -- this file only renders
// whatever it is handed and emits `expend-slot`/`restore-slot` with a slot
// LEVEL, never a count it computed itself.
//
// ---------------------------------------------------------------------------
// KNOWN/PREPARED -- ONE SHARED SHAPE FOR EVERY 2024 CASTER ARCHETYPE
// ---------------------------------------------------------------------------
// `known`/`prepared` is the same boolean-pair shape Inventory's own
// `equipped`/`attuned` already uses, deliberately not distinguishing "prepares
// from the class list" (Wizard, Cleric, ...) from "learns a fixed spell list"
// (Warlock) -- see app/lib/characters/spellcasting.ts's own header for why.
//
// ---------------------------------------------------------------------------
// ALWAYS EDITABLE, LIKE INVENTORY AND HEALTH -- NOT LIKE ABILITY SCORES
// ---------------------------------------------------------------------------
// Learning a spell, marking one prepared, and expending a slot all happen
// DURING PLAY (or at least during downtime/level-up), not exclusively at
// character creation -- the same reasoning Inventory and Health's own headers
// already give for being the Sheet's exceptions to "the Sheet displays, the
// Builder edits."
//
// ---------------------------------------------------------------------------
// MOBILE
// ---------------------------------------------------------------------------
// Spell cards use the same one-column/two-column grid Inventory's carried
// items already use; Slot trackers use the same size-11 circular target
// CharacterHealthPanel.vue's Death Save marks already establish. Every
// control stays at min-h-11 (44px).

import type { AssembledSpellEntry, SpellFlag } from '~/lib/characters/spellcasting'

const props = withDefaults(defineProps<{
  spells: readonly AssembledSpellEntry[]
  // Catalogue-published spells this World can offer, already resolved by the
  // assembly endpoint -- mirrors CharacterInventoryPanel's own `options`.
  options?: readonly { packageId: string; slug: string; title: string; sourceBook?: string }[]
  // How many of each spell level (1-9) this character's Spell Slot
  // progression grants, and how many are currently expended -- both handed
  // down already resolved; see this file's own header.
  slotLevels?: readonly { level: number; max: number; expended: number }[]
  isCaster: boolean | null
  abilityMod: number | null
  saveDc: number | null
  attackBonus: number | null
  saving?: boolean
  errorMessage?: string
}>(), {
  options: () => [],
  slotLevels: () => [],
  saving: false,
  errorMessage: ''
})

const emit = defineEmits<{
  add: [{ ref?: { packageId: string; slug: string }; name?: string }]
  remove: [string]
  'toggle-flag': [{ instanceId: string; flag: SpellFlag }]
  'expend-slot': [number]
  'restore-slot': [number]
}>()

// --- Add form -------------------------------------------------------------

const search = ref('')
const selectedKey = ref('')
const customName = ref('')

function optionKey(option: { packageId: string; slug: string }) {
  return `${option.packageId}::${option.slug}`
}

const filteredOptions = computed(() => {
  const term = search.value.trim().toLowerCase()
  const all = props.options

  if (!term) return all.slice(0, 100)

  return all
    .filter((option) => option.title.toLowerCase().includes(term))
    .slice(0, 100)
})

const canAdd = computed(() => Boolean(selectedKey.value) || Boolean(customName.value.trim()))

function submitAdd() {
  if (!canAdd.value || props.saving) return

  const chosen = props.options.find((option) => optionKey(option) === selectedKey.value)

  emit('add', chosen
    ? { ref: { packageId: chosen.packageId, slug: chosen.slug } }
    : { name: customName.value.trim() })

  selectedKey.value = ''
  customName.value = ''
}

const knownCount = computed(() => props.spells.filter((entry) => entry.known).length)
const preparedCount = computed(() => props.spells.filter((entry) => entry.prepared).length)
</script>

<template>
  <div class="grid gap-4">
    <p
      v-if="errorMessage"
      class="rounded-none border border-red-900 bg-red-950/40 p-3 text-sm text-red-300"
    >
      {{ errorMessage }}
    </p>

    <!-- Spellcasting summary -- Ability, Save DC, Attack Bonus. Read-only:
         all three are Rules Engine output. -->
    <div class="rounded-none border border-[rgba(201,164,90,0.20)] bg-[rgba(20,17,12,0.55)] p-4">
      <div class="flex flex-wrap items-baseline justify-between gap-2">
        <span class="text-xs uppercase tracking-[0.3em] text-[#9f9278]">Spellcasting</span>
        <span
          v-if="isCaster === false"
          class="text-xs text-[#9f9278]"
        >
          This character has no spellcasting ability
        </span>
      </div>

      <div class="mt-3 grid grid-cols-3 gap-3 text-center">
        <div>
          <div class="text-xs uppercase tracking-[0.22em] text-[#9f9278]">
            Ability Mod
          </div>
          <div class="mt-1 text-lg font-semibold tabular-nums text-[#fff7df]">
            {{ abilityMod ?? '—' }}
          </div>
        </div>
        <div>
          <div class="text-xs uppercase tracking-[0.22em] text-[#9f9278]">
            Save DC
          </div>
          <div class="mt-1 text-lg font-semibold tabular-nums text-[#fff7df]">
            {{ saveDc ?? '—' }}
          </div>
        </div>
        <div>
          <div class="text-xs uppercase tracking-[0.22em] text-[#9f9278]">
            Attack Bonus
          </div>
          <div class="mt-1 text-lg font-semibold tabular-nums text-[#fff7df]">
            {{ attackBonus != null ? (attackBonus >= 0 ? `+${attackBonus}` : attackBonus) : '—' }}
          </div>
        </div>
      </div>
    </div>

    <!-- Spell Slots -- one row per spell level this character's Spell Slot
         progression grants at least one slot for. Expend/restore emit a
         LEVEL; the page decides the new count is legal (character-recovery.ts
         mirrors this for Health's Hit Dice). -->
    <div
      v-if="slotLevels.length"
      class="rounded-none border border-[rgba(201,164,90,0.20)] bg-[rgba(20,17,12,0.55)] p-4"
    >
      <span class="text-xs uppercase tracking-[0.3em] text-[#9f9278]">Spell Slots</span>

      <div class="mt-3 grid gap-2">
        <div
          v-for="slot in slotLevels"
          :key="slot.level"
          class="flex items-center justify-between gap-3"
        >
          <span class="text-sm text-[#d8ceb8]">Level {{ slot.level }}</span>
          <div class="flex items-center gap-2">
            <span class="text-sm tabular-nums text-[#9f9278]">
              {{ slot.max - slot.expended }} of {{ slot.max }}
            </span>
            <button
              type="button"
              class="min-h-11 min-w-11 rounded-none border border-[rgba(201,164,90,0.24)] text-sm font-semibold text-[#fff7df] focus-visible:ring-2 focus-visible:ring-[rgba(201,164,90,0.65)] disabled:cursor-not-allowed disabled:opacity-50"
              :disabled="saving || slot.expended <= 0"
              :aria-label="`Restore a level ${slot.level} spell slot`"
              @click="emit('restore-slot', slot.level)"
            >
              −
            </button>
            <button
              type="button"
              class="min-h-11 min-w-11 rounded-none border border-[rgba(201,164,90,0.24)] text-sm font-semibold text-[#fff7df] focus-visible:ring-2 focus-visible:ring-[rgba(201,164,90,0.65)] disabled:cursor-not-allowed disabled:opacity-50"
              :disabled="saving || slot.expended >= slot.max"
              :aria-label="`Expend a level ${slot.level} spell slot`"
              @click="emit('expend-slot', slot.level)"
            >
              +
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- Add ---------------------------------------------------------------- -->
    <div class="rounded-none border border-[rgba(201,164,90,0.20)] bg-[rgba(20,17,12,0.55)] p-4">
      <div class="text-xs uppercase tracking-[0.3em] text-[#9f9278]">
        Add Spell
      </div>
      <div class="mt-1 text-sm text-[#d8ceb8]">
        Add a published spell, or a homebrew spell of your own.
      </div>

      <div class="mt-4 grid gap-3">
        <label class="block">
          <span class="mb-2 block text-xs uppercase tracking-[0.22em] text-[#9f9278]">
            Search published spells
          </span>
          <input
            v-model="search"
            type="search"
            class="eldra-input mb-2 min-h-11 w-full rounded-none px-3 py-2 text-sm text-white"
            :placeholder="options.length ? 'Search by name…' : 'No spell content is bound to this World'"
            :disabled="!options.length"
          >
          <select
            v-model="selectedKey"
            class="eldra-input min-h-11 w-full rounded-none px-3 py-2 text-sm text-white"
            :disabled="!options.length"
          >
            <option
              value=""
              class="bg-[#090909] text-[#f5e7bd]"
            >
              No published spell selected
            </option>
            <option
              v-for="option in filteredOptions"
              :key="optionKey(option)"
              :value="optionKey(option)"
              class="bg-[#090909] text-[#f5e7bd]"
            >
              {{ option.title }}<template v-if="option.sourceBook"> · {{ option.sourceBook }}</template>
            </option>
          </select>
        </label>

        <label class="block">
          <span class="mb-2 block text-xs uppercase tracking-[0.22em] text-[#9f9278]">
            Homebrew spell name
          </span>
          <input
            v-model="customName"
            class="eldra-input min-h-11 w-full rounded-none px-3 py-2 text-sm text-white"
            placeholder="Used when no published spell is selected"
          >
        </label>
      </div>

      <button
        type="button"
        class="eldra-button mt-3 min-h-11 w-full rounded-none px-4 py-2 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
        :disabled="!canAdd || saving"
        @click="submitAdd"
      >
        {{ saving ? 'Saving…' : 'Add Spell' }}
      </button>
    </div>

    <!-- Known / Prepared ----------------------------------------------------- -->
    <div>
      <div class="flex flex-wrap items-center justify-between gap-3">
        <div class="text-xs uppercase tracking-[0.3em] text-[#9f9278]">
          Spells
        </div>
        <div class="eldra-gold-chip rounded-none border px-3 py-1 text-xs">
          {{ knownCount }} Known · {{ preparedCount }} Prepared
        </div>
      </div>

      <p
        v-if="!spells.length"
        class="mt-3 text-sm text-[#9f9278]"
      >
        No spells recorded yet.
      </p>

      <div
        v-else
        class="mt-3 grid gap-2 md:grid-cols-2"
      >
        <article
          v-for="entry in spells"
          :key="entry.instanceId"
          class="min-w-0 rounded-none border p-3 text-sm text-[#d8ceb8]"
          :class="entry.status === 'missing'
            ? 'border-red-900/60 bg-red-950/20'
            : 'border-[rgba(201,164,90,0.20)] bg-[rgba(20,17,12,0.55)]'"
        >
          <div class="flex items-start justify-between gap-3">
            <div class="min-w-0">
              <div class="truncate font-semibold text-[#fff7df]">
                {{ entry.title }}
              </div>
              <div class="mt-1 flex flex-wrap gap-x-2 gap-y-1 text-xs text-[#9f9278]">
                <span v-if="entry.entry?.sourceBook">{{ entry.entry.sourceBook }}</span>
                <span v-else-if="entry.status === 'custom'">Homebrew</span>
              </div>
            </div>

            <button
              type="button"
              class="min-h-11 shrink-0 rounded-none border border-[rgba(201,164,90,0.24)] px-3 text-xs font-semibold text-[#d8ceb8] focus-visible:ring-2 focus-visible:ring-[rgba(201,164,90,0.65)] disabled:opacity-50"
              :disabled="saving"
              @click="emit('remove', entry.instanceId)"
            >
              Remove
            </button>
          </div>

          <p
            v-if="entry.status === 'missing'"
            class="mt-2 text-xs leading-5 text-red-300"
          >
            {{ entry.reason || 'This spell is no longer published by any Content Pack bound to this World.' }}
          </p>

          <div class="mt-3 flex flex-wrap items-center gap-2">
            <label
              v-for="flag in (['known', 'prepared'] as const)"
              :key="flag"
              class="flex min-h-11 cursor-pointer items-center gap-2 rounded-none border px-3 text-xs font-semibold capitalize"
              :class="entry[flag]
                ? 'border-[rgba(201,164,90,0.65)] bg-[rgba(201,164,90,0.12)] text-[#fff7df]'
                : 'border-[rgba(201,164,90,0.24)] text-[#d8ceb8]'"
            >
              <input
                type="checkbox"
                class="size-4 accent-[#c9a45a] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[rgba(201,164,90,0.65)]"
                :checked="entry[flag]"
                :disabled="saving"
                @change="emit('toggle-flag', { instanceId: entry.instanceId, flag })"
              >
              {{ flag }}
            </label>
          </div>
        </article>
      </div>
    </div>
  </div>
</template>
