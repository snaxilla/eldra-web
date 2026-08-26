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
// A SINGLE SHARED TARGET, NOT A TARGETING UI
// ---------------------------------------------------------------------------
// One plain `<select>` of the World's other characters, shared by every
// resolvable row -- "a simple way to execute an action" (this task's own
// CHARACTER SHEET section), deliberately not a spatial/map-based target
// picker (explicitly out of scope). Only actions carrying a `resolution`
// (an attack roll or a saving throw -- Combat Resolution System addition)
// get a "Resolve" control at all; a passive Species trait or an
// unresolvable Class Feature has none, matching `attackBonus`/`saveDc`'s own
// "absent means not applicable" rule immediately above.
//
// ---------------------------------------------------------------------------
// MOBILE
// ---------------------------------------------------------------------------
// One column on phones, two where there is room -- the same
// `md:grid-cols-2` Inventory/Spellcasting's own carried-item grids already
// use. The target `<select>` and every Resolve button stay at min-h-11
// (44px), matching every other control in this Sheet.

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
}>()

const CATEGORY_LABELS: Record<CharacterActionCategory, string> = {
  weapon: 'Weapon', unarmed: 'Unarmed', spell: 'Spell',
  species: 'Species', class: 'Class', background: 'Background'
}

function signed(value: number): string {
  return value >= 0 ? `+${value}` : String(value)
}

const targetCharacterId = ref('')

function resolve(actionId: string) {
  if (!targetCharacterId.value || props.resolving) return
  emit('resolve', { actionId, targetCharacterId: targetCharacterId.value })
}
</script>

<template>
  <div class="grid gap-4">
    <p
      v-if="errorMessage"
      class="rounded-none border border-red-900 bg-red-950/40 p-3 text-sm text-red-300"
    >
      {{ errorMessage }}
    </p>

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
      Nothing yet -- equip a weapon, prepare a spell, or check back once Species/Class/Background are set.
    </p>

    <div
      v-else
      class="grid gap-2 md:grid-cols-2"
    >
      <article
        v-for="action in actions"
        :key="action.id"
        class="min-w-0 rounded-none border border-[rgba(201,164,90,0.20)] bg-[rgba(20,17,12,0.55)] p-3 text-sm text-[#d8ceb8]"
      >
        <div class="flex items-start justify-between gap-3">
          <div class="min-w-0">
            <div class="truncate font-semibold text-[#fff7df]">
              {{ action.name }}
            </div>
            <div class="mt-1 flex flex-wrap gap-x-2 gap-y-1 text-xs text-[#9f9278]">
              <span class="eldra-gold-chip rounded-none border px-2 py-0.5 uppercase tracking-[0.08em]">
                {{ CATEGORY_LABELS[action.category] }}
              </span>
              <span>{{ action.actionType }}</span>
            </div>
          </div>

          <!-- Attack Bonus / Save DC -- Rules Engine output, when this
               action has one to show. Absent means "not yet available"
               (no Rules Package activated), never a fabricated zero. -->
          <div
            v-if="action.attackBonus !== undefined || action.saveDc !== undefined"
            class="shrink-0 text-right"
          >
            <div
              v-if="action.attackBonus !== undefined"
              class="text-base font-semibold tabular-nums text-[#fff7df]"
            >
              {{ signed(action.attackBonus) }}
            </div>
            <div
              v-if="action.saveDc !== undefined"
              class="text-xs text-[#9f9278]"
            >
              DC {{ action.saveDc }}
            </div>
          </div>
        </div>

        <dl
          v-if="action.range || action.damage || action.usage"
          class="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs"
        >
          <template v-if="action.range">
            <dt class="text-[#9f9278]">
              Range
            </dt>
            <dd class="text-[#d8ceb8]">
              {{ action.range }}
            </dd>
          </template>
          <template v-if="action.damage">
            <dt class="text-[#9f9278]">
              Damage
            </dt>
            <dd class="text-[#d8ceb8]">
              {{ action.damage }}
            </dd>
          </template>
          <template v-if="action.usage">
            <dt class="text-[#9f9278]">
              Usage
            </dt>
            <dd class="text-[#d8ceb8]">
              {{ action.usage }}
            </dd>
          </template>
        </dl>

        <p
          v-if="action.description"
          class="mt-2 border-t border-[rgba(201,164,90,0.14)] pt-2 text-xs leading-5 text-[#9f9278]"
        >
          {{ action.description }}
        </p>

        <p
          v-if="action.sourceBook"
          class="mt-2 text-xs text-[#6f6754]"
        >
          {{ action.sourceBook }}
        </p>

        <!-- Combat Resolution: only actions with a resolution mechanic get
             a control at all. -->
        <template v-if="action.resolution">
          <button
            type="button"
            class="eldra-button mt-3 min-h-11 w-full rounded-none px-3 text-xs font-semibold disabled:cursor-not-allowed disabled:opacity-50"
            :disabled="!targetCharacterId || resolving"
            @click="resolve(action.id)"
          >
            {{ resolving ? 'Resolving…' : 'Resolve' }}
          </button>

          <div
            v-if="results[action.id]"
            class="mt-2 rounded-none border p-2 text-xs leading-5"
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
      </article>
    </div>
  </div>
</template>
