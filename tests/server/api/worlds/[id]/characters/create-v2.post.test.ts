// Unit tests for POST /api/worlds/:id/characters/create-v2 -- Character
// Creation V2. requireCapability/can are exercised for REAL (not mocked);
// getWorldContentCatalogue and entity-factory.ts (createEntityRecord/
// dxFetch, the Directus I/O boundary) are mocked -- this file is about
// catalogue-driven validation and request handling, not Directus
// persistence (already covered by content-pack-publishing.test.ts /
// world-content-catalogue.test.ts).

import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { H3Event } from 'h3'

const {
  getWorldContentCatalogueMock, createEntityRecordMock, dxFetchMock, saveCharacterAbilityScoresMock,
  getDerivedCharacterMock, saveCharacterHealthMock
} = vi.hoisted(() => ({
  getWorldContentCatalogueMock: vi.fn(),
  createEntityRecordMock: vi.fn(),
  dxFetchMock: vi.fn(),
  saveCharacterAbilityScoresMock: vi.fn(),
  getDerivedCharacterMock: vi.fn(),
  saveCharacterHealthMock: vi.fn()
}))

vi.mock('../../../../../../server/utils/world-content-catalogue', () => ({
  getWorldContentCatalogue: getWorldContentCatalogueMock
}))

vi.mock('../../../../../../server/utils/entity-factory', () => ({
  createEntityRecord: createEntityRecordMock,
  dxFetch: dxFetchMock
}))

vi.mock('../../../../../../server/utils/character-ability-scores', () => ({
  saveCharacterAbilityScores: saveCharacterAbilityScoresMock
}))

// Character Sheet Caster Pass 0 -- mocked at the module boundary, matching
// every sibling mock above: this file is about request handling/validation,
// not Rules Engine derivation (already covered by character-derived.test.ts)
// or health persistence (character-health's own tests).
vi.mock('../../../../../../server/utils/character-derived', () => ({
  getDerivedCharacter: getDerivedCharacterMock
}))

vi.mock('../../../../../../server/utils/character-health', () => ({
  saveCharacterHealth: saveCharacterHealthMock
}))

import handler from '../../../../../../server/api/worlds/[id]/characters/create-v2.post'
import type { Principal } from '../../../../../../server/utils/authorization'

function catalogueEntry(overrides: Partial<{ packageId: string; packageVersion: string; slug: string; title: string }> = {}) {
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

function fullCatalogue(overrides: Partial<{ species: any[]; classes: any[]; backgrounds: any[] }> = {}) {
  return {
    worldId: '5',
    packs: [],
    species: [catalogueEntry({ title: 'Human', slug: 'human' })],
    classes: [catalogueEntry({ title: 'Fighter', slug: 'fighter' })],
    backgrounds: [catalogueEntry({ title: 'Acolyte', slug: 'acolyte' })],
    feats: [],
    items: [],
    spells: [],
    ...overrides
  }
}

function playerPrincipal(worldId = '5'): Principal {
  return {
    accountId: 'player-1',
    platformCapabilities: new Set(),
    worldCapabilities: new Map([[worldId, new Set(['world.read', 'world.character.create', 'world.character.edit_own', 'world.roll.execute'])]]),
    temporarySingleUserMode: false
  }
}

function observerPrincipal(worldId = '5'): Principal {
  return {
    accountId: 'observer-1',
    platformCapabilities: new Set(),
    worldCapabilities: new Map([[worldId, new Set(['world.read'])]]),
    temporarySingleUserMode: false
  }
}

function fakeEvent(worldId: string, principal: Principal | null, body: unknown): H3Event {
  return {
    context: { principal, params: { id: worldId } },
    node: { req: {}, res: { statusCode: 200 } },
    _requestBody: body
  } as unknown as H3Event
}

vi.mock('h3', async () => {
  const actual = await vi.importActual<typeof import('h3')>('h3')
  return {
    ...actual,
    readBody: vi.fn(async (event: any) => event._requestBody)
  }
})

function selectionOf(entry: ReturnType<typeof catalogueEntry>) {
  return { packageId: entry.packageId, slug: entry.slug, title: entry.title, externalId: entry.externalId }
}

beforeEach(() => {
  getWorldContentCatalogueMock.mockReset()
  createEntityRecordMock.mockReset()
  dxFetchMock.mockReset()
  dxFetchMock.mockResolvedValue({ data: {} })
  saveCharacterAbilityScoresMock.mockReset()
  saveCharacterAbilityScoresMock.mockImplementation(async (_id: unknown, stored: unknown) => stored)
  getDerivedCharacterMock.mockReset()
  // Default: unavailable (e.g. no Rules Package activated), matching this
  // route's own real-world default World state -- every EXISTING test in
  // this file (written before Caster Pass 0) asserts on behavior that must
  // hold regardless of Rules Engine availability, so none of them should
  // incidentally start seeding health. Tests that specifically exercise
  // health seeding override this per-test.
  getDerivedCharacterMock.mockResolvedValue({ available: false, reason: 'rules-unconfigured', message: 'no rules package' })
  saveCharacterHealthMock.mockReset()
  saveCharacterHealthMock.mockImplementation(async (_id: unknown, stored: unknown) => stored)
})

describe('POST /api/worlds/:id/characters/create-v2', () => {
  it('fails with 401 when no principal is present', async () => {
    getWorldContentCatalogueMock.mockResolvedValue(fullCatalogue())

    await expect(handler(fakeEvent('5', null, { title: 'Aria' }))).rejects.toMatchObject({ statusCode: 401 })
    expect(createEntityRecordMock).not.toHaveBeenCalled()
  })

  it('fails with 403 for a principal lacking world.character.create', async () => {
    getWorldContentCatalogueMock.mockResolvedValue(fullCatalogue())

    await expect(handler(fakeEvent('5', observerPrincipal(), { title: 'Aria' }))).rejects.toMatchObject({ statusCode: 403 })
    expect(createEntityRecordMock).not.toHaveBeenCalled()
  })

  it('fails with 400 when the character name is missing', async () => {
    getWorldContentCatalogueMock.mockResolvedValue(fullCatalogue())

    await expect(handler(fakeEvent('5', playerPrincipal(), { title: '   ' }))).rejects.toMatchObject({ statusCode: 400 })
    expect(createEntityRecordMock).not.toHaveBeenCalled()
  })

  it('fails with 400 when a choice does not match any entry in the current catalogue -- no hardcoded/stale options accepted', async () => {
    const catalogue = fullCatalogue()
    getWorldContentCatalogueMock.mockResolvedValue(catalogue)

    const body = {
      title: 'Aria',
      species: { packageId: 'eldra.content.srd-5.1', slug: 'does-not-exist' },
      class: selectionOf(catalogue.classes[0]),
      background: selectionOf(catalogue.backgrounds[0])
    }

    await expect(handler(fakeEvent('5', playerPrincipal(), body))).rejects.toMatchObject({ statusCode: 400 })
    expect(createEntityRecordMock).not.toHaveBeenCalled()
  })

  it('fails with 400 when the catalogue is empty for a category -- there is nothing valid to choose', async () => {
    getWorldContentCatalogueMock.mockResolvedValue(fullCatalogue({ species: [] }))

    const catalogue = fullCatalogue()
    const body = {
      title: 'Aria',
      species: { packageId: 'eldra.content.srd-5.1', slug: 'human' },
      class: selectionOf(catalogue.classes[0]),
      background: selectionOf(catalogue.backgrounds[0])
    }

    await expect(handler(fakeEvent('5', playerPrincipal(), body))).rejects.toMatchObject({ statusCode: 400 })
    expect(createEntityRecordMock).not.toHaveBeenCalled()
  })

  it('succeeds for a Player choosing real catalogue entries -- creates a minimal pc entity and records the selection, nothing more', async () => {
    const catalogue = fullCatalogue()
    getWorldContentCatalogueMock.mockResolvedValue(catalogue)
    createEntityRecordMock.mockResolvedValue({ success: true, id: 42, title: 'Aria', entity_type: 'pc' })

    const body = {
      title: 'Aria',
      species: selectionOf(catalogue.species[0]),
      class: selectionOf(catalogue.classes[0]),
      background: selectionOf(catalogue.backgrounds[0])
    }

    const result = await handler(fakeEvent('5', playerPrincipal(), body))

    expect(createEntityRecordMock).toHaveBeenCalledWith({ worldId: '5', title: 'Aria', entityType: 'pc' })

    const blockCall = dxFetchMock.mock.calls.find(([path]) => path === '/items/block_instances')
    expect(blockCall).toBeTruthy()
    const blockBody = JSON.parse(blockCall![1].body)
    expect(blockBody).toMatchObject({
      entity_id: 42,
      block_key: 'catalogue_selection',
      data: {
        species: catalogue.species[0],
        class: catalogue.classes[0],
        background: catalogue.backgrounds[0]
      }
    })

    // No ability scores, no character_sheets write, no rules evaluation --
    // dxFetch is called exactly once, for the block, never for
    // /items/character_sheets.
    expect(dxFetchMock).toHaveBeenCalledTimes(1)
    expect(result).toMatchObject({ id: 42, title: 'Aria' })
  })

  it('never persists the catalogue entry\'s presentation model into the character record', async () => {
    // ContentCatalogueEntry grew a `presentation` field in Character
    // Builder/Sheet Phase 2. Persisting the entry verbatim would have written
    // a rendered presentation snapshot per choice into every character, which
    // character-assembly.ts never reads -- it re-resolves by (packageId, slug)
    // against the CURRENT catalogue. The stored shape is pinned instead.
    const presentation = {
      kind: 'species',
      name: 'Human',
      description: [],
      facts: [{ label: 'Speed', value: '30 ft.' }],
      sections: [],
      notes: []
    }
    const catalogue = fullCatalogue({
      species: [{ ...catalogueEntry({ title: 'Human', slug: 'human' }), presentation }]
    })
    getWorldContentCatalogueMock.mockResolvedValue(catalogue)
    createEntityRecordMock.mockResolvedValue({ id: 42, title: 'Aria' })

    await handler(fakeEvent('5', playerPrincipal(), {
      title: 'Aria',
      species: selectionOf(catalogue.species[0]),
      class: selectionOf(catalogue.classes[0]),
      background: selectionOf(catalogue.backgrounds[0])
    }))

    const blockCall = dxFetchMock.mock.calls.find(([path]) => path === '/items/block_instances')
    const stored = JSON.parse(blockCall![1].body).data

    expect(stored.species).not.toHaveProperty('presentation')
    expect(Object.keys(stored.species).sort()).toEqual([
      'externalId',
      'packageId',
      'packageVersion',
      'provider',
      'slug',
      'sourceBook',
      'sourcePage',
      'systemKey',
      'title'
    ])
  })
})

// ---------------------------------------------------------------------------
// Character Builder / Character Sheet Phase 3 -- ability scores.
// ---------------------------------------------------------------------------
// `abilities` is OPTIONAL on this route by design (see the handler's own
// PHASE 3 note): the Builder requires it before enabling Create, but the API
// must stay able to create a character that has no scores yet, because
// characters predating Phase 3 exist and PUT .../abilities is how any of
// them acquire scores. Optional never means "may be garbage", which the
// rejection tests below pin down.

describe('POST /api/worlds/:id/characters/create-v2 -- ability scores', () => {
  const SCORES = { str: 15, dex: 14, con: 13, int: 12, wis: 10, cha: 8 }

  function bodyWith(abilities?: unknown) {
    const catalogue = fullCatalogue()
    getWorldContentCatalogueMock.mockResolvedValue(catalogue)
    createEntityRecordMock.mockResolvedValue({ id: 42, title: 'Aria' })

    const body: Record<string, unknown> = {
      title: 'Aria',
      species: selectionOf(catalogue.species[0]),
      class: selectionOf(catalogue.classes[0]),
      background: selectionOf(catalogue.backgrounds[0])
    }
    if (abilities !== undefined) body.abilities = abilities
    return body
  }

  it('persists valid ability scores through the ability-score util', async () => {
    const result = await handler(fakeEvent('5', playerPrincipal(), bodyWith({ method: 'standard-array', scores: SCORES })))

    expect(saveCharacterAbilityScoresMock).toHaveBeenCalledWith(42, { method: 'standard-array', scores: SCORES })
    expect(result).toMatchObject({ abilityScores: { method: 'standard-array', scores: SCORES } })
  })

  it('creates a character with NO scores when abilities is absent -- the pre-Phase-3 shape', async () => {
    const result = await handler(fakeEvent('5', playerPrincipal(), bodyWith()))

    expect(saveCharacterAbilityScoresMock).not.toHaveBeenCalled()
    expect(result).toMatchObject({ id: 42, abilityScores: null })
  })

  it('rejects a malformed abilities payload with a 400 and creates NOTHING', async () => {
    const body = bodyWith({ method: 'manual', scores: { str: 15, dex: 14 } })

    await expect(handler(fakeEvent('5', playerPrincipal(), body))).rejects.toMatchObject({ statusCode: 400 })

    // Validated before the entity is written, so a bad payload cannot leave
    // a half-built character behind.
    expect(createEntityRecordMock).not.toHaveBeenCalled()
    expect(saveCharacterAbilityScoresMock).not.toHaveBeenCalled()
  })

  it('rejects out-of-bounds scores', async () => {
    const body = bodyWith({ method: 'manual', scores: { ...SCORES, str: 99 } })
    await expect(handler(fakeEvent('5', playerPrincipal(), body))).rejects.toMatchObject({ statusCode: 400 })
  })

  it('stores the scores verbatim -- nothing derived is written alongside them', async () => {
    await handler(fakeEvent('5', playerPrincipal(), bodyWith({ method: 'point-buy', scores: SCORES })))

    const [, stored] = saveCharacterAbilityScoresMock.mock.calls[0]
    expect(stored).toEqual({ method: 'point-buy', scores: SCORES })
  })
})

// ---------------------------------------------------------------------------
// Character Sheet Caster Pass 0 -- initial health.
// ---------------------------------------------------------------------------
// A newly-created playable character's Current HP must start at the active
// Rules Package's own authoritative `value:hit_points.max`, never at the
// `emptyCharacterHealth()` fallback (currentHp: 0) the Sheet otherwise shows
// for "nothing recorded yet". This route never computes what that number
// IS -- these tests exist to prove exactly that: no class name, no hit-die
// size, and no Constitution formula appears anywhere in this route: it only
// asks `getDerivedCharacter` for one already-evaluated number and seeds
// Current HP at it.

describe('POST /api/worlds/:id/characters/create-v2 -- initial health', () => {
  function bodyWith(abilities?: unknown) {
    const catalogue = fullCatalogue()
    getWorldContentCatalogueMock.mockResolvedValue(catalogue)
    createEntityRecordMock.mockResolvedValue({ id: 42, title: 'Aria' })

    const body: Record<string, unknown> = {
      title: 'Aria',
      species: selectionOf(catalogue.species[0]),
      class: selectionOf(catalogue.classes[0]),
      background: selectionOf(catalogue.backgrounds[0])
    }
    if (abilities !== undefined) body.abilities = abilities
    return body
  }

  function derivedWithMaxHp(maxHp: number) {
    return {
      available: true as const,
      derived: {
        worldId: '5',
        characterId: '42',
        characterTitle: 'Aria',
        packageId: 'eldra.dnd5e-2024',
        packageVersion: '1.0.0',
        byCategory: {
          'core.health': [{ id: 'value:hit_points.max', category: 'core.health', value: maxHp }]
        },
        collections: [],
        tables: [],
        choices: [],
        pendingChoices: [],
        unresolvedGrants: []
      }
    }
  }

  it('seeds Current HP at the derived Max HP (6, a Wizard\'s real value) -- proving the route reads it, not computes it', async () => {
    getDerivedCharacterMock.mockResolvedValue(derivedWithMaxHp(6))

    await handler(fakeEvent('5', playerPrincipal(), bodyWith()))

    expect(getDerivedCharacterMock).toHaveBeenCalledWith('5', 42)
    expect(saveCharacterHealthMock).toHaveBeenCalledWith(42, {
      currentHp: 6,
      temporaryHp: 0,
      hitDiceSpent: 0,
      deathSaves: { successes: 0, failures: 0 }
    })
  })

  it('seeds Current HP at a completely different Max HP (23) -- proving this is not accidentally Wizard/d6-specific', async () => {
    getDerivedCharacterMock.mockResolvedValue(derivedWithMaxHp(23))

    await handler(fakeEvent('5', playerPrincipal(), bodyWith()))

    expect(saveCharacterHealthMock).toHaveBeenCalledWith(42, expect.objectContaining({ currentHp: 23 }))
  })

  it('does not seed health when the World has no Rules Package activated -- never fabricates a 5e-shaped number', async () => {
    getDerivedCharacterMock.mockResolvedValue({ available: false, reason: 'rules-unconfigured', message: 'no rules package' })

    await handler(fakeEvent('5', playerPrincipal(), bodyWith()))

    expect(saveCharacterHealthMock).not.toHaveBeenCalled()
  })

  it('does not seed health when the active package does not declare Max HP', async () => {
    getDerivedCharacterMock.mockResolvedValue({
      available: true,
      derived: {
        worldId: '5', characterId: '42', characterTitle: 'Aria',
        packageId: 'x', packageVersion: '1.0.0',
        byCategory: {},
        collections: [], tables: [], choices: [], pendingChoices: [], unresolvedGrants: []
      }
    })

    await handler(fakeEvent('5', playerPrincipal(), bodyWith()))

    expect(saveCharacterHealthMock).not.toHaveBeenCalled()
  })

  // FAILURE SEMANTICS (required pre-commit correction): Health is optional
  // exactly when derivation legitimately has nothing to report (the two
  // tests above), but once a real `maxHp` exists, failing to persist it
  // must fail the request honestly rather than silently returning a
  // 200 for an incompletely-initialized character -- the same "fails
  // loudly, not silently" precedent server/utils/worlds.ts's own
  // createWorld/createOwnerMembership pair already establishes for an
  // identical non-atomic, cross-collection Directus write.

  it('propagates an unexpected derivation failure rather than silently succeeding -- an entity/catalogue row may already be persisted', async () => {
    getDerivedCharacterMock.mockRejectedValue(new Error('derivation exploded'))

    await expect(handler(fakeEvent('5', playerPrincipal(), bodyWith()))).rejects.toThrow('derivation exploded')

    // The entity itself was already created before this step -- proving
    // the documented residual partial-write risk, not a hypothetical one.
    expect(createEntityRecordMock).toHaveBeenCalled()
    expect(saveCharacterHealthMock).not.toHaveBeenCalled()
  })

  it('propagates a saveCharacterHealth failure once a real Max HP was derived -- never swallows a REQUIRED write', async () => {
    getDerivedCharacterMock.mockResolvedValue(derivedWithMaxHp(6))
    saveCharacterHealthMock.mockRejectedValue(new Error('directus write failed'))

    await expect(handler(fakeEvent('5', playerPrincipal(), bodyWith()))).rejects.toThrow('directus write failed')
    expect(createEntityRecordMock).toHaveBeenCalled()
  })
})
