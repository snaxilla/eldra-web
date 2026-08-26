<script setup lang="ts">
// Actions for Character Sheet V2 -- the Character Actions System's read-only
// surface. "What can my character do?", never "what happens when I click
// it." No button here rolls a die, resolves a hit, or applies damage --
// there is no automation in this file at all, matching this task's own
// NON-GOALS in full.
//
// THIS COMPONENT CALCULATES NOTHING, the same rule CharacterDerivedPanel.vue
// already states for itself. `attackBonus` and `saveDc` arrive as PROPS
// already evaluated by the Rules Engine
// (server/utils/character-actions.ts, composing character-derived.ts's own
// `combat`/`spellcasting` categories) -- this file reads them, never
// recomputes them. `damage` is a presentation-only STRING every action
// carries (a weapon's printed dice, Unarmed Strike's fixed RAW expression),
// never rolled here or anywhere in this codebase.
//
// ---------------------------------------------------------------------------
// READ-ONLY, UNLIKE INVENTORY/HEALTH/SPELLCASTING
// ---------------------------------------------------------------------------
// Every other Sheet-V2 panel this task studied (Inventory, Health,
// Spellcasting) is the Sheet's deliberate exception to "the Sheet displays,
// the Builder edits" -- each edits PLAYER DATA that changes during play.
// Actions edits nothing: it is a live PROJECTION of Species/Class/
// Background/equipped weapons/prepared spells, all of which are already
// edited through their own surfaces (Inventory equips a weapon;
// Spellcasting prepares a spell). Changing loadout there is what changes
// this list; there is nothing left to edit here, so this component defines
// no emits at all.
//
// ---------------------------------------------------------------------------
// MOBILE
// ---------------------------------------------------------------------------
// One column on phones, two where there is room -- the same
// `md:grid-cols-2` Inventory/Spellcasting's own carried-item grids already
// use. No control exists to size for touch, because there is no control.

export type CharacterActionCategory = 'weapon' | 'unarmed' | 'spell' | 'species' | 'class' | 'background'

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
}

withDefaults(defineProps<{
  actions?: readonly CharacterAction[]
  pending?: boolean
  errorMessage?: string
}>(), {
  actions: () => [],
  pending: false,
  errorMessage: ''
})

const CATEGORY_LABELS: Record<CharacterActionCategory, string> = {
  weapon: 'Weapon', unarmed: 'Unarmed', spell: 'Spell',
  species: 'Species', class: 'Class', background: 'Background'
}

function signed(value: number): string {
  return value >= 0 ? `+${value}` : String(value)
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
      </article>
    </div>
  </div>
</template>
