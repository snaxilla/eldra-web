// Pure helpers behind the Developer Roll Sandbox
// (app/components/admin/health/AdminRollSandbox.vue). Eldra Roll System
// Phase 2A -- see .github/docs/architecture/eldra-roll-system.md.
//
// Extracted into their own module for the same reason
// app/utils/diceBoxRollSummary.ts and
// app/components/admin/health/projectHealth.ts already are: this repo has
// no component-rendering test harness (no jsdom, no @vue/test-utils --
// vitest.config.ts's own `environment: 'node'`), so anything inside a
// `.vue` <script setup> block cannot be imported by a test directly. The
// Sandbox itself does no independent business logic beyond what lives
// here and a thin $fetch call to the already-tested Phase 1 API -- the
// actual roll/visibility/pagination behavior is exercised by
// tests/server/utils/roll-events.test.ts and the route tests, not
// re-tested here.

import type { RollDieGroup, RollEventRecord, RollVisibility } from '~/lib/rolls/types'

// ---------------------------------------------------------------------------
// Request body -- what the form actually sends
// ---------------------------------------------------------------------------

// Phase 2A supports `custom` rolls only (this task's own scope, and
// server/api/worlds/[id]/rolls/index.post.ts's own Phase 1 rejection of
// any other sourceType) -- this helper hardcodes it rather than exposing a
// sourceType the form has no control for.
export type CustomRollFormInput = {
  expression: string
  visibility: RollVisibility
  label: string
}

export function buildCustomRollRequestBody(input: CustomRollFormInput): Record<string, unknown> {
  const expression = input.expression.trim()
  const label = input.label.trim()

  return {
    sourceType: 'custom',
    expression,
    visibility: input.visibility,
    // Omitted rather than sent empty -- the server already defaults an
    // absent label to the expression itself
    // (server/api/worlds/[id]/rolls/index.post.ts), so sending `''` would
    // only make this component's own guess worse than the server's.
    ...(label ? { label } : {})
  }
}

// ---------------------------------------------------------------------------
// Error display -- the real server message, never replaced with generic
// text (this task's own ERRORS section). Mirrors the exact extraction
// shape already used throughout this codebase (e.g.
// CharacterNotesPanel.vue's save handler,
// AdminProjectHealthPanel.vue's rebuildContentPackage) --restated here so
// it is independently testable rather than copy-pasted into the Sandbox
// verbatim.
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

// ---------------------------------------------------------------------------
// Display formatting -- shared between the "latest roll" result and every
// history row. COMPUTES NOTHING: every value read here is already on the
// RollEventRecord/RollDieGroup the server returned (results, keptFlags,
// total, modifiers) -- matching the same "the sheet displays, it never
// recomputes" discipline every other Roll System consumer already follows
// (characterDerivedValues.ts, diceBoxRollSummary.ts).
// ---------------------------------------------------------------------------

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

// "(none)" rather than an empty string -- a blank field reads as a bug in
// a debugging tool, not as "there were no modifiers."
export function formatRollModifiers(record: Pick<RollEventRecord, 'modifiers'>): string {
  if (!record.modifiers.length) return '(none)'
  return record.modifiers.map((value) => (value >= 0 ? `+${value}` : String(value))).join(' ')
}
