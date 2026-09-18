// Unit tests for server/utils/roll-events.ts's `createActionAttackRollEvent`/
// `createActionDamageRollEvent` -- Character Sheet Body Phase 1A
// (Authoritative Attack + Damage Rolls, character-sheet-beauty-pass.md).
//
// Same mocking shape as roll-events-derived.test.ts (its own header
// explains why): `assembleCharacter`/`getWorldRuntime` mocked at the module
// boundary, the Rules Runtime REAL (built via createWorldRuntime from the
// actual eldra-dnd5e-2024 package on disk), `getCharacterActions`/
// `getDerivedCharacter`/`resolveAttackAction` all REAL and unmocked --
// every Attack Bonus/ability modifier these tests assert on is the real
// formula. `directusServiceRequest`/`broadcastRollEvent` mocked, OpenDice's
// `rollFormula` exercised for real.

import { readFileSync } from 'node:fs'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { assembleCharacterMock, getWorldRuntimeMock, directusServiceRequestMock, broadcastRollEventMock } = vi.hoisted(() => ({
  assembleCharacterMock: vi.fn(),
  getWorldRuntimeMock: vi.fn(),
  directusServiceRequestMock: vi.fn(),
  broadcastRollEventMock: vi.fn()
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

vi.mock('../../../server/utils/directus', () => ({
  directusServiceRequest: directusServiceRequestMock
}))

vi.mock('../../../server/utils/roll-realtime-bridge', () => ({
  broadcastRollEvent: broadcastRollEventMock
}))

import { createWorldRuntime } from '../../../app/lib/rules/world-runtime'
import { parseExpression } from '../../../app/lib/rules/parser'
import type { Definition, RulesPackageManifest } from '../../../app/lib/rules/types'
import { createActionAttackRollEvent, createActionDamageRollEvent } from '../../../server/utils/roll-events'
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

function baseEntry(overrides: Record<string, unknown> = {}) {
  return {
    packageId: 'eldra.content.xphb', packageVersion: '1.0.0', systemKey: 'dnd5e',
    title: 'Thing', slug: 'thing', externalId: 'thing', provider: '5etools-json',
    ...overrides
  }
}

const SHORTSWORD_ACTION = {
  name: 'Shortsword', category: 'weapon' as const, actionType: 'Melee Attack', range: '5 ft.', damage: '1d6 piercing',
  damageRoll: { count: 1, faces: 6 }, damageType: 'piercing', resolution: { kind: 'attack-roll' as const, attackKind: 'melee' as const }
}
const LONGBOW_ACTION = {
  name: 'Longbow', category: 'weapon' as const, actionType: 'Ranged Attack', range: '150/600 ft.', damage: '1d8 piercing',
  damageRoll: { count: 1, faces: 8 }, damageType: 'piercing', resolution: { kind: 'attack-roll' as const, attackKind: 'ranged' as const }
}
const SHIELD_ACTION = { name: 'Shield', category: 'spell' as const, actionType: 'Level 1 Spell (Abjuration)' }

// STR 18 (+4 mod), DEX 14 (+2 mod). Level 1 -> proficiency +2.
// Melee Attack Bonus = 6, Ranged Attack Bonus = 4.
function blueprint(overrides: Partial<CharacterAssemblyBlueprint> = {}): CharacterAssemblyBlueprint {
  return {
    worldId: '5',
    characterId: '42',
    characterTitle: 'Bobbert',
    characterImageUrl: null,
    species: slot('species', 'human-xphb'),
    class: slot('class', 'fighter-xphb'),
    background: slot('background', 'acolyte-xphb'),
    abilityScores: { method: 'standard-array', scores: { str: 18, dex: 14, con: 10, int: 10, wis: 10, cha: 10 } },
    rulesChoices: null,
    inventory: [],
    notes: null,
    health: null,
    spells: [],
    expendedSlots: {},
    packs: [],
    ...overrides
  } as CharacterAssemblyBlueprint
}

function jsonResponse(data: unknown) {
  return { data }
}

beforeEach(() => {
  assembleCharacterMock.mockReset()
  getWorldRuntimeMock.mockReset()
  directusServiceRequestMock.mockReset()
  broadcastRollEventMock.mockReset()

  const runtime = loadRealRuntime()
  getWorldRuntimeMock.mockResolvedValue({
    configured: true, ok: true, runtime,
    integrityHash: 'sha256-test', settings: {}, rollTypeOverrides: {}
  })
  assembleCharacterMock.mockResolvedValue({ available: true, blueprint: blueprint() })
  directusServiceRequestMock.mockImplementation(async (_path: string, options: any) => jsonResponse({ id: 'roll-1', ...options.body }))
})

describe('createActionAttackRollEvent -- Unarmed Strike', () => {
  it('rolls 1d20 against the real Melee Attack Bonus, never a client-sent number', async () => {
    const roll = await createActionAttackRollEvent({
      worldId: '5', rollerUserId: 'account-1', actorCharacterId: '42', actionId: 'unarmed:strike', visibility: 'private'
    })

    expect(roll.sourceType).toBe('action_attack')
    expect(roll.sourceId).toBe('unarmed:strike')
    expect(roll.sourceKey).toBe('value:combat.melee_attack_bonus')
    expect(roll.label).toBe('Unarmed Strike Attack')
    expect(roll.expression).toBe('1d20')
    expect(roll.dice).toHaveLength(1)
    expect(roll.dice[0]!.sides).toBe(20)
    expect(roll.modifier).toBe(6) // PB +2, STR mod +4
    expect(roll.total).toBe(roll.dice[0]!.total + 6)
  })
})

describe('createActionAttackRollEvent -- weapons', () => {
  it('rolls against the Melee Attack Bonus for an equipped melee weapon', async () => {
    assembleCharacterMock.mockResolvedValue({
      available: true,
      blueprint: blueprint({
        inventory: [{ instanceId: 'item-1', status: 'resolved', title: 'Shortsword', equipped: true, attuned: false, quantity: 1, entry: baseEntry({ actions: [SHORTSWORD_ACTION] }) }]
      })
    })

    const roll = await createActionAttackRollEvent({
      worldId: '5', rollerUserId: 'account-1', actorCharacterId: '42', actionId: 'weapon:item-1', visibility: 'table'
    })

    expect(roll.label).toBe('Shortsword Attack')
    expect(roll.sourceId).toBe('weapon:item-1')
    expect(roll.modifier).toBe(6)
    expect(roll.visibility).toBe('table')
  })

  it('rolls against the Ranged Attack Bonus for an equipped ranged weapon', async () => {
    assembleCharacterMock.mockResolvedValue({
      available: true,
      blueprint: blueprint({
        inventory: [{ instanceId: 'item-1', status: 'resolved', title: 'Longbow', equipped: true, attuned: false, quantity: 1, entry: baseEntry({ actions: [LONGBOW_ACTION] }) }]
      })
    })

    const roll = await createActionAttackRollEvent({
      worldId: '5', rollerUserId: 'account-1', actorCharacterId: '42', actionId: 'weapon:item-1', visibility: 'private'
    })

    expect(roll.label).toBe('Longbow Attack')
    expect(roll.sourceKey).toBe('value:combat.ranged_attack_bonus')
    expect(roll.modifier).toBe(4) // PB +2, DEX mod +2
  })
})

describe('createActionAttackRollEvent -- errors', () => {
  it('rejects an unknown action id, and never persists or broadcasts', async () => {
    await expect(
      createActionAttackRollEvent({ worldId: '5', rollerUserId: 'account-1', actorCharacterId: '42', actionId: 'weapon:does-not-exist', visibility: 'private' })
    ).rejects.toMatchObject({ statusCode: 404 })

    expect(directusServiceRequestMock).not.toHaveBeenCalled()
    expect(broadcastRollEventMock).not.toHaveBeenCalled()
  })

  it('rejects a spell action (not weapon/unarmed) as not-attack-capable, even a spell attack roll', async () => {
    assembleCharacterMock.mockResolvedValue({
      available: true,
      blueprint: blueprint({
        class: { status: 'resolved', entry: baseEntry({ title: 'Wizard', slug: 'wizard-xphb', rulesFacet: findRulesFacet('dnd5e.2024', 'class', 'wizard-xphb') ?? undefined }) },
        spells: [{
          instanceId: 'spell-1', status: 'resolved', title: 'Fire Bolt', known: true, prepared: true,
          entry: baseEntry({ actions: [{ name: 'Fire Bolt', category: 'spell' as const, actionType: 'Cantrip', damageRoll: { count: 1, faces: 10 }, damageType: 'fire', resolution: { kind: 'attack-roll' as const, attackKind: 'spell' as const } }] })
        }]
      })
    })

    await expect(
      createActionAttackRollEvent({ worldId: '5', rollerUserId: 'account-1', actorCharacterId: '42', actionId: 'spell:spell-1', visibility: 'private' })
    ).rejects.toMatchObject({ statusCode: 400 })
    expect(directusServiceRequestMock).not.toHaveBeenCalled()
  })

  it('rejects a non-attack spell (e.g. Shield) as not-attack-capable', async () => {
    assembleCharacterMock.mockResolvedValue({
      available: true,
      blueprint: blueprint({
        spells: [{ instanceId: 'spell-1', status: 'resolved', title: 'Shield', known: true, prepared: true, entry: baseEntry({ actions: [SHIELD_ACTION] }) }]
      })
    })

    await expect(
      createActionAttackRollEvent({ worldId: '5', rollerUserId: 'account-1', actorCharacterId: '42', actionId: 'spell:spell-1', visibility: 'private' })
    ).rejects.toMatchObject({ statusCode: 400 })
  })

  it('reports 404 for a nonexistent character', async () => {
    assembleCharacterMock.mockResolvedValue({ available: false, reason: 'character-not-found' })

    await expect(
      createActionAttackRollEvent({ worldId: '5', rollerUserId: 'account-1', actorCharacterId: '999', actionId: 'unarmed:strike', visibility: 'private' })
    ).rejects.toMatchObject({ statusCode: 404 })
  })
})

describe('createActionDamageRollEvent -- Unarmed Strike', () => {
  it('rolls a fixed 1d1 plus the Strength modifier -- the flat "1 + Strength modifier" RAW formula', async () => {
    const roll = await createActionDamageRollEvent({
      worldId: '5', rollerUserId: 'account-1', actorCharacterId: '42', actionId: 'unarmed:strike', visibility: 'private'
    })

    expect(roll.sourceType).toBe('damage')
    expect(roll.sourceId).toBe('unarmed:strike')
    expect(roll.sourceKey).toBeNull() // no single Rules Engine Value names this roll -- see this module's own header
    expect(roll.label).toBe('Unarmed Strike Damage')
    expect(roll.expression).toBe('1d1')
    expect(roll.dice).toHaveLength(1)
    expect(roll.dice[0]!.sides).toBe(1)
    expect(roll.dice[0]!.results).toEqual([1])
    expect(roll.modifier).toBe(4) // STR mod
    expect(roll.total).toBe(5) // 1 + 4
    expect(roll.metadata.damageType).toBe('bludgeoning')
  })
})

describe('createActionDamageRollEvent -- weapons', () => {
  it('rolls the weapon\'s own damage dice plus the Strength modifier for a melee weapon', async () => {
    assembleCharacterMock.mockResolvedValue({
      available: true,
      blueprint: blueprint({
        inventory: [{ instanceId: 'item-1', status: 'resolved', title: 'Shortsword', equipped: true, attuned: false, quantity: 1, entry: baseEntry({ actions: [SHORTSWORD_ACTION] }) }]
      })
    })

    const roll = await createActionDamageRollEvent({
      worldId: '5', rollerUserId: 'account-1', actorCharacterId: '42', actionId: 'weapon:item-1', visibility: 'table'
    })

    expect(roll.label).toBe('Shortsword Damage')
    expect(roll.expression).toBe('1d6')
    expect(roll.dice).toHaveLength(1)
    expect(roll.dice[0]!.sides).toBe(6)
    expect(roll.modifier).toBe(4) // STR mod, melee
    expect(roll.total).toBe(roll.dice[0]!.total + 4)
    expect(roll.metadata.damageType).toBe('piercing')
  })

  it('rolls the weapon\'s own damage dice plus the Dexterity modifier for a ranged weapon', async () => {
    assembleCharacterMock.mockResolvedValue({
      available: true,
      blueprint: blueprint({
        inventory: [{ instanceId: 'item-1', status: 'resolved', title: 'Longbow', equipped: true, attuned: false, quantity: 1, entry: baseEntry({ actions: [LONGBOW_ACTION] }) }]
      })
    })

    const roll = await createActionDamageRollEvent({
      worldId: '5', rollerUserId: 'account-1', actorCharacterId: '42', actionId: 'weapon:item-1', visibility: 'private'
    })

    expect(roll.dice[0]!.sides).toBe(8)
    expect(roll.modifier).toBe(2) // DEX mod, ranged
  })

  it('never doubles dice for a critical -- Phase 1A has no target/hit context to know about one', async () => {
    assembleCharacterMock.mockResolvedValue({
      available: true,
      blueprint: blueprint({
        inventory: [{ instanceId: 'item-1', status: 'resolved', title: 'Shortsword', equipped: true, attuned: false, quantity: 1, entry: baseEntry({ actions: [SHORTSWORD_ACTION] }) }]
      })
    })

    const roll = await createActionDamageRollEvent({
      worldId: '5', rollerUserId: 'account-1', actorCharacterId: '42', actionId: 'weapon:item-1', visibility: 'private'
    })

    expect(roll.dice[0]!.results).toHaveLength(1) // always base count, never 2x
  })
})

describe('createActionDamageRollEvent -- errors', () => {
  it('rejects an unknown action id', async () => {
    await expect(
      createActionDamageRollEvent({ worldId: '5', rollerUserId: 'account-1', actorCharacterId: '42', actionId: 'weapon:does-not-exist', visibility: 'private' })
    ).rejects.toMatchObject({ statusCode: 404 })
  })

  it('rejects a spell action as not-attack-capable', async () => {
    assembleCharacterMock.mockResolvedValue({
      available: true,
      blueprint: blueprint({
        spells: [{ instanceId: 'spell-1', status: 'resolved', title: 'Shield', known: true, prepared: true, entry: baseEntry({ actions: [SHIELD_ACTION] }) }]
      })
    })

    await expect(
      createActionDamageRollEvent({ worldId: '5', rollerUserId: 'account-1', actorCharacterId: '42', actionId: 'spell:spell-1', visibility: 'private' })
    ).rejects.toMatchObject({ statusCode: 400 })
  })

  it('never mutates any target health -- Phase 1A rolls damage, it never applies it', async () => {
    assembleCharacterMock.mockResolvedValue({
      available: true,
      blueprint: blueprint({
        inventory: [{ instanceId: 'item-1', status: 'resolved', title: 'Shortsword', equipped: true, attuned: false, quantity: 1, entry: baseEntry({ actions: [SHORTSWORD_ACTION] }) }]
      })
    })

    const roll = await createActionDamageRollEvent({
      worldId: '5', rollerUserId: 'account-1', actorCharacterId: '42', actionId: 'weapon:item-1', visibility: 'private'
    })

    // Exactly the roll_events insert plus the display-name lookup -- no
    // character-health write of any kind, matching
    // roll-events-derived.test.ts's own call-count precedent.
    expect(directusServiceRequestMock).toHaveBeenCalledTimes(2)
    const paths = directusServiceRequestMock.mock.calls.map((call) => call[0])
    expect(paths).toContain('/items/roll_events')
    expect(paths.every((path) => path === '/items/roll_events' || path === '/users')).toBe(true)
    expect(roll.total).toBeGreaterThan(0)
  })
})
