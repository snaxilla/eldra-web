// Rules Engine Static Cycle Detection.
// See .github/docs/architecture/rules-engine.md §14.8 ("Static cycles are
// detected at package validation and fail the import with the full cycle
// path") and the approved graph-algorithm-strategy analysis (this
// session's prior turn) for the design this implements: a recursive
// three-color DFS was chosen deliberately over Tarjan/Kosaraju/Kahn/
// Johnson because its natural output -- the recursion stack at the moment
// a back edge is found -- *is* the readable, ordered cycle path this task
// asks for, with no reconstruction step. See that analysis for the full
// comparison; this file does not re-argue it.
//
// This module answers exactly what §14.8 and this task's OBJECTIVE name:
// does a static dependency cycle exist in this DependencyGraph, and if so,
// what is a human-readable path through each one. It performs NO
// topological ordering, NO evaluation, NO scheduling, NO memoization, NO
// cache invalidation, and NO runtime cycle detection (§14.8's *dynamic*
// cycle guard, caught "at runtime by a visit-set guard," is a distinct,
// later, evaluator-scoped mechanism -- see this file's own Summary/Project
// Knowledge Review for why the two are not the same thing).

import type { DependencyGraph } from './dependency-graph'
import type { DefinitionId } from './types'

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

// A single closed cycle: path[0] === path[path.length - 1]. Closing the
// path this way (rather than leaving it open and documenting the implicit
// wraparound) is what the task's own worked example asks for -- it means
// `path.join(' -> ')` is the complete, correct GM-facing diagnostic with no
// special-casing at either end.
export type DependencyCycle = {
  path: readonly DefinitionId[]
}

export type CycleDetectionResult =
  | { ok: true }
  | { ok: false; cycles: DependencyCycle[] }

// Detects every static dependency cycle in `graph`. A free function, not a
// DependencyGraph method -- keeps the graph a pure structure and this
// algorithm independently testable/replaceable, the same reasoning
// reference-validation.ts and type-validation.ts already apply by sitting
// outside RulesRegistry.
//
// Traversal order (both the top-level entry order and each node's own
// dependency order) comes directly from DependencyGraph's own already-
// deterministic listNodes()/getDependencies() -- see dependency-graph.ts's
// own "deterministic first-occurrence ordering" guarantee -- so the
// resulting `cycles` array is deterministic without any additional sort.
export function detectCycles(graph: DependencyGraph): CycleDetectionResult {
  const color = new Map<DefinitionId, 'white' | 'grey' | 'black'>()
  for (const id of graph.listNodes()) color.set(id, 'white')

  const stack: DefinitionId[] = []
  const cycles: DependencyCycle[] = []
  const seenCanonicalCycles = new Set<string>()

  function visit(id: DefinitionId): void {
    color.set(id, 'grey')
    stack.push(id)

    for (const dependency of graph.getDependencies(id)) {
      const state = color.get(dependency)

      if (state === 'grey') {
        // Back edge: `dependency` is a currently-open ancestor on this
        // exact recursion path. The cycle is the stack suffix from that
        // ancestor through the current node, closed by repeating the
        // ancestor -- read directly off the recursion stack, no
        // reconstruction.
        const startIndex = stack.indexOf(dependency)
        const path = Object.freeze([...stack.slice(startIndex), dependency])
        const canonicalKey = canonicalCycleKey(path)
        if (!seenCanonicalCycles.has(canonicalKey)) {
          seenCanonicalCycles.add(canonicalKey)
          cycles.push({ path })
        }
        continue
      }

      if (state === 'white') {
        visit(dependency)
      }

      // state === 'black': already fully explored from an earlier branch
      // with no cycle found through it -- revisiting cannot discover a new
      // one (a node reachable from a black node was already explored while
      // that node was grey, and would have been caught then).
    }

    stack.pop()
    color.set(id, 'black')
  }

  for (const id of graph.listNodes()) {
    if (color.get(id) === 'white') visit(id)
  }

  return cycles.length > 0 ? { ok: false, cycles } : { ok: true }
}

// ---------------------------------------------------------------------------
// Deduplication (node-set/rotation canonicalization -- explicitly permitted
// by this task: "Node-set canonicalization is acceptable")
// ---------------------------------------------------------------------------

// Two closed cycles that are rotations of the same node sequence (e.g. one
// discovered as [A,B,C,A] and another, from a different DFS entry point,
// as [B,C,A,B]) represent the same real authoring mistake and should
// produce one report, not two. Direction is NOT collapsed -- [A,B,C,A] and
// [A,C,B,A] are kept distinct, since in a directed graph they are genuinely
// different edge sets (a formula depending on X is not the same fact as X
// depending on that formula), and collapsing them would hide a real
// distinction rather than a cosmetic one.
function canonicalCycleKey(path: readonly DefinitionId[]): string {
  const openPath = path.slice(0, -1) // drop the repeated closing node
  // A space is a safe separator: DefinitionIds are `<kind>:<slug>` strings
  // (types.ts) built only from identifier characters and ':'/'.' (parser.ts's
  // grammar), never whitespace.
  let smallest = openPath.join(' ')
  for (let i = 1; i < openPath.length; i++) {
    const rotated = [...openPath.slice(i), ...openPath.slice(0, i)].join(' ')
    if (rotated < smallest) smallest = rotated
  }
  return smallest
}
