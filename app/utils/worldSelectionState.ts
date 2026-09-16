// Authentication Flow Cleanup -- WORLD SELECTION DATA STATES.
//
// Pure decision logic for what app/pages/index.vue (the World Selection
// page, "Choose a world to enter") should render, kept out of the .vue
// file so it is directly testable under plain Vitest -- matching this
// codebase's own established convention of pure state/orchestration logic
// living outside .vue files (see e.g. authoredD20ThreeChoreography.ts's
// own header).
//
// This task's own CRITICAL EMPTY-STATE RULE: "No worlds yet" has exactly
// one valid meaning -- authenticated, world loading completed
// successfully, and the user genuinely has zero accessible Worlds. Every
// other combination below resolves to a DIFFERENT state specifically so
// the empty state can never be reached by accident (unresolved auth,
// pending load, or a failed request all take priority over it).

export type WorldSelectionState =
  | 'auth-unresolved'
  | 'unauthenticated'
  | 'loading'
  | 'error'
  | 'empty'
  | 'populated'

export interface WorldSelectionInput {
  /** `useAuth()`'s own `state.value.ready` -- has `/api/auth/me` resolved at all yet. */
  authReady: boolean
  /** `useAuth()`'s own `state.value.authenticated`, meaningful only once `authReady` is true. */
  authenticated: boolean
  /** `useFetch('/api/worlds')`'s own `pending`. */
  worldsPending: boolean
  /** Whether the `/api/worlds` request failed -- pass `!!error.value`, not the error object itself. */
  worldsError: boolean
  /** The resolved world list's length. Ignored unless every state above it has already been ruled out. */
  worldsCount: number
}

// Priority order matters and is the entire point of this function: each
// check below can only be reached once every state ranked above it has
// been ruled out, so an unresolved/pending/failed request can never be
// misread as "zero worlds."
export function resolveWorldSelectionState(input: WorldSelectionInput): WorldSelectionState {
  if (!input.authReady) return 'auth-unresolved'
  if (!input.authenticated) return 'unauthenticated'
  if (input.worldsPending) return 'loading'
  if (input.worldsError) return 'error'
  if (input.worldsCount > 0) return 'populated'
  return 'empty'
}
