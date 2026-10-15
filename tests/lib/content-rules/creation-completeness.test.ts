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
  // PURE-AUTHORING SPECIES SWEEP -- Elf's own lineage choice is now representable (choice:species
  // .feature-option); Tiefling replaces it here as the one species whose lineage choice remains
  // genuinely unrecorded (its own Fiendish Legacy pick is not authored this phase).
  it('the refusal for Tiefling names the lineage choice in plain words, with no internal identifier', () => {
    const tiefling = describeUnresolved(ownOf('species', 'tiefling-xphb'))
    expect(tiefling).toMatch(/cannot be completed yet/)
    expect(tiefling).toMatch(/lineage or ancestry choice/)
    expect(tiefling).not.toMatch(/blk:|ENGINE_BLOCKED|CONTENT_BLOCKED|additionalSpells|variants|species\./)
  })
})

describe('the fail-closed reasons are specific to the decision that blocks', () => {
  // FEATURE-OPTION PHASE: Divine Order is representable (the generic choice:class.feature-option
  // ChoiceSet, effect: activate-source), so it is classified implemented and no longer unresolved.
  it('a Cleric\'s Divine Order feature option (Level 1) is representable, now implemented', () => {
    const divineOrder = DND5E_2024_MANDATORY_DECISIONS.find((d) => d.owner.slug === 'cleric-xphb' && d.source === 'Divine Order' && d.family === 'feature-option')
    expect(divineOrder).toBeDefined()
    expect(classifyDecision(divineOrder!).status).toBe('implemented')
    expect(ownOf('class', 'cleric-xphb').some((u) => u.source === 'Divine Order' && u.family === 'feature-option')).toBe(false)
  })
  // P7: the Background ability distribution is representable (one bounded choice, activating
  // Background Sources), so it is classified implemented and no longer unresolved.
  it('a Background\'s ability score bonus is representable, now implemented', () => {
    const ability = DND5E_2024_MANDATORY_DECISIONS.find((d) => d.owner.slug === 'criminal-xphb' && d.family === 'ability-distribution')
    expect(ability).toBeDefined()
    expect(classifyDecision(ability!).status).toBe('implemented')
    expect(ownOf('background', 'criminal-xphb').some((u) => u.family === 'ability-distribution')).toBe(false)
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
  // WEAPON MASTERY PHASE -- Weapon Mastery is representable (the generic choice:class.weapon-
  // mastery ChoiceSet, category: items), so a Fighter's own class-owned decisions are now all
  // implemented or optional, and this test's prior "except Weapon Mastery" premise is obsolete.
  it('a Fighter\'s own class-owned decisions (Fighting Style, skill choice, Weapon Mastery) are all representable, now implemented', () => {
    const fighter = ownOf('class', 'fighter-xphb')
    expect(fighter).toEqual([])
    const weaponMastery = DND5E_2024_MANDATORY_DECISIONS.find((d) => d.owner.slug === 'fighter-xphb' && d.family === 'weapon-mastery')
    expect(weaponMastery).toBeDefined()
    expect(classifyDecision(weaponMastery!).status).toBe('implemented')
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
  // D&D 2024 Character Rules P3.5 -- the prepared-spell increase this test named is now
  // `impl:spell-count` (mandatory-decision-coverage.ts), backed by the real, deployed
  // SpellRequirement count authority (P3.1-P3.4) -- it is no longer an UNRESOLVABLE decision
  // Phase 0 must block, so a Cleric crossing Level 2 owns nothing unrecordable at the Phase-0
  // structural layer (the real spell answer is still required, just by the MECHANICAL authority,
  // proven in character-progression-plan-spell-acquisition.test.ts, not by this structural one).
  it('a Cleric crossing Level 2 owns nothing unrecordable at the Phase-0 layer (the prepared-spell increase is now implemented)', () => {
    expect(prog('cleric-xphb', 1, 2)).toEqual([])
  })
  // FEAT-OWNED SPELL ACQUISITION PHASE -- Fey-Touched's own nested spell decisions are now
  // implemented (fixedSpellGrants + a plain, ungated spellRequirements entry), so acquiring it no
  // longer brings an UNRESOLVABLE decision at this structural layer -- the real spell answer is
  // still required, just by the MECHANICAL authority (planSpellAcquisition), not by Phase 0. Ritual
  // Caster remains genuinely blocked (a real level-gated growth table discovery still mis-models
  // as 5 flat creation-time decisions -- see `blk:feat-nested-spells`'s own updated reason), so it
  // proves the SAME "a feat acquired in the transition brings its own nested decisions" mechanism
  // this test originally existed to prove.
  it('a feat acquired in the transition brings its own nested decisions (Ritual Caster)', () => {
    expect(prog('fighter-xphb', 3, 4, null, ['ritual-caster-xphb']).some((u) => u.owner.slug === 'ritual-caster-xphb')).toBe(true)
  })
  it('a feat whose own nested spell decisions are now implemented owns nothing unrecordable (Fey-Touched)', () => {
    expect(prog('fighter-xphb', 3, 4, null, ['fey-touched-xphb']).some((u) => u.owner.slug === 'fey-touched-xphb')).toBe(false)
  })
  it('a subclass chosen in this transition is the one whose decisions apply', () => {
    expect(prog('fighter-xphb', 2, 3, null)).toEqual([])
    expect(prog('fighter-xphb', 2, 3, 'battle-master-xphb')).not.toEqual([])
  })
})
