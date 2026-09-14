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
  // `diceCount` -- Roll System Phase 3D (Dice Feel Tuning): "do not force
  // every roll to use the same duration... the system should remain
  // responsive." The renderer uses this to size its own per-roll settle
  // ceiling (WorldDiceThreeRenderer.client.vue's own
  // iterationLimitForDiceCount) -- a lone d20 and a 10-die damage pool
  // should not visually take the same amount of time to feel decisive.
  roll: (notation: string, diceCount: number) => Promise<void>
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

// Total physical dice this roll forces -- Phase 3D's own basis for scaling
// animation duration ("do not force every roll to use the same duration").
// Counts every die in every group, matching buildPredeterminedNotation's
// own "never trimmed to just kept" posture: a dropped advantage die still
// physically exists and still takes up settle time.
export function countDice(record: RollEventRecord): number {
  return record.dice.reduce((sum, group) => sum + group.results.length, 0)
}

// ---------------------------------------------------------------------------
// ROLL SYSTEM PHASE 3E -- DICE COMPLETION TIMING
// ---------------------------------------------------------------------------
// ROOT CAUSE, traced (not guessed) through dice-box-threejs's own DiceBox.js:
// `exposed.roll()` (WorldDiceThreeRenderer.client.vue) resolves its Promise
// the instant `@3d-dice/dice-box-threejs`'s own `animateThrow()` sees
// `throwFinished()` return true -- which checks ONLY whether every die's
// underlying cannon-es Body has reached `CANNON.Body.SLEEPING`. That is a
// PHYSICS signal (a body's own sleep-state machine), not a distinct visual-
// completion or render-callback event -- there is no other completion
// signal to "use instead": dice-box-threejs exposes exactly one way to know
// a roll is done (the callback/Promise this adapter already awaits), and it
// is defined purely in terms of physics sleep state.
//
// Phase 3D deliberately shortened that same sleep state's own thresholds
// (`sleepTimeLimit` 0.9s->0.12s, `sleepSpeedLimit` 75->140 -- see
// WorldDiceThreeRenderer.client.vue's own header) specifically to stop
// wasting time on imperceptible motion, which this task's own OBJECTIVE
// confirms was the right call ("The animation is significantly faster").
// But it also means "physics declares this die asleep" now fires at a more
// permissive residual-motion threshold than before, close to but not
// perfectly synchronized with the instant a human eye perceives the die as
// fully, unambiguously still -- occasionally close enough that the queue's
// reveal (driven directly by this same Promise) can land a frame or two
// before the eye has finished registering the settle.
//
// THE FIX: add exactly one small, fixed beat AFTER the renderer's own
// completion signal resolves, before this adapter reports completion back
// to useDiceAnimationQueue.ts -- matching this phase's own TARGET
// EXPERIENCE verbatim ("Dice visibly settle -> ~100-150ms beat -> Roll Tray
// entry appears"). This changes WHEN completion is reported, never WHAT
// counts as complete, and touches no physics parameter, the renderer's own
// architecture, the queue's state machine, or the DiceRendererAdapter
// contract -- only this adapter's own internal timing between "the
// renderer says it's done" and "I tell the queue it's done." Skipped on
// failure (`exposed.error` set): a broken renderer should fall back to the
// placeholder promptly, not sit through an extra beat for a settle that
// never actually happened.
export const SETTLE_CONFIRMATION_BEAT_MS = 130

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
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

      await exposed.roll(notation, countDice(request.roll))

      if (exposed.error) {
        onRendererFailed?.()
        return
      }

      // Phase 3E's own settle-confirmation beat -- see this file's own
      // header for the full trace. The renderer already resolved (physics
      // says every die is asleep); this holds completion back from the
      // queue for one short, fixed beat so the reveal always lands after
      // the eye has had a moment to confirm the die actually stopped.
      await wait(SETTLE_CONFIRMATION_BEAT_MS)
    },

    dispose() {}
  }
}
