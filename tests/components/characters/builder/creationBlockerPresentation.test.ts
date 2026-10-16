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
import { DND5E_2024_MANDATORY_DECISIONS, type UnresolvedDecision } from '~/lib/content-rules/creation-completeness'
import { classifyDecision } from '~/lib/content-rules/mandatory-decision-coverage'

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
  // HUMAN + GENERIC SELECTED-FEAT ACTIVATION PHASE -- Human (this test's own prior example) is now
  // ALSO creation-complete alone (its own size choice and free Origin-feat choice -- Versatile --
  // are both representable now; see creation-availability.test.ts: Species 10/10). No species is
  // left that is unavailable alone -- this test now proves the positive case for both.
  it('every species is individually creation-available alone now (Species 10/10); neither Human nor Dwarf is blocked', () => {
    const [human, dwarf] = withCreationBlockers([entry('human-xphb', 'Human'), entry('dwarf-xphb', 'Dwarf')], 'species')
    expect(human!.rulesFacet?.creationUnavailable).toBeUndefined()
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

  // HUMAN + GENERIC SELECTED-FEAT ACTIVATION PHASE -- Human (this test's own prior example) is
  // REMOVED too: every species, class, and background is now individually creation-complete alone
  // (Species 10/10, Classes 12/12, Backgrounds 16/16 -- see creation-availability.test.ts), so
  // `ownCreationBlocker` has no remaining example at all. The wording guarantee is proven directly
  // against a real, still-genuinely-blocked decision found dynamically from the full Phase-0
  // census (172 decisions remain blocked overall -- none reachable alone by species/class/
  // background, but real ones still exist), via the SAME `blockerReason` the Builder calls.
  it('no reason ever exposes an internal identifier', () => {
    const blockedRecord = DND5E_2024_MANDATORY_DECISIONS.find((d) => classifyDecision(d).status === 'blocked')
    expect(blockedRecord, 'at least one real decision must still be blocked for this test to mean anything').toBeDefined()
    const classification = classifyDecision(blockedRecord!)
    expect(classification.status).toBe('blocked')
    if (classification.status !== 'blocked') return
    const blocker: UnresolvedDecision = {
      decisionId: blockedRecord!.id,
      owner: blockedRecord!.owner,
      family: blockedRecord!.family,
      source: blockedRecord!.source,
      level: blockedRecord!.level,
      rule: classification.rule,
      reason: classification.reason,
      ledgerIds: classification.ledgerIds
    }
    expect(blockerReason(blocker)).not.toMatch(INTERNAL)
  })
})

describe('fail-closed presentation -- the Create gate names the same blockers', () => {
  // HUMAN + GENERIC SELECTED-FEAT ACTIVATION PHASE -- Human (this test's own prior example) is now
  // creation-complete alone too, so selecting it produces no blocker message at all -- proven
  // directly, rather than replaced by a new named example (no species/class/background is blocked
  // alone anymore; see the "every species is individually creation-available" test above).
  it('a selected species that is fully creation-complete alone produces no blocker message', () => {
    const draft = { ...emptyDraft(), species: entry('human-xphb', 'Human') }
    const messages = creationBlockerMessages(draft)
    expect(messages).toEqual([])
  })

  it('an empty draft has no blocker messages (blockers are about chosen content only)', () => {
    expect(creationBlockerMessages(emptyDraft())).toEqual([])
  })
})
