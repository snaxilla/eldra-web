// Eldra Package Sync -- Developer Tooling Phase 1. Replaces the manual
// "publish Rules Package -> activate -> refresh Content Pack -> bind ->
// verify" workflow with one command.
//
//   pnpm run packages:sync -- --world Solaris              (dry run, default)
//   pnpm run packages:sync -- --world Solaris --apply       (execute the plan)
//
// See scripts/directus/packages-sync-core.mjs for the pure classification/
// planning logic (unit-tested independently) and
// scripts/directus/lib/runtime-shim.mjs for why and how this standalone
// script calls the REAL, unmodified server/utils/*.ts functions
// (refreshContentSource, publishContentSourceSelection,
// activateWorldRulesPackage, bindContentPackToWorld, getWorldRuntime,
// getWorldContentCatalogue) rather than reimplementing their orchestration.
//
// ---------------------------------------------------------------------------
// ENVIRONMENT LOADING
// ---------------------------------------------------------------------------
// Uses `process.loadEnvFile()` -- native Node, no dependency -- to load the
// repository-root `.env` (the approved local secret source; see this
// task's own ENVIRONMENT LOADING section). This is the ONE thing Nuxt
// already does automatically for `pnpm dev`/`pnpm build` that a standalone
// script does not get for free; every OTHER scripts/directus/*.mjs file
// before this one required the invoking shell to already have the
// variables exported. Missing gracefully (no .env present) is not an
// error here -- the shell may already have the variables exported, exactly
// like every prior script.
//
// ---------------------------------------------------------------------------
// SECURITY -- TOKEN PRIORITY
// ---------------------------------------------------------------------------
// This file's own `dx()` (below) reads ONLY `process.env.DIRECTUS_TOKEN`,
// never DIRECTUS_SCHEMA_TOKEN. This is deliberately a SEPARATE function
// from publish-rules-package.mjs's own exported `dx` -- that file's
// DIRECTUS_TOKEN constant prefers `DIRECTUS_SCHEMA_TOKEN` first
// (`process.env.DIRECTUS_SCHEMA_TOKEN || process.env.DIRECTUS_TOKEN || ...`,
// its own design decision, unrelated to this task and left unchanged),
// which is exactly the preference this task's own requirement forbids
// ("the new sync tool must NOT prefer it"). `publishRulesPackage` (reused
// below for PUBLISH_RULES, unmodified) accepts `dx` as an explicit
// parameter for precisely this reason -- this file always passes ITS OWN
// `dx`, never that file's default, so the canonical publisher is reused
// without inheriting its token-priority behavior. server/utils/directus.ts's
// directusServiceRequest (used by every OTHER real module this tool loads
// through the runtime shim) already reads only DIRECTUS_TOKEN natively --
// confirmed by the prior security audit. The token's value is never
// logged, never included in the report, and never written to any file
// this tool produces.

import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createJiti } from 'jiti'

import { installNuxtRuntimeShim } from './lib/runtime-shim.mjs'
import {
  buildPlan,
  classifyContentState,
  classifyRulesState,
  findDanglingRulesFacetReferences,
  formatReport,
  resolveWorldSelector
} from './packages-sync-core.mjs'
import { loadAndValidatePackage, loadRealDeps, publishRulesPackage, resolvePackageDir } from './publish-rules-package.mjs'

const scriptDir = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(scriptDir, '..', '..')

// This tool's OWN Directus URL/token resolution -- DIRECTUS_TOKEN only,
// never DIRECTUS_SCHEMA_TOKEN. See this file's own SECURITY -- TOKEN
// PRIORITY header above.
function directusUrl() {
  return (process.env.DIRECTUS_URL || 'https://directus.theledouxs.com').replace(/\/$/, '')
}

// Same shape as publish-rules-package.mjs's own `dx()` (filter/limit/fields
// query building, Bearer auth, JSON parse, throw on non-ok) -- duplicated
// rather than imported specifically so this tool's token resolution never
// depends on that file's DIRECTUS_SCHEMA_TOKEN-preferring constant.
async function dx(requestPath, options = {}) {
  const url = new URL(`${directusUrl()}${requestPath}`)

  if (options.query) {
    if (options.query.filter !== undefined) url.searchParams.set('filter', JSON.stringify(options.query.filter))
    if (options.query.limit !== undefined) url.searchParams.set('limit', String(options.query.limit))
    if (options.query.fields !== undefined) url.searchParams.set('fields', String(options.query.fields))
  }

  const res = await fetch(url, {
    method: options.method || 'GET',
    body: options.body,
    headers: {
      Authorization: `Bearer ${process.env.DIRECTUS_TOKEN || ''}`,
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

// ---------------------------------------------------------------------------
// CLI argument parsing
// ---------------------------------------------------------------------------

export function parseArgs(argv) {
  const args = { world: null, apply: false }
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (arg === '--world') {
      args.world = argv[++i] ?? null
    } else if (arg.startsWith('--world=')) {
      args.world = arg.slice('--world='.length)
    } else if (arg === '--apply') {
      args.apply = true
    }
  }
  return args
}

// ---------------------------------------------------------------------------
// Real module loading -- the ONLY place jiti + the runtime shim are used.
// Everything returned here is the REAL, unmodified server/utils/*.ts (or
// app/lib/**) export -- never a reimplementation.
// ---------------------------------------------------------------------------

async function loadRealModules() {
  installNuxtRuntimeShim()
  const jiti = createJiti(import.meta.url, { interopDefault: true })

  const [
    rulesPackages,
    worldRulesConfig,
    worldRulesActivation,
    worldRuntimeService,
    contentPacks,
    worldContentPacks,
    worldContentPackBinding,
    worldContentCatalogue,
    contentSourcesIndex,
    contentSourceRefresh,
    compilationFingerprint,
    registry
  ] = await Promise.all([
    jiti.import(path.join(repoRoot, 'server/utils/rules-packages.ts')),
    jiti.import(path.join(repoRoot, 'server/utils/world-rules-config.ts')),
    jiti.import(path.join(repoRoot, 'server/utils/world-rules-activation.ts')),
    jiti.import(path.join(repoRoot, 'server/utils/world-runtime-service.ts')),
    jiti.import(path.join(repoRoot, 'server/utils/content-packs.ts')),
    jiti.import(path.join(repoRoot, 'server/utils/world-content-packs.ts')),
    jiti.import(path.join(repoRoot, 'server/utils/world-content-pack-binding.ts')),
    jiti.import(path.join(repoRoot, 'server/utils/world-content-catalogue.ts')),
    jiti.import(path.join(repoRoot, 'server/utils/content-sources/index.ts')),
    jiti.import(path.join(repoRoot, 'server/utils/content-sources/refresh.ts')),
    jiti.import(path.join(repoRoot, 'server/utils/content-sources/compilation-fingerprint.ts')),
    jiti.import(path.join(repoRoot, 'app/lib/content-sources/registry.ts'))
  ])

  return {
    rulesPackages,
    worldRulesConfig,
    worldRulesActivation,
    worldRuntimeService,
    contentPacks,
    worldContentPacks,
    worldContentPackBinding,
    worldContentCatalogue,
    contentSourcesIndex,
    contentSourceRefresh,
    compilationFingerprint,
    registry
  }
}

// Worlds are read with this file's own `dx()` (GET-only here) -- the
// `worlds` collection has no server/utils/*.ts reader at all in this
// codebase (every route reads `/items/worlds` inline), so there is no
// existing function to reuse.
async function fetchWorlds() {
  const res = await dx('/items/worlds', {
    method: 'GET',
    query: { fields: 'id,name', limit: -1 }
  })
  const rows = Array.isArray(res?.data) ? res.data : []
  return rows.map((row) => ({ id: row.id, name: String(row.name ?? '') }))
}

// ---------------------------------------------------------------------------
// State discovery -- RULES SOURCE STATE
// ---------------------------------------------------------------------------

const RULES_SOURCE_PACKAGE_DIR = 'eldra-dnd5e-2024'

async function discoverRulesState(modules, worldId) {
  const deps = await loadRealDeps() // parseExpression, validatePackage, computeIntegrityHash -- real engine functions, jiti-loaded exactly as publish-rules-package.mjs's own main() already does.
  const packageDir = resolvePackageDir(RULES_SOURCE_PACKAGE_DIR)
  const { manifest, definitions, validation } = loadAndValidatePackage(packageDir, deps)

  const authored = validation.ok
    ? {
        packageId: manifest.packageId,
        version: manifest.version,
        // Hashed over the SAME hydrated (Expression-parsed) definitions
        // buildPublishRow would hash on an actual publish -- loadAndValidatePackage
        // already returns them hydrated, so this is exactly the integrity
        // value a real publish of this exact source would produce.
        integrityHash: deps.computeIntegrityHash(definitions),
        validationOk: true,
        validationIssues: validation.issues
      }
    : { packageId: manifest?.packageId, version: manifest?.version, validationOk: false, validationIssues: validation.issues }

  const publishedVersions = await modules.rulesPackages.listPublishedRulesPackages().then((rows) =>
    rows.filter((row) => row.packageId === authored.packageId)
  )
  // listPublishedRulesPackages does not return integrity_hash -- fetch it
  // directly for each matching version via loadPublishedPackage (real,
  // integrity-verifying loader).
  const publishedWithIntegrity = []
  for (const row of publishedVersions) {
    const loaded = await modules.rulesPackages.loadPublishedPackage(row.packageId, row.version)
    if (loaded.ok) {
      publishedWithIntegrity.push({ version: row.version, integrityHash: loaded.package.integrityHash })
    }
  }

  const storedConfig = await modules.worldRulesConfig.loadWorldRulesConfig(worldId)
  const active = storedConfig
    ? { packageId: storedConfig.activePackageId, version: storedConfig.activePackageVersion, integrityHash: storedConfig.activePackageIntegrity }
    : null

  return classifyRulesState({ authored, publishedVersions: publishedWithIntegrity, active })
}

// ---------------------------------------------------------------------------
// State discovery -- CONTENT SOURCE STATE
// ---------------------------------------------------------------------------

async function discoverContentStates(modules, worldId) {
  const bindings = await modules.worldContentPacks.listContentPackBindingsForWorld(worldId)
  const publishedPacks = await modules.contentPacks.listPublishedContentPacks()
  const providers = modules.contentSourcesIndex.listProviders()

  const results = []

  // One entry per registered provider that has EVER been published for
  // (matched via origin.sourceId, exactly like the Refresh panel's fixed
  // matching logic) -- not one per binding, so a World that is missing a
  // binding entirely for an otherwise-published Content Source still
  // surfaces as BIND_REQUIRED rather than being silently skipped.
  for (const provider of providers) {
    const collection = modules.registry.getSourceCollection(provider.gameSystemKey, provider.collectionKey)
    if (!collection) continue

    const candidatesForSource = publishedPacks.filter((pack) => pack.origin?.sourceId === provider.collectionKey)
    const latestPublished = candidatesForSource.reduce((latest, pack) => {
      if (!latest) return pack
      return compareVersionsLocal(pack.version, latest.version) > 0 ? pack : latest
    }, null)

    if (!latestPublished) continue // never published -- nothing to sync yet, not this World's problem to create

    const binding = bindings.find((b) => b.packageId === latestPublished.packageId)

    // Load the latest published pack's FULL row (content + manifest) so we
    // can read its stored compilerFingerprint and regenerate against the
    // exact same externalId selection it contains -- mirrors refreshContentSource's
    // own "keep whatever was already selected" rule (refresh.ts).
    const loaded = await modules.contentPacks.loadPublishedContentPack(latestPublished.packageId, latestPublished.version)
    if (!loaded.ok) {
      results.push({ sourceKey: provider.collectionKey, label: collection.label, classification: { status: 'ERROR', reason: `latest published pack failed to load: ${loaded.stage}` } })
      continue
    }

    const previousExternalIds = new Set((loaded.package.content ?? []).map((entry) => entry.externalId))
    const regeneratedCandidates = []
    for (const category of provider.categories) {
      const { candidates } = await provider.loadCategory(category.key)
      for (const candidate of candidates) {
        if (previousExternalIds.has(candidate.externalId)) regeneratedCandidates.push(candidate)
      }
    }

    const regenerated = {
      integrityHash: modules.contentPacks.computeContentIntegrityHash(regeneratedCandidates),
      compilerFingerprint: modules.compilationFingerprint.computeContentCompilationFingerprint({ vocabulary: provider.vocabulary })
    }

    const boundInfo = binding ? { packageId: binding.packageId, version: binding.packageVersion, integrityHash: binding.packageIntegrity } : null
    const latestInfo = {
      packageId: latestPublished.packageId,
      version: latestPublished.version,
      integrityHash: loaded.package.integrityHash,
      compilerFingerprint: loaded.package.manifest?.origin?.compilerFingerprint
    }

    const classification = classifyContentState({ bound: boundInfo, latestPublished: latestInfo, regenerated })
    results.push({ sourceKey: provider.collectionKey, label: collection.label, classification, provider, collection, regeneratedCandidates })
  }

  return results
}

function compareVersionsLocal(a, b) {
  const pa = /^(\d+)\.(\d+)\.(\d+)/.exec(a)
  const pb = /^(\d+)\.(\d+)\.(\d+)/.exec(b)
  if (!pa || !pb) return String(a).localeCompare(String(b))
  for (let i = 1; i <= 3; i++) {
    const diff = Number(pa[i]) - Number(pb[i])
    if (diff !== 0) return diff
  }
  return 0
}

// ---------------------------------------------------------------------------
// Preflight -- DANGLING REFERENCE VALIDATION against the PROPOSED final state
// ---------------------------------------------------------------------------

async function runPreflight({ modules, worldId, rulesClassification, contentResults }) {
  const problems = []

  if (rulesClassification.status === 'ERROR') problems.push(`Rules: ${rulesClassification.reason}`)
  if (rulesClassification.status === 'SOURCE_VERSION_COLLISION') problems.push(`Rules: SOURCE_VERSION_COLLISION -- ${rulesClassification.instruction}`)
  for (const content of contentResults) {
    if (content.classification.status === 'ERROR') problems.push(`Content (${content.label}): ${content.classification.reason}`)
  }
  if (problems.length) return { ok: false, problems }

  // Proposed final Definition id set: authored definitions if publishing,
  // otherwise whatever is currently published+active.
  let definitionIds
  if (rulesClassification.status === 'PUBLISH_REQUIRED' || rulesClassification.status === 'ACTIVATION_REQUIRED') {
    const deps = await loadRealDeps()
    const packageDir = resolvePackageDir(RULES_SOURCE_PACKAGE_DIR)
    const { definitions } = loadAndValidatePackage(packageDir, deps)
    definitionIds = new Set(definitions.map((d) => d.id))
  } else {
    const loaded = await modules.rulesPackages.loadPublishedPackage(rulesClassification.packageId, rulesClassification.version)
    definitionIds = loaded.ok ? new Set(loaded.package.definitions.map((d) => d.id)) : new Set()
  }

  // Proposed final catalogue entries: regenerated candidates for any
  // Content Source that will be refreshed/bound; otherwise skip (already
  // published+bound content is validated by definition, since it was
  // already running).
  const catalogueEntries = []
  for (const content of contentResults) {
    if (content.classification.status === 'REFRESH_REQUIRED' && content.regeneratedCandidates) {
      catalogueEntries.push(...content.regeneratedCandidates)
    }
  }

  const dangling = findDanglingRulesFacetReferences(catalogueEntries, definitionIds)
  if (dangling.length) {
    return {
      ok: false,
      problems: dangling.map((d) => `Dangling reference: ${d.entityType}/${d.slug} facet.${d.field} -> ${d.referencedId} (not in proposed Rules registry)`)
    }
  }

  return { ok: true, problems: [] }
}

// ---------------------------------------------------------------------------
// Apply -- dependency-ordered execution + post-apply verification
// ---------------------------------------------------------------------------

async function executeApply({ modules, world, rulesClassification, contentResults, plan }) {
  const completed = []
  const worldId = world.id

  try {
    for (const action of plan) {
      if (action.kind === 'PUBLISH_RULES') {
        const deps = await loadRealDeps()
        const packageDir = resolvePackageDir(RULES_SOURCE_PACKAGE_DIR)
        // The canonical publisher itself -- scripts/directus/publish-rules-package.mjs's
        // own publishRulesPackage, unmodified. Satisfies WORKFLOWS #3's
        // "using the existing canonical publisher" literally.
        await publishRulesPackage({ packageDir, dx, deps })
        completed.push(action)
      } else if (action.kind === 'REFRESH_CONTENT') {
        const content = contentResults.find((c) => c.sourceKey === action.sourceKey)
        const outcome = await modules.contentSourceRefresh.refreshContentSource({
          provider: content.provider,
          collection: content.collection,
          packageId: action.packageId
        })
        if (!outcome.refreshed) throw new Error(`REFRESH_CONTENT failed for ${action.sourceKey}: ${outcome.stage}`)
        completed.push({ ...action, version: outcome.version })
      } else if (action.kind === 'ACTIVATE_RULES') {
        const result = await modules.worldRulesActivation.activateWorldRulesPackage(worldId, action.packageId, action.version)
        if (!result.activated) throw new Error(`ACTIVATE_RULES failed: ${result.failure.stage}`)
        completed.push(action)
      } else if (action.kind === 'BIND_CONTENT') {
        const content = contentResults.find((c) => c.sourceKey === action.sourceKey)
        const version = content.classification.version
        const result = await modules.worldContentPackBinding.bindContentPackToWorld(worldId, action.packageId, version)
        if (!result.bound) throw new Error(`BIND_CONTENT failed for ${action.sourceKey}: ${result.failure.stage}`)
        completed.push({ ...action, version })
      }
    }
  } catch (error) {
    return { ok: false, completed, failedAt: plan[completed.length]?.kind ?? 'unknown', error: error.message, notAttempted: plan.slice(completed.length + 1) }
  }

  return { ok: true, completed, notAttempted: [] }
}

async function verifyPostApply({ modules, world, rulesClassification, contentResults }) {
  const failures = []

  const runtime = await modules.worldRuntimeService.getWorldRuntime(world.id)
  if (!runtime.configured || !runtime.ok) {
    failures.push('RUNTIME: getWorldRuntime did not resolve an active Rules registry')
  }

  const catalogue = await modules.worldContentCatalogue.getWorldContentCatalogue(world.id)
  if (runtime.ok) {
    const definitionIds = new Set(runtime.runtime.registry.listAll().map((d) => d.id))
    const allEntries = [...catalogue.species, ...catalogue.classes, ...catalogue.backgrounds]
    const dangling = findDanglingRulesFacetReferences(allEntries, definitionIds)
    if (dangling.length) {
      failures.push(`REFERENCE INTEGRITY: ${dangling.length} catalogue RulesFacet reference(s) do not resolve against the active Rules registry`)
    }
  }

  return { ok: failures.length === 0, failures }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const args = parseArgs(process.argv.slice(2))

  try {
    process.loadEnvFile(path.join(repoRoot, '.env'))
  } catch {
    // No .env on disk -- fine, the shell may already export the variables
    // (matches every other scripts/directus/*.mjs script's posture).
  }

  if (!process.env.DIRECTUS_TOKEN) {
    console.error('Missing DIRECTUS_TOKEN in the environment. Set it in the repository-root .env or export it in this shell.')
    process.exit(1)
  }

  if (!args.world) {
    console.error('Usage: pnpm run packages:sync -- --world <name-or-id> [--apply]')
    process.exit(1)
  }

  const worlds = await fetchWorlds()
  const worldResult = resolveWorldSelector(worlds, args.world)

  if (worldResult.status === 'not-found') {
    console.error(`No World found matching '${args.world}'.`)
    process.exit(1)
  }
  if (worldResult.status === 'ambiguous') {
    console.error(`'${args.world}' matches multiple Worlds (ids: ${worldResult.matches.map((w) => w.id).join(', ')}). Re-run with --world <id>.`)
    process.exit(1)
  }

  const world = worldResult.world
  const modules = await loadRealModules()

  const rulesClassification = await discoverRulesState(modules, world.id)
  const contentResults = await discoverContentStates(modules, world.id)
  const plan = buildPlan({ rulesClassification, contentClassifications: contentResults })

  console.log(formatReport({
    worldName: world.name,
    worldId: world.id,
    rulesClassification,
    contentClassifications: contentResults,
    plan,
    mode: args.apply ? 'apply' : 'dry-run'
  }))

  if (rulesClassification.status === 'SOURCE_VERSION_COLLISION') {
    console.error('\nSTOP: SOURCE_VERSION_COLLISION -- resolve by bumping the authored manifest version. No mutation performed.')
    process.exit(1)
  }
  if (rulesClassification.status === 'ERROR' || contentResults.some((c) => c.classification.status === 'ERROR')) {
    console.error('\nSTOP: one or more axes reported ERROR. No mutation performed.')
    process.exit(1)
  }

  if (!args.apply) {
    return // dry run ends here -- zero Directus writes above this line.
  }

  if (plan.length === 0) {
    console.log('\nNothing to apply -- already current. Zero Directus writes performed.')
    return
  }

  console.log('\nPREFLIGHT')
  const preflight = await runPreflight({ modules, worldId: world.id, rulesClassification, contentResults })
  if (!preflight.ok) {
    console.error('PREFLIGHT FAILED. Zero mutations performed.')
    for (const problem of preflight.problems) console.error(`  - ${problem}`)
    process.exit(1)
  }
  console.log('  OK -- no dangling RulesFacet references in the proposed final state.')

  console.log('\nAPPLYING PLAN')
  const applyResult = await executeApply({ modules, world, rulesClassification, contentResults, plan })

  if (!applyResult.ok) {
    console.error(`\nPARTIAL FAILURE. Completed: ${applyResult.completed.map((a) => a.kind).join(', ') || '(none)'}`)
    console.error(`Failed at: ${applyResult.failedAt} -- ${applyResult.error}`)
    console.error(`Not attempted: ${applyResult.notAttempted.map((a) => a.kind).join(', ') || '(none)'}`)
    console.error('Immutable published artifacts (if any completed) are NOT rolled back. Activation/binding are retry-safe -- re-running this command will resume from the current real state.')
    process.exit(1)
  }

  console.log(`  Completed: ${applyResult.completed.map((a) => a.kind).join(', ')}`)

  console.log('\nPOST-APPLY VERIFICATION')
  const verification = await verifyPostApply({ modules, world, rulesClassification, contentResults })
  if (!verification.ok) {
    console.error('VERIFICATION FAILED:')
    for (const failure of verification.failures) console.error(`  - ${failure}`)
    process.exit(1)
  }
  console.log('  OK -- runtime resolves, catalogue resolves, no dangling references.')
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(error?.message || String(error))
    process.exit(1)
  })
}
