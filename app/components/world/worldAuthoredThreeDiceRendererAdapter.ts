// worldAuthoredThreeDiceRendererAdapter -- the THIRD real
// DiceRendererAdapter implementation. Roll System Phase 4B.1 (Authored
// Three.js d20 Proof of Concept, ADR-024 Option 2), implementing ADR-024
// (.github/docs/architecture/adr-024-authored-dice-presentation.md) §4
// ("System concept"), §7 ("Face presentation"), §11/§12 (Option 2 --
// Canvas/WebGL authored dice, invoked here as the named fallback after
// Phase 4B's CSS/DOM proof of concept did not clear the visual-quality
// gate).
//
// NEITHER OF THE OTHER TWO RENDERERS IS TOUCHED. WorldDiceThreeRenderer
// .client.vue (physics, @3d-dice/dice-box-threejs) and
// WorldAuthoredDiceRenderer.vue (Phase 4B's CSS/DOM proof of concept) are
// both unchanged and remain registerable -- see useDiceRendererMode.ts
// for the now-three-way dev flag that decides which of the three adapters
// WorldDiceOverlay.vue actually registers at a given moment.
//
// DELIBERATELY DUPLICATES extractSingleD20Face RATHER THAN IMPORTING IT
// FROM worldAuthoredDiceRendererAdapter.ts (Phase 4B's own identical
// function). This phase's own IMPORTANT section reads "do not couple the
// new renderer to [the old renderer's] runtime behavior" -- applied here
// to mean each renderer's own adapter stays fully self-contained, with NO
// cross-import between sibling renderer adapters, matching the precedent
// worldDiceThreeRendererAdapter.ts and (Phase 4B's)
// worldAuthoredDiceRendererAdapter.ts already set for each other (neither
// imports from the other; each duplicates its own tiny `wait()`-style
// helpers). The duplicated function is eight lines and changes only if
// this phase's own d20-only scope ever changes, at which point it would
// need independent review anyway.
//
// PHASE 4B.1'S OWN SCOPE, ENFORCED HERE, NOT ASSUMED (identical to Phase
// 4B's own posture): "ONLY support: single d20 rolls." Any roll that is
// not EXACTLY one d20 group with EXACTLY one die in it (advantage, damage,
// multi-group customs, non-d20 dice) returns `null` from
// `extractSingleD20Face`, and `play()` then resolves immediately with no
// animation -- never a partial or silently-wrong one.
//
// ALL RENDERER-SPECIFIC ADAPTATION LIVES HERE, matching
// ~/lib/dice-presentation/renderer.ts's own "no third-party renderer type
// crosses this boundary" rule -- though this renderer's only third party
// is `three` itself (a graphics library, not a physics/presentation
// engine -- see WorldAuthoredThreeDiceRenderer.client.vue's own header for
// the distinction this phase draws), the same discipline applies to the
// one thing that would otherwise leak across the seam: the raw face
// number. WorldAuthoredThreeDiceRenderer.client.vue itself knows nothing
// about RollEventRecord -- it exposes exactly one method,
// `playD20(face: number)`, and this file is the only place a
// RollEventRecord is ever inspected to produce that number.

import type { Ref } from 'vue'
import type { DiceRendererAdapter } from '~/lib/dice-presentation/renderer'
import type { DiceAnimationRequest } from '~/lib/dice-presentation/types'
import type { RollEventRecord } from '~/lib/rolls/types'
import { D20_FACE_VALUES } from './authoredD20ThreeOrientation'

// The narrow slice of WorldAuthoredThreeDiceRenderer.client.vue's own
// `defineExpose` this adapter touches -- typed here rather than importing
// the SFC's own instance type, matching every sibling adapter's identical
// precedent (Vue/Nuxt makes naming an SFC's instance type standalone
// awkward).
export type WorldAuthoredThreeDiceRendererExposed = {
  // Plays the full authored throw ceremony (Enter+Roll / Land / Flourish
  // -- see the component's own header) and resolves once the die has
  // fully settled and the Flourish beat has finished. `face` is the
  // ALREADY-DECIDED, already-authoritative value to land on -- never a
  // hint, never a starting point for a search.
  playD20: (face: number) => Promise<void>
  error: string
}

const SUPPORTED_D20_FACES: ReadonlySet<number> = new Set(D20_FACE_VALUES)

// Extracts the single d20 face this renderer can present, or `null` if
// this roll cannot be represented that way. Identical logic to (and
// deliberately duplicated from, not shared with) Phase 4B's own
// worldAuthoredDiceRendererAdapter.ts -- see this file's own header for
// why. A plain ability/save/skill check (`1d20+mod`) is the common case
// this covers; advantage, damage rolls, and multi-group custom
// expressions are all correctly out of scope and fall back to whichever
// OTHER renderer is registered, untouched.
export function extractSingleD20Face(record: RollEventRecord): number | null {
  const group = record.dice.length === 1 ? record.dice[0] : undefined
  if (!group || group.sides !== 20 || group.results.length !== 1) return null

  const face = group.results[0]
  if (face === undefined || !SUPPORTED_D20_FACES.has(face)) return null

  return face
}

// `onRendererFailed` mirrors every sibling adapter's identical parameter
// -- called after a `play()` call whose underlying
// WorldAuthoredThreeDiceRenderer instance reports an `error` (WebGL
// unavailable, context creation failure, the component not yet mounted).
// The caller (WorldDiceOverlay.vue) uses it to fall back to whichever
// OTHER renderer the dev flag would otherwise not have selected, so
// future rolls keep animating instead of silently going dark --
// satisfying this phase's own FAILURE/FALLBACK requirement: "Presentation
// failure must never become gameplay failure."
export function createAuthoredThreeDiceRendererAdapter(
  box: Ref<WorldAuthoredThreeDiceRendererExposed | null>,
  onRendererFailed?: () => void
): DiceRendererAdapter {
  return {
    // WorldAuthoredThreeDiceRenderer.client.vue lazily imports `three` and
    // builds its scene on the FIRST roll, matching WorldDiceThreeRenderer
    // .client.vue's own established "do not pay a 3D-library cost on
    // pages that never roll dice" convention -- nothing for this adapter
    // to do ahead of time.
    async prepare() {},

    async play(request: DiceAnimationRequest) {
      const exposed = box.value
      if (!exposed) {
        // Matches every sibling adapter's posture exactly: throwing here
        // is what makes useDiceAnimationQueue.ts's own try/catch around
        // `renderer.play()` fall through to `complete` anyway -- a
        // presentation failure is never a gameplay failure.
        throw new Error('WorldAuthoredThreeDiceRenderer is not mounted')
      }

      const face = extractSingleD20Face(request.roll)
      if (face === null) {
        // Out of this phase's own explicit scope (not exactly one d20)
        // -- resolve immediately rather than animating something wrong.
        return
      }

      await exposed.playD20(face)

      if (exposed.error) {
        onRendererFailed?.()
      }
    },

    dispose() {}
  }
}
