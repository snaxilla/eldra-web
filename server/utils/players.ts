// Player creation -- .github/docs/architecture/ownership-and-permissions.md
// (Revision 2) §5.3/§6.1/§10.3. This task's OBJECTIVE: an administrator
// creates a new Player entirely from Eldra, without ever opening Directus.
//
// A "Player" IS an Account -- but since Phase 1 (Eldra Account Foundation),
// that Account is an Eldra Account, not the Directus user this module still
// creates underneath it. `createPlayer` now resolves/provisions the Eldra
// Account behind the just-created Directus user (server/utils/eldra-accounts.ts's
// resolveAccountForIdentity -- the same resolution a first login performs)
// before returning, so `accountId` here is the SAME value a later
// searchAccounts()/login would resolve for this same person, not the
// Directus id it would have been before Phase 1. This module's job is
// otherwise unchanged: WRITING a new Directus user, while keeping every
// Directus-specific detail entirely server-side and out of the UI's
// vocabulary (the original task's own IMPORTANT section: "The product
// should stop exposing that implementation detail").
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
// USERNAME LOGIN (Username Login task): server/api/auth/login.post.ts
// imports resolveLoginEmail (below) rather than re-deriving the
// username-to-email rule itself -- "There must be exactly one canonical
// implementation" (that task's own SERVER section). Existing
// administrators, created before this module existed, still sign in with
// a real email; resolveLoginEmail is what lets ONE identifier field accept
// either shape without the login route knowing anything about the
// synthesized-address convention.

import { createError } from 'h3'
import { directusServiceRequest } from './directus'
import { formatAccountDisplayName, type AccountSearchResult } from './accounts'
import { resolveAccountForIdentity } from './eldra-accounts'

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

// Resolves whatever a caller typed into the login form's single identifier
// field to the real Directus email `/auth/login` needs -- the ONE place
// this decision is made (this task's own SERVER section: "Do NOT duplicate
// username -> email translation. There must be exactly one canonical
// implementation."). A value containing "@" is assumed to already BE a
// real email -- an existing administrator, created before this module
// existed, signing in exactly as they always have -- and passes through
// unchanged (trimmed only; no case-folding, since Directus's own stored
// value was never case-folded either and changing that now would be a
// real, unrequested behavior change for those accounts). Anything else is
// assumed to be a Player's username and is converted via usernameToEmail.
//
// Deliberately never throws: an unresolvable/unknown identifier is not
// this function's problem to detect. It always produces SOME email-shaped
// string and lets Directus's own `/auth/login` be the single source of
// truth for whether it corresponds to a real account -- an unknown
// username therefore fails exactly the same way an unknown email already
// does today (this task's own ERROR HANDLING section: "Unknown username
// and incorrect password should behave exactly like today's failed
// login"), with no new error path for anything to leak through.
export function resolveLoginEmail(identifier: string): string {
  const trimmed = String(identifier ?? '').trim()
  return trimmed.includes('@') ? trimmed : usernameToEmail(normalizeUsername(trimmed))
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

  // Player Management identity-boundary fix: resolves (and, on this first
  // sight, creates) the Eldra Account behind this brand-new Directus user
  // -- the SAME resolution a first login performs. Without this, a
  // just-created Player's `accountId` would be the Directus id, while
  // every later lookup of that same person (searchAccounts, a login)
  // resolves the ELDRA id -- two different values naming one person,
  // exactly the inconsistency Phase 1 exists to eliminate. This is what
  // keeps "Create Player -> immediately searchable -> immediately
  // addable to a World" (this module's own Player Directory workflow
  // guarantee) intact now that addMember validates its accountId against
  // a real Eldra Account rather than trusting it on faith.
  const account = await resolveAccountForIdentity({
    provider: 'directus',
    providerSubject: String(row?.id ?? ''),
    displayName: formatAccountDisplayName(row)
  })

  return {
    accountId: account.id,
    displayName: account.displayName
  }
}
