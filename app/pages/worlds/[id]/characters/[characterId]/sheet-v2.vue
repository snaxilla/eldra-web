<script setup lang="ts">
// Character Sheet V2 -- Phase 1. See server/utils/character-assembly.ts and
// server/api/worlds/[id]/characters/[characterId]/assembly.get.ts for the
// design this renders. This page consumes ONLY
// GET /api/worlds/:id/characters/:characterId/assembly -- it holds no
// concept of Content Packs, bindings, the Catalogue, the importer, or
// 5etools; those abstractions are already resolved away behind the
// assembly endpoint by the time this page ever sees a response. Deliberately
// separate from entities/[entityId]/sheet.vue (V1, which reads World
// Entities and a character_sheets row) -- this page never calls
// /entities or /character_sheets. This is an inspection surface only: no
// ability scores, equipment, spellcasting, actions, notes, or editing (this
// task's own NON-GOALS) -- just Name/Species/Class/Background, rendered
// exactly as Assembly resolved them, including "missing" when it did not.
//
// ---------------------------------------------------------------------------
// PHASE 2: THE SAME MODELS THE BUILDER SHOWED
// ---------------------------------------------------------------------------
// Each resolved slot's placeholder card (source book + package id, and
// nothing else) is replaced by the resolved presentation model the Content
// Pack publishes, rendered through the SAME component the Character Builder
// previews with (~/components/characters/ContentPresentationPanel.vue).
//
// Builder and Sheet are two contexts on one model, not two renderings of one
// idea: what a player read while choosing a Species is exactly what they read
// afterwards on the sheet, down to the wording, because it is the same
// component fed by the same resolver.
//
// Provenance stays on the card and does NOT move into the panel: which pack
// and version an entry resolved through is a fact about this character's
// binding, not about the Species, and it is what makes a later "missing"
// state intelligible.
//
// This page still holds no concept of Content Packs' internals, 5etools, or
// `data` -- `entry.presentation` arrives already resolved from the assembly
// endpoint, which gets it from the World Content Catalogue.
//
// ---------------------------------------------------------------------------
// RULES ENGINE INTEGRATION (rules-package-architecture.md §13.1)
// ---------------------------------------------------------------------------
// The ability score panel is replaced by DERIVED output: ability modifiers,
// proficiency bonus, and saving throw / skill proficiencies, all read from
// GET /api/worlds/:id/characters/:characterId/derived.
//
// NOT ONE OF THOSE NUMBERS IS COMPUTED HERE. This page performs no
// arithmetic at all -- it fetches a projection and renders it. The engine
// calculated every value; the bridge supplied every input; this file chose
// only where things sit on screen.
//
// It also names no ability, skill, or Definition ID. It selects which
// CATEGORIES to render (§13.2: "Sheet regions address Rule Categories"),
// which is the agnostic vocabulary -- a package that declares no
// `core.skills` definitions simply produces no skills region, with no
// configuration and no per-system code.
//
// Two absences are legal and rendered as such, never as errors: a World with
// no Rules Package activated, and a package that is activated but broken.
// Those are distinct states and the sheet says which.
//
// ---------------------------------------------------------------------------
// PHASE 3: IDENTITY AND ABILITY SCORES
// ---------------------------------------------------------------------------
// The placeholder identity section (a bare title and a sentence explaining
// the page) is replaced by a real one: Name, then Species / Class /
// Background at a glance, then the six ability scores.
//
// VALUES ONLY. This page displays what the character HAS and derives nothing
// from it -- no modifier beside a score, no saving throw, no skill bonus, no
// armour class, no hit points, no initiative. Every one of those is the Rules
// Engine's (app/lib/rules/**), which this page does not import and must not
// reimplement. When they arrive, they arrive as data.
//
// The Sheet DISPLAYS; the Builder EDITS. There is no inline editing here --
// the ability scores link out to the Builder's own editing surface
// (.../[characterId]/abilities), which is also the path by which a character
// created before Phase 3 acquires scores at all.
//
// ---------------------------------------------------------------------------
// INVENTORY -- THE FIRST V1 FEATURE ON THE NEW ARCHITECTURE
// ---------------------------------------------------------------------------
// V1's Inventory tab, rebuilt on Character Assembly rather than ported. Its
// INFORMATION ARCHITECTURE is preserved (an add panel above a dense two-up
// item grid, quantity/equipped/attuned per card); its PLUMBING is not. There
// is no `character_sheets` row, no `character_sheet_inventory` table, no
// runtime column probing, and no snapshotted 5etools payload: items are
// `(packageId, slug)` references re-resolved against the World's catalogue on
// every read, exactly as Species/Class/Background already are.
//
// Inventory is the ONE editable surface on this page, and deliberately so --
// see CharacterInventoryPanel.vue's header. Picking something up happens at
// the table, not in a character builder.
//
// This page still computes nothing. Every list change is decided by the pure
// module (app/lib/characters/inventory.ts) and saved; no weight, capacity,
// attunement limit, or armour class is calculated anywhere, because those are
// Rule Category 13 (`equipment`) and belong to the Rules Engine.
//
// ---------------------------------------------------------------------------
// NOTES -- THE SECOND V1 FEATURE ON THE NEW ARCHITECTURE
// ---------------------------------------------------------------------------
// V1's Notes tab, reshaped rather than ported: six named fields (General,
// Appearance, Personality, Backstory, Goals, Secrets) instead of an
// open-ended card list, because that is the shape this feature was scoped
// to. Persisted through Character Assembly's same block_instances pattern
// Inventory established -- see server/utils/character-notes.ts.
//
// Notes resolve against nothing: no catalogue join, no Rules Engine call,
// no derived value. They are the one piece of this page that is exactly what
// was typed, both in and out.
//
// `secrets` is an ordinary field, not access-controlled -- see
// character-notes.ts's own note on why: no real GM role exists yet to gate
// it on, and labelling it GM-only here would promise privacy this platform
// cannot enforce.
//
// ---------------------------------------------------------------------------
// HEALTH -- THE SECOND GAMEPLAY-DERIVED SYSTEM, FOLLOWING ARMOR CLASS
// ---------------------------------------------------------------------------
// Same shape as Armor Class: Maximum HP, Hit Dice (total), and Hit Dice
// Available are ALL Rules Engine output, read from
// `derived.byCategory['core.health']` via `findDerivedNumber` -- never
// computed here. Current HP, Temporary HP, Hit Dice spent, and Death Save
// marks are the player's own stored data (server/utils/character-health.ts,
// the same block_instances pattern every other player-data block uses),
// edited directly on the Sheet -- Health is the second deliberate exception
// to "the Sheet displays, the Builder edits" (Inventory was the first, for
// the identical reason: it changes during play, not at creation).
//
// `findDerivedNumber` reads ONLY the three read-only summaries -- never
// Current HP or Death Saves, which the player edits directly through
// CharacterRecoveryPanel.vue (CharacterHealthPanel.vue, renamed in Phase
// 3's display/action split -- see that file's own header). Rendering
// those through the generic `core.health` region too would show the same
// fact twice, through two different paths; see that helper's own note.
//
// ---------------------------------------------------------------------------
// SPELLCASTING -- THE SECOND GAMEPLAY SYSTEM ON THE RULES ENGINE, THE SAME
// SHAPE AS HEALTH
// ---------------------------------------------------------------------------
// Spellcasting Ability Modifier, Spell Save DC, and Spell Attack Bonus are
// ALL Rules Engine output, read via `findDerivedNumber`/`findDerivedBoolean`
// -- never computed here. Known/Prepared spells and expended slot counts are
// the player's own stored data (server/utils/character-spellcasting.ts, the
// same block_instances pattern every other player-data block uses), edited
// directly on the Sheet for the identical reason Inventory and Health are.
//
// `slotLevels` is the ONE piece of interpretation this page's data layer
// performs for Spellcasting: which of the three Spell Slot progression
// Tables (`derived.tables`) applies to THIS character, picked by reading the
// `caster_type` boolean flags this file already hardcodes the Definition ids
// of -- the same "the fixed key names the package's own vocabulary declares"
// posture `findDerivedNumber('core.health', 'value:hit_points.max')`
// immediately above already establishes for Health, one level up (a Table,
// not a Value, because Spell Slot progression is not a formula -- see
// packages/eldra-dnd5e-2024/README.md's own note on why `lookup()` is not
// evaluated). This still computes no NUMBER: it selects a row a Table
// already declares and reads it, exactly as it already selects which
// `derived.collections` entry is the equipment slots. As of Phase 2 (see
// below), this selection lives in useCharacterSheet.ts, not this file.
//
// ---------------------------------------------------------------------------
// ACTIONS -- "WHAT CAN MY CHARACTER DO?", A PROJECTION OF EVERYTHING ABOVE
// ---------------------------------------------------------------------------
// The Character Actions System. Fetched from its own endpoint
// (GET .../actions, server/utils/character-actions.ts) rather than composed
// on this page the way `slotLevels` is above -- Actions combines FIVE
// sources (Species, Class, Background, equipped weapons, prepared spells)
// and attaches Rules Engine numbers to each, which is real orchestration
// work, not the single "pick a table row" selection `slotLevels` performs.
// This page still computes nothing: it renders whatever the endpoint
// already assembled. Read-only -- see CharacterActionsPanel.vue's own
// header for why this is the one panel added by this task with no `@`
// emits at all.
//
// ---------------------------------------------------------------------------
// PHASE 2 (BEAUTIFICATION PASS): DATA LAYER CONSOLIDATION
// ---------------------------------------------------------------------------
// Everything described above as "fetched"/"read from `derived`" now happens
// inside app/composables/useCharacterSheet.ts, and every mutation described
// above as "saved"/"POSTed" now happens inside
// app/composables/useCharacterMutations.ts. This page calls both composables
// once each and renders what they return -- it orchestrates LAYOUT, not
// DATA. See each composable's own header for the reasoning behind its
// specific domain boundaries (notably: why Notes stays local to this page
// rather than becoming a sixth mutation domain, and why Join/Leave Encounter
// lives under the `conditions` mutation group rather than its own).
//
// The identity summary is composed inline rather than extracted into a
// component: it is used by exactly this one page. The ability scores ARE
// extracted (CharacterAbilityScoresPanel), because the Builder's review step
// renders the same panel -- the same test ContentPresentationPanel passed.
// Encounter and Conditions ARE now extracted too (CharacterEncounterPanel,
// CharacterConditionsPanel) -- Phase 2's other stated deliverable, alongside
// the two composables above.
//
// ---------------------------------------------------------------------------
// PHASE 4 (BEAUTIFICATION PASS): SHELL, NAVIGATION, THREE-COLUMN LAYOUT
// -- SUPERSEDED BY CORRECTIVE PHASE 2R, BELOW
// ---------------------------------------------------------------------------
// Phase 4 gave this page a desktop-only three-column dashboard (left rail /
// center / right rail via CharacterSheetDesktopLayout.vue), nested inside
// Eldra's OWN three-pane workspace shell (world navigation / main
// workspace / context rail). Corrective Phase 2R (see
// eldra-character-sheet-visual-language.md) rejects that nesting outright:
// a second three-column app-within-app inside the workspace's own middle
// pane is precisely the "admin dashboard" feeling the Beautification Pass
// exists to remove, not a fix for it. Nothing about §3.4's five tabs or
// `?tab=` URL sync changes -- only the LAYOUT those tabs render into.
//
// ---------------------------------------------------------------------------
// CORRECTIVE PHASE 2R: V1-STYLE FOLIO SHELL
// ---------------------------------------------------------------------------
// The rails are gone, not restyled. `CharacterSheetShell.vue` no longer
// renders `CharacterSheetDesktopLayout.vue` at all (left unused on disk,
// per this task's own "bypass, don't delete" guidance) -- every breakpoint
// now gets the SAME single folio body: one sticky command center
// (`CharacterSheetCommandCenter.vue`, this page's one Feature surface),
// then one tabbed content column. What used to be gated `v-if="!isDesktop"`
// (Identity/Ability Scores/Derived folding into the Character tab;
// Recovery/Encounter/Conditions folding into the Play tab, "never both at
// once" to avoid two live instances of the same stateful panel) is now
// simply the ONLY copy of that content -- there is no second, rail-hosted
// copy left to avoid duplicating. This is why the template below is
// smaller than Phase 4's, not larger.
//
// `CharacterIdentityCard` (Visual Language Phase 2) was relocated here at
// the time -- "desktop left rail / mobile Character-tab fold" collapsing
// to "the one place it's ever shown". Header Phase H2 later removed this
// last usage too: once the command center grew its own portrait/name/
// level/Species/Class/Background summary, a second copy in the Character
// tab stopped serving a new purpose and became exactly the duplication
// H2's own principle forbids. The component file itself is unused on disk
// now, not deleted, per this session's standing "bypass, don't delete"
// convention. `CharacterVitalsBar` is unchanged internally and renders
// `bare` inside `CharacterSheetCommandCenter`, which supplies the identity
// summary and Back/Rest command buttons the old Vitals Bar's own top row
// used to own alone -- see that component's own header for the full
// reasoning. No gameplay panel below (Actions/Recovery/Spellcasting/
// Inventory/Conditions/Encounter) was touched: every one is the exact same
// component this task's IMPORTANT section says not to redesign, only
// re-parented into a flatter template.
//
// ---------------------------------------------------------------------------
// DESKTOP IA PASS: TWO SHEET REGIONS + ELDRA'S OWN CONTEXT DRAWER
// ---------------------------------------------------------------------------
// Corrective Phase 2R's single folio column was right to reject Phase 4's
// three-column app-within-an-app, and wrong to conclude the answer was one
// column at every width: it left a 2560px desktop mostly empty and buried
// saves and skills behind a tab.
//
// Measured against a real 5e sheet's desktop information architecture, the
// correction is that the sheet has TWO regions and the THIRD PANE IS NOT
// THE SHEET'S:
//
//   Command center   identity, ability tiles, HP/AC/DC, conditions, turn
//   Left region      reference: saves, proficiency, defenses (>= 1280px)
//   Center region    skills (always visible) + the tab body
//   Context drawer   Eldra's EXISTING WorldEntityContextDrawer -- the same
//                    component the World map, roster, admin, timelines and
//                    entity pages already open, now opened by this page too
//
// That last line is the whole point. A right-hand rail owned by the sheet
// would be a second context system sitting inside a workspace that already
// has one; instead an action/spell/item/feature/skill opens in the drawer
// Eldra already had, and the sheet compresses to make room for it at
// desktop width exactly as the reference sheet does. No new drawer, no
// third rail.
//
// The left region is rendered TWICE (rail at >= 1280px, folded into the
// Character tab below that) with CSS choosing which is visible rather than
// a JS breakpoint. That is safe here and nowhere else: every panel in it is
// a read-only projection of derived values. Recovery/Encounter, which
// mutate, are still rendered exactly once -- see
// CharacterReferencePanels.vue's own header.
//
// Skills are persistent at every width rather than living in a tab: "what
// do I roll for that?" is asked constantly and is not a destination.
//
// ---------------------------------------------------------------------------
// ELDRA ROLL SYSTEM PHASE 2: ABILITY/SAVE/SKILL CLICK-TO-ROLL
// ---------------------------------------------------------------------------
// The reference region and the skills table stop being read-only: clicking
// an ability, a saving throw, or a skill now performs a real,
// server-authoritative roll through `useWorldRolls.ts`
// (.github/docs/architecture/eldra-roll-system.md §8). This page sends
// only a SOURCE (sourceType/actorCharacterId/sourceKey/visibility) --
// never a bonus, modifier, expression, or total; the server re-derives the
// number from the same `derived` this page already reads for display
// (§3). `useCharacterSheetRolls.ts` (the prior client-side-seeded
// prototype) is no longer this page's roll composable.
//
// ---------------------------------------------------------------------------
// ELDRA ROLL SYSTEM PHASE 2C: THE ROLL TRAY
// ---------------------------------------------------------------------------
// Phase 2's own temporary inline "latest roll" strip is gone -- `WorldRollTray`
// (components/world/, §9) is now the one, permanent, canonical place a roll
// result appears: a persistent, collapsible feed (tabletop notebook / combat
// log, never a modal or a toast) docked bottom-right on desktop, a bottom
// sheet on mobile. This page owns no roll DATA beyond its one
// `useWorldRolls()` instance -- the Tray is purely a display component fed
// by that composable's `history`/`pending`/`error`/pagination state; see
// WorldRollTray.vue's own header for the full location/animation/pagination
// design.
//
// ---------------------------------------------------------------------------
// CHARACTER SHEET BODY PHASE 1A: WEAPON/UNARMED ATTACK + DAMAGE ROLLS
// ---------------------------------------------------------------------------
// `rollActionAttack`/`rollActionDamage` below extend this exact same
// pipeline (`requestRoll`, `rollVisibility`, the Roll Tray) to
// `sourceType: 'action_attack' | 'damage'` -- CharacterActionsPanel.vue's
// weapon/unarmed rows emit `{ actionId }`, never a modifier or expression.
// This is deliberately NOT Combat Resolution (`mutations.combat`, still
// used below for spell actions): no target, no Armor Class comparison, no
// hit/miss, no HP applied to anyone -- see roll-events.ts's own
// createActionAttackRollEvent/createActionDamageRollEvent for why that
// split exists.

import CharacterInventoryPanel from '~/components/characters/CharacterInventoryPanel.vue'
import CharacterNotesPanel from '~/components/characters/CharacterNotesPanel.vue'
import CharacterSpellcastingPanel from '~/components/characters/CharacterSpellcastingPanel.vue'
import CharacterDerivedPanel from '~/components/characters/CharacterDerivedPanel.vue'
import CharacterActionsPanel from '~/components/characters/CharacterActionsPanel.vue'
import CharacterProgressionPanel from '~/components/characters/CharacterProgressionPanel.vue'
import ContentPresentationPanel from '~/components/characters/ContentPresentationPanel.vue'
import CharacterStatChip from '~/components/characters/CharacterStatChip.vue'
import CharacterEmptyState from '~/components/characters/CharacterEmptyState.vue'
import CharacterEncounterPanel from '~/components/characters/CharacterEncounterPanel.vue'
import CharacterConditionsPanel from '~/components/characters/CharacterConditionsPanel.vue'
import CharacterSheetShell from '~/components/characters/CharacterSheetShell.vue'
import CharacterSheetHeader from '~/components/characters/CharacterSheetHeader.vue'
import CharacterReferencePanels from '~/components/characters/CharacterReferencePanels.vue'
import CharacterSkillList from '~/components/characters/CharacterSkillList.vue'
import WorldEntityContextDrawer from '~/components/world/WorldEntityContextDrawer.vue'
import WorldRollTray from '~/components/world/WorldRollTray.vue'
import type { CharacterAction } from '~/components/characters/CharacterActionsPanel.vue'
import type { CharacterSkillRow } from '~/components/characters/CharacterSkillList.vue'
import { isAttackCapableAction, resolveActionDamage, formatActionDamage } from '~/lib/content-actions'
import type { CharacterAbilityRow } from '~/components/characters/CharacterAbilityGrid.vue'
import type { CharacterSaveRow } from '~/components/characters/CharacterSaveList.vue'
import {
  ABILITIES_CATEGORY,
  HOMED_CATEGORIES,
  REFERENCE_CATEGORIES,
  SAVES_CATEGORY,
  SKILLS_CATEGORY,
  formatDerivedValue,
  selectPresentedValues
} from '~/components/characters/characterDerivedValues'
import type { EncounterConditionView } from '~/composables/useCharacterSheet'
import { useCharacterSheet } from '~/composables/useCharacterSheet'
import { useCharacterMutations } from '~/composables/useCharacterMutations'
import { useCharacterProgression } from '~/composables/useCharacterProgression'
import { useCharacterSheetPresentation } from '~/composables/useCharacterSheetPresentation'
import {
  CHARACTER_SHEET_INTERACTION_KEY,
  emptyCharacterSheetInteractionState,
  resetCharacterSheetInteractionState
} from '~/components/characters/characterSheetInteractionState'
import {
  useCharacterSheetLayout,
  type CharacterSheetContext,
  type CharacterSheetContextRoll
} from '~/composables/useCharacterSheetLayout'
import { useWorldRolls } from '~/composables/useWorldRolls'
import type { AssembledInventoryItem } from '~/lib/characters/inventory'
import type { AssembledSpellEntry } from '~/lib/characters/spellcasting'
import type { PresentationEntry } from '~/lib/content-presentation/types'
import type { StoredCharacterNotes } from '~/lib/characters/character-notes'
import { buildManualRollRequestBody, type ManualDieOption } from '~/lib/rolls/requests'
import type { RollEventRecord, RollVisibility } from '~/lib/rolls/types'

definePageMeta({
  layout: 'world-workspace'
})

const route = useRoute()
const worldId = computed(() => String(route.params.id || ''))
const characterId = computed(() => String(route.params.characterId || ''))

// Single Character Sheet data-loading entry point -- see
// app/composables/useCharacterSheet.ts. Replaces what used to be six
// `useFetch` calls made directly in this script (three of them
// sequential, blocking each other in turn); this page now consumes that
// composable's state rather than coordinating its own fetching.
const sheet = await useCharacterSheet(worldId, characterId)

// One mutation surface for Recovery/Combat/Inventory/Spellcasting/
// Conditions -- see app/composables/useCharacterMutations.ts.
const mutations = useCharacterMutations(worldId, characterId, sheet)

// Character Progression Phase 1A -- the Game Admin Level Manager's own
// composable (not folded into `mutations`: see useCharacterProgression.ts's
// own header for why). Rendered behind `canEditCharacter` further down.
const progression = useCharacterProgression(worldId, characterId)

function requestProgressionPreview({ targetLevel }: { targetLevel: number }) {
  progression.previewPlan(targetLevel)
}

// A successful Level Up changes far more than this page's own local state
// -- Proficiency Bonus, Max HP, Hit Dice Max, Spell Save DC/Attack, Spell
// Slot maxima, and 1B.5's own cantrip scaling ALL move because the
// character's authoritative level changed, not because anything here
// patches them individually (this task's own "the Level Manager should not
// individually PATCH every derived number" requirement). `sheet.refresh()`
// -- the SAME combined assembly+derived+actions refresh every other
// sweeping mutation in this file already uses -- is what makes all of that
// visible with no manual synchronization.
async function confirmProgressionLevelUp() {
  const ok = await progression.confirm()
  if (ok) await sheet.refresh()
}

function clearProgressionPlan() {
  progression.clearPlan()
}

// Character Progression Phase 1B -- relays CharacterProgressionPanel.vue's
// own generic `answer` event straight to useCharacterProgression.ts's own
// `setAnswer`, which records the tentative selection and re-previews
// automatically. This page still calculates nothing about WHICH choice or
// WHAT it means -- see this file's own confirmProgressionLevelUp comment
// immediately above for the identical "server decides, this page relays"
// rule.
function answerProgressionChoice({ choiceId, selected }: { choiceId: string; selected: string[] }) {
  progression.setAnswer(choiceId, selected)
}

// ---------------------------------------------------------------------------
// Roll System Phase 2 -- ability/save/skill click-to-roll. `useWorldRolls`
// is the ONLY roll composable this page calls; it sends a source, never a
// number (see this file's own header above). Destructured to plain
// top-level refs, matching `useCharacterSheet`'s own destructuring pattern
// (not `useCharacterMutations`'s `reactive()`-grouped shape), since
// `useWorldRolls` returns one flat set of refs, not several named groups.
// ---------------------------------------------------------------------------

const {
  pending: rollPending,
  error: rollError,
  history: rollHistory,
  nextCursor: rollNextCursor,
  historyPending: rollHistoryPending,
  historyError: rollHistoryError,
  requestRoll,
  ingestRoll,
  refreshHistory: refreshRollHistory,
  loadMoreHistory: loadMoreRollHistory
} = useWorldRolls(worldId)

// Loads this character's existing rolls once, on entry -- Phase 2C's own
// "History persists" (surviving a page reload, not just a session) --
// scoped to THIS character (`actorCharacterId`) rather than the whole
// World, matching the sheet's own single-character focus everywhere else.
refreshRollHistory({ actorCharacterId: characterId.value }).catch(() => {})

function loadMoreRolls() {
  loadMoreRollHistory({ actorCharacterId: characterId.value }).catch(() => {})
}

// Sheet-wide, not per-row: every roll this page requests until changed
// shares one visibility choice, matching §5's exact two Phase-1 states.
// Defaults to the fail-closed state (§13), same as the server's own
// default when this were omitted entirely.
const rollVisibility = ref<RollVisibility>('private')

function requestSheetRoll(sourceType: 'ability' | 'saving_throw' | 'skill', sourceKey: string) {
  // Errors surface through `rollError` (set by the composable itself); a
  // rejected promise here would otherwise be an unhandled rejection with
  // nothing left for this handler to do about it.
  requestRoll({
    sourceType,
    actorCharacterId: characterId.value,
    sourceKey,
    visibility: rollVisibility.value
  }).catch(() => {})
}

function rollAbility(row: CharacterAbilityRow) {
  requestSheetRoll('ability', row.sourceKey)
}

function rollSave(row: CharacterSaveRow) {
  requestSheetRoll('saving_throw', row.sourceKey)
}

function rollSkill(row: CharacterSkillRow) {
  requestSheetRoll('skill', row.sourceKey)
}

// Character Sheet Body Phase 1A -- weapon/unarmed Attack/Damage rolls.
// Same pipeline as ability/save/skill above (useWorldRolls().requestRoll,
// same rollVisibility, same Roll Tray) -- the only difference is `actionId`
// in place of `sourceKey`, since the server names the roll by WHICH action
// to resolve, not which single already-evaluated Value to read (see
// server/utils/roll-events.ts's own createActionAttackRollEvent/
// createActionDamageRollEvent). Spell actions stay on
// `mutations.combat.resolve` below, untouched.
function rollActionAttack({ actionId }: { actionId: string }) {
  requestRoll({
    sourceType: 'action_attack',
    actorCharacterId: characterId.value,
    actionId,
    visibility: rollVisibility.value
  }).catch(() => {})
}

function rollActionDamage({ actionId }: { actionId: string }) {
  requestRoll({
    sourceType: 'damage',
    actorCharacterId: characterId.value,
    actionId,
    visibility: rollVisibility.value
  }).catch(() => {})
}

// ---------------------------------------------------------------------------
// CHARACTER SHEET BODY PHASE 1B.2 -- AUTHORITATIVE CAST FOUNDATION
// ---------------------------------------------------------------------------
// `castPending`/`castError` mirror `rollPending`/`rollError`'s own shape,
// kept separate because a Cast is a different request (POST .../cast, which
// can mutate spellcasting state) than a plain untargeted roll (POST .../rolls)
// -- CharacterActionsPanel.vue's own `casting` prop and `cast`/`spellDamage`
// emits are the client half of that same split. Cast never sends a spell's
// attack bonus, level, damage dice, or slot cost -- only which action to
// Cast and this page's own shared roll visibility, exactly like
// `rollActionAttack`/`rollActionDamage` immediately above.
const castPending = ref(false)
const castError = ref('')
// Character Sheet Body Phase 1B.3 -- see CharacterActionsPanel.vue's own
// `notice` prop header for why this exists and why it is styled neutrally,
// never as an error. Cleared automatically a few seconds after being set;
// a fresh Cast (success OR failure) also clears it immediately, so it never
// lingers describing a stale Cast.
const castNotice = ref('')
let castNoticeTimeout: ReturnType<typeof setTimeout> | undefined

// Character Sheet Body Phase 1B.3 -- restated (not imported) from
// app/lib/spell-mechanics/character-cast.ts's own `CastSaveContext`: this
// page never imports server types (`server/` -> `app/` is the one-way
// boundary every sibling panel's own restated prop already follows, e.g.
// CharacterActionsPanel.vue's own CombatOutcome).
type CastSaveContext = {
  savingAbility: string
  saveDc: number
  spellLevel: number
  castLevel: number | null
  damage?: { dice?: { count: number; faces: number }; modifier: number; type?: string; saveOutcome?: string }
  choices?: Record<string, string>
}

type CastResponse = {
  ok: true
  // Character Sheet Body Phase 1B.3 -- optional now that a saving-throw
  // Cast may legitimately produce no dice roll at all (see
  // character-cast.ts's own `castSpellSave`).
  roll?: RollEventRecord
  saveContext?: CastSaveContext
  spellcasting?: { spells: unknown[]; expendedSlots: Record<string, number> }
  // CHARACTER MECHANICS PHASE A5, Phase 3 -- present ONLY for a
  // RESOURCE-funded Cast, mutually exclusive with `spellcasting` above
  // (server/utils/character-cast.ts's own `CastResourceContext`).
  resourceContext?: { resourceId: string; max: number; expended: number; remaining: number }
}

const SAVE_ABILITY_LABELS: Record<string, string> = {
  str: 'Strength', dex: 'Dexterity', con: 'Constitution', int: 'Intelligence', wis: 'Wisdom', cha: 'Charisma'
}

function describeSaveContext(actionName: string, saveContext: CastSaveContext): string {
  const ability = SAVE_ABILITY_LABELS[saveContext.savingAbility] ?? saveContext.savingAbility.toUpperCase()
  return `${actionName} cast — ${ability} Save, DC ${saveContext.saveDc}`
}

// Character Sheet Body Phase 1B.2.1 (Cast Configuration) -- `castLevel`/
// `choices` are the player's own Cast Configuration selections
// (CharacterActionsPanel.vue's own `castPayload`), forwarded verbatim.
// This page performs no validation of either -- server/utils/character-cast.ts
// independently re-derives and re-verifies both against this character's
// own authoritative state; the page is a pass-through, exactly like it
// already is for `actionId`/`intent`.
async function postCast(
  actionId: string,
  intent: 'cast' | 'damage',
  castLevel?: number,
  choices?: Record<string, string>,
  fundingResourceId?: string
) {
  if (castPending.value) return
  castPending.value = true
  castError.value = ''
  castNotice.value = ''
  if (castNoticeTimeout) clearTimeout(castNoticeTimeout)
  const clickedAt = performance.now()

  try {
    const response = await $fetch<CastResponse>(
      `/api/worlds/${worldId.value}/characters/${characterId.value}/cast`,
      { method: 'POST', body: { actionId, intent, castLevel, choices, fundingResourceId, visibility: rollVisibility.value } }
    )
    // Feeds the SAME animation-queue-then-history pipeline `requestRoll`
    // uses for its own POST .../rolls response -- the Roll Tray needs no
    // second ingestion path and cannot tell a Cast's roll apart from any
    // other (see useWorldRolls.ts's own `ingestRoll` header). A
    // saving-throw Cast (Fireball/Acid Splash's own Cast, not Damage) may
    // have no roll at all -- see character-cast.ts's own "WHAT DOES CAST
    // ROLL?" note. Never fed an undefined roll into the Roll Tray pipeline;
    // never a fabricated d20 just so Cast "feels" active.
    if (response.roll) {
      ingestRoll(response.roll, clickedAt, performance.now())
    } else if (response.saveContext) {
      const action = characterActions.value.find((candidate) => candidate.id === actionId)
      castNotice.value = describeSaveContext(action?.name ?? 'Spell', response.saveContext)
      castNoticeTimeout = setTimeout(() => { castNotice.value = '' }, 6000)
    }

    // Authoritative resource refresh, no reload: present ONLY when this
    // Cast actually expended a slot (server/utils/character-cast.ts's own
    // `CastSpellResult.spellcasting`) -- assigning the server's own
    // already-computed record directly, never re-deriving or re-PUTting a
    // client-computed guess, which is exactly the duplicate-arithmetic/
    // drift risk this task's own instructions warn against.
    if (response.spellcasting) {
      sheet.spellcastingExpendedSlots.value = response.spellcasting.expendedSlots
    }

    // CHARACTER MECHANICS PHASE A5, Phase 3 -- a RESOURCE-funded Cast's
    // authoritative post-expenditure state, applied through the SAME
    // generic override machinery the Resource Orbs' own expend/restore
    // mutations already use (`sheet.setResourceOverride`) -- never a
    // second, drifting resource-presentation path.
    if (response.resourceContext) {
      sheet.setResourceOverride(response.resourceContext.resourceId, response.resourceContext.expended)
    }
  } catch (caught: any) {
    castError.value = caught?.data?.statusMessage || caught?.statusMessage || 'Failed to cast this spell'
  } finally {
    castPending.value = false
  }
}

function castSpell({ actionId, castLevel, choices, fundingResourceId }: { actionId: string; castLevel?: number; choices?: Record<string, string>; fundingResourceId?: string }) {
  postCast(actionId, 'cast', castLevel, choices, fundingResourceId)
}

function rollSpellDamage({ actionId, castLevel, choices, fundingResourceId }: { actionId: string; castLevel?: number; choices?: Record<string, string>; fundingResourceId?: string }) {
  postCast(actionId, 'damage', castLevel, choices, fundingResourceId)
}

// Phase 4B.7 -- the Roll Tray's manual dice rack. Same visibility, same
// requestRoll, same pipeline as every ability/save/skill click above --
// only the source differs (a plain expression, via `sourceType: 'custom'`,
// instead of a Rules Engine sourceKey).
function rollManualDie(die: ManualDieOption) {
  requestRoll(buildManualRollRequestBody(die, rollVisibility.value)).catch(() => {})
}

const {
  assembly,
  blueprint,
  notAvailableMessage,
  errorMessage,
  pending,
  error,
  identity,
  derived,
  derivedPending,
  derivedInitialLoading,
  derivedRefreshError,
  derivedUnavailable,
  derivedRegions,
  maxHp,
  hitDiceMax,
  hitDiceAvailable,
  hitDieSize,
  summaryValues,
  characterLevel,
  spellcastingIsCaster,
  spellcastingAbilityMod,
  spellcastingSaveDc,
  spellcastingAttackBonus,
  inventoryItems,
  inventoryOptions,
  noteDraft,
  healthDraft,
  characterImageUrlDraft,
  canEditCharacter,
  spellItems,
  spellOptions,
  slotLevels,
  characterResources,
  actions: characterActions,
  actionsPending,
  actionsUnavailableMessage,
  combatTargetOptions,
  encounter,
  conditions
} = sheet

// CHARACTER MECHANICS PHASE A5, Phase 3 (Resource-Funded Spellcasting) --
// `characterResources` is `DerivedResource[]` (server/utils/character-derived.ts),
// whose `label` is OPTIONAL; CharacterActionsPanel.vue's own funding picker
// needs a required `label` to render a pill (cast-funding.ts's own
// `CharacterResourceView`). Normalized at this boundary, matching the
// project's own established "Directus returns a looser shape than the UI
// needs; normalize at the call site" convention (see normalizeMap/normalizeUser).
const actionsCharacterResources = computed(() =>
  characterResources.value.map((resource) => ({
    id: resource.id,
    label: resource.label ?? resource.id,
    max: resource.max,
    expended: resource.expended,
    remaining: resource.remaining
  }))
)

// ---------------------------------------------------------------------------
// Notes -- state and saving only; the pure module owns the shape. The one
// domain this phase deliberately did NOT move into useCharacterMutations.ts
// -- see that composable's own header for why (its task-scoped mutation
// list names Recovery/Combat/Inventory/Spellcasting/Conditions, not Notes).
// ---------------------------------------------------------------------------

const notesSaving = ref(false)
const notesError = ref('')

async function saveNotes(next: StoredCharacterNotes) {
  if (notesSaving.value) return

  const previous = noteDraft.value
  noteDraft.value = next
  notesSaving.value = true
  notesError.value = ''

  try {
    await $fetch(`/api/worlds/${worldId.value}/characters/${characterId.value}/notes`, {
      method: 'PUT',
      body: next
    })
  } catch (saveError: any) {
    noteDraft.value = previous
    notesError.value =
      saveError?.data?.statusMessage || saveError?.statusMessage || 'Failed to save notes'
  } finally {
    notesSaving.value = false
  }
}

// ---------------------------------------------------------------------------
// Vitals Bar -- Phase 3. Composes values already exposed by useCharacterSheet
// / useCharacterMutations into the shape CharacterVitalsBar.vue needs; no
// new fetch, no new arithmetic on a Rules Engine value (`characterClassName`
// only picks which already-resolved slot's title to show).
// ---------------------------------------------------------------------------

const characterClassName = computed(() => {
  const classSection = identity.value.sections.find((section) => section.key === 'class')
  if (!classSection) return ''
  return classSection.slot.status === 'resolved' ? classSection.slot.entry.title : 'Missing'
})

const isMyTurn = computed(() => conditions.myCombatant?.isCurrentTurn ?? false)

// One combined CharacterSaveIndicator for the whole page (§7.8: "a single
// CharacterSaveIndicator in the vitals bar, not per-panel text") --
// composed from every mutation domain's own saving/error, including Notes.
const vitalsSaving = computed(() =>
  mutations.recovery.saving
  || mutations.combat.resolving
  || mutations.inventory.saving
  || mutations.spellcasting.saving
  // D&D 2024 Character Rules Phase 2A.2 -- Generic Character Resources'
  // own saving flag, folded in alongside every other mutation domain's.
  || mutations.resources.saving
  || encounter.pending
  || notesSaving.value
)

const vitalsError = computed(() =>
  mutations.recovery.error
  || mutations.combat.error
  || mutations.inventory.error
  || mutations.spellcasting.error
  || mutations.resources.error
  || encounter.error
  || notesError.value
  // REAL BROWSER DEFECT HOTFIX (D&D 2024 Character Rules Phase 2A.2) -- a
  // failed derived-character REFRESH (as opposed to the true initial-load
  // failure, which `derivedUnavailable` already surfaces on its own) no
  // longer blanks Abilities/Saves; it surfaces here instead, alongside
  // whatever stale-but-valid derived character stays rendered. See
  // useCharacterSheet.ts's own `derivedRefreshError`.
  || derivedRefreshError.value
)

// ---------------------------------------------------------------------------
// Shell -- Corrective Phase 2R. `tabs`/`activeTab`/`setActiveTab` are still
// useCharacterSheetLayout.ts's (URL-synced tab state is still useful, per
// this task's own KEEP list). Every tab's content renders identically in
// both presentations; see the PRESENTATION section below.
// ---------------------------------------------------------------------------

const abilityEntries = computed(() => derived.value?.byCategory?.[ABILITIES_CATEGORY] ?? [])
const saveEntries = computed(() => derived.value?.byCategory?.[SAVES_CATEGORY] ?? [])
const skillEntries = computed(() => derived.value?.byCategory?.[SKILLS_CATEGORY] ?? [])

// Phase 4B: which sections this character has -- from what the package
// and the character actually provide, never a system id. A package with
// no abilities/saves has no Stats section, one with no skills category no
// Skills section, and Spells exists only for a character who casts or
// knows a spell.
const sectionAvailability = computed(() => ({
  stats: Boolean(abilityEntries.value.length || saveEntries.value.length),
  skills: skillEntries.value.length > 0,
  spells: spellcastingIsCaster.value === true || spellItems.value.length > 0
}))

const {
  sections,
  activeTab,
  mainSection,
  setActiveTab,
  context,
  contextEntity,
  openContext,
  closeContext
} = useCharacterSheetLayout(sectionAvailability)

// ---------------------------------------------------------------------------
// PRESENTATION -- Phase 4C. Desktop or Companion, from the width the World
// workspace gives this page (see useCharacterSheetPresentation.ts). Both
// render every piece of content below; only the arrangement differs. The
// measurement is the scroll root's border box, and the inspector's
// contraction is padding inside it, so opening the inspector never
// switches presentation.
// ---------------------------------------------------------------------------

const workspaceEl = ref<HTMLElement | null>(null)
const { presentation, density, resolved: presentationResolved } = useCharacterSheetPresentation(workspaceEl)

// Full desktop: the inspector is the workspace right rail and the whole
// sheet contracts beside it (the roster page's `pr-[380px]` precedent).
// Compact desktop and companion: the same drawer in a bottom sheet, so
// nothing is laid over the gameplay columns.
const inspectorAsRail = computed(() => presentation.value === 'desktop' && density.value === 'full')
const inspectorContractsSheet = computed(() => Boolean(context.value) && inspectorAsRail.value)

// Interaction continuity (Phase 4C) -- the player's in-progress work in
// the panels (form input, searches, the chosen target, pending cast
// configuration, unsaved notes) lives here, above both presentations, so a
// desktop/companion switch remounts the layout without losing it. See
// characterSheetInteractionState.ts. A different character opened in this
// same page instance starts clean.
const interactionState = reactive(emptyCharacterSheetInteractionState())
provide(CHARACTER_SHEET_INTERACTION_KEY, interactionState)
watch(characterId, () => resetCharacterSheetInteractionState(interactionState))

// ---------------------------------------------------------------------------
// WHICH RULE CATEGORY RENDERS WHERE -- Desktop IA pass, corrected by
// Header Phases H1 and H2
// ---------------------------------------------------------------------------
// Abilities and saves have a bespoke home in the left region (H2 gives
// abilities the one H1 deliberately left open -- see
// CharacterReferencePanels.vue's own header for the Abilities-then-Saves
// order), skills a bespoke home as the persistent table, and proficiency
// bonus a bespoke home in the command center's vitals row
// (CharacterVitalsBar's own `proficiencyBonus` prop) -- one more category
// is routed to the left region as reference (defenses). Everything else
// still falls through to the generic Derived section in the Character
// tab, which is what keeps a package declaring categories Eldra has never
// heard of visible instead of dropped.
//
// This selects by CATEGORY and never by Definition id -- §13.2's whole
// point -- and computes nothing: each list is handed to a renderer exactly
// as the engine produced it.
// ---------------------------------------------------------------------------


// Reference regions, minus anything the header's summary strip already
// shows (Armor Class) -- one home per fact.
const summaryIds = computed(() => new Set(summaryValues.value.map((entry) => entry.id)))

const referenceRegions = computed(() =>
  derivedRegions.value
    .filter((region) => REFERENCE_CATEGORIES.includes(region.category))
    .map((region) => ({ ...region, entries: region.entries.filter((entry) => !summaryIds.value.has(entry.id)) }))
    .filter((region) => region.entries.length > 0)
)

// Phase 4B rail regions: package-placed reference values (F1
// `presentation.sheet: 'reference'`) and the proficiency category's flags.
const presentedReferenceEntries = computed(() =>
  selectPresentedValues(derived.value?.byCategory ?? {}, 'reference').filter((entry) => !summaryIds.value.has(entry.id))
)
const proficiencyEntries = computed(() => derived.value?.byCategory?.['core.proficiency'] ?? [])

// Rest is offered when the package declares the Health values the
// Recovery System acts on; a package without them gets no Rest control.
const restAvailable = computed(() => maxHp.value !== null)

const otherDerivedRegions = computed(() =>
  derivedRegions.value.filter((region) => !HOMED_CATEGORIES.includes(region.category))
)

// ---------------------------------------------------------------------------
// CONTEXT DRAWER -- ELDRA'S OWN, NOT A NEW ONE
// ---------------------------------------------------------------------------
// Every handler below does the same thing: turn a panel's already-resolved
// payload into the shared `CharacterSheetContext` shape and hand it to
// useCharacterSheetLayout. There is NO FETCH here -- each panel already
// holds everything the drawer shows, because Character Assembly resolved it
// on the way in.
//
// Where a payload genuinely carries no prose (Assembly relays a spell's and
// an item's provenance and actions, but no description), the drawer shows
// the structured facts and says the pack publishes nothing further -- the
// same "absence is legal and visible" posture ContentPresentationPanel's
// own empty message already takes, never invented text.
// ---------------------------------------------------------------------------

function signedNumber(value: number): string {
  return value >= 0 ? `+${value}` : String(value)
}

// Phase 1A.1 Browser Polish -- the Context Rail explains WHY/HOW ("this
// action's formula, and the modifier your character actually applies"),
// the Action row now only shows WHAT WILL HAPPEN (resolveDamageText in
// CharacterActionsPanel.vue). Both read the exact same structured fields
// via the exact same `resolveActionDamage` helper -- never a second
// calculation, never prose-parsed.
function openActionContext(action: CharacterAction) {
  const lines: string[] = []
  if (action.range) lines.push(`Range: ${action.range}`)
  if (action.attackBonus !== undefined) lines.push(`Attack Bonus: ${signedNumber(action.attackBonus)}`)
  // Character Sheet Body Phase 1B.3 -- the saving ability alongside the DC
  // the row already glances ("DEX DC 13"), spelled out for the Rail's own
  // "why/how" reference role.
  if (action.spellMechanics?.resolution?.kind === 'saving-throw') {
    const ability = action.spellMechanics.resolution.savingAbility
    lines.push(`Saving Ability: ${SAVE_ABILITY_LABELS[ability] ?? ability.toUpperCase()}`)
  }
  if (action.saveDc !== undefined) lines.push(`Save DC: ${action.saveDc}`)
  if (action.damage) lines.push(`Damage: ${action.damage}`)

  const resolvedDamage = resolveActionDamage(action)
  if (resolvedDamage) {
    if (action.damageAbilityModifier !== undefined) {
      lines.push(`Damage Modifier: ${signedNumber(action.damageAbilityModifier)}`)
    }
    lines.push(`Resolved Damage: ${formatActionDamage(resolvedDamage)}`)
  }

  // Character Sheet Body Phase 1B.3 -- structured, source-reliable save
  // outcome ONLY (see app/lib/spell-mechanics/types.ts's own
  // SpellSaveOutcome header); never shown when the source's own phrasing
  // did not reliably match either pattern -- silence there is honest, not
  // a gap to fill with a guess.
  const saveOutcome = action.spellMechanics?.damage?.saveOutcome
  if (saveOutcome === 'half-on-save') lines.push('On Save: Half Damage')
  else if (saveOutcome === 'no-damage-on-save') lines.push('On Save: No Damage')

  // Character Sheet Body Phase 1B.4 -- a healing spell's own resolved roll
  // (Cure Wounds/Healing Word), read directly from spellMechanics/
  // healingAbilityModifier -- never a second calculation, mirroring
  // `resolveActionDamage`'s own "restated, not re-derived" discipline
  // above. The row's own Damage/text column deliberately shows nothing for
  // a healing spell (no separate Healing button, per this phase's own UX
  // requirement); this Rail is where its resolved expression lives.
  const healing = action.spellMechanics?.healing
  if (healing) {
    if (healing.usesSpellcastingModifier && action.healingAbilityModifier !== undefined) {
      lines.push(`Healing Modifier: ${signedNumber(action.healingAbilityModifier)}`)
    }
    if (healing.dice) {
      const totalModifier = healing.usesSpellcastingModifier
        ? healing.modifier + (action.healingAbilityModifier ?? 0)
        : healing.modifier
      const expression = `${healing.dice.count}d${healing.dice.faces}${totalModifier ? signedNumber(totalModifier) : ''}`
      lines.push(`Resolved Healing: ${expression}`)
    }
  }

  if (action.usage) lines.push(`Usage: ${action.usage}`)
  if (action.sourceBook) lines.push(`Source: ${action.sourceBook}`)

  // Phase 4B: an attack-capable row's own two rolls, offered again in the
  // inspector -- the same handlers the row calls. Spells keep Cast on
  // their row, where Cast Configuration lives.
  const rolls: CharacterSheetContextRoll[] = []
  const handlers: Record<string, () => void> = {}
  if (isAttackCapableAction(action)) {
    if (action.attackBonus !== undefined) {
      rolls.push({ id: 'attack', label: 'Attack', value: signedNumber(action.attackBonus) })
      handlers.attack = () => rollActionAttack({ actionId: action.id })
    }
    rolls.push({ id: 'damage', label: 'Damage', value: resolvedDamage ? formatActionDamage(resolvedDamage) : action.damage || '—' })
    handlers.damage = () => rollActionDamage({ actionId: action.id })
  }

  openSheetContext({
    kind: 'action',
    id: action.id,
    title: action.name,
    eyebrow: action.actionType || 'Action',
    detailLines: lines,
    summary: action.description || '',
    tags: [action.category],
    rolls
  }, handlers)
}

// Character Sheet Body Phase 1B.1 -- reads the canonical spell mechanics
// (spell.entry?.spellMechanics), when a Content Pack resolved one, for
// richer reference lines and the description this drawer used to hardcode
// to '' even though a resolved spell's description was one property access
// away. Reuses the EXACT same Context Rail (`openContext`) every other tab
// already opens through -- no second drawer, no new component.
function openSpellContext(spell: AssembledSpellEntry) {
  const mechanics = spell.entry?.spellMechanics
  const lines: string[] = []

  if (mechanics?.level != null) lines.push(`Level: ${mechanics.level === 0 ? 'Cantrip' : mechanics.level}`)
  if (mechanics?.school) lines.push(`School: ${mechanics.school}`)
  if (mechanics?.castingTime) lines.push(`Casting Time: ${mechanics.castingTime}`)
  if (mechanics?.range) lines.push(`Range: ${mechanics.range}`)
  if (mechanics?.components) lines.push(`Components: ${mechanics.components}`)
  if (mechanics?.duration) lines.push(`Duration: ${mechanics.duration}${mechanics.concentration ? ' (Concentration)' : ''}`)
  if (mechanics?.ritual) lines.push('Ritual')
  if (spell.entry?.sourceBook) lines.push(`Source: ${spell.entry.sourceBook}`)
  if (spell.status === 'missing' && spell.reason) lines.push(spell.reason)

  // Prefer the canonical mechanics' own description; fall back to the
  // Actions-projection's description (the same text, when spellMechanics
  // itself is unavailable -- an older/unresolved entry) rather than the
  // permanently-blank '' this used to hardcode.
  const summary = mechanics?.description || spell.entry?.actions?.[0]?.description || ''

  openSheetContext({
    kind: 'spell',
    id: spell.instanceId,
    title: spell.title,
    eyebrow: spell.status === 'custom' ? 'Homebrew Spell' : 'Spell',
    detailLines: lines,
    summary,
    tags: spell.prepared ? ['Prepared'] : []
  })
}

function openItemContext(item: AssembledInventoryItem) {
  const lines: string[] = [`Quantity: ${item.quantity}`]
  if (item.container) lines.push(`Container: ${item.container}`)
  if (item.notes) lines.push(item.notes)
  if (item.entry?.sourceBook) lines.push(`Source: ${item.entry.sourceBook}`)
  if (item.entry) lines.push(`Resolved from: ${item.entry.packageId}@${item.entry.packageVersion}`)
  if (item.status === 'missing' && item.reason) lines.push(item.reason)

  const tags: string[] = []
  if (item.equipped) tags.push('Equipped')
  if (item.attuned) tags.push('Attuned')

  openSheetContext({
    kind: 'item',
    id: item.instanceId,
    title: item.title,
    eyebrow: item.status === 'custom' ? 'Custom Item' : 'Item',
    detailLines: lines,
    summary: '',
    tags
  })
}

// Species/Class/Background. Unlike spells and items, these DO carry a
// published presentation model, so the drawer shows the pack's own prose.
function openFeatureContext(label: string, presentation: PresentationEntry | null | undefined, title: string) {
  const paragraphs = [
    ...(presentation?.description ?? []),
    ...(presentation?.sections ?? []).flatMap((section) => [section.title, ...section.paragraphs]),
    ...(presentation?.notes ?? [])
  ]

  openSheetContext({
    kind: 'feature',
    id: `${label}:${title}`,
    title,
    eyebrow: label,
    detailLines: (presentation?.facts ?? []).map((fact) => `${fact.label}: ${fact.value}`),
    summary: paragraphs.join('\n\n'),
    tags: presentation?.sourceBook ? [presentation.sourceBook] : []
  })
}

function openSkillContext(skill: CharacterSkillRow) {
  const lines = [`Bonus: ${skill.value}`]
  if (skill.qualifier) lines.push(`Ability: ${skill.qualifier.toUpperCase()}`)
  if (skill.proficient !== null) lines.push(`Proficient: ${skill.proficient ? 'Yes' : 'No'}`)

  openSheetContext({
    kind: 'skill',
    id: skill.key,
    title: skill.label,
    eyebrow: 'Skill',
    detailLines: lines,
    summary: '',
    tags: skill.proficient ? ['Proficient'] : [],
    rolls: [{ id: 'skill', label: 'Roll', value: skill.value }]
  }, { skill: () => rollSkill(skill) })
}

// Conditions open in the same inspector, from the header's chips.
function openConditionContext(condition: EncounterConditionView) {
  const lines: string[] = []
  if (condition.duration !== null) lines.push(`Duration: ${condition.duration} round${condition.duration === 1 ? '' : 's'}`)
  if (condition.source) lines.push(`Source: ${condition.source}`)

  openSheetContext({
    kind: 'condition',
    id: condition.id,
    title: condition.label,
    eyebrow: 'Condition',
    detailLines: lines,
    summary: '',
    tags: []
  })
}

// A class resource (Second Wind, Rage, ...) from the header, read from the
// already-derived resource -- its pool and the package's recovery rules.
const RECOVERY_TRIGGER_LABELS: Record<string, string> = { 'short-rest': 'Short Rest', 'long-rest': 'Long Rest' }

function openResourceContext(resourceId: string) {
  const resource = characterResources.value.find((candidate) => candidate.id === resourceId)
  if (!resource) return
  const lines = [`Remaining: ${resource.max - resource.expended} / ${resource.max}`]
  for (const rule of resource.recovery ?? []) {
    const amount = rule.amount === 'full' ? 'all uses' : `${rule.amount}`
    lines.push(`${RECOVERY_TRIGGER_LABELS[rule.trigger] ?? rule.trigger}: regain ${amount}`)
  }

  openSheetContext({
    kind: 'resource',
    id: resource.id,
    title: resource.label || resource.id,
    eyebrow: 'Resource',
    detailLines: lines,
    summary: '',
    tags: []
  })
}

// ---------------------------------------------------------------------------
// INSPECTOR ROLLS -- Phase 4B. A context payload names its rolls as data
// (CharacterSheetContextRoll); the handlers that run them stay here, bound
// to the same roll functions the originating row uses.
// ---------------------------------------------------------------------------
const contextRollHandlers = shallowRef<Record<string, () => void>>({})

function openSheetContext(next: CharacterSheetContext, handlers: Record<string, () => void> = {}) {
  contextRollHandlers.value = handlers
  openContext(next)
}

watch(context, (current) => {
  if (!current) contextRollHandlers.value = {}
})

function runContextRoll(roll: CharacterSheetContextRoll) {
  contextRollHandlers.value[roll.id]?.()
}
</script>

<template>
  <!-- World Backdrop Activation. `bg-transparent`, matching every sibling
       world-workspace page: `world-workspace.vue` already paints the
       page's Ground plus the World's configured backdrop (Page Setup /
       WorldPagePresentationPanel, per `pageKey`) BEHIND this page's
       `<slot />`. An opaque root here would hide that backdrop. The
       sheet's own surfaces are translucent glass over it. -->
  <!-- Phase 4C: the measured character workspace (see PRESENTATION in the
       script). On full desktop, while the inspector is open as the
       workspace right rail (WorldEntityContextDrawer, fixed, 380px), the
       WHOLE sheet contracts by that width -- the roster page's
       `pr-[380px]` precedent -- and reflows through its own container
       queries. Nothing is reserved while it is closed. -->
  <div
    ref="workspaceEl"
    class="h-full overflow-y-auto bg-transparent"
    :class="inspectorContractsSheet ? 'pr-[380px]' : ''"
  >
    <!-- Roll Tray Rail milestone (correction) -- the previous round placed the Roll Tray as a
         flex sibling to the RIGHT of the sheet column, which read as "far right of the sheet,"
         not the required placement. The reference is CreationStageRail.vue's own placement in
         create-v2.vue: `<CreationStageRail />` is the FIRST child of that page's own
         `flex h-full min-w-0` row, immediately beside Eldra's global workspace navigation, with
         the stage content as the flex-1 sibling AFTER it. This outer row mirrors that exactly --
         the Roll Tray rail first, flush against the content column's own left edge, then the
         sheet's centered box as the flex-1 sibling -- so the rail sits between the global nav
         and the sheet, not beside the sheet's far edge. `@container/sheet` moves back onto the
         centered sheet box itself (its original role, before the prior round's placement):
         DesktopLayout/CompanionLayout's own `@container sheet` queries resolve to the NEAREST
         ancestor carrying this name, and that box is once again the thing whose width actually
         reflects what the sheet has left after the rail.

         `h-full` HERE is required, not cosmetic: WorldRollTray.vue's own sidebar rail asks for
         `h-full` so it spans the full workspace height (matching Stages) rather than collapsing
         to its own dice-controls/history content height -- the bug this round corrects. A
         percentage height only resolves against a DEFINITE ancestor height; without `h-full` on
         THIS row, it would stay `auto` (sized to its tallest child, the sheet column), and the
         rail's own `h-full` would resolve to nothing. `items-start` (unchanged) means the sheet
         column itself keeps its own natural/auto height regardless -- taller sheet content still
         simply overflows this row's bottom edge, exactly as before, and `workspaceEl`'s own
         `overflow-y-auto` still scrolls it; only the rail is now forced to the full workspace
         height no matter how short the sheet's own content is. -->
    <div class="flex h-full min-w-0 items-start">
      <!-- Roll Tray rail -- FIRST flex child, matching CreationStageRail.vue's own placement
           relative to the global nav. `variant="sidebar"` (WorldRollTray.vue's own prop) renders
           the SAME roll state/props/events/history this page already owns (useWorldRolls(),
           unchanged) as a vertical rail-or-panel -- see that component's own header for the full
           design. -->
      <WorldRollTray
        variant="sidebar"
        :rolls="rollHistory"
        :pending="rollPending"
        :error="rollError"
        :history-pending="rollHistoryPending"
        :history-error="rollHistoryError"
        :has-more="Boolean(rollNextCursor)"
        empty-message="No rolls yet. Click an ability, saving throw, or skill to roll it."
        @load-more="loadMoreRolls"
        @roll-manual-die="rollManualDie"
      >
        <template #header-actions>
          <div class="flex items-center gap-1 text-[0.6rem] uppercase tracking-[0.14em]">
            <button
              type="button"
              class="rounded-none px-2 py-1 transition"
              :class="rollVisibility === 'private' ? 'eldra-well text-eldra-text-strong' : 'text-eldra-text-faint hover:text-eldra-text-soft'"
              @click="rollVisibility = 'private'"
            >
              Private
            </button>
            <button
              type="button"
              class="rounded-none px-2 py-1 transition"
              :class="rollVisibility === 'table' ? 'eldra-well text-eldra-text-strong' : 'text-eldra-text-faint hover:text-eldra-text-soft'"
              @click="rollVisibility = 'table'"
            >
              Table
            </button>
          </div>
        </template>
      </WorldRollTray>

      <div class="@container/sheet mx-auto min-w-0 max-w-[1880px] flex-1 px-3 pb-10 pt-3 sm:px-6 sm:pt-6">
      <div
        v-if="pending"
        class="text-sm text-eldra-text-faint"
      >
        Loading this character's Assembly…
      </div>

      <div
        v-else-if="error"
        class="rounded-none border border-red-900 bg-red-950/40 p-4 text-sm text-red-300"
      >
        {{ errorMessage }}
      </div>

      <div v-else-if="assembly && !assembly.available">
        <CharacterEmptyState
          icon="i-lucide-file-question"
          :message="notAvailableMessage"
        />
      </div>

      <!-- Until the workspace has been measured (one frame after mount)
           the presentation is unknown, so neither layout is shown -- a
           phone never flashes the desktop sheet. Rendered identically on
           the server and in the first client render, so hydration
           matches. Static: no loading animation. -->
      <div
        v-else-if="blueprint && !presentationResolved"
        class="grid gap-3"
        aria-busy="true"
        aria-label="Preparing character sheet"
        data-sheet-placeholder
      >
        <div class="eldra-glass-surface h-28 border" />
        <div class="eldra-sheet-panel h-64" />
      </div>

      <CharacterSheetShell
        v-else-if="blueprint"
        :sections="sections"
        :active-section="activeTab"
        :main-section="mainSection"
        :inspector-open="Boolean(context)"
        :inspector-label="context ? `${context.title} details` : 'Details'"
        :presentation="presentation"
        :desktop-inspector="inspectorAsRail ? 'rail' : 'sheet'"
        @select-section="setActiveTab"
        @close-inspector="closeContext"
      >
        <!-- Phones: the bar that replaces the header once it scrolls away.
             Name, HP (still the HP control's target -- tapping it scrolls
             back up to the full header), and the first summary value. -->
        <template #condensed>
          <div class="eldra-glass-surface flex h-full items-center gap-3 border px-3 max-md:pl-16">
            <span class="eldra-display min-w-0 flex-1 truncate text-base text-eldra-text-strong">
              {{ identity.characterTitle || 'Character' }}
            </span>
            <span class="shrink-0 text-sm tabular-nums text-eldra-text-strong">
              <span class="text-[0.55rem] font-semibold uppercase tracking-[0.16em] text-eldra-accent-text">HP</span>
              {{ healthDraft.currentHp }}<span class="text-eldra-text-faint">/{{ maxHp ?? '—' }}</span>
            </span>
            <span
              v-if="summaryValues[0]"
              class="shrink-0 text-sm tabular-nums text-eldra-text-strong"
            >
              <span class="text-[0.55rem] font-semibold uppercase tracking-[0.16em] text-eldra-text-faint">{{ summaryValues[0].label }}</span>
              {{ formatDerivedValue(summaryValues[0]) }}
            </span>
          </div>
        </template>

        <template #header>
          <CharacterSheetHeader
            class="max-md:pl-16"
            :presentation="presentation"
            :world-id="worldId"
            :character-title="identity.characterTitle"
            :image-url="characterImageUrlDraft"
            :can-edit-portrait="canEditCharacter"
            :portrait-saving="mutations.portrait.saving"
            :portrait-error="mutations.portrait.error"
            :level="characterLevel"
            :identity-rows="identity.identityRows"
            :health="healthDraft"
            :max-hp="maxHp"
            :hit-dice-max="hitDiceMax"
            :hit-dice-available="hitDiceAvailable"
            :hit-die-size="hitDieSize"
            :summary-values="summaryValues"
            :resources="characterResources"
            :resources-pending-ids="mutations.resources.pendingIds"
            :slot-levels="slotLevels"
            :spell-saving="mutations.spellcasting.saving"
            :conditions="conditions.mine"
            :in-encounter="encounter.isInSelected"
            :is-my-turn="isMyTurn"
            :round="encounter.view?.round ?? null"
            :rest-available="restAvailable"
            :saving="vitalsSaving"
            :error="vitalsError"
            :recovery-saving="mutations.recovery.saving"
            :recovery-error="mutations.recovery.error"
            :remove-condition="mutations.conditions.remove"
            @save="mutations.recovery.save"
            @recovery="mutations.recovery.apply"
            @expend-resource="mutations.resources.expend"
            @restore-resource="mutations.resources.restore"
            @expend-slot="mutations.spellcasting.expendSlot"
            @restore-slot="mutations.spellcasting.restoreSlot"
            @update-portrait="mutations.portrait.update"
            @clear-portrait="mutations.portrait.clear"
            @select-condition="openConditionContext"
            @select-resource="openResourceContext"
          />
        </template>

        <!-- Reference rail -- rendered once; the shell places it (a column,
             or the phone's Stats section). `:pending` is
             `derivedInitialLoading`, not `derivedPending`, so a refresh
             never blanks values already on screen. -->
        <template
          v-if="sectionAvailability.stats || proficiencyEntries.length || derivedInitialLoading || !derived"
          #rail
        >
          <CharacterReferencePanels
            :ability-entries="abilityEntries"
            :save-entries="saveEntries"
            :reference-regions="referenceRegions"
            :presented-entries="presentedReferenceEntries"
            :proficiency-entries="proficiencyEntries"
            :pending="derivedInitialLoading"
            :unavailable-message="derived ? '' : derivedUnavailable"
            :rolling="rollPending"
            @roll-ability="rollAbility"
            @roll-save="rollSave"
          />
        </template>

        <template
          v-if="sectionAvailability.skills"
          #skills
        >
          <h3 class="eldra-sheet-heading">
            Skills
          </h3>
          <CharacterSkillList
            :entries="skillEntries"
            :rolling="rollPending"
            @select="openSkillContext"
            @roll="rollSkill"
          />
        </template>

        <template #main>
          <div
            v-if="mainSection === 'actions'"
            class="grid gap-6"
          >
            <!-- Actions: Attack/Damage rolls and Cast on each row; Info
                 opens the inspector beside the list. See
                 CharacterActionsPanel.vue's own header. -->
            <section aria-label="Actions">
              <CharacterActionsPanel
                :actions="characterActions"
                :pending="actionsPending"
                :error-message="actionsUnavailableMessage || mutations.combat.error || rollError || castError"
                :notice="castNotice"
                :target-options="combatTargetOptions"
                :results="mutations.combat.results"
                :resolving="mutations.combat.resolving"
                :rolling="rollPending"
                :casting="castPending"
                :slot-levels="slotLevels"
                :character-resources="actionsCharacterResources"
                @resolve="mutations.combat.resolve"
                @attack="rollActionAttack"
                @damage="rollActionDamage"
                @cast="castSpell"
                @spell-damage="rollSpellDamage"
                @select="openActionContext"
              />
            </section>

            <section aria-label="Encounter">
              <CharacterEncounterPanel
                :encounter="encounter"
                :mutations="mutations.conditions"
              >
                <template #conditions>
                  <CharacterConditionsPanel
                    v-if="encounter.isInSelected"
                    :conditions="conditions"
                    :mutations="mutations.conditions"
                    :pending="encounter.pending"
                    :encounter-ended="encounter.view?.status === 'ended'"
                  />
                </template>
              </CharacterEncounterPanel>
            </section>
          </div>

          <div
            v-else-if="mainSection === 'spells'"
            class="grid gap-6"
          >
            <section aria-label="Spellcasting">
              <CharacterSpellcastingPanel
                :spells="spellItems"
                :options="spellOptions"
                :is-caster="spellcastingIsCaster"
                :ability-mod="spellcastingAbilityMod"
                :save-dc="spellcastingSaveDc"
                :attack-bonus="spellcastingAttackBonus"
                :saving="mutations.spellcasting.saving"
                :error-message="mutations.spellcasting.error"
                @add="mutations.spellcasting.add"
                @remove="mutations.spellcasting.remove"
                @toggle-flag="mutations.spellcasting.toggleFlag"
                @select="openSpellContext"
              />
            </section>
          </div>

          <section
            v-else-if="mainSection === 'inventory'"
            aria-label="Inventory"
          >
            <CharacterInventoryPanel
              :items="inventoryItems"
              :options="inventoryOptions"
              :saving="mutations.inventory.saving"
              :error-message="mutations.inventory.error"
              @add="mutations.inventory.add"
              @remove="mutations.inventory.remove"
              @change-quantity="mutations.inventory.changeQuantity"
              @toggle-flag="mutations.inventory.toggleFlag"
              @select="openItemContext"
            />
          </section>

          <div
            v-else-if="mainSection === 'features'"
            class="grid gap-6"
          >
            <!-- Species/Class/Background prose and traits, each also
                 openable in the inspector from its Details control. -->
            <section
              v-for="section in identity.sections"
              :key="section.key"
              :aria-label="section.label"
            >
              <div class="flex items-center gap-3">
                <h3 class="eldra-sheet-heading min-w-0 flex-1">
                  {{ section.label }}
                </h3>
                <button
                  v-if="section.slot.status === 'resolved' && section.slot.entry.presentation"
                  type="button"
                  class="-mt-2 shrink-0 text-xs text-eldra-text-faint underline-offset-4 transition hover:text-eldra-text-soft hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-eldra-accent pointer-coarse:min-h-11"
                  :aria-label="`${section.slot.entry.title} details`"
                  @click="openFeatureContext(section.label, section.slot.entry.presentation, section.slot.entry.title)"
                >
                  Details
                </button>
              </div>

              <template v-if="section.slot.status === 'resolved'">
                <div
                  v-if="!section.slot.entry.presentation"
                  class="break-words text-xl font-semibold text-eldra-text-strong"
                >
                  {{ section.slot.entry.title }}
                </div>

                <ContentPresentationPanel
                  :entry="section.slot.entry.presentation"
                  context="detail"
                  :empty-message="`This Content Pack publishes no further details for this ${section.label.toLowerCase()}.`"
                />

                <p class="mt-4 break-words border-t border-eldra-accent/14 pt-3 text-xs text-eldra-text-ghost">
                  Resolved from {{ section.slot.entry.packageId }}@{{ section.slot.entry.packageVersion }}
                </p>
              </template>

              <div
                v-else
                class="rounded-none border border-red-900 bg-red-950/40 p-3"
              >
                <div class="text-sm font-semibold uppercase tracking-[0.1em] text-red-300">
                  Missing
                </div>
                <p class="mt-1 text-sm text-red-200">
                  {{ section.slot.reason }}
                </p>
                <dl
                  v-if="section.slot.packageId"
                  class="mt-2 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-xs"
                >
                  <dt class="text-red-300/70">
                    Package
                  </dt>
                  <dd class="text-red-200">
                    {{ section.slot.packageId }}
                  </dd>
                </dl>
              </div>
            </section>
          </div>

          <section
            v-else-if="mainSection === 'notes'"
            aria-label="Notes"
          >
            <CharacterNotesPanel
              :notes="noteDraft"
              :saving="notesSaving"
              :error-message="notesError"
              @save="saveNotes"
            />
          </section>

          <div
            v-else-if="mainSection === 'details'"
            class="grid gap-6"
          >
            <!-- Details: everything the old Character tab held that is not
                 Features -- ability score editing, the Level Manager
                 (Game Admin only), and every derived category without a
                 bespoke home, so a package's unfamiliar categories stay
                 visible. -->
            <p class="text-sm text-eldra-text-faint">
              <NuxtLink
                :to="`/worlds/${worldId}/characters/${characterId}/abilities`"
                class="text-eldra-accent underline underline-offset-2 hover:text-eldra-accent-text"
              >
                {{ blueprint.abilityScores ? 'Edit ability scores' : 'Assign ability scores' }}
              </NuxtLink>
            </p>

            <section
              v-if="canEditCharacter"
              aria-labelledby="sheet-level-heading"
            >
              <h3
                id="sheet-level-heading"
                class="eldra-sheet-heading"
              >
                Level Manager
              </h3>
              <CharacterProgressionPanel
                :current-level="characterLevel"
                :pending="derivedInitialLoading"
                :error-message="derived ? '' : derivedUnavailable"
                :plan="progression.plan.value"
                :plan-pending="progression.planPending.value"
                :plan-error-message="progression.planError.value"
                :confirming="progression.confirming.value"
                :confirm-error-message="progression.confirmError.value"
                @preview="requestProgressionPreview"
                @confirm="confirmProgressionLevelUp"
                @clear-plan="clearProgressionPlan"
                @answer="answerProgressionChoice"
              />
            </section>

            <section aria-labelledby="sheet-derived-heading">
              <div class="flex items-center gap-3">
                <h3
                  id="sheet-derived-heading"
                  class="eldra-sheet-heading min-w-0 flex-1"
                >
                  Derived
                </h3>
                <p
                  v-if="derived"
                  class="-mt-2 shrink-0 break-words text-xs text-eldra-text-ghost"
                >
                  {{ derived.packageId }}@{{ derived.packageVersion }}
                </p>
              </div>

              <p
                v-if="derivedPending"
                class="text-sm text-eldra-text-faint"
              >
                Evaluating this character against the World's rules…
              </p>

              <p
                v-else-if="!derived"
                class="rounded-none border border-dashed border-eldra-accent/24 p-4 text-sm text-eldra-text-faint"
              >
                {{ derivedUnavailable }}
              </p>

              <div
                v-else
                class="grid gap-5"
              >
                <div
                  v-for="region in otherDerivedRegions"
                  :key="region.category"
                  class="min-w-0"
                >
                  <h4 class="mb-2 text-[0.65rem] uppercase tracking-[0.2em] text-eldra-text-faint">
                    {{ region.label }}
                  </h4>
                  <CharacterDerivedPanel :entries="region.entries" />
                </div>

                <div
                  v-for="collection in derived.collections"
                  :key="collection.id"
                  class="min-w-0"
                >
                  <h4 class="mb-2 text-[0.65rem] uppercase tracking-[0.2em] text-eldra-text-faint">
                    {{ collection.label || 'Equipment Slots' }}
                  </h4>
                  <div class="flex flex-wrap gap-2">
                    <CharacterStatChip
                      v-for="equipmentSlot in collection.slots"
                      :key="equipmentSlot.id"
                      :label="equipmentSlot.id"
                      :value="equipmentSlot.capacity"
                    />
                  </div>
                </div>

                <p
                  v-if="derived.pendingChoices.length"
                  class="text-xs leading-5 text-eldra-text-ghost"
                >
                  {{ derived.pendingChoices.length }} proficiency
                  {{ derived.pendingChoices.length === 1 ? 'choice is' : 'choices are' }}
                  still outstanding, so those proficiencies show as unselected.
                  <NuxtLink
                    :to="`/worlds/${worldId}/characters/${characterId}/proficiencies`"
                    class="text-eldra-accent underline underline-offset-2 hover:text-eldra-accent-text"
                  >
                    Choose them
                  </NuxtLink>.
                </p>
              </div>
            </section>
          </div>
        </template>

        <!-- Eldra's ONE context system. Full desktop: the workspace's
             standard right rail (overlay placement, the same 380px rail
             every other World page opens) with the page contracting beside
             it. Compact desktop and companion: the same drawer, inline, in
             the bottom sheet (CharacterSheetBottomSheet.vue). `content="detail"` skips the World Entity
             affordances. The lead slot repeats the originating row's own
             rolls, through the same handlers. -->
        <template #inspector>
          <WorldEntityContextDrawer
            :open="Boolean(context)"
            :entity="contextEntity"
            :world-id="worldId"
            content="detail"
            :rail-variant="inspectorAsRail ? 'workspace' : 'sheet'"
            :placement="inspectorAsRail ? 'overlay' : 'inline'"
            @close="closeContext"
          >
            <template
              v-if="context?.rolls?.length"
              #lead
            >
              <div class="mb-4 grid grid-cols-2 gap-2">
                <button
                  v-for="roll in context.rolls"
                  :key="roll.id"
                  type="button"
                  class="eldra-well eldra-rollable flex min-h-14 flex-col items-center justify-center gap-0.5 rounded-none border border-eldra-accent/30 px-3 py-2 disabled:cursor-not-allowed disabled:opacity-60"
                  :disabled="rollPending"
                  :aria-label="`Roll ${context.title} ${roll.label}, ${roll.value}`"
                  @click="runContextRoll(roll)"
                >
                  <span class="text-[0.55rem] font-semibold uppercase tracking-[0.18em] text-eldra-text-faint">{{ roll.label }}</span>
                  <span class="flex items-center gap-1.5 text-lg font-semibold tabular-nums text-eldra-text-strong">
                    {{ roll.value }}
                    <UIcon
                      name="i-lucide-dices"
                      class="eldra-roll-hint h-3.5 w-3.5"
                      aria-hidden="true"
                    />
                  </span>
                </button>
              </div>
            </template>
          </WorldEntityContextDrawer>
        </template>
      </CharacterSheetShell>
      </div>
    </div>
  </div>
</template>
