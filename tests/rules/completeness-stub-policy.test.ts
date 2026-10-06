// PERMANENT POLICY -- which tests may stub the fail-closed completeness authority, enforced in CI.
//
// Every test file falls into exactly one category:
//   UNIT      mechanics isolation. MAY stub the authority through tests/helpers/completeness-stub.ts.
//             Its assertions are about another subsystem (choice answering, feat routing, progression
//             arithmetic, a Builder presentation primitive). It makes NO claim that a real PHB character
//             can be created or can progress.
//   ACCEPTANCE production-path acceptance, authority tests, and availability. MUST use the REAL
//             authority. It must never stub it, and it must never call an allow-everything seam.
//
// This test fails when a file stubs without being classified, when a classified UNIT file no longer
// stubs (a stale entry), when an ACCEPTANCE file stubs, when a UNIT file lacks its boundary comment, or
// when the read path imports the authority. The Polish Gate (G1-G9) is an ACCEPTANCE suite and MUST
// NEVER stub mandatory-decision discovery, coverage, creation completeness, or progression completeness.

import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'

const ROOT = join(__dirname, '..', '..')

function testFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry)
    if (statSync(path).isDirectory()) return testFiles(path)
    return /\.test\.ts$/.test(entry) ? [path] : []
  })
}

const rel = (path: string) => relative(ROOT, path).split('\\').join('/')
// An executable stub: a vi.mock of the authority module (comments that merely mention it do not count).
const STUB_PATTERN = /^vi\.mock\(['"][^'"]*creation-completeness/m
const ALL = testFiles(join(ROOT, 'tests')).map((path) => ({ path: rel(path), text: readFileSync(path, 'utf8') }))

// UNIT: the explicit list of mechanics-isolation files allowed to stub the authority.
const UNIT_STUBBING = [
  'tests/components/characters/builder/characterBuilderSelection.test.ts',
  'tests/components/characters/builder/creationChoiceEligibility.test.ts',
  'tests/server/api/worlds/[id]/characters/create-v2-fighter-mechanics.test.ts',
  'tests/server/api/worlds/[id]/characters/create-v2.post.test.ts',
  'tests/server/utils/character-progression-all-class-subclass.test.ts',
  'tests/server/utils/character-progression-level-1-to-20.test.ts',
  'tests/server/utils/character-progression-plan.test.ts',
  'tests/server/utils/character-progression-published-package.test.ts'
]

// ACCEPTANCE and AUTHORITY: production-path or authority tests. They must use the REAL authority.
const ACCEPTANCE_REAL = [
  'tests/server/api/worlds/[id]/characters/create-v2-fail-closed.test.ts',
  'tests/server/utils/character-progression-fail-closed.test.ts',
  'tests/server/utils/character-assembly-historical-fail-closed.test.ts',
  'tests/lib/content-rules/creation-availability.test.ts',
  'tests/lib/content-rules/creation-completeness.test.ts',
  'tests/components/characters/builder/creationBlockerPresentation.test.ts',
  'tests/rules/mandatory-decision-discovery.test.ts',
  'tests/rules/mandatory-decision-coverage.test.ts'
]

describe('completeness-authority stubbing policy (enforced)', () => {
  const stubbing = ALL.filter((file) => STUB_PATTERN.test(file.text)).map((file) => file.path).sort()

  it('every file that stubs the authority is a classified UNIT file (no unclassified stub)', () => {
    expect(stubbing).toEqual([...UNIT_STUBBING].sort())
  })

  it('every classified UNIT file really stubs (no stale classification)', () => {
    for (const path of UNIT_STUBBING) expect(stubbing, path).toContain(path)
  })

  it('no UNIT file is also listed as ACCEPTANCE, and every listed file exists', () => {
    expect(UNIT_STUBBING.filter((path) => ACCEPTANCE_REAL.includes(path))).toEqual([])
    const existing = new Set(ALL.map((file) => file.path))
    for (const path of [...UNIT_STUBBING, ...ACCEPTANCE_REAL]) expect(existing.has(path), path).toBe(true)
  })

  it('no ACCEPTANCE or AUTHORITY file stubs the authority', () => {
    for (const path of ACCEPTANCE_REAL) {
      const file = ALL.find((candidate) => candidate.path === path)!
      expect(STUB_PATTERN.test(file.text), path).toBe(false)
    }
  })

  it('every UNIT file carries the boundary comment, so the isolation is visible where it is used', () => {
    for (const path of UNIT_STUBBING) {
      const file = ALL.find((candidate) => candidate.path === path)!
      expect(file.text, path).toMatch(/UNIT-ISOLATION/)
    }
  })

  it('the read path never imports the completeness authority (historical reads cannot mutate or be refused)', () => {
    for (const path of ['server/utils/character-assembly.ts', 'server/utils/character-derived.ts']) {
      const text = readFileSync(join(ROOT, path), 'utf8')
      expect(text, path).not.toMatch(/creation-completeness/)
    }
  })

  it('the one allow-everything seam is the named mechanics stub, and nothing else names an allow-everything helper', () => {
    for (const file of ALL) {
      if (file.path === 'tests/helpers/completeness-stub.ts' || file.path === 'tests/rules/completeness-stub-policy.test.ts') continue
      expect(file.text, file.path).not.toMatch(/allowEverything|allowAllCompleteness|skipCompleteness/)
    }
  })
})
