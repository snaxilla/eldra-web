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
}

export type EldraImportPreviewResult = {
  provider: EldraImportProvider
  systemKey: string
  entityType: string
  count: number
  items: EldraImportPreviewEntity[]
  warnings: string[]
}
