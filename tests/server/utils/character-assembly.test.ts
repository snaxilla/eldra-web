// Unit tests for server/utils/character-assembly.ts -- Character Assembly
// Phase 1. getWorldContentCatalogue is mocked at the module boundary
// (already independently tested by world-content-catalogue.test.ts); this
// file is about resolution/reporting logic, not catalogue composition.
// directusServiceRequest (the entities/block_instances reads) is mocked as
// the Directus I/O boundary, mirroring create-v2.post.test.ts's own split.

import { beforeEach, describe, expect, it, vi } from 'vitest'

const { getWorldContentCatalogueMock, directusServiceRequestMock } = vi.hoisted(() => ({
  getWorldContentCatalogueMock: vi.fn(),
  directusServiceRequestMock: vi.fn()
}))

vi.mock('../../../server/utils/world-content-catalogue', () => ({
  getWorldContentCatalogue: getWorldContentCatalogueMock
}))

vi.mock('../../../server/utils/directus', () => ({
  directusServiceRequest: directusServiceRequestMock
}))

import { assembleCharacter } from '../../../server/utils/character-assembly'

function catalogueEntry(overrides: Partial<{ packageId: string; slug: string; title: string }> = {}) {
  return {
    packageId: 'eldra.content.srd-5.1',
    packageVersion: '1.0.0',
    systemKey: 'dnd5e',
    title: 'Human',
    slug: 'human',
    externalId: 'Human__PHB',
    provider: '5etools-json',
    sourceBook: 'PHB',
    sourcePage: '31',
    ...overrides
  }
}

function fullCatalogue(overrides: Partial<{ species: any[]; classes: any[]; backgrounds: any[]; packs: any[] }> = {}) {
  return {
    worldId: '5',
    packs: [{ ok: true, packageId: 'eldra.content.srd-5.1', version: '1.0.0', title: 'SRD 5.1', entryCount: 3 }],
    species: [catalogueEntry({ title: 'Human', slug: 'human' })],
    classes: [catalogueEntry({ title: 'Fighter', slug: 'fighter' })],
    backgrounds: [catalogueEntry({ title: 'Acolyte', slug: 'acolyte' })],
    feats: [],
    items: [],
    spells: [],
    ...overrides
  }
}

function selectionRef(entry: ReturnType<typeof catalogueEntry>) {
  return { ...entry }
}

// Phase 3: the single block_instances read now returns BOTH blocks, told
// apart by `block_key` -- so rows carry one. `abilityBlockData` is optional
// and defaults to absent, which is the state every character created before
// Phase 3 is genuinely in.
function mockEntityAndBlock(
  entity: any,
  blockData: any,
  abilityBlockData: any = null,
  inventoryBlockData: any = null,
  notesBlockData: any = null
) {
  directusServiceRequestMock.mockImplementation(async (path: string) => {
    if (path === '/items/entities/42') {
      return { data: entity }
    }
    if (path === '/items/block_instances') {
      const rows: any[] = []
      if (blockData) rows.push({ block_key: 'catalogue_selection', data: blockData })
      if (abilityBlockData) rows.push({ block_key: 'ability_scores', data: abilityBlockData })
      if (inventoryBlockData) rows.push({ block_key: 'inventory', data: inventoryBlockData })
      if (notesBlockData) rows.push({ block_key: 'notes', data: notesBlockData })
      return { data: rows }
    }
    throw new Error(`Unexpected Directus path in test: ${path}`)
  })
}

beforeEach(() => {
  getWorldContentCatalogueMock.mockReset()
  directusServiceRequestMock.mockReset()
})

describe('assembleCharacter', () => {
  it('resolves species, class, and background from the current catalogue', async () => {
    const catalogue = fullCatalogue()
    getWorldContentCatalogueMock.mockResolvedValue(catalogue)
    mockEntityAndBlock(
      { id: 42, world_id: 5, title: 'Aria' },
      { species: selectionRef(catalogue.species[0]), class: selectionRef(catalogue.classes[0]), background: selectionRef(catalogue.backgrounds[0]) }
    )

    const result = await assembleCharacter('5', '42')

    expect(result.available).toBe(true)
    if (!result.available) return

    expect(result.blueprint.worldId).toBe('5')
    expect(result.blueprint.characterId).toBe('42')
    expect(result.blueprint.characterTitle).toBe('Aria')

    expect(result.blueprint.species).toEqual({ status: 'resolved', entry: catalogue.species[0] })
    expect(result.blueprint.class).toEqual({ status: 'resolved', entry: catalogue.classes[0] })
    expect(result.blueprint.background).toEqual({ status: 'resolved', entry: catalogue.backgrounds[0] })
    expect(result.blueprint.packs).toEqual(catalogue.packs)
    // No ability_scores block in this fixture -- absent, never defaulted.
    expect(result.blueprint.abilityScores).toBeNull()
  })

  it('reports character-not-found for an entity that does not exist', async () => {
    getWorldContentCatalogueMock.mockResolvedValue(fullCatalogue())
    directusServiceRequestMock.mockImplementation(async (path: string) => {
      if (path === '/items/entities/999') return { data: null }
      throw new Error(`Unexpected Directus path in test: ${path}`)
    })

    const result = await assembleCharacter('5', '999')

    expect(result).toEqual({ available: false, reason: 'character-not-found' })
    expect(getWorldContentCatalogueMock).not.toHaveBeenCalled()
  })

  it('reports character-not-found for an entity that exists but belongs to a different World', async () => {
    getWorldContentCatalogueMock.mockResolvedValue(fullCatalogue())
    directusServiceRequestMock.mockImplementation(async (path: string) => {
      if (path === '/items/entities/42') return { data: { id: 42, world_id: 9, title: 'Aria' } }
      throw new Error(`Unexpected Directus path in test: ${path}`)
    })

    const result = await assembleCharacter('5', '42')

    expect(result).toEqual({ available: false, reason: 'character-not-found' })
  })

  it('reports character-not-found (not a crash) when the entity lookup itself throws -- Directus returns 403, not an empty result, for a nonexistent id', async () => {
    getWorldContentCatalogueMock.mockResolvedValue(fullCatalogue())
    directusServiceRequestMock.mockImplementation(async (path: string) => {
      if (path === '/items/entities/99999999') {
        throw new Error('403 Forbidden')
      }
      throw new Error(`Unexpected Directus path in test: ${path}`)
    })

    const result = await assembleCharacter('5', '99999999')

    expect(result).toEqual({ available: false, reason: 'character-not-found' })
    expect(getWorldContentCatalogueMock).not.toHaveBeenCalled()
  })

  it('reports no-catalogue-selection for a character with no catalogue_selection block (e.g. a V1 character)', async () => {
    getWorldContentCatalogueMock.mockResolvedValue(fullCatalogue())
    mockEntityAndBlock({ id: 42, world_id: 5, title: 'Aria' }, null)

    const result = await assembleCharacter('5', '42')

    expect(result.available).toBe(false)
    if (result.available) return
    expect(result.reason).toBe('no-catalogue-selection')
    expect(getWorldContentCatalogueMock).not.toHaveBeenCalled()
  })

  it('reports a missing slot (with a clear reason) when a recorded choice is no longer offered by its pack', async () => {
    const catalogue = fullCatalogue({ species: [] }) // Human removed from the current catalogue
    getWorldContentCatalogueMock.mockResolvedValue(catalogue)
    mockEntityAndBlock(
      { id: 42, world_id: 5, title: 'Aria' },
      {
        species: { packageId: 'eldra.content.srd-5.1', slug: 'human' },
        class: selectionRef(fullCatalogue().classes[0]),
        background: selectionRef(fullCatalogue().backgrounds[0])
      }
    )

    const result = await assembleCharacter('5', '42')

    expect(result.available).toBe(true)
    if (!result.available) return
    expect(result.blueprint.species).toMatchObject({ status: 'missing', packageId: 'eldra.content.srd-5.1', slug: 'human' })
    expect((result.blueprint.species as any).reason).toMatch(/no longer offered/)
    // The other two slots are unaffected by one missing slot.
    expect(result.blueprint.class.status).toBe('resolved')
    expect(result.blueprint.background.status).toBe('resolved')
  })

  it('reports a missing slot with a distinct reason when the choice depends on a Content Pack that failed to load', async () => {
    const catalogue = fullCatalogue({
      species: [],
      packs: [
        { ok: false, packageId: 'eldra.content.srd-5.1', version: '1.0.0', failure: { stage: 'not-found', packageId: 'eldra.content.srd-5.1', version: '1.0.0' } }
      ]
    })
    getWorldContentCatalogueMock.mockResolvedValue(catalogue)
    mockEntityAndBlock(
      { id: 42, world_id: 5, title: 'Aria' },
      {
        species: { packageId: 'eldra.content.srd-5.1', slug: 'human' },
        class: selectionRef(fullCatalogue().classes[0]),
        background: selectionRef(fullCatalogue().backgrounds[0])
      }
    )

    const result = await assembleCharacter('5', '42')

    expect(result.available).toBe(true)
    if (!result.available) return
    expect(result.blueprint.species).toMatchObject({ status: 'missing', packageId: 'eldra.content.srd-5.1', slug: 'human' })
    expect((result.blueprint.species as any).reason).toMatch(/failed to load/)
    expect(result.blueprint.packs.some((p) => !p.ok)).toBe(true)
  })

  it('reports a missing slot when a choice was never recorded at all', async () => {
    const catalogue = fullCatalogue()
    getWorldContentCatalogueMock.mockResolvedValue(catalogue)
    mockEntityAndBlock(
      { id: 42, world_id: 5, title: 'Aria' },
      { class: selectionRef(catalogue.classes[0]), background: selectionRef(catalogue.backgrounds[0]) } // no species key at all
    )

    const result = await assembleCharacter('5', '42')

    expect(result.available).toBe(true)
    if (!result.available) return
    expect(result.blueprint.species).toMatchObject({ status: 'missing', packageId: '', slug: '' })
    expect((result.blueprint.species as any).reason).toMatch(/No Species was recorded/)
  })
})

// ---------------------------------------------------------------------------
// Character Builder / Character Sheet Phase 3 -- ability scores.
// ---------------------------------------------------------------------------
// Phase 1 excluded ability scores from the blueprint entirely. Phase 3 adds
// them in the narrowest way: PASSED THROUGH from the character's own record,
// resolved against nothing, interpreted by no one. These tests pin both the
// pass-through and the fact that nothing is derived from it.

describe('assembleCharacter -- ability scores', () => {
  const SCORES = { str: 15, dex: 14, con: 13, int: 12, wis: 10, cha: 8 }

  function selectionFor(catalogue: ReturnType<typeof fullCatalogue>) {
    return {
      species: selectionRef(catalogue.species[0]),
      class: selectionRef(catalogue.classes[0]),
      background: selectionRef(catalogue.backgrounds[0])
    }
  }

  it('carries stored ability scores through verbatim', async () => {
    const catalogue = fullCatalogue()
    getWorldContentCatalogueMock.mockResolvedValue(catalogue)
    mockEntityAndBlock(
      { id: 42, world_id: 5, title: 'Aria' },
      {
        species: selectionRef(catalogue.species[0]),
        class: selectionRef(catalogue.classes[0]),
        background: selectionRef(catalogue.backgrounds[0])
      },
      { method: 'point-buy', scores: SCORES }
    )

    const result = await assembleCharacter('5', '42')
    expect(result.available).toBe(true)
    if (!result.available) return

    expect(result.blueprint.abilityScores).toEqual({ method: 'point-buy', scores: SCORES })
  })

  it('derives NOTHING from the scores -- no modifier, save, skill, HP, or initiative appears', async () => {
    const catalogue = fullCatalogue()
    getWorldContentCatalogueMock.mockResolvedValue(catalogue)
    mockEntityAndBlock(
      { id: 42, world_id: 5, title: 'Aria' },
      {
        species: selectionRef(catalogue.species[0]),
        class: selectionRef(catalogue.classes[0]),
        background: selectionRef(catalogue.backgrounds[0])
      },
      { method: 'manual', scores: SCORES }
    )

    const result = await assembleCharacter('5', '42')
    if (!result.available) throw new Error('expected an available blueprint')

    const stored = result.blueprint.abilityScores!
    expect(Object.keys(stored).sort()).toEqual(['method', 'scores'])
    expect(JSON.stringify(stored)).not.toMatch(/modifier|save|skill|hitPoint|initiative|armorClass/i)
  })

  it('reports null for a character that has no ability_scores block -- every pre-Phase-3 character', async () => {
    const catalogue = fullCatalogue()
    getWorldContentCatalogueMock.mockResolvedValue(catalogue)
    mockEntityAndBlock({ id: 42, world_id: 5, title: 'Aria' }, {
        species: selectionRef(catalogue.species[0]),
        class: selectionRef(catalogue.classes[0]),
        background: selectionRef(catalogue.backgrounds[0])
      })

    const result = await assembleCharacter('5', '42')
    if (!result.available) throw new Error('expected an available blueprint')

    expect(result.blueprint.abilityScores).toBeNull()
  })

  it('degrades an unreadable stored record to null rather than rendering half a row', async () => {
    const catalogue = fullCatalogue()
    getWorldContentCatalogueMock.mockResolvedValue(catalogue)
    mockEntityAndBlock(
      { id: 42, world_id: 5, title: 'Aria' },
      {
        species: selectionRef(catalogue.species[0]),
        class: selectionRef(catalogue.classes[0]),
        background: selectionRef(catalogue.backgrounds[0])
      },
      { method: 'manual', scores: { str: 15, dex: 14 } }
    )

    const result = await assembleCharacter('5', '42')
    if (!result.available) throw new Error('expected an available blueprint')

    expect(result.blueprint.abilityScores).toBeNull()
    // ...and the catalogue choices are unaffected by the bad neighbour.
    expect(result.blueprint.species.status).toBe('resolved')
  })

  it('reads all five blocks in ONE Directus round trip', async () => {
    const catalogue = fullCatalogue()
    getWorldContentCatalogueMock.mockResolvedValue(catalogue)
    mockEntityAndBlock(
      { id: 42, world_id: 5, title: 'Aria' },
      {
        species: selectionRef(catalogue.species[0]),
        class: selectionRef(catalogue.classes[0]),
        background: selectionRef(catalogue.backgrounds[0])
      },
      { method: 'manual', scores: SCORES }
    )

    await assembleCharacter('5', '42')

    const blockCalls = directusServiceRequestMock.mock.calls.filter(([path]) => path === '/items/block_instances')
    expect(blockCalls).toHaveLength(1)
    expect(blockCalls[0][1].query.filter._and[1].block_key._in).toEqual([
      'catalogue_selection', 'ability_scores', 'rules_choices', 'inventory', 'notes'
    ])
  })
})

// ---------------------------------------------------------------------------
// Inventory -- the first V1 feature on the new architecture
// ---------------------------------------------------------------------------

describe('assembleCharacter -- inventory', () => {
  const LONGSWORD = catalogueEntry({ title: 'Longsword', slug: 'longsword', sourceBook: 'XPHB' })

  function withItems(items: any[], catalogueItems: any[] = [LONGSWORD]) {
    const catalogue = fullCatalogue({ items: catalogueItems } as any)
    getWorldContentCatalogueMock.mockResolvedValue(catalogue)
    mockEntityAndBlock(
      { id: 42, world_id: 5, title: 'Aria' },
      {
        species: selectionRef(catalogue.species[0]),
        class: selectionRef(catalogue.classes[0]),
        background: selectionRef(catalogue.backgrounds[0])
      },
      null,
      { items }
    )
    return catalogue
  }

  it('is an empty list, never null, when nothing was ever recorded', async () => {
    const catalogue = fullCatalogue()
    getWorldContentCatalogueMock.mockResolvedValue(catalogue)
    mockEntityAndBlock({ id: 42, world_id: 5, title: 'Aria' }, {
        species: selectionRef(catalogue.species[0]),
        class: selectionRef(catalogue.classes[0]),
        background: selectionRef(catalogue.backgrounds[0])
      })

    const result = await assembleCharacter('5', '42')
    expect(result.available && result.blueprint.inventory).toEqual([])
  })

  it('resolves a reference against the catalogue and takes its title from there', async () => {
    withItems([{
      instanceId: 'item-1',
      ref: { packageId: LONGSWORD.packageId, slug: 'longsword' },
      quantity: 2,
      equipped: true,
      attuned: false
    }])

    const result = await assembleCharacter('5', '42')
    const item = result.available ? result.blueprint.inventory[0] : null

    expect(item).toMatchObject({ status: 'resolved', title: 'Longsword', quantity: 2, equipped: true })
    expect(item?.entry?.sourceBook).toBe('XPHB')
  })

  it('reflects a repin rather than a stored copy -- the title follows the catalogue', async () => {
    // The whole point of storing a reference instead of a snapshot: rename
    // the published item and every character carrying it updates.
    withItems(
      [{ instanceId: 'item-1', ref: { packageId: LONGSWORD.packageId, slug: 'longsword' }, quantity: 1, equipped: false, attuned: false }],
      [catalogueEntry({ title: 'Longsword, +1', slug: 'longsword', sourceBook: 'XDMG' })]
    )

    const result = await assembleCharacter('5', '42')
    expect(result.available && result.blueprint.inventory[0]?.title).toBe('Longsword, +1')
  })

  it('reports a reference that no longer resolves instead of dropping it', async () => {
    withItems(
      [{ instanceId: 'item-1', ref: { packageId: LONGSWORD.packageId, slug: 'gone' }, quantity: 1, equipped: false, attuned: false }],
      [LONGSWORD]
    )

    const result = await assembleCharacter('5', '42')
    const item = result.available ? result.blueprint.inventory[0] : null

    expect(item?.status).toBe('missing')
    expect(item?.title).toContain('unavailable')
    expect(item?.reason).toBeTruthy()
  })

  it('carries a custom item through with the name the player typed', async () => {
    withItems([{ instanceId: 'item-1', name: 'Letter from the duke', quantity: 1, equipped: false, attuned: false }])

    const result = await assembleCharacter('5', '42')
    expect(result.available && result.blueprint.inventory[0]).toMatchObject({
      status: 'custom',
      title: 'Letter from the duke'
    })
  })

  it('keeps custom items usable in a World with no item content bound', async () => {
    withItems([{ instanceId: 'item-1', name: 'Rope', quantity: 1, equipped: false, attuned: false }], [])

    const result = await assembleCharacter('5', '42')
    expect(result.available && result.blueprint.inventory[0]?.status).toBe('custom')
  })

  it('derives nothing -- no weight, value, capacity, or armour class appears', async () => {
    withItems([{
      instanceId: 'item-1',
      ref: { packageId: LONGSWORD.packageId, slug: 'longsword' },
      quantity: 3,
      equipped: true,
      attuned: true
    }])

    const result = await assembleCharacter('5', '42')
    const item: any = result.available ? result.blueprint.inventory[0] : {}

    for (const derived of ['weight', 'totalWeight', 'value', 'cost', 'armorClass', 'ac', 'capacity']) {
      expect(item[derived]).toBeUndefined()
    }
  })

  it('re-validates the stored block rather than trusting it', async () => {
    // One malformed row is dropped; the readable one survives.
    withItems([
      { instanceId: 'item-1', ref: { packageId: LONGSWORD.packageId, slug: 'longsword' }, quantity: 1, equipped: false, attuned: false },
      { instanceId: 'item-2', quantity: 4 }
    ])

    const result = await assembleCharacter('5', '42')
    expect(result.available && result.blueprint.inventory).toHaveLength(1)
  })
})

// ---------------------------------------------------------------------------
// Notes -- the second V1 feature on the new architecture
// ---------------------------------------------------------------------------

describe('assembleCharacter -- notes', () => {
  function withNotes(notesBlockData: any) {
    const catalogue = fullCatalogue()
    getWorldContentCatalogueMock.mockResolvedValue(catalogue)
    mockEntityAndBlock(
      { id: 42, world_id: 5, title: 'Aria' },
      {
        species: selectionRef(catalogue.species[0]),
        class: selectionRef(catalogue.classes[0]),
        background: selectionRef(catalogue.backgrounds[0])
      },
      null,
      null,
      notesBlockData
    )
  }

  it('is null, never an empty record, when nothing was ever recorded', async () => {
    withNotes(null)
    const result = await assembleCharacter('5', '42')
    expect(result.available && result.blueprint.notes).toBeNull()
  })

  it('survives assembly unchanged -- notes resolve against nothing', async () => {
    const stored = {
      general: 'Reminder', appearance: 'Tall', personality: 'Blunt',
      backstory: 'Port town', goals: 'Find the sword', secrets: 'Is a spy'
    }
    withNotes(stored)

    const result = await assembleCharacter('5', '42')
    expect(result.available && result.blueprint.notes).toEqual(stored)
  })

  it('re-validates the stored block rather than trusting it', async () => {
    withNotes({ general: 'ok', appearance: 42 })
    const result = await assembleCharacter('5', '42')
    expect(result.available && result.blueprint.notes).toMatchObject({ general: 'ok', appearance: '' })
  })

  it('is independent of inventory and rules choices -- reading one does not disturb another', async () => {
    const catalogue = fullCatalogue()
    getWorldContentCatalogueMock.mockResolvedValue(catalogue)
    mockEntityAndBlock(
      { id: 42, world_id: 5, title: 'Aria' },
      {
        species: selectionRef(catalogue.species[0]),
        class: selectionRef(catalogue.classes[0]),
        background: selectionRef(catalogue.backgrounds[0])
      },
      null,
      { items: [] },
      { general: 'present' }
    )

    const result = await assembleCharacter('5', '42')
    expect(result.available && result.blueprint.notes?.general).toBe('present')
    expect(result.available && result.blueprint.inventory).toEqual([])
  })
})
