// Maps a thrown $fetch error from POST /api/worlds onto ONE short,
// specific sentence -- never `error.data` rendered wholesale. This is what
// stands between the user and a raw Directus/network error of any shape
// (e.g. a slug-uniqueness race server/utils/worlds.ts's own pre-check
// didn't catch), per app/components/world/WorldCreateModal.vue's own
// ERROR HANDLING requirement.
//
// Extracted to its own module (rather than inlined in the component)
// because it is the one piece of this task's new logic that is pure and
// therefore actually unit-testable: this codebase has no Vue
// component-testing infrastructure (no @vue/test-utils, no jsdom/happy-dom
// -- vitest.config.ts is Node-environment, pure-TypeScript-only), so DOM
// rendering itself is verified manually per CLAUDE.md's own instruction
// ("start the dev server and use the feature in a browser"), while this
// function's mapping logic is verified by a real automated test.
export function describeWorldCreateError(error: any): string {
  const statusCode = error?.statusCode ?? error?.response?.status ?? error?.data?.statusCode

  if (statusCode === 400) {
    // The server's own 400 messages are already short and clean (e.g.
    // "World name is required") -- written for exactly this purpose in
    // server/api/worlds/index.post.ts.
    return error?.data?.statusMessage || 'Please check the World details and try again.'
  }
  if (statusCode === 401) {
    return 'You must be signed in to create a World.'
  }
  if (statusCode === 403) {
    return 'You do not have permission to create a World.'
  }
  if (statusCode === 409) {
    // Slug collision or a duplicate owner-membership race -- both
    // "unexpected" per this task's own ERROR HANDLING examples, since
    // server/utils/worlds.ts already pre-checks slug uniqueness before
    // insert; this is the retry-safe fallback for the race that check
    // cannot fully close.
    return 'A World with that name already exists. Try a slightly different name.'
  }

  return 'Something went wrong while creating this World. Please try again.'
}
