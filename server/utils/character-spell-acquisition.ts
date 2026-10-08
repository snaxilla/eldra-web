// D&D 2024 Character Rules P3.3 -- V2 CREATION SPELL ACQUISITION, server-side orchestration.
//
// The server's own half of P3.3's CORE PRODUCT FLOW: selected class -> package-authored Level-1
// SpellRequirements -> planSpellAcquisition -> (re)validation -> canonical spellcasting.spells[].
// Every legality decision is `planSpellAcquisition` (P3.2), which itself reuses P3.1's validator and
// P2's `spellOptionVerdict` -- nothing here re-implements count, pool, membership, or filtering
// legality. This file's own job is narrower: derive the two facts only the SERVER can (the real
// caster type's own slot table, from the active Rules Package), and translate a VALIDATED plan's
// accepted answers into the canonical persisted shape.
//
// ---------------------------------------------------------------------------
// WHY THE SERVER DERIVES `creationSpellSlotLevels` DIFFERENTLY FROM THE BUILDER
// ---------------------------------------------------------------------------
// `characterBuilderSelection.ts` (client) has no Rules Engine registry, so it uses a fixed,
// corpus-proven constant for Level-1 creation (see its own header). This file DOES have registry
// access (the route already calls `getWorldRuntime`), so it reads the REAL activated package's own
// slot table via the SAME `deriveSpellSlotLevels`/`SLOT_TABLE_BY_CASTER_TYPE` machinery Cast and the
// Sheet already use -- never a hardcoded value, and never trusting the Builder's own constant. Both
// sides happen to agree at Level 1 today (confirmed by the Level-1 matrix and Rules Hotfix 0.21.0),
// but only the server's own derivation is ever treated as authoritative.
//
// ---------------------------------------------------------------------------
// WHY THE CANONICAL WRITE IS BUILT HERE, NOT FROM THE RAW PAYLOAD
// ---------------------------------------------------------------------------
// The client submits only `{requirementId, ref}` pairs -- no class list, level, school, pool kind,
// or known/prepared flag (see create-v2.post.ts's own CLIENT AUTHORITY BOUNDARY). `known`/`prepared`
// are derived here from EACH answer's own requirement's pool (`flagFor`, P3.1), and the same spell
// satisfying two pools at once (Wizard: spellbook AND prepared) merges into ONE row via OR'd flags,
// never two rows -- mirroring the same merge-by-identity rule `app/lib/characters/
// spell-acquisition-plan.ts`'s own tentative-merge already uses, restated here for the WRITE side.
// Only an answer that the plan actually counted as LEGAL (`requirementPlan.selected.includes
// (identity)`) is ever written -- a plan is only reached here once `plan.complete` is true, but this
// function re-checks per-answer anyway rather than assuming every submitted answer was accepted.

import type { RulesFacet } from '../../app/lib/content-rules'
import type { SpellRequirement } from '../../app/lib/content-rules/types'
import {
  flagFor,
  mergeSpellStateCandidate,
  spellIdentityOf,
  type SpellStateCandidate
} from '../../app/lib/characters/spell-requirements'
import {
  planSpellAcquisition,
  type SpellAcquisitionIssue,
  type SpellAcquisitionPlan,
  type SpellCatalogueEntry,
  type TentativeSpellSelection
} from '../../app/lib/characters/spell-acquisition-plan'
import {
  deriveSpellSlotLevels,
  nextInstanceId,
  SLOT_TABLE_BY_CASTER_TYPE,
  type SpellSlotLevel,
  type StoredSpellEntry
} from '../../app/lib/characters/spellcasting'

const CASTER_TYPE_GRANT_PREFIX = 'value:spellcasting.caster_type.'
const CASTER_TYPES = ['full', 'half', 'pact'] as const
export type CasterType = (typeof CASTER_TYPES)[number]

// The class facet's own unconditional grant names its caster type -- the SAME fact
// `character-cast.ts`'s own `checkSpellSlotAvailability` reads off the EVALUATED actor state
// (`value:spellcasting.caster_type.<type>`); at creation, before any entity/ActorState exists, the
// facet's own `grants` already states it directly, with no evaluation needed.
export function casterTypeOf(facet: RulesFacet | null | undefined): CasterType | null {
  const grant = facet?.grants?.find(
    (candidate) => typeof candidate.set === 'string' && candidate.set.startsWith(CASTER_TYPE_GRANT_PREFIX) && candidate.to === true
  )
  if (!grant) return null
  const type = grant.set.slice(CASTER_TYPE_GRANT_PREFIX.length)
  return (CASTER_TYPES as readonly string[]).includes(type) ? (type as CasterType) : null
}

export function creationSpellSlotLevels(
  casterType: CasterType | null,
  tableRows: readonly Record<string, unknown>[] | undefined
): SpellSlotLevel[] {
  return deriveSpellSlotLevels({ casterType, tableRows, characterLevel: 1, expendedSlots: {} })
}

// The table ROWS for a caster type, read directly from the World's active Rules Runtime registry --
// never from a persisted character (none exists yet at creation). `registry.getById` returns
// `undefined` for an unconfigured/unbound World, which `deriveSpellSlotLevels` already treats as "no
// slots" (fails closed on every gated requirement), exactly as intended.
export function slotTableRows(
  registry: { getById: (id: string) => unknown },
  casterType: CasterType | null
): readonly Record<string, unknown>[] | undefined {
  if (!casterType) return undefined
  const table = registry.getById(SLOT_TABLE_BY_CASTER_TYPE[casterType]) as { rows?: Record<string, unknown>[] } | undefined
  return table?.rows
}

export function buildCreationSpellPlan(input: {
  requirements: readonly SpellRequirement[]
  catalogue: readonly SpellCatalogueEntry[]
  spellSlotLevels: readonly SpellSlotLevel[]
  tentative: readonly TentativeSpellSelection[]
}): SpellAcquisitionPlan {
  return planSpellAcquisition({
    requirements: input.requirements,
    characterLevel: 1,
    candidates: [],
    catalogue: input.catalogue,
    spellSlotLevels: input.spellSlotLevels,
    tentative: input.tentative
  })
}

function issueMessage(pool: string, issue: SpellAcquisitionIssue): string {
  switch (issue.kind) {
    case 'missing':
      return `Choose ${issue.count} more ${pool} spell${issue.count === 1 ? '' : 's'}.`
    case 'over-count':
      return `Too many ${pool} spells selected (${issue.count} too many).`
    case 'illegal-wrong-class-list':
      return `"${issue.identity}" is not on this Class's spell list.`
    case 'illegal-wrong-level':
      return `"${issue.identity}" is above the legal spell level for this Class right now.`
    case 'illegal-unresolved':
      return `"${issue.identity}" does not match a real spell in this World's catalogue.`
    case 'illegal-not-in-membership-pool':
      return `"${issue.identity}" must first be added to ${issue.membershipPoolId}.`
    case 'invalid-requirement-dependency':
      return `This Class's spell configuration is invalid (${issue.reason}).`
    case 'tentative-duplicate':
      return `"${issue.ref}" was selected more than once for the same requirement.`
    case 'tentative-unresolved':
      return `"${issue.ref}" does not match any spell in this World's catalogue.`
    default:
      return `${pool}: incomplete.`
  }
}

// The first real problem in a plan that is not yet `complete`, or null when it already is --
// create-v2.post.ts throws this verbatim as its 400 statusMessage. Mirrors (never replaces) the
// generic validation-failure phrasing every other creation check already uses.
export function describeSpellPlanFailure(plan: SpellAcquisitionPlan): string | null {
  for (const requirement of plan.requirements) {
    if (requirement.satisfied) continue
    const issue = requirement.issues[0]
    return issue ? issueMessage(requirement.pool, issue) : `${requirement.pool}: incomplete.`
  }
  return null
}

// Translates a VALIDATED plan's accepted tentative answers into canonical `StoredSpellEntry[]` --
// never the raw submitted payload (see this file's own header). One row per spell identity,
// `known`/`prepared`/`requirementIds` merged via the SAME `mergeSpellStateCandidate` rule P3.2's own
// tentative-merge and P3.2.1's provenance model both already use (OR flags, UNION ids) -- never a
// second, independently-drifting merge implementation for the write side. `requirementIds` is
// derived SERVER-SIDE from each accepted answer's own `requirementId`; the client never submits
// provenance directly (see this file's own CLIENT AUTHORITY BOUNDARY header).
export function buildAcceptedSpellEntries(
  requirements: readonly SpellRequirement[],
  plan: SpellAcquisitionPlan,
  tentative: readonly TentativeSpellSelection[]
): StoredSpellEntry[] {
  const requirementById = new Map(requirements.map((requirement) => [requirement.id, requirement]))
  const planByRequirement = new Map(plan.requirements.map((requirement) => [requirement.requirementId, requirement]))
  const refByIdentity = new Map<string, TentativeSpellSelection['ref']>()
  const mergedByIdentity = new Map<string, SpellStateCandidate>()

  for (const selection of tentative) {
    const requirement = requirementById.get(selection.requirementId)
    if (!requirement) continue
    const requirementPlan = planByRequirement.get(requirement.id)
    if (!requirementPlan) continue

    const identity = spellIdentityOf({ ref: selection.ref })
    if (!requirementPlan.selected.includes(identity)) continue // not an accepted answer

    refByIdentity.set(identity, selection.ref)
    const flag = flagFor(requirement.pool)
    const candidate: SpellStateCandidate = {
      identity,
      known: flag === 'known',
      prepared: flag === 'prepared',
      mechanics: null,
      requirementIds: [requirement.id]
    }
    mergedByIdentity.set(identity, mergeSpellStateCandidate(mergedByIdentity.get(identity), candidate))
  }

  const entries: StoredSpellEntry[] = []
  for (const [identity, candidate] of mergedByIdentity) {
    entries.push({
      instanceId: nextInstanceId(entries),
      ref: refByIdentity.get(identity)!,
      known: candidate.known,
      prepared: candidate.prepared,
      ...(candidate.requirementIds?.length ? { requirementIds: candidate.requirementIds } : {})
    })
  }
  return entries
}
