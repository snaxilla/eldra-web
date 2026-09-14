// eldraDiceRendererAdapter -- the ONE real DiceRendererAdapter
// implementation. Eldra Roll System Phase 3B
// (.github/docs/architecture/eldra-roll-system.md §11).
//
// REUSES, DOES NOT DUPLICATE. This file wraps the EXISTING
// EldraDiceBox.client.vue (already-installed @3d-dice/dice-box@1.1.4,
// already proven for the older Rules-Engine RollEvent pipeline) rather
// than installing a second renderer -- this task's own "study the
// existing repository... do not install a second renderer if the
// existing one can satisfy the requirements." The one change
// EldraDiceBox.client.vue itself needed was a `headless` prop (suppress
// its own result card/history strip/critical banners, which would
// otherwise duplicate WorldDiceStage.vue/WorldRollTray.vue) and making
// `rollResult()` genuinely awaitable -- see that file's own Phase 3B
// comments for both.
//
// ALL RENDERER-SPECIFIC ADAPTATION LIVES HERE, NOWHERE ELSE
// (~/lib/dice-presentation/renderer.ts's own "no third-party renderer
// type crosses this boundary" rule). `toLegacyRollResult` below is the
// one place a `RollEventRecord` (this document's own shape --
// `dice: RollDieGroup[]`, potentially several groups) gets reshaped into
// the OLDER `RollResult`-like object `EldraDiceBox`'s existing
// `rollResult(event, label)` already knows how to read
// (`dice: {count, faces, modifier}`, flat `rolls`/`kept` arrays) --
// exactly the adaptation eldra-roll-system.md §11 named in advance ("a
// new summarizeRollEventRecord sibling... EldraDiceBox.client.vue itself
// needs no change" -- this adapter is that sibling, just implemented as a
// reshape function rather than a second summary type, since
// `summarizeRollEvent` already produces the correct `DiceBoxRollSummary`
// once fed a correctly-shaped `result`).
//
// PREDETERMINED RESULTS, RESTATED. This adapter never reads a die face
// back from the physics engine, and never asks it to -- it cannot: per
// EldraDiceBox.client.vue's own documented, verified limitation,
// @3d-dice/dice-box@1.1.4 has no "land on this face" hook at all. Every
// number `rollResult()` ends up displaying comes 100% from
// `toLegacyRollResult()` below, itself built entirely from the
// already-authoritative, already-persisted, already-broadcast
// RollEventRecord -- the physics tumble is decorative, exactly
// EldraDiceBox's own long-standing posture for the older pipeline, now
// extended to this one.

import type { Ref } from 'vue'
import type { DiceRendererAdapter } from '~/lib/dice-presentation/renderer'
import type { DiceAnimationRequest } from '~/lib/dice-presentation/types'
import type { RollEventRecord } from '~/lib/rolls/types'

// The narrow slice of EldraDiceBox.client.vue's own `defineExpose` this
// adapter actually touches -- typed here rather than importing the SFC's
// own instance type, which Vue/Nuxt makes awkward to name standalone.
export type EldraDiceBoxExposed = {
  rollResult: (event: { ok: true; eventId: string; result: unknown }, label?: string) => Promise<void>
  error: string
}

// Reshapes a RollEventRecord into the `RollResult`-like object
// app/utils/diceBoxRollSummary.ts's `summarizeRollEvent` already knows how
// to read. Picks the record's own d20 group when one exists (every
// ability/saving_throw/skill roll has exactly one) so
// `summarizeRollEvent`'s own `dice.faces === 20` critical-outcome check
// keeps working unchanged; falls back to the first group otherwise.
// `rolls`/`kept` flatten EVERY group, so a multi-term `custom` roll (the
// one case with more than one group, reachable only from the Developer
// Sandbox today) still displays its complete, correct dice list -- only
// the PHYSICS notation below is simplified to the primary group, since
// the tumbling meshes are decorative regardless of how many terms the
// original expression had.
export function toLegacyRollResult(record: RollEventRecord) {
  const primaryGroup = record.dice.find((group) => group.sides === 20) ?? record.dice[0] ?? null

  return {
    dice: primaryGroup
      ? { count: primaryGroup.results.length, faces: primaryGroup.sides, modifier: record.modifier }
      : undefined,
    rolls: record.dice.flatMap((group) => group.results),
    kept: record.dice.flatMap((group) => group.kept),
    total: record.total
  }
}

// `onRendererFailed` is called after a `play()` call whose underlying
// EldraDiceBox instance reports an `error` (initialization failed, or the
// roll itself threw and was caught internally -- `rollResult()` itself
// never rejects, see that function's own header) -- the caller
// (WorldDiceOverlay.vue) uses it to un-register this adapter
// (`useDiceAnimationQueue().setRenderer(null)`) so FUTURE rolls fall back
// to the Phase 3A placeholder instead of silently retrying a renderer
// that already failed once (this task's own FAILURE MODE section:
// "gameplay must continue... the player should never lose the ability to
// roll because a renderer failed").
export function createEldraDiceRendererAdapter(
  box: Ref<EldraDiceBoxExposed | null>,
  onRendererFailed?: () => void
): DiceRendererAdapter {
  return {
    // EldraDiceBox prewarms itself lazily, the first time `rollResult()`
    // is actually called -- see that component's own `headless` prop
    // doc for why it does not prewarm eagerly on mount in headless mode
    // (this task's own PERFORMANCE section: "only load renderer assets
    // when the first animation is requested"). Nothing for this adapter
    // to do ahead of time.
    async prepare() {},

    async play(request: DiceAnimationRequest) {
      const exposed = box.value
      if (!exposed) {
        // The headless EldraDiceBox instance isn't mounted yet (or was
        // torn down) -- throwing here is exactly what makes
        // useDiceAnimationQueue.ts's own try/catch around `renderer.play()`
        // fall through to `complete` anyway ("a presentation failure is
        // never a gameplay failure").
        throw new Error('EldraDiceBox is not mounted')
      }

      await exposed.rollResult(
        { ok: true, eventId: request.id, result: toLegacyRollResult(request.roll) },
        request.roll.label
      )

      if (exposed.error) {
        onRendererFailed?.()
      }
    },

    dispose() {}
  }
}
