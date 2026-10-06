// PRODUCTION-PATH ACCEPTANCE -- HISTORICAL characters still load, with the REAL completeness authority
// in place (this file never stubs it). Fail-closed applies to authoritative MUTATION (creation and
// progression Confirm) only. A character created before this contract, with a mandatory decision absent
// from its record, must still assemble for read and Sheet display, and the read path performs no write
// (no automatic migration, no retroactive grant). That the read path never imports the authority is
// asserted statically in tests/rules/completeness-stub-policy.test.ts.

import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  directusServiceRequest: vi.fn(),
  getWorldContentCatalogue: vi.fn()
}))

vi.mock('../../../server/utils/directus', () => ({ directusServiceRequest: mocks.directusServiceRequest }))
vi.mock('../../../server/utils/world-content-catalogue', () => ({ getWorldContentCatalogue: mocks.getWorldContentCatalogue }))

import { assembleCharacter } from '../../../server/utils/character-assembly'
import { findRulesFacet } from '../../../app/lib/content-rules'

const WORLD_ID = '5'
const CHARACTER_ID = '4242'
const PKG = 'eldra.solaris.xphb'
const entry = (title: string, slug: string, extra: Record<string, unknown> = {}) => ({
  packageId: PKG, packageVersion: '1.0.10', systemKey: 'dnd5e', title, slug, externalId: `${title}__XPHB`, provider: '5etools-json', ...extra
})

// A historical Elf Wizard: created before the contract, with no progression block and an
// unrecorded lineage choice. It must still assemble.
const CATALOGUE = {
  worldId: WORLD_ID, packs: [],
  species: [entry('Elf', 'elf-xphb', { rulesFacet: findRulesFacet('dnd5e.2024', 'species', 'elf-xphb') ?? undefined })],
  classes: [entry('Wizard', 'wizard-xphb', { rulesFacet: findRulesFacet('dnd5e.2024', 'class', 'wizard-xphb') ?? undefined })],
  backgrounds: [entry('Criminal', 'criminal-xphb', { rulesFacet: findRulesFacet('dnd5e.2024', 'background', 'criminal-xphb') ?? undefined })],
  subclasses: [], items: [], spells: [], monsters: [], feats: []
}
const CATALOGUE_SELECTION = {
  species: { packageId: PKG, slug: 'elf-xphb' },
  class: { packageId: PKG, slug: 'wizard-xphb' },
  background: { packageId: PKG, slug: 'criminal-xphb' }
}

beforeEach(() => {
  mocks.getWorldContentCatalogue.mockResolvedValue(CATALOGUE)
  mocks.directusServiceRequest.mockImplementation(async (path: string) => {
    if (path.startsWith('/items/entities')) {
      return { data: { id: Number(CHARACTER_ID), world_id: Number(WORLD_ID), entity_type: 'pc', title: 'Historic' } }
    }
    if (path.startsWith('/items/block_instances')) {
      return { data: [{ block_key: 'catalogue_selection', data: CATALOGUE_SELECTION }] }
    }
    return { data: null }
  })
})

describe('PHASE 0 -- a historical character with an unrecorded mandatory decision still loads', () => {
  it('assembles for read and display, even though its species lineage was never recorded', async () => {
    const result = await assembleCharacter(WORLD_ID, CHARACTER_ID)
    expect(result.available).toBe(true)
  })

  it('the read path performs no write (the historical record is left exactly as stored)', async () => {
    await assembleCharacter(WORLD_ID, CHARACTER_ID)
    const writes = mocks.directusServiceRequest.mock.calls.filter((call) => {
      const options = call[1] as { method?: string } | undefined
      return options?.method && options.method !== 'GET'
    })
    expect(writes).toHaveLength(0)
  })
})
