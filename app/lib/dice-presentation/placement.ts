// Eldra Dice Presentation Layer -- STAGE PLACEMENT. Roll System Phase
// 4C.2 (Dice Stage Position Normalization).
//
// ROOT CAUSE THIS FILE FIXES (traced, not guessed): every authored
// renderer previously defined its OWN independent, hand-tuned `fixed`
// positioning in its own template --
// WorldAuthoredThreeDiceRenderer.client.vue (`z-[175] bottom-40 ...
// sm:right-6 sm:h-72 sm:w-72`), WorldDiceThreeRenderer.client.vue
// (identical, copied from the same precedent),
// WorldAuthoredPolyhedralDiceRenderer.client.vue (`z-[35] bottom-40 ...
// sm:bottom-28 sm:right-6`, a DIFFERENT desktop bottom offset and a much
// lower z-index), and WorldDiceOverlay.vue's own wrapper around
// WorldDiceStage.vue (`z-[35] bottom-24 ... sm:right-6`, a THIRD mobile
// offset). Four independently-authored values for what should have been
// one shared contract -- exactly why die TYPE appeared to determine
// screen position: which renderer happened to be registered decided
// which of the four divergent positioning rules applied.
//
// THE FIX: position now belongs to ONE component
// (WorldDicePresentationStage.vue), never to an individual renderer.
// This file holds the PURE, testable decision data behind that
// component -- the CSS itself still lives in the component (this task's
// own "prefer CSS/layout for screen placement... do not encode viewport
// pixel coordinates inside Three.js"), but WHICH anchor is the default,
// and WHICH responsive mode a given viewport width resolves to, are
// plain functions/constants any test (or future settings UI) can read
// without mounting a component.
//
// FUTURE CONFIGURABILITY SEAM (this task's own explicit scope: describe
// the seam, implement nothing). `DiceStageAnchor` is a union of ONE value
// today. A future Game Admin/player-preference feature adds more anchor
// values here and a lookup in WorldDicePresentationStage.vue's own
// template -- no renderer file would need to change, because no renderer
// file owns placement now. No settings UI, no persistence, no Directus
// schema is implied or scaffolded by this file.

export type DiceStageAnchor = 'tray-left'

export const DEFAULT_DICE_STAGE_ANCHOR: DiceStageAnchor = 'tray-left'

// Deliberately not a bigger config object (explicit width/height/gap
// fields) -- this task's own "do not over-engineer this exact interface
// if simpler code fits the project." The one thing worth centralizing
// today is WHICH anchor is active; the CSS implementing that anchor
// lives in WorldDicePresentationStage.vue's own template, the one place
// that needs it.
export type DiceStagePlacement = {
  anchor: DiceStageAnchor
}

export const DEFAULT_DICE_STAGE_PLACEMENT: DiceStagePlacement = Object.freeze({
  anchor: DEFAULT_DICE_STAGE_ANCHOR
})

export type DiceStageResponsiveMode = 'desktop' | 'mobile'

// The exact breakpoint WorldDicePresentationStage.vue's own template
// switches on (Tailwind's `sm:` prefix, 640px) -- restated here as a
// plain number so the DECISION ("what counts as desktop") is documented
// and testable independently of mounting a component or faking
// `window.matchMedia`, which this repo's Vitest setup (`environment:
// 'node'`, no DOM) cannot do anyway. This is a pure classification
// function, not a live viewport listener -- the actual runtime behavior
// is ordinary responsive CSS.
export const DICE_STAGE_DESKTOP_BREAKPOINT_PX = 640

export function resolveDiceStageResponsiveMode(viewportWidthPx: number): DiceStageResponsiveMode {
  return viewportWidthPx >= DICE_STAGE_DESKTOP_BREAKPOINT_PX ? 'desktop' : 'mobile'
}
