// Canonical identity -- Content Workspaces & Studio Phase 1 (§7).
//
// These tests are about DISTINCTIONS, not id string shapes. The design's
// whole claim is that identity is declared and never inferred, so the
// cases that matter are the ones where two entries look alike and must
// still stay apart.

import { describe, expect, it } from 'vitest'

import {
  EMPTY_LINEAGE_INDEX,
  evidenceKeys,
  intraPackIdentityKey,
  isContentEntityId,
  isLegacyBaseRef,
  legacyAddress,
  lineageIndexFrom,
  mintContentEntityId,
  parseLegacyAddress,
  primaryKey,
  sharesEvidence,
  validateBaseSourceRef,
  type IdentityCarrier
} from '../../../app/lib/content-identity'

function entry(overrides: Partial<IdentityCarrier> = {}): IdentityCarrier {
  return {
    packageId: 'eldra.solaris.xphb',
    systemKey: 'dnd5e',
    entityType: 'item',
    slug: 'shortsword-xphb',
    ...overrides
  }
}

describe('mintContentEntityId', () => {
  it('produces an opaque, well-formed id', () => {
    expect(isContentEntityId(mintContentEntityId())).toBe(true)
  })

  it('never repeats across many mints', () => {
    const ids = new Set(Array.from({ length: 2000 }, () => mintContentEntityId()))
    expect(ids.size).toBe(2000)
  })

  it('is derived from the random bytes it is given, not from any content', () => {
    const fixed = () => new Uint8Array([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15])
    expect(mintContentEntityId(fixed)).toBe(mintContentEntityId(fixed))
  })

  it('refuses a short random source rather than minting a weak id', () => {
    expect(() => mintContentEntityId(() => new Uint8Array([1, 2, 3]))).toThrow(/16 random bytes/)
  })

  it('rejects malformed ids', () => {
    for (const bad of ['', 'ce_', 'shortsword', 'CE_ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'ce_0189abcdefghijklmnopqrstuv', null, 42]) {
      expect(isContentEntityId(bad)).toBe(false)
    }
  })
})

describe('legacyAddress', () => {
  it('always carries the packageId -- the address is lineage-scoped', () => {
    expect(legacyAddress(entry() as never)).toBe('legacy:eldra.solaris.xphb::dnd5e::item::shortsword-xphb')
  })

  it('gives two unrelated packages publishing the same slug two different addresses', () => {
    const a = legacyAddress({ packageId: 'homebrew.alice.blades', systemKey: 'dnd5e', entityType: 'item', slug: 'dragon-blade' })
    const b = legacyAddress({ packageId: 'homebrew.bob.blades', systemKey: 'dnd5e', entityType: 'item', slug: 'dragon-blade' })
    expect(a).not.toBe(b)
  })

  it('round-trips', () => {
    const ref = { packageId: 'eldra.solaris.xphb', systemKey: 'dnd5e', entityType: 'item', slug: 'shortsword-xphb' }
    expect(parseLegacyAddress(legacyAddress(ref))).toEqual(ref)
  })

  it('refuses to build an address from a malformed reference instead of guessing one', () => {
    expect(() => legacyAddress({ packageId: 'nodots', systemKey: 'dnd5e', entityType: 'item', slug: 'x' })).toThrow()
    expect(() => legacyAddress({ packageId: 'a.b', systemKey: 'dnd5e', entityType: 'item', slug: '' })).toThrow()
  })

  it('rejects a segment containing the separator, which would make an address ambiguous', () => {
    expect(isLegacyBaseRef({ packageId: 'a.b', systemKey: 'dnd5e', entityType: 'item', slug: 'x::y' })).toBe(false)
  })

  it('agrees with the publishing pipeline about the intra-pack portion', () => {
    // content-pack-publishing.ts's candidateIdentityKey uses this exact
    // formula for within-pack duplicate detection. If the two drift, a
    // pack could publish two entries this design considers one.
    expect(legacyAddress(entry() as never)).toContain(intraPackIdentityKey('dnd5e', 'item', 'shortsword-xphb'))
  })
})

describe('evidenceKeys -- the closed evidence list (§7.4)', () => {
  it('a bare legacy entry claims exactly its own lineage-scoped address', () => {
    expect(evidenceKeys(entry())).toEqual(['legacy:eldra.solaris.xphb::dnd5e::item::shortsword-xphb'])
  })

  it('TWO BARE LEGACY ENTRIES FROM DIFFERENT PACKAGES WITH AN IDENTICAL SLUG SHARE NO KEY', () => {
    const alice = entry({ packageId: 'homebrew.alice.blades', slug: 'dragon-blade' })
    const bob = entry({ packageId: 'homebrew.bob.blades', slug: 'dragon-blade' })
    expect(sharesEvidence(alice, bob)).toBe(false)
  })

  it('a matching title or external id is not evidence -- neither is an input at all', () => {
    const a = { ...entry({ packageId: 'pack.one' }), title: 'Shortsword', externalId: 'Shortsword__XPHB' } as IdentityCarrier
    const b = { ...entry({ packageId: 'pack.two' }), title: 'Shortsword', externalId: 'Shortsword__XPHB' } as IdentityCarrier
    expect(sharesEvidence(a, b)).toBe(false)
  })

  it('E1 -- the same contentEntityId collapses two entries from different packages', () => {
    const id = mintContentEntityId()
    expect(sharesEvidence(entry({ packageId: 'pack.one', contentEntityId: id }), entry({ packageId: 'pack.two', contentEntityId: id }))).toBe(true)
  })

  it('E1 -- a ce-keyed entry also claims its own lineage address, so a curated release collapses onto its predecessor', () => {
    const curated = entry({ contentEntityId: mintContentEntityId() })
    expect(sharesEvidence(curated, entry())).toBe(true)
  })

  it('E2 -- curatedFrom collapses onto exactly the entry it names, and nothing else', () => {
    const curated = entry({
      packageId: 'eldra.curated.library',
      contentEntityId: mintContentEntityId(),
      curatedFrom: { packageId: 'eldra.solaris.xphb', slug: 'shortsword-xphb' }
    })
    expect(sharesEvidence(curated, entry())).toBe(true)
    expect(sharesEvidence(curated, entry({ packageId: 'someone.else.pack' }))).toBe(false)
  })

  it('E3 -- baseRefs collapse onto the observed base', () => {
    const derived = entry({
      packageId: 'eldra.curated.library',
      contentEntityId: mintContentEntityId(),
      baseRefs: [{ packageId: 'eldra.solaris.xphb', systemKey: 'dnd5e', entityType: 'item', slug: 'shortsword-xphb' }]
    })
    expect(sharesEvidence(derived, entry())).toBe(true)
  })

  it('E3 -- a baseRef for a different entity type or system claims nothing', () => {
    const derived = entry({
      packageId: 'eldra.curated.library',
      contentEntityId: mintContentEntityId(),
      baseRefs: [{ packageId: 'eldra.solaris.xphb', systemKey: 'pf2e', entityType: 'item', slug: 'shortsword-xphb' }]
    })
    expect(sharesEvidence(derived, entry())).toBe(false)
  })

  it('E5 -- a slug alias is lineage-scoped and cannot reach another package', () => {
    const renamed = entry({ slug: 'short-sword', slugAliases: ['shortsword-xphb'] })
    expect(sharesEvidence(renamed, entry())).toBe(true)
    expect(sharesEvidence(renamed, entry({ packageId: 'unrelated.pack' }))).toBe(false)
  })

  it('E4 -- supersedes absorbs only the lineages it names', () => {
    const lineages = lineageIndexFrom({ 'eldra.new.library': ['eldra.solaris.xphb'] })
    const successor = entry({ packageId: 'eldra.new.library' })
    expect(sharesEvidence(successor, entry(), lineages)).toBe(true)
    expect(sharesEvidence(successor, entry({ packageId: 'eldra.other.pack' }), lineages)).toBe(false)
  })

  it('E4 does not make unrelated packages with matching slugs equivalent', () => {
    const lineages = lineageIndexFrom({ 'eldra.new.library': ['eldra.solaris.xphb'] })
    const alice = entry({ packageId: 'homebrew.alice.blades', slug: 'dragon-blade' })
    const bob = entry({ packageId: 'homebrew.bob.blades', slug: 'dragon-blade' })
    expect(sharesEvidence(alice, bob, lineages)).toBe(false)
  })

  it('is order-independent and deterministic', () => {
    const subject = entry({
      contentEntityId: mintContentEntityId(),
      slugAliases: ['old-slug', 'older-slug'],
      baseRefs: [{ packageId: 'a.b', systemKey: 'dnd5e', entityType: 'item', slug: 'x' }]
    })
    expect(evidenceKeys(subject)).toEqual(evidenceKeys(subject))
    expect(new Set(evidenceKeys(subject)).size).toBe(evidenceKeys(subject).length)
  })

  it('refuses contradictory evidence rather than silently dropping it', () => {
    expect(() => evidenceKeys(entry({ contentEntityId: 'not-an-id' }))).toThrow(/Malformed contentEntityId/)
    expect(() => evidenceKeys(entry({ baseRefs: [{ packageId: 'nodots', systemKey: 'd', entityType: 'i', slug: 's' }] }))).toThrow(/Malformed baseRefs/)
  })

  it('primaryKey prefers the canonical id and falls back to the lineage address', () => {
    const id = mintContentEntityId()
    expect(primaryKey(entry({ contentEntityId: id }))).toBe(`ce:${id}`)
    expect(primaryKey(entry())).toBe('legacy:eldra.solaris.xphb::dnd5e::item::shortsword-xphb')
  })

  it('an empty lineage index supersedes nothing', () => {
    expect(EMPTY_LINEAGE_INDEX.supersededBy('anything')).toEqual([])
  })
})

describe('validateBaseSourceRef', () => {
  it('accepts a reference to a published release', () => {
    expect(validateBaseSourceRef({
      provider: '5etools', externalId: 'Shortsword__XPHB', packageId: 'eldra.solaris.xphb', version: '1.0.38'
    })).toEqual([])
  })

  it('accepts a reference to a provider collection', () => {
    expect(validateBaseSourceRef({
      provider: '5etools', externalId: 'Shortsword__XPHB', collection: { gameSystemKey: 'dnd5e', collectionKey: 'xphb' }
    })).toEqual([])
  })

  it('refuses a reference that names neither a release nor a collection', () => {
    expect(validateBaseSourceRef({ provider: '5etools', externalId: 'x' }))
      .toContain('a base source ref must name either a published release or a provider collection')
  })

  it('refuses a half-specified release', () => {
    expect(validateBaseSourceRef({ provider: 'p', externalId: 'x', packageId: 'eldra.a.b' })).toContain('version is malformed')
  })
})
