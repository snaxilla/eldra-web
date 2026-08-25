// Unit tests for server/utils/character-derived.ts's equipment addition --
// the `collections` field of the Character Rules Projection.
//
// `assembleCharacter` and `getWorldRuntime` are mocked at the module
// boundary (both already independently tested), matching
// assembly.get.test.ts's own precedent. The Rules Runtime itself is REAL --
// built via createWorldRuntime from the actual eldra-dnd5e-2024 package on
// disk -- so `getDerivedCharacter`'s own logic (the collections extraction
// loop) runs against the real registry rather than a hand-built fake one
// that could silently drift from the real Definition shapes.
//
// This file does not re-prove equipped/attunement arithmetic --
// tests/server/utils/character-actor-bridge.test.ts already does that
// against the same real package. It proves the ONE thing that file cannot:
// that `getDerivedCharacter` (the endpoint every Sheet call actually hits)
// surfaces the package's Collection metadata correctly.

import { readFileSync } from 'node:fs'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { assembleCharacterMock, getWorldRuntimeMock } = vi.hoisted(() => ({
  assembleCharacterMock: vi.fn(),
  getWorldRuntimeMock: vi.fn()
}))

vi.mock('../../../server/utils/character-assembly', async () => {
  const actual = await vi.importActual<typeof import('../../../server/utils/character-assembly')>(
    '../../../server/utils/character-assembly'
  )
  return { ...actual, assembleCharacter: assembleCharacterMock }
})

vi.mock('../../../server/utils/world-runtime-service', () => ({
  getWorldRuntime: getWorldRuntimeMock
}))

import { createWorldRuntime } from '../../../app/lib/rules/world-runtime'
import { parseExpression } from '../../../app/lib/rules/parser'
import type { Definition, RulesPackageManifest } from '../../../app/lib/rules/types'
import { getDerivedCharacter } from '../../../server/utils/character-derived'
import type { CharacterAssemblyBlueprint, CharacterAssemblySlot } from '../../../server/utils/character-assembly'
import { findRulesFacet } from '../../../app/lib/content-rules'

const PACKAGE_DIR = 'packages/eldra-dnd5e-2024'

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
  const result = createWorldRuntime(manifest, definitions, '5', null)
  if (!result.ok) throw new Error(`runtime build failed: ${result.stage}`)
  return result.runtimePackage
}

function slot(entityType: string, slug: string): CharacterAssemblySlot {
  const facet = findRulesFacet('dnd5e.2024', entityType, slug)
  return {
    status: 'resolved',
    entry: {
      packageId: 'eldra.content.xphb',
      packageVersion: '1.0.0',
      systemKey: 'dnd5e',
      title: slug,
      slug,
      externalId: slug,
      provider: '5etools-json',
      ...(facet ? { rulesFacet: facet } : {})
    }
  }
}

function blueprint(overrides: Partial<CharacterAssemblyBlueprint> = {}): CharacterAssemblyBlueprint {
  return {
    worldId: '5',
    characterId: '42',
    characterTitle: 'Bobbert',
    species: slot('species', 'human-xphb'),
    class: slot('class', 'fighter-xphb'),
    background: slot('background', 'acolyte-xphb'),
    abilityScores: {
      method: 'standard-array',
      scores: { str: 15, dex: 14, con: 13, int: 12, wis: 10, cha: 8 }
    },
    rulesChoices: null,
    inventory: [],
    notes: null,
    packs: [],
    ...overrides
  }
}

beforeEach(() => {
  assembleCharacterMock.mockReset()
  getWorldRuntimeMock.mockReset()

  const runtime = loadRealRuntime()
  getWorldRuntimeMock.mockResolvedValue({
    configured: true,
    ok: true,
    runtime,
    integrityHash: 'sha256-test',
    settings: {},
    rollTypeOverrides: {}
  })
})

describe('getDerivedCharacter -- collections', () => {
  it('surfaces the equipment Collection with its declared slots', async () => {
    assembleCharacterMock.mockResolvedValue({ available: true, blueprint: blueprint() })

    const result = await getDerivedCharacter('5', '42')

    expect(result.available).toBe(true)
    if (!result.available) return

    expect(result.derived.collections).toEqual([
      {
        id: 'collection:equipment',
        label: 'Equipment',
        category: 'equipment',
        slots: [
          { id: 'armor', capacity: 1 },
          { id: 'held', capacity: 2 }
        ]
      }
    ])
  })

  it('surfaces the equipment Values in byCategory, grouped under "equipment"', async () => {
    assembleCharacterMock.mockResolvedValue({
      available: true,
      blueprint: blueprint({
        inventory: [
          {
            instanceId: 'item-1',
            status: 'resolved',
            title: 'Longsword',
            quantity: 1,
            equipped: true,
            attuned: true
          }
        ]
      })
    })

    const result = await getDerivedCharacter('5', '42')
    expect(result.available).toBe(true)
    if (!result.available) return

    const entries = result.derived.byCategory.equipment ?? []
    const byId = Object.fromEntries(entries.map((entry) => [entry.id, entry.value]))

    expect(byId['value:equipment.equipped_count']).toBe(1)
    expect(byId['value:equipment.attuned_count']).toBe(1)
    expect(byId['value:equipment.attunement_max']).toBe(3)
    expect(byId['value:equipment.attunement_available']).toBe(2)
  })

  it('does not evaluate the Collection itself as a value -- only kind:value entries appear in byCategory', async () => {
    assembleCharacterMock.mockResolvedValue({ available: true, blueprint: blueprint() })

    const result = await getDerivedCharacter('5', '42')
    expect(result.available).toBe(true)
    if (!result.available) return

    const ids = (result.derived.byCategory.equipment ?? []).map((entry) => entry.id)
    expect(ids).not.toContain('collection:equipment')
  })
})
