// Character Creator V3 -- Complete Option-Description Coverage.
//
// This is the coverage test the task explicitly asked for: it derives the authoritative
// inventory of every Definition id offered by an Identity/Class-stage ChoiceSet DIRECTLY from
// the real Rules Package facet corpus (DND5E_2024_RULES_FACETS, app/lib/content-rules/
// dnd5e-2024.ts) -- never hand-typed/guessed -- then compares it against what the real xphbProvider
// (server/utils/content-sources/dnd5e/xphb.ts) actually publishes for the 'feature-options'
// category. Every id must land in exactly one of: COVERED (a real `featureOption` candidate
// publishes it), or DOCUMENTED NON-GAP (a literal value pick with no corpus prose beyond its own
// name -- choice:species.size, choice:species.innate-spellcasting-ability). Nothing may be
// silently ignored -- an id in neither bucket fails this test.
//
// "Identity/Class stage" is itself derived from the real predicate the Creator UI uses
// (isSpeciesIdentityChoiceSet/isClassIdentityChoiceSet, characterBuilderSelection.ts), not
// retyped here: any ChoiceSet id starting with `choice:species.` or `choice:class.`.
//
// `choice:class.weapon-mastery`/`.melee-only` also start with `choice:class.` but are
// deliberately excluded from this inventory: they are CONTENT-backed (contentCategory: 'items'
// in the choiceSets registry), so creationChoicePresentation's own contentSelectorOf exclusion
// removes them from the Identity/Class picker path entirely before isClassIdentityChoiceSet ever
// sees them -- their options are real Content Pack Items, not Rules Definitions, so they have no
// `definitionId` to join against and are out of scope for this phase's join mechanism.

import { describe, expect, it } from 'vitest'
import { DND5E_2024_RULES_FACETS } from '../../../app/lib/content-rules/dnd5e-2024'
import { isClassIdentityChoiceSet, isSpeciesIdentityChoiceSet } from '../../../app/components/characters/builder/characterBuilderSelection'
import { xphbProvider } from '../../../server/utils/content-sources/dnd5e/xphb'

// Literal value picks offered by a real Identity-stage ChoiceSet whose options have no corpus
// prose beyond the option's own name (races.json never narrates "Medium" or "Intelligence"
// separately from the size/ability table-cell that already supplies the picker's own label) --
// a documented non-gap, not a silent omission. See the final report for the full reasoning.
const DOCUMENTED_NON_GAP_CHOICE_SETS = new Set(['choice:species.size', 'choice:species.innate-spellcasting-ability'])

// `choice:class.weapon-mastery`/`.melee-only` also start with `choice:class.` but declare NO
// `from` at all (verified directly: their options are resolved through the choiceSets registry's
// own `contentCategory: 'items'`, a CONTENT-backed choice, never a literal Definition-id list) --
// filtered out here by that real, structural fact (an empty id set), not by name, so this stays
// correct if a future `choice:class.*`/`choice:species.*` ChoiceSet is added with the same shape.
function collectIdentityChoiceSetIds(): Map<string, Set<string>> {
  const idsByChoiceSet = new Map<string, Set<string>>()

  for (const category of Object.values(DND5E_2024_RULES_FACETS)) {
    for (const facet of Object.values(category)) {
      for (const choice of facet.choices ?? []) {
        if (!isSpeciesIdentityChoiceSet(choice.choiceSet) && !isClassIdentityChoiceSet(choice.choiceSet)) continue
        if (!choice.from?.length) continue
        const set = idsByChoiceSet.get(choice.choiceSet) ?? new Set<string>()
        for (const id of choice.from) set.add(id)
        idsByChoiceSet.set(choice.choiceSet, set)
      }
    }
  }

  return idsByChoiceSet
}

describe('Identity/Class option inventory, derived from the real facet corpus', () => {
  it('matches the known, programmatically-derived shape -- fails loudly if the corpus changes under this test', () => {
    const idsByChoiceSet = collectIdentityChoiceSetIds()
    const summary = Object.fromEntries([...idsByChoiceSet.entries()].map(([id, set]) => [id, [...set].sort()]))

    expect(summary).toEqual({
      'choice:species.size': ['value:size.medium', 'value:size.small'],
      'choice:species.feature-option': [
        'source:draconic-ancestry.black', 'source:draconic-ancestry.blue', 'source:draconic-ancestry.brass',
        'source:draconic-ancestry.bronze', 'source:draconic-ancestry.copper', 'source:draconic-ancestry.gold',
        'source:draconic-ancestry.green', 'source:draconic-ancestry.red', 'source:draconic-ancestry.silver',
        'source:draconic-ancestry.white',
        'source:elven-lineage.drow', 'source:elven-lineage.high', 'source:elven-lineage.wood',
        'source:fiendish-legacy.abyssal', 'source:fiendish-legacy.chthonic', 'source:fiendish-legacy.infernal',
        'source:giant-ancestry.clouds-jaunt', 'source:giant-ancestry.fires-burn', 'source:giant-ancestry.frosts-chill',
        'source:giant-ancestry.hills-tumble', 'source:giant-ancestry.stones-endurance', 'source:giant-ancestry.storms-thunder',
        'source:gnomish-lineage.forest-gnome', 'source:gnomish-lineage.rock-gnome'
      ],
      'choice:species.innate-spellcasting-ability': [
        'value:innate-spellcasting.ability.cha', 'value:innate-spellcasting.ability.int', 'value:innate-spellcasting.ability.wis'
      ],
      'choice:class.feature-option': [
        'source:divine-order.protector', 'source:divine-order.thaumaturge',
        'source:primal-order.magician', 'source:primal-order.warden'
      ],
      'choice:class.accumulating-option': [
        'value:invocation.armor_of_shadows.known', 'value:invocation.eldritch_mind.known',
        'value:invocation.pact_of_the_blade.known', 'value:invocation.pact_of_the_chain.known',
        'value:invocation.pact_of_the_tome.known'
      ]
    })
  })

  it('every offered Definition id is either covered by a real featureOption candidate, or an explicitly documented non-gap -- none silently ignored', async () => {
    const idsByChoiceSet = collectIdentityChoiceSetIds()
    const allOfferedIds = new Set<string>()
    for (const [choiceSetId, ids] of idsByChoiceSet) {
      if (DOCUMENTED_NON_GAP_CHOICE_SETS.has(choiceSetId)) continue
      for (const id of ids) allOfferedIds.add(id)
    }

    const result = await xphbProvider.loadCategory('feature-options')
    const publishedIds = new Set(result.candidates.map((candidate: any) => candidate.definitionId).filter(Boolean))

    const uncovered = [...allOfferedIds].filter((id) => !publishedIds.has(id))
    expect(uncovered, `uncovered Definition ids (no featureOption candidate publishes a description): ${uncovered.join(', ')}`).toEqual([])

    // The inverse must also hold -- every published candidate's definitionId must correspond to a
    // REAL offered option, never a stale/orphaned id nothing in the corpus actually offers.
    const orphaned = [...publishedIds].filter((id) => !allOfferedIds.has(id))
    expect(orphaned, `published candidates whose definitionId no Identity/Class ChoiceSet actually offers: ${orphaned.join(', ')}`).toEqual([])
  })

  it('choice:class.weapon-mastery/.melee-only are real choice:class.* ChoiceSets but are content-backed, not Definition-id choices -- correctly excluded from this inventory', () => {
    const idsByChoiceSet = collectIdentityChoiceSetIds()
    expect(idsByChoiceSet.has('choice:class.weapon-mastery')).toBe(false)
    expect(idsByChoiceSet.has('choice:class.weapon-mastery.melee-only')).toBe(false)

    // Confirm this is because the corpus declares no `from` for either -- not because the test's
    // own filter is hiding a real inventory this phase forgot to cover.
    let weaponMasteryHasNoFrom = false
    for (const category of Object.values(DND5E_2024_RULES_FACETS)) {
      for (const facet of Object.values(category)) {
        for (const choice of facet.choices ?? []) {
          if (choice.choiceSet.startsWith('choice:class.weapon-mastery')) {
            weaponMasteryHasNoFrom = true
            expect(choice.from ?? []).toEqual([])
          }
        }
      }
    }
    expect(weaponMasteryHasNoFrom).toBe(true)
  })

  it('documents exactly which ChoiceSets are intentionally left without a Feature Option entry, and why', () => {
    const idsByChoiceSet = collectIdentityChoiceSetIds()
    for (const choiceSetId of DOCUMENTED_NON_GAP_CHOICE_SETS) {
      expect(idsByChoiceSet.has(choiceSetId), `expected ${choiceSetId} to still be a real Identity-stage ChoiceSet`).toBe(true)
    }
    // Every id in DOCUMENTED_NON_GAP_CHOICE_SETS's own sets is a bare `value:*.<literal>` Value id
    // (size/ability), never a `source:*` id -- confirming by shape, not just by name, that these
    // really are literal picks and not a feature-option family that slipped through unaudited.
    for (const choiceSetId of DOCUMENTED_NON_GAP_CHOICE_SETS) {
      for (const id of idsByChoiceSet.get(choiceSetId) ?? []) {
        expect(id.startsWith('value:')).toBe(true)
      }
    }
  })
})
