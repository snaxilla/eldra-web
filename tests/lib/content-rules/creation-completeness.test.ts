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
  // HUMAN + GENERIC SELECTED-FEAT ACTIVATION PHASE -- Human (this test's own prior example) is now
  // fully creation-complete (species 10/10, see creation-availability.test.ts), so it has nothing
  // left to refuse. Every species/class/background is now individually creation-complete too, so
  // this demonstration moves to a genuinely still-blocked decision found dynamically (never
  // hardcoded by owner name) rather than naming a species that may itself be reclassified again.
  // A4 -- REMAINING MANDATORY DECISION CLOSURE leaves the real corpus's own first (id-sorted)
  // blocked decision class-owned (Magical Secrets, Bard, Level 10) rather than species-owned
  // (this test's own prior premise) -- `progressionUnresolvedDecisions` covers a class-owned
  // decision at any level, so the demonstration moves to that authority rather than
  // `creationUnresolvedDecisions`, re-verified live rather than assumed.
  it('a real refusal names its decision in plain words, with no internal identifier', () => {
    const blocked = DECISIONS.find((d) => classifyDecision(d).status === 'blocked')
    expect(blocked, 'at least one real decision must still be blocked for this test to mean anything').toBeDefined()
    const described = describeUnresolved(progressionUnresolvedDecisions({
      classSlug: blocked!.owner.kind === 'class' ? blocked!.owner.slug : NONE,
      subclassSlug: blocked!.owner.kind === 'subclass' ? blocked!.owner.slug : null,
      fromLevel: 0,
      toLevel: 20,
      feats: blocked!.owner.kind === 'feat' ? [blocked!.owner.slug] : []
    }))
    expect(described).toMatch(/cannot be completed yet/)
    expect(described).not.toMatch(/blk:|ENGINE_BLOCKED|CONTENT_BLOCKED|additionalSpells|variants|species\./)
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
  // A4 -- Combat Superiority is now representable (choice:subclass.accumulating-option), so a
  // Battle Master crossing Level 3 owns nothing unrecordable at this structural layer any more
  // (the real maneuver answer is still required, just by the MECHANICAL authority, not Phase 0).
  it('a Fighter crossing Level 3 as a Battle Master owns nothing unrecordable (Combat Superiority is now implemented)', () => {
    expect(prog('fighter-xphb', 2, 3, 'battle-master-xphb').some((u) => u.source === 'Combat Superiority')).toBe(false)
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
  // still required, just by the MECHANICAL authority (planSpellAcquisition), not by Phase 0. D&D
  // 2024 Character Rules A1 -- Ritual Caster (this test's own former example) is now implemented
  // too (`impl:feat-spell-ritual-caster`). CHARACTER MECHANICS PHASE A5 -- Keen Mind's own
  // "gain proficiency UNLESS already held, then Expertise instead" clause is now implemented too,
  // via the new, generic `choice:feat.skill-or-expertise` ChoiceSet -- there is no longer any
  // feat-owned decision left blocked anywhere in the real corpus (re-verified live), so this test
  // moves to the SAME positive-path demonstration the Fey-Touched test below already uses.
  it('a feat acquired in the transition brings its own nested decisions, now resolved (Keen Mind)', () => {
    expect(prog('fighter-xphb', 3, 4, null, ['keen-mind-xphb']).some((u) => u.owner.slug === 'keen-mind-xphb')).toBe(false)
  })
  it('a feat whose own nested spell decisions are now implemented owns nothing unrecordable (Fey-Touched)', () => {
    expect(prog('fighter-xphb', 3, 4, null, ['fey-touched-xphb']).some((u) => u.owner.slug === 'fey-touched-xphb')).toBe(false)
  })
  // A4 -- Battle Master (this test's own prior example) was fully representable at this
  // structural layer (Combat Superiority), so this moved to Warrior of Shadow (Monk): its own
  // Level-3 resource-gated Darkness grant was a genuine STOP (no generic primitive for a spell
  // usable only via a specific finite resource pool, never a normal slot). CHARACTER MECHANICS
  // PHASE A5, Phase 3 -- that primitive now exists (FixedSpellGrant.fundedByResource/
  // slotFundingAllowed, character-cast.ts's own resolveCastFunding), and Warrior of Shadow's own
  // Darkness grant is authored with it (Focus-Point-funded, no slot fallback -- Monks have no
  // spell slots at all), so this subclass now owns nothing unrecordable here either, mirroring
  // Battle Master's own precedent exactly.
  it('a subclass chosen in this transition is the one whose decisions apply', () => {
    expect(prog('monk-xphb', 2, 3, null)).toEqual([])
    expect(prog('monk-xphb', 2, 3, 'warrior-of-shadow-xphb')).toEqual([])
  })
})
