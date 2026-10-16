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
  'warlock-xphb': 'progression:class.accumulating-option-growth-2-5-7-9-12-15-18'
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
    reason: 'Eldritch Invocations (the Level-1 choice, plus the real Level 2/5/7/9/12/15/18 count growth) via the generic, class/feature-name-agnostic choice:class.accumulating-option ChoiceSet and progression:class.accumulating-option-growth-2-5-7-9-12-15-18. Runtime effects of an acquired invocation are a separate accountability row, never conflated with this acquisition decision.',
    ledgerIds: ['warlock-xphb:eldritch-invocations', 'warlock-xphb:eldritch-invocations-growth'],
    matches: (d) => accumulatingOptionCovered(d)
  },

  // ------------------------------------------------------------------ blocked
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
  // ROGUE EXPERTISE PHASE -- the two blocked rules that used to own Rogue
  // Level 1 and Ranger Level 2 Deft Explorer are RETIRED: both decisions are
  // now authored and reclassified onto `impl:expertise` above. Every real
  // `expertise-choice` decision (7 total -- Bard L2/L9, Ranger L2/L9, Rogue
  // L1/L6, Wizard L2) now matches `impl:expertise` and nothing else.
  {
    id: 'blk:class-skill-extra',
    status: 'blocked',
    reason: 'Extra skill proficiency at a later level (Barbarian Primal Knowledge).',
    ledgerIds: [],
    matches: (d) => is(d, 'class', 'skill-choice') && !(d.level === 1 && d.source.startsWith('startingProficiencies.skills'))
  },
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
  // Ritual Caster alone remains blocked, under its own narrower rule below, for a real, different
  // reason: `detectFeatDecisions` (mandatory-decisions.ts) forces EVERY feat-sourced numeric table
  // key to `level: 1, timing: 'creation'` (`context !== 'feat'` in `spellGrantDecisions`), so its 5
  // real tiers (2 at Level 1, +1 at the real Proficiency-Bonus thresholds 5/9/13/17) are discovered
  // as 5 creation-time decisions -- a genuine mismatch with the real level-gated growth shape, not
  // a storage/model gap this phase's own primitive can close without also changing discovery.
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
    id: 'blk:feat-nested-spells',
    status: 'blocked',
    reason: 'Ritual Caster: a real level-gated GROWING spell pool (2 at Level 1, +1 at Proficiency-Bonus thresholds 5/9/13/17), but discovery (`detectFeatDecisions`) forces every feat-sourced numeric table key to level 1/creation -- a genuine discovery/model mismatch, not fixed by this phase (see this rule\'s own header above for the full reasoning). Any other feat-owned spell-choice/spell-grant/variant-choice decision not claimed by an `impl:feat-spell-*` rule above also falls here, fail-closed.',
    ledgerIds: [],
    matches: (d) => d.owner.kind === 'feat' && (d.family === 'spell-choice' || d.family === 'spell-grant' || d.family === 'variant-choice')
      && !(d.owner.slug === 'magic-initiate-xphb' && magicInitiateSpellCovered(d.grantedBy))
      && !((d.owner.slug === 'fey-touched-xphb' || d.owner.slug === 'shadow-touched-xphb') && feyShadowTouchedSpellCovered(d.owner.slug))
      && !((d.owner.slug === 'telekinetic-xphb' || d.owner.slug === 'telepathic-xphb') && telekineticTelepathicSpellCovered(d.owner.slug))
      && !((d.owner.slug === 'blessed-warrior-xphb' || d.owner.slug === 'druidic-warrior-xphb') && blessedDruidicWarriorSpellCovered(d.owner.slug))
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
