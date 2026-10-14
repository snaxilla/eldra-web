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

  // D&D 2024 Character Rules P8 -- starting equipment (Criminal's own remaining blocker as of P7)
  // is now implemented (app/lib/characters/equipment-bundle.ts), and Criminal owns no other
  // decision Eldra cannot record -- it is genuinely unavailable no longer.
  it('a background whose only remaining blocker was starting equipment is unavailable no longer', () => {
    const [criminal] = withCreationBlockers([entry('criminal-xphb', 'Criminal')], 'background')
    expect(criminal!.rulesFacet?.creationUnavailable).toBeUndefined()
  })

  // FEAT-OWNED SPELL ACQUISITION PHASE -- Acolyte no longer carries a package-authored Origin
  // reason: Magic Initiate's own spell decisions are representable now (facet:spellRequirements),
  // so no XPHB Background carries a `creationUnavailable` reason at all anymore. This test's own
  // premise is gone; the equivalent "reason is kept as written" guarantee is proven instead by the
  // species lineage-choice case above (Elf), which still carries one.

  // P7 made Artisan's ability bonus representable, same as Crafter's tool choice (P1); P8 makes
  // its starting equipment representable too. Nothing else blocks it.
  it('Artisan is no longer blocked: starting equipment was its last remaining decision', () => {
    const [artisan] = withCreationBlockers([entry('artisan-xphb', 'Artisan')], 'background')
    expect(artisan!.rulesFacet?.creationUnavailable).toBeUndefined()
  })

  // FEAT-OWNED SPELL ACQUISITION PHASE -- Acolyte/Sage are REMOVED from this list: a Background
  // selected alone (no feats array) no longer owns any unresolved decision at all, since Magic
  // Initiate's own decisions are implemented now, not blocked. Every XPHB Background now behaves
  // this way, so only the species lineage/spell-grant cases remain as "alone" examples.
  it('no reason ever exposes an internal identifier', () => {
    for (const [slug, kind] of [['elf-xphb', 'species'], ['aasimar-xphb', 'species']] as const) {
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
