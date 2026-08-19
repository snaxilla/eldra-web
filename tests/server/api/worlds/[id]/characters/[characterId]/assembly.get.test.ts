// Unit tests for GET /api/worlds/:id/characters/:characterId/assembly.
// assembleCharacter is mocked at the module boundary (already independently
// tested by tests/server/utils/character-assembly.test.ts) -- this file is
// about param parsing and HTTP status translation only.

import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { H3Event } from 'h3'

const { assembleCharacterMock } = vi.hoisted(() => ({
  assembleCharacterMock: vi.fn()
}))

vi.mock('../../../../../../../server/utils/character-assembly', () => ({
  assembleCharacter: assembleCharacterMock
}))

import handler from '../../../../../../../server/api/worlds/[id]/characters/[characterId]/assembly.get'

function fakeEvent(worldId: string, characterId: string): H3Event {
  return {
    context: { params: { id: worldId, characterId } },
    node: { req: {}, res: { statusCode: 200 } }
  } as unknown as H3Event
}

beforeEach(() => {
  assembleCharacterMock.mockReset()
})

describe('GET /api/worlds/:id/characters/:characterId/assembly', () => {
  it('returns the assembled blueprint verbatim when available', async () => {
    const blueprint = {
      worldId: '5',
      characterId: '42',
      characterTitle: 'Aria',
      species: { status: 'resolved', entry: {} },
      class: { status: 'resolved', entry: {} },
      background: { status: 'resolved', entry: {} },
      packs: []
    }
    assembleCharacterMock.mockResolvedValue({ available: true, blueprint })

    const result = await handler(fakeEvent('5', '42'))

    expect(assembleCharacterMock).toHaveBeenCalledWith('5', '42')
    expect(result).toEqual({ available: true, blueprint })
  })

  it('translates character-not-found into a 404', async () => {
    assembleCharacterMock.mockResolvedValue({ available: false, reason: 'character-not-found' })

    await expect(handler(fakeEvent('5', '999'))).rejects.toMatchObject({ statusCode: 404 })
  })

  it('returns 200 with available:false for no-catalogue-selection -- not an error', async () => {
    assembleCharacterMock.mockResolvedValue({
      available: false,
      reason: 'no-catalogue-selection',
      message: 'This character has no recorded choices.'
    })

    const result = await handler(fakeEvent('5', '42'))

    expect(result).toEqual({
      available: false,
      reason: 'no-catalogue-selection',
      message: 'This character has no recorded choices.'
    })
  })

  it('fails with 400 when the world or character id is missing', async () => {
    await expect(handler(fakeEvent('', '42'))).rejects.toMatchObject({ statusCode: 400 })
    await expect(handler(fakeEvent('5', ''))).rejects.toMatchObject({ statusCode: 400 })
    expect(assembleCharacterMock).not.toHaveBeenCalled()
  })
})
