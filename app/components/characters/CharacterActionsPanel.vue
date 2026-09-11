<script setup lang="ts">
// Actions for Character Sheet V2 -- the Character Actions System's surface,
// extended by Combat Resolution to EXECUTE the one action a player picks
// against one target. "What can my character do?", and now, simply,
// "what happened when they did it" -- never a combat tracker, never
// automation beyond the one action resolved.
//
// THIS COMPONENT CALCULATES NOTHING, the same rule CharacterDerivedPanel.vue
// already states for itself. `attackBonus`/`saveDc` (Actions) and every
// number inside a resolved `CombatOutcome` (Combat Resolution) all arrive as
// PROPS already evaluated/decided by the server
// (server/utils/character-actions.ts, server/utils/character-combat.ts) --
// this file reads them, never recomputes them, rolls a die, or decides
// hit/miss itself. Clicking "Resolve" emits INTENT
// ({ actionId, targetCharacterId }); the PAGE calls
// POST .../combat and hands the result back down as `results`, the exact
// same "panel emits, page calls the endpoint, result flows back as a prop"
// shape CharacterHealthPanel.vue's own Recovery actions already use.
//
// ---------------------------------------------------------------------------
// A TABLE, NOT A PILE OF CARDS -- Desktop IA pass
// ---------------------------------------------------------------------------
// Rebuilt against the reference sheet's own Actions tab, whose single
// biggest usability advantage over V2's card grid is that it is a TABLE:
// one row per action, fixed columns (attack, range, hit/DC, damage, notes),
// so a player scans down one column instead of reading six boxes. Cards
// forced every action to be as tall as its prose; rows make twelve actions
// legible at once.
//
// The prose itself is not deleted, it MOVES: clicking a row opens it in
// Eldra's shared context drawer (`select`), which is the same progressive
// disclosure V1 had via its own four detail drawers and the reason lists
// can stay dense. This component does not own or know about that drawer --
// it emits the intent and the page decides, exactly as it already does for
// Resolve.
//
// ---------------------------------------------------------------------------
// FILTERS -- STRUCTURED, NEVER PROSE-MATCHED, NEVER SYSTEM LANGUAGE
// ---------------------------------------------------------------------------
// DND5E Playability Audit (Step 7): the previous filter bar showed pills
// built from raw `actionType` strings (never actually "Action / Bonus
// Action / Reaction" -- for a weapon that is "Melee Attack", for a spell it
// is "Level 1 Spell (Evocation)", one pill per school/level combination) and
// a "Resolvable only" toggle -- internal engine vocabulary (`resolution`
// presence) a player has no reason to understand, and one that actively hid
// legitimate castable utility spells with no attack/save (Shield, Cure
// Wounds) since those never carry a `resolution`. Both are replaced with a
// filter over `category`, the one distinction this data actually and always
// supports honestly: Attacks (weapon + unarmed) and Spells. A pill for
// Bonus Actions/Reactions is NOT added -- weapon/unarmed actions carry no
// action-economy field at all, so that distinction is not something this
// data can honestly support yet (see character-actions.ts's own note on
// why Species/Class/Background rows, the other source of noise, are not in
// this list at all any more).
//
// ---------------------------------------------------------------------------
// A SINGLE SHARED TARGET, NOT A TARGETING UI
// ---------------------------------------------------------------------------
// One plain `<select>` of the World's other characters, shared by every
// resolvable row -- "a simple way to execute an action", deliberately not a
// spatial/map-based target picker (explicitly out of scope). Only actions
// carrying a `resolution` (an attack roll or a saving throw) get a
// "Resolve" control at all; a non-attack/non-save spell (Shield, Cure
// Wounds) has none, matching `attackBonus`/`saveDc`'s own "absent means not
// applicable" rule -- it is still a real, castable action, just not one
// this system resolves automatically.
//
// ---------------------------------------------------------------------------
// MOBILE
// ---------------------------------------------------------------------------
// The column headings are desktop-only; below `md` each row stacks into a
// name plus a wrapped meta line, so nothing is lost and nothing scrolls
// sideways. The target `<select>`, every filter pill, and every Resolve
// button stay at min-h-11 (44px), matching every other control in this
// Sheet.
//
// ---------------------------------------------------------------------------
// MATERIAL
// ---------------------------------------------------------------------------
// Every row now carries `eldra-well`, where previously only resolvable rows
// did. That is not a loosening of Design Language §8 Rule 2 ("interactive
// controls always sit on a Steel well") but a consequence of it: as of this
// pass EVERY row is interactive, because every row opens its detail. The
// resolvable/passive distinction it used to carry is now shown by the
// affordance that actually differs -- the Resolve control -- rather than by
// the surface.

export type CharacterActionCategory = 'weapon' | 'unarmed' | 'spell' | 'species' | 'class' | 'background'

export type ActionResolution =
  | { kind: 'attack-roll'; attackKind: 'melee' | 'ranged' | 'spell' }
  | { kind: 'saving-throw'; savingAbility: string }

export type CharacterAction = {
  id: string
  name: string
  category: CharacterActionCategory
  actionType: string
  range?: string
  damage?: string
  description?: string
  usage?: string
  sourceBook?: string
  attackBonus?: number
  saveDc?: number
  resolution?: ActionResolution
}

// Restated client-side from server/utils/character-combat.ts's own
// CombatResolutionSuccess -- `app/` must never import from `server/`, the
// same rule every other panel in this family already follows for its own
// server-shaped prop.
export type CombatOutcome = {
  hit: boolean
  critical: boolean
  attackRoll?: { roll: number; bonus: number; total: number; targetArmorClass: number }
  savingThrow?: { roll: number; bonus: number; total: number; dc: number; success: boolean }
  damage?: { rolls: number[]; modifier: number; total: number; type?: string; halvedFrom?: number }
  targetHealth: { currentHp: number }
}

const props = withDefaults(defineProps<{
  actions?: readonly CharacterAction[]
  pending?: boolean
  errorMessage?: string
  // Other characters in this World a resolvable action can target.
  targetOptions?: readonly { id: string; title: string }[]
  // The last CombatOutcome for a given action id, keyed by that id -- one
  // slot per action, matching "one attacker, one action, one target" (no
  // history, no log).
  results?: Record<string, CombatOutcome>
  resolving?: boolean
}>(), {
  actions: () => [],
  pending: false,
  errorMessage: '',
  targetOptions: () => [],
  results: () => ({}),
  resolving: false
})

const emit = defineEmits<{
  resolve: [{ actionId: string; targetCharacterId: string }]
  select: [CharacterAction]
}>()

const CATEGORY_LABELS: Record<CharacterActionCategory, string> = {
  weapon: 'Weapon', unarmed: 'Unarmed', spell: 'Spell',
  species: 'Species', class: 'Class', background: 'Background'
}

function signed(value: number): string {
  return value >= 0 ? `+${value}` : String(value)
}

const targetCharacterId = ref('')

// ---------------------------------------------------------------------------
// Filtering -- see this file's header on why the timing pills are derived
// from the data rather than declared here.
// ---------------------------------------------------------------------------

const ALL_FILTER = '__all__'

type ActionFilterCategory = 'attacks' | 'spells'

function filterCategoryOf(action: CharacterAction): ActionFilterCategory | null {
  if (action.category === 'weapon' || action.category === 'unarmed') return 'attacks'
  if (action.category === 'spell') return 'spells'
  return null
}

const FILTER_LABELS: Record<ActionFilterCategory, string> = {
  attacks: 'Attacks',
  spells: 'Spells'
}

const availableFilters = computed(() => {
  const present = new Set<ActionFilterCategory>()
  for (const action of props.actions) {
    const category = filterCategoryOf(action)
    if (category) present.add(category)
  }
  return (['attacks', 'spells'] as const).filter((category) => present.has(category))
})

const activeFilter = ref<ActionFilterCategory | typeof ALL_FILTER>(ALL_FILTER)

// A filter that no longer matches anything this character has (equipment
// changed, a spell was unprepared) silently falls back to All rather than
// showing an empty table for a reason the player cannot see.
watch(availableFilters, (available) => {
  if (activeFilter.value !== ALL_FILTER && !available.includes(activeFilter.value)) {
    activeFilter.value = ALL_FILTER
  }
})

const visibleActions = computed(() =>
  props.actions.filter((action) => {
    if (activeFilter.value === ALL_FILTER) return true
    return filterCategoryOf(action) === activeFilter.value
  })
)

function resolve(actionId: string) {
  if (!targetCharacterId.value || props.resolving) return
  emit('resolve', { actionId, targetCharacterId: targetCharacterId.value })
}

// The "Hit / DC" column carries whichever of the two the action declares --
// absent stays absent, never a fabricated zero.
function hitOrDc(action: CharacterAction): string {
  if (action.attackBonus !== undefined) return signed(action.attackBonus)
  if (action.saveDc !== undefined) return `DC ${action.saveDc}`
  return '—'
}
</script>

<template>
  <div class="grid gap-3">
    <p
      v-if="errorMessage"
      class="rounded-none border border-red-900 bg-red-950/40 p-3 text-sm text-red-300"
    >
      {{ errorMessage }}
    </p>

    <!-- Filter bar. Pills are All / Attacks / Spells -- the one distinction
         this data actually and honestly supports (see this file's own
         header note on why "Resolvable only" and per-actionType pills are
         gone). -->
    <div
      v-if="actions.length"
      class="flex flex-wrap items-center gap-1.5"
    >
      <button
        type="button"
        class="min-h-11 rounded-none border px-3 text-xs uppercase tracking-[0.12em] transition"
        :class="activeFilter === ALL_FILTER
          ? 'border-[rgba(201,164,90,0.55)] text-[#fff7df]'
          : 'border-[rgba(201,164,90,0.20)] text-[#9f9278] hover:text-[#d8ceb8]'"
        :aria-pressed="activeFilter === ALL_FILTER"
        @click="activeFilter = ALL_FILTER"
      >
        All
      </button>

      <button
        v-for="category in availableFilters"
        :key="category"
        type="button"
        class="min-h-11 rounded-none border px-3 text-xs uppercase tracking-[0.12em] transition"
        :class="activeFilter === category
          ? 'border-[rgba(201,164,90,0.55)] text-[#fff7df]'
          : 'border-[rgba(201,164,90,0.20)] text-[#9f9278] hover:text-[#d8ceb8]'"
        :aria-pressed="activeFilter === category"
        @click="activeFilter = category"
      >
        {{ FILTER_LABELS[category] }}
      </button>
    </div>

    <!-- One shared target for every resolvable row below -- see this
         file's own header on why this is not a targeting UI. -->
    <label
      v-if="targetOptions.length"
      class="block"
    >
      <span class="mb-2 block text-xs uppercase tracking-[0.22em] text-[#9f9278]">Target</span>
      <select
        v-model="targetCharacterId"
        class="eldra-input min-h-11 w-full rounded-none px-3 py-2 text-sm text-white"
      >
        <option
          value=""
          class="bg-[#090909] text-[#f5e7bd]"
        >
          No target selected
        </option>
        <option
          v-for="option in targetOptions"
          :key="option.id"
          :value="option.id"
          class="bg-[#090909] text-[#f5e7bd]"
        >
          {{ option.title }}
        </option>
      </select>
    </label>

    <p
      v-if="pending"
      class="text-sm text-[#9f9278]"
    >
      Loading actions…
    </p>

    <p
      v-else-if="!actions.length"
      class="text-sm text-[#9f9278]"
    >
      Nothing yet — equip a weapon, prepare a spell, or check back once Species/Class/Background are set.
    </p>

    <p
      v-else-if="!visibleActions.length"
      class="text-sm text-[#9f9278]"
    >
      No actions match this filter.
    </p>

    <template v-else>
      <!-- Column headings, matching the reference sheet's own action table.
           Desktop only, and hidden from assistive technology: each row
           already carries its own labelled values. -->
      <div
        aria-hidden="true"
        class="hidden border-b border-[rgba(201,164,90,0.16)] px-3 pb-1 text-[0.55rem] uppercase tracking-[0.16em] text-[#6f6754] md:grid md:grid-cols-[minmax(0,1fr)_5.5rem_4.5rem_6.5rem_minmax(0,7rem)] md:gap-3"
      >
        <span>Action</span>
        <span>Range</span>
        <span>Hit / DC</span>
        <span>Damage</span>
        <span>Notes</span>
      </div>

      <ul class="grid gap-1">
        <li
          v-for="action in visibleActions"
          :key="action.id"
        >
          <button
            type="button"
            class="eldra-well block w-full rounded-none px-3 py-2 text-left transition md:grid md:grid-cols-[minmax(0,1fr)_5.5rem_4.5rem_6.5rem_minmax(0,7rem)] md:items-center md:gap-3"
            :aria-label="`${action.name} — open details`"
            @click="emit('select', action)"
          >
            <span class="block min-w-0">
              <span class="block truncate text-sm font-semibold text-[#fff7df]">{{ action.name }}</span>
              <span class="mt-0.5 block truncate text-[0.6rem] uppercase tracking-[0.12em] text-[#9f9278]">
                {{ CATEGORY_LABELS[action.category] }}
              </span>
            </span>

            <!-- Below `md` the four table columns become one wrapped meta
                 line, each value still carrying its own label. -->
            <span class="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-[#d8ceb8] md:hidden">
              <span v-if="action.range"><span class="text-[#6f6754]">Range</span> {{ action.range }}</span>
              <span><span class="text-[#6f6754]">Hit/DC</span> {{ hitOrDc(action) }}</span>
              <span v-if="action.damage"><span class="text-[#6f6754]">Damage</span> {{ action.damage }}</span>
              <span v-if="action.actionType"><span class="text-[#6f6754]">Timing</span> {{ action.actionType }}</span>
            </span>

            <span class="hidden truncate text-xs text-[#d8ceb8] md:block">{{ action.range || '—' }}</span>
            <span class="hidden text-sm font-semibold tabular-nums text-[#fff7df] md:block">{{ hitOrDc(action) }}</span>
            <span class="hidden truncate text-xs tabular-nums text-[#d8ceb8] md:block">{{ action.damage || '—' }}</span>
            <span class="hidden truncate text-xs text-[#9f9278] md:block">{{ action.usage || action.actionType || '—' }}</span>
          </button>

          <!-- Combat Resolution: only actions with a resolution mechanic get
               a control at all. It sits outside the row button so activating
               it never also opens the detail drawer. -->
          <template v-if="action.resolution">
            <button
              type="button"
              class="eldra-button mt-1 min-h-11 w-full rounded-none px-3 text-xs font-semibold disabled:cursor-not-allowed disabled:opacity-50 md:w-auto md:px-4"
              :disabled="!targetCharacterId || resolving"
              @click="resolve(action.id)"
            >
              {{ resolving ? 'Resolving…' : 'Resolve' }}
            </button>

            <div
              v-if="results[action.id]"
              class="mt-1 rounded-none border p-2 text-xs leading-5"
              :class="results[action.id]!.hit
                ? 'border-[rgba(158,195,125,0.4)] bg-[rgba(158,195,125,0.08)] text-[#d8ceb8]'
                : 'border-[rgba(201,164,90,0.20)] bg-[rgba(20,17,12,0.4)] text-[#9f9278]'"
            >
              <template v-if="results[action.id]!.attackRoll">
                <div>
                  Attack roll {{ results[action.id]!.attackRoll!.roll }}
                  {{ signed(results[action.id]!.attackRoll!.bonus) }}
                  = {{ results[action.id]!.attackRoll!.total }}
                  vs AC {{ results[action.id]!.attackRoll!.targetArmorClass }}
                  — <strong>{{ results[action.id]!.critical ? 'Critical Hit' : results[action.id]!.hit ? 'Hit' : 'Miss' }}</strong>
                </div>
              </template>
              <template v-else-if="results[action.id]!.savingThrow">
                <div>
                  Target save {{ results[action.id]!.savingThrow!.roll }}
                  {{ signed(results[action.id]!.savingThrow!.bonus) }}
                  = {{ results[action.id]!.savingThrow!.total }}
                  vs DC {{ results[action.id]!.savingThrow!.dc }}
                  — <strong>{{ results[action.id]!.savingThrow!.success ? 'Save Succeeded' : 'Save Failed' }}</strong>
                </div>
              </template>

              <div v-if="results[action.id]!.damage && results[action.id]!.damage!.total > 0">
                Damage: {{ results[action.id]!.damage!.total }}
                <template v-if="results[action.id]!.damage!.type">({{ results[action.id]!.damage!.type }})</template>
                <template v-if="results[action.id]!.damage!.halvedFrom">
                  — halved from {{ results[action.id]!.damage!.halvedFrom }}
                </template>
              </div>

              <div class="mt-1 text-[#6f6754]">
                Target HP remaining: {{ results[action.id]!.targetHealth.currentHp }}
              </div>
            </div>
          </template>
        </li>
      </ul>
    </template>
  </div>
</template>
