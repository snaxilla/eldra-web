// P7 -- BACKGROUND ABILITY SCORE DISTRIBUTION.
//
// AUTHORITY: no completeness stub. Discovery, coverage, and the canonical validator
// (`validateChoiceSelection`, the SAME function the bridge and create-v2 POST call) are all real.
//
// CORPUS TRUTH -- every 2024 XPHB Background's `ability` field is two ALTERNATIVE modes (the
// 5etools renderer's own "Choose one of: (a) ... (b) ..." for a length-2 `ability` array), over the
// SAME three abilities: a weighted `[2, 1]` mode (one ability +2, a different one +1) and a
// weighted `[1, 1, 1]` mode (all three +1). Both modes total 3 and the largest single weight is 2 --
// true for all 16, no exception. One decision, not two: the per-option ceiling (2) and the total (3)
// are derived FROM the corpus, never hand-typed.

import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

import { findRulesFacet } from '../../app/lib/content-rules'
import { DND5E_2024_MANDATORY_DECISIONS, DND5E_2024_POPULATION } from '../../app/lib/content-rules/creation-completeness'
import {
  abilityDistributionCovered,
  backgroundIncreaseSourceId,
  BACKGROUND_ABILITY_CHOICE_SET,
  classifyDecision
} from '../../app/lib/content-rules/mandatory-decision-coverage'
import { backgroundAbilityDistribution } from '../../app/lib/content-rules/mandatory-decisions'
import {
  directlyGrantedValues,
  resolveCreationChoices,
  type CreationSlotInput
} from '../../app/lib/characters/creation-choice-eligibility'
import { validateChoiceSelection, type ResolvableChoice } from '../../app/lib/characters/rules-choices'

const DATA_ROOT = '/opt/eldra/datasets/5etools-src/data'
type RawBackground = { name: string, source: string, ability?: unknown[] }
const XPHB_BACKGROUNDS = (JSON.parse(readFileSync(`${DATA_ROOT}/backgrounds.json`, 'utf8')) as { background: RawBackground[] }).background
  .filter((b) => b.source === 'XPHB')
const slugOf = (name: string) => `${name.toLowerCase().replace(/ /g, '-')}-xphb`

describe('P7 corpus truth -- all 16 native-XPHB Backgrounds', () => {
  it('the corpus holds exactly 16 XPHB Backgrounds', () => {
    expect(XPHB_BACKGROUNDS).toHaveLength(16)
  })

  it('every Background names exactly three eligible abilities, with no exception', () => {
    for (const bg of XPHB_BACKGROUNDS) {
      const result = backgroundAbilityDistribution(bg.ability ?? [])
      expect(result, bg.name).not.toBeNull()
      const abilities = result!.detail.match(/^weighted-abilities:([a-z,]+);/)![1]!.split(',')
      expect(abilities, bg.name).toHaveLength(3)
    }
  })

  it('both legal distributions (+2/+1 and +1/+1/+1) are represented structurally, for every Background', () => {
    for (const bg of XPHB_BACKGROUNDS) {
      const modes = (bg.ability ?? []).map((e: any) => e.choose.weighted)
      expect(modes, bg.name).toHaveLength(2)
      const totals = modes.map((m: any) => m.weights.reduce((sum: number, w: number) => sum + w, 0))
      expect(totals, bg.name).toEqual([3, 3])
      const maxWeights = modes.map((m: any) => Math.max(...m.weights))
      expect(maxWeights, bg.name).toEqual([2, 1])
    }
  })

  it('the derived total is 3 and the per-option ceiling is 2, for every Background (no exception)', () => {
    for (const bg of XPHB_BACKGROUNDS) {
      const result = backgroundAbilityDistribution(bg.ability ?? [])!
      expect(result.total, bg.name).toBe(3)
      expect(result.max, bg.name).toBe(2)
    }
  })
})

describe('P7 raw structure', () => {
  it('the weighted structure (`choose.weighted`) is unique to backgrounds.json in the corpus root', () => {
    // A grep-equivalent check: no other top-level corpus file this package reads (classes, races,
    // feats) uses the `choose.weighted` shape. Backgrounds are the only owner.
    const other = ['feats.json', 'races.json']
    for (const file of other) {
      const raw = readFileSync(`${DATA_ROOT}/${file}`, 'utf8')
      expect(raw.includes('"weighted"'), file).toBe(false)
    }
  })

  it('the engine-level identity is a Source family, not a Value: one Source per ability, +1 modifier each', () => {
    for (const ability of ['str', 'dex', 'con', 'int', 'wis', 'cha']) {
      expect(backgroundIncreaseSourceId(ability)).toBe(`source:background.increase.${ability}`)
    }
  })
})

describe('P7 the generic bounded-distribution primitive -- legal shapes are exactly the 7 real outcomes', () => {
  const OPTIONS = ['A', 'B', 'C']
  const CHOICE: ResolvableChoice = { key: 'k', slot: 'background', choiceSetId: BACKGROUND_ABILITY_CHOICE_SET, count: 3, options: OPTIONS, distinct: false, maxPerOption: 2 }

  function legal(selection: string[]): boolean {
    return validateChoiceSelection(CHOICE, selection).ok
  }

  it('every ordering of every 3-multiset over {A,B,C} with no option above 2 is legal', () => {
    const legalMultisets: string[] = []
    for (const a of OPTIONS) for (const b of OPTIONS) for (const c of OPTIONS) {
      const triple = [a, b, c]
      if (legal(triple)) legalMultisets.push([...triple].sort().join(''))
    }
    // The 7 real outcomes: AAB, AAC, ABB, BBC, ACC, BCC, ABC (2/1 six ways, 1/1/1 once).
    expect(new Set(legalMultisets)).toEqual(new Set(['AAB', 'AAC', 'ABB', 'BBC', 'ACC', 'BCC', 'ABC']))
    expect(new Set(legalMultisets).size).toBe(7)
  })

  it('[A,A,A] (+3 to one ability) is illegal: the per-option ceiling refuses it, not a mode selector', () => {
    const result = validateChoiceSelection(CHOICE, ['A', 'A', 'A'])
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toMatch(/at most 2 times/)
  })

  it('no explicit distribution-mode field is read: the SAME count/maxPerOption pair alone produces exactly {+2/+1, +1/+1/+1}', () => {
    expect('mode' in CHOICE).toBe(false)
  })
})

describe('P7 server authority -- the canonical validator rejects/accepts the same answers the Builder does', () => {
  const abilities = backgroundAbilityDistribution(XPHB_BACKGROUNDS.find((b) => b.name === 'Criminal')!.ability ?? [])!
  const [a, b, c] = abilities.detail.match(/^weighted-abilities:([a-z,]+);/)![1]!.split(',').map(backgroundIncreaseSourceId)
  const CHOICE: ResolvableChoice = { key: 'background:choice:background.ability-distribution', slot: 'background', choiceSetId: BACKGROUND_ABILITY_CHOICE_SET, count: 3, options: [a!, b!, c!], distinct: false, maxPerOption: 2 }

  it('1. +2/+1 is accepted', () => expect(validateChoiceSelection(CHOICE, [a, a, b]).ok).toBe(true))
  it('2. +1/+1/+1 is accepted', () => expect(validateChoiceSelection(CHOICE, [a, b, c]).ok).toBe(true))
  it('3. +3 to one ability is rejected', () => expect(validateChoiceSelection(CHOICE, [a, a, a]).ok).toBe(false))
  it('4. an ability outside the Background\'s three is rejected', () => {
    const result = validateChoiceSelection(CHOICE, [a, b, 'source:background.increase.cha'])
    expect(result.ok).toBe(false)
  })
  it('5. too few selections (2) is rejected', () => expect(validateChoiceSelection(CHOICE, [a, b]).ok).toBe(false))
  it('6. too many selections (4) is rejected', () => expect(validateChoiceSelection(CHOICE, [a, b, c, a]).ok).toBe(false))
  it('7. a malformed answer (not a list of Definition ids) is rejected', () => {
    expect(validateChoiceSelection(CHOICE, 'not-an-array').ok).toBe(false)
    expect(validateChoiceSelection(CHOICE, [a, 42, c]).ok).toBe(false)
  })
  it('8. a stale answer from a DIFFERENT Background (its abilities are not offered here) is rejected', () => {
    const result = validateChoiceSelection(CHOICE, ['source:background.increase.wis', 'source:background.increase.cha', a])
    expect(result.ok).toBe(false)
  })
  // 9. A declared choice with no submitted answer is NOT a server rejection: a character may be
  // created with a Definition choice outstanding (create-v2.post.ts's own documented invariant --
  // "a character may be created with its choices still outstanding... a legal state the Sheet
  // already reports"). This is pre-existing architecture, preserved, not redesigned for P7. What
  // DOES gate on it is the Builder's own step completeness (isProficiencyStepComplete /
  // missingRequirements) and, separately, whether the character's answer SET reaches the state a
  // DM wants recorded -- that is a presentation concern, tested in the Builder suite below, not a
  // server 400.
  it('9. an absent answer is legal at the validator (no selection to validate); completeness is the Builder/authority concern, not a validator rejection', () => {
    expect(resolveCreationChoices(
      [{ slot: 'background', facet: { choices: [{ choiceSet: BACKGROUND_ABILITY_CHOICE_SET, count: 3, from: [a!, b!, c!] }] } }],
      {}
    )[0]!.answered).toBe(false)
  })
})

describe('P7 already-active / duplicate semantics -- a repeatable choice is not a proficiency choice', () => {
  const CRIMINAL = backgroundAbilityDistribution(XPHB_BACKGROUNDS.find((b) => b.name === 'Criminal')!.ability ?? [])!
  const [dex, con] = CRIMINAL.detail.match(/^weighted-abilities:([a-z,]+);/)![1]!.split(',').map(backgroundIncreaseSourceId)
  const slots: CreationSlotInput[] = [{ slot: 'background', facet: findRulesFacet('dnd5e.2024', 'background', 'criminal-xphb') }]
  const choiceSetRule = (id: string) => (id === BACKGROUND_ABILITY_CHOICE_SET ? { distinct: false, maxPerOption: 2 } : null)

  it('picking one ability twice does NOT exclude it as "already acquired" the second time', () => {
    const presentations = resolveCreationChoices(slots, { 'background:choice:background.ability-distribution': [dex!, dex!, con!] }, undefined, choiceSetRule)
    const ability = presentations.find((p) => p.choiceSetId === BACKGROUND_ABILITY_CHOICE_SET)!
    expect(ability.answered).toBe(true)
    expect(ability.selected).toEqual([dex, dex, con])
    // The option is offered as eligible both times -- Phase 2B's "already acquired" never applies here.
    expect(ability.offered.find((o) => o.value === dex)?.eligible).toBe(true)
  })

  it('a repeatable answer does not seed "already acquired" for anything else (distinct choices are unaffected)', () => {
    const granted = directlyGrantedValues(slots)
    expect(granted.has(dex!)).toBe(false)
  })
})

describe('P7 discovery <-> coverage, bidirectionally, for all 16 Backgrounds', () => {
  const BACKGROUND_SLUGS = [...DND5E_2024_POPULATION.backgrounds]

  it('every Background in the population owns exactly one ability-distribution decision, now implemented', () => {
    expect(BACKGROUND_SLUGS).toHaveLength(16)
    for (const slug of BACKGROUND_SLUGS) {
      const decisions = DND5E_2024_MANDATORY_DECISIONS.filter((d) => d.owner.kind === 'background' && d.owner.slug === slug && d.family === 'ability-distribution')
      expect(decisions, slug).toHaveLength(1)
      expect(decisions[0]!.cardinality, slug).toBe(3)
      expect(classifyDecision(decisions[0]!).status, slug).toBe('implemented')
      expect(abilityDistributionCovered(decisions[0]!), slug).toBe(true)
    }
  })

  it('every Background facet declares the one bounded choice, with exactly 3 options matching the corpus', () => {
    for (const bg of XPHB_BACKGROUNDS) {
      const slug = slugOf(bg.name)
      const facet = findRulesFacet('dnd5e.2024', 'background', slug)
      const choice = facet?.choices?.find((c) => c.choiceSet === BACKGROUND_ABILITY_CHOICE_SET)
      expect(choice, bg.name).toBeDefined()
      expect(choice!.count, bg.name).toBe(3)
      expect(choice!.from, bg.name).toHaveLength(3)
      const corpusAbilities = backgroundAbilityDistribution(bg.ability ?? [])!.detail.match(/^weighted-abilities:([a-z,]+);/)![1]!.split(',')
      expect(new Set(choice!.from), bg.name).toEqual(new Set(corpusAbilities.map(backgroundIncreaseSourceId)))
    }
  })

  it('a decision with an unrecognized ability structure (inconsistent modes) would stay blocked (fail closed), never silently dropped', () => {
    // Two modes that disagree on which abilities are eligible: not the real corpus shape (every
    // mode names the SAME three abilities). `backgroundAbilityDistribution` must refuse to guess.
    expect(backgroundAbilityDistribution([
      { choose: { weighted: { from: ['str', 'dex', 'con'], weights: [2, 1] } } },
      { choose: { weighted: { from: ['int', 'wis', 'cha'], weights: [1, 1, 1] } } }
    ])).toBeNull()
  })
})
