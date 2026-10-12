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
    const without = COVERAGE_RULES.filter((rule) => rule.id !== 'blk:invocations')
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

  it('STILL BLOCKED -- feat-granted and species-granted spell decisions are untouched by P3.5 (Magic Initiate, Fey-Touched, lineage spells, etc. -- their own authoring/workflow does not exist today)', () => {
    const featOrSpeciesSpell = DECISIONS.filter((d) => (d.owner.kind === 'feat' || d.owner.kind === 'species') && ['spell-choice', 'spell-grant', 'spell-count'].includes(d.family))
    expect(featOrSpeciesSpell.length).toBeGreaterThan(0)
    for (const d of featOrSpeciesSpell) expect(classifyDecision(d).status, d.id).not.toBe('implemented')
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
    const stillPartiallyBlockedCasters = CASTER_SLUGS.filter((slug) => !['bard-xphb', 'sorcerer-xphb', 'wizard-xphb'].includes(slug))
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

    expect(availableSpecies.length).toBe(3)
    expect(availableClasses.sort()).toEqual(['bard-xphb', 'monk-xphb', 'sorcerer-xphb', 'wizard-xphb'])
    expect(availableBackgrounds.length).toBe(13)

    let combinations = 0
    for (const s of species) {
      for (const c of classes) {
        for (const b of backgrounds) {
          if (creationUnresolvedDecisions({ species: s, class: c, background: b, feats: [] }).length === 0) combinations++
        }
      }
    }
    expect(combinations).toBe(156)
  })

  it('FIRST REAL CHARACTER -- Dwarf + Bard + Criminal is creation-complete through the real authority', () => {
    expect(creationUnresolvedDecisions({ species: 'dwarf-xphb', class: 'bard-xphb', background: 'criminal-xphb', feats: [] })).toEqual([])
  })
})
