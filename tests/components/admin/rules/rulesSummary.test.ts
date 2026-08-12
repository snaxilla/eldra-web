// Unit tests for the Game Admin Rules tab's pure state-classification
// helpers (app/components/admin/rules/rulesSummary.ts, Infrastructure
// Commit 8). This repo has no component-rendering test harness, so these
// are the tests for the one piece of the tab where a mistake has real
// consequences: never merging "configured but broken" into "unconfigured".

import { describe, expect, it } from 'vitest'
import {
  classifyRulesSummary,
  formatRulesFailureValue,
  rulesFailureDetails
} from '../../../../app/components/admin/rules/rulesSummary'

describe('classifyRulesSummary -- unconfigured', () => {
  it('classifies { configured: false } as unconfigured', () => {
    expect(classifyRulesSummary({ configured: false })).toBe('unconfigured')
  })

  it('classifies null/undefined/malformed responses as unconfigured, never broken or ready', () => {
    expect(classifyRulesSummary(null)).toBe('unconfigured')
    expect(classifyRulesSummary(undefined)).toBe('unconfigured')
    expect(classifyRulesSummary('not an object')).toBe('unconfigured')
    expect(classifyRulesSummary({})).toBe('unconfigured')
  })
})

describe('classifyRulesSummary -- broken', () => {
  it('classifies { configured: true, ok: false } as broken -- distinct from unconfigured', () => {
    const result = classifyRulesSummary({
      configured: true,
      ok: false,
      stage: 'package-load',
      failure: { stage: 'not-found' }
    })
    expect(result).toBe('broken')
    expect(result).not.toBe('unconfigured')
  })
})

describe('classifyRulesSummary -- ready', () => {
  it('classifies a { configured: true } response with no ok:false as ready', () => {
    const result = classifyRulesSummary({
      configured: true,
      packageId: 'eldra.starter.generic-d20',
      packageVersion: '0.1.0',
      integrityHash: 'sha256-abc',
      rollTypes: [],
      bindingGaps: [],
      unboundRecommendedRoles: [],
      issues: []
    })
    expect(result).toBe('ready')
  })
})

describe('formatRulesFailureValue', () => {
  it('formats a plain string/number value directly', () => {
    expect(formatRulesFailureValue('eldra.missing')).toBe('eldra.missing')
    expect(formatRulesFailureValue(42)).toBe('42')
  })

  it('joins an array of { message } error objects by message', () => {
    const value = [{ message: 'Duplicate DefinitionId value:x', definitionId: 'value:x' }, { message: 'Second error' }]
    expect(formatRulesFailureValue(value)).toBe('Duplicate DefinitionId value:x; Second error')
  })

  it('stringifies an array of plain scalars', () => {
    expect(formatRulesFailureValue(['a', 'b'])).toBe('a; b')
  })

  it('JSON-stringifies a plain object with no message field', () => {
    expect(formatRulesFailureValue({ foo: 'bar' })).toBe('{"foo":"bar"}')
  })
})

describe('rulesFailureDetails', () => {
  it('returns an empty list for a missing/null failure', () => {
    expect(rulesFailureDetails(null)).toEqual([])
    expect(rulesFailureDetails(undefined)).toEqual([])
  })

  it('excludes the stage key and formats every other field', () => {
    const details = rulesFailureDetails({ stage: 'not-found', packageId: 'eldra.missing', version: '1.0.0' })
    expect(details).toEqual([
      ['packageId', 'eldra.missing'],
      ['version', '1.0.0']
    ])
  })

  it('formats a registry-construction failure\'s errors array', () => {
    const details = rulesFailureDetails({
      stage: 'registry',
      errors: [{ message: 'Duplicate DefinitionId value:x', definitionId: 'value:x' }]
    })
    expect(details).toEqual([['errors', 'Duplicate DefinitionId value:x']])
  })
})
