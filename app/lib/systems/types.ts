export type EldraFieldType =
  | 'text'
  | 'textarea'
  | 'number'
  | 'boolean'
  | 'select'
  | 'multiselect'
  | 'image'
  | 'markdown'
  | 'json'

export type EldraImportSource = {
  provider: string
  externalId?: string
  sourceBook?: string
  sourcePage?: string
  url?: string
  importedAt?: string
  importVersion?: string
  hash?: string
}

export type EldraSchemaFieldOption = {
  label: string
  value: string
}

export type EldraSchemaField = {
  key: string
  label: string
  type: EldraFieldType
  required?: boolean
  description?: string
  default?: any
  min?: number
  max?: number
  step?: number
  options?: EldraSchemaFieldOption[]
  importAliases?: string[]
}

export type EldraSchemaBlock = {
  key: string
  label: string
  icon?: string
  description?: string
  repeatable?: boolean
  category?: 'core' | 'rules' | 'flavor' | 'media' | 'import'
  importTarget?: boolean
  fields: EldraSchemaField[]
}

export type EldraEntityType =
  | 'character'
  | 'species'
  | 'class'
  | 'subclass'
  | 'background'
  | 'feat'
  | 'spell'
  | 'item'
  | 'monster'
  | 'location'
  | 'faction'
  | 'article'

export type EldraEntitySchema = {
  entityType: EldraEntityType
  label: string
  description?: string
  blocks: string[]
}

export type EldraSystemSchema = {
  key: string
  label: string
  version: string
  description?: string
  importerSupport?: string[]
  entityTypes: EldraEntitySchema[]
  sharedBlocks: EldraSchemaBlock[]
}

export type EldraSchemaRegistrySummary = {
  key: string
  label: string
  version: string
  description?: string
  importerSupport?: string[]
  entityTypes: Array<{
    entityType: string
    label: string
    blockCount: number
  }>
  sharedBlockCount: number
}
