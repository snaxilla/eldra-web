#!/usr/bin/env node
// Migration: partial unique index on block_instances for the 'resources'
// block_key -- CHARACTER MECHANICS PHASE A5, Checkpoint 1.
//
// UNLIKE every sibling script in this directory, this one does NOT go
// through Directus's Collections/Fields REST API -- a unique INDEX is not
// something that API exposes at all (it manages columns/relations, never
// constraints/indexes directly). This is real DDL, issued directly against
// the Postgres instance Directus itself uses, via the same `pg` client the
// new atomic resource-persistence module (server/utils/character-resource-atomic.ts)
// uses at runtime.
//
// WHAT THIS DOES, AND WHY IT IS SAFE
// -----------------------------------------------------------------------
// CREATE UNIQUE INDEX ... ON block_instances(entity_id) WHERE block_key = 'resources'
//
// A PARTIAL unique index -- it only applies to rows where block_key =
// 'resources'. Every other block type in this shared, polymorphic table
// (inventory, spellcasting, rules_choices, progression, article_override,
// ...) is completely unaffected; this never becomes a global uniqueness
// rule across all block types. It is additive and non-destructive: nothing
// is deleted, nothing is rewritten, and (per this project's own live,
// read-only verification before this script was written) there are
// currently ZERO existing rows that would violate it -- CREATE UNIQUE INDEX
// CONCURRENTLY is used specifically so this can run against a live,
// in-use table without taking a blocking lock that would stall ordinary
// reads/writes to block_instances while it builds.
//
// WHY THIS INDEX IS NEEDED
// -----------------------------------------------------------------------
// It is what makes `INSERT ... ON CONFLICT (entity_id) WHERE block_key =
// 'resources' DO UPDATE ...` valid Postgres syntax at all -- Postgres
// requires a unique index (or constraint) whose own predicate matches the
// ON CONFLICT clause's predicate before it will accept that clause. Without
// this index, the atomic module's first-use "create or update" statements
// would fail outright with a Postgres error (no matching unique/exclusion
// constraint), not silently misbehave -- so this migration is a hard
// prerequisite for server/utils/character-resource-atomic.ts to function
// at all, not an optional hardening step.
//
// SAFETY GUARDS
// -----------------------------------------------------------------------
// - Refuses to run without an explicit `--confirm` flag.
// - Reads the connection string from `ELDRA_RESOURCE_DB_URL` (never
//   Directus's own service token/URL) -- the same credential the atomic
//   module itself expects at runtime, so a missing/misconfigured
//   credential fails this script the same way it would fail that module.
// - Dry-run by default: without `--confirm`, prints the exact statement it
//   would run and exits without connecting to any database at all.
// - Idempotent: `IF NOT EXISTS` means re-running this script against an
//   instance where the index already exists is a safe no-op, not an error.
//
// THIS SCRIPT HAS BEEN RUN AND VERIFIED ONLY AGAINST A DISPOSABLE, THROWAWAY
// POSTGRES 16 CONTAINER created and destroyed entirely within this
// project's own A5 session (never production, never the live dev Directus
// database) -- idempotency (re-running with --confirm twice) and the
// no-argument dry-run default were both directly verified there. It has
// NEVER been run with --confirm against any real environment.
//
// LEAST-PRIVILEGE DATABASE ROLE -- EMPIRICALLY VERIFIED, NOT ASSUMED
// -----------------------------------------------------------------------
// The exact grant set `character-resource-atomic.ts`'s runtime connection
// needs was verified by creating a role with ONLY the grants below against
// the disposable instance and running the full real-PostgreSQL integration
// suite (tests/integration/**) against it -- not the schema owner, not a
// superuser. One grant was missing on the first attempt and is called out
// explicitly: the SERIAL `id` column's underlying sequence needs its own
// grant, separate from the table grant -- easy to assume table privileges
// alone are sufficient, and empirically false.
//
//   GRANT CONNECT ON DATABASE <db> TO eldra_resource_writer;
//   GRANT USAGE ON SCHEMA public TO eldra_resource_writer;
//   GRANT SELECT, INSERT, UPDATE ON block_instances TO eldra_resource_writer;
//   GRANT SELECT ON entities TO eldra_resource_writer;
//   GRANT USAGE, SELECT ON SEQUENCE block_instances_id_seq TO eldra_resource_writer;
//
// Deliberately NOT granted, and not needed by anything in
// character-resource-atomic.ts: DELETE on either table, any privilege on
// any OTHER table in the database (users, sessions, every other Directus
// collection), and TRUNCATE/DROP/ALTER on anything. This role cannot read
// or write any data this module does not itself touch.
//
// This script itself (the index migration) needs a DIFFERENT, broader
// privilege (the ability to CREATE INDEX) -- it is expected to run as the
// schema owner/an admin role, never as `eldra_resource_writer`, which is
// deliberately not granted DDL rights at all.

import pg from 'pg'

const DATABASE_URL = process.env.ELDRA_RESOURCE_DB_URL

const INDEX_NAME = 'uq_block_instances_resources_entity'

const STATEMENT = `
CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS ${INDEX_NAME}
  ON block_instances (entity_id)
  WHERE block_key = 'resources';
`.trim()

const args = process.argv.slice(2)
const confirmed = args.includes('--confirm')

console.log('Migration: partial unique index for block_instances.resources')
console.log('')
console.log('Statement to run:')
console.log(STATEMENT)
console.log('')

if (!confirmed) {
  console.log('DRY RUN (default) -- no database connection was made, nothing was executed.')
  console.log('Re-run with --confirm to actually apply this migration against the database')
  console.log('named by ELDRA_RESOURCE_DB_URL. This has intentionally never been run against')
  console.log('any environment by this script\'s own authors -- that is a separate, explicitly')
  console.log('approved step.')
  process.exit(0)
}

if (!DATABASE_URL) {
  console.error('ELDRA_RESOURCE_DB_URL is not set -- refusing to run --confirm without it.')
  process.exit(1)
}

// CREATE INDEX CONCURRENTLY cannot run inside a transaction block -- a
// single statement, autocommit, on its own dedicated connection.
const client = new pg.Client({ connectionString: DATABASE_URL })

try {
  await client.connect()
  console.log(`Connected. Applying ${INDEX_NAME} ...`)
  await client.query(STATEMENT)
  console.log('Done. Index created (or already existed).')
} catch (error) {
  console.error('Migration failed:', error instanceof Error ? error.message : error)
  process.exitCode = 1
} finally {
  await client.end()
}
