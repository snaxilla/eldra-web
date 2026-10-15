// FEAT-OWNED SPELL ACQUISITION PHASE -- the ONE generic fix every real spell-requirement consumer
// needed: `SpellRequirement`s are not class-exclusive (the type itself already says so -- see its
// own header, app/lib/content-rules/types.ts), but every real call site (create-v2.post.ts,
// character-progression-plan.ts, characterBuilderSelection.ts) traced its facet from EXACTLY ONE
// place: the selected class. Confirmed by direct read, not assumed: every one of them reads
// `*.rulesFacet?.spellRequirements` off a single class/draft.class reference.
//
// `gatherSpellRequirements` below is the one small, generic utility that fixes this: concatenate
// `spellRequirements` across EVERY facet that is actually active on the character (the class, plus
// every genuinely acquired feat's own facet -- species/background/subclass can declare the
// identical field with zero code change here, the moment a real corpus fact needs it), then drop
// any requirement whose own `requiresActive` gate (see that field's own header) is not currently
// satisfied. Nothing here reads a class name, a feat name, or an owner kind -- a homebrew package's
// own feature-owned spell requirement flows through identically.
//
// WHAT "ACTIVE" MEANS FOR `requiresActive`, AND WHY TWO CHECKS, NOT THE ENGINE'S OWN `values[]`
// ---------------------------------------------------------------------------
// A ChoiceSet's own `requiresActive` (app/lib/rules/types.ts) is checked via `isActive(id) =
// values[id] === true` -- the Rules Engine's VALUE layer, populated by facet `grants` and by a
// non-`activate-source` choice-write, but NEVER by an `activate-source` SELECTION (confirmed by
// direct read of `character-actor-bridge.ts`'s `applyChoice`: that branch pushes a `SourceInstance`
// onto `sources[]` and returns, never touching `values[]`). This is exactly why the Feature-Option
// phase's own deferred blocker (Thaumaturge/Magician, see `dnd5e-2024-progression-coverage.ts`)
// names the gap as real: "no mechanism ties a requirement's activation to a Source."
//
// This file's own gate check covers BOTH real corpus shapes found while authoring it, neither
// reducible to the other:
//   1. FIXED grant (Magic Initiate, gated by WHICH BACKGROUND granted it -- Acolyte always fixes
//      the Cleric list, never a player choice; re-derived directly from the raw corpus, which
//      names the list in the Background's own `feats` key, e.g. "magic initiate; cleric|xphb").
//      The granting facet's own `grants` array sets a plain boolean Value true, unconditionally,
//      the SAME mechanism the Rules Engine's own `values[]` already reads. Checked against the
//      SAME `facets` array `gatherSpellRequirements` already receives -- the facet that OWNS the
//      requirement and the facet that GRANTS the gate are different facets on the SAME character,
//      so both must be in scope, not just the owner's.
//   2. CHOSEN Source (Thaumaturge/Magician's own real shape, not yet authored but the reason this
//      phase added `requiresActive` in the first place): an ordinary `effect: 'activate-source'`
//      ChoiceSet authored with NO `writesTo`, so the SELECTED VALUE in `StoredRulesChoices.
//      selections` IS the Source id itself, verbatim -- answerable by scanning every
//      currently-resolved choice ANSWER for that exact string, no ActorState/bridge pass needed.
// Both checks work IDENTICALLY at every surface this phase touches (creation's own
// `rulesChoices.selections` being built plus the SAME `facets` list already passed for gathering;
// progression's own persisted + tentative answers map plus `featFacets`/`classFacet`/background;
// the Builder draft's own `draft.choices.selections`), because all three share the ONE
// `StoredRulesChoices` shape and the SAME facet-list convention.
import type { DefinitionId } from '../rules/types'
import type { RulesFacet, SpellRequirement } from '../content-rules/types'
import { nextInstanceId, type StoredSpellEntry } from './spellcasting'

function isGateActive(
  id: DefinitionId,
  selections: Readonly<Record<string, readonly string[]>>,
  facets: readonly (RulesFacet | null | undefined)[]
): boolean {
  for (const values of Object.values(selections)) {
    if (values.includes(id)) return true
  }
  for (const facet of facets) {
    if ((facet?.grants ?? []).some((grant) => grant.set === id && grant.to === true)) return true
  }
  return false
}

// `facets`: every RulesFacet actually active on the character right now (typically species, class,
// background, plus one entry per genuinely acquired feat -- NEVER a feat merely offered/
// selectable). Order does not matter; a requirement's own `id` is already globally stable and
// unique, so two facets can never collide by concatenation alone. The SAME list doubles as the
// gate-check scope (see this file's own header) -- a requirement's `requiresActive` gate may be
// granted by a DIFFERENT facet than the one that owns the requirement (Magic Initiate's own
// requirement is owned by the FEAT; the gate is granted by the BACKGROUND that acquired it), so
// every active facet must be visible to the gate check, not just the requirement's own owner.
export function gatherSpellRequirements(
  facets: readonly (RulesFacet | null | undefined)[],
  selections: Readonly<Record<string, readonly string[]>>
): SpellRequirement[] {
  const all = facets.flatMap((facet) => facet?.spellRequirements ?? [])
  return all.filter((requirement) => (requirement.requiresActive ?? []).every((id) => isGateActive(id, selections, facets)))
}

// FEAT-OWNED SPELL ACQUISITION PHASE -- the FixedSpellGrant counterpart of `gatherSpellRequirements`
// above: resolves every active facet's own `fixedSpellGrants` (Telekinetic's Mage Hand, Telepathic's
// Detect Thoughts -- a FACT about content, never a decision; see FixedSpellGrant's own header,
// app/lib/content-rules/types.ts) into ready `StoredSpellEntry` rows. Mirrors
// `resolveCreationOriginFeat`'s own fail-closed posture exactly: a declared slug missing from the
// World's own Content Catalogue refuses the whole operation (the SAME "the Background facet is the
// ONLY source, nothing is assumed valid" discipline, restated for a feat's own fixed spell).
//
// Each resolved row is tagged with a SYNTHETIC, non-`SpellRequirement` provenance id
// (`fixed-spell-grant.<ownerKey>.<slug>`) -- deliberately NOT a real requirement id (there is no
// accumulating target to satisfy; the grant is simply always present once the owning facet is
// active). This keeps a fixed-grant row permanently ineligible for P3.2.1's provenance fallback (an
// UNTAGGED row silently joins any same-flag pool on the SAME character -- see
// spell-requirements.ts's own P3.2.1 header); an explicit, foreign tag means it can never be
// miscounted toward an unrelated real pool.
export type FixedSpellGrantOwner = {
  packageId: string
  facet: RulesFacet | null | undefined
  // A stable, human-free identity for THIS owner (e.g. the feat's own slug) -- used only to build
  // the synthetic provenance tag above, never compared against anything.
  ownerKey: string
}

export type ResolveFixedSpellGrantsResult =
  | { ok: true, entries: StoredSpellEntry[] }
  | { ok: false, reason: string }

// PURE-AUTHORING SPECIES SWEEP -- `selections` added (default `{}`, so every pre-existing call
// site -- Telekinetic/Telepathic's own unconditional grants -- is unaffected): a grant whose own
// `requiresActive` names one or more ids is resolved ONLY when every one of them is active, via
// the IDENTICAL `isGateActive` check `gatherSpellRequirements` already uses, scoped to the SAME
// `owners` facet list (a lineage Source set by `choice:species.feature-option`'s own
// `activate-source` effect lands in `selections` verbatim, exactly like Thaumaturge's/Magician's
// own chosen-Source gate). An inactive grant is simply skipped, never an error -- the same
// "non-live, non-blocking" posture `gatherSpellRequirements` already establishes for a
// `SpellRequirement` whose gate is not yet satisfied.
//
// TIEFLING SPECIES COMPLETION -- `levelWindow` added, default `{ from: 0, to: Infinity }`: every
// pre-existing call site (every current caller resolves feat-owned grants, none of which name a
// `minLevel`) keeps resolving every grant regardless of level, byte-identical to before this
// parameter existed. A grant's own `minLevel` (default 1) must fall in `(from, to]` to resolve --
// the EXCLUSIVE lower bound is what makes repeat calls safe: a caller resolving level-by-level
// (the Level Manager's own `confirmProgression`, advancing `from` to the character's own
// just-reached level each call) can never re-resolve, and therefore never duplicate, a grant it
// already resolved on an earlier call, without this function needing to inspect `existing` for
// that purpose at all -- the caller's own window IS the de-duplication. A direct multi-level jump
// (e.g. Level 1 -> 5 in one call) naturally resolves every grant in between in the SAME call,
// since the window spans the whole jump.
export function resolveFixedSpellGrants(
  owners: readonly FixedSpellGrantOwner[],
  catalogue: readonly { packageId: string, slug: string, title?: string }[],
  existing: readonly StoredSpellEntry[] = [],
  selections: Readonly<Record<string, readonly string[]>> = {},
  levelWindow: { from: number, to: number } = { from: 0, to: Infinity }
): ResolveFixedSpellGrantsResult {
  const facets = owners.map((owner) => owner.facet)
  const entries: StoredSpellEntry[] = []
  for (const owner of owners) {
    for (const grant of owner.facet?.fixedSpellGrants ?? []) {
      const minLevel = grant.minLevel ?? 1
      if (minLevel <= levelWindow.from || minLevel > levelWindow.to) continue
      if ((grant.requiresActive ?? []).some((id) => !isGateActive(id, selections, facets))) continue
      const found = catalogue.find((entry) => entry.packageId === owner.packageId && entry.slug === grant.slug)
      if (!found) {
        return { ok: false, reason: `Fixed spell grant "${grant.slug}" (from "${owner.ownerKey}") is not in this World's Content Catalogue` }
      }
      entries.push({
        instanceId: nextInstanceId([...existing, ...entries]),
        ref: { packageId: found.packageId, slug: found.slug },
        known: grant.flag === 'known',
        prepared: grant.flag === 'prepared',
        requirementIds: [`fixed-spell-grant.${owner.ownerKey}.${grant.slug}`]
      })
    }
  }
  return { ok: true, entries }
}
