// Pure selection/validation helpers behind Character Builder V2
// (app/pages/worlds/[id]/characters/create-v2.vue and
// CharacterBuilderOptionPicker.vue).
//
// Extracted rather than left inline for the same reason
// app/components/admin/content-packs/contentPackBuilderSelection.ts was:
// this repo has no DOM test environment (vitest.config.ts is
// `environment: 'node'`), so component logic is only testable when it lives
// in a plain module beside the component. Everything here is pure -- no
// I/O, no Vue, no DOM -- and is unit-tested in
// tests/components/characters/builder/characterBuilderSelection.test.ts.
//
// ---------------------------------------------------------------------------
// DESIGN DECISIONS
// ---------------------------------------------------------------------------
// 1. IDENTITY IS THE COMPOSITE (packageId, slug), NEVER slug ALONE.
//    server/api/worlds/[id]/characters/create-v2.post.ts's own
//    `findInCatalogue` matches on exactly that pair, and the catalogue can
//    legitimately contain the same slug from two different packs (a World
//    with both SRD 5.1 and XPHB bound has two "Human" species, two
//    "Fighter" classes). Matching on slug alone -- which the previous
//    Builder did -- can silently resolve to the wrong pack's entry. Every
//    lookup here goes through `optionKey`.
//
// 2. WHAT AN OPTION CAN SHOW IS BOUNDED BY THE CATALOGUE, NOT BY TASTE.
//    ContentCatalogueEntry carries identity + provenance only (title, slug,
//    externalId, sourceBook, sourcePage, packageId, packageVersion) -- see
//    server/utils/world-content-catalogue.ts's own design decision 1, which
//    deliberately never reads inside `data`. There is no description, no
//    trait list, and no icon available to render, and inventing one here
//    would mean either fabricating content or breaching that boundary.
//    `searchText` therefore indexes exactly the fields that exist.
//
// 3. THE SUBMIT PAYLOAD SENDS ONLY (packageId, slug). The save route reads
//    only those two fields off each choice and re-looks-up everything else
//    from its own catalogue copy, explicitly so a tampered client cannot
//    substitute a title or externalId. Sending more would imply the extra
//    fields are load-bearing when the server provably ignores them.

export type BuilderCatalogueEntry = {
  packageId: string
  packageVersion: string
  systemKey: string
  title: string
  slug: string
  externalId: string
  provider: string
  sourceBook?: string
  sourcePage?: string
}

export type BuilderChoiceKey = 'species' | 'class' | 'background'

export type CharacterBuilderDraft = {
  name: string
  species: BuilderCatalogueEntry | null
  class: BuilderCatalogueEntry | null
  background: BuilderCatalogueEntry | null
}

export type BuilderStepKey = 'identity' | BuilderChoiceKey | 'review'

export const CHOICE_KEYS: readonly BuilderChoiceKey[] = ['species', 'class', 'background']

export const STEP_KEYS: readonly BuilderStepKey[] = ['identity', 'species', 'class', 'background', 'review']

export const STEP_LABELS: Record<BuilderStepKey, string> = {
  identity: 'Name',
  species: 'Species',
  class: 'Class',
  background: 'Background',
  review: 'Review'
}

export function emptyDraft(): CharacterBuilderDraft {
  return { name: '', species: null, class: null, background: null }
}

// The composite identity -- see design decision 1. `::` is not a legal
// character in either a packageId (reverse-DNS) or a slug (slugified), so
// the join is unambiguous.
export function optionKey(entry: Pick<BuilderCatalogueEntry, 'packageId' | 'slug'> | null | undefined): string {
  if (!entry) return ''
  return `${entry.packageId}::${entry.slug}`
}

export function findOptionByKey(
  options: readonly BuilderCatalogueEntry[],
  key: string
): BuilderCatalogueEntry | null {
  if (!key) return null
  return options.find((option) => optionKey(option) === key) ?? null
}

// Everything a user could reasonably type to find an option, limited to
// fields the catalogue actually exposes -- design decision 2.
function searchText(option: BuilderCatalogueEntry): string {
  return [option.title, option.sourceBook, option.packageId].filter(Boolean).join(' ').toLowerCase()
}

// Whitespace-tolerant AND-matching across terms, so "human xphb" finds the
// XPHB Human without the user knowing field order.
export function filterOptions(
  options: readonly BuilderCatalogueEntry[],
  query: string
): BuilderCatalogueEntry[] {
  const terms = String(query || '').toLowerCase().split(/\s+/).filter(Boolean)
  if (!terms.length) return [...options]

  return options.filter((option) => {
    const haystack = searchText(option)
    return terms.every((term) => haystack.includes(term))
  })
}

// True when a selection exists but the current search has filtered it out
// of view. Selecting an option and then searching for something else
// otherwise makes the choice silently invisible: the radio is no longer in
// the DOM, so nothing on screen is checked, even though the draft still
// holds it. The picker uses this to keep the choice stated rather than
// letting a search appear to clear it.
export function isSelectionHidden(
  visibleOptions: readonly BuilderCatalogueEntry[],
  selectedKey: string
): boolean {
  if (!selectedKey) return false
  return !visibleOptions.some((option) => optionKey(option) === selectedKey)
}

// True when two or more options in the same category share a title -- the
// SRD-5.1-plus-XPHB case. When it happens the source book stops being
// decoration and becomes the only thing distinguishing two rows, so the UI
// uses this to guarantee provenance is always visible for that category.
export function hasAmbiguousTitles(options: readonly BuilderCatalogueEntry[]): boolean {
  const seen = new Set<string>()
  for (const option of options) {
    const title = option.title.trim().toLowerCase()
    if (seen.has(title)) return true
    seen.add(title)
  }
  return false
}

export function isChoiceComplete(draft: CharacterBuilderDraft, key: BuilderChoiceKey): boolean {
  return Boolean(draft[key])
}

export function isNameComplete(draft: CharacterBuilderDraft): boolean {
  return draft.name.trim().length > 0
}

export function isStepComplete(draft: CharacterBuilderDraft, step: BuilderStepKey): boolean {
  if (step === 'identity') return isNameComplete(draft)
  if (step === 'review') return isDraftComplete(draft)
  return isChoiceComplete(draft, step)
}

export function isDraftComplete(draft: CharacterBuilderDraft): boolean {
  return isNameComplete(draft) && CHOICE_KEYS.every((key) => isChoiceComplete(draft, key))
}

// Human-readable list of what is still outstanding. Mirrors (never
// replaces) the server's own validation -- the save route remains the sole
// authority on whether a create is actually valid; this only explains a
// disabled button, the same posture AdminContentPackBuilderPanel.vue's
// `validationMessages` already established.
export function missingRequirements(draft: CharacterBuilderDraft): string[] {
  const missing: string[] = []
  if (!isNameComplete(draft)) missing.push('Enter a character name.')
  for (const key of CHOICE_KEYS) {
    if (!isChoiceComplete(draft, key)) missing.push(`Choose a ${STEP_LABELS[key]}.`)
  }
  return missing
}

export type CharacterCreatePayload = {
  title: string
  species: { packageId: string; slug: string }
  class: { packageId: string; slug: string }
  background: { packageId: string; slug: string }
}

// See design decision 3 -- only the two fields the save route actually reads.
export function toCreatePayload(draft: CharacterBuilderDraft): CharacterCreatePayload | null {
  if (!isDraftComplete(draft)) return null

  const ref = (entry: BuilderCatalogueEntry) => ({ packageId: entry.packageId, slug: entry.slug })

  return {
    title: draft.name.trim(),
    species: ref(draft.species!),
    class: ref(draft.class!),
    background: ref(draft.background!)
  }
}

// The next step a user most likely wants after completing `step`. Used only
// by the compact (stepper) layout's "Next" affordance -- never to GATE a
// step, since every step is reachable at any time on every viewport.
export function nextStep(step: BuilderStepKey): BuilderStepKey | null {
  const index = STEP_KEYS.indexOf(step)
  if (index < 0 || index >= STEP_KEYS.length - 1) return null
  return STEP_KEYS[index + 1]!
}

export function previousStep(step: BuilderStepKey): BuilderStepKey | null {
  const index = STEP_KEYS.indexOf(step)
  if (index <= 0) return null
  return STEP_KEYS[index - 1]!
}
