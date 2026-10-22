// Cast Funding Configuration -- CHARACTER MECHANICS PHASE A5, Phase 3
// (Resource-Funded Spellcasting, UI completion).
//
// The funding-method counterpart of `cast-configuration.ts`'s own
// `resolveCastConfiguration`: a pure, zero-I/O function of exactly the
// authoritative facts already on hand (`CharacterAction.fundingOptions`,
// itself server-derived and re-verified on every real Cast -- see
// character-cast.ts's own `resolveCastFunding`) plus this character's own
// CURRENT resource list, never a Rules Engine call of its own. Decides
// WHAT the Cast Configuration panel shows for payment method and whether
// a genuine choice exists to present; `character-cast.ts`'s own
// `resolveCastFunding` remains the SOLE authority for which method a real
// Cast actually accepts -- a stale/forged selection here is simply
// rejected there, exactly like a stale `castLevel`/`choices` selection
// already is.
//
// A spell with NO `fundingOptions` at all (every spell before this phase,
// and the vast majority of the corpus after it) resolves to
// `requiresFundingChoice: false` -- the EXISTING Cast behavior for every
// such spell is untouched byte-for-byte; this module is consulted but
// never changes what renders.

export type CastFundingResourceOption = {
  resourceId: string
  label: string
  max: number
  expended: number
  remaining: number
}

// A minimal, read-only view of one of this character's own resources --
// the SAME shape `character-derived.ts`'s own `DerivedResource` already
// is, restated narrowly here (not imported) so this module stays a pure
// leaf with no dependency on the server-side derivation types, mirroring
// `cast-configuration.ts`'s own `SpellSlotLevel`-only dependency.
export type CharacterResourceView = {
  id: string
  label: string
  max: number
  expended: number
  remaining: number
}

export type CastFundingConfigurationViewModel = {
  // Whether an ordinary spell slot is a legal payment method for this
  // spell AT ALL (never whether one is currently AVAILABLE -- that is
  // `resolveCastConfiguration`'s own `canCast`, read separately so the
  // two pure functions never duplicate each other's arithmetic). `true`
  // when this spell has no funding options (nothing to narrow slot
  // funding), matching every pre-Phase-3 spell's existing behavior.
  slotFundingAllowed: boolean
  // One entry per declared funding option, resolved against this
  // character's own current resource list. A `fundingOptions` entry
  // naming a resource the character does not currently have access to
  // (a repin/subclass change mid-session) is silently omitted -- the
  // same "absence is honest" posture `character-derived.ts`'s own
  // UNRESOLVED RESOURCE IDS handling already takes, never a crash.
  resourceOptions: CastFundingResourceOption[]
  // True only when there is something to actually show in a Cast
  // Configuration panel for funding -- i.e. this spell declares at
  // least one funding option. A resource-ONLY spell (Darkness) still
  // shows this (so its real cost is never hidden), even though there is
  // only ever one legal pick; a dual-funded spell (Misty Step) shows a
  // genuine slot-vs-resource choice.
  requiresFundingChoice: boolean
}

export function resolveCastFundingConfiguration(input: {
  fundingOptions: readonly { resourceId: string; slotFundingAllowed: boolean }[]
  resources: readonly CharacterResourceView[]
}): CastFundingConfigurationViewModel {
  const { fundingOptions, resources } = input

  if (!fundingOptions.length) {
    return { slotFundingAllowed: true, resourceOptions: [], requiresFundingChoice: false }
  }

  const slotFundingAllowed = fundingOptions.some((option) => option.slotFundingAllowed)

  const resourceOptions: CastFundingResourceOption[] = []
  for (const option of fundingOptions) {
    const resource = resources.find((candidate) => candidate.id === option.resourceId)
    if (!resource) continue
    resourceOptions.push({
      resourceId: resource.id,
      label: resource.label,
      max: resource.max,
      expended: resource.expended,
      remaining: resource.remaining
    })
  }

  return { slotFundingAllowed, resourceOptions, requiresFundingChoice: true }
}

// The method a freshly-opened Cast Configuration panel should pre-select --
// prefers the first AVAILABLE resource (free uses before a slot is the
// RAW-favored default for every real spell this phase supports), then
// falls back to 'slot' when no resource has a remaining use, and finally
// to the first resource anyway (even exhausted) so SOMETHING is always
// selected for a resource-only spell with nothing else to offer -- the
// confirm button's own `disabled` state (never this function) is what
// actually prevents Casting an unaffordable selection.
export function defaultFundingMethod(
  config: CastFundingConfigurationViewModel,
  slotCurrentlyAvailable: boolean
): 'slot' | string | null {
  if (!config.requiresFundingChoice) return 'slot'
  const availableResource = config.resourceOptions.find((option) => option.remaining > 0)
  if (availableResource) return availableResource.resourceId
  if (config.slotFundingAllowed && slotCurrentlyAvailable) return 'slot'
  return config.resourceOptions[0]?.resourceId ?? (config.slotFundingAllowed ? 'slot' : null)
}

// Whether `method` (a prior selection, possibly now stale -- a resource
// could have been exhausted by another tab, or the spell's own funding
// options could have changed via a repin) is CURRENTLY usable. Mirrors
// `hasCompleteSelection`'s own "does the current selection still make
// sense" check for castLevel/choices, generalized to funding.
export function isFundingMethodAvailable(
  method: 'slot' | string | null,
  config: CastFundingConfigurationViewModel,
  slotCurrentlyAvailable: boolean
): boolean {
  if (method === null) return false
  if (method === 'slot') return config.slotFundingAllowed && slotCurrentlyAvailable
  const resource = config.resourceOptions.find((option) => option.resourceId === method)
  return Boolean(resource && resource.remaining > 0)
}

// ---------------------------------------------------------------------------
// A5 PHASE 3 FINAL ACCEPTANCE -- the three CharacterActionsPanel.vue combinators,
// extracted here so FUNDING-SELECTION INTEGRITY is directly unit-testable
// rather than only reachable through a mounted component (this repo has no
// Vue component-test harness -- see this task's own report). Each one takes
// the SAME already-resolved facts the Vue component already has on hand
// (this spell's `CastFundingConfigurationViewModel`, whether a slot is
// CURRENTLY available/requires configuring, and this action's own STORED
// selection, if any) and makes exactly the ONE decision the component
// previously made inline. None of the three ever reads a castLevel -- by
// construction, changing cast level cannot influence funding selection.

// The method actually in effect for this action right now: the player's
// own STORED pick (`stored`, read from `interaction.castFunding[action.id]`
// by the caller) when one exists, otherwise the same default a freshly
// opened panel would pre-select. `stored` is undefined (never a stale
// 'slot'/resourceId guess) until `openConfiguration` -- or the player's own
// click -- first sets it, matching castLevels/castChoices's own identical
// "undefined until first touched" precedent.
export function resolveSelectedFundingMethod(
  stored: string | undefined,
  config: CastFundingConfigurationViewModel,
  slotCurrentlyAvailable: boolean
): 'slot' | string | null {
  return stored ?? defaultFundingMethod(config, slotCurrentlyAvailable)
}

// The combined "can this Cast possibly succeed right now" fact. For an
// unfunded spell (`requiresFundingChoice: false`) this is byte-identical to
// `slotCanCast` -- the existing, untouched pre-Phase-3 fact. For a funded
// spell it is true whenever EITHER a slot is available (and allowed) OR at
// least one resource option still has a remaining use -- a resource-only
// spell (Darkness) with an exhausted resource and a dual-funded spell
// (Misty Step) with both its slot and its resource exhausted both
// correctly resolve `false` here, never a fabricated slot-casting
// permission.
export function resolveOverallCastAvailability(
  config: CastFundingConfigurationViewModel,
  slotCanCast: boolean
): boolean {
  if (!config.requiresFundingChoice) return slotCanCast
  const slotOk = config.slotFundingAllowed && slotCanCast
  const resourceOk = config.resourceOptions.some((option) => option.remaining > 0)
  return slotOk || resourceOk
}

// A funded spell ALWAYS requires opening the Cast Configuration panel
// (even a resource-only spell with nothing else to pick), so the real cost
// is never hidden -- "display unavailable funding method" / "no
// fabricated slot-casting permission" both require the player to actually
// SEE the funding surface, not have it silently decided for them.
export function resolveOverallRequiresConfiguration(
  config: CastFundingConfigurationViewModel,
  slotRequiresConfiguration: boolean
): boolean {
  return slotRequiresConfiguration || config.requiresFundingChoice
}
