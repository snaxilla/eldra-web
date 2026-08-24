// COMPATIBILITY WRAPPER around scripts/directus/publish-rules-package.mjs.
//
// This file was Eldra's original Rules Package publisher, and it published
// exactly one package: packages/eldra-generic-d20. Its logic was already
// general -- `loadPackageSource`, `loadAndValidatePackage` and
// `publishStarterPackage` all took a `packageDir` -- but its `main()` never
// passed one, so no other authored package could be published by any
// supported means.
//
// That logic now lives in publish-rules-package.mjs, unchanged, where it can
// publish any package under packages/. This file is kept, rather than
// renamed away, so that everything already pointing at it keeps working:
//
//   - `pnpm run directus:publish-starter-package`
//   - the npm script of that name in package.json
//   - tests/scripts/directus/publish-starter-package.test.ts, which imports
//     seven symbols from this path and is unchanged by the generalization
//   - any operator runbook or shell history that names this file
//
// "eldra-generic-d20 must continue working" is a stated compatibility
// requirement of the publication-pipeline task, and a wrapper is how it is
// met without freezing the general pipeline behind a starter-specific name.
// Same shape the Content Pack pipeline used when its source-specific publish
// route became generic and the old route stayed as a delegating wrapper.
//
// Everything below is re-export or delegation. There is no publishing logic
// in this file, so the two publishers cannot drift.

import path from 'node:path'
import {
  PACKAGES_ROOT,
  STARTER_PACKAGE_DIR,
  publishRulesPackage,
  runPublish
} from './publish-rules-package.mjs'

// The seven symbols the existing test imports from this module, re-exported
// verbatim from the general pipeline.
export {
  PublishAbortError,
  buildPublishRow,
  hydrateExpressions,
  loadAndValidatePackage,
  loadPackageSource
} from './publish-rules-package.mjs'

// Preserved name and value: packages/eldra-generic-d20.
export const DEFAULT_PACKAGE_DIR = STARTER_PACKAGE_DIR

// Preserved signature, including the `packageDir` default -- the existing
// test calls this as `publishStarterPackage({ dx, deps })` with no directory
// and expects the starter package.
export async function publishStarterPackage({ packageDir = DEFAULT_PACKAGE_DIR, dx, deps }) {
  return publishRulesPackage({ packageDir, dx, deps })
}

async function main() {
  console.log(
    `Publishing the starter package (${path.relative(PACKAGES_ROOT, DEFAULT_PACKAGE_DIR)}).\n` +
    'To publish any other authored package, use:\n' +
    '  node scripts/directus/publish-rules-package.mjs <package>\n'
  )
  await runPublish(DEFAULT_PACKAGE_DIR)
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(error?.message || String(error))
    process.exit(1)
  })
}
