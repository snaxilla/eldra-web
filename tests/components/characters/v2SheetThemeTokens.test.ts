// Phase 4B guard: the V2 Character Sheet inherits the GM's World theme, so
// its files must style through theme tokens (`text-eldra-text-faint`,
// `border-eldra-accent/24`, `rgb(var(--eldra-accent-rgb)/0.2)`), never the
// Fantasy palette's literal hex/rgba values. V1 (`Sheet*.vue`,
// entities/[entityId]/sheet.vue) is deliberately out of scope.
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = join(__dirname, '../../..')
const componentDir = join(root, 'app/components/characters')

const v2Files = [
  ...readdirSync(componentDir)
    .filter((name) => /^(Character[A-Za-z]*|ContentPresentationPanel)\.vue$/.test(name))
    .map((name) => join(componentDir, name)),
  join(root, 'app/pages/worlds/[id]/characters/[characterId]/sheet-v2.vue')
]

// Any 3/6/8-digit hex colour, or an rgb()/rgba() written with literal
// channel numbers. Theme-agnostic black shadows (rgba(0,0,0,...)) are allowed.
const LITERAL = /#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{3}\b(?![0-9a-fA-F])|rgba?\((?!0[,\s]+0[,\s]+0\b)\s*\d/g

describe('V2 character sheet theme tokens', () => {
  it('finds the V2 files', () => {
    expect(v2Files.length).toBeGreaterThan(20)
  })

  it.each(v2Files.map((file) => [file.slice(root.length + 1), file]))('%s has no hardcoded theme colours', (_, file) => {
    const source = readFileSync(file, 'utf8')
      // HTML character references (&#9656;) are glyphs, not colours.
      .replace(/&#\d+;/g, '')
    expect(source.match(LITERAL) ?? []).toEqual([])
  })
})
