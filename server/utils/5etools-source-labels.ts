import fs from 'node:fs/promises'
import path from 'node:path'

const DATASET_ROOT = '/opt/eldra/datasets/5etools-src'
const DATA_ROOT = path.join(DATASET_ROOT, 'data')

let cachedLabels: Record<string, string> | null = null

const FALLBACK_SOURCE_LABELS: Record<string, string> = {
  AAG: "Astral Adventurer's Guide",
  AI: 'Acquisitions Incorporated',
  BGG: "Bigby Presents: Glory of the Giants",
  BMT: 'The Book of Many Things',
  COS: 'Curse of Strahd',
  DMG: "Dungeon Master's Guide",
  ERLW: 'Eberron: Rising from the Last War',
  FTD: "Fizban's Treasury of Dragons",
  GGR: "Guildmasters' Guide to Ravnica",
  IDROTF: 'Icewind Dale: Rime of the Frostmaiden',
  MFF: "Mordenkainen's Fiendish Folio",
  MM: 'Monster Manual',
  MPMM: 'Mordenkainen Presents: Monsters of the Multiverse',
  MTF: "Mordenkainen's Tome of Foes",
  PHB: "Player's Handbook",
  SCAG: "Sword Coast Adventurer's Guide",
  TCE: "Tasha's Cauldron of Everything",
  TTP: 'The Tortle Package',
  VGM: "Volo's Guide to Monsters",
  VRGR: "Van Richten's Guide to Ravenloft",
  XGE: "Xanathar's Guide to Everything",
  XDMG: "Dungeon Master's Guide (2024)",
  XMM: 'Monster Manual (2025)',
  XPHB: "Player's Handbook (2024)"
}

function normalizeSourceCode(value: any) {
  return String(value || '')
    .trim()
    .replace(/^source:/i, '')
    .toUpperCase()
}

function cleanLabel(value: any) {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .trim()
}

function addLabel(map: Record<string, string>, code: any, label: any) {
  const normalizedCode = normalizeSourceCode(code)
  const clean = cleanLabel(label)

  if (!normalizedCode || !clean) return
  if (clean.toUpperCase() === normalizedCode) return

  map[normalizedCode] = clean
}

async function readJsonSafe(filePath: string) {
  try {
    return JSON.parse(await fs.readFile(filePath, 'utf8'))
  } catch {
    return null
  }
}

async function readTextSafe(filePath: string) {
  try {
    return await fs.readFile(filePath, 'utf8')
  } catch {
    return ''
  }
}

function walkSourceObjects(value: any, map: Record<string, string>, depth = 0) {
  if (!value || depth > 8) return

  if (Array.isArray(value)) {
    for (const item of value) {
      walkSourceObjects(item, map, depth + 1)
    }
    return
  }

  if (typeof value !== 'object') return

  const code =
    value.id ||
    value.source ||
    value.sourceCode ||
    value.abbreviation ||
    value.abv ||
    value.code

  const label =
    value.name ||
    value.title ||
    value.full ||
    value.fullName ||
    value.displayName ||
    value.book ||
    value.adventure

  addLabel(map, code, label)

  for (const child of Object.values(value)) {
    if (child && typeof child === 'object') {
      walkSourceObjects(child, map, depth + 1)
    }
  }
}

function extractParserSourceLabels(parserText: string, map: Record<string, string>) {
  if (!parserText) return

  const assignments = [
    'SOURCE_JSON_TO_FULL',
    'SOURCE_JSON_TO_FULL_COMPACT'
  ]

  for (const assignment of assignments) {
    const match = parserText.match(new RegExp(`${assignment}\\\\s*=\\\\s*\\\\{([\\\\s\\\\S]*?)\\\\n\\\\s*\\\\}`, 'm'))
    const block = match?.[1] || ''

    if (!block) continue

    const entryPattern = /["']?([A-Za-z0-9_$:-]+)["']?\s*:\s*["'`]([^"'`]+)["'`]/g
    let entry: RegExpExecArray | null

    while ((entry = entryPattern.exec(block))) {
      addLabel(map, entry[1], entry[2])
    }
  }
}

async function loadLabelsFromKnownJsonFiles(map: Record<string, string>) {
  const candidates = [
    'books.json',
    'adventures.json',
    'sources.json',
    'generated/gendata-sources.json',
    'generated/gendata-book-index.json',
    'generated/gendata-adventure-index.json',
    'generated/gendata-nav-adventure-book-index.json'
  ]

  for (const relativePath of candidates) {
    const json = await readJsonSafe(path.join(DATA_ROOT, relativePath))
    if (json) {
      walkSourceObjects(json, map)
    }
  }
}

async function loadLabelsFromParser(map: Record<string, string>) {
  const parserText = await readTextSafe(path.join(DATASET_ROOT, 'js', 'parser.js'))
  extractParserSourceLabels(parserText, map)
}

export async function load5etoolsSourceLabels(options: { bustCache?: boolean } = {}) {
  if (cachedLabels && !options.bustCache) return cachedLabels

  const map: Record<string, string> = {
    ...FALLBACK_SOURCE_LABELS
  }

  await loadLabelsFromKnownJsonFiles(map)
  await loadLabelsFromParser(map)

  cachedLabels = Object.fromEntries(
    Object.entries(map)
      .map(([code, label]) => [normalizeSourceCode(code), cleanLabel(label)])
      .filter(([code, label]) => code && label)
      .sort(([a], [b]) => a.localeCompare(b))
  )

  return cachedLabels
}

export function sourceLabelFor(labels: Record<string, string>, source: any) {
  const code = normalizeSourceCode(source)
  return labels[code] || ''
}
