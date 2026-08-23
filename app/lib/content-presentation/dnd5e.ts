// D&D 5e Content Presentation Resolver -- Character Builder / Character
// Sheet Phase 2.
//
// Turns the RAW 5etools JSON a Content Pack stores
// (`ContentPublicationCandidate.data`, which content-pack-5etools-adapter.ts
// sets to the importer's untouched `raw`) into the presentation-ready models
// of ./types.ts.
//
// This module is the ONLY place in the character surfaces that knows a
// 5etools field name exists. Neither app/pages/.../create-v2.vue (Builder)
// nor .../sheet-v2.vue (Sheet) nor ContentPresentationPanel.vue ever sees
// `hd`, `startingProficiencies`, `creatureTypes`, `_versions`, or a
// `{@skill Athletics|XPHB}` tag -- they receive `description`, `facts`, and
// `sections` and render them generically. All translation belongs here.
//
// PURE: no I/O, no Directus, no filesystem, no framework. It reads the bytes
// a bound Content Pack actually published and nothing else -- it must never
// reach back into /opt/eldra/datasets, which does not exist in the runtime
// container and would make presentation depend on the publisher's host.
//
// ---------------------------------------------------------------------------
// MEASURED AGAINST THE REAL XPHB CONTENT PACK
// ---------------------------------------------------------------------------
// Every field read below was verified against the actual XPHB rows the
// published pack contains (10 species, 12 classes, 16 backgrounds). Two
// absences are real, and are REPORTED rather than invented or silently
// dropped:
//
//   1. DESCRIPTIONS. All 10 species / 12 classes / 16 backgrounds carry
//      `hasFluff: true`, but the descriptive prose lives in a SEPARATE file
//      family (fluff-races.json, fluff-backgrounds.json,
//      class/fluff-class-*.json) that the publisher's dataset loader never
//      extracts -- getCollectionKeys('species') returns ['race','species'],
//      so only the stat entry is published. Monsters already solve exactly
//      this split via loadMonsterDatasetEntries' fluff join; species,
//      classes, and backgrounds do not have one yet. Closing it is a Content
//      Platform change plus a pack republish, NOT something a resolver can
//      do -- the bytes are not in the pack.
//
//      `readDescription` below therefore reads a `fluff` join if a pack ever
//      publishes one (the same `.fluff` property the monster loader already
//      attaches), and reports the absence otherwise. No resolver change will
//      be needed the day that join ships.
//
//   2. CLASS FEATURE TEXT. `classFeatures` holds REFERENCE strings
//      ("Fighting Style|Fighter|XPHB|1"); the prose lives in sibling
//      `classFeature[]` arrays in the same files, which
//      getCollectionKeys('classes') -- ['class'] -- never extracts. Feature
//      NAMES and LEVELS are present and genuinely useful (a player can read
//      the whole progression), so those are surfaced and the missing prose
//      is noted.
//
// LANGUAGES are a different case and NOT a gap: 0 of 10 species and 0 of 16
// backgrounds carry `languageProficiencies`, because the 2024 rules moved
// languages off both onto the character. An absent field is simply not
// rendered and earns no note -- nothing is missing. The field IS read, so a
// 2014-era pack (SRD 5.1, where it is populated) renders it correctly.

import type {
  PresentationEntry,
  PresentationFact,
  PresentationKind,
  PresentationSection
} from './types'

// ---------------------------------------------------------------------------
// 5etools text normalization
// ---------------------------------------------------------------------------
// Published text is dense with markup: {@sense Darkvision|XPHB},
// {@item Book|XPHB|Book (prayers)}, {@filter Light|items|property=light}.
//
// A tag's display text is its FIRST pipe-segment, EXCEPT for the reference
// tags below, where a THIRD segment (present only when the author wanted
// different wording) overrides it -- `{@item Arrow|XPHB|20 Arrows}` must
// read "20 Arrows", while `{@feat Magic Initiate|XPHB}` reads "Magic
// Initiate" and must not read "XPHB".
//
// `@filter` is deliberately NOT in this set even though it looks like one:
// its trailing segments are a filter specification, not wording, so
// `{@filter Light|items|type=martial weapon|property=light}` reads "Light".
// Treating it as an override tag renders "property=light" to the player --
// which is exactly what happens on the Monk's and Rogue's weapon
// proficiencies, the only two rows in XPHB that use it.
//
// This repeats a cleaner that already exists in ~7 other files
// (app/lib/importers/5etools-feats.ts, server/api/worlds/[id]/entities/[entityId].get.ts
// and siblings) in two mutually inconsistent forms. It is deliberately NOT
// consolidated here: those are working, deployed code paths in other
// subsystems, and unifying them is a cross-cutting refactor this task has no
// mandate for (CLAUDE.md: do not clean up unrelated duplication
// opportunistically). Recorded as pre-existing debt.
const DISPLAY_OVERRIDE_TAGS = new Set([
  'item', 'spell', 'creature', 'class', 'race', 'skill', 'sense', 'condition',
  'variantrule', 'feat', 'action', 'book', 'classfeature', 'subclassfeature',
  'hazard', 'reward', 'deity', 'language', 'optfeature', 'background'
])

export function cleanText(value: unknown): string {
  let text = String(value ?? '')

  // Resolve {@tag ...} repeatedly so nested tags collapse fully.
  for (let pass = 0; pass < 4 && text.includes('{@'); pass++) {
    text = text.replace(/\{@(\w+)\s+([^{}]*?)\}/g, (_match, tag: string, body: string) => {
      const parts = body.split('|')
      const head = (parts[0] ?? '').trim()

      if (DISPLAY_OVERRIDE_TAGS.has(String(tag).toLowerCase()) && parts.length > 2) {
        const tail = (parts[parts.length - 1] ?? '').trim()
        return tail || head
      }

      return head
    })
  }

  return text
    .replace(/\{@[^}]*\}/g, '')
    .replace(/\{\{[^}]*\}\}/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

// 5etools `entries` are a recursive mix of strings, {type:'entries'},
// {type:'list'}, and {type:'item'}. Flattened to plain paragraphs -- this
// layer renders prose, not a nested document tree, and a player reading a
// species trait does not need the document structure preserved.
function flattenEntries(value: unknown, out: string[] = []): string[] {
  if (value === null || value === undefined) return out

  if (typeof value === 'string' || typeof value === 'number') {
    const text = cleanText(value)
    if (text) out.push(text)
    return out
  }

  if (Array.isArray(value)) {
    for (const item of value) flattenEntries(item, out)
    return out
  }

  if (typeof value !== 'object') return out

  const node = value as Record<string, unknown>

  // {type:'item', name:'Skill Proficiencies:', entry:'...'} -- the shape 2024
  // backgrounds use for their printed summary list. The name is a label for
  // the body, so the two are joined rather than emitted as two paragraphs.
  if (node.name && (node.entry || node.entries)) {
    const label = cleanText(node.name).replace(/:\s*$/, '')
    const body = flattenEntries(node.entry ?? node.entries, []).join(' ')
    if (label && body) out.push(`${label}: ${body}`)
    else if (body) out.push(body)
    return out
  }

  flattenEntries(node.entries ?? node.entry ?? node.items, out)
  return out
}

// ---------------------------------------------------------------------------
// Vocabulary -- 5etools codes to the words a player reads
// ---------------------------------------------------------------------------
// Every map below is a RENAMING, never a derivation: 'M' is displayed as
// 'Medium' and 'cha' as 'Charisma'. No entry encodes a rule.

const SIZE_LABELS: Record<string, string> = {
  T: 'Tiny', S: 'Small', M: 'Medium', L: 'Large', H: 'Huge', G: 'Gargantuan'
}

const ABILITY_LABELS: Record<string, string> = {
  str: 'Strength', dex: 'Dexterity', con: 'Constitution',
  int: 'Intelligence', wis: 'Wisdom', cha: 'Charisma'
}

// 5etools feat categories, as printed in the 2024 book.
const FEAT_CATEGORY_LABELS: Record<string, string> = {
  O: 'Origin', G: 'General', FS: 'Fighting Style', EB: 'Epic Boon'
}

function titleCase(value: string): string {
  return String(value || '')
    .split(/[\s_-]+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
}

function abilityLabel(code: string): string {
  return ABILITY_LABELS[String(code).toLowerCase()] ?? titleCase(code)
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}

// 5etools writes a granted-or-chosen proficiency set as one of four shapes,
// all of which appear in the real XPHB rows:
//   {insight: true, religion: true}                    -- granted outright
//   {choose: {from: [...], count: 2}}                  -- pick N of a list
//   {any: 1}                                           -- pick N of anything
//   {anyFromCategory: {category: ['O'], count: 1}}     -- pick N of a category
// All four become one readable phrase. Nothing is resolved, applied, or
// counted against a character -- this states the offer, exactly as printed.
function describeProficiencyGroup(group: unknown): string {
  if (!group || typeof group !== 'object' || Array.isArray(group)) return ''

  const node = group as Record<string, unknown>
  const parts: string[] = []
  const granted: string[] = []

  for (const [key, raw] of Object.entries(node)) {
    if (raw === false || raw === undefined || raw === null) continue

    if (key === 'choose') {
      const choose = raw as Record<string, unknown>
      const from = asArray(choose.from).map((option) => cleanText(String(option)) || titleCase(String(option)))
      const count = typeof choose.count === 'number' ? choose.count : 1
      if (from.length) {
        parts.push(`Choose ${count} of ${from.map(titleCase).join(', ')}`)
      }
      continue
    }

    if (key === 'anyFromCategory') {
      const spec = raw as Record<string, unknown>
      const count = typeof spec.count === 'number' ? spec.count : 1
      const categories = asArray(spec.category)
        .map((code) => FEAT_CATEGORY_LABELS[String(code)] ?? titleCase(String(code)))
        .filter(Boolean)
      parts.push(categories.length ? `Choose ${count} ${categories.join(' or ')}` : `Choose ${count}`)
      continue
    }

    if (/^any/i.test(key)) {
      const count = typeof raw === 'number' ? raw : 1
      const noun = titleCase(key.replace(/^any/i, '')).trim()
      parts.push(noun ? `Choose any ${count} ${noun}` : `Choose any ${count}`)
      continue
    }

    // A named key is a proficiency granted outright. `key` may itself carry
    // a source suffix ("magic initiate; cleric|xphb").
    granted.push(titleCase(cleanText(String(key).split('|')[0] ?? key)))
  }

  if (granted.length) parts.unshift(granted.join(', '))
  return parts.filter(Boolean).join('; ')
}

function describeProficiencyGroups(value: unknown): string {
  return asArray(value)
    .map(describeProficiencyGroup)
    .filter(Boolean)
    .join('; ')
}

// A mixed array of bare codes ("simple") and prose entries carrying markup
// or a {full/proficiency} wrapper -- both appear in XPHB class rows.
function describeCodeOrProseList(value: unknown): string {
  return asArray(value)
    .map((entry) => {
      if (typeof entry === 'string') {
        // A bare code has no spaces or markup; prose does.
        return /[\s{]/.test(entry) ? cleanText(entry) : titleCase(entry)
      }
      if (entry && typeof entry === 'object') {
        const node = entry as Record<string, unknown>
        return cleanText(node.full ?? node.proficiency ?? '')
      }
      return ''
    })
    .filter(Boolean)
    .join(', ')
}

function fact(label: string, value: string | null | undefined): PresentationFact | null {
  const text = String(value ?? '').trim()
  return text ? { label, value: text } : null
}

function compactFacts(candidates: Array<PresentationFact | null>): PresentationFact[] {
  return candidates.filter((entry): entry is PresentationFact => entry !== null)
}

const NO_DESCRIPTION_NOTE =
  'This Content Pack does not publish descriptive text for this entry. Only what the pack actually contains is shown.'

// The `fluff` join a pack MAY carry -- see this file's MEASURED AGAINST note
// 1. Today no species/class/background pack publishes one, so this returns
// [] and the caller adds NO_DESCRIPTION_NOTE. It is read here rather than
// left for later so that a future publisher-side fluff join needs no change
// on this side at all: the same `.fluff` property the monster dataset loader
// already attaches is understood the day it appears.
function readDescription(raw: Record<string, unknown>): string[] {
  const fluff = raw.fluff as Record<string, unknown> | undefined
  const direct = flattenEntries(fluff?.entries)
  if (direct.length) return direct

  // Some packs may inline description text without a fluff wrapper.
  return flattenEntries(raw.description ?? raw.fluffEntries)
}

// Named prose blocks ({type:'entries', name, entries}) become sections.
// Anonymous or empty blocks are skipped rather than rendered headless.
function sectionsFromEntries(value: unknown): PresentationSection[] {
  const sections: PresentationSection[] = []

  for (const entry of asArray(value)) {
    const node = entry as Record<string, unknown>
    const title = cleanText(node?.name)
    const paragraphs = flattenEntries(node?.entries ?? node?.entry)
    if (title && paragraphs.length) sections.push({ title, paragraphs })
  }

  return sections
}

// ---------------------------------------------------------------------------
// Species
// ---------------------------------------------------------------------------

// 5etools records a species' sub-options ("lineages", "legacies",
// "ancestries" -- the book uses a different word per species) in `_versions`,
// in two forms that both occur in XPHB:
//   {name: 'Elf; Drow Lineage'}                                   -- literal
//   {_abstract: {name: 'Dragonborn ({{color}})'},
//    _implementations: [{_variables: {color: 'Black'}}, ...]}     -- templated
// Both are reduced to the distinguishing part of the name, with the parent
// species' own name stripped off the front. This LISTS what a player may
// choose between; it selects nothing and applies nothing.
function readVariantNames(raw: Record<string, unknown>): string[] {
  const speciesName = cleanText(raw.name)
  const names: string[] = []

  for (const version of asArray(raw._versions)) {
    const node = version as Record<string, unknown>

    if (typeof node?.name === 'string') {
      names.push(node.name)
      continue
    }

    const abstract = node?._abstract as Record<string, unknown> | undefined
    const template = typeof abstract?.name === 'string' ? abstract.name : ''
    if (!template) continue

    for (const implementation of asArray(node._implementations)) {
      const variables = (implementation as Record<string, unknown>)?._variables as Record<string, unknown> | undefined
      if (!variables) continue
      const resolved = template.replace(/\{\{(\w+)\}\}/g, (match, key: string) =>
        variables[key] !== undefined ? String(variables[key]) : match
      )
      if (!resolved.includes('{{')) names.push(resolved)
    }
  }

  return names
    .map((name) => {
      const trimmed = name.replace(/^\s*/, '')
      const withoutParent = speciesName && trimmed.startsWith(speciesName)
        ? trimmed.slice(speciesName.length).replace(/^[;\s]+/, '')
        : trimmed
      return cleanText(withoutParent).replace(/^\((.*)\)$/, '$1').trim()
    })
    .filter(Boolean)
}

function resolveSpecies(raw: Record<string, unknown>): PresentationEntry {
  const sizeLabel = asArray(raw.size)
    .map((code) => SIZE_LABELS[String(code)] ?? String(code))
    .join(' or ')

  // `sizeEntry` carries the book's own fuller wording ("Medium (about 4-5
  // feet tall)") when present; the code list is the fallback.
  const sizeDetail = flattenEntries((raw.sizeEntry as Record<string, unknown>)?.entries).join(' ')

  // `speed` is a plain number on every measured XPHB species, but 5etools
  // also allows {walk, fly, swim, climb, burrow}. Both are RESTATED; neither
  // is turned into movement mechanics.
  let speedLabel = ''
  if (typeof raw.speed === 'number') {
    speedLabel = `${raw.speed} ft.`
  } else if (raw.speed && typeof raw.speed === 'object') {
    speedLabel = Object.entries(raw.speed as Record<string, unknown>)
      .filter(([, value]) => typeof value === 'number' || value === true)
      .map(([mode, value]) => `${titleCase(mode)}${typeof value === 'number' ? ` ${value} ft.` : ''}`)
      .join(', ')
  }

  const senses: string[] = []
  if (typeof raw.darkvision === 'number') senses.push(`Darkvision ${raw.darkvision} ft.`)
  if (typeof raw.blindsight === 'number') senses.push(`Blindsight ${raw.blindsight} ft.`)
  if (typeof raw.truesight === 'number') senses.push(`Truesight ${raw.truesight} ft.`)
  if (typeof raw.tremorsense === 'number') senses.push(`Tremorsense ${raw.tremorsense} ft.`)

  const resistances = asArray(raw.resist)
    .map((entry) => (typeof entry === 'string' ? titleCase(entry) : cleanText((entry as Record<string, unknown>)?.resist)))
    .filter(Boolean)

  const description = readDescription(raw)

  // A species' `entries` ARE its traits -- each a named block with its own
  // prose. This is the richest thing a published species carries.
  const sections = sectionsFromEntries(raw.entries)

  const notes: string[] = []
  if (!description.length) notes.push(NO_DESCRIPTION_NOTE)

  return {
    kind: 'species',
    name: cleanText(raw.name),
    sourceBook: raw.source ? String(raw.source) : undefined,
    sourcePage: raw.page != null ? String(raw.page) : undefined,
    description,
    facts: compactFacts([
      fact('Creature Type', asArray(raw.creatureTypes).map((type) => titleCase(String(type))).join(', ')),
      fact('Size', sizeDetail || sizeLabel),
      fact('Speed', speedLabel),
      fact('Senses', senses.join(', ')),
      fact('Resistances', resistances.join(', ')),
      fact('Variants', readVariantNames(raw).join(', ')),
      fact('Skill Proficiencies', describeProficiencyGroups(raw.skillProficiencies)),
      fact('Tool Proficiencies', describeProficiencyGroups(raw.toolProficiencies)),
      fact('Languages', describeProficiencyGroups(raw.languageProficiencies)),
      fact('Feat', describeProficiencyGroups(raw.feats)),
      fact('Traits', asArray(raw.traitTags).map((tag) => cleanText(String(tag))).join(', '))
    ]),
    sections,
    notes
  }
}

// ---------------------------------------------------------------------------
// Class
// ---------------------------------------------------------------------------

// "Fighting Style|Fighter|XPHB|1" -> { name: 'Fighting Style', level: 1 }
// The 4th segment is the level; entries also appear wrapped as
// {classFeature: '...', gainSubclassFeature: true}.
function parseClassFeatureRef(value: unknown): { name: string; level: number } | null {
  const ref = typeof value === 'string'
    ? value
    : typeof (value as Record<string, unknown>)?.classFeature === 'string'
      ? String((value as Record<string, unknown>).classFeature)
      : ''

  if (!ref) return null

  const parts = ref.split('|')
  const name = (parts[0] ?? '').trim()
  if (!name) return null

  const level = Number(parts[3] ?? parts[parts.length - 1])
  return { name, level: Number.isFinite(level) ? level : 0 }
}

function resolveClass(raw: Record<string, unknown>): PresentationEntry {
  const hd = raw.hd as Record<string, unknown> | undefined
  const hitDie = hd && typeof hd.faces === 'number'
    ? `${typeof hd.number === 'number' && hd.number > 1 ? hd.number : 1}d${hd.faces}`
    : ''

  // [{str:true},{dex:true}] -> "Strength or Dexterity" (a choice between);
  // [{str:true, dex:true}] -> "Strength and Dexterity" (both required).
  // This RESTATES the printed grouping; it picks nothing.
  const primaryAbility = asArray(raw.primaryAbility)
    .map((group) => Object.keys((group as Record<string, unknown>) || {})
      .filter((key) => (group as Record<string, unknown>)[key])
      .map(abilityLabel)
      .join(' and '))
    .filter(Boolean)
    .join(' or ')

  const savingThrows = asArray(raw.proficiency).map((code) => abilityLabel(String(code))).join(', ')

  const starting = (raw.startingProficiencies ?? {}) as Record<string, unknown>

  const armor = describeCodeOrProseList(starting.armor)
  const weapons = describeCodeOrProseList(starting.weapons)
  // Verified against XPHB: `tools` holds the book's own prose ("Choose three
  // Musical Instruments") and `toolProficiencies` the coded form
  // ({anyMusicalInstrument: 3}). Bard, Druid, Monk, and Rogue carry both.
  // Prose wins, because it is already written for a reader.
  const tools = describeCodeOrProseList(starting.tools) || describeProficiencyGroups(starting.toolProficiencies)
  const skills = describeProficiencyGroups(starting.skills)

  // Feat slots the class grants at fixed levels (Fighting Style, Epic Boon).
  const featProgression = asArray(raw.featProgression)
    .map((slot) => {
      const node = slot as Record<string, unknown>
      const name = cleanText(node?.name)
      const levels = Object.keys((node?.progression as Record<string, unknown>) || {})
        .map(Number)
        .filter((level) => Number.isFinite(level))
        .sort((a, b) => a - b)
      if (!name) return ''
      return levels.length ? `${name} (level ${levels.join(', ')})` : name
    })
    .filter(Boolean)
    .join('; ')

  // Feature NAMES and LEVELS only -- the prose is not in the pack. See this
  // file's MEASURED AGAINST note 2.
  const featuresByLevel = new Map<number, string[]>()
  for (const ref of asArray(raw.classFeatures)) {
    const parsed = parseClassFeatureRef(ref)
    if (!parsed) continue
    const bucket = featuresByLevel.get(parsed.level) ?? []
    if (!bucket.includes(parsed.name)) bucket.push(parsed.name)
    featuresByLevel.set(parsed.level, bucket)
  }

  const sections: PresentationSection[] = []

  if (featuresByLevel.size) {
    sections.push({
      title: 'Class Features',
      paragraphs: [...featuresByLevel.entries()]
        .sort((a, b) => a[0] - b[0])
        .map(([level, names]) => `Level ${level}: ${names.join(', ')}`)
    })
  }

  // The book's own printed equipment paragraph ("Choose A, B, or C: ...").
  const startingEquipment = flattenEntries((raw.startingEquipment as Record<string, unknown>)?.entries)
  if (startingEquipment.length) {
    sections.push({ title: 'Starting Equipment', paragraphs: startingEquipment })
  }

  const multiclassing = (raw.multiclassing as Record<string, unknown>)?.proficienciesGained as Record<string, unknown> | undefined
  if (multiclassing) {
    const gained = compactFacts([
      fact('Armor', describeCodeOrProseList(multiclassing.armor)),
      fact('Weapons', describeCodeOrProseList(multiclassing.weapons)),
      fact('Tools', describeCodeOrProseList(multiclassing.tools) || describeProficiencyGroups(multiclassing.toolProficiencies)),
      fact('Skills', describeProficiencyGroups(multiclassing.skills))
    ])
    if (gained.length) {
      sections.push({
        title: 'Multiclassing Proficiencies',
        paragraphs: gained.map((entry) => `${entry.label}: ${entry.value}`)
      })
    }
  }

  const description = readDescription(raw)

  const notes: string[] = []
  if (!description.length) notes.push(NO_DESCRIPTION_NOTE)
  if (featuresByLevel.size) {
    notes.push('This Content Pack publishes class feature names and the level each is gained, but not their rules text.')
  }

  return {
    kind: 'class',
    name: cleanText(raw.name),
    sourceBook: raw.source ? String(raw.source) : undefined,
    sourcePage: raw.page != null ? String(raw.page) : undefined,
    description,
    facts: compactFacts([
      fact('Hit Die', hitDie),
      fact('Primary Ability', primaryAbility),
      fact('Saving Throw Proficiencies', savingThrows),
      fact('Armor Training', armor),
      fact('Weapon Proficiencies', weapons),
      fact('Tool Proficiencies', tools),
      fact('Skill Choices', skills),
      fact('Spellcasting Ability', raw.spellcastingAbility ? abilityLabel(String(raw.spellcastingAbility)) : ''),
      fact('Feats Granted', featProgression),
      fact('Subclass', cleanText(raw.subclassTitle))
    ]),
    sections,
    notes
  }
}

// ---------------------------------------------------------------------------
// Background
// ---------------------------------------------------------------------------

// 2024 backgrounds print a summary list whose items are exactly the fields a
// player needs -- {name: 'Equipment:', entry: '...'}. The structured
// `startingEquipment` beside it is item-code data ({item: 'robe|xphb'},
// {value: 800}) whose faithful rendering would mean interpreting currency
// and item references. The printed line is both richer and already written
// for a reader, so it is preferred wherever it exists.
function readPrintedItem(raw: Record<string, unknown>, label: string): string {
  for (const entry of asArray(raw.entries)) {
    for (const item of asArray((entry as Record<string, unknown>)?.items)) {
      const node = item as Record<string, unknown>
      const name = cleanText(node?.name).replace(/:\s*$/, '')
      if (name.toLowerCase() === label.toLowerCase()) {
        return flattenEntries(node?.entry ?? node?.entries).join(' ')
      }
    }
  }
  return ''
}

function resolveBackground(raw: Record<string, unknown>): PresentationEntry {
  const skills = describeProficiencyGroups(raw.skillProficiencies)
  const tools = describeProficiencyGroups(raw.toolProficiencies)
  const languages = describeProficiencyGroups(raw.languageProficiencies)

  // 2024 backgrounds grant an Origin Feat: [{'magic initiate; cleric|xphb': true}].
  // The printed line ("Magic Initiate (Cleric)") is preferred over the key.
  const originFeat = readPrintedItem(raw, 'Feat') || describeProficiencyGroups(raw.feats)

  // Ability options are DISPLAYED because the book prints them. No score is
  // computed, chosen, or applied -- ability scores are a later phase.
  const abilityOptions = readPrintedItem(raw, 'Ability Scores') || [...new Set(
    asArray(raw.ability).flatMap((group) => {
      const choose = (group as Record<string, unknown>)?.choose as Record<string, unknown> | undefined
      const from = (choose?.weighted as Record<string, unknown>)?.from ?? choose?.from
      return asArray(from).map((code) => abilityLabel(String(code)))
    })
  )].join(', ')

  const equipment = readPrintedItem(raw, 'Equipment')

  const description = readDescription(raw)

  const sections: PresentationSection[] = []
  if (equipment) sections.push({ title: 'Equipment', paragraphs: [equipment] })

  // Any named prose blocks beyond the printed summary list (2014-era
  // backgrounds carry feature/personality-trait blocks here).
  for (const section of sectionsFromEntries(raw.entries)) {
    sections.push(section)
  }

  const notes: string[] = []
  if (!description.length) notes.push(NO_DESCRIPTION_NOTE)

  return {
    kind: 'background',
    name: cleanText(raw.name),
    sourceBook: raw.source ? String(raw.source) : undefined,
    sourcePage: raw.page != null ? String(raw.page) : undefined,
    description,
    facts: compactFacts([
      fact('Ability Scores', abilityOptions),
      fact('Origin Feat', originFeat),
      fact('Skill Proficiencies', skills || readPrintedItem(raw, 'Skill Proficiencies')),
      fact('Tool Proficiencies', tools || readPrintedItem(raw, 'Tool Proficiency')),
      fact('Languages', languages)
    ]),
    sections,
    notes
  }
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

// Pure: raw pack data in, presentation model out. Returns null only when the
// data is unusable (absent, or not a JSON object), which consumers render as
// "no details published" rather than as an error -- an unreadable entry must
// never break a Builder that is otherwise working.
export function resolveDnd5ePresentation(kind: PresentationKind, data: unknown): PresentationEntry | null {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return null

  const raw = data as Record<string, unknown>

  if (kind === 'species') return resolveSpecies(raw)
  if (kind === 'class') return resolveClass(raw)
  return resolveBackground(raw)
}
