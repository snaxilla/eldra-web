// Unit tests for the Rules Admin editing UI's pure PATCH-building helpers
// (app/components/admin/rules/rulesConfigEdits.ts, Infrastructure Commit
// 9). This repo has no component-rendering test harness, so these are the
// tests for the one piece of each editor where a mistake causes real data
// loss: saveWorldRulesConfig replaces the whole `settings`/`roll_types`
// column on any write that supplies one, so a patch built from only the
// edited fields would silently discard everything else the World stored.

import { describe, expect, it } from 'vitest'
import { buildOptionalRulesSettingsPatch, buildRollTypeOverridesPatch } from '../../../../app/components/admin/rules/rulesConfigEdits'

describe('buildOptionalRulesSettingsPatch -- non-destructive merge', () => {
  it('preserves an unrelated settings kind (e.g. a requiredTrait) untouched', () => {
    // The starter package's own shape: campaign.difficulty (requiredTrait)
    // alongside rules.gritty (optionalRule) in the same `settings` object.
    const current = { campaign: { difficulty: 12 }, rules: { gritty: false } }

    const patched = buildOptionalRulesSettingsPatch(current, { gritty: true })

    expect(patched.campaign).toEqual({ difficulty: 12 })
  })

  it('applies the edited rule value under the rules kind', () => {
    const current = { rules: { gritty: false } }
    const patched = buildOptionalRulesSettingsPatch(current, { gritty: true })
    expect(patched.rules).toEqual({ gritty: true })
  })

  it('preserves an unedited optional rule alongside an edited one', () => {
    const current = { rules: { gritty: false, verbose: true } }
    const patched = buildOptionalRulesSettingsPatch(current, { gritty: true })
    expect(patched.rules).toEqual({ gritty: true, verbose: true })
  })

  it('creates the rules kind when the World has no settings at all yet', () => {
    const patched = buildOptionalRulesSettingsPatch({}, { gritty: true })
    expect(patched).toEqual({ rules: { gritty: true } })
  })

  it('never mutates the settings object it was given', () => {
    const current = { campaign: { difficulty: 12 }, rules: { gritty: false } }
    const snapshot = JSON.parse(JSON.stringify(current))

    buildOptionalRulesSettingsPatch(current, { gritty: true })

    expect(current).toEqual(snapshot)
  })
})

describe('buildRollTypeOverridesPatch -- non-destructive merge', () => {
  it('preserves a stale override for a roll type the package no longer declares', () => {
    // resolveWorldConfig treats this as a warning, not corruption
    // (world-configuration.md §10) -- the editor must not be the thing
    // that silently deletes it.
    const current = { retiredRoll: { enabled: true }, luck: { enabled: true } }

    const patched = buildRollTypeOverridesPatch(current, { luck: { enabled: false, order: 0, visibility: '' } })

    expect(patched.retiredRoll).toEqual({ enabled: true })
  })

  it('applies an edited enabled/order pair', () => {
    const current = {}
    const patched = buildRollTypeOverridesPatch(current, { luck: { enabled: false, order: 2, visibility: '' } })
    expect(patched.luck).toEqual({ enabled: false, order: 2 })
  })

  it('omits visibility entirely for an empty-string choice -- "use the package default"', () => {
    const patched = buildRollTypeOverridesPatch({}, { luck: { enabled: true, order: 0, visibility: '' } })
    expect(patched.luck).not.toHaveProperty('visibility')
  })

  it('includes an explicit visibility override when one is chosen', () => {
    const patched = buildRollTypeOverridesPatch({}, { luck: { enabled: true, order: 0, visibility: 'gm' } })
    expect(patched.luck?.visibility).toBe('gm')
  })

  it('preserves an unedited roll type alongside an edited one', () => {
    const current = { check: { order: 5 } }
    const patched = buildRollTypeOverridesPatch(current, { luck: { enabled: false, order: 0, visibility: '' } })
    expect(patched.check).toEqual({ order: 5 })
  })

  it('overwrites a previous override for the same id, not merges into it', () => {
    // The draft is the SOURCE OF TRUTH for an id it manages -- a stale
    // `rollSpec` from a previous override must not survive alongside a
    // fresh enabled/order/visibility write for the same id.
    const current = { luck: { enabled: true, order: 1, rollSpec: 'roll:luck.old' } }
    const patched = buildRollTypeOverridesPatch(current, { luck: { enabled: false, order: 9, visibility: 'self' } })
    expect(patched.luck).toEqual({ enabled: false, order: 9, visibility: 'self' })
  })

  it('never mutates the overrides object it was given', () => {
    const current = { luck: { enabled: true } }
    const snapshot = JSON.parse(JSON.stringify(current))

    buildRollTypeOverridesPatch(current, { luck: { enabled: false, order: 0, visibility: '' } })

    expect(current).toEqual(snapshot)
  })
})
