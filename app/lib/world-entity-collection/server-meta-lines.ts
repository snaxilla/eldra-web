// Entity-collection "meta lines" server-projection reader.
//
// WorldEntityInteractivePage.vue (the Items/Spells/Species/etc. admin
// browser) fetches entities with `summary=1`. server/api/worlds/[id]/
// entities.get.ts's summary branch omits `.blocks` from every row but
// pre-computes `collectionMetaLines`/`collectionFacet` server-side, from
// the full blocks, BEFORE stripping them -- and ships those as ready-made
// display strings instead.
//
// The item CARD already read this field first (falling back to a
// blocks-derived projection only when the server sent nothing). The item
// detail RAIL used to skip straight to the blocks-derived fallback
// directly, which is always empty for a catalogue-sourced item: summary
// mode never sends `.blocks`, and the richer per-entity fetch is skipped
// entirely for catalogue rows (there is no backing `entities/:id` row to
// fetch). So the rail silently rendered nothing while the card, reading the
// same entity, showed full mechanics.
//
// Pulled out of the .vue file so this exact priority (server lines first)
// is unit-testable -- this repo has no component-rendering test harness,
// the same reason AdminRollSandbox.vue's own request-shaping logic lives in
// ./rollSandbox.ts rather than inline.

export function readableText(value: any): string {
  if (value === null || value === undefined) return ''

  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value)
  }

  if (typeof value === 'string') {
    const trimmed = value.trim()
    if (!trimmed || trimmed === '[object Object]') return ''

    if (
      (trimmed.startsWith('{') && trimmed.endsWith('}')) ||
      (trimmed.startsWith('[') && trimmed.endsWith(']'))
    ) {
      try {
        return readableText(JSON.parse(trimmed))
      } catch {}
    }

    return trimmed
  }

  if (Array.isArray(value)) {
    return value
      .map(readableText)
      .map((item) => item.trim())
      .filter((item) => item && item !== '[object Object]')
      .filter((item, index, list) => list.indexOf(item) === index)
      .join(' / ')
  }

  if (typeof value === 'object') {
    const type = readableText(value.type || value.creature_type || value.creatureType || '')
    const tags = Array.isArray(value.tags)
      ? value.tags.map(readableText).filter(Boolean)
      : []

    if (type && tags.length) return `${type} (${tags.join(', ')})`
    if (type) return type

    for (const key of [
      'label',
      'name',
      'title',
      'value',
      'amount',
      'cr',
      'challenge_rating',
      'challengeRating',
      'item_type',
      'itemType',
      'category',
      'rarity',
      'school',
      'entry'
    ]) {
      const found = readableText(value[key])
      if (found) return found
    }

    if (Array.isArray(value.from)) return readableText(value.from)
    if (value.choose) return readableText(value.choose)
    if (Array.isArray(value.entries)) return readableText(value.entries)
    if (Array.isArray(value.items)) return readableText(value.items)

    return Object.values(value)
      .map(readableText)
      .map((item) => item.trim())
      .filter((item) => item && item !== '[object Object]')
      .slice(0, 3)
      .join(' / ')
  }

  return ''
}

export function firstCode(value: any): string {
  const readable = readableText(value)
  const first = readable.split(/[|,/]/)[0] || readable
  return first.trim().toUpperCase()
}

export function titleCase(value: any): string {
  return readableText(value)
    .replace(/_/g, ' ')
    .replace(/-/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (letter) => letter.toUpperCase())
}

const ITEM_CODE_LABELS: Record<string, string> = {
  A: 'Ammunition',
  AF: 'Ammunition',
  AIR: 'Air Vehicle',
  AT: "Artisan's Tools",
  EXP: 'Explosive',
  FD: 'Food and Drink',
  G: 'Adventuring Gear',
  GS: 'Gaming Set',
  HA: 'Heavy Armor',
  INS: 'Instrument',
  LA: 'Light Armor',
  M: 'Melee Weapon',
  MA: 'Medium Armor',
  MNT: 'Mount',
  P: 'Potion',
  R: 'Ranged Weapon',
  RD: 'Rod',
  RG: 'Ring',
  S: 'Shield',
  SC: 'Scroll',
  SCF: 'Spellcasting Focus',
  SHP: 'Ship',
  ST: 'Staff',
  T: 'Tool',
  TAH: 'Tack and Harness',
  TB: 'Trade Bar',
  TG: 'Trade Good',
  VEH: 'Vehicle',
  WD: 'Wand',
  '$A': 'Art Object',
  '$G': 'Treasure',
  UNKNOWN: 'Wondrous Item'
}

export function itemCodeLabel(value: any): string {
  const code = firstCode(value)

  if (ITEM_CODE_LABELS[code]) return ITEM_CODE_LABELS[code]

  const clean = readableText(value)
  if (!clean || clean === '[object Object]') return 'Item'

  return titleCase(clean.split('|')[0] || clean)
}

export function normalizeServerMetaLine(line: any, isItemContext: boolean): string {
  const text = readableText(line)
    .replace(/\[object Object\]/gi, '')
    .replace(/\s+/g, ' ')
    .trim()

  if (!text) return ''

  const typeMatch = text.match(/^Type:\s*(.+)$/i)

  if (typeMatch && isItemContext) {
    return `Type: ${itemCodeLabel(typeMatch[1])}`
  }

  return text
}

// The single resolver the item card already used, and the item detail rail
// now uses too (see WorldEntityInteractivePage.vue's `collectionMetaLines`/
// `collectionServerMetaLines`). Reads the server-precomputed fields a
// `summary=1` entities list response carries; returns `[]` when the server
// sent nothing, so the caller can fall back to a blocks-derived projection.
export function serverMetaLines(entity: any, isItemContext: boolean): string[] {
  const raw =
    entity?.collectionMetaLines ??
    entity?.collection_meta_lines ??
    entity?.metaLines ??
    entity?.meta_lines ??
    []

  if (!Array.isArray(raw)) return []

  return raw
    .map((line) => normalizeServerMetaLine(line, isItemContext))
    .filter(Boolean)
}
