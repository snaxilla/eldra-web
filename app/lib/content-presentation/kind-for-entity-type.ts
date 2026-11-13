// Maps a Content Workspace entity's `entityType` directly to a
// PresentationKind. Pure; no I/O.
//
// Deliberately the SAME closed set server/utils/world-content-catalogue.ts's
// PRESENTATION_KIND_BY_CATEGORY already resolves (species/class/background/
// spell/featureOption/item), transcribed by entityType instead of catalogue
// category so Content Studio -- which never computes a CatalogueCategory --
// can ask this question directly. `feat`, `enemy`/`monster`, and `subclass`
// resolve to null here for the identical reason they resolve to no
// presentation in the catalogue today: no surface consumes a narrative card
// for them yet. This is kept as its own module (not inlined) so both call
// sites can be asserted to agree, rather than drifting into two silently
// different lists.
import type { PresentationKind } from './types'

const PRESENTATION_KIND_BY_ENTITY_TYPE: Readonly<Record<string, PresentationKind>> = {
  species: 'species',
  class: 'class',
  background: 'background',
  spell: 'spell',
  featureOption: 'option',
  item: 'item'
}

export function presentationKindForEntityType(entityType: string): PresentationKind | null {
  return PRESENTATION_KIND_BY_ENTITY_TYPE[entityType] ?? null
}
