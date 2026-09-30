// Package Sync -- Developer Tooling Phase 1. Pure orchestration logic:
// World resolution, Rules/Content state classification, dangling-reference
// preflight validation, dependency-ordered plan construction, and report
// formatting. NO Directus I/O lives in this file -- every function here
// takes already-fetched data as plain arguments and returns a plain result,
// exactly the same shape publish-rules-package.mjs's own pure functions
// (buildPublishRow, loadAndValidatePackage) already take. This is what
// makes the whole thing testable without a network call or a fake Directus
// store: see tests/scripts/directus/packages-sync-core.test.ts.
//
// scripts/directus/packages-sync.mjs is the CLI entry point that fetches
// real state (via the real, unmodified server/utils/*.ts functions, loaded
// through the Nuxt runtime shim) and calls into this module to decide what
// it means and what to do about it.
//
// ---------------------------------------------------------------------------
// WHY RULES AND CONTENT ARE TWO INDEPENDENT AXES, NEVER COLLAPSED
// ---------------------------------------------------------------------------
// This exact split -- a Rules Package (mechanics, immutable rules_packages
// rows, activated via world_rules_config) and a Content Pack (gameplay
// content with RulesFacets baked in at compile time, immutable content_packs
// rows, bound via world_content_pack_bindings) -- is what the real Phase 1B
// production incident exposed: activating a new Rules Package version does
// nothing for a Content Pack that was compiled before a RulesFacet gained a
// new reference into that Rules Package, and vice versa. Every function
// below keeps the two classifications, and the two kinds of proposed
// actions, entirely separate; buildPlan is the one place they are ever
// brought into the same ordered list, and only for sequencing.

// ---------------------------------------------------------------------------
// Version comparison -- a small, self-contained major.minor.patch
// comparator. Deliberately duplicated rather than imported: this exact
// comparator already exists independently in rules-packages.ts
// (compareSemVer), content-sources/refresh.ts (compareVersions), and
// (until this task removed it) AdminContentPackBuilderPanel.vue -- three
// near-identical copies already, none exported for reuse, and introducing
// a shared version-compare utility to de-duplicate them is an unrequested
// refactor outside this task's scope.
// ---------------------------------------------------------------------------

function parseVersionTriple(version) {
  const match = /^(\d+)\.(\d+)\.(\d+)/.exec(String(version || ''))
  if (!match) return null
  return [Number(match[1]), Number(match[2]), Number(match[3])]
}

export function compareVersions(a, b) {
  const pa = parseVersionTriple(a)
  const pb = parseVersionTriple(b)
  if (!pa || !pb) return String(a).localeCompare(String(b))
  for (let i = 0; i < 3; i++) {
    if (pa[i] !== pb[i]) return pa[i] - pb[i]
  }
  return 0
}

// ---------------------------------------------------------------------------
// World resolution -- TESTING: WORLD #1-4.
// ---------------------------------------------------------------------------

// `worlds`: [{ id, name }] (id as returned by Directus -- number or string;
// compared as strings so a numeric `--world 4` and a Directus integer id
// both resolve). `selector`: the raw --world argument.
export function resolveWorldSelector(worlds, selector) {
  const raw = String(selector || '').trim()
  if (!raw) {
    return { status: 'not-found', selector: raw }
  }

  const byId = worlds.filter((world) => String(world.id) === raw)
  if (byId.length === 1) {
    return { status: 'resolved', world: byId[0], matchedBy: 'id' }
  }

  const byExactName = worlds.filter((world) => world.name === raw)
  if (byExactName.length === 1) {
    return { status: 'resolved', world: byExactName[0], matchedBy: 'name' }
  }
  if (byExactName.length > 1) {
    return { status: 'ambiguous', selector: raw, matches: byExactName }
  }

  return { status: 'not-found', selector: raw }
}

// ---------------------------------------------------------------------------
// RULES axis classification -- RULES SOURCE STATE / RULES IMMUTABILITY.
// ---------------------------------------------------------------------------

// `authored`: { packageId, version, integrityHash, validationOk, validationIssues }
//   -- from loadAndValidatePackage + computeIntegrityHash on the authored
//   source under packages/.
// `publishedVersions`: [{ version, integrityHash }] -- every published
//   rules_packages row for this exact packageId (any version).
// `active`: { packageId, version, integrityHash } | null -- the World's
//   current world_rules_config, or null if unconfigured.
export function classifyRulesState({ authored, publishedVersions, active }) {
  if (!authored || !authored.validationOk) {
    return {
      status: 'ERROR',
      reason: authored ? 'authored Rules Package failed validation' : 'no authored Rules Package found',
      issues: authored?.validationIssues ?? []
    }
  }

  const matchingVersion = publishedVersions.find((row) => row.version === authored.version)

  if (!matchingVersion) {
    return {
      status: 'PUBLISH_REQUIRED',
      packageId: authored.packageId,
      version: authored.version,
      integrityHash: authored.integrityHash
    }
  }

  if (matchingVersion.integrityHash !== authored.integrityHash) {
    return {
      status: 'SOURCE_VERSION_COLLISION',
      packageId: authored.packageId,
      version: authored.version,
      authoredIntegrityHash: authored.integrityHash,
      publishedIntegrityHash: matchingVersion.integrityHash,
      instruction: `bump "version" in the source manifest.json for ${authored.packageId} -- ${authored.version} is already published with different content`
    }
  }

  const isActive = Boolean(
    active && active.packageId === authored.packageId && active.version === authored.version
  )

  if (isActive) {
    return {
      status: 'CURRENT',
      packageId: authored.packageId,
      version: authored.version,
      integrityHash: authored.integrityHash
    }
  }

  return {
    status: 'ACTIVATION_REQUIRED',
    packageId: authored.packageId,
    version: authored.version,
    integrityHash: authored.integrityHash,
    currentlyActiveVersion: active?.version ?? null
  }
}

// ---------------------------------------------------------------------------
// CONTENT axis classification -- CONTENT SOURCE STATE / CONTENT STALENESS /
// CONTENT COMPILATION FINGERPRINT / CONTENT CLASSIFICATION.
// ---------------------------------------------------------------------------

// `bound`: { packageId, version, integrityHash } | null -- the World's
//   current world_content_pack_bindings row for this Content Source, or
//   null if never bound.
// `latestPublished`: { packageId, version, integrityHash, compilerFingerprint }
//   | null -- the newest published content_packs row whose origin.sourceId
//   matches this Content Source (see contentPackRefreshMatch.ts's fix --
//   matched the same way, on origin, never on a suggested packageId).
// `regenerated`: { integrityHash, compilerFingerprint } -- recompiling
//   TODAY's candidates for the same externalId selection the latest
//   published version contains (mirrors refresh.ts's own "keep whatever was
//   already selected, rebuilt with today's pipeline" rule), through the
//   real, unmodified provider + computeContentIntegrityHash +
//   computeContentCompilationFingerprint.
export function classifyContentState({ bound, latestPublished, regenerated }) {
  if (!latestPublished) {
    return {
      status: 'ERROR',
      reason: 'no published Content Pack exists yet for this Content Source -- an initial publish requires a curated selection, which this tool does not perform automatically'
    }
  }

  if (!regenerated) {
    return { status: 'ERROR', reason: 'could not regenerate candidates to check staleness' }
  }

  // Two independent staleness signals -- see compilation-fingerprint.ts's
  // own header for why both exist and what each one catches.
  const integrityStale = regenerated.integrityHash !== latestPublished.integrityHash
  const fingerprintStale = Boolean(
    latestPublished.compilerFingerprint && regenerated.compilerFingerprint !== latestPublished.compilerFingerprint
  )
  const latestIsStale = integrityStale || fingerprintStale

  if (latestIsStale) {
    return {
      status: 'REFRESH_REQUIRED',
      packageId: latestPublished.packageId,
      staleVersion: latestPublished.version,
      reason: integrityStale
        ? 'regenerating today\'s candidates produces different compiled content than the latest published version (raw source and/or RulesFacet corpus changed)'
        : 'the RulesFacet corpus or compiler version changed since the latest published version, even though its compiled content happens to match today'
    }
  }

  // The latest published version is current relative to today's compilation
  // inputs. Now check whether the World is actually bound to it.
  const boundMatchesLatest = Boolean(
    bound && bound.packageId === latestPublished.packageId && bound.version === latestPublished.version
  )

  if (boundMatchesLatest) {
    return {
      status: 'CURRENT',
      packageId: latestPublished.packageId,
      version: latestPublished.version,
      integrityHash: latestPublished.integrityHash
    }
  }

  return {
    status: 'BIND_REQUIRED',
    packageId: latestPublished.packageId,
    version: latestPublished.version,
    integrityHash: latestPublished.integrityHash,
    currentlyBoundVersion: bound?.version ?? null
  }
}

// ---------------------------------------------------------------------------
// DANGLING REFERENCE VALIDATION -- direct regression guard for the Phase 1B
// incident. TESTING: REFERENCE INTEGRITY #27-29.
// ---------------------------------------------------------------------------

// `catalogueEntries`: [{ entityType, slug, rulesFacet }] -- the PROPOSED
//   final content (either today's regenerated candidates, if refreshing, or
//   the currently-published content, if content is staying CURRENT).
// `definitionIds`: Set<string> -- the PROPOSED final Rules registry's known
//   Definition ids (either the authored source's Definitions, if publishing,
//   or the currently-published package's Definitions, if rules are staying
//   CURRENT).
// Checks facet.progression, facet.grants[].set, facet.choices[].choiceSet,
// facet.choices[].from[], facet.sources[], facet.collectionFields[].collection
// -- every reference kind RulesFacet can carry (app/lib/content-rules/types.ts).
export function findDanglingRulesFacetReferences(catalogueEntries, definitionIds) {
  const dangling = []

  const check = (entry, field, id) => {
    if (id && !definitionIds.has(id)) {
      dangling.push({ entityType: entry.entityType, slug: entry.slug, field, referencedId: id })
    }
  }

  for (const entry of catalogueEntries) {
    const facet = entry.rulesFacet
    if (!facet) continue

    // Character Progression Phase 1C -- `facet.progression` is an array
    // (a content entry may opt into more than one ProgressionDefinition;
    // app/lib/content-rules/types.ts's own doc comment explains why),
    // checked element-by-element. A real regression, caught and fixed
    // during this phase's own production verification: the original
    // one-line `check(entry, 'progression', facet.progression)` passed the
    // WHOLE ARRAY as a single `id` to `definitionIds.has(id)`, which can
    // never match a Set of strings -- producing a false-positive dangling
    // reference for every facet naming a real, resolvable Progression.
    for (const progressionId of facet.progression ?? []) {
      check(entry, 'progression', progressionId)
    }

    for (const grant of facet.grants ?? []) {
      check(entry, 'grants[].set', grant.set)
    }

    for (const choice of facet.choices ?? []) {
      check(entry, 'choices[].choiceSet', choice.choiceSet)
      for (const optionId of choice.from ?? []) {
        check(entry, 'choices[].from[]', optionId)
      }
    }

    for (const sourceId of facet.sources ?? []) {
      check(entry, 'sources[]', sourceId)
    }

    for (const collectionFields of facet.collectionFields ?? []) {
      check(entry, 'collectionFields[].collection', collectionFields.collection)
    }
  }

  return dangling
}

// ---------------------------------------------------------------------------
// PLAN CONSTRUCTION -- DEPENDENCY ORDER.
// ---------------------------------------------------------------------------
//
// Proven ordering, not assumed: PUBLISH_RULES and REFRESH_CONTENT are
// mutually independent (a Content Pack refresh reads local dataset files +
// the in-memory RulesFacet corpus -- never rules_packages -- so it has no
// dependency on a Rules publish, and a Rules publish reads only the local
// authored source -- never content_packs -- so it has no dependency on a
// Content refresh). Both must complete, if needed, before either
// ACTIVATE_RULES or BIND_CONTENT, because DANGLING REFERENCE VALIDATION
// (above) requires knowing the FINAL immutable artifact identities (their
// real integrity hashes) before deciding it is safe to point a World at
// them. ACTIVATE_RULES and BIND_CONTENT are themselves independent of each
// other (they write two different collections, world_rules_config and
// world_content_pack_bindings) -- ordered Rules-before-Content only to match
// this task's own suggested sequence, not because either write depends on
// the other completing.
export function buildPlan({ rulesClassification, contentClassifications }) {
  const actions = []

  if (rulesClassification.status === 'PUBLISH_REQUIRED') {
    actions.push({ kind: 'PUBLISH_RULES', packageId: rulesClassification.packageId, version: rulesClassification.version })
  }
  for (const content of contentClassifications) {
    if (content.classification.status === 'REFRESH_REQUIRED') {
      actions.push({ kind: 'REFRESH_CONTENT', sourceKey: content.sourceKey, packageId: content.classification.packageId })
    }
  }

  if (rulesClassification.status === 'PUBLISH_REQUIRED' || rulesClassification.status === 'ACTIVATION_REQUIRED') {
    actions.push({ kind: 'ACTIVATE_RULES', packageId: rulesClassification.packageId, version: rulesClassification.version })
  }
  for (const content of contentClassifications) {
    if (content.classification.status === 'REFRESH_REQUIRED' || content.classification.status === 'BIND_REQUIRED') {
      actions.push({ kind: 'BIND_CONTENT', sourceKey: content.sourceKey, packageId: content.classification.packageId })
    }
  }

  return actions
}

// ---------------------------------------------------------------------------
// REPORT FORMATTING -- DRY RUN OUTPUT.
// ---------------------------------------------------------------------------

function formatRulesStatusLine(rulesClassification) {
  switch (rulesClassification.status) {
    case 'CURRENT':
      return `Status:\n    CURRENT`
    case 'PUBLISH_REQUIRED':
      return `Status:\n    PUBLISH_REQUIRED -- authored version ${rulesClassification.version} is not published yet`
    case 'ACTIVATION_REQUIRED':
      return `Status:\n    ACTIVATION_REQUIRED -- World is on ${rulesClassification.currentlyActiveVersion ?? '(none)'}, should be on ${rulesClassification.version}`
    case 'SOURCE_VERSION_COLLISION':
      return `Status:\n    SOURCE_VERSION_COLLISION -- ${rulesClassification.instruction}`
    default:
      return `Status:\n    ERROR -- ${rulesClassification.reason}`
  }
}

function formatContentStatusLine(classification) {
  switch (classification.status) {
    case 'CURRENT':
      return 'CURRENT'
    case 'REFRESH_REQUIRED':
      return `REFRESH_REQUIRED -- ${classification.reason}`
    case 'BIND_REQUIRED':
      return `BIND_REQUIRED -- World is on ${classification.currentlyBoundVersion ?? '(unbound)'}, should be on ${classification.version}`
    default:
      return `ERROR -- ${classification.reason}`
  }
}

export function formatReport({ worldName, worldId, rulesClassification, contentClassifications, plan, mode }) {
  const lines = []
  lines.push('ELDRA PACKAGE SYNC')
  lines.push(`World: ${worldName} (${worldId})`)
  lines.push('')
  lines.push('RULES')
  lines.push(`  Source:`)
  lines.push(`    ${rulesClassification.packageId ?? '(unknown)'}@${rulesClassification.version ?? '(unknown)'}`)
  lines.push(`  ${formatRulesStatusLine(rulesClassification)}`)
  lines.push('')
  lines.push('CONTENT')
  for (const content of contentClassifications) {
    lines.push(`  ${content.label}`)
    lines.push(`    Package:`)
    lines.push(`      ${content.classification.packageId ?? '(unknown)'}`)
    lines.push(`    Status:`)
    lines.push(`      ${formatContentStatusLine(content.classification)}`)
  }
  lines.push('')
  lines.push('ACTIONS')
  if (plan.length === 0) {
    lines.push('  None')
  } else {
    for (const action of plan) {
      lines.push(`  ${action.kind}${action.packageId ? ` (${action.packageId}${action.version ? '@' + action.version : ''})` : ''}`)
    }
  }
  lines.push('')
  lines.push(mode === 'apply' ? 'APPLY -- executing plan above.' : 'DRY RUN — no mutations performed.')
  return lines.join('\n')
}
