// GET /api/rules-packages
// See .github/docs/architecture/rules-package-infrastructure.md §5 (Module
// Map: "server/api/rules-packages/index.get.ts (new) installed packages,
// envelope columns only") and Infrastructure Commit 9's own PACKAGE LIST
// section: return only packageId/version/title/engineApiVersion, never
// manifest or definitions.
//
// Thin by design, matching every other route in this milestone: all logic
// lives in and is tested against server/utils/rules-packages.ts
// (listPublishedRulesPackages) -- this file performs no I/O of its own.

import { listPublishedRulesPackages } from '../../utils/rules-packages'

export default defineEventHandler(async () => {
  const packages = await listPublishedRulesPackages()
  return { packages }
})
