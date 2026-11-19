// Pure helper behind the presentation-save route's cross-World asset
// check (PAGE BACKGROUND PICKER UX CORRECTION). Picking an EXISTING
// gallery file (rather than only ever uploading a brand-new one, which
// was always created scoped to the saving World by construction) means
// a client can now pass ANY file id, including one belonging to a
// different World -- this is the pure comparison backing that
// server-side check in server/api/worlds/[id]/presentation/[pageKey].post.ts,
// extracted so it is directly unit-testable without a Directus
// dependency (that route keeps its own existing, un-testable
// auto-import style, matching presentation-settings.patch.ts's sibling
// convention, which this task does not change).
export function fileBelongsToWorld(fileWorldId: unknown, worldId: string | number): boolean {
  const owner = Number(fileWorldId)
  const requested = Number(worldId)
  return Number.isFinite(owner) && Number.isFinite(requested) && owner === requested
}
