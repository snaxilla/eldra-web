// Roll System -- shared display formatting. Extracted from
// app/components/admin/health/rollSandbox.ts (Eldra Roll System Phase 2A)
// by Phase 2C (the Roll Tray, .github/docs/architecture/eldra-roll-system.md
// §9), which needed the exact same formatting the Developer Sandbox
// already had and tested -- rather than a second copy, this is now the one
// place either consumer imports it from. `rollSandbox.ts` re-exports these
// names unchanged, so its own existing tests and call sites needed no
// changes.
//
// Pure, zero I/O -- matches this file's siblings (types.ts, dice-adapter.ts)
// in never touching Directus, h3, or a component. COMPUTES NOTHING GAME
// OR DISPLAY-SPECIFIC beyond formatting: every value read here is already
// on the RollEventRecord/RollDieGroup the server returned (results,
// keptFlags, total, modifiers) -- the sheet/tray/sandbox displays, it never
// recomputes, matching characterDerivedValues.ts's and
// diceBoxRollSummary.ts's own discipline for Rules Engine/Roll output.

import type { RollDieGroup, RollEventRecord } from './types'

// ---------------------------------------------------------------------------
// Error display -- the real server message, never replaced with generic
// text. The exact extraction shape already used throughout this codebase
// (e.g. CharacterNotesPanel.vue's save handler,
// AdminProjectHealthPanel.vue's rebuildContentPackage).
// ---------------------------------------------------------------------------

export function extractServerErrorMessage(error: unknown): string {
  const err = error as any
  return (
    err?.data?.statusMessage ||
    err?.data?.message ||
    err?.statusMessage ||
    err?.message ||
    String(error)
  )
}

// One die group as a single line: "d20 #1: [14] -> 14", or, for a group
// with a dropped die (advantage/keep), the dropped face shown in
// parentheses so nothing about what OpenDice actually rolled is hidden --
// "d20 #1: [17, (4)] -> 17".
export function formatRollDieGroup(group: RollDieGroup, index: number): string {
  const shown = group.results
    .map((face, i) => (group.keptFlags[i] ? String(face) : `(${face})`))
    .join(', ')
  return `d${group.sides} #${index + 1}: [${shown}] -> ${group.total}`
}

// "(none)" rather than an empty string -- a blank field reads as a bug, not
// as "there were no modifiers."
export function formatRollModifiers(record: Pick<RollEventRecord, 'modifiers'>): string {
  if (!record.modifiers.length) return '(none)'
  return record.modifiers.map((value) => (value >= 0 ? `+${value}` : String(value))).join(' ')
}

// ---------------------------------------------------------------------------
// Relative timestamp -- the Roll Tray's own CONTENT requirement
// ("Timestamp (relative)", eldra-roll-system.md §9/Phase 2C). No library:
// a roll's age only ever needs coarse, conversational precision ("just
// now", "5m ago", "3h ago", "2d ago"), which a handful of fixed thresholds
// covers without pulling in a date library for one function.
// ---------------------------------------------------------------------------

const MINUTE = 60_000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

export function formatRelativeRollTime(iso: string, now: Date = new Date()): string {
  const then = new Date(iso).getTime()
  if (!Number.isFinite(then)) return ''

  const deltaMs = now.getTime() - then
  if (deltaMs < MINUTE) return 'just now'
  if (deltaMs < HOUR) return `${Math.floor(deltaMs / MINUTE)}m ago`
  if (deltaMs < DAY) return `${Math.floor(deltaMs / HOUR)}h ago`
  return `${Math.floor(deltaMs / DAY)}d ago`
}
