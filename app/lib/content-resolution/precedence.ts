// Effective-content precedence -- Content Workspaces & Studio, Phase 5
// (content-workspaces-and-studio.md §8.3). Pure: no I/O.
//
// Selects a winner AMONG a group that has already been formed by
// evidence-based collapse (app/lib/content-identity's evidenceKeys /
// union-find, in server/utils/world-effective-content.ts). This module
// answers only "given several candidates that are declared to be the
// SAME logical entity, which one wins" -- it never decides whether they
// are the same entity, and it never merges fields across them.
//
// Rank 1 (World-level customization) is reserved and intentionally has
// no candidate field here -- nothing in the MVP ever produces a rank-1
// candidate, so there is nothing to compare at that rank. Adding it later
// means adding a rank ABOVE rank 2, which changes no existing ordering
// (§8.3's own point).

export type PrecedenceBindingMode = 'pinned' | 'channel' | 'workspace'

export type PrecedenceCandidate = {
  // The binding's own identifier -- a real packageId for `pinned`/
  // `channel`, or a pseudo-id (`workspace.${workspaceId}`) for
  // `workspace`. Always unique per binding, which is what makes rank 5 a
  // true, tie-free final tiebreak rather than a coincidental one.
  packageId: string
  binding: {
    bindingMode: PrecedenceBindingMode
    priority: number | null
    createdAt: string | null
  }
}

// Rank 2: a live workspace binding outranks every pinned/channel source.
function bindingModeRank(mode: PrecedenceBindingMode): number {
  return mode === 'workspace' ? 0 : 1
}

// Rank 3: explicit priority, ascending (1 beats 2); null sorts last.
function priorityRank(priority: number | null): number {
  return priority === null ? Number.POSITIVE_INFINITY : priority
}

// Rank 4: binding recency, descending (more recently bound wins). Returns
// a value that sorts ASCENDING for "more recent wins" -- the negated
// epoch, so a later timestamp (a larger epoch) produces a smaller rank.
// An unparseable/absent timestamp sorts as if it were the oldest possible
// (never wins a recency tie it has no evidence for).
function recencyRank(createdAt: string | null): number {
  const epoch = createdAt ? Date.parse(createdAt) : NaN
  return Number.isFinite(epoch) ? -epoch : Number.POSITIVE_INFINITY
}

// A total order: comparePrecedence(a, b) === 0 implies a and b are
// EXACTLY the same binding (impossible for two distinct bindings in one
// World, since rank 5 is each binding's own unique identifier) -- see
// this module's header. Negative means `a` ranks higher (wins).
export function comparePrecedence(a: PrecedenceCandidate, b: PrecedenceCandidate): number {
  return (
    bindingModeRank(a.binding.bindingMode) - bindingModeRank(b.binding.bindingMode)
    || priorityRank(a.binding.priority) - priorityRank(b.binding.priority)
    || recencyRank(a.binding.createdAt) - recencyRank(b.binding.createdAt)
    || a.packageId.localeCompare(b.packageId)
  )
}

// Sorts a group and returns { winner, shadowed } -- the exact split
// server/utils/world-effective-content.ts's materialize step needs.
export function selectWinner<T extends PrecedenceCandidate>(group: readonly T[]): { winner: T; shadowed: T[] } {
  if (group.length === 0) throw new Error('selectWinner requires at least one candidate')
  const ordered = [...group].sort(comparePrecedence)
  const [winner, ...shadowed] = ordered as [T, ...T[]]
  return { winner, shadowed }
}
