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
    //
    // The identity key names a provider's subject (a Directus user id),
    // so it belongs in the log and not in a response body -- same split
    // as identityStoreError's.
    identityStoreError(
      `resolveAccountForIdentity: link ${identityKey} references missing account ${existingLink.accountId}`,
      new Error('Orphaned identity link')
    )
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
      // Not a lost race -- the insert failed for some other reason, and
      // `error` is still a raw Directus failure. Translate it rather than
      // letting Directus's own status and wording reach the browser.
      identityStoreError('insertIdentityLink', error)
    }
    const winningAccount = await findAccountById(winner.accountId)
    if (!winningAccount) {
      identityStoreError(
        `insertIdentityLink: race winner ${winner.accountId} has no account row`,
        error
      )
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
  const res: any = await identityStoreRequest('listPlatformGrants', `/items/${PLATFORM_GRANTS_COLLECTION}`, {
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

// Looks up one Account by id, with no side effects -- never creates one.
// For callers that must validate a CALLER-SUPPLIED id (an ownership
// assignment, a membership write): "this string does not name a real
// Account" is a validation failure for them, never a reason to mint one.
// `resolveAccountForIdentity` is the only function in this module allowed
// to create.
export async function getAccountById(accountId: string): Promise<EldraAccount | null> {
  const id = String(accountId ?? '').trim()
  if (!id) return null
  return await findAccountById(id)
}

export type IdentitySubject = {
  providerSubject: string
  // Seed data for first-sight provisioning only, exactly like
  // ResolveAccountInput.displayName -- never a lookup key.
  displayName: string
}

// Batch form of resolveAccountForIdentity, for a caller that needs the
// Account behind many identities in one pass (searchAccounts, below --
// up to 20 Directus users per query). Two round trips cover the common
// case where every subject has already been seen; a subject with no
// existing link falls through to resolveAccountForIdentity one at a
// time, which is what makes an identity's SECOND and later appearances in
// a search cheap while its FIRST stays exactly as safe (race-checked,
// never matched by name/email) as a first login.
//
// Keyed by providerSubject in the result map -- never by displayName or
// any other field a caller might be tempted to merge on.
export async function resolveAccountsForIdentities(
  provider: IdentityProvider,
  subjects: readonly IdentitySubject[]
): Promise<Map<string, EldraAccount>> {
  const bySubject = new Map<string, IdentitySubject>()
  for (const subject of subjects) {
    const providerSubject = String(subject?.providerSubject ?? '').trim()
    if (providerSubject) {
      bySubject.set(providerSubject, { providerSubject, displayName: String(subject?.displayName ?? '') })
    }
  }

  if (bySubject.size === 0) {
    return new Map()
  }

  const identityKeys = [...bySubject.keys()].map((providerSubject) => buildIdentityKey(provider, providerSubject))
  const links = await findIdentityLinksByKeys(identityKeys)

  const accountIdBySubject = new Map<string, string>()
  for (const link of links) {
    accountIdBySubject.set(link.providerSubject, link.accountId)
  }

  const accountIds = [...new Set(accountIdBySubject.values())]
  const accounts = await findAccountsByIds(accountIds)
  const accountsById = new Map(accounts.map((account) => [account.id, account]))

  const result = new Map<string, EldraAccount>()
  const unresolved: IdentitySubject[] = []

  for (const [providerSubject, info] of bySubject) {
    const accountId = accountIdBySubject.get(providerSubject)
    const account = accountId ? accountsById.get(accountId) : undefined
    if (account) {
      result.set(providerSubject, account)
    } else {
      // No link yet (never authenticated, never searched before) -- or a
      // link whose Account row is missing, which resolveAccountForIdentity
      // treats as the orphan case it already fails loudly on. Either way,
      // the one-at-a-time path is what owns deciding.
      unresolved.push(info)
    }
  }

  for (const info of unresolved) {
    const account = await resolveAccountForIdentity({
      provider,
      providerSubject: info.providerSubject,
      displayName: info.displayName
    })
    result.set(info.providerSubject, account)
  }

  return result
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

  const res: any = await identityStoreRequest('resolveAccountDisplayNames', `/items/${ACCOUNTS_COLLECTION}`, {
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

// THE ERROR BOUNDARY. Every identity-store read and write goes through
// here, and nothing about the store's own failure shape is allowed past
// it.
//
// WHY. Directus answers an unprovisioned collection and a collection the
// token may not read with the BYTE-IDENTICAL response: HTTP 403,
// `{"code":"FORBIDDEN","message":"You don't have permission to access
// this."}`. Verified directly against the deployed instance (11.12.0) with
// a token holding admin_access, against a control collection that
// definitely does not exist -- /items, /collections and /fields all answer
// 403 for both cases. So:
//
//   * This boundary must NOT claim "the collection is missing". It cannot
//     know that, and saying so would be a guess dressed as a diagnosis.
//   * It must NOT pass Directus's own 403 through either. Propagated
//     unchanged, a missing identity store reaches the browser as "You
//     don't have permission to access this" -- which reads as a statement
//     about the SIGNED-IN USER's permissions and is the single most
//     misleading interpretation available. (Before this boundary existed
//     that is exactly what happened: the FetchError carries statusCode
//     403, so it travelled resolvePrincipal -> authorize.ts -> client
//     untouched.)
//   * It must NOT probe `/collections` to disambiguate. That would add a
//     second Directus round-trip to every authenticated request to
//     diagnose a condition that is either permanent or absent, and
//     request-time schema introspection is not something to pay for per
//     user.
//
// So the client is told one honest, unhelpful-on-purpose thing -- the
// identity store is unavailable, 503, try later -- while the information
// that actually identifies the cause (status, Directus's own message, the
// operation attempted) goes to the server log, where an operator can see
// it and the browser cannot. 503 rather than 403/500 because the condition
// is genuinely "this dependency is not answering", which is what an
// operator needs to hear and what a client should retry.
const IDENTITY_STORE_UNAVAILABLE = 'Identity store unavailable'

function identityStoreError(operation: string, error: any): never {
  const status = error?.response?.status ?? error?.statusCode ?? error?.status ?? 'unknown'
  const directusMessage =
    error?.data?.errors?.[0]?.message ??
    error?.response?._data?.errors?.[0]?.message ??
    error?.message ??
    String(error)

  // Server-side only. Tagged like server/utils/character-sheet-safe.ts's
  // own diagnostics so it is greppable alongside the rest of this app's
  // server logging.
  console.error(
    `[eldra-accounts] identity store request failed (operation=${operation}, status=${status}): ${directusMessage}`,
    error
  )

  throw createError({ statusCode: 503, statusMessage: IDENTITY_STORE_UNAVAILABLE })
}

// Wraps one identity-store call. `operation` names what was attempted and
// appears only in the log, never in the response.
async function identityStoreRequest(operation: string, path: string, options: any): Promise<any> {
  try {
    return await directusServiceRequest(path, options)
  } catch (error: any) {
    identityStoreError(operation, error)
  }
}

async function findAccountById(accountId: string): Promise<EldraAccount | null> {
  const res: any = await identityStoreRequest('findAccountById', `/items/${ACCOUNTS_COLLECTION}`, {
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
  const res: any = await identityStoreRequest('findIdentityLinkByKey', `/items/${IDENTITY_LINKS_COLLECTION}`, {
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

// Batch counterpart of findIdentityLinkByKey, for resolveAccountsForIdentities.
async function findIdentityLinksByKeys(identityKeys: readonly string[]): Promise<EldraIdentityLink[]> {
  if (identityKeys.length === 0) return []

  const res: any = await identityStoreRequest('findIdentityLinksByKeys', `/items/${IDENTITY_LINKS_COLLECTION}`, {
    method: 'GET',
    query: {
      filter: { identity_key: { _in: identityKeys as string[] } },
      limit: -1,
      fields: IDENTITY_LINK_FIELDS
    }
  })

  return (Array.isArray(res?.data) ? res.data : []).map(normalizeIdentityLink)
}

// Batch counterpart of findAccountById, for resolveAccountsForIdentities.
async function findAccountsByIds(accountIds: readonly string[]): Promise<EldraAccount[]> {
  if (accountIds.length === 0) return []

  const res: any = await identityStoreRequest('findAccountsByIds', `/items/${ACCOUNTS_COLLECTION}`, {
    method: 'GET',
    query: {
      filter: { id: { _in: accountIds as string[] } },
      limit: -1,
      fields: ACCOUNT_FIELDS
    }
  })

  return (Array.isArray(res?.data) ? res.data : []).map(normalizeAccount)
}

async function findIdentityLinksByAccount(accountId: string): Promise<EldraIdentityLink[]> {
  const res: any = await identityStoreRequest('findIdentityLinksByAccount', `/items/${IDENTITY_LINKS_COLLECTION}`, {
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

  const res: any = await identityStoreRequest('insertAccount', `/items/${ACCOUNTS_COLLECTION}`, {
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

// Deliberately NOT routed through identityStoreRequest. Its caller
// inspects this failure to recover from the `identity_key` unique-index
// race (two concurrent first-logins), and a benign lost race is not an
// "identity store unavailable" condition -- translating it here would log
// every race as a dependency failure and discard the signal the caller
// needs. resolveAccountForIdentity owns the translation for this one path.
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
