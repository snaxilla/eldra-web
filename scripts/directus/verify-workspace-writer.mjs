#!/usr/bin/env node
// Verifies the `eldra_workspace_writer` Postgres role's deployment state --
// Pass B review follow-up, Item 1. Read-only by default: connects as an
// ADMIN role (never as the writer role itself, for the read-only checks)
// and inspects `pg_roles`/`information_schema` the same way this review
// pass's own manual audit did, rather than trusting the provisioning
// script's own grant list as proof of what is actually in effect.
//
// WHAT THIS CHECKS, READ-ONLY (no --write-probe):
//   1. The role exists and can log in.
//   2. It holds NO elevated attribute (not superuser, not createrole, not
//      createdb, not replication, not bypassrls) -- a role compromise or a
//      future accidental `ALTER ROLE ... SUPERUSER` would be caught here,
//      not assumed away.
//   3. It is not a MEMBER of any other role (no privilege could be
//      inherited from a group grant this script did not itself list).
//   4. Its effective, direct table grants are EXACTLY the five this
//      pass's own provisioning script documents -- no more, no less.
//   5. PUBLIC holds no table-level grant in schema `public` (so no
//      privilege reaches this role "ambiently" through PUBLIC).
//   6. Schema/database-level privileges: USAGE on `public`, CONNECT on
//      the database -- and explicitly NOT CREATE on either (this role
//      cannot create new tables, schemas, or databases).
//
// WHAT THIS DOES NOT DO BY DEFAULT. It never connects AS the writer role
// and never writes anything, unless `--write-probe` is passed explicitly
// (see below).
//
// `--write-probe` (explicit opt-in, writes real statements): connects as
// the ADMIN role (ELDRA_WORKSPACE_ADMIN_DB_URL -- the same one the
// read-only checks use), opens ONE transaction, uses `SET LOCAL ROLE
// eldra_workspace_writer` to run the ACTUAL statement shapes
// content-workspace-entity-atomic.ts issues (UPDATE ... WHERE ...
// RETURNING *, INSERT INTO content_entity_revisions, UPDATE
// content_workspaces SET revision = revision + 1) AS the writer role --
// so every statement is genuinely privilege-checked against that role,
// not the admin connection -- against a throwaway row the SAME
// transaction creates first (as the admin role, which the writer role
// correctly cannot do itself -- it holds no INSERT on content_workspaces/
// content_workspace_entities, matching the "setup is not this module's
// own job" grant set). The whole transaction is ALWAYS ROLLED BACK
// (never committed), so nothing is left behind, success or failure.
// `SET LOCAL ROLE` to an arbitrary role requires the admin connection to
// be superuser (or an explicit member of the target role, which this
// role deliberately grants to no one) -- exactly the same "a role capable
// of CREATE ROLE/GRANT" assumption create-workspace-entity-writer-role.mjs
// itself already makes about ELDRA_WORKSPACE_ADMIN_DB_URL.
//
// Usage:
//   ELDRA_WORKSPACE_ADMIN_DB_URL=postgres://<admin>@<host>/<db> node scripts/directus/verify-workspace-writer.mjs
//   ELDRA_WORKSPACE_ADMIN_DB_URL=postgres://<admin>@<host>/<db> \
//     node scripts/directus/verify-workspace-writer.mjs --write-probe

import pg from 'pg'
import { randomUUID } from 'node:crypto'

const ROLE_NAME = 'eldra_workspace_writer'
const EXPECTED_GRANTS = [
  'content_entity_revisions.INSERT', 'content_entity_revisions.SELECT',
  'content_workspace_entities.SELECT', 'content_workspace_entities.UPDATE',
  'content_workspaces.SELECT', 'content_workspaces.UPDATE'
].sort()

const args = process.argv.slice(2)
const writeProbe = args.includes('--write-probe')

let passed = 0
let failed = 0
const check = (name, ok, detail = '') => {
  if (ok) { passed++; console.log(`  PASS  ${name}`) }
  else { failed++; console.log(`  FAIL  ${name}${detail ? ` -- ${detail}` : ''}`) }
}

console.log('== Read-only verification (connects as an admin role, never as the writer) ==\n')

const ADMIN_DATABASE_URL =
  process.env.ELDRA_WORKSPACE_ADMIN_DB_URL
  || process.env.ELDRA_WORKSPACE_TEST_ADMIN_DB_URL
  || process.env.DIRECTUS_ADMIN_DB_URL

if (!ADMIN_DATABASE_URL) {
  console.error('No admin database URL is set (ELDRA_WORKSPACE_ADMIN_DB_URL / ELDRA_WORKSPACE_TEST_ADMIN_DB_URL / DIRECTUS_ADMIN_DB_URL).')
  process.exit(1)
}

const admin = new pg.Client({ connectionString: ADMIN_DATABASE_URL })
await admin.connect()

try {
  const role = await admin.query(
    'SELECT rolcanlogin, rolsuper, rolcreaterole, rolcreatedb, rolreplication, rolbypassrls FROM pg_roles WHERE rolname = $1',
    [ROLE_NAME]
  )
  if (!role.rowCount) {
    check(`role '${ROLE_NAME}' exists`, false, 'not provisioned yet -- run create-workspace-entity-writer-role.mjs --confirm')
  } else {
    const attrs = role.rows[0]
    check(`role '${ROLE_NAME}' exists and can log in`, attrs.rolcanlogin === true)
    check('role is NOT superuser', attrs.rolsuper === false)
    check('role cannot CREATE ROLE', attrs.rolcreaterole === false)
    check('role cannot CREATE DATABASE', attrs.rolcreatedb === false)
    check('role has no REPLICATION privilege', attrs.rolreplication === false)
    check('role does not BYPASS RLS', attrs.rolbypassrls === false)

    const memberOf = await admin.query(
      `SELECT r.rolname FROM pg_auth_members m
       JOIN pg_roles r ON r.oid = m.roleid
       JOIN pg_roles u ON u.oid = m.member
       WHERE u.rolname = $1`,
      [ROLE_NAME]
    )
    check('role is not a MEMBER of any other role (no inherited group privileges)', memberOf.rowCount === 0, JSON.stringify(memberOf.rows))

    const grants = await admin.query(
      `SELECT table_name, privilege_type FROM information_schema.role_table_grants WHERE grantee = $1 ORDER BY table_name, privilege_type`,
      [ROLE_NAME]
    )
    const actual = grants.rows.map((r) => `${r.table_name}.${r.privilege_type}`).sort()
    check('effective direct table grants are EXACTLY the documented five',
      JSON.stringify(actual) === JSON.stringify(EXPECTED_GRANTS),
      `expected=${JSON.stringify(EXPECTED_GRANTS)} actual=${JSON.stringify(actual)}`)

    const publicGrants = await admin.query(
      `SELECT table_name, privilege_type FROM information_schema.role_table_grants WHERE grantee = 'PUBLIC' AND table_schema = 'public'`
    )
    check('PUBLIC holds no table-level grant in schema public (no ambient access)', publicGrants.rowCount === 0, JSON.stringify(publicGrants.rows))

    const schemaPriv = await admin.query(
      `SELECT has_schema_privilege($1, 'public', 'USAGE') AS usage, has_schema_privilege($1, 'public', 'CREATE') AS create`,
      [ROLE_NAME]
    )
    check('has USAGE on schema public', schemaPriv.rows[0].usage === true)
    check('does NOT have CREATE on schema public', schemaPriv.rows[0].create === false)

    const dbName = admin.database
    const dbPriv = await admin.query(
      `SELECT has_database_privilege($1, $2, 'CONNECT') AS connect, has_database_privilege($1, $2, 'CREATE') AS create`,
      [ROLE_NAME, dbName]
    )
    check('has CONNECT on the database', dbPriv.rows[0].connect === true)
    check('does NOT have CREATE on the database', dbPriv.rows[0].create === false)
  }
} finally {
  await admin.end()
}

if (writeProbe) {
  console.log('\n== --write-probe: the real statement shapes, run AS the writer role, always rolled back ==\n')

  const probe = new pg.Client({ connectionString: ADMIN_DATABASE_URL })
  await probe.connect()
  const workspaceId = randomUUID()
  const contentEntityId = randomUUID()

  try {
    await probe.query('BEGIN')
    // Setup, as the ADMIN connection -- the writer role correctly holds
    // no INSERT on either table (it only ever UPDATEs an existing row),
    // so this part deliberately does NOT run under `SET LOCAL ROLE`.
    await probe.query(
      `INSERT INTO content_workspaces (id, workspace_key, title, system_key, status, revision, created_at, updated_at)
       VALUES ($1, $2, 'write-probe', 'dnd5e', 'active', 0, now(), now())`,
      [workspaceId, `write-probe-${workspaceId}`]
    )
    await probe.query(
      `INSERT INTO content_workspace_entities
         (id, workspace_id, content_entity_id, identity_key, address_key, system_key, entity_type, slug, title, origin, state,
          base_missing, base_refs, slug_aliases, authored_presentation, authored_mechanics, revision, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, 'dnd5e', 'item', 'write-probe', 'Write Probe', 'imported', 'active',
               false, '[]', '[]', '[]', '[]', 0, now(), now())`,
      [randomUUID(), workspaceId, contentEntityId, `probe::${contentEntityId}`, `probe::${contentEntityId}`]
    )

    // Everything below runs AS the writer role for real -- SET LOCAL
    // scopes to this transaction only and is undone by the ROLLBACK.
    await probe.query(`SET LOCAL ROLE ${ROLE_NAME}`)

    const update = await probe.query(
      `UPDATE content_workspace_entities SET authored_presentation = $1::json, revision = revision + 1, updated_at = now()
       WHERE workspace_id = $2 AND content_entity_id = $3 AND revision = 0 RETURNING revision`,
      [JSON.stringify([]), workspaceId, contentEntityId]
    )
    check('the exact CAS UPDATE statement succeeds (as the writer role) and returns the new revision', update.rowCount === 1 && update.rows[0].revision === 1, JSON.stringify(update.rows))

    await probe.query(
      `INSERT INTO content_entity_revisions (id, workspace_id, content_entity_id, kind, label, actor_account_id, diff, at)
       VALUES ($1, $2, $3, 'autosave', NULL, NULL, $4::json, now())`,
      [randomUUID(), workspaceId, contentEntityId, JSON.stringify([])]
    )
    check('the history-row INSERT succeeds (as the writer role)', true)

    const touch = await probe.query(
      `UPDATE content_workspaces SET revision = revision + 1, updated_at = now() WHERE id = $1 RETURNING revision`,
      [workspaceId]
    )
    check('the cache-witness touch UPDATE succeeds (as the writer role) and returns the new revision', touch.rowCount === 1 && touch.rows[0].revision === 1, JSON.stringify(touch.rows))

    // Confirms the role boundary is real, not merely untested: DELETE is
    // granted to NO ONE on either table, so even AS the writer role this
    // must fail -- proving the probe is not accidentally running with
    // more privilege than the role actually has.
    try {
      await probe.query(`DELETE FROM content_workspaces WHERE id = $1`, [workspaceId])
      check('the writer role is correctly DENIED delete (no DELETE was ever granted)', false, 'DELETE unexpectedly succeeded')
    } catch (deleteError) {
      check('the writer role is correctly DENIED delete (no DELETE was ever granted)',
        deleteError instanceof Error && /permission denied/i.test(deleteError.message), deleteError instanceof Error ? deleteError.message : String(deleteError))
    }
  } catch (error) {
    check('write probe completed without an UNEXPECTED permission error', false, error instanceof Error ? error.message : String(error))
  } finally {
    await probe.query('ROLLBACK')
    await probe.end()
    console.log('\nROLLBACK issued -- nothing from this probe was committed.')
  }
}

console.log(`\n==== ${passed} passed, ${failed} failed ====`)
process.exit(failed === 0 ? 0 : 1)
