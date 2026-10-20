// D&D 2024 Character Rules P2 -- SPELL DATA AUTHORITY, verified directly against the real corpus
// (never from a prior audit's remembered numbers) -- and the Phase-0 invariant P2 must preserve:
// option-filtering infrastructure alone moves NO mandatory decision from blocked to implemented.

import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

import { DND5E_2024_MANDATORY_DECISIONS } from '../../../app/lib/content-rules/creation-completeness'
import { classifyDecision } from '../../../app/lib/content-rules/mandatory-decision-coverage'

const DATA_ROOT = '/opt/eldra/datasets/5etools-src/data'

describe('P2 spell corpus authority', () => {
  it('the real XPHB spell corpus holds exactly 391 spells (spells/*.json, source === XPHB)', () => {
    let total = 0
    const { readdirSync } = require('node:fs') as typeof import('node:fs')
    for (const file of readdirSync(`${DATA_ROOT}/spells`)) {
      if (!file.endsWith('.json') || file === 'index.json' || file.startsWith('foundry') || file.startsWith('fluff')) continue
      const parsed = JSON.parse(readFileSync(`${DATA_ROOT}/spells/${file}`, 'utf8'))
      if (Array.isArray(parsed?.spell)) total += parsed.spell.filter((s: { source?: string }) => s.source === 'XPHB').length
    }
    expect(total).toBe(391)
  })

  it('class-list membership exists ONLY in the generated lookup -- no XPHB (or PHB) spell record carries an inline `classes` field', () => {
    const xphb = JSON.parse(readFileSync(`${DATA_ROOT}/spells/spells-xphb.json`, 'utf8')) as { spell: Record<string, unknown>[] }
    const phb = JSON.parse(readFileSync(`${DATA_ROOT}/spells/spells-phb.json`, 'utf8')) as { spell: Record<string, unknown>[] }
    expect(xphb.spell.every((s) => !('classes' in s))).toBe(true)
    expect(phb.spell.every((s) => !('classes' in s))).toBe(true)
  })

  it('the eight real spellcasting classes, derived two independent ways, agree exactly', () => {
    // Way 1: the class corpus's own `spellcastingAbility` field.
    const { readdirSync } = require('node:fs') as typeof import('node:fs')
    const byAbility = new Set<string>()
    for (const file of readdirSync(`${DATA_ROOT}/class`)) {
      if (!/^class-.*\.json$/.test(file)) continue
      const data = JSON.parse(readFileSync(`${DATA_ROOT}/class/${file}`, 'utf8'))
      const cls = (data.class ?? []).find((c: { source?: string }) => c.source === 'XPHB')
      if (cls?.spellcastingAbility) byAbility.add(cls.name)
    }

    // Way 2: the aggregated class-list membership across all 391 XPHB spells.
    const lookup = JSON.parse(readFileSync(`${DATA_ROOT}/generated/gendata-spell-source-lookup.json`, 'utf8')).xphb as Record<string, { class?: { XPHB?: Record<string, unknown> } }>
    const bySpellList = new Set<string>()
    for (const entry of Object.values(lookup)) {
      for (const [className, isOnList] of Object.entries(entry.class?.XPHB ?? {})) {
        if (isOnList === true) bySpellList.add(className)
      }
    }

    expect(byAbility.size).toBe(8)
    expect(bySpellList).toEqual(byAbility)
    expect([...byAbility].sort()).toEqual(['Bard', 'Cleric', 'Druid', 'Paladin', 'Ranger', 'Sorcerer', 'Warlock', 'Wizard'])
  })

  // P2 itself (option-filtering infrastructure alone -- no real facet declared a 'spells' category
  // choice in that phase) moved NO mandatory decision from blocked to implemented; the census at
  // the end of P2 was still 647/192/420/35. D&D 2024 Character Rules P3.5 -- SPELL DECISION
  // RECONCILIATION reclassified 171 of the 174 class-owned spell-family decisions once the real
  // P2(count/filtering)->P3.1(count authority)->P3.2(target-state planning)->P3.2.1(provenance)->
  // P3.3(creation write-through)->P3.4(progression write-through) pipeline existed end-to-end --
  // see mandatory-decision-coverage.ts's own SPELL ACQUISITION COVERAGE header and
  // .github/docs/architecture/dnd5e-2024-character-rules-completeness-audit.md §25.35 for the full
  // per-decision proof. This is the CURRENT census, not P2's own (that invariant is preserved
  // historically by this phase's own audit, not re-asserted here now that it is stale).
  // D&D 2024 Character Rules P8 -- STARTING EQUIPMENT reclassified exactly the 28 class/background-
  // owned `equipment-package` decisions from blocked to implemented (app/lib/characters/
  // equipment-bundle.ts + server/utils/character-equipment-bundle.ts), moving the census from
  // 363/249 to 391/221. Total and optional are unchanged -- P8 added no new decision family and
  // touched no replacement/re-answer clause.
  // FEATURE-OPTION PHASE reclassified exactly the 4 CLASS-owned feature-option decisions (Cleric
  // Divine Order/Blessed Strikes, Druid Primal Order/Elemental Fury) from blocked to implemented
  // (choice:class.feature-option), moving the census from 391/221 to 395/217. The 4 SUBCLASS-owned
  // feature-option decisions (Hunter's Defensive Tactics, Path of the Wild Heart's Aspect of the
  // Wilds, etc.) remain blocked behind subclass-internal feature-level gating, untouched.
  // WEAPON MASTERY PHASE reclassified exactly the 10 real Weapon Mastery decisions (Barbarian 3,
  // Fighter 4, Paladin/Ranger/Rogue 1 each) from blocked to implemented (choice:class.weapon-
  // mastery/.melee-only), moving the census from 395/217 to 405/207. The optional Long-Rest
  // replacement clause and the mastery property's own runtime effects remain separate,
  // unreclassified accountability rows.
  // ROGUE EXPERTISE PHASE reclassified exactly 2 decisions (Rogue Level 1 "Expertise", a creation-
  // time facet.choices entry; Ranger Level 2 "Deft Explorer", a dedicated Progression row) from
  // blocked to implemented, moving the census from 405/207 to 407/205. Rogue's own remaining real
  // blocker (Thieves' Cant / language policy) is untouched -- this phase alone does not unlock
  // Rogue creation.
  // LANGUAGE CORPUS + POLICY PHASE discovered and implemented ONE newly-discovered decision (the
  // universal "Choose Languages" creation rule, package-owned, never duplicated per class) and
  // reclassified exactly 2 more (Rogue Level 1 "Thieves' Cant" language, a creation-time
  // facet.choices entry; Ranger Level 2 "Deft Explorer" language, a dedicated Progression row)
  // from blocked to implemented -- moving the census from 647/407/205 to 648/410/203. Rogue's
  // Thieves' Cant/language blocker is now fully resolved; Rogue becomes creation-available.
  // ELDRITCH INVOCATIONS PHASE reclassified exactly 8 more (Warlock's own real Level 1/2/5/7/9/
  // 12/15/18 accumulating-option decisions, the real XPHB Invocations-known-by-level table) from
  // blocked to implemented -- moving the census from 648/410/203 to 648/418/195. Warlock's
  // Eldritch Invocations blocker is now fully resolved; Warlock becomes creation-available.
  // FEAT-OWNED SPELL ACQUISITION PHASE reclassified exactly 15 more from blocked to implemented:
  // Magic Initiate's own 4 variant-choice decisions (the ungated one, plus the 3 grantedBy
  // Acolyte/Guide/Sage), Fey-Touched's 2 (spell-choice + spell-grant), Shadow-Touched's 2,
  // Telekinetic's 1, Telepathic's 1, Blessed Warrior's 1, Druidic Warrior's 1 -- plus Acolyte/
  // Guide/Sage's own 3 Background `feat-grant` decisions (now fixed-supported via
  // `originFeatSlug`, the SAME `impl:background-origin-feat` rule every other Background's fixed
  // Origin Feat already uses). Moving the census from 648/418/195 to 648/433/180. Acolyte, Guide,
  // and Sage all become creation-available (Backgrounds 13/16 -> 16/16).
  // AASIMAR CREATION COMPLETION PHASE -- discovery itself grew by 3: a brand-new `size-choice`
  // family (added this phase, since Aasimar/Human/Tiefling all genuinely have a real "chosen when
  // you select this species" size), one decision per species that owns it. Aasimar's own
  // size-choice AND its pre-existing spell-grant (Light Bearer) both reclassify to implemented;
  // Human's and Tiefling's own new size-choice decisions join the blocked set (neither species is
  // authored this phase). Moving the census from 648/433/180 to 651/435/181.
  // PURE-AUTHORING SPECIES SWEEP -- no new discovery this phase (no new DecisionFamily); exactly
  // 4 real decisions reclassify blocked -> implemented: Dragonborn's own damage-type-choice, and
  // Elf's/Gnome's/Goliath's own variant-choice (each species' lineage/ancestry CHOICE itself,
  // via the generic choice:species.feature-option reuse). Moving the census from 651/435/181 to
  // 651/439/177.
  // TIEFLING SPECIES COMPLETION -- no new discovery this phase either; exactly 3 more real
  // decisions reclassify blocked -> implemented: Tiefling's own variant-choice (Fiendish Legacy)
  // and damage-type-choice (both via choice:species.feature-option reuse, exactly like
  // Dragonborn's own) plus its own size-choice (via choice:species.size reuse, exactly like
  // Aasimar's own). Moving the census from 651/439/177 to 651/442/174.
  // HUMAN + GENERIC SELECTED-FEAT ACTIVATION PHASE -- no new discovery this phase (no new
  // DecisionFamily; the independent corpus re-derivation confirmed Human's own population is
  // exactly the 3 decisions already discovered -- feat-choice, size-choice, skill-choice, the last
  // already implemented). Exactly 2 real decisions reclassify blocked -> implemented: Human's own
  // size-choice (via choice:species.size reuse, exactly like Aasimar's/Tiefling's own) and
  // feat-choice (Versatile, via the new generic `choice:feat.origin-selection` content-catalogue
  // ChoiceSet). Moving the census from 651/442/174 to 651/444/172. Explicitly NOT reclassified:
  // Resourceful (Heroic Inspiration) and the casting-ability/Spell-Change facts on Origin feats
  // acquired through Versatile -- all runtime/deferred, exactly as for every other species.
  // D&D 2024 Character Rules A1 -- +3 real decisions discovered (2 new feat-owned Expertise
  // decisions, Skill Expert/Boon of Skill; 1 new feat-owned damage-type-choice, Elemental Adept's
  // own prose-only Energy Mastery, via the new FEAT_DAMAGE_TYPE_CHOICE supplement). +17 reclassify
  // blocked -> implemented: Crafter/Musician/Skilled/Resilient's own nested proficiency choices (4),
  // Skill Expert's basic skill pick + its own new Expertise pick + Boon of Skill's own new
  // Expertise pick (3), Elemental Adept's own new damage-type choice (1), Ritual Caster's 5
  // (miscounted-level) spell-choice decisions (5), Sorcerer's Metamagic at L2/10/17 (3), Barbarian's
  // Primal Knowledge at L3 (1) = 17. Moving the census from 651/444/172 to 654/461/158.
  // A3 -- SUBCLASS SPELL AUTHORING. No new discovery this phase (no new DecisionFamily); 134 of
  // the 145 real subclass-owned spell-family decisions reclassify blocked -> implemented: every
  // fixed (prepared/known/unconditional-flat-innate) grant, the Wizard Arcane Traditions' and
  // College of Lore's own spell SELECTION (33), Circle of the Land's terrain variant-choice (1),
  // and the Eldritch-Knight/Arcane-Trickster third-caster slot grant (2). Moving the census from
  // 654/461/158 to 654/595/24.
  // A3 WORKSTREAM -- THIRD-CASTER LEVELED SPELL ACQUISITION. The previously-reported STOP
  // (Eldritch Knight's/Arcane Trickster's own LEVELED Wizard spell pool, blocked on a
  // `maxSpellLevel`-derivation gap) is fixed generically (`effectiveCasterTypeOf`, server/
  // utils/character-spell-acquisition.ts) and all 8 of their real decisions reclassify blocked
  // -> implemented too. Writing this workstream's own real acceptance tests also surfaced a
  // genuine coverage-check bug (not a corpus or authoring bug): Warrior of Shadow's own 'known'
  // Minor Illusion and 'innate' Darkness decisions share the exact same (owner, level,
  // engine-flag) key, and the PRIOR per-decision-only count check let the one real Minor
  // Illusion grant falsely satisfy BOTH -- a true false positive, caught by writing real
  // acceptance tests, not assumed. Fixed with a fail-closed sibling-cardinality guard
  // (mandatory-decision-coverage.ts's own header): conservative, never a false positive, at the
  // cost of Minor Illusion's own otherwise-correct decision also reading blocked until Darkness
  // (resource-gated, no generic primitive) is representable. Net for this workstream: +8
  // (Eldritch Knight/Arcane Trickster) -2 (Warrior of Shadow, newly conservative) = +6. Moving
  // the census from 654/595/24 to 654/601/18.
  // A4 -- REMAINING MANDATORY DECISION CLOSURE. +8 reclassify blocked -> implemented, reusing
  // existing generic primitives (never a new engine mechanism): Battle Master's own Combat
  // Superiority maneuvers (choice:subclass.accumulating-option, the SAME shape Eldritch
  // Invocations/Sorcerer Metamagic already use, 1), Champion's own Additional Fighting Style
  // (the SAME choice:feat.fighting-style.fs-only content pick the class already grants at
  // Level 1, 1), Hunter's own Hunter's Prey and Defensive Tactics, Path of the Wild Heart's own
  // Aspect of the Wilds (all three via choice:subclass.feature-option, the SAME shape Circle of
  // the Land's own terrain pick already uses, 3), Draconic Sorcery's own Elemental Affinity (the
  // SAME opaque damage-type-active shape Elemental Adept's own feat-owned choice already uses,
  // 1), and two genuine discovery-model corrections reclassified onto their own sibling impl:
  // rules rather than a separate false-positive rule (a false-positive/runtime-effect rule in
  // this file's own bidirectional contract must match ZERO real decisions, which neither of
  // these does): Path of the Wild Heart's own Rage of the Wilds (re-chosen on every Rage
  // activation, not a persistent build decision at all -- its own real text's recurring-per-use
  // clause sits in a SECOND sentence the discovery filter never inspects -- correctly
  // represented by storing nothing) and College of Glamour's own Level-6 "innate" Command (a
  // flat, unconditional duplicate of the SAME spell its own "prepared" sibling already grants at
  // the SAME level, not a second player-facing requirement). Keen Mind and Observant are
  // re-verified directly against the real corpus PROSE (not just the structured
  // skillProficiencies field) and confirmed to remain genuinely blocked: both carry a
  // conditional "gain proficiency UNLESS already held, then Expertise instead" clause -- the
  // same missing primitive as Gloom Stalker's own Iron Mind -- so neither is authored as a
  // plain skill-proficiency choice, which would silently drop the real Expertise-on-repeat half
  // of the rule. Moving the census from 654/601/18/35 to 654/609/10/35.
  it('the Phase-0 decision census after the Remaining Mandatory Decision Closure workstream: 654 total, 609 implemented, 10 blocked, 35 optional', () => {
    const counts: Record<string, number> = {}
    for (const decision of DND5E_2024_MANDATORY_DECISIONS) {
      const status = classifyDecision(decision).status
      counts[status] = (counts[status] ?? 0) + 1
    }
    expect(DND5E_2024_MANDATORY_DECISIONS.length).toBe(654)
    expect(counts.implemented).toBe(609)
    expect(counts.blocked).toBe(10)
    expect(counts.optional).toBe(35)
  })

  // D&D 2024 Character Rules P3.5 -- exactly 171 of the 174 class-owned spell-family decisions are
  // now implemented (cantrip/prepared counts, Level-1 creation selection, Mystic Arcanum's four
  // tiers, Wizard's spellbook growth) -- proven per-decision, never a bare family/name match, by
  // tests/rules/mandatory-decision-coverage.test.ts's own bidirectional contract. The three real
  // residuals (Magical Secrets, Spell Mastery, Signature Spells) are confirmed still NOT
  // implemented: none of them is a new ACQUISITION the generic pipeline models (Magical Secrets
  // reads from ANY class's list, not the owning class's own; Spell Mastery/Signature Spells flag
  // an ALREADY-KNOWN spellbook spell, never acquire a new one).
  it('class-owned spell-family decisions: 171 of 174 are now implemented; the 3 real residuals are not', () => {
    const classSpellDecisions = DND5E_2024_MANDATORY_DECISIONS.filter(
      (d) => d.owner.kind === 'class' && ['spell-choice', 'spell-grant', 'spell-count'].includes(d.family)
    )
    expect(classSpellDecisions.length).toBe(174)
    const implemented = classSpellDecisions.filter((d) => classifyDecision(d).status === 'implemented')
    const residual = classSpellDecisions.filter((d) => classifyDecision(d).status !== 'implemented')
    expect(implemented.length).toBe(171)
    expect(residual.map((d) => d.id).sort()).toEqual([
      'class:bard-xphb:L10:spell-choice:magical-secrets',
      'class:wizard-xphb:L18:spell-choice:spell-mastery',
      'class:wizard-xphb:L20:spell-choice:signature-spells'
    ])
  })

  // SPECIES: untouched by P3.5, the Feat-Owned Spell Acquisition phase, or A3 -- none of those
  // decisions is owned by a class, a feat, or a subclass, so none is reclassified by any of their
  // own scoped coverage rules. AASIMAR CREATION COMPLETION PHASE -- Aasimar's own Light Bearer is
  // the one exception: a true fixed grant, the exact FixedSpellGrant shape this project's
  // feat-owned fixed spells already use, now implemented. Every OTHER species-owned one (Elf/
  // Gnome/Goliath/Tiefling's own lineage spells, genuinely gated behind an unauthored lineage
  // choice) remains not implemented.
  it('species-owned spell-family decisions remain NOT implemented, except Aasimar\'s own fixed grant', () => {
    const speciesSpellDecisions = DND5E_2024_MANDATORY_DECISIONS.filter(
      (d) => d.owner.kind === 'species' && ['spell-choice', 'spell-grant', 'spell-count'].includes(d.family)
    )
    expect(speciesSpellDecisions.length).toBeGreaterThan(0)
    for (const decision of speciesSpellDecisions) {
      if (decision.owner.slug === 'aasimar-xphb') {
        expect(classifyDecision(decision).status, decision.id).toBe('implemented')
        continue
      }
      expect(classifyDecision(decision).status, decision.id).not.toBe('implemented')
    }
  })

  // SUBCLASS: A3 reclassifies most real subclass-owned spell-family decisions to implemented
  // (see this file's own census test above for the exact breakdown, including the Third-Caster
  // Leveled Spell Acquisition workstream). The real residuals stay blocked for a named, verified
  // reason -- re-checked here rather than asserted blind, mirroring tests/rules/mandatory
  // -decision-coverage.test.ts's own equivalent reconciliation test exactly.
  it('subclass-owned spell-family decisions are implemented where A3 authored them, blocked for a named reason otherwise', () => {
    const subclassSpellDecisions = DND5E_2024_MANDATORY_DECISIONS.filter(
      (d) => d.owner.kind === 'subclass' && ['spell-choice', 'spell-grant', 'spell-count', 'variant-choice'].includes(d.family)
    )
    expect(subclassSpellDecisions.length).toBeGreaterThan(0)
    const RESOURCE_GATED_INNATE_OWNERS = new Set(['archfey-patron-xphb', 'psi-warrior-xphb', 'warrior-of-shadow-xphb'])
    for (const decision of subclassSpellDecisions) {
      const classification = classifyDecision(decision)
      // A4 -- College of Glamour's own Level-6 "innate" Command is a genuine discovery-model
      // duplicate (the SAME spell its own "prepared" sibling already grants, re-verified
      // directly against the real corpus) -- reclassified onto impl:subclass-fixed-spell-grant,
      // never blocked.
      if (classification.status === 'implemented') continue
      expect(classification.status, decision.id).toBe('blocked')
      const isResourceGatedInnate = decision.family === 'spell-grant' && decision.source.endsWith('.innate') && RESOURCE_GATED_INNATE_OWNERS.has(decision.owner.slug)
      const isWarriorOfShadowSiblingCasualty = decision.family === 'spell-grant' && decision.owner.slug === 'warrior-of-shadow-xphb' && decision.source.endsWith('.known')
      expect(isResourceGatedInnate || isWarriorOfShadowSiblingCasualty, decision.id).toBe(true)
    }
  })

  // D&D 2024 Character Rules A1 -- Ritual Caster's own real growing spell pool is now
  // implemented too (`impl:feat-spell-ritual-caster`, mandatory-decision-coverage.ts, verifying
  // the real authored totalByLevel growth shape directly, since `detectFeatDecisions` still
  // mis-tags all 5 of its decisions to level 1 -- a known, deliberately unfixed discovery/model
  // mismatch). Every feat-owned spell-choice/spell-grant decision in the real corpus is now
  // implemented; none remains blocked. Magic Initiate's own decisions are `variant-choice`
  // family, not `spell-choice`/`spell-grant`/`spell-count`, so they are checked separately in
  // mandatory-decision-coverage.test.ts.
  it('feat-owned spell-choice/spell-grant decisions: none remain blocked (Ritual Caster is now implemented)', () => {
    const featSpellDecisions = DND5E_2024_MANDATORY_DECISIONS.filter(
      (d) => d.owner.kind === 'feat' && ['spell-choice', 'spell-grant'].includes(d.family)
    )
    expect(featSpellDecisions.length).toBeGreaterThan(0)
    const stillBlocked = featSpellDecisions.filter((d) => classifyDecision(d).status !== 'implemented')
    expect(stillBlocked).toEqual([])
  })
})
