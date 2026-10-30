// World Workspace page-key resolution -- extracted from
// app/layouts/world-workspace.vue's own `pageKey` computed (Map-Only
// Navigation Controls fix) so the one route-identity rule the workspace
// already relies on for full-bleed map styling, sidebar glass, and map
// viewport insets can ALSO be the one source of truth a navigation
// component checks before showing a map-only control (Play/Build,
// Hide/Show Pins) -- rather than a second, independently-guessed pathname
// substring check. Pure string-in/string-out: no `useRoute()`, no Vue
// reactivity, so it is directly unit-testable without a component-mounting
// harness.
//
// `resolveWorldWorkspacePageKey(path) === 'world-map'` is true for EXACTLY
// the bare `/worlds/:id` route -- the one surface that both places/edits
// pins (`mode === 'build'`, world-page-key's sibling `/worlds/[id]/index.vue`)
// and renders them (`showPins`). It is deliberately false for
// `/worlds/:id/maps` (the map gallery/upload page -- no pins, and its own
// `mode` state is read nowhere in that page, confirmed by tracing it),
// even though that route also contains the substring "maps" -- the exact
// brittle-substring trap a naive `path.startsWith('.../maps')` check falls
// into.

export function resolveWorldWorkspacePageKey(path: string): string {
  const parts = String(path || '').split('/').filter(Boolean)
  const worldIndex = parts.findIndex((p) => p === 'worlds')

  if (worldIndex === -1) return 'global'

  const maybePage = parts[worldIndex + 2]
  const maybeChild = parts[worldIndex + 3]
  const maybeGrandchild = parts[worldIndex + 4]

  if (maybePage === 'entities' && maybeChild) {
    return 'entity-article'
  }

  if (maybePage === 'characters' && maybeChild && (maybeGrandchild === 'sheet' || maybeGrandchild === 'sheet-v2')) {
    return 'character-sheet'
  }

  return maybePage || 'world-map'
}
