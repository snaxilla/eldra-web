import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  parseArgs
  // @ts-expect-error -- plain .mjs, no type declarations
} from '../../../scripts/directus/packages-sync.mjs'

describe('parseArgs', () => {
  it('defaults to dry run (apply: false) with no --world', () => {
    expect(parseArgs([])).toEqual({ world: null, apply: false })
  })

  it('parses --world <name>', () => {
    expect(parseArgs(['--world', 'Solaris'])).toEqual({ world: 'Solaris', apply: false })
  })

  it('parses --world=<name>', () => {
    expect(parseArgs(['--world=Solaris'])).toEqual({ world: 'Solaris', apply: false })
  })

  it('parses --world <id>', () => {
    expect(parseArgs(['--world', '4'])).toEqual({ world: '4', apply: false })
  })

  it('parses --apply as a boolean flag', () => {
    expect(parseArgs(['--world', 'Solaris', '--apply'])).toEqual({ world: 'Solaris', apply: true })
  })

  it('is order-independent', () => {
    expect(parseArgs(['--apply', '--world', 'Solaris'])).toEqual({ world: 'Solaris', apply: true })
  })
})

// ---------------------------------------------------------------------------
// TESTING -- DRY RUN MUST BE PROVABLY READ-ONLY (#5), enforced
// architecturally, not merely by convention. Every function capable of a
// Directus write (publishRulesPackage, refreshContentSource,
// activateWorldRulesPackage, bindContentPackToWorld) must be called from
// EXACTLY ONE place in this file: inside executeApply's own function body,
// which main() itself only reaches after the `if (!args.apply) { return }`
// early-return guard. A static-source check proves this holds for the
// actual shipped file -- not just for whatever this test happened to
// exercise at runtime -- which matters here because main()'s real
// execution path depends on jiti-loading real TS modules against a real
// Directus token, not something a unit test should attempt to drive.
// ---------------------------------------------------------------------------

describe('dry run is provably read-only (architectural check)', () => {
  const source = readFileSync(
    path.join(__dirname, '../../../scripts/directus/packages-sync.mjs'),
    'utf8'
  )

  const writeCapableCalls = [
    'publishRulesPackage(',
    'refreshContentSource(',
    'activateWorldRulesPackage(',
    'bindContentPackToWorld('
  ]

  it('main() returns before any Directus mutation when --apply is not passed', () => {
    const mainBody = source.slice(source.indexOf('async function main()'), source.indexOf('if (import.meta.url'))
    const earlyReturnIndex = mainBody.indexOf('if (!args.apply) {')
    expect(earlyReturnIndex).toBeGreaterThan(-1)

    // Every write-capable call in main()'s own body (not counting calls
    // inside functions main() calls, like executeApply) must appear AFTER
    // the early-return guard's own `return` statement -- i.e. only reachable
    // through the --apply branch below it.
    for (const call of writeCapableCalls) {
      const indexInMain = mainBody.indexOf(call)
      if (indexInMain === -1) continue // not called directly in main() -- fine, it's inside executeApply
      expect(indexInMain).toBeGreaterThan(earlyReturnIndex)
    }
  })

  it('every write-capable function is called from exactly one place: inside executeApply', () => {
    const executeApplyStart = source.indexOf('async function executeApply(')
    const executeApplyEnd = source.indexOf('\nasync function verifyPostApply(')
    expect(executeApplyStart).toBeGreaterThan(-1)
    expect(executeApplyEnd).toBeGreaterThan(executeApplyStart)

    for (const call of writeCapableCalls) {
      const allIndexes: number[] = []
      let cursor = 0
      while (true) {
        const found = source.indexOf(call, cursor)
        if (found === -1) break
        allIndexes.push(found)
        cursor = found + call.length
      }

      // Exactly one call site (the import statement is a separate, distinct
      // string -- `import { X }`, not `X(` -- so it never matches these
      // patterns), and it must fall within executeApply's own body.
      expect(allIndexes).toHaveLength(1)
      expect(allIndexes[0]).toBeGreaterThan(executeApplyStart)
      expect(allIndexes[0]).toBeLessThan(executeApplyEnd)
    }
  })

  it('never reads process.env.DIRECTUS_SCHEMA_TOKEN as code (the name may still appear in prose comments explaining why not)', () => {
    const codeLines = source.split('\n').filter((line) => !line.trim().startsWith('//'))
    const codeWithoutComments = codeLines.join('\n')
    expect(codeWithoutComments).not.toContain('process.env.DIRECTUS_SCHEMA_TOKEN')
  })

  it('never logs the VALUE of process.env.DIRECTUS_TOKEN -- only ever checks its presence or names it by env-var name', () => {
    // Naming the env var (e.g. "Missing DIRECTUS_TOKEN in the environment")
    // is fine and expected; interpolating its actual VALUE
    // (`${process.env.DIRECTUS_TOKEN}` or a bare `process.env.DIRECTUS_TOKEN`
    // reference) into a console call is what must never happen.
    const consoleCallsWithTokenValue = source
      .split('\n')
      .filter((line) => /console\.(log|error)/.test(line) && line.includes('process.env.DIRECTUS_TOKEN'))
    expect(consoleCallsWithTokenValue).toEqual([])
  })
})
