// Character Creator V3 -- cinematic presentation contract.
//
// PURE and presentation-only: this module decides WHICH backdrop the creator
// paints for a given stage and selection. It knows no rule, calls no API, and
// never touches the creation draft's meaning -- it only reads the slugs and
// published artwork URLs of what the player has already chosen.
//
// ---------------------------------------------------------------------------
// THE CONFIGURATION CONTRACT
// ---------------------------------------------------------------------------
// `CreatorPresentationConfig` is the one shape a future Admin Portal screen
// will edit and the creator consumes. It is plain JSON, storage-agnostic and
// host-agnostic: image references are ordinary URL strings (never a Directus
// file id), so the same config works whether media lives behind Directus
// today or beside the application container later. Nothing here persists
// anything -- see useCreatorPresentation.ts for the integration boundary.
//
// ---------------------------------------------------------------------------
// RESOLUTION PRECEDENCE (deterministic; first usable candidate wins)
// ---------------------------------------------------------------------------
//   1. override        -- an explicit `overrides` entry matching the current
//                         stage and a selected content slug. An override that
//                         names a stage beats one that does not; remaining
//                         ties go to the earlier array position.
//   2. configured      -- config.species / classes / backgrounds artwork for
//                         the selected content, tried in the stage's own
//                         focus order (STAGE_FOCUS).
//   3. content art     -- the selected content's own published artwork (the
//                         Content Pack's fluff image), same focus order.
//   4. stage           -- config.stages[stage].
//   5. default         -- config.default (the World/theme default).
//   6. fallback        -- no image: the caller paints its theme gradient.
//
// An entry may deliberately carry no `image` (only a focal point/overlay);
// such an entry is skipped for the image but never blocks lower tiers. A URL
// the browser failed to load is passed back in through `failedUrls` and skipped
// the same way, so a dead link degrades to the next tier instead of a blank.

import type { BuilderStepKey } from '~/components/characters/builder/characterBuilderSelection'

export type CreatorContentKind = 'species' | 'class' | 'background'

// One backdrop. Every field is optional so a config can restyle (say, only
// darken) a tier without supplying artwork for it.
export type CreatorBackdropEntry = {
  // Absolute URL or app-relative path. Never a storage-specific identifier.
  image?: string | null
  // Focal point as 0..1 fractions of the image (x: left->right, y: top->bottom).
  focalX?: number
  focalY?: number
  // Extra darkening on top of the creator's own legibility gradients, 0..1.
  overlay?: number
}

export type CreatorBackdropOverride = CreatorBackdropEntry & {
  kind: CreatorContentKind
  slug: string
  // Omitted = applies at every stage where the content is in focus.
  stage?: BuilderStepKey
}

export type CreatorTransitionPreference = {
  style?: 'fade' | 'none'
  durationMs?: number
}

export type CreatorPresentationConfig = {
  version: 1
  default?: CreatorBackdropEntry
  stages?: Partial<Record<BuilderStepKey, CreatorBackdropEntry>>
  species?: Record<string, CreatorBackdropEntry>
  classes?: Record<string, CreatorBackdropEntry>
  backgrounds?: Record<string, CreatorBackdropEntry>
  overrides?: readonly CreatorBackdropOverride[]
  transition?: CreatorTransitionPreference
}

export const EMPTY_CREATOR_PRESENTATION: CreatorPresentationConfig = { version: 1 }

// What the creator has chosen so far, reduced to what backdrop resolution
// needs: the slug (to match config) and the entry's own published art.
export type CreatorSelectionArt = {
  slug: string
  imageUrl?: string | null
}

export type CreatorSelection = Partial<Record<CreatorContentKind, CreatorSelectionArt | null>>

export type CreatorBackdropSource =
  | 'override'
  | 'configured'
  | 'content-art'
  | 'stage'
  | 'default'
  | 'fallback'

export type ResolvedCreatorBackdrop = {
  image: string | null
  focalX: number
  focalY: number
  overlay: number
  source: CreatorBackdropSource
  // Stable identity for crossfading: changes only when the painted image does.
  key: string
}

export const DEFAULT_FOCAL = 0.5
export const DEFAULT_OVERLAY = 0
export const DEFAULT_TRANSITION_MS = 700
export const MAX_TRANSITION_MS = 2000

// Which selected content "owns" the screen at each stage, most relevant first.
// Identity belongs to the Species; the Class screens to the Class; and so on.
// Later stages (proficiencies, spells, equipment, abilities, review) lean on
// the Class, then Background, then Species -- the character's calling first.
export const STAGE_FOCUS: Record<BuilderStepKey, readonly CreatorContentKind[]> = {
  identity: ['species'],
  species: ['species'],
  class: ['class'],
  background: ['background'],
  proficiencies: ['class', 'background', 'species'],
  spells: ['class'],
  equipment: ['background', 'class'],
  abilities: ['class', 'species'],
  review: ['class', 'background', 'species']
}

const CONFIG_BUCKET: Record<CreatorContentKind, 'species' | 'classes' | 'backgrounds'> = {
  species: 'species',
  class: 'classes',
  background: 'backgrounds'
}

function clamp01(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.min(1, Math.max(0, value))
    : fallback
}

function cleanUrl(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

type Candidate = { entry: CreatorBackdropEntry; image: string; source: CreatorBackdropSource }

// The most specific override for this stage + content, or undefined.
// Stage-named beats stage-agnostic; ties keep array order (stable).
function findOverride(
  config: CreatorPresentationConfig,
  stage: BuilderStepKey,
  kind: CreatorContentKind,
  slug: string
): CreatorBackdropOverride | undefined {
  const matches = (config.overrides ?? []).filter(
    (candidate) => candidate.kind === kind && candidate.slug === slug && (!candidate.stage || candidate.stage === stage)
  )
  return matches.find((candidate) => candidate.stage === stage) ?? matches[0]
}

// Every candidate in precedence order. Pure and side-effect free.
function candidates(
  config: CreatorPresentationConfig,
  stage: BuilderStepKey,
  selection: CreatorSelection
): Candidate[] {
  const list: Candidate[] = []
  const focus = STAGE_FOCUS[stage] ?? []

  for (const kind of focus) {
    const chosen = selection[kind]
    if (!chosen) continue
    const override = findOverride(config, stage, kind, chosen.slug)
    const image = cleanUrl(override?.image)
    if (override && image) list.push({ entry: override, image, source: 'override' })
  }

  for (const kind of focus) {
    const chosen = selection[kind]
    if (!chosen) continue
    const entry = config[CONFIG_BUCKET[kind]]?.[chosen.slug]
    const image = cleanUrl(entry?.image)
    if (entry && image) list.push({ entry, image, source: 'configured' })
  }

  for (const kind of focus) {
    const image = cleanUrl(selection[kind]?.imageUrl)
    if (image) list.push({ entry: {}, image, source: 'content-art' })
  }

  const stageEntry = config.stages?.[stage]
  const stageImage = cleanUrl(stageEntry?.image)
  if (stageEntry && stageImage) list.push({ entry: stageEntry, image: stageImage, source: 'stage' })

  const defaultImage = cleanUrl(config.default?.image)
  if (config.default && defaultImage) list.push({ entry: config.default, image: defaultImage, source: 'default' })

  return list
}

// Focal point and overlay may be styled by a tier that supplies no artwork of
// its own (a stage entry that only darkens). Inherit them from the most
// specific tier that states them, independent of which tier supplied the image.
function styleFrom(
  config: CreatorPresentationConfig,
  stage: BuilderStepKey,
  selection: CreatorSelection,
  winner: CreatorBackdropEntry
): { focalX: number; focalY: number; overlay: number } {
  const focus = STAGE_FOCUS[stage] ?? []
  const layers: Array<CreatorBackdropEntry | undefined> = [winner]
  for (const kind of focus) {
    const chosen = selection[kind]
    if (!chosen) continue
    layers.push(findOverride(config, stage, kind, chosen.slug))
    layers.push(config[CONFIG_BUCKET[kind]]?.[chosen.slug])
  }
  layers.push(config.stages?.[stage], config.default)

  const pick = (field: 'focalX' | 'focalY' | 'overlay', fallback: number) => {
    const found = layers.find((layer) => typeof layer?.[field] === 'number')
    return clamp01(found?.[field], fallback)
  }
  return {
    focalX: pick('focalX', DEFAULT_FOCAL),
    focalY: pick('focalY', DEFAULT_FOCAL),
    overlay: pick('overlay', DEFAULT_OVERLAY)
  }
}

export function resolveCreatorBackdrop(
  config: CreatorPresentationConfig | null | undefined,
  stage: BuilderStepKey,
  selection: CreatorSelection,
  options: { failedUrls?: ReadonlySet<string> } = {}
): ResolvedCreatorBackdrop {
  const safeConfig = config ?? EMPTY_CREATOR_PRESENTATION
  const failed = options.failedUrls
  const winner = candidates(safeConfig, stage, selection).find((candidate) => !failed?.has(candidate.image))

  if (!winner) {
    const style = styleFrom(safeConfig, stage, selection, {})
    return { image: null, ...style, source: 'fallback', key: 'fallback' }
  }

  return {
    image: winner.image,
    ...styleFrom(safeConfig, stage, selection, winner.entry),
    source: winner.source,
    key: winner.image
  }
}

// Transition preference, normalised for the component: a bounded duration and
// an explicit "no transition" for `none`. The component additionally forces
// none under prefers-reduced-motion; that is a user setting, not config.
export function resolveCreatorTransition(config: CreatorPresentationConfig | null | undefined): {
  enabled: boolean
  durationMs: number
} {
  const transition = config?.transition
  if (transition?.style === 'none') return { enabled: false, durationMs: 0 }
  const duration = typeof transition?.durationMs === 'number' && Number.isFinite(transition.durationMs)
    ? Math.min(MAX_TRANSITION_MS, Math.max(0, transition.durationMs))
    : DEFAULT_TRANSITION_MS
  return { enabled: duration > 0, durationMs: duration }
}

// CSS object-position for a focal point, e.g. "35% 20%".
export function focalObjectPosition(backdrop: Pick<ResolvedCreatorBackdrop, 'focalX' | 'focalY'>): string {
  return `${Math.round(backdrop.focalX * 100)}% ${Math.round(backdrop.focalY * 100)}%`
}

// Merge a partial config over a base, tier by tier, so a later source (a
// World's saved config) only has to state what it changes.
export function mergeCreatorPresentation(
  base: CreatorPresentationConfig,
  patch: Partial<CreatorPresentationConfig> | null | undefined
): CreatorPresentationConfig {
  if (!patch) return base
  return {
    version: 1,
    default: patch.default ?? base.default,
    stages: { ...base.stages, ...patch.stages },
    species: { ...base.species, ...patch.species },
    classes: { ...base.classes, ...patch.classes },
    backgrounds: { ...base.backgrounds, ...patch.backgrounds },
    overrides: [...(patch.overrides ?? []), ...(base.overrides ?? [])],
    transition: { ...base.transition, ...patch.transition }
  }
}

// Which content the stage presents as its hero (species on Identity, class on
// Class, ...): the first entry of the stage's focus order.
export function stageHeroKind(stage: BuilderStepKey): CreatorContentKind {
  return STAGE_FOCUS[stage]?.[0] ?? 'class'
}
