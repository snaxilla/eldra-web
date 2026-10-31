// Pure helpers behind WorldEntityInteractivePage.vue's two Contextual
// Homebrew Authoring Entry Points (the Spells page header action and each
// spell card's per-row action). Extracted so the authorization-gating and
// route-building logic can be unit tested without a DOM/browser harness --
// this repo has neither (see tests/components/admin/content-packs/* for the
// established sibling-file pattern this follows).

export function normalizeHomebrewActionEntityType(value: any): string {
  return String(value || '').trim().toLowerCase()
}

// Gates the two actions to the Spells page only (this component is shared
// by every entity-type list page -- Species/Items/Classes/Feats/Enemies/
// etc. -- so this check is what keeps the actions off all of them) and to
// World GameMasters/Admins only, via the same per-World `capabilities`
// array world-workspace.vue's own `canBuild` already reads. UI convenience
// only -- the server's own requireCapability('world.homebrew.manage')
// check on POST /api/worlds/:id/homebrew/create remains authoritative
// regardless of what this returns.
export function shouldShowSpellHomebrewActions(entityType: any, capabilities: any): boolean {
  return normalizeHomebrewActionEntityType(entityType) === 'spell' &&
    Array.isArray(capabilities) &&
    capabilities.includes('world.homebrew.manage')
}

// Builds the deep-link into the existing Homebrew Forge
// (app/pages/worlds/[id]/homebrew/create.vue), reused unchanged by both
// actions -- no second editor, no duplicated draft-creation logic.
// `templateId` is passed through verbatim -- a legacy numeric id or a
// `catalogue:<packageId>:<slug>` string -- since catalogue-backed spell
// entity rows already use that exact id format (both derive from
// catalogue-entity-bridge.ts's shared catalogueTemplateId()), so no extra
// packageId/slug plumbing is needed to preserve source identity for either
// a legacy or Content Pack catalogue row.
export function buildHomebrewForgeRoute(worldId: string | number, templateId?: string | number | null) {
  const query: Record<string, string> = { type: 'spell' }

  const cleanTemplateId = templateId === undefined || templateId === null ? '' : String(templateId).trim()
  if (cleanTemplateId) {
    query.templateId = cleanTemplateId
  }

  return {
    path: `/worlds/${String(worldId || '')}/homebrew/create`,
    query
  }
}
