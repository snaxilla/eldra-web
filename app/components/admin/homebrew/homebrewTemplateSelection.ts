// Pure helpers behind AdminHomebrewForgePanel.vue's template-selection
// contract. Extracted so the discriminated legacy/catalogue identity
// derivation and the deep-link preselection/type-fallback logic (added for
// Contextual Homebrew Authoring Entry Points) can be unit tested without a
// DOM/browser harness -- this repo has neither.

export type HomebrewTemplateSource = 'legacy' | 'catalogue'

export type HomebrewTemplateSelection = {
  id: string
  source: HomebrewTemplateSource
  catalogueRef: { packageId: string; packageVersion: string; slug: string } | null
}

// Never derived by parsing a template's `id` (that id is an opaque picker
// key only -- a legacy numeric id or a `catalogue:<packageId>:<slug>`
// string, see catalogue-entity-bridge.ts's catalogueTemplateId()) -- always
// read straight off the template row's own `source`/`packageId`/
// `packageVersion`/`slug` fields, exactly like selecting it by hand would.
export function deriveHomebrewTemplateSelection(template: any): HomebrewTemplateSelection {
  const source: HomebrewTemplateSource = template?.source === 'catalogue' ? 'catalogue' : 'legacy'

  return {
    id: String(template?.id || ''),
    source,
    catalogueRef: source === 'catalogue'
      ? {
          packageId: String(template?.packageId || ''),
          packageVersion: String(template?.packageVersion || ''),
          slug: String(template?.slug || '')
        }
      : null
  }
}

// Deep-link preselection: finds the exact template row a caller asked for
// by id (see worldEntityHomebrewActions.ts's buildHomebrewForgeRoute on the
// Spells-page side) within a freshly-loaded template list. Returns null
// (never a partial/fabricated row) when absent -- a missing/empty
// `initialTemplateId` intentionally matches nothing, which is what keeps
// the header "Create New Spell from Template" action from ever
// accidentally preselecting a template.
export function findInitialHomebrewTemplate(templates: any[], initialTemplateId?: string | null): any | null {
  const wanted = String(initialTemplateId || '').trim()
  if (!wanted) return null

  return (Array.isArray(templates) ? templates : []).find((template: any) =>
    String(template?.id ?? '') === wanted
  ) || null
}

// Validates a deep-linked Homebrew type against this panel's own known
// type keys, falling back to `fallback` for anything missing/unrecognized
// -- so an invalid/garbage `?type=` query param degrades to the panel's
// own default rather than erroring.
export function resolveInitialHomebrewType<T extends string>(
  initialType: any,
  knownTypeKeys: readonly T[],
  fallback: T
): T {
  return (knownTypeKeys as readonly string[]).includes(initialType) ? (initialType as T) : fallback
}
