// Account search -- .github/docs/architecture/ownership-and-permissions.md
// (Revision 2) §5.3/§6.1/§10.3. "Accounts" are not a first-class Eldra
// concept yet (NON-GOALS: no Accounts collection, no IdentityLinks) -- an
// account IS a Directus user, exactly as everywhere else in this codebase
// (Principal.accountId in server/utils/authorization.ts,
// world_memberships.account_id). This module exists so nothing past this
// boundary -- not the Members admin panel, not any future caller -- ever
// needs to show or accept a raw Directus user id again.
//
// PERSISTENCE BOUNDARY (architecture doc §3.2/§10.3: "Eldra's domain and
// application layers must be able to express everything they need without
// naming a storage engine"): the storage identity (a uuid) stays entirely
// server-side and API-internal from the UI's perspective. What crosses
// into the browser is a display string and an opaque id the user never
// types, reads, or needs to understand -- they only ever click a search
// result, and the browser round-trips whatever this endpoint gave it back
// to POST /api/worlds/:id/members.

import { directusServiceRequest } from './directus'

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

  return (Array.isArray(res?.data) ? res.data : []).map((row: any) => ({
    accountId: String(row?.id ?? ''),
    displayName: formatAccountDisplayName(row)
  }))
}
