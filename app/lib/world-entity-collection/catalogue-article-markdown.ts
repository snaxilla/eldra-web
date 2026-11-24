// Catalogue article markdown builders -- Species/Class Context Content
// pass (owner follow-up). Extracted from
// app/components/world/WorldEntityInteractivePage.vue, where
// buildClassArticleMarkdown/buildSpeciesArticleMarkdown already existed
// and already worked correctly -- behavior is UNCHANGED, every helper
// copied verbatim, only relocated so the SAME logic can also run
// server-side (server/api/worlds/[id]/entities.get.ts), which has the
// entity's `blocks` in hand per-row but could not previously reach this
// client-only code.
//
// WHY THIS WAS NECESSARY (the actual gap this pass closes): the rail's own
// "useful information" for Species/Class consisted only of a handful of
// meta-line facts (Size/Speed/Traits count; Hit Die/Saves/Primary
// Ability) -- real trait/feature NAMES and their own readable prose were
// computed by these exact functions already, but only ever reached the
// client when `entity.blocks` was present, which (per the catalogue-
// entity-bridge.ts/entities.get.ts own established contract) a
// catalogue-sourced entity's summary-mode row NEVER carries. The fix is
// not a new renderer -- it's making this EXISTING one reachable from the
// one place (the server, which already resolves blocks per row to compute
// collectionMetaLines) that actually has the data.
//
// Operates on a plain `blocks` array (not an `entity` object) so it has no
// dependency on either caller's own row shape -- the Vue component keeps
// its own thin `entity`-taking wrappers (`buildClassArticleMarkdown(entity)`
// etc. unwrap `entity.blocks` and delegate here), preserving every
// existing call site there unchanged.
export type ArticleBlock = { block_key?: string; blockKey?: string; data?: Record<string, any> | null }

export function blockByKey(blocks: ArticleBlock[] | null | undefined, key: string): ArticleBlock | null {
  const list = Array.isArray(blocks) ? blocks : []
  return list.find((block) => String(block?.block_key || block?.blockKey || '') === key) || null
}

export function importSourceRawJson(blocks: ArticleBlock[] | null | undefined): any {
  return blockByKey(blocks, 'import_source')?.data?.raw_json || null
}

export function clean5eText(value: any): string {
  return String(value || '')
    .replace(/\{@(?:filter|spell|item|creature|class|race|variantrule|condition|skill|action|sense|damage|book|hazard|reward|feat)\s+([^|}]+)(?:\|[^}]*)?\}/g, '$1')
    .replace(/\{@(?:i|b|dice|damage|hit|dc|scaledice|scaledamage)\s+([^}]+)\}/g, '$1')
    .replace(/\{@[^}]+\}/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

export function formatEntriesAsMarkdown(entries: any): string {
  if (!entries) return ''

  if (typeof entries === 'string') return clean5eText(entries)

  if (Array.isArray(entries)) {
    return entries.map(formatEntriesAsMarkdown).filter(Boolean).join('\n\n')
  }

  if (typeof entries === 'object') {
    const parts: string[] = []

    if (entries.name) parts.push(`## ${clean5eText(entries.name)}`)
    if (entries.entry) parts.push(clean5eText(entries.entry))
    if (entries.entries) parts.push(formatEntriesAsMarkdown(entries.entries))
    if (entries.items) parts.push(formatEntriesAsMarkdown(entries.items))

    return parts.filter(Boolean).join('\n\n')
  }

  return ''
}

export function formatClassFeatureRef(value: any): string {
  if (!value) return ''

  if (typeof value === 'string') {
    const parts = value.split('|')
    const name = parts[0] || value
    const level = parts[3]
    return level ? `Level ${level}: ${name}` : name
  }

  if (typeof value === 'object') {
    return formatClassFeatureRef(value.classFeature || value.name || '')
  }

  return String(value)
}

export function formatChoiceList(value: any): string {
  if (!value) return ''

  if (Array.isArray(value)) {
    return value.map(formatChoiceList).filter(Boolean).join(', ')
  }

  if (typeof value === 'string') return value

  if (typeof value === 'object') {
    if (Array.isArray(value.from)) return value.from.join(', ')
    if (value.choose) return formatChoiceList(value.choose)
    return Object.values(value).map(formatChoiceList).filter(Boolean).join(', ')
  }

  return String(value)
}

export function buildClassArticleMarkdownFromBlocks(blocks: ArticleBlock[] | null | undefined): string {
  const raw = importSourceRawJson(blocks)
  if (!raw) return ''

  const parts: string[] = []

  if (raw.entries) {
    const entriesText = formatEntriesAsMarkdown(raw.entries)
    if (entriesText) parts.push(entriesText)
  }

  if (raw.startingProficiencies) {
    const profs: string[] = []

    if (raw.proficiency) profs.push(`**Saving Throw Proficiencies:** ${formatChoiceList(raw.proficiency).toUpperCase()}`)

    const armor = formatChoiceList(raw.startingProficiencies.armor)
    if (armor) profs.push(`**Armor Training:** ${armor}`)

    const weapons = formatChoiceList(raw.startingProficiencies.weapons)
    if (weapons) profs.push(`**Weapon Proficiencies:** ${weapons}`)

    const tools = formatChoiceList(raw.startingProficiencies.tools)
    if (tools) profs.push(`**Tool Proficiencies:** ${tools}`)

    const skills = formatChoiceList(raw.startingProficiencies.skills)
    if (skills) profs.push(`**Skill Proficiencies:** ${skills}`)

    if (profs.length) parts.push(`## Proficiencies\n\n${profs.join('\n\n')}`)
  }

  if (raw.startingEquipment?.entries?.length) {
    // Some startingEquipment entries are shaped as { defaultData, goldAlternative }
    // rather than { name/entry/entries/items } -- formatEntriesAsMarkdown doesn't
    // recognize that shape and returns '', which would otherwise leave a heading
    // with no body. Guard on the resolved text, not just entries.length.
    const equipmentText = formatEntriesAsMarkdown(raw.startingEquipment.entries)
    if (equipmentText) parts.push(`## Starting Equipment\n\n${equipmentText}`)
  }

  if (Array.isArray(raw.classFeatures) && raw.classFeatures.length) {
    const features = raw.classFeatures
      .map(formatClassFeatureRef)
      .filter(Boolean)
      .map((line: string) => `- ${clean5eText(line)}`)
      .join('\n')

    if (features) parts.push(`## Class Features\n\n${features}`)
  }

  return parts.filter(Boolean).join('\n\n')
}

export function buildSpeciesArticleMarkdownFromBlocks(blocks: ArticleBlock[] | null | undefined): string {
  const core = blockByKey(blocks, 'species_core')?.data || null
  const raw = importSourceRawJson(blocks)
  const parts: string[] = []

  if (core?.traits) parts.push(String(core.traits))
  if (!parts.length && raw?.entries) parts.push(formatEntriesAsMarkdown(raw.entries))

  return parts.filter(Boolean).join('\n\n')
}
