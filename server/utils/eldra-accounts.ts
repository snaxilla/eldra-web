// Eldra Account identity -- .github/docs/architecture/ownership-and-permissions.md
// §6.1/§6.2/§12 Phase 1.
//
// WHAT THIS CHANGES. Until this module existed, an "account" in Eldra WAS a
// Directus user: server/utils/authorization.ts read `user.id` straight off
// `/users/me` and used it as `Principal.accountId`, and world_memberships
// stored that same Directus uuid. That made Eldra's identity model a
// property of whichever persistence engine happened to be installed
// (§6.1's decisive argument). This module introduces the smallest thing
// that fixes it: an Eldra-generated Account id, and an explicit link from
// an external provider's subject to it.
//
// THE ONE IDENTITY RULE (§6.2). An Account is resolved ONLY by
// (provider, provider_subject) -- for Beta, ('directus', <directus user
// id>). Email and display name are never identity inputs: they are
// mutable, reassignable, absent on most users of this very instance, and
// matching on them is the standard federated-identity account-takeover
// vector. `resolveAccountForIdentity` below has no email parameter at all,
// which is the enforcement.
//
// WHAT THIS IS NOT. Not a credential store, not a session store, not a
// provider framework. Directus remains the credential verifier and the
// session issuer during Beta (§6.3) -- `eldra_session` still carries a
// Directus access token and `/api/auth/login` still posts to Directus's
// own `/auth/login`. Eldra owning an Account id does NOT make this
// deployment Directus-independent for authentication; it makes the
// identity that authorization decisions are made ABOUT independent of
// Directus's user model. Those are different claims and only the second
// one is true after Phase 1.
//
// STORAGE. The three collections live in Directus's PostgreSQL and are
// reached through the ordinary service-token REST adapter -- see
// scripts/directus/create-eldra-accounts-schema.mjs's own header for why
// (cache coherency, and no new database credential needed to deploy).
// Every Directus-shaped call in this file is below the "DIRECTUS ADAPTER"
// divider; everything above it is storage-agnostic. Replacing the store
// with the direct-PostgreSQL precedent in
// server/utils/character-resource-atomic.ts means rewriting only what is
// below that divider.
//
// createError is imported explicitly (not relied on as a Nitro
// auto-import) for the same reason server/utils/authorization.ts does:
// this module is meant to be unit-tested directly under plain Vitest.
import { createError } from 'h3'
import { directusServiceRequest } from './directus'

export const ACCOUNTS_COLLECTION = 'eldra_accounts'
export const IDENTITY_LINKS_COLLECTION = 'eldra_identity_links'
export const PLATFORM_GRANTS_COLLECTION = 'eldra_platform_grants'

// Beta has exactly one provider. External providers (google, microsoft,
// facebook, an OIDC broker) are deferred to a later phase and arrive as
// additional values here -- never as a change to this module's shape, and
// never as an input to any capability decision (§6.2 rule 4).
export type IdentityProvider = 'directus'

export type EldraAccount = {
  id: string
  displayName: string
  status: string
}

export type EldraIdentityLink = {
  id: string
  accountId: string
  provider: string
  providerSubject: string
}

const ACCOUNT_FIELDS = 'id,display_name,status'
const IDENTITY_LINK_FIELDS = 'id,account_id,provider,provider_subject'

// Canonical single-column stand-ins for the two composite unique keys
// Directus's Fields API cannot express. Both are computed here and never
// parsed anywhere -- see the schema script's COMPOSITE UNIQUENESS note.
export function buildIdentityKey(provider: string, providerSubject: string): string {
  return `${provider}|${providerSubject}`
}

export function buildGrantKey(accountId: string, capability: string): string {
  return `${accountId}|${capability}`
}

function normalizeAccount(row: any): EldraAccount {
  return {
    id: String(row?.id ?? ''),
    displayName: String(row?.display_name ?? ''),
    status: String(row?.status ?? 'active')
  }
}

function normalizeIdentityLink(row: any): EldraIdentityLink {
  return {
    id: String(row?.id ?? ''),
    accountId: String(row?.account_id ?? ''),
    provider: String(row?.provider ?? ''),
    providerSubject: String(row?.provider_subject ?? '')
  }
}

// ---------------------------------------------------------------------------
// Identity resolution -- the one entry point resolvePrincipal calls.
// ---------------------------------------------------------------------------

export type ResolveAccountInput = {
  provider: IdentityProvider
  // The provider's own stable subject. Deliberately the only identifying
  // input: there is no email parameter, so no caller can accidentally
  // match an Account by one.
  providerSubject: string
  // Used ONLY when a brand-new Account is created, to seed a readable
  // name. Never a lookup key, never compared, and never used to decide
  // whether an existing Account matches.
  displayName: string
}

// Resolves -- creating on first sight -- the Eldra Account behind an
// authenticated external identity.
//
// LAZY PROVISIONING, NOT A BULK MIGRATION. Nothing migrates every Directus
// user ahead of time (explicitly out of scope): an Account appears the
// first time its identity actually authenticates, and is reused on every
// later request. That makes this function the migration, and makes it
// idempotent by construction -- the second call for the same subject reads
// the row the first one wrote.
export async function resolveAccountForIdentity(input: ResolveAccountInput): Promise<EldraAccount> {
  const providerSubject = String(input.providerSubject ?? '').trim()
  if (!providerSubject) {
    throw createError({ statusCode: 500, statusMessage: 'Cannot resolve an Eldra Account without a provider subject' })
  }

  const identityKey = buildIdentityKey(input.provider, providerSubject)

  const existingLink = await findIdentityLinkByKey(identityKey)
  if (existingLink) {
    const account = await findAccountById(existingLink.accountId)
    if (account) {
      return account
    }
    // A link pointing at an Account that no longer exists. Directus's
    // Fields API cannot declare a real foreign key here, so this is
    // reachable by hand-editing the store. Fail closed and loudly rather
    // than silently minting a second Account for an identity that already
    // claims one -- a silent re-mint would orphan that identity's
    // memberships and look like data loss.
    throw createError({
      statusCode: 500,
      statusMessage: `Identity link ${identityKey} references a missing Eldra Account`
    })
  }

  const account = await insertAccount({
    displayName: String(input.displayName ?? '').trim() || providerSubject
  })

  try {
    await insertIdentityLink({
      accountId: account.id,
      provider: input.provider,
      providerSubject,
      identityKey
    })
  } catch (error: any) {
    // Two concurrent first-logins for the same identity. identity_key's
    // database-level uniqueness is the real guard (the read above is only
    // a courtesy pre-check), so the loser re-reads and returns the
    // winner's Account. The Account row this call already inserted is
    // left in place, unreferenced: nothing points at it, nothing can
    // authenticate as it, and deleting rows to tidy up a race is a worse
    // trade than leaving one inert row behind.
    const winner = await findIdentityLinkByKey(identityKey)
    if (!winner) {
      throw error
    }
    const winningAccount = await findAccountById(winner.accountId)
    if (!winningAccount) {
      throw error
    }
    return winningAccount
  }

  return account
}

// Every provider subject currently linked to this Account.
//
// WHY THIS IS EXPOSED. Rows written before Phase 1 key an account by its
// DIRECTUS user id -- world_memberships.account_id and
// roll_events.roller_user_id both do. Those stores are Directus-owned and
// are not re-keyed by this phase (a bulk re-key of live content is its own
// explicitly-approved migration), so reads against them must look for
// either identifier. Returning the subjects lets
// server/utils/authorization.ts build that lookup set once per request
// instead of every call site re-deriving it. Writes always use the Eldra
// Account id, so the legacy half of the set shrinks to nothing over time.
export async function listIdentitySubjectsForAccount(accountId: string): Promise<string[]> {
  const links = await findIdentityLinksByAccount(accountId)
  return links.map((link) => link.providerSubject).filter(Boolean)
}

// The Account's explicitly granted platform capabilities, as raw strings.
//
// Returns strings rather than PlatformCapability so this module never
// imports server/utils/authorization.ts (which imports this one). The
// caller narrows against its own vocabulary and drops anything it does not
// recognize, so a stale or hand-edited row can never widen the capability
// set -- see resolvePlatformCapabilities in authorization.ts.
export async function listPlatformGrants(accountId: string): Promise<string[]> {
  const res: any = await directusServiceRequest(`/items/${PLATFORM_GRANTS_COLLECTION}`, {
    method: 'GET',
    query: {
      filter: { account_id: { _eq: accountId } },
      limit: -1,
      fields: 'capability'
    }
  })

  return (Array.isArray(res?.data) ? res.data : [])
    .map((row: any) => String(row?.capability ?? '').trim())
    .filter(Boolean)
}

// Display names for Eldra Account ids. Ids that are NOT Eldra Accounts --
// a legacy Directus-keyed membership or roll row -- are simply absent from
// the returned map, which is what lets the caller fall back to its
// existing Directus lookup for exactly those (see resolveDisplayNames in
// server/utils/world-memberships.ts).
export async function resolveAccountDisplayNames(accountIds: string[]): Promise<Map<string, string>> {
  const ids = accountIds.map((id) => String(id ?? '').trim()).filter(Boolean)
  if (ids.length === 0) {
    return new Map()
  }

  const res: any = await directusServiceRequest(`/items/${ACCOUNTS_COLLECTION}`, {
    method: 'GET',
    query: {
      filter: { id: { _in: ids } },
      limit: -1,
      fields: ACCOUNT_FIELDS
    }
  })

  const names = new Map<string, string>()
  for (const row of Array.isArray(res?.data) ? res.data : []) {
    const account = normalizeAccount(row)
    if (account.id && account.displayName) {
      names.set(account.id, account.displayName)
    }
  }
  return names
}

// ---------------------------------------------------------------------------
// DIRECTUS ADAPTER -- everything below this line knows the store's shape.
// Everything above it does not. Replacing Directus with the direct
// PostgreSQL precedent (server/utils/character-resource-atomic.ts) means
// rewriting only this section.
// ---------------------------------------------------------------------------

async function findAccountById(accountId: string): Promise<EldraAccount | null> {
  const res: any = await directusServiceRequest(`/items/${ACCOUNTS_COLLECTION}`, {
    method: 'GET',
    query: {
      filter: { id: { _eq: accountId } },
      limit: 1,
      fields: ACCOUNT_FIELDS
    }
  })

  const row = Array.isArray(res?.data) ? res.data[0] : null
  return row ? normalizeAccount(row) : null
}

async function findIdentityLinkByKey(identityKey: string): Promise<EldraIdentityLink | null> {
  const res: any = await directusServiceRequest(`/items/${IDENTITY_LINKS_COLLECTION}`, {
    method: 'GET',
    query: {
      filter: { identity_key: { _eq: identityKey } },
      limit: 1,
      fields: IDENTITY_LINK_FIELDS
    }
  })

  const row = Array.isArray(res?.data) ? res.data[0] : null
  return row ? normalizeIdentityLink(row) : null
}

async function findIdentityLinksByAccount(accountId: string): Promise<EldraIdentityLink[]> {
  const res: any = await directusServiceRequest(`/items/${IDENTITY_LINKS_COLLECTION}`, {
    method: 'GET',
    query: {
      filter: { account_id: { _eq: accountId } },
      limit: -1,
      fields: IDENTITY_LINK_FIELDS
    }
  })

  return (Array.isArray(res?.data) ? res.data : []).map(normalizeIdentityLink)
}

async function insertAccount(input: { displayName: string }): Promise<EldraAccount> {
  const now = new Date().toISOString()

  const res: any = await directusServiceRequest(`/items/${ACCOUNTS_COLLECTION}`, {
    method: 'POST',
    query: { fields: ACCOUNT_FIELDS },
    body: {
      // `id` is deliberately NOT supplied: the collection's primary key
      // carries Directus's `uuid` special, so the store generates it. What
      // matters for §6.1 is that the value is Eldra's own and bears no
      // relationship to any Directus user id -- not which layer calls
      // randomUUID.
      display_name: input.displayName,
      status: 'active',
      created_at: now,
      updated_at: now
    }
  })

  const account = normalizeAccount(res?.data ?? res)
  if (!account.id) {
    throw createError({ statusCode: 500, statusMessage: 'Eldra Account was created without an id' })
  }
  return account
}

async function insertIdentityLink(input: {
  accountId: string
  provider: string
  providerSubject: string
  identityKey: string
}): Promise<void> {
  await directusServiceRequest(`/items/${IDENTITY_LINKS_COLLECTION}`, {
    method: 'POST',
    body: {
      account_id: input.accountId,
      provider: input.provider,
      provider_subject: input.providerSubject,
      identity_key: input.identityKey,
      linked_at: new Date().toISOString()
    }
  })
}
