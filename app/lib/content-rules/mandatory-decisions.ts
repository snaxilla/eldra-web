// D&D 2024 Character Rules -- STRUCTURAL MANDATORY-DECISION DISCOVERY (Phase 0).
//
// Discovers every character-building decision an XPHB record asks for, from the
// corpus's own structure (5etools JSON), not from the ledger and not from the
// Builder. The ledger (`dnd5e-2024-progression-coverage.ts`) is an accountability
// contract that cross-checks this output; it is never the discovery authority.
//
// Pure: no I/O, no Vue, no Directus. The generator
// (`scripts/content-rules/generate-mandatory-decisions.ts`) feeds it the real corpus
// and writes `dnd5e-2024-mandatory-decisions.json`, which the server authority reads.
// A drift test fails if the committed artifact no longer matches the corpus.
//
// SIGNAL ORDER (structure first; phrase only where no structure exists):
//   1. `{ "type": "options", ... }` blocks over features (refClassFeature / refFeat).
//   2. Choice fields: `choose` / `any` in proficiency, tool, weapon, armor, skill,
//      resist, weighted ability, `additionalSpells` variants and entries, startingEquipment
//      A/B, and `feats: [{anyFromCategory}]`.
//   3. Table columns (`classTableGroups`) whose value rises by level (spell counts,
//      Invocations, Weapon Mastery).
//   4. Feature tags: `{@filter ...|feats|category=X}`, `{@filter ...|optionalfeatures|...}`,
//      `{@5etools feat|feats.html}`, `{@variantrule Expertise}`.
//   5. PHRASE, only where no structured field exists. Every phrase rule is named in
//      the code below with a `PHRASE` comment.
//
// MANDATORY vs OPTIONAL: a clause that lets the player REPLACE or CHANGE an answer
// already given is recorded as an OPTIONAL `replacement` surface (mandatory: false).
// It never blocks legality. Per-use triggers ("Whenever you activate...") are runtime
// effects: a feature that opens with one produces no decision.

export type DecisionOwnerKind = 'class' | 'subclass' | 'species' | 'background' | 'feat'

export type DecisionFamily =
  | 'feature-option'
  | 'accumulating-option'
  | 'spell-choice'
  | 'spell-count'
  | 'spell-grant'
  | 'proficiency-choice'
  | 'proficiency-grant'
  | 'feat-grant'
  | 'skill-choice'
  | 'expertise-choice'
  | 'weapon-mastery'
  | 'feat-choice'
  | 'ability-distribution'
  | 'variant-choice'
  | 'damage-type-choice'
  | 'subclass-selection'
  | 'equipment-package'
  | 'language-choice'
  | 'replacement'

export type DecisionRecord = {
  id: string
  owner: { kind: DecisionOwnerKind, slug: string, name: string }
  // For a feat GRANTED by a background or species: the grantor's owner slug.
  grantedBy?: string
  level: number
  timing: 'creation' | 'progression'
  family: DecisionFamily
  mandatory: boolean
  cardinality: number | null
  // Corpus identity of the surface: feature name, table column, or field path.
  source: string
  detail?: string
}

// Minimal structural views of the corpus records (only the fields read here).
export type RawEntryNode = unknown
export type RawFeature = { name: string, level: number, entries?: RawEntryNode[] }
export type RawSubclassFeature = { name: string, level: number, entries?: RawEntryNode[], className: string, subclassShortName: string }
export type RawSubclass = { name: string, shortName: string, className: string, additionalSpells?: unknown[], casterProgression?: string }
export type RawClass = {
  name: string
  startingProficiencies?: Record<string, unknown>
  startingEquipment?: unknown
  classTableGroups?: { colLabels?: string[], rows?: unknown[][] }[]
}
export type RawRace = { name: string, resist?: unknown[], skillProficiencies?: unknown[], additionalSpells?: unknown[], feats?: unknown[], entries?: RawEntryNode[] }
export type RawBackground = { name: string, feats?: Record<string, boolean>[], ability?: unknown[], toolProficiencies?: Record<string, unknown>[], startingEquipment?: unknown }
export type RawFeat = {
  name: string
  additionalSpells?: unknown[]
  skillProficiencies?: unknown[]
  toolProficiencies?: unknown[]
  weaponProficiencies?: unknown[]
  armorProficiencies?: unknown[]
  skillToolLanguageProficiency?: unknown[]
}

export type RawCorpus = {
  classes: { cls: RawClass, features: RawFeature[], subclasses: RawSubclass[], subclassFeatures: RawSubclassFeature[] }[]
  races: RawRace[]
  backgrounds: RawBackground[]
  feats: RawFeat[]
}

const NUMBER_WORDS: Record<string, number> = { a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6 }

export function slugOf(name: string): string {
  return name.toLowerCase().replace(/'/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

// Owner slugs follow the catalogue convention: `<name>-xphb` (classes, species, backgrounds, feats, subclasses).
export function ownerSlugOf(name: string): string {
  return `${slugOf(name)}-xphb`
}

// A subclass takes the catalogue slug of its own full name, the same formula
// `app/lib/importers/5etools-subclasses.ts` uses for the persisted subclassRef.
export function subclassSlugOf(subclassName: string): string {
  return ownerSlugOf(subclassName)
}

function rawText(node: unknown): string {
  return JSON.stringify(node ?? '')
}

// Concatenated string values of a corpus subtree (structure removed, tags kept).
function flatStrings(node: unknown): string {
  if (typeof node === 'string') return node
  if (Array.isArray(node)) return node.map(flatStrings).join(' ')
  if (node && typeof node === 'object') return Object.values(node as Record<string, unknown>).map(flatStrings).join(' ')
  return ''
}

// 5etools `{@tag text|...}` markup reduced to display text, over the flattened strings.
export function plainText(node: unknown): string {
  return flatStrings(node).replace(/\{@\w+ ([^}|]+)[^}]*\}/g, '$1')
}

// Table labels keep their pipe-delimited structure: `{@filter Cantrips|spells|level=0}` -> `Cantrips|spells|level=0`.
function labelText(label: unknown): string {
  return flatStrings(label).replace(/\{@\w+ ([^}]*)\}/g, '$1')
}

function numberOf(word: string | undefined): number | null {
  if (!word) return null
  return NUMBER_WORDS[word.toLowerCase()] ?? null
}

// Visits every object node of a corpus subtree.
function walk(node: unknown, visit: (n: Record<string, any>) => void): void {
  if (Array.isArray(node)) {
    for (const child of node) walk(child, visit)
    return
  }
  if (node && typeof node === 'object') {
    visit(node as Record<string, any>)
    for (const value of Object.values(node as Record<string, unknown>)) walk(value, visit)
  }
}

function decisionId(owner: DecisionRecord['owner'], grantedBy: string | undefined, level: number, family: DecisionFamily, source: string): string {
  const granted = grantedBy ? `@${grantedBy}` : ''
  return `${owner.kind}:${owner.slug}${granted}:L${level}:${family}:${slugOf(source)}`
}

function make(
  owner: DecisionRecord['owner'],
  level: number,
  family: DecisionFamily,
  source: string,
  cardinality: number | null,
  options: { mandatory?: boolean, grantedBy?: string, detail?: string } = {}
): DecisionRecord {
  return {
    id: decisionId(owner, options.grantedBy, level, family, source),
    owner,
    ...(options.grantedBy ? { grantedBy: options.grantedBy } : {}),
    level,
    timing: level <= 1 ? 'creation' : 'progression',
    family,
    mandatory: options.mandatory ?? family !== 'replacement',
    cardinality,
    source,
    ...(options.detail ? { detail: options.detail } : {})
  }
}

// ---------------------------------------------------------------------------
// Feature text: one feature may carry several independent decisions.
// ---------------------------------------------------------------------------

// "can replace" / "can change" / "whenever you ... change|replace": an optional re-answer.
const REPLACE_CLAUSE = /\b(?:you can|you may) (?:replace|change)\b|can change (?:your|one|the)|whenever you (?:replace|change)/i
// A feature whose first sentence is a per-use trigger describes a runtime effect.
const PER_USE_TRIGGER = /^(?:whenever you|when you|once on each|as a bonus action|as a reaction|immediately after|on each of your turns)/i

function featureDecisions(
  feature: { name: string, level: number, entries?: RawEntryNode[] },
  owner: DecisionRecord['owner'],
  out: DecisionRecord[],
  tableCountsOptionalFeatures = false,
  structuralSpellChoices = false
): void {
  const raw = rawText(feature.entries)
  const plain = plainText(feature.entries)
  const level = feature.level
  const source = feature.name

  if (REPLACE_CLAUSE.test(plain)) {
    out.push(make(owner, level, 'replacement', source, null, { mandatory: false, detail: 'optional re-answer clause' }))
  }

  const firstSentence = (plain.split(/(?<=\.)\s/)[0] ?? '').trim()
  if (PER_USE_TRIGGER.test(firstSentence)) return

  // Explicit options block over features (structure). An options block over
  // OPTIONALFEATURES is a catalogue, not a decision of its own.
  let hasOptionsDecision = false
  walk(feature.entries, (node) => {
    if (node.type !== 'options' || !Array.isArray(node.entries)) return
    const refs = node.entries as Record<string, unknown>[]
    if (refs.some((r) => r?.type === 'refClassFeature' || r?.type === 'refFeat' || r?.type === 'refSubclassFeature')) {
      hasOptionsDecision = true
      out.push(make(owner, level, 'feature-option', source, typeof node.count === 'number' ? node.count : 1))
    }
  })

  // Feat choices, from category filter or any-feat tag (structure).
  const categoryFilter = /\{@filter [^}]*\|feats\|category=([A-Za-z:]+)\}/.exec(raw)
  if (categoryFilter && /of your choice|another/.test(plain)) {
    out.push(make(owner, level, 'feat-choice', source, 1, { detail: `category=${categoryFilter[1]}` }))
  } else if (/\{@5etools feat\|feats\.html\}/.test(raw) && /of your choice/.test(plain)) {
    out.push(make(owner, level, 'feat-choice', source, 1, { detail: 'any' }))
  }

  // Expertise (structure: variantrule tag; count from the number word).
  if (/\{@variantrule Expertise\|XPHB\}/.test(raw)) {
    const n = /(?:in|choose) (one|two|three)\b/i.exec(plain)
    if (/Choose one of your skill proficiencies with which you lack Expertise/i.test(plain)) {
      // PHRASE handled below (Ranger Deft Explorer): one decision, not two.
    } else if (/Choose one of the following skills/i.test(plain)) {
      out.push(make(owner, level, 'expertise-choice', source, 1, { detail: 'choose-one-of-following-skills' }))
    } else if (/(?:in|choose|lack) (?:one|two|three|a|an)? ?(?:more )?(?:of your )?skill/i.test(plain)) {
      out.push(make(owner, level, 'expertise-choice', source, numberOf(n?.[1]) ?? 1))
    }
  }
  // PHRASE: Ranger Deft Explorer -- no expertise tag; the sentence is the only surface.
  if (/Choose one of your skill proficiencies with which you lack Expertise/i.test(plain)) {
    out.push(make(owner, level, 'expertise-choice', source, 1, { detail: 'phrase' }))
  }

  // Accumulating options from an optionalfeatures filter (structure) with a count word.
  // A class whose table already counts an optionalfeatures column (Warlock Invocations) is
  // judged by that column; the feature-level filter would count the same picks twice.
  let accumulating = false
  if (!tableCountsOptionalFeatures && /\{@filter [^}]*\|optionalfeatures\|/.test(raw)) {
    const n = /(?:learn|gain|choose) (one|two|three|four|five|six|a|an)\b[^.]*of your choice/i.exec(plain)
    if (n) {
      out.push(make(owner, level, 'accumulating-option', source, numberOf(n[1]) ?? 1, { detail: 'optionalfeatures' }))
      accumulating = true
    }
  }
  // PHRASE: "gain two Metamagic options of your choice from the ... section" (no filter tag).
  const sectionOptions = /gain (one|two|three|four|five|six) \w+ options? of your choice from/i.exec(plain)
  if (sectionOptions && !accumulating) {
    out.push(make(owner, level, 'accumulating-option', source, numberOf(sectionOptions[1]), { detail: 'phrase' }))
  }

  // Named-child option lists and refClassFeature option phrases, when no options block exists.
  const followingOptions = /(?:gain|choose) one of the following (?:feature )?options of your choice/i.test(plain)
  // Named option entries, at any depth (Aspect of the Wilds lists them directly; Defensive Tactics wraps them).
  let namedChildren = 0
  walk(feature.entries, (node) => {
    if (node.type === 'entries' && typeof node.name === 'string') namedChildren++
  })
  if (!hasOptionsDecision && followingOptions && (namedChildren >= 2 || /refClassFeature/.test(raw))) {
    out.push(make(owner, level, 'feature-option', source, 1, { detail: namedChildren >= 2 ? 'named-children' : 'refClassFeature' }))
  }

  // Skill proficiency of your choice ("another skill of your choice").
  if (/proficiency in another skill of your choice/i.test(plain)) {
    out.push(make(owner, level, 'skill-choice', source, 1))
  }
  // Saving-throw proficiency chosen ("... saving throws (your choice)").
  if (/proficiency in [^.]*saving throws \(your choice\)/i.test(plain)) {
    out.push(make(owner, level, 'proficiency-choice', source, 1, { detail: 'saving-throw' }))
  }

  // Spell choices. PHRASE: "Choose one level 6 Warlock spell", "Choose a level 1 and a level 2
  // spell in your spellbook", "Choose two level 3 spells in your spellbook".
  // The noun must be "spell(s)" itself: "spell's level" is not a choice of a spell.
  const spellChoice = /choose (one|two|three|a|an) [^.]{0,60}?spells?(?![\w'])/i.exec(plain)
  if (spellChoice && !structuralSpellChoices) {
    const levels = [...spellChoice[0].matchAll(/level (\d+)/gi)]
    const card = levels.length > 1 ? levels.length : (numberOf(spellChoice[1]) ?? 1)
    out.push(make(owner, level, 'spell-choice', source, card, { detail: levels[0] ? `spell-level=${levels[0][1]}` : 'any-level' }))
  }
  // PHRASE: Warlock Mystic Arcanum after the first -- "You gain a level 7 Warlock Spell of your choice."
  const gained = /gain an? level (\d+) [^.]{0,25}?spell of your choice/i.exec(plain)
  if (gained) out.push(make(owner, level, 'spell-choice', source, 1, { detail: `spell-level=${gained[1]}` }))
  // PHRASE: the starting spellbook ("It starts with six level 1 Wizard spells of your choice").
  const starting = /starts with (one|two|three|four|five|six) level \d+ \w+ spells? of your choice/i.exec(plain)
  if (starting) out.push(make(owner, level, 'spell-choice', source, numberOf(starting[1]) ?? 1, { detail: 'starting-spellbook' }))
  // PHRASE: spellbook growth ("Whenever you gain a Wizard level after 1, add two Wizard spells of your choice").
  // Each level from 2 to 20 is its own mandatory decision.
  const growth = /Whenever you gain an? \w+ level after 1, add (one|two|three|four|five|six) \w+ spells? of your choice/i.exec(plain)
  if (growth) {
    for (let gained = 2; gained <= 20; gained++) {
      out.push(make(owner, gained, 'spell-choice', source, numberOf(growth[1]) ?? 1, { detail: 'spellbook-growth' }))
    }
  }
  // PHRASE: Bard Magical Secrets. The count is the prepared-spell increase, not a number here.
  if (/you can choose any of your new prepared spells/i.test(plain)) {
    out.push(make(owner, level, 'spell-choice', source, null, { detail: 'broad-list prepared increase' }))
  }

  // Damage type. PHRASE: "Choose one of those types".
  if (/choose one of (?:those|the following) (?:damage )?types/i.test(plain)) {
    out.push(make(owner, level, 'damage-type-choice', source, 1))
  }

  // Languages. PHRASE: "one other language of your choice", "two languages of your choice".
  const language = /(one|two) (?:other )?languages? of your choice/i.exec(plain)
  if (language) out.push(make(owner, level, 'language-choice', source, numberOf(language[1]) ?? 1))
}

// ---------------------------------------------------------------------------
// Spell grants: `additionalSpells` blocks (species, subclass, feat).
// ---------------------------------------------------------------------------

// Named variants (lineage, legacy, circle terrain) are one variant-choice. Fixed spells are
// spell-grants. `choose` and `all` entries are spell-choices. Each level stays addressable.
function spellGrantDecisions(
  blocks: unknown[],
  owner: DecisionRecord['owner'],
  out: DecisionRecord[],
  context: string,
  defaultLevel: number,
  grantedBy?: string
): void {
  if (blocks.length === 0) return
  const named = blocks.filter((b) => b && typeof b === 'object' && typeof (b as any).name === 'string')
  if (named.length >= 2) {
    const levels = blocks.flatMap((b) => Object.keys(((b as any).known ?? (b as any).prepared ?? (b as any).innate ?? {}) as object).map(Number))
    const level = levels.length > 0 ? Math.min(...levels) : defaultLevel
    out.push(make(owner, level, 'variant-choice', `${context}.additionalSpells.variants`, 1, { grantedBy }))
    return
  }
  for (const block of blocks) {
    if (!block || typeof block !== 'object') continue
    for (const kind of ['known', 'prepared', 'innate', 'expanded'] as const) {
      const byLevel = (block as Record<string, any>)[kind]
      if (!byLevel || typeof byLevel !== 'object') continue
      for (const [lvl, items] of Object.entries(byLevel as Record<string, unknown>)) {
        // Innate spells nest their uses ("daily": {"1e": [...]}); the leaves are the spells.
        const leaves = leavesOf(items)
        // A numeric key is a character level for subclass and species grants. A feat's key is
        // a use-count or "_" and the grant is made when the feat is acquired.
        const level = /^\d+$/.test(lvl) && context !== 'feat' ? Number(lvl) : defaultLevel
        const choices = leaves.filter((i) => i && typeof i === 'object' && ('choose' in (i as object) || 'all' in (i as object))).length
        const fixed = leaves.filter((i) => typeof i === 'string').length
        if (choices > 0) out.push(make(owner, level, 'spell-choice', `${context}.additionalSpells.${kind}`, choices, { grantedBy }))
        if (fixed > 0) out.push(make(owner, level, 'spell-grant', `${context}.additionalSpells.${kind}`, fixed, { grantedBy }))
      }
    }
  }
}

// The spells of a grant, with its use-count and nesting structure removed. A `choose` or `all`
// object is a leaf: it is one pick, not a container.
function leavesOf(node: unknown): unknown[] {
  if (Array.isArray(node)) return node.flatMap(leavesOf)
  if (node && typeof node === 'object' && !('choose' in (node as object)) && !('all' in (node as object))) {
    return Object.values(node as Record<string, unknown>).flatMap(leavesOf)
  }
  return [node]
}

// ---------------------------------------------------------------------------
// Class decisions.
// ---------------------------------------------------------------------------

function startingProficiencyDecisions(cls: RawClass, owner: DecisionRecord['owner'], out: DecisionRecord[]): void {
  const sp = cls.startingProficiencies ?? {}
  for (const entry of (sp.skills as unknown[] | undefined) ?? []) {
    const choose = entry && typeof entry === 'object' ? ((entry as any).choose ?? null) : null
    const any = entry && typeof entry === 'object' ? (entry as any).any : undefined
    if (choose || typeof any === 'number') {
      out.push(make(owner, 1, 'skill-choice', 'startingProficiencies.skills', choose?.count ?? any ?? 1))
    }
  }
  for (const t of (sp.tools as unknown[] | undefined) ?? []) {
    const text = typeof t === 'string' ? t : plainText(t)
    if (/^Choose/i.test(text)) {
      const n = /^Choose (one|two|three|four)/i.exec(text)
      out.push(make(owner, 1, 'proficiency-choice', `startingProficiencies.tools:${text.slice(0, 40)}`, numberOf(n?.[1]) ?? 1))
    } else {
      out.push(make(owner, 1, 'proficiency-grant', `startingProficiencies.tools:${text.slice(0, 40)}`, 1))
    }
  }
  for (const key of ['weapons', 'armor'] as const) {
    const list = sp[key] as unknown[] | undefined
    if (Array.isArray(list) && list.length > 0) out.push(make(owner, 1, 'proficiency-grant', `startingProficiencies.${key}`, null))
  }
}

// Table columns whose value rises by level. Counts are the per-level DELTA, so a
// level-up's required additions are exactly the decisions it contains.
function tableCountDecisions(cls: RawClass, owner: DecisionRecord['owner'], out: DecisionRecord[]): { hasWeaponMasteryTable: boolean } {
  let hasWeaponMasteryTable = false
  for (const group of cls.classTableGroups ?? []) {
    const rawLabels = group.colLabels ?? []
    rawLabels.forEach((rawLabel, col) => {
      const label = labelText(rawLabel)
      let family: DecisionFamily | null = null
      let source = ''
      let detail = ''
      if (/^Cantrips\|spells\|level=0/.test(label)) { family = 'spell-count'; source = 'Cantrips'; detail = 'cantrips' }
      else if (/^Prepared Spells\|spells\|level=!0/.test(label)) { family = 'spell-count'; source = 'Prepared Spells'; detail = 'prepared' }
      else if (/^Invocations\|optionalfeatures/.test(label)) { family = 'accumulating-option'; source = 'Invocations'; detail = 'optionalfeatures' }
      else if (label === 'Weapon Mastery') { family = 'weapon-mastery'; source = 'Weapon Mastery'; detail = 'table'; hasWeaponMasteryTable = true }
      if (!family) return
      let previous = 0
      for (const [index, row] of (group.rows ?? []).entries()) {
        const value = Number((row as unknown[])[col])
        if (!Number.isFinite(value)) continue
        const delta = value - previous
        previous = value
        if (delta > 0) out.push(make(owner, index + 1, family, source, delta, { detail }))
      }
    })
  }
  return { hasWeaponMasteryTable }
}

export function detectClassDecisions(
  cls: RawClass,
  features: RawFeature[],
  subclasses: RawSubclass[],
  subclassFeatures: RawSubclassFeature[]
): DecisionRecord[] {
  const owner = { kind: 'class' as const, slug: ownerSlugOf(cls.name), name: cls.name }
  const out: DecisionRecord[] = []
  startingProficiencyDecisions(cls, owner, out)
  const { hasWeaponMasteryTable } = tableCountDecisions(cls, owner, out)
  const tableCountsOptionalFeatures = (cls.classTableGroups ?? []).some((g) => (g.colLabels ?? []).some((l) => /^'?\{?@?\w*\s?Invocations\|optionalfeatures|^Invocations\|optionalfeatures/.test(labelText(l))))
  if (cls.startingEquipment) out.push(make(owner, 1, 'equipment-package', 'startingEquipment', 1))

  // Subclass selection: the level at which subclass features begin (structure).
  if (subclasses.length > 0 && subclassFeatures.length > 0) {
    out.push(make(owner, Math.min(...subclassFeatures.map((f) => f.level)), 'subclass-selection', 'subclass', 1))
  }

  for (const feature of features) {
    if (feature.name === 'Ability Score Improvement') {
      out.push(make(owner, feature.level, 'feat-choice', feature.name, 1, { detail: 'asi' }))
      continue
    }
    if (feature.name === 'Weapon Mastery' && !hasWeaponMasteryTable) {
      // PHRASE: the kind count is only in the feature text for Paladin, Ranger, and Rogue.
      const n = /weapon mastery properties of (one|two|three|four|five|six) kinds?/i.exec(plainText(feature.entries))
      out.push(make(owner, feature.level, 'weapon-mastery', 'Weapon Mastery', numberOf(n?.[1]) ?? 1, { detail: 'feature-text' }))
    }
    featureDecisions(feature, owner, out, tableCountsOptionalFeatures)
  }

  for (const sub of subclasses) {
    const features = subclassFeatures.filter((f) => f.className === sub.className && f.subclassShortName === sub.shortName)
    subclassDecisions(sub, features, out)
  }
  return out
}

function subclassDecisions(sub: RawSubclass, features: RawSubclassFeature[], out: DecisionRecord[]): void {
  const owner = { kind: 'subclass' as const, slug: subclassSlugOf(sub.name), name: sub.name }
  // A subclass whose spell choices are structural (additionalSpells choose entries) is judged by
  // that structure; the feature text describing the same picks is not a second decision.
  const structural = JSON.stringify(sub.additionalSpells ?? []).match(/"(?:choose|all)"/) !== null
  for (const feature of features) featureDecisions(feature, owner, out, false, structural)
  const firstLevel = features.length > 0 ? Math.min(...features.map((f) => f.level)) : 3
  spellGrantDecisions(sub.additionalSpells ?? [], owner, out, 'subclass', firstLevel)
  if (sub.casterProgression) {
    // Subclass-only casting (third-caster progression) requires its own slot table.
    out.push(make(owner, 3, 'spell-count', `casterProgression:${sub.casterProgression}`, null, { detail: 'subclass-caster' }))
  }
}

// ---------------------------------------------------------------------------
// Species, backgrounds, feats.
// ---------------------------------------------------------------------------

export function detectSpeciesDecisions(race: RawRace): DecisionRecord[] {
  const owner = { kind: 'species' as const, slug: ownerSlugOf(race.name), name: race.name }
  const out: DecisionRecord[] = []
  for (const r of race.resist ?? []) {
    if (r && typeof r === 'object' && 'choose' in (r as object)) out.push(make(owner, 1, 'damage-type-choice', 'resist', 1))
  }
  for (const s of race.skillProficiencies ?? []) {
    if (!s || typeof s !== 'object') continue
    if ('choose' in (s as object)) out.push(make(owner, 1, 'skill-choice', 'skillProficiencies', (s as any).choose?.count ?? 1))
    else if (typeof (s as any).any === 'number') out.push(make(owner, 1, 'skill-choice', 'skillProficiencies', (s as any).any))
  }
  spellGrantDecisions(race.additionalSpells ?? [], owner, out, 'species', 1)
  for (const f of race.feats ?? []) {
    if (f && typeof f === 'object' && 'anyFromCategory' in (f as object)) {
      const cat = (f as any).anyFromCategory
      out.push(make(owner, 1, 'feat-choice', 'feats.anyFromCategory', typeof cat?.count === 'number' ? cat.count : 1, { detail: `category=${(cat?.category ?? []).join(',')}` }))
    }
  }
  // PHRASE: named lineage, ancestry, or benefit blocks chosen from a list ("Choose one of the following").
  walk(race.entries, (node) => {
    if (node.type !== 'entries' || typeof node.name !== 'string') return
    if (!/Lineage|Ancestry/i.test(node.name)) return
    if (/Choose one of the following/i.test(plainText(node.entries))) out.push(make(owner, 1, 'variant-choice', node.name, 1))
  })
  // PHRASE: species language grants (the corpus has no structured language field).
  const language = /(one|two) (?:other )?languages? of your choice/i.exec(plainText(race.entries))
  if (language) out.push(make(owner, 1, 'language-choice', 'entries', numberOf(language[1]) ?? 1))
  return out
}

// Background decisions, plus the decisions of the feats it grants (attributed to the background).
export function detectBackgroundDecisions(bg: RawBackground, featsByName: ReadonlyMap<string, RawFeat> = new Map()): DecisionRecord[] {
  const owner = { kind: 'background' as const, slug: ownerSlugOf(bg.name), name: bg.name }
  const out: DecisionRecord[] = []
  for (const block of bg.toolProficiencies ?? []) {
    for (const [key, value] of Object.entries(block)) {
      if (/^any/.test(key)) out.push(make(owner, 1, 'proficiency-choice', `toolProficiencies.${key}`, typeof value === 'number' ? value : 1))
      else out.push(make(owner, 1, 'proficiency-grant', `toolProficiencies.${key}`, 1))
    }
  }
  const abilityChoices = (bg.ability ?? []).filter((a) => a && typeof a === 'object' && 'choose' in (a as object))
  if (abilityChoices.length > 0) out.push(make(owner, 1, 'ability-distribution', 'ability', abilityChoices.length))
  for (const entry of bg.feats ?? []) {
    for (const key of Object.keys(entry)) {
      const featName = (key.split('|')[0] ?? key).split(';')[0]!.trim().toLowerCase()
      // A fixed feat grant is itself a mandatory acquisition (classified by the coverage rules).
      out.push(make(owner, 1, 'feat-grant', featName, 1))
      const feat = featsByName.get(featName)
      if (!feat) continue
      for (const d of detectFeatDecisions(feat)) {
        out.push({ ...d, grantedBy: owner.slug, timing: 'creation', level: 1, id: decisionId(d.owner, owner.slug, 1, d.family, d.source) })
      }
    }
  }
  if (bg.startingEquipment) out.push(make(owner, 1, 'equipment-package', 'startingEquipment', 1))
  return out
}

export function detectFeatDecisions(feat: RawFeat): DecisionRecord[] {
  const owner = { kind: 'feat' as const, slug: ownerSlugOf(feat.name), name: feat.name }
  const out: DecisionRecord[] = []
  spellGrantDecisions(feat.additionalSpells ?? [], owner, out, 'feat', 1)
  for (const t of feat.toolProficiencies ?? []) {
    if (!t || typeof t !== 'object') continue
    // `{anyArtisansTool: n}` / `{anyMusicalInstrument: n}` are choices; `{"chef's tools": true}` is a fixed grant.
    for (const [key, value] of Object.entries(t as Record<string, unknown>)) {
      if ('choose' === key || /^any/.test(key)) {
        out.push(make(owner, 1, 'proficiency-choice', `toolProficiencies.${key}`, typeof value === 'number' ? value : 1))
      } else if (key !== 'choose') {
        out.push(make(owner, 1, 'proficiency-grant', `toolProficiencies.${key}`, 1))
      }
    }
  }
  // Armor and weapon proficiency: a `choose` is a choice; any other entry is a fixed grant.
  for (const key of ['weaponProficiencies', 'armorProficiencies'] as const) {
    const entries = (feat[key] ?? []) as unknown[]
    if (entries.some((p) => p && typeof p === 'object' && 'choose' in (p as object))) out.push(make(owner, 1, 'proficiency-choice', `${key}.choose`, 1))
    if (entries.some((p) => !(p && typeof p === 'object' && 'choose' in (p as object)))) out.push(make(owner, 1, 'proficiency-grant', key, 1))
  }
  for (const s of feat.skillProficiencies ?? []) {
    if (!s || typeof s !== 'object') continue
    if ('choose' in (s as object)) out.push(make(owner, 1, 'proficiency-choice', 'skillProficiencies.choose', (s as any).choose?.count ?? 1, { detail: 'skill' }))
    else if (typeof (s as any).any === 'number') out.push(make(owner, 1, 'proficiency-choice', 'skillProficiencies.any', (s as any).any, { detail: 'skill' }))
  }
  for (const s of feat.skillToolLanguageProficiency ?? []) {
    if (s && typeof s === 'object' && 'choose' in (s as object)) out.push(make(owner, 1, 'proficiency-choice', 'skillToolLanguageProficiency.choose', 1, { detail: 'skill-tool-language' }))
  }
  return out
}

// ---------------------------------------------------------------------------
// Corpus-wide discovery. Stable order; identity collisions get an ordinal suffix.
// ---------------------------------------------------------------------------

export function detectAll(corpus: RawCorpus): DecisionRecord[] {
  const featsByName = new Map(corpus.feats.map((f) => [f.name.toLowerCase(), f]))
  const out: DecisionRecord[] = []
  for (const entry of corpus.classes) out.push(...detectClassDecisions(entry.cls, entry.features, entry.subclasses, entry.subclassFeatures))
  for (const race of corpus.races) out.push(...detectSpeciesDecisions(race))
  for (const bg of corpus.backgrounds) out.push(...detectBackgroundDecisions(bg, featsByName))
  for (const feat of corpus.feats) out.push(...detectFeatDecisions(feat))
  const seen = new Map<string, number>()
  return out
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((record) => {
      const n = seen.get(record.id) ?? 0
      seen.set(record.id, n + 1)
      return n === 0 ? record : { ...record, id: `${record.id}#${n + 1}` }
    })
}
