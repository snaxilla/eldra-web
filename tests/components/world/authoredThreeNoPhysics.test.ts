// PHASE 4B.4, extended in PHASE 4C -- static "no physics imports" guard
// for the entire authored Three.js dice family (d20's own frozen files
// plus Phase 4C's d4/d6/d8/d10/d12/d100/pool files). Every dice phase's
// own TESTING section explicitly lists "no physics imports" as a
// testable, non-visual invariant. Reads the
// actual source text of every file in this family (not a mocked/simulated
// module graph) and asserts none of them actually IMPORT `cannon-es` (the
// physics engine ADR-024 rejects) or `@3d-dice/dice-box-threejs` (the
// physics renderer's own library) -- matching this codebase's own
// established "prove it, don't guess" discipline (see e.g.
// WorldAuthoredThreeDiceRenderer.client.vue's own header, PHASE 4B.3
// LIFECYCLE, for the same evidentiary standard applied to a different
// claim).
//
// Deliberately an IMPORT-STATEMENT check, not a bare substring check: this
// entire file family's own header comments correctly and repeatedly
// mention "cannon-es" and "dice-box-threejs" BY NAME, explaining exactly
// why neither is imported -- a naive "the text must never contain this
// word" assertion would fail on that legitimate, intentional prose. The
// regex below only matches an actual `from '...'` / `require('...')` /
// `import('...')` module specifier naming one of the two packages.
//
// Plain Node `fs`, no `three`/DOM/WebGL import needed -- this is a text
// check, not a runtime one.

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const AUTHORED_THREE_FILES = [
  'app/components/world/WorldAuthoredThreeDiceRenderer.client.vue',
  'app/components/world/authoredD20ThreeChoreography.ts',
  'app/components/world/authoredD20ThreeFaceUV.ts',
  'app/components/world/authoredD20ThreeOrientation.ts',
  'app/components/world/authoredD20ThreeSkin.ts',
  'app/components/world/worldAuthoredThreeDiceRendererAdapter.ts',
  // Phase 4C additions -- the rest of the standard dice family.
  'app/components/world/WorldAuthoredPolyhedralDiceRenderer.client.vue',
  'app/components/world/authoredD4Three.ts',
  'app/components/world/authoredD6Three.ts',
  'app/components/world/authoredD8Three.ts',
  'app/components/world/authoredD10Three.ts',
  'app/components/world/authoredD12Three.ts',
  'app/components/world/authoredD100Percentile.ts',
  'app/components/world/authoredPolyhedralGeometry.ts',
  'app/components/world/authoredPolyhedralDiceRegistry.ts',
  'app/components/world/authoredPolyhedralPoolTypes.ts'
]

const FORBIDDEN_IMPORT_PATTERN = /(?:from|require|import)\s*\(?\s*['"][^'"]*(?:cannon-es|dice-box-threejs)[^'"]*['"]/i

describe('authored Three.js dice family -- no physics imports (ADR-024\'s own core decision: "Eldra stops simulating dice")', () => {
  for (const relativePath of AUTHORED_THREE_FILES) {
    it(`${relativePath} does not import cannon-es or @3d-dice/dice-box-threejs`, () => {
      const source = readFileSync(resolve(__dirname, '../../..', relativePath), 'utf-8')
      expect(source).not.toMatch(FORBIDDEN_IMPORT_PATTERN)
    })
  }
})
