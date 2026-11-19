// Pure helper behind WorldEntityRelationshipsPanel.vue's own `canEdit`
// gate -- extracted for the same reason worldEntityDirectEditEligibility.ts
// was (this repo has no DOM/browser test harness, so pure logic pulled
// out of a .vue file is how it gets real unit coverage).
//
// ARTICLE PAGE BUILDER WITHOUT PLAY/BUILD MODE. This gate previously also
// required the caller's own `mode === 'build'` (the World Map's Play/Build
// toggle) alongside `allowEdit` -- removed, since the ONLY caller that
// ever passes `allowEdit` as anything but hardcoded `false` is the
// 'article' variant (entities/[entityId]/index.vue), which now derives
// it from real capability + Page Builder being open, not from Map mode.
// `variant === 'article'` is kept as its own, independent boundary: the
// 'drawer' variant (WorldEntityContextDrawer.vue) must never become
// editable through this gate no matter what `allowEdit` is passed as --
// this is what the test below specifically proves survived the mode
// removal.
export function canEditEntityRelationships(variant: unknown, allowEdit: unknown): boolean {
  return variant === 'article' && allowEdit === true
}
