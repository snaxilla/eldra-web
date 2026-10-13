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
  it('the Phase-0 decision census after the Rogue Expertise phase: 647 total, 407 implemented, 205 blocked, 35 optional', () => {
    const counts: Record<string, number> = {}
    for (const decision of DND5E_2024_MANDATORY_DECISIONS) {
      const status = classifyDecision(decision).status
      counts[status] = (counts[status] ?? 0) + 1
    }
    expect(DND5E_2024_MANDATORY_DECISIONS.length).toBe(647)
    expect(counts.implemented).toBe(407)
    expect(counts.blocked).toBe(205)
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

  // The P4/follow-on ownership boundary (subclass/species/feat-granted spells) is untouched by
  // P3.5 -- none of those decisions is owned by a class, so none is reclassified by this phase's
  // own class-scoped coverage rules, regardless of what the generic pipeline could theoretically
  // reuse later.
  it('subclass/species/feat-owned spell-family decisions remain NOT implemented -- P3.5 touches class ownership only', () => {
    const nonClassSpellDecisions = DND5E_2024_MANDATORY_DECISIONS.filter(
      (d) => d.owner.kind !== 'class' && ['spell-choice', 'spell-grant', 'spell-count'].includes(d.family)
    )
    expect(nonClassSpellDecisions.length).toBeGreaterThan(0)
    for (const decision of nonClassSpellDecisions) {
      expect(classifyDecision(decision).status, decision.id).not.toBe('implemented')
    }
  })
})
