// Publishes ANY authored Rules Package under packages/ into the global
// `rules_packages` collection.
//
//   node scripts/directus/publish-rules-package.mjs <package>
//   node scripts/directus/publish-rules-package.mjs --list
//
// <package> may be a directory name (eldra-dnd5e-2024), a packageId
// (eldra.rules.dnd5e-2024), or a path -- see resolvePackageDir.
//
// See .github/docs/architecture/rules-package-infrastructure.md §7 (Infra 4),
// Q3 ("V1 only ever writes published"), and Q11 ("the only V1 ingestion path
// is a script reading repo-committed JSON... that is the recommendation, not
// a gap"). Publication is deliberately a SCRIPT and not an API route or an
// admin upload surface: that document's decision 2 calls choosing a script
// "the largest simplification available", and this task's own NON-GOALS
// exclude package editing, marketplace, and downloads. Nothing here is
// reachable from the running application.
//
// ---------------------------------------------------------------------------
// AUTHOR -> VALIDATE -> PUBLISH (no Preview stage, by design)
// ---------------------------------------------------------------------------
// Content Packs are IMPORTED from a foreign dataset nobody on this project
// wrote, so a human must see what the importer produced before it becomes a
// pack -- hence Import -> Curate -> Publish, and hence a preview route.
//
// A Rules Package is AUTHORED: its manifest.json/definitions.json are
// hand-written, reviewed, and diffed in this repository before this script is
// ever run. `git diff` is the preview, and it is a better one than any
// generated view could be. What a preview stage would add here is a rendering
// of bytes the author already has open -- so the gate that matters is not
// "does this look right" but "is this mechanically valid", which is
// validatePackage, and which runs unconditionally below.
//
// ---------------------------------------------------------------------------
// RELATIONSHIP TO publish-starter-package.mjs
// ---------------------------------------------------------------------------
// That file was the original publisher and contained this logic, generalized
// only by an unused `packageDir` parameter -- its `main()` always published
// packages/eldra-generic-d20 because nothing could pass anything else. The
// logic moved here verbatim; that file is now a thin compatibility wrapper
// that re-exports these functions and defaults to the starter package, so
// `pnpm run directus:publish-starter-package`, its npm script, and its test
// suite all keep working unchanged. Same shape the Content Pack pipeline
// already used when its source-specific publish route became generic -- the
// pattern is reused; none of that route's code is.
//
// ---------------------------------------------------------------------------
// DESIGN DECISIONS (inherited from the original publisher, unchanged)
// ---------------------------------------------------------------------------
// 1. Plain Node ESM with its own `dx()` fetch helper rather than
//    `directusServiceRequest` (server/utils/directus.ts) -- that helper calls
//    `useRuntimeConfig()`, a Nuxt-injected global absent outside a running
//    Nitro process. Every scripts/directus/*.mjs file makes this same choice.
//
// 2. `validatePackage` / `parseExpression` / `computeIntegrityHash` are the
//    REAL engine functions, loaded on demand via `jiti` because they are
//    TypeScript and this is plain node. Validation and hashing are never
//    reimplemented here. `deps` is a parameter precisely so tests inject the
//    same real functions through an ordinary TypeScript import instead.
//
// 3. Packages author Expressions as `{ "text": "..." }` only; this script
//    hydrates each into `{ text, ast }` with the real parser before
//    validation, which is what a human author expects ("write formulas as
//    text").
//
// 4. Failure model -- insert-only, never destructive: validation errors abort
//    with no row written; a duplicate published (package_id, version) aborts
//    rather than overwriting; no PATCH or DELETE is ever issued against
//    rules_packages. "Immutable published releases"
//    (rules-package-infrastructure.md §4.1) is enforced, not merely asserted.

import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const scriptDir = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(scriptDir, '..', '..')

export const PACKAGES_ROOT = path.join(repoRoot, 'packages')
export const STARTER_PACKAGE_DIR = path.join(PACKAGES_ROOT, 'eldra-generic-d20')

const COLLECTION = 'rules_packages'

export class PublishAbortError extends Error {}

// ---------------------------------------------------------------------------
// Package discovery + selection
// ---------------------------------------------------------------------------

// Every directory under packages/ carrying a manifest.json. Reads only the
// manifest (never definitions.json, which may be megabytes) so listing stays
// cheap, and tolerates an unreadable manifest rather than failing the whole
// listing -- a broken package should not hide the working ones.
export function listAuthoredPackages(packagesRoot = PACKAGES_ROOT) {
  if (!existsSync(packagesRoot)) return []

  const found = []
  for (const name of readdirSync(packagesRoot).sort()) {
    const dir = path.join(packagesRoot, name)
    const manifestPath = path.join(dir, 'manifest.json')
    if (!statSync(dir).isDirectory() || !existsSync(manifestPath)) continue

    try {
      const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
      found.push({
        dirName: name,
        dir,
        packageId: manifest.packageId ?? '(missing packageId)',
        version: manifest.version ?? '(missing version)',
        title: manifest.title ?? ''
      })
    } catch (error) {
      found.push({ dirName: name, dir, packageId: '(unreadable manifest)', version: '', title: String(error?.message || error) })
    }
  }

  return found
}

export function formatAuthoredPackages(packages) {
  if (!packages.length) return '  (no packages found under packages/)'
  return packages
    .map((entry) => `  ${entry.dirName.padEnd(22)} ${entry.packageId}@${entry.version}${entry.title ? `  -- ${entry.title}` : ''}`)
    .join('\n')
}

// Accepts a directory name ('eldra-dnd5e-2024'), a packageId
// ('eldra.rules.dnd5e-2024'), or a filesystem path. Three forms rather than
// one because all three are things a human already has in hand: the folder
// they just edited, the id printed in the manifest, and the path their shell
// completed. Ambiguity is impossible -- a packageId contains dots and a
// directory name does not.
export function resolvePackageDir(selector, packagesRoot = PACKAGES_ROOT) {
  const raw = String(selector || '').trim()
  if (!raw) {
    throw new PublishAbortError(
      `No package specified.\n\nAvailable packages:\n${formatAuthoredPackages(listAuthoredPackages(packagesRoot))}`
    )
  }

  const authored = listAuthoredPackages(packagesRoot)

  const byDirName = authored.find((entry) => entry.dirName === raw)
  if (byDirName) return byDirName.dir

  const byPackageId = authored.find((entry) => entry.packageId === raw)
  if (byPackageId) return byPackageId.dir

  // An explicit path (absolute or relative to the repo root).
  const asPath = path.isAbsolute(raw) ? raw : path.resolve(repoRoot, raw)
  if (existsSync(path.join(asPath, 'manifest.json'))) return asPath

  throw new PublishAbortError(
    `Unknown package '${raw}'.\n\nAvailable packages:\n${formatAuthoredPackages(authored)}`
  )
}

// ---------------------------------------------------------------------------
// Package loading (no I/O beyond reading the two source files)
// ---------------------------------------------------------------------------

export function loadPackageSource(packageDir = STARTER_PACKAGE_DIR) {
  const manifest = JSON.parse(readFileSync(path.join(packageDir, 'manifest.json'), 'utf8'))
  const definitions = JSON.parse(readFileSync(path.join(packageDir, 'definitions.json'), 'utf8'))
  return { manifest, definitions }
}

// Recursively replaces every `{ text: "..." }` node with `{ text, ast }` by
// parsing `text`. A node already carrying `ast` is left untouched, so this is
// idempotent. Deliberately a narrow structural check (a bare `text` string,
// no `ast` yet) rather than tracking which field name means "Expression" per
// Definition kind -- no other object in a package's JSON is shaped this way.
export function hydrateExpressions(node, parseExpression) {
  if (Array.isArray(node)) {
    return node.map((item) => hydrateExpressions(item, parseExpression))
  }

  if (node !== null && typeof node === 'object') {
    if (typeof node.text === 'string' && node.ast === undefined) {
      const result = parseExpression(node.text)
      if (!result.ok) {
        throw new PublishAbortError(
          `Failed to parse expression "${node.text}": ${JSON.stringify(result.diagnostics)}`
        )
      }
      return { text: node.text, ast: result.ast }
    }

    const out = {}
    for (const [key, value] of Object.entries(node)) {
      out[key] = hydrateExpressions(value, parseExpression)
    }
    return out
  }

  return node
}

function formatIssues(issues) {
  return issues
    .map((issue) => `  [${issue.severity}] ${issue.code}: ${issue.message}${issue.definitionId ? ` (${issue.definitionId})` : ''}`)
    .join('\n')
}

// Loads, hydrates, and validates -- everything short of deciding whether to
// publish. Exposed separately so a test can assert "this package validates"
// without exercising Directus I/O at all.
export function loadAndValidatePackage(packageDir, deps) {
  const source = loadPackageSource(packageDir)
  const manifest = hydrateExpressions(source.manifest, deps.parseExpression)
  const definitions = hydrateExpressions(source.definitions, deps.parseExpression)
  const validation = deps.validatePackage(manifest, definitions)
  return { manifest, definitions, validation }
}

// Builds the exact rules_packages row this publish will insert. `status` is
// forced to 'published' regardless of what the source manifest says (both
// authored packages declare 'draft'): this script is the sole authority on
// what published means, and no manifest's own status field is read as a
// decision. Integrity is computed over the hydrated definitions, so the hash
// covers the ASTs that will actually be evaluated -- not the pre-parse text.
export function buildPublishRow(manifest, definitions, deps) {
  const integrityHash = deps.computeIntegrityHash(definitions)
  const publishedManifest = { ...manifest, status: 'published', integrity: integrityHash }

  return {
    package_id: publishedManifest.packageId,
    version: publishedManifest.version,
    status: 'published',
    engine_api_version: publishedManifest.engineApiVersion,
    state_schema_version: publishedManifest.stateSchemaVersion,
    title: publishedManifest.title,
    integrity_hash: integrityHash,
    license_id: publishedManifest.license?.id ?? null,
    created_at: new Date().toISOString(),
    manifest: publishedManifest,
    definitions,
    validation_issues: null
  }
}

async function findExistingPublishedRow(packageId, version, dx) {
  const res = await dx(`/items/${COLLECTION}`, {
    method: 'GET',
    query: {
      filter: {
        _and: [
          { package_id: { _eq: packageId } },
          { version: { _eq: version } },
          { status: { _eq: 'published' } }
        ]
      },
      limit: 1,
      fields: 'id,package_id,version,status'
    }
  })

  const rows = Array.isArray(res?.data) ? res.data : []
  return rows[0] ?? null
}

// The one public orchestration entry point: load, validate (abort on error),
// refuse a duplicate published version (abort, never overwrite), insert
// exactly one published row.
//
// VERSIONING lives entirely in this refusal. A published (package_id,
// version) is immutable, so republishing changed content under the same
// version is not "an update" -- it would silently invalidate the integrity
// witness every world that pinned that version already stored. Shipping a
// change therefore means bumping `version` in manifest.json, which inserts a
// sibling row and leaves every existing pin untouched. The abort message says
// so, because the author who hits it is exactly the person who needs to know.
//
// `dx(path, options)` is the caller's Directus request function -- `main()`
// supplies a real one; tests supply a fake and assert on what it received.
export async function publishRulesPackage({ packageDir = STARTER_PACKAGE_DIR, dx, deps }) {
  const { manifest, definitions, validation } = loadAndValidatePackage(packageDir, deps)

  if (!validation.ok) {
    throw new PublishAbortError(`Package validation failed:\n${formatIssues(validation.issues)}`)
  }

  const existing = await findExistingPublishedRow(manifest.packageId, manifest.version, dx)
  if (existing) {
    throw new PublishAbortError(
      `rules_packages already has a published row for ${manifest.packageId}@${manifest.version} (id=${existing.id}) -- refusing to overwrite.\n` +
      `Published releases are immutable. To ship a change, bump "version" in ${path.join(packageDir, 'manifest.json')} and publish again; ` +
      `the new version is inserted alongside this one, and worlds pinned to ${manifest.version} keep running it until they activate the new one.`
    )
  }

  const row = buildPublishRow(manifest, definitions, deps)
  const created = await dx(`/items/${COLLECTION}`, {
    method: 'POST',
    body: JSON.stringify(row)
  })

  return { row, created, issues: validation.issues }
}

// ---------------------------------------------------------------------------
// Real Directus I/O + real engine module loading -- used only by main()
// ---------------------------------------------------------------------------

const DIRECTUS_URL =
  process.env.DIRECTUS_URL ||
  process.env.NUXT_PUBLIC_DIRECTUS_URL ||
  'https://directus.theledouxs.com'

const DIRECTUS_TOKEN =
  process.env.DIRECTUS_SCHEMA_TOKEN ||
  process.env.DIRECTUS_TOKEN ||
  process.env.NUXT_DIRECTUS_TOKEN ||
  process.env.NITRO_DIRECTUS_TOKEN ||
  ''

export async function dx(requestPath, options = {}) {
  const url = new URL(`${DIRECTUS_URL.replace(/\/$/, '')}${requestPath}`)

  if (options.query) {
    url.searchParams.set('filter', JSON.stringify(options.query.filter ?? {}))
    if (options.query.limit !== undefined) url.searchParams.set('limit', String(options.query.limit))
    if (options.query.fields !== undefined) url.searchParams.set('fields', String(options.query.fields))
  }

  const res = await fetch(url, {
    method: options.method || 'GET',
    body: options.body,
    headers: {
      Authorization: `Bearer ${DIRECTUS_TOKEN}`,
      'Content-Type': 'application/json'
    }
  })

  const text = await res.text()
  let json = null
  try {
    json = text ? JSON.parse(text) : null
  } catch {
    json = text
  }

  if (!res.ok) {
    const message = typeof json === 'string' ? json : JSON.stringify(json)
    throw new Error(`${res.status} ${res.statusText}: ${message}`)
  }

  return json
}

export async function loadRealDeps() {
  const { createJiti } = await import('jiti')
  const jiti = createJiti(import.meta.url, { interopDefault: true })

  const { parseExpression } = await jiti.import(path.join(repoRoot, 'app/lib/rules/parser.ts'))
  const { validatePackage } = await jiti.import(path.join(repoRoot, 'app/lib/rules/package-validation.ts'))
  const { computeIntegrityHash } = await jiti.import(path.join(repoRoot, 'server/utils/rules-packages.ts'))

  return { parseExpression, validatePackage, computeIntegrityHash }
}

const USAGE = `Usage:
  node scripts/directus/publish-rules-package.mjs <package>
  node scripts/directus/publish-rules-package.mjs --list

<package> may be a directory name, a packageId, or a path.`

// Shared by this script's main() and the starter wrapper's, so both report a
// publish identically. Kept separate from publishRulesPackage so that
// function stays free of console output and process concerns.
export async function runPublish(packageDir) {
  if (!DIRECTUS_TOKEN) {
    throw new PublishAbortError('Missing Directus token for package publishing.')
  }

  const deps = await loadRealDeps()
  const { row, created, issues } = await publishRulesPackage({ packageDir, dx, deps })

  if (issues.length > 0) {
    console.log(`Validation passed with ${issues.length} warning(s):\n${formatIssues(issues)}`)
  }

  console.log(`Published ${row.package_id}@${row.version} (integrity ${row.integrity_hash}) as rules_packages id=${created?.data?.id ?? '?'}`)
  console.log('It is now selectable in Game Admin -> Rules -> Activation for any world.')

  return { row, created, issues }
}

async function main() {
  const arg = process.argv[2]

  if (arg === '--list' || arg === '-l') {
    console.log(`Authored packages:\n${formatAuthoredPackages(listAuthoredPackages())}`)
    return
  }

  if (arg === '--help' || arg === '-h') {
    console.log(`${USAGE}\n\nAuthored packages:\n${formatAuthoredPackages(listAuthoredPackages())}`)
    return
  }

  await runPublish(resolvePackageDir(arg))
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(error?.message || String(error))
    process.exit(1)
  })
}
