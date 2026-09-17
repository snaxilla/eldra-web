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

// ---------------------------------------------------------------------------
// Request body / error display / roll formatting -- moved to
// app/lib/rolls/requests.ts and app/lib/rolls/format.ts (Phase 2C for the
// latter, Phase 4B.7 for the former), both of which needed this exact
// logic outside the admin-only tree once a second, non-admin consumer
// (WorldManualDiceRack.vue) needed it too. Re-exported here, unchanged in
// name and behavior, so this file's own existing call sites and tests
// (tests/components/admin/health/rollSandbox.test.ts) needed no changes.
// ---------------------------------------------------------------------------

export type { CustomRollFormInput } from '~/lib/rolls/requests'
export { buildCustomRollRequestBody } from '~/lib/rolls/requests'
export { extractServerErrorMessage, formatRollDieGroup, formatRollModifiers } from '~/lib/rolls/format'
