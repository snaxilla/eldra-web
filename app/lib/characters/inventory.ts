// Character Inventory -- what a character carries, as stored player data.
//
// The third module in the same family as app/lib/characters/ability-scores.ts
// and rules-choices.ts, and deliberately shaped like them: pure, re-validated
// on read rather than trusted, and computing nothing. Ability scores are
// numbers a player chose; choices are options a player picked; inventory is
// things a player is carrying. All three are decisions. Everything derived
// from them belongs to the Rules Engine.
//
// ---------------------------------------------------------------------------
// WHAT THIS REPLACES, AND WHY NONE OF IT IS COPIED
// ---------------------------------------------------------------------------
// V1 stores inventory in a dedicated `character_sheet_inventory` Directus
// collection keyed by `sheet_id` -- the id of a `character_sheets` row. A
// character created through the catalogue-driven flow has NO
// `character_sheets` row (create-v2.post.ts states this explicitly), so V1's
// inventory is structurally unreachable for exactly the characters the new
// architecture produces. That is the plumbing being replaced, and it is why
// this is a re-implementation rather than a port.
//
// Three V1 behaviours are deliberately NOT preserved, because each is a
// legacy calculation rather than a piece of the experience:
//
//   - Currency stored as inventory rows named "currency:gold", detected by
//     string-matching `name.startsWith('currency:')` and folding platinum
//     into gold at a hardcoded 10:1. Denominations are Rule Category 16
//     (`currency`), which the active package does not declare; re-creating
//     the hack here would hardcode a game's money into Eldra. Deferred.
//   - Runtime discovery of which columns `character_sheet_inventory` happens
//     to have (`inventoryFields()`), plus a five-name search for whichever
//     column links an item entity. A shape that must be probed is a shape
//     nothing agrees on.
//   - Snapshotting a normalized 5etools item profile into each row's `data`
//     column. Content is re-resolved from the catalogue on every read here,
//     so repinning a Content Pack is reflected rather than frozen.
//
// ---------------------------------------------------------------------------
// ITEM IDENTITY: A REFERENCE, OR A NAME
// ---------------------------------------------------------------------------
// An item is either CATALOGUE-BACKED -- a `(packageId, slug)` reference
// re-resolved against the World's current catalogue on every read, exactly as
// Species/Class/Background already are -- or CUSTOM, carrying only a name the
// player typed. V1 supports both and a character sheet that cannot hold "a
// letter from the duke" is not usable at a real table, so both are kept.
//
// The reference stores no title, no weight, and no description. Those live in
// the Content Pack and are read through the catalogue, which is what makes a
// repin update every character that carries the item instead of leaving each
// one holding a private copy.
//
// ---------------------------------------------------------------------------
// THE ITEM SHAPE IS TRANSITIONAL, AND SAYS SO
// ---------------------------------------------------------------------------
// `equipped` and `attuned` are stored as explicit per-item fields. The
// architecture's end state is different: a Rules Package declares a
// `CollectionDefinition` (rules-package-architecture.md §7, types.ts) whose
// `itemSchema` names the per-item fields and whose `slots` describe what may
// be equipped where, and the engine's source overlay (Path 2, already
// implemented in app/lib/rules/source-overlay.ts) turns an equipped item into
// modifier-carrying Sources.
//
// The active package declares NO collection and nothing in category 13
// (`equipment`) at all -- it is a Core Character Rules package, categories
// 1-8. So there is no schema to read these fields from yet, and inventing a
// collection here would mean authoring rules content from application code.
// They are hardcoded, briefly, and this comment is the record of why. When a
// package declares the collection, these become schema-declared and the
// stored shape below is already the `CollectionInstanceItem` shape the engine
// expects (`instanceId` plus arbitrary fields), so that change is a mapping,
// not a migration.
//
// This is also why equipping computes nothing today: no armour class, no
// carrying capacity, no attunement limit. Those are Rules Engine output and
// are this task's explicit non-goals.

import type { RulesFacet } from '../content-rules'
import type { ContentAction } from '../content-actions'
import type { CanonicalItemMechanics } from '../item-mechanics'

export type InventoryItemRef = {
  packageId: string
  slug: string
}

// Shaped as the engine's CollectionInstanceItem (`instanceId` + fields) so
// that feeding it into ActorState.collections later is an assignment.
export type StoredInventoryItem = {
  instanceId: string
  // Present for a catalogue-backed item; absent for a custom one.
  ref?: InventoryItemRef
  // Present for a custom item; absent for a catalogue-backed one, whose
  // title is read from the catalogue rather than copied here.
  name?: string
  quantity: number
  equipped: boolean
  attuned: boolean
  container?: string
  notes?: string
}

export type StoredInventory = {
  items: StoredInventoryItem[]
}

export const MIN_ITEM_QUANTITY = 1
export const MAX_ITEM_QUANTITY = 9999

export function emptyInventory(): StoredInventory {
  return { items: [] }
}

// Deterministic per-item identity. Random ids would make an ActorState that
// differs on every read, which is the property the actor bridge's own tests
// assert against ("byte-identical on every build").
export function nextInstanceId(existing: readonly StoredInventoryItem[]): string {
  let highest = 0

  for (const item of existing) {
    const match = /^item-(\d+)$/.exec(item.instanceId)
    if (!match) continue
    const value = Number(match[1])
    if (Number.isFinite(value) && value > highest) highest = value
  }

  return `item-${highest + 1}`
}

export function clampQuantity(value: unknown): number {
  const parsed = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(parsed)) return MIN_ITEM_QUANTITY

  const whole = Math.floor(parsed)
  if (whole < MIN_ITEM_QUANTITY) return MIN_ITEM_QUANTITY
  if (whole > MAX_ITEM_QUANTITY) return MAX_ITEM_QUANTITY
  return whole
}

function trimmed(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function optionalText(value: unknown): string | undefined {
  const text = trimmed(value)
  return text || undefined
}

function readRef(value: unknown): InventoryItemRef | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined

  const record = value as Record<string, unknown>
  const packageId = trimmed(record.packageId)
  const slug = trimmed(record.slug)

  // A half-written reference is not a reference. Dropping it turns the row
  // into a custom item rather than one that resolves to nothing forever.
  if (!packageId || !slug) return undefined

  return { packageId, slug }
}

// Re-validated on read, never trusted -- the same posture
// normalizeStoredAbilityScores and normalizeStoredRulesChoices take.
//
// Unlike those two, a malformed ITEM is dropped rather than failing the whole
// record: an inventory is a list, and losing one unreadable row is better
// than a player's entire pack reading as empty. A malformed ENVELOPE still
// returns null.
export function normalizeStoredInventory(value: unknown): StoredInventory | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null

  const input = value as Record<string, unknown>
  if (!Array.isArray(input.items)) return null

  const items: StoredInventoryItem[] = []
  const seen = new Set<string>()

  for (const raw of input.items) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) continue

    const record = raw as Record<string, unknown>
    const ref = readRef(record.ref)
    const name = optionalText(record.name)

    // An item that is neither a reference nor a name cannot be displayed or
    // acted on, so it is not an item.
    if (!ref && !name) continue

    const instanceId = trimmed(record.instanceId) || nextInstanceId(items)
    if (seen.has(instanceId)) continue
    seen.add(instanceId)

    items.push({
      instanceId,
      ...(ref ? { ref } : {}),
      ...(ref ? {} : { name }),
      quantity: clampQuantity(record.quantity),
      equipped: record.equipped === true,
      attuned: record.attuned === true,
      ...(optionalText(record.container) ? { container: optionalText(record.container) } : {}),
      ...(optionalText(record.notes) ? { notes: optionalText(record.notes) } : {})
    })
  }

  return { items }
}

// ---------------------------------------------------------------------------
// The view model -- one carried item, joined to the catalogue
// ---------------------------------------------------------------------------
// Lives here rather than beside Character Assembly so the Sheet can import
// it: `app/` must never import from `server/`. Assembly produces this shape;
// the panel renders it.
//
// `entry` is typed structurally (the few provenance fields a sheet actually
// displays) rather than as the server's full ContentCatalogueEntry, for the
// same reason characterBuilderSelection.ts declares its own
// BuilderCatalogueEntry: the client needs the fields it renders, not the
// server's whole type.
//
// `rulesFacet` is included for the same reason BuilderCatalogueEntry
// includes it: Character Assembly relays the catalogue entry's facet
// verbatim onto this field at runtime (server/utils/character-assembly.ts's
// `resolveInventory` spreads the resolved `ContentCatalogueEntry`, which
// already carries it) -- this type only needed widening to see what was
// already there. `rulesFacet.collectionFields` is what makes an item's
// Equipment category/slot/attunement-requirement Rules Engine output rather
// than something this page would have to know a game to compute.
export type InventoryCatalogueEntry = {
  packageId: string
  packageVersion: string
  title: string
  slug: string
  sourceBook?: string
  rulesFacet?: RulesFacet
  // Character Actions System addition -- relayed the same way `rulesFacet`
  // already is (Character Assembly spreads the resolved catalogue entry
  // verbatim). A weapon item carries exactly one; a non-weapon item carries
  // none. This is what lets an equipped weapon become a row on the Actions
  // panel without this module knowing what a weapon is.
  actions?: ContentAction[]
  // Character Purgatory item-mechanics pass. Relayed the same way
  // `rulesFacet`/`actions` already are -- server/utils/character-assembly.ts's
  // `resolveInventory` has always passed the FULL resolved
  // `ContentCatalogueEntry` through as `entry` (world-content-catalogue.ts
  // computes `itemMechanics` for every `items` entry), so this field was
  // already present on the wire; it was only ever missing from THIS type,
  // which is why nothing here could read it. `null` means the catalogue
  // resolved the entry but it is not a weapon (Milestone A scope, see
  // app/lib/item-mechanics/types.ts); absent means `entry` predates this
  // field or the resolver threw. `itemDetailLines` below is the first real
  // reader.
  itemMechanics?: CanonicalItemMechanics | null
}

// 'resolved' -- the reference found its catalogue entry.
// 'custom'   -- a player-typed item, which resolves against nothing by design.
// 'missing'  -- a reference that no longer resolves, displayed rather than
//               dropped, because a player must be able to see WHY an item
//               stopped working.
export type AssembledInventoryItem = StoredInventoryItem & {
  status: 'resolved' | 'custom' | 'missing'
  // Always present, always displayable.
  title: string
  entry?: InventoryCatalogueEntry
  reason?: string
}

// ---------------------------------------------------------------------------
// Player-facing detail lines -- the Item Detail panel's own content
// ---------------------------------------------------------------------------
// Character Purgatory follow-up -- the real reported bug: the detail panel
// (sheet-v2.vue's `openItemContext`) used to also push a
// `Resolved from: ${packageId}@${packageVersion}` line -- internal
// package-resolution plumbing with no meaning to a player. Extracted here,
// as a pure function, specifically so "the raw packageId/packageVersion
// locator can never leak into this list" is a fact a test can pin, not
// only a visual read of a ~1700-line page file.
//
// `entry.sourceBook` (e.g. "XPHB") is the one piece of provenance a player
// actually wants, and stays. `entry.packageId`/`packageVersion` are NOT
// read here at all -- not filtered out after the fact, never read in the
// first place -- so a future line added to this function cannot
// accidentally reintroduce them by copying the wrong field off `entry`.
//
// ---------------------------------------------------------------------------
// Item mechanics lines -- Character Purgatory item-mechanics pass
// ---------------------------------------------------------------------------
// The real reported bug: the panel showed Quantity/Source and nothing about
// what an item DOES, even for a resolved weapon or armor piece whose
// mechanics were already flowing correctly to the Rules Engine (equipping
// either one already affects AC/Actions -- see
// server/utils/character-actor-bridge.ts's own ARMOR note). The data was
// simply never read here. Two sources, both already published, read
// nowhere else in this function:
//
// - `entry.itemMechanics` (app/lib/item-mechanics) -- weapon category,
//   melee/ranged, properties, and Mastery. Milestone A scope: resolves
//   weapons only; every other item kind is `null`/absent here.
// - `entry.rulesFacet.collectionFields` (app/lib/content-rules) -- the
//   SAME hand-authored, published facts the Rules Engine's Source Overlay
//   already reads for Armor Class (`armorClass`/`dexCapMin`/`dexCapMax` on
//   the `collection:equipment` group whose `fields.category` is 'armor').
//   Restating them here is not inventing a rule; it is showing the
//   published fact a different consumer already acts on.
//
// Weapon damage/range are read from `entry.actions` instead of invented
// here a second time -- app/lib/content-actions/dnd5e.ts's
// `resolveWeaponAction` already turns a weapon's raw `dmg1`/`dmgType`/
// `range` into the exact player-facing strings ("1d6 slashing", "80/320
// ft.") the Actions panel uses; `itemMechanics` itself carries no damage
// dice (Weapon Mastery phase scope -- see its own types.ts).
//
// An item with neither signal (ammunition, trade goods, most tools --
// nothing in the bound XPHB pack authors a Rules Facet for those kinds
// today) gets the honest fallback line below instead of silence or a
// blank-looking panel.
const WEAPON_PROPERTY_LABELS: Record<string, string> = {
  ammunition: 'Ammunition',
  finesse: 'Finesse',
  heavy: 'Heavy',
  light: 'Light',
  loading: 'Loading',
  reach: 'Reach',
  thrown: 'Thrown',
  'two-handed': 'Two-Handed',
  versatile: 'Versatile'
}

function weaponMechanicsLines(entry: InventoryCatalogueEntry): string[] {
  const mechanics = entry.itemMechanics
  if (!mechanics || mechanics.kind !== 'weapon') return []

  const lines: string[] = []
  const categoryLabel = mechanics.weaponCategory === 'martial' ? 'Martial' : 'Simple'
  const rangeLabel = mechanics.range === 'ranged' ? 'Ranged' : 'Melee'
  lines.push(`Type: ${categoryLabel} ${rangeLabel} Weapon`)

  const weaponAction = entry.actions?.find((action) => action.category === 'weapon')
  if (weaponAction?.damage) lines.push(`Damage: ${weaponAction.damage}`)
  if (weaponAction?.range) lines.push(`Range: ${weaponAction.range}`)

  if (mechanics.properties.length) {
    lines.push(`Properties: ${mechanics.properties.map((property) => WEAPON_PROPERTY_LABELS[property] || property).join(', ')}`)
  }

  lines.push(`Mastery: ${mechanics.masteryProperty}`)

  return lines
}

function armorMechanicsLines(entry: InventoryCatalogueEntry): string[] {
  const equipmentFields = entry.rulesFacet?.collectionFields?.find((group) => group.collection === 'collection:equipment')?.fields
  if (!equipmentFields || equipmentFields.category !== 'armor') return []

  const lines: string[] = [`Type: ${equipmentFields.slot === 'held' ? 'Shield' : 'Armor'}`]

  const armorClass = typeof equipmentFields.armorClass === 'number' ? equipmentFields.armorClass : null
  if (armorClass !== null) {
    lines.push(`Armor Class: ${armorClass}`)

    const dexCapMax = typeof equipmentFields.dexCapMax === 'number' ? equipmentFields.dexCapMax : null
    if (dexCapMax !== null) {
      if (dexCapMax <= 0) lines.push('Dexterity Bonus: none')
      else if (dexCapMax >= 99) lines.push('Dexterity Bonus: full')
      else lines.push(`Dexterity Bonus: up to +${dexCapMax}`)
    }
  }

  if (equipmentFields.requiresAttunement === true) lines.push('Requires Attunement: Yes')

  return lines
}

export function itemDetailLines(item: Pick<AssembledInventoryItem, 'quantity' | 'container' | 'notes' | 'entry' | 'status' | 'reason'>): string[] {
  const lines: string[] = [`Quantity: ${item.quantity}`]
  if (item.container) lines.push(`Container: ${item.container}`)
  if (item.notes) lines.push(item.notes)
  if (item.entry?.sourceBook) lines.push(`Source: ${item.entry.sourceBook}`)

  if (item.status === 'resolved' && item.entry) {
    const mechanicsLines = [...weaponMechanicsLines(item.entry), ...armorMechanicsLines(item.entry)]
    lines.push(...(mechanicsLines.length ? mechanicsLines : ['No item details are available in this content package.']))
  }

  if (item.status === 'missing' && item.reason) lines.push(item.reason)
  return lines
}

// ---------------------------------------------------------------------------
// Mutations -- pure, total, and the only place inventory changes shape
// ---------------------------------------------------------------------------
// Every one returns a NEW list rather than mutating in place, so a caller
// cannot half-apply a change, and so a failed save leaves the previous list
// intact to fall back to.
//
// These live here rather than in the panel component for the reason
// characterBuilderSelection.ts already established for the Builder: the
// component renders and emits intent, the pure module decides what an intent
// means, and the tests exercise the decision without a DOM.

export function addInventoryItem(
  items: readonly StoredInventoryItem[],
  item: { ref?: InventoryItemRef; name?: string; quantity?: unknown; notes?: string; container?: string }
): StoredInventoryItem[] {
  const ref = item.ref
  const name = optionalText(item.name)

  // Refuses rather than inventing a placeholder: an item with no identity is
  // not an item, and silently adding "Item" would be worse than nothing.
  if (!ref && !name) return [...items]

  return [
    ...items,
    {
      instanceId: nextInstanceId(items),
      ...(ref ? { ref } : { name }),
      quantity: clampQuantity(item.quantity ?? MIN_ITEM_QUANTITY),
      equipped: false,
      attuned: false,
      ...(optionalText(item.container) ? { container: optionalText(item.container) } : {}),
      ...(optionalText(item.notes) ? { notes: optionalText(item.notes) } : {})
    }
  ]
}

export function removeInventoryItem(
  items: readonly StoredInventoryItem[],
  instanceId: string
): StoredInventoryItem[] {
  return items.filter((item) => item.instanceId !== instanceId)
}

// Quantity is clamped, never allowed to reach zero by stepping. Removing is
// an explicit action: a player who steps a stack down to nothing has not
// asked to throw the item away, and silently deleting it would lose the
// notes and container attached to it.
export function changeInventoryQuantity(
  items: readonly StoredInventoryItem[],
  instanceId: string,
  delta: number
): StoredInventoryItem[] {
  return items.map((item) =>
    item.instanceId === instanceId
      ? { ...item, quantity: clampQuantity(item.quantity + delta) }
      : item
  )
}

export function setInventoryQuantity(
  items: readonly StoredInventoryItem[],
  instanceId: string,
  quantity: unknown
): StoredInventoryItem[] {
  return items.map((item) =>
    item.instanceId === instanceId ? { ...item, quantity: clampQuantity(quantity) } : item
  )
}

export type InventoryFlag = 'equipped' | 'attuned'

export function toggleInventoryFlag(
  items: readonly StoredInventoryItem[],
  instanceId: string,
  flag: InventoryFlag
): StoredInventoryItem[] {
  return items.map((item) =>
    item.instanceId === instanceId ? { ...item, [flag]: !item[flag] } : item
  )
}

// The label to show for an item whose reference did not resolve. Never a
// blank and never a guess: a player who cannot see that an item's Content
// Pack is gone has no way to understand why it stopped working.
export function unresolvedItemLabel(ref: InventoryItemRef): string {
  return `${ref.slug} (unavailable)`
}
