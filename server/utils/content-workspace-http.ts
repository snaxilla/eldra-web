// HTTP concerns for the Content Workspace routes: authorization, param
// and body validation, and error mapping. Kept out of the persistence and
// planning modules so those stay testable without an H3Event, and out of
// the route files so thirteen handlers cannot drift from each other.
//
// Every route calls requireCapability EXPLICITLY through these helpers.
// Nothing here is authorized by being hard to reach from the UI.

import { createError, type H3Event } from 'h3'
import type { ContentWorkspace } from '../../app/lib/content-workspaces/types'
import type { Validated } from '../../app/lib/content-workspaces/validation'
import { isWorkspaceId } from '../../app/lib/content-workspaces/validation'
import { can, requireCapability, type Capability, type Principal } from './authorization'
import { getContentWorkspace } from './content-workspaces'
import { listWorldsBoundToWorkspace } from './world-content-packs'
import { ContentWorkspacePersistenceUnavailableError, ContentWorkspaceSchemaError } from './content-workspace-schema'

export function requirePrincipal(event: H3Event): Principal {
  const principal = event.context.principal ?? null
  if (!principal) throw createError({ statusCode: 401, statusMessage: 'Authentication required' })
  return principal
}

export function requirePlatformCapability(event: H3Event, capability: Capability): Principal {
  const principal = requirePrincipal(event)
  requireCapability(principal, capability, { kind: 'platform' })
  return principal
}

// Direct-edit consolidation pass, CORRECTED after the pre-commit boundary
// review. The ONE shared editor (StudioEntityEditor.vue) is now reachable
// from two different audiences: Content Studio's own platform-level
// operators (`platformCapability`, UNCHANGED -- still works with no World
// context at all, e.g. a workspace not yet bound to any World), and an
// ordinary World admin using "Edit" on a category page, who holds only a
// WORLD capability and has never heard of a Content Workspace.
//
// THE GAP THIS REVIEW FOUND AND THIS VERSION CLOSES. The first version of
// this function granted World-scoped access whenever the caller's claimed
// `worldId` was AMONG the Worlds a workspace is bound to -- with no check
// for whether the workspace was ALSO bound to other Worlds. That meant a
// World-A-only editor (holding `world.entity.edit` on A but NOT
// `world.content.bind_workspace`) could reach a workspace SHARED between
// A and B by calling these routes directly (bypassing the separate,
// narrower escalation check `customize.post.ts` had of its own) -- i.e.
// "binding a workspace" (being one of several Worlds it happens to be
// bound to) was silently conferring shared-content edit authority, which
// is exactly what this architecture's own "do not equate World ownership
// with platform authority" warning exists to prevent.
//
// THE FIX, round two (a second boundary review found the first fix still
// wrong). `mode: 'read'` (viewing current state is not a mutation of
// shared content, and a World's own editor plausibly needs to see it to
// decide whether to request elevated access) still only requires the
// workspace to be bound to the claimed World, shared or not.
//
// `mode: 'write'` (PATCH, both revert DELETEs, checkpoint POST --
// anything that mutates or permanently records against the entity) is
// granted to a World-scoped `world.entity.edit` caller ONLY when the
// workspace is bound to EXACTLY this one World. The moment it is shared
// with even one other World, NO World-scoped capability substitutes for
// `platformCapability` -- NOT EVEN `world.content.bind_workspace`. An
// earlier version of this fix escalated to that capability instead, on
// the theory that "may bind a workspace to my World" was close enough to
// "may edit a workspace shared with other Worlds." It is not: binding
// authorizes attaching/detaching a workspace FROM THIS World; it says
// nothing about authority to change content that OTHER Worlds are
// currently relying on. A caller holding every World capability there
// is on World A, including `world.content.bind_workspace`, still has no
// platform workspace-edit authority and must not be able to mutate a
// workspace shared with World B through this function, full stop. The
// correct path for a World-only editor who wants to change a shared
// entity is `splitSharedEntityToLocalWorkspace` ("Customize for this
// World") -- it writes ONLY to a brand-new workspace bound solely to
// their own World, never to the shared one. `customize.post.ts` calls
// this SAME function for its own write, instead of a second,
// separately-maintained escalation check that could drift from this one.
export async function requireWorkspaceEntityAccess(
  event: H3Event,
  platformCapability: Capability,
  workspaceId: string,
  worldId: string | null,
  mode: 'read' | 'write' = 'write'
): Promise<Principal> {
  const principal = requirePrincipal(event)
  if (can(principal, platformCapability, { kind: 'platform' })) return principal

  if (worldId && can(principal, 'world.entity.edit', { kind: 'world', worldId })) {
    const boundWorlds = await listWorldsBoundToWorkspace(workspaceId)
    const isBoundToClaimedWorld = boundWorlds.some((id) => String(id) === String(worldId))
    if (isBoundToClaimedWorld) {
      const isShared = boundWorlds.length > 1
      if (mode === 'read') return principal
      // Write: only when this workspace belongs SOLELY to this World.
      // No World-scoped capability -- including world.content.bind_workspace --
      // ever substitutes for `platformCapability` once it's shared.
      if (!isShared) return principal
    }
  }

  throw createError({ statusCode: 403, statusMessage: `Missing capability '${platformCapability}'` })
}

export function badRequest(problems: readonly string[]): never {
  throw createError({
    statusCode: 400,
    statusMessage: problems[0] ?? 'Invalid request',
    data: { problems: [...problems] }
  })
}

// Unwraps a Validated<T>, turning problems into a 400 that lists all of
// them rather than only the first.
export function orBadRequest<T>(result: Validated<T>): T {
  if (!result.ok) badRequest(result.problems)
  return result.value
}

export function requireWorkspaceIdParam(value: unknown): string {
  if (!isWorkspaceId(value)) badRequest(['workspaceId is malformed'])
  return value as string
}

// A workspace that does not exist is a 404, and an archived one refuses
// writes -- archiving is meant to stop authoring, not merely to grey a
// row out in a list.
export async function requireWorkspace(workspaceId: string, options: { mutable?: boolean } = {}): Promise<ContentWorkspace> {
  const workspace = await getContentWorkspace(workspaceId)
  if (!workspace) throw createError({ statusCode: 404, statusMessage: 'Content Workspace not found' })

  if (options.mutable && workspace.status === 'archived') {
    throw createError({
      statusCode: 409,
      statusMessage: `Content Workspace '${workspace.title}' is archived. Restore it before changing it.`
    })
  }

  return workspace
}

// The Content Workspace collections are not provisioned, or the service
// token cannot use them. A 503 naming the operator remedy, never an empty
// list that would read as "this deployment has no workspaces".
export function asHttpError(error: unknown): never {
  if (error instanceof ContentWorkspaceSchemaError) {
    throw createError({
      statusCode: 503,
      statusMessage: 'Content Workspaces are not available on this deployment',
      data: { code: 'content-workspace-schema-unavailable', message: error.message, collection: error.collection }
    })
  }
  // Database unavailability must never surface as a 404 -- a route whose
  // only check is `if (!entity) throw 404` would otherwise report an
  // infrastructure outage as "this entity doesn't exist." See
  // content-workspace-schema.ts's own header on this error class.
  if (error instanceof ContentWorkspacePersistenceUnavailableError) {
    throw createError({
      statusCode: 503,
      statusMessage: 'Content Workspace reading/editing is not available on this deployment',
      data: { code: 'content-workspace-persistence-unavailable', message: error.message }
    })
  }
  throw error
}

// Wraps a handler body so an unprovisioned schema becomes the 503 above
// wherever it surfaces.
export async function withWorkspaceHttp<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation()
  } catch (error) {
    asHttpError(error)
  }
}
