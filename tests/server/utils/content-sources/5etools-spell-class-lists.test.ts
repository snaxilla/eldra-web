// D&D 2024 Character Rules P2 -- spell class-list enrichment (5etools-dataset.ts). Compile-time
// only: these functions run during Content Pack compilation, never at server request time (see
// that file's own header for why). Tested directly against the real corpus files.

import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { classListsFor, enrichSpellClassLists } from '../../../../server/utils/content-sources/dnd5e/5etools-dataset'
import { preview5eToolsSpells } from '../../../../app/lib/importers/5etools-spells'
import { toContentPublicationCandidates } from '../../../../server/utils/content-pack-5etools-adapter'

describe('P2 classListsFor -- direct class-list membership, read from the real generated lookup', () => {
  it('Fireball (real XPHB spell) is on exactly Sorcerer and Wizard', async () => {
    expect(await classListsFor('XPHB', 'Fireball')).toEqual(['Sorcerer', 'Wizard'])
  })

  it('Acid Splash (real XPHB cantrip) is on exactly Sorcerer and Wizard', async () => {
    expect(await classListsFor('XPHB', 'Acid Splash')).toEqual(['Sorcerer', 'Wizard'])
  })

  it('Cure Wounds (real XPHB spell) is on the real five-class list, and does not include Wizard', async () => {
    const classes = await classListsFor('XPHB', 'Cure Wounds')
    expect(classes).toEqual(['Bard', 'Cleric', 'Druid', 'Paladin', 'Ranger'])
    expect(classes).not.toContain('Wizard')
  })

  it('a name the lookup has no entry for resolves to an empty list, never a thrown error', async () => {
    expect(await classListsFor('XPHB', 'Not A Real Spell Name XYZ')).toEqual([])
  })

  it('is case-insensitive on both source and name (matching the lookup\'s own lowercase keys)', async () => {
    expect(await classListsFor('xphb', 'fireball')).toEqual(['Sorcerer', 'Wizard'])
  })

  it('only DIRECT class-list membership is returned, never subclass-granted membership (Eldritch Knight/Arcane Trickster get Fireball via their own subclass grant, not the class list)', async () => {
    const classes = await classListsFor('XPHB', 'Fireball')
    expect(classes).not.toContain('Fighter')
    expect(classes).not.toContain('Rogue')
  })
})

describe('P2 enrichSpellClassLists -- attaches classLists to a copy, never mutates the input', () => {
  it('attaches the real membership to a matching row, and leaves a row with no membership unmarked', async () => {
    const rows = [
      { name: 'Fireball', source: 'XPHB', level: 3, school: 'V' },
      { name: 'Not A Real Spell Name XYZ', source: 'XPHB', level: 1, school: 'V' }
    ]
    const [fireball, unknown] = await enrichSpellClassLists(rows) as Record<string, unknown>[]
    expect(fireball!.classLists).toEqual(['Sorcerer', 'Wizard'])
    expect('classLists' in unknown!).toBe(false)
  })

  it('never mutates the original row objects (a fresh copy is returned when enriched)', async () => {
    const original = { name: 'Fireball', source: 'XPHB', level: 3, school: 'V' }
    const [enriched] = await enrichSpellClassLists([original]) as Record<string, unknown>[]
    expect('classLists' in original).toBe(false)
    expect(enriched).not.toBe(original)
  })
})

// THE COMPILE BOUNDARY, proven end to end: a REAL raw corpus row, enriched, through the REAL
// importer (preview5eToolsSpells) and the REAL candidate adapter (toContentPublicationCandidate)
// -- the exact two functions server/utils/content-sources/dnd5e/5etools-collection.ts's own
// `loadCategory` calls in production. This is deliberately NOT the same boundary
// spell-option-eligibility.test.ts proves (that file starts from an already-enriched raw object
// and calls the spell-mechanics resolver directly); this test proves the metadata actually
// SURVIVES candidate compilation, which no other test in this phase checks.
describe('P2 compile boundary -- classLists reaches the compiled ContentPublicationCandidate.data', () => {
  it('a real spell row, enriched, compiled through the real importer+adapter pipeline, carries its real class-list membership in the candidate\'s own data', async () => {
    const raw = (JSON.parse(readFileSync('/opt/eldra/datasets/5etools-src/data/spells/spells-xphb.json', 'utf8')) as { spell: Record<string, unknown>[] })
      .spell.find((s) => s.name === 'Fireball')
    expect(raw).toBeDefined()

    const [enriched] = await enrichSpellClassLists([raw])
    const preview = preview5eToolsSpells([enriched])
    const [candidate] = toContentPublicationCandidates(preview)

    expect((candidate!.data as Record<string, unknown>).classLists).toEqual(['Sorcerer', 'Wizard'])
    // And the rest of the compiled candidate is untouched -- this is an ADDITIVE field, not a
    // replacement of the existing compiled shape.
    expect((candidate!.data as Record<string, unknown>).level).toBe(3)
    expect(candidate!.slug).toBe('fireball-xphb')
  })

  it('a spell the lookup names no membership for compiles with no classLists field at all (absence, not an empty array) -- this IS Solaris\'s currently-published shape, pre-refresh', async () => {
    const unknownRaw = { name: 'Not A Real Spell Name XYZ', source: 'XPHB', level: 1, school: 'V' }
    const [enrichedUnknown] = await enrichSpellClassLists([unknownRaw])
    const [unknownCandidate] = toContentPublicationCandidates(preview5eToolsSpells([enrichedUnknown]))
    expect('classLists' in (unknownCandidate!.data as Record<string, unknown>)).toBe(false)
  })
})
