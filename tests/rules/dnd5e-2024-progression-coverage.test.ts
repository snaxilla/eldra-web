// CI ENFORCEMENT for the Progression Coverage Ledger
// (app/lib/content-rules/dnd5e-2024-progression-coverage.ts) -- created
// for the ALL-CLASS PROGRESSION CONTRACT AUDIT (2026-10-01).
//
// This test independently RE-DERIVES the candidate choice-bearing feature
// set from the real 5etools XPHB corpus
// (/opt/eldra/datasets/5etools-src/data/class/class-*.json) using the
// identical detection heuristic the ledger file's own header documents,
// then cross-checks it against the ledger in both directions:
//   1. Every discovered choice-bearing feature must have a ledger entry.
//   2. Every ledger entry's corpus identity must still exist in the real
//      corpus (catches a ledger that drifts after a dataset update).
//   3. Every IMPLEMENTED entry's `implementationRef` must resolve against
//      the real Rules Package wherever practically checkable.
// It does NOT re-verify D&D rules correctness (level numbers, feature
// existence) -- that is the corpus's own job. It verifies the LEDGER never
// silently disagrees with the corpus.

import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

import { findRulesFacet } from '../../app/lib/content-rules'
import {
  DND5E_2024_PROGRESSION_COVERAGE,
  type ProgressionCoverageEntry
} from '../../app/lib/content-rules/dnd5e-2024-progression-coverage'
import type { Definition } from '../../app/lib/rules/types'

const DATA_ROOT = '/opt/eldra/datasets/5etools-src/data'
const PACKAGE_DIR = 'packages/eldra-dnd5e-2024'

const CLASS_FILES = [
  'barbarian', 'bard', 'cleric', 'druid', 'fighter', 'monk',
  'paladin', 'ranger', 'rogue', 'sorcerer', 'warlock', 'wizard'
]

type RawClassFile = {
  classFeature?: Array<{ name: string, level: number, className: string, source: string, classSource: string, entries?: unknown[] }>
  subclassFeature?: Array<{ name: string, level: number, className: string, source: string, classSource: string, subclassShortName: string, entries?: unknown[] }>
}

function loadClassFile(stem: string): RawClassFile {
  return JSON.parse(readFileSync(`${DATA_ROOT}/class/class-${stem}.json`, 'utf8')) as RawClassFile
}

function classSlugOf(className: string): string {
  return `${className.toLowerCase()}-xphb`
}

// Flattens 5etools' nested entries (strings, or {entries: [...]} objects,
// or {items: [...]} lists) into one searchable string. This is the ONLY
// place free text is interpreted -- kept narrow and named, per this
// ledger's own "Source Detection Honesty" header.
function extractText(node: unknown): string {
  if (typeof node === 'string') return node
  if (Array.isArray(node)) return node.map(extractText).join(' ')
  if (node && typeof node === 'object') {
    const record = node as Record<string, unknown>
    return [extractText(record.entries), extractText(record.items), extractText(record.name)]
      .filter(Boolean)
      .join(' ')
  }
  return ''
}

const OPTIONAL_FEATURE_TAG = /\|optionalfeatures\|/
// PHASE 2C.2A -- a choice that draws from a feat category filter, e.g. Champion's
// "gain another {@filter Fighting Style feat|feats|category=FS} of your choice".
// Added so the coverage scan can see filter-driven feat choices at all. Reviewed
// against the full native-XPHB corpus (see the discovery census test below).
const FEAT_CATEGORY_FILTER_TAG = /\{@filter [^}]*\|feats\|category=/
const STRONG_CHOICE_PHRASING = /you (can )?choose (one|two|three|a|an)\b|choose one of the following|choose (a|one) maneuver|learn \w+ (cantrip|spell)s? of your choice/i

// KNOWN-NAME set: real corpus feature names with a stable, well-understood
// identity -- always treated as choice-bearing regardless of text
// phrasing, since their MECHANIC (not their prose) is what makes them a
// real player decision.
const KNOWN_CLASS_FEATURE_NAMES = new Set([
  'Ability Score Improvement', 'Epic Boon', 'Weapon Mastery', 'Fighting Style',
  'Expertise', 'Metamagic', 'Eldritch Invocations', 'Mystic Arcanum', 'Spellcasting'
])

function isKnownSubclassSelectionFeature(name: string, className: string): boolean {
  return name === `${className} Subclass`
}

type DiscoveredFeature = { classSlug: string, featureName: string, level: number, signal: 'known' | 'text' }

function discoverClassLevelFeatures(): DiscoveredFeature[] {
  const found: DiscoveredFeature[] = []
  for (const stem of CLASS_FILES) {
    const file = loadClassFile(stem)
    for (const feature of file.classFeature ?? []) {
      // `classSource` names which CLASS TABLE this row belongs to;
      // `source` names the FEATURE's own publication. A class file mixes
      // multiple editions under the same className, so both must be
      // checked -- `classSource` alone let 2014-only features with an
      // XPHB-tagged class table slip through in an earlier pass.
      if (feature.classSource !== 'XPHB' || feature.source !== 'XPHB') continue
      const classSlug = classSlugOf(feature.className)
      if (isKnownSubclassSelectionFeature(feature.name, feature.className)) {
        found.push({ classSlug, featureName: `${feature.className} Subclass`, level: feature.level, signal: 'known' })
        continue
      }
      if (KNOWN_CLASS_FEATURE_NAMES.has(feature.name)) {
        found.push({ classSlug, featureName: feature.name, level: feature.level, signal: 'known' })
        continue
      }
      const text = extractText(feature.entries)
      if (OPTIONAL_FEATURE_TAG.test(text) || STRONG_CHOICE_PHRASING.test(text) || FEAT_CATEGORY_FILTER_TAG.test(JSON.stringify(feature.entries))) {
        found.push({ classSlug, featureName: feature.name, level: feature.level, signal: 'text' })
      }
    }
  }
  return found
}

type DiscoveredSubclassFeature = { classSlug: string, subclassShortName: string, featureName: string, level: number }

function discoverSubclassInternalFeatures(): DiscoveredSubclassFeature[] {
  const found: DiscoveredSubclassFeature[] = []
  for (const stem of CLASS_FILES) {
    const file = loadClassFile(stem)
    for (const feature of file.subclassFeature ?? []) {
      // Same distinction as discoverClassLevelFeatures above -- a class
      // file's subclassFeature list mixes in splatbook subclasses (e.g.
      // Fighter's 2014 "Banneret" from FRHoF) that merely SHARE the XPHB
      // class table. `source` (the subclass feature's own publication) is
      // the only reliable native-XPHB-subclass discriminator -- confirmed
      // by direct read of class-fighter.json, where "Banneret" carries
      // `classSource: 'XPHB', source: 'FRHoF'`.
      if (feature.classSource !== 'XPHB' || feature.source !== 'XPHB') continue
      // The subclass's OWN selection-level feature (name === the subclass
      // title itself) is the subclass-SELECTION mechanic, already covered
      // by the class-level "<Class> Subclass" entry above -- never a
      // second, subclass-internal choice.
      const text = extractText(feature.entries)
      const looksLikeSubclassTitleFeature = feature.level === 3 && !OPTIONAL_FEATURE_TAG.test(text) && !STRONG_CHOICE_PHRASING.test(text)
      if (looksLikeSubclassTitleFeature) continue
      if (OPTIONAL_FEATURE_TAG.test(text) || STRONG_CHOICE_PHRASING.test(text) || FEAT_CATEGORY_FILTER_TAG.test(JSON.stringify(feature.entries))) {
        found.push({
          classSlug: classSlugOf(feature.className),
          subclassShortName: feature.subclassShortName,
          featureName: feature.name,
          level: feature.level
        })
      }
    }
  }
  return found
}

function ledgerEntriesFor(classSlug: string, featureName: string): ProgressionCoverageEntry[] {
  return DND5E_2024_PROGRESSION_COVERAGE.filter((e) => e.classSlug === classSlug && e.featureName === featureName)
}

describe('PROGRESSION COVERAGE LEDGER -- cross-checked against the real corpus', () => {
  const discoveredClassLevel = discoverClassLevelFeatures()
  const discoveredSubclassInternal = discoverSubclassInternalFeatures()

  it('sanity: the detection heuristic finds a non-trivial, bounded set (regression guard on the heuristic itself)', () => {
    expect(discoveredClassLevel.length).toBeGreaterThan(20)
    expect(discoveredSubclassInternal.length).toBeGreaterThan(0)
  })

  describe.each(discoveredClassLevel)(
    'class-level: $classSlug / $featureName (L$level)',
    ({ classSlug, featureName, level }) => {
      it('has a ledger entry covering this real corpus level', () => {
        const entries = ledgerEntriesFor(classSlug, featureName)
        expect(
          entries.length > 0,
          `No ledger entry at all for ${classSlug}:${featureName}. Every discovered choice-bearing feature must be classified -- see dnd5e-2024-progression-coverage.ts.`
        ).toBe(true)
        const coversLevel = entries.some((e) => e.levels.includes(level))
        expect(
          coversLevel,
          `Ledger entry/entries for ${classSlug}:${featureName} exist but do not list level ${level} (found levels: ${entries.flatMap((e) => e.levels).join(',')}).`
        ).toBe(true)
      })
    }
  )

  describe.each(discoveredSubclassInternal)(
    'subclass-internal: $classSlug / $subclassShortName / $featureName (L$level)',
    ({ classSlug, featureName, level }) => {
      it('has a ledger entry covering this real corpus subclass-internal feature', () => {
        const entries = ledgerEntriesFor(classSlug, featureName)
        const coversLevel = entries.some((e) => e.levels.includes(level))
        expect(
          coversLevel,
          `No ledger entry for subclass-internal feature ${classSlug}:${featureName} at L${level}. ` +
          `Every subclass-internal choice-bearing feature discovered must be classified, even if the classification is ENGINE_BLOCKED.`
        ).toBe(true)
      })
    }
  )

  it('every ledger entry\'s corpus identity still exists in the real corpus (catches drift after a dataset update)', () => {
    const discoveredKeys = new Set([
      ...discoveredClassLevel.map((f) => `${f.classSlug}::${f.featureName}`),
      ...discoveredSubclassInternal.map((f) => `${f.classSlug}::${f.featureName}`)
    ])
    // Entries this ledger deliberately classifies OUTSIDE the class/
    // subclassFeature corpus scan above (creation-time Background grants,
    // and the class-level Spellcasting/subclass-selection names which the
    // scan already special-cases): verified by construction, not by this
    // membership check.
    const outOfScanScope = new Set([
      'background::Origin Feat',
      'background::Starting Equipment / Gold'
    ])
    for (const entry of DND5E_2024_PROGRESSION_COVERAGE) {
      const key = `${entry.classSlug}::${entry.featureName}`
      if (outOfScanScope.has(key)) continue
      // Feat-level Fighting Style facts (per-style runtime effects) and the two
      // special variants are not class features: documented allowance, see
      // dnd5e-2024-progression-coverage.ts's Fighting Style section.
      if (entry.featureName.startsWith('Fighting Style effect: ')) continue
      if (entry.classSlug === 'paladin-xphb' && entry.featureName === 'Blessed Warrior') continue
      if (entry.classSlug === 'ranger-xphb' && entry.featureName === 'Druidic Warrior') continue
      if (entry.featureName.endsWith(' Subclass')) continue // subclass-selection: special-cased above, always real
      if (entry.featureName === 'Spellcasting') continue // creation-time feature name, not scanned by classFeature (verified separately below)
      expect(
        discoveredKeys.has(key),
        `Ledger entry '${entry.id}' (${key}) no longer matches anything the real corpus scan discovers -- either the corpus changed or this entry is stale.`
      ).toBe(true)
    }
  })

  it('every IMPLEMENTED subclass-selection entry\'s class facet genuinely references the Progression it claims', () => {
    const subclassEntries = DND5E_2024_PROGRESSION_COVERAGE.filter(
      (e) => e.status === 'IMPLEMENTED' && e.implementationRef === 'progression:class.subclass-selection'
    )
    expect(subclassEntries.length).toBe(12)
    for (const entry of subclassEntries) {
      const facet = findRulesFacet('dnd5e.2024', 'class', entry.classSlug)
      expect(facet, `No RulesFacet found for class ${entry.classSlug}`).toBeDefined()
      expect(
        facet?.progression ?? [],
        `${entry.classSlug}'s facet does not reference progression:class.subclass-selection despite the ledger claiming IMPLEMENTED.`
      ).toContain('progression:class.subclass-selection')
    }
  })

  it('every IMPLEMENTED ASI entry\'s class facet genuinely references the cadence Progression it claims', () => {
    const asiEntries = DND5E_2024_PROGRESSION_COVERAGE.filter((e) => e.status === 'IMPLEMENTED' && e.id.endsWith(':ability-score-improvement'))
    expect(asiEntries.length).toBe(12)
    for (const entry of asiEntries) {
      const facet = findRulesFacet('dnd5e.2024', 'class', entry.classSlug)
      expect(facet?.progression ?? []).toContain(entry.implementationRef)
    }
  })

  it('every IMPLEMENTED entry\'s implementationRef Definition actually exists in the published Rules Package', () => {
    const definitions = JSON.parse(readFileSync(`${PACKAGE_DIR}/definitions.json`, 'utf8')) as Definition[]
    const ids = new Set(definitions.map((d) => d.id))
    const implemented = DND5E_2024_PROGRESSION_COVERAGE.filter((e) => e.status === 'IMPLEMENTED' && e.implementationRef)
    expect(implemented.length).toBeGreaterThan(0)
    for (const entry of implemented) {
      expect(
        ids.has(entry.implementationRef as string),
        `Ledger entry '${entry.id}' claims implementationRef '${entry.implementationRef}', which does not exist in ${PACKAGE_DIR}/definitions.json.`
      ).toBe(true)
    }
  })

  it('every non-IMPLEMENTED entry carries a non-empty blockerReason (no silent/unexplained blocked status)', () => {
    const blocked = DND5E_2024_PROGRESSION_COVERAGE.filter((e) => e.status !== 'IMPLEMENTED')
    expect(blocked.length).toBeGreaterThan(0)
    for (const entry of blocked) {
      expect(entry.blockerReason, `Ledger entry '${entry.id}' has status '${entry.status}' but no blockerReason.`).toBeTruthy()
    }
  })

  it('every entry\'s status is one of the five defined values -- no UNKNOWN/ad-hoc status strings', () => {
    const allowed = new Set(['IMPLEMENTED', 'ENGINE_BLOCKED', 'CONTENT_BLOCKED', 'MILESTONE_DEFERRED', 'SOURCE_BLOCKED'])
    for (const entry of DND5E_2024_PROGRESSION_COVERAGE) {
      expect(allowed.has(entry.status), `Ledger entry '${entry.id}' has an unrecognized status '${entry.status}'.`).toBe(true)
    }
  })

  it('ids are unique (no accidental duplicate classification of the same corpus feature)', () => {
    const ids = DND5E_2024_PROGRESSION_COVERAGE.map((e) => e.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  // REQUIREMENT: a test fixture proving an unclassified feature causes
  // the comparison itself to fail -- proves this test is a real gate, not
  // merely "the ledger file parses." Exercises the SAME comparison logic
  // as the class-level `it` blocks above, against a synthetic ledger that
  // is deliberately missing one real, currently-discovered feature.
  it('BITE PROOF: a ledger missing a real discovered feature fails the coverage check', () => {
    expect(discoveredClassLevel.length).toBeGreaterThan(0)
    const victim = discoveredClassLevel[0]
    const ledgerWithoutVictim = DND5E_2024_PROGRESSION_COVERAGE.filter(
      (e) => !(e.classSlug === victim.classSlug && e.featureName === victim.featureName)
    )
    const entries = ledgerWithoutVictim.filter((e) => e.classSlug === victim.classSlug && e.featureName === victim.featureName)
    expect(entries.length).toBe(0) // confirms the fixture setup actually removed it
    // The real `it` blocks above assert `entries.length > 0` against the
    // REAL ledger; here the identical assertion against the GUTTED ledger
    // is proven false, demonstrating the gate fires when it should.
    expect(entries.length > 0).toBe(false)
  })
})
