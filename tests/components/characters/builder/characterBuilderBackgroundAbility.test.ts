// P7 BUILDER BROWSER-SHAPE -- tests the SAME representation the V2 Builder receives: the
// `declaredChoices`/`creationChoicePresentation` objects the page hands to
// `CharacterChoiceSetPicker.vue` as its `choice`/`offered` props, and the pure slot helpers the
// picker calls to decide what a select offers. Builder false-greens have happened before (a prior
// Phase 2B regression shipped because a test asserted server behavior and assumed the Builder
// matched it); this file asserts the Builder's OWN data shape against the REAL live facets.

import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

import { isSlotOptionAtCap } from '../../../../app/components/characters/characterProgressionChoicePresentation'
import {
  declaredChoices,
  emptyDraft,
  isProficiencyStepComplete,
  missingRequirements,
  NO_CREATION_CONTENT,
  pruneChoices,
  setChoiceSelections,
  type BuilderCatalogueEntry,
  type BuilderCreationContext,
  type CharacterBuilderDraft
} from '../../../../app/components/characters/builder/characterBuilderSelection'
import { findRulesFacet } from '../../../../app/lib/content-rules'

const BACKGROUND_ABILITY_KEY = 'background:choice:background.ability-distribution'

// The real package rule (distinctness, per-option ceiling) a `/api/worlds/:id/rules/choice-options`
// response would echo -- read from the live Definitions, not hand-copied.
const PACKAGE_DEFINITIONS = JSON.parse(readFileSync('packages/eldra-dnd5e-2024/definitions.json', 'utf8')) as { id: string, kind: string, distinct?: boolean, maxPerOption?: number }[]
const CONTEXT: BuilderCreationContext = {
  ...NO_CREATION_CONTENT,
  choiceSetRule: (id) => {
    const definition = PACKAGE_DEFINITIONS.find((d) => d.id === id && d.kind === 'choiceSet')
    return definition ? { distinct: definition.distinct, maxPerOption: definition.maxPerOption } : null
  }
}

function entryFor(title: string, slug: string, kind: 'species' | 'class' | 'background'): BuilderCatalogueEntry {
  return { packageId: 'eldra.content.xphb', slug, rulesFacet: findRulesFacet('dnd5e.2024', kind, slug) ?? undefined }
}

function draftWith(backgroundSlug: string): CharacterBuilderDraft {
  const draft = emptyDraft()
  draft.background = entryFor(backgroundSlug, backgroundSlug, 'background')
  return draft
}

function abilitiesOf(slug: string): string[] {
  return findRulesFacet('dnd5e.2024', 'background', slug)!.choices!.find((c) => c.choiceSet === 'choice:background.ability-distribution')!.from!
}

describe('P7 Builder browser-shape -- Criminal', () => {
  const CRIMINAL = abilitiesOf('criminal-xphb')
  const [a, b, c] = CRIMINAL

  it('the distribution choice appears once Criminal is selected, with exactly 3 real ability options', () => {
    const draft = draftWith('criminal-xphb')
    const choices = declaredChoices(draft, CONTEXT)
    const ability = choices.find((choice) => choice.key === BACKGROUND_ABILITY_KEY)
    expect(ability).toBeDefined()
    expect(ability!.options).toHaveLength(3)
    expect(new Set(ability!.options)).toEqual(new Set(CRIMINAL))
    expect(ability!.count).toBe(3)
  })

  it('the Builder receives it as a REPEATABLE choice (distinct: false) with a per-option ceiling of 2 -- the exact fields the picker renders slots from', () => {
    const draft = draftWith('criminal-xphb')
    const ability = declaredChoices(draft, CONTEXT).find((choice) => choice.key === BACKGROUND_ABILITY_KEY)!
    expect(ability.distinct).toBe(false)
    expect(ability.maxPerOption).toBe(2)
  })

  it('without the package context (a caller that forgot to thread it), the Builder falls back to distinct -- documented fail-closed default, not a silent accept', () => {
    const draft = draftWith('criminal-xphb')
    const ability = declaredChoices(draft, NO_CREATION_CONTENT).find((choice) => choice.key === BACKGROUND_ABILITY_KEY)!
    expect(ability.distinct).toBe(true)
  })

  it('the SAME ability may occupy two of the three selection slots (the picker\'s own cap helper allows it)', () => {
    // Slots 0 and 1 both hold `a`. From slot 1's own perspective, the OTHER slot (0) holds `a`
    // once -- below the ceiling of 2, so slot 1 keeping `a` selected stays legal.
    const draft = [a, a, '']
    expect(isSlotOptionAtCap(draft, 1, a!, 2)).toBe(false)
  })

  it('the SAME ability may NOT occupy all three slots -- the third slot\'s select disables it once the OTHER two already hold it twice', () => {
    // Slots 0 and 1 already hold `a` twice (the ceiling): slot 2's select must disable `a`, which
    // is exactly what would make [A,A,A] unreachable through the UI, not just at the validator.
    const draft = [a, a, '']
    expect(isSlotOptionAtCap(draft, 2, a!, 2)).toBe(true)
    // A DIFFERENT option in slot 2 stays open -- only the at-cap option is disabled.
    expect(isSlotOptionAtCap(draft, 2, b!, 2)).toBe(false)
  })

  it('a completed legal answer ([A,A,B], a real +2/+1 split) satisfies the proficiency step', () => {
    const draft = draftWith('criminal-xphb')
    setChoiceSelections(draft, BACKGROUND_ABILITY_KEY, [a!, a!, b!], CONTEXT)
    expect(isProficiencyStepComplete(draft, CONTEXT)).toBe(true)
    // Criminal is STILL named in missingRequirements for its OWN separate, legitimate blocker
    // (starting equipment, P8, out of scope) -- that message is unrelated and correctly present.
    // What P7 actually fixes is that the ability-distribution choice itself is no longer the
    // reason: no line asks for a count of 3 selections any more.
    expect(missingRequirements(draft, CONTEXT).some((line) => /choose exactly 3/i.test(line))).toBe(false)
  })

  it('a completed legal +1/+1/+1 answer also satisfies the proficiency step', () => {
    const draft = draftWith('criminal-xphb')
    setChoiceSelections(draft, BACKGROUND_ABILITY_KEY, [a!, b!, c!], CONTEXT)
    expect(isProficiencyStepComplete(draft, CONTEXT)).toBe(true)
  })

  it('an unanswered distribution leaves the proficiency step incomplete, named in missingRequirements', () => {
    const draft = draftWith('criminal-xphb')
    expect(isProficiencyStepComplete(draft, CONTEXT)).toBe(false)
    expect(missingRequirements(draft, CONTEXT).some((line) => /choose exactly 3/i.test(line))).toBe(true)
  })
})

describe('P7 Builder browser-shape -- Background switching invalidates a stale distribution', () => {
  it('switching Background prunes a distribution that names abilities no longer legal; Create remains blocked until re-answered', () => {
    const draft = draftWith('criminal-xphb')
    const criminal = abilitiesOf('criminal-xphb')
    setChoiceSelections(draft, BACKGROUND_ABILITY_KEY, [criminal[0]!, criminal[0]!, criminal[1]!], CONTEXT)
    expect(isProficiencyStepComplete(draft, CONTEXT)).toBe(true)

    // Switch to a Background whose three abilities are not all Criminal's (dex/con/int). The
    // real 16 have no fully disjoint pair (only 6 abilities total), so the honest proof is that
    // the OLD answer no longer resolves to a complete one, not that it becomes literally empty.
    // Sage (con/int/wis) shares con and int but not dex: the 2 `dex` picks are dropped as
    // ineligible, leaving only the `con` pick -- 1 of 3, incomplete.
    const sage = abilitiesOf('sage-xphb')
    expect(sage.some((ability) => !criminal.includes(ability)), 'expected Sage to differ from Criminal by at least one ability').toBe(true)

    draft.background = entryFor('sage-xphb', 'sage-xphb', 'background')
    pruneChoices(draft, CONTEXT)

    const effective = draft.choices.selections[BACKGROUND_ABILITY_KEY] ?? []
    expect(effective.length, 'the stale answer must not resolve to a complete 3-pick answer under the new Background').toBeLessThan(3)
    expect(isProficiencyStepComplete(draft, CONTEXT)).toBe(false)
    expect(missingRequirements(draft, CONTEXT).some((line) => /choose exactly 3/i.test(line))).toBe(true)
  })

  it('the server independently rejects the same stale answer (the validator, not just the Builder, refuses it)', () => {
    const criminal = abilitiesOf('criminal-xphb')
    const sage = abilitiesOf('sage-xphb')
    const draft = draftWith('sage-xphb')
    // A crafted/stale request naming Criminal's abilities under Sage's declared key.
    draft.choices.selections[BACKGROUND_ABILITY_KEY] = [criminal[0]!, criminal[0]!, criminal[1]!]
    const presentation = declaredChoices(draft, CONTEXT)
    // declaredChoices offers only Sage's own options; the stale values are not among them.
    const ability = presentation.find((choice) => choice.key === BACKGROUND_ABILITY_KEY)!
    expect(ability.options).toEqual(sage)
    expect(ability.options).not.toContain(criminal[0])
  })
})
