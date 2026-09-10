// character-sheet-resolve -- Visual Language Phase 0 (see
// .github/docs/architecture/eldra-character-sheet-visual-language.md §5,
// §8 Phase 0). Bound to the one canonical Character Sheet route
// (`/worlds/:id/characters/:characterId/sheet`) so every entry point in
// the app can link to a single URL without knowing whether the character
// behind it is V1-only or V2-capable.
//
// Detection signal is the one the Beauty Pass and Visual Language docs
// both already name: `assembly.available` (server/utils/character-assembly.ts),
// true only when a `catalogue_selection` block exists. No new schema, no
// new flag -- this reads the exact same endpoint sheet-v2.vue itself
// calls via useCharacterSheet.ts.
//
// This never renders anything itself -- it redirects to whichever
// concrete sheet can actually render this character. V1 and V2 pages are
// both untouched by this file; it only decides which one a visitor lands
// on.
export default defineNuxtRouteMiddleware(async (to) => {
  const worldId = String(to.params.id || '')
  const characterId = String(to.params.characterId || '')
  if (!worldId || !characterId) return

  const assembly = await $fetch<{ available: boolean; reason?: string }>(
    `/api/worlds/${worldId}/characters/${characterId}/assembly`
  ).catch(() => null)

  if (assembly?.available) {
    return navigateTo(
      { path: `/worlds/${worldId}/characters/${characterId}/sheet-v2`, query: to.query },
      { replace: true }
    )
  }

  // 'no-catalogue-selection' is precisely "this character predates V2 and
  // can only render on the legacy sheet" -- see the Visual Language doc's
  // §5.2 table. Any other reason (character-not-found, or the fetch
  // itself failing) falls through to this route's own not-found page
  // rather than guessing a destination.
  if (assembly?.reason === 'no-catalogue-selection') {
    return navigateTo(
      { path: `/worlds/${worldId}/entities/${characterId}/sheet`, query: to.query },
      { replace: true }
    )
  }
})
