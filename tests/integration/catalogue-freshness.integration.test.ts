// Real PostgreSQL integration test -- catalogue freshness fix (follow-up
// to the entity-detail freshness fix). Runs against the SAME disposable
// Postgres instance as content-workspace-entity-atomic.integration.test.ts
// (never production) -- see that file's own header for exactly how it was
// provisioned, and ELDRA_WORKSPACE_DB_URL/ELDRA_WORKSPACE_TEST_ADMIN_DB_URL
// for how to point this at one. Run via `pnpm run test:integration`.
//
// WHAT THIS PROVES, END TO END, IN ONE PROCESS: warm the catalogue
// (loadWorkspaceAsSource), save a mechanics edit through the REAL atomic
// write (writeWorkspaceEntityOverrideAtomic -- the same direct-Postgres
// path a Studio Save uses), resolve the catalogue again in the SAME
// process, and confirm the real weapon-action resolver (resolveContentActions)
// sees the new damage dice -- then repeats with a SECOND edit to rule out
// "the first refresh just happened to work once."
//
// WHAT IS MOCKED, EXPLICITLY: `getContentWorkspace` (content-workspaces.ts)
// and `directusServiceRequest` (directus.ts) -- Directus's own REST API
// requires a live Directus instance plus a Nuxt runtime context
// (directus.ts's own getRuntimeDirectusConfig calls useRuntimeConfig(),
// unavailable in a plain Node/vitest process), neither of which this
// integration run has. `getContentWorkspace` is mocked to report the
// workspace as existing (its own freshness is NOT what this fix changed --
// readEffectiveWorkspaceRevision in world-content-sources.ts uses the
// AUTHORITATIVE direct-Postgres revision instead of trusting this mock's
// `revision` field at all, which is exactly the property under test).
// `directusServiceRequest` is mocked to THROW if ever called, so this test
// also proves the Directus fallback path is never reached while the direct
// connection is healthy -- the production cache boundary itself (a real
// Directus with CACHE_ENABLED=true) is NOT exercised here; that boundary
// was exercised manually during the original bug investigation (see this
// fix's own report) and is asserted here only by construction (Directus is
// never called at all when Postgres is healthy, so its cache cannot matter).

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { Client, Pool } from 'pg'
import { randomUUID } from 'node:crypto'

const DATABASE_URL = process.env.ELDRA_WORKSPACE_DB_URL
const ADMIN_DATABASE_URL = process.env.ELDRA_WORKSPACE_TEST_ADMIN_DB_URL ?? DATABASE_URL

if (!DATABASE_URL) {
  throw new Error('ELDRA_WORKSPACE_DB_URL is not set -- see this file\'s own header.')
}

let admin: Client
let workspaceId: string
let contentEntityId: string

const { directusServiceRequestMock, getContentWorkspaceMock } = vi.hoisted(() => ({
  directusServiceRequestMock: vi.fn(() => {
    throw new Error('directusServiceRequest should never be reached while the direct Postgres connection is healthy')
  }),
  getContentWorkspaceMock: vi.fn(async (id: string) => ({
    id, workspaceKey: 'catalogue-freshness-test', title: 'Catalogue Freshness Test', description: null,
    systemKey: 'dnd5e', sourceGameSystemKey: null, sourceCollectionKey: null,
    status: 'active' as const, ownerAccountId: null, revision: 0, createdAt: null, updatedAt: null
  }))
}))
vi.mock('../../server/utils/directus', () => ({ directusServiceRequest: directusServiceRequestMock }))
vi.mock('../../server/utils/content-workspaces', () => ({ getContentWorkspace: getContentWorkspaceMock }))

const { loadWorkspaceAsSource, clearWorkspaceSourceCache } = await import('../../server/utils/world-content-sources')
const { writeWorkspaceEntityOverrideAtomic, __closeWorkspacePoolForTesting, __setWorkspacePoolForTesting } =
  await import('../../server/utils/content-workspace-entity-atomic')
const { resolveContentActions } = await import('../../app/lib/content-actions')

const SHORTSWORD_RAW = {
  name: 'Shortsword', source: 'XPHB', type: 'M|XPHB', weaponCategory: 'martial',
  property: ['F|XPHB', 'L|XPHB'], mastery: ['Vex|XPHB'], dmg1: '1d6', dmgType: 'P', weapon: true
}

beforeAll(async () => {
  admin = new Client({ connectionString: ADMIN_DATABASE_URL })
  await admin.connect()
  __setWorkspacePoolForTesting(new Pool({ connectionString: DATABASE_URL, max: 5 }))
})

afterAll(async () => {
  await admin.end()
  await __closeWorkspacePoolForTesting()
})

beforeEach(async () => {
  await admin.query('TRUNCATE content_entity_revisions, content_workspace_entities, content_workspaces')
  workspaceId = randomUUID()
  contentEntityId = 'ce_catfreshnesstest00000000'

  await admin.query(
    `INSERT INTO content_workspaces (id, workspace_key, title, system_key, status, revision, created_at, updated_at)
     VALUES ($1, $2, 'Catalogue Freshness Test', 'dnd5e', 'active', 0, now(), now())`,
    [workspaceId, `cat-freshness-${workspaceId.slice(0, 8)}`]
  )
  await admin.query(
    `INSERT INTO content_workspace_entities (
       id, workspace_id, content_entity_id, identity_key, address_key, source_key,
       system_key, entity_type, slug, title, origin, state,
       base_data, base_data_hash, base_source_ref, base_missing, base_refs, slug_aliases,
       authored_data, authored_presentation, authored_mechanics, authored_facet,
       revision, created_at, updated_at
     ) VALUES (
       $1, $2, $3, $4, $5, NULL,
       'dnd5e', 'item', 'shortsword-xphb', 'Shortsword', 'imported', 'active',
       $6, 'sha256-x', NULL, false, '[]', '[]',
       NULL, '[]', '[]', NULL,
       0, now(), now()
     )`,
    [
      randomUUID(), workspaceId, contentEntityId,
      `${workspaceId}::${contentEntityId}`, `${workspaceId}::dnd5e::item::shortsword-xphb`,
      JSON.stringify({ systemKey: 'dnd5e', entityType: 'item', title: 'Shortsword', slug: 'shortsword-xphb', externalId: 'x', provider: '5etools', data: SHORTSWORD_RAW })
    ]
  )

  clearWorkspaceSourceCache()
  directusServiceRequestMock.mockClear()
  getContentWorkspaceMock.mockClear()
})

afterEach(async () => {
  await admin.query('TRUNCATE content_entity_revisions, content_workspace_entities, content_workspaces')
})

async function damageDiceInCatalogue(): Promise<string | undefined> {
  const result = await loadWorkspaceAsSource(workspaceId, '4')
  if (!result.ok) throw new Error(`loadWorkspaceAsSource failed: ${JSON.stringify(result.failure)}`)
  const entry = result.entries.find((e) => e.contentEntityId === contentEntityId)
  const [action] = resolveContentActions('dnd5e', 'item', entry?.data)
  return action?.damageRoll ? `${action.damageRoll.count}d${action.damageRoll.faces}` : undefined
}

describe('catalogue resolution reflects a mechanics save, same process, repeatedly', () => {
  it('warm -> save -> resolve again -> sees the new damage; repeated with a second edit', async () => {
    // 1. Warm catalogue resolution BEFORE editing.
    const before = await damageDiceInCatalogue()
    expect(before).toBe('1d6')

    // 2. Save a mechanics change through the REAL atomic path.
    const firstWrite = await writeWorkspaceEntityOverrideAtomic({
      workspaceId, contentEntityId, expectedRevision: 0,
      columns: { authored_mechanics: [{ channel: 'mechanics', path: 'damage', value: { dice: '2d12', damageType: null }, authoredBy: '11111111-1111-4111-8111-111111111111', authoredAt: new Date().toISOString(), baseValueHash: null }] },
      revision: { kind: 'autosave', label: null, actorAccountId: '11111111-1111-4111-8111-111111111111', diff: [{ channel: 'mechanics', path: 'damage', from: undefined, to: { dice: '2d12', damageType: null } }] }
    })
    expect(firstWrite.ok).toBe(true)

    // 3 & 4. Resolve the catalogue again in the SAME process; confirm the
    // new damage reaches the real weapon action.
    const afterFirst = await damageDiceInCatalogue()
    expect(afterFirst).toBe('2d12')
    expect(directusServiceRequestMock).not.toHaveBeenCalled() // the direct-Postgres path alone served this

    // 5. Repeat with a SECOND edit, to rule out a one-time refresh effect.
    const secondWrite = await writeWorkspaceEntityOverrideAtomic({
      workspaceId, contentEntityId, expectedRevision: (firstWrite.ok ? firstWrite.entity.revision : 1),
      columns: { authored_mechanics: [{ channel: 'mechanics', path: 'damage', value: { dice: '3d6', damageType: null }, authoredBy: '11111111-1111-4111-8111-111111111111', authoredAt: new Date().toISOString(), baseValueHash: null }] },
      revision: { kind: 'autosave', label: null, actorAccountId: '11111111-1111-4111-8111-111111111111', diff: [{ channel: 'mechanics', path: 'damage', from: { dice: '2d12', damageType: null }, to: { dice: '3d6', damageType: null } }] }
    })
    expect(secondWrite.ok).toBe(true)

    const afterSecond = await damageDiceInCatalogue()
    expect(afterSecond).toBe('3d6')
    expect(directusServiceRequestMock).not.toHaveBeenCalled()
  })
})
