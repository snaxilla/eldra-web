function normalizeCreatureType(value: any) {
  if (!value) return null

  if (typeof value === 'string') return value

  if (typeof value === 'object') {
    const baseType = String(value.type || '').trim()
    const tags = Array.isArray(value.tags)
      ? value.tags.filter(Boolean).map((t: any) => String(t))
      : []

    if (baseType && tags.length) {
      return `${baseType} (${tags.join(', ')})`
    }

    if (baseType) return baseType
  }

  return String(value)
}

function slugify(value: string) {
  return String(value || '')
    .toLowerCase()
    .trim()
    .replace(/['"]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 120)
}

function asArray<T = any>(value: any): T[] {
  return Array.isArray(value) ? value : []
}

function firstString(value: any): string {
  if (typeof value === 'string') return value
  if (Array.isArray(value)) {
    for (const item of value) {
      const str = firstString(item)
      if (str) return str
    }
  }
  if (value && typeof value === 'object') {
    if (typeof value.entry === 'string') return value.entry
    if (Array.isArray(value.entries)) return firstString(value.entries)
    if (Array.isArray(value.items)) return firstString(value.items)
  }
  return ''
}

function flattenEntries(value: any): string {
  if (value == null) return ''
  if (typeof value === 'string') return value
  if (Array.isArray(value)) return value.map(flattenEntries).filter(Boolean).join('\n\n')

  if (typeof value === 'object') {
    if (typeof value.entry === 'string') return value.entry

    const parts: string[] = []

    if (typeof value.name === 'string' && value.name.trim()) {
      parts.push(value.name.trim())
    }

    if (Array.isArray(value.entries)) {
      const inner = flattenEntries(value.entries)
      if (inner) parts.push(inner)
    }

    if (Array.isArray(value.items)) {
      const inner = flattenEntries(value.items)
      if (inner) parts.push(inner)
    }

    if (Array.isArray(value.rows)) {
      const tableText = value.rows
        .map((row: any) => Array.isArray(row) ? row.map(flattenEntries).join(' | ') : flattenEntries(row))
        .join('\n')
      if (tableText) parts.push(tableText)
    }

    if (typeof value.caption === 'string' && value.caption.trim()) {
      parts.unshift(value.caption.trim())
    }

    return parts.filter(Boolean).join('\n\n')
  }

  return ''
}

function normalizeSource(value: any) {
  return String(value || '').trim().toLowerCase()
}

function monsterKey(name: any, source: any) {
  return `${String(name || '').trim().toLowerCase()}|${normalizeSource(source)}`
}

function extractMonstersFromPayload(payload: any): any[] {
  if (Array.isArray(payload)) return payload
  if (Array.isArray(payload?.monster)) return payload.monster
  if (Array.isArray(payload?.data?.monster)) return payload.data.monster

  if (payload && typeof payload === 'object' && typeof payload.name === 'string') {
    return [payload]
  }

  return []
}

function extractMonsterFluffFromPayload(payload: any): any[] {
  if (!payload) return []

  if (Array.isArray(payload?.monsterFluff)) return payload.monsterFluff
  if (Array.isArray(payload?.data?.monsterFluff)) return payload.data.monsterFluff

  if (Array.isArray(payload?.fluff?.monsterFluff)) return payload.fluff.monsterFluff

  if (payload?.monsterFluff && typeof payload.monsterFluff === 'object' && typeof payload.monsterFluff.name === 'string') {
    return [payload.monsterFluff]
  }

  if (payload && typeof payload === 'object' && typeof payload.name === 'string' && (payload.entries || payload.images)) {
    return [payload]
  }

  return []
}

function buildMonsterFluffMap(payload: any) {
  const fluffItems = extractMonsterFluffFromPayload(payload)
  const map = new Map<string, any>()

  for (const fluff of fluffItems) {
    map.set(monsterKey(fluff?.name, fluff?.source), fluff)
  }

  return map
}

function normalizeActionEntries(items: any[] | undefined, actionType: string) {
  return asArray(items).map((entry: any, index: number) => ({
    actionType,
    name: String(entry?.name || `${actionType}-${index + 1}`),
    sort: index,
    text: flattenEntries(entry?.entries || entry?.entry || ''),
    raw: entry || {}
  }))
}

function looksLikeDescriptiveParagraph(value: string) {
  const text = String(value || '').trim()
  if (!text) return false
  if (text.length < 40) return false
  if (!/[a-z]/i.test(text)) return false
  if (text.includes('|')) return false
  return true
}

function findFirstDescriptiveText(value: any): string {
  if (value == null) return ''

  if (typeof value === 'string') {
    const text = value.trim()
    return looksLikeDescriptiveParagraph(text) ? text : ''
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findFirstDescriptiveText(item)
      if (found) return found
    }
    return ''
  }

  if (typeof value === 'object') {
    if (typeof value.entry === 'string') {
      const text = value.entry.trim()
      if (looksLikeDescriptiveParagraph(text)) return text
    }

    if (Array.isArray(value.entries)) {
      const found = findFirstDescriptiveText(value.entries)
      if (found) return found
    }

    if (Array.isArray(value.items)) {
      const found = findFirstDescriptiveText(value.items)
      if (found) return found
    }
  }

  return ''
}

function extractMonsterSummary(monster: any, fluff: any) {
  const fluffSummary =
    findFirstDescriptiveText(fluff?.entries) ||
    findFirstDescriptiveText(monster?.fluff?.entries) ||
    findFirstDescriptiveText(monster?.entries) ||
    ''

  if (fluffSummary) return fluffSummary
  return ''
}

export function preview5eToolsMonsters(payload: any) {
  const monsters = extractMonstersFromPayload(payload)
  const fluffMap = buildMonsterFluffMap(payload)
  const warnings: string[] = []

  const items = monsters.map((monster: any) => {
    const title = String(monster?.name || 'Untitled Monster')
    const slugBase = slugify(title) || 'monster'
    const source = String(monster?.source || '').trim().toLowerCase()
    const slug = source ? `${slugBase}-${source}` : slugBase

    const matchedFluff =
      fluffMap.get(monsterKey(monster?.name, monster?.source)) ||
      monster?.fluff ||
      null

    const fluffText = flattenEntries(matchedFluff?.entries || [])
    const summary = extractMonsterSummary(monster, matchedFluff)

    const actions = [
      ...normalizeActionEntries(monster?.trait, 'trait'),
      ...normalizeActionEntries(monster?.action, 'action'),
      ...normalizeActionEntries(monster?.bonus, 'bonus'),
      ...normalizeActionEntries(monster?.reaction, 'reaction'),
      ...normalizeActionEntries(monster?.legendary, 'legendary'),
      ...normalizeActionEntries(monster?.mythic, 'mythic'),
      ...normalizeActionEntries(monster?.lair, 'lair')
    ]

    const overviewBlockText = [
      summary ? summary : '',
      fluffText && fluffText !== summary ? fluffText : ''
    ].filter(Boolean).join('\n\n')

    return {
      title,
      slug,
      systemKey: 'dnd5e',
      entityType: 'enemy',
      summary,
      blocks: [
        {
          blockKey: 'overview',
          label: 'Overview',
          sort: 0,
          repeatable: false,
          data: {
            text: overviewBlockText
          }
        },
        {
          blockKey: 'source',
          label: 'Source',
          sort: 1,
          repeatable: false,
          data: {
            source: monster?.source || null,
            page: monster?.page || null
          }
        }
      ],
      _monsterData: {
        statblock: {
          profile_kind: 'monster',
          size_json: monster?.size ?? null,
          creature_type: normalizeCreatureType(monster?.type),
          alignment_json: monster?.alignment ?? null,
          armor_class: typeof monster?.ac?.[0] === 'number' ? monster.ac[0] : (typeof monster?.ac === 'number' ? monster.ac : null),
          armor_class_json: monster?.ac ?? null,
          hit_points_average: monster?.hp?.average ?? null,
          hit_points_formula: monster?.hp?.formula ?? null,
          speed_json: monster?.speed ?? null,
          str_score: monster?.str ?? null,
          dex_score: monster?.dex ?? null,
          con_score: monster?.con ?? null,
          int_score: monster?.int ?? null,
          wis_score: monster?.wis ?? null,
          cha_score: monster?.cha ?? null,
          saving_throws_json: monster?.save ?? null,
          skills_json: monster?.skill ?? null,
          passive_perception: monster?.passive ?? null,
          languages_json: monster?.languages ?? null,
          challenge_rating: monster?.cr ?? null,
          level: monster?.level ?? null,
          damage_tags_json: monster?.damageTags ?? null,
          raw_payload_json: monster ?? null
        },
        monsterProfile: {
          fluff_markdown: monster?.fluffMarkdown || null,
          source: monster?.source ?? null,
          page: monster?.page ?? null,
          reference_sources_json: monster?.referenceSources ?? null,
          gear_json: monster?.gear ?? null,
          environment_json: monster?.environment ?? null,
          treasure_json: monster?.treasure ?? null,
          sound_clip_url: monster?.soundClip?.url ?? null,
          action_tags_json: monster?.actionTags ?? null,
          language_tags_json: monster?.languageTags ?? null,
          misc_tags_json: monster?.miscTags ?? null,
          has_fluff: !!matchedFluff,
          has_fluff_images: !!matchedFluff?.images?.length,
          token_name: monster?.token?.name ?? null,
          token_source: monster?.token?.source ?? null,
          fluff_json: matchedFluff ?? null,
          raw_payload_json: monster ?? null
        },
        actions
      }
    }
  })

  if (!items.length) {
    warnings.push('No monsters found in payload.')
  }

  return {
    items,
    warnings
  }
}
