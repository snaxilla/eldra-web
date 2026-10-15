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
  // PURE-AUTHORING SPECIES SWEEP -- Elf's own lineage choice is now representable; Tiefling
  // replaced it last phase. TIEFLING SPECIES COMPLETION -- Tiefling itself is now REMOVED too
  // (all 3 of its own decisions -- legacy, resistance, size -- are implemented). Human replaces
  // it as the one species still genuinely unavailable (its own FIRST unresolved decision is the
  // free Origin feat choice).
  it('a species whose own decision Eldra cannot record is unavailable; Dwarf (no decisions) is not', () => {
    const [human, dwarf] = withCreationBlockers([entry('human-xphb', 'Human'), entry('dwarf-xphb', 'Dwarf')], 'species')
    expect(human!.rulesFacet?.creationUnavailable).toMatch(/^Requires a feat choice/)
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
  // AASIMAR CREATION COMPLETION PHASE -- Aasimar is REMOVED from this list too: it is now
  // creation-complete alone (size-choice + spell-grant both implemented, 0 unresolved). Tiefling
  // replaced it last phase; PURE-AUTHORING SPECIES SWEEP removed Elf. TIEFLING SPECIES COMPLETION
  // -- Tiefling itself is now REMOVED too (all 3 of its own decisions are implemented, 0
  // unresolved alone). Human is the ONLY species, class, or background left anywhere in this
  // codebase that still owns an unrecordable decision at all (Classes 12/12, Backgrounds 16/16,
  // Species 9/10) -- the only remaining example across all three `ownCreationBlocker` kinds.
  it('no reason ever exposes an internal identifier', () => {
    const blocker = ownCreationBlocker('species', 'human-xphb')
    expect(blocker).not.toBeNull()
    expect(blockerReason(blocker!)).not.toMatch(INTERNAL)
  })
})

describe('fail-closed presentation -- the Create gate names the same blockers', () => {
  // PURE-AUTHORING SPECIES SWEEP -- Elf's own lineage choice is now representable; Human replaces
  // it (still blocked, its own FIRST unresolved decision being the free Origin-feat choice).
  it('a selected species that owns an unrecordable decision is named, and nothing else is', () => {
    const draft = { ...emptyDraft(), species: entry('human-xphb', 'Human') }
    const messages = creationBlockerMessages(draft)
    expect(messages).toEqual([expect.stringMatching(/^Species cannot be completed yet\. Requires a feat choice\.$/)])
  })

  it('an empty draft has no blocker messages (blockers are about chosen content only)', () => {
    expect(creationBlockerMessages(emptyDraft())).toEqual([])
  })
})
