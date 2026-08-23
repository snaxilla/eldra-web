// Content Presentation Models -- Character Builder / Character Sheet Phase 2.
//
// The vocabulary the Character Builder and the Character Sheet both speak.
// These types are system-agnostic ON PURPOSE: nothing here names a 5etools
// field, a D&D concept, or a rules mechanic. A Pathfinder resolver added
// later produces the SAME shapes, and neither surface changes.
//
// ---------------------------------------------------------------------------
// WHY A SHARED SHAPE RATHER THAN ONE MODEL PER KIND
// ---------------------------------------------------------------------------
// Species, Class, and Background resolve to the same `PresentationEntry`.
// That uniformity is the whole point: it is what lets ONE component
// (app/components/characters/ContentPresentationPanel.vue) render a preview
// in the Builder and a section on the Sheet without either surface knowing
// which kind it is looking at, or which game system produced it. Per-kind
// models would push a `v-if` chain into every consumer and make each new
// kind a UI change.
//
// The three fields carry different weight and are rendered differently:
//   description -- prose about what this thing IS. Empty when the pack
//                  publishes none; never fabricated (see `notes`).
//   facts       -- short labelled values, scannable at a glance
//                  ("Hit Die: 1d10"). Always already-present information,
//                  restated in a player's words -- never computed.
//   sections    -- longer named prose (a species' traits, a background's
//                  equipment). Rendered as accordions on small screens.
//
// ---------------------------------------------------------------------------
// PRESENTATION, NOT RULES
// ---------------------------------------------------------------------------
// A resolver surfaces information a Content Pack already contains. It does
// not compute gameplay: Speed is shown, movement is not calculated;
// Darkvision is listed, vision is not modelled; the Hit Die is displayed,
// hit points are not derived. Nothing here belongs to the Rules Engine
// (app/lib/rules/**), which this layer neither imports nor duplicates.

export type PresentationKind = 'species' | 'class' | 'background'

export type PresentationFact = {
  label: string
  value: string
}

export type PresentationSection = {
  title: string
  paragraphs: string[]
}

export type PresentationEntry = {
  kind: PresentationKind
  name: string
  sourceBook?: string
  sourcePage?: string
  // Empty whenever the Content Pack carries no descriptive text. An empty
  // array is a fact about the pack, not an error -- consumers render the
  // matching `notes` entry instead of inventing prose.
  description: string[]
  facts: PresentationFact[]
  sections: PresentationSection[]
  // Reader-facing explanations of what this pack does NOT contain, so a
  // player can tell "this Species grants no languages" apart from "Eldra
  // failed to read them".
  notes: string[]
}

// One game system's translation of raw Content Pack `data` into the models
// above. Returns null when the data is unusable (absent, or not an object),
// which consumers render as "no details published" rather than as an error.
export type ContentPresentationResolver = (
  kind: PresentationKind,
  data: unknown
) => PresentationEntry | null
