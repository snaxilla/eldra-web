// PHASE 2C.2B -- the REAL assembleCharacter, exercised through its real Directus
// read boundary only (the entity read and the one block_instances query). Nothing
// about assembly is stubbed: class resolution, the Level-1 fallback, progression
// normalization, and feat resolution all run as shipped.
//
// The point: an OLD character (catalogue_selection present, progression absent)
// must keep resolving Level 1 exactly as before; a NEW creation-time character
// (progression present) must be read from its stored block. Both must agree on the
// class by construction.

import { readFileSync } from 'node:fs'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  directusServiceRequest: vi.fn(),
  getWorldContentCatalogue: vi.fn()
}))

vi.mock('../../../server/utils/directus', () => ({ directusServiceRequest: mocks.directusServiceRequest }))
vi.mock('../../../server/utils/world-content-catalogue', () => ({ getWorldContentCatalogue: mocks.getWorldContentCatalogue }))

import { assembleCharacter } from '../../../server/utils/character-assembly'
import { findRulesFacet } from '../../../app/lib/content-rules'
import { resolveDnd5eFeatMechanics } from '../../../app/lib/feat-mechanics/dnd5e'
import xphbFeats from '../../lib/feat-mechanics/fixtures/xphb-feats.json'

const WORLD_ID = '5'
const CHARACTER_ID = '4242'
const PKG = 'eldra.solaris.xphb'

const entry = (title: string, slug: string, extra: Record<string, unknown> = {}) => ({
  packageId: PKG, packageVersion: '1.0.10', systemKey: 'dnd5e', title, slug, externalId: `${title}__XPHB`, provider: '5etools-json', ...extra
})

const slugOf = (name: string) => `${name.toLowerCase().replace(/ /g, '-')}-xphb`
const CATALOGUE = {
  worldId: WORLD_ID,
  packs: [],
  species: [entry('Human', 'human-xphb', { rulesFacet: findRulesFacet('dnd5e.2024', 'species', 'human-xphb') ?? undefined })],
  classes: [entry('Fighter', 'fighter-xphb', { rulesFacet: findRulesFacet('dnd5e.2024', 'class', 'fighter-xphb') ?? undefined })],
  backgrounds: [entry('Sage', 'sage-xphb', { rulesFacet: findRulesFacet('dnd5e.2024', 'background', 'sage-xphb') ?? undefined })],
  subclasses: [],
  items: [],
  spells: [],
  monsters: [],
  feats: xphbFeats.feats.map((raw) => entry(raw.name, slugOf(raw.name), {
    featMechanics: resolveDnd5eFeatMechanics(raw),
    rulesFacet: findRulesFacet('dnd5e.2024', 'feat', slugOf(raw.name)) ?? undefined
  }))
}

const CATALOGUE_SELECTION = {
  species: { packageId: PKG, slug: 'human-xphb' },
  class: { packageId: PKG, slug: 'fighter-xphb' },
  background: { packageId: PKG, slug: 'sage-xphb' }
}

// The Directus rows this character has, as the real store would hold them.
let rows: { block_key: string, data: unknown }[] = []

beforeEach(() => {
  mocks.getWorldContentCatalogue.mockResolvedValue(CATALOGUE)
  mocks.directusServiceRequest.mockImplementation(async (path: string) => {
    if (path.startsWith('/items/entities')) {
      return { data: { id: Number(CHARACTER_ID), world_id: Number(WORLD_ID), entity_type: 'pc', title: 'Brenna' } }
    }
    if (path.startsWith('/items/block_instances')) return { data: rows }
    return { data: null }
  })
})

describe('an OLD character -- catalogue_selection present, progression absent', () => {
  beforeEach(() => {
    rows = [{ block_key: 'catalogue_selection', data: CATALOGUE_SELECTION }]
  })

  it('assembly still resolves the Fighter and a Level-1 progression from catalogue_selection (the existing fallback)', async () => {
    const result = await assembleCharacter(WORLD_ID, CHARACTER_ID)
    expect(result.available).toBe(true)
    if (!result.available) return
    expect(result.blueprint.class.status).toBe('resolved')
    expect(result.blueprint.progression.classes).toEqual([
      { classRef: { packageId: PKG, slug: 'fighter-xphb' }, level: 1 }
    ])
    expect(result.blueprint.progression.feats).toEqual([])
    expect(result.blueprint.feats).toEqual([])
  })
})

describe('a NEW creation-time character -- canonical progression present', () => {
  const archery = { packageId: PKG, slug: 'archery-xphb' }
  const choiceKey = 'class:progression:1:choice:feat.fighting-style.fs-only'

  beforeEach(() => {
    rows = [
      { block_key: 'catalogue_selection', data: CATALOGUE_SELECTION },
      {
        block_key: 'progression',
        data: {
          classes: [{ classRef: { packageId: PKG, slug: 'fighter-xphb' }, level: 1, subclassRef: null }],
          feats: [{ featRef: archery, choiceKey }]
        }
      }
    ]
  })

  it('assembly reads the stored progression and resolves the owned creation feat', async () => {
    const result = await assembleCharacter(WORLD_ID, CHARACTER_ID)
    expect(result.available).toBe(true)
    if (!result.available) return
    expect(result.blueprint.progression.classes[0]).toMatchObject({ level: 1, subclassRef: null })
    expect(result.blueprint.feats).toEqual([
      expect.objectContaining({ status: 'resolved', choiceKey, entry: expect.objectContaining({ slug: 'archery-xphb' }) })
    ])
  })

  it('the stored progression class ref equals the catalogue_selection class ref byte-for-byte', async () => {
    const result = await assembleCharacter(WORLD_ID, CHARACTER_ID)
    if (!result.available) throw new Error('assembly unavailable')
    const selected = CATALOGUE_SELECTION.class
    const stored = result.blueprint.progression.classes[0]!.classRef
    expect(JSON.stringify(stored)).toBe(JSON.stringify({ packageId: selected.packageId, slug: selected.slug }))
  })
})
