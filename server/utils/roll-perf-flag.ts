import { createHash } from 'node:crypto'

// Roll System Phase 3C/3D/3E/3F (Roll Performance Audit) -- the single
// opt-in flag gating ALL `[roll-perf:*]` verbose stage diagnostics across
// the roll-resolution critical path (character-assembly.ts,
// character-derived.ts, world-effective-content.ts, world-content-sources.ts,
// content-workspace-entity-atomic.ts, directus.ts). Deliberately its own
// tiny module, never defined inside directus.ts itself: several existing
// test suites already `vi.mock('./directus', () => ({ ... }))` with a
// hand-written replacement object, and adding a new export to directus.ts
// directly would silently break every one of them (no `isRollPerfVerbose`
// on their mock). A separate module has no existing mocks to break.
//
// Default OFF. See click-to-dice-latency-trace.md §13 for exactly what each
// `[roll-perf:*]` prefix logs, why none of them can leak a credential or a
// full payload, and the exact owner capture procedure.
export function isRollPerfVerbose(): boolean {
  return process.env.ELDRA_ROLL_PERF_VERBOSE === 'true' || process.env.ELDRA_ROLL_PERF_VERBOSE === '1'
}

// Published-Pack Load Reduction Pass -- an owner review of a verbose
// capture flagged a real entity/session identifier appearing in a logged
// field (world-content-sources.ts's own `workspaceId=` on
// `[roll-perf:workspace-source]`): a persistent identifier, not a
// correlation id. This computes a short, ONE-WAY, non-reversible tag from
// any such identifier -- stable within one process lifetime (the same raw
// id always maps to the same tag, so two log lines about the SAME
// workspace/session still visibly correlate), but never the identifier
// itself, and never looked up or decoded anywhere in this codebase. Every
// caller is expected to log ONLY this tag, never the raw value, for any
// field whose only job is "tell two log lines about the same thing apart."
export function opaqueId(value: string): string {
  const digest = createHash('sha256').update(value).digest('hex')
  return `#${digest.slice(0, 8)}`
}
