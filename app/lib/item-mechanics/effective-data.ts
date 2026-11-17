// Effective Item Data -- Items Mechanics Editing, release one. The ONE
// shared, pure resolver merging a Content Workspace item entity's raw base
// data with its `mechanics`-channel authored overrides, dispatched by
// `systemKey` exactly like resolveItemMechanics/resolveItemAttunementRequired
// (./index.ts) -- the generic editor and every catalogue/preview consumer
// never need to know which raw keys a given system's editable fields map
// to, only that this ONE function produces the data every existing
// resolver already reads.
//
// WIRING. Every place that resolves item mechanics/actions/display from a
// workspace entity's raw payload must pass its result through here FIRST:
// server/utils/world-content-sources.ts's `WorkspaceSourceEntry.data`
// (catalogue + character path) and the entity-detail route's saved-state
// preview (server/api/content/workspaces/.../index.get.ts). A
// world-content-sources.ts fix alone does NOT cover the second path --
// they are different modules with no shared merge call (see the Items
// Mechanics Editing investigation's own §5 finding).
//
// PURITY. Never mutates `rawData`; an entity with no mechanics overrides
// (the overwhelming majority, today effectively all of them) returns
// `rawData` BY REFERENCE, unchanged -- so every downstream consumer that
// currently reads unmerged raw data keeps working identically when this
// is wired in.

import { overridesForChannel, type FieldOverride } from '../content-authoring/overrides'
import { applyDnd5eItemMechanicsOverrides } from './dnd5e-editing'

type MechanicsOverrideApplier = (rawData: unknown, mechanicsOverrides: readonly FieldOverride[]) => unknown

const APPLIERS: Record<string, MechanicsOverrideApplier> = {
  dnd5e: applyDnd5eItemMechanicsOverrides
}

export function resolveEffectiveItemData(systemKey: string, rawData: unknown, overrides: readonly FieldOverride[]): unknown {
  const mechanicsOverrides = overridesForChannel(overrides, 'mechanics')
  if (!mechanicsOverrides.length) return rawData

  const applier = APPLIERS[systemKey]
  if (!applier) return rawData

  return applier(rawData, mechanicsOverrides)
}
