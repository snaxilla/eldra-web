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

// WIDENED FOR OIDC (this task). Was a one-value literal union
// (`'directus'`) through Phase 1; an OIDC-authenticated identity's
// `provider` value is the VALIDATED ID TOKEN'S OWN `iss` (issuer) string
// -- e.g. whatever `.well-known/openid-configuration` an operator's
// configured OIDC_ISSUER_URL resolves to (server/utils/oidc.ts) -- so the
// provider space is now genuinely open-ended, never a fixed enum. This
// is the entire mechanism behind "Resolve identity by the validated
// (issuer, subject) pair": `provider` IS the issuer, `providerSubject`
// IS the subject, and `(provider, provider_subject)` was already this
// module's own identity key before OIDC existed -- no new concept, no
// schema change, just a value that is no longer always the literal
// `'directus'`. Nothing in this file, or any caller, special-cases a
// specific issuer string; an operator pointing OIDC_ISSUER_URL at a
// different OIDC-compliant provider needs no code change here.
export const DIRECTUS_PROVIDER = 'directus' as const
export type IdentityProvider = string

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

export type LinkIdentityInput = {
  accountId: string
  provider: IdentityProvider
  providerSubject: string
}

export type LinkIdentityResult =
  | { outcome: 'linked' }
  | { outcome: 'already-linked' } // idempotent: this exact (provider, subject) was already linked to this exact account
  | { outcome: 'collision'; linkedAccountId: string } // already linked, but to a DIFFERENT account

// Links a VERIFIED external identity to a SPECIFIC, ALREADY-EXISTING
// Eldra Account -- never creates a new one. The counterpart to
// resolveAccountForIdentity, for the opposite case: "I know exactly which
// Account this is for (the caller is already authenticated as it); I am
// only recording that this identity ALSO belongs to it," as opposed to
// "resolve or create whichever Account this identity belongs to."
// server/api/auth/oidc/callback.get.ts's own header explains why the
// target account for a link is always re-derived from the caller's own
// LIVE session at call time, never carried through anything client-
// influenced -- this function only ever receives an already-trusted
// accountId, the same discipline server/utils/character-ownership.ts's
// assignCharacterOwner already follows for its own accountId parameter.
//
// NEVER MATCHES BY EMAIL OR DISPLAY NAME -- this function has no such
// parameter, structurally, same as resolveAccountForIdentity.
export async function linkIdentityToAccount(input: LinkIdentityInput): Promise<LinkIdentityResult> {
  const accountId = String(input.accountId ?? '').trim()
  const providerSubject = String(input.providerSubject ?? '').trim()
  if (!accountId || !providerSubject) {
    throw createError({ statusCode: 500, statusMessage: 'Cannot link an identity without an account and a provider subject' })
  }

  const identityKey = buildIdentityKey(input.provider, providerSubject)

  const existingLink = await findIdentityLinkByKey(identityKey)
  if (existingLink) {
    if (existingLink.accountId === accountId) {
      return { outcome: 'already-linked' }
    }
    // COLLISION. This identity is real and verified, but it already
    // names a DIFFERENT Account -- refusing here is what "never grant or
    // transfer platform permissions during linking" and "never create a
    // duplicate for an existing admin" actually mean in code: this
    // function makes NO write in this branch at all.
    return { outcome: 'collision', linkedAccountId: existingLink.accountId }
  }

  try {
    await insertIdentityLink({
      accountId,
      provider: input.provider,
      providerSubject,
      identityKey
    })
  } catch (error: any) {
    // Two concurrent attempts to link the SAME identity (to the same or
    // different accounts) can still race past the check above and hit
    // identity_key's own unique-index rejection. Re-read the winner and
    // report the same outcome a non-racing caller would have seen.
    const winner = await findIdentityLinkByKey(identityKey)
    if (!winner) {
      throw error
    }
    return winner.accountId === accountId ? { outcome: 'already-linked' } : { outcome: 'collision', linkedAccountId: winner.accountId }
  }

  return { outcome: 'linked' }
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

// Batch, READ-ONLY lookup of the Accounts behind many identities at once
// (searchAccounts, below -- up to 20 Directus users per query). Two
// round trips: one batched identity-link lookup, one batched account
// lookup.
//
// NEVER CREATES. An earlier version of this function fell through to
// resolveAccountForIdentity for any subject with no existing link, which
// made a plain account SEARCH capable of provisioning a brand-new Eldra
// Account as a side effect of someone merely typing a query -- a write
// hiding inside what is supposed to be a read. A subject with no link, or
// whose linked Account is not `active`, is simply ABSENT from the
// returned map, exactly like a search that matched nothing for that
// candidate -- never an error, never a reason to mint one.
//
// `resolveAccountForIdentity` remains the only function in this module
// allowed to create, and remains exactly as eager as before: login
// (server/api/auth/login.post.ts, me.get.ts), session resolution
// (server/utils/authorization.ts's resolvePrincipal), and Player creation
// (server/utils/players.ts's createPlayer) all call it directly, never
// through this batch function, so "create Player -> immediately
// searchable" still holds -- the Account is provisioned the moment the
// Player is CREATED, not the moment someone later searches for them.
//
// Keyed by providerSubject in the result map -- never by displayName or
// any other field a caller might be tempted to merge on.
export async function lookupActiveAccountsForIdentities(
  provider: IdentityProvider,
  providerSubjects: readonly string[]
): Promise<Map<string, EldraAccount>> {
  const subjects = [...new Set(providerSubjects.map((subject) => String(subject ?? '').trim()).filter(Boolean))]

  if (subjects.length === 0) {
    return new Map()
  }

  const identityKeys = subjects.map((subject) => buildIdentityKey(provider, subject))
  const links = await findIdentityLinksByKeys(identityKeys)

  const accountIdBySubject = new Map<string, string>()
  for (const link of links) {
    accountIdBySubject.set(link.providerSubject, link.accountId)
  }

  const accountIds = [...new Set(accountIdBySubject.values())]
  const accounts = await findAccountsByIds(accountIds)
  const accountsById = new Map(accounts.map((account) => [account.id, account]))

  const result = new Map<string, EldraAccount>()
  for (const [providerSubject, accountId] of accountIdBySubject) {
    const account = accountsById.get(accountId)
    // Active only -- a suspended Account should not surface as an
    // assignable/addable search result, matching addMember's and
    // assignCharacterOwner's own active-status check at write time. A
    // link whose Account row is missing entirely (the orphan case
    // resolveAccountForIdentity fails loudly on) is likewise just absent
    // here, not an error -- this is a best-effort read, not the
    // authoritative resolution path.
    if (account && account.status === 'active') {
      result.set(providerSubject, account)
    }
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

// Batch counterpart of findIdentityLinkByKey, for lookupActiveAccountsForIdentities.
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

// Batch counterpart of findAccountById, for lookupActiveAccountsForIdentities.
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
