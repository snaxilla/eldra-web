export type EldraImportProvider = '5etools-json' | 'manual' | 'foundry-pack'

export type EldraImportPreviewBlock = {
  blockKey: string
  label: string
  repeatable: boolean
  sort: number
  data: Record<string, any> | null
}

export type EldraImportPreviewEntity = {
  systemKey: string
  entityType: string
  title: string
  slug: string
  provider: EldraImportProvider
  externalId: string
  sourceBook?: string
  sourcePage?: string
  blocks: EldraImportPreviewBlock[]
  raw: Record<string, any>
  // Character Progression Phase 1C. Present only when `entityType ===
  // 'subclass'` (app/lib/importers/5etools-subclasses.ts) -- the parent
  // class's own catalogue slug, derived structurally at import time.
  // Optional and additive: every other importer simply never sets it.
  parentClassSlug?: string
  // Character Creator V3. Present only when `entityType === 'featureOption'`
  // (app/lib/importers/5etools-feature-options.ts) -- the Rules Engine
  // Definition id this option's real prose explains, derived structurally
  // (never from this option's own prose) using the same id formula the
  // hand-authored Rules Package Definition already uses. Optional and
  // additive, mirroring `parentClassSlug` exactly.
  definitionId?: string
}

export type EldraImportPreviewResult = {
  provider: EldraImportProvider
  systemKey: string
  entityType: string
  count: number
  items: EldraImportPreviewEntity[]
  warnings: string[]
}
