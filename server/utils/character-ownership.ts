// Character ownership -- Player Management (Game Admin), built on the
// Eldra Account foundation (server/utils/eldra-accounts.ts). See
// .github/docs/architecture/ownership-and-permissions.md §8.4/§12 Phase 4
// (partial) and scripts/directus/create-character-ownership-schema.mjs for
// the two collections this module owns: `entities.owner_account_id` and
// the append-only `entity_ownership_changes` history.
//
// WHAT "OWNERSHIP" MEANS HERE, PRECISELY. An owned Player Character has
// `entities.owner_account_id` set to an Eldra Account id. It is a
// bookkeeping fact -- "this account is who this character belongs to" --
// and, per this task's own scope, carries NO authorization consequence
// yet: `world.character.edit_own` is not wired up anywhere (26 existing
// character-mutation routes all require `edit_any`; see
// server/api/worlds/[id]/characters/[characterId]/abilities.put.ts's own
// note). Assigning an owner today changes what Player Management
// displays, nothing else. Making it mean something at the API layer is
// future work this column unblocks but does not perform.
//
// WHO MAY ASSIGN/UNASSIGN (this task's own AUTHORIZATION BOUNDARY
// section): exactly `platform.character.manage`, checked by every caller
// of this module (the three owner.*.ts routes), never re-derived here --
// this file has no H3Event, no Principal, and does not know a capability
// vocabulary exists. It only receives `actorAccountId` -- the Eldra
// Account id of whoever the route already authorized -- purely to record
// who made the change.
//
// SUPPORTED ENTITY TYPES. Only Player Characters are ownable.
// OWNABLE_CHARACTER_ENTITY_TYPES deliberately excludes 'npc'/'npc_sheet'
// (GM-controlled, never a player's) and bare 'character' (verified
// against the live schema: every real character-shaped entity in this
// deployment's active World uses entity_type 'pc'; 'character' is a
// type server/utils/character-sheets.ts's own normalizeCharacterType
// treats as an NPC alias, not a PC one -- so leaving it ownable would be
// inconsistent with how the rest of the codebase already classifies it).
//
// VALIDATION, IN ORDER (this task's own CHARACTER OWNERSHIP section):
//   1. The character exists, belongs to the requested World, and is an
//      ownable (PC) type.
//   2. The target Account exists and is active (getAccountById -- never
//      trusted on the caller's say-so, matching the same fix just applied
//      to addMember).
//   3. The target Account holds a CURRENT world_memberships row for this
//      World (membershipExists -- reused, not re-implemented). A Platform
//      Admin may reassign regardless of the CURRENT owner, but the NEW
//      owner must actually be a member of this World; account recovery
//      ("a player lost access and signed in with a new Account") is
//      exactly the case this protects against turning into "assign
//      ownership to a total stranger."
//
// NOT ENFORCED HERE, DELIBERATELY: that the acting Platform Admin holds
// `platform.character.manage` -- see above, that is the route's job.
//
// ATOMICITY -- RE-VERIFIED, NOT JUST ASSUMED. A real Postgres transaction
// across entities.owner_account_id and entity_ownership_changes would
// need a single connection with write access to BOTH tables. The one
// direct-Postgres credential this codebase already has
// (ELDRA_RESOURCE_DB_URL / the `eldra_resource_writer` role,
// server/utils/character-resource-atomic.ts) was checked against its own
// documented grant set (scripts/directus/create-resources-unique-index.mjs):
// `SELECT, INSERT, UPDATE` on `block_instances`, `SELECT` (read-only) on
// `entities`, and NOTHING on `eldra_accounts`/`entity_ownership_changes`.
// It cannot write `entities.owner_account_id` at all, let alone
// transactionally with a second table it has no grant on whatsoever.
// Granting a role broader write access would be a new production
// database change (out of scope here), and would reintroduce the exact
// cache-coherency hazard character-resource-atomic.ts's own header
// documents from production experience: Directus's response cache
// invalidates only as a side effect of its own ItemsService writes, so a
// raw SQL UPDATE to `entities` -- a collection read through ordinary
// Directus REST by many OTHER routes, unlike the narrow `resources` JSON
// block that module was built for -- would leave those routes' cached
// reads silently stale. No transaction is available here, truthfully.
//
// THE DESIGN THIS BECOMES: a three-state audit record (`pending` |
// `completed` | `failed`, scripts/directus/create-character-ownership-schema.mjs),
// not a claim of atomicity. The sequence (recordPendingOwnershipChange ->
// writeOwner -> markOwnershipChangeOutcome, see applyOwnerChange below)
// writes the audit row as 'pending' BEFORE attempting the real change,
// then confirms it 'completed' or 'failed' once that change's own outcome
// is known. Every reachable failure point leaves the system in an HONEST
// state -- never a row that CLAIMS a change happened when it did not:
//   - The entity write fails -> the row is marked 'failed' (best effort)
//     and the original error propagates. No false success.
//   - The entity write succeeds, confirming it fails -> the row stays
//     'pending'. The REAL change is correct; only its confirmation in the
//     history is missing, logged server-side, never thrown to the
//     caller (a thrown error here would falsely report the actual,
//     successful change as a failure -- the opposite lie).
// `getCharacterOwnership` never reads this history to answer "who owns
// this character" -- it always reads entities.owner_account_id directly,
// which is the one place that is ever authoritative. A 'pending' or
// 'failed' row is a diagnostic trail for an operator, never a substitute
// for checking the entity itself.
import { createError } from 'h3'
import { directusServiceRequest } from './directus'
import { getAccountById } from './eldra-accounts'
import { membershipExists } from './world-memberships'

export const OWNABLE_CHARACTER_ENTITY_TYPES = ['pc', 'player_character'] as const
export type OwnableCharacterEntityType = (typeof OWNABLE_CHARACTER_ENTITY_TYPES)[number]

export function isOwnableCharacterEntityType(value: unknown): value is OwnableCharacterEntityType {
  return OWNABLE_CHARACTER_ENTITY_TYPES.includes(String(value ?? '').toLowerCase() as OwnableCharacterEntityType)
}

export type CharacterOwnership = {
  entityId: string
  worldId: string
  entityType: string
  title: string
  ownerAccountId: string | null
}

// pending   -- the entities.owner_account_id write has been attempted but
//              its outcome is not yet recorded here (the process may have
//              crashed, or the second write below may itself have failed).
// completed -- the entities.owner_account_id write is CONFIRMED to have
//              succeeded.
// failed    -- the entities.owner_account_id write is CONFIRMED to have
//              NOT happened; previousOwnerAccountId is still the real
//              current owner.
//
// This is a diagnostic trail, never the source of truth for "who owns
// this character now" -- getCharacterOwnership always reads
// entities.owner_account_id directly. See the field's own note in
// scripts/directus/create-character-ownership-schema.mjs for the full
// write-safety reasoning (no cross-collection transaction exists).
export type OwnershipChangeStatus = 'pending' | 'completed' | 'failed'

export type OwnershipChangeRecord = {
  id: string
  worldId: string
  entityId: string
  previousOwnerAccountId: string | null
  newOwnerAccountId: string | null
  actorAccountId: string
  changedAt: string | null
  status: OwnershipChangeStatus
}

const ENTITY_FIELDS = 'id,world_id,entity_type,title,owner_account_id'
const OWNERSHIP_CHANGES_COLLECTION = 'entity_ownership_changes'
const OWNERSHIP_CHANGE_FIELDS =
  'id,world_id,entity_id,previous_owner_account_id,new_owner_account_id,actor_account_id,changed_at,status'

function normalizeOwnershipChange(row: any): OwnershipChangeRecord {
  return {
    id: String(row?.id ?? ''),
    worldId: String(row?.world_id ?? ''),
    entityId: String(row?.entity_id ?? ''),
    previousOwnerAccountId: row?.previous_owner_account_id ? String(row.previous_owner_account_id) : null,
    newOwnerAccountId: row?.new_owner_account_id ? String(row.new_owner_account_id) : null,
    actorAccountId: String(row?.actor_account_id ?? ''),
    changedAt: row?.changed_at ?? null,
    status: (row?.status === 'completed' || row?.status === 'failed' ? row.status : 'pending') as OwnershipChangeStatus
  }
}

// Loads and validates the character in one place, used by every operation
// below so "does this id actually name an ownable PC in this World" is
// answered identically regardless of which caller is asking.
async function loadOwnableCharacter(worldId: string | number, entityId: string | number): Promise<CharacterOwnership> {
  const res: any = await directusServiceRequest(`/items/entities/${entityId}`, {
    method: 'GET',
    query: { fields: ENTITY_FIELDS }
  })

  const row = res?.data ?? null
  if (!row || String(row.world_id) !== String(worldId)) {
    throw createError({ statusCode: 404, statusMessage: 'Character not found in this world' })
  }

  if (!isOwnableCharacterEntityType(row.entity_type)) {
    throw createError({
      statusCode: 400,
      statusMessage: `Entity type "${row.entity_type}" is not an ownable character -- ownership applies only to Player Characters`
    })
  }

  return {
    entityId: String(row.id),
    worldId: String(row.world_id),
    entityType: String(row.entity_type),
    title: String(row.title ?? ''),
    ownerAccountId: row.owner_account_id ? String(row.owner_account_id) : null
  }
}

// GET -- read-only, no validation beyond "does this character exist and
// is it ownable." Safe for any caller the route itself lets through.
export async function getCharacterOwnership(
  worldId: string | number,
  entityId: string | number
): Promise<CharacterOwnership> {
  return await loadOwnableCharacter(worldId, entityId)
}

// Inserts the audit row with status='pending' and returns its id.
// Pending, not completed -- the entities write has not been attempted
// yet when this returns.
async function recordPendingOwnershipChange(input: {
  worldId: string
  entityId: string
  previousOwnerAccountId: string | null
  newOwnerAccountId: string | null
  actorAccountId: string
}): Promise<string> {
  const res: any = await directusServiceRequest(`/items/${OWNERSHIP_CHANGES_COLLECTION}`, {
    method: 'POST',
    query: { fields: 'id' },
    body: {
      world_id: Number(input.worldId),
      entity_id: Number(input.entityId),
      previous_owner_account_id: input.previousOwnerAccountId,
      new_owner_account_id: input.newOwnerAccountId,
      actor_account_id: input.actorAccountId,
      changed_at: new Date().toISOString(),
      status: 'pending'
    }
  })

  const id = String(res?.data?.id ?? '')
  if (!id) {
    throw createError({ statusCode: 500, statusMessage: 'Ownership change record was created without an id' })
  }
  return id
}

// Patches the audit row to its final, CONFIRMED outcome. This call itself
// can fail too (see this module's header) -- if it does, the row is left
// at 'pending', which is the honest state: the entities write's own
// outcome (recorded by the caller before this runs) is real either way,
// this patch only makes that outcome legible in the history.
async function markOwnershipChangeOutcome(changeId: string, status: 'completed' | 'failed'): Promise<void> {
  await directusServiceRequest(`/items/${OWNERSHIP_CHANGES_COLLECTION}/${changeId}`, {
    method: 'PATCH',
    body: { status }
  })
}

async function writeOwner(entityId: string, ownerAccountId: string | null): Promise<void> {
  await directusServiceRequest(`/items/entities/${entityId}`, {
    method: 'PATCH',
    body: { owner_account_id: ownerAccountId }
  })
}

// THE THREE-STEP SEQUENCE every completed ownership change goes through,
// shared by assign and unassign so the two can never drift into
// different failure behavior. See this module's header for why this
// exact order and not "entity first, audit second."
//
//   1. Insert the audit row as 'pending'.                (recordPendingOwnershipChange)
//   2. Attempt the real entities.owner_account_id write.  (writeOwner)
//   3. Patch the audit row to 'completed' or 'failed',    (markOwnershipChangeOutcome)
//      matching step 2's own outcome.
//
// STEP 2 IS THE ONLY STEP THAT CAN MAKE THIS FUNCTION THROW. If it
// fails, the real change genuinely did not happen -- the row is marked
// 'failed' (best-effort) and the original error propagates, which is
// simply correct.
//
// If step 2 SUCCEEDS but step 3 (confirming that in the audit row)
// fails, this function does NOT throw. The actual, authoritative change
// -- entities.owner_account_id -- already took effect; telling the
// caller the operation failed would be a LIE in the opposite direction
// from the one this redesign exists to close (a false failure instead of
// a false success). The audit row is left 'pending', which is an honest,
// inspectable signal, and the gap is logged server-side for an operator
// to find -- exactly the same "tell the operator, not the caller"
// split server/utils/eldra-accounts.ts's own identityStoreError draws.
async function applyOwnerChange(
  changeId: string,
  entityId: string,
  newOwnerAccountId: string | null
): Promise<void> {
  try {
    await writeOwner(entityId, newOwnerAccountId)
  } catch (error) {
    await markOwnershipChangeOutcome(changeId, 'failed').catch(() => {
      // The entity write already failed; a failure to even RECORD that
      // leaves the row 'pending' -- still truthful (not a false
      // success), just less informative. Swallowed deliberately so the
      // ORIGINAL entity-write error is what the caller sees below, not
      // this secondary one.
    })
    throw error
  }

  try {
    await markOwnershipChangeOutcome(changeId, 'completed')
  } catch (confirmError) {
    console.error(
      `[character-ownership] entity ${entityId} owner updated successfully, but ownership_change ${changeId} could not be confirmed (left 'pending')`,
      confirmError
    )
  }
}

export type AssignOwnerResult = {
  ownership: CharacterOwnership
  changed: boolean
}

// Assigns, reassigns, or (when newOwnerAccountId equals the current owner)
// no-ops. Platform Admin authority to call this at all is the route's
// job; this function enforces the facts about the CHARACTER and the
// TARGET ACCOUNT, independent of who is asking -- which is exactly what
// lets a Platform Admin reassign a character away from its current owner
// without this function needing to know anything special about that case.
export async function assignCharacterOwner(
  worldId: string | number,
  entityId: string | number,
  newOwnerAccountId: string,
  actorAccountId: string
): Promise<AssignOwnerResult> {
  const targetAccountId = String(newOwnerAccountId ?? '').trim()
  if (!targetAccountId) {
    throw createError({ statusCode: 400, statusMessage: 'An owner accountId is required' })
  }

  const character = await loadOwnableCharacter(worldId, entityId)

  const account = await getAccountById(targetAccountId)
  if (!account) {
    throw createError({ statusCode: 400, statusMessage: `Account ${targetAccountId} does not exist` })
  }
  if (account.status !== 'active') {
    throw createError({ statusCode: 400, statusMessage: `Account ${targetAccountId} is not active` })
  }

  // Account recovery is the explicit product reason this check exists
  // (brief: "a player loses access... and signs in with a new Eldra
  // Account") -- it is never skipped because a Platform Admin is asking;
  // it protects the TARGET, not the actor.
  if (!(await membershipExists(character.worldId, targetAccountId))) {
    throw createError({
      statusCode: 400,
      statusMessage: `Account ${targetAccountId} has no membership in World ${character.worldId} -- add it as a member before assigning ownership`
    })
  }

  if (character.ownerAccountId === targetAccountId) {
    // No-op: brief's own instruction -- "Do not add an audit row for a
    // no-op." Returning the unchanged ownership rather than throwing: a
    // Platform Admin re-confirming the current owner is not an error.
    return { ownership: character, changed: false }
  }

  const changeId = await recordPendingOwnershipChange({
    worldId: character.worldId,
    entityId: character.entityId,
    previousOwnerAccountId: character.ownerAccountId,
    newOwnerAccountId: targetAccountId,
    actorAccountId
  })

  await applyOwnerChange(changeId, character.entityId, targetAccountId)

  return {
    ownership: { ...character, ownerAccountId: targetAccountId },
    changed: true
  }
}

export type UnassignOwnerResult = {
  ownership: CharacterOwnership
  changed: boolean
}

// Removes the current owner, leaving the character Unassigned. A
// Platform Admin may do this regardless of who the current owner is.
export async function unassignCharacterOwner(
  worldId: string | number,
  entityId: string | number,
  actorAccountId: string
): Promise<UnassignOwnerResult> {
  const character = await loadOwnableCharacter(worldId, entityId)

  if (character.ownerAccountId === null) {
    // Already Unassigned -- no-op, no audit row (same rule as assignment).
    return { ownership: character, changed: false }
  }

  const changeId = await recordPendingOwnershipChange({
    worldId: character.worldId,
    entityId: character.entityId,
    previousOwnerAccountId: character.ownerAccountId,
    newOwnerAccountId: null,
    actorAccountId
  })

  await applyOwnerChange(changeId, character.entityId, null)

  return {
    ownership: { ...character, ownerAccountId: null },
    changed: true
  }
}

// The character's own ownership history, newest first -- what the Player
// Management drawer shows alongside the current owner. Read-only; never
// filtered by which account is asking (that decision belongs to the
// route, same as everywhere else in this module).
export async function listOwnershipHistory(
  worldId: string | number,
  entityId: string | number
): Promise<OwnershipChangeRecord[]> {
  const res: any = await directusServiceRequest(`/items/${OWNERSHIP_CHANGES_COLLECTION}`, {
    method: 'GET',
    query: {
      filter: {
        _and: [{ world_id: { _eq: Number(worldId) } }, { entity_id: { _eq: Number(entityId) } }]
      },
      sort: '-changed_at,-id',
      limit: -1,
      fields: OWNERSHIP_CHANGE_FIELDS
    }
  })

  return (Array.isArray(res?.data) ? res.data : []).map(normalizeOwnershipChange)
}
