// Unit tests for app/lib/characters/equipment-bundle.ts -- the pure generic "choose a bundle, get
// canonical grants" resolver shared by the Builder and the server authority. Pure module, every
// resolver injected -- nothing to mock.

import { describe, expect, it } from 'vitest'

import {
  findEquipmentBundle,
  mergeResolvedGrants,
  resolveEquipmentBundle,
  type ResolvedEquipmentGrant
} from '../../../app/lib/characters/equipment-bundle'
import type { EquipmentBundle, EquipmentChoice } from '../../../app/lib/content-rules/types'

const REF = { packageId: 'eldra.solaris.xphb' }
const noCrossReference = () => null
const noItems = () => null

describe('findEquipmentBundle', () => {
  const choice: EquipmentChoice = {
    id: 'choice:equipment.starting.test-xphb',
    bundles: [
      { id: 'A', label: 'A', grants: [] },
      { id: 'B', label: 'B', grants: [] }
    ]
  }

  it('finds a bundle by id', () => {
    expect(findEquipmentBundle(choice, 'B')).toBe(choice.bundles[1])
  })

  it('returns null for an unknown id', () => {
    expect(findEquipmentBundle(choice, 'C')).toBeNull()
  })
})

describe('resolveEquipmentBundle -- every structural grant kind', () => {
  it('resolves an item grant, defaulting quantity to 1', () => {
    const bundle: EquipmentBundle = { id: 'A', label: 'A', grants: [{ kind: 'item', slug: 'greataxe-xphb' }] }
    const resolution = resolveEquipmentBundle(bundle, {
      resolveItemSlug: (slug) => (slug === 'greataxe-xphb' ? { ...REF, slug } : null),
      resolveCrossReference: noCrossReference
    })
    expect(resolution).toEqual({ ok: true, grants: [{ kind: 'item', ref: { ...REF, slug: 'greataxe-xphb' }, quantity: 1 }] })
  })

  it('resolves an item+quantity grant, honoring the authored quantity', () => {
    const bundle: EquipmentBundle = { id: 'A', label: 'A', grants: [{ kind: 'item', slug: 'handaxe-xphb', quantity: 4 }] }
    const resolution = resolveEquipmentBundle(bundle, {
      resolveItemSlug: (slug) => ({ ...REF, slug }),
      resolveCrossReference: noCrossReference
    })
    expect(resolution).toEqual({ ok: true, grants: [{ kind: 'item', ref: { ...REF, slug: 'handaxe-xphb' }, quantity: 4 }] })
  })

  it('resolves a custom grant (Wizard\'s Spellbook / Fighter\'s displayName+item shape)', () => {
    const bundle: EquipmentBundle = { id: 'A', label: 'A', grants: [{ kind: 'custom', name: 'Spellbook' }] }
    const resolution = resolveEquipmentBundle(bundle, { resolveItemSlug: noItems, resolveCrossReference: noCrossReference })
    expect(resolution).toEqual({ ok: true, grants: [{ kind: 'custom', name: 'Spellbook', quantity: 1 }] })
  })

  it('resolves a currency grant verbatim', () => {
    const bundle: EquipmentBundle = { id: 'B', label: 'B', grants: [{ kind: 'currency', denominationId: 'currency:xphb.copper', amount: 7500 }] }
    const resolution = resolveEquipmentBundle(bundle, { resolveItemSlug: noItems, resolveCrossReference: noCrossReference })
    expect(resolution).toEqual({ ok: true, grants: [{ kind: 'currency', denominationId: 'currency:xphb.copper', amount: 7500 }] })
  })

  it('resolves a crossReference grant by delegating to the injected resolver (Monk\'s artisan-or-instrument case)', () => {
    const bundle: EquipmentBundle = { id: 'A', label: 'A', grants: [{ kind: 'crossReference', choiceSetId: 'choice:proficiency.artisan-or-instrument.class' }] }
    const resolution = resolveEquipmentBundle(bundle, {
      resolveItemSlug: noItems,
      resolveCrossReference: (choiceSetId) => (choiceSetId === 'choice:proficiency.artisan-or-instrument.class' ? { ...REF, slug: 'lute-xphb' } : null)
    })
    expect(resolution).toEqual({ ok: true, grants: [{ kind: 'item', ref: { ...REF, slug: 'lute-xphb' }, quantity: 1 }] })
  })

  it('a Fighter-shaped three-way bundle set each resolves independently', () => {
    const bundles: EquipmentBundle[] = [
      { id: 'A', label: 'A', grants: [{ kind: 'item', slug: 'chain-mail-xphb' }] },
      { id: 'B', label: 'B', grants: [{ kind: 'item', slug: 'studded-leather-armor-xphb' }] },
      { id: 'C', label: 'C', grants: [{ kind: 'currency', denominationId: 'currency:xphb.copper', amount: 15500 }] }
    ]
    const resolvers = { resolveItemSlug: (slug: string) => ({ ...REF, slug }), resolveCrossReference: noCrossReference }
    expect(resolveEquipmentBundle(bundles[0], resolvers)).toEqual({ ok: true, grants: [{ kind: 'item', ref: { ...REF, slug: 'chain-mail-xphb' }, quantity: 1 }] })
    expect(resolveEquipmentBundle(bundles[1], resolvers)).toEqual({ ok: true, grants: [{ kind: 'item', ref: { ...REF, slug: 'studded-leather-armor-xphb' }, quantity: 1 }] })
    expect(resolveEquipmentBundle(bundles[2], resolvers)).toEqual({ ok: true, grants: [{ kind: 'currency', denominationId: 'currency:xphb.copper', amount: 15500 }] })
  })

  it('fails closed with unresolved-item when the slug does not resolve against the catalogue', () => {
    const bundle: EquipmentBundle = { id: 'A', label: 'A', grants: [{ kind: 'item', slug: 'holy-symbol-xphb' }] }
    const resolution = resolveEquipmentBundle(bundle, { resolveItemSlug: noItems, resolveCrossReference: noCrossReference })
    expect(resolution).toEqual({ ok: false, reason: 'unresolved-item', slug: 'holy-symbol-xphb' })
  })

  it('fails closed with unresolved-cross-reference when the named ChoiceSet has no answer', () => {
    const bundle: EquipmentBundle = { id: 'A', label: 'A', grants: [{ kind: 'crossReference', choiceSetId: 'choice:proficiency.gaming-set.background' }] }
    const resolution = resolveEquipmentBundle(bundle, { resolveItemSlug: noItems, resolveCrossReference: noCrossReference })
    expect(resolution).toEqual({ ok: false, reason: 'unresolved-cross-reference', choiceSetId: 'choice:proficiency.gaming-set.background' })
  })

  it('fails the WHOLE bundle on the first unresolved grant -- no partial result', () => {
    const bundle: EquipmentBundle = {
      id: 'A',
      label: 'A',
      grants: [{ kind: 'item', slug: 'dagger-xphb' }, { kind: 'item', slug: 'missing-xphb' }]
    }
    const resolution = resolveEquipmentBundle(bundle, {
      resolveItemSlug: (slug) => (slug === 'dagger-xphb' ? { ...REF, slug } : null),
      resolveCrossReference: noCrossReference
    })
    expect(resolution).toEqual({ ok: false, reason: 'unresolved-item', slug: 'missing-xphb' })
  })
})

describe('mergeResolvedGrants', () => {
  it('merges two grants sharing the identical catalogue ref into one addition with summed quantity', () => {
    const grants: ResolvedEquipmentGrant[][] = [
      [{ kind: 'item', ref: { ...REF, slug: 'dagger-xphb' }, quantity: 2 }],
      [{ kind: 'item', ref: { ...REF, slug: 'dagger-xphb' }, quantity: 1 }]
    ]
    expect(mergeResolvedGrants(grants)).toEqual({
      additions: [{ ref: { ...REF, slug: 'dagger-xphb' }, quantity: 3 }],
      currency: {}
    })
  })

  it('merges two custom grants sharing the identical name (case/whitespace-insensitive)', () => {
    const grants: ResolvedEquipmentGrant[][] = [
      [{ kind: 'custom', name: 'Gaming Set', quantity: 1 }],
      [{ kind: 'custom', name: ' gaming set ', quantity: 1 }]
    ]
    expect(mergeResolvedGrants(grants)).toEqual({
      additions: [{ name: 'Gaming Set', quantity: 2 }],
      currency: {}
    })
  })

  it('keeps distinct refs/names as separate additions', () => {
    const grants: ResolvedEquipmentGrant[][] = [
      [{ kind: 'item', ref: { ...REF, slug: 'dagger-xphb' }, quantity: 1 }, { kind: 'custom', name: 'Spellbook', quantity: 1 }]
    ]
    expect(mergeResolvedGrants(grants).additions).toEqual([
      { ref: { ...REF, slug: 'dagger-xphb' }, quantity: 1 },
      { name: 'Spellbook', quantity: 1 }
    ])
  })

  it('sums currency of the SAME denomination across bundles', () => {
    const grants: ResolvedEquipmentGrant[][] = [
      [{ kind: 'currency', denominationId: 'currency:xphb.copper', amount: 1600 }],
      [{ kind: 'currency', denominationId: 'currency:xphb.copper', amount: 5000 }]
    ]
    expect(mergeResolvedGrants(grants)).toEqual({ additions: [], currency: { 'currency:xphb.copper': 6600 } })
  })

  it('an empty grant list set merges to nothing', () => {
    expect(mergeResolvedGrants([])).toEqual({ additions: [], currency: {} })
    expect(mergeResolvedGrants([[]])).toEqual({ additions: [], currency: {} })
  })

  it('proves a real class+background pure-currency combination (no items, no D&D denomination hardcode in this module)', () => {
    // Bard bundle B (90 GP) + Criminal bundle B (50 GP), expressed in copper base units -- this
    // module never interprets the denomination id, it only sums amounts sharing one.
    const grants: ResolvedEquipmentGrant[][] = [
      [{ kind: 'currency', denominationId: 'currency:xphb.copper', amount: 9000 }],
      [{ kind: 'currency', denominationId: 'currency:xphb.copper', amount: 5000 }]
    ]
    expect(mergeResolvedGrants(grants)).toEqual({ additions: [], currency: { 'currency:xphb.copper': 14000 } })
  })
})
