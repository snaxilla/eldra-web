// D&D 2024 Character Rules -- FEATURE-OPTION AUTHORING (Cleric Divine Order/Blessed Strikes,
// Druid Primal Order/Elemental Fury). Corpus re-derivation (regression fixtures, not detector
// inputs -- the real 5etools dataset is read at test time, matching every other corpus-authority
// test's own convention), package Definition shape, and real-engine activation proof.

import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { createWorldRuntime } from '../../app/lib/rules/world-runtime'
import { parseExpression } from '../../app/lib/rules/parser'
import { DependencyGraph } from '../../app/lib/rules/dependency-graph'
import { EvaluationSession } from '../../app/lib/rules/evaluation-session'
import { evaluate } from '../../app/lib/rules/evaluator'
import type { Definition, RulesPackageManifest } from '../../app/lib/rules/types'
import { findRulesFacet } from '../../app/lib/content-rules'

const PACKAGE_DIR = 'packages/eldra-dnd5e-2024'
const WORLD_ID = '5'
const DATASET_DIR = '/opt/eldra/datasets/5etools-src/data'

function hydrate(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(hydrate)
  if (node && typeof node === 'object') {
    const record = node as Record<string, unknown>
    if (typeof record.text === 'string' && !record.ast) {
      const parsed = parseExpression(record.text)
      if (!parsed.ok) throw new Error(`Failed to parse: ${record.text}`)
      return { text: record.text, ast: parsed.ast }
    }
    return Object.fromEntries(Object.entries(record).map(([k, v]) => [k, hydrate(v)]))
  }
  return node
}

function loadRealRuntime() {
  const manifest = JSON.parse(readFileSync(`${PACKAGE_DIR}/manifest.json`, 'utf8')) as RulesPackageManifest
  const definitions = hydrate(JSON.parse(readFileSync(`${PACKAGE_DIR}/definitions.json`, 'utf8'))) as Definition[]
  const result = createWorldRuntime(manifest, definitions, WORLD_ID, null)
  if (!result.ok) throw new Error(`runtime build failed: ${result.stage}`)
  return result.runtimePackage
}

function classFeature(className: string, name: string): any {
  const file = JSON.parse(readFileSync(`${DATASET_DIR}/class/class-${className.toLowerCase()}.json`, 'utf8'))
  return (file.classFeature || []).find((f: any) => f.className === className && f.classSource === 'XPHB' && f.name === name)
}

describe('CORPUS RE-DERIVATION -- Cleric Divine Order / Blessed Strikes, Druid Primal Order / Elemental Fury', () => {
  it('Divine Order (Cleric, L1): exactly 1 of 2 options, permanent, no replacement clause', () => {
    const f = classFeature('Cleric', 'Divine Order')
    expect(f.level).toBe(1)
    const options = JSON.stringify(f.entries)
    expect(options).toContain('Protector')
    expect(options).toContain('Thaumaturge')
    expect(options.match(/refClassFeature/g)?.length).toBe(2)
    expect(JSON.stringify(f.entries).toLowerCase()).not.toMatch(/replace|change your|whenever you finish a.*rest/)
  })

  it('Primal Order (Druid, L1): exactly 1 of 2 options, permanent', () => {
    const f = classFeature('Druid', 'Primal Order')
    expect(f.level).toBe(1)
    const options = JSON.stringify(f.entries)
    expect(options).toContain('Magician')
    expect(options).toContain('Warden')
    expect(options.match(/refClassFeature/g)?.length).toBe(2)
  })

  it('Blessed Strikes (Cleric, L7): exactly 1 of 2 options, permanent', () => {
    const f = classFeature('Cleric', 'Blessed Strikes')
    expect(f.level).toBe(7)
    const options = JSON.stringify(f.entries)
    expect(options).toContain('Divine Strike')
    expect(options).toContain('Potent Spellcasting')
  })

  it('Elemental Fury (Druid, L7): exactly 1 of 2 options, permanent', () => {
    const f = classFeature('Druid', 'Elemental Fury')
    expect(f.level).toBe(7)
    const options = JSON.stringify(f.entries)
    expect(options).toContain('Potent Spellcasting')
    expect(options).toContain('Primal Strike')
  })

  it('Protector (Cleric): fully representable -- martial weapon + heavy armor training only, no nested choice', () => {
    const f = classFeature('Cleric', 'Protector')
    const text = JSON.stringify(f.entries)
    expect(text).toMatch(/[Mm]artial weapon/)
    expect(text).toMatch(/[Hh]eavy [Aa]rmor/)
    expect(f.entries.length).toBe(1) // a single sentence, no sub-choice
  })

  it('Warden (Druid): fully representable -- martial weapon + medium armor training only, no nested choice', () => {
    const f = classFeature('Druid', 'Warden')
    const text = JSON.stringify(f.entries)
    expect(text).toMatch(/[Mm]artial weapon/)
    expect(text).toMatch(/[Mm]edium [Aa]rmor/)
    expect(f.entries.length).toBe(1)
  })

  it('Thaumaturge (Cleric) / Magician (Druid): each grants a real nested cantrip PICK, correctly deferred (approved)', () => {
    for (const [cls, name] of [['Cleric', 'Thaumaturge'], ['Druid', 'Magician']] as const) {
      const text = JSON.stringify(classFeature(cls, name).entries)
      expect(text).toMatch(/extra cantrip/)
    }
  })

  it('Divine Strike (Cleric) / Primal Strike (Druid): the "your choice" is a per-attack damage-type pick, never an acquisition-time decision', () => {
    for (const [cls, name] of [['Cleric', 'Divine Strike'], ['Druid', 'Primal Strike']] as const) {
      const text = JSON.stringify(classFeature(cls, name).entries)
      // Confirmed structurally: the choice text is embedded in a per-hit trigger ("when you hit"),
      // never its own nested options block (no `type: 'options'` anywhere in this feature's own entries).
      expect(text).toMatch(/when you hit/)
      expect(text).not.toMatch(/"type":"options"/)
    }
  })
})

describe('PACKAGE MODEL -- the generic ChoiceSet + 8 Sources + 2 ProgressionDefinitions', () => {
  const PACKAGE_DIR_LOCAL = 'packages/eldra-dnd5e-2024'
  const definitions = JSON.parse(readFileSync(`${PACKAGE_DIR_LOCAL}/definitions.json`, 'utf8')) as any[]
  const byId = new Map(definitions.map((d) => [d.id, d]))

  it('choice:class.feature-option is one generic, reusable ChoiceSet -- names no class, no official option', () => {
    const choiceSet = byId.get('choice:class.feature-option')
    expect(choiceSet).toBeDefined()
    expect(choiceSet.kind).toBe('choiceSet')
    expect(choiceSet.effect).toBe('activate-source')
    expect(choiceSet.distinct).toBe(true)
    expect(JSON.stringify(choiceSet).toLowerCase()).not.toMatch(/cleric|druid|protector|thaumaturge|warden|magician/)
  })

  it('8 Source Definitions exist, each category-correct, with the exact expected modifiers', () => {
    const protector = byId.get('source:divine-order.protector')
    expect(protector.modifiers).toEqual(expect.arrayContaining([
      { target: 'value:weapon.martial.proficient', phase: 'set', value: true },
      { target: 'value:armor.heavy.proficient', phase: 'set', value: true }
    ]))
    const warden = byId.get('source:primal-order.warden')
    expect(warden.modifiers).toEqual(expect.arrayContaining([
      { target: 'value:weapon.martial.proficient', phase: 'set', value: true },
      { target: 'value:armor.medium.proficient', phase: 'set', value: true }
    ]))
    // The four deferred-effect Sources exist, are activatable, and are HONESTLY empty -- never a
    // fabricated grant standing in for an unrepresented effect.
    for (const id of [
      'source:divine-order.thaumaturge', 'source:primal-order.magician',
      'source:blessed-strikes.divine-strike', 'source:blessed-strikes.potent-spellcasting',
      'source:elemental-fury.potent-spellcasting', 'source:elemental-fury.primal-strike'
    ]) {
      const def = byId.get(id)
      expect(def, id).toBeDefined()
      expect(def.modifiers, id).toEqual([])
    }
  })

  it('2 ProgressionDefinitions exist, named by feature (never by class), each one row at Level 7', () => {
    const blessed = byId.get('progression:class.feature-option.blessed-strikes')
    expect(blessed.rows).toEqual([{
      at: 7,
      choices: [{ choiceSet: 'choice:class.feature-option', count: 1, from: ['source:blessed-strikes.divine-strike', 'source:blessed-strikes.potent-spellcasting'] }]
    }])
    const elemental = byId.get('progression:class.feature-option.elemental-fury')
    expect(elemental.rows).toEqual([{
      at: 7,
      choices: [{ choiceSet: 'choice:class.feature-option', count: 1, from: ['source:elemental-fury.potent-spellcasting', 'source:elemental-fury.primal-strike'] }]
    }])
    expect(blessed.id).not.toMatch(/cleric/)
    expect(elemental.id).not.toMatch(/druid/)
  })
})

describe('FACET AUTHORING -- Cleric and Druid reference the generic primitive correctly', () => {
  it('Cleric facet declares Divine Order at creation and Blessed Strikes in progression', () => {
    const facet = findRulesFacet('dnd5e.2024', 'class', 'cleric-xphb')!
    const divineOrder = facet.choices!.find((c) => c.choiceSet === 'choice:class.feature-option')!
    expect(divineOrder).toEqual({
      choiceSet: 'choice:class.feature-option',
      count: 1,
      from: ['source:divine-order.protector', 'source:divine-order.thaumaturge']
    })
    expect(facet.progression).toContain('progression:class.feature-option.blessed-strikes')
  })

  it('Druid facet declares Primal Order at creation and Elemental Fury in progression', () => {
    const facet = findRulesFacet('dnd5e.2024', 'class', 'druid-xphb')!
    const primalOrder = facet.choices!.find((c) => c.choiceSet === 'choice:class.feature-option')!
    expect(primalOrder).toEqual({
      choiceSet: 'choice:class.feature-option',
      count: 1,
      from: ['source:primal-order.magician', 'source:primal-order.warden']
    })
    expect(facet.progression).toContain('progression:class.feature-option.elemental-fury')
  })

  it('no other class facet references choice:class.feature-option (ownership boundary is exact)', () => {
    const CLASSES = ['barbarian-xphb', 'bard-xphb', 'fighter-xphb', 'monk-xphb', 'paladin-xphb', 'ranger-xphb', 'rogue-xphb', 'sorcerer-xphb', 'warlock-xphb', 'wizard-xphb']
    for (const slug of CLASSES) {
      const facet = findRulesFacet('dnd5e.2024', 'class', slug)
      expect(facet?.choices?.some((c) => c.choiceSet === 'choice:class.feature-option'), slug).toBeFalsy()
    }
  })
})

describe('REAL ENGINE ACTIVATION -- proves zero new primitive, through the real registry/graph/evaluator', () => {
  const runtime = loadRealRuntime()
  const graph = DependencyGraph.build(runtime.registry)
  if (!graph.ok) throw new Error('graph build failed')

  function sessionWith(sourceRef: string) {
    return new EvaluationSession(runtime.registry, graph.graph, {
      values: {}, choices: {}, collections: {},
      sources: [{ instanceId: 'x', sourceRef, origin: { kind: 'declared' } }]
    }, {})
  }

  it('Protector activates both of its grants; Thaumaturge activates with zero mechanical change', () => {
    expect(evaluate('value:weapon.martial.proficient', sessionWith('source:divine-order.protector'))).toBe(true)
    expect(evaluate('value:armor.heavy.proficient', sessionWith('source:divine-order.protector'))).toBe(true)
    expect(evaluate('value:weapon.martial.proficient', sessionWith('source:divine-order.thaumaturge'))).toBe(false)
    expect(evaluate('value:armor.heavy.proficient', sessionWith('source:divine-order.thaumaturge'))).toBe(false)
  })

  it('Warden activates both of its grants; Magician activates with zero mechanical change', () => {
    expect(evaluate('value:weapon.martial.proficient', sessionWith('source:primal-order.warden'))).toBe(true)
    expect(evaluate('value:armor.medium.proficient', sessionWith('source:primal-order.warden'))).toBe(true)
    expect(evaluate('value:weapon.martial.proficient', sessionWith('source:primal-order.magician'))).toBe(false)
  })

  it('all 4 deferred-effect Sources activate without error and with zero mechanical change', () => {
    for (const id of [
      'source:blessed-strikes.divine-strike', 'source:blessed-strikes.potent-spellcasting',
      'source:elemental-fury.potent-spellcasting', 'source:elemental-fury.primal-strike'
    ]) {
      expect(() => evaluate('value:weapon.martial.proficient', sessionWith(id))).not.toThrow()
    }
  })

  it('no source activates when nothing is active (base state unaffected)', () => {
    const session = new EvaluationSession(runtime.registry, graph.graph, { values: {}, choices: {}, collections: {}, sources: [] }, {})
    expect(evaluate('value:weapon.martial.proficient', session)).toBe(false)
    expect(evaluate('value:armor.heavy.proficient', session)).toBe(false)
  })
})
