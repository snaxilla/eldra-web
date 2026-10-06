// PHASE 0 -- structural mandatory-decision discovery, proven against the REAL XPHB corpus.
//
// The D-01..D-25 cases are REGRESSION FIXTURES, not detector inputs: each one states an owner,
// level, and family the corpus must yield, and the detector must find a decision that matches.
// None of them is hardcoded into the detector. A case failing means the detector no longer sees
// a real corpus structure the earlier audit found.

import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { buildArtifact, loadXphbCorpus } from '../../scripts/content-rules/generate-mandatory-decisions'
import { detectAll, type DecisionRecord } from '../../app/lib/content-rules/mandatory-decisions'
import { plainText } from '../../app/lib/content-rules/mandatory-decisions'
import { DND5E_2024_MANDATORY_DECISIONS } from '../../app/lib/content-rules/creation-completeness'

const CORPUS = loadXphbCorpus()
const DECISIONS = detectAll(CORPUS)

const find = (pred: (d: DecisionRecord) => boolean) => DECISIONS.filter(pred)

describe('structural discovery -- the committed artifact is the corpus, exactly', () => {
  it('the committed artifact equals a fresh detection over the real corpus (drift fails here)', () => {
    const committed = JSON.parse(readFileSync('app/lib/content-rules/dnd5e-2024-mandatory-decisions.json', 'utf8'))
    const fresh = JSON.parse(buildArtifact())
    expect(committed.decisions).toEqual(fresh.decisions)
  })

  it('the runtime index is the same decision set the detector yields', () => {
    expect(JSON.parse(JSON.stringify(DND5E_2024_MANDATORY_DECISIONS))).toEqual(JSON.parse(JSON.stringify(DECISIONS)))
  })

  it('the corpus holds the expected XPHB population (12 classes, 48 subclasses, 10 species, 16 backgrounds)', () => {
    expect(CORPUS.classes).toHaveLength(12)
    expect(CORPUS.classes.reduce((n, c) => n + c.subclasses.length, 0)).toBe(48)
    expect(CORPUS.races).toHaveLength(10)
    expect(CORPUS.backgrounds).toHaveLength(16)
  })
})

describe('D-01..D-25 -- every real decision the audit named is discovered', () => {
  // D-01 Cleric Divine Order (L1) -- options block over class features (the old heuristic missed it).
  it('D-01 Cleric Divine Order is a Level-1 feature-option decision', () => {
    expect(find((d) => d.owner.slug === 'cleric-xphb' && d.level === 1 && d.family === 'feature-option' && d.source === 'Divine Order')).toHaveLength(1)
  })
  it('D-02 Druid Primal Order is a Level-1 feature-option decision', () => {
    expect(find((d) => d.owner.slug === 'druid-xphb' && d.level === 1 && d.family === 'feature-option' && d.source === 'Primal Order')).toHaveLength(1)
  })
  it('D-03 Cleric Blessed Strikes is a Level-7 feature-option decision', () => {
    expect(find((d) => d.owner.slug === 'cleric-xphb' && d.level === 7 && d.family === 'feature-option' && d.source === 'Blessed Strikes')).toHaveLength(1)
  })
  it('D-04 Druid Elemental Fury is a Level-7 feature-option decision', () => {
    expect(find((d) => d.owner.slug === 'druid-xphb' && d.level === 7 && d.family === 'feature-option' && d.source === 'Elemental Fury')).toHaveLength(1)
  })
  it('D-05 Barbarian Wild Heart Aspect of the Wilds is a Level-6 subclass feature-option', () => {
    expect(find((d) => d.owner.slug === 'path-of-the-wild-heart-xphb' && d.level === 6 && d.family === 'feature-option' && d.source === 'Aspect of the Wilds')).toHaveLength(1)
  })
  it('D-06 Ranger Hunter Defensive Tactics is a Level-7 subclass feature-option', () => {
    expect(find((d) => d.owner.slug === 'hunter-xphb' && d.level === 7 && d.family === 'feature-option' && d.source === 'Defensive Tactics')).toHaveLength(1)
  })
  it('D-07 Ranger Gloom Stalker Iron Mind is a Level-7 saving-throw proficiency choice', () => {
    expect(find((d) => d.owner.slug === 'gloom-stalker-xphb' && d.level === 7 && d.family === 'proficiency-choice' && d.source === 'Iron Mind')).toHaveLength(1)
  })
  it('D-08 Barbarian Primal Knowledge is a Level-3 skill choice', () => {
    expect(find((d) => d.owner.slug === 'barbarian-xphb' && d.level === 3 && d.family === 'skill-choice' && d.source === 'Primal Knowledge')).toHaveLength(1)
  })
  it('D-09 Ranger Deft Explorer is a Level-2 expertise choice', () => {
    expect(find((d) => d.owner.slug === 'ranger-xphb' && d.level === 2 && d.family === 'expertise-choice' && d.source === 'Deft Explorer')).not.toHaveLength(0)
  })
  it('D-10 Bard Magical Secrets is a broad-list spell choice from Level 10', () => {
    expect(find((d) => d.owner.slug === 'bard-xphb' && d.level === 10 && d.family === 'spell-choice' && d.source === 'Magical Secrets')).toHaveLength(1)
  })
  it('D-11 Wizard Spell Mastery is a Level-18 choice of two spells', () => {
    const [d] = find((x) => x.owner.slug === 'wizard-xphb' && x.level === 18 && x.family === 'spell-choice' && x.source === 'Spell Mastery')
    expect(d?.cardinality).toBe(2)
  })
  it('D-12 Wizard Signature Spells is a Level-20 choice of two spells', () => {
    const [d] = find((x) => x.owner.slug === 'wizard-xphb' && x.level === 20 && x.family === 'spell-choice' && x.source === 'Signature Spells')
    expect(d?.cardinality).toBe(2)
  })
  it('D-13 Sorcerer Draconic Elemental Affinity is a Level-6 damage-type choice', () => {
    expect(find((d) => d.owner.slug === 'draconic-sorcery-xphb' && d.level === 6 && d.family === 'damage-type-choice' && d.source === 'Elemental Affinity')).toHaveLength(1)
  })
  it('D-14 Druid Circle of the Land terrain is a subclass variant choice at Level 3', () => {
    expect(find((d) => d.owner.kind === 'subclass' && d.owner.slug === 'circle-of-the-land-xphb' && d.level === 3 && d.family === 'variant-choice')).toHaveLength(1)
  })
  it('D-15 subclass spell grants: fixed grants are spell-grant owners; every subclass with spell structure carries a spell decision', () => {
    // Read from the corpus structure. A grant is FIXED when a spell kind (known, prepared, innate,
    // expanded) names spells directly. A subclass whose spells sit in NAMED variants (Circle of the
    // Land's terrain) is represented by its variant choice; the terrain's spells follow that choice.
    const SPELL_KINDS = ['known', 'prepared', 'innate', 'expanded']
    // A `choose` or `all` object is a choice (its strings are filters such as "level=0|class=Wizard"),
    // never a fixed spell name.
    const hasFixedSpell = (node: unknown): boolean => {
      if (typeof node === 'string') return true
      if (Array.isArray(node)) return node.some(hasFixedSpell)
      if (!node || typeof node !== 'object' || 'choose' in node || 'all' in node) return false
      return Object.values(node).some(hasFixedSpell)
    }
    const blocksOf = (sub: { additionalSpells?: unknown[] }) => sub.additionalSpells ?? []
    const named = (sub: { additionalSpells?: unknown[] }) => blocksOf(sub).filter((b) => b && typeof b === 'object' && typeof (b as any).name === 'string').length >= 2
    const subclasses = CORPUS.classes.flatMap((c) => c.subclasses)
    const fixedOwners = subclasses
      .filter((sub) => !named(sub) && blocksOf(sub).some((block) => block && typeof block === 'object' && SPELL_KINDS.some((kind) => hasFixedSpell((block as Record<string, unknown>)[kind]))))
      .map((sub) => sub.name)
    const discoveredFixed = new Set(find((d) => d.owner.kind === 'subclass' && d.family === 'spell-grant').map((d) => d.owner.name))
    expect(fixedOwners.length).toBeGreaterThan(20)
    expect([...discoveredFixed].sort()).toEqual([...new Set(fixedOwners)].sort())

    const withSpellStructure = subclasses.filter((sub) => blocksOf(sub).length > 0).map((sub) => sub.name)
    const withSpellDecision = new Set(find((d) => d.owner.kind === 'subclass' && (d.family === 'spell-grant' || d.family === 'spell-choice' || d.family === 'variant-choice')).map((d) => d.owner.name))
    for (const name of withSpellStructure) expect(withSpellDecision.has(name), name).toBe(true)
  })
  it('D-16 species choices: Human origin feat, lineage/ancestry variants, damage type, and Elf/Gnome/Tiefling/Goliath/Dragonborn', () => {
    expect(find((d) => d.owner.slug === 'human-xphb' && d.family === 'feat-choice')).toHaveLength(1)
    expect(find((d) => d.owner.slug === 'elf-xphb' && d.family === 'variant-choice')).toHaveLength(1)
    expect(find((d) => d.owner.slug === 'gnome-xphb' && d.family === 'variant-choice')).toHaveLength(1)
    expect(find((d) => d.owner.slug === 'tiefling-xphb' && d.family === 'variant-choice')).toHaveLength(1)
    expect(find((d) => d.owner.slug === 'goliath-xphb' && d.family === 'variant-choice')).toHaveLength(1)
    expect(find((d) => d.owner.slug === 'dragonborn-xphb' && d.family === 'damage-type-choice')).toHaveLength(1)
  })
  it('D-17 every XPHB background has a mandatory ability-distribution decision', () => {
    expect(find((d) => d.owner.kind === 'background' && d.family === 'ability-distribution')).toHaveLength(16)
  })
  it('D-18 every XPHB background has a tool decision (11 fixed grants, 5 choices)', () => {
    const bgTools = find((d) => d.owner.kind === 'background' && (d.family === 'proficiency-grant' || d.family === 'proficiency-choice') && d.source.startsWith('toolProficiencies'))
    expect(new Set(bgTools.map((d) => d.owner.slug)).size).toBe(16)
    expect(bgTools.filter((d) => d.family === 'proficiency-choice')).toHaveLength(5)
  })
  it('D-19 Bard (three instruments), Monk (one artisan tool or instrument), and fixed Rogue/Druid tools', () => {
    expect(find((d) => d.owner.slug === 'bard-xphb' && d.family === 'proficiency-choice' && d.cardinality === 3)).toHaveLength(1)
    expect(find((d) => d.owner.slug === 'monk-xphb' && d.family === 'proficiency-choice' && d.cardinality === 1)).toHaveLength(1)
    expect(find((d) => d.owner.slug === 'rogue-xphb' && d.family === 'proficiency-grant' && d.source.includes("Thieves"))).toHaveLength(1)
    expect(find((d) => d.owner.slug === 'druid-xphb' && d.family === 'proficiency-grant' && d.source.includes('Herbalism'))).toHaveLength(1)
  })
  it('D-20 every class has a fixed armor and weapon proficiency grant', () => {
    const classes = new Set(find((d) => d.owner.kind === 'class' && d.family === 'proficiency-grant' && d.source.startsWith('startingProficiencies.weapons')).map((d) => d.owner.slug))
    expect(classes.size).toBe(12)
  })
  it('D-21 General and Epic feats with nested decisions: spells, tools, armor/weapon, skill/tool/language', () => {
    for (const slug of ['fey-touched-xphb', 'ritual-caster-xphb', 'shadow-touched-xphb', 'telekinetic-xphb', 'telepathic-xphb']) {
      expect(find((d) => d.owner.slug === slug && (d.family === 'spell-choice' || d.family === 'spell-grant'))).not.toHaveLength(0)
    }
    expect(find((d) => d.owner.slug === 'chef-xphb' && d.family === 'proficiency-grant')).not.toHaveLength(0)
    expect(find((d) => d.owner.slug === 'heavily-armored-xphb' && d.family === 'proficiency-grant')).toHaveLength(1)
    expect(find((d) => d.owner.slug === 'martial-weapon-training-xphb' && d.family === 'proficiency-grant')).toHaveLength(1)
    expect(find((d) => d.owner.slug === 'skill-expert-xphb' && d.family === 'proficiency-choice')).toHaveLength(1)
  })
  it('D-22 starting equipment A/B packages exist for all 12 classes and all 16 backgrounds', () => {
    expect(find((d) => d.owner.kind === 'class' && d.family === 'equipment-package')).toHaveLength(12)
    expect(find((d) => d.owner.kind === 'background' && d.family === 'equipment-package')).toHaveLength(16)
  })
  it('D-23 every caster has per-level cantrip or prepared-spell count increases', () => {
    for (const slug of ['bard-xphb', 'cleric-xphb', 'druid-xphb', 'paladin-xphb', 'ranger-xphb', 'sorcerer-xphb', 'warlock-xphb', 'wizard-xphb']) {
      expect(find((d) => d.owner.slug === slug && d.family === 'spell-count').length, slug).toBeGreaterThan(0)
    }
  })
  it('D-24 Wizard spellbook: six starting spells, and two spells for every level after 1', () => {
    expect(find((d) => d.owner.slug === 'wizard-xphb' && d.family === 'spell-choice' && d.detail === 'starting-spellbook')[0]?.cardinality).toBe(6)
    expect(find((d) => d.owner.slug === 'wizard-xphb' && d.family === 'spell-choice' && d.detail === 'spellbook-growth')).toHaveLength(19)
  })
  it('D-25 languages: Rogue Thieves\' Cant and Ranger Deft Explorer (the corpus has no species or background language grant)', () => {
    expect(find((d) => d.owner.slug === 'rogue-xphb' && d.family === 'language-choice')).toHaveLength(1)
    expect(find((d) => d.owner.slug === 'ranger-xphb' && d.family === 'language-choice')).toHaveLength(1)
  })
})

describe('current knowledge is still discovered (no regression of the earlier heuristic)', () => {
  it('the Fighter Level-1 Fighting Style and Epic Boon are feat-choice decisions', () => {
    expect(find((d) => d.owner.slug === 'fighter-xphb' && d.level === 1 && d.family === 'feat-choice' && d.detail === 'category=FS')).toHaveLength(1)
    expect(find((d) => d.owner.slug === 'fighter-xphb' && d.level === 19 && d.family === 'feat-choice' && d.detail === 'category=EB')).toHaveLength(1)
  })
  it('ASI is discovered at every level the class grants it (Fighter: 4, 6, 8, 12, 14, 16)', () => {
    expect(find((d) => d.owner.slug === 'fighter-xphb' && d.family === 'feat-choice' && d.detail === 'asi').map((d) => d.level).sort((a, b) => a - b)).toEqual([4, 6, 8, 12, 14, 16])
  })
  it('Warlock Eldritch Invocations are discovered at the corpus increase levels, and Metamagic at 2, 10, 17', () => {
    expect(find((d) => d.owner.slug === 'warlock-xphb' && d.family === 'accumulating-option' && d.source === 'Invocations').map((d) => d.level).sort((a, b) => a - b)).toEqual([1, 2, 5, 7, 9, 12, 15, 18])
    expect(find((d) => d.owner.slug === 'sorcerer-xphb' && d.family === 'accumulating-option' && d.source === 'Metamagic').map((d) => d.level).sort((a, b) => a - b)).toEqual([2, 10, 17])
  })
  it('Mystic Arcanum is discovered at 11, 13, 15, and 17', () => {
    expect(find((d) => d.owner.slug === 'warlock-xphb' && d.source === 'Mystic Arcanum' && d.family === 'spell-choice').map((d) => d.level).sort((a, b) => a - b)).toEqual([11, 13, 15, 17])
  })
})

describe('mandatory versus optional -- replacement clauses never become mandatory', () => {
  it('Fighting Style replacement is an optional replacement, not a mandatory decision', () => {
    const [d] = find((x) => x.owner.slug === 'fighter-xphb' && x.family === 'replacement' && x.source === 'Fighting Style')
    expect(d?.mandatory).toBe(false)
  })
  it('Weapon Mastery change (Barbarian Long Rest) is optional; its count increases are mandatory', () => {
    expect(find((x) => x.owner.slug === 'barbarian-xphb' && x.family === 'replacement').every((x) => !x.mandatory)).toBe(true)
    expect(find((x) => x.owner.slug === 'barbarian-xphb' && x.family === 'weapon-mastery' && x.mandatory).length).toBeGreaterThan(0)
  })
  it('Wizard Memorize Spell (a swap on a Long Rest) is optional', () => {
    expect(find((x) => x.owner.slug === 'wizard-xphb' && x.family === 'replacement' && x.source === 'Memorize Spell').every((x) => !x.mandatory)).toBe(true)
  })
  it('no replacement decision in the whole corpus is mandatory', () => {
    expect(DECISIONS.filter((d) => d.family === 'replacement').every((d) => d.mandatory === false)).toBe(true)
  })
})

describe('runtime effects are not decisions', () => {
  // Per-use and per-attack choices produce no decision: the feature opens with a per-use trigger.
  it.each(['Divine Strike', 'Primal Strike', 'Empowered Strikes', 'Sculpt Spells', 'Power of the Wilds', 'Steps of the Fey', 'Illusory Reality', 'Fiendish Resilience', 'The Third Eye'])(
    '%s produces no mandatory decision', (feature) => {
      expect(DECISIONS.filter((d) => d.source === feature && d.mandatory)).toHaveLength(0)
    }
  )
})

describe('false positives are explicit, never fake decisions', () => {
  it('the heuristic\'s false positives (Heightened Focus, Sorcery Incarnate) produce no decision', () => {
    expect(DECISIONS.filter((d) => d.source === 'Heightened Focus' || d.source === 'Sorcery Incarnate')).toHaveLength(0)
  })
  it('the plain text of an entry strips its markup (so a phrase rule never sees a tag)', () => {
    expect(plainText(['Choose {@spell Magic Missile|XPHB} now.'])).toBe('Choose Magic Missile now.')
  })
})
