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

  // P2 may improve how a spell decision would be CLASSIFIED if a real facet declared a spell
  // choice (it does not yet -- no real class/background/feat declares a 'spells' category choice
  // in this phase), but it must not itself move any mandatory decision from blocked to implemented.
  // Acquisition count/cadence/persistence (P3) is what coverage actually requires.
  it('the Phase-0 decision census is unchanged by P2: 647 total, 192 implemented, 420 blocked, 35 optional', () => {
    const counts: Record<string, number> = {}
    for (const decision of DND5E_2024_MANDATORY_DECISIONS) {
      const status = classifyDecision(decision).status
      counts[status] = (counts[status] ?? 0) + 1
    }
    expect(DND5E_2024_MANDATORY_DECISIONS.length).toBe(647)
    expect(counts.implemented).toBe(192)
    expect(counts.blocked).toBe(420)
    expect(counts.optional).toBe(35)
  })

  // No spell-shaped (spell-choice/spell-grant/spell-count) decision is implemented by P2 alone --
  // every one of them still requires P3's acquisition count/cadence, which P2 does not provide.
  it('no spell-family mandatory decision is implemented (every one still needs P3)', () => {
    const spellFamilies = new Set(['spell-choice', 'spell-grant', 'spell-count'])
    const spellDecisions = DND5E_2024_MANDATORY_DECISIONS.filter((d) => spellFamilies.has(d.family))
    expect(spellDecisions.length).toBeGreaterThan(0)
    for (const decision of spellDecisions) {
      expect(classifyDecision(decision).status, decision.id).not.toBe('implemented')
    }
  })
})
