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
import type { EquipmentChoice, RulesFacet } from './types'

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
function classFacetHasChoice(slug: string, choiceSet: string): boolean {
  return (findRulesFacet('dnd5e.2024', 'class', slug)?.choices ?? []).some((c) => c.choiceSet === choiceSet)
}

// FEATURE-OPTION PHASE -- the real build decision is IMPLEMENTED once the owning facet genuinely
// references the generic primitive: a creation-time decision (Divine Order/Primal Order, Level 1)
// through the facet's own `choices` array; a level-up decision (Blessed Strikes/Elemental Fury,
// Level 7) through the facet's own `progression` array, at the dedicated Level-7 Progression this
// phase authored. Never a name check against "Divine Order" itself -- a future homebrew class
// authoring the identical shape is covered the same way, with no class/option name in this check.
const CLASS_FEATURE_OPTION_PROGRESSION: Record<string, string> = {
  'cleric-xphb': 'progression:class.feature-option.blessed-strikes',
  'druid-xphb': 'progression:class.feature-option.elemental-fury'
}
function classFeatureOptionCovered(d: DecisionRecord): boolean {
  if (!is(d, 'class', 'feature-option')) return false
  if (d.level === 1) return classFacetHasChoice(d.owner.slug, 'choice:class.feature-option')
  const ref = CLASS_FEATURE_OPTION_PROGRESSION[d.owner.slug]
  return ref !== undefined && classProgression(d.owner.slug).includes(ref)
}

// Weapon Mastery phase -- the real build decision is IMPLEMENTED once the owning facet genuinely
// references the generic primitive: the Level-1 creation decision through the facet's own
// `choices` array (the exact ChoiceSet id this class's own real corpus text restricts to --
// `.melee-only` for Barbarian, unrestricted for the other four); a later GROWTH decision
// (Barbarian L4/L10, Fighter L4/L10/L16) through the facet's own `progression` array, at the
// dedicated growth ProgressionDefinition this phase authored. Never a name check against
// "Weapon Mastery" itself or a class name -- a future homebrew class authoring the identical
// "choose N eligible items, growing by level" shape is covered the same way.
const CLASS_WEAPON_MASTERY_CHOICE_SET: Record<string, string> = {
  'barbarian-xphb': 'choice:class.weapon-mastery.melee-only',
  'fighter-xphb': 'choice:class.weapon-mastery',
  'paladin-xphb': 'choice:class.weapon-mastery',
  'ranger-xphb': 'choice:class.weapon-mastery',
  'rogue-xphb': 'choice:class.weapon-mastery'
}
const CLASS_WEAPON_MASTERY_GROWTH_PROGRESSION: Record<string, string> = {
  'barbarian-xphb': 'progression:class.weapon-mastery-growth-4-10',
  'fighter-xphb': 'progression:class.weapon-mastery-growth-4-10-16'
}
function weaponMasteryCovered(d: DecisionRecord): boolean {
  if (!is(d, 'class', 'weapon-mastery')) return false
  if (d.level === 1) {
    const choiceSet = CLASS_WEAPON_MASTERY_CHOICE_SET[d.owner.slug]
    return choiceSet !== undefined && classFacetHasChoice(d.owner.slug, choiceSet)
  }
  const ref = CLASS_WEAPON_MASTERY_GROWTH_PROGRESSION[d.owner.slug]
  return ref !== undefined && classProgression(d.owner.slug).includes(ref)
}

// ---------------------------------------------------------------------------
// D&D 2024 Character Rules P3.5 -- SPELL ACQUISITION COVERAGE.
// ---------------------------------------------------------------------------
// The generic P2 (spellOptionVerdict) -> P3.1 (validateSpellRequirements) -> P3.2
// (planSpellAcquisition) -> P3.2.1 (provenance) -> P3.3 (Level-1 creation write-through) -> P3.4
// (progression write-through, Level 1-20) pipeline is now real and deployed. These four functions
// are the ONLY thing that decides whether a given class-owned spell decision is actually covered by
// it end-to-end -- never a name/family match alone (that would be an aspirational green). Each one
// re-reads the REAL authored facet (`RulesFacet.spellRequirements`, app/lib/content-rules/dnd5e-2024.ts)
// and checks the SPECIFIC fact this decision claims (which pool, which level, which tier), the same
// "verify against the real facet, never assume" discipline `classFacetHasSkillChoice` above already
// established. A class whose facet does not actually back a claim here is NOT reclassified -- it
// stays unclassified and fails the bidirectional contract loudly, rather than silently matching a
// blocked rule that would hide the gap.

function classSpellRequirements(slug: string) {
  return findRulesFacet('dnd5e.2024', 'class', slug)?.spellRequirements ?? []
}

// ---------------------------------------------------------------------------
// D&D 2024 Character Rules P8 -- STARTING EQUIPMENT COVERAGE.
// ---------------------------------------------------------------------------
// Covered only when the owning facet's own `startingEquipment` is REAL and well-formed -- at least
// two bundles (every real XPHB decision is an A/B, or Fighter's own A/B/C choice; a single-bundle
// "choice" is not a choice), and every bundle carries at least one grant (an empty bundle grants
// nothing, which is never what the real corpus declares). This checks SHAPE only, deliberately:
// whether a specific grant actually resolves against a live World's catalogue is a runtime fact
// (server/utils/character-equipment-bundle.ts's own job), not a static corpus-authoring fact this
// ledger can verify without a Directus connection -- matching this ledger's own existing posture for
// every other family (e.g. `spellCountCovered` checks the facet's table has a value, never that a
// specific spell ContentRef resolves).
function classStartingEquipment(slug: string): EquipmentChoice | undefined {
  return findRulesFacet('dnd5e.2024', 'class', slug)?.startingEquipment
}
function backgroundStartingEquipment(slug: string): EquipmentChoice | undefined {
  return findRulesFacet('dnd5e.2024', 'background', slug)?.startingEquipment
}
function equipmentChoiceWellFormed(choice: EquipmentChoice | undefined): boolean {
  return !!choice && choice.bundles.length >= 2 && choice.bundles.every((bundle) => bundle.grants.length > 0)
}
function classEquipmentCovered(d: DecisionRecord): boolean {
  if (!is(d, 'class', 'equipment-package')) return false
  return equipmentChoiceWellFormed(classStartingEquipment(d.owner.slug))
}
function backgroundEquipmentCovered(d: DecisionRecord): boolean {
  if (!is(d, 'background', 'equipment-package')) return false
  return equipmentChoiceWellFormed(backgroundStartingEquipment(d.owner.slug))
}

// `spell-count` family (table-column deltas: "Cantrips" / "Prepared Spells"). Covered when the
// class's own facet declares the matching pool (`cantrip` reads the 'cantrips' detail, `spell`
// reads 'prepared') AND that pool's own real totalByLevel table actually carries a value at this
// decision's exact level -- the SAME table P3.1's count authority already reads, never re-derived.
function spellCountCovered(d: DecisionRecord): boolean {
  if (!is(d, 'class', 'spell-count')) return false
  const pool = d.detail === 'cantrips' ? 'cantrip' : d.detail === 'prepared' ? 'spell' : null
  if (!pool) return false
  const requirement = classSpellRequirements(d.owner.slug).find((r) => r.pool === pool)
  return !!requirement && (requirement.totalByLevel[d.level - 1] ?? 0) > 0
}

// `spell-choice` family, Level 1, source "Spellcasting"/"Pact Magic" -- the class's own creation-
// time spell/cantrip/spellbook selection. Covered when the class declares ANY real spellRequirements
// at all: the generic Level-1 creation write-through (P3.3, create-v2.post.ts's own
// `characterClass.rulesFacet?.spellRequirements`) applies identically to every one, never gated by
// which specific pool phrase discovery happened to detect.
function casterCreationSpellChoiceCovered(d: DecisionRecord): boolean {
  if (!(is(d, 'class', 'spell-choice') && d.level === 1 && (d.source === 'Spellcasting' || d.source === 'Pact Magic'))) return false
  return classSpellRequirements(d.owner.slug).length > 0
}

// `spell-choice` family, source "Mystic Arcanum" -- one of Warlock's four independent tiers (6/7/8/9,
// encoded in the decision's own `detail`). Covered only when the facet declares an `arcanum` pool
// requirement at EXACTLY that tier's own level -- never "Warlock has Mystic Arcanum at all," so a
// tier the facet does not (yet) author stays its own, individually unclassified gap rather than
// riding along on a sibling tier's coverage.
function mysticArcanumCovered(d: DecisionRecord): boolean {
  if (!(is(d, 'class', 'spell-choice') && d.source === 'Mystic Arcanum')) return false
  const tier = Number(/spell-level=(\d+)/.exec(d.detail ?? '')?.[1] ?? '')
  if (!tier) return false
  return classSpellRequirements(d.owner.slug).some((r) => r.pool === 'arcanum' && r.filter.level === tier)
}

// `spell-choice` family, source "Spellcasting", detail "spellbook-growth" -- Wizard's own one real
// authored case, one decision per level 2-20 (P3.4's own target-state model covers all of them from
// a SINGLE authored `spellbook` requirement row, never a per-level special case). Covered when the
// facet's own spellbook requirement actually carries a HIGHER cumulative total at this level than at
// the previous one -- the real "+2 per level" growth this decision claims, read off the table, never
// asserted blind.
function spellbookGrowthCovered(d: DecisionRecord): boolean {
  if (!(is(d, 'class', 'spell-choice') && d.source === 'Spellcasting' && d.detail === 'spellbook-growth')) return false
  const requirement = classSpellRequirements(d.owner.slug).find((r) => r.pool === 'spellbook')
  if (!requirement) return false
  return (requirement.totalByLevel[d.level - 1] ?? 0) > (requirement.totalByLevel[d.level - 2] ?? 0)
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
  {
    id: 'impl:class-feature-option',
    status: 'implemented',
    reason: 'Class feature option (Divine Order, Primal Order creation; Blessed Strikes, Elemental Fury Level 7) via the generic choice:class.feature-option ChoiceSet (effect: activate-source). Runtime effects of the chosen option are a separate accountability row; see runtime:class-feature-option-effects.',
    ledgerIds: ['cleric-xphb:divine-order', 'druid-xphb:primal-order', 'cleric-xphb:blessed-strikes', 'druid-xphb:elemental-fury'],
    matches: (d) => classFeatureOptionCovered(d)
  },
  // Weapon Mastery phase -- the item-eligibility primitive (app/lib/item-mechanics, the generic
  // choice:class.weapon-mastery/.melee-only ChoiceSets, category: 'items') and the facet/
  // progression authoring are proven through the real generic Level 1->20 walk
  // (dnd5e-2024-progression-coverage.ts's own IMPLEMENTED rows) and the corpus/model/facet tests
  // (tests/rules/dnd5e-2024-weapon-mastery.test.ts). Reclassified BLOCKED -> IMPLEMENTED for
  // exactly the 10 real decisions this rule matches (Barbarian 3, Fighter 4, Paladin/Ranger/Rogue
  // 1 each) -- the real First New Class acceptance (Dwarf + Barbarian/Fighter/Paladin/Ranger +
  // Criminal through the unstubbed create-v2 route) is proven separately, in
  // create-v2-weapon-mastery.test.ts, and does not itself gate this edit (it depends on it).
  // Rogue's OWN remaining real blockers (Expertise, Thieves' Cant/language policy) are untouched
  // -- Weapon Mastery alone does not unlock Rogue.
  {
    id: 'impl:weapon-mastery',
    status: 'implemented',
    reason: 'Weapon Mastery (the Level-1 choice, plus Barbarian/Fighter own real count growth) via the generic choice:class.weapon-mastery/.melee-only ChoiceSets (category: items). Runtime effects of the mastered weapon\'s own property, and the optional Long-Rest replacement clause, are separate accountability rows (runtime:weapon-mastery-effects, opt:replacement) -- never conflated with this acquisition decision.',
    ledgerIds: [
      'barbarian-xphb:weapon-mastery', 'fighter-xphb:weapon-mastery', 'paladin-xphb:weapon-mastery', 'ranger-xphb:weapon-mastery', 'rogue-xphb:weapon-mastery',
      'barbarian-xphb:weapon-mastery-growth', 'fighter-xphb:weapon-mastery-growth'
    ],
    matches: (d) => weaponMasteryCovered(d)
  },

  // ------------------------------------------------------------------ blocked
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
  // ---------------------------------------------------------------- P3.5 reclassification
  // RECLASSIFIED (was `blk:caster-counts`/`blk:caster-l1-spell-choice`/`blk:mystic-arcanum`,
  // split from `blk:class-spell-choice-other`): the P2->P3.4 generic spell acquisition pipeline
  // is now real and deployed (SpellRequirement model, count/membership/filtering legality,
  // target-state planning, provenance, Level-1 creation write-through, progression write-through
  // through Level 20). Every rule below is a VERIFIED reclassification -- each checks the real
  // authored facet for the exact fact the decision claims, never a bare family/name match. See
  // this file's own SPELL ACQUISITION COVERAGE header above for the four verification functions.
  {
    id: 'impl:spell-count',
    status: 'implemented',
    reason: 'Cantrip and prepared-spell counts, at every level: SpellRequirement.totalByLevel is the count authority (P3.1), enforced through creation (P3.3) and progression (P3.4) alike.',
    ledgerIds: ['bard-xphb:spellcasting-spell-selection', 'cleric-xphb:spellcasting-spell-selection', 'druid-xphb:spellcasting-spell-selection', 'paladin-xphb:spellcasting-spell-selection', 'ranger-xphb:spellcasting-spell-selection', 'sorcerer-xphb:spellcasting-spell-selection', 'warlock-xphb:spellcasting-spell-selection', 'wizard-xphb:spellcasting-spell-selection'],
    matches: spellCountCovered
  },
  {
    id: 'impl:caster-creation-spell-choice',
    status: 'implemented',
    reason: 'Level 1 spell/cantrip/spellbook selection: class spell list, level, and count are enforced by planSpellAcquisition (P3.2) and persisted with provenance through create-v2.post.ts\'s canonical write-through (P3.3).',
    ledgerIds: ['bard-xphb:spellcasting-spell-selection', 'cleric-xphb:spellcasting-spell-selection', 'druid-xphb:spellcasting-spell-selection', 'paladin-xphb:spellcasting-spell-selection', 'ranger-xphb:spellcasting-spell-selection', 'sorcerer-xphb:spellcasting-spell-selection', 'warlock-xphb:spellcasting-spell-selection', 'wizard-xphb:spellcasting-spell-selection'],
    matches: casterCreationSpellChoiceCovered
  },
  {
    id: 'impl:mystic-arcanum',
    status: 'implemented',
    reason: 'Mystic Arcanum: each of the four tiers (6/7/8/9) is its own authored arcanum SpellRequirement, acquired through the Level Manager\'s progression write-through (P3.4) and reachable at its own real target level (11/13/15/17).',
    ledgerIds: ['warlock-xphb:mystic-arcanum'],
    matches: mysticArcanumCovered
  },
  {
    id: 'impl:spellbook-growth',
    status: 'implemented',
    reason: 'Wizard spellbook growth (+2 per level after 1): one authored `spellbook` SpellRequirement whose cumulative totalByLevel the Level Manager\'s target-state planner (P3.4) already satisfies for every level 2-20 from a single acquisition workflow, never a per-level special case.',
    ledgerIds: [],
    matches: (d) => is(d, 'class', 'spell-choice') && d.source === 'Spellcasting' && d.detail === 'spellbook-growth' && spellbookGrowthCovered(d)
  },
  {
    id: 'blk:class-spell-choice-other',
    status: 'blocked',
    reason: 'Spell choices the generic acquisition pipeline does not model: Magical Secrets (choosing from ANY class\'s spell list, not the owning class\'s own classList filter), Spell Mastery / Signature Spells (flagging an ALREADY-KNOWN spellbook spell as always-prepared/free-cast, not a new acquisition at all). Confirmed residual by P3.5\'s own audit, not reclassified.',
    ledgerIds: [],
    matches: (d) => is(d, 'class', 'spell-choice')
      && !(d.level === 1 && (d.source === 'Spellcasting' || d.source === 'Pact Magic'))
      && d.source !== 'Mystic Arcanum'
      && !(d.source === 'Spellcasting' && d.detail === 'spellbook-growth')
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
    id: 'impl:class-equipment',
    status: 'implemented',
    reason: 'Starting equipment (A/B[/C] bundles): app/lib/characters/equipment-bundle.ts resolves the real authored bundle, server/utils/character-equipment-bundle.ts validates and persists it (P8).',
    ledgerIds: [],
    matches: classEquipmentCovered
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
    id: 'impl:background-equipment',
    status: 'implemented',
    reason: 'Background starting equipment (A/B bundles, or pure gold): the SAME P8 resolver/authority as class equipment, scoped to the background owner.',
    ledgerIds: ['background:starting-equipment'],
    matches: backgroundEquipmentCovered
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
    // Weapon Mastery phase -- the four *-weapon-mastery-replacement rows (one per class with its
    // own Long-Rest "change one weapon kind" clause) now have their own dedicated ledger rows,
    // never the shared acquisition row.
    ledgerIds: [
      'fighter-xphb:fighting-style-replacement',
      'barbarian-xphb:weapon-mastery-replacement', 'fighter-xphb:weapon-mastery-replacement',
      'paladin-xphb:weapon-mastery-replacement', 'ranger-xphb:weapon-mastery-replacement', 'rogue-xphb:weapon-mastery-replacement'
    ],
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
    id: 'runtime:weapon-mastery-effects',
    status: 'runtime-effect',
    reason: 'The selected weapon\'s own mastery property (Cleave, Graze, Nick, Push, Sap, Slow, Topple, Vex) is derivable content data; its combat application is Milestone B. The acquisition (which weapon kinds are mastered) is the implemented decision; the mastery property\'s own effect is runtime.',
    ledgerIds: [
      'barbarian-xphb:weapon-mastery-effects', 'fighter-xphb:weapon-mastery-effects',
      'paladin-xphb:weapon-mastery-effects', 'ranger-xphb:weapon-mastery-effects', 'rogue-xphb:weapon-mastery-effects'
    ],
    allowZero: true,
    matches: () => false
  },
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
    id: 'runtime:class-feature-option-effects',
    status: 'runtime-effect',
    reason: 'Class feature option downstream effects (Milestone B): Thaumaturge/Magician\'s Source-gated bonus cantrip (needs a new primitive), and Divine Strike/Primal Strike/Potent Spellcasting\'s per-attack/per-cast combat text. The acquisition/activation decision is the implemented row; these effects are runtime.',
    ledgerIds: [
      'cleric-xphb:divine-order-thaumaturge-cantrip', 'druid-xphb:primal-order-magician-cantrip',
      'cleric-xphb:blessed-strikes-effects', 'druid-xphb:elemental-fury-effects'
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
