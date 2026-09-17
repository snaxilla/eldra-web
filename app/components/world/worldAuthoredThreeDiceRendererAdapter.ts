// worldAuthoredThreeDiceRendererAdapter -- the SECOND real
// DiceRendererAdapter implementation actually registered in production.
// Roll System Phase 4B.1 (Authored Three.js d20 Proof of Concept,
// ADR-024 Option 2), implementing ADR-024
// (.github/docs/architecture/adr-024-authored-dice-presentation.md) §4
// ("System concept"), §7 ("Face presentation"), §11/§12 (Option 2 --
// Canvas/WebGL authored dice, invoked here as the named fallback after
// Phase 4B's CSS/DOM proof of concept did not clear the visual-quality
// gate).
//
// THE PHYSICS RENDERER IS NOT TOUCHED. WorldDiceThreeRenderer.client.vue
// (physics, @3d-dice/dice-box-threejs) is unchanged and remains
// registerable -- see useDiceRendererMode.ts for the two-way dev flag
// (`'physics' | 'authored-three'`) that decides which adapter
// WorldDiceOverlay.vue actually registers at a given moment. Phase 4B's
// own CSS/DOM proof of concept (`WorldAuthoredDiceRenderer.vue`,
// `worldAuthoredDiceRendererAdapter.ts`) is NOT a third option here -- it
// was never committed to git (a Phase 4B.1 deployment-fix audit proved
// this directly via `git ls-tree`/`git status`), so it is not registered
// or imported by any committed code, this file included.
//
// DELIBERATELY DUPLICATES extractSingleD20Face RATHER THAN IMPORTING IT
// FROM worldAuthoredDiceRendererAdapter.ts (Phase 4B's own identical,
// never-committed function). This phase's own IMPORTANT section reads "do
// not couple the new renderer to [the old renderer's] runtime behavior"
// -- applied here to mean each renderer's own adapter stays fully
// self-contained, with NO cross-import between sibling renderer adapters,
// matching the precedent worldDiceThreeRendererAdapter.ts already sets
// (it duplicates its own tiny `wait()`-style helpers rather than sharing
// them). The duplicated function is eight lines and changes only if this
// phase's own d20-only scope ever changes, at which point it would need
// independent review anyway. This also turned out to matter more than
// intended: because the two adapters never share an import, this file's
// own build was never at risk from the CSS renderer's own missing commit
// -- only WorldDiceOverlay.vue's direct import of it was.
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
import { PLACEHOLDER_ANIMATION_MS } from '~/composables/useDiceAnimationQueue'
import type { DiceRendererAdapter } from '~/lib/dice-presentation/renderer'
import type { DiceAnimationRequest } from '~/lib/dice-presentation/types'
import type { RollEventRecord } from '~/lib/rolls/types'
import { D20_FACE_VALUES } from './authoredD20ThreeOrientation'

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

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
        // Roll System Phase 4B.7: out of this renderer's own explicit
        // scope (not exactly one d20 -- a manual d4/d6/d8/d10/d12/d100,
        // advantage, damage, or a multi-group custom roll). Resolving
        // IMMEDIATELY here (the original Phase 4B.1 behavior) meant
        // useDiceAnimationQueue.ts's 'animating' state lasted only a few
        // milliseconds -- long enough that WorldDiceStage.vue's own
        // always-mounted placeholder chip (Phase 3A) never got a real
        // beat to show before the roll completed, which reads as "the die
        // silently did nothing" rather than an honest fallback
        // presentation. Waiting out the SAME PLACEHOLDER_ANIMATION_MS the
        // queue itself already uses when NO renderer is registered at all
        // gives that chip a normal-feeling animating beat -- this is the
        // "smallest appropriate correction at the adapter/presentation
        // seam" this phase's own CURRENT AUTHORED RENDERER LIMITATION
        // section calls for, not a change to the renderer's own frozen
        // d20 presentation contract, and not a route back through
        // physics merely because this renderer lacks geometry for the
        // die.
        await wait(PLACEHOLDER_ANIMATION_MS)
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
