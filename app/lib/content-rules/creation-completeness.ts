// D&D 2024 Character Rules -- FAIL-CLOSED COMPLETENESS AUTHORITY (Phase 0).
//
// The one pure answer to "may this creation or progression operation complete?". It reads
// the structural decision index (`dnd5e-2024-mandatory-decisions.json`, generated from the
// XPHB corpus) and classifies each decision with the coverage rules. An operation is
// refused while any decision it owns is BLOCKED. Optional and implemented decisions never
// block. A decision no rule covers is treated as blocked (fail closed).
//
// Used by:
//   - create-v2 POST (server authority): refused before any entity is written.
//   - planProgression / confirmProgression (server authority): a Preview crossing a blocked
//     decision is invalid, and a crafted Confirm is refused by the same plan.
//   - the Builder (presentation only): shows the same reasons on the same content.
//
// Historical characters are never checked here. Read paths do not call this module.

import artifact from './dnd5e-2024-mandatory-decisions.json'
import { classifyDecision } from './mandatory-decision-coverage'
import type { DecisionRecord } from './mandatory-decisions'

export const DND5E_2024_MANDATORY_DECISIONS: readonly DecisionRecord[] = (artifact as { decisions: DecisionRecord[] }).decisions

// The corpus population: every XPHB species, class, and background, whether or not it owns a decision.
export const DND5E_2024_POPULATION: { species: readonly string[], classes: readonly string[], backgrounds: readonly string[] } = (artifact as { population: { species: string[], classes: string[], backgrounds: string[] } }).population

export type UnresolvedDecision = {
  decisionId: string
  owner: DecisionRecord['owner']
  family: DecisionRecord['family']
  source: string
  level: number
  rule: string
  reason: string
  ledgerIds: readonly string[]
}

function unresolvedOf(decisions: readonly DecisionRecord[]): UnresolvedDecision[] {
  const out: UnresolvedDecision[] = []
  for (const d of decisions) {
    const c = classifyDecision(d)
    if (c.status !== 'blocked') continue
    out.push({ decisionId: d.id, owner: d.owner, family: d.family, source: d.source, level: d.level, rule: c.rule, reason: c.reason, ledgerIds: c.ledgerIds })
  }
  return out
}

// ---------------------------------------------------------------------------
// Creation: species + class + background, plus the feats acquired at creation.
// ---------------------------------------------------------------------------

export type CreationSelection = {
  species: string
  class: string
  background: string
  // Feat slugs acquired at creation (fixed Origin feat and content choices). Their own
  // decisions are owned by the creation.
  feats?: readonly string[]
}

export function creationUnresolvedDecisions(
  selection: CreationSelection,
  decisions: readonly DecisionRecord[] = DND5E_2024_MANDATORY_DECISIONS
): UnresolvedDecision[] {
  const feats = selection.feats ?? []
  const owned = decisions.filter((d) => {
    if (d.owner.kind === 'species') return d.owner.slug === selection.species
    if (d.owner.kind === 'class') return d.owner.slug === selection.class && d.level <= 1
    if (d.owner.kind === 'background') return d.owner.slug === selection.background
    if (d.owner.kind === 'feat') return d.grantedBy === selection.background || (!d.grantedBy && feats.includes(d.owner.slug))
    return false
  })
  return unresolvedOf(owned)
}

// ---------------------------------------------------------------------------
// Progression: decisions crossed by the levels (from, to], plus feats acquired in the transition.
// ---------------------------------------------------------------------------

export type ProgressionSelection = {
  classSlug: string
  // The subclass in effect for the crossed levels: persisted, or chosen in this transition.
  subclassSlug: string | null
  fromLevel: number
  toLevel: number
  // Feat slugs acquired in this transition (their own nested decisions must be complete).
  feats?: readonly string[]
}

export function progressionUnresolvedDecisions(
  selection: ProgressionSelection,
  decisions: readonly DecisionRecord[] = DND5E_2024_MANDATORY_DECISIONS
): UnresolvedDecision[] {
  const crossed = (d: DecisionRecord) => d.level > selection.fromLevel && d.level <= selection.toLevel
  const feats = selection.feats ?? []
  const owned = decisions.filter((d) => {
    if (d.owner.kind === 'class') return d.owner.slug === selection.classSlug && crossed(d)
    if (d.owner.kind === 'subclass') return selection.subclassSlug !== null && d.owner.slug === selection.subclassSlug && crossed(d)
    if (d.owner.kind === 'feat') return feats.includes(d.owner.slug)
    return false
  })
  return unresolvedOf(owned)
}

// User-facing wording, shared by the server refusal and the Builder so they cannot drift apart.
// A decision family is named in plain words; a feature name is shown as the player knows it. A
// corpus field path ("startingProficiencies.armor", "ability") and any rule or status id are
// internal and are never shown.
export function decisionPhrase(family: DecisionRecord['family']): string {
  switch (family) {
    case 'weapon-mastery': return 'a Weapon Mastery choice'
    case 'feature-option': return 'a feature option choice'
    case 'spell-choice':
    case 'spell-grant':
    case 'spell-count': return 'a spell choice'
    case 'accumulating-option': return 'an option choice'
    case 'proficiency-choice':
    case 'proficiency-grant': return 'a tool, armor, or weapon proficiency'
    case 'ability-distribution': return 'an ability score bonus'
    case 'variant-choice': return 'a lineage or ancestry choice'
    case 'damage-type-choice': return 'a damage type choice'
    case 'equipment-package': return 'starting equipment'
    case 'feat-choice': return 'a feat choice'
    case 'feat-grant': return 'a fixed feat'
    case 'language-choice': return 'a language choice'
    case 'expertise-choice': return 'an expertise choice'
    default: return 'a required choice'
  }
}

export function blockerPhrase(unresolved: Pick<UnresolvedDecision, 'family' | 'source'>): string {
  const named = /^[A-Z]/.test(unresolved.source) ? ` (${unresolved.source})` : ''
  return `requires ${decisionPhrase(unresolved.family)}${named}`
}

// The summary every refusal shows. Grouped by the entity that owns each decision, so every
// blocking species, class, background, or feat is named (never truncated away), capped in total.
export function describeUnresolved(unresolved: readonly UnresolvedDecision[], cap = 8): string {
  // Owners in the order a character is built: species, class, background, then feats.
  const rank: Record<DecisionRecord['owner']['kind'], number> = { species: 0, class: 1, subclass: 2, background: 3, feat: 4 }
  const ordered = [...unresolved].sort((x, y) => rank[x.owner.kind] - rank[y.owner.kind])
  const byOwner = new Map<string, string[]>()
  for (const u of ordered) {
    const phrases = byOwner.get(u.owner.name) ?? []
    const phrase = blockerPhrase(u)
    if (!phrases.includes(phrase)) phrases.push(phrase)
    byOwner.set(u.owner.name, phrases)
  }
  const parts: string[] = []
  let shown = 0
  for (const [owner, phrases] of byOwner) {
    const room = cap - shown
    if (room <= 0) break
    const taken = phrases.slice(0, room)
    shown += taken.length
    parts.push(`${owner} ${taken.join('; ')}`)
  }
  const total = [...byOwner.values()].reduce((n, phrases) => n + phrases.length, 0)
  const more = total > shown ? ` and ${total - shown} more` : ''
  return `This character cannot be completed yet. Eldra cannot record a required choice: ${parts.join('. ')}${more}.`
}
