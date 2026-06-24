import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { getCharacterSheetForEntity } from '../../../../../../utils/character-sheets'

type ManifestFeature = {
  id: string
  name: string
  title: string
  level: number
  source: string
  summary: string
  detail: string
  markdown: string
  kind: 'class' | 'subclass'
  activation: string
  tags: string[]
  found: boolean
}

type ManifestResourceOption = {
  id: string
  name: string
  title: string
  activation: string
  summary: string
  detail: string
  markdown: string
}

type ManifestResource = {
  key: string
  label: string
  max: number
  usedKey: string
  reset: string
  source: string
  kind: string
  unit: string
  mode: 'uses' | 'pool'
  description: string
  options?: ManifestResourceOption[]
}

function cleanText(value: any): string {
  if (Array.isArray(value)) return value.map(cleanText).filter(Boolean).join(' ')

  if (value && typeof value === 'object') {
    if (value.name && value.entries) return `${cleanText(value.name)} ${cleanText(value.entries)}`
    if (value.entry) return cleanText(value.entry)
    if (value.entries) return cleanText(value.entries)
    if (value.items) return cleanText(value.items)
    if (value.name || value.title) return cleanText(value.name || value.title)

    return Object.values(value).map(cleanText).filter(Boolean).join(' ')
  }

  return String(value ?? '')
    .replace(/\{@(?:class|subclass|classFeature|subclassFeature|feat|spell|item|filter|book|action|race|species|creature|condition|skill|sense|damage|hazard|reward|variantrule)\s+([^|}]+)(?:\|[^}]*)?\}/gi, '$1')
    .replace(/\{@(?:i|b|dice|damage|hit|dc|scaledice|scaledamage)\s+([^}]+)\}/gi, '$1')
    .replace(/\{@[^}]+\}/g, '')
    .replace(/[#*_`]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function markdownText(value: any): string {
  if (!value) return ''
  if (typeof value === 'string') return cleanText(value)

  if (Array.isArray(value)) {
    return value.map(markdownText).filter(Boolean).join('\n\n')
  }

  if (typeof value === 'object') {
    const parts: string[] = []
    const name = cleanText(value.name || value.title || '')
    const entry = cleanText(value.entry || '')
    const entries = markdownText(value.entries)
    const items = markdownText(value.items)

    if (name) parts.push(`### ${name}`)
    if (entry) parts.push(entry)
    if (entries) parts.push(entries)
    if (items) parts.push(items)

    return parts.filter(Boolean).join('\n\n')
  }

  return cleanText(value)
}

function normalizedKey(value: any) {
  return cleanText(value)
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

function slugify(value: any) {
  return normalizedKey(value)
    .replace(/\s+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 120)
}

function shortText(value: any, limit = 360) {
  const text = cleanText(value)
  if (!text) return ''
  return text.length > limit ? `${text.slice(0, limit).trim()}...` : text
}

function numberValue(value: any, fallback = 0) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

function classDataDirs() {
  return [
    process.env.ELDRA_5ETOOLS_CLASS_DATA_DIR || '',
    process.env.ELDRA_5ETOOLS_DATA_DIR ? join(process.env.ELDRA_5ETOOLS_DATA_DIR, 'class') : '',
    '/opt/eldra/datasets/5etools-src/data/class',
    join(process.cwd(), 'datasets/5etools-src/data/class'),
    join(process.cwd(), '../datasets/5etools-src/data/class')
  ].filter(Boolean)
}

function classFiles() {
  for (const dir of classDataDirs()) {
    if (!existsSync(dir)) continue

    return readdirSync(dir)
      .filter((name) => /^class-.*\.json$/i.test(name))
      .map((name) => join(dir, name))
  }

  return []
}


function sourceKey(value: any) {
  return cleanText(value).toUpperCase()
}

function sourceRank(value: any) {
  const source = sourceKey(value)

  /*
   * Prefer the 2024 Player's Handbook when duplicate class entries exist.
   * The builder currently stores "Cleric", not "Cleric|XPHB", so without this
   * we accidentally grab the older PHB row first.
   */
  if (source === 'XPHB') return 0
  if (source === 'PHB') return 20
  if (source) return 10

  return 30
}

function loadClassData(className: string) {
  const wanted = normalizedKey(className)

  for (const file of classFiles()) {
    let data: any = null

    try {
      data = JSON.parse(readFileSync(file, 'utf8'))
    } catch {
      continue
    }

    const classes = Array.isArray(data?.class) ? data.class : []
    const matches = classes
      .filter((entry: any) => normalizedKey(entry?.name) === wanted)
      .sort((a: any, b: any) =>
        sourceRank(a?.source) - sourceRank(b?.source) ||
        String(a?.source || '').localeCompare(String(b?.source || ''))
      )

    const found = matches[0]

    if (found) {
      return {
        file,
        data,
        classEntry: found
      }
    }
  }

  return null
}

function parseFeatureRef(value: any) {
  const raw = typeof value === 'object'
    ? String(value.classFeature || value.subclassFeature || value.name || '')
    : String(value || '')

  const parts = raw.split('|')
  const name = cleanText(parts[0] || raw)
  const className = cleanText(parts[1] || '')
  const source = cleanText(parts[2] || '')
  const level = Math.floor(numberValue(parts[3], numberValue((value && typeof value === 'object') ? value.level : 0, 0)))

  return {
    name,
    className,
    source,
    level,
    raw
  }
}


function featureMatchesRef(feature: any, ref: any) {
  if (!feature || !ref?.name) return false

  const featureName = normalizedKey(feature.name || feature.title || '')
  const refName = normalizedKey(ref.name)

  if (featureName !== refName) return false

  const featureSource = sourceKey(feature.source)
  const refSource = sourceKey(ref.source)

  if (refSource && featureSource && featureSource !== refSource) return false

  const featureLevel = Math.floor(numberValue(feature.level || feature.classLevel || feature.class_level, 0))
  if (ref.level && featureLevel && ref.level !== featureLevel) return false

  return true
}

function findClassFeature(data: any, ref: any) {
  const features = Array.isArray(data?.classFeature) ? data.classFeature : []
  return features.find((feature: any) => featureMatchesRef(feature, ref)) || null
}

function featureActivation(feature: any, text: string) {
  const combined = normalizedKey([
    feature?.activation,
    feature?.action,
    feature?.entries,
    text
  ].join(' '))

  if (combined.includes('reaction')) return 'Reaction'
  if (combined.includes('bonus action')) return 'Bonus Action'
  if (combined.includes('magic action')) return 'Magic Action'
  if (combined.includes('as an action') || combined.includes('take the action') || combined.includes('action')) return 'Action'

  return 'Passive'
}

function featureTags(feature: any, text: string) {
  const combined = normalizedKey([feature?.name, text].join(' '))
  const tags: string[] = []

  if (combined.includes('spell')) tags.push('Spellcasting')
  if (combined.includes('channel divinity')) tags.push('Resource')
  if (combined.includes('lay on hands')) tags.push('Resource')
  if (combined.includes('fighting style')) tags.push('Choice')
  if (combined.includes('subclass')) tags.push('Subclass')

  return tags
}

function featureCardFromClassFeature(feature: any, ref: any, kind: 'class' | 'subclass'): ManifestFeature {
  const name = cleanText(feature?.name || ref?.name || 'Class Feature')
  const level = Math.floor(numberValue(feature?.level || ref?.level || 1, 1))
  const source = cleanText(feature?.source || ref?.source || '')
  const markdown = markdownText(feature?.entries || feature?.description || feature?.summary || '')
  const detail = cleanText(markdown || feature?.entries || feature?.description || feature?.summary || '')
  const summary = shortText(detail, 360)
  const activation = featureActivation(feature, detail)

  return {
    id: `${kind}-${level}-${slugify(name)}-${slugify(source)}`,
    name,
    title: name,
    level,
    source,
    summary,
    detail,
    markdown: markdown || detail,
    kind,
    activation,
    tags: featureTags(feature, detail),
    found: true
  }
}

function fallbackFeatureCard(ref: any, kind: 'class' | 'subclass'): ManifestFeature {
  const name = cleanText(ref?.name || 'Class Feature')
  const level = Math.floor(numberValue(ref?.level || 1, 1))
  const source = cleanText(ref?.source || '')

  return {
    id: `${kind}-${level}-${slugify(name)}-${slugify(source)}`,
    name,
    title: name,
    level,
    source,
    summary: '',
    detail: '',
    markdown: '',
    kind,
    activation: 'Passive',
    tags: [],
    found: false
  }
}

function subclassAliases(value: any) {
  const text = cleanText(value)
  const short = text
    .replace(/^Oath of the\s+/i, '')
    .replace(/^Oath of\s+/i, '')
    .replace(/^Circle of the\s+/i, '')
    .replace(/^Circle of\s+/i, '')
    .replace(/^College of\s+/i, '')
    .replace(/^Path of the\s+/i, '')
    .replace(/^Path of\s+/i, '')
    .replace(/^Way of the\s+/i, '')
    .replace(/^Way of\s+/i, '')
    .replace(/^The\s+/i, '')
    .trim()

  return Array.from(new Set([
    normalizedKey(text),
    normalizedKey(short)
  ].filter(Boolean)))
}

function subclassFeatureMatches(feature: any, subclassName: string) {
  const aliases = subclassAliases(subclassName)
  if (!aliases.length) return false

  const featureSubclassNames = [
    feature?.subclassShortName,
    feature?.subclass_short_name,
    feature?.subclassName,
    feature?.subclass_name,
    feature?.subclass
  ].map(normalizedKey).filter(Boolean)

  if (featureSubclassNames.some((name) => aliases.includes(name))) return true

  const featureName = normalizedKey(feature?.name || '')
  return aliases.some((alias) => featureName.includes(alias))
}


function nestedClassFeatureRefs(value: any) {
  const refs: any[] = []

  function visit(entry: any) {
    if (!entry) return

    if (Array.isArray(entry)) {
      for (const item of entry) visit(item)
      return
    }

    if (typeof entry !== 'object') return

    if (entry.classFeature) {
      refs.push(parseFeatureRef({ classFeature: entry.classFeature }))
    }

    for (const item of Object.values(entry)) {
      visit(item)
    }
  }

  visit(value)

  return refs
}

function inheritedResourceNameForParent(feature: any) {
  const name = normalizedKey(feature?.name || '')

  if (name === 'channel divinity') return 'Channel Divinity'
  if (name === 'bardic inspiration') return 'Bardic Inspiration'
  if (name === 'wild shape') return 'Wild Shape'
  if (name === 'rage') return 'Rage'

  return ''
}


function classFeatureCards(data: any, level: number) {
  const refs = Array.isArray(data?.classEntry?.classFeatures)
    ? data.classEntry.classFeatures
    : []

  const out: ManifestFeature[] = []
  const seenCards = new Set<string>()
  const seenRefs = new Set<string>()

  function shouldKeepFeature(feature: ManifestFeature) {
    const name = normalizedKey(feature.name)

    if (name === 'subclass feature') return false
    if (name.endsWith(' subclass')) return false

    return true
  }

  function addRef(ref: any, depth = 0, inheritedResourceName = '') {
    if (!ref?.name || !ref?.level || ref.level > level) return
    if (depth > 5) return

    const refKey = normalizedKey(`${ref.raw} ${ref.name} ${ref.source} ${ref.level} ${inheritedResourceName}`)
    if (!refKey || seenRefs.has(refKey)) return
    seenRefs.add(refKey)

    const feature = findClassFeature(data.data, ref)
    const card = feature
      ? featureCardFromClassFeature(feature, ref, 'class')
      : fallbackFeatureCard(ref, 'class')

    if (inheritedResourceName) {
      card.tags = Array.from(new Set([
        ...card.tags,
        inheritedResourceName
      ]))
    }

    const cardKey = normalizedKey(`${card.kind} ${card.level} ${card.name} ${card.source} ${card.detail}`)
    if (shouldKeepFeature(card) && !seenCards.has(cardKey)) {
      seenCards.add(cardKey)
      out.push(card)
    }

    if (!feature) return

    const nextInheritedResourceName = inheritedResourceNameForParent(feature) || inheritedResourceName
    const nestedRefs = nestedClassFeatureRefs(feature.entries)

    for (const nestedRef of nestedRefs) {
      addRef(nestedRef, depth + 1, nextInheritedResourceName)
    }
  }

  for (const ref of refs.map(parseFeatureRef)) {
    addRef(ref)
  }

  return out
}


function subclassFeatureCards(data: any, subclassName: string, level: number) {
  if (!subclassName) return []

  const features = Array.isArray(data?.data?.subclassFeature)
    ? data.data.subclassFeature
    : []

  const classSource = sourceKey(data?.classEntry?.source)

  const matchingFeatures = features
    .filter((feature: any) => subclassFeatureMatches(feature, subclassName))
    .filter((feature: any) => Math.floor(numberValue(feature?.level || 0, 0)) <= level)

  /*
   * If this character is using XPHB Cleric, prefer XPHB Life Domain rows and
   * do not mix in old PHB Life Domain rows. If no same-source subclass exists,
   * fall back to the old behavior so legacy/non-core subclasses still appear.
   */
  const sameSourceFeatures = classSource
    ? matchingFeatures.filter((feature: any) => sourceKey(feature?.source) === classSource)
    : []

  const selectedFeatures = sameSourceFeatures.length
    ? sameSourceFeatures
    : matchingFeatures

  return selectedFeatures
    .map((feature: any) => {
      const level = Math.floor(numberValue(feature?.level || 1, 1))
      return featureCardFromClassFeature(feature, {
        name: feature?.name || 'Subclass Feature',
        level,
        source: feature?.source || ''
      }, 'subclass')
    })
}

function readUsesFromText(text: string, fallback = 1) {
  const normalized = normalizedKey(text)

  const explicit = normalized.match(/\b(\d+)\s+(?:times|uses)\b/)
  if (explicit) return Math.max(1, Math.floor(Number(explicit[1])))

  if (normalized.includes('twice')) return 2
  if (normalized.includes('three times')) return 3
  if (normalized.includes('four times')) return 4

  return fallback
}

function resetTextFromFeature(text: string, fallback = 'Long Rest') {
  const normalized = normalizedKey(text)
  if (normalized.includes('short or long rest')) return 'Short or Long Rest'
  if (normalized.includes('short rest or long rest')) return 'Short or Long Rest'
  if (normalized.includes('short rest')) return 'Short Rest'
  if (normalized.includes('long rest')) return 'Long Rest'
  return fallback
}

function resourceOptionObject(feature: ManifestFeature): ManifestResourceOption {
  return {
    id: feature.id,
    name: feature.name,
    title: feature.title,
    activation: feature.activation,
    summary: feature.summary,
    detail: feature.detail,
    markdown: feature.markdown
  }
}

function featureLooksLikeResourceParent(feature: ManifestFeature, resourceName: string) {
  return normalizedKey(feature.name) === normalizedKey(resourceName)
}

function featureMentionsResourceUse(feature: ManifestFeature, resourceName: string) {
  const resourceKey = normalizedKey(resourceName)
  const featureName = normalizedKey(feature.name)
  const featureTitle = normalizedKey(feature.title)
  const text = normalizedKey(`${feature.name} ${feature.title} ${feature.detail} ${feature.summary} ${feature.markdown}`)

  if (!resourceKey) return false
  if (featureLooksLikeResourceParent(feature, resourceName)) return false

  if ((feature.tags || []).some((tag) => normalizedKey(tag) === resourceKey)) return true

  /*
   * Generic resource option detection:
   * - "Channel Divinity: Harness Divine Power"
   * - "Rage: Foo"
   * - "Wild Shape: Foo"
   * - any feature text that says it expends/spends/uses that resource
   */
  if (featureName.startsWith(`${resourceKey} `)) return true
  if (featureName.startsWith(`${resourceKey}:`)) return true
  if (featureTitle.startsWith(`${resourceKey} `)) return true
  if (featureTitle.startsWith(`${resourceKey}:`)) return true

  if (!text.includes(resourceKey)) return false

  return (
    text.includes(`use your ${resourceKey}`) ||
    text.includes(`use this ${resourceKey}`) ||
    text.includes(`use a ${resourceKey}`) ||
    text.includes(`using your ${resourceKey}`) ||
    text.includes(`expend a use of ${resourceKey}`) ||
    text.includes(`expend one use of ${resourceKey}`) ||
    text.includes(`spend a use of ${resourceKey}`) ||
    text.includes(`spend one use of ${resourceKey}`) ||
    text.includes(`with your ${resourceKey}`)
  )
}

function resourceOptionsFor(features: ManifestFeature[], resourceName: string) {
  const seen = new Set<string>()

  return features
    .filter((feature) => featureMentionsResourceUse(feature, resourceName))
    .map(resourceOptionObject)
    .filter((option) => {
      const key = normalizedKey(`${option.title} ${option.detail}`)
      if (!key || seen.has(key)) return false
      seen.add(key)
      return true
    })
}

function resourceDefinitions(features: ManifestFeature[], className: string, level: number) {
  const out: ManifestResource[] = []
  const seen = new Set<string>()
  const channelOptions = resourceOptionsFor(features, 'Channel Divinity')

  function add(resource: ManifestResource) {
    if (!resource.key || seen.has(resource.key)) return
    seen.add(resource.key)
    out.push(resource)
  }

  for (const feature of features) {
    const nameKey = normalizedKey(feature.name)
    const text = `${feature.name} ${feature.detail} ${feature.summary}`

    if (nameKey.includes('channel divinity')) {
      add({
        key: 'channel-divinity',
        usedKey: 'channel-divinity',
        label: 'Channel Divinity',
        max: readUsesFromText(text, 1),
        reset: resetTextFromFeature(text, 'Long Rest'),
        source: className,
        kind: 'Class Resource',
        unit: 'Use',
        mode: 'uses',
        description: channelOptions.length
          ? 'Expend Channel Divinity to use one of the options below.'
          : feature.summary || 'Track expended uses of Channel Divinity.',
        options: channelOptions
      })
    }

    if (nameKey.includes('lay on hands')) {
      add({
        key: 'lay-on-hands',
        usedKey: 'lay-on-hands',
        label: 'Lay on Hands',
        max: Math.max(1, level * 5),
        reset: resetTextFromFeature(text, 'Long Rest'),
        source: className,
        kind: 'Healing Pool',
        unit: 'HP',
        mode: 'pool',
        description: feature.summary || `Track the ${level * 5} point Lay on Hands healing pool.`
      })
    }

    if (nameKey.includes('bardic inspiration')) {
      add({
        key: 'bardic-inspiration',
        usedKey: 'bardic-inspiration',
        label: 'Bardic Inspiration',
        max: readUsesFromText(text, 2),
        reset: resetTextFromFeature(text, 'Long Rest'),
        source: className,
        kind: 'Class Resource',
        unit: 'Use',
        mode: 'uses',
        description: feature.summary || 'Track expended Bardic Inspiration uses.'
      })
    }
  }

  return out
}

export default defineEventHandler(async (event) => {
  const worldId = String(getRouterParam(event, 'id') || '')
  const entityId = String(getRouterParam(event, 'entityId') || '')

  if (!worldId || !entityId) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Missing world or entity id'
    })
  }

  const sheetPayload = await getCharacterSheetForEntity(worldId, entityId).catch((error: any) => {
    console.error('[feature-manifest] failed to load character sheet payload', error)
    return null
  })

  const sheet = sheetPayload?.sheet || null
  const resolved = sheetPayload?.resolved || {}

  if (!sheet?.id) {
    return {
      source: 'no-sheet',
      worldId,
      entityId,
      features: [],
      resources: []
    }
  }

  const level = Math.max(1, Math.min(20, Math.floor(numberValue(sheet.level, 1))))
  const className = cleanText(
    sheet.class_name ||
    sheet.className ||
    resolved?.class?.title ||
    resolved?.className ||
    resolved?.class_name ||
    ''
  )

  const subclassName = cleanText(
    sheet.subclass_name ||
    sheet.subclassName ||
    resolved?.subclass?.title ||
    resolved?.subclassName ||
    resolved?.subclass_name ||
    ''
  )

  if (!className) {
    return {
      source: 'no-class',
      worldId,
      entityId: entityId,
      sheetId: sheet.id,
      level,
      features: [],
      resources: []
    }
  }

  const loaded = loadClassData(className)

  if (!loaded) {
    return {
      source: 'no-local-class-data',
      worldId,
      entityId,
      sheetId: sheet.id,
      className,
      subclassName,
      level,
      classDataDirs: classDataDirs(),
      classFileCount: classFiles().length,
      features: [],
      resources: []
    }
  }

  const features = [
    ...classFeatureCards(loaded, level),
    ...subclassFeatureCards(loaded, subclassName, level)
  ]
    .filter((feature) => feature.level <= level)
    .sort((a, b) =>
      Number(a.level || 0) - Number(b.level || 0) ||
      String(a.kind || '').localeCompare(String(b.kind || '')) ||
      String(a.name || '').localeCompare(String(b.name || ''))
    )

  return {
    source: 'local-class-data',
    worldId,
    entityId,
    sheetId: sheet.id,
    className,
    subclassName,
    level,
    classDataFile: loaded.file,
    features,
    resources: resourceDefinitions(features, className, level)
  }
})
