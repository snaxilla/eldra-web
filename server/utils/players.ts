// Player creation -- .github/docs/architecture/ownership-and-permissions.md
// (Revision 2) §5.3/§6.1/§10.3. This task's OBJECTIVE: an administrator
// creates a new Player entirely from Eldra, without ever opening Directus.
//
// A "Player" IS an Account (server/utils/accounts.ts) IS a Directus user --
// unchanged from every other place this codebase already established that
// identity (Principal.accountId in server/utils/authorization.ts,
// world_memberships.account_id). This module's only job is the one thing
// accounts.ts didn't need until now: WRITING a new one, while keeping
// every Directus-specific detail entirely server-side and out of the UI's
// vocabulary (this task's own IMPORTANT section: "The product should stop
// exposing that implementation detail").
//
// USERNAME, NOT EMAIL. Verified live against the deployed instance:
// Directus's `email` field enforces real email-format validation at write
// time --
//   POST /users {"email":"silverhand", ...}
//     -> 400 "Value has to be a valid email address."
// -- so a bare username cannot be written to it directly. Also verified:
// Directus's validator rejects several IANA reserved/special-use TLDs
// specifically (.internal, .local, .invalid all 400; .com and .app both
// succeed), so the synthesized domain below is deliberately a real-shaped,
// generic TLD rather than an "obviously fake" one, which would risk the
// exact same rejection this exists to avoid. A Player's username is
// therefore stored as `${username}@${USERNAME_EMAIL_DOMAIN}` --  an
// address on a domain this instance never sends mail to or resolves --
// and Eldra strips the suffix everywhere a human sees "username": nothing
// outside this module and server/utils/accounts.ts's shared
// formatAccountDisplayName ever constructs or parses this address.
//
// NOT YET WIRED: signing in as a newly created Player through the existing
// login form (server/api/auth/login.post.ts, app/pages/login.vue) still
// expects a real `email`, unchanged by this task. This task's own SCOPE
// stops at "Add Player to World" and never mentions the login page -- a
// created Player exists and can be added to Worlds today; letting them
// actually sign in with their username is a separate, not-yet-scoped
// follow-up (see this task's own Project Knowledge Review Q4).

import { createError } from 'h3'
import { directusServiceRequest } from './directus'
import { formatAccountDisplayName, type AccountSearchResult } from './accounts'

const USERNAME_EMAIL_DOMAIN = 'players.eldra.app'
const USERNAME_PATTERN = /^[a-z0-9._-]{3,32}$/
const MIN_PASSWORD_LENGTH = 8

// A Player is exactly an Account, on the wire -- the same shape
// server/utils/accounts.ts's searchAccounts already returns, so a
// just-created Player and a search result are interchangeable to every
// caller (the Members panel, most directly: it stores whichever one is
// most recent in the same `selectedAccount` ref either way).
export type Player = AccountSearchResult

export function usernameToEmail(username: string): string {
  return `${username}@${USERNAME_EMAIL_DOMAIN}`
}

export function normalizeUsername(raw: string): string {
  return String(raw ?? '').trim().toLowerCase()
}

export function isValidUsername(username: string): boolean {
  return USERNAME_PATTERN.test(username)
}

async function usernameExists(username: string): Promise<boolean> {
  const res = await directusServiceRequest('/users', {
    method: 'GET',
    query: {
      filter: { email: { _eq: usernameToEmail(username) } },
      limit: 1,
      fields: 'id'
    }
  })

  return Array.isArray(res?.data) && res.data.length > 0
}

export type CreatePlayerInput = {
  displayName: string
  username: string
  password: string
}

// Confirmation-matching (typing the password twice) is the CALLER's job --
// server/api/players/index.post.ts checks it before ever reaching this
// function, mirroring server/utils/worlds.ts's own established split
// ("validation of `name` ... is the route handler's job"). What belongs
// here is validation that is true regardless of caller: a real display
// name, a well-formed username, a password meeting Eldra's own minimum.
export async function createPlayer(input: CreatePlayerInput): Promise<Player> {
  const displayName = input.displayName.trim()
  const username = normalizeUsername(input.username)
  const password = input.password

  if (!displayName) {
    throw createError({ statusCode: 400, statusMessage: 'Display Name is required' })
  }

  if (!isValidUsername(username)) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Username must be 3-32 characters: lowercase letters, numbers, dots, hyphens, or underscores only'
    })
  }

  if (!password || password.length < MIN_PASSWORD_LENGTH) {
    throw createError({ statusCode: 400, statusMessage: `Password must be at least ${MIN_PASSWORD_LENGTH} characters` })
  }

  if (await usernameExists(username)) {
    throw createError({ statusCode: 409, statusMessage: `Username "${username}" is already taken` })
  }

  // Directus has no single "display name" field -- first_name/last_name
  // are what formatAccountDisplayName (shared with accounts.ts) reads back
  // everywhere else in this codebase already shows an account's name.
  // Splitting on the first space is the same rule that reading them back
  // together with a space implicitly assumes.
  const [firstName, ...rest] = displayName.split(/\s+/)
  const lastName = rest.join(' ') || null

  let res: any
  try {
    res = await directusServiceRequest('/users', {
      method: 'POST',
      query: { fields: 'id,email,first_name,last_name' },
      body: {
        email: usernameToEmail(username),
        password,
        first_name: firstName,
        last_name: lastName
      }
    })
  } catch (error: any) {
    // The usernameExists check above is a courtesy pre-check, not a lock
    // -- a race between two simultaneous requests for the same username
    // can still reach Directus's own unique-index rejection. Directus's
    // schema (create-world-memberships-schema.mjs's sibling verification
    // of directus_users.email: is_unique: true) is the actual guarantee;
    // this maps its failure onto the same clean 409 the pre-check gives.
    const directusMessage = String(error?.data?.errors?.[0]?.message ?? error?.message ?? '')
    if (directusMessage.toLowerCase().includes('unique')) {
      throw createError({ statusCode: 409, statusMessage: `Username "${username}" is already taken` })
    }
    throw error
  }

  const row = res?.data ?? res
  return {
    accountId: String(row?.id ?? ''),
    displayName: formatAccountDisplayName(row)
  }
}
