<script setup lang="ts">
// CharacterSheetRollRail -- Character Sheet Roll Tray, full redesign pass.
//
// Supersedes the two prior corrective rounds' approach of teaching
// WorldRollTray.vue a `variant`/`inline` prop and squeezing its EXISTING
// floating body into a narrow rail shape. That approach kept failing because
// it moved/resized the floating Tray's body instead of designing a body FOR
// a vertical rail -- this component is that from-scratch design. WorldRollTray.vue
// itself is reverted to its pristine, floating-only form (no `variant` prop
// at all); AdminRollSandbox.vue mounts that, unchanged and unaffected by
// anything in this file.
//
// SHELL: copied directly from CreationStageRail.vue's own `variant="rail"`
// markup -- same outer placeholder (`h-full shrink-0`, width-transitioning),
// same inner `absolute inset-y-0 left-0` nav (border/bg/blur), same `h-12`
// header toggle button, same token colors (`text-eldra-text-soft/strong/
// faint`, `border-eldra-accent/NN`). `CreationStageRail.vue` itself is left
// untouched: its `CreationStage[]` data model doesn't fit a roll feed, and
// there is no way to visually re-verify a shared-shell refactor's effect on
// the Creator in this environment, so copying the real classes into this
// independent component is preferred over extracting a shared shell and
// risking a working, unrelated surface with no way to confirm it still
// looks right. The one width this component does NOT copy from Stages is
// the EXPANDED width: Stages' `w-56` was sized for short text labels, not
// roll history (names, dice breakdowns, totals) -- `w-80` below is sized for
// THIS content, per this task's own "the expanded width does not have to
// match the Creator's if the Roll Tray's needs require more room."
//
// BODY: entirely new, not WorldRollTray.vue's floating body moved into a
// narrower box. Content hierarchy, top to bottom: persistent header (identity
// + collapse control, always visible); Private/Table (the `header-actions`
// slot) directly under it, visible whenever the rail is expanded; the
// reserved `dice-stage` slot; the manual dice rack (unchanged --
// WorldManualDiceRack.vue is already width-agnostic via `flex-wrap`, not
// Tray-specific markup); then the one scrolling region, `min-h-0 flex-1
// overflow-y-auto`, holding the history feed built from
// CharacterSheetRollRailEntry.vue (a redesigned row, not WorldRollTrayEntry.vue
// reused -- see that file's own header) plus Load More/error states. Only the
// history region scrolls; the header and Private/Table stay in view the whole
// time, per this task's own "header and controls stay visible while browsing
// a long history."
//
// STATIONARY / FULL HEIGHT: this component itself only ever declares `h-full`
// on its own root -- NOT `position: sticky`. The previous round's `sticky
// top-0` was the actual bug this round's own task names ("the existing tray
// scrolled away"): sticky can only hold an element within its own containing
// block's box, and that containing block (sheet-v2.vue's own flex row) was
// itself only as tall as one viewport -- once a sheet's content scrolled past
// that one screen's worth of height, the whole row (rail included) had
// already scrolled out, so the "sticky" rail scrolled away on every sheet
// taller than one screen. The actual fix is structural, in sheet-v2.vue: move
// scroll ownership down to the sheet's own content column (matching
// create-v2.vue's `relative z-10 flex h-full min-w-0` row, which never scrolls
// as a block -- only its `flex-1 overflow-y-auto` content column does), so
// this rail's row is simply never inside anything that scrolls, and `h-full`
// via the row's default stretch is all it needs. See sheet-v2.vue's own
// comment at its outer flex row for the full ancestor chain.
//
// ROLL STATE: holds none. Every prop here is `useWorldRolls()` state
// sheet-v2.vue already owns, passed straight through -- identical contract
// to what WorldRollTray.vue's `rolls`/`pending`/`error`/`historyPending`/
// `historyError`/`hasMore`/`emptyMessage` props and `load-more`/
// `roll-manual-die` events already were, so sheet-v2.vue's own roll-handling
// code (`loadMoreRolls`, `rollManualDie`, `rollVisibility`) needed no changes
// beyond swapping which component it mounts.

import CharacterSheetRollRailEntry from '~/components/characters/CharacterSheetRollRailEntry.vue'
import WorldManualDiceRack from '~/components/world/WorldManualDiceRack.vue'
import type { ManualDieOption } from '~/lib/rolls/requests'
import type { RollEventRecord } from '~/lib/rolls/types'

const props = withDefaults(defineProps<{
  rolls?: readonly RollEventRecord[]
  pending?: boolean
  error?: string
  historyPending?: boolean
  historyError?: string
  hasMore?: boolean
  defaultCollapsed?: boolean
  emptyMessage?: string
}>(), {
  rolls: () => [],
  pending: false,
  error: '',
  historyPending: false,
  historyError: '',
  hasMore: false,
  defaultCollapsed: false,
  emptyMessage: 'No rolls yet. Click an ability, saving throw, or skill to roll it.'
})

const emit = defineEmits<{
  'load-more': []
  'roll-manual-die': [ManualDieOption]
}>()

const collapsed = ref(props.defaultCollapsed)

const latestRoll = computed(() => props.rolls[0] ?? null)
</script>

<template>
  <div
    class="relative z-40 h-full shrink-0 transition-[width] duration-200 motion-reduce:transition-none"
    :class="collapsed ? 'w-14' : 'w-80'"
  >
    <nav
      aria-label="Roll Tray"
      class="absolute inset-y-0 left-0 flex h-full flex-col border-r border-eldra-accent/20 bg-eldra-ink/80 backdrop-blur-md transition-[width] duration-200 motion-reduce:transition-none"
      :class="collapsed ? 'w-14' : 'w-80'"
    >
      <button
        type="button"
        class="flex h-12 w-full shrink-0 items-center gap-3 border-b border-eldra-accent/20 px-3.5 text-eldra-text-soft transition hover:text-eldra-text-strong focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-eldra-accent/65"
        :aria-expanded="!collapsed"
        :aria-label="collapsed ? 'Expand Roll Tray' : 'Collapse Roll Tray'"
        title="Roll Tray"
        @click="collapsed = !collapsed"
      >
        <UIcon
          name="i-lucide-dices"
          class="size-5 shrink-0"
        />
        <span
          v-if="!collapsed"
          class="truncate text-xs font-semibold uppercase tracking-[0.16em]"
        >Roll Tray</span>
      </button>

      <!-- Collapsed: icon rail only, same narrow treatment Stages' own
           collapsed stage buttons use -- the latest total is the one
           Roll-Tray-specific affordance that survives collapse. -->
      <div
        v-if="collapsed"
        class="flex min-h-0 flex-1 flex-col items-center gap-1 overflow-y-auto py-2"
      >
        <span
          v-if="latestRoll"
          class="font-mono text-xs font-semibold tabular-nums text-eldra-text-strong"
          :title="`Latest roll: ${latestRoll.total}`"
        >{{ latestRoll.total }}</span>
      </div>

      <template v-else>
        <!-- Private/Table -- stays visible directly under the header,
             never nested inside the scrolling history region below. -->
        <div
          v-if="$slots['header-actions']"
          class="flex shrink-0 items-center gap-2 border-b border-eldra-accent/20 px-3 py-2"
        >
          <slot name="header-actions" />
        </div>

        <!-- Reserved for a future 3D dice presentation. Empty today. -->
        <slot name="dice-stage" />

        <div class="shrink-0 border-b border-eldra-accent/20 px-3 py-2">
          <WorldManualDiceRack
            :disabled="pending"
            @roll="emit('roll-manual-die', $event)"
          />
        </div>

        <!-- The ONE scrolling region. Header and Private/Table above never
             move while this scrolls. -->
        <div class="min-h-0 flex-1 overflow-y-auto px-3 py-2.5">
          <p
            v-if="error"
            class="mb-2 border border-red-500/20 bg-red-500/10 p-2.5 text-xs leading-5 text-red-200"
          >
            {{ error }}
          </p>

          <div
            v-if="pending"
            class="mb-1.5 animate-pulse border border-dashed border-eldra-accent/24 p-2.5 text-xs text-eldra-text-faint"
          >
            Rolling…
          </div>

          <TransitionGroup
            v-if="rolls.length"
            tag="ul"
            class="grid gap-1.5"
            enter-from-class="opacity-0 -translate-y-2"
            enter-active-class="transition duration-200 ease-out"
            leave-to-class="opacity-0"
            leave-active-class="transition duration-150 ease-in"
            move-class="transition duration-200 ease-out"
          >
            <CharacterSheetRollRailEntry
              v-for="(roll, index) in rolls"
              :key="roll.id"
              :roll="roll"
              :is-latest="index === 0"
            />
          </TransitionGroup>

          <p
            v-else-if="!pending"
            class="border border-dashed border-eldra-accent/24 p-3 text-sm text-eldra-text-faint"
          >
            {{ emptyMessage }}
          </p>

          <div
            v-if="hasMore"
            class="mt-2 flex justify-center"
          >
            <button
              type="button"
              class="border border-eldra-accent/24 px-3 py-1.5 text-xs font-semibold text-eldra-text-strong transition disabled:cursor-not-allowed disabled:opacity-50"
              :disabled="historyPending"
              @click="emit('load-more')"
            >
              {{ historyPending ? 'Loading…' : 'Load more' }}
            </button>
          </div>

          <p
            v-if="historyError"
            class="mt-2 border border-red-500/20 bg-red-500/10 p-2.5 text-xs leading-5 text-red-200"
          >
            {{ historyError }}
          </p>
        </div>
      </template>
    </nav>
  </div>
</template>
