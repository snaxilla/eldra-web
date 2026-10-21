// Character Resource Atomic Persistence -- CHARACTER MECHANICS PHASE A5, Checkpoint 1.
//
// ---------------------------------------------------------------------------
// WHY THIS MODULE EXISTS
// ---------------------------------------------------------------------------
// `character-resources.ts`'s own `expendResourceAuthoritatively`/
// `restoreResourceAuthoritatively`, `character-recovery.ts`'s rest-recovery
// write, and `character-resource-actions.ts`'s multi-resource batch-cost
// write all share the SAME underlying shape: load the whole `resources`
// block_instances row into JS, compute a new value, PATCH the whole row
// back. That is a plain read-modify-write with no database-level condition
// -- proven, by direct inspection of Directus 11.12.0's own ItemsService
// source, to be genuinely non-atomic even when a filter is attached to the
// PATCH request (`getKeysByQuery` resolves matching ids via a SEPARATE,
// earlier SELECT; the later `updateMany` writes `WHERE id IN (keys)`,
// never re-checking the original filter condition). Two concurrent writers
// -- two simultaneous Casts spending the same resource's last unit, or a
// Cast racing a Rest recovery -- can silently lose one of their updates.
//
// This module is the SINGLE place that performs a genuinely atomic,
// database-level conditional mutation against that row, by issuing one
// parameterized SQL statement directly against the Postgres instance
// Directus itself uses (the SAME `block_instances`/`entities` tables,
// never a second persistence family). Every existing writer above is
// retargeted to call through here instead of their own read-modify-write.
//
// ---------------------------------------------------------------------------
// WHAT THIS MODULE IS NOT
// ---------------------------------------------------------------------------
// Not a general-purpose database layer: there is no query builder, no ORM,
// no generic "run this SQL" entry point. Three narrow operations exist --
// expend, reduce (restore/recovery share this shape), and nothing else.
// Every statement is a fixed, hand-written template; the only thing that
// varies per call is how many resources are named in one batch, which
// changes how many `jsonb_set`/condition clauses are concatenated into that
// SAME template, never what kind of statement is built.
//
// Not a replacement for Directus elsewhere: every OTHER character block
// (inventory, HP, spellcasting, rules choices, progression, content packs)
// keeps reading and writing through Directus's REST API, completely
// untouched. Only the `resources` block's own expenditure/restoration/
// recovery mutation moves here.
//
// PRODUCTION CACHE-COHERENCY HOTFIX -- READS NOW LIVE HERE TOO. Directus
// 11.12.0's response cache (CACHE_ENABLED=true, CACHE_STORE=redis,
// CACHE_AUTO_PURGE=true in production, confirmed directly against the live
// container's own runtime config) invalidates ONLY as a side effect of
// `ItemsService` create/update/delete calls (confirmed by reading
// `api/src/services/items.ts`: every mutation method calls
// `shouldClearCache` -> `this.cache.clear()`). This module's writes go
// straight to Postgres and never touch `ItemsService`, so they never
// trigger that invalidation -- a `GET /items/block_instances` made through
// Directus's REST API (`character-assembly.ts`'s old read) could keep
// returning a cached, PRE-expenditure response for as long as nothing else
// happens to flush Directus's cache. Proven against a real production
// reproduction (Borc, World 4/entity 1655): a confirmed, durable
// expenditure did not survive a hard page refresh, and a second
// expenditure's own optimistic guess (computed from the stale displayed
// base) was visibly overwritten by this module's own, correct, Postgres-
// truthful result once its write resolved. `readCharacterResourcesAtomic`
// closes this by making the `resources` block's READ path exactly as
// Directus-independent as its WRITE path already was -- the one character
// block where Directus's cache can never be stale relative to the truth,
// because nothing here ever asks Directus at all.
//
// ---------------------------------------------------------------------------
// CONFIGURATION
// ---------------------------------------------------------------------------
// Reads `process.env.ELDRA_RESOURCE_DB_URL` lazily, on first use, throwing a
// clear, actionable configuration error rather than silently falling back
// to a less-safe path if it is ever unset -- the whole point of retargeting
// every writer (and now every read of this one block) onto this module is
// that NONE of them may remain on a known-unsafe path, so a misconfigured
// deployment must fail loudly. In production this credential is already
// provisioned, naming the same least-privilege `eldra_resource_writer` role
// the atomic writers above use (not the schema owner/a superuser), over the
// same private network the writers already use -- see
// scripts/directus/create-resources-unique-index.mjs's own header for the
// exact grant set this module was verified against. That role already has
// `SELECT` on `block_instances`/`entities` (needed for the writers' own
// ownership/sufficiency `WHERE` clauses already); `readCharacterResourcesAtomic`
// below needs no new grant.
//
// SQL INJECTION -- every value this module ever receives (resourceId,
// amount, max, worldId, characterId) is passed as a bound parameter
// ($1, $2, ...) to `pg`, never interpolated into the SQL text itself. The
// only parts of the generated SQL that vary by input are the PARAMETER
// COUNT/POSITIONS (how many `$n` placeholders a batch has) -- never a
// value's own contents. A resourceId containing quotes, semicolons, or any
// other SQL metacharacter is treated as ordinary data by the database
// driver, exactly like any other string value.

import { Pool, type PoolConfig } from 'pg'

export type ResourceCost = {
  resourceId: string
  // A positive integer -- see `validateCosts`'s own header for the exact
  // fail-closed rule.
  amount: number
  // The AUTHORITATIVE ceiling for this resource, supplied by the CALLER
  // (always freshly derived from the Rules Engine, e.g.
  // `getDerivedCharacter`'s own `DerivedResource.max`) -- this module has
  // no Rules Engine access and computes no maximum itself, mirroring
  // character-resources.ts's own existing "max is supplied by the caller,
  // never trusted from the client, never recomputed here" boundary exactly.
  max: number
}

export type ResourceReduction = {
  resourceId: string
  // 'full' resets this resource's own expended count to zero (matches
  // `applyResourceRecovery`'s existing semantic exactly); a positive
  // integer reduces it by that many units, clamped at zero -- never a
  // rejection, mirroring the existing pure `restoreResource`'s own
  // always-succeeds-or-no-ops behavior.
  amount: 'full' | number
}

export type AtomicResourceFailureReason =
  | 'invalid-input'
  | 'not-found'
  | 'insufficient-resource'
  | 'persistence-unconfigured'
  | 'persistence-failure'

export type AtomicResourceResult =
  | { ok: true; expended: Record<string, number> }
  | { ok: false; reason: AtomicResourceFailureReason; message: string }

// ---------------------------------------------------------------------------
// Pool -- one small, bounded, lazily-created pool, reused across calls.
// ---------------------------------------------------------------------------
let pool: Pool | null = null

function getPool(): Pool {
  if (pool) return pool

  const connectionString = process.env.ELDRA_RESOURCE_DB_URL
  if (!connectionString) {
    // Thrown, not returned as a result -- a missing credential is a
    // deployment/configuration defect, not a legitimate business outcome a
    // caller should branch on the same way it branches on
    // 'insufficient-resource'. Every call site below catches this
    // specifically and maps it to `persistence-unconfigured`.
    throw new ConfigurationError('ELDRA_RESOURCE_DB_URL is not configured -- atomic resource persistence cannot run')
  }

  const config: PoolConfig = {
    connectionString,
    // Small and bounded -- this operation's real volume is one write per
    // Cast/manual-spend/rest-recovery, never a bulk path. Oversizing this
    // pool would compete with Directus's own pool for the database's total
    // max_connections for no benefit.
    max: 5,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000
  }

  pool = new Pool(config)
  return pool
}

class ConfigurationError extends Error {}

async function withPersistenceFailureHandling<T>(fn: () => Promise<T>): Promise<T | { ok: false; reason: 'persistence-unconfigured' | 'persistence-failure'; message: string }> {
  try {
    return await fn()
  } catch (error) {
    if (error instanceof ConfigurationError) {
      return { ok: false, reason: 'persistence-unconfigured', message: error.message }
    }
    return {
      ok: false,
      reason: 'persistence-failure',
      message: error instanceof Error ? error.message : 'Atomic resource persistence failed for an unknown reason'
    }
  }
}

// ---------------------------------------------------------------------------
// Validation -- fails closed, before any database round trip.
// ---------------------------------------------------------------------------

function isPositiveInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

// Required: a positive integer amount, a non-negative integer max, amount
// never exceeding max on its own (a single cost larger than the resource's
// own ceiling can never succeed regardless of current expenditure, so this
// is rejected structurally rather than via a wasted round trip), a
// non-empty resourceId, and -- REJECT DUPLICATE IDS, never silently
// normalize -- no resourceId appearing twice in the same batch (an
// ambiguous "spend N and also M more of the same resource in one call"
// is a caller bug, not something this module guesses an interpretation
// for).
function validateCosts(costs: readonly ResourceCost[]): { ok: true } | { ok: false; message: string } {
  if (!costs.length) return { ok: false, message: 'At least one resource cost is required' }

  const seen = new Set<string>()
  for (const cost of costs) {
    if (!isNonEmptyString(cost.resourceId)) return { ok: false, message: 'Every cost must name a non-empty resourceId' }
    if (seen.has(cost.resourceId)) return { ok: false, message: `Duplicate resourceId '${cost.resourceId}' in the same batch` }
    seen.add(cost.resourceId)

    if (!isPositiveInteger(cost.amount)) return { ok: false, message: `'${cost.resourceId}': amount must be a positive integer` }
    if (!isNonNegativeInteger(cost.max)) return { ok: false, message: `'${cost.resourceId}': max must be a non-negative integer` }
    if (cost.amount > cost.max) return { ok: false, message: `'${cost.resourceId}': amount (${cost.amount}) exceeds max (${cost.max}) -- can never succeed` }
  }
  return { ok: true }
}

function validateReductions(reductions: readonly ResourceReduction[]): { ok: true } | { ok: false; message: string } {
  if (!reductions.length) return { ok: false, message: 'At least one resource reduction is required' }

  const seen = new Set<string>()
  for (const reduction of reductions) {
    if (!isNonEmptyString(reduction.resourceId)) return { ok: false, message: 'Every reduction must name a non-empty resourceId' }
    if (seen.has(reduction.resourceId)) return { ok: false, message: `Duplicate resourceId '${reduction.resourceId}' in the same batch` }
    seen.add(reduction.resourceId)

    if (reduction.amount !== 'full' && !isPositiveInteger(reduction.amount)) {
      return { ok: false, message: `'${reduction.resourceId}': amount must be 'full' or a positive integer` }
    }
  }
  return { ok: true }
}

function isValidIdentity(worldId: unknown, characterId: unknown): boolean {
  return isNonEmptyString(String(worldId ?? '')) && isNonEmptyString(String(characterId ?? ''))
}

// ---------------------------------------------------------------------------
// expendCharacterResourcesAtomic -- one or several resources, all-or-nothing.
// ---------------------------------------------------------------------------
// A single-cost call and a multi-cost batch (character-resource-actions.ts's
// own "every cost in the batch, together, or none at all" rule) use the
// IDENTICAL statement shape: one `jsonb_set`/sufficiency-condition pair per
// cost, nested/ANDed into ONE template -- never two separate code paths for
// "single" vs "batch".
export async function expendCharacterResourcesAtomic(input: {
  worldId: string | number
  characterId: string | number
  costs: readonly ResourceCost[]
}): Promise<AtomicResourceResult> {
  if (!isValidIdentity(input.worldId, input.characterId)) {
    return { ok: false, reason: 'invalid-input', message: 'worldId and characterId are required' }
  }
  const validation = validateCosts(input.costs)
  if (!validation.ok) return { ok: false, reason: 'invalid-input', message: validation.message }

  const result = await withPersistenceFailureHandling(async () => {
    const client = await getPool().connect()
    try {
      // Builds ONE statement: a nested `jsonb_set(jsonb_set(..., path_1, next_1), path_2, next_2)`
      // insert-source and update-target, and an ANDed sufficiency condition per cost --
      // the SAME fixed template, parameterized by however many costs this call names.
      //
      // PRODUCTION HOTFIX -- `block_instances.data` is declared `json` in the real schema
      // (confirmed directly against Directus's own field metadata: `"type": "json"`, not
      // `jsonb` -- the disposable test schema this module was originally verified against
      // used `jsonb`, which does not actually exist in production and masked this entirely).
      // `jsonb_set`/`jsonb_build_object`/the `#-` operator below are all JSONB-ONLY -- none
      // of them has a `json` overload. The column's own value is cast to `jsonb` ONCE, at the
      // first reference (`block_instances.data::jsonb`); every subsequent `jsonb_set` call in
      // the same chain stays in jsonb space, so only the OUTERMOST result -- what actually
      // gets assigned to the `data` column -- needs casting back to `json`, at the single
      // template site below (never inside the loop). `->`/`->>` (used elsewhere in this file
      // to READ the column, e.g. the sufficiency conditions) need no cast at all -- Postgres
      // defines both operators natively for `json`.
      const params: unknown[] = [input.characterId, input.worldId]
      let insertExpended = `jsonb_build_object()`
      let updateExpr = 'block_instances.data::jsonb'
      const sufficiencyConditions: string[] = []
      const insertSufficiencyConditions: string[] = []

      input.costs.forEach((cost, index) => {
        const resourceIdx = params.length + 1
        const amountIdx = resourceIdx + 1
        const maxIdx = amountIdx + 1
        params.push(cost.resourceId, cost.amount, cost.max)

        insertExpended = `jsonb_set(${insertExpended}, ARRAY[$${resourceIdx}::text], $${amountIdx}::text::jsonb, true)`
        updateExpr = `jsonb_set(${updateExpr}, ARRAY['expended', $${resourceIdx}::text], (COALESCE((block_instances.data->'expended'->>$${resourceIdx})::int, 0) + $${amountIdx}::int)::text::jsonb, true)`
        sufficiencyConditions.push(`COALESCE((block_instances.data->'expended'->>$${resourceIdx})::int, 0) + $${amountIdx}::int <= $${maxIdx}::int`)
        insertSufficiencyConditions.push(`$${amountIdx}::int <= $${maxIdx}::int`)
        void index
      })

      const sufficiencyClause = sufficiencyConditions.join(' AND ')
      const insertSufficiencyClause = insertSufficiencyConditions.join(' AND ')

      const sql = `
        WITH ownership AS (SELECT 1 FROM entities e WHERE e.id = $1 AND e.world_id = $2)
        INSERT INTO block_instances (entity_id, block_key, label, sort, repeatable, data)
        SELECT $1, 'resources', 'Resources', 80, false, (jsonb_build_object('expended', ${insertExpended}))::json
        WHERE EXISTS (SELECT 1 FROM ownership) AND ${insertSufficiencyClause}
        ON CONFLICT (entity_id) WHERE block_key = 'resources'
        DO UPDATE SET data = (${updateExpr})::json
        WHERE EXISTS (SELECT 1 FROM ownership) AND ${sufficiencyClause}
        RETURNING data->'expended' AS expended
      `

      const rows = await client.query(sql, params)
      if (rows.rowCount === 0) {
        // Zero rows matched either because ownership failed OR because
        // sufficiency failed (ON CONFLICT ... WHERE never runs on a fresh
        // INSERT, so the insertSufficiencyClause above already enforces the
        // SAME check for a first-ever write) -- a single, cheap, read-only
        // follow-up distinguishes the two PURELY for an honest error
        // message, never to decide whether to retry the mutation itself.
        const ownershipCheck = await client.query('SELECT 1 FROM entities WHERE id = $1 AND world_id = $2', [input.characterId, input.worldId])
        if (ownershipCheck.rowCount === 0) {
          return { ok: false as const, reason: 'not-found' as const, message: 'Character not found in this world' }
        }
        return { ok: false as const, reason: 'insufficient-resource' as const, message: 'One or more resources in this batch lack sufficient remaining capacity' }
      }

      return { ok: true as const, expended: rows.rows[0].expended as Record<string, number> }
    } finally {
      client.release()
    }
  })

  return result
}

// ---------------------------------------------------------------------------
// reduceCharacterResourcesAtomic -- shared shape for restore (always a
// positive integer) and recovery ('full' or a positive integer, batched
// across every resource a Rest trigger recovers at once).
// ---------------------------------------------------------------------------
export async function reduceCharacterResourcesAtomic(input: {
  worldId: string | number
  characterId: string | number
  reductions: readonly ResourceReduction[]
}): Promise<AtomicResourceResult> {
  if (!isValidIdentity(input.worldId, input.characterId)) {
    return { ok: false, reason: 'invalid-input', message: 'worldId and characterId are required' }
  }
  const validation = validateReductions(input.reductions)
  if (!validation.ok) return { ok: false, reason: 'invalid-input', message: validation.message }

  const result = await withPersistenceFailureHandling(async () => {
    const client = await getPool().connect()
    try {
      // PRODUCTION HOTFIX -- see expendCharacterResourcesAtomic's own header comment for the
      // full root-cause explanation (`block_instances.data` is `json`, not `jsonb`; `#-` and
      // `jsonb_set` are JSONB-only). Identical fix: cast once at the first reference, cast the
      // outermost result back to `json` at the single assignment site below.
      const params: unknown[] = [input.characterId, input.worldId]
      let updateExpr = 'block_instances.data::jsonb'

      for (const reduction of input.reductions) {
        const resourceIdx = params.length + 1
        params.push(reduction.resourceId)

        if (reduction.amount === 'full') {
          // The JSONB key-delete operator -- matches `applyResourceRecovery`'s
          // own existing 'full' semantic exactly (delete the key, never leave
          // an explicit 0, though both read identically via COALESCE(...,0)).
          updateExpr = `(${updateExpr} #- ARRAY['expended', $${resourceIdx}::text])`
        } else {
          const amountIdx = resourceIdx + 1
          params.push(reduction.amount)
          updateExpr = `jsonb_set(${updateExpr}, ARRAY['expended', $${resourceIdx}::text], (GREATEST(COALESCE((block_instances.data->'expended'->>$${resourceIdx})::int, 0) - $${amountIdx}::int, 0))::text::jsonb, true)`
        }
      }

      // Reduction never fails on insufficiency (clamped at zero, mirroring
      // the existing pure restoreResource/applyResourceRecovery contract) --
      // the ONLY rejection is ownership. A first-ever reduction with nothing
      // yet expended is a legal no-op, so this is a plain UPDATE, never an
      // upsert: there is nothing meaningful to initialize by restoring or
      // recovering a resource that was never expended in the first place.
      const sql = `
        UPDATE block_instances
        SET data = (${updateExpr})::json
        WHERE entity_id = $1
          AND block_key = 'resources'
          AND EXISTS (SELECT 1 FROM entities e WHERE e.id = $1 AND e.world_id = $2)
        RETURNING data->'expended' AS expended
      `

      const rows = await client.query(sql, params)
      if (rows.rowCount === 0) {
        const ownershipCheck = await client.query('SELECT 1 FROM entities WHERE id = $1 AND world_id = $2', [input.characterId, input.worldId])
        if (ownershipCheck.rowCount === 0) {
          return { ok: false as const, reason: 'not-found' as const, message: 'Character not found in this world' }
        }
        // Ownership is fine; there is simply no `resources` row yet (nothing
        // has ever been expended) -- a legal no-op, reported as success with
        // an empty expended map, matching `loadCharacterResources`'s own
        // "absence is legal" reading.
        return { ok: true as const, expended: {} }
      }

      return { ok: true as const, expended: rows.rows[0].expended as Record<string, number> }
    } finally {
      client.release()
    }
  })

  return result
}

// ---------------------------------------------------------------------------
// readCharacterResourcesAtomic -- the authoritative READ, Directus-
// independent exactly like the writers above.
// ---------------------------------------------------------------------------
// ONE query, a LEFT JOIN rather than two round trips, so "character exists
// but has never touched this resource" and "character does not exist /
// belongs to a different world" are told apart in a single statement:
//   - Zero rows: no `entities` row matches BOTH id and world_id -- not-found
//     (the exact same ownership check the writers' own `ownership` CTE
//     performs), never conflated with a legitimate empty resources block.
//   - One row, `expended IS NULL`: the entity is real and owned, but no
//     `resources` block_instances row has ever been created for it (true of
//     every character before their first-ever expenditure) -- a legal,
//     first-class "nothing spent yet" state, matching
//     `loadCharacterResources`'s own "absence is legal" reading exactly,
//     never an error.
//   - One row, `expended` a JSON object: the real, current, durable truth.
// `data` is `json` (not `jsonb` -- see the writers' own PRODUCTION HOTFIX
// comments), and `->` is defined natively for `json` in Postgres, so this
// read needs no cast at all, unlike the writers' `jsonb_set` chains.
export type ReadResourcesFailureReason = 'not-found' | 'persistence-unconfigured' | 'persistence-failure'

export type ReadResourcesResult =
  | { ok: true; expended: Record<string, number> }
  | { ok: false; reason: ReadResourcesFailureReason; message: string }

export async function readCharacterResourcesAtomic(input: {
  worldId: string | number
  characterId: string | number
}): Promise<ReadResourcesResult> {
  if (!isValidIdentity(input.worldId, input.characterId)) {
    return { ok: false, reason: 'not-found', message: 'worldId and characterId are required' }
  }

  const result = await withPersistenceFailureHandling(async () => {
    const client = await getPool().connect()
    try {
      const sql = `
        SELECT bi.data->'expended' AS expended
        FROM entities e
        LEFT JOIN block_instances bi
          ON bi.entity_id = e.id AND bi.block_key = 'resources'
        WHERE e.id = $1 AND e.world_id = $2
      `
      const rows = await client.query(sql, [input.characterId, input.worldId])

      if (rows.rowCount === 0) {
        return { ok: false as const, reason: 'not-found' as const, message: 'Character not found in this world' }
      }

      const expended = rows.rows[0].expended as Record<string, number> | null
      return { ok: true as const, expended: expended ?? {} }
    } finally {
      client.release()
    }
  })

  return result
}

// Test-only: allows the integration suite to point this module at a
// disposable database and to close the pool between runs. Never imported
// by any production code path.
export function __setPoolForTesting(testPool: Pool | null): void {
  pool = testPool
}

export async function __closePoolForTesting(): Promise<void> {
  if (pool) {
    await pool.end()
    pool = null
  }
}
