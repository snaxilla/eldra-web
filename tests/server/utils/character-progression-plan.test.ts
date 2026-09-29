// Unit tests for server/utils/character-progression-plan.ts -- Character
// Progression Phase 1A (Game Admin Level Manager + Authoritative Level
// Transition Engine).
//
// `assembleCharacter`/`getWorldRuntime` mocked at the module boundary, the
// Rules Runtime REAL (built via createWorldRuntime from the actual
// eldra-dnd5e-2024 package on disk) -- matching character-recovery.test.ts's/
// character-cast.test.ts's own precedent exactly, so every Proficiency
// Bonus/Max HP/Hit Dice number these tests assert on is the real formula,
// and `getDerivedCharacterAtLevel`'s own simulation runs for real.
// `saveCharacterProgression` (server/utils/character-progression.ts) is
// mocked -- the one real Directus write this module ever performs.

import { readFileSync } from 'node:fs'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { assembleCharacterMock, getWorldRuntimeMock, saveCharacterProgressionMock } = vi.hoisted(() => ({
  assembleCharacterMock: vi.fn(),
  getWorldRuntimeMock: vi.fn(),
  saveCharacterProgressionMock: vi.fn()
}))

vi.mock('../../../server/utils/character-assembly', () => ({
  assembleCharacter: assembleCharacterMock
}))

vi.mock('../../../server/utils/world-runtime-service', () => ({
  getWorldRuntime: getWorldRuntimeMock
}))

vi.mock('../../../server/utils/character-progression', () => ({
  saveCharacterProgression: saveCharacterProgressionMock
}))

import { createWorldRuntime } from '../../../app/lib/rules/world-runtime'
import { parseExpression } from '../../../app/lib/rules/parser'
import type { Definition, RulesPackageManifest } from '../../../app/lib/rules/types'
import { findRulesFacet } from '../../../app/lib/content-rules'
import {
  confirmProgression,
  planProgression,
  resolveCurrentProgression
} from '../../../server/utils/character-progression-plan'

const PACKAGE_DIR = 'packages/eldra-dnd5e-2024'
const CLASS_REF = { packageId: 'eldra.content.xphb', slug: 'wizard-xphb' }

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

// DragoWizard-shaped: a real Wizard, INT 16 (+3), starting at level 1.
// `progression` is the field this phase itself adds -- absent means level 1
// (assembleCharacter's own synthesis, exercised for real by
// character-assembly.test.ts; here we set it explicitly per test).
function wizardBlueprint(overrides: Record<string, unknown> = {}) {
  return {
    worldId: '5',
    characterId: '42',
    characterTitle: 'DragoWizard',
    species: { status: 'resolved', entry: baseEntry({ title: 'Human', slug: 'human-xphb' }) },
    class: {
      status: 'resolved',
      entry: baseEntry({ title: 'Wizard', slug: CLASS_REF.slug, rulesFacet: findRulesFacet('dnd5e.2024', 'class', CLASS_REF.slug) ?? undefined })
    },
    background: { status: 'resolved', entry: baseEntry({ title: 'Sage', slug: 'sage-xphb' }) },
    abilityScores: { method: 'standard-array', scores: { str: 10, dex: 10, con: 12, int: 16, wis: 10, cha: 10 } },
    rulesChoices: null,
    inventory: [],
    notes: null,
    health: null,
    spells: [],
    expendedSlots: {},
    progression: { classes: [{ classRef: CLASS_REF, level: 1 }] },
    packs: [],
    ...overrides
  }
}

beforeEach(() => {
  assembleCharacterMock.mockReset()
  getWorldRuntimeMock.mockReset()
  saveCharacterProgressionMock.mockReset()

  const runtime = loadRealRuntime()
  getWorldRuntimeMock.mockResolvedValue({
    configured: true, ok: true, runtime,
    integrityHash: 'sha256-test', settings: {}, rollTypeOverrides: {}
  })
  assembleCharacterMock.mockResolvedValue({ available: true, blueprint: wizardBlueprint() })
  saveCharacterProgressionMock.mockImplementation(async (_id: unknown, stored: unknown) => stored)
})

describe('resolveCurrentProgression', () => {
  it('reports the current total level from the assembled blueprint', async () => {
    const result = await resolveCurrentProgression('5', '42')
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.state.currentLevel).toBe(1)
    expect(result.state.progression).toEqual({ classes: [{ classRef: CLASS_REF, level: 1 }] })
  })

  it('reports character-not-found', async () => {
    assembleCharacterMock.mockResolvedValue({ available: false, reason: 'character-not-found' })
    const result = await resolveCurrentProgression('5', '999')
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.reason).toBe('character-not-found')
  })
})

describe('planProgression -- DragoWizard 1 -> 5 (the required acceptance target)', () => {
  it('produces one step per entered level, in ascending order', async () => {
    const result = await planProgression('5', '42', 5)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.plan.currentLevel).toBe(1)
    expect(result.plan.targetLevel).toBe(5)
    expect(result.plan.steps.map((step) => step.level)).toEqual([2, 3, 4, 5])
  })

  it('surfaces the Proficiency Bonus increase as an automatic consequence, at exactly the level it changes (5)', async () => {
    const result = await planProgression('5', '42', 5)
    expect(result.ok).toBe(true)
    if (!result.ok) return

    const level5 = result.plan.steps.find((step) => step.level === 5)!
    const profChange = level5.automaticConsequences.find((c) => c.id === 'value:proficiency_bonus')
    expect(profChange).toEqual({ id: 'value:proficiency_bonus', label: expect.any(String), previousValue: 2, newValue: 3 })

    // Levels 2-4 do not cross a proficiency threshold -- no line item for it.
    for (const level of [2, 3, 4]) {
      const step = result.plan.steps.find((s) => s.level === level)!
      expect(step.automaticConsequences.some((c) => c.id === 'value:proficiency_bonus')).toBe(false)
    }
  })

  it('has zero required choices at every level -- honest, given the current Rules Package declares none', () => {
    return planProgression('5', '42', 5).then((result) => {
      expect(result.ok).toBe(true)
      if (!result.ok) return
      for (const step of result.plan.steps) {
        expect(step.requiredChoices).toEqual([])
      }
      expect(result.plan.unresolvedChoiceIds).toEqual([])
      expect(result.plan.valid).toBe(true)
    })
  })

  it('base mechanics are unaffected by planning -- the character\'s own stored level is never mutated by a preview', async () => {
    await planProgression('5', '42', 5)
    expect(saveCharacterProgressionMock).not.toHaveBeenCalled()
  })

  it('a real formula reference (Spell Save DC, which reads Proficiency Bonus) also changes at the same threshold level', async () => {
    const result = await planProgression('5', '42', 5)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const level5 = result.plan.steps.find((step) => step.level === 5)!
    expect(level5.automaticConsequences.some((c) => c.id === 'value:spellcasting.save_dc')).toBe(true)
  })
})

describe('planProgression -- validation', () => {
  it('rejects a target level that is not above the current level (advancement only)', async () => {
    const result = await planProgression('5', '42', 1)
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.reason).toBe('not-advancement')
  })

  it('rejects a target level below the current level', async () => {
    assembleCharacterMock.mockResolvedValue({
      available: true,
      blueprint: wizardBlueprint({ progression: { classes: [{ classRef: CLASS_REF, level: 5 }] } })
    })
    const result = await planProgression('5', '42', 3)
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.reason).toBe('not-advancement')
  })

  it('rejects an invalid target level (out of 1-20 range)', async () => {
    const result = await planProgression('5', '42', 25)
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.reason).toBe('invalid-target-level')
  })

  it('rejects a non-integer target level', async () => {
    const result = await planProgression('5', '42', 3.5 as unknown as number)
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.reason).toBe('invalid-target-level')
  })

  it('reports character-not-found', async () => {
    assembleCharacterMock.mockResolvedValue({ available: false, reason: 'character-not-found' })
    const result = await planProgression('5', '999', 5)
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.reason).toBe('character-not-found')
  })
})

describe('confirmProgression -- commits exactly one write', () => {
  it('persists the new target level for the character\'s existing class', async () => {
    const result = await confirmProgression('5', '42', 5, '1')
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.currentLevel).toBe(5)
    expect(saveCharacterProgressionMock).toHaveBeenCalledWith('42', { classes: [{ classRef: CLASS_REF, level: 5 }] })
    expect(saveCharacterProgressionMock).toHaveBeenCalledTimes(1)
  })

  it('rejects a stale fingerprint -- the character\'s level has moved since the plan was previewed', async () => {
    // Plan was generated when the character was level 1 (fingerprint '1'),
    // but by confirm time the character is actually level 3.
    assembleCharacterMock.mockResolvedValue({
      available: true,
      blueprint: wizardBlueprint({ progression: { classes: [{ classRef: CLASS_REF, level: 3 }] } })
    })

    const result = await confirmProgression('5', '42', 5, '1')
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.reason).toBe('stale-plan')
    expect(saveCharacterProgressionMock).not.toHaveBeenCalled()
  })

  it('rejects a non-advancing target level even with a fresh fingerprint', async () => {
    const result = await confirmProgression('5', '42', 1, '1')
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.reason).toBe('not-advancement')
    expect(saveCharacterProgressionMock).not.toHaveBeenCalled()
  })

  it('rejects when no class is recorded at all', async () => {
    assembleCharacterMock.mockResolvedValue({
      available: true,
      blueprint: wizardBlueprint({ progression: { classes: [] } })
    })
    const result = await confirmProgression('5', '42', 5, '1')
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.reason).toBe('no-class-recorded')
    expect(saveCharacterProgressionMock).not.toHaveBeenCalled()
  })

  it('refuses to guess when more than one class entry exists -- multiclassing is not supported by this Level Manager', async () => {
    assembleCharacterMock.mockResolvedValue({
      available: true,
      blueprint: wizardBlueprint({
        progression: {
          classes: [
            { classRef: CLASS_REF, level: 3 },
            { classRef: { packageId: 'eldra.content.xphb', slug: 'fighter-xphb' }, level: 2 }
          ]
        }
      })
    })
    const result = await confirmProgression('5', '42', 6, '5')
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.reason).toBe('multiclass-not-supported')
    expect(saveCharacterProgressionMock).not.toHaveBeenCalled()
  })

  it('rejects an invalid target level before any write', async () => {
    const result = await confirmProgression('5', '42', 99, '1')
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.reason).toBe('invalid-target-level')
    expect(saveCharacterProgressionMock).not.toHaveBeenCalled()
  })

  it('reports character-not-found', async () => {
    assembleCharacterMock.mockResolvedValue({ available: false, reason: 'character-not-found' })
    const result = await confirmProgression('5', '999', 5, '1')
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.reason).toBe('character-not-found')
  })
})

describe('security/authority -- no client-trusted fact', () => {
  it('confirmProgression takes no field for scaled/derived numbers -- only targetLevel and fingerprint', async () => {
    // Structural proof: the function signature itself has no slot for a
    // client-provided proficiency bonus, HP, or spell-slot count.
    const result = await confirmProgression('5', '42', 5, '1')
    expect(result.ok).toBe(true)
  })

  it('a fingerprint that does not match ANY real prior state is rejected the same as a stale one', async () => {
    const result = await confirmProgression('5', '42', 5, 'not-a-real-fingerprint')
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.reason).toBe('stale-plan')
  })
})

describe('no class-name special cases', () => {
  it('a Fighter (a different class, different facet) plans and confirms through the identical generic path', async () => {
    const fighterRef = { packageId: 'eldra.content.xphb', slug: 'fighter-xphb' }
    assembleCharacterMock.mockResolvedValue({
      available: true,
      blueprint: wizardBlueprint({
        class: { status: 'resolved', entry: baseEntry({ title: 'Fighter', slug: 'fighter-xphb', rulesFacet: findRulesFacet('dnd5e.2024', 'class', 'fighter-xphb') ?? undefined }) },
        progression: { classes: [{ classRef: fighterRef, level: 1 }] }
      })
    })

    const planResult = await planProgression('5', '42', 5)
    expect(planResult.ok).toBe(true)

    const confirmResult = await confirmProgression('5', '42', 5, '1')
    expect(confirmResult.ok).toBe(true)
    if (!confirmResult.ok) return
    expect(saveCharacterProgressionMock).toHaveBeenCalledWith('42', { classes: [{ classRef: fighterRef, level: 5 }] })
  })
})
