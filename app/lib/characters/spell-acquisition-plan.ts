// D&D 2024 Character Rules P3.2 -- GENERIC SPELL ACQUISITION PLAN + MISSING-SELECTION OPTION
// RESOLUTION.
//
// The one canonical, pure answer to "given this class's package-authored spell requirements, this
// character's level, its EFFECTIVE spell state (persisted + whatever tentative answers this planning
// call supplies), and the spell catalogue -- which requirements are already satisfied, how many
// selections are still missing, and which real catalogue spells would legally fill each one?" No
// Builder, no Level Manager, no creation/progression write -- a pure function of already-resolved
// inputs, exactly the posture P3.1's `validateSpellRequirements` already established, extended with
// option discovery and tentative-answer planning.
//
// ---------------------------------------------------------------------------
// WHAT THIS DOES NOT DO (P3.2's own scope line)
// ---------------------------------------------------------------------------
// It never writes `spellcasting`, `rules_choices`, or any progression state; it never renders a
// spell/spellbook/prepared-spell picker; it does not implement Magic Initiate, Blessed/Druidic
// Warrior, or subclass spell grants; it does not reclassify any Phase-0 decision. See this phase's
// own report for the P3.3 (creation write-through) / P3.4 (progression write-through) boundary.
//
// ---------------------------------------------------------------------------
// WHY THIS NEVER RE-IMPLEMENTS validateSpellRequirements's OWN LOGIC
// ---------------------------------------------------------------------------
// Every piece of count/pool/membership/filtering/legality interpretation here is the SAME function
// `validateSpellRequirements` itself calls: `evaluateRequirements` (the dependency-ordered two-pass),
// `evaluate` (per-requirement candidate classification -- called a SECOND time here, against a
// catalogue-as-candidates probe, to discover legal OPTIONS rather than merely judging owned state),
// `toResult` (required/owned/satisfied/issues shaping), `maxSpellLevelOf`, `flagFor`, and
// `KNOWN_POOL_KINDS`. When `tentative` is empty, this module's own `effectiveCandidates` equals
// P3.1's own `candidates` input exactly, so `toResult(requirement, required, evaluated.get(id))`
// here and inside `validateSpellRequirements` compute byte-identical `required`/`owned`/`satisfied`/
// `issues` for the same requirements/candidates/level/slots -- proven by
// `tests/lib/characters/spell-acquisition-plan.test.ts`'s own agreement test. There is exactly one
// interpretation of spell-requirement legality in this codebase; this file adds orchestration
// (merging tentative answers, discovering options) on top of it, never a parallel one.
//
// ---------------------------------------------------------------------------
// TENTATIVE ANSWERS -- WHY THEY MERGE BY IDENTITY, NOT CONCATENATE
// ---------------------------------------------------------------------------
// A tentative selection names ONE requirement and ONE catalogue ref. It becomes a synthetic
// `SpellStateCandidate` carrying ONLY the flag that requirement's own pool reads (`flagFor`) -- a
// spell tentatively answering a 'spellbook' requirement gets `known: true, prepared: false`; the
// SAME spell tentatively ALSO answering the 'spell' (prepared) requirement, submitted as a SECOND,
// separate tentative selection naming the other requirement, gets its own row with `prepared: true`.
// Persisted candidates and every tentative row are then merged BY IDENTITY (OR-ing `known`/
// `prepared`, preferring whichever row has resolved `mechanics`) into one `SpellStateCandidate` per
// identity -- exactly the shape a real save into `spellcasting.spells[]` would eventually produce.
// This is what lets Wizard's two-tier dependency resolve WITHIN ONE PLANNING CALL: a tentative
// spellbook addition becomes part of the EFFECTIVE spellbook the very same call's prepared-pool
// evaluation reads as its membership gate -- no save, reload, then prepare round trip.
//
// ---------------------------------------------------------------------------
// OPTION DISCOVERY -- WHY A SEPARATE CATALOGUE-AS-CANDIDATES PROBE, NOT A NEW RESOLVER
// ---------------------------------------------------------------------------
// "Which catalogue spells would be LEGAL if newly selected for this requirement" is answered by
// building one synthetic candidate per catalogue entry with EVERY flag forced true (so `evaluate`
// never skips an entry for "not yet owned" -- that concept doesn't apply to a hypothetical pick),
// then calling the SAME `evaluate` function with the requirement's REAL, already-resolved membership
// set (from evaluating the EFFECTIVE state, never a catalogue-wide recomputation of "what could
// theoretically belong to a spellbook"). A catalogue entry landing in the resulting `legal` set, and
// not already in the requirement's OWN effective legal set (not to be re-offered as new), is a real
// option. Options are only computed when `missing > 0` -- P3.2's own CORE GOAL asks for "legal
// ContentRefs for each MISSING selection", not an open-ended "every spell that could ever extend this
// pool" (relevant only for `spellbook`'s cumulative-minimum shape, and out of this phase's scope).
//
// ---------------------------------------------------------------------------
// PROPOSED ANSWER KEY (reported, not persisted -- see this phase's own report)
// ---------------------------------------------------------------------------
// `spellRequirementAnswerKey` below reuses `progressionChoiceKey` verbatim: `slot`/`at` are the
// SAME creation/progression identity concepts every other Content/Definition choice already keys
// by (creation is `at: CREATION_LEVEL`, exactly like `creation-content-choices.ts`'s own 'spells'
// category declarations; progression is the crossed row's own `at`), and `requirement.id` is already
// a stable, package-authored DefinitionId. No new key-building rule, no class-name parsing, no
// spell-name parsing. A FUTURE answer for ONE requirement with N missing selections is a plain
// `string[]` of `serializeContentRef`-encoded refs at this one key -- the SAME `{key, options,
// count, selected, distinct}` shape every other multi-pick Content choice
// (`creation-content-choices.ts`'s own 'spells' category, `ProgressionChoice`) already uses. Nothing
// here persists an answer; P3.3/P3.4 own that.

import type { CanonicalSpellMechanics } from '../spell-mechanics/types'
import type { SpellRequirement, SpellRequirementPoolKind } from '../content-rules/types'
import { progressionChoiceKey } from './rules-choices'
import { type ContentRef, serializeContentRef } from './progression-plan'
import type { SpellSlotLevel } from './spellcasting'
import {
  evaluate,
  evaluateRequirements,
  flagFor,
  KNOWN_POOL_KINDS,
  maxSpellLevelOf,
  spellIdentityOf,
  toResult,
  type SpellRequirementIssue,
  type SpellStateCandidate
} from './spell-requirements'

// Restated, not re-exported from `creation-content-choices.ts`'s `CreationSpellEntry` -- a future
// caller with no reason to import that feat-shaped module should not have to, for the same reason
// `ContentRef` is restated per-module throughout this family rather than cross-imported. Structurally
// identical: packageId/slug/title plus optional resolved spell mechanics.
export type SpellCatalogueEntry = {
  packageId: string
  slug: string
  title: string
  spellMechanics?: CanonicalSpellMechanics | null
}

// One hypothetical, not-yet-persisted answer: "treat this catalogue ref as tentatively selected for
// this requirement." See this file's own TENTATIVE ANSWERS header for how it becomes state.
export type TentativeSpellSelection = {
  requirementId: string
  ref: ContentRef
}

// A legal catalogue spell this requirement could still accept. `ref` is the
// `serializeContentRef`-encoded wire form (the SAME convention `ProgressionChoiceOption.id` and
// `CreationContentOffer.ref` already use) -- a future real answer submits exactly this string back.
export type SpellAcquisitionOption = {
  ref: string
  packageId: string
  slug: string
  title: string
}

// Reuses P3.1's own issue vocabulary verbatim (never a parallel one) and adds exactly two new kinds,
// both scoped to this module's own concern -- the SHAPE of a tentative answer, before it even
// becomes a candidate P3.1's own issues could describe.
export type SpellAcquisitionIssue =
  | SpellRequirementIssue
  | { kind: 'tentative-duplicate'; ref: string }
  | { kind: 'tentative-unresolved'; ref: string }

export type SpellAcquisitionRequirementPlan = {
  requirementId: string
  pool: SpellRequirementPoolKind
  // The corpus's own TOTAL at this character level (P3.1's "required", renamed for this surface's
  // own vocabulary -- never a delta; see this phase's own TOTAL TARGET header).
  target: number
  // Distinct, LEGAL identities counted toward this requirement right now (persisted + accepted
  // tentative) -- P3.1's "owned".
  legalCount: number
  missing: number
  // False whenever ANY issue is present, even one that does not affect `missing` (an illegal extra
  // row, an over-count, a refused tentative answer) -- "no automatic repair" means a requirement with
  // a real problem is never reported as satisfied merely because its count happens to clear the bar.
  satisfied: boolean
  // The identities (P3.1's own `spellIdentityOf` form, catalogue-ref OR custom-name) this
  // requirement currently counts as legally selected.
  selected: string[]
  // [] whenever `missing` is 0 -- see this file's own OPTION DISCOVERY header for why "always list
  // every theoretically addable spell" is out of scope.
  options: SpellAcquisitionOption[]
  issues: SpellAcquisitionIssue[]
}

export type SpellAcquisitionPlan = {
  characterLevel: number
  requirements: SpellAcquisitionRequirementPlan[]
  // Every requirement satisfied -- never true merely because every target is numerically met while
  // an illegal row or a refused tentative answer is still sitting in some requirement's issues.
  complete: boolean
}

export function planSpellAcquisition(input: {
  requirements: readonly SpellRequirement[]
  characterLevel: number
  // Current EFFECTIVE state before this planning call -- normally built from persisted
  // `spellcasting.spells[]`, and able to carry package-derived fixed grants too (see this file's own
  // report): a candidate the caller includes with only the relevant flag set counts toward that pool
  // exactly as a real one would; one with the WRONG flag set never does, with no special case needed
  // here.
  candidates: readonly SpellStateCandidate[]
  catalogue: readonly SpellCatalogueEntry[]
  spellSlotLevels: readonly SpellSlotLevel[]
  tentative?: readonly TentativeSpellSelection[]
}): SpellAcquisitionPlan {
  const { requirements, characterLevel, candidates, catalogue, spellSlotLevels } = input
  const tentative = input.tentative ?? []
  const maxSpellLevel = maxSpellLevelOf(spellSlotLevels)

  const catalogueByIdentity = new Map<string, SpellCatalogueEntry>()
  const catalogueByRef = new Map<string, SpellCatalogueEntry>()
  for (const entry of catalogue) {
    const ref = { packageId: entry.packageId, slug: entry.slug }
    catalogueByIdentity.set(spellIdentityOf({ ref }), entry)
    catalogueByRef.set(serializeContentRef(ref), entry)
  }

  // --- Resolve tentative selections into synthetic candidates, flagging structural problems. ----
  const tentativeIssuesByRequirement = new Map<string, SpellAcquisitionIssue[]>()
  const seenRefByRequirement = new Map<string, Set<string>>()
  const tentativeCandidates: SpellStateCandidate[] = []

  function addTentativeIssue(requirementId: string, issue: SpellAcquisitionIssue): void {
    const list = tentativeIssuesByRequirement.get(requirementId) ?? []
    list.push(issue)
    tentativeIssuesByRequirement.set(requirementId, list)
  }

  for (const selection of tentative) {
    const requirement = requirements.find((r) => r.id === selection.requirementId)
    if (!requirement) continue // Unknown requirement id: a caller bug, not a player-facing refusal.

    const refString = serializeContentRef(selection.ref)
    const seen = seenRefByRequirement.get(requirement.id) ?? new Set<string>()
    if (seen.has(refString)) {
      addTentativeIssue(requirement.id, { kind: 'tentative-duplicate', ref: refString })
      continue
    }
    seen.add(refString)
    seenRefByRequirement.set(requirement.id, seen)

    const entry = catalogueByRef.get(refString)
    if (!entry) {
      addTentativeIssue(requirement.id, { kind: 'tentative-unresolved', ref: refString })
      continue
    }

    const flag = flagFor(requirement.pool)
    tentativeCandidates.push({
      identity: spellIdentityOf({ ref: selection.ref }),
      known: flag === 'known',
      prepared: flag === 'prepared',
      mechanics: entry.spellMechanics ?? null
    })
  }

  // --- Merge persisted + tentative by identity -- see this file's own TENTATIVE ANSWERS header. --
  const effectiveByIdentity = new Map<string, SpellStateCandidate>()
  for (const row of [...candidates, ...tentativeCandidates]) {
    const existing = effectiveByIdentity.get(row.identity)
    if (!existing) {
      effectiveByIdentity.set(row.identity, { ...row })
      continue
    }
    existing.known = existing.known || row.known
    existing.prepared = existing.prepared || row.prepared
    existing.mechanics = existing.mechanics ?? row.mechanics
  }
  const effectiveCandidates = [...effectiveByIdentity.values()]

  const evaluated = evaluateRequirements(requirements, effectiveCandidates, maxSpellLevel)

  // Every catalogue entry, forced visible to any flag -- see this file's own OPTION DISCOVERY header.
  const catalogueProbe: SpellStateCandidate[] = catalogue.map((entry) => ({
    identity: spellIdentityOf({ ref: { packageId: entry.packageId, slug: entry.slug } }),
    known: true,
    prepared: true,
    mechanics: entry.spellMechanics ?? null
  }))

  const requirementPlans: SpellAcquisitionRequirementPlan[] = requirements.map((requirement) => {
    const target = requirement.totalByLevel[characterLevel - 1] ?? 0
    const stateEvaluated = evaluated.get(requirement.id) ?? { legal: new Set<string>(), issues: [] }
    const stateResult = toResult(requirement, target, stateEvaluated)
    const tentativeIssues = tentativeIssuesByRequirement.get(requirement.id) ?? []
    const issues: SpellAcquisitionIssue[] = [...stateResult.issues, ...tentativeIssues]
    const missing = Math.max(0, target - stateResult.owned)

    const options: SpellAcquisitionOption[] = []
    if (missing > 0 && KNOWN_POOL_KINDS.includes(requirement.pool)) {
      const membershipSet = requirement.requiresMembershipPool
        ? (evaluated.get(requirement.requiresMembershipPool)?.legal ?? new Set<string>())
        : null
      const probeEvaluated = evaluate(requirement, catalogueProbe, maxSpellLevel, membershipSet)
      for (const identity of probeEvaluated.legal) {
        if (stateEvaluated.legal.has(identity)) continue // already selected for THIS requirement
        const entry = catalogueByIdentity.get(identity)
        if (!entry) continue
        options.push({ ref: serializeContentRef({ packageId: entry.packageId, slug: entry.slug }), packageId: entry.packageId, slug: entry.slug, title: entry.title })
      }
    }

    return {
      requirementId: requirement.id,
      pool: requirement.pool,
      target,
      legalCount: stateResult.owned,
      missing,
      satisfied: issues.length === 0,
      selected: [...stateEvaluated.legal],
      options,
      issues
    }
  })

  return {
    characterLevel,
    requirements: requirementPlans,
    complete: requirementPlans.every((r) => r.satisfied)
  }
}

export function spellRequirementAnswerKey(slot: string, at: unknown, requirement: SpellRequirement): string {
  return progressionChoiceKey(slot, at, requirement.id)
}
