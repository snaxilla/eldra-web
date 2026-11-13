// Universal authored presentation -- Content Workspaces & Studio, Phase 4
// (content-workspaces-and-studio.md §7.6/§8.5). Pure: no I/O, no Directus,
// no provider-specific knowledge. This module never reads or writes
// `fluff` or any other 5etools-shaped structure -- that is the entire
// point of a universal, system-agnostic authoring surface (R6).
//
// `AuthoredPresentation` is a sparse overlay of the already-shipped
// `PresentationEntry` (content-presentation/types.ts): the single largest
// reuse in the design, since authored presentation then needs no new
// consumer anywhere once it reaches the catalogue (Phase 5/6).

import type { PresentationEntry, PresentationFact, PresentationImage, PresentationSection } from './types'

// A Media Gallery/pack/dataset/external reference to an image, before it
// has been resolved to a renderable PresentationImage. Resolution is
// impure (it may need to check a Directus file's World ownership --
// server/utils/content-presentation-assets.ts) and therefore happens
// OUTSIDE this module, before mergeAuthoredPresentation ever runs.
export type PortableAssetRef =
  | { kind: 'pack'; assetId: string }
  | { kind: 'media'; fileId: string }
  | { kind: 'dataset'; path: string }
  | { kind: 'external'; url: string }

export type AuthoredPresentation = {
  name?: string
  description?: string[]
  sections?: PresentationSection[]
  notes?: string[]
  facts?: PresentationFact[]
  // Ref form, as persisted. `undefined` = no authored opinion (inherit).
  // `null` = explicit suppression. A concrete ref = an authored image,
  // resolved by the caller before merge (see ResolvedImage below).
  image?: PortableAssetRef | null
  sourceBook?: string
  sourcePage?: string
  attribution?: { text: string; licenseId: string }
  tags?: string[]
}

// What the caller resolved `overrides.image` to, when that key is present.
// Kept separate from AuthoredPresentation itself so this module never has
// to reach out and resolve a ref on its own.
export type ResolvedImage = { image: PresentationImage | null }

function presentKey<K extends keyof AuthoredPresentation>(overrides: AuthoredPresentation, key: K): boolean {
  return Object.prototype.hasOwnProperty.call(overrides, key) && overrides[key] !== undefined
}

// Merge semantics (§7.6, exact):
//   - absent key            -> source-resolved value is used (inherit)
//   - present key            -> authored value wins
//   - image: null            -> authored suppression; effective image is none
//   - fromSource === null    -> the authored fields alone form the entry
export function mergeAuthoredPresentation(
  fromSource: PresentationEntry | null,
  overrides: AuthoredPresentation,
  resolvedImage: ResolvedImage | null = null
): PresentationEntry | null {
  const hasAnyOverride =
    presentKey(overrides, 'name') || presentKey(overrides, 'description') || presentKey(overrides, 'sections')
    || presentKey(overrides, 'notes') || presentKey(overrides, 'facts') || presentKey(overrides, 'image')
    || presentKey(overrides, 'sourceBook') || presentKey(overrides, 'sourcePage') || presentKey(overrides, 'tags')

  if (!fromSource && !hasAnyOverride) return null

  const base: PresentationEntry = fromSource ?? {
    kind: 'item',
    name: overrides.name ?? '',
    description: [],
    facts: [],
    sections: [],
    notes: []
  }

  const entry: PresentationEntry = {
    ...base,
    name: presentKey(overrides, 'name') ? (overrides.name as string) : base.name,
    description: presentKey(overrides, 'description') ? (overrides.description as string[]) : base.description,
    sections: presentKey(overrides, 'sections') ? (overrides.sections as PresentationSection[]) : base.sections,
    notes: presentKey(overrides, 'notes') ? (overrides.notes as string[]) : base.notes,
    facts: presentKey(overrides, 'facts') ? (overrides.facts as PresentationFact[]) : base.facts,
    sourceBook: presentKey(overrides, 'sourceBook') ? overrides.sourceBook : base.sourceBook,
    sourcePage: presentKey(overrides, 'sourcePage') ? overrides.sourcePage : base.sourcePage
  }

  if (presentKey(overrides, 'image')) {
    // The key is present: an authored opinion exists, whether the ref
    // resolved to something renderable or not. Never fall back to
    // fromSource.image once the author has expressed an opinion.
    entry.image = resolvedImage ? resolvedImage.image : null
  }

  return entry
}

export function hasAuthoredOverride(overrides: AuthoredPresentation): boolean {
  return Object.keys(overrides).some((key) => overrides[key as keyof AuthoredPresentation] !== undefined)
}
