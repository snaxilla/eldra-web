// Unit tests for server/utils/character-ability-scores.ts -- the single
// server-side owner of the `ability_scores` block (Character Builder /
// Character Sheet Phase 3).
//
// `dxFetch` is mocked at the module boundary, standing in for Directus --
// the same split every other server-util test in this suite uses. The
// upsert decision, the block_key, and the read-time revalidation all run
// for real.

import { beforeEach, describe, expect, it, vi } from 'vitest'

const { dxFetchMock } = vi.hoisted(() => ({ dxFetchMock: vi.fn() }))

vi.mock('../../../server/utils/entity-factory', () => ({ dxFetch: dxFetchMock }))

import {
  ABILITY_SCORES_BLOCK_KEY,
  loadCharacterAbilityScores,
  saveCharacterAbilityScores
} from '../../../server/utils/character-ability-scores'

const SCORES = { str: 15, dex: 14, con: 13, int: 12, wis: 10, cha: 8 }
const STORED = { method: 'standard-array' as const, scores: SCORES }

beforeEach(() => {
  dxFetchMock.mockReset()
})

describe('ABILITY_SCORES_BLOCK_KEY', () => {
  it('is a block_key distinct from the catalogue selection block', () => {
    // A separate block because ability scores resolve against NOTHING --
    // unlike catalogue_selection, which character-assembly.ts re-verifies
    // against the World's catalogue on every read.
    expect(ABILITY_SCORES_BLOCK_KEY).toBe('ability_scores')
    expect(ABILITY_SCORES_BLOCK_KEY).not.toBe('catalogue_selection')
  })
})

describe('loadCharacterAbilityScores', () => {
  it('reads the stored record for the right entity and block', async () => {
    dxFetchMock.mockResolvedValue({ data: [{ data: STORED }] })

    const result = await loadCharacterAbilityScores(42)

    expect(result).toEqual(STORED)
    const [path] = dxFetchMock.mock.calls[0]
    expect(path).toContain('filter[entity_id][_eq]=42')
    expect(path).toContain(`filter[block_key][_eq]=${ABILITY_SCORES_BLOCK_KEY}`)
  })

  it('returns null when no block exists -- the state every pre-Phase-3 character is in', async () => {
    dxFetchMock.mockResolvedValue({ data: [] })
    expect(await loadCharacterAbilityScores(42)).toBeNull()
  })

  it('returns null for a stored record that no longer validates, rather than half a row', async () => {
    // e.g. hand-edited in the Directus admin.
    dxFetchMock.mockResolvedValue({ data: [{ data: { method: 'manual', scores: { str: 15 } } }] })
    expect(await loadCharacterAbilityScores(42)).toBeNull()
  })
})

describe('saveCharacterAbilityScores', () => {
  it('PATCHes the existing block when one is already there', async () => {
    dxFetchMock
      .mockResolvedValueOnce({ data: [{ id: 7 }] })
      .mockResolvedValueOnce({ data: { id: 7 } })

    await saveCharacterAbilityScores(42, STORED)

    const [path, options] = dxFetchMock.mock.calls[1]
    expect(path).toBe('/items/block_instances/7')
    expect(options.method).toBe('PATCH')
    expect(JSON.parse(options.body)).toEqual({ data: STORED })
  })

  it('POSTs a new block when the character has none -- assigning scores to an existing character', async () => {
    dxFetchMock
      .mockResolvedValueOnce({ data: [] })
      .mockResolvedValueOnce({ data: { id: 9 } })

    await saveCharacterAbilityScores(42, STORED)

    const [path, options] = dxFetchMock.mock.calls[1]
    expect(path).toBe('/items/block_instances')
    expect(options.method).toBe('POST')
    expect(JSON.parse(options.body)).toMatchObject({
      entity_id: 42,
      block_key: ABILITY_SCORES_BLOCK_KEY,
      data: STORED
    })
  })

  it('stores exactly what it was given -- no derived field is added', async () => {
    dxFetchMock
      .mockResolvedValueOnce({ data: [] })
      .mockResolvedValueOnce({ data: { id: 9 } })

    await saveCharacterAbilityScores(42, STORED)

    const stored = JSON.parse(dxFetchMock.mock.calls[1][1].body).data
    expect(Object.keys(stored).sort()).toEqual(['method', 'scores'])
    expect(Object.keys(stored.scores).sort()).toEqual(['cha', 'con', 'dex', 'int', 'str', 'wis'])
    // No modifier, no proficiency bonus, no derived total anywhere.
    expect(JSON.stringify(stored)).not.toMatch(/modifier|bonus|total/i)
  })
})
