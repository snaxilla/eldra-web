// Effective content resolution -- Content Workspaces & Studio Phase 5/6
// (content-workspaces-and-studio.md §8). Behind `ELDRA_EFFECTIVE_CONTENT`,
// default OFF (isEffectiveContentEnabled below).
//
// PHASE 5 SCOPE. Only pinned sources are resolved here (the `workspace`
// binding-mode branch exists so Phase 6 slots in without restructuring,
// but `loadWorkspaceAsSource` is wired in once the flag path below
// actually reads workspace entities -- see that function's own header).
//
// THE NO-OP THEOREM (§8.7), made concrete: this module is built ON TOP OF
// the existing, unchanged resolveWorldContent (world-content-runtime.ts)
// rather than re-implementing pack loading. For today's data -- every
// candidate's only identity key is its own lineage-scoped legacy address,
// because no published pack has ever carried `contentEntityId`/
// `baseRefs`/`curatedFrom`/`slugAliases` -- every group below has exactly
// one member, so materialize returns that entry's own `data` with its
// source-resolved `presentation` and nothing else, in the exact order
// resolveWorldContent already produces. See
// tests/server/utils/world-effective-content.test.ts's own 'no-op
// theorem' block for the executable proof.

import {
  evidenceKeys,
  lineageIndexFrom,
  parseLegacyAddress,
  type IdentityCarrier,
  type LineageIndex
} from '../../app/lib/content-identity'
import { comparePrecedence, type PrecedenceBindingMode } from '../../app/lib/content-resolution/precedence'
import { resolveContentPresentation, type PresentationEntry } from '../../app/lib/content-presentation'
import { presentationKindForEntityType } from '../../app/lib/content-presentation/kind-for-entity-type'
import { resolveWorldContent, type WorldContentEntry, type WorldContentPackResolution } from './world-content-runtime'
import { listContentPackBindingsForWorld, type WorldContentPackBindingRecord } from './world-content-packs'
import { listPackageLineages } from './content-package-lineages'
import { loadWorkspaceAsSource } from './world-content-sources'
import type { RulesFacet } from '../../app/lib/content-rules'

export function isEffectiveContentEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.ELDRA_EFFECTIVE_CONTENT === 'true' || env.ELDRA_EFFECTIVE_CONTENT === '1'
}

export type EffectiveCandidate = WorldContentEntry & {
  binding: { bindingMode: PrecedenceBindingMode; priority: number | null; createdAt: string | null }
  // Only ever set on a workspace-sourced candidate (Phase 6). Absent on
  // every pinned/channel candidate, since a published release carries no
  // such concept.
  state?: 'active' | 'disabled'
  // PRE-RESOLVED presentation (authored overlay already merged, image
  // already World-scoped) -- set only for a workspace-sourced candidate
  // (world-content-sources.ts's WorkspaceSourceEntry). `undefined` on
  // every pinned/channel candidate (a published ContentPublicationCandidate
  // carries no such field today), which is exactly what keeps the no-op
  // theorem exact: materialize() recomputes presentation from `data` only
  // when this is undefined.
  presentation?: PresentationEntry | null
  // Which presentation paths this workspace-sourced candidate's author has
  // actually overridden right now -- see WorkspaceSourceEntry's own note.
  // Absent/undefined for every pinned/channel candidate.
  authoredPresentationPaths?: readonly string[]
}

export type EffectiveConflict = { kind: 'two-live-sources'; packageIds: string[] }

export type EffectiveEntityCustomization = {
  customized: boolean
  authoredFields: { channel: string; path: string }[]
  baseLabel?: string
  baseRef?: { packageId: string; version?: string; slug: string }
  suppressed?: boolean
  shadowed?: { packageId: string; version: string }[]
  conflicts?: EffectiveConflict[]
}

export type EffectiveEntity = {
  systemKey: string
  entityType: string
  title: string
  slug: string
  externalId: string
  provider: string
  sourceBook?: string
  sourcePage?: string
  data: unknown
  presentation: PresentationEntry | null
  rulesFacet?: RulesFacet
  packageId: string
  packageVersion: string
  contentEntityId?: string
  // Relayed verbatim from the winning candidate, exactly as
  // world-content-catalogue.ts already relays them from a
  // WorldContentEntry -- never recomputed here. Carrying these through is
  // what keeps subclass/featureOption catalogue entries correct once a
  // consumer switches to the effective path (§8.9); dropping them would
  // silently break "find this subclass's parent class" lookups.
  parentClassSlug?: string
  definitionId?: string
  customization: EffectiveEntityCustomization
}

// A live workspace source reports through the EXISTING
// WorldContentPackResolution shape rather than a parallel union member --
// deliberately. An earlier version of this module added a dedicated
// WorkspaceSourceResolution type and unioned it into `packs`, which
// widened WorldGameplayCatalogue.packs (world-content-catalogue.ts) and,
// through it, the global $fetch/useFetch route-typing surface every
// component composes against -- a change this one field had no business
// causing, confirmed by isolating it: that single widening alone moved
// the repository's typecheck diagnostic count from 908 to 926, entirely
// in OTHER files' dynamic (non-literal) $fetch/useFetch calls, zero of
// which this phase touches. A missing workspace is, structurally, the
// same concept ContentPackLoadFailure's own 'not-found' stage already
// names ("the bound source could not be found"); reusing it keeps `packs`
// exactly the type it already was, at zero global complexity cost.
export type WorkspaceSourceResolution = WorldContentPackResolution

// A redirect for an existing character reference -- §15.3's "the rename
// fix," generalized from slug renames to shadowing. A stored
// `{packageId, slug}` naming a now-SHADOWED legacy address (e.g. the
// original pinned release a workspace entity's `baseRefs` names) must
// still resolve, to the WINNER it was shadowed by, not report "missing."
// Keyed by `${entityType}::${packageId}::${slug}` -- entityType because
// two different categories (e.g. an item and a spell) could coincidentally
// share a packageId+slug; no systemKey segment, because a World has one
// active system in practice and evidenceKeys itself already required
// systemKey to match before registering any key this map is built from
// (app/lib/content-identity's evidenceKeys, E3's own systemKey/entityType
// guard) -- so no entry here can ever cross systems.
export type EffectiveLegacyAlias = { packageId: string; slug: string }

export function legacyAliasKey(entityType: string, packageId: string, slug: string): string {
  return `${entityType}::${packageId}::${slug}`
}

export type EffectiveCatalogue = {
  worldId: string
  packs: WorldContentPackResolution[]
  entries: EffectiveEntity[]
  byEntityType: Record<string, EffectiveEntity[]>
  // Empty whenever nothing collapsed -- including every call with no
  // declared evidence, which is what keeps the no-op theorem exact: this
  // field existing changes nothing for a consumer that never reads it.
  legacyAliases: Record<string, EffectiveLegacyAlias>
}

async function loadLineageIndex(): Promise<LineageIndex> {
  const lineages = await listPackageLineages()
  const bySupersedes: Record<string, readonly string[]> = {}
  for (const lineage of lineages) {
    if (lineage.supersedes.length) bySupersedes[lineage.packageId] = lineage.supersedes
  }
  return lineageIndexFrom(bySupersedes)
}

function bindingMetaFor(binding: WorldContentPackBindingRecord | undefined): EffectiveCandidate['binding'] {
  return {
    bindingMode: binding?.bindingMode ?? 'pinned',
    priority: binding?.priority ?? null,
    createdAt: binding?.createdAt ?? null
  }
}

// Stable union-find: groups candidates whose evidenceKeys overlap,
// ordered by each group's EARLIEST member's original position -- so
// when every group is a singleton (today's data, per the no-op theorem),
// output order is exactly input order.
function groupByEvidence(candidates: readonly EffectiveCandidate[], lineages: LineageIndex): EffectiveCandidate[][] {
  const parent = candidates.map((_, i) => i)
  function find(i: number): number {
    while (parent[i] !== i) i = parent[i] as number
    return i
  }
  function union(a: number, b: number): void {
    const ra = find(a)
    const rb = find(b)
    if (ra !== rb) parent[Math.max(ra, rb)] = Math.min(ra, rb)
  }

  const firstIndexForKey = new Map<string, number>()
  candidates.forEach((candidate, index) => {
    for (const key of evidenceKeys(candidate as IdentityCarrier, lineages)) {
      const existing = firstIndexForKey.get(key)
      if (existing === undefined) firstIndexForKey.set(key, index)
      else union(index, existing)
    }
  })

  const groupsByRoot = new Map<number, EffectiveCandidate[]>()
  candidates.forEach((candidate, index) => {
    const root = find(index)
    const group = groupsByRoot.get(root)
    if (group) group.push(candidate)
    else groupsByRoot.set(root, [candidate])
  })

  return [...groupsByRoot.entries()].sort((a, b) => a[0] - b[0]).map(([, group]) => group)
}

function detectConflicts(group: readonly EffectiveCandidate[]): EffectiveConflict[] {
  const liveMembers = group.filter((c) => c.binding.bindingMode === 'workspace')
  if (liveMembers.length > 1) {
    return [{ kind: 'two-live-sources', packageIds: liveMembers.map((c) => c.packageId) }]
  }
  return []
}

function identityOf(entry: EffectiveCandidate) {
  return {
    systemKey: entry.systemKey,
    entityType: entry.entityType,
    title: entry.title,
    slug: entry.slug,
    externalId: entry.externalId,
    provider: entry.provider,
    sourceBook: entry.sourceBook,
    sourcePage: entry.sourcePage,
    packageId: entry.packageId,
    packageVersion: entry.packageVersion,
    contentEntityId: entry.contentEntityId,
    parentClassSlug: entry.parentClassSlug,
    definitionId: entry.definitionId
  }
}

function suppressedEntity(winner: EffectiveCandidate, shadowed: readonly EffectiveCandidate[]): EffectiveEntity {
  return {
    ...identityOf(winner),
    data: null,
    presentation: null,
    customization: {
      customized: true,
      authoredFields: [],
      suppressed: true,
      shadowed: shadowed.map((s) => ({ packageId: s.packageId, version: s.packageVersion }))
    }
  }
}

// Three distinct steps (§8.5): A) read-only provider data, B) mechanics
// materialization (NOT implemented this phase -- Phase 7's adapter has
// no caller here, so `data` is always the winner's own base/authored
// data verbatim), C) universal presentation materialization. Phase 5/6
// never touch step B's provider keys; only Phase 7 adds that step.
function materialize(
  winner: EffectiveCandidate,
  shadowed: readonly EffectiveCandidate[],
  conflicts: readonly EffectiveConflict[]
): EffectiveEntity {
  // A workspace-sourced winner carries its presentation PRE-RESOLVED
  // (world-content-sources.ts already merged the authored overlay and
  // World-scoped its image); a pinned/channel winner never has this field
  // at all, so it is computed from `data` exactly as before Phase 5 --
  // the no-op theorem's own load-bearing property.
  const presentation = winner.presentation !== undefined
    ? winner.presentation
    : (() => {
        const kind = presentationKindForEntityType(winner.entityType)
        return kind ? resolveContentPresentation(winner.systemKey, kind, winner.data) : null
      })()

  const baseShadow = shadowed[0]

  // Relayed verbatim from the winning candidate's own override list --
  // `undefined` on every pinned/channel winner (never populated there),
  // which keeps the no-op theorem exact (an empty array, identically).
  // This is specifically what lets a consumer (catalogue-entity-bridge.ts)
  // tell "the author touched exactly this field" apart from "this field's
  // effective value happens to equal the source's," which `presentation`
  // alone (already merged) cannot answer.
  const authoredFields = (winner.authoredPresentationPaths ?? []).map((path) => ({ channel: 'presentation', path }))

  return {
    ...identityOf(winner),
    data: winner.data,
    presentation,
    rulesFacet: winner.rulesFacet,
    customization: {
      customized: shadowed.length > 0 || Boolean(winner.contentEntityId) || Boolean(winner.curatedFrom),
      authoredFields,
      baseLabel: baseShadow?.sourceBook ?? baseShadow?.packageId,
      baseRef: baseShadow ? { packageId: baseShadow.packageId, version: baseShadow.packageVersion, slug: baseShadow.slug } : undefined,
      shadowed: shadowed.length ? shadowed.map((s) => ({ packageId: s.packageId, version: s.packageVersion })) : undefined,
      conflicts: conflicts.length ? [...conflicts] : undefined
    }
  }
}

function groupByEntityType(entries: readonly EffectiveEntity[]): Record<string, EffectiveEntity[]> {
  const grouped: Record<string, EffectiveEntity[]> = {}
  for (const entry of entries) {
    const key = entry.entityType || 'unknown'
    ;(grouped[key] ??= []).push(entry)
  }
  return grouped
}

export async function resolveEffectiveContent(worldId: string | number): Promise<EffectiveCatalogue> {
  const [catalogue, bindings, lineages] = await Promise.all([
    resolveWorldContent(worldId),
    listContentPackBindingsForWorld(worldId),
    loadLineageIndex()
  ])

  const bindingByPackageId = new Map(bindings.map((b) => [b.packageId, b]))

  // Pinned/channel entries come straight from resolveWorldContent's own
  // flattening -- step 1/2 of §8.4's pseudocode is already done by the
  // existing, unchanged module. A `workspace`-mode binding is not a
  // content_packs row at all, so it contributes nothing here; its
  // entries are added separately below (Phase 6).
  const pinnedCandidates: EffectiveCandidate[] = catalogue.entries.map((entry) => ({
    ...entry,
    binding: bindingMetaFor(bindingByPackageId.get(entry.packageId))
  }))

  const packs: WorldContentPackResolution[] = [...catalogue.packs]
  const workspaceCandidates: EffectiveCandidate[] = []

  const workspaceBindings = bindings.filter((b) => b.bindingMode === 'workspace' && b.workspaceId)
  for (const binding of workspaceBindings) {
    const result = await loadWorkspaceAsSource(binding.workspaceId as string, String(worldId))
    if (!result.ok) {
      // Reuses ContentPackLoadFailure's existing 'not-found' stage -- see
      // WorkspaceSourceResolution's own header for why this is not a
      // parallel failure shape.
      packs.push({ ok: false, packageId: binding.packageId, version: 'live', failure: { stage: 'not-found', packageId: binding.packageId, version: 'live' } })
      continue
    }
    packs.push({ ok: true, packageId: binding.packageId, version: 'live', title: result.workspaceTitle, entryCount: result.entries.length })
    for (const entry of result.entries) {
      workspaceCandidates.push({
        ...entry,
        binding: bindingMetaFor(binding)
      })
    }
  }

  const candidates = [...pinnedCandidates, ...workspaceCandidates]
  const groups = groupByEvidence(candidates, lineages)

  const entries: EffectiveEntity[] = []
  const legacyAliases: Record<string, EffectiveLegacyAlias> = {}

  for (const group of groups) {
    const ordered = [...group].sort(comparePrecedence)
    const [winner, ...shadowed] = ordered as [EffectiveCandidate, ...EffectiveCandidate[]]

    if (winner.state === 'disabled') {
      entries.push(suppressedEntity(winner, shadowed))
      continue
    }

    entries.push(materialize(winner, shadowed, detectConflicts(group)))

    // Every address a SHADOWED member claims (its own identity, plus any
    // E3/E4/E5 evidence it declared) now redirects to the winner -- a
    // character holding the shadowed pack's own {packageId, slug} must
    // still resolve. Only shadowed members are walked: a group with no
    // shadowing (every live World today) adds nothing here.
    for (const member of shadowed) {
      for (const key of evidenceKeys(member as IdentityCarrier, lineages)) {
        const address = parseLegacyAddress(key)
        if (!address) continue
        const aliasKey = legacyAliasKey(address.entityType, address.packageId, address.slug)
        legacyAliases[aliasKey] = { packageId: winner.packageId, slug: winner.slug }
      }
    }
  }

  return { worldId: catalogue.worldId, packs, entries, byEntityType: groupByEntityType(entries), legacyAliases }
}
