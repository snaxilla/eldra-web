// Pure helpers behind WorldEntityInteractivePage.vue's entity Edit/Delete
// actions (context rail AND, per the owner's product correction, each
// entity card). Extracted so the authorization-gating logic can be unit
// tested without a DOM/browser harness -- this repo has neither (see
// worldEntityHomebrewActions.ts for the established sibling-file pattern
// this follows).
//
// PRODUCT REGRESSION, corrected. These actions previously ALSO required
// the global `mode === 'build'` World Map toggle to be active, which made
// entity editing depend on a control that (correctly, per the owner) now
// lives exclusively on the World Map for pin interactions. Visibility is
// capability-only here; the server's own requireCapability('world.entity.edit')
// / requireCapability('world.entity.delete') checks on every write route
// remain the real, unaffected, authoritative gate regardless of what these
// return.
import { presentationKindForEntityType } from '~/lib/content-presentation/kind-for-entity-type'

export function canEditWorldEntities(capabilities: unknown): boolean {
  return Array.isArray(capabilities) && capabilities.includes('world.entity.edit')
}

// CREATION ENTRY POINTS, MAP THUMBNAILS, AND MAP WORDING -- a separate,
// distinct capability from edit (server: world.entity.create, e.g.
// server/api/worlds/[id]/locations.post.ts). A worldbuilder holds both,
// but they are not the same grant, so this is its own function rather
// than aliasing canEditWorldEntities.
export function canCreateWorldEntities(capabilities: unknown): boolean {
  return Array.isArray(capabilities) && capabilities.includes('world.entity.create')
}

export function canDeleteWorldEntities(capabilities: unknown): boolean {
  return Array.isArray(capabilities) && capabilities.includes('world.entity.delete')
}

// Whether the shared presentation editor supports this entity's category
// at all (species/class/background/spell/item/featureOption -- the SAME
// closed set catalogue-entity-bridge.ts's own previewer dispatch and
// presentationKindForEntityType already agree on). Unsupported categories
// (location, character/npc, feat, enemy/monster, ...) never show Edit,
// reported explicitly rather than guessed at -- not a permissions
// question, a "this category has no editor yet" question.
export function supportsDirectEdit(entityType: unknown): boolean {
  return Boolean(presentationKindForEntityType(String(entityType || '')))
}

// The combined gate an Edit action (rail or card) actually renders on:
// category support AND the caller's own capability.
export function shouldShowDirectEditAction(entityType: unknown, capabilities: unknown): boolean {
  return supportsDirectEdit(entityType) && canEditWorldEntities(capabilities)
}
