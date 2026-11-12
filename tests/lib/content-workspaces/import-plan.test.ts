// Workspace import planning -- Content Workspaces & Studio Phase 3.
//
// The planner decides what an import WOULD do. Its job is to be
// conservative: anything it cannot justify from declared identity or
// recorded provenance comes back unresolved rather than merged.

import { describe, expect, it } from 'vitest'

import { mintContentEntityId } from '../../../app/lib/content-identity'
import {
  countImportPlan,
  planWorkspaceImport,
  sourceEntryKey,
  type ExistingEntity,
  type ImportSourceLineage,
  type IncomingEntry
} from '../../../app/lib/content-workspaces/import-plan'

const XPHB: ImportSourceLineage = { kind: 'release', packageId: 'eldra.solaris.xphb' }
const PROVIDER: ImportSourceLineage = { kind: 'provider', gameSystemKey: 'dnd5e', collectionKey: 'xphb' }

function incoming(overrides: Partial<IncomingEntry> = {}): IncomingEntry {
  return {
    systemKey: 'dnd5e',
    entityType: 'item',
    slug: 'shortsword-xphb',
    title: 'Shortsword',
    externalId: 'Shortsword__XPHB',
    baseDataHash: 'sha256-aaa',
    baseSourceRef: { provider: '5etools', externalId: 'Shortsword__XPHB', packageId: 'eldra.solaris.xphb', version: '1.0.38' },
    ...overrides
  }
}

function existing(overrides: Partial<ExistingEntity> = {}): ExistingEntity {
  return {
    contentEntityId: mintContentEntityId(),
    systemKey: 'dnd5e',
    entityType: 'item',
    slug: 'shortsword-xphb',
    title: 'Shortsword',
    sourceKey: sourceEntryKey(XPHB, 'dnd5e', 'item', 'shortsword-xphb'),
    baseDataHash: 'sha256-aaa',
    ...overrides
  }
}

function plan(entries: IncomingEntry[], held: ExistingEntity[] = [], lineage = XPHB) {
  return planWorkspaceImport({ workspace: { systemKey: 'dnd5e' }, lineage, incoming: entries, existing: held })
}

describe('first import', () => {
  it('adds every entry, with no id until one is minted at execution time', () => {
    const result = plan([incoming()])
    expect(countImportPlan(result)).toMatchObject({ added: 1, unchanged: 0, changedNeedsReview: 0, unresolved: 0 })
    expect(result.additions[0]).toMatchObject({ slug: 'shortsword-xphb', contentEntityId: null })
  })

  it('PRESERVES a contentEntityId the source already carries instead of minting a new one', () => {
    const carried = mintContentEntityId()
    expect(plan([incoming({ contentEntityId: carried })]).additions[0]!.contentEntityId).toBe(carried)
  })
})

describe('repeated import', () => {
  it('is idempotent -- identical input changes nothing', () => {
    const result = plan([incoming()], [existing()])
    expect(countImportPlan(result)).toMatchObject({ added: 0, unchanged: 1, changedNeedsReview: 0, unresolved: 0 })
  })

  it('matches on the recorded source address, so a re-import never duplicates the entity', () => {
    const held = existing()
    const result = plan([incoming()], [held])
    expect(result.additions).toHaveLength(0)
    expect(result.unchanged[0]!.contentEntityId).toBe(held.contentEntityId)
  })

  it('matches on a carried contentEntityId even when the upstream slug moved', () => {
    const id = mintContentEntityId()
    const held = existing({ contentEntityId: id, slug: 'shortsword-xphb' })
    const result = plan([incoming({ contentEntityId: id, slug: 'short-sword-xphb', baseDataHash: 'sha256-bbb' })], [held])
    expect(result.changed).toHaveLength(1)
    expect(result.changed[0]).toMatchObject({ contentEntityId: id, upstreamSlugChanged: true })
  })

  it('a second import of a release a workspace already holds adds nothing new', () => {
    const held = [existing(), existing({ slug: 'longsword-xphb', title: 'Longsword', sourceKey: sourceEntryKey(XPHB, 'dnd5e', 'item', 'longsword-xphb'), baseDataHash: 'sha256-bbb' })]
    const entries = [incoming(), incoming({ slug: 'longsword-xphb', title: 'Longsword', baseDataHash: 'sha256-bbb' })]
    expect(countImportPlan(plan(entries, held))).toMatchObject({ added: 0, unchanged: 2, changedNeedsReview: 0 })
  })
})

describe('changed upstream content', () => {
  it('is reported as NEEDING REVIEW, never accepted silently', () => {
    const result = plan([incoming({ baseDataHash: 'sha256-zzz' })], [existing({ baseDataHash: 'sha256-aaa' })])
    expect(countImportPlan(result)).toMatchObject({ added: 0, unchanged: 0, changedNeedsReview: 1 })
    expect(result.changed[0]).toMatchObject({ previousBaseDataHash: 'sha256-aaa', incomingBaseDataHash: 'sha256-zzz' })
  })

  it('carries both hashes so the later three-way comparison has a before and an after', () => {
    const change = plan([incoming({ baseDataHash: 'sha256-new' })], [existing({ baseDataHash: 'sha256-old' })]).changed[0]!
    expect(change.previousBaseDataHash).not.toBe(change.incomingBaseDataHash)
  })
})

describe('entries that must stay unresolved', () => {
  it('a different package offering the same slug does not collapse onto a held entity', () => {
    // The workspace holds Alice's dragon-blade. Bob's pack offers one too.
    const held = existing({ slug: 'dragon-blade', title: 'Dragon Blade', sourceKey: sourceEntryKey({ kind: 'release', packageId: 'homebrew.alice.blades' }, 'dnd5e', 'item', 'dragon-blade') })
    const result = plan([incoming({ slug: 'dragon-blade', title: 'Dragon Blade' })], [held], { kind: 'release', packageId: 'homebrew.bob.blades' })
    expect(result.additions).toHaveLength(0)
    expect(result.unresolved[0]).toMatchObject({ reason: 'address-conflict' })
    expect(result.unresolved[0]!.detail).toContain('not evidence')
  })

  it('a suspected rename with no identity evidence is NOT merged by title similarity', () => {
    const held = existing({ slug: 'shortsword-xphb', title: 'Shortsword' })
    const result = plan([incoming({ slug: 'short-sword-xphb', title: 'Shortsword' })], [held])
    // The new address is simply a new entity; the old one is reported as
    // no longer offered. Nothing guesses they are the same.
    expect(result.additions).toHaveLength(1)
    expect(result.absentUpstream).toHaveLength(1)
    expect(result.changed).toHaveLength(0)
  })

  it('refuses two source entries claiming one address', () => {
    const result = plan([incoming(), incoming({ title: 'Shortsword (reprint)' })])
    expect(result.unresolved).toHaveLength(2)
    expect(result.unresolved.every((entry) => entry.reason === 'duplicate-in-source')).toBe(true)
    expect(result.additions).toHaveLength(0)
  })

  it('refuses two source entries claiming one contentEntityId', () => {
    const id = mintContentEntityId()
    const result = plan([incoming({ contentEntityId: id }), incoming({ contentEntityId: id, slug: 'other-item' })])
    expect(result.unresolved.some((entry) => entry.reason === 'contradictory-provenance')).toBe(true)
  })

  it('refuses an entry whose carried id and source address point at two different held entities', () => {
    const other = existing({ slug: 'longsword-xphb', title: 'Longsword', sourceKey: sourceEntryKey(XPHB, 'dnd5e', 'item', 'longsword-xphb') })
    const held = existing()
    const result = plan([incoming({ contentEntityId: other.contentEntityId })], [held, other])
    expect(result.unresolved[0]).toMatchObject({ reason: 'contradictory-provenance' })
  })

  it('refuses an entry whose source address was previously imported under another id', () => {
    const held = existing()
    const result = plan([incoming({ contentEntityId: mintContentEntityId() })], [held])
    expect(result.unresolved[0]).toMatchObject({ reason: 'contradictory-provenance' })
  })

  it('refuses a carried id that belongs to an entity imported from a different source', () => {
    const held = existing({ sourceKey: sourceEntryKey(PROVIDER, 'dnd5e', 'item', 'shortsword-xphb') })
    const result = plan([incoming({ contentEntityId: held.contentEntityId })], [held])
    expect(result.unresolved[0]).toMatchObject({ reason: 'contradictory-provenance' })
  })

  it('refuses malformed identity rather than minting over it', () => {
    expect(plan([incoming({ contentEntityId: 'nonsense' })]).unresolved[0]).toMatchObject({ reason: 'malformed-identity' })
  })

  it('refuses an incomplete candidate', () => {
    expect(plan([incoming({ externalId: '' })]).unresolved[0]).toMatchObject({ reason: 'invalid-candidate' })
    expect(plan([incoming({ title: '  ' })]).unresolved[0]).toMatchObject({ reason: 'invalid-candidate' })
  })

  it('refuses content for another game system', () => {
    const result = plan([incoming({ systemKey: 'pf2e' })])
    expect(result.unresolved[0]).toMatchObject({ reason: 'system-mismatch' })
    expect(result.unresolved[0]!.detail).toContain("'pf2e'")
  })
})

describe('entries the source no longer offers', () => {
  it('reports them without deleting anything', () => {
    const held = [existing(), existing({ slug: 'retired-item', title: 'Retired', sourceKey: sourceEntryKey(XPHB, 'dnd5e', 'item', 'retired-item') })]
    const result = plan([incoming()], held)
    expect(result.absentUpstream).toHaveLength(1)
    expect(result.absentUpstream[0]!.slug).toBe('retired-item')
  })

  it('only considers entity types this import actually covered', () => {
    // Importing only items must not report every spell as missing.
    const held = [existing(), existing({ entityType: 'spell', slug: 'fireball-xphb', title: 'Fireball', sourceKey: sourceEntryKey(XPHB, 'dnd5e', 'spell', 'fireball-xphb') })]
    expect(plan([incoming()], held).absentUpstream).toHaveLength(0)
  })

  it('only considers entities from THIS source lineage', () => {
    const held = [existing({ sourceKey: sourceEntryKey({ kind: 'release', packageId: 'other.pack' }, 'dnd5e', 'item', 'other-item'), slug: 'other-item', title: 'Other' })]
    expect(plan([incoming()], held).absentUpstream).toHaveLength(0)
  })

  it('never considers authored entities, which have no upstream at all', () => {
    const held = [existing({ sourceKey: null, slug: 'my-homebrew-blade', title: 'My Blade' })]
    expect(plan([incoming()], held).absentUpstream).toHaveLength(0)
  })
})

describe('determinism', () => {
  it('orders every bucket stably regardless of input order', () => {
    const entries = [
      incoming({ slug: 'zzz-item', title: 'Zed' }),
      incoming({ slug: 'aaa-item', title: 'Aaron' }),
      incoming({ slug: 'mmm-item', title: 'Mike' })
    ]
    const forward = plan(entries).additions.map((addition) => addition.slug)
    const reversed = plan([...entries].reverse()).additions.map((addition) => addition.slug)
    expect(forward).toEqual(reversed)
  })

  it('keeps each addition pointing at its own source entry after sorting', () => {
    const entries = [incoming({ slug: 'zzz-item', title: 'Zed', baseDataHash: 'sha256-z' }), incoming({ slug: 'aaa-item', title: 'Aaron', baseDataHash: 'sha256-a' })]
    for (const addition of plan(entries).additions) {
      expect(addition.baseDataHash).toBe(entries[addition.index]!.baseDataHash)
    }
  })
})
