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
import { valueIdsOfDetail, SKILLS, skillValueId } from './proficiency-vocabulary'
import type { EquipmentChoice, RulesFacet } from './types'
// Read directly from the generated artifact, never from `creation-completeness.ts` (which itself
// imports `classifyDecision` from THIS file -- importing back would be circular). Used only by
// `subclassFixedSpellGrantCovered`'s own sibling-cardinality check below.
import mandatoryDecisionsArtifact from './dnd5e-2024-mandatory-decisions.json'

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
// ROGUE EXPERTISE PHASE -- Rogue's own Level 1 ("two of your skill
// proficiencies of your choice", a creation-time facet.choices entry) and
// Ranger's own Level 2 Deft Explorer (one skill, a dedicated Progression
// row) are now authored; both reclassified onto this map rather than kept
// in a separate blocked rule.
const SUPPORTED_EXPERTISE: Record<string, readonly number[]> = {
  'bard-xphb': [2, 9],
  'ranger-xphb': [2, 9],
  'rogue-xphb': [1, 6],
  'wizard-xphb': [2]
}
const FIGHTING_STYLE_LEVEL: Record<string, number> = { 'fighter-xphb': 1, 'paladin-xphb': 2, 'ranger-xphb': 2 }
// LANGUAGE CORPUS + POLICY PHASE -- Rogue's own Thieves' Cant feature's embedded "one other
// language" (Level 1, creation-time facet.choices) and Ranger's own Deft Explorer "Languages"
// half (Level 2, progression:class.language-deft-explorer) -- the only two class-owned
// language-choice decisions the real corpus has.
const SUPPORTED_LANGUAGE_CHOICE: Record<string, readonly number[]> = {
  'rogue-xphb': [1],
  'ranger-xphb': [2]
}

// Facet presence, read from the package facet corpus (no name branching).
function classFacetHasSkillChoice(slug: string): boolean {
  return (findRulesFacet('dnd5e.2024', 'class', slug)?.choices ?? []).some((c) => c.choiceSet === 'choice:skill.proficiency')
}
function speciesFacetHasSkillChoice(slug: string): boolean {
  return (findRulesFacet('dnd5e.2024', 'species', slug)?.choices ?? []).some((c) => c.choiceSet === 'choice:skill.proficiency')
}
// AASIMAR CREATION COMPLETION PHASE -- generic, name-agnostic: true whenever the OWNING species'
// own facet declares the named ChoiceSet, regardless of which species it is. A future species
// with the identical size (or any other) choice is covered the same way, with no species name in
// this check.
function speciesFacetHasChoice(slug: string, choiceSetId: string): boolean {
  return (findRulesFacet('dnd5e.2024', 'species', slug)?.choices ?? []).some((c) => c.choiceSet === choiceSetId)
}
// AASIMAR CREATION COMPLETION PHASE -- the species counterpart of
// `telekineticTelepathicSpellCovered`: a species-owned `spell-grant` decision is covered once its
// own facet declares at least one FixedSpellGrant (Aasimar's own single Light Bearer grant;
// PURE-AUTHORING SPECIES SWEEP -- widened from `=== 1` to `>= 1`: Elf's own facet now declares
// THREE, one gated per lineage -- any future species with the identical "one or more named,
// no-choice spells" shape is covered the same way).
function speciesFixedSpellGrantCovered(slug: string): boolean {
  return (findRulesFacet('dnd5e.2024', 'species', slug)?.fixedSpellGrants ?? []).length >= 1
}
// PURE-AUTHORING SPECIES SWEEP -- generic, name-agnostic: true whenever the owning species' own
// facet declares the shared `choice:species.feature-option` ChoiceSet (Dragonborn's Draconic
// Ancestry, Elf's Elven Lineage, Goliath's Giant Ancestry, Gnome's Gnomish Lineage today -- any
// future species/homebrew with the identical "choose 1 of N named options" shape is covered the
// same way, with no species name in this check).
function speciesFeatureOptionCovered(slug: string): boolean {
  return speciesFacetHasChoice(slug, 'choice:species.feature-option')
}
function classProgression(slug: string): readonly string[] {
  return findRulesFacet('dnd5e.2024', 'class', slug)?.progression ?? []
}
function classFacetHasChoice(slug: string, choiceSet: string): boolean {
  return (findRulesFacet('dnd5e.2024', 'class', slug)?.choices ?? []).some((c) => c.choiceSet === choiceSet)
}
// A4 -- the subclass-owned counterparts of `classProgression`/`classFacetHasChoice` above.
// `facet.progression` is consumed generically for every owner kind (character-actor-bridge.ts's
// own PROGRESSION loop has no owner-kind branch), so a subclass facet referencing a Progression
// Definition behaves identically to a class facet doing the same -- these two helpers exist only
// because `findRulesFacet`'s own owner-kind argument differs, never because the underlying
// mechanism does.
function subclassProgression(slug: string): readonly string[] {
  return findRulesFacet('dnd5e.2024', 'subclass', slug)?.progression ?? []
}
function subclassFacetHasChoice(slug: string, choiceSet: string): boolean {
  return (findRulesFacet('dnd5e.2024', 'subclass', slug)?.choices ?? []).some((c) => c.choiceSet === choiceSet)
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

// FEAT-OWNED SPELL ACQUISITION PHASE -- verification functions for the `impl:feat-spell-*` rules
// above. Each checks the REAL authored feat facet, never a bare owner-name match -- the same
// discipline every other `impl:` rule in this file already follows.
// FEAT-OWNED SPELL ACQUISITION PHASE -- the real corpus FIXES which spell list each Background's
// own Magic Initiate grant uses (Acolyte always Cleric, Guide always Druid, Sage always Wizard --
// re-derived directly from the raw Background `feats` key, e.g. "magic initiate; cleric|xphb"),
// never a player choice. `grantedBy` is `undefined` for the one real "ungated" decision copy
// discovery also produces (never reachable through any real acquisition path, since Magic
// Initiate's own category is Origin, never offered through the general feat pool) -- covered by
// the facet's own shape alone, with no specific background to verify a grant against.
const MAGIC_INITIATE_LIST_BY_BACKGROUND: Record<string, string> = {
  'acolyte-xphb': 'value:magic-initiate.list.1.active',
  'guide-xphb': 'value:magic-initiate.list.2.active',
  'sage-xphb': 'value:magic-initiate.list.3.active'
}
function magicInitiateSpellCovered(grantedBy?: string): boolean {
  const facet = findRulesFacet('dnd5e.2024', 'feat', 'magic-initiate-xphb')
  const requirements = facet?.spellRequirements ?? []
  const everyRequirementGated = requirements.length === 6 && requirements.every((r) => (r.requiresActive?.length ?? 0) > 0)
  if (!everyRequirementGated) return false
  if (grantedBy === undefined) return true
  const expectedGate = MAGIC_INITIATE_LIST_BY_BACKGROUND[grantedBy]
  if (!expectedGate) return false
  // HUMAN + GENERIC SELECTED-FEAT ACTIVATION PHASE -- the granting Background no longer fixes the
  // list via a plain `grants` entry (a global Value, blind to WHICH acquisition it belongs to --
  // see dnd5e-2024.ts's own Acolyte/Guide/Sage header). It presets Magic Initiate's own nested
  // "choose a list" choice instead, via `originFeatPreset`.
  const backgroundFacet = findRulesFacet('dnd5e.2024', 'background', grantedBy)
  return (backgroundFacet?.originFeatPreset?.['choice:feat.magic-initiate.list'] ?? []).includes(expectedGate)
}
function feyShadowTouchedSpellCovered(slug: string): boolean {
  const facet = findRulesFacet('dnd5e.2024', 'feat', slug)
  const hasFixedGrant = (facet?.fixedSpellGrants ?? []).length === 1
  const hasChoice = (facet?.spellRequirements ?? []).some((r) => r.pool === 'fixed')
  return hasFixedGrant && hasChoice
}
function telekineticTelepathicSpellCovered(slug: string): boolean {
  const facet = findRulesFacet('dnd5e.2024', 'feat', slug)
  return (facet?.fixedSpellGrants ?? []).length === 1
}
function blessedDruidicWarriorSpellCovered(slug: string): boolean {
  const facet = findRulesFacet('dnd5e.2024', 'feat', slug)
  const requirement = (facet?.spellRequirements ?? []).find((r) => r.pool === 'cantrip')
  return requirement !== undefined && (requirement.totalByLevel[0] ?? 0) === 2
}

// D&D 2024 Character Rules A1 -- Ritual Caster's real growth (2 at Level 1, +1 at each real
// Proficiency-Bonus-increase threshold: 5/9/13/17) is discovered as 5 SEPARATE, identically-shaped
// `spell-choice` decisions (every one forced to `level: 1` by `spellGrantDecisions`'s own
// `context !== 'feat'` collapse, mandatory-decisions.ts -- a known, documented discovery/model
// mismatch this phase deliberately does not fix). This
// verifies the REAL authored facet carries the actual growth shape (ungated `fixed` pool, the
// `ritual` filter dimension, and a monotonically non-decreasing totalByLevel reaching 6 by Level
// 17) rather than trusting the decision's own (miscounted) level/count fields -- every one of the
// 5 decisions sweeps in together once the facet is real, never individually.
function ritualCasterSpellCovered(): boolean {
  const facet = findRulesFacet('dnd5e.2024', 'feat', 'ritual-caster-xphb')
  const requirement = (facet?.spellRequirements ?? []).find((r) => r.pool === 'fixed' && r.filter.ritual === true)
  if (!requirement) return false
  const table = requirement.totalByLevel
  return (table[0] ?? 0) === 2 && (table[4] ?? 0) === 3 && (table[8] ?? 0) === 4 && (table[12] ?? 0) === 5 && (table[16] ?? 0) === 6
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

// ELDRITCH INVOCATIONS PHASE -- the real build decision is IMPLEMENTED once the owning facet
// genuinely references the generic accumulating-option primitive: the Level 1 decision (the real
// XPHB "you gain one invocation of your choice", a creation-time facet.choices entry) through the
// facet's own `choices` array; the Level 2/5/7/9/12/15/18 growth decisions (the real XPHB
// Invocations-known-by-level table) through the facet's own `progression` array, at the dedicated
// growth Progression this phase authored. Never a name check against "Eldritch Invocation" or
// "Warlock" itself -- a future homebrew class authoring the identical accumulating-option shape is
// covered the same way, with no class/option name in this check.
const CLASS_ACCUMULATING_OPTION_CHOICE_SET: Record<string, string> = {
  'warlock-xphb': 'choice:class.accumulating-option'
}
const CLASS_ACCUMULATING_OPTION_GROWTH_PROGRESSION: Record<string, string> = {
  'warlock-xphb': 'progression:class.accumulating-option-growth-2-5-7-9-12-15-18',
  // D&D 2024 Character Rules A1 -- Sorcerer's own Metamagic (XPHB classFeature "Metamagic"): gains
  // two options at Level 2 (never a Level-1 decision, unlike Warlock's Level-1 Invocation pick --
  // `accumulatingOptionCovered`'s own `d.level === 1` branch is therefore never reached for this
  // class), two more at 10, two more at 17.
  'sorcerer-xphb': 'progression:class.accumulating-option-growth-2-10-17'
}
function accumulatingOptionCovered(d: DecisionRecord): boolean {
  if (!is(d, 'class', 'accumulating-option')) return false
  if (d.level === 1) {
    const choiceSet = CLASS_ACCUMULATING_OPTION_CHOICE_SET[d.owner.slug]
    return choiceSet !== undefined && classFacetHasChoice(d.owner.slug, choiceSet)
  }
  const ref = CLASS_ACCUMULATING_OPTION_GROWTH_PROGRESSION[d.owner.slug]
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

// D&D 2024 Character Rules A1 -- feat-owned Expertise (Skill Expert, Boon of Skill: `expertise:
// [{anyProficientSkill: N}]`). Deliberately SEPARATE from `impl:expertise` above (narrowly scoped
// to `owner.kind === 'class'` via SUPPORTED_EXPERTISE), never widened into it -- a feat's own
// Expertise choice has no class-level cadence, only the feat's own facet. Covered when the facet
// offers `choice:skill.expertise` with the real corpus count and the full 18-skill universe, gated
// by the matching 18 proficient Values (requiresActive) -- the SAME shape the class rows already
// verify, reused, never re-derived ad hoc.
function featExpertiseCovered(d: DecisionRecord): boolean {
  if (!(d.owner.kind === 'feat' && d.family === 'expertise-choice')) return false
  const facet = findRulesFacet('dnd5e.2024', 'feat', d.owner.slug)
  const expertiseIds = SKILLS.map(skillExpertiseValueId)
  const proficientIds = SKILLS.map(skillValueId)
  return (facet?.choices ?? []).some((c) =>
    c.choiceSet === 'choice:skill.expertise'
    && c.count === d.cardinality
    && sameSet(c.from ?? [], expertiseIds)
    && sameSet(c.requiresActive?.filter((v): v is string => v !== null) ?? [], proficientIds)
  )
}
function skillExpertiseValueId(skill: string): string {
  return `value:skill.${skill}.expertise`
}

// D&D 2024 Character Rules A1 -- Elemental Adept's own prose-only damage-type choice ("Energy
// Mastery"). Covered when the facet offers the 5-option `choice:feat.elemental-adept.damage-type`
// AND declares `repeatAcquisitionDifferentiator` against the SAME ChoiceSet -- the real corpus is
// explicit that a repeat acquisition must choose a different damage type, and that is the ONLY
// generic primitive (`findIllegalRepeatAcquisition`) that can enforce it, so a facet missing the
// differentiator is not really covered, even if it offers the choice.
function elementalAdeptDamageTypeCovered(d: DecisionRecord): boolean {
  if (!(d.owner.kind === 'feat' && d.owner.slug === 'elemental-adept-xphb' && d.family === 'damage-type-choice')) return false
  const facet = findRulesFacet('dnd5e.2024', 'feat', 'elemental-adept-xphb')
  const hasChoice = (facet?.choices ?? []).some((c) => c.choiceSet === 'choice:feat.elemental-adept.damage-type' && c.count === d.cardinality && (c.from?.length ?? 0) === 5)
  return hasChoice && facet?.repeatAcquisitionDifferentiator === 'choice:feat.elemental-adept.damage-type'
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

// ---------------------------------------------------------------------------
// A3 -- SUBCLASS SPELL ACQUISITION COVERAGE.
// ---------------------------------------------------------------------------
// Every function here re-reads the REAL authored subclass facet (never a bare family/owner
// match) -- the same discipline every spell-acquisition rule in this file already follows.
// None names a specific subclass except `circleOfLandVariantCovered` (the real corpus has
// exactly one subclass-owned `variant-choice` decision, mirroring this file's own precedent
// for a single-instance-shaped rule, e.g. `impl:feat-damage-type-choice`).

// A fixed (no "of your choice") subclass spell grant: the corpus's own additionalSpells kind
// ('prepared'/'known'/unconditional-flat 'innate') maps onto `FixedSpellGrant.flag` ('known'
// for 'known' and unconditional 'innate' -- see this phase's own authoring header in
// dnd5e-2024.ts for why a flat 'innate' grant is modeled as 'known'; 'prepared' for
// 'prepared'). Covered when the subclass facet's own `fixedSpellGrants` carries EXACTLY the
// discovered count at the discovered level (never more, never fewer) -- a resource-gated
// 'innate' grant (Archfey Patron, Psi Warrior, Warrior of Shadow) is deliberately never
// authored (see that same header), so its own decision stays correctly unmatched here.
const SUBCLASS_SPELL_GRANT_FLAG_BY_KIND: Readonly<Record<string, 'known' | 'prepared'>> = {
  prepared: 'prepared', known: 'known', innate: 'known'
}

// SIBLING-CARDINALITY GUARD -- more than one real corpus kind can map to the SAME engine flag at
// the SAME (owner, level): Warrior of Shadow's own 'known' Minor Illusion AND 'innate' Darkness
// are BOTH Level 3, BOTH cardinality 1, BOTH -> flag 'known'. Comparing a single decision's own
// cardinality against the facet's raw grant count (as a naive per-decision check would) lets ONE
// real, correctly-authored grant (Minor Illusion) falsely satisfy BOTH decisions at once --
// Darkness (deliberately never authored, a resource-gated grant with no generic primitive, see
// dnd5e-2024.ts's own header) would wrongly read as covered too, a genuine false positive caught
// only by writing the real acceptance/census tests, not assumed. `DecisionRecord` carries no
// spell-identity field (discovery is shape-only, by design -- see mandatory-decisions.ts's own
// header), so there is no way to tell WHICH decision a given grant belongs to; the only fail
// -closed answer is to require the authored count to match the FULL SIBLING TOTAL (every
// decision sharing this exact owner+level+flag key), never just one decision's own slice. This
// is strictly conservative, never a false positive: it can turn a genuinely-authored decision
// blocked (if a sibling is deliberately withheld, as here), but it can never claim an
// under-authored decision is covered. Precomputed once from the real discovered corpus, never
// re-derived per call.
const SUBCLASS_FIXED_GRANT_SIBLING_TOTAL = new Map<string, number>()
for (const decision of (mandatoryDecisionsArtifact as { decisions: DecisionRecord[] }).decisions) {
  if (decision.owner.kind !== 'subclass' || decision.family !== 'spell-grant') continue
  const kind = decision.source.split('.').pop()
  const flag = kind ? SUBCLASS_SPELL_GRANT_FLAG_BY_KIND[kind] : undefined
  if (!flag) continue
  const key = `${decision.owner.slug}:${decision.level}:${flag}`
  SUBCLASS_FIXED_GRANT_SIBLING_TOTAL.set(key, (SUBCLASS_FIXED_GRANT_SIBLING_TOTAL.get(key) ?? 0) + (decision.cardinality ?? 0))
}

// A4 -- College of Glamour's own Level-6 "innate" Command: re-verified directly against the raw
// corpus (class-bard.json's own additionalSpells block) -- this "innate" entry carries NO
// "daily"/"resource" sub-key nesting at all (unlike Archfey Patron's/Psi Warrior's/Warrior of
// Shadow's own GENUINELY resource-gated innate grants, each nested that way), just a flat
// `{"6": ["command|xphb"]}`. It is the IDENTICAL spell its own "prepared" sibling already grants
// at the SAME level -- the real corpus's own discovery-model duplicate of one acquisition fact,
// not two. A small, explicitly named exception (never a generic "a prepared sibling exists"
// structural inference, which would also wrongly cover Archfey's own genuinely distinct
// free-cast Misty Step, since DecisionRecord carries no spell-identity field to tell them apart).
const SUBCLASS_FLAT_INNATE_DUPLICATE: ReadonlySet<string> = new Set(['college-of-glamour-xphb:6'])

function subclassFixedSpellGrantCovered(d: DecisionRecord): boolean {
  if (!is(d, 'subclass', 'spell-grant')) return false
  if (d.source.endsWith('.innate') && SUBCLASS_FLAT_INNATE_DUPLICATE.has(`${d.owner.slug}:${d.level}`)) return true
  const kind = d.source.split('.').pop()
  const flag = kind ? SUBCLASS_SPELL_GRANT_FLAG_BY_KIND[kind] : undefined
  if (!flag) return false
  const grants = findRulesFacet('dnd5e.2024', 'subclass', d.owner.slug)?.fixedSpellGrants ?? []
  const count = grants.filter((g) => g.flag === flag && (g.minLevel ?? 1) === d.level).length
  // `siblingTotal` already equals `d.cardinality` exactly whenever this decision is the ONLY one
  // sharing its (owner, level, flag) key -- the common case -- so this single comparison covers
  // both that case and the real multi-sibling one (Warrior of Shadow) without a second check.
  const siblingTotal = SUBCLASS_FIXED_GRANT_SIBLING_TOTAL.get(`${d.owner.slug}:${d.level}:${flag}`) ?? d.cardinality
  return count === siblingTotal
}

// A subclass-owned spell SELECTION ("learn N spells of your choice..."): the Wizard Arcane
// Traditions (Abjurer/Diviner/Evoker/Illusionist, school-restricted) and College of Lore's
// Magical Discoveries (Cleric/Druid/Wizard list) both reuse `pool: 'spellbook'` -- the
// existing `isLevelGated` dynamic level-cap (app/lib/characters/spell-requirements.ts)
// already matches each one's own real "of your current castable level or lower" growth
// exactly, with zero new filter shape (see dnd5e-2024.ts's own authoring header). Covered
// when the facet's own `spellbook`-pool requirement actually carries a HIGHER cumulative
// total at this decision's level than at the previous one -- the SAME growth check
// `spellbookGrowthCovered` above already uses for the Wizard class's own spellbook, restated
// here for a subclass owner (this is a DIFFERENT, independent requirement id on a DIFFERENT
// facet; it never reads or is read by the class's own spellbook pool).
function subclassSpellbookChoiceCovered(d: DecisionRecord): boolean {
  if (!is(d, 'subclass', 'spell-choice')) return false
  const requirement = (findRulesFacet('dnd5e.2024', 'subclass', d.owner.slug)?.spellRequirements ?? []).find((r) => r.pool === 'spellbook')
  if (!requirement) return false
  return (requirement.totalByLevel[d.level - 1] ?? 0) > (requirement.totalByLevel[d.level - 2] ?? 0)
}

// A3 WORKSTREAM -- THIRD-CASTER LEVELED SPELL ACQUISITION. Eldritch Knight's/Arcane Trickster's
// own LEVELED Wizard spell pool (the corpus's "expanded" additionalSpells kind -- re-derived as
// an eligibility marker over their OWN "Spells Prepared" feature, never a second acquisition;
// see dnd5e-2024.ts's own header). Covered once the subclass facet's own `spell`-pool requirement
// carries a HIGHER cumulative total at this decision's level than at the previous one -- the SAME
// growth check `subclassSpellbookChoiceCovered` above already uses, restated for pool 'spell'.
// This only matches real decisions now that `effectiveCasterTypeOf`
// (server/utils/character-spell-acquisition.ts) and the widened `progressionSpellSlotLevels`
// (server/utils/character-progression-spell-acquisition.ts, character-progression-plan.ts) let
// the subclass's OWN caster-type grant reach the level-gating derivation this pool depends on --
// before that fix, authoring this requirement would have claimed correctness the engine could
// not deliver (every candidate would see `maxSpellLevel === 0`), so it was deliberately withheld.
function subclassThirdCasterSpellPoolCovered(d: DecisionRecord): boolean {
  if (!(is(d, 'subclass', 'spell-choice') && d.source.endsWith('.expanded'))) return false
  const requirement = (findRulesFacet('dnd5e.2024', 'subclass', d.owner.slug)?.spellRequirements ?? []).find((r) => r.pool === 'spell')
  if (!requirement) return false
  return (requirement.totalByLevel[d.level - 1] ?? 0) > (requirement.totalByLevel[d.level - 2] ?? 0)
}

// Circle of the Land: "Choose a type of terrain... " -- the ONE real subclass-owned
// `variant-choice` decision in the whole corpus. Covered when the facet offers the 4-option
// `choice:subclass.feature-option` (the owner-agnostic Definition this phase adds,
// packages/eldra-dnd5e-2024/definitions.json, mirroring `choice:species.feature-option`
// verbatim) -- never a bare family/owner-kind match (a future second subclass-owned variant
// -choice would need its own, separately-verified rule, exactly like every other family
// here).
function circleOfLandVariantCovered(d: DecisionRecord): boolean {
  if (!(is(d, 'subclass', 'variant-choice') && d.owner.slug === 'circle-of-the-land-xphb')) return false
  const facet = findRulesFacet('dnd5e.2024', 'subclass', 'circle-of-the-land-xphb')
  return (facet?.choices ?? []).some((c) => c.choiceSet === 'choice:subclass.feature-option' && c.count === 1 && (c.from?.length ?? 0) === 4)
}

// Third-caster subclass casting progression (Eldritch Knight / Arcane Trickster): the real
// decision text is "a third-caster slot table is not defined" -- now false, the slot table
// (`table:spellcasting.slots_third`, A2 WORKSTREAM 4) exists AND is wired to the owning
// subclass via its own `value:spellcasting.caster_type.third` grant (dnd5e-2024.ts). Covered
// by that grant alone -- deliberately NOT gated on the leveled Wizard-spell pool also being
// representable (a separate, independently-reported STOP; see this phase's own report),
// since this decision's own text is about the SLOT TABLE, not spell acquisition.
function subclassThirdCasterGrantCovered(d: DecisionRecord): boolean {
  if (!is(d, 'subclass', 'spell-count')) return false
  const facet = findRulesFacet('dnd5e.2024', 'subclass', d.owner.slug)
  return (facet?.grants ?? []).some((g) => g.set === 'value:spellcasting.caster_type.third' && g.to === true)
}

// ---------------------------------------------------------------------------
// A4 -- REMAINING MANDATORY DECISION CLOSURE.
// ---------------------------------------------------------------------------
// Every function here reuses an EXISTING generic primitive under a subclass owner (never a
// new engine mechanism), re-verified directly against the real authored facet, the same
// discipline this file's own A3 section above already established for subclass owners.

// Battle Master's own Combat Superiority maneuvers: the SAME `accumulating-option` shape
// Warlock Invocations/Sorcerer Metamagic already use (accumulatingOptionCovered above),
// reused under a subclass owner via `choice:subclass.accumulating-option`. Discovery only
// ever produces ONE decision for this subclass (cardinality 3, Level 3 -- see dnd5e-2024.ts's
// own header on `battle-master-xphb` for the exact discovery/model limitation, a known,
// pre-existing mismatch this phase does not fix), so this rule verifies the single real
// decision directly; the facet's own further growth (Level 7/10/15) is authored for
// correctness but claims no separate ledger row of its own.
function subclassAccumulatingOptionCovered(d: DecisionRecord): boolean {
  if (!is(d, 'subclass', 'accumulating-option')) return false
  return subclassFacetHasChoice(d.owner.slug, 'choice:subclass.accumulating-option')
}

// Champion's own Additional Fighting Style (Level 7): "gain another Fighting Style feat of
// your choice" -- the SAME `choice:feat.fighting-style.fs-only` content-catalogue pick the
// owning class already grants at Level 1 (impl:fighting-style above), re-offered through its
// own dedicated subclass Progression row. The real catalogue's own `repeatable: false` on
// every Fighting Style feat (re-verified directly) means `findIllegalRepeatAcquisition`
// (already run generically for every feat acquisition, character-progression-plan.ts) already
// rejects picking the IDENTICAL style twice -- no new primitive, no class/subclass name
// branch in engine code.
const SUBCLASS_FIGHTING_STYLE_PROGRESSION: Record<string, string> = {
  'champion-xphb': 'progression:subclass.fighting-style-additional'
}
function subclassFightingStyleCovered(d: DecisionRecord): boolean {
  if (!(is(d, 'subclass', 'feat-choice') && d.detail === 'category=FS')) return false
  const ref = SUBCLASS_FIGHTING_STYLE_PROGRESSION[d.owner.slug]
  return ref !== undefined && subclassProgression(d.owner.slug).includes(ref)
}

// Draconic Sorcery's own Elemental Affinity (Level 6): a free, standalone 5-option damage-type
// pick (re-verified directly: the real XPHB corpus has no separate lineage pick for this
// subclass), the SAME opaque `value:*.damage-type.<type>.active` shape Elemental Adept's own
// feat-owned damage-type choice already uses, reused under its own dedicated subclass
// Progression row -- never a class/subclass name branch beyond this small, explicit map (the
// same posture `FIGHTING_STYLE_LEVEL`/`CLASS_FEATURE_OPTION_PROGRESSION` already establish).
const SUBCLASS_DAMAGE_TYPE_PROGRESSION: Record<string, string> = {
  'draconic-sorcery-xphb': 'progression:subclass.elemental-affinity'
}
function subclassDamageTypeChoiceCovered(d: DecisionRecord): boolean {
  if (!is(d, 'subclass', 'damage-type-choice')) return false
  const ref = SUBCLASS_DAMAGE_TYPE_PROGRESSION[d.owner.slug]
  return ref !== undefined && subclassProgression(d.owner.slug).includes(ref)
}

// Hunter's own Hunter's Prey (Level 3, the same level Ranger selects its subclass) and
// Defensive Tactics (Level 7); Path of the Wild Heart's own Aspect of the Wilds (Level 6) --
// three REAL "choose 1 of N named options" decisions (re-verified directly; each one's own
// optional "replace/change" clause is its own separate, never-blocking `opt:replacement` row),
// the SAME shape Circle of the Land's own terrain pick already uses via
// `choice:subclass.feature-option`. A decision at the owning class's own subclass-selection
// level is covered through the facet's direct `choices`; a later one through its own
// dedicated Progression row -- the identical Level-1-vs-Level-7 split
// `classFeatureOptionCovered` above already draws for class-owned feature options. Path of the
// Wild Heart's own Rage of the Wilds is its own separate, explicit exception below -- not a
// build decision at all.
const SUBCLASS_FEATURE_OPTION_AT_SELECTION: ReadonlySet<string> = new Set(['hunter-xphb:3:hunters-prey'])
const SUBCLASS_FEATURE_OPTION_PROGRESSION: Record<string, string> = {
  'hunter-xphb:7:defensive-tactics': 'progression:subclass.feature-option.defensive-tactics',
  'path-of-the-wild-heart-xphb:6:aspect-of-the-wilds': 'progression:subclass.feature-option.aspect-of-the-wilds'
}
// A4 -- Path of the Wild Heart's own Rage of the Wilds (Level 3): re-verified directly, its own
// real text reads "Whenever you ACTIVATE your Rage, you gain one of the following options of
// your choice" -- re-chosen on every Rage activation, not a persistent build fact at all,
// unlike this SAME subclass's own Aspect of the Wilds (a genuine, persistent choice, covered
// above). There is correctly nothing to store at creation or level-up for a per-activation
// pick -- the facet's own silence on this decision IS the complete, correct representation of
// it, not an omission. A small, explicitly named exception (never a generic "no sentence
// matched a trigger regex" structural inference), since `mandatory-decisions.ts`'s own
// per-use-trigger filter only inspects a feature's FIRST sentence and this recurring-per-use
// clause sits in a SECOND one, so it was never excluded at discovery time.
const SUBCLASS_FEATURE_OPTION_PER_USE: ReadonlySet<string> = new Set(['path-of-the-wild-heart-xphb:3:rage-of-the-wilds'])
function subclassFeatureOptionCovered(d: DecisionRecord): boolean {
  if (!is(d, 'subclass', 'feature-option')) return false
  const key = `${d.owner.slug}:${d.level}:${slugOf(d.source)}`
  if (SUBCLASS_FEATURE_OPTION_PER_USE.has(key)) return true
  if (SUBCLASS_FEATURE_OPTION_AT_SELECTION.has(key)) return subclassFacetHasChoice(d.owner.slug, 'choice:subclass.feature-option')
  const ref = SUBCLASS_FEATURE_OPTION_PROGRESSION[key]
  return ref !== undefined && subclassProgression(d.owner.slug).includes(ref)
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
    id: 'impl:primal-knowledge',
    status: 'implemented',
    reason: 'Barbarian Primal Knowledge (Level 3): "another skill of your choice from the skill list available to Barbarians at level 1," via progression:class.skill-proficiency-growth-3 -- the SAME choice:skill.proficiency + excludeIfAlreadyActive primitive Level 1\'s own skill choice already uses, re-offered from the identical 6-skill list (the 2 already chosen at Level 1 are automatically excluded).',
    ledgerIds: ['barbarian-xphb:primal-knowledge'],
    matches: (d) => is(d, 'class', 'skill-choice') && d.level === 3 && d.source === 'Primal Knowledge' && classProgression(d.owner.slug).includes('progression:class.skill-proficiency-growth-3')
  },
  {
    id: 'impl:species-skill-choice',
    status: 'implemented',
    reason: 'Species skill proficiency choice (choice:skill.proficiency on the species facet).',
    ledgerIds: [],
    matches: (d) => is(d, 'species', 'skill-choice') && speciesFacetHasSkillChoice(d.owner.slug)
  },
  {
    id: 'impl:species-feature-option',
    status: 'implemented',
    reason: 'Species lineage/ancestry choice ("choose 1 of N named options"): Dragonborn\'s Draconic Ancestry, Elf\'s Elven Lineage, Goliath\'s Giant Ancestry, Gnome\'s Gnomish Lineage. All four are structurally identical to Divine Order\'s/Primal Order\'s own choice:class.feature-option -- reused under a second, owner-agnostic Definition (choice:species.feature-option), never a species name check. Linked consequences (Dragonborn\'s own resistance-by-ancestry) resolve through the chosen option\'s own Source modifiers, never a second mandatory decision.',
    ledgerIds: [],
    matches: (d) => (is(d, 'species', 'variant-choice') || is(d, 'species', 'damage-type-choice')) && speciesFeatureOptionCovered(d.owner.slug)
  },
  {
    id: 'impl:species-size-choice',
    status: 'implemented',
    reason: 'Species size choice (Aasimar: Small or Medium, "chosen when you select this species"), via the generic, reusable choice:species.size ChoiceSet (the exact choice:skill.proficiency mechanism: a literal Value id per option, no activate-source needed) -- never a species name check.',
    ledgerIds: [],
    matches: (d) => is(d, 'species', 'size-choice') && speciesFacetHasChoice(d.owner.slug, 'choice:species.size')
  },
  {
    id: 'impl:species-spell-fixed-grant',
    status: 'implemented',
    reason: 'Species-owned fixed spell grant with no "of your choice" clause at all (Aasimar\'s Light Bearer: "You know the Light cantrip"), via FixedSpellGrant -- the exact shape Telekinetic\'s/Telepathic\'s own feat-owned fixed grants already use. Casting ability is a separate, deferred fact, never conflated with this acquisition decision.',
    ledgerIds: [],
    matches: (d) => is(d, 'species', 'spell-grant') && speciesFixedSpellGrantCovered(d.owner.slug)
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
    reason: 'Skill Expertise at the levels its facet choices/progression supports -- Rogue Level 1 (creation-time facet.choices, this phase\'s own new requiresActive eligibility) and Ranger Level 2 Deft Explorer (progression:class.skill-expertise-deft-explorer) reclassified here alongside the already-implemented Bard/Ranger/Rogue/Wizard rows.',
    ledgerIds: ['bard-xphb:expertise', 'ranger-xphb:expertise', 'ranger-xphb:expertise-deft-explorer', 'rogue-xphb:expertise', 'rogue-xphb:expertise-creation', 'wizard-xphb:scholar'],
    matches: (d) => is(d, 'class', 'expertise-choice') && (SUPPORTED_EXPERTISE[d.owner.slug] ?? []).includes(d.level)
  },
  {
    id: 'impl:feat-expertise-choice',
    status: 'implemented',
    reason: 'Skill Expert / Boon of Skill: feat-owned Expertise (expertise.anyProficientSkill), via the SAME choice:skill.expertise + all-18-skill requiresActive shape the class Expertise rows above already use -- a separate rule from impl:expertise, never a widening of its class-only SUPPORTED_EXPERTISE allowlist. The real corpus has no third feat with an `expertise` field, so this rule carries no paired `blk:` fallback (an always-zero blocked rule is dead code, not a real fail-closed guard -- see this file\'s own precedent for `blk:feat-nested-spells`\'s removal); an uncovered feat-owned expertise-choice decision still fails closed via `classifyDecision`\'s own zero-match default.',
    ledgerIds: [],
    matches: (d) => featExpertiseCovered(d)
  },
  {
    id: 'impl:feat-damage-type-choice',
    status: 'implemented',
    reason: 'Elemental Adept\'s prose-only "Energy Mastery" damage-type choice (discovered via the small, named FEAT_DAMAGE_TYPE_CHOICE supplement, mandatory-decisions.ts -- mirrors FeatureRequirementMapping\'s own precedent, never a prose-parsing engine), via the 5-option choice:feat.elemental-adept.damage-type ChoiceSet, with repeatAcquisitionDifferentiator enforcing the real corpus\'s "must choose a different damage type each time" rule across repeat acquisitions (findIllegalRepeatAcquisition, reused generically, never Elemental-Adept-specific code). The real corpus has no second feat with this prose-only shape, so this rule carries no paired `blk:` fallback; an uncovered damage-type-choice decision still fails closed via classifyDecision\'s own zero-match default.',
    ledgerIds: [],
    matches: (d) => elementalAdeptDamageTypeCovered(d)
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
    reason: 'Class feature option (Divine Order, Primal Order creation; Blessed Strikes, Elemental Fury Level 7) via the generic choice:class.feature-option ChoiceSet (effect: activate-source). Runtime effects of the chosen option are a separate accountability row; see runtime:class-feature-option-effects. FEAT-OWNED SPELL ACQUISITION PHASE REVISIT -- Thaumaturge and Magician\'s own bonus-cantrip rows are claimed here too: the SAME discovered Divine-Order/Primal-Order decision this rule already matches, now ALSO satisfied for its spell-pick consequence via SpellRequirement.requiresActive (no separate decision is independently discovered for the cantrip text itself -- it is a Progression Coverage Ledger bookkeeping row, not a distinct mandatory-decision id).',
    ledgerIds: [
      'cleric-xphb:divine-order', 'druid-xphb:primal-order', 'cleric-xphb:blessed-strikes', 'druid-xphb:elemental-fury',
      'cleric-xphb:divine-order-thaumaturge-cantrip', 'druid-xphb:primal-order-magician-cantrip'
    ],
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
  // ELDRITCH INVOCATIONS PHASE -- the real build decision is IMPLEMENTED once the owning facet
  // genuinely references the generic accumulating-option primitive (see accumulatingOptionCovered
  // above for the full reasoning). Reclassified BLOCKED -> IMPLEMENTED for exactly the 8 real
  // Warlock decisions this rule matches (L1 count 1, L2/L5 count 2 each, L7/L9/L12/L15/L18 count 1
  // each -- the real XPHB Invocations-known-by-level table). Replacement/retraining
  // ("Replacing and Gaining Invocations") remains its own separate, optional accountability row
  // (opt:replacement) -- never conflated with this acquisition decision. Metamagic and Battle
  // Master maneuvers are each a DIFFERENT real decision family/source and remain their own
  // separately-tracked blocked rows below, untouched by this reclassification.
  {
    id: 'impl:invocations',
    status: 'implemented',
    reason: 'Eldritch Invocations (the Level-1 choice, plus the real Level 2/5/7/9/12/15/18 count growth) via the generic, class/feature-name-agnostic choice:class.accumulating-option ChoiceSet and progression:class.accumulating-option-growth-2-5-7-9-12-15-18. Sorcerer Metamagic (Level 2/10/17, two options gained at each) reclassified here too, via the SAME primitive and its own progression:class.accumulating-option-growth-2-10-17 -- never a feature-name branch, the identical accumulating-option shape either way. Runtime effects of an acquired invocation/Metamagic option are a separate accountability row, never conflated with this acquisition decision.',
    ledgerIds: ['warlock-xphb:eldritch-invocations', 'warlock-xphb:eldritch-invocations-growth', 'sorcerer-xphb:metamagic'],
    matches: (d) => accumulatingOptionCovered(d)
  },

  // ------------------------------------------------------------------ blocked
  // D&D 2024 Character Rules A1 -- `blk:metamagic` is REMOVED, not merely narrowed: Metamagic is
  // now authored via the generic accumulating-option primitive (progression:class.accumulating-
  // option-growth-2-10-17) and reclassified onto `impl:invocations` above -- a permanently-empty
  // blocked rule is dead code, not a real fail-closed guard (established precedent elsewhere in
  // this file).
  // A4 -- `blk:battle-master-maneuvers` is REMOVED, not merely narrowed: Combat Superiority is now
  // authored via `choice:subclass.accumulating-option` (dnd5e-2024.ts) and reclassified onto
  // `impl:subclass-accumulating-option` below -- the rule would match zero real decisions.
  {
    id: 'impl:subclass-accumulating-option',
    status: 'implemented',
    reason: 'Battle Master Combat Superiority maneuvers via the generic, class/feature-name-agnostic choice:subclass.accumulating-option ChoiceSet (the SAME shape Eldritch Invocations/Sorcerer Metamagic already use), plus the real Level 7/10/15 growth. Runtime effects of a known maneuver are a separate accountability row, never conflated with this acquisition decision.',
    ledgerIds: ['fighter-xphb:battle-master-xphb:combat-superiority'],
    matches: subclassAccumulatingOptionCovered
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
  // ROGUE EXPERTISE PHASE -- the two blocked rules that used to own Rogue
  // Level 1 and Ranger Level 2 Deft Explorer are RETIRED: both decisions are
  // now authored and reclassified onto `impl:expertise` above. Every real
  // `expertise-choice` decision (7 total -- Bard L2/L9, Ranger L2/L9, Rogue
  // L1/L6, Wizard L2) now matches `impl:expertise` and nothing else.
  // D&D 2024 Character Rules A1 -- `blk:class-skill-extra` (the former catch-all for "extra skill
  // proficiency at a later level," Barbarian Primal Knowledge's own prior home) is REMOVED, not
  // merely narrowed: Primal Knowledge was the ONLY real corpus decision in this shape, and it is
  // now implemented via `impl:primal-knowledge` above -- a permanently-empty blocked rule is dead
  // code, not a real fail-closed guard (see this file's own established precedent for `blk:feat-
  // spell-*`'s own removed rules).
  // LANGUAGE CORPUS + POLICY PHASE -- `blk:class-language` (previously the single catch-all for
  // every `language-choice` decision) is RETIRED: all 3 real decisions (1 package-owned
  // universal rule, Rogue L1, Ranger L2) are now authored. Split into two rules below so a
  // FUTURE unsupported language decision (a new class, or any owner.kind/level this file does
  // not yet name) still fails closed rather than being silently absorbed by either.
  {
    id: 'impl:universal-language-choice',
    status: 'implemented',
    reason: 'The universal "Choose Languages" creation rule (PHB chapter 2, p.37 -- Common plus two Standard languages) via RulesPackageManifest.universalCreation (app/lib/rules/types.ts), consumed through the SAME facet-shaped grants/choices pipeline every Species/Class/Background slot already uses (character-actor-bridge.ts\'s own `consumeFacet`; creation-choice-eligibility.ts\'s own generic slots array) -- a package-owned decision, never duplicated per class.',
    ledgerIds: ['package:dnd5e-2024:universal-languages'],
    matches: (d) => is(d, 'package', 'language-choice')
  },
  {
    id: 'impl:class-language',
    status: 'implemented',
    reason: 'Rogue\'s own Thieves\' Cant feature\'s embedded "one other language" (Level 1, creation-time facet.choices) and Ranger\'s own Deft Explorer "Languages" half (Level 2, progression:class.language-deft-explorer) -- both real, textually-distinct decisions, each reusing the SAME generic `choice:language.known` primitive the universal rule above also uses.',
    ledgerIds: ['rogue-xphb:thieves-cant-language', 'ranger-xphb:deft-explorer-language'],
    matches: (d) => is(d, 'class', 'language-choice') && (SUPPORTED_LANGUAGE_CHOICE[d.owner.slug] ?? []).includes(d.level)
  },
  {
    id: 'impl:class-equipment',
    status: 'implemented',
    reason: 'Starting equipment (A/B[/C] bundles): app/lib/characters/equipment-bundle.ts resolves the real authored bundle, server/utils/character-equipment-bundle.ts validates and persists it (P8).',
    ledgerIds: [],
    matches: classEquipmentCovered
  },
  // A3 -- SUBCLASS SPELL AUTHORING. Reclassifies every subclass-owned fixed spell grant
  // (prepared/known/unconditional-flat-innate), the Wizard Arcane Traditions' and College of
  // Lore's own spell SELECTION, and Circle of the Land's terrain variant-choice -- see
  // dnd5e-2024.ts's own A3 header for the full corpus re-derivation and what is
  // deliberately NOT authored (resource-gated innate grants; Eldritch Knight's/Arcane
  // Trickster's own LEVELED Wizard spell pool, a reported STOP). `blk:subclass-spells`
  // immediately below is narrowed to exactly what these three rules do NOT cover, never
  // widened -- the bidirectional contract requires every decision match exactly one rule.
  {
    id: 'impl:subclass-fixed-spell-grant',
    status: 'implemented',
    reason: 'Subclass-owned fixed (no "of your choice") spell grant -- domain/patron/circle/tradition spells, always-prepared or permanently-known, growing by character level -- via FixedSpellGrant.minLevel, the SAME windowed-resolution machinery species/feat fixed grants already use, with `subclass` as an ordinary owner (A2). Also covers College of Glamour\'s own Level-6 "innate" Command (A4): a flat, unconditional duplicate of the SAME spell its own "prepared" FixedSpellGrant already names at the SAME level -- the real corpus\'s own discovery-model duplicate of one acquisition fact, not two.',
    ledgerIds: [],
    matches: subclassFixedSpellGrantCovered
  },
  {
    id: 'impl:subclass-spellbook-choice',
    status: 'implemented',
    reason: 'Subclass-owned spell SELECTION (Wizard Arcane Traditions\' school-restricted bonus spells; College of Lore\'s Magical Discoveries) via a subclass-owned `spellbook`-pool SpellRequirement, reusing the existing dynamic level-gate (`isLevelGated`) exactly as the owning class\'s own normal spell-slot progression already caps it -- zero new filter shape.',
    ledgerIds: ['bard-xphb:college-of-lore-xphb:magical-discoveries'],
    matches: subclassSpellbookChoiceCovered
  },
  {
    id: 'impl:circle-of-the-land-variant',
    status: 'implemented',
    reason: 'Circle of the Land\'s terrain pick (which fixed spell list applies) via the new, owner-agnostic `choice:subclass.feature-option` ChoiceSet (mirrors `choice:species.feature-option` verbatim) plus four terrain-gated FixedSpellGrant sets.',
    ledgerIds: [],
    matches: circleOfLandVariantCovered
  },
  // A3 WORKSTREAM -- THIRD-CASTER LEVELED SPELL ACQUISITION. Eldritch Knight's/Arcane
  // Trickster's own LEVELED Wizard spell pool, previously a reported STOP (see this phase's own
  // earlier final report) -- now implemented, once `effectiveCasterTypeOf`/the widened
  // `progressionSpellSlotLevels` let the subclass's own caster-type grant reach the
  // level-gating derivation a `spell`-pool requirement depends on (see dnd5e-2024.ts's own A3
  // header and subclassThirdCasterSpellPoolCovered's own header for the full mechanism).
  {
    id: 'impl:subclass-third-caster-spell-pool',
    status: 'implemented',
    reason: 'Eldritch Knight\'s/Arcane Trickster\'s own LEVELED Wizard spell pool ("Spells Prepared") via a subclass-owned `spell`-pool SpellRequirement, now correctly level-gated against the character\'s own third-caster-derived maxSpellLevel (effectiveCasterTypeOf, server/utils/character-spell-acquisition.ts).',
    ledgerIds: [],
    matches: subclassThirdCasterSpellPoolCovered
  },
  // A4 -- College of Glamour's own Level-6 "innate" Command is now explicitly excluded here
  // (reclassified onto `fp:college-of-glamour-command-duplicate` below, a genuine discovery
  // -model duplicate of the SAME spell the "prepared" sibling already grants at the SAME
  // level -- never a second real decision; see that rule's own header for the full corpus
  // re-verification) -- `blk:subclass-spells` itself is narrowed, never widened, so the
  // bidirectional contract (every decision matches EXACTLY one rule) still holds.
  {
    id: 'blk:subclass-spells',
    status: 'blocked',
    reason: 'Subclass spell grants/choices/variants the A3 rules above do not cover: resource-gated "innate" grants (Archfey Patron, Psi Warrior, Warrior of Shadow -- no generic primitive for a spell usable only via a specific finite resource, never a normal slot). College of Glamour\'s own discovery-model-duplicate "innate" Command is reclassified onto impl:subclass-fixed-spell-grant above, never counted here.',
    ledgerIds: [],
    matches: (d) =>
      (is(d, 'subclass', 'spell-grant') && !subclassFixedSpellGrantCovered(d)) ||
      (is(d, 'subclass', 'spell-choice') && !subclassSpellbookChoiceCovered(d) && !subclassThirdCasterSpellPoolCovered(d)) ||
      (is(d, 'subclass', 'variant-choice') && !circleOfLandVariantCovered(d))
  },
  // A4 -- `blk:subclass-feature-option` and `blk:champion-fighting-style` are REMOVED, not
  // merely narrowed: every real decision either rule matched is now reclassified (Hunter's
  // Prey/Defensive Tactics/Aspect of the Wilds onto `impl:subclass-feature-option` below,
  // Rage of the Wilds onto `fp:rage-of-the-wilds`, Champion's Additional Fighting Style onto
  // `impl:subclass-fighting-style`) -- both rules would match zero real decisions
  // permanently, and a `blocked` rule may never carry `allowZero` (this file's own
  // established contract), so both are deleted rather than kept alive artificially.
  {
    id: 'impl:subclass-feature-option',
    status: 'implemented',
    reason: 'Hunter\'s own Hunter\'s Prey (Level 3) and Defensive Tactics (Level 7); Path of the Wild Heart\'s own Aspect of the Wilds (Level 6) -- each a "choose 1 of N named options" decision via the generic, class/subclass-name-agnostic choice:subclass.feature-option ChoiceSet (the SAME shape Circle of the Land\'s own terrain pick already uses). Runtime effects of the chosen option, and the optional Short/Long-Rest replacement clause, are separate accountability rows, never conflated with this acquisition decision. Also covers Path of the Wild Heart\'s own Rage of the Wilds (A4): re-chosen on every Rage activation (its own real text), not a persistent build fact at all -- correctly represented by storing nothing, never a fabricated one-time pick.',
    ledgerIds: [],
    matches: subclassFeatureOptionCovered
  },
  {
    id: 'impl:subclass-fighting-style',
    status: 'implemented',
    reason: 'Champion\'s own Additional Fighting Style (Level 7): another Fighting Style feat of your choice, via the SAME choice:feat.fighting-style.fs-only content-catalogue pick the owning class already grants at Level 1, through its own dedicated subclass Progression row. The real catalogue\'s own repeatable:false on every Fighting Style feat (re-verified directly) means a duplicate same-style pick is already rejected generically, with no new primitive.',
    ledgerIds: ['fighter-xphb:additional-fighting-style'],
    matches: subclassFightingStyleCovered
  },
  // A4 -- `blk:subclass-proficiency-damage` is NARROWED, never widened: Draconic Sorcery's own
  // Elemental Affinity (damage-type-choice) is reclassified onto `impl:subclass-damage-type
  // -choice` below; Gloom Stalker's own Iron Mind (proficiency-choice, a save proficiency that
  // is FIXED unless already held, in which case it becomes a free choice between two OTHER
  // saves -- re-verified directly) remains a genuine STOP: no existing primitive represents a
  // grant that switches between "fixed" and "choice" depending on the character's own prior
  // state (`excludeIfAlreadyActive` only ever narrows an existing CHOICE pool, it cannot turn a
  // FIXED grant into a choice) -- see this phase's own final report for the minimal proposed
  // extension.
  {
    id: 'impl:subclass-damage-type-choice',
    status: 'implemented',
    reason: 'Draconic Sorcery\'s own Elemental Affinity (Level 6): a free, standalone 5-option damage-type pick (re-verified directly -- no separate lineage pick exists for this subclass), via the SAME opaque value:*.damage-type.<type>.active shape Elemental Adept\'s own feat-owned damage-type choice already uses, through its own dedicated subclass Progression row.',
    ledgerIds: [],
    matches: subclassDamageTypeChoiceCovered
  },
  {
    id: 'blk:subclass-proficiency-damage',
    status: 'blocked',
    reason: 'Gloom Stalker\'s own Iron Mind (Level 7): proficiency in Wisdom saving throws, UNLESS already proficient, in which case a free choice between Intelligence or Charisma instead. No vocabulary for a grant that is FIXED in one branch and a CHOICE in another, conditioned on prior state.',
    ledgerIds: [],
    matches: (d) => is(d, 'subclass', 'proficiency-choice') || (is(d, 'subclass', 'damage-type-choice') && !subclassDamageTypeChoiceCovered(d)) || is(d, 'class', 'damage-type-choice')
  },
  // HUMAN + GENERIC SELECTED-FEAT ACTIVATION PHASE -- `blk:species-feat-choice` deleted outright,
  // mirroring `blk:species-size` immediately below: Human was the ONLY species-owned `feat-choice`
  // decision in the whole corpus (independently confirmed), and it is now representable via the
  // generic `choice:feat.origin-selection` content-catalogue ChoiceSet (`impl:species-feat-choice`
  // below), so this rule would match zero real decisions. Versatile's own real semantics ("you gain
  // a feat of your choice from the Origin feat category") is a FREE choice among all 10 Origin
  // feats, reusing the EXACT `choice:feat.fighting-style.fs-only`-shaped precedent (a creation-time,
  // catalogue-backed feat selection) -- never a Human-specific picker. Magic Initiate's own former
  // blocker (its `requiresActive` gate had no mechanism for a freely-chosen, non-Background-fixed
  // spell list) is independently closed this phase too: the feat's own facet now declares an
  // unconditional nested "choose a list" choice, and a Background's fixed acquisition presets it
  // (`originFeatPreset`) instead of setting a global gate -- see dnd5e-2024.ts's own header on
  // `magic-initiate-xphb`/Acolyte/Guide/Sage for the full mechanism.
  {
    id: 'impl:species-feat-choice',
    status: 'implemented',
    reason: 'Species-owned free feat choice (Human\'s Versatile: "a feat of your choice from the Origin feat category"), via the generic, reusable, category-filtered `choice:feat.origin-selection` content-catalogue ChoiceSet -- never a species name check. A selected feat\'s own nested choices (if any) activate through the SAME generic acquisition pipeline a Background-fixed feat already uses.',
    ledgerIds: [],
    matches: (d) => is(d, 'species', 'feat-choice') && speciesFacetHasChoice(d.owner.slug, 'choice:feat.origin-selection')
  },
  // TIEFLING SPECIES COMPLETION -- `blk:species-lineage`/`blk:species-damage` are REMOVED: Tiefling
  // was the one real species-owned `variant-choice`/`damage-type-choice` decision either rule still
  // matched (Aasimar/Dragonborn/Elf/Gnome/Goliath were already excluded last phase); now that
  // Tiefling's own Fiendish Legacy is authored (the same choice:species.feature-option reuse), both
  // rules match zero real decisions -- a 'blocked' rule may never carry `allowZero` (see this
  // file's own established contract), so, mirroring the prior deletion of `blk:origin-feat
  // -unsupported` two phases ago, both are deleted outright rather than kept alive artificially.
  // Every species-owned `variant-choice`/`damage-type-choice` decision today is implemented, via
  // `impl:species-feature-option`; a future, genuinely unsupported species lineage/damage shape
  // falls fail-closed through Rule A of the bidirectional contract itself (zero matching rules is
  // itself a contract violation, caught by the BITE test proving exactly this).
  // HUMAN + GENERIC SELECTED-FEAT ACTIVATION PHASE -- `blk:species-size` deleted outright, mirroring
  // the prior deletion of the species `variant-choice`/`damage-type-choice` blocking rules two
  // phases ago (see this file's own header above): Human was its last remaining real match
  // (Tiefling's own size-choice was already reclassified to `impl:species-size-choice` in the
  // Tiefling phase), and Human's size-choice is now ALSO authored via the SAME
  // `choice:species.size` ChoiceSet, so this rule would match zero real decisions -- a 'blocked'
  // rule may never carry `allowZero`, so it is removed rather than kept alive artificially. Every
  // species-owned `size-choice` decision today is implemented, via `impl:species-size-choice`.
  {
    id: 'impl:background-equipment',
    status: 'implemented',
    reason: 'Background starting equipment (A/B bundles, or pure gold): the SAME P8 resolver/authority as class equipment, scoped to the background owner.',
    ledgerIds: ['background:starting-equipment'],
    matches: backgroundEquipmentCovered
  },
  // FEAT-OWNED SPELL ACQUISITION PHASE -- the prior `blk:origin-feat-unsupported` rule (Background
  // Origin Feat that is not fixed-supported) is REMOVED, not merely narrowed: Magic Initiate
  // (Acolyte/Guide/Sage) was the real, last choice-shaped Origin Feat it covered, and it is now
  // fixed-supported (see `originFeatSlug` on those three backgrounds) -- every real XPHB Background
  // now has a fixed-supported Origin Feat, so the rule would match zero decisions permanently, and
  // the bidirectional contract (B) does not allow a `blocked`-status rule to match zero (only
  // `false-positive`/`runtime-effect` may, by design -- a permanently-empty blocked rule is dead
  // code, not a real fail-closed guard, so it is deleted rather than kept with `allowZero`).
  // `impl:feat-spell-*` below cover the real, newly-representable feat-owned spell decisions this
  // phase adds, replacing the two prior blocked rules for every feat whose real spell shape now
  // fits the generic, class/feat-name-agnostic `spellRequirements`/`fixedSpellGrants` model exactly
  // (see those fields' own headers,
  // app/lib/content-rules/types.ts). Each checks the REAL authored facet, never a bare name match.
  // D&D 2024 Character Rules A1 -- Ritual Caster's own 5 (miscounted-level) decisions are now
  // covered too, by `impl:feat-spell-ritual-caster` below: `detectFeatDecisions` still forces every
  // one of them to `level: 1` (the discovery/model mismatch described above is deliberately left
  // alone this phase, per instruction -- the coverage rule recognizes the real facet shape
  // directly, never fixed via a discovery rewrite).
  {
    id: 'impl:feat-spell-magic-initiate',
    status: 'implemented',
    reason: 'Magic Initiate: 6 spellRequirements (cantrip + fixed-spell pool, times 3 lists), each gated via requiresActive against a plain boolean Value the GRANTING BACKGROUND fixes (Acolyte->Cleric, Guide->Druid, Sage->Wizard -- the real corpus text, never a player choice; re-derived from the raw Background feats key). Casting ability and optional Spell Change are separate, deferred facts -- never conflated with this acquisition decision.',
    ledgerIds: ['background:origin-feat:choice-acquisition'],
    matches: (d) => d.owner.kind === 'feat' && d.owner.slug === 'magic-initiate-xphb' && d.family === 'variant-choice' && magicInitiateSpellCovered(d.grantedBy)
  },
  {
    id: 'impl:feat-spell-fey-shadow-touched',
    status: 'implemented',
    reason: 'Fey-Touched / Shadow-Touched: the fixed companion spell (Misty Step / Invisibility) via FixedSpellGrant, and the real school-filtered spell choice via a plain, ungated spellRequirements entry (pool: fixed). Casting ability ("the ability increased by this feat") is a separate, already-representable decision this phase did not need to touch.',
    ledgerIds: [],
    matches: (d) => d.owner.kind === 'feat' && (d.owner.slug === 'fey-touched-xphb' || d.owner.slug === 'shadow-touched-xphb') && (d.family === 'spell-choice' || d.family === 'spell-grant') && feyShadowTouchedSpellCovered(d.owner.slug)
  },
  {
    id: 'impl:feat-spell-telekinetic-telepathic',
    status: 'implemented',
    reason: 'Telekinetic (Mage Hand) / Telepathic (Detect Thoughts): both FIXED grants with no "of your choice" clause at all, via FixedSpellGrant -- never a mandatory decision requiring a picker, per this phase\'s own instruction ("fixed grants do NOT become mandatory decisions"); reclassified here anyway because `detectFeatDecisions` still tracks the underlying representability fact and this rule proves exactly that fact now holds.',
    ledgerIds: [],
    matches: (d) => d.owner.kind === 'feat' && (d.owner.slug === 'telekinetic-xphb' || d.owner.slug === 'telepathic-xphb') && d.family === 'spell-grant' && telekineticTelepathicSpellCovered(d.owner.slug)
  },
  {
    id: 'impl:feat-spell-blessed-druidic-warrior',
    status: 'implemented',
    reason: 'Blessed Warrior / Druidic Warrior: the real "two Cleric/Druid cantrips of your choice" decision, via a plain, ungated spellRequirements entry (fixed classList, fixed casting ability stated directly in the corpus text, no nested ability choice needed). This covers ONLY the spell-acquisition decision -- both feats remain structurally ILLEGAL overall via featOptionVerdict, for the SEPARATE, pre-existing reason their own raw prerequisite is `otherSummary` prose (not the `feature` key coverUnsupportedPrerequisites can map), which this phase does not fix (see the Fighting Style comment block in dnd5e-2024.ts for the full reasoning).',
    ledgerIds: ['paladin-xphb:fighting-style-variant-blessed-warrior', 'ranger-xphb:fighting-style-variant-druidic-warrior'],
    matches: (d) => d.owner.kind === 'feat' && (d.owner.slug === 'blessed-warrior-xphb' || d.owner.slug === 'druidic-warrior-xphb') && d.family === 'spell-choice' && blessedDruidicWarriorSpellCovered(d.owner.slug)
  },
  {
    id: 'impl:feat-spell-ritual-caster',
    status: 'implemented',
    reason: 'Ritual Caster: the real 2-at-Level-1/+1-at-5/9/13/17 growing spell pool, modeled via an ungated `fixed`-pool spellRequirements entry whose `filter.ritual: true` restricts to the Ritual tag (no classList, matching the real text). `detectFeatDecisions` still discovers this as 5 separate, identically level-1-tagged decisions (a known discovery/model mismatch this phase does not fix) -- this rule verifies the REAL authored totalByLevel growth shape directly, rather than trusting those miscounted fields, so all 5 sweep in together.',
    ledgerIds: [],
    matches: (d) => d.owner.kind === 'feat' && d.owner.slug === 'ritual-caster-xphb' && d.family === 'spell-choice' && ritualCasterSpellCovered()
  },
  // D&D 2024 Character Rules A1 -- `blk:feat-nested-spells` is REMOVED, not merely narrowed:
  // Ritual Caster was the real corpus's own last remaining feat-owned spell-choice/spell-grant/
  // variant-choice decision not yet claimed by an `impl:feat-spell-*` rule above; now that it is
  // (`impl:feat-spell-ritual-caster`), every real decision in this family is implemented and this
  // rule would match zero -- a permanently-empty blocked rule is dead code, not a real fail-closed
  // guard (established precedent elsewhere in this file). A future feat with an unrepresentable
  // spell shape still fails closed via `classifyDecision`'s own zero-match default.
  // A4 -- REMAINING MANDATORY DECISION CLOSURE re-verified Keen Mind and Observant directly
  // against the real corpus prose (not just the structured `skillProficiencies.choose` field
  // discovery reads): BOTH carry the identical "gain proficiency UNLESS you already have it,
  // in which case gain Expertise instead" conditional-output clause -- a genuine STOP (the
  // same missing primitive as Gloom Stalker's own Iron Mind below), never authored as a plain
  // skill-proficiency choice, which would silently drop the real Expertise-on-repeat half of
  // the rule. This rule therefore still matches real decisions and stays exactly as it was.
  {
    id: 'blk:feat-nested-proficiency',
    status: 'blocked',
    reason: 'Feat proficiency that no facet grants or offers: Keen Mind/Observant\'s own conditional "proficiency UNLESS already held, then Expertise instead" clause (no vocabulary for an output that depends on prior state), Resilient saving throws, and unrecognized shapes. Fail closed.',
    ledgerIds: [],
    matches: (d) => d.owner.kind === 'feat' && (d.family === 'proficiency-choice' || d.family === 'proficiency-grant') && !proficiencyCovered(d)
  },
  // A3 WORKSTREAM 5 -- `blk:subclass-casting-class` ("a third-caster slot table is not
  // defined") is REMOVED, not merely narrowed: `table:spellcasting.slots_third` exists (A2
  // WORKSTREAM 4) and is now wired to BOTH real owning subclasses (Eldritch Knight, Arcane
  // Trickster -- the only two `spell-count`/subclass decisions in the whole corpus) via
  // their own `value:spellcasting.caster_type.third` grant (dnd5e-2024.ts), so the old rule
  // would match zero decisions permanently -- a permanently-empty blocked rule is dead code,
  // not a real fail-closed guard (established precedent elsewhere in this file, e.g.
  // `blk:metamagic`'s own removal). A future third-caster subclass this phase never
  // authored-checked still fails closed via `classifyDecision`'s own zero-match default.
  {
    id: 'impl:subclass-third-caster-slots',
    status: 'implemented',
    reason: 'Third-caster slot table (Eldritch Knight, Arcane Trickster) exists and is wired to the owning subclass via its own `value:spellcasting.caster_type.third` grant. Their own separate leveled spell-pool gap (a different decision family, spell-choice) is untouched by this reclassification.',
    ledgerIds: [],
    matches: subclassThirdCasterGrantCovered
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
    // FEAT-OWNED SPELL ACQUISITION PHASE REVISIT -- Thaumaturge/Magician's own bonus cantrip is
    // IMPLEMENTED now (see cleric-xphb:divine-order-thaumaturge-cantrip /
    // druid-xphb:primal-order-magician-cantrip in the Progression Coverage Ledger), so those two
    // ledger ids are REMOVED from this placeholder -- only genuine per-attack/per-cast combat text
    // remains deferred here.
    reason: 'Class feature option downstream effects (Milestone B): Divine Strike/Primal Strike/Potent Spellcasting\'s per-attack/per-cast combat text. The acquisition/activation decision is the implemented row; these effects are runtime.',
    ledgerIds: [
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
