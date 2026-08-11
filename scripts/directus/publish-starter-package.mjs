// Publishes Eldra's first real Rules Package (packages/eldra-generic-d20)
// into the global `rules_packages` collection. See
// .github/docs/architecture/rules-package-infrastructure.md §7 (Infra 4)
// and Q3 ("V1 only ever writes published").
//
// Responsibilities, exactly: load package JSON, run it through the real
// validatePackage() pipeline, abort on any validation error, compute
// integrity over canonicalized definitions, and insert exactly one
// status:'published' row. No draft rows, no update/import workflow -- a
// duplicate published (package_id, version) is refused, never silently
// overwritten (see publishStarterPackage below).
//
// ---------------------------------------------------------------------------
// DESIGN DECISIONS
// ---------------------------------------------------------------------------
// 1. This script is plain Node ESM (like every other scripts/directus/*.mjs
//    file) and does its OWN Directus I/O with a local `dx()` fetch helper,
//    not `directusServiceRequest` (server/utils/directus.ts) -- that helper
//    calls `useRuntimeConfig()`, a Nuxt-injected global that does not exist
//    outside a running Nuxt/Nitro process. Every existing schema script in
//    this directory already made this same choice for the same reason.
//
// 2. `validatePackage`/`parseExpression`/`computeIntegrityHash` ARE reused
//    from the real engine -- this script must not reimplement validation or
//    hashing. Since those live in TypeScript (app/lib/rules/, server/utils/)
//    and this script runs via plain `node`, it loads them on demand via
//    `jiti` (already present in node_modules -- Nitro/Nuxt use it
//    internally for the same purpose -- and declared explicitly in
//    package.json devDependencies by this commit so the dependency is not
//    an unlisted accident of the current dependency tree). Only `main()`
//    (the real-Directus, real-jiti path) does this; `publishStarterPackage`
//    itself takes `deps` as a parameter precisely so tests can inject the
//    same real functions via a normal TypeScript import instead (see
//    tests/scripts/publish-starter-package.test.ts).
//
// 3. Package content on disk (manifest.json/definitions.json) authors
//    Expressions as `{ "text": "..." }` only -- no hand-written AST. This
//    script hydrates every such node into `{ text, ast }` by calling the
//    real parser before validation ever runs, exactly what a human package
//    author would expect ("write formulas as text").
//
// 4. Failure model: validation errors abort (no row written); a duplicate
//    *published* (package_id, version) aborts (no silent overwrite, no
//    update); nothing here ever issues a PATCH/DELETE against
//    rules_packages -- insert-only, matching "immutable published releases"
//    (rules-package-infrastructure.md §4.1).

import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const scriptDir = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(scriptDir, '..', '..')

export const DEFAULT_PACKAGE_DIR = path.join(repoRoot, 'packages', 'eldra-generic-d20')

const COLLECTION = 'rules_packages'

// ---------------------------------------------------------------------------
// Package loading (pure, no I/O beyond reading the two source files)
// ---------------------------------------------------------------------------

export function loadPackageSource(packageDir = DEFAULT_PACKAGE_DIR) {
  const manifest = JSON.parse(readFileSync(path.join(packageDir, 'manifest.json'), 'utf8'))
  const definitions = JSON.parse(readFileSync(path.join(packageDir, 'definitions.json'), 'utf8'))
  return { manifest, definitions }
}

// Recursively replaces every `{ text: "..." }` node with `{ text, ast }` by
// parsing `text`. A node already carrying `ast` is left untouched (so this
// function is idempotent). This is the only place this script decides what
// "looks like an Expression" -- deliberately a narrow structural check
// (a bare `text` string property, no `ast` yet) rather than tracking which
// field name means "this is an Expression" per Definition kind, since the
// package's own JSON never has any other object shaped this way.
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

export class PublishAbortError extends Error {}

function formatIssues(issues) {
  return issues
    .map((issue) => `  [${issue.severity}] ${issue.code}: ${issue.message}${issue.definitionId ? ` (${issue.definitionId})` : ''}`)
    .join('\n')
}

// Loads, hydrates, and validates the package -- everything short of
// deciding whether to publish it. Exposed separately so a test can assert
// "the package validates" without also exercising Directus I/O.
export function loadAndValidatePackage(packageDir, deps) {
  const source = loadPackageSource(packageDir)
  const manifest = hydrateExpressions(source.manifest, deps.parseExpression)
  const definitions = hydrateExpressions(source.definitions, deps.parseExpression)
  const validation = deps.validatePackage(manifest, definitions)
  return { manifest, definitions, validation }
}

// Builds the exact rules_packages row this publish, and only this publish,
// will insert. `status` is forced to 'published' here regardless of what
// the source manifest.json says (it is authored as 'draft' -- see that
// file -- since this script is the sole authority for what "published"
// means; nothing reads manifest.json's own status field as a decision).
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

// The one public orchestration entry point: load, validate (abort on
// error), refuse a duplicate published version (abort, never overwrite),
// insert exactly one published row. `dx(path, options)` is the caller's
// Directus request function -- `main()` below supplies a real one; tests
// supply a fake one and assert against what it was called with.
export async function publishStarterPackage({ packageDir = DEFAULT_PACKAGE_DIR, dx, deps }) {
  const { manifest, definitions, validation } = loadAndValidatePackage(packageDir, deps)

  if (!validation.ok) {
    throw new PublishAbortError(`Package validation failed:\n${formatIssues(validation.issues)}`)
  }

  const existing = await findExistingPublishedRow(manifest.packageId, manifest.version, dx)
  if (existing) {
    throw new PublishAbortError(
      `rules_packages already has a published row for ${manifest.packageId}@${manifest.version} (id=${existing.id}) -- refusing to overwrite`
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
// Real Directus I/O + real engine module loading -- used only by main(),
// never by publishStarterPackage()'s own logic above.
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

async function dx(requestPath, options = {}) {
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

async function loadRealDeps() {
  const { createJiti } = await import('jiti')
  const jiti = createJiti(import.meta.url, { interopDefault: true })

  const { parseExpression } = await jiti.import(path.join(repoRoot, 'app/lib/rules/parser.ts'))
  const { validatePackage } = await jiti.import(path.join(repoRoot, 'app/lib/rules/package-validation.ts'))
  const { computeIntegrityHash } = await jiti.import(path.join(repoRoot, 'server/utils/rules-packages.ts'))

  return { parseExpression, validatePackage, computeIntegrityHash }
}

async function main() {
  if (!DIRECTUS_TOKEN) {
    throw new PublishAbortError('Missing Directus token for package publishing.')
  }

  const deps = await loadRealDeps()
  const { row, created, issues } = await publishStarterPackage({ dx, deps })

  if (issues.length > 0) {
    console.log(`Validation passed with ${issues.length} warning(s):\n${formatIssues(issues)}`)
  }

  console.log(`Published ${row.package_id}@${row.version} (integrity ${row.integrity_hash}) as rules_packages id=${created?.data?.id ?? '?'}`)
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(error?.message || String(error))
    process.exit(1)
  })
}
