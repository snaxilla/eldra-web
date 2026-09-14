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

// ---------------------------------------------------------------------------
// ROLL SYSTEM PHASE 3F -- DETERMINISTIC FACE MAPPING
// ---------------------------------------------------------------------------
// WHAT `@` ACTUALLY MEANS, PROVEN FROM THE RENDERER SOURCE (not assumed).
// Traced through @3d-dice/dice-box-threejs@0.0.12's own shipped bundle
// (`dist/dice-box-threejs.es.js`), every step of the chain:
//
//  1. PARSE. `DiceNotation.parseNotation()` splits the string on `"@"` and
//     matches the right-hand side with `/(\b)*(\-\d+|\d+)(\b)*/gi`, pushing
//     each match into `this.result` as a STRING, positionally:
//         `!this.error && n[1] && (r = n[1].match(o)) !== null
//            && this.result.push(...r)`
//     So `"2d20@11,20"` yields `result = ["11", "20"]`. Nothing is parsed as
//     an index, an offset, or a texture id -- the digits are carried through
//     verbatim.
//
//  2. APPLY. `DiceBox.rollDice()` walks `result` positionally against
//     `this.diceList` and calls `swapDiceFace(die, result[i])`.
//
//  3. RESOLVE. `swapDiceFace(die, t)` does, literally:
//         `let s = n.values.indexOf(i), o = n.values.indexOf(t)`
//     where `i` is the face physics actually produced and `n` is the die
//     DESCRIPTOR. It then swaps the two faces' `materialIndex` values so the
//     texture showing `t` ends up on the facet physics will leave pointing
//     up. `indexOf` is the whole story: `t` is looked up BY VALUE in the
//     descriptor's `values` array.
//
//  4. `values` IS A RANGE, EXPANDED. The descriptor table stores
//     `d20: { values: [1, 20] }`, which `DieDescriptor.setValues()` expands
//     via `range(1, 20, 1)` into the full `[1, 2, ... 20]`. So for every die
//     below, `values.indexOf(v) === v - 1`.
//
// CONCLUSION: `"1d20@20"` means "display the face whose printed value is
// 20". It is a LITERAL FACE VALUE -- not a face index, not a texture index,
// not a zero-based offset. Eldra's existing mapping (pass `RollDieGroup.
// results` straight through) was therefore already CORRECT, and this table
// exists to PROVE that per die type and to keep it proven, not to change it.
//
// WHY AN EXPLICIT TABLE RATHER THAN "just pass the number": because the
// identity mapping is only safe for dice whose `values` really are the
// contiguous run `1..sides`, and that is a property of the RENDERER'S table,
// not of dice in general. Two concrete counter-examples from the same
// source:
//   - `d100: { values: [10, 100, 10] }` expands to `[10, 20, ... 100]` --
//     DECADES, not 1..100. A percentile result of 57 would hit
//     `values.indexOf(57) === -1`, `swapDiceFace` would `return` early
//     (`if (s < 0 || o < 0 || s == o) return`), and the die would silently
//     display whatever physics produced. A wrong face, no error.
//   - Sides with NO descriptor at all (d5, d7, d16, d30 ...) are worse than
//     wrong: `DiceFactory.create()` returns `null` (`createGeometry`'s own
//     `default: return console.error(...), null`), so `spawnDice()` returns
//     BEFORE `this.diceList.push(r)`. The die never enters `diceList`, which
//     positionally shifts EVERY later die's forced result onto the wrong
//     die. One unsupported die corrupts the whole roll.
// Eldra's roll pipeline does not constrain `sides` (opendice allows up to
// MAX_SIDES), so both cases are reachable from a custom roll expression.
// This table is what makes them explicit and handled instead of silent.
export type DieFaceMapping = {
  // The dice-box-threejs die type key (its `Ps` descriptor table key), used
  // to build the `NdM` half of the notation.
  notationType: string
  // The descriptor's own expanded `values` array, in face order -- exactly
  // what `swapDiceFace` runs `indexOf` against. Index `i` here is the face
  // whose forced value is `values[i]`.
  values: number[]
  // The glyph actually PRINTED on each face, from the descriptor's own
  // `labels` array, index-aligned with `values`. Documentation and test
  // evidence only -- the renderer never receives this. Note d10's tenth
  // face prints "0", not "10", which is ordinary percentile-die convention
  // and NOT a mapping error: its `values` entry is still 10.
  labels: string[]
}

function contiguousMapping(notationType: string, sides: number, labels?: string[]): DieFaceMapping {
  const values = Array.from({ length: sides }, (_, index) => index + 1)
  return {
    notationType,
    values,
    labels: labels ?? values.map((value) => String(value))
  }
}

// Every die Eldra is allowed to animate, keyed by `RollDieGroup.sides`.
// Deliberately a CLOSED list: a die absent here is not animated at all
// (see buildPredeterminedNotation) rather than animated with an unverified
// mapping. Values/labels are transcribed from dice-box-threejs's own `Ps`
// descriptor table; `d1`/`d3` render on a d6 shape and `d100` is omitted on
// purpose -- see this section's own header for both reasons.
export const DIE_FACE_MAPPINGS: Readonly<Record<number, DieFaceMapping>> = Object.freeze({
  1: contiguousMapping('d1', 1),
  2: contiguousMapping('d2', 2),
  3: contiguousMapping('d3', 3),
  4: contiguousMapping('d4', 4),
  6: contiguousMapping('d6', 6),
  8: contiguousMapping('d8', 8),
  10: contiguousMapping('d10', 10, ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0']),
  12: contiguousMapping('d12', 12),
  20: contiguousMapping('d20', 20)
})

// The value to write after `@` for a given physical face. Returns `null`
// when this die/face pair has no verified mapping -- an unsupported side
// count, or a face outside the die's own `values` (a d20 "0" or "21",
// which `swapDiceFace` would silently ignore).
export function notationValueForFace(sides: number, face: number): number | null {
  const mapping = DIE_FACE_MAPPINGS[sides]
  if (!mapping) return null
  return mapping.values.includes(face) ? face : null
}

// What the player will actually SEE on the settled die for a given forced
// value -- the inverse of the renderer's own resolution chain, replicated
// from source so tests can assert the full round trip rather than assuming
// it. Returns `null` for anything unmapped.
export function visibleLabelForFace(sides: number, face: number): string | null {
  const mapping = DIE_FACE_MAPPINGS[sides]
  if (!mapping) return null
  const index = mapping.values.indexOf(face)
  return index < 0 ? null : (mapping.labels[index] ?? null)
}

// Builds @3d-dice/dice-box-threejs's own notation string, e.g.
// `"1d20@20"` or `"2d6+1d4@3,5,2"` for a multi-group custom roll. Returns
// `null` for a roll with no dice at all (eldra-roll-system.md §17.3's
// "manual" rolls) -- nothing to force, nothing to animate.
//
// Also returns `null` -- Phase 3F -- if ANY die in the roll has no verified
// face mapping (see DIE_FACE_MAPPINGS). This is deliberately all-or-nothing
// rather than best-effort: dropping or mis-mapping a single die
// positionally shifts every LATER die's forced result onto the wrong die
// (see this section's own header), so a roll containing one d7 would
// otherwise show wrong faces for its d20s too. Returning `null` here makes
// the queue fall back to the Phase 3A CSS placeholder for that roll, which
// shows no face at all -- never a face that contradicts the server.
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

  const forcedValues: number[] = []
  for (const group of groups) {
    for (const face of group.results) {
      const value = notationValueForFace(group.sides, face)
      if (value === null) return null
      forcedValues.push(value)
    }
  }

  const dicePart = groups
    .map((group) => `${group.results.length}${DIE_FACE_MAPPINGS[group.sides]!.notationType}`)
    .join('+')

  return `${dicePart}@${forcedValues.join(',')}`
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
