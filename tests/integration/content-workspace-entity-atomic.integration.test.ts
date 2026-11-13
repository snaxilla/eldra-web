// Real PostgreSQL integration tests -- Content Workspaces & Studio Pass
// B, concurrency hardening follow-up. Runs against a DISPOSABLE Postgres
// instance only (never production, never the live dev Directus database)
// -- see .github/docs/architecture/content-workspaces-pass-b-handoff.md
// for exactly how the disposable instance used to author/verify this file
// was created.
//
// Requires ELDRA_WORKSPACE_DB_URL to point at a Postgres database with the
// real `content_workspaces`/`content_workspace_entities`/
// `content_entity_revisions` schema (provisioned by
// scripts/directus/create-content-workspaces-schema.mjs +
// alter-content-workspaces-revision-counters.mjs) -- run via
// `pnpm run test:integration`, never as part of the ordinary `pnpm run
// test` (see vitest.integration.config.ts's own exclude).
//
// LEAST-PRIVILEGE ROLE, NOT ADMIN -- ELDRA_WORKSPACE_DB_URL is deliberately
// the `eldra_workspace_writer` role (scripts/directus/create-workspace-
// entity-writer-role.mjs's own exact grant set), the SAME posture
// character-resource-atomic.integration.test.ts already established for a
// different table family: the module under test never runs as a
// superuser, here or anywhere else, and this suite is the proof that the
// narrow grant set is actually SUFFICIENT, not merely assumed. Test
// setup/teardown (TRUNCATE, seeding rows) needs broader privileges than
// that role has, so a SEPARATE ELDRA_WORKSPACE_TEST_ADMIN_DB_URL (the
// disposable instance's own admin connection) is used for the harness's
// own scaffolding only -- never imported by, or reachable from, the
// module under test.

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { Client, Pool } from 'pg'
import { randomUUID } from 'node:crypto'
import {
  touchWorkspaceRevisionAtomic,
  writeWorkspaceEntityOverrideAtomic,
  __closeWorkspacePoolForTesting,
  __setWorkspacePoolForTesting
} from '../../server/utils/content-workspace-entity-atomic'

const DATABASE_URL = process.env.ELDRA_WORKSPACE_DB_URL
const ADMIN_DATABASE_URL = process.env.ELDRA_WORKSPACE_TEST_ADMIN_DB_URL ?? DATABASE_URL

if (!DATABASE_URL) {
  throw new Error(
    'ELDRA_WORKSPACE_DB_URL is not set -- these are real integration tests against a disposable ' +
    'PostgreSQL instance and cannot run without one. See this file\'s own header.'
  )
}

// content_entity_revisions.actor_account_id is a real `uuid` column
// (Eldra Account ids, server/utils/eldra-accounts.ts) -- fixed, valid
// UUIDs here, never a human-readable placeholder string.
const ACCOUNT_A = '11111111-1111-4111-8111-111111111111'
const ACCOUNT_B = '22222222-2222-4222-8222-222222222222'

let admin: Client
let workspaceId: string
let otherWorkspaceId: string
let entityId: string
let otherEntityId: string

beforeAll(async () => {
  admin = new Client({ connectionString: ADMIN_DATABASE_URL })
  await admin.connect()
  // The module under test connects as the least-privilege eldra_workspace_writer role.
  __setWorkspacePoolForTesting(new Pool({ connectionString: DATABASE_URL, max: 5 }))
})

afterAll(async () => {
  await admin.end()
  await __closeWorkspacePoolForTesting()
})

async function seedWorkspace(overrides: { id: string; revision?: number }) {
  await admin.query(
    `INSERT INTO content_workspaces (id, workspace_key, title, system_key, status, revision, created_at, updated_at)
     VALUES ($1, $2, 'Test Workspace', 'dnd5e', 'active', $3, now(), now())`,
    [overrides.id, `test-${overrides.id.slice(0, 8)}`, overrides.revision ?? 0]
  )
}

async function seedEntity(overrides: { id: string; workspaceId: string; contentEntityId: string; slug: string; revision?: number }) {
  await admin.query(
    `INSERT INTO content_workspace_entities (
       id, workspace_id, content_entity_id, identity_key, address_key, source_key,
       system_key, entity_type, slug, title, origin, state,
       base_data, base_data_hash, base_source_ref, base_missing, base_refs, slug_aliases,
       authored_data, authored_presentation, authored_mechanics, authored_facet,
       revision, created_at, updated_at
     ) VALUES (
       $1, $2, $3, $4, $5, NULL,
       'dnd5e', 'item', $6, 'Shortsword', 'imported', 'active',
       '{"name":"Shortsword"}', 'sha256-x', NULL, false, '[]', '[]',
       NULL, '[]', '[]', NULL,
       $7, now(), now()
     )`,
    [
      overrides.id, overrides.workspaceId, overrides.contentEntityId,
      `${overrides.workspaceId}::${overrides.contentEntityId}`,
      `${overrides.workspaceId}::dnd5e::item::${overrides.slug}`,
      overrides.slug, overrides.revision ?? 0
    ]
  )
}

beforeEach(async () => {
  await admin.query('TRUNCATE content_entity_revisions, content_workspace_entities, content_workspaces')
  workspaceId = randomUUID()
  otherWorkspaceId = randomUUID()
  entityId = randomUUID()
  otherEntityId = randomUUID()

  await seedWorkspace({ id: workspaceId })
  await seedWorkspace({ id: otherWorkspaceId })
  await seedEntity({ id: entityId, workspaceId, contentEntityId: 'ce_aaaaaaaaaaaaaaaaaaaaaaaaaa', slug: 'shortsword-xphb' })
  await seedEntity({ id: otherEntityId, workspaceId, contentEntityId: 'ce_bbbbbbbbbbbbbbbbbbbbbbbbbb', slug: 'longsword-xphb' })
})

afterEach(async () => {
  await admin.query('TRUNCATE content_entity_revisions, content_workspace_entities, content_workspaces')
})

async function readEntity(id: string) {
  const res = await admin.query('SELECT * FROM content_workspace_entities WHERE id = $1', [id])
  return res.rows[0] ?? null
}

async function readWorkspace(id: string) {
  const res = await admin.query('SELECT * FROM content_workspaces WHERE id = $1', [id])
  return res.rows[0] ?? null
}

async function countRevisions(contentEntityId: string) {
  const res = await admin.query('SELECT count(*)::int AS count FROM content_entity_revisions WHERE content_entity_id = $1', [contentEntityId])
  return res.rows[0].count
}

function overridesFor(name: string) {
  return [{ channel: 'presentation', path: 'name', value: name, authoredBy: 'acct-1', authoredAt: new Date().toISOString(), baseValueHash: null }]
}

describe('writeWorkspaceEntityOverrideAtomic -- single write', () => {
  it('writes the override, bumps the entity revision, records history, and bumps the workspace revision -- all together', async () => {
    const result = await writeWorkspaceEntityOverrideAtomic({
      workspaceId, contentEntityId: 'ce_aaaaaaaaaaaaaaaaaaaaaaaaaa', expectedRevision: 0,
      column: 'authored_presentation', newValue: overridesFor('Fine Shortsword'),
      revision: { kind: 'autosave', label: null, actorAccountId: ACCOUNT_A, diff: [{ channel: 'presentation', path: 'name', from: undefined, to: 'Fine Shortsword' }] }
    })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.entity.revision).toBe(1)

    const row = await readEntity(entityId)
    expect(row.revision).toBe(1)
    expect(row.authored_presentation[0].value).toBe('Fine Shortsword')
    expect(await countRevisions('ce_aaaaaaaaaaaaaaaaaaaaaaaaaa')).toBe(1)

    const workspace = await readWorkspace(workspaceId)
    expect(workspace.revision).toBe(1)
  })

  it('rejects a stale expectedRevision as a conflict, writing NOTHING -- no entity change, no history row, no workspace bump', async () => {
    const result = await writeWorkspaceEntityOverrideAtomic({
      workspaceId, contentEntityId: 'ce_aaaaaaaaaaaaaaaaaaaaaaaaaa', expectedRevision: 5,
      column: 'authored_presentation', newValue: overridesFor('Should Not Apply'),
      revision: { kind: 'autosave', label: null, actorAccountId: ACCOUNT_A, diff: [] }
    })

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.reason).toBe('conflict')

    const row = await readEntity(entityId)
    expect(row.revision).toBe(0)
    expect(row.authored_presentation).toEqual([])
    expect(await countRevisions('ce_aaaaaaaaaaaaaaaaaaaaaaaaaa')).toBe(0)
    const workspace = await readWorkspace(workspaceId)
    expect(workspace.revision).toBe(0)
  })

  it('reports not-found for an entity that does not exist, writing nothing', async () => {
    const result = await writeWorkspaceEntityOverrideAtomic({
      workspaceId, contentEntityId: 'ce_zzzzzzzzzzzzzzzzzzzzzzzzzz', expectedRevision: 0,
      column: 'authored_presentation', newValue: overridesFor('X'),
      revision: { kind: 'autosave', label: null, actorAccountId: ACCOUNT_A, diff: [] }
    })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.reason).toBe('not-found')
  })
})

describe('concurrency -- two saves against the SAME entity at the same expectedRevision', () => {
  it('exactly one succeeds, the other is a conflict; final state matches the winner; history has exactly one new row', async () => {
    const [a, b] = await Promise.all([
      writeWorkspaceEntityOverrideAtomic({
        workspaceId, contentEntityId: 'ce_aaaaaaaaaaaaaaaaaaaaaaaaaa', expectedRevision: 0,
        column: 'authored_presentation', newValue: overridesFor('Writer A'),
        revision: { kind: 'autosave', label: null, actorAccountId: ACCOUNT_A, diff: [{ channel: 'presentation', path: 'name', from: undefined, to: 'Writer A' }] }
      }),
      writeWorkspaceEntityOverrideAtomic({
        workspaceId, contentEntityId: 'ce_aaaaaaaaaaaaaaaaaaaaaaaaaa', expectedRevision: 0,
        column: 'authored_presentation', newValue: overridesFor('Writer B'),
        revision: { kind: 'autosave', label: null, actorAccountId: ACCOUNT_B, diff: [{ channel: 'presentation', path: 'name', from: undefined, to: 'Writer B' }] }
      })
    ])

    const outcomes = [a, b]
    const succeeded = outcomes.filter((r) => r.ok)
    const rejected = outcomes.filter((r) => !r.ok)

    expect(succeeded).toHaveLength(1)
    expect(rejected).toHaveLength(1)
    if (!rejected[0]!.ok) expect(rejected[0]!.reason).toBe('conflict')

    const row = await readEntity(entityId)
    expect(row.revision).toBe(1) // never 2 -- only the winner's single write landed
    const winnerName = succeeded[0]!.ok ? (succeeded[0] as { ok: true; entity: { authored_presentation: { value: string }[] } }).entity.authored_presentation[0]!.value : null
    expect(row.authored_presentation[0].value).toBe(winnerName)

    // Exactly one history row -- the loser never wrote one, because its
    // transaction rolled back before the INSERT ever ran.
    expect(await countRevisions('ce_aaaaaaaaaaaaaaaaaaaaaaaaaa')).toBe(1)

    const workspace = await readWorkspace(workspaceId)
    expect(workspace.revision).toBe(1) // never 2 -- only the winner bumped it
  })

  it('a save racing a revert at the same expectedRevision: exactly one applies, the other conflicts honestly', async () => {
    const [save, revert] = await Promise.all([
      writeWorkspaceEntityOverrideAtomic({
        workspaceId, contentEntityId: 'ce_aaaaaaaaaaaaaaaaaaaaaaaaaa', expectedRevision: 0,
        column: 'authored_presentation', newValue: overridesFor('New Name'),
        revision: { kind: 'autosave', label: null, actorAccountId: ACCOUNT_A, diff: [{ channel: 'presentation', path: 'name', from: undefined, to: 'New Name' }] }
      }),
      writeWorkspaceEntityOverrideAtomic({
        workspaceId, contentEntityId: 'ce_aaaaaaaaaaaaaaaaaaaaaaaaaa', expectedRevision: 0,
        column: 'authored_presentation', newValue: [],
        revision: { kind: 'revert', label: 'Reverted presentation.name', actorAccountId: ACCOUNT_B, diff: [{ channel: 'presentation', path: 'name', from: undefined, to: undefined }] }
      })
    ])

    const outcomes = [save, revert]
    expect(outcomes.filter((r) => r.ok)).toHaveLength(1)
    expect(outcomes.filter((r) => !r.ok)).toHaveLength(1)

    const row = await readEntity(entityId)
    expect(row.revision).toBe(1)
  })
})

describe('concurrency -- two saves against DIFFERENT entities, same workspace', () => {
  it('both survive; neither loses the other\'s write; the workspace revision witnesses BOTH (never one overwriting the other\'s bump)', async () => {
    const [a, b] = await Promise.all([
      writeWorkspaceEntityOverrideAtomic({
        workspaceId, contentEntityId: 'ce_aaaaaaaaaaaaaaaaaaaaaaaaaa', expectedRevision: 0,
        column: 'authored_presentation', newValue: overridesFor('A Edit'),
        revision: { kind: 'autosave', label: null, actorAccountId: ACCOUNT_A, diff: [{ channel: 'presentation', path: 'name', from: undefined, to: 'A Edit' }] }
      }),
      writeWorkspaceEntityOverrideAtomic({
        workspaceId, contentEntityId: 'ce_bbbbbbbbbbbbbbbbbbbbbbbbbb', expectedRevision: 0,
        column: 'authored_presentation', newValue: overridesFor('B Edit'),
        revision: { kind: 'autosave', label: null, actorAccountId: ACCOUNT_B, diff: [{ channel: 'presentation', path: 'name', from: undefined, to: 'B Edit' }] }
      })
    ])

    expect(a.ok).toBe(true)
    expect(b.ok).toBe(true)

    const rowA = await readEntity(entityId)
    const rowB = await readEntity(otherEntityId)
    expect(rowA.authored_presentation[0].value).toBe('A Edit')
    expect(rowB.authored_presentation[0].value).toBe('B Edit')
    expect(rowA.revision).toBe(1)
    expect(rowB.revision).toBe(1)

    // The workspace's own cache-witness counter advanced TWICE -- once per
    // successful write -- never losing one to the other, because
    // `revision = revision + 1` is a single atomic statement each time.
    const workspace = await readWorkspace(workspaceId)
    expect(workspace.revision).toBe(2)
  })

  it('a subsequent read sees BOTH changes (proves the resolver would see both on its next cache-key check)', async () => {
    await Promise.all([
      writeWorkspaceEntityOverrideAtomic({
        workspaceId, contentEntityId: 'ce_aaaaaaaaaaaaaaaaaaaaaaaaaa', expectedRevision: 0,
        column: 'authored_presentation', newValue: overridesFor('A Edit'),
        revision: { kind: 'autosave', label: null, actorAccountId: ACCOUNT_A, diff: [] }
      }),
      writeWorkspaceEntityOverrideAtomic({
        workspaceId, contentEntityId: 'ce_bbbbbbbbbbbbbbbbbbbbbbbbbb', expectedRevision: 0,
        column: 'authored_presentation', newValue: overridesFor('B Edit'),
        revision: { kind: 'autosave', label: null, actorAccountId: ACCOUNT_B, diff: [] }
      })
    ])

    const [rowA, rowB] = await Promise.all([readEntity(entityId), readEntity(otherEntityId)])
    expect(rowA.authored_presentation[0].value).toBe('A Edit')
    expect(rowB.authored_presentation[0].value).toBe('B Edit')
  })
})

describe('concurrency -- different workspaces never interfere', () => {
  it('a write to one workspace never bumps a different workspace\'s revision', async () => {
    await writeWorkspaceEntityOverrideAtomic({
      workspaceId, contentEntityId: 'ce_aaaaaaaaaaaaaaaaaaaaaaaaaa', expectedRevision: 0,
      column: 'authored_presentation', newValue: overridesFor('Edit'),
      revision: { kind: 'autosave', label: null, actorAccountId: ACCOUNT_A, diff: [] }
    })

    const other = await readWorkspace(otherWorkspaceId)
    expect(other.revision).toBe(0)
  })
})

describe('touchWorkspaceRevisionAtomic -- the import executor\'s own writer', () => {
  it('bumps the workspace revision atomically, independent of any entity write', async () => {
    await touchWorkspaceRevisionAtomic(workspaceId)
    const workspace = await readWorkspace(workspaceId)
    expect(workspace.revision).toBe(1)
  })

  it('never collides with a concurrent entity-override write to the SAME workspace -- both bumps land', async () => {
    await Promise.all([
      touchWorkspaceRevisionAtomic(workspaceId),
      writeWorkspaceEntityOverrideAtomic({
        workspaceId, contentEntityId: 'ce_aaaaaaaaaaaaaaaaaaaaaaaaaa', expectedRevision: 0,
        column: 'authored_presentation', newValue: overridesFor('Edit'),
        revision: { kind: 'autosave', label: null, actorAccountId: ACCOUNT_A, diff: [] }
      })
    ])

    const workspace = await readWorkspace(workspaceId)
    expect(workspace.revision).toBe(2)
  })
})
