// resolveDerivedImageUrl -- Content Workspaces & Studio Phase 5/6 (§8.9,
// admin image propagation follow-up). Pure; no I/O.
//
// The one centrally-defined precedence rule between an authored image
// override and whatever a consumer's own existing image-lookup chain
// would otherwise find. Lives here (not inside
// server/api/worlds/[id]/entities.get.ts, which calls it) specifically so
// it is unit-testable without that route's Directus/Nitro-auto-import/
// filesystem setup -- this repo has no component-rendering harness and
// this route relies on Nuxt's implicit auto-imports, neither of which a
// plain Vitest run can satisfy.
//
// `legacyDerivedImageUrl` is a LAZY callback precisely so an authored
// decision (present or explicitly null) never pays for computing the
// legacy chain at all, and so a test never needs to mock that chain's own
// considerable dependencies to prove an override takes precedence over it.
export function resolveDerivedImageUrl(
  effectiveImageOverride: { url: string } | null | undefined,
  legacyDerivedImageUrl: () => string | null
): string | null {
  return effectiveImageOverride !== undefined ? (effectiveImageOverride?.url ?? null) : legacyDerivedImageUrl()
}
