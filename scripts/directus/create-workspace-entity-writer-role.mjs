#!/usr/bin/env node
// Provisions the least-privilege `eldra_workspace_writer` Postgres role --
// Content Workspaces & Studio Pass B, concurrency hardening follow-up.
//
// server/utils/content-workspace-entity-atomic.ts is the ONLY runtime
// caller of this role's connection string (`ELDRA_WORKSPACE_DB_URL`). It
// performs real Postgres transactions directly against the database
// Directus itself uses, mirroring server/utils/character-resource-atomic.ts's
// own established pattern -- including this script's own structure, which
// mirrors scripts/directus/create-resources-unique-index.mjs's.
//
// UNLIKE every create-*-schema.mjs script in this directory, this does NOT
// go through Directus's Collections/Fields REST API -- a database ROLE and
// its GRANTs are not something that API exposes at all. This is real DDL
// (CREATE ROLE, GRANT), issued directly against Postgres.
//
// EXACT GRANT SET, AND WHY EACH ONE -- empirically verified by creating
// this role against a disposable instance and running the real-PostgreSQL
// integration suite (tests/integration/content-workspace-entity-atomic.integration.test.ts)
// against it, not the schema owner, not a superuser:
//
//   GRANT CONNECT ON DATABASE <db> TO eldra_workspace_writer;
//   GRANT USAGE ON SCHEMA public TO eldra_workspace_writer;
//   GRANT SELECT, UPDATE ON content_workspace_entities TO eldra_workspace_writer;
//   GRANT SELECT, UPDATE ON content_workspaces TO eldra_workspace_writer;
//   GRANT SELECT, INSERT ON content_entity_revisions TO eldra_workspace_writer;
//
// No DELETE anywhere, no privilege on any OTHER table in the database
// (users, sessions, every other Directus/Content Workspace collection --
// content_entity_source_snapshots, content_package_lineages,
// content_release_channels, content_pack_assets are untouched by
// content-workspace-entity-atomic.ts and therefore ungranted), and no
// sequence grant -- unlike character-resource-atomic.ts's own
// `block_instances_id_seq` need, every id this module writes
// (content_entity_revisions.id) is generated in JS (`node:crypto`'s
// `randomUUID()`), never by a database-side DEFAULT, so no sequence or
// `gen_random_uuid()` privilege is needed either.
//
// SAFETY GUARDS, identical posture to create-resources-unique-index.mjs:
// - Refuses to run without an explicit `--confirm` flag.
// - Reads the connection string from `ELDRA_WORKSPACE_ADMIN_DB_URL`
//   (falling back to `ELDRA_WORKSPACE_TEST_ADMIN_DB_URL`, then
//   `DIRECTUS_ADMIN_DB_URL` if set) -- a role capable of CREATE ROLE/GRANT,
//   NEVER the `eldra_workspace_writer` connection string itself (which is
//   deliberately never granted that privilege).
// - Dry-run by default: without `--confirm`, prints the exact statements
//   it would run and exits without connecting to any database at all.
// - Idempotent: checks `pg_roles` before CREATE ROLE; every GRANT is
//   naturally idempotent (re-granting an already-held privilege is a
//   no-op, never an error).
//
// THIS SCRIPT HAS BEEN RUN AND VERIFIED ONLY AGAINST A DISPOSABLE,
// THROWAWAY POSTGRES 16 CONTAINER (the one this pass's own handoff
// documents), never production.

import pg from 'pg'

const ROLE_NAME = 'eldra_workspace_writer'
// A role needs a LOGIN password to be usable as a connection credential.
//
// NO CREDENTIAL VALUES PRINTED (Pass B review follow-up correction). This
// script used to generate a random password itself with `randomUUID()`
// and PRINT IT to stdout when the operator had not supplied one -- stdout
// routinely ends up in CI logs, terminal scrollback, or a log aggregator,
// which is exactly the exposure "no credential values printed" exists to
// prevent. This script now NEVER invents or prints a password: the
// operator must generate one through their own secret-management process
// (e.g. `openssl rand -hex 32`) and supply it via this env var before
// running with `--confirm`. An existing role's password is never touched
// either way (re-running this script never rotates a credential already
// in use).
const DEFAULT_PASSWORD_ENV = 'ELDRA_WORKSPACE_WRITER_PASSWORD'

const ADMIN_DATABASE_URL =
  process.env.ELDRA_WORKSPACE_ADMIN_DB_URL
  || process.env.ELDRA_WORKSPACE_TEST_ADMIN_DB_URL
  || process.env.DIRECTUS_ADMIN_DB_URL

const args = process.argv.slice(2)
const confirmed = args.includes('--confirm')

const DRY_RUN_STATEMENTS = [
  `CREATE ROLE ${ROLE_NAME} LOGIN PASSWORD '<taken from ${DEFAULT_PASSWORD_ENV}, only if the role does not already exist>';`,
  `GRANT CONNECT ON DATABASE <database> TO ${ROLE_NAME};`,
  `GRANT USAGE ON SCHEMA public TO ${ROLE_NAME};`,
  `GRANT SELECT, UPDATE ON content_workspace_entities TO ${ROLE_NAME};`,
  `GRANT SELECT, UPDATE ON content_workspaces TO ${ROLE_NAME};`,
  `GRANT SELECT, INSERT ON content_entity_revisions TO ${ROLE_NAME};`
]

console.log(`Provisioning: least-privilege role '${ROLE_NAME}' for content-workspace-entity-atomic.ts`)
console.log('')

if (!confirmed) {
  console.log('Statements this script would run:')
  for (const statement of DRY_RUN_STATEMENTS) console.log(`  ${statement}`)
  console.log('')
  console.log('DRY RUN (default) -- no database connection was made, nothing was executed.')
  console.log('Re-run with --confirm to actually apply this against the database named by')
  console.log('ELDRA_WORKSPACE_ADMIN_DB_URL (or ELDRA_WORKSPACE_TEST_ADMIN_DB_URL / DIRECTUS_ADMIN_DB_URL).')
  process.exit(0)
}

if (!ADMIN_DATABASE_URL) {
  console.error('No admin database URL is set (ELDRA_WORKSPACE_ADMIN_DB_URL / ELDRA_WORKSPACE_TEST_ADMIN_DB_URL / DIRECTUS_ADMIN_DB_URL) -- refusing to run --confirm without one.')
  process.exit(1)
}

const client = new pg.Client({ connectionString: ADMIN_DATABASE_URL })

try {
  await client.connect()
  const databaseName = client.database
  if (!databaseName) throw new Error('Could not determine the target database name from the connection string.')

  const existing = await client.query('SELECT 1 FROM pg_roles WHERE rolname = $1', [ROLE_NAME])
  const roleExists = existing.rowCount > 0

  if (!roleExists) {
    const password = process.env[DEFAULT_PASSWORD_ENV]
    if (!password) {
      console.error(`Refusing to create '${ROLE_NAME}': ${DEFAULT_PASSWORD_ENV} is not set.`)
      console.error(`Generate a password with your own secret-management process (e.g. \`openssl rand -hex 32\`),`)
      console.error(`set ${DEFAULT_PASSWORD_ENV} to it, and re-run with --confirm. This script never invents`)
      console.error('or prints a credential value.')
      await client.end()
      process.exit(1)
    }
    // CREATE ROLE's PASSWORD clause does not accept a bound parameter
    // (Postgres rejects `$1` there with a syntax error -- confirmed
    // directly) -- the password is operator-supplied via the env var
    // above, never request/user input, so a literal with manual
    // quote-escaping is safe. The value itself is never logged.
    await client.query(`CREATE ROLE ${ROLE_NAME} LOGIN PASSWORD '${password.replace(/'/g, "''")}'`)
    console.log(`Created role '${ROLE_NAME}' (password taken from ${DEFAULT_PASSWORD_ENV}, not printed).`)
  } else {
    console.log(`Role '${ROLE_NAME}' already exists -- CREATE ROLE skipped, password untouched.`)
  }

  await client.query(`GRANT CONNECT ON DATABASE ${quoteIdent(databaseName)} TO ${ROLE_NAME}`)
  await client.query(`GRANT USAGE ON SCHEMA public TO ${ROLE_NAME}`)
  await client.query(`GRANT SELECT, UPDATE ON content_workspace_entities TO ${ROLE_NAME}`)
  await client.query(`GRANT SELECT, UPDATE ON content_workspaces TO ${ROLE_NAME}`)
  await client.query(`GRANT SELECT, INSERT ON content_entity_revisions TO ${ROLE_NAME}`)

  console.log('Grants applied (idempotent -- safe to re-run).')
  console.log('')
  console.log(`Set ELDRA_WORKSPACE_DB_URL to: postgres://${ROLE_NAME}:<password>@<host>:<port>/${databaseName}`)
} catch (error) {
  console.error('Provisioning failed:', error instanceof Error ? error.message : error)
  process.exitCode = 1
} finally {
  await client.end()
}

function quoteIdent(identifier) {
  return `"${identifier.replace(/"/g, '""')}"`
}
