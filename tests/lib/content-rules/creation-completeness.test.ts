// PHASE 0 -- the fail-closed authority, UNSTUBBED, over the real XPHB corpus. These tests state
// the production impact of the contract: which species, classes, and backgrounds can be created
// today, and why the rest cannot. They also prove the positive path: a combination whose every
// decision is implemented or optional completes.

import { describe, expect, it } from 'vitest'
import {
  DND5E_2024_MANDATORY_DECISIONS,
  creationUnresolvedDecisions,
  describeUnresolved,
  progressionUnresolvedDecisions,
  type UnresolvedDecision
} from '../../../app/lib/content-rules/creation-completeness'
import { classifyDecision } from '../../../app/lib/content-rules/mandatory-decision-coverage'

const DECISIONS = DND5E_2024_MANDATORY_DECISIONS
const NONE = '-'
const CLASSES = ['barbarian', 'bard', 'cleric', 'druid', 'fighter', 'monk', 'paladin', 'ranger', 'rogue', 'sorcerer', 'warlock', 'wizard'].map((c) => `${c}-xphb`)
const SPECIES = ['aasimar', 'dragonborn', 'dwarf', 'elf', 'gnome', 'goliath', 'halfling', 'human', 'orc', 'tiefling'].map((s) => `${s}-xphb`)
const BACKGROUNDS = ['acolyte', 'artisan', 'charlatan', 'criminal', 'entertainer', 'farmer', 'guard', 'guide', 'hermit', 'merchant', 'noble', 'sage', 'sailor', 'scribe', 'soldier', 'wayfarer'].map((b) => `${b}-xphb`)

const ownOf = (kind: 'species' | 'class' | 'background', slug: string) => creationUnresolvedDecisions(
  kind === 'species' ? { species: slug, class: NONE, background: NONE }
    : kind === 'class' ? { species: NONE, class: slug, background: NONE }
      : { species: NONE, class: NONE, background: slug }
)

describe('the refusal wording is plain and names the owner (production impact counts live in creation-availability.test.ts)', () => {
  it('the refusal for Elf names the lineage choice in plain words, with no internal identifier', () => {
    const elf = describeUnresolved(ownOf('species', 'elf-xphb'))
    expect(elf).toMatch(/cannot be completed yet/)
    expect(elf).toMatch(/lineage or ancestry choice/)
    expect(elf).not.toMatch(/blk:|ENGINE_BLOCKED|CONTENT_BLOCKED|additionalSpells|variants|species\./)
  })
})

describe('the fail-closed reasons are specific to the decision that blocks', () => {
  it('a Cleric owns the Divine Order feature option (Level 1)', () => {
    const cleric = ownOf('class', 'cleric-xphb')
    expect(cleric.some((u) => u.source === 'Divine Order' && u.level === 1 && u.family === 'feature-option')).toBe(true)
  })
  it('a Background owns an ability score bonus', () => {
    expect(ownOf('background', 'criminal-xphb').some((u) => u.family === 'ability-distribution')).toBe(true)
  })
  // P1: Crafter's tool choice is representable (artisan facet choice), so it is classified
  // implemented and owned by the granted feat, not an unresolved blocker.
  it('an Origin background whose feat has a choice owns that choice through the granted feat, now implemented', () => {
    const crafter = DND5E_2024_MANDATORY_DECISIONS.filter((d) => d.owner.slug === 'crafter-xphb' && d.grantedBy === 'artisan-xphb')
    expect(crafter.length).toBeGreaterThan(0)
    expect(crafter.every((d) => classifyDecision(d).status === 'implemented')).toBe(true)
    expect(ownOf('background', 'artisan-xphb').some((u) => u.owner.kind === 'feat' && u.owner.slug === 'crafter-xphb')).toBe(false)
  })
  it('the creationUnresolved result is limited to the chosen entity (nothing from an unselected one)', () => {
    const wizardOnly = creationUnresolvedDecisions({ species: 'dwarf-xphb', class: 'wizard-xphb', background: NONE })
    expect(wizardOnly.every((u) => u.owner.kind === 'class' || u.owner.slug === 'dwarf-xphb')).toBe(true)
    expect(wizardOnly.some((u) => u.owner.kind === 'background')).toBe(false)
  })
})

describe('the positive path -- a combination whose decisions are all represented completes', () => {
  it('when only implemented or optional decisions remain, nothing is unresolved', () => {
    const represented = DECISIONS.filter((d) => {
      const status = classifyDecision(d).status
      return status === 'implemented' || status === 'optional'
    })
    expect(creationUnresolvedDecisions({ species: 'dwarf-xphb', class: 'fighter-xphb', background: 'criminal-xphb', feats: [] }, represented)).toEqual([])
  })
  it('a Fighter with the Level-1 Fighting Style and the Criminal Origin feat is fully represented except the Weapon Mastery and background choices', () => {
    const fighter = ownOf('class', 'fighter-xphb')
    expect(fighter.map((u) => u.rule)).toContain('blk:weapon-mastery')
    expect(fighter.some((u) => u.rule === 'impl:fighting-style' || u.rule === 'impl:class-skill-choice')).toBe(false)
  })
})

describe('progression -- the levels crossed decide what must be recorded', () => {
  const prog = (classSlug: string, fromLevel: number, toLevel: number, subclassSlug: string | null = null, feats: string[] = []): UnresolvedDecision[] =>
    progressionUnresolvedDecisions({ classSlug, subclassSlug, fromLevel, toLevel, feats })

  it('a Fighter moving from 1 to 2 crosses no unrecordable decision', () => {
    expect(prog('fighter-xphb', 1, 2)).toEqual([])
  })
  it('a Fighter crossing Level 3 as a Battle Master owns Combat Superiority', () => {
    expect(prog('fighter-xphb', 2, 3, 'battle-master-xphb').some((u) => u.source === 'Combat Superiority')).toBe(true)
  })
  it('a Champion crossing Level 3 owns nothing unrecordable', () => {
    expect(prog('fighter-xphb', 2, 3, 'champion-xphb')).toEqual([])
  })
  it('a Cleric crossing Level 2 owns the prepared-spell increase', () => {
    expect(prog('cleric-xphb', 1, 2).some((u) => u.family === 'spell-count')).toBe(true)
  })
  it('a feat acquired in the transition brings its own nested decisions (Fey-Touched)', () => {
    expect(prog('fighter-xphb', 3, 4, null, ['fey-touched-xphb']).some((u) => u.owner.slug === 'fey-touched-xphb')).toBe(true)
  })
  it('a subclass chosen in this transition is the one whose decisions apply', () => {
    expect(prog('fighter-xphb', 2, 3, null)).toEqual([])
    expect(prog('fighter-xphb', 2, 3, 'battle-master-xphb')).not.toEqual([])
  })
})
