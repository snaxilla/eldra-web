// Unit tests for app/lib/rolls/requests.ts -- Eldra Roll System
// Phase 4B.7 (Roll Tray Manual Dice Controls,
// .github/docs/architecture/eldra-roll-system.md,
// adr-024-authored-dice-presentation.md).
//
// Covers this phase's own TESTING section directly: the rack's exact die
// set, the exact expression each maps to, sourceType, visibility
// forwarding, label production, and d100's literal-1d100 semantics.
// `buildCustomRollRequestBody`'s own pre-existing behavior is already
// covered by tests/components/admin/health/rollSandbox.test.ts (which
// still imports it from that file's own re-export, unchanged) -- this
// file does not re-test it, only the NEW manual-dice layer built on top.

import { describe, expect, it } from 'vitest'
import {
  buildManualRollRequestBody,
  MANUAL_DICE,
  type ManualDieOption
} from '../../../app/lib/rolls/requests'

describe('MANUAL_DICE', () => {
  it('exposes exactly the seven dice a physical tabletop set contains, in order', () => {
    expect(MANUAL_DICE.map((die) => die.type)).toEqual(['d4', 'd6', 'd8', 'd10', 'd12', 'd20', 'd100'])
  })

  it('maps each die to exactly its own single-die expression', () => {
    expect(MANUAL_DICE.map((die) => die.expression)).toEqual([
      '1d4', '1d6', '1d8', '1d10', '1d12', '1d20', '1d100'
    ])
  })

  it('d100 remains a literal 1d100 -- never 2d10, never tens-and-ones', () => {
    const d100 = MANUAL_DICE.find((die) => die.type === 'd100')
    expect(d100?.expression).toBe('1d100')
    expect(d100?.sides).toBe(100)
  })

  it('produces a useful, human-readable label for every die', () => {
    expect(MANUAL_DICE.map((die) => die.label)).toEqual([
      'd4 Roll', 'd6 Roll', 'd8 Roll', 'd10 Roll', 'd12 Roll', 'd20 Roll', 'd100 Roll'
    ])
  })

  it('produces a distinct, descriptive accessible name for every die', () => {
    expect(MANUAL_DICE.map((die) => die.ariaLabel)).toEqual([
      'Roll a d4', 'Roll a d6', 'Roll a d8', 'Roll a d10', 'Roll a d12', 'Roll a d20', 'Roll a d100'
    ])
  })

  it('every sides value matches the number in its own die type', () => {
    for (const die of MANUAL_DICE) {
      expect(die.sides).toBe(Number(die.type.slice(1)))
    }
  })
})

describe('buildManualRollRequestBody', () => {
  function findDie(type: ManualDieOption['type']): ManualDieOption {
    const die = MANUAL_DICE.find((candidate) => candidate.type === type)
    if (!die) throw new Error(`no manual die found for ${type}`)
    return die
  }

  it('always uses sourceType "custom" -- the existing canonical roll path, never a second roll system', () => {
    for (const die of MANUAL_DICE) {
      const body = buildManualRollRequestBody(die, 'private')
      expect(body.sourceType).toBe('custom')
    }
  })

  it('sends the die\'s own single-die expression, never a client-computed result', () => {
    const body = buildManualRollRequestBody(findDie('d4'), 'table')
    expect(body.expression).toBe('1d4')
    expect(body).not.toHaveProperty('total')
    expect(body).not.toHaveProperty('dice')
    expect(body).not.toHaveProperty('results')
    expect(body).not.toHaveProperty('seed')
  })

  it('forwards Private visibility unchanged', () => {
    const body = buildManualRollRequestBody(findDie('d20'), 'private')
    expect(body.visibility).toBe('private')
  })

  it('forwards Table visibility unchanged', () => {
    const body = buildManualRollRequestBody(findDie('d20'), 'table')
    expect(body.visibility).toBe('table')
  })

  it('sends the die\'s own default label', () => {
    const body = buildManualRollRequestBody(findDie('d8'), 'private')
    expect(body.label).toBe('d8 Roll')
  })

  it('builds a fresh, independent request body for d100, still a literal 1d100', () => {
    const body = buildManualRollRequestBody(findDie('d100'), 'table')
    expect(body).toMatchObject({
      sourceType: 'custom',
      expression: '1d100',
      visibility: 'table',
      label: 'd100 Roll'
    })
  })
})
