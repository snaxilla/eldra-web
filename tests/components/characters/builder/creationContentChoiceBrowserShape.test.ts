// PHASE 2C.2B -- Builder regression through the representation the V2 Builder
// actually receives. The content selector comes from the REAL registry (the same
// declaration the choice-options endpoint echoes), the species/class/background
// facets are the real content facets, and the feat entries are real corpus shapes
// with their real feat mechanics. Nothing here is hand-built to match the answer.
//
// The earlier Builder false-green (Phase 2B) came from testing a shape the browser
// never received. Every assertion below goes through the Builder selection module
// the page calls, with the context the page builds.

import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { createWorldRuntime } from '../../../../app/lib/rules/world-runtime'
import { parseExpression } from '../../../../app/lib/rules/parser'
import type { Definition, RulesPackageManifest } from '../../../../app/lib/rules/types'
import { findRulesFacet } from '../../../../app/lib/content-rules'
import { resolveDnd5eFeatMechanics } from '../../../../app/lib/feat-mechanics/dnd5e'
import { serializeContentRef } from '../../../../app/lib/characters/progression-plan'
import {
  creationContentPresentation,
  emptyDraft,
  effectiveContentChoices,
  missingRequirements,
  pruneChoices,
  setContentChoiceSelections,
  toCreatePayload,
  type BuilderCatalogueEntry,
  type BuilderCreationContext,
  type CharacterBuilderDraft
} from '../../../../app/components/characters/builder/characterBuilderSelection'
import xphbFeats from '../../../lib/feat-mechanics/fixtures/xphb-feats.json'

const PACKAGE_DIR = 'packages/eldra-dnd5e-2024'
const CONTENT_PACKAGE = 'eldra.solaris.xphb'
const FS_ONLY_CHOICE = 'choice:feat.fighting-style.fs-only'
const FS_ONLY_KEY = 'class:progression:1:choice:feat.fighting-style.fs-only'

function hydrate(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(hydrate)
  if (node && typeof node === 'object') {
    const record = node as Record<string, unknown>
    if (typeof record.text === 'string' && !record.ast) {
      const parsed = parseExpression(record.text)
      if (!parsed.ok) throw new Error(`Failed to parse: ${record.text}`)
      return { text: record.text, ast: parsed.ast }
    }
    return Object.fromEntries(Object.entries(record).map(([k, v]) => [k, hydrate(v)]))
  }
  return node
}

// The real registry, built the way the World runtime builds it.
const registry = (() => {
  const manifest = JSON.parse(readFileSync(`${PACKAGE_DIR}/manifest.json`, 'utf8')) as RulesPackageManifest
  const definitions = hydrate(JSON.parse(readFileSync(`${PACKAGE_DIR}/definitions.json`, 'utf8'))) as Definition[]
  const result = createWorldRuntime(manifest, definitions, '5', null)
  if (!result.ok) throw new Error(`runtime build failed: ${result.stage}`)
  return result.runtimePackage.registry
})()

// What GET /api/worlds/:id/rules/choice-options echoes for a content-backed set.
function selectorOfChoice(choiceSetId: string) {
  const definition = registry.getById(choiceSetId)
  if (!definition || definition.kind !== 'choiceSet' || definition.from.kind !== 'fromContentCatalogue') return null
  return { category: definition.from.category, filter: definition.from.filter }
}

const slugOf = (name: string) => `${name.toLowerCase().replace(/ /g, '-')}-xphb`
const FEATS = xphbFeats.feats.map((raw) => ({
  packageId: CONTENT_PACKAGE,
  slug: slugOf(raw.name),
  title: raw.name,
  featMechanics: resolveDnd5eFeatMechanics(raw),
  rulesFacet: findRulesFacet('dnd5e.2024', 'feat', slugOf(raw.name)) ?? undefined
}))

const CONTEXT: BuilderCreationContext = { contentSelectorOf: selectorOfChoice, feats: FEATS }

function catalogueEntry(title: string, slug: string, kind: 'species' | 'class' | 'background' | 'feat'): BuilderCatalogueEntry {
  const rulesFacet = findRulesFacet('dnd5e.2024', kind, slug) ?? undefined
  return {
    packageId: CONTENT_PACKAGE, packageVersion: '1.0.10', systemKey: 'dnd5e',
    title, slug, externalId: `${title}__XPHB`, provider: '5etools-json', rulesFacet
  } as unknown as BuilderCatalogueEntry
}

const FIGHTER = catalogueEntry('Fighter', 'fighter-xphb', 'class')
const WIZARD = catalogueEntry('Wizard', 'wizard-xphb', 'class')
const HUMAN = catalogueEntry('Human', 'human-xphb', 'species')
const SAGE = catalogueEntry('Sage', 'sage-xphb', 'background')

function fighterDraft(): CharacterBuilderDraft {
  return { ...emptyDraft(), species: HUMAN, class: FIGHTER, background: SAGE }
}

const corpusFs = xphbFeats.feats.filter((raw) => raw.category === 'FS').map((raw) => slugOf(raw.name)).sort()
const archery = serializeContentRef({ packageId: CONTENT_PACKAGE, slug: 'archery-xphb' })

function fightingStylePresentation(draft: CharacterBuilderDraft) {
  return creationContentPresentation(draft, CONTEXT).find((presentation) => presentation.key === FS_ONLY_KEY)
}

describe('Fighter selected -- the Fighting Style presentation the Builder receives', () => {
  it('the Fighter\'s declared choice is a content choice presented under its progression key', () => {
    const presentation = fightingStylePresentation(fighterDraft())
    expect(presentation).toBeDefined()
    expect(presentation!.choiceSetId).toBe(FS_ONLY_CHOICE)
    // Routing destination (feats) and the package's own semantic filter are separate.
    expect(presentation!.category).toBe('feats')
    expect(presentation!.filter).toEqual({ category: 'fighting-style', variants: ['FS'] })
    expect(presentation!.count).toBe(1)
  })

  it('exactly the 10 ordinary FS feats are offered and eligible (derived from the corpus, not a name list)', () => {
    const offeredEligible = fightingStylePresentation(fighterDraft())!.offered
      .filter((option) => option.eligible).map((option) => option.slug).sort()
    expect(offeredEligible).toEqual(corpusFs)
    expect(offeredEligible).toHaveLength(10)
  })

  it('Blessed, Druidic, General, Origin, and Epic Boon feats are not offered at all', () => {
    const offered = fightingStylePresentation(fighterDraft())!.offered.map((option) => option.slug)
    for (const slug of ['blessed-warrior-xphb', 'druidic-warrior-xphb', 'athlete-xphb', 'alert-xphb', 'boon-of-fortitude-xphb']) {
      expect(offered, slug).not.toContain(slug)
    }
  })

  it('the offered options carry real catalogue titles for the picker', () => {
    const archeryOption = fightingStylePresentation(fighterDraft())!.offered.find((option) => option.ref === archery)
    expect(archeryOption).toMatchObject({ title: 'Archery', eligible: true })
  })
})

describe('validity -- a legal selection satisfies the Builder; an illegal one does not', () => {
  it('Fighter with no Fighting Style is invalid, and the requirement is listed', () => {
    const draft = fighterDraft()
    expect(fightingStylePresentation(draft)!.valid).toBe(false)
    expect(missingRequirements(draft, CONTEXT).some((line) => line.startsWith('Class: choose 1'))).toBe(true)
  })

  it('a legal ordinary style satisfies the requirement', () => {
    const draft = fighterDraft()
    setContentChoiceSelections(draft, FS_ONLY_KEY, [archery], CONTEXT)
    expect(fightingStylePresentation(draft)!.valid).toBe(true)
    expect(missingRequirements(draft, CONTEXT).some((line) => line.startsWith('Class: choose 1'))).toBe(false)
  })

  it('an illegal wrong-variant (Druidic) answer does NOT satisfy the requirement and is not kept', () => {
    const draft = fighterDraft()
    setContentChoiceSelections(draft, FS_ONLY_KEY, [serializeContentRef({ packageId: CONTENT_PACKAGE, slug: 'druidic-warrior-xphb' })], CONTEXT)
    expect(fightingStylePresentation(draft)!.selected).toEqual([])
    expect(fightingStylePresentation(draft)!.valid).toBe(false)
  })

  it('an illegal General feat answer does NOT satisfy the requirement', () => {
    const draft = fighterDraft()
    setContentChoiceSelections(draft, FS_ONLY_KEY, [serializeContentRef({ packageId: CONTENT_PACKAGE, slug: 'athlete-xphb' })], CONTEXT)
    expect(fightingStylePresentation(draft)!.valid).toBe(false)
  })
})

describe('class switching -- the Fighter requirement and its answer never leak', () => {
  it('switching away from Fighter removes the requirement from the effective submission', () => {
    const draft = fighterDraft()
    setContentChoiceSelections(draft, FS_ONLY_KEY, [archery], CONTEXT)
    expect(effectiveContentChoices(draft, CONTEXT)).toEqual({ [FS_ONLY_KEY]: [archery] })

    draft.class = WIZARD
    pruneChoices(draft, CONTEXT)
    expect(fightingStylePresentation(draft)).toBeUndefined()
    expect(effectiveContentChoices(draft, CONTEXT)).toEqual({})
    expect(draft.contentChoices).toEqual({})
    expect(missingRequirements(draft, CONTEXT).some((line) => line.includes('choose 1 option'))).toBe(false)
  })

  it('a hidden Fighter answer is never submitted for a Wizard, even if the draft held one', () => {
    const draft = fighterDraft()
    draft.contentChoices[FS_ONLY_KEY] = [archery]
    draft.class = WIZARD
    // Submission is built from the CURRENT declarations only.
    expect(toCreatePayload({ ...draft, name: 'Brenna', abilities: draft.abilities }, CONTEXT)).toBeNull()
    expect(effectiveContentChoices(draft, CONTEXT)).toEqual({})
  })

  it('switching back to Fighter re-asks the question (the prior answer was pruned, by the same convention Definition answers follow)', () => {
    const draft = fighterDraft()
    setContentChoiceSelections(draft, FS_ONLY_KEY, [archery], CONTEXT)
    draft.class = WIZARD
    pruneChoices(draft, CONTEXT)
    draft.class = FIGHTER
    pruneChoices(draft, CONTEXT)
    expect(fightingStylePresentation(draft)!.valid).toBe(false)
  })
})
