// worldDiceThreeRendererAdapter -- the ONE real DiceRendererAdapter
// implementation. Eldra Roll System Phase 3B (Renderer Replacement)
// (.github/docs/architecture/eldra-roll-system.md §11).
//
// REPLACES eldraDiceRendererAdapter.ts, WHICH WRAPPED EldraDiceBox.client.vue
// (@3d-dice/dice-box@1.1.4). That renderer is rejected for THIS layer: its
// physics engine has no "land on this face" hook, so a die's VISIBLE
// resting face could disagree with the authoritative RollEventRecord total
// while a separate text readout claimed the correct number -- "mask
// incorrect physics" (see WorldDiceThreeRenderer.client.vue's own header
// for the full mechanism/citation and why @3d-dice/dice-box-threejs closes
// this gap honestly rather than papering over it).
//
// EldraDiceBox.client.vue and @3d-dice/dice-box are UNCHANGED and remain
// installed -- entities/[entityId]/sheet.vue's own direct `rollDice()`
// call sites (weapon attack/damage, spell attack, species actions not yet
// migrated to the RollEventRecord pipeline) still depend on them. This
// phase replaces ONLY the renderer registered into
// useDiceAnimationQueue.ts for the Dice Presentation Layer
// (WorldDiceOverlay.vue), nothing upstream or downstream of that one seam.
//
// ALL RENDERER-SPECIFIC ADAPTATION LIVES HERE, NOWHERE ELSE
// (~/lib/dice-presentation/renderer.ts's own "no third-party renderer
// type crosses this boundary" rule). `buildPredeterminedNotation` below is
// the one place a `RollEventRecord` gets reshaped into
// @3d-dice/dice-box-threejs's own notation string, including that
// library's `@val,val,...` forced-outcome suffix -- WorldDiceThreeRenderer
// .client.vue itself never sees a RollEventRecord, only the finished
// string.
//
// PREDETERMINED RESULTS, RESTATED. Every die in `request.roll.dice` --
// including ones a keep rule/advantage dropped, per RollDieGroup's own
// "never trimmed down to just the kept ones" contract -- is forced to its
// exact recorded face via the notation's `@` suffix, positionally, in
// group-then-index order (dice-box-threejs applies forced results to dice
// in the order they were declared -- see its own DiceNotation.js parser).
// This adapter never reads a face back from the renderer and never trusts
// its returned total; the physics tumble is decorative, exactly
// EldraDiceBox's own long-standing posture, now backed by a renderer that
// can actually keep that promise for the visible face too.

import type { Ref } from 'vue'
import type { DiceRendererAdapter } from '~/lib/dice-presentation/renderer'
import type { DiceAnimationRequest } from '~/lib/dice-presentation/types'
import type { RollEventRecord } from '~/lib/rolls/types'

// The narrow slice of WorldDiceThreeRenderer.client.vue's own
// `defineExpose` this adapter actually touches -- typed here rather than
// importing the SFC's own instance type, matching
// eldraDiceRendererAdapter.ts's own established precedent for the same
// reason (Vue/Nuxt makes naming an SFC's instance type standalone awkward).
export type WorldDiceThreeRendererExposed = {
  roll: (notation: string) => Promise<void>
  error: string
}

// Builds @3d-dice/dice-box-threejs's own notation string, e.g.
// `"1d20@20"` or `"2d6+1d4@3,5,2"` for a multi-group custom roll. Returns
// `null` for a roll with no dice at all (eldra-roll-system.md §17.3's
// "manual" rolls) -- nothing to force, nothing to animate.
//
// Every die in every group is included, not just `kept` ones -- matching
// RollDieGroup's own documented contract that a future renderer might dim
// dropped dice instead of hiding them. Sign is deliberately NOT encoded
// (no `-` term prefix): a physical die face is never negative, and this
// adapter never reads dice-box-threejs's own computed total back, so
// whether a group is later added or subtracted in `request.roll.total`
// (already computed, already authoritative) has no bearing on which pips
// the die must show.
export function buildPredeterminedNotation(record: RollEventRecord): string | null {
  const groups = record.dice.filter((group) => group.results.length > 0)
  if (!groups.length) return null

  const dicePart = groups.map((group) => `${group.results.length}d${group.sides}`).join('+')
  const resultsPart = groups.flatMap((group) => group.results).join(',')

  return `${dicePart}@${resultsPart}`
}

// `onRendererFailed` is called after a `play()` call whose underlying
// WorldDiceThreeRenderer instance reports an `error` (WebGL unavailable,
// asset load failure, an unsupported die type such as d100/d%, or any
// other renderer-internal exception) -- the caller (WorldDiceOverlay.vue)
// uses it to un-register this adapter (`useDiceAnimationQueue().setRenderer
// (null)`) so FUTURE rolls fall back to the Phase 3A placeholder instead of
// silently retrying a renderer that already failed once. Gameplay is
// unaffected either way: the queue's own Promise always resolves and the
// already-authoritative total is always what gets revealed.
export function createWorldDiceThreeRendererAdapter(
  box: Ref<WorldDiceThreeRendererExposed | null>,
  onRendererFailed?: () => void
): DiceRendererAdapter {
  return {
    // WorldDiceThreeRenderer prewarms itself lazily, the first time
    // `roll()` is actually called -- see that component's own header for
    // why it does not prewarm eagerly on mount (this phase's own
    // PERFORMANCE requirement: "only load renderer assets when the first
    // animation is requested"). Nothing for this adapter to do ahead of
    // time.
    async prepare() {},

    async play(request: DiceAnimationRequest) {
      const exposed = box.value
      if (!exposed) {
        // The renderer instance isn't mounted yet (or was torn down) --
        // throwing here is exactly what makes useDiceAnimationQueue.ts's
        // own try/catch around `renderer.play()` fall through to
        // `complete` anyway ("a presentation failure is never a gameplay
        // failure").
        throw new Error('WorldDiceThreeRenderer is not mounted')
      }

      const notation = buildPredeterminedNotation(request.roll)
      if (!notation) {
        // No dice to force (a manual roll) -- nothing to play. Resolving
        // immediately is correct, not a shortcut: the queue's own
        // PENDING_BEAT_MS/COMPLETE_HOLD_MS timings already give the
        // reveal a beat regardless of whether a renderer actually ran.
        return
      }

      await exposed.roll(notation)

      if (exposed.error) {
        onRendererFailed?.()
      }
    },

    dispose() {}
  }
}
