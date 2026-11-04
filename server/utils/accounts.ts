// Account search -- .github/docs/architecture/ownership-and-permissions.md
// (Revision 2) §5.3/§6.1/§10.3, §12 Phase 1. An account is now an ELDRA
// Account (server/utils/eldra-accounts.ts), not a Directus user -- this
// module's job is unchanged (nothing past this boundary, not the Members
// panel, not the Player Management ownership picker, ever needs to show
// or accept a raw storage id again), but WHICH id crosses the boundary
// changed with Phase 1.
//
// DIRECTUS IS STILL THE DIRECTORY, THE ACCOUNT LAYER IS STILL THE IDENTITY.
// Directus's `directus_users` remains the only place with a searchable
// name/email -- `eldra_accounts` has no email field at all (§6.2: email is
// never an identity input) and nothing to text-match against beyond the
// display name it was seeded with. So this still searches `/users` first,
// exactly as before Phase 1, and then resolves each matched Directus user
// through `resolveAccountsForIdentities` -- matched ONLY by
// (provider, provider_subject), never by the email/name that found it in
// the first place, which is what keeps this search from ever becoming a
// second, looser way to merge two identities.
//
// LAZY PROVISIONING AS A SIDE EFFECT OF SEARCH. A Directus user who has
// never logged in (e.g. one `createPlayer` just created from Game Admin)
// has no Eldra Account yet. resolveAccountsForIdentities provisions one on
// first sight, the same way a first login does -- the alternative, only
// returning users who already have one, would make a just-created Player
// briefly unfindable by the admin who just created them, for no safety
// benefit (the identity being provisioned is still keyed on their real
// Directus subject, never guessed).
//
// PERSISTENCE BOUNDARY (architecture doc §3.2/§10.3: "Eldra's domain and
// application layers must be able to express everything they need without
// naming a storage engine"): the storage identity (now an Eldra Account
// uuid) stays entirely server-side and API-internal from the UI's
// perspective. What crosses into the browser is a display string and an
// opaque id the user never types, reads, or needs to understand -- they
// only ever click a search result, and the browser round-trips whatever
// this endpoint gave it back to POST /api/worlds/:id/members or the
// character ownership routes.

import { directusServiceRequest } from './directus'
import { resolveAccountsForIdentities } from './eldra-accounts'

export type AccountSearchResult = {
  accountId: string
  displayName: string
}

// Directus's directus_users schema (verified live against the deployed
// instance: GET /fields/directus_users) has no "username" field --
// first_name/last_name/email are the only identifying fields that exist.
// This resolves the SAME display string server/utils/world-memberships.ts's
// member list already shows (that module imports this function rather
// than keeping its own copy), so an account looks identical whether you
// are searching for it or looking at an existing member row.
export function formatAccountDisplayName(row: any): string {
  const first = String(row?.first_name ?? '').trim()
  const last = String(row?.last_name ?? '').trim()
  const full = `${first} ${last}`.trim()
  return full || String(row?.email ?? '').trim() || String(row?.id ?? '')
}

const MAX_RESULTS = 20

// Matches against first_name, last_name, AND email -- but email is a
// SEARCH CRITERION only, never present in AccountSearchResult. This is
// what makes typing "bob" find an account whose email is
// "bob@example.com" even though no formal "username" field exists to
// search instead (this task's own SEARCH section's "bob" example), while
// still satisfying "No email... in the response" (this task's own SCOPE
// section) -- the two constraints apply to different sides of the same
// request.
//
// No pagination, no ranking beyond Directus's own default order, no
// debounce/caching here (that is the CALLER's concern, if any) -- this
// task's own NON-GOALS rule out both "autocomplete optimization" and
// "pagination". A result cap exists so a single-character query against a
// large user base cannot return an unbounded list; 20 is generous for
// "type a name, see a short list, click one."
export async function searchAccounts(query: string): Promise<AccountSearchResult[]> {
  const q = query.trim()
  if (!q) {
    return []
  }

  const res = await directusServiceRequest('/users', {
    method: 'GET',
    query: {
      filter: {
        _or: [{ first_name: { _icontains: q } }, { last_name: { _icontains: q } }, { email: { _icontains: q } }]
      },
      limit: MAX_RESULTS,
      fields: 'id,first_name,last_name,email'
    }
  })

  const rows = Array.isArray(res?.data) ? res.data : []
  if (rows.length === 0) {
    return []
  }

  // Resolved ONLY by (provider, provider_subject) -- the text match above
  // found candidates in the Directus directory; this step never repeats
  // that match against anything. Two different Directus users who happen
  // to share a display name resolve to two different Eldra Accounts here,
  // exactly as they would on two separate logins.
  const resolved = await resolveAccountsForIdentities(
    'directus',
    rows.map((row: any) => ({
      providerSubject: String(row?.id ?? ''),
      displayName: formatAccountDisplayName(row)
    }))
  )

  const results: AccountSearchResult[] = []
  for (const row of rows) {
    const account = resolved.get(String(row?.id ?? ''))
    // Unreachable in practice: resolveAccountsForIdentities either resolves
    // every requested subject or throws (an orphaned link throws, it is
    // never silently dropped) -- this guard is defensive only, so a future
    // change to that contract fails a missing-result here rather than
    // pushing a malformed row.
    if (!account) continue
    results.push({
      accountId: account.id,
      displayName: account.displayName || formatAccountDisplayName(row)
    })
  }
  return results
}
