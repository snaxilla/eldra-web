// Pure, framework-free helpers for building non-destructive PATCH
// /api/worlds/:id/rules/config payloads -- Infrastructure Commit 9.
//
// Extracted out of AdminRulesOptionalRulesEditor.vue /
// AdminRulesRollTypesEditor.vue for the same reason rulesSummary.ts
// already extracts state classification: this repo has no
// component-rendering test harness (no @vue/test-utils, no jsdom/
// happy-dom), so the one piece of each editor with a real correctness
// hazard needs to live in a plain function to be testable at all.
//
// The hazard both functions guard against is identical: `saveWorldRulesConfig`
// (server/utils/world-rules-config.ts) replaces the WHOLE `settings` /
// `roll_types` JSON column on any write that supplies one -- neither is a
// deep merge. Confirmed against the starter package itself: it declares a
// `requiredTrait` (`campaign.difficulty`) alongside its one `optionalRule`
// (`gritty`), both stored under `settings` but different `kind`s. A PATCH
// built from the edited fields ALONE would silently discard everything
// else the World had stored. Both functions below always start from a
// COPY of the World's current raw value and only replace the keys the
// editor actually manages.

import type { WorldRollTypeOverride } from '../../../lib/rules/types'

// AdminRulesOptionalRulesEditor.vue: merges an edited `rules` kind into a
// copy of the World's full current `settings`, leaving every other kind
// (e.g. `campaign`) untouched.
export function buildOptionalRulesSettingsPatch(
  currentSettings: Record<string, Record<string, unknown>>,
  draftRuleValues: Record<string, unknown>
): Record<string, Record<string, unknown>> {
  return {
    ...currentSettings,
    rules: { ...(currentSettings.rules ?? {}), ...draftRuleValues }
  }
}

export type RollTypeOverrideDraftEntry = {
  enabled: boolean
  order: number
  // Empty string means "no override -- use the package's declared
  // default" (world-configuration.md §D.5) -- omitted from the built
  // override, never written as a literal empty-string visibility.
  visibility: string
}

// AdminRulesRollTypesEditor.vue: merges edited roll-type overrides into a
// copy of the World's full current override map. Preserves any override
// for a roll type the active package version no longer declares --
// resolveWorldConfig already treats that as a warning, never corruption
// (world-configuration.md §10: "stale config after upgrade, not
// corruption") -- this function has no business silently deleting it.
export function buildRollTypeOverridesPatch(
  currentOverrides: Record<string, WorldRollTypeOverride>,
  draftEntries: Record<string, RollTypeOverrideDraftEntry>
): Record<string, WorldRollTypeOverride> {
  const next: Record<string, WorldRollTypeOverride> = { ...currentOverrides }

  for (const [id, entry] of Object.entries(draftEntries)) {
    next[id] = {
      enabled: entry.enabled,
      order: entry.order,
      ...(entry.visibility ? { visibility: entry.visibility as WorldRollTypeOverride['visibility'] } : {})
    }
  }

  return next
}
