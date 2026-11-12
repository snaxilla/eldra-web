// The Content Workspaces schema, as a contract.
//
// Provisioning NEVER alters a field that already exists, so a constraint
// the spec declares is only real if the provisioning payload actually
// carries it. These tests pin the spec and the payload it produces; the
// companion verify script is what proves a given INSTANCE matches.
//
// The payload shapes below were checked against a real Directus 11.12.0
// (schema.is_unique and schema.is_indexed are both honoured by the
// Fields API there, and a NOT NULL column with a default backfills
// existing rows).

import { describe, expect, it } from 'vitest'

import {
  BINDING_MODE_FIELDS,
  CONTENT_WORKSPACE_COLLECTIONS,
  CONTENT_WORKSPACE_COLLECTION_NAMES
} from '../../../scripts/directus/lib/content-workspace-schema-spec.mjs'
import {
  buildCollectionPayload,
  buildFieldPayload
} from '../../../scripts/directus/lib/schema-helpers.mjs'

type FieldSpec = {
  field: string
  type: string
  required?: boolean
  unique?: boolean
  indexed?: boolean
  defaultValue?: unknown
  maxLength?: number
  note?: string
}
type CollectionSpec = { collection: string, fields: FieldSpec[] }

const COLLECTIONS = CONTENT_WORKSPACE_COLLECTIONS as CollectionSpec[]
const BINDINGS = BINDING_MODE_FIELDS as CollectionSpec

function spec(name: string): CollectionSpec {
  const found = COLLECTIONS.find((entry) => entry.collection === name)
  if (!found) throw new Error(`No spec for ${name}`)
  return found
}

function field(collection: string, fieldName: string): FieldSpec {
  const found = spec(collection).fields.find((entry) => entry.field === fieldName)
  if (!found) throw new Error(`No field ${collection}.${fieldName}`)
  return found
}

describe('collection coverage', () => {
  it('declares exactly the seven collections Phase 1 requires', () => {
    expect([...CONTENT_WORKSPACE_COLLECTION_NAMES].sort()).toEqual([
      'content_entity_revisions',
      'content_entity_source_snapshots',
      'content_pack_assets',
      'content_package_lineages',
      'content_release_channels',
      'content_workspace_entities',
      'content_workspaces'
    ])
  })

  it('gives every collection a uuid primary key, never an auto-increment integer', () => {
    for (const entry of COLLECTIONS) {
      const [primary] = buildCollectionPayload(entry).fields
      expect(primary).toMatchObject({ field: 'id', type: 'uuid', schema: { is_primary_key: true, has_auto_increment: false } })
    }
  })

  it('never declares a field named `id` itself -- the collection payload owns the key', () => {
    for (const entry of COLLECTIONS) {
      expect(entry.fields.map((f) => f.field)).not.toContain('id')
    }
  })

  it('creates no collection for the binding columns -- they are additive on an existing table', () => {
    expect(BINDINGS.collection).toBe('world_content_pack_bindings')
  })
})

describe('uniqueness that the DATABASE enforces', () => {
  // Directus's Fields API has no composite-unique primitive, so each
  // composite invariant is stored as one derived key column. If one of
  // these loses `unique`, the invariant silently degrades to an
  // application convention.
  it.each([
    ['content_workspaces', 'workspace_key'],
    ['content_workspace_entities', 'identity_key'],
    ['content_workspace_entities', 'address_key'],
    ['content_workspace_entities', 'source_key'],
    ['content_entity_source_snapshots', 'snapshot_key'],
    ['content_package_lineages', 'package_id'],
    ['content_release_channels', 'channel_key'],
    ['content_pack_assets', 'asset_key']
  ])('%s.%s is UNIQUE', (collection, fieldName) => {
    expect(field(collection, fieldName).unique).toBe(true)
    expect(buildFieldPayload(collection, field(collection, fieldName), 1).schema.is_unique).toBe(true)
  })

  it('leaves source_key nullable -- an authored entity has no upstream, and many nulls must coexist', () => {
    expect(field('content_workspace_entities', 'source_key').required).not.toBe(true)
    expect(buildFieldPayload('content_workspace_entities', field('content_workspace_entities', 'source_key'), 1).schema.is_nullable).toBe(true)
  })

  it('makes the derived key columns long enough for a real address', () => {
    for (const [collection, fieldName] of [
      ['content_workspace_entities', 'identity_key'],
      ['content_workspace_entities', 'address_key'],
      ['content_workspace_entities', 'source_key'],
      ['content_entity_source_snapshots', 'snapshot_key']
    ] as const) {
      expect(buildFieldPayload(collection, field(collection, fieldName), 1).schema.max_length).toBeGreaterThanOrEqual(1024)
    }
  })
})

describe('the immutable snapshot collection', () => {
  it('records both sides of a base transition plus its disposition', () => {
    const names = spec('content_entity_source_snapshots').fields.map((f) => f.field)
    for (const required of [
      'previous_base_data', 'previous_base_data_hash', 'previous_source_ref',
      'incoming_base_data', 'new_base_data_hash', 'new_source_ref', 'reconciliation', 'disposition'
    ]) {
      expect(names).toContain(required)
    }
  })

  it('allows a null previous base -- a first import has none', () => {
    expect(field('content_entity_source_snapshots', 'previous_base_data').required).not.toBe(true)
  })

  it('requires the new hash and source reference, so a snapshot can never be anonymous', () => {
    expect(field('content_entity_source_snapshots', 'new_base_data_hash').required).toBe(true)
    expect(field('content_entity_source_snapshots', 'new_source_ref').required).toBe(true)
  })
})

describe('workspace entities', () => {
  it('keeps the three override channels separate from the base and from each other', () => {
    const names = spec('content_workspace_entities').fields.map((f) => f.field)
    for (const channel of ['authored_presentation', 'authored_mechanics', 'authored_facet']) {
      expect(names).toContain(channel)
    }
    expect(names).toContain('base_data')
  })

  it('requires explicit evidence columns rather than leaving them nullable', () => {
    expect(field('content_workspace_entities', 'base_refs').required).toBe(true)
    expect(field('content_workspace_entities', 'slug_aliases').required).toBe(true)
  })

  it('indexes the workspace foreign key every listing filters on', () => {
    expect(field('content_workspace_entities', 'workspace_id').indexed).toBe(true)
    expect(buildFieldPayload('content_workspace_entities', field('content_workspace_entities', 'workspace_id'), 1).schema.is_indexed).toBe(true)
  })
})

describe('additive binding columns', () => {
  it('defaults binding_mode to pinned and makes it NOT NULL, so existing rows stay correct', () => {
    const mode = BINDINGS.fields.find((f) => f.field === 'binding_mode')!
    expect(mode).toMatchObject({ required: true, defaultValue: 'pinned' })

    const payload = buildFieldPayload(BINDINGS.collection, mode, 1)
    expect(payload.schema).toMatchObject({ is_nullable: false, default_value: 'pinned' })
  })

  it('leaves channel, workspace_id, and priority nullable -- no existing binding uses them', () => {
    for (const name of ['channel', 'workspace_id', 'priority']) {
      const entry = BINDINGS.fields.find((f) => f.field === name)!
      expect(buildFieldPayload(BINDINGS.collection, entry, 1).schema.is_nullable).toBe(true)
    }
  })

  it('adds nothing that could change how an existing binding resolves', () => {
    // package_version / package_integrity keep their meaning; this
    // migration must not touch them.
    expect(BINDINGS.fields.map((f) => f.field)).toEqual(['binding_mode', 'channel', 'workspace_id', 'priority'])
  })
})

describe('buildFieldPayload', () => {
  it('maps each declared type to the column type Directus expects', () => {
    const cases = [
      ['string', 'character varying'],
      ['text', 'text'],
      ['json', 'json'],
      ['integer', 'integer'],
      ['boolean', 'boolean'],
      ['timestamp', 'timestamp with time zone'],
      ['uuid', 'uuid']
    ] as const

    for (const [type, dataType] of cases) {
      expect(buildFieldPayload('c', { field: 'f', type }, 1).schema.data_type).toBe(dataType)
    }
  })

  it('refuses an unknown type rather than provisioning a wrong column', () => {
    expect(() => buildFieldPayload('c', { field: 'f', type: 'decimal' }, 1)).toThrow(/Unknown field type/)
  })

  it('marks a required field NOT NULL and an optional one nullable', () => {
    expect(buildFieldPayload('c', { field: 'f', type: 'string', required: true }, 1).schema.is_nullable).toBe(false)
    expect(buildFieldPayload('c', { field: 'f', type: 'string' }, 1).schema.is_nullable).toBe(true)
  })
})

describe('bootstrap registration', () => {
  it('registers both new scripts, after the collections they depend on', async () => {
    const source = await import('node:fs/promises').then((fs) =>
      fs.readFile(new URL('../../../scripts/directus/bootstrap.mjs', import.meta.url), 'utf8')
    )

    expect(source).toContain('create-content-workspaces-schema.mjs')
    expect(source).toContain('alter-world-content-pack-bindings-binding-modes.mjs')
    // The binding alter must come after the bindings collection exists.
    expect(source.indexOf('create-world-content-pack-bindings-schema.mjs'))
      .toBeLessThan(source.indexOf('alter-world-content-pack-bindings-binding-modes.mjs'))
  })
})
