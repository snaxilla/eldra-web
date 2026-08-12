// Derives Directus access flags (`admin_access` / `app_access`) from a
// `/users/me` record.
//
// WHY THIS EXISTS
//
// Directus 11 moved `admin_access` and `app_access` OFF `directus_roles`
// and ONTO `directus_policies`. Verified against the deployed instance
// (directus/directus:11.12.0): `GET /fields/directus_roles` returns
// `[id, name, icon, description, parent, children, policies, users]` --
// no `admin_access`, no `app_access`. A role links to policies, and a
// user may ALSO carry policies directly, so a user holds a flag when any
// policy from EITHER source grants it.
//
// The failure this prevents is silent, which is what made it expensive.
// Directus does not reject an unknown subfield: asking for
// `role.admin_access` on v11 returns HTTP 200 and quietly collapses the
// ENTIRE field selection to `{ id }` -- no role, no email, no error.
//
//   fields=id,email,role.id,role.name              -> full record
//   fields=id,email,role.id,role.name,role.admin_access -> {"id":"..."}
//
// So reading the flag from the wrong place does not fail loudly. It makes
// every administrator look like a non-admin, on a 200 response, with the
// user still authenticated -- which is precisely how an admin ended up
// being redirected out of /worlds/:id/admin to the world list.

type PolicyLink = {
  policy?: {
    admin_access?: boolean | null
    app_access?: boolean | null
  } | null
} | null

export type DirectusAccessFlag = 'admin_access' | 'app_access'

// True when any policy in `policies` grants `flag`. Tolerates anything --
// this reads deserialized JSON from an external system, so a non-array,
// a null entry, or a policy expanded as a bare id string are all just
// "no grant" rather than a crash.
export function policiesGrant(policies: unknown, flag: DirectusAccessFlag): boolean {
  if (!Array.isArray(policies)) {
    return false
  }

  return policies.some((link: PolicyLink) => {
    const policy = link?.policy
    if (!policy || typeof policy !== 'object') {
      return false
    }
    return policy[flag] === true
  })
}

// Resolves one access flag for a user record, checking every place
// Directus can put it:
//   1. policies attached directly to the user   (v11)
//   2. policies attached to the user's role     (v11)
//   3. the flag directly on the role            (v10 and earlier)
//
// (3) is kept as a fallback because it is one `||` and it means this
// normalizer stays correct if it is ever pointed at an older Directus,
// where the v11 field path would itself be the invalid one.
export function resolveAccessFlag(user: any, flag: DirectusAccessFlag): boolean {
  const role = user?.role?.data ? user.role.data : user?.role

  return (
    policiesGrant(user?.policies, flag) ||
    policiesGrant(role?.policies, flag) ||
    role?.[flag] === true
  )
}
