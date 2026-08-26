// Unit tests for server/utils/character-actions.ts -- the Character Actions
// System's orchestrator.
//
// `assembleCharacter` is mocked at the module boundary (already
// independently tested), matching character-recovery.test.ts's own
// precedent. The Rules Runtime itself is REAL -- built via createWorldRuntime
// from the actual eldra-dnd5e-2024 package on disk -- so every Attack Bonus/
// Save DC these tests assert on comes from the real formulas, not a
// hand-built fake that could silently drift from them.

import { readFileSync } from 'node:fs'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { assembleCharacterMock, getWorldRuntimeMock } = vi.hoisted(() => ({
  assembleCharacterMock: vi.fn(),
  getWorldRuntimeMock: vi.fn()
}))

vi.mock('../../../server/utils/character-assembly', () => ({
  assembleCharacter: assembleCharacterMock
}))

vi.mock('../../../server/utils/world-runtime-service', () => ({
  getWorldRuntime: getWorldRuntimeMock
}))

import { createWorldRuntime } from '../../../app/lib/rules/world-runtime'
import { parseExpression } from '../../../app/lib/rules/parser'
import type { Definition, RulesPackageManifest } from '../../../app/lib/rules/types'
import { getCharacterActions } from '../../../server/utils/character-actions'
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

function baseEntry(overrides: Record<string, unknown> = {}) {
  return {
    packageId: 'eldra.content.xphb', packageVersion: '1.0.0', systemKey: 'dnd5e',
    title: 'Thing', slug: 'thing', externalId: 'thing', provider: '5etools-json',
    ...overrides
  }
}

const LONGSWORD_ACTION = { name: 'Longsword', category: 'weapon' as const, actionType: 'Melee Attack', range: '5 ft.', damage: '1d8 slashing' }
const LONGBOW_ACTION = { name: 'Longbow', category: 'weapon' as const, actionType: 'Ranged Attack', range: '150/600 ft.', damage: '1d8 piercing' }
const BREATH_WEAPON_ACTION = { name: 'Breath Weapon', category: 'species' as const, actionType: 'Feature', description: 'Exhale magical energy.' }
const SECOND_WIND_ACTION = { name: 'Second Wind', category: 'class' as const, actionType: 'Feature', usage: 'Class Feature (Level 1)' }
const FIREBALL_ACTION = { name: 'Fireball', category: 'spell' as const, actionType: 'Level 3 Spell (Evocation)', range: '150 ft.' }

// FIGHTER_CON_16_BLUEPRINT-shaped, STR 18 (+4), DEX 14 (+2), level 1 ->
// PB +2. Melee bonus = 6, Ranged bonus = 4.
function blueprint(overrides: Record<string, unknown> = {}) {
  return {
    worldId: '5',
    characterId: '42',
    characterTitle: 'Bobbert',
    species: { status: 'resolved', entry: baseEntry({ title: 'Dragonborn', slug: 'dragonborn-xphb', actions: [BREATH_WEAPON_ACTION] }) },
    class: { status: 'resolved', entry: baseEntry({ title: 'Fighter', slug: 'fighter-xphb', actions: [SECOND_WIND_ACTION] }) },
    background: { status: 'resolved', entry: baseEntry({ title: 'Acolyte', slug: 'acolyte-xphb', actions: [] }) },
    abilityScores: { method: 'standard-array', scores: { str: 18, dex: 14, con: 10, int: 10, wis: 10, cha: 10 } },
    rulesChoices: null,
    inventory: [],
    notes: null,
    health: null,
    spells: [],
    expendedSlots: {},
    packs: [],
    ...overrides
  }
}

beforeEach(() => {
  assembleCharacterMock.mockReset()
  getWorldRuntimeMock.mockReset()
  assembleCharacterMock.mockResolvedValue({ available: true, blueprint: blueprint() })

  const runtime = loadRealRuntime()
  getWorldRuntimeMock.mockResolvedValue({
    configured: true, ok: true, runtime,
    integrityHash: 'sha256-test', settings: {}, rollTypeOverrides: {}
  })
})

describe('getCharacterActions -- Unarmed Strike', () => {
  it('is always present, with the Melee Attack Bonus and a presentation-only damage expression', async () => {
    const result = await getCharacterActions('5', '42')
    expect(result.available).toBe(true)
    if (!result.available) return

    const unarmed = result.actions.find((action) => action.category === 'unarmed')
    expect(unarmed).toMatchObject({
      name: 'Unarmed Strike', actionType: 'Melee Attack', range: '5 ft.',
      damage: '1 + Strength modifier bludgeoning', attackBonus: 6
    })
  })

  it('is present even with no equipped weapons and no Rules Package activated', async () => {
    getWorldRuntimeMock.mockResolvedValue({ configured: false })

    const result = await getCharacterActions('5', '42')
    expect(result.available).toBe(true)
    if (!result.available) return

    const unarmed = result.actions.find((action) => action.category === 'unarmed')
    expect(unarmed).toBeDefined()
    expect(unarmed?.attackBonus).toBeUndefined()
  })
})

describe('getCharacterActions -- Species / Class / Background', () => {
  it('surfaces every action a resolved slot\'s content carries', async () => {
    const result = await getCharacterActions('5', '42')
    expect(result.available).toBe(true)
    if (!result.available) return

    expect(result.actions).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: 'Breath Weapon', category: 'species' }),
      expect.objectContaining({ name: 'Second Wind', category: 'class' })
    ]))
  })

  it('surfaces nothing for a Species/Class/Background slot that failed to resolve', async () => {
    assembleCharacterMock.mockResolvedValue({
      available: true,
      blueprint: blueprint({ species: { status: 'missing', packageId: 'x', slug: 'y', reason: 'gone' } })
    })

    const result = await getCharacterActions('5', '42')
    expect(result.available).toBe(true)
    if (!result.available) return

    expect(result.actions.some((action) => action.category === 'species')).toBe(false)
  })
})

describe('getCharacterActions -- Weapons', () => {
  it('an equipped melee weapon gets the Melee Attack Bonus', async () => {
    assembleCharacterMock.mockResolvedValue({
      available: true,
      blueprint: blueprint({
        inventory: [{ instanceId: 'item-1', status: 'resolved', title: 'Longsword', equipped: true, attuned: false, quantity: 1, entry: baseEntry({ actions: [LONGSWORD_ACTION] }) }]
      })
    })

    const result = await getCharacterActions('5', '42')
    expect(result.available).toBe(true)
    if (!result.available) return

    const weapon = result.actions.find((action) => action.category === 'weapon')
    expect(weapon).toMatchObject({ name: 'Longsword', attackBonus: 6 })
  })

  it('an equipped ranged weapon gets the Ranged Attack Bonus, not the Melee one', async () => {
    assembleCharacterMock.mockResolvedValue({
      available: true,
      blueprint: blueprint({
        inventory: [{ instanceId: 'item-1', status: 'resolved', title: 'Longbow', equipped: true, attuned: false, quantity: 1, entry: baseEntry({ actions: [LONGBOW_ACTION] }) }]
      })
    })

    const result = await getCharacterActions('5', '42')
    expect(result.available).toBe(true)
    if (!result.available) return

    const weapon = result.actions.find((action) => action.category === 'weapon')
    expect(weapon).toMatchObject({ name: 'Longbow', attackBonus: 4 })
  })

  it('an unequipped weapon produces no action', async () => {
    assembleCharacterMock.mockResolvedValue({
      available: true,
      blueprint: blueprint({
        inventory: [{ instanceId: 'item-1', status: 'resolved', title: 'Longsword', equipped: false, attuned: false, quantity: 1, entry: baseEntry({ actions: [LONGSWORD_ACTION] }) }]
      })
    })

    const result = await getCharacterActions('5', '42')
    expect(result.available).toBe(true)
    if (!result.available) return

    expect(result.actions.some((action) => action.category === 'weapon')).toBe(false)
  })

  it('a non-weapon item, even if equipped, produces no action', async () => {
    assembleCharacterMock.mockResolvedValue({
      available: true,
      blueprint: blueprint({
        inventory: [{ instanceId: 'item-1', status: 'resolved', title: 'Shield', equipped: true, attuned: false, quantity: 1, entry: baseEntry({ actions: [] }) }]
      })
    })

    const result = await getCharacterActions('5', '42')
    expect(result.available).toBe(true)
    if (!result.available) return

    expect(result.actions.some((action) => action.category === 'weapon')).toBe(false)
  })
})

describe('getCharacterActions -- Spells', () => {
  it('a prepared spell gets the Spell Attack Bonus and Spell Save DC', async () => {
    assembleCharacterMock.mockResolvedValue({
      available: true,
      blueprint: blueprint({
        class: {
          status: 'resolved',
          entry: baseEntry({
            title: 'Wizard', slug: 'wizard-xphb', actions: [],
            rulesFacet: findRulesFacet('dnd5e.2024', 'class', 'wizard-xphb') ?? undefined
          })
        },
        abilityScores: { method: 'standard-array', scores: { str: 10, dex: 10, con: 10, int: 18, wis: 10, cha: 10 } },
        spells: [{ instanceId: 'spell-1', status: 'resolved', title: 'Fireball', known: true, prepared: true, entry: baseEntry({ actions: [FIREBALL_ACTION] }) }]
      })
    })

    const result = await getCharacterActions('5', '42')
    expect(result.available).toBe(true)
    if (!result.available) return

    // INT 18 -> +4. Level 1 -> PB +2. Save DC = 8+2+4 = 14. Attack = 2+4 = 6.
    const spell = result.actions.find((action) => action.category === 'spell')
    expect(spell).toMatchObject({ name: 'Fireball', attackBonus: 6, saveDc: 14 })
  })

  it('a known-but-not-prepared spell produces no action', async () => {
    assembleCharacterMock.mockResolvedValue({
      available: true,
      blueprint: blueprint({
        spells: [{ instanceId: 'spell-1', status: 'resolved', title: 'Fireball', known: true, prepared: false, entry: baseEntry({ actions: [FIREBALL_ACTION] }) }]
      })
    })

    const result = await getCharacterActions('5', '42')
    expect(result.available).toBe(true)
    if (!result.available) return

    expect(result.actions.some((action) => action.category === 'spell')).toBe(false)
  })

  it('a prepared homebrew spell (no catalogue entry) still shows a minimal action by name', async () => {
    assembleCharacterMock.mockResolvedValue({
      available: true,
      blueprint: blueprint({
        spells: [{ instanceId: 'spell-1', status: 'custom', title: 'Bramblewood Ward', known: true, prepared: true, name: 'Bramblewood Ward' }]
      })
    })

    const result = await getCharacterActions('5', '42')
    expect(result.available).toBe(true)
    if (!result.available) return

    const spell = result.actions.find((action) => action.category === 'spell')
    expect(spell).toMatchObject({ name: 'Bramblewood Ward', actionType: 'Spell' })
  })
})

describe('getCharacterActions -- no duplicates, stable ids', () => {
  it('every action has a unique id', async () => {
    assembleCharacterMock.mockResolvedValue({
      available: true,
      blueprint: blueprint({
        inventory: [
          { instanceId: 'item-1', status: 'resolved', title: 'Longsword', equipped: true, attuned: false, quantity: 1, entry: baseEntry({ actions: [LONGSWORD_ACTION] }) },
          { instanceId: 'item-2', status: 'resolved', title: 'Longsword', equipped: true, attuned: false, quantity: 1, entry: baseEntry({ actions: [LONGSWORD_ACTION] }) }
        ],
        spells: [{ instanceId: 'spell-1', status: 'resolved', title: 'Fireball', known: true, prepared: true, entry: baseEntry({ actions: [FIREBALL_ACTION] }) }]
      })
    })

    const result = await getCharacterActions('5', '42')
    expect(result.available).toBe(true)
    if (!result.available) return

    const ids = result.actions.map((action) => action.id)
    expect(new Set(ids).size).toBe(ids.length)
    // Two DIFFERENT longswords (two different carried instances) are two
    // real rows, not a "duplicate" -- see this file's own note.
    expect(result.actions.filter((action) => action.name === 'Longsword')).toHaveLength(2)
  })
})

describe('getCharacterActions -- character existence', () => {
  it('reports character-not-found', async () => {
    assembleCharacterMock.mockResolvedValue({ available: false, reason: 'character-not-found' })

    const result = await getCharacterActions('5', '999')
    expect(result.available).toBe(false)
    if (result.available) return
    expect(result.reason).toBe('character-not-found')
  })
})
