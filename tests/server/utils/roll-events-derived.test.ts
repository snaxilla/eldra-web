// Unit tests for server/utils/roll-events.ts's `createDerivedRollEvent` --
// Eldra Roll System Phase 2 (ability/saving_throw/skill click-to-roll,
// .github/docs/architecture/eldra-roll-system.md §3/§4/§14).
//
// `assembleCharacter` and `getWorldRuntime` are mocked at the module
// boundary (both already independently tested), matching
// tests/server/utils/character-derived.test.ts's and
// tests/server/utils/character-combat.test.ts's own precedent exactly.
// `getDerivedCharacter` itself is REAL and unmocked -- this is the whole
// point of §3's "the server re-derives from the same already-tested Rules
// Engine output the Character Sheet itself reads." The Rules Runtime is
// REAL too, built via createWorldRuntime from the actual
// eldra-dnd5e-2024 package on disk, so every bonus these tests assert on
// is the real formula, not a hand-built fake. `directusServiceRequest` is
// mocked (Phase 1's own roll-events.test.ts precedent) -- no live Directus
// call, and OpenDice's `rollFormula` is exercised for real, same reason
// roll-events.test.ts gives for `createCustomRollEvent`.

import { readFileSync } from 'node:fs'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { assembleCharacterMock, getWorldRuntimeMock, directusServiceRequestMock } = vi.hoisted(() => ({
  assembleCharacterMock: vi.fn(),
  getWorldRuntimeMock: vi.fn(),
  directusServiceRequestMock: vi.fn()
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

import { createWorldRuntime } from '../../../app/lib/rules/world-runtime'
import { parseExpression } from '../../../app/lib/rules/parser'
import type { Definition, RulesPackageManifest } from '../../../app/lib/rules/types'
import { createDerivedRollEvent } from '../../../server/utils/roll-events'
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

// Fighter, STR 18 (+4 mod), DEX 10 (+0 mod). Level 1 -> proficiency +2.
// Not proficient in Stealth or Wisdom saves, so their bonus is the raw
// ability modifier alone -- easy to assert on without depending on which
// skills/saves this class/background happen to grant proficiency in.
function blueprint(overrides: Partial<CharacterAssemblyBlueprint> = {}): CharacterAssemblyBlueprint {
  return {
    worldId: '5',
    characterId: '42',
    characterTitle: 'Bobbert',
    characterImageUrl: null,
    species: slot('species', 'human-xphb'),
    class: slot('class', 'fighter-xphb'),
    background: slot('background', 'acolyte-xphb'),
    abilityScores: {
      method: 'standard-array',
      scores: { str: 18, dex: 10, con: 10, int: 10, wis: 10, cha: 10 }
    },
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

function jsonResponse(data: unknown) {
  return { data }
}

beforeEach(() => {
  assembleCharacterMock.mockReset()
  getWorldRuntimeMock.mockReset()
  directusServiceRequestMock.mockReset()

  const runtime = loadRealRuntime()
  getWorldRuntimeMock.mockResolvedValue({
    configured: true,
    ok: true,
    runtime,
    integrityHash: 'sha256-test',
    settings: {},
    rollTypeOverrides: {}
  })
  assembleCharacterMock.mockResolvedValue({ available: true, blueprint: blueprint() })
  directusServiceRequestMock.mockImplementation(async (_path: string, options: any) => jsonResponse({ id: 'roll-1', ...options.body }))
})

describe('createDerivedRollEvent -- ability', () => {
  it('rolls 1d20 against the character\'s real Strength modifier, never a client-sent number', async () => {
    const roll = await createDerivedRollEvent({
      worldId: '5',
      rollerUserId: 'account-1',
      actorCharacterId: '42',
      sourceType: 'ability',
      sourceKey: 'value:ability.str.mod',
      visibility: 'private'
    })

    expect(roll.sourceType).toBe('ability')
    expect(roll.sourceKey).toBe('value:ability.str.mod')
    expect(roll.expression).toBe('1d20')
    expect(roll.modifier).toBe(4) // STR 18 -> +4, the real formula's own output
    expect(roll.modifiers).toEqual([4])
    expect(roll.dice).toHaveLength(1)
    expect(roll.dice[0]!.sides).toBe(20)
    expect(roll.total).toBe(roll.dice[0]!.total + 4)
  })

  it('defaults the label to the Value\'s own label plus "Check"', async () => {
    const roll = await createDerivedRollEvent({
      worldId: '5',
      rollerUserId: 'account-1',
      actorCharacterId: '42',
      sourceType: 'ability',
      sourceKey: 'value:ability.str.mod',
      visibility: 'private'
    })

    expect(roll.label.endsWith('Check')).toBe(true)
  })

  it('honors an explicit client-supplied label instead of the default', async () => {
    const roll = await createDerivedRollEvent({
      worldId: '5',
      rollerUserId: 'account-1',
      actorCharacterId: '42',
      sourceType: 'ability',
      sourceKey: 'value:ability.str.mod',
      label: 'Shove Attempt',
      visibility: 'private'
    })

    expect(roll.label).toBe('Shove Attempt')
  })
})

describe('createDerivedRollEvent -- saving_throw', () => {
  it('rolls against the real, not-proficient Wisdom save bonus (the raw ability modifier)', async () => {
    const roll = await createDerivedRollEvent({
      worldId: '5',
      rollerUserId: 'account-1',
      actorCharacterId: '42',
      sourceType: 'saving_throw',
      sourceKey: 'value:save.wis.bonus',
      visibility: 'table'
    })

    expect(roll.sourceType).toBe('saving_throw')
    expect(roll.modifier).toBe(0) // WIS 10 -> +0, not proficient
    expect(roll.label.endsWith('Save')).toBe(true)
    expect(roll.visibility).toBe('table')
  })
})

describe('createDerivedRollEvent -- skill', () => {
  it('rolls against the real, not-proficient Stealth bonus (Dexterity modifier)', async () => {
    const roll = await createDerivedRollEvent({
      worldId: '5',
      rollerUserId: 'account-1',
      actorCharacterId: '42',
      sourceType: 'skill',
      sourceKey: 'value:skill.stealth.bonus',
      visibility: 'private'
    })

    expect(roll.sourceType).toBe('skill')
    expect(roll.modifier).toBe(0) // DEX 10 -> +0, not proficient
    expect(roll.label.endsWith('Check')).toBe(true)
  })

  it('persists exactly one Directus row per roll, never an update', async () => {
    await createDerivedRollEvent({
      worldId: '5',
      rollerUserId: 'account-1',
      actorCharacterId: '42',
      sourceType: 'skill',
      sourceKey: 'value:skill.stealth.bonus',
      visibility: 'private'
    })

    expect(directusServiceRequestMock).toHaveBeenCalledTimes(1)
    expect(directusServiceRequestMock.mock.calls[0]![1].method).toBe('POST')
  })
})

describe('createDerivedRollEvent -- rejections', () => {
  it('rejects an unknown character with 404 and never persists anything', async () => {
    assembleCharacterMock.mockResolvedValue({ available: false, reason: 'character-not-found' })

    await expect(
      createDerivedRollEvent({
        worldId: '5',
        rollerUserId: 'account-1',
        actorCharacterId: '999',
        sourceType: 'ability',
        sourceKey: 'value:ability.str.mod',
        visibility: 'private'
      })
    ).rejects.toMatchObject({ statusCode: 404 })

    expect(directusServiceRequestMock).not.toHaveBeenCalled()
  })

  it('rejects with 409 when the World has no active Rules Package', async () => {
    getWorldRuntimeMock.mockResolvedValue({ configured: false })

    await expect(
      createDerivedRollEvent({
        worldId: '5',
        rollerUserId: 'account-1',
        actorCharacterId: '42',
        sourceType: 'ability',
        sourceKey: 'value:ability.str.mod',
        visibility: 'private'
      })
    ).rejects.toMatchObject({ statusCode: 409 })

    expect(directusServiceRequestMock).not.toHaveBeenCalled()
  })

  it('rejects a sourceKey this character\'s Rules Package does not declare with 400, and never persists anything', async () => {
    await expect(
      createDerivedRollEvent({
        worldId: '5',
        rollerUserId: 'account-1',
        actorCharacterId: '42',
        sourceType: 'skill',
        sourceKey: 'value:skill.made_up_skill.bonus',
        visibility: 'private'
      })
    ).rejects.toMatchObject({ statusCode: 400 })

    expect(directusServiceRequestMock).not.toHaveBeenCalled()
  })

  it('rejects a sourceKey looked up outside its sourceType\'s own category, even if it exists elsewhere', async () => {
    // A real ability modifier id, requested as if it were a skill -- proves
    // the lookup is scoped to core.skills only, never falling back to
    // searching every category for a matching id.
    await expect(
      createDerivedRollEvent({
        worldId: '5',
        rollerUserId: 'account-1',
        actorCharacterId: '42',
        sourceType: 'skill',
        sourceKey: 'value:ability.str.mod',
        visibility: 'private'
      })
    ).rejects.toMatchObject({ statusCode: 400 })
  })
})
