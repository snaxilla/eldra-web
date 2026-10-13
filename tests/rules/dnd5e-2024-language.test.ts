// D&D 2024 Character Rules -- LANGUAGE CORPUS + POLICY PHASE, corpus/model verification.
// Independently re-derives the real XPHB language vocabulary and the real Rogue/Ranger/Druid
// feature text directly from the dataset -- never trusts a prompt or a prior session's own
// claim. Proves the authored package vocabulary (packages/eldra-dnd5e-2024/definitions.json)
// and the universal creation declaration (manifest.json's own `universalCreation`) match the
// real corpus exactly.

import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { findRulesFacet } from '../../app/lib/content-rules'

const DATASET_DIR = '/opt/eldra/datasets/5etools-src/data'

function slugOf(name: string): string {
  return name.toLowerCase().replace(/'/g, '').replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')
}

describe('LANGUAGE VOCABULARY -- re-derived directly from languages.json, never assumed', () => {
  const languages = JSON.parse(readFileSync(`${DATASET_DIR}/languages.json`, 'utf8')).language as Array<{ name: string, source: string, type?: string }>
  const xphb = languages.filter((l) => l.source === 'XPHB')

  it('exactly 19 XPHB language records exist, 10 Standard and 9 Rare', () => {
    expect(xphb).toHaveLength(19)
    expect(xphb.filter((l) => l.type === 'standard')).toHaveLength(10)
    expect(xphb.filter((l) => l.type === 'rare')).toHaveLength(9)
  })

  it('Thieves\' Cant and Druidic are BOTH structurally plain "rare" language records -- the same kind as Abyssal/Celestial/etc., never a separate category', () => {
    const thievesCant = xphb.find((l) => l.name === "Thieves' Cant")!
    const druidic = xphb.find((l) => l.name === 'Druidic')!
    expect(thievesCant.type).toBe('rare')
    expect(druidic.type).toBe('rare')
  })

  it('the authored package Values (value:language.<id>.known) cover exactly the 19 real XPHB language identities, by real name', () => {
    const definitions = JSON.parse(readFileSync('packages/eldra-dnd5e-2024/definitions.json', 'utf8')) as Array<{ id: string, label?: string }>
    const languageValues = definitions.filter((d) => d.id.startsWith('value:language.') && d.id.endsWith('.known'))
    expect(languageValues).toHaveLength(19)
    const authoredNames = new Set(languageValues.map((d) => d.label))
    for (const l of xphb) expect(authoredNames.has(l.name), l.name).toBe(true)
  })

  it('the authored ids match this phase\'s own slug convention (lowercase, underscore-separated, no apostrophe)', () => {
    const definitions = JSON.parse(readFileSync('packages/eldra-dnd5e-2024/definitions.json', 'utf8')) as Array<{ id: string, label?: string }>
    const byLabel = new Map(definitions.filter((d) => d.id.startsWith('value:language.')).map((d) => [d.label, d.id]))
    for (const l of xphb) {
      expect(byLabel.get(l.name), l.name).toBe(`value:language.${slugOf(l.name)}.known`)
    }
  })
})

describe('UNIVERSAL CREATION RULE -- re-derived directly from the real rulebook text', () => {
  const book = JSON.parse(readFileSync(`${DATASET_DIR}/book/book-xphb.json`, 'utf8'))

  function findChooseLanguages(node: unknown): any {
    if (Array.isArray(node)) {
      for (const item of node) {
        const found = findChooseLanguages(item)
        if (found) return found
      }
      return null
    }
    if (node && typeof node === 'object') {
      const record = node as Record<string, unknown>
      if (record.name === 'Choose Languages') return record
      for (const value of Object.values(record)) {
        const found = findChooseLanguages(value)
        if (found) return found
      }
    }
    return null
  }

  it('the real "Choose Languages" section exists and names Common plus the Standard table as the universal rule', () => {
    const section = findChooseLanguages(book)
    expect(section).toBeTruthy()
    const text = JSON.stringify(section)
    expect(text).toMatch(/Common plus two languages/)
    expect(text).toMatch(/Standard Languages/)
  })

  it('the manifest\'s own universalCreation declaration matches: fixed Common, +2 from exactly the 10 Standard languages', () => {
    const manifest = JSON.parse(readFileSync('packages/eldra-dnd5e-2024/manifest.json', 'utf8'))
    const universal = manifest.universalCreation
    expect(universal.grants).toEqual([{ set: 'value:language.common.known', to: true }])
    expect(universal.choices).toHaveLength(1)
    expect(universal.choices[0].count).toBe(2)
    expect(universal.choices[0].from).toHaveLength(10)
    for (const id of universal.choices[0].from) expect(id).toMatch(/^value:language\.[a-z_]+\.known$/)
  })
})

describe('ROGUE / RANGER / DRUID -- real feature text re-traced directly from the class corpus', () => {
  function featureEntries(stem: string, name: string): string {
    const data = JSON.parse(readFileSync(`${DATASET_DIR}/class/class-${stem}.json`, 'utf8'))
    const feature = data.classFeature.find((f: any) => f.source === 'XPHB' && f.classSource === 'XPHB' && f.name === name)
    return JSON.stringify(feature.entries)
  }

  it('Rogue\'s "Thieves\' Cant" (Level 1) grants Thieves\' Cant FIXED, plus one genuinely chosen "other language"', () => {
    const text = featureEntries('rogue', "Thieves' Cant")
    expect(text).toMatch(/You know Thieves. Cant/)
    expect(text).toMatch(/one other language of your choice/)
  })

  it('Ranger\'s "Deft Explorer" (Level 2) grants two genuinely chosen languages, no fixed component', () => {
    const text = featureEntries('ranger', 'Deft Explorer')
    expect(text).toMatch(/two languages of your choice/)
    // No fixed "you know X" language clause anywhere in this feature's own text.
    expect(text).not.toMatch(/You know \w+,/)
  })

  it('Druid\'s "Druidic" (Level 1) is PURELY a fixed grant -- no "of your choice" clause at all', () => {
    const text = featureEntries('druid', 'Druidic')
    expect(text).toMatch(/You know Druidic/)
    expect(text).not.toMatch(/of your choice/)
  })
})

describe('AUTHORED FACETS -- Rogue/Ranger/Druid match the real corpus findings above', () => {
  it('Rogue grants Thieves\' Cant fixed, and declares a creation-time choice:language.known entry (count 1, 19 options)', () => {
    const facet = findRulesFacet('dnd5e.2024', 'class', 'rogue-xphb')!
    expect(facet.grants?.some((g) => g.set === 'value:language.thieves_cant.known' && g.to === true)).toBe(true)
    const choice = facet.choices?.find((c) => c.choiceSet === 'choice:language.known')
    expect(choice?.count).toBe(1)
    expect(choice?.from).toHaveLength(19)
  })

  it('Ranger declares progression:class.language-deft-explorer at Level 2, alongside (never merged with) the Expertise row', () => {
    const facet = findRulesFacet('dnd5e.2024', 'class', 'ranger-xphb')!
    expect(facet.progression).toContain('progression:class.language-deft-explorer')
    expect(facet.progression).toContain('progression:class.skill-expertise-deft-explorer')
  })

  it('Druid grants Druidic fixed, and declares NO language choice of its own', () => {
    const facet = findRulesFacet('dnd5e.2024', 'class', 'druid-xphb')!
    expect(facet.grants?.some((g) => g.set === 'value:language.druidic.known' && g.to === true)).toBe(true)
    expect(facet.choices?.some((c) => c.choiceSet === 'choice:language.known')).toBe(false)
  })
})
