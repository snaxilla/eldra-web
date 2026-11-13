// Content Workspace Entity Atomic Persistence -- Content Workspaces &
// Studio Pass B, concurrency hardening follow-up.
//
// ---------------------------------------------------------------------------
// WHY THIS MODULE EXISTS
// ---------------------------------------------------------------------------
// content-workspace-entities.ts's own `writeOverrides` used to condition a
// write on `expectedRevision` via Directus's COLLECTION-level filtered
// PATCH (`{query:{filter:{id,revision}}, data}`). That is NOT atomic
// compare-and-set -- proven, by the same direct inspection of Directus
// 11.12.0's own ItemsService source that server/utils/character-resource-
// atomic.ts's own header already documents for `block_instances`:
// `getKeysByQuery` resolves matching ids via a SEPARATE, earlier SELECT;
// the later `updateMany` writes `WHERE id IN (keys)`, never re-checking the
// original filter condition. Two genuinely concurrent editors of the SAME
// entity -- not a maintenance-window scenario, ordinary interactive Studio
// use -- could both resolve the same (id, revision) pair before either
// write lands, and the second write would silently win.
//
// This module is the SINGLE place that performs a genuinely atomic,
// database-level conditional mutation against `content_workspace_entities`,
// its paired `content_entity_revisions` history row, and
// `content_workspaces`' own cache-witness counter -- all three in ONE
// transaction, by issuing parameterized SQL directly against the Postgres
// instance Directus itself uses (the SAME tables, never a second
// persistence family), mirroring character-resource-atomic.ts's own
// established pattern exactly rather than inventing a new one.
//
// ---------------------------------------------------------------------------
// WHAT THIS MODULE IS NOT
// ---------------------------------------------------------------------------
// Not a general-purpose database layer: one operation
// (`writeWorkspaceEntityOverrideAtomic`), one fixed statement shape, no
// query builder, no ORM. Every OTHER Content Workspace read/write
// (workspace CRUD, entity listing, import, lineage adoption, snapshots,
// checkpoints) keeps going through Directus's REST API, completely
// untouched -- only the revision-gated override write (edit AND revert,
// which share this module's one function) moves here. A checkpoint writes
// no payload change and needs no revision gate, so it stays on the
// Directus REST path.
//
// ---------------------------------------------------------------------------
// THE TRANSACTION, EXACTLY
// ---------------------------------------------------------------------------
// BEGIN;
//   UPDATE content_workspace_entities
//     SET <column> = $overrides::json, revision = revision + 1, updated_at = now()
//     WHERE workspace_id = $1 AND content_entity_id = $2 AND revision = $3
//     RETURNING *;
//   -- zero rows: ROLLBACK, then (on a fresh connection) distinguish
//   -- not-found from conflict with a plain SELECT, purely for an honest
//   -- error -- never to decide whether to retry the mutation itself.
//   INSERT INTO content_entity_revisions (...) VALUES (...);
//   UPDATE content_workspaces SET revision = revision + 1, updated_at = now() WHERE id = $workspaceId;
// COMMIT;
//
// All three writes commit or roll back together, so "the entity's own
// revision advanced" and "a history row exists" and "the workspace's cache
// witness advanced" can never disagree. A HISTORY ROW IS ALWAYS WRITTEN ON
// A SUCCESSFUL CALL NOW, even when the new value is identical to the old
// one (e.g. re-saving the same text) -- a successful write and a durable
// history entry are now the same guarantee, never a conditional one keyed
// on whether anything textually changed.
//
// `revision = revision + 1` on `content_workspaces` is itself an atomic,
// single-statement increment -- Postgres evaluates the SET expression
// against the row's current value under that row's own lock, so two
// concurrent calls (for the SAME or DIFFERENT entities in the SAME
// workspace) each apply their own +1 in turn and neither is lost, with no
// read-modify-write in application code at all.
//
// ---------------------------------------------------------------------------
// CONFIGURATION
// ---------------------------------------------------------------------------
// Reads `process.env.ELDRA_WORKSPACE_DB_URL` lazily, throwing a clear,
// actionable configuration error rather than silently falling back to the
// known-unsafe Directus-filtered-PATCH path. In production this credential
// names the least-privilege `eldra_workspace_writer` role (never the schema
// owner, never a superuser, never the role `ELDRA_RESOURCE_DB_URL` uses for
// an unrelated table family) -- see
// scripts/directus/create-workspace-entity-writer-role.mjs's own header for
// the exact grant set.
//
// SQL INJECTION -- every value this module receives is a bound parameter
// ($1, $2, ...); the only thing that varies the SQL TEXT itself is which of
// the two closed, internally-controlled column names
// ('authored_presentation' | 'authored_mechanics') to target -- never user
// input, never interpolated from a request body.

import { Pool, type PoolConfig } from 'pg'
import { randomUUID } from 'node:crypto'

export type WorkspaceOverrideColumn = 'authored_presentation' | 'authored_mechanics'

export type WorkspaceEntityRow = {
  id: string
  workspace_id: string
  content_entity_id: string
  system_key: string
  entity_type: string
  slug: string
  title: string
  origin: string
  state: string
  revision: number
  base_data: unknown
  base_data_hash: string | null
  base_source_ref: unknown
  base_missing: boolean
  base_refs: unknown
  slug_aliases: unknown
  authored_data: unknown
  authored_presentation: unknown
  authored_mechanics: unknown
  created_at: string | null
  updated_at: string | null
}

const ENTITY_ROW_FIELDS =
  'id, workspace_id, content_entity_id, system_key, entity_type, slug, title, origin, state, revision, '
  + 'base_data, base_data_hash, base_source_ref, base_missing, base_refs, slug_aliases, '
  + 'authored_data, authored_presentation, authored_mechanics, created_at, updated_at'

export type AtomicWorkspaceWriteFailureReason =
  | 'not-found'
  | 'conflict'
  | 'persistence-unconfigured'
  | 'persistence-failure'

export type AtomicWorkspaceWriteResult =
  | { ok: true; entity: WorkspaceEntityRow }
  | { ok: false; reason: AtomicWorkspaceWriteFailureReason; message: string; current?: WorkspaceEntityRow }

let pool: Pool | null = null

class ConfigurationError extends Error {}

function getPool(): Pool {
  if (pool) return pool

  const connectionString = process.env.ELDRA_WORKSPACE_DB_URL
  if (!connectionString) {
    throw new ConfigurationError('ELDRA_WORKSPACE_DB_URL is not configured -- atomic Content Workspace persistence cannot run')
  }

  const config: PoolConfig = {
    connectionString,
    // Small and bounded -- Studio editing is one interactive save per
    // admin at a time, never a bulk path. Oversizing this pool would
    // compete with Directus's own pool for the database's total
    // max_connections for no benefit.
    max: 5,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000
  }

  pool = new Pool(config)
  return pool
}

async function withPersistenceFailureHandling<T>(
  fn: () => Promise<T>
): Promise<T | { ok: false; reason: 'persistence-unconfigured' | 'persistence-failure'; message: string }> {
  try {
    return await fn()
  } catch (error) {
    if (error instanceof ConfigurationError) {
      return { ok: false, reason: 'persistence-unconfigured', message: error.message }
    }
    return {
      ok: false,
      reason: 'persistence-failure',
      message: error instanceof Error ? error.message : 'Atomic Content Workspace persistence failed for an unknown reason'
    }
  }
}

export type WorkspaceRevisionInsert = {
  kind: 'autosave' | 'revert'
  label: string | null
  actorAccountId: string | null
  diff: unknown
}

// The one write this module performs: a revision-gated update to ONE
// override column, its paired history row, and the workspace's own cache
// counter, all in one transaction. Shared by edit (kind: 'autosave') and
// revert (kind: 'revert') -- both are "replace this column's value,
// conditioned on expectedRevision," differing only in how the caller
// computed the new value and which revision `kind` to record.
export async function writeWorkspaceEntityOverrideAtomic(input: {
  workspaceId: string
  contentEntityId: string
  expectedRevision: number
  column: WorkspaceOverrideColumn
  newValue: unknown
  revision: WorkspaceRevisionInsert
}): Promise<AtomicWorkspaceWriteResult> {
  const result = await withPersistenceFailureHandling(async () => {
    const client = await getPool().connect()
    try {
      await client.query('BEGIN')

      // Column name is one of two internally-controlled literals, never
      // request input -- safe to splice into the SQL text (Postgres has
      // no way to bind a column name as a parameter).
      const updateSql = `
        UPDATE content_workspace_entities
        SET ${input.column} = $1::json, revision = revision + 1, updated_at = now()
        WHERE workspace_id = $2 AND content_entity_id = $3 AND revision = $4
        RETURNING ${ENTITY_ROW_FIELDS}
      `
      const updateResult = await client.query(updateSql, [
        JSON.stringify(input.newValue),
        input.workspaceId,
        input.contentEntityId,
        input.expectedRevision
      ])

      if (updateResult.rowCount === 0) {
        // Zero rows matched: either no such entity, or its revision has
        // already moved. A read-only follow-up on the SAME transaction
        // (still inside BEGIN, so it sees a consistent snapshot) tells the
        // two apart purely for an honest response -- never to retry.
        const currentResult = await client.query(
          `SELECT ${ENTITY_ROW_FIELDS} FROM content_workspace_entities WHERE workspace_id = $1 AND content_entity_id = $2`,
          [input.workspaceId, input.contentEntityId]
        )
        await client.query('ROLLBACK')

        if (currentResult.rowCount === 0) {
          return { ok: false as const, reason: 'not-found' as const, message: 'No such entity in this Content Workspace' }
        }
        return {
          ok: false as const,
          reason: 'conflict' as const,
          message: 'This entity was saved by someone else since you loaded it',
          current: currentResult.rows[0] as WorkspaceEntityRow
        }
      }

      // A history row is written on EVERY successful call now, never
      // conditioned on whether the value actually changed -- "the write
      // succeeded" and "a durable history entry exists" are the same
      // guarantee, in the same transaction.
      await client.query(
        `INSERT INTO content_entity_revisions (id, workspace_id, content_entity_id, kind, label, actor_account_id, at, diff)
         VALUES ($1, $2, $3, $4, $5, $6, now(), $7::json)`,
        [
          randomUUID(),
          input.workspaceId,
          input.contentEntityId,
          input.revision.kind,
          input.revision.label,
          input.revision.actorAccountId,
          JSON.stringify(input.revision.diff)
        ]
      )

      // The workspace's own cache-witness counter, atomically incremented
      // in the SAME transaction as the entity write it is witnessing --
      // never a separate, racy read-then-write, and never skippable: if
      // this fails, the whole transaction (including the entity update
      // and the history row) rolls back with it.
      await client.query(
        'UPDATE content_workspaces SET revision = revision + 1, updated_at = now() WHERE id = $1',
        [input.workspaceId]
      )

      await client.query('COMMIT')

      return { ok: true as const, entity: updateResult.rows[0] as WorkspaceEntityRow }
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined)
      throw error
    } finally {
      client.release()
    }
  })

  return result
}

// Bumps content_workspaces.revision ALONE, atomically -- used by the
// import executor (content-workspace-import.ts), which writes new/changed
// entities through Directus's own REST API (never the override path
// above) but must still advance the SAME cache witness
// world-content-sources.ts's loadWorkspaceAsSource checks, or a live-bound
// World could keep serving a cached, pre-import materialization.
export type TouchWorkspaceRevisionResult =
  | { ok: true }
  | { ok: false; reason: 'persistence-unconfigured' | 'persistence-failure'; message: string }

// Pass B review follow-up, Item 3 -- THIS USED TO RETURN `void` AND SWALLOW
// EVERY FAILURE (logged via console.error, never surfaced to the caller).
// That was wrong: the review's own required guarantee is "if rows persist
// but the revision bump fails, the operation must not report complete
// success" -- a caller that cannot observe this failure cannot honor that.
// The import executor (content-workspace-import.ts) already durably wrote
// its entities through Directus by the time this runs, so a failure here
// does not mean "nothing happened" -- it means "something happened that
// the live-bound World's cache does not yet know about," which the caller
// must report as an incomplete, retry-safe outcome rather than success.
export async function touchWorkspaceRevisionAtomic(workspaceId: string): Promise<TouchWorkspaceRevisionResult> {
  const result = await withPersistenceFailureHandling(async () => {
    const client = await getPool().connect()
    try {
      await client.query(
        'UPDATE content_workspaces SET revision = revision + 1, updated_at = now() WHERE id = $1',
        [workspaceId]
      )
      return { ok: true as const }
    } finally {
      client.release()
    }
  })

  if ('reason' in result) {
    // Still logged loudly (an operator should see a misconfigured
    // ELDRA_WORKSPACE_DB_URL immediately), in addition to now being
    // returned to the caller.
    console.error(`touchWorkspaceRevisionAtomic failed for workspace ${workspaceId}: ${result.message}`)
    return result
  }

  return { ok: true }
}

// Test-only: allows the integration suite to point this module at a
// disposable database and to close the pool between runs. Never imported
// by any production code path. Named distinctly from
// character-resource-atomic.ts's own identically-shaped test hooks --
// both files live under server/utils/, which Nuxt auto-imports globally,
// and two same-named exports there collide (confirmed: `nuxt typecheck`
// warns "Duplicated imports" and silently drops one of them).
export function __setWorkspacePoolForTesting(testPool: Pool | null): void {
  pool = testPool
}

export async function __closeWorkspacePoolForTesting(): Promise<void> {
  if (pool) {
    await pool.end()
    pool = null
  }
}
