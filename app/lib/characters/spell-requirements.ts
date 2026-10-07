// D&D 2024 Character Rules P3.1 -- SPELL REQUIREMENT MODEL + COUNT AUTHORITY.
//
// The one canonical, pure answer to "given this class's package-authored spell requirements, this
// character's level, and its persisted `spellcasting.spells[]` state, which requirements are
// satisfied, what is missing, and what is illegal?" No Builder, no Level Manager, no creation/
// progression assumption -- a pure function of already-resolved inputs, exactly the posture
// `deriveSpellSlotLevels` (app/lib/characters/spellcasting.ts) already established for slots.
//
// ---------------------------------------------------------------------------
// WHAT THIS DOES NOT DO (P3.1's own scope line)
// ---------------------------------------------------------------------------
// It does not wire a Builder spell picker, a Level Manager spell choice, a creation write, or a
// progression write -- see this phase's own report for why (P3.2/P3.3/P3.4). It does not implement
// Magic Initiate, Blessed/Druidic Warrior, or subclass spell grants -- those need their OWN facet
// authoring (SpellRequirement's own header), not a change here. It does not mark any Phase-0
// decision implemented -- the validator EXISTING is not the same as creation/progression being
// ABLE to collect the answers it validates.
//
// ---------------------------------------------------------------------------
// WHY SLOT TABLES ARE NEVER DUPLICATED HERE
// ---------------------------------------------------------------------------
// A 'spell' or 'spellbook' requirement's maximum legal spell level is NOT authored on the
// SpellRequirement (app/lib/content-rules/types.ts) at all -- it is derived, at validation time,
// from the SAME `SpellSlotLevel[]` the caller already computed (`deriveSpellSlotLevels`), by taking
// the highest `level` among entries with `max > 0`. This is correct uniformly for a full/half
// caster (the highest slot COLUMN with a nonzero count) and for a Pact caster (Warlock's own real
// text: "the chosen spells must be of a level no higher than what's shown in the table's Slot Level
// column" -- `deriveSpellSlotLevels`'s own single pact entry already carries exactly that level).
// Re-stating the slot tables as a second copy inside SpellRequirement would be the exact
// "duplicated table" this phase's own instructions forbid.
//
// ---------------------------------------------------------------------------
// WHY P2'S spellOptionVerdict IS CALLED, NEVER RE-IMPLEMENTED
// ---------------------------------------------------------------------------
// Class-list and exact-level legality (cantrips at level 0, Mystic Arcanum at its own tier level)
// are both already spellOptionVerdict's job. This file calls it for every candidate and adds
// EXACTLY one piece of new logic P2 never had: the <= comparison against the derived max spell
// level for 'spell'/'spellbook' pools (P2's own SpellCatalogueFilter.level is an EXACT match only,
// by design -- a <= operator was explicitly out of P2's scope, not an oversight).
//
// ---------------------------------------------------------------------------
// EVALUATION ORDER (why `requiresMembershipPool` is never order-dependent)
// ---------------------------------------------------------------------------
// Every requirement is evaluated in TWO passes: first every requirement with no
// `requiresMembershipPool` (every pool kind except a Wizard-shaped 'spell' pool), then every
// requirement that names one, looking its membership pool's ALREADY-COMPUTED legal identity set up
// by id. A `requiresMembershipPool` can therefore never point at another requirement that ALSO
// names one -- the real corpus has no such chain, and this function does not invent support for one.
//
// P3.2 HARDENING -- a malformed `requiresMembershipPool` (an id naming a requirement NOT PRESENT in
// the same array, a requirement naming itself, or a cycle of two or more requirements naming each
// other) is detected explicitly, BEFORE pass 2 runs, by `detectRequirementTopologyIssues` below, and
// short-circuits that requirement to `{legal: new Set(), issues: [the topology issue]}` -- no
// candidate is ever evaluated against it, and no legal acquisition of any kind can make it appear
// satisfied. This replaces the earlier posture (letting `legalSetsById.get(...) ?? new Set()` fall
// back to empty) with an EXPLICIT configuration diagnostic: the earlier fallback already prevented an
// illegal selection from becoming legal, but it reported a malformed requirement the same way it
// reports a legitimately empty, well-formed one ("you have zero legal members"), which is not
// sufficient as a diagnostic for a package authoring mistake.
//
// ---------------------------------------------------------------------------
// P3.2 REUSE -- WHY `evaluate`, `evaluateRequirements`, `toResult`, `maxSpellLevelOf`, and `flagFor`
// ARE EXPORTED
// ---------------------------------------------------------------------------
// `app/lib/characters/spell-acquisition-plan.ts` (P3.2) needs the IDENTICAL per-candidate legality
// classification and the IDENTICAL dependency-respecting evaluation order this file already uses for
// `validateSpellRequirements` -- both to judge a character's CURRENT (persisted + tentative) state,
// and to discover which CATALOGUE spells would be legal if newly selected (by evaluating the full
// catalogue AS IF every entry already carried the relevant flag, then reading which land in `legal`).
// These five are exported, narrowly, as the ONE shared implementation both modules consume --
// `validateSpellRequirements` itself is UNCHANGED in signature and behavior (refactored to call
// `evaluateRequirements` internally; every P3.1 test still exercises the identical code path and
// output). There is exactly one interpretation of count/pool/membership/filtering/legality in this
// codebase; P3.2 never re-implements any part of it.

import type { CanonicalSpellMechanics } from '../spell-mechanics/types'
import { spellOptionVerdict } from '../spell-mechanics/spell-option-eligibility'
import type { SpellRequirement, SpellRequirementPoolKind } from '../content-rules/types'
import type { SpellSlotLevel } from './spellcasting'

// One persisted `spellcasting.spells[]` entry, reduced to exactly what this validator reads.
// `identity` is the STABLE uniqueness key (see this file's own `spellIdentityOf` below) -- the
// caller builds it once, so two physical rows naming the same spell collapse to one candidate
// before this function ever sees them, and duplicate PHYSICAL rows can never inflate a pool count.
export type SpellStateCandidate = {
  identity: string
  known: boolean
  prepared: boolean
  // null means the ContentRef did not resolve to a real catalogue spell, or resolved but has no
  // mechanics (a custom/homebrew entry, or content compiled before P2's classLists enrichment).
  mechanics: CanonicalSpellMechanics | null
}

// A stable identity for a `StoredSpellEntry`-shaped value, usable both by a real caller (building
// `SpellStateCandidate[]` from `AssembledSpellEntry[]`/`StoredSpellEntry[]`) and by tests. A
// catalogue-backed spell is identified by its ContentRef; a custom spell by its typed name --
// mirrors `StoredSpellEntry`'s own "ref XOR name" rule exactly, never both.
export function spellIdentityOf(entry: { ref?: { packageId: string, slug: string }, name?: string }): string {
  if (entry.ref) return `ref:${entry.ref.packageId}::${entry.ref.slug}`
  return `name:${(entry.name ?? '').trim().toLowerCase()}`
}

export type SpellRequirementIssue =
  | { kind: 'missing'; count: number }
  | { kind: 'over-count'; count: number }
  | { kind: 'illegal-wrong-class-list'; identity: string }
  | { kind: 'illegal-wrong-level'; identity: string; level: number; maxLevel: number }
  | { kind: 'illegal-unresolved'; identity: string }
  | { kind: 'illegal-not-in-membership-pool'; identity: string; membershipPoolId: string }
  // P3.2 HARDENING -- the REQUIREMENT itself is misconfigured (never attached to a spell identity,
  // since no candidate caused this): `reason: 'unknown'` means `requiresMembershipPool` names an id
  // not present in this same requirements array; `'self'` means it names itself; `'cycle'` means it
  // and one or more other requirements in the array name each other in a loop. `membershipPoolId` is
  // always the reference that is broken (for 'self' this equals the requirement's own id). See
  // `detectRequirementTopologyIssues` below -- never attached by `evaluate` itself.
  | { kind: 'invalid-requirement-dependency'; reason: 'unknown' | 'self' | 'cycle'; membershipPoolId: string }

export type SpellRequirementResult = {
  requirementId: string
  pool: SpellRequirementPoolKind
  required: number
  // Distinct, LEGAL candidates counted toward this pool -- never a raw physical-row count.
  owned: number
  satisfied: boolean
  issues: SpellRequirementIssue[]
}

// Exported so P3.2's planner applies the IDENTICAL "unrecognized pool kind fails closed" rule when
// deciding whether to compute catalogue OPTIONS for a requirement -- never a second, independently
// maintained list of the same four strings.
export const KNOWN_POOL_KINDS: readonly SpellRequirementPoolKind[] = ['cantrip', 'spell', 'spellbook', 'arcanum']

// The flag each pool kind reads. 'spell' (ordinary leveled casting, every one of the 8 classes'
// unified "Prepared Spells of Level 1+") reads `prepared`; every other pool ('cantrip' -- the
// corpus's own "you KNOW two cantrips" wording; 'spellbook' -- membership; 'arcanum' -- a fixed,
// permanent pick, never daily-prepared) reads `known`. See SpellRequirementPoolKind's own header
// (app/lib/content-rules/types.ts) for the corpus citations this mapping rests on.
export function flagFor(pool: SpellRequirementPoolKind): 'known' | 'prepared' {
  return pool === 'spell' ? 'prepared' : 'known'
}

// 'spell' and 'spellbook' are gated by the character's own castable spell level (never hardcoded,
// never re-stated from a slot table -- see this file's own header); 'cantrip' and 'arcanum' are
// not, because their filter already names an EXACT level (0, or the tier's own level).
function isLevelGated(pool: SpellRequirementPoolKind): boolean {
  return pool === 'spell' || pool === 'spellbook'
}

export function maxSpellLevelOf(spellSlotLevels: readonly SpellSlotLevel[]): number {
  return spellSlotLevels.length ? Math.max(...spellSlotLevels.map((s) => s.level)) : 0
}

export type Evaluated = { legal: Set<string>; issues: SpellRequirementIssue[] }

// Walks every candidate once for ONE requirement, classifying each flagged candidate as legal or
// into exactly one issue kind. `membershipIdentities`, when given, additionally requires a legal
// candidate to already belong to that set (Wizard's "prepare FROM your spellbook" rule).
//
// P3.2 ALSO calls this directly (exported) to discover LEGAL OPTIONS: it builds a synthetic
// candidate per catalogue spell with the relevant flag forced true (so every catalogue entry is
// "visible" regardless of which flag the pool reads), passes the REAL, already-resolved membership
// set for a gated requirement (never a catalogue-wide recomputation -- a spell must be in the
// character's ACTUAL effective spellbook to be a legal prepared option, not merely "any spell that
// could theoretically belong to one"), and reads the resulting `legal` set as "every catalogue spell
// that would be legal if selected." Exactly the same function, zero parallel interpretation.
export function evaluate(
  requirement: SpellRequirement,
  candidates: readonly SpellStateCandidate[],
  maxSpellLevel: number,
  membershipIdentities: ReadonlySet<string> | null
): Evaluated {
  const flag = flagFor(requirement.pool)
  const gated = isLevelGated(requirement.pool)
  const legal = new Set<string>()
  const issues: SpellRequirementIssue[] = []

  for (const candidate of candidates) {
    if (!candidate[flag]) continue

    if (!candidate.mechanics) {
      issues.push({ kind: 'illegal-unresolved', identity: candidate.identity })
      continue
    }

    // A gated pool's maximum level is derived, never authored, so only `classList` is judged by
    // the shared P2 resolver here; the <= comparison against `maxSpellLevel` is this file's own,
    // applied separately below. A non-gated pool (cantrip/arcanum) hands its FULL filter (exact
    // level included) to the same resolver, which can then refuse on EITHER dimension -- reported
    // as the specific reason spellOptionVerdict itself names, never collapsed to one label.
    const filterForVerdict = gated ? { classList: requirement.filter.classList } : requirement.filter
    const verdict = spellOptionVerdict({ mechanics: candidate.mechanics, filter: filterForVerdict })
    if (!verdict.eligible) {
      if (!gated && verdict.reason === 'wrong-level') {
        issues.push({ kind: 'illegal-wrong-level', identity: candidate.identity, level: candidate.mechanics.level, maxLevel: requirement.filter.level ?? candidate.mechanics.level })
      } else {
        issues.push({ kind: 'illegal-wrong-class-list', identity: candidate.identity })
      }
      continue
    }

    if (gated && (candidate.mechanics.level < 1 || candidate.mechanics.level > maxSpellLevel)) {
      issues.push({ kind: 'illegal-wrong-level', identity: candidate.identity, level: candidate.mechanics.level, maxLevel: maxSpellLevel })
      continue
    }

    if (membershipIdentities && !membershipIdentities.has(candidate.identity)) {
      issues.push({ kind: 'illegal-not-in-membership-pool', identity: candidate.identity, membershipPoolId: requirement.requiresMembershipPool! })
      continue
    }

    legal.add(candidate.identity)
  }

  return { legal, issues }
}

export function toResult(requirement: SpellRequirement, required: number, evaluated: Evaluated): SpellRequirementResult {
  const owned = evaluated.legal.size
  const issues = [...evaluated.issues]

  if (owned < required) {
    issues.unshift({ kind: 'missing', count: required - owned })
  } else if (owned > required && requirement.pool !== 'spellbook') {
    // 'spellbook' is a cumulative MINIMUM (it never shrinks; extra entries are never illegal).
    // Every other pool is an EXACT bounded count -- over-count is a real illegality (Milestone A
    // cannot tell "you added one too many cantrips" apart from "you forgot to remove one").
    issues.unshift({ kind: 'over-count', count: owned - required })
  }

  return {
    requirementId: requirement.id,
    pool: requirement.pool,
    required,
    owned,
    satisfied: issues.length === 0,
    issues
  }
}

// P3.2 HARDENING -- the smallest pure check that a requirement's `requiresMembershipPool` chain is
// well-formed, independent of any character state. Three direct reasons, checked cheaply before any
// traversal: absent (nothing to check), self (`target === requirement.id`), unknown (`target` not in
// `byId`). A chain of two or more requirements naming each other is caught by a bounded walk from
// `requirement.id` itself, following `requiresMembershipPool` pointers and recording every id seen --
// revisiting ANY already-seen id (whether that is `requirement.id` again or some other node along the
// way) means the chain can never terminate in a legitimate membership pool, so it is reported as
// `'cycle'`. The walk is bounded by `requirements.length` (every step either adds a new id to
// `visited` or returns), so it always terminates even on malformed input -- no general graph library,
// just one small bounded loop.
export function detectRequirementTopologyIssues(requirements: readonly SpellRequirement[]): Map<string, SpellRequirementIssue> {
  const byId = new Map(requirements.map((r) => [r.id, r] as const))
  const issues = new Map<string, SpellRequirementIssue>()

  for (const requirement of requirements) {
    const target = requirement.requiresMembershipPool
    if (!target) continue

    if (target === requirement.id) {
      issues.set(requirement.id, { kind: 'invalid-requirement-dependency', reason: 'self', membershipPoolId: target })
      continue
    }
    if (!byId.has(target)) {
      issues.set(requirement.id, { kind: 'invalid-requirement-dependency', reason: 'unknown', membershipPoolId: target })
      continue
    }

    const visited = new Set<string>([requirement.id])
    let current: SpellRequirement | undefined = byId.get(target)
    let cyclic = false
    while (current) {
      if (visited.has(current.id)) {
        cyclic = true
        break
      }
      visited.add(current.id)
      const next = current.requiresMembershipPool
      current = next ? byId.get(next) : undefined
    }
    if (cyclic) {
      issues.set(requirement.id, { kind: 'invalid-requirement-dependency', reason: 'cycle', membershipPoolId: target })
    }
  }

  return issues
}

// The shared two-pass orchestration (see this file's own EVALUATION ORDER / P3.2 REUSE header
// above). Returns the raw `Evaluated` (legal identity set + issues) per requirement id, in
// requirement-declaration iteration order internally, keyed for either caller to read in whatever
// order it needs. Exported so P3.2's planner can call this SAME function against a second,
// different `candidates` array (a merged current+tentative state, or a catalogue-as-candidates
// probe) without re-deriving the dependency order, the fail-closed-on-unknown-pool rule, or the
// topology check a second time.
export function evaluateRequirements(
  requirements: readonly SpellRequirement[],
  candidates: readonly SpellStateCandidate[],
  maxSpellLevel: number
): Map<string, Evaluated> {
  const evaluated = new Map<string, Evaluated>()
  const topologyIssues = detectRequirementTopologyIssues(requirements)

  // Pass 1: every requirement with no membership dependency.
  for (const requirement of requirements) {
    if (requirement.requiresMembershipPool) continue
    if (!KNOWN_POOL_KINDS.includes(requirement.pool)) {
      // Fail closed: an unrecognized pool kind is never silently satisfied -- no candidate is ever
      // legal for it.
      evaluated.set(requirement.id, { legal: new Set(), issues: [] })
      continue
    }
    evaluated.set(requirement.id, evaluate(requirement, candidates, maxSpellLevel, null))
  }

  // Pass 2: every requirement that names a membership pool. A malformed reference (unknown/self/
  // cycle) short-circuits to an explicit configuration issue -- no candidate is evaluated against
  // it, and no candidate, tentative or otherwise, can ever populate its `legal` set. A well-formed
  // reference resolves against Pass 1's own result.
  for (const requirement of requirements) {
    if (!requirement.requiresMembershipPool) continue
    const topologyIssue = topologyIssues.get(requirement.id)
    if (topologyIssue) {
      evaluated.set(requirement.id, { legal: new Set(), issues: [topologyIssue] })
      continue
    }
    const membershipIdentities = evaluated.get(requirement.requiresMembershipPool)?.legal ?? new Set<string>()
    evaluated.set(requirement.id, evaluate(requirement, candidates, maxSpellLevel, membershipIdentities))
  }

  return evaluated
}

// Evaluates every requirement a class facet declares against one character's current level and
// persisted spell state. Pure; never mutates `candidates`. A level jump (1, 8, or 20) costs the
// identical single lookup against `totalByLevel[level - 1]` -- no sequential walk.
export function validateSpellRequirements(input: {
  requirements: readonly SpellRequirement[]
  characterLevel: number
  candidates: readonly SpellStateCandidate[]
  spellSlotLevels: readonly SpellSlotLevel[]
}): SpellRequirementResult[] {
  const { requirements, characterLevel, candidates, spellSlotLevels } = input
  const maxSpellLevel = maxSpellLevelOf(spellSlotLevels)
  const evaluated = evaluateRequirements(requirements, candidates, maxSpellLevel)

  // Original declaration order, not pass order -- callers should see requirements in the same
  // order the facet declared them.
  return requirements.map((requirement) => {
    const required = requirement.totalByLevel[characterLevel - 1] ?? 0
    if (!KNOWN_POOL_KINDS.includes(requirement.pool)) {
      return { requirementId: requirement.id, pool: requirement.pool, required, owned: 0, satisfied: false, issues: [{ kind: 'missing' as const, count: required }] }
    }
    return toResult(requirement, required, evaluated.get(requirement.id)!)
  })
}

export function allSpellRequirementsSatisfied(results: readonly SpellRequirementResult[]): boolean {
  return results.every((r) => r.satisfied)
}
