// PHASE 0 -- the Builder's presentation of fail-closed creation, UNSTUBBED. The same authority
// the server enforces decides which species, class, and background owns a decision Eldra cannot
// record. The Builder shows that as a disabled option with a plain reason, and never shows an
// internal identifier (a rule id, a status word, or a corpus field path).

import { describe, expect, it } from 'vitest'
import {
  blockerReason,
  creationBlockerMessages,
  emptyDraft,
  ownCreationBlocker,
  withCreationBlockers,
  type BuilderCatalogueEntry
} from '~/components/characters/builder/characterBuilderSelection'
import { findRulesFacet } from '~/lib/content-rules'

const entry = (slug: string, title: string): BuilderCatalogueEntry => ({
  packageId: 'eldra.solaris.xphb',
  packageVersion: '1.0.10',
  systemKey: 'dnd5e',
  title,
  slug,
  externalId: `${title}__XPHB`,
  provider: '5etools-json',
  sourceBook: 'XPHB',
  sourcePage: null,
  rulesFacet: findRulesFacet('dnd5e.2024', 'species', slug) ?? findRulesFacet('dnd5e.2024', 'class', slug) ?? findRulesFacet('dnd5e.2024', 'background', slug) ?? undefined
}) as unknown as BuilderCatalogueEntry

const INTERNAL = /ENGINE_BLOCKED|CONTENT_BLOCKED|MILESTONE|primitive|blk:|unclassified|startingEquipment|feats\.|anyFromCategory|\(ability\)|toolProficiencies/

describe('fail-closed presentation -- which entries are unavailable and why', () => {
  it('a species whose lineage choice Eldra cannot record is unavailable; Dwarf (no decisions) is not', () => {
    const [elf, dwarf] = withCreationBlockers([entry('elf-xphb', 'Elf'), entry('dwarf-xphb', 'Dwarf')], 'species')
    expect(elf!.rulesFacet?.creationUnavailable).toMatch(/^Requires a lineage or ancestry choice/)
    expect(dwarf!.rulesFacet?.creationUnavailable).toBeUndefined()
  })

  // P7: the ability score bonus is now representable; starting equipment (P8, out of scope) is
  // Criminal's remaining blocker.
  it('a background\'s remaining blocker (starting equipment) is named in plain words', () => {
    const [criminal] = withCreationBlockers([entry('criminal-xphb', 'Criminal')], 'background')
    expect(criminal!.rulesFacet?.creationUnavailable).toBe('Requires starting equipment.')
  })

  it('a package-authored Origin reason is kept as written (it already names the feat)', () => {
    const [acolyte] = withCreationBlockers([entry('acolyte-xphb', 'Acolyte')], 'background')
    expect(acolyte!.rulesFacet?.creationUnavailable).toMatch(/Origin Feat \(Magic Initiate\)/)
  })

  // P7: Artisan's ability bonus is now representable too, same as Crafter's tool choice (P1).
  // Starting equipment is its remaining blocker.
  it('Artisan is blocked by starting equipment, not by its Origin feat or ability bonus', () => {
    const [artisan] = withCreationBlockers([entry('artisan-xphb', 'Artisan')], 'background')
    expect(artisan!.rulesFacet?.creationUnavailable).toBe('Requires starting equipment.')
  })

  it('no reason ever exposes an internal identifier', () => {
    for (const [slug, kind] of [['elf-xphb', 'species'], ['aasimar-xphb', 'species'], ['criminal-xphb', 'background'], ['acolyte-xphb', 'background']] as const) {
      const blocker = ownCreationBlocker(kind, slug)
      expect(blocker, slug).not.toBeNull()
      expect(blockerReason(blocker!)).not.toMatch(INTERNAL)
    }
  })
})

describe('fail-closed presentation -- the Create gate names the same blockers', () => {
  it('a selected species that owns an unrecordable decision is named, and nothing else is', () => {
    const draft = { ...emptyDraft(), species: entry('elf-xphb', 'Elf') }
    const messages = creationBlockerMessages(draft)
    expect(messages).toEqual([expect.stringMatching(/^Species cannot be completed yet\. Requires a lineage or ancestry choice\.$/)])
  })

  it('an empty draft has no blocker messages (blockers are about chosen content only)', () => {
    expect(creationBlockerMessages(emptyDraft())).toEqual([])
  })
})
