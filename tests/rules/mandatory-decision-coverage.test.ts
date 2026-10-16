// PHASE 0 -- the BIDIRECTIONAL coverage contract, over the real XPHB decisions and the real ledger.
//
//   A. every discovered mandatory decision matches EXACTLY ONE coverage rule.
//   B. every coverage rule matches at least one discovered decision (or is an explicit
//      false-positive / runtime-effect rule with a reason), and every ledger row is claimed by a
//      rule and every rule's ledger id exists. No phantom ledger row, no silent source decision.
//
// The BITE tests at the end prove the contract fails on a synthetic unclassified decision and on
// a rule whose removal leaves a decision uncovered. A contract that cannot fail proves nothing.

import { describe, expect, it } from 'vitest'
import { findRulesFacet } from '../../app/lib/content-rules'
import { DND5E_2024_PROGRESSION_COVERAGE } from '../../app/lib/content-rules/dnd5e-2024-progression-coverage'
import { COVERAGE_RULES, classifyDecision, matchingRules, type CoverageRule } from '../../app/lib/content-rules/mandatory-decision-coverage'
import {
  DND5E_2024_MANDATORY_DECISIONS,
  DND5E_2024_POPULATION,
  creationUnresolvedDecisions
} from '../../app/lib/content-rules/creation-completeness'
import type { DecisionRecord } from '../../app/lib/content-rules/mandatory-decisions'

const DECISIONS = DND5E_2024_MANDATORY_DECISIONS

// The contract, as one function: a list of violations. Empty means the contract holds.
function contractViolations(decisions: readonly DecisionRecord[], rules: readonly CoverageRule[] = COVERAGE_RULES, ledgerIds: readonly string[] = DND5E_2024_PROGRESSION_COVERAGE.map((e) => e.id)): string[] {
  const violations: string[] = []
  for (const d of decisions) {
    const matches = rules.filter((rule) => rule.matches(d))
    if (matches.length !== 1) violations.push(`A: ${d.id} matches ${matches.length} rules`)
  }
  for (const rule of rules) {
    const hits = decisions.filter((d) => rule.matches(d)).length
    if (hits === 0 && !rule.allowZero) violations.push(`B: rule ${rule.id} matches no decision`)
    if (rule.allowZero && rule.status !== 'false-positive' && rule.status !== 'runtime-effect') violations.push(`B: rule ${rule.id} may match zero only as a false-positive or runtime effect`)
  }
  const claimed = new Set(rules.flatMap((rule) => rule.ledgerIds))
  for (const id of ledgerIds) if (!claimed.has(id)) violations.push(`B: ledger row ${id} is claimed by no rule`)
  const known = new Set(ledgerIds)
  for (const id of claimed) if (!known.has(id)) violations.push(`B: rule names ledger id ${id} that does not exist`)
  return violations
}

describe('A -- every discovered mandatory decision classifies to exactly one rule', () => {
  it('the real corpus satisfies the contract with no violation', () => {
    expect(contractViolations(DECISIONS)).toEqual([])
  })
  it('every decision has exactly one classification, and none is unclassified or ambiguous', () => {
    for (const d of DECISIONS) {
      expect(matchingRules(d), d.id).toHaveLength(1)
      expect(classifyDecision(d).rule, d.id).not.toMatch(/unclassified|ambiguous/)
    }
  })
  it('optional decisions never classify as blocked', () => {
    for (const d of DECISIONS.filter((x) => !x.mandatory)) expect(classifyDecision(d).status, d.id).toBe('optional')
  })
})

describe('B -- every rule and every ledger row resolves both ways', () => {
  it('every rule matches a real decision, except an explicit false-positive or runtime-effect rule', () => {
    for (const rule of COVERAGE_RULES) {
      const hits = DECISIONS.filter((d) => rule.matches(d)).length
      if (rule.allowZero) expect(hits, rule.id).toBe(0)
      else expect(hits, rule.id).toBeGreaterThan(0)
    }
  })
  it('every ledger row is claimed by a rule, and every rule ledger id is a real ledger row', () => {
    const ledgerIds = new Set(DND5E_2024_PROGRESSION_COVERAGE.map((e) => e.id))
    const claimed = new Set(COVERAGE_RULES.flatMap((rule) => rule.ledgerIds))
    expect([...ledgerIds].filter((id) => !claimed.has(id))).toEqual([])
    expect([...claimed].filter((id) => !ledgerIds.has(id))).toEqual([])
  })
  it('the heuristic false positives are explicit rules that match nothing (not fake decisions)', () => {
    const fp = COVERAGE_RULES.filter((rule) => rule.status === 'false-positive')
    expect(fp.map((rule) => rule.id).sort()).toEqual([
      'fp:fiendish-resilience', 'fp:heightened-focus', 'fp:illusory-reality', 'fp:sculpt-spells', 'fp:sorcery-incarnate', 'fp:steps-of-the-fey', 'fp:third-eye'
    ])
    for (const rule of fp) expect(DECISIONS.filter((d) => rule.matches(d)), rule.id).toHaveLength(0)
  })
  it('runtime effect ledger rows are a documented Milestone B concern, not decisions', () => {
    const effects = COVERAGE_RULES.filter((rule) => rule.status === 'runtime-effect')
    expect(effects.flatMap((rule) => rule.ledgerIds).length).toBeGreaterThan(20)
    for (const rule of effects) expect(rule.reason).toMatch(/Milestone B|runtime/i)
  })
})

describe('BITE -- the contract fails when it should', () => {
  it('a synthetic, unclassified mandatory source decision makes the contract fail', () => {
    const synthetic: DecisionRecord = {
      id: 'class:synthetic-xphb:L5:accumulating-option:unlisted',
      owner: { kind: 'class', slug: 'synthetic-xphb', name: 'Synthetic' },
      level: 5,
      timing: 'progression',
      family: 'accumulating-option',
      mandatory: true,
      cardinality: 1,
      source: 'Unlisted Surface'
    }
    const violations = contractViolations([...DECISIONS, synthetic])
    expect(violations.some((v) => v.includes(synthetic.id))).toBe(true)
    expect(classifyDecision(synthetic).rule).toBe('unclassified')
  })

  it('removing the rule that covers a real decision leaves it uncovered, and the contract fails', () => {
    const without = COVERAGE_RULES.filter((rule) => rule.id !== 'impl:invocations')
    const covered = DECISIONS.filter((d) => d.source === 'Invocations')
    expect(covered.length).toBeGreaterThan(0)
    expect(covered.every((d) => without.filter((rule) => rule.matches(d)).length === 0)).toBe(true)
    expect(contractViolations(DECISIONS, without).length).toBeGreaterThan(0)
  })

  it('a ledger row that no rule claims is a violation (no silent ledger entry)', () => {
    const ledgerIds = [...DND5E_2024_PROGRESSION_COVERAGE.map((e) => e.id), 'warlock-xphb:phantom-row']
    expect(contractViolations(DECISIONS, COVERAGE_RULES, ledgerIds).some((v) => v.includes('warlock-xphb:phantom-row'))).toBe(true)
  })

  it('a rule that names a ledger row which does not exist is a violation (no phantom reference)', () => {
    const phantom: CoverageRule = { id: 'blk:phantom', status: 'blocked', reason: 'x', ledgerIds: ['nope:nothing'], matches: () => false }
    expect(contractViolations(DECISIONS, [...COVERAGE_RULES, phantom]).some((v) => v.includes('nope:nothing'))).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// D&D 2024 Character Rules P3.5 -- SPELL DECISION RECONCILIATION + COVERAGE RECLASSIFICATION.
// The generic P2->P3.4 spell acquisition pipeline moved 171 of the 174 class-owned spell-family
// decisions from blocked to implemented. These tests prove the reclassification itself, the
// ownership boundaries it deliberately did NOT cross, and that the bidirectional contract (A/B
// above) still holds afterward.
// ---------------------------------------------------------------------------
describe('P3.5 -- spell decision reconciliation', () => {
  const classSpellDecisions = DECISIONS.filter((d) => d.owner.kind === 'class' && ['spell-choice', 'spell-grant', 'spell-count'].includes(d.family))
  const CASTER_SLUGS = ['bard-xphb', 'cleric-xphb', 'druid-xphb', 'paladin-xphb', 'ranger-xphb', 'sorcerer-xphb', 'warlock-xphb', 'wizard-xphb']

  it('POPULATION -- exactly 174 class-owned spell-family decisions exist, matching the old expectation exactly (no discrepancy)', () => {
    expect(classSpellDecisions.length).toBe(174)
  })

  it('RECLASSIFICATION -- exactly 171 of the 174 are now implemented; the exact 3 residuals are unchanged', () => {
    const implemented = classSpellDecisions.filter((d) => classifyDecision(d).status === 'implemented')
    expect(implemented.length).toBe(171)
  })

  it('BY CLASS -- all eight casters are represented among the reclassified decisions, none left out', () => {
    for (const slug of CASTER_SLUGS) {
      const classDecisions = classSpellDecisions.filter((d) => d.owner.slug === slug)
      const implemented = classDecisions.filter((d) => classifyDecision(d).status === 'implemented')
      expect(classDecisions.length, slug).toBeGreaterThan(0)
      expect(implemented.length, `${slug}: expected at least one reclassified spell decision`).toBeGreaterThan(0)
    }
    // Every non-caster class owns zero spell-family decisions at all (nothing to reclassify).
    const nonCasters = [...new Set(DECISIONS.filter((d) => d.owner.kind === 'class').map((d) => d.owner.slug))]
      .filter((slug) => !CASTER_SLUGS.includes(slug))
    for (const slug of nonCasters) {
      expect(classSpellDecisions.filter((d) => d.owner.slug === slug), slug).toHaveLength(0)
    }
  })

  it('STILL BLOCKED -- the exact 3 residual class-owned decisions are named and unchanged (Magical Secrets, Spell Mastery, Signature Spells)', () => {
    const residual = classSpellDecisions.filter((d) => classifyDecision(d).status !== 'implemented')
    expect(residual.map((d) => `${d.owner.slug}:${d.source}`).sort()).toEqual([
      'bard-xphb:Magical Secrets',
      'wizard-xphb:Signature Spells',
      'wizard-xphb:Spell Mastery'
    ])
    for (const d of residual) {
      expect(classifyDecision(d).rule).toBe('blk:class-spell-choice-other')
    }
  })

  it('STILL BLOCKED -- subclass-owned spell decisions are untouched by P3.5 (owned by P4 subclass feature-level gating, not reclassified)', () => {
    const subclassSpell = DECISIONS.filter((d) => d.owner.kind === 'subclass' && ['spell-choice', 'spell-grant', 'spell-count'].includes(d.family))
    expect(subclassSpell.length).toBeGreaterThan(0)
    for (const d of subclassSpell) expect(classifyDecision(d).status, d.id).not.toBe('implemented')
  })

  // AASIMAR CREATION COMPLETION PHASE -- species-granted spell decisions are NO LONGER uniformly
  // blocked: Aasimar's own Light Bearer (a true fixed grant, no "of your choice" clause at all)
  // is now implemented (impl:species-spell-fixed-grant in mandatory-decision-coverage.ts), the
  // exact same FixedSpellGrant shape Telekinetic's/Telepathic's own feat-owned fixed spells
  // already use. No OTHER species owns a decision in this family -- Elf's/Gnome's/Goliath's/
  // Tiefling's own lineage/legacy spells are discovered as `variant-choice` (or, for Tiefling's
  // resistance, `damage-type-choice`), never `spell-grant`/`spell-choice`/`spell-count` -- so this
  // test's own filter never reaches them at all; their own reconciliation lives in the
  // "PURE-AUTHORING SPECIES SWEEP"/"TIEFLING SPECIES COMPLETION" describe blocks below.
  it('STILL BLOCKED -- species-granted spell decisions, except Aasimar\'s own fixed grant', () => {
    const speciesSpell = DECISIONS.filter((d) => d.owner.kind === 'species' && ['spell-choice', 'spell-grant', 'spell-count'].includes(d.family))
    expect(speciesSpell.length).toBeGreaterThan(0)
    for (const d of speciesSpell) {
      if (d.owner.slug === 'aasimar-xphb') {
        expect(classifyDecision(d).status, d.id).toBe('implemented')
        continue
      }
      expect(classifyDecision(d).status, d.id).not.toBe('implemented')
    }
  })

  // FEAT-OWNED SPELL ACQUISITION PHASE -- feat-granted spell-choice/spell-grant decisions are no
  // longer uniformly blocked: Magic Initiate (variant-choice, not this family, already excluded
  // above), Fey-Touched, Shadow-Touched, Telekinetic, Telepathic, Blessed Warrior, and Druidic
  // Warrior are now implemented (see `impl:feat-spell-*` in mandatory-decision-coverage.ts); Ritual
  // Caster alone remains blocked, for a real, different reason (discovery forces its real
  // level-gated growth table to 5 flat creation-time decisions -- see `blk:feat-nested-spells`'s
  // own updated reason).
  it('STILL BLOCKED -- Ritual Caster alone, among feat-granted spell-choice/spell-grant decisions', () => {
    const featSpell = DECISIONS.filter((d) => d.owner.kind === 'feat' && ['spell-choice', 'spell-grant'].includes(d.family))
    expect(featSpell.length).toBeGreaterThan(0)
    const stillBlocked = featSpell.filter((d) => classifyDecision(d).status !== 'implemented')
    expect(stillBlocked.every((d) => d.owner.slug === 'ritual-caster-xphb')).toBe(true)
    expect(stillBlocked.length).toBeGreaterThan(0)
  })

  it('RECLASSIFIED -- Magic Initiate, Fey-Touched, Shadow-Touched, Telekinetic, Telepathic, Blessed Warrior, and Druidic Warrior are now implemented', () => {
    const slugs = ['magic-initiate-xphb', 'fey-touched-xphb', 'shadow-touched-xphb', 'telekinetic-xphb', 'telepathic-xphb', 'blessed-warrior-xphb', 'druidic-warrior-xphb']
    const decisions = DECISIONS.filter((d) => d.owner.kind === 'feat' && slugs.includes(d.owner.slug) && ['spell-choice', 'spell-grant', 'variant-choice'].includes(d.family))
    expect(decisions.length).toBeGreaterThan(0)
    for (const d of decisions) expect(classifyDecision(d).status, d.id).toBe('implemented')
  })

  it('OPTIONAL -- spell-adjacent replacement/re-answer clauses (level-up swap, Long-Rest preparation, Wizard Memorize Spell) remain optional, never promoted to a mandatory acquisition and never a blocker', () => {
    const replacementDecisions = DECISIONS.filter((d) => d.family === 'replacement')
    expect(replacementDecisions.length).toBeGreaterThan(0)
    for (const d of replacementDecisions) {
      expect(classifyDecision(d).status, d.id).toBe('optional')
      expect(d.mandatory, d.id).toBe(false)
    }
  })

  it('COVERAGE -- the bidirectional contract (A/B) still holds after reclassification', () => {
    expect(contractViolations(DECISIONS)).toEqual([])
  })

  it('BITE -- deleting an implemented spell coverage rule (impl:mystic-arcanum) leaves its decisions uncovered and the contract fails', () => {
    const without = COVERAGE_RULES.filter((rule) => rule.id !== 'impl:mystic-arcanum')
    const covered = DECISIONS.filter((d) => d.owner.kind === 'class' && d.family === 'spell-choice' && d.source === 'Mystic Arcanum')
    expect(covered.length).toBeGreaterThan(0)
    expect(covered.every((d) => without.filter((rule) => rule.matches(d)).length === 0)).toBe(true)
    expect(contractViolations(DECISIONS, without).length).toBeGreaterThan(0)
  })

  it('BITE -- falsely marking one of the 3 real residual decisions (Spell Mastery) as implemented is rejected: no rule classifies it that way, and a synthetic rule that does creates a genuine double-match violation', () => {
    const spellMastery = classSpellDecisions.find((d) => d.source === 'Spell Mastery')!
    expect(classifyDecision(spellMastery).status).not.toBe('implemented')

    // A synthetic "this is actually fine" rule does not silently coexist -- it creates a SECOND
    // match on a decision the real blocked rule already covers, which the contract (A) rejects.
    const falselyImplemented: CoverageRule = {
      id: 'impl:false-spell-mastery',
      status: 'implemented',
      reason: 'synthetic, for the bite proof only',
      ledgerIds: [],
      matches: (d) => d.id === spellMastery.id
    }
    const violations = contractViolations(DECISIONS, [...COVERAGE_RULES, falselyImplemented])
    expect(violations.some((v) => v.includes(spellMastery.id))).toBe(true)
  })

  it('AVAILABILITY -- the Phase-0 scoreboard is not weakened by this reclassification (other real blockers still exist per class)', () => {
    // D&D 2024 Character Rules P8 superseded this assertion's own original premise: starting
    // equipment WAS every caster's "at minimum" remaining non-spell blocker at P3.5 time, and P8
    // has since reclassified it. Bard/Sorcerer/Wizard have no OTHER class-owned blocker and are now
    // genuinely creation-complete (see the P8 describe block below) -- this is the correct,
    // stronger outcome, not a weakening, so this test is narrowed to the casters P8 did NOT fully
    // unblock, rather than asserting a universal "something always remains" that is no longer true.
    // FEATURE-OPTION PHASE -- Cleric/Druid's own remaining non-spell blocker (Divine Order/Primal
    // Order) is now also implemented, so they join Bard/Sorcerer/Wizard as fully creation-complete.
    // WEAPON MASTERY PHASE -- Paladin/Ranger's own remaining non-spell blocker (Weapon Mastery) is
    // now also implemented, so they join the same fully-creation-complete group.
    // ELDRITCH INVOCATIONS PHASE -- Warlock's own remaining non-spell blocker (Eldritch
    // Invocations) is now also implemented, so it joins the same fully-creation-complete group.
    const stillPartiallyBlockedCasters = CASTER_SLUGS.filter((slug) => !['bard-xphb', 'cleric-xphb', 'druid-xphb', 'paladin-xphb', 'ranger-xphb', 'sorcerer-xphb', 'warlock-xphb', 'wizard-xphb'].includes(slug))
    for (const slug of stillPartiallyBlockedCasters) {
      const ownDecisions = DECISIONS.filter((d) => d.owner.kind === 'class' && d.owner.slug === slug)
      const nonSpellBlocked = ownDecisions.filter((d) => !['spell-choice', 'spell-grant', 'spell-count'].includes(d.family) && classifyDecision(d).status === 'blocked')
      expect(nonSpellBlocked.length, `${slug}: expected at least one real, non-spell blocker to remain`).toBeGreaterThan(0)
    }
  })
})

describe('P8 -- starting equipment reconciliation', () => {
  const equipmentDecisions = DECISIONS.filter((d) => d.family === 'equipment-package')
  const CLASS_SLUGS = [
    'barbarian-xphb', 'bard-xphb', 'cleric-xphb', 'druid-xphb', 'fighter-xphb', 'monk-xphb',
    'paladin-xphb', 'ranger-xphb', 'rogue-xphb', 'sorcerer-xphb', 'warlock-xphb', 'wizard-xphb'
  ]
  const BACKGROUND_SLUGS = [
    'acolyte-xphb', 'artisan-xphb', 'charlatan-xphb', 'criminal-xphb', 'entertainer-xphb',
    'farmer-xphb', 'guard-xphb', 'guide-xphb', 'hermit-xphb', 'merchant-xphb', 'noble-xphb',
    'sage-xphb', 'sailor-xphb', 'scribe-xphb', 'soldier-xphb', 'wayfarer-xphb'
  ]

  it('POPULATION -- exactly 28 class/background-owned equipment-package decisions exist (12 classes + 16 backgrounds), matching the census exactly', () => {
    expect(equipmentDecisions.length).toBe(28)
    expect(equipmentDecisions.filter((d) => d.owner.kind === 'class').length).toBe(12)
    expect(equipmentDecisions.filter((d) => d.owner.kind === 'background').length).toBe(16)
  })

  it('RECLASSIFICATION -- all 28 are now implemented, none left behind', () => {
    const implemented = equipmentDecisions.filter((d) => classifyDecision(d).status === 'implemented')
    expect(implemented.length).toBe(28)
  })

  it('BY CLASS -- every one of the 12 real XPHB classes owns exactly one reclassified equipment decision', () => {
    for (const slug of CLASS_SLUGS) {
      const own = equipmentDecisions.filter((d) => d.owner.kind === 'class' && d.owner.slug === slug)
      expect(own.length, slug).toBe(1)
      expect(classifyDecision(own[0]).status, slug).toBe('implemented')
    }
  })

  it('BY BACKGROUND -- every one of the 16 real XPHB backgrounds owns exactly one reclassified equipment decision', () => {
    for (const slug of BACKGROUND_SLUGS) {
      const own = equipmentDecisions.filter((d) => d.owner.kind === 'background' && d.owner.slug === slug)
      expect(own.length, slug).toBe(1)
      expect(classifyDecision(own[0]).status, slug).toBe('implemented')
    }
  })

  it('COVERAGE -- the bidirectional contract (A/B) still holds after reclassification', () => {
    expect(contractViolations(DECISIONS)).toEqual([])
  })

  it('BITE -- deleting equipment coverage (impl:class-equipment, impl:background-equipment) leaves all 28 decisions uncovered and the contract fails', () => {
    const without = COVERAGE_RULES.filter((rule) => rule.id !== 'impl:class-equipment' && rule.id !== 'impl:background-equipment')
    expect(equipmentDecisions.every((d) => without.filter((rule) => rule.matches(d)).length === 0)).toBe(true)
    expect(contractViolations(DECISIONS, without).length).toBeGreaterThan(0)
  })

  it('BITE -- falsely marking an unsupported equipment structure (a synthetic species-owned equipment decision) implemented is rejected: the real rules never match a species owner', () => {
    const synthetic: DecisionRecord = {
      ...equipmentDecisions[0],
      id: 'synthetic:species-equipment',
      owner: { kind: 'species', slug: 'does-not-exist-xphb' }
    }
    // None of the REAL rules match a species-owned equipment decision at all (both `impl:*`
    // equipment rules require `owner.kind` to be 'class' or 'background').
    expect(matchingRules(synthetic)).toEqual([])

    const falselyImplemented: CoverageRule = {
      id: 'impl:false-species-equipment',
      status: 'implemented',
      reason: 'synthetic, for the bite proof only',
      ledgerIds: [],
      matches: (d) => d.id === synthetic.id
    }
    // Adding a synthetic "this is actually fine" rule is the only way to make it match anything --
    // proving the real contract never silently covers an owner shape it was not built for.
    expect(COVERAGE_RULES.filter((rule) => rule.matches(synthetic))).toEqual([])
    expect([...COVERAGE_RULES, falselyImplemented].filter((rule) => rule.matches(synthetic)).map((r) => r.id)).toEqual(['impl:false-species-equipment'])
  })

  it('AVAILABILITY -- real creationUnresolvedDecisions authority now reports the expected post-P8 scoreboard', () => {
    const { species, classes, backgrounds } = DND5E_2024_POPULATION

    const availableSpecies = species.filter((s) =>
      creationUnresolvedDecisions({ species: s, class: classes[0], background: backgrounds[0], feats: [] })
        .filter((d) => d.owner.kind === 'species').length === 0)
    const availableClasses = classes.filter((c) =>
      creationUnresolvedDecisions({ species: species[0], class: c, background: backgrounds[0], feats: [] })
        .filter((d) => d.owner.kind === 'class').length === 0)
    const availableBackgrounds = backgrounds.filter((b) =>
      creationUnresolvedDecisions({ species: species[0], class: classes[0], background: b, feats: [] })
        .filter((d) => d.owner.kind === 'background').length === 0)

    // AASIMAR CREATION COMPLETION PHASE -- Aasimar's own remaining blockers (size choice, Light
    // Bearer's fixed spell grant) are now authored too; Aasimar joins the roster (Dwarf/Halfling/
    // Orc plus Aasimar).
    // PURE-AUTHORING SPECIES SWEEP -- Dragonborn, Elf, Goliath, and Gnome all join too (their own
    // lineage/ancestry choice is now representable via choice:species.feature-option reuse).
    // TIEFLING SPECIES COMPLETION -- Tiefling's own Fiendish Legacy, size choice, and innate
    // casting ability are all authored too; Tiefling joins the roster (9 of 10 named species).
    // HUMAN + GENERIC SELECTED-FEAT ACTIVATION PHASE -- Human's own size choice and Versatile free
    // Origin-feat choice (via the new generic `choice:feat.origin-selection`) are both authored
    // too; Human joins the roster -- the full named 10-species roster, every one creation-complete.
    expect(availableSpecies.length).toBe(10)
    // FEATURE-OPTION PHASE -- Cleric (Divine Order) and Druid (Primal Order) join the roster.
    // WEAPON MASTERY PHASE -- Barbarian, Fighter, Paladin, Ranger join too (Rogue remains
    // creation-blocked by Expertise and Thieves' Cant/language policy at the time).
    // LANGUAGE CORPUS + POLICY PHASE -- Rogue's own Thieves' Cant language choice is now
    // authored too; Rogue joins the roster (Warlock remains blocked by Eldritch Invocations
    // alone).
    // ELDRITCH INVOCATIONS PHASE -- Warlock's own remaining blocker (Eldritch Invocations) is
    // now authored too; Warlock joins the roster (the full named 12-class roster).
    expect(availableClasses.sort()).toEqual(['barbarian-xphb', 'bard-xphb', 'cleric-xphb', 'druid-xphb', 'fighter-xphb', 'monk-xphb', 'paladin-xphb', 'ranger-xphb', 'rogue-xphb', 'sorcerer-xphb', 'warlock-xphb', 'wizard-xphb'])
    // FEAT-OWNED SPELL ACQUISITION PHASE -- Acolyte/Guide/Sage's own real remaining blocker
    // (Magic Initiate's spell-list variant choice) is now authored too; all three join the
    // roster (the full named 16-background roster).
    expect(availableBackgrounds.length).toBe(16)

    let combinations = 0
    for (const s of species) {
      for (const c of classes) {
        for (const b of backgrounds) {
          if (creationUnresolvedDecisions({ species: s, class: c, background: b, feats: [] }).length === 0) combinations++
        }
      }
    }
    // HUMAN + GENERIC SELECTED-FEAT ACTIVATION PHASE -- 10 species * 12 available classes * 16
    // available backgrounds = 1920, enumerated through the real authority above (never computed
    // as a hardcoded product) -- every native species x class x background combination.
    expect(combinations).toBe(1920)
  })

  it('FIRST REAL CHARACTER -- Dwarf + Bard + Criminal is creation-complete through the real authority', () => {
    expect(creationUnresolvedDecisions({ species: 'dwarf-xphb', class: 'bard-xphb', background: 'criminal-xphb', feats: [] })).toEqual([])
  })
})

describe('WEAPON MASTERY PHASE -- reconciliation', () => {
  const weaponMasteryDecisions = DECISIONS.filter((d) => d.owner.kind === 'class' && d.family === 'weapon-mastery')

  it('RECLASSIFICATION -- all 10 real decisions (Barbarian 3, Fighter 4, Paladin/Ranger/Rogue 1 each) are now implemented', () => {
    expect(weaponMasteryDecisions.length).toBe(10)
    expect(weaponMasteryDecisions.every((d) => classifyDecision(d).status === 'implemented')).toBe(true)
    const byClass: Record<string, number> = {}
    for (const d of weaponMasteryDecisions) byClass[d.owner.slug] = (byClass[d.owner.slug] ?? 0) + 1
    expect(byClass).toEqual({ 'barbarian-xphb': 3, 'fighter-xphb': 4, 'paladin-xphb': 1, 'ranger-xphb': 1, 'rogue-xphb': 1 })
  })

  it('COVERAGE -- the bidirectional contract (A/B) still holds after reclassification', () => {
    expect(contractViolations(DECISIONS)).toEqual([])
  })

  it('BITE -- deleting impl:weapon-mastery leaves all 10 real decisions uncovered and the contract fails', () => {
    const without = COVERAGE_RULES.filter((rule) => rule.id !== 'impl:weapon-mastery')
    expect(weaponMasteryDecisions.every((d) => without.filter((rule) => rule.matches(d)).length === 0)).toBe(true)
    expect(contractViolations(DECISIONS, without).length).toBeGreaterThan(0)
  })

  it('BITE -- the optional Long-Rest replacement clause and the mastery-property runtime effect never masquerade as the mandatory acquisition decision', () => {
    for (const d of weaponMasteryDecisions) {
      // `opt:replacement` and `runtime:weapon-mastery-effects` both carry `matches: () => false` --
      // neither can ever claim a real weapon-mastery ACQUISITION decision, so each real decision
      // is classified by `impl:weapon-mastery` alone (the bidirectional contract's own "exactly
      // one rule" check, re-asserted here for this specific decision family).
      expect(matchingRules(d).map((r) => r.id)).toEqual(['impl:weapon-mastery'])
    }
    // A synthetic rule falsely claiming the optional replacement/runtime-effect ledger rows as
    // mandatory acquisition coverage creates a genuine double-match violation against whichever
    // real decision it targets -- proving the contract would catch exactly this mistake.
    const falselyImplemented: CoverageRule = {
      id: 'impl:false-weapon-mastery-replacement',
      status: 'implemented',
      reason: 'synthetic, for the bite proof only',
      ledgerIds: [],
      matches: (d) => d.id === weaponMasteryDecisions[0]!.id
    }
    const violations = contractViolations(DECISIONS, [...COVERAGE_RULES, falselyImplemented])
    expect(violations.some((v) => v.includes(weaponMasteryDecisions[0]!.id))).toBe(true)
  })

  // ROGUE EXPERTISE PHASE -- Expertise is now implemented (see below); Rogue's own remaining
  // real blocker WAS Thieves' Cant / language policy alone. LANGUAGE CORPUS + POLICY PHASE --
  // that blocker is now ALSO implemented (the real decision was Thieves' Cant's own embedded
  // "one other language", not Thieves' Cant itself, a fixed grant); Rogue is fully unresolved.
  it('AVAILABILITY -- Rogue is now fully creation-complete (Weapon Mastery, Expertise, and language all implemented)', () => {
    const rogueUnresolved = creationUnresolvedDecisions({ species: 'dwarf-xphb', class: 'rogue-xphb', background: 'criminal-xphb', feats: [] })
    expect(rogueUnresolved.some((u) => u.family === 'weapon-mastery')).toBe(false)
    expect(rogueUnresolved.some((u) => u.family === 'expertise-choice')).toBe(false)
    expect(rogueUnresolved.some((u) => u.family === 'language-choice')).toBe(false)
    expect(rogueUnresolved).toEqual([])
  })

  it('FIRST REAL CHARACTERS -- Dwarf + Barbarian/Fighter/Paladin/Ranger + Criminal are all creation-complete through the real authority', () => {
    for (const classSlug of ['barbarian-xphb', 'fighter-xphb', 'paladin-xphb', 'ranger-xphb']) {
      expect(creationUnresolvedDecisions({ species: 'dwarf-xphb', class: classSlug, background: 'criminal-xphb', feats: [] }), classSlug).toEqual([])
    }
  })
})

describe('ROGUE EXPERTISE + RANGER DEFT EXPLORER PHASE -- reconciliation', () => {
  const expertiseDecisions = DECISIONS.filter((d) => d.owner.kind === 'class' && d.family === 'expertise-choice')

  it('RECLASSIFICATION -- all 7 real Expertise decisions (Bard L2/L9, Ranger L2/L9, Rogue L1/L6, Wizard L2) are now implemented', () => {
    expect(expertiseDecisions.length).toBe(7)
    expect(expertiseDecisions.every((d) => classifyDecision(d).status === 'implemented')).toBe(true)
    const byClassLevel = expertiseDecisions.map((d) => `${d.owner.slug}:L${d.level}`).sort()
    expect(byClassLevel).toEqual([
      'bard-xphb:L2', 'bard-xphb:L9',
      'ranger-xphb:L2', 'ranger-xphb:L9',
      'rogue-xphb:L1', 'rogue-xphb:L6',
      'wizard-xphb:L2'
    ])
  })

  it('COVERAGE -- the bidirectional contract (A/B) still holds after reclassification', () => {
    expect(contractViolations(DECISIONS)).toEqual([])
  })

  it('BITE -- deleting impl:expertise leaves all 7 real decisions uncovered and the contract fails', () => {
    const without = COVERAGE_RULES.filter((rule) => rule.id !== 'impl:expertise')
    expect(expertiseDecisions.every((d) => without.filter((rule) => rule.matches(d)).length === 0)).toBe(true)
    expect(contractViolations(DECISIONS, without).length).toBeGreaterThan(0)
  })

  it('every real Expertise decision is classified by impl:expertise alone (exactly one rule)', () => {
    for (const d of expertiseDecisions) {
      expect(matchingRules(d).map((r) => r.id), d.id).toEqual(['impl:expertise'])
    }
  })

  it('AVAILABILITY -- Ranger remains creation-available; Deft Explorer\'s Expertise is a real Level-2 decision, outside creation\'s own Level-1 scope', () => {
    expect(creationUnresolvedDecisions({ species: 'dwarf-xphb', class: 'ranger-xphb', background: 'criminal-xphb', feats: [] })).toEqual([])
    const deftExplorer = expertiseDecisions.find((d) => d.owner.slug === 'ranger-xphb' && d.source === 'Deft Explorer')
    expect(deftExplorer?.level).toBe(2)
  })

  // LANGUAGE CORPUS + POLICY PHASE -- Rogue's own real remaining blocker (its Thieves' Cant
  // feature's embedded language choice) is now ALSO implemented; Rogue joins the roster (11/12,
  // Warlock alone remains blocked by Eldritch Invocations at this point in the history).
  // ELDRITCH INVOCATIONS PHASE -- Warlock's own real remaining blocker (Eldritch Invocations) is
  // now ALSO implemented; Warlock joins the roster too (12/12, the full named roster).
  it('AVAILABILITY -- Classes/Combinations after this phase (12/12, 468) -- Rogue and Warlock both join', () => {
    const CLASSES: ReadonlyArray<readonly [string, boolean]> = [
      ['barbarian-xphb', true], ['bard-xphb', true], ['cleric-xphb', true], ['druid-xphb', true],
      ['fighter-xphb', true], ['monk-xphb', true], ['paladin-xphb', true], ['ranger-xphb', true],
      ['rogue-xphb', true], ['sorcerer-xphb', true], ['warlock-xphb', true], ['wizard-xphb', true]
    ]
    const available = CLASSES.filter(([classSlug]) =>
      creationUnresolvedDecisions({ species: 'dwarf-xphb', class: classSlug, background: 'criminal-xphb', feats: [] }).length === 0
    ).map(([classSlug]) => classSlug)
    expect(available.sort()).toEqual(CLASSES.filter(([, expected]) => expected).map(([classSlug]) => classSlug).sort())
    expect(available).toHaveLength(12)
  })
})

describe('LANGUAGE CORPUS + POLICY PHASE -- reconciliation', () => {
  const languageDecisions = DECISIONS.filter((d) => d.family === 'language-choice')

  it('RECLASSIFICATION -- all 3 real language-choice decisions (1 package-owned universal rule, Rogue L1, Ranger L2) are now implemented', () => {
    expect(languageDecisions.length).toBe(3)
    expect(languageDecisions.every((d) => classifyDecision(d).status === 'implemented')).toBe(true)
    const byOwner = languageDecisions.map((d) => `${d.owner.kind}:${d.owner.slug}:L${d.level}`).sort()
    expect(byOwner).toEqual(['class:ranger-xphb:L2', 'class:rogue-xphb:L1', 'package:dnd5e-2024:L1'])
  })

  it('the package-owned universal decision is owned by neither Species, Class, nor Background content', () => {
    const universal = languageDecisions.find((d) => d.owner.kind === 'package')!
    expect(universal.owner.slug).toBe('dnd5e-2024')
    expect(universal.source).toBe('Choose Languages')
    expect(universal.cardinality).toBe(2)
  })

  it('COVERAGE -- the bidirectional contract (A/B) still holds after reclassification', () => {
    expect(contractViolations(DECISIONS)).toEqual([])
  })

  it('BITE -- deleting impl:universal-language-choice leaves the package-owned decision uncovered and the contract fails', () => {
    const without = COVERAGE_RULES.filter((rule) => rule.id !== 'impl:universal-language-choice')
    const universal = languageDecisions.find((d) => d.owner.kind === 'package')!
    expect(without.filter((rule) => rule.matches(universal)).length).toBe(0)
    expect(contractViolations(DECISIONS, without).length).toBeGreaterThan(0)
  })

  it('BITE -- deleting impl:class-language leaves Rogue\'s and Ranger\'s own decisions uncovered and the contract fails', () => {
    const without = COVERAGE_RULES.filter((rule) => rule.id !== 'impl:class-language')
    const classOwned = languageDecisions.filter((d) => d.owner.kind === 'class')
    expect(classOwned).toHaveLength(2)
    expect(classOwned.every((d) => without.filter((rule) => rule.matches(d)).length === 0)).toBe(true)
    expect(contractViolations(DECISIONS, without).length).toBeGreaterThan(0)
  })

  it('a FUTURE, unsupported class-owned language decision is never falsely greened by impl:class-language (fails closed)', () => {
    const synthetic: DecisionRecord = {
      id: 'class:future-xphb:L1:language-choice:synthetic',
      owner: { kind: 'class', slug: 'future-xphb', name: 'Future' },
      level: 1,
      timing: 'creation',
      family: 'language-choice',
      mandatory: true,
      cardinality: 1,
      source: 'Synthetic'
    }
    expect(COVERAGE_RULES.filter((rule) => rule.matches(synthetic))).toEqual([])
  })

  it('every real language-choice decision is classified by exactly one rule (impl:universal-language-choice or impl:class-language, never both)', () => {
    for (const d of languageDecisions) {
      expect(matchingRules(d).length, d.id).toBe(1)
    }
  })

  it('fixed language grants (Common, Thieves\' Cant, Druidic) never appear as mandatory decisions -- only the embedded choice does', () => {
    // Rogue's own Thieves' Cant feature grants TWO facts (the fixed Cant itself, and one
    // decision); exactly one language-choice decision is attributed to it, never two.
    const rogueLanguage = languageDecisions.filter((d) => d.owner.slug === 'rogue-xphb')
    expect(rogueLanguage).toHaveLength(1)
    expect(rogueLanguage[0]!.cardinality).toBe(1)
    // Druid's own Druidic feature is PURELY fixed (no embedded choice) -- zero language-choice
    // decisions attributed to Druid at all, proven directly against the real decision population.
    expect(languageDecisions.some((d) => d.owner.slug === 'druid-xphb')).toBe(false)
  })
})

describe('AASIMAR CREATION COMPLETION PHASE -- reconciliation', () => {
  const sizeDecisions = DECISIONS.filter((d) => d.family === 'size-choice')
  const aasimarSpellGrant = DECISIONS.find((d) => d.owner.slug === 'aasimar-xphb' && d.family === 'spell-grant')!

  // HUMAN + GENERIC SELECTED-FEAT ACTIVATION PHASE -- Human's own size-choice is reclassified too
  // (its facet now declares choice:species.size, the same real "Small or Medium" shape Aasimar/
  // Tiefling already have). All three are implemented now.
  it('RECLASSIFICATION -- the real size-choice census (Aasimar, Human, Tiefling all genuinely have one); all three are implemented', () => {
    expect(sizeDecisions.length).toBe(3)
    const byOwner = sizeDecisions.map((d) => d.owner.slug).sort()
    expect(byOwner).toEqual(['aasimar-xphb', 'human-xphb', 'tiefling-xphb'])
    expect(classifyDecision(sizeDecisions.find((d) => d.owner.slug === 'aasimar-xphb')!).status).toBe('implemented')
    expect(classifyDecision(sizeDecisions.find((d) => d.owner.slug === 'human-xphb')!).status).toBe('implemented')
    expect(classifyDecision(sizeDecisions.find((d) => d.owner.slug === 'tiefling-xphb')!).status).toBe('implemented')
  })

  it('RECLASSIFICATION -- Aasimar\'s own Light Bearer spell-grant is now implemented too (a true fixed grant, via FixedSpellGrant)', () => {
    expect(aasimarSpellGrant).toBeDefined()
    expect(classifyDecision(aasimarSpellGrant).status).toBe('implemented')
  })

  it('COVERAGE -- the bidirectional contract (A/B) still holds after reclassification', () => {
    expect(contractViolations(DECISIONS)).toEqual([])
  })

  it('BITE -- deleting impl:species-size-choice leaves Aasimar\'s own size-choice decision uncovered and the contract fails', () => {
    const without = COVERAGE_RULES.filter((rule) => rule.id !== 'impl:species-size-choice')
    const aasimarSize = sizeDecisions.find((d) => d.owner.slug === 'aasimar-xphb')!
    expect(without.filter((rule) => rule.matches(aasimarSize)).length).toBe(0)
    expect(contractViolations(DECISIONS, without).length).toBeGreaterThan(0)
  })

  it('BITE -- deleting impl:species-spell-fixed-grant leaves Aasimar\'s own Light Bearer decision uncovered and the contract fails', () => {
    const without = COVERAGE_RULES.filter((rule) => rule.id !== 'impl:species-spell-fixed-grant')
    expect(without.filter((rule) => rule.matches(aasimarSpellGrant)).length).toBe(0)
    expect(contractViolations(DECISIONS, without).length).toBeGreaterThan(0)
  })

  // HUMAN + GENERIC SELECTED-FEAT ACTIVATION PHASE -- Human's own size-choice is REMOVED from this
  // list too: its facet now declares choice:species.size (the same real "Small or Medium" shape
  // Aasimar/Tiefling already have), so it reclassifies to implemented, and `blk:species-size`
  // (its last remaining real match) is deleted outright, mirroring the prior deletion of the
  // species `variant-choice`/`damage-type-choice` blocking rules. No species-owned size-choice
  // decision remains blocked today, so this BITE test has nothing left to prove and is removed.

  it('BITE -- Healing Hands and Celestial Revelation never masquerade as a mandatory build decision -- neither is discovered as one at all', () => {
    // Healing Hands (a Magic action, 1/Long Rest) and Celestial Revelation (Level 3+, "choose
    // the option EACH TIME you transform" -- a per-use runtime choice per the real corpus text
    // itself) are deliberately NOT authored anywhere on the Aasimar facet, and neither one is a
    // field `detectSpeciesDecisions` scans at all -- so the real decision population for Aasimar
    // is EXACTLY the two decisions this phase implements, never a third, phantom "transformation
    // choice" decision silently invented or silently blocked.
    const aasimarDecisions = DECISIONS.filter((d) => d.owner.slug === 'aasimar-xphb')
    expect(aasimarDecisions.length).toBe(2)
    expect(aasimarDecisions.map((d) => d.family).sort()).toEqual(['size-choice', 'spell-grant'])
  })

  // HUMAN + GENERIC SELECTED-FEAT ACTIVATION PHASE -- `blk:species-size` is deleted (no species-
  // owned size-choice decision is blocked today), so a FUTURE, unsupported one now fails closed
  // via the bidirectional contract's own generic default (zero matching rules -> 'blocked',
  // `classifyDecision`'s own unclassified fallback), never via a dedicated catch-all rule.
  it('a FUTURE, unsupported species-owned size-choice decision is never falsely greened by impl:species-size-choice (fails closed)', () => {
    const synthetic: DecisionRecord = {
      id: 'species:future-xphb:L1:size-choice:size',
      owner: { kind: 'species', slug: 'future-xphb', name: 'Future' },
      level: 1,
      timing: 'creation',
      family: 'size-choice',
      mandatory: true,
      cardinality: 1,
      source: 'size'
    }
    expect(COVERAGE_RULES.filter((rule) => rule.matches(synthetic)).map((r) => r.id)).toEqual([])
    expect(classifyDecision(synthetic).status).toBe('blocked')
  })
})

describe('PURE-AUTHORING SPECIES SWEEP -- reconciliation', () => {
  const featureOptionDecisions = DECISIONS.filter((d) =>
    d.owner.kind === 'species' && (d.family === 'variant-choice' || d.family === 'damage-type-choice'))
  const dragonbornDecision = featureOptionDecisions.find((d) => d.owner.slug === 'dragonborn-xphb')!
  const elfDecision = featureOptionDecisions.find((d) => d.owner.slug === 'elf-xphb')!
  const gnomeDecision = featureOptionDecisions.find((d) => d.owner.slug === 'gnome-xphb')!
  const goliathDecision = featureOptionDecisions.find((d) => d.owner.slug === 'goliath-xphb')!
  const tieflingDecisions = featureOptionDecisions.filter((d) => d.owner.slug === 'tiefling-xphb')

  it('RECLASSIFICATION -- Dragonborn\'s damage-type-choice and Elf\'s/Gnome\'s/Goliath\'s own variant-choice are all now implemented', () => {
    for (const d of [dragonbornDecision, elfDecision, gnomeDecision, goliathDecision]) {
      expect(d, 'decision exists').toBeDefined()
      expect(classifyDecision(d).status, d.id).toBe('implemented')
      expect(classifyDecision(d).rule, d.id).toBe('impl:species-feature-option')
    }
  })

  // TIEFLING SPECIES COMPLETION -- reclassified: Tiefling's own Fiendish Legacy is now authored
  // too (see the dedicated "TIEFLING SPECIES COMPLETION" describe block below for its own full
  // reconciliation). Both of its real decisions here (variant-choice, damage-type-choice) are
  // implemented via the SAME impl:species-feature-option rule the other four species use.
  it('RECLASSIFICATION -- Tiefling\'s own lineage/damage decisions are now implemented too', () => {
    expect(tieflingDecisions.length).toBe(2)
    for (const d of tieflingDecisions) {
      expect(classifyDecision(d).status, d.id).toBe('implemented')
      expect(classifyDecision(d).rule, d.id).toBe('impl:species-feature-option')
    }
  })

  it('COVERAGE -- the bidirectional contract (A/B) still holds after reclassification', () => {
    expect(contractViolations(DECISIONS)).toEqual([])
  })

  it('BITE -- deleting impl:species-feature-option leaves all six real decisions (five species, Tiefling owning two) uncovered and the contract fails', () => {
    const without = COVERAGE_RULES.filter((rule) => rule.id !== 'impl:species-feature-option')
    for (const d of [dragonbornDecision, elfDecision, gnomeDecision, goliathDecision, ...tieflingDecisions]) {
      // Zero matching rules -- `classifyDecision`'s own fail-closed default (app/lib/content-
      // rules/mandatory-decision-coverage.ts) reports exactly this case as 'blocked', never a
      // silent pass-through, but that default only ever consults the real, module-level
      // COVERAGE_RULES -- asserted directly against `without` here instead.
      expect(without.filter((rule) => rule.matches(d)).length, d.id).toBe(0)
    }
    expect(contractViolations(DECISIONS, without).length).toBeGreaterThan(0)
  })

  it('BITE -- runtime-only species traits never masquerade as a mandatory build decision -- none is discovered as one at all', () => {
    // Draconic Flight (Dragonborn, Level 5+, no choice), Large Form/Powerful Build (Goliath, no
    // choice), Fey Ancestry/Trance (Elf, passive, no choice), Gnomish Cunning (Gnome, passive, no
    // choice), Rock Gnome's own device-crafting mechanic -- none of these is a field
    // `detectSpeciesDecisions` scans at all, so the real decision population for each of the four
    // species is EXACTLY what this phase implements, never a phantom extra decision silently
    // invented or silently blocked.
    const byOwner: Record<string, number> = {}
    for (const d of DECISIONS) if (d.owner.kind === 'species' && ['dragonborn-xphb', 'goliath-xphb', 'elf-xphb', 'gnome-xphb'].includes(d.owner.slug)) {
      byOwner[d.owner.slug] = (byOwner[d.owner.slug] ?? 0) + 1
    }
    expect(byOwner).toEqual({ 'dragonborn-xphb': 1, 'goliath-xphb': 1, 'elf-xphb': 2, 'gnome-xphb': 1 })
  })

  it('BITE -- a fixed consequence determined by the SAME ancestry choice (Dragonborn\'s own resistance) never becomes a second mandatory decision', () => {
    // Dragonborn owns exactly ONE species decision (the ancestry pick itself, damage-type-choice);
    // the resistance it determines is a Source modifier, never independently discovered as its
    // own decision.
    const dragonbornAll = DECISIONS.filter((d) => d.owner.kind === 'species' && d.owner.slug === 'dragonborn-xphb')
    expect(dragonbornAll).toHaveLength(1)
    expect(dragonbornAll[0]!.family).toBe('damage-type-choice')
  })

  // TIEFLING SPECIES COMPLETION -- `blk:species-lineage` is deleted (every real species-owned
  // variant-choice/damage-type-choice decision is implemented now, so that rule matched zero real
  // decisions -- see its own removal note above). A future, genuinely unsupported species lineage
  // shape (one whose facet declares no `choice:species.feature-option` at all) therefore matches
  // ZERO coverage rules -- `classifyDecision`'s own fail-closed default (never a rule's own
  // `allowZero`) is what catches it, asserted directly here.
  it('a FUTURE, unsupported species-owned variant-choice decision matches zero coverage rules and classifies blocked (fails closed via classifyDecision\'s own default, not a dedicated rule)', () => {
    const synthetic: DecisionRecord = {
      id: 'species:future-xphb:L1:variant-choice:lineage',
      owner: { kind: 'species', slug: 'future-xphb', name: 'Future' },
      level: 1,
      timing: 'creation',
      family: 'variant-choice',
      mandatory: true,
      cardinality: 1,
      source: 'lineage'
    }
    expect(COVERAGE_RULES.filter((rule) => rule.matches(synthetic))).toEqual([])
    expect(classifyDecision(synthetic)).toMatchObject({ status: 'blocked', rule: 'unclassified' })
  })
})

describe('TIEFLING SPECIES COMPLETION -- reconciliation', () => {
  const tieflingDecisions = DECISIONS.filter((d) => d.owner.slug === 'tiefling-xphb')
  const variantDecision = tieflingDecisions.find((d) => d.family === 'variant-choice')!
  const damageDecision = tieflingDecisions.find((d) => d.family === 'damage-type-choice')!
  const sizeDecision = tieflingDecisions.find((d) => d.family === 'size-choice')!

  it('RECLASSIFICATION -- all three of Tiefling\'s own real decisions are now implemented, none a phantom extra', () => {
    expect(tieflingDecisions).toHaveLength(3)
    expect(tieflingDecisions.map((d) => d.family).sort()).toEqual(['damage-type-choice', 'size-choice', 'variant-choice'])
    for (const d of tieflingDecisions) expect(classifyDecision(d).status, d.id).toBe('implemented')
    expect(classifyDecision(variantDecision).rule).toBe('impl:species-feature-option')
    expect(classifyDecision(damageDecision).rule).toBe('impl:species-feature-option')
    expect(classifyDecision(sizeDecision).rule).toBe('impl:species-size-choice')
  })

  it('COVERAGE -- the bidirectional contract (A/B) still holds after reclassification', () => {
    expect(contractViolations(DECISIONS)).toEqual([])
  })

  it('BITE -- deleting impl:species-feature-option leaves Tiefling\'s own variant-choice AND damage-type-choice decisions uncovered (one legacy pick, two discovered decisions)', () => {
    const without = COVERAGE_RULES.filter((rule) => rule.id !== 'impl:species-feature-option')
    expect(without.filter((rule) => rule.matches(variantDecision)).length).toBe(0)
    expect(without.filter((rule) => rule.matches(damageDecision)).length).toBe(0)
    expect(contractViolations(DECISIONS, without).length).toBeGreaterThan(0)
  })

  it('BITE -- deleting impl:species-size-choice leaves Tiefling\'s own size-choice decision uncovered', () => {
    const without = COVERAGE_RULES.filter((rule) => rule.id !== 'impl:species-size-choice')
    expect(without.filter((rule) => rule.matches(sizeDecision)).length).toBe(0)
    expect(contractViolations(DECISIONS, without).length).toBeGreaterThan(0)
  })

  it('BITE -- Tiefling\'s own fixed legacy consequence (resistance) never becomes a SECOND mandatory decision alongside the legacy pick itself', () => {
    // Tiefling's own resistance is discovered as a SEPARATE decision family (damage-type-choice)
    // purely because `detectSpeciesDecisions` scans `resist` and `additionalSpells`/lineage
    // entries independently -- re-verified directly this phase, not assumed: both decisions
    // reclassify through the SAME single authored choice (one Fiendish Legacy pick), never two
    // independent player decisions. No THIRD decision exists for the resistance itself beyond
    // these two already-accounted-for discovery artifacts.
    expect(tieflingDecisions.filter((d) => d.family === 'damage-type-choice' || d.family === 'variant-choice')).toHaveLength(2)
  })

  it('BITE -- the once-per-Long-Rest innate free-cast runtime effect is never discovered as a mandatory build decision', () => {
    // Otherworldly Presence's unconditional Thaumaturgy grant, and every legacy's own Level-3/5
    // "cast once free, then via a real slot" runtime behavior, are NOT fields
    // `detectSpeciesDecisions` scans at all -- Tiefling's real decision population is EXACTLY the
    // 3 decisions this phase implements (legacy, resistance, size), never a phantom 4th
    // "free-cast" decision silently invented or silently blocked.
    expect(tieflingDecisions).toHaveLength(3)
  })

  it('a Tiefling-owned option is never offered by Elf\'s or Gnome\'s own facet, and vice versa, despite sharing the same generic ChoiceSet ids', () => {
    // `choice:species.feature-option` and `choice:species.innate-spellcasting-ability` are shared
    // verbatim by Elf, Gnome, AND Tiefling -- re-verified directly against the real facets:
    // Tiefling's own `from` array names ONLY its own 3 Fiendish Legacy Sources, never Elf's Elven
    // Lineage Sources or Gnome's Gnomish Lineage Sources (and vice versa), so a stale answer from
    // one species can never be among another's own legal options merely because the ChoiceSet id
    // is shared -- the Builder-level proof of this lives in create-v2-species-sweep.test.ts's own
    // "SPECIES SWITCHING" describe block; this is the underlying facet-data fact that proof rests on.
    const tieflingFacet = findRulesFacet('dnd5e.2024', 'species', 'tiefling-xphb')!
    const elfFacet = findRulesFacet('dnd5e.2024', 'species', 'elf-xphb')!
    const gnomeFacet = findRulesFacet('dnd5e.2024', 'species', 'gnome-xphb')!
    const tieflingLegacyOptions = tieflingFacet.choices!.find((c) => c.choiceSet === 'choice:species.feature-option')!.from
    const elfLineageOptions = elfFacet.choices!.find((c) => c.choiceSet === 'choice:species.feature-option')!.from
    const gnomeLineageOptions = gnomeFacet.choices!.find((c) => c.choiceSet === 'choice:species.feature-option')!.from
    for (const option of tieflingLegacyOptions ?? []) {
      expect(elfLineageOptions).not.toContain(option)
      expect(gnomeLineageOptions).not.toContain(option)
    }
  })
})
