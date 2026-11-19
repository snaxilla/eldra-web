// World Properties (rename) -- Game Admin -> World Properties -> change
// name -> Save. `useFetch`'s own default cache key is a hash of the
// request URL/options, not the literal URL string -- not safe to target
// from a DIFFERENT component via `refreshNuxtData` without risking a
// mismatch. These two explicit keys are shared between the `useFetch`
// calls that use them (app/layouts/world-workspace.vue's own `world`
// fetch; app/pages/index.vue's own World Selector listing) and
// AdminWorldPropertiesPanel.vue, which calls `refreshNuxtData` with the
// SAME string after a successful rename so the sidebar heading and the
// World Selector both reflect the new name immediately, without a
// sign-out or full application restart.
export function worldDataCacheKey(worldId: string | number): string {
  return `world-workspace-data-${worldId}`
}

export const WORLDS_LIST_CACHE_KEY = 'worlds-list'
