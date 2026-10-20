// Unit tests for server/utils/character-resources.ts -- D&D 2024 Character
// Rules Phase 2A.2, GENERIC CHARACTER RESOURCES persistence +
// server-authoritative manual expend/restore. `dxFetch` mocked at the
// module boundary, mirroring every other `block_instances`-backed
// persistence module's own test precedent in this codebase.

import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { dxFetchMock, expendAtomicMock, reduceAtomicMock } = vi.hoisted(() => ({
  dxFetchMock: vi.fn(),
  expendAtomicMock: vi.fn(),
  reduceAtomicMock: vi.fn()
}))

vi.mock('../../../server/utils/entity-factory', () => ({
  dxFetch: dxFetchMock
}))

// CHARACTER MECHANICS PHASE A5, Checkpoint 1 -- `expendResourceAuthoritatively`/
// `restoreResourceAuthoritatively` now delegate to the atomic module
// (character-resource-atomic.ts) instead of their own read-modify-write;
// THAT module's own real behavior is proven against a real PostgreSQL
// instance in tests/integration/character-resource-atomic.integration.test.ts.
// These unit tests assert only that the two functions call through with the
// right arguments and relay the atomic result, mirroring this codebase's
// own established "mock the boundary, test the call" precedent elsewhere.
vi.mock('../../../server/utils/character-resource-atomic', () => ({
  expendCharacterResourcesAtomic: expendAtomicMock,
  reduceCharacterResourcesAtomic: reduceAtomicMock
}))

import {
  expendResourceAuthoritatively,
  loadCharacterResources,
  restoreResourceAuthoritatively,
  saveCharacterResources
} from '../../../server/utils/character-resources'

beforeEach(() => {
  dxFetchMock.mockReset()
  expendAtomicMock.mockReset()
  reduceAtomicMock.mockReset()
})

describe('loadCharacterResources', () => {
  it('returns null when nothing was ever recorded', async () => {
    dxFetchMock.mockResolvedValue({ data: [] })
    expect(await loadCharacterResources('42')).toBeNull()
  })

  it('reads a well-formed persisted record', async () => {
    dxFetchMock.mockResolvedValue({ data: [{ data: { expended: { 'resource:barbarian.rage': 1 } } }] })
    expect(await loadCharacterResources('42')).toEqual({ expended: { 'resource:barbarian.rage': 1 } })
  })
})

describe('saveCharacterResources -- upsert', () => {
  it('PATCHes an existing block when one is found', async () => {
    dxFetchMock.mockImplementation(async (path: string, options: any) => {
      if (path.includes('fields%5B%5D=id') || path.includes('fields[]=id')) return { data: [{ id: 9 }] }
      expect(options.method).toBe('PATCH')
      expect(path).toBe('/items/block_instances/9')
      return {}
    })

    const saved = await saveCharacterResources('42', { expended: { 'resource:a': 1 } })
    expect(saved).toEqual({ expended: { 'resource:a': 1 } })
  })

  it('POSTs a new block when none exists, with the generic block_key -- never one block per class', async () => {
    dxFetchMock.mockImplementation(async (path: string, options: any) => {
      if (path.includes('fields%5B%5D=id') || path.includes('fields[]=id')) return { data: [] }
      expect(options.method).toBe('POST')
      const body = JSON.parse(options.body)
      expect(body.block_key).toBe('resources')
      return {}
    })

    await saveCharacterResources('42', { expended: {} })
  })
})

describe('expendResourceAuthoritatively -- delegates to the atomic module (CHARACTER MECHANICS PHASE A5)', () => {
  it('calls expendCharacterResourcesAtomic with worldId/characterId and a single-cost batch', async () => {
    expendAtomicMock.mockResolvedValue({ ok: true, expended: { 'resource:a': 2 } })

    const saved = await expendResourceAuthoritatively('5', '42', 'resource:a', 3)

    expect(expendAtomicMock).toHaveBeenCalledWith({
      worldId: '5', characterId: '42', costs: [{ resourceId: 'resource:a', amount: 1, max: 3 }]
    })
    expect(saved).toEqual({ ok: true, expended: { 'resource:a': 2 } })
  })

  it('relays an insufficient-resource rejection from the atomic module verbatim', async () => {
    expendAtomicMock.mockResolvedValue({ ok: false, reason: 'insufficient-resource', message: 'no room' })

    const saved = await expendResourceAuthoritatively('5', '42', 'resource:a', 3)
    expect(saved).toEqual({ ok: false, reason: 'insufficient-resource', message: 'no room' })
  })

  it('honors a caller-supplied amount greater than 1 (large-pool follow-up)', async () => {
    expendAtomicMock.mockResolvedValue({ ok: true, expended: { 'resource:lay_on_hands': 30 } })

    await expendResourceAuthoritatively('5', '42', 'resource:lay_on_hands', 100, 20)

    expect(expendAtomicMock).toHaveBeenCalledWith({
      worldId: '5', characterId: '42', costs: [{ resourceId: 'resource:lay_on_hands', amount: 20, max: 100 }]
    })
  })
})

describe('restoreResourceAuthoritatively -- delegates to the atomic module', () => {
  it('calls reduceCharacterResourcesAtomic with worldId/characterId and a single reduction', async () => {
    reduceAtomicMock.mockResolvedValue({ ok: true, expended: {} })

    const saved = await restoreResourceAuthoritatively('5', '42', 'resource:a')

    expect(reduceAtomicMock).toHaveBeenCalledWith({
      worldId: '5', characterId: '42', reductions: [{ resourceId: 'resource:a', amount: 1 }]
    })
    expect(saved).toEqual({ ok: true, expended: {} })
  })

  it('honors a caller-supplied restore amount greater than 1', async () => {
    reduceAtomicMock.mockResolvedValue({ ok: true, expended: {} })

    await restoreResourceAuthoritatively('5', '42', 'resource:lay_on_hands', 999)

    expect(reduceAtomicMock).toHaveBeenCalledWith({
      worldId: '5', characterId: '42', reductions: [{ resourceId: 'resource:lay_on_hands', amount: 999 }]
    })
  })
})

// ---------------------------------------------------------------------------
// LEGACY FULL-BLOB WRITER GUARD -- CHARACTER MECHANICS PHASE A5, Checkpoint 1.
// ---------------------------------------------------------------------------
// A static architectural check, not a runtime one -- mirrors this codebase's
// own established precedent exactly (ability-scores.test.ts's own "imports
// nothing from the Rules Engine" check; character-actor-bridge.test.ts's own
// "contains no expressions/formulas" check): read a source file's own raw
// text, strip comments, and assert a forbidden pattern is absent. The
// mutation this phase closed a real race for (`saveCharacterResources`'s own
// find-then-PATCH-or-POST, with no database-level condition) must never be
// reintroduced into any of the three paths this phase retargeted, or into
// any NEW path, by a future edit that calls it directly instead of going
// through `character-resource-atomic.ts`. This is a structural guarantee,
// never "reviewer discipline" -- a future PR that adds a fourth caller of
// `saveCharacterResources(` anywhere under `server/` fails THIS test, not a
// human's attention.
//
// `character-resources.ts` itself is the one legitimate exception: it
// DEFINES the function (and keeps its own direct, still-passing unit tests
// above, per this phase's own explicit "do not remove the legacy writer"
// instruction) without ever calling it FROM another function in this file.
function listTsFilesRecursively(dir: string): string[] {
  const entries = readdirSync(dir, { withFileTypes: true })
  const files: string[] = []
  for (const entry of entries) {
    const fullPath = join(dir, entry.name)
    if (entry.isDirectory()) {
      files.push(...listTsFilesRecursively(fullPath))
    } else if (entry.isFile() && entry.name.endsWith('.ts')) {
      files.push(fullPath)
    }
  }
  return files
}

function stripComments(source: string): string {
  return source
    .split('\n')
    .map((line) => line.replace(/\/\/.*$/, ''))
    .join('\n')
}

describe('LEGACY WRITER GUARD -- no production path under server/ may call saveCharacterResources() directly', () => {
  it('scans every .ts file under server/ (excluding the function\'s own definition site) for a direct call', () => {
    const offenders: string[] = []

    for (const file of listTsFilesRecursively('server')) {
      if (file === join('server', 'utils', 'character-resources.ts')) continue

      const code = stripComments(readFileSync(file, 'utf8'))
      // A CALL, not merely an import or a type reference -- the function
      // name immediately followed by an opening paren (whitespace-tolerant).
      if (/saveCharacterResources\s*\(/.test(code)) {
        offenders.push(file)
      }
    }

    expect(offenders).toEqual([])
  })

  it('the guard itself is proven to catch a real violation (not a vacuously-passing scan)', () => {
    // A direct, in-memory proof that the regex/scan logic actually detects
    // the shape it exists to catch -- never trusting an empty `offenders`
    // result alone, which could just as easily mean "the scan is broken."
    const violatingSource = `
      import { saveCharacterResources } from './character-resources'
      export async function doIt() {
        await saveCharacterResources('1', { expended: {} })
      }
    `
    expect(/saveCharacterResources\s*\(/.test(stripComments(violatingSource))).toBe(true)

    const legitimateSource = `
      // saveCharacterResources is mentioned only in this comment.
      import type { StoredCharacterResources } from '../../app/lib/characters/resources'
      export function unrelated(x: StoredCharacterResources) { return x }
    `
    expect(/saveCharacterResources\s*\(/.test(stripComments(legitimateSource))).toBe(false)
  })
})
