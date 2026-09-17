// authoredPolyhedralPoolTypes -- the plain data contract between
// worldAuthoredThreeDiceRendererAdapter.ts (which inspects
// RollEventRecord) and WorldAuthoredPolyhedralDiceRenderer.client.vue
// (which knows nothing about RollEventRecord at all). Roll System Phase
// 4C. Kept as its own module rather than exported from the renderer's own
// `<script setup>` block -- `<script setup>` cannot export runtime
// bindings to other modules, only the component itself.

// One die to present -- built entirely by the adapter from
// RollEventRecord data. `labelRole` is only ever `'tens'` for a d100's
// tens-die presentation instance; everything else uses each die type's
// own default labeling.
export type PoolDieSpec = {
  sides: number
  value: number
  kept: boolean
  labelRole?: 'tens'
}

// Presentation limit -- this task's own "define a sensible presentation
// limit... prefer honest fallback over misleading partial presentation."
export const MAX_POOL_SIZE = 6
