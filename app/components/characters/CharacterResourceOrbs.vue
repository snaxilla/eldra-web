<script setup lang="ts">
// CharacterResourceOrbs -- Character Sheet Caster Pass 0.1.
//
// The one reusable renderer for the Character Resource Presentation
// contract (characterResourcePresentation.ts, read that file's own header
// first). Renders every supplied resource GROUP (Spell Slots today; a
// future Sorcery Points/Rage/Ki group would render identically, with no
// change here) as a label plus one row of clickable orbs per POOL.
//
// PRESENTATION ONLY. This component owns no fetch and no mutation -- every
// orb click emits `expend`/`restore` naming which pool was clicked; the
// caller (which already owns the real mutation, e.g.
// CharacterCommandResources.vue's existing `expend-slot`/`restore-slot`
// relay to useCharacterMutations.ts) decides what that means and performs
// the actual authoritative write. No local orb state exists to drift from
// the server -- a click's visual result is whatever `groups` looks like on
// the NEXT render, once the real mutation's response updates it, the same
// "server decides, sheet reflects" discipline every other control on this
// Sheet already follows.
//
// ORB SEMANTICS -- ORBS HAVE NO IDENTITY BEYOND POSITION. A pool of `max`
// units with `expended` of them spent renders as `max - expended` filled
// (available, gold) orbs FIRST, then `expended` empty (dark) orbs LAST --
// e.g. max 4/expended 1 -> "gold gold gold dark". Clicking ANY gold orb
// expends one unit (emits `expend`); clicking ANY dark orb restores one
// (emits `restore`) -- never "orb #3 specifically", because the resulting
// expended COUNT is the only authoritative fact; an individual orb is a
// rendering position, not a tracked object. This intentionally keeps
// ordering stable and predictable after every click (the boundary between
// gold and dark simply moves by one), rather than a set of independently
// addressable checkboxes that could reorder unpredictably.
//
// V1 PRECEDENT: the legacy sheet (app/pages/worlds/[id]/entities/
// [entityId]/sheet.vue) had three near-identical hand-rolled orb/pip UIs
// (spell slot "gems", species-action pips, item-action pips), all sharing
// this exact fill-from-one-end counter interaction, each copy-pasted with
// its own color and its own accessibility gaps (title-only, no aria-label,
// no aria-pressed, tap targets as small as 12px). This component keeps
// V1's proven INTERACTION idea (click the filled zone to spend, the empty
// zone to restore) and its glow-when-available visual language, but is
// written ONCE, uses a real accessible name (aria-label + a redundant
// sr-only span) and aria-pressed on every orb (borrowed from V2's own
// Death Save marks in CharacterCommandResources.vue -- the more accessible
// reference implementation already in this codebase), and a single
// consistent gold/dark Eldra color pair rather than V1's per-spell-level
// rainbow (a decorative detail this task's own ORB section names
// explicitly: "filled/gold orb = available; empty/dark orb = expended").
//
// NO 5E KNOWLEDGE. This component knows nothing about spell levels, class
// names, or how many pools a group may have -- it loops over whatever
// `groups`/`pools` it is handed. `characterResourcePresentation.ts`'s own
// adapter is the only place spell slots are even mentioned.
//
// ---------------------------------------------------------------------------
// D&D 2024 Character Rules Phase 2A.2 -- LARGE NUMERIC POOLS ('points' style)
// ---------------------------------------------------------------------------
// One-orb-per-unit does not scale to a pool whose real maximum can reach
// 100 (Lay on Hands, `5 × level` at level 20) -- rendering 100 `<button>`
// elements is not acceptable (this phase's own explicit acceptance
// requirement). `pool.style === 'points'` (relayed verbatim from the
// Resource Definition's own package-authored `presentation.style` --
// characterResourcePresentation.ts's adapter, never inferred here from
// `pool.max`) renders a COMPACT control instead: a `remaining / max`
// readout plus a small amount input and Spend/Restore buttons. Still the
// exact same `groups`/`pools` contract and the exact same "this component
// owns no mutation" rule -- a click still only ever emits `expend`/
// `restore`, now carrying an `amount` (defaulting to 1 for an ordinary orb
// click, user-entered for a points control) for the caller's own
// authoritative write to apply. The server remains the sole authority on
// whether that amount is actually affordable (`expendResource`/
// `restoreResource`, app/lib/characters/resources.ts, already clamp against
// the real max/zero regardless of what this component sends).

import { ref } from 'vue'
import {
  isResourceUnitAvailable,
  resourceUnitAriaLabel,
  type CharacterResourceGroup,
  type CharacterResourcePool
} from './characterResourcePresentation'

withDefaults(defineProps<{
  groups: readonly CharacterResourceGroup[]
  saving?: boolean
}>(), {
  saving: false
})

const emit = defineEmits<{
  expend: [{ groupId: string; poolId: string; amount: number }]
  restore: [{ groupId: string; poolId: string; amount: number }]
}>()

function orbAvailable(pool: CharacterResourcePool, position: number): boolean {
  return isResourceUnitAvailable(pool, position)
}

function orbAriaLabel(group: CharacterResourceGroup, pool: CharacterResourcePool, position: number): string {
  return resourceUnitAriaLabel(group.label, pool, position)
}

function onOrbClick(group: CharacterResourceGroup, pool: CharacterResourcePool, position: number) {
  if (!pool.adjustable) return
  const payload = { groupId: group.id, poolId: pool.id, amount: 1 }
  if (orbAvailable(pool, position)) {
    emit('expend', payload)
  } else {
    emit('restore', payload)
  }
}

// One draft amount per points-style pool, keyed by pool id -- a plain
// object (not a single shared ref) so multiple large pools on the same
// Sheet never share one draft. Purely a client-side INPUT DRAFT, exactly
// like CharacterCommandResources.vue's own `amountDraft` for Damage/Heal;
// never trusted as authority, never itself the thing that changes
// `expended`.
const amountDrafts = ref<Record<string, string>>({})

function amountDraftFor(pool: CharacterResourcePool): string {
  return amountDrafts.value[pool.id] ?? '1'
}

function parsedAmount(pool: CharacterResourcePool): number {
  const parsed = Math.trunc(Number(amountDraftFor(pool)))
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1
}

function onPointsExpend(group: CharacterResourceGroup, pool: CharacterResourcePool) {
  if (!pool.adjustable) return
  emit('expend', { groupId: group.id, poolId: pool.id, amount: parsedAmount(pool) })
}

function onPointsRestore(group: CharacterResourceGroup, pool: CharacterResourcePool) {
  if (!pool.adjustable) return
  emit('restore', { groupId: group.id, poolId: pool.id, amount: parsedAmount(pool) })
}
</script>

<template>
  <div
    v-if="groups.length"
    class="grid gap-2.5"
  >
    <div
      v-for="group in groups"
      :key="group.id"
    >
      <div class="text-[0.6rem] uppercase tracking-[0.16em] text-[#9f9278]">
        {{ group.label }}
      </div>

      <div class="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1.5">
        <div
          v-for="pool in group.pools"
          :key="pool.id"
          class="flex flex-wrap items-center gap-1.5"
        >
          <span
            v-if="pool.label"
            class="shrink-0 text-xs font-semibold uppercase tracking-[0.08em] text-[#d8ceb8]"
          >
            {{ pool.label }}
          </span>

          <!-- D&D 2024 Character Rules Phase 2A.2 -- DISPLAY VARIANTS. The
               die-face badge is shown ONLY when the caller's own
               `pool.dieFaces` is present, which is itself only ever set
               from a package-declared `presentation.style === 'dice'`
               Resource Definition (characterResourcePresentation.ts's own
               genericResourcesToCharacterResources adapter) -- never
               inferred here from `pool.label`/`group.label` text. -->
          <span
            v-if="pool.dieFaces"
            class="shrink-0 rounded-none border border-[rgba(201,164,90,0.4)] px-1 text-[0.6rem] font-semibold tabular-nums text-[#c9a45a]"
          >
            d{{ pool.dieFaces }}
          </span>

          <!-- D&D 2024 Character Rules Phase 2A.2 -- large numeric pools.
               `pool.style === 'points'` is the ONLY branch; everything
               above (label, die badge) is shared with orbs unchanged. -->
          <div
            v-if="pool.style === 'points'"
            class="flex flex-wrap items-center gap-1.5"
          >
            <span class="text-sm tabular-nums text-[#d8ceb8]">
              {{ pool.max - pool.expended }} / {{ pool.max }}
            </span>
            <input
              v-model="amountDrafts[pool.id]"
              type="number"
              min="1"
              inputmode="numeric"
              :aria-label="`${group.label} ${pool.label ?? ''} amount`"
              class="eldra-input h-8 w-14 rounded-none px-1.5 text-center text-xs font-semibold tabular-nums text-white"
              :disabled="saving || !pool.adjustable"
              :placeholder="amountDraftFor(pool)"
            >
            <button
              type="button"
              class="eldra-button h-8 rounded-none px-2 text-xs font-semibold disabled:cursor-not-allowed disabled:opacity-50"
              :disabled="saving || !pool.adjustable || pool.max - pool.expended <= 0"
              @click="onPointsExpend(group, pool)"
            >
              Spend
            </button>
            <button
              type="button"
              class="h-8 rounded-none border border-[rgba(201,164,90,0.5)] bg-[rgba(201,164,90,0.12)] px-2 text-xs font-semibold text-[#fff7df] disabled:cursor-not-allowed disabled:opacity-50"
              :disabled="saving || !pool.adjustable || pool.expended <= 0"
              @click="onPointsRestore(group, pool)"
            >
              Restore
            </button>
          </div>

          <div
            v-else
            class="flex flex-wrap gap-1"
          >
            <button
              v-for="position in pool.max"
              :key="position"
              type="button"
              class="size-6 shrink-0 rounded-full border transition hover:scale-105 focus-visible:ring-2 focus-visible:ring-[rgba(201,164,90,0.65)] disabled:cursor-not-allowed disabled:hover:scale-100"
              :class="orbAvailable(pool, position)
                ? 'border-[rgba(201,164,90,0.85)] bg-[rgba(201,164,90,0.55)] shadow-[0_0_6px_rgba(201,164,90,0.35)]'
                : 'border-[rgba(201,164,90,0.24)] bg-transparent opacity-50'"
              :disabled="saving || !pool.adjustable"
              :aria-label="orbAriaLabel(group, pool, position)"
              :aria-pressed="orbAvailable(pool, position)"
              @click="onOrbClick(group, pool, position)"
            >
              <span class="sr-only">{{ orbAriaLabel(group, pool, position) }}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
