// Unit tests for GET /api/worlds/:id/entities' buildCollectionTextFields
// (server/api/worlds/[id]/entities.get.ts) -- Species/Class Collection-Card
// Regression Repair.
//
// Owner-confirmed regression: the Species/Class Context Content pass
// (commit d78b751) made the compact Grid/List collection cards render
// COMPLETE trait/feature articles (full "Class Features"/"Starting
// Equipment" sections, stretched artwork) because the server OR'd the full
// article markdown into `summary`, the SAME field
// WorldEntityInteractivePage.vue's `summaryForEntity`/
// `data-collection-card-summary` reads for the compact card's teaser --
// and, for a catalogue species/class row, is also the only field a
// catalogue-sourced selection's context rail can read (no `.blocks` fetch
// exists for it; see that component's own `selectedEntityIsCatalogueSourced`
// comment). One row, one field, two incompatible consumers.
//
// buildCollectionTextFields is exported (same reason enemies.get.ts exports
// withResolvedCatalogueEnemyImages) so the actual property this bug was
// about -- `summary` and `articleDetail` (now a separate field) never carry
// the SAME full-article text -- has a direct unit test, not only a reasoned
// trace through two files with no DOM/browser harness.
import { describe, expect, it, vi } from 'vitest'

// Same Nitro auto-import shim tests/server/api/worlds/enemies.get.test.ts
// already establishes for this exact reason: this route uses
// defineEventHandler/getRouterParam/getQuery/createError, which do not
// exist under plain Vitest. Only defineEventHandler actually runs at import
// time; this file never invokes the default handler, only the named
// buildCollectionTextFields export.
vi.hoisted(() => Object.assign(globalThis as any, {
  defineEventHandler: (handler: any) => handler,
  getRouterParam: (event: any, name: string) => event?.context?.params?.[name],
  getQuery: () => ({}),
  createError: (input: { statusCode: number; statusMessage?: string }) =>
    Object.assign(new Error(input.statusMessage || `Error ${input.statusCode}`), input)
}))

const { buildCollectionTextFields } = await import('../../../../server/api/worlds/[id]/entities.get')

const CLASS_FEATURES_ARTICLE = [
  '## Proficiencies',
  '',
  '**Armor Training:** light',
  '',
  '**Tool Proficiencies:** three musical instrument of your choice',
  '',
  '## Class Features',
  '',
  '- Level 1: Bardic Inspiration',
  '- Level 2: Jack of All Trades'
].join('\n')

function classRowWithImportSource(summary: string | null) {
  return {
    row: { entity_type: 'class', summary },
    blocks: [
      {
        block_key: 'import_source',
        data: {
          raw_json: {
            startingProficiencies: { armor: ['light'], tools: ['three {@item musical instrument|PHB|musical instruments} of your choice'] },
            classFeatures: ['Bardic Inspiration|Bard||1', 'Jack of All Trades|Bard||2']
          }
        }
      }
    ]
  }
}

describe('buildCollectionTextFields', () => {
  it('the actual reproduced regression: a catalogue class row with no short summary/overview/core text gets an EMPTY `summary` -- not the full article', () => {
    const { row, blocks } = classRowWithImportSource(null)
    const fields = buildCollectionTextFields(row, blocks)

    expect(fields.summary).toBe('')
    expect(fields.summary).not.toContain('Class Features')
    expect(fields.summary).not.toContain('Proficiencies')
  })

  it('puts the full article text on `articleText` (the field the rail-only `articleDetail` response field is built from) regardless', () => {
    const { row, blocks } = classRowWithImportSource(null)
    const fields = buildCollectionTextFields(row, blocks)

    expect(fields.articleText).toContain('## Class Features')
    expect(fields.articleText).toContain('## Proficiencies')
  })

  it('an authored/legacy short summary is used as the compact teaser as before, never replaced by the generated article', () => {
    const { row, blocks } = classRowWithImportSource('A charismatic performer and spellcaster.')
    const fields = buildCollectionTextFields(row, blocks)

    expect(fields.summary).toBe('A charismatic performer and spellcaster.')
    expect(fields.articleText).toContain('## Class Features')
  })

  it('`fullSummary` (the non-summary-mode response field) also never falls back to the full article', () => {
    const { row, blocks } = classRowWithImportSource(null)
    const fields = buildCollectionTextFields(row, blocks)

    expect(fields.fullSummary).toBe('')
    expect(fields.fullSummary).not.toContain('Class Features')
  })

  it('a non-species/class row (e.g. an item) has no articleText at all -- this regression and its fix are scoped to species/class only', () => {
    const fields = buildCollectionTextFields({ entity_type: 'item', summary: null }, [])
    expect(fields.articleText).toBe('')
  })

  it('the Bard tool-proficiency {@item ...} tag is already clean by the time it reaches articleText -- no raw tag markup leaks into either field', () => {
    const { row, blocks } = classRowWithImportSource(null)
    const fields = buildCollectionTextFields(row, blocks)

    expect(fields.articleText).not.toMatch(/\{@/)
    expect(fields.articleText).toContain('musical instrument')
  })
})
