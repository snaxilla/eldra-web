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
import { percentileDigitsForD100 } from './authoredD100Percentile'
import { MAX_POOL_SIZE, type PoolDieSpec } from './authoredPolyhedralPoolTypes'

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

// ---------------------------------------------------------------------------
// Roll System Phase 4C -- POOL PRESENTATION. Everything below is NEW; the
// single-d20 path above is byte-for-byte unchanged and remains the exact
// route a plain "1d20" roll takes (see WorldAuthoredPolyhedralDiceRenderer
// .client.vue's own header for why d20 stays frozen/reused rather than
// rebuilt).
// ---------------------------------------------------------------------------

// Every side count the standard dice family's authored geometry supports
// for POOL presentation -- d20 included (a pooled d20, e.g. 2d20
// advantage, is presented here even though a SOLO d20 never reaches this
// path at all). d100 is deliberately excluded: it is handled by its own
// explicit branch below (`extractD100PoolPresentation`), never by
// treating "sides: 100" as an ordinary pool member.
const SUPPORTED_POOL_SIDES: ReadonlySet<number> = new Set([4, 6, 8, 10, 12, 20])

// A d10 die's own authoritative domain is 1-10 (see authoredD10Three.ts's
// own header) even when this file wants to land it on a specific PHYSICAL
// face 0-9 for percentile presentation -- this is the one, explicit place
// that translates "physical face" back into "the authoritative value that
// lands on it" (physical face 0 <- authoritative value 10; faces 1-9 <-
// the same-numbered value), so that translation exists exactly once.
function d10ValueForPhysicalFace(face: number): number {
  return face === 0 ? 10 : face
}

// d100 PRODUCT SEMANTICS (this task's own D100 PRODUCT SEMANTICS section):
// the RollEvent remains a literal single `1d100` group with ONE
// authoritative result 1-100 -- nothing here rolls a second die or
// generates a second random value. `percentileDigitsForD100` (a pure
// function of that one already-decided value) derives the conventional
// tens/ones decomposition; this function only ever translates that
// decomposition into two PRESENTATION-ONLY d10 specs.
function extractD100PoolPresentation(record: RollEventRecord): PoolDieSpec[] | null {
  const group = record.dice.length === 1 ? record.dice[0] : undefined
  if (!group || group.sides !== 100 || group.results.length !== 1) return null

  const value = group.results[0]
  if (value === undefined || value < 1 || value > 100) return null

  const { tens, ones } = percentileDigitsForD100(value)
  return [
    { sides: 10, value: d10ValueForPhysicalFace(tens / 10), kept: true, labelRole: 'tens' },
    { sides: 10, value: d10ValueForPhysicalFace(ones), kept: true }
  ]
}

// Extracts a general multi-die pool presentation -- EVERY die across
// EVERY group, in order, each with its own already-authoritative value
// and its own already-authoritative `keptFlags` entry (this task's own
// KEPT/DROPPED section: "do not infer kept/dropped status if
// RollEventRecord does not actually provide it" -- `keptFlags` always
// provides it, defaulting a missing entry to `true`/kept, never to
// `false`, so a malformed/short array can only ever OVER-show a die as
// kept, never wrongly hide one as dropped). Returns `null` -- an honest
// fallback to the placeholder, per this task's own FALLBACK section --
// for any unsupported die type or a pool exceeding `MAX_POOL_SIZE`,
// rather than rendering a partial or misleading presentation.
export function extractPoolPresentation(record: RollEventRecord): PoolDieSpec[] | null {
  const d100 = extractD100PoolPresentation(record)
  if (d100) return d100

  const specs: PoolDieSpec[] = []
  for (const group of record.dice) {
    if (!SUPPORTED_POOL_SIDES.has(group.sides)) return null
    group.results.forEach((value, i) => {
      specs.push({ sides: group.sides, value, kept: group.keptFlags[i] ?? true })
    })
  }

  if (specs.length === 0 || specs.length > MAX_POOL_SIZE) return null
  return specs
}

// The narrow slice of WorldAuthoredPolyhedralDiceRenderer.client.vue's own
// `defineExpose` this adapter touches.
export type WorldAuthoredPolyhedralDiceRendererExposed = {
  playPool: (specs: PoolDieSpec[]) => Promise<void>
  error: string
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
// Roll System Phase 4C -- `polyhedralBox` is the NEW general pool
// renderer (WorldAuthoredPolyhedralDiceRenderer.client.vue); `box`
// remains the frozen single-d20 renderer, completely unchanged in every
// way including its own call signature (`playD20(face)`) and its own
// dedicated `extractSingleD20Face` scope check above. Dispatch order:
//   1. Exactly one d20 -> the frozen single-d20 path (unchanged from
//      every prior phase -- this is the ONLY route a plain "1d20" roll
//      has ever taken, and still is).
//   2. Any other presentable pool (d4/d6/d8/d10/d12/d20-pools/d100) ->
//      the new general renderer.
//   3. Anything else (unsupported dice, an oversized pool, a
//      multi-group custom expression this family can't represent) -> the
//      SAME honest placeholder-wait fallback Phase 4B.7 already
//      established, unchanged.
export function createAuthoredThreeDiceRendererAdapter(
  box: Ref<WorldAuthoredThreeDiceRendererExposed | null>,
  polyhedralBox: Ref<WorldAuthoredPolyhedralDiceRendererExposed | null>,
  onRendererFailed?: () => void
): DiceRendererAdapter {
  return {
    // Both renderer components lazily import `three` and build their own
    // scene on the FIRST roll each actually renders -- nothing for this
    // adapter to do ahead of time.
    async prepare() {},

    async play(request: DiceAnimationRequest) {
      const face = extractSingleD20Face(request.roll)
      if (face !== null) {
        const exposed = box.value
        if (!exposed) {
          throw new Error('WorldAuthoredThreeDiceRenderer is not mounted')
        }
        await exposed.playD20(face)
        if (exposed.error) onRendererFailed?.()
        return
      }

      const pool = extractPoolPresentation(request.roll)
      if (pool !== null) {
        const exposed = polyhedralBox.value
        if (!exposed) {
          throw new Error('WorldAuthoredPolyhedralDiceRenderer is not mounted')
        }
        await exposed.playPool(pool)
        if (exposed.error) onRendererFailed?.()
        return
      }

      // Roll System Phase 4B.7's own reasoning, unchanged: resolving
      // instantly here would give WorldDiceStage.vue's own always-mounted
      // placeholder chip no visible beat at all. Waiting out the SAME
      // PLACEHOLDER_ANIMATION_MS the queue itself already uses when no
      // renderer is registered keeps that fallback feeling like a normal
      // roll rather than "the die silently did nothing."
      await wait(PLACEHOLDER_ANIMATION_MS)
    },

    dispose() {}
  }
}
