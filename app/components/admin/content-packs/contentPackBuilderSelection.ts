// Pure selection-state helpers for AdminContentPackBuilderPanel.vue -- Step
// 6 of .github/docs/architecture/content-source-architecture.md's
// Implementation Sequence ("Dynamic categories in the Builder"). Extracted
// so this logic is unit-testable without a component-mounting harness (this
// repo has none -- see tests/components/admin/rules/rulesConfigEdits.test.ts
// for the same convention).
//
// Category keys are whatever a Source Collection Provider declares -- never
// a fixed union (architecture doc §5, decision 5: "XMM has monsters and
// nothing else; Pathfinder has categories 5e does not have. The Builder
// must render whatever the preview returns."). Selection is therefore keyed
// by plain `string`, not a `CategoryKey` literal type.

export type PreviewEntrySelection = Record<string, Set<string>>

type SelectionSourceCategory = {
  key: string
  entries: readonly { externalId: string }[]
}

// "Generate Preview... still selects every entry by default" -- every
// category the preview returns starts fully checked.
export function selectionFromCategories(categories: readonly SelectionSourceCategory[]): PreviewEntrySelection {
  const next: PreviewEntrySelection = {}
  for (const category of categories) {
    next[category.key] = new Set(category.entries.map((entry) => entry.externalId))
  }
  return next
}

export function toggleEntrySelection(selection: PreviewEntrySelection, categoryKey: string, externalId: string): PreviewEntrySelection {
  const next = new Set(selection[categoryKey])
  if (next.has(externalId)) {
    next.delete(externalId)
  } else {
    next.add(externalId)
  }
  return { ...selection, [categoryKey]: next }
}

// Backs both "Select All" (pass every entry's externalId) and "Deselect
// All" (pass an empty array) for one category -- see the file header's
// BEHAVIOR note: both "work per category."
export function replaceCategorySelection(selection: PreviewEntrySelection, categoryKey: string, externalIds: readonly string[]): PreviewEntrySelection {
  return { ...selection, [categoryKey]: new Set(externalIds) }
}

export function countSelected(selection: PreviewEntrySelection, categoryKey: string): number {
  return selection[categoryKey]?.size ?? 0
}

export function totalSelected(selection: PreviewEntrySelection): number {
  return Object.values(selection).reduce((sum, set) => sum + set.size, 0)
}

// Publish payload: Record<string, string[]>, no assumption about which (or
// how many) category names exist -- see the file header.
export function selectionToPayload(selection: PreviewEntrySelection): Record<string, string[]> {
  const payload: Record<string, string[]> = {}
  for (const [key, ids] of Object.entries(selection)) {
    payload[key] = Array.from(ids)
  }
  return payload
}
