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

import type { RollVisibility } from '~/lib/rolls/types'
import type { RollRequestInput } from '~/composables/useWorldRolls'

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

// Return type is `RollRequestInput` (Phase 2C) rather than a bare
// `Record<string, unknown>` now that this feeds directly into
// `useWorldRolls().requestRoll` -- the Sandbox no longer calls `$fetch`
// itself (see AdminRollSandbox.vue's own header).
export function buildCustomRollRequestBody(input: CustomRollFormInput): RollRequestInput {
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
// Error display / roll formatting -- moved to app/lib/rolls/format.ts by
// Eldra Roll System Phase 2C (the Roll Tray), which needed this exact
// formatting outside the admin-only tree. Re-exported here, unchanged in
// name and behavior, so this file's own existing call sites and tests
// (tests/components/admin/health/rollSandbox.test.ts) needed no changes.
// ---------------------------------------------------------------------------

export { extractServerErrorMessage, formatRollDieGroup, formatRollModifiers } from '~/lib/rolls/format'
