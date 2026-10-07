// D&D 2024 Character Rules -- MANDATORY-DECISION COVERAGE CONTRACT (Phase 0).
//
// Classifies every decision the structural discovery finds (`mandatory-decisions.ts`).
// This is the bidirectional contract:
//
//   A. every discovered mandatory decision matches EXACTLY ONE coverage rule, and that
//      rule states its status (implemented, blocked, optional, false-positive, runtime).
//   B. every coverage rule either matches at least one discovered decision, or is an
//      explicit false-positive / runtime-effect rule with a reason, and every ledger row
//      is named by at least one rule. No phantom ledger row, no silent source decision.
//
// The ledger is an accountability contract cross-checked here. Discovery is the source
// of truth for WHAT exists; a rule is the statement of HOW Eldra covers it.
//
// Status meanings (fail-closed: anything not implemented blocks completion):
//   implemented      Eldra represents and persists this decision today.
//   blocked          A mandatory decision Eldra cannot yet represent. Blocks creation and
//                    progression until it is implemented.
//   optional         A replacement / re-answer clause. Never blocks legality.
//   false-positive   A surface the old heuristic flagged that is not a decision (per-use,
//                    per-rest, per-cast runtime choice). Matches zero decisions by design.
//   runtime-effect   Milestone B effect accountability. Matches zero decisions by design.
//
// Rules are data, not a copy of the PHB: each carries a predicate over discovered
// decisions and, where Eldra implements it, a check against the package facet.

import { findRulesFacet } from './index'
import { slugOf, type DecisionRecord } from './mandatory-decisions'
import { valueIdsOfDetail } from './proficiency-vocabulary'
import type { RulesFacet } from './types'

export type CoverageStatus = 'implemented' | 'blocked' | 'optional' | 'false-positive' | 'runtime-effect'

export type CoverageRule = {
  id: string
  status: CoverageStatus
  reason: string
  // Named ledger rows this rule accounts for (both directions are tested).
  ledgerIds: readonly string[]
  // A false-positive or runtime-effect rule may match zero decisions; every other rule must match one.
  allowZero?: boolean
  matches: (d: DecisionRecord) => boolean
}

const is = (d: DecisionRecord, kind: DecisionRecord['owner']['kind'], family: DecisionRecord['family']) =>
  d.owner.kind === kind && d.family === family

// Owner slugs for the classes that have a specific, verified implementation.
const SUPPORTED_EXPERTISE: Record<string, readonly number[]> = {
  'bard-xphb': [2, 9],
  'ranger-xphb': [9],
  'rogue-xphb': [6],
  'wizard-xphb': [2]
}
const FIGHTING_STYLE_LEVEL: Record<string, number> = { 'fighter-xphb': 1, 'paladin-xphb': 2, 'ranger-xphb': 2 }

// Facet presence, read from the package facet corpus (no name branching).
function classFacetHasSkillChoice(slug: string): boolean {
  return (findRulesFacet('dnd5e.2024', 'class', slug)?.choices ?? []).some((c) => c.choiceSet === 'choice:skill.proficiency')
}
function speciesFacetHasSkillChoice(slug: string): boolean {
  return (findRulesFacet('dnd5e.2024', 'species', slug)?.choices ?? []).some((c) => c.choiceSet === 'choice:skill.proficiency')
}
function classProgression(slug: string): readonly string[] {
  return findRulesFacet('dnd5e.2024', 'class', slug)?.progression ?? []
}

// ---------------------------------------------------------------------------
// Proficiency coverage (P1). A proficiency decision is covered only when a facet that owns it
// really grants (fixed) or offers (choice) exactly the Values its discovery detail names. The
// detail is the corpus's own universe, so a facet offering a narrower or wider list does not cover
// it, and a decision with no recognized detail is never covered (fail closed).
// ---------------------------------------------------------------------------

function isProficiency(d: DecisionRecord): boolean {
  return (d.family === 'proficiency-grant' || d.family === 'proficiency-choice')
    && (d.owner.kind === 'class' || d.owner.kind === 'background' || d.owner.kind === 'feat')
}

// The facets that can satisfy a decision: its own owner, and for a feat granted by a background,
// that background (its facet declares the feat's choice, e.g. Crafter's tools).
function facetsOf(d: DecisionRecord): RulesFacet[] {
  const own = findRulesFacet('dnd5e.2024', d.owner.kind, d.owner.slug)
  const granted = d.grantedBy ? findRulesFacet('dnd5e.2024', 'background', d.grantedBy) : null
  return [own, granted].filter((f): f is RulesFacet => f !== null)
}

function sameSet(a: readonly string[], b: readonly string[]): boolean {
  const left = new Set(a)
  const right = new Set(b)
  return left.size === right.size && [...left].every((v) => right.has(v))
}

// ---------------------------------------------------------------------------
// Background ability distribution (P7). The corpus names three abilities, a total, and a per-option
// ceiling (discovery's detail). Covered when the Background's facet offers exactly those abilities,
// as Background Sources, under the one bounded ChoiceSet, with the corpus total as its count.
// ---------------------------------------------------------------------------

export const BACKGROUND_ABILITY_CHOICE_SET = 'choice:background.ability-distribution'

export function backgroundIncreaseSourceId(ability: string): string {
  return `source:background.increase.${ability}`
}

function parseAbilityDistributionDetail(detail: string | undefined): { abilities: string[], total: number, max: number } | null {
  const match = /^weighted-abilities:([a-z,]+);total:(\d+);max:(\d+)$/.exec(detail ?? '')
  if (!match) return null
  return { abilities: match[1]!.split(','), total: Number(match[2]), max: Number(match[3]) }
}

export function abilityDistributionCovered(d: DecisionRecord): boolean {
  if (!(d.family === 'ability-distribution' && d.owner.kind === 'background')) return false
  const parsed = parseAbilityDistributionDetail(d.detail)
  if (!parsed) return false
  const expected = parsed.abilities.map(backgroundIncreaseSourceId)
  const facet = findRulesFacet('dnd5e.2024', 'background', d.owner.slug)
  return (facet?.choices ?? []).some((c) => c.choiceSet === BACKGROUND_ABILITY_CHOICE_SET && c.count === parsed.total && sameSet(c.from ?? [], expected))
    && parsed.max === 2
}

export function proficiencyCovered(d: DecisionRecord): boolean {
  if (!isProficiency(d)) return false
  const ids = valueIdsOfDetail(d.detail)
  if (ids.length === 0) return false
  const facets = facetsOf(d)
  if (d.family === 'proficiency-grant') {
    return ids.every((id) => facets.some((f) => (f.grants ?? []).some((g) => g.set === id && g.to === true)))
  }
  return facets.some((f) => (f.choices ?? []).some((c) => c.count === d.cardinality && sameSet(c.from ?? [], ids)))
}

export const COVERAGE_RULES: readonly CoverageRule[] = [
  // ------------------------------------------------------------------ implemented
  {
    id: 'impl:class-skill-choice',
    status: 'implemented',
    reason: 'Class skill proficiency choice at Level 1 (choice:skill.proficiency on the class facet).',
    ledgerIds: [],
    matches: (d) => is(d, 'class', 'skill-choice') && d.level === 1 && d.source.startsWith('startingProficiencies.skills') && classFacetHasSkillChoice(d.owner.slug)
  },
  {
    id: 'impl:species-skill-choice',
    status: 'implemented',
    reason: 'Species skill proficiency choice (choice:skill.proficiency on the species facet).',
    ledgerIds: [],
    matches: (d) => is(d, 'species', 'skill-choice') && speciesFacetHasSkillChoice(d.owner.slug)
  },
  {
    id: 'impl:subclass-selection',
    status: 'implemented',
    reason: 'Subclass selection (progression:class.subclass-selection).',
    ledgerIds: ['barbarian-xphb:subclass-selection', 'bard-xphb:subclass-selection', 'cleric-xphb:subclass-selection', 'druid-xphb:subclass-selection', 'fighter-xphb:subclass-selection', 'monk-xphb:subclass-selection', 'paladin-xphb:subclass-selection', 'ranger-xphb:subclass-selection', 'rogue-xphb:subclass-selection', 'sorcerer-xphb:subclass-selection', 'warlock-xphb:subclass-selection', 'wizard-xphb:subclass-selection'],
    matches: (d) => is(d, 'class', 'subclass-selection') && classProgression(d.owner.slug).includes('progression:class.subclass-selection')
  },
  {
    id: 'impl:asi',
    status: 'implemented',
    reason: 'Ability Score Improvement / feat selection (progression:class.asi-*).',
    ledgerIds: ['barbarian-xphb:ability-score-improvement', 'bard-xphb:ability-score-improvement', 'cleric-xphb:ability-score-improvement', 'druid-xphb:ability-score-improvement', 'fighter-xphb:ability-score-improvement', 'monk-xphb:ability-score-improvement', 'paladin-xphb:ability-score-improvement', 'ranger-xphb:ability-score-improvement', 'rogue-xphb:ability-score-improvement', 'sorcerer-xphb:ability-score-improvement', 'warlock-xphb:ability-score-improvement', 'wizard-xphb:ability-score-improvement'],
    matches: (d) => is(d, 'class', 'feat-choice') && d.detail === 'asi' && classProgression(d.owner.slug).some((p) => p.startsWith('progression:class.asi-'))
  },
  {
    id: 'impl:epic-boon',
    status: 'implemented',
    reason: 'Epic Boon feat selection at Level 19 (progression:class.epic-boon).',
    ledgerIds: ['barbarian-xphb:epic-boon', 'bard-xphb:epic-boon', 'cleric-xphb:epic-boon', 'druid-xphb:epic-boon', 'fighter-xphb:epic-boon', 'monk-xphb:epic-boon', 'paladin-xphb:epic-boon', 'ranger-xphb:epic-boon', 'rogue-xphb:epic-boon', 'sorcerer-xphb:epic-boon', 'warlock-xphb:epic-boon', 'wizard-xphb:epic-boon'],
    matches: (d) => is(d, 'class', 'feat-choice') && d.detail === 'category=EB' && classProgression(d.owner.slug).includes('progression:class.epic-boon')
  },
  {
    id: 'impl:fighting-style',
    status: 'implemented',
    reason: 'Class Fighting Style feat choice at its real level (choice:feat.fighting-style.*).',
    ledgerIds: ['fighter-xphb:fighting-style', 'paladin-xphb:fighting-style', 'ranger-xphb:fighting-style'],
    matches: (d) => is(d, 'class', 'feat-choice') && d.detail === 'category=FS' && FIGHTING_STYLE_LEVEL[d.owner.slug] === d.level
  },
  {
    id: 'impl:expertise',
    status: 'implemented',
    reason: 'Skill Expertise at the levels its facet progression supports.',
    ledgerIds: ['bard-xphb:expertise', 'ranger-xphb:expertise', 'rogue-xphb:expertise', 'wizard-xphb:scholar'],
    matches: (d) => is(d, 'class', 'expertise-choice') && (SUPPORTED_EXPERTISE[d.owner.slug] ?? []).includes(d.level) && d.source !== 'Deft Explorer'
  },
  {
    id: 'impl:origin-fixed-feat',
    status: 'implemented',
    reason: 'Background fixed Origin feat, server-derived from facet.originFeatSlug (Phase 2C.3A).',
    ledgerIds: ['background:origin-feat:fixed-acquisition'],
    matches: (d) => is(d, 'background', 'feat-grant') && findRulesFacet('dnd5e.2024', 'background', d.owner.slug)?.originFeatSlug === `${slugOf(d.source)}-xphb`
  },
  {
    id: 'impl:background-ability-distribution',
    status: 'implemented',
    reason: 'Background ability increase (+2/+1 or +1/+1/+1 over the same three abilities): one bounded choice (choice:background.ability-distribution, at most 2 on one ability), activating Background Sources (P7).',
    ledgerIds: [],
    matches: (d) => abilityDistributionCovered(d)
  },
  {
    id: 'impl:proficiency-facet',
    status: 'implemented',
    reason: 'Tool, armor, weapon, and saving-throw proficiency that the owning facet grants or offers with exactly the corpus Values (P1 vocabulary; value:tool/armor/weapon/save).',
    ledgerIds: [],
    matches: (d) => proficiencyCovered(d)
  },

  // ------------------------------------------------------------------ blocked
  {
    id: 'blk:weapon-mastery',
    status: 'blocked',
    reason: 'Weapon Mastery kinds: no weapon vocabulary; initial choice and count increases. Replacement is optional (separate rule).',
    ledgerIds: ['barbarian-xphb:weapon-mastery', 'fighter-xphb:weapon-mastery', 'paladin-xphb:weapon-mastery', 'ranger-xphb:weapon-mastery', 'rogue-xphb:weapon-mastery'],
    matches: (d) => is(d, 'class', 'weapon-mastery')
  },
  {
    id: 'blk:invocations',
    status: 'blocked',
    reason: 'Eldritch Invocations: accumulating options with prerequisites; no accumulating shape exists.',
    ledgerIds: ['warlock-xphb:eldritch-invocations'],
    matches: (d) => is(d, 'class', 'accumulating-option') && d.source === 'Invocations'
  },
  {
    id: 'blk:metamagic',
    status: 'blocked',
    reason: 'Metamagic: two options per increase, no accumulating shape exists.',
    ledgerIds: ['sorcerer-xphb:metamagic'],
    matches: (d) => is(d, 'class', 'accumulating-option') && d.source === 'Metamagic'
  },
  {
    id: 'blk:battle-master-maneuvers',
    status: 'blocked',
    reason: 'Battle Master maneuvers: subclass-gated accumulating options.',
    ledgerIds: ['fighter-xphb:battle-master-xphb:combat-superiority'],
    matches: (d) => is(d, 'subclass', 'accumulating-option')
  },
  {
    id: 'blk:caster-counts',
    status: 'blocked',
    reason: 'Cantrip and prepared-spell counts. Level 1 uses the caster spell-selection row; later increases need count enforcement.',
    ledgerIds: ['bard-xphb:spellcasting-spell-selection', 'cleric-xphb:spellcasting-spell-selection', 'druid-xphb:spellcasting-spell-selection', 'paladin-xphb:spellcasting-spell-selection', 'ranger-xphb:spellcasting-spell-selection', 'sorcerer-xphb:spellcasting-spell-selection', 'warlock-xphb:spellcasting-spell-selection', 'wizard-xphb:spellcasting-spell-selection'],
    matches: (d) => is(d, 'class', 'spell-count')
  },
  {
    id: 'blk:caster-l1-spell-choice',
    status: 'blocked',
    reason: 'Level 1 spell selection: class spell list, level, and count are not enforced.',
    ledgerIds: ['bard-xphb:spellcasting-spell-selection', 'cleric-xphb:spellcasting-spell-selection', 'druid-xphb:spellcasting-spell-selection', 'paladin-xphb:spellcasting-spell-selection', 'ranger-xphb:spellcasting-spell-selection', 'sorcerer-xphb:spellcasting-spell-selection', 'warlock-xphb:spellcasting-spell-selection', 'wizard-xphb:spellcasting-spell-selection'],
    matches: (d) => is(d, 'class', 'spell-choice') && d.level === 1 && (d.source === 'Spellcasting' || d.source === 'Pact Magic')
  },
  {
    id: 'blk:mystic-arcanum',
    status: 'blocked',
    reason: 'Mystic Arcanum: one spell per arcanum level from the Warlock list at a fixed level.',
    ledgerIds: ['warlock-xphb:mystic-arcanum'],
    matches: (d) => is(d, 'class', 'spell-choice') && d.source === 'Mystic Arcanum'
  },
  {
    id: 'blk:class-spell-choice-other',
    status: 'blocked',
    reason: 'Spell choices beyond Level 1 (Magical Secrets, Spell Mastery, Signature Spells, spellbook growth): spell list and spellbook enforcement.',
    ledgerIds: [],
    matches: (d) => is(d, 'class', 'spell-choice') && !(d.level === 1 && (d.source === 'Spellcasting' || d.source === 'Pact Magic')) && d.source !== 'Mystic Arcanum'
  },
  {
    id: 'blk:class-feature-option',
    status: 'blocked',
    reason: 'Feature option choice at a class level (Divine Order, Primal Order, Blessed Strikes, Elemental Fury): no option-choice primitive.',
    ledgerIds: [],
    matches: (d) => is(d, 'class', 'feature-option')
  },
  {
    id: 'blk:class-expertise-creation',
    status: 'blocked',
    reason: 'Rogue Level 1 Expertise: the Builder has no class skill-expertise picker.',
    ledgerIds: ['rogue-xphb:expertise-creation'],
    matches: (d) => is(d, 'class', 'expertise-choice') && d.owner.slug === 'rogue-xphb' && d.level === 1
  },
  {
    id: 'blk:class-expertise-other',
    status: 'blocked',
    reason: 'Expertise choices not supported at this level (Ranger Level 2 Deft Explorer).',
    ledgerIds: [],
    matches: (d) => is(d, 'class', 'expertise-choice') && !(SUPPORTED_EXPERTISE[d.owner.slug] ?? []).includes(d.level) && !(d.owner.slug === 'rogue-xphb' && d.level === 1)
  },
  {
    id: 'blk:class-skill-extra',
    status: 'blocked',
    reason: 'Extra skill proficiency at a later level (Barbarian Primal Knowledge).',
    ledgerIds: [],
    matches: (d) => is(d, 'class', 'skill-choice') && !(d.level === 1 && d.source.startsWith('startingProficiencies.skills'))
  },
  {
    id: 'blk:class-language',
    status: 'blocked',
    reason: 'Language choice: the corpus has no structured language grant (policy decision).',
    ledgerIds: [],
    matches: (d) => d.family === 'language-choice'
  },
  {
    id: 'blk:class-equipment',
    status: 'blocked',
    reason: 'Starting equipment (A/B packages): no creation grant shape exists.',
    ledgerIds: [],
    matches: (d) => is(d, 'class', 'equipment-package')
  },
  {
    id: 'blk:subclass-spells',
    status: 'blocked',
    reason: 'Subclass spell grants and choices, and subclass-only casting: subclass-internal gating and spell lists.',
    ledgerIds: ['bard-xphb:college-of-lore-xphb:magical-discoveries'],
    matches: (d) => is(d, 'subclass', 'spell-choice') || is(d, 'subclass', 'spell-grant') || is(d, 'subclass', 'variant-choice')
  },
  {
    id: 'blk:subclass-feature-option',
    status: 'blocked',
    reason: 'Subclass feature option choices (Aspect of the Wilds, Rage of the Wilds, Defensive Tactics): subclass-internal gating.',
    ledgerIds: [],
    matches: (d) => is(d, 'subclass', 'feature-option')
  },
  {
    id: 'blk:champion-fighting-style',
    status: 'blocked',
    reason: 'Champion Additional Fighting Style: subclass-internal gating.',
    ledgerIds: ['fighter-xphb:additional-fighting-style'],
    matches: (d) => is(d, 'subclass', 'feat-choice') && d.detail === 'category=FS'
  },
  {
    id: 'blk:subclass-proficiency-damage',
    status: 'blocked',
    reason: 'Subclass saving-throw or damage-type choice: no proficiency or damage-type vocabulary.',
    ledgerIds: [],
    matches: (d) => is(d, 'subclass', 'proficiency-choice') || is(d, 'subclass', 'damage-type-choice') || is(d, 'class', 'damage-type-choice')
  },
  {
    id: 'blk:species-feat-choice',
    status: 'blocked',
    reason: 'Human Origin feat choice: the option set includes Origin feats whose own choices are blocked.',
    ledgerIds: [],
    matches: (d) => is(d, 'species', 'feat-choice')
  },
  {
    id: 'blk:species-lineage',
    status: 'blocked',
    reason: 'Species lineage, ancestry, or legacy choice: variant spells and spellcasting ability are not represented.',
    ledgerIds: [],
    matches: (d) => is(d, 'species', 'variant-choice') || is(d, 'species', 'spell-grant')
  },
  {
    id: 'blk:species-damage',
    status: 'blocked',
    reason: 'Species damage-type choice (ancestry resistance): no damage-type vocabulary.',
    ledgerIds: [],
    matches: (d) => is(d, 'species', 'damage-type-choice')
  },
  {
    id: 'blk:background-equipment',
    status: 'blocked',
    reason: 'Background starting equipment (A/B or gold): no creation grant shape exists.',
    ledgerIds: ['background:starting-equipment'],
    matches: (d) => is(d, 'background', 'equipment-package')
  },
  {
    id: 'blk:origin-feat-unsupported',
    status: 'blocked',
    reason: 'Background Origin feat that is not fixed-supported: its own choice is blocked (Crafter, Musician, Skilled, Magic Initiate).',
    ledgerIds: ['background:origin-feat:choice-acquisition'],
    matches: (d) => is(d, 'background', 'feat-grant') && findRulesFacet('dnd5e.2024', 'background', d.owner.slug)?.originFeatSlug !== `${slugOf(d.source)}-xphb`
  },
  {
    id: 'blk:feat-nested-blessed-druidic',
    status: 'blocked',
    reason: 'Blessed Warrior / Druidic Warrior variant: two cantrip choices on acquisition (only this variant option is blocked).',
    ledgerIds: ['paladin-xphb:fighting-style-variant-blessed-warrior', 'ranger-xphb:fighting-style-variant-druidic-warrior'],
    matches: (d) => d.owner.kind === 'feat' && (d.owner.slug === 'blessed-warrior-xphb' || d.owner.slug === 'druidic-warrior-xphb') && d.family === 'spell-choice'
  },
  {
    id: 'blk:feat-nested-spells',
    status: 'blocked',
    reason: 'Feat-granted spell choices and fixed spells (Magic Initiate, Ritual Caster, Fey-Touched, Telekinetic, Telepathic, and others): spell acquisition.',
    ledgerIds: [],
    matches: (d) => d.owner.kind === 'feat' && (d.family === 'spell-choice' || d.family === 'spell-grant' || d.family === 'variant-choice') && !(d.owner.slug === 'blessed-warrior-xphb' || d.owner.slug === 'druidic-warrior-xphb')
  },
  {
    id: 'blk:feat-nested-proficiency',
    status: 'blocked',
    reason: 'Feat proficiency that no facet grants or offers: skill choices (Keen Mind, Observant, Skill Expert, Boon of Skill), Resilient saving throws, and unrecognized shapes. Fail closed.',
    ledgerIds: [],
    matches: (d) => d.owner.kind === 'feat' && (d.family === 'proficiency-choice' || d.family === 'proficiency-grant') && !proficiencyCovered(d)
  },
  {
    id: 'blk:subclass-casting-class',
    status: 'blocked',
    reason: 'Subclass casting progression: a third-caster slot table is not defined.',
    ledgerIds: [],
    matches: (d) => is(d, 'subclass', 'spell-count')
  },

  // ------------------------------------------------------------------ optional
  {
    id: 'opt:replacement',
    status: 'optional',
    reason: 'A "can replace / change" clause over an answer already given. The original answer stays legal, so this never blocks.',
    ledgerIds: ['fighter-xphb:fighting-style-replacement', 'barbarian-xphb:weapon-mastery', 'paladin-xphb:weapon-mastery', 'ranger-xphb:weapon-mastery', 'rogue-xphb:weapon-mastery'],
    matches: (d) => d.family === 'replacement'
  },

  // ------------------------------------------------------------------ false positives (zero matches by design)
  {
    id: 'fp:steps-of-the-fey',
    status: 'false-positive',
    reason: 'Per-cast choice (teleport destination) during play. Not a progression decision.',
    ledgerIds: ['warlock-xphb:archfey-patron-xphb:steps-of-the-fey'],
    allowZero: true,
    matches: (d) => d.source === 'Steps of the Fey'
  },
  {
    id: 'fp:fiendish-resilience',
    status: 'false-positive',
    reason: 'Per-rest damage-type choice during play, not a progression decision.',
    ledgerIds: ['warlock-xphb:fiend-patron-xphb:fiendish-resilience'],
    allowZero: true,
    matches: (d) => d.source === 'Fiendish Resilience'
  },
  {
    id: 'fp:third-eye',
    status: 'false-positive',
    reason: 'Per-rest benefit choice during play, not a progression decision.',
    ledgerIds: ['wizard-xphb:diviner-xphb:the-third-eye'],
    allowZero: true,
    matches: (d) => d.source === 'The Third Eye'
  },
  {
    id: 'fp:sculpt-spells',
    status: 'false-positive',
    reason: 'Per-cast choice of creatures during play. "spell\'s level" is not a spell pick.',
    ledgerIds: ['wizard-xphb:evoker-xphb:sculpt-spells'],
    allowZero: true,
    matches: (d) => d.source === 'Sculpt Spells'
  },
  {
    id: 'fp:illusory-reality',
    status: 'false-positive',
    reason: 'Per-cast choice of an object during play, not a progression decision.',
    ledgerIds: ['wizard-xphb:illusionist-xphb:illusory-reality'],
    allowZero: true,
    matches: (d) => d.source === 'Illusory Reality'
  },
  {
    id: 'fp:heightened-focus',
    status: 'false-positive',
    reason: 'The only "choose" is an in-combat target pick for Step of the Wind.',
    ledgerIds: ['monk-xphb:heightened-focus'],
    allowZero: true,
    matches: (d) => d.source === 'Heightened Focus'
  },
  {
    id: 'fp:sorcery-incarnate',
    status: 'false-positive',
    reason: 'Grants no new Metamagic selection; it only lets the Sorcerer use already-chosen options.',
    ledgerIds: ['sorcerer-xphb:sorcery-incarnate'],
    allowZero: true,
    matches: (d) => d.source === 'Sorcery Incarnate'
  },

  // ------------------------------------------------------------------ runtime-effect (Milestone B accountability)
  {
    id: 'runtime:epic-boon-effects',
    status: 'runtime-effect',
    reason: 'Epic Boon effects (Milestone B). The acquisition is the implemented decision; the boon effects are runtime.',
    ledgerIds: [
      'barbarian-xphb:epic-boon-effects', 'bard-xphb:epic-boon-effects', 'cleric-xphb:epic-boon-effects', 'druid-xphb:epic-boon-effects',
      'fighter-xphb:epic-boon-effects', 'monk-xphb:epic-boon-effects', 'paladin-xphb:epic-boon-effects', 'ranger-xphb:epic-boon-effects',
      'rogue-xphb:epic-boon-effects', 'sorcerer-xphb:epic-boon-effects', 'warlock-xphb:epic-boon-effects', 'wizard-xphb:epic-boon-effects'
    ],
    allowZero: true,
    matches: () => false
  },
  {
    id: 'runtime:fighting-style-effects',
    status: 'runtime-effect',
    reason: 'Fighting Style effects (Milestone B). The style acquisition is the implemented decision.',
    ledgerIds: [
      'fighter-xphb:fighting-style-effect-archery', 'fighter-xphb:fighting-style-effect-blind-fighting', 'fighter-xphb:fighting-style-effect-defense',
      'fighter-xphb:fighting-style-effect-dueling', 'fighter-xphb:fighting-style-effect-great-weapon-fighting', 'fighter-xphb:fighting-style-effect-interception',
      'fighter-xphb:fighting-style-effect-protection', 'fighter-xphb:fighting-style-effect-thrown-weapon-fighting', 'fighter-xphb:fighting-style-effect-two-weapon-fighting',
      'fighter-xphb:fighting-style-effect-unarmed-fighting'
    ],
    allowZero: true,
    matches: () => false
  },
  {
    id: 'runtime:origin-feat-effects',
    status: 'runtime-effect',
    reason: 'Origin feat effects (Milestone B). The fixed acquisition is the implemented decision.',
    ledgerIds: [
      'background:origin-feat-effect:alert', 'background:origin-feat-effect:tough', 'background:origin-feat-effect:healer',
      'background:origin-feat-effect:lucky', 'background:origin-feat-effect:tavern-brawler', 'background:origin-feat-effect:savage-attacker'
    ],
    allowZero: true,
    matches: () => false
  }
]

export type Classification = {
  status: CoverageStatus
  rule: string
  reason: string
  ledgerIds: readonly string[]
}

// Every rule that matches a decision. A decision must match exactly one (test A).
export function matchingRules(d: DecisionRecord): CoverageRule[] {
  return COVERAGE_RULES.filter((rule) => rule.matches(d))
}

// The single classification for a discovered decision. A decision no rule covers is
// UNCLASSIFIED: it is reported as blocked, so the contract fails closed.
export function classifyDecision(d: DecisionRecord): Classification {
  const rules = matchingRules(d)
  if (rules.length === 1) {
    const [rule] = rules as [CoverageRule]
    return { status: rule.status, rule: rule.id, reason: rule.reason, ledgerIds: rule.ledgerIds }
  }
  if (rules.length === 0) {
    return { status: 'blocked', rule: 'unclassified', reason: 'No coverage rule classifies this decision.', ledgerIds: [] }
  }
  return { status: 'blocked', rule: 'ambiguous', reason: `Matched ${rules.length} coverage rules: ${rules.map((r) => r.id).join(', ')}`, ledgerIds: [] }
}

// A decision is unresolved for completion unless it is implemented or optional.
export function isUnresolved(c: Classification): boolean {
  return c.status === 'blocked'
}
