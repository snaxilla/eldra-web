<script setup lang="ts">
// WorldRollTray -- Eldra Roll System Phase 2C
// (.github/docs/architecture/eldra-roll-system.md §9, inserted between
// Phase 2B/2B.1 and Phase 3 per this task's own scope). The permanent,
// canonical presentation for roll results, replacing Phase 2B's temporary
// inline "latest roll" strip on the Character Sheet AND
// AdminRollSandbox.vue's own hand-built Result/History blocks -- ONE
// history UI, not two (this task's own instruction).
//
// WORLD-SCOPED, NOT SHEET-SCOPED (§9's own naming rationale: "table rolls,
// once Phase 6 exists, are a World-wide concern... not just the sheet that
// happened to trigger one"), which is why this lives in components/world/
// rather than components/characters/, even though its only mounting
// surfaces today are the Character Sheet and the Developer Sandbox. This
// component itself holds NO roll state -- every prop here comes straight
// off a `useWorldRolls()` instance the PARENT owns (sheet-v2.vue's own, or
// AdminRollSandbox.vue's own); a shared, cross-page World-level feed
// (realtime/table broadcast) is explicitly Phase 6+ and NOT built here --
// see this task's own DO NOT list.
//
// NOT A MODAL, NOT A TOAST, NOT A PERMANENT GIANT PANEL (this task's own
// DESIGN GOAL). It feels like a tabletop notebook / combat log / Discord
// chat: docked, persistent once opened, never auto-dismissing -- the
// player decides when to collapse it, exactly like a chat window they
// choose to minimize, never a transient notification that vanishes on its
// own.
//
// ---------------------------------------------------------------------------
// CHARACTER SHEET ROLL TRAY MILESTONE -- `variant` PROP
// ---------------------------------------------------------------------------
// The Character Sheet mounts this component as a vertical rail beside its
// own content, immediately right of Eldra's global workspace navigation
// and left of the sheet (sheet-v2.vue's own layout). Two prior corrective
// passes fixed the AXIS (not a horizontal row) and the SIDE (not the far
// right of the sheet) -- this pass corrects the VISUAL LANGUAGE itself:
// the sidebar now reuses CreationStageRail.vue's own rail markup/tokens/
// proportions directly (same `w-14` collapsed / `w-56` expanded widths,
// same `border-r border-eldra-accent/20 bg-eldra-ink/80 backdrop-blur-md`
// surface, same `h-12` header button with a border-b, same token colors --
// `text-eldra-text-soft/strong/faint`, `border-eldra-accent/NN` -- never
// the floating variant's ornate-panel/raw-hex palette), rather than an
// independently-styled panel that merely happened to sit in the right
// place. `CreationStageRail.vue` itself is untouched: its own stage-list
// data model (CreationStage[], complete/active state) doesn't fit a roll
// feed, so rather than force a shared component through that mismatch (and
// risk the Creator with no way to visually re-verify it), this component's
// own `'sidebar'` template branch copies the REAL reference classes
// directly from that file, not independently-guessed approximations.
//
// `variant` (`'floating' | 'sidebar'`, default `'floating'`) now splits
// the ENTIRE template into two independent branches sharing only this
// script's state/props/emits -- not just the outer wrapper shape -- since
// the two visual languages (ornate gold-corner floating panel vs. the
// plain dark rail) no longer share markup worth parameterizing with
// conditional classes. `'floating'` is the ORIGINAL branch, byte-for-byte
// unchanged from before any `variant` prop existed; AdminRollSandbox.vue
// never passes `variant`, so its presentation is untouched.
//
// `'sidebar'` FULL HEIGHT: the outer placeholder is `sticky top-0 h-full`
// (Stages' own placeholder is `relative h-full`, not `sticky`, because the
// Creator's own outer shell never scrolls as a block; sheet-v2.vue's
// `workspaceEl` DOES, via `overflow-y-auto`, so `sticky` is the one
// deliberate deviation from Stages' exact classes -- needed to keep the
// rail pinned to the viewport while the sheet's own, often-taller content
// scrolls past it, rather than scrolling away with it). `h-full` resolves
// against sheet-v2.vue's own flex row, which is itself given `h-full`
// (resolving, in turn, against `workspaceEl`'s own definite height) --
// without a definite height at every link in that chain, `h-full` here
// would resolve to `auto` and the rail would collapse to its own content's
// height exactly as the previous, visually-wrong round did. The inner
// `absolute inset-y-0 left-0` nav then fills that full-height placeholder
// exactly as Stages' own inner `nav` does, with its own header fixed
// (`h-12 shrink-0`) and its own body `min-h-0 flex-1 overflow-y-auto` --
// collapsing never changes the rail's own top/bottom, only its width.
//
// ---------------------------------------------------------------------------
// LOCATION
// ---------------------------------------------------------------------------
// Desktop/tablet (`sm:` and up): docked bottom-right, `fixed`, escaping
// this component's own containing page the same way
// MapSelectedPinCard.vue's identical `fixed bottom-6 right-6` floating
// panel already does. Bottom-right never reaches the world workspace's
// LEFT sidebar (world-workspace.vue), and never overlaps a Character
// Sheet's command center (CharacterSheetCommandCenter.vue is `sticky`
// within the page's own scroll container, not `fixed` -- the two occupy
// different positioning contexts entirely, so there is no z-index race to
// resolve, only geometry that never intersects at this corner).
//
// Mobile (below `sm`): a full-width sheet pinned to the bottom edge
// (`inset-x-0 bottom-0`), with the same safe-area padding
// MobileBottomNav.vue already uses
// (`pb-[max(env(safe-area-inset-bottom),1rem)]`) -- world-workspace.vue's
// own pages mount no bottom navigation bar today (that only exists under
// layouts/default.vue), so there is nothing to cover yet, but this keeps
// the tray forward-safe if one is ever added to this layout.
//
// A KNOWN, DELIBERATELY UNSOLVED EDGE CASE: when the Character Sheet's own
// context drawer (WorldEntityContextDrawer, opened from a Skill's info
// icon, an Action, a Spell, ...) is ALSO open at `xl:` widths, both it and
// this tray want the right edge of the screen. This phase does not teach
// either surface about the other -- z-30 here matches
// MapSelectedPinCard.vue's own established "floating panel" z-index, which
// keeps the tray behind the drawer rather than over it if they ever
// visually collide, but no explicit compensation is implemented. Flagged
// for a future phase to resolve for real (most likely: the tray shifts
// left by the drawer's width, mirroring how sheet-v2.vue already
// compresses its own main column for the drawer) rather than guessed at
// here.
//
// ---------------------------------------------------------------------------
// BEHAVIOR / ANIMATION
// ---------------------------------------------------------------------------
// New rolls PREPEND (`rolls` is already newest-first, straight off
// `useWorldRolls().history`) and slide/fade in at the top via
// `<TransitionGroup>`; existing rows animate to their new position with
// the same `move-class`, which is what makes "previous rolls move
// downward" a real animation rather than an instant reflow. Never
// auto-dismisses -- there is no timer anywhere in this file. Collapsing is
// entirely the player's own action (`collapsed`, local to this component --
// purely a display preference, not something any caller needs to persist
// or coordinate with the roll data itself).
//
// Kept tasteful on purpose (this task's own ANIMATION section): a slide, a
// fade, a subtle elevation change on the newest entry
// (WorldRollTrayEntry.vue's own `isLatest` prop) -- no bouncing numbers, no
// particles. Spectacle is reserved for 3D dice, not built here.
//
// ---------------------------------------------------------------------------
// RESERVED FOR 3D DICE (later phase, not built here)
// ---------------------------------------------------------------------------
// The `dice-stage` slot below, between the header and the scrolling feed,
// is the documented, reserved location a future phase's 3D dice
// presentation animates into before settling/collapsing into the top of
// the history list below it. Nothing is rendered here today (an empty
// slot renders nothing) -- no dice component exists, no
// `@3d-dice/dice-box` import happens anywhere in this file, matching this
// task's own "do not render dice yet, do not install dice libraries."

import WorldRollTrayEntry from '~/components/world/WorldRollTrayEntry.vue'
import WorldManualDiceRack from '~/components/world/WorldManualDiceRack.vue'
import type { ManualDieOption } from '~/lib/rolls/requests'
import type { RollEventRecord } from '~/lib/rolls/types'

const props = withDefaults(defineProps<{
  // Newest-first, exactly `useWorldRolls().history`'s own order -- this
  // component never re-sorts.
  rolls?: readonly RollEventRecord[]
  // A roll request is in flight (`useWorldRolls().pending`) -- shows a
  // pending placeholder at the top of the feed, in the same slot the
  // finished roll will occupy once the server answers.
  pending?: boolean
  // The most recent roll REQUEST's own rejection (`useWorldRolls().error`)
  // -- the server's message, verbatim, never replaced with generic text.
  error?: string
  // A history fetch (initial load or Load More) is in flight
  // (`useWorldRolls().historyPending`) -- distinct from `pending` above,
  // which is about REQUESTING a new roll, not reading old ones.
  historyPending?: boolean
  historyError?: string
  // Whether a further page exists (`Boolean(useWorldRolls().nextCursor)`)
  // -- the caller owns cursor state; this component only renders the
  // button and emits `load-more`.
  hasMore?: boolean
  defaultCollapsed?: boolean
  emptyMessage?: string
  // CHARACTER SHEET ROLL TRAY MILESTONE. Default `'floating'`: byte-identical
  // old behavior (`fixed`, viewport-docked, bottom-right desktop / bottom
  // sheet mobile) for every existing caller (AdminRollSandbox.vue included,
  // which never passes this). `'sidebar'` renders the SAME dice-stage
  // slot/manual dice rack/history feed/pagination -- no roll state
  // duplicated -- inside CreationStageRail.vue's own rail visual language
  // (see this file's own header for the full design) rather than the
  // floating variant's ornate panel.
  variant?: 'floating' | 'sidebar'
}>(), {
  rolls: () => [],
  pending: false,
  error: '',
  historyPending: false,
  historyError: '',
  hasMore: false,
  defaultCollapsed: false,
  emptyMessage: 'No rolls yet. Click an ability, save, or skill to roll one.',
  variant: 'floating'
})

const emit = defineEmits<{
  'load-more': []
  // Phase 4B.7 -- the player picked one die off the manual dice rack.
  // This component has no opinion on visibility or the actual request
  // shape (see WorldManualDiceRack.vue's own header) -- the page that
  // mounts this Tray, which already owns a `useWorldRolls()` instance and
  // its own Private/Table selection, turns this into an actual roll.
  'roll-manual-die': [ManualDieOption]
}>()

// Local UI state, not persisted or shared -- exactly the collapse pattern
// CharacterSheetSection.vue's own `collapsible`/`isOpen` already
// establishes for this codebase.
const collapsed = ref(props.defaultCollapsed)

const latestRoll = computed(() => props.rolls[0] ?? null)
</script>

<template>
  <!-- SIDEBAR -- CreationStageRail.vue's own rail markup/tokens, copied directly rather than
       guessed at (see this file's own header for the full reasoning). Outer placeholder:
       `sticky top-0 h-full` (the one deliberate deviation from Stages' `relative h-full` --
       sheet-v2.vue's own scroll container, unlike the Creator's, actually scrolls). Inner
       `absolute inset-y-0 left-0` nav: same border/bg/blur, same `h-12` header button, same
       width transition. Collapsing changes WIDTH only, in place -- no Transition-swapped
       elements, matching how Stages' own rail morphs rather than remounts. -->
  <div
    v-if="variant === 'sidebar'"
    class="sticky top-0 z-40 h-full shrink-0 transition-[width] duration-200 motion-reduce:transition-none"
    :class="collapsed ? 'w-14' : 'w-56'"
  >
    <nav
      aria-label="Roll Tray"
      class="absolute inset-y-0 left-0 flex h-full flex-col border-r border-eldra-accent/20 bg-eldra-ink/80 backdrop-blur-md transition-[width] duration-200 motion-reduce:transition-none"
      :class="collapsed ? 'w-14' : 'w-56'"
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

      <!-- Collapsed: the same narrow-rail treatment as Stages' own collapsed stage buttons --
           icon-recognizable, no visible label (an accessible name carries it instead), the
           latest roll total as the one Roll-Tray-specific affordance. -->
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
        <div
          v-if="$slots['header-actions']"
          class="flex shrink-0 items-center gap-2 border-b border-eldra-accent/20 px-3 py-2"
        >
          <slot name="header-actions" />
        </div>

        <!-- RESERVED FOR 3D DICE -- see this file's own header. -->
        <slot name="dice-stage" />

        <div class="shrink-0 border-b border-eldra-accent/20 px-3 py-2">
          <WorldManualDiceRack
            :disabled="pending"
            @roll="emit('roll-manual-die', $event)"
          />
        </div>

        <div class="min-h-0 flex-1 overflow-y-auto px-3 py-2.5">
          <p
            v-if="error"
            class="mb-2 rounded-none border border-red-500/20 bg-red-500/10 p-2.5 text-xs leading-5 text-red-200"
          >
            {{ error }}
          </p>

          <div
            v-if="pending"
            class="mb-1.5 animate-pulse rounded-none border border-dashed border-eldra-accent/24 p-2.5 text-xs text-eldra-text-faint"
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
            <WorldRollTrayEntry
              v-for="(roll, index) in rolls"
              :key="roll.id"
              :roll="roll"
              :is-latest="index === 0"
            />
          </TransitionGroup>

          <p
            v-else-if="!pending"
            class="rounded-none border border-dashed border-eldra-accent/24 p-3 text-sm text-eldra-text-faint"
          >
            {{ emptyMessage }}
          </p>

          <div
            v-if="hasMore"
            class="mt-2 flex justify-center"
          >
            <button
              type="button"
              class="rounded-none border border-eldra-accent/24 px-3 py-1.5 text-xs font-semibold text-eldra-text-strong transition disabled:cursor-not-allowed disabled:opacity-50"
              :disabled="historyPending"
              @click="emit('load-more')"
            >
              {{ historyPending ? 'Loading…' : 'Load more' }}
            </button>
          </div>

          <p
            v-if="historyError"
            class="mt-2 rounded-none border border-red-500/20 bg-red-500/10 p-2.5 text-xs leading-5 text-red-200"
          >
            {{ historyError }}
          </p>
        </div>
      </template>
    </nav>
  </div>

  <!-- FLOATING -- the ORIGINAL design this component shipped with, byte-for-byte unchanged.
       AdminRollSandbox.vue mounts this branch (it never passes `variant`). -->
  <div
    v-else
    class="pointer-events-none fixed inset-x-0 bottom-0 z-30 flex justify-center px-4 pb-[max(env(safe-area-inset-bottom),1rem)] sm:inset-x-auto sm:right-6 sm:bottom-6 sm:justify-end sm:px-0 sm:pb-0"
  >
    <div class="pointer-events-auto w-full max-w-md sm:w-96">
      <Transition
        enter-from-class="opacity-0 translate-y-2"
        enter-active-class="transition duration-150 ease-out"
        leave-to-class="opacity-0 translate-y-2"
        leave-active-class="transition duration-150 ease-in"
      >
        <button
          v-if="collapsed"
          type="button"
          class="eldra-ornate-panel eldra-frame-corners flex w-full items-center gap-3 rounded-none border px-4 py-2.5 text-left backdrop-blur sm:ml-auto sm:w-auto"
          aria-label="Expand Roll Tray"
          @click="collapsed = false"
        >
          <UIcon
            name="i-lucide-dices"
            class="h-4 w-4 shrink-0 text-[#c9a45a]"
          />
          <span class="text-sm text-[#d8ceb8]">Roll Tray</span>
          <span
            v-if="latestRoll"
            class="ml-auto shrink-0 font-mono text-lg font-semibold tabular-nums text-[#fff7df]"
          >{{ latestRoll.total }}</span>
        </button>
      </Transition>

      <Transition
        enter-from-class="opacity-0 translate-y-4"
        enter-active-class="transition duration-200 ease-out"
        leave-to-class="opacity-0 translate-y-4"
        leave-active-class="transition duration-150 ease-in"
      >
        <div
          v-if="!collapsed"
          class="eldra-ornate-panel eldra-frame-corners flex w-full flex-col rounded-none border backdrop-blur max-h-[70vh] sm:max-h-[32rem]"
        >
          <header class="flex shrink-0 items-center justify-between gap-2 border-b border-[rgba(201,164,90,0.14)] px-4 py-2.5">
            <div class="flex items-center gap-2">
              <UIcon
                name="i-lucide-dices"
                class="h-4 w-4 text-[#c9a45a]"
              />
              <span class="text-xs uppercase tracking-[0.25em] text-[#9f9278]">Roll Tray</span>
            </div>

            <div class="flex items-center gap-2">
              <!-- Generic extension point -- e.g. a Private/Table
                   visibility toggle for whatever's ABOUT to be rolled.
                   That is a REQUESTING concern the page/caller owns
                   (`useWorldRolls().requestRoll`'s own `visibility`
                   input), not something this DISPLAY-only component
                   should know exists -- deliberately not hardcoded here so
                   this stays reusable by a future mounting surface with a
                   different (or no) such control. -->
              <slot name="header-actions" />

              <button
                type="button"
                class="text-[#9f9278] transition hover:text-[#d8ceb8]"
                aria-label="Collapse Roll Tray"
                @click="collapsed = true"
              >
                <UIcon
                  name="i-lucide-chevron-down"
                  class="h-4 w-4"
                />
              </button>
            </div>
          </header>

          <!-- RESERVED FOR 3D DICE -- see this file's own header. Empty on
               purpose; a future phase fills this slot from whichever page
               mounts the tray. -->
          <slot name="dice-stage" />

          <!-- Manual dice rack -- Phase 4B.7. Below Private/Table
               (header-actions, above), above history (below). A real,
               built-in feature of the Tray itself -- not a slot -- since
               every page that mounts a Tray should get it "for free," the
               same way Load More already is. -->
          <div class="shrink-0 border-b border-[rgba(201,164,90,0.14)] px-3 py-2">
            <WorldManualDiceRack
              :disabled="pending"
              @roll="emit('roll-manual-die', $event)"
            />
          </div>

          <div class="min-h-0 flex-1 overflow-y-auto px-3 py-2.5">
            <p
              v-if="error"
              class="mb-2 rounded-none border border-red-500/20 bg-red-500/10 p-2.5 text-xs leading-5 text-red-200"
            >
              {{ error }}
            </p>

            <!-- Pending placeholder -- occupies the same top-of-feed
                 position the finished roll will animate into. No count-up,
                 no particles: a plain, dimmed row. -->
            <div
              v-if="pending"
              class="mb-1.5 animate-pulse rounded-none border border-dashed border-[rgba(201,164,90,0.24)] p-2.5 text-xs text-[#9f9278]"
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
              <WorldRollTrayEntry
                v-for="(roll, index) in rolls"
                :key="roll.id"
                :roll="roll"
                :is-latest="index === 0"
              />
            </TransitionGroup>

            <p
              v-else-if="!pending"
              class="rounded-none border border-dashed border-[rgba(201,164,90,0.24)] p-3 text-sm text-[#9f9278]"
            >
              {{ emptyMessage }}
            </p>

            <!-- Load More -- bottom of the feed, oldest end, per this
                 task's own SCROLLING section. Same `nextCursor` pagination
                 GET /rolls already shipped in Phase 1
                 (useWorldRolls.ts's own `loadMoreHistory`). -->
            <div
              v-if="hasMore"
              class="mt-2 flex justify-center"
            >
              <button
                type="button"
                class="rounded-none border border-[rgba(201,164,90,0.24)] px-3 py-1.5 text-xs font-semibold text-[#fff7df] transition disabled:cursor-not-allowed disabled:opacity-50"
                :disabled="historyPending"
                @click="emit('load-more')"
              >
                {{ historyPending ? 'Loading…' : 'Load more' }}
              </button>
            </div>

            <p
              v-if="historyError"
              class="mt-2 rounded-none border border-red-500/20 bg-red-500/10 p-2.5 text-xs leading-5 text-red-200"
            >
              {{ historyError }}
            </p>
          </div>
        </div>
      </Transition>
    </div>
  </div>
</template>
