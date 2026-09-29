import { describe, expect, it } from 'vitest'
import { findLatestPublishedPack, type RefreshMatchCandidate } from '../../../../app/components/admin/content-packs/contentPackRefreshMatch'

describe('findLatestPublishedPack', () => {
  it('finds the published PHB pack by origin.sourceId even though it was published under a non-default packageId', () => {
    // Regression test for the real production bug: the old logic matched
    // on packageId === suggestedPackageId ('eldra.content.xphb'), which
    // never matched Solaris's real pack ('eldra.solaris.xphb'). This test
    // uses the exact real-world shape.
    const publishedPacks: RefreshMatchCandidate[] = [
      { packageId: 'eldra.solaris.xphb', version: '1.0.0', origin: { adapterId: '5etools-json', sourceId: 'xphb' } },
      { packageId: 'eldra.solaris.xphb', version: '1.0.4', origin: { adapterId: '5etools-json', sourceId: 'xphb' } },
      { packageId: 'eldra.solaris.xphb', version: '1.0.2', origin: { adapterId: '5etools-json', sourceId: 'xphb' } },
      { packageId: 'eldra.solaris.xphb', version: '1.0.3', origin: { adapterId: '5etools-json', sourceId: 'xphb' } },
      { packageId: 'eldra.solaris.xphb', version: '1.0.1', origin: { adapterId: '5etools-json', sourceId: 'xphb' } }
    ]

    const result = findLatestPublishedPack(publishedPacks, 'xphb')

    expect(result).not.toBeNull()
    expect(result!.packageId).toBe('eldra.solaris.xphb')
    expect(result!.version).toBe('1.0.4')
  })

  it('is generic, not PHB-specific -- matches any Content Source published under any packageId', () => {
    const publishedPacks: RefreshMatchCandidate[] = [
      { packageId: 'my-custom-srd-name', version: '2.0.0', origin: { adapterId: '5etools-json', sourceId: 'srd-5-1' } },
      { packageId: 'eldra.content.xdmg', version: '1.0.0', origin: { adapterId: '5etools-json', sourceId: 'xdmg' } }
    ]

    expect(findLatestPublishedPack(publishedPacks, 'srd-5-1')?.packageId).toBe('my-custom-srd-name')
    expect(findLatestPublishedPack(publishedPacks, 'xdmg')?.packageId).toBe('eldra.content.xdmg')
  })

  it('returns null when no pack has ever been published for this Content Source -- a genuine "not yet published"', () => {
    const publishedPacks: RefreshMatchCandidate[] = [
      { packageId: 'eldra.solaris.xphb', version: '1.0.0', origin: { adapterId: '5etools-json', sourceId: 'xphb' } }
    ]

    expect(findLatestPublishedPack(publishedPacks, 'xdmg')).toBeNull()
    expect(findLatestPublishedPack([], 'xphb')).toBeNull()
  })

  it('returns null when no collectionKey is selected yet', () => {
    const publishedPacks: RefreshMatchCandidate[] = [
      { packageId: 'eldra.solaris.xphb', version: '1.0.0', origin: { adapterId: '5etools-json', sourceId: 'xphb' } }
    ]

    expect(findLatestPublishedPack(publishedPacks, undefined)).toBeNull()
    expect(findLatestPublishedPack(publishedPacks, null)).toBeNull()
    expect(findLatestPublishedPack(publishedPacks, '')).toBeNull()
  })

  it('ignores packs with no origin (published before origin tracking existed) rather than crashing', () => {
    const publishedPacks: RefreshMatchCandidate[] = [
      { packageId: 'eldra.solaris.xphb', version: '1.0.0', origin: null },
      { packageId: 'eldra.solaris.xphb', version: '1.0.4', origin: { adapterId: '5etools-json', sourceId: 'xphb' } }
    ]

    const result = findLatestPublishedPack(publishedPacks, 'xphb')
    expect(result!.version).toBe('1.0.4')
  })

  it('never matches on the old packageId===suggestedPackageId comparison the fix replaced', () => {
    // Even if a pack happens to share a packageId with what the registry
    // would have suggested, matching must go through origin.sourceId, not
    // packageId -- this guards against silently reintroducing the old
    // comparison as a "shortcut."
    const publishedPacks: RefreshMatchCandidate[] = [
      { packageId: 'eldra.content.xphb', version: '9.9.9', origin: { adapterId: '5etools-json', sourceId: 'some-other-source' } }
    ]

    expect(findLatestPublishedPack(publishedPacks, 'xphb')).toBeNull()
  })
})
