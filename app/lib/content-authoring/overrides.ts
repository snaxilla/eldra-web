// Field overrides -- Content Workspaces & Studio, Phase 4
// (content-workspaces-and-studio.md §6.2/§7.6/§9.2/§9.3). Pure: no I/O.
//
// A FieldOverride is the stored unit of an authored edit: one channel, one
// path, one value, with enough provenance (`baseValueHash`) to make
// upstream reconciliation sound later (§16). `content_workspace_entities`'s
// `authored_presentation`/`authored_mechanics` columns each hold a
// `FieldOverride[]` for their own channel; this module is the only place
// that reads or writes that list shape, so "revert one field" and "revert
// a whole channel" are the same few lines everywhere they're needed.
//
// Only the `presentation` channel is exercised in this phase (mechanics
// and facet editing are explicitly out of scope -- see the Pass B brief's
// own Boundaries section), but the shape is channel-generic so a future
// mechanics editor reuses it rather than inventing a second one.

export type OverrideChannel = 'presentation' | 'mechanics' | 'facet'

export type FieldOverride = {
  channel: OverrideChannel
  path: string
  value: unknown
  authoredBy: string | null
  authoredAt: string
  baseValueHash: string | null
}

// The only paths a generic Content Studio editor may ever write for the
// `presentation` channel -- directly the AuthoredPresentation surface
// (content-presentation/authored.ts). Protected fields (source data,
// mechanics, Rules Facets, attribution's licensing identity) are never in
// this list, so a generic PATCH cannot reach them even if a caller tries.
export const PRESENTATION_OVERRIDE_PATHS: readonly string[] = [
  'name',
  'description',
  'sections',
  'notes',
  'facts',
  'image',
  'sourceBook',
  'sourcePage',
  'attribution',
  'tags'
]

const PROTOTYPE_POLLUTING_SEGMENTS = new Set(['__proto__', 'constructor', 'prototype'])

export function isPrototypePollutingPath(path: string): boolean {
  return path.split('.').some((segment) => PROTOTYPE_POLLUTING_SEGMENTS.has(segment))
}

function isWellFormedPath(path: string): boolean {
  if (typeof path !== 'string' || !path.trim()) return false
  const segments = path.split('.')
  return segments.every((segment) => segment.length > 0) && !isPrototypePollutingPath(path)
}

export function isValidOverridePath(channel: OverrideChannel, path: string): boolean {
  if (!isWellFormedPath(path)) return false
  if (channel !== 'presentation') return true // mechanics/facet have no allowlist yet (unused this phase)
  const root = path.split('.')[0] ?? ''
  return PRESENTATION_OVERRIDE_PATHS.includes(root)
}

// Generic nested setter, reused by any future channel whose fields nest
// (mechanics will). Presentation fields used today are all top-level, but
// this does not assume that -- it rejects prototype-polluting segments
// unconditionally rather than only validating the top-level path.
export function setPath(target: Record<string, unknown>, path: string, value: unknown): void {
  if (isPrototypePollutingPath(path)) {
    throw new Error(`Refusing to set prototype-polluting path '${path}'`)
  }
  const segments = path.split('.')
  const lastSegment = segments[segments.length - 1] ?? ''
  let cursor: Record<string, unknown> = target
  for (const segment of segments.slice(0, -1)) {
    const next = cursor[segment]
    if (next === null || typeof next !== 'object' || Array.isArray(next)) {
      cursor[segment] = {}
    }
    cursor = cursor[segment] as Record<string, unknown>
  }
  cursor[lastSegment] = value
}

function comparePaths(a: FieldOverride, b: FieldOverride): number {
  return a.channel.localeCompare(b.channel) || a.path.localeCompare(b.path)
}

// Returns a NEW array (overrides are never mutated in place) with `edit`'s
// path replaced if present, inserted otherwise. Deterministically ordered
// so two writers applying the same edits converge on identical storage.
export function upsertOverride(
  overrides: readonly FieldOverride[],
  edit: { channel: OverrideChannel; path: string; value: unknown; authoredBy: string | null; baseValueHash: string | null },
  now: string
): FieldOverride[] {
  const next = overrides.filter((o) => !(o.channel === edit.channel && o.path === edit.path))
  next.push({ ...edit, authoredAt: now })
  return next.sort(comparePaths)
}

export function removeOverridePath(overrides: readonly FieldOverride[], channel: OverrideChannel, path: string): FieldOverride[] {
  return overrides.filter((o) => !(o.channel === channel && o.path === path))
}

export function emptyChannel(overrides: readonly FieldOverride[], channel: OverrideChannel): FieldOverride[] {
  return overrides.filter((o) => o.channel !== channel)
}

export function overridesForChannel(overrides: readonly FieldOverride[], channel: OverrideChannel): FieldOverride[] {
  return overrides.filter((o) => o.channel === channel)
}

// Reconstructs the sparse overlay object (e.g. an AuthoredPresentation)
// a channel's FieldOverride list represents, so a materializer has one
// object to merge rather than a list to walk itself.
export function buildSparseObject(overrides: readonly FieldOverride[], channel: OverrideChannel): Record<string, unknown> {
  const sparse: Record<string, unknown> = {}
  for (const override of overridesForChannel(overrides, channel)) {
    setPath(sparse, override.path, override.value)
  }
  return sparse
}

export type OverrideDiffEntry = { channel: OverrideChannel; path: string; from: unknown; to: unknown }

// For a revision's `diff` field (§6.4) -- every path that changed value
// between two override lists, including paths removed (to: undefined) or
// added (from: undefined). Order matches upsertOverride's own sort.
export function diffOverrides(before: readonly FieldOverride[], after: readonly FieldOverride[]): OverrideDiffEntry[] {
  const beforeByKey = new Map(before.map((o) => [`${o.channel}::${o.path}`, o.value]))
  const afterByKey = new Map(after.map((o) => [`${o.channel}::${o.path}`, o.value]))
  const keys = new Set([...beforeByKey.keys(), ...afterByKey.keys()])
  const diffs: OverrideDiffEntry[] = []

  for (const key of keys) {
    const from = beforeByKey.get(key)
    const to = afterByKey.get(key)
    if (JSON.stringify(from) === JSON.stringify(to)) continue
    const separator = key.indexOf('::')
    diffs.push({ channel: key.slice(0, separator) as OverrideChannel, path: key.slice(separator + 2), from, to })
  }

  return diffs.sort((a, b) => a.channel.localeCompare(b.channel) || a.path.localeCompare(b.path))
}
