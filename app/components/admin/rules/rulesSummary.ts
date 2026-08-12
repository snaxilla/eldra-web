// Pure, framework-free helpers for interpreting a GET
// /api/worlds/:id/rules/summary response (server/utils/world-runtime-
// service.ts's WorldRulesSummary) into what the Rules Admin tab displays.
//
// Extracted out of the .vue components deliberately: state classification
// is the one piece of this tab where getting it wrong has real
// consequences -- silently merging "configured but broken" into
// "unconfigured" is exactly the failure mode the architecture calls out as
// the single most likely implementation mistake. This repo has no
// component-rendering test harness (no @vue/test-utils, no jsdom/
// happy-dom -- see the commit Summary), so pulling the decision logic out
// into plain functions is what makes it unit-testable at all.

export type RulesSummaryState = 'unconfigured' | 'broken' | 'ready'

// Never infers "broken" or "ready" from a missing/malformed response --
// anything that isn't recognizably `{ configured: true, ... }` reads as
// unconfigured, the same legal default the summary endpoint itself uses
// for an absent world_rules_config row.
export function classifyRulesSummary(summary: unknown): RulesSummaryState {
  if (!summary || typeof summary !== 'object' || !(summary as Record<string, unknown>).configured) {
    return 'unconfigured'
  }

  if ((summary as Record<string, unknown>).ok === false) {
    return 'broken'
  }

  return 'ready'
}

// Renders one failure-detail value (from WorldRuntimeFailure.failure) as
// display text. Arrays of { message, definitionId? } -- the shape
// RegistryConstructionError/GraphConstructionError share -- are joined by
// their messages; everything else is stringified directly.
export function formatRulesFailureValue(value: unknown): string {
  if (Array.isArray(value)) {
    return value
      .map((item) => {
        if (item && typeof item === 'object' && 'message' in item) {
          return String((item as { message: unknown }).message)
        }
        return String(item)
      })
      .join('; ')
  }

  if (value && typeof value === 'object') {
    return JSON.stringify(value)
  }

  return String(value)
}

// The ordered, labeled key/value pairs a broken-state panel renders from a
// WorldRuntimeFailure.failure object. `stage` is skipped -- it is already
// shown separately as the section heading, not repeated in the detail list.
export function rulesFailureDetails(failure: Record<string, unknown> | null | undefined): Array<[string, string]> {
  if (!failure || typeof failure !== 'object') return []

  return Object.entries(failure)
    .filter(([key]) => key !== 'stage')
    .map(([key, value]) => [key, formatRulesFailureValue(value)] as [string, string])
}
