<script setup lang="ts">
// Actions for Character Sheet V2 -- the Character Actions System's surface,
// extended by Combat Resolution to EXECUTE the one action a player picks
// against one target. "What can my character do?", and now, simply,
// "what happened when they did it" -- never a combat tracker, never
// automation beyond the one action resolved.
//
// THIS COMPONENT CALCULATES NOTHING, the same rule CharacterDerivedPanel.vue
// already states for itself. `attackBonus`/`saveDc` (Actions) and every
// number inside a resolved `CombatOutcome` (Combat Resolution) all arrive as
// PROPS already evaluated/decided by the server
// (server/utils/character-actions.ts, server/utils/character-combat.ts) --
// this file reads them, never recomputes them, rolls a die, or decides
// hit/miss itself. Clicking "Resolve" emits INTENT
// ({ actionId, targetCharacterId }); the PAGE calls
// POST .../combat and hands the result back down as `results`, the exact
// same "panel emits, page calls the endpoint, result flows back as a prop"
// shape CharacterHealthPanel.vue's own Recovery actions already use.
//
// ---------------------------------------------------------------------------
// ATTACK / DAMAGE -- Character Sheet Body Phase 1A, WEAPON/UNARMED ONLY
// ---------------------------------------------------------------------------
// A weapon or unarmed attack-roll action (`isAttackCapableAction`, shared
// with server/utils/character-actions.ts's own gate so the two can never
// disagree) no longer gets the targeted "Resolve" control at all -- it gets
// two untargeted rolls instead: `attack` ({ actionId }) rolls 1d20 against
// this action's own Attack Bonus, `damage` ({ actionId }) rolls its damage
// dice/modifier. Neither compares to a target's Armor Class, decides
// hit/miss, or touches anyone's HP -- both are plain roll INTENT, handled
// exactly like an ability/save/skill click (the page's own `useWorldRolls()`
// call, not `mutations.combat`), and their result surfaces through the
// existing Roll Tray, never a result box in this row. Spell actions (a
// spell attack roll or a saving-throw spell) are unaffected: they still
// carry a `resolution` but fail `isAttackCapableAction`, so they keep the
// original targeted Resolve control and its inline CombatOutcome box below,
// completely unchanged by this phase.
//
// ---------------------------------------------------------------------------
// PHASE 1A.1 -- ROW INTERACTION POLISH: ROW CLICK = ATTACK
// ---------------------------------------------------------------------------
// Phase 1A rendered Attack/Damage as two buttons stacked BELOW the row,
// leaving the row itself a `select` control (open details) -- visually
// disconnected from the row it acted on and taller than it needed to be.
// Corrected here to match CharacterSkillList.vue's own Phase 2B.1 "rolling
// is the primary interaction" shape: for an attack-capable action, the
// row's PRIMARY surface (name/category/range/attack-bonus/damage/notes) IS
// the Attack button (`attack()`, the exact same Phase 1A handler, never a
// second request path) -- Damage and Info are its semantic SIBLINGS, not
// nested inside it (a button cannot legally contain a button), placed in
// the same visual row exactly as CharacterSkillList.vue places its own
// roll-button + info-button pair. Info reuses that component's exact
// `i-lucide-info` visual language and, like there, opens the existing
// Context Rail (`select`) rather than rolling anything. Every OTHER action
// (spell, non-attack) is completely unchanged below: still one row-wide
// button whose click opens details, per this file's own FILTERS/MATERIAL
// notes above.
//
// ---------------------------------------------------------------------------
// A TABLE, NOT A PILE OF CARDS -- Desktop IA pass
// ---------------------------------------------------------------------------
// Rebuilt against the reference sheet's own Actions tab, whose single
// biggest usability advantage over V2's card grid is that it is a TABLE:
// one row per action, fixed columns (attack, range, hit/DC, damage, notes),
// so a player scans down one column instead of reading six boxes. Cards
// forced every action to be as tall as its prose; rows make twelve actions
// legible at once.
//
// The prose itself is not deleted, it MOVES: clicking a row opens it in
// Eldra's shared context drawer (`select`), which is the same progressive
// disclosure V1 had via its own four detail drawers and the reason lists
// can stay dense. This component does not own or know about that drawer --
// it emits the intent and the page decides, exactly as it already does for
// Resolve.
//
// ---------------------------------------------------------------------------
// FILTERS -- STRUCTURED, NEVER PROSE-MATCHED, NEVER SYSTEM LANGUAGE
// ---------------------------------------------------------------------------
// DND5E Playability Audit (Step 7): the previous filter bar showed pills
// built from raw `actionType` strings (never actually "Action / Bonus
// Action / Reaction" -- for a weapon that is "Melee Attack", for a spell it
// is "Level 1 Spell (Evocation)", one pill per school/level combination) and
// a "Resolvable only" toggle -- internal engine vocabulary (`resolution`
// presence) a player has no reason to understand, and one that actively hid
// legitimate castable utility spells with no attack/save (Shield, Cure
// Wounds) since those never carry a `resolution`. Both are replaced with a
// filter over `category`, the one distinction this data actually and always
// supports honestly: Attacks (weapon + unarmed) and Spells. A pill for
// Bonus Actions/Reactions is NOT added -- weapon/unarmed actions carry no
// action-economy field at all, so that distinction is not something this
// data can honestly support yet (see character-actions.ts's own note on
// why Species/Class/Background rows, the other source of noise, are not in
// this list at all any more).
//
// ---------------------------------------------------------------------------
// A SINGLE SHARED TARGET, NOT A TARGETING UI
// ---------------------------------------------------------------------------
// One plain `<select>` of the World's other characters, shared by every
// SPELL resolvable row -- "a simple way to execute an action", deliberately
// not a spatial/map-based target picker (explicitly out of scope). Weapon/
// unarmed rows no longer use this target at all (see this file's own ATTACK
// / DAMAGE note above). A non-attack/non-save spell (Shield, Cure Wounds)
// gets no control either, matching `attackBonus`/`saveDc`'s own "absent
// means not applicable" rule -- it is still a real, castable action, just
// not one this system resolves automatically.
//
// ---------------------------------------------------------------------------
// MOBILE
// ---------------------------------------------------------------------------
// The column headings are desktop-only; below `md` each row stacks into a
// name plus a wrapped meta line, so nothing is lost and nothing scrolls
// sideways. The target `<select>`, every filter pill, and every Resolve
// button stay at min-h-11 (44px), matching every other control in this
// Sheet.
//
// ---------------------------------------------------------------------------
// MATERIAL
// ---------------------------------------------------------------------------
// Every row now carries `eldra-well`, where previously only resolvable rows
// did. That is not a loosening of Design Language §8 Rule 2 ("interactive
// controls always sit on a Steel well") but a consequence of it: as of this
// pass EVERY row is interactive, because every row opens its detail. The
// resolvable/passive distinction it used to carry is now shown by the
// affordance that actually differs -- the Resolve control -- rather than by
// the surface.

import { isAttackCapableAction, resolveActionDamage, formatActionDamage } from '~/lib/content-actions'
import type { ActionCategory, ActionResolution as ContentActionResolution } from '~/lib/content-actions'
import { classifySpellCastCapability, resolveCastConfiguration } from '~/lib/spell-mechanics'
import type { CanonicalSpellMechanics, CastConfigurationViewModel } from '~/lib/spell-mechanics'
import type { SpellSlotLevel } from '~/lib/characters/spellcasting'

export type CharacterActionCategory = ActionCategory
// Restated (not hand-duplicated) from app/lib/content-actions/types.ts --
// unlike server/utils/character-combat.ts's own CombatOutcome shape below,
// this is already an app/lib module, so importing it directly (rather than
// re-declaring it by hand) carries none of the "app/ must never import from
// server/" risk this file's own header warns about for the server-shaped
// prop.
export type ActionResolution = ContentActionResolution

export type CharacterAction = {
  id: string
  name: string
  category: CharacterActionCategory
  actionType: string
  range?: string
  damage?: string
  description?: string
  usage?: string
  sourceBook?: string
  attackBonus?: number
  saveDc?: number
  resolution?: ActionResolution
  // Phase 1A.1 Browser Polish -- structured damage fields `resolveActionDamage`
  // (app/lib/content-actions/damage-presentation.ts) reads to present a
  // RESOLVED expression ("1d6+2 piercing", "2 bludgeoning") instead of raw
  // formula prose. `damageRoll`/`damageFlatBase`/`damageType` restate
  // ContentAction's own content-derived fields; `damageAbilityModifier`
  // restates CharacterAction's server-side Rules-Engine output (server/utils/
  // character-actions.ts) -- same "restated, not re-derived" rule this
  // file's own header already applies to `attackBonus`/`saveDc`.
  damageRoll?: { count: number; faces: number }
  damageFlatBase?: number
  damageType?: string
  damageAbilityModifier?: number
  // Character Sheet Body Phase 1B.2 (Authoritative Cast Foundation) --
  // present only for `category === 'spell'` actions, restated verbatim from
  // server/utils/character-actions.ts's own identical field. Read ONLY by
  // `classifySpellCastCapability` below, the SAME predicate
  // server/utils/character-cast.ts calls -- this panel decides "does this
  // row get a Cast button" with the exact rule the server will use to
  // decide "will Cast actually succeed", so the two can never disagree.
  // `CanonicalSpellMechanics` already lives in app/lib/ (app/lib/spell-mechanics),
  // so this is a direct import, not a second hand-copied type.
  spellMechanics?: CanonicalSpellMechanics | null
}

// Restated client-side from server/utils/character-combat.ts's own
// CombatResolutionSuccess -- `app/` must never import from `server/`, the
// same rule every other panel in this family already follows for its own
// server-shaped prop.
export type CombatOutcome = {
  hit: boolean
  critical: boolean
  attackRoll?: { roll: number; bonus: number; total: number; targetArmorClass: number }
  savingThrow?: { roll: number; bonus: number; total: number; dc: number; success: boolean }
  damage?: { rolls: number[]; modifier: number; total: number; type?: string; halvedFrom?: number }
  targetHealth: { currentHp: number }
}

const props = withDefaults(defineProps<{
  actions?: readonly CharacterAction[]
  pending?: boolean
  errorMessage?: string
  // Other characters in this World a resolvable action can target.
  targetOptions?: readonly { id: string; title: string }[]
  // The last CombatOutcome for a given action id, keyed by that id -- one
  // slot per action, matching "one attacker, one action, one target" (no
  // history, no log).
  results?: Record<string, CombatOutcome>
  resolving?: boolean
  // Character Sheet Body Phase 1A -- true while an Attack/Damage roll this
  // panel emitted is in flight (the page's own `useWorldRolls().pending`,
  // the same shared flag every ability/save/skill click already disables
  // against). One flag for both buttons on every row, matching `resolving`
  // above -- no per-row/per-action-id tracking, since a player only ever
  // has one roll in flight at a time.
  rolling?: boolean
  // Character Sheet Body Phase 1B.2 -- true while a Cast/spell-Damage
  // request this panel emitted is in flight (the page's own mutation
  // against POST .../cast). Separate from `rolling` because a Cast is a
  // different request (it can mutate spellcasting state) than a plain
  // roll, even though the UI shape is nearly identical -- mirrors
  // `resolving`/`rolling` already being two separate flags for the
  // identical reason (Resolve vs. Attack/Damage are different requests too).
  casting?: boolean
  // Character Sheet Body Phase 1B.2.1 (Cast Configuration) -- this
  // character's own already-derived Spell Slot levels
  // (app/lib/characters/spellcasting.ts's `SpellSlotLevel[]`, the page's
  // own `useCharacterSheet().slotLevels`), read-only here. This panel
  // computes NO Rules Engine arithmetic itself -- `resolveCastConfiguration`
  // (app/lib/spell-mechanics) is a pure function of exactly this array plus
  // a spell's own `spellMechanics`, the same shared primitive
  // server/utils/character-cast.ts uses for its own authoritative
  // validation. Client data can be stale (another tab just cast the last
  // slot); the server independently re-validates every Cast regardless --
  // this prop only drives what the PICKER shows, never what the server
  // accepts.
  slotLevels?: readonly SpellSlotLevel[]
}>(), {
  actions: () => [],
  pending: false,
  errorMessage: '',
  targetOptions: () => [],
  results: () => ({}),
  resolving: false,
  rolling: false,
  casting: false,
  slotLevels: () => []
})

const emit = defineEmits<{
  resolve: [{ actionId: string; targetCharacterId: string }]
  attack: [{ actionId: string }]
  damage: [{ actionId: string }]
  select: [CharacterAction]
  // Character Sheet Body Phase 1B.2 -- `cast` is the primary Cast/Attack
  // control for a supported spell (server decides which archetype from the
  // SAME actionId, see server/utils/character-cast.ts's own `castSpell`);
  // `spellDamage` is the independent Damage roll for an attack-roll spell
  // ONLY (never offered for an automatic-damage spell -- see this file's
  // own CAST ROW note below). Deliberately separate emit names from
  // `attack`/`damage` even though the UI shape is nearly identical: those
  // two hit the existing untargeted-roll path (POST .../rolls,
  // weapon/unarmed only), these two hit the new POST .../cast route -- the
  // page needs to tell them apart to call the right endpoint.
  //
  // Character Sheet Body Phase 1B.2.1 -- both payloads gain optional
  // `castLevel`/`choices`, populated ONLY when this spell's own Cast
  // Configuration actually has one to send (a cantrip with no choices sends
  // neither, exactly Fire Bolt's original Phase 1B.2 payload, unchanged).
  cast: [{ actionId: string; castLevel?: number; choices?: Record<string, string> }]
  spellDamage: [{ actionId: string; castLevel?: number; choices?: Record<string, string> }]
}>()

const CATEGORY_LABELS: Record<CharacterActionCategory, string> = {
  weapon: 'Weapon', unarmed: 'Unarmed', spell: 'Spell',
  species: 'Species', class: 'Class', background: 'Background'
}

function signed(value: number): string {
  return value >= 0 ? `+${value}` : String(value)
}

const targetCharacterId = ref('')

// ---------------------------------------------------------------------------
// Filtering -- see this file's header on why the timing pills are derived
// from the data rather than declared here.
// ---------------------------------------------------------------------------

const ALL_FILTER = '__all__'

type ActionFilterCategory = 'attacks' | 'spells'

function filterCategoryOf(action: CharacterAction): ActionFilterCategory | null {
  if (action.category === 'weapon' || action.category === 'unarmed') return 'attacks'
  if (action.category === 'spell') return 'spells'
  return null
}

const FILTER_LABELS: Record<ActionFilterCategory, string> = {
  attacks: 'Attacks',
  spells: 'Spells'
}

const availableFilters = computed(() => {
  const present = new Set<ActionFilterCategory>()
  for (const action of props.actions) {
    const category = filterCategoryOf(action)
    if (category) present.add(category)
  }
  return (['attacks', 'spells'] as const).filter((category) => present.has(category))
})

const activeFilter = ref<ActionFilterCategory | typeof ALL_FILTER>(ALL_FILTER)

// A filter that no longer matches anything this character has (equipment
// changed, a spell was unprepared) silently falls back to All rather than
// showing an empty table for a reason the player cannot see.
watch(availableFilters, (available) => {
  if (activeFilter.value !== ALL_FILTER && !available.includes(activeFilter.value)) {
    activeFilter.value = ALL_FILTER
  }
})

const visibleActions = computed(() =>
  props.actions.filter((action) => {
    if (activeFilter.value === ALL_FILTER) return true
    return filterCategoryOf(action) === activeFilter.value
  })
)

function resolve(actionId: string) {
  if (!targetCharacterId.value || props.resolving) return
  emit('resolve', { actionId, targetCharacterId: targetCharacterId.value })
}

function attack(actionId: string) {
  if (props.rolling) return
  emit('attack', { actionId })
}

function damage(actionId: string) {
  if (props.rolling) return
  emit('damage', { actionId })
}

// ---------------------------------------------------------------------------
// Cast row -- Character Sheet Body Phase 1B.2, Authoritative Cast Foundation
// ---------------------------------------------------------------------------
// `classifySpellCastCapability` is the SAME predicate server/utils/character-cast.ts
// calls -- this panel decides "does this row get a Cast button" with the
// identical rule the server uses to decide "will Cast actually succeed", so
// client and server can never invent different support rules (this task's
// own requirement). A spell whose capability is not one of the two
// supported kinds (a saving-throw spell, a healing/effect/choice/unknown
// spell) falls through to the existing `v-else` branch below, unchanged --
// it keeps its own targeted Resolve control if it has one, or a plain
// inspectable row if it doesn't. Never fabricates a Cast for anything this
// phase does not honestly support.
function castCapabilityOf(action: CharacterAction) {
  return classifySpellCastCapability({ category: action.category, spellMechanics: action.spellMechanics })
}

function isCastableSpell(action: CharacterAction): boolean {
  const capability = castCapabilityOf(action)
  return capability?.kind === 'supported-spell-attack' || capability?.kind === 'supported-automatic-damage'
}

// Damage stays an independent control ONLY for an attack-roll spell (Fire
// Bolt): its resource (none, for a cantrip) is already settled by Cast, so
// an extra Damage roll spends nothing further -- mirrors the weapon
// Attack/Damage split exactly. An automatic-damage spell (Magic Missile)
// NEVER gets this control: Cast already rolls its damage AND spends its
// slot in one step, so a second, independent Damage button would let a
// player roll it again for free with no slot spent -- this task's own
// "avoid a free-resource loophole" requirement.
function showsIndependentSpellDamage(action: CharacterAction): boolean {
  return castCapabilityOf(action)?.kind === 'supported-spell-attack'
}

// ---------------------------------------------------------------------------
// Cast Configuration -- Character Sheet Body Phase 1B.2.1
// ---------------------------------------------------------------------------
// `resolveCastConfiguration` is the SAME pure primitive server/utils/character-cast.ts
// reuses for its own authoritative validation (`legalCastLevelsFor`) -- this
// panel derives NO Rules Engine arithmetic of its own, it only decides what
// to SHOW and what to let the player SELECT. `props.slotLevels` can be
// stale (another tab just spent the last slot); the server independently
// re-derives and re-validates on every actual Cast/Damage request
// regardless -- sharing this calculation is about avoiding a second,
// possibly-drifting copy of the arithmetic, never about the client being
// authoritative.
function castConfigurationOf(action: CharacterAction): CastConfigurationViewModel {
  return resolveCastConfiguration({ mechanics: action.spellMechanics as CanonicalSpellMechanics, slotLevels: props.slotLevels })
}

// Which spell's Cast Configuration panel is currently open -- at most one
// at a time (matching `targetCharacterId`'s own single-shared-state
// precedent above). Selections persist keyed by actionId even after the
// panel closes, so a player who configured Chromatic Orb's damage type via
// Cast can click the row's own (closed-panel) Damage control afterward and
// have it reuse that exact selection -- see `onSpellDamageRowClick` below,
// and this task's own manual acceptance sequence (Cast, then Damage,
// without reopening configuration).
const openConfigActionId = ref<string | null>(null)
const selectedCastLevel = reactive<Record<string, number>>({})
const selectedChoices = reactive<Record<string, Record<string, string>>>({})

function selectedCastLevelFor(action: CharacterAction): number | null {
  return selectedCastLevel[action.id] ?? castConfigurationOf(action).defaultCastLevel
}

// Only a spell-defined CHOICE ever blocks confirmation -- a castLevel
// selection always has a sane fallback (`selectedCastLevelFor`'s own
// default), matching this task's own "does not fabricate a default type"
// rule applying to choices specifically, never to level selection.
function hasCompleteSelection(action: CharacterAction, config: CastConfigurationViewModel): boolean {
  return config.choices.every((choice) => selectedChoices[action.id]?.[choice.id] !== undefined)
}

function openConfiguration(action: CharacterAction, config: CastConfigurationViewModel) {
  if (openConfigActionId.value === action.id) {
    openConfigActionId.value = null
    return
  }
  openConfigActionId.value = action.id
  if (config.defaultCastLevel !== null && selectedCastLevel[action.id] === undefined) {
    selectedCastLevel[action.id] = config.defaultCastLevel
  }
}

function selectCastLevel(action: CharacterAction, level: number) {
  selectedCastLevel[action.id] = level
}

function selectChoiceOption(action: CharacterAction, choiceId: string, optionId: string) {
  selectedChoices[action.id] = { ...(selectedChoices[action.id] ?? {}), [choiceId]: optionId }
}

function castPayload(action: CharacterAction, config: CastConfigurationViewModel) {
  const level = config.castLevels.length ? selectedCastLevelFor(action) : null
  return {
    actionId: action.id,
    ...(level !== null ? { castLevel: level } : {}),
    ...(config.choices.length ? { choices: { ...selectedChoices[action.id] } } : {})
  }
}

// SIMPLE CASTS MUST REMAIN SIMPLE: no required choice and no meaningful
// casting-level selection means the primary surface Casts immediately --
// Fire Bolt, and a Magic Missile with only one legal slot level, never see
// a configuration panel at all, byte-identical to Phase 1B.2's own
// accepted one-click behavior. A spell requiring configuration opens (or
// closes) the panel instead; the confirm button INSIDE it is the only
// thing that ever actually Casts, matching "the user must still confirm
// Cast from the configuration surface."
function onCastPrimaryClick(action: CharacterAction) {
  if (props.casting) return
  const config = castConfigurationOf(action)
  if (!config.canCast) return
  if (!config.requiresConfiguration) {
    emit('cast', { actionId: action.id })
    return
  }
  openConfiguration(action, config)
}

function confirmCast(action: CharacterAction) {
  if (props.casting) return
  const config = castConfigurationOf(action)
  if (!hasCompleteSelection(action, config)) return
  emit('cast', castPayload(action, config))
  openConfigActionId.value = null
}

// The row's OWN (closed-panel) Damage control reuses whatever selection
// already exists for this row (from a prior Cast or a prior Damage
// confirmation) -- see this function's own header note above. Only opens
// configuration when nothing has ever been selected yet, since Damage must
// never silently default a choice (this task's own "no type was silently
// defaulted" requirement) any more than Cast may.
function onSpellDamageRowClick(action: CharacterAction) {
  if (props.casting) return
  const config = castConfigurationOf(action)
  if (config.requiresConfiguration && !hasCompleteSelection(action, config)) {
    openConfiguration(action, config)
    return
  }
  emit('spellDamage', castPayload(action, config))
}

function confirmSpellDamage(action: CharacterAction) {
  if (props.casting) return
  const config = castConfigurationOf(action)
  if (!hasCompleteSelection(action, config)) return
  emit('spellDamage', castPayload(action, config))
  openConfigActionId.value = null
}

const ORDINAL_SUFFIXES: Record<number, string> = { 1: 'st', 2: 'nd', 3: 'rd' }
function ordinal(level: number): string {
  const mod100 = level % 100
  if (mod100 >= 11 && mod100 <= 13) return `${level}th`
  return `${level}${ORDINAL_SUFFIXES[level % 10] ?? 'th'}`
}

// The "Hit / DC" column carries whichever of the two the action declares --
// absent stays absent, never a fabricated zero.
function hitOrDc(action: CharacterAction): string {
  if (action.attackBonus !== undefined) return signed(action.attackBonus)
  if (action.saveDc !== undefined) return `DC ${action.saveDc}`
  return '—'
}

// Phase 1A.1 Browser Polish -- the Damage column's RESOLVED text ("1d6+2
// piercing", "2 bludgeoning") in place of raw formula prose. Falls back to
// the presentation-only `damage` string exactly when `resolveActionDamage`
// has nothing authoritative to resolve (a spell, or a weapon/unarmed action
// whose ability modifier the Rules runtime hasn't supplied yet) -- never a
// fabricated number, the same discipline `hitOrDc` above already applies.
function resolvedDamageText(action: CharacterAction): string {
  const resolved = resolveActionDamage(action)
  return resolved ? formatActionDamage(resolved) : action.damage || '—'
}
</script>

<template>
  <div class="grid gap-3">
    <p
      v-if="errorMessage"
      class="rounded-none border border-red-900 bg-red-950/40 p-3 text-sm text-red-300"
    >
      {{ errorMessage }}
    </p>

    <!-- Filter bar. Pills are All / Attacks / Spells -- the one distinction
         this data actually and honestly supports (see this file's own
         header note on why "Resolvable only" and per-actionType pills are
         gone). -->
    <div
      v-if="actions.length"
      class="flex flex-wrap items-center gap-1.5"
    >
      <button
        type="button"
        class="min-h-11 rounded-none border px-3 text-xs uppercase tracking-[0.12em] transition"
        :class="activeFilter === ALL_FILTER
          ? 'border-[rgba(201,164,90,0.55)] text-[#fff7df]'
          : 'border-[rgba(201,164,90,0.20)] text-[#9f9278] hover:text-[#d8ceb8]'"
        :aria-pressed="activeFilter === ALL_FILTER"
        @click="activeFilter = ALL_FILTER"
      >
        All
      </button>

      <button
        v-for="category in availableFilters"
        :key="category"
        type="button"
        class="min-h-11 rounded-none border px-3 text-xs uppercase tracking-[0.12em] transition"
        :class="activeFilter === category
          ? 'border-[rgba(201,164,90,0.55)] text-[#fff7df]'
          : 'border-[rgba(201,164,90,0.20)] text-[#9f9278] hover:text-[#d8ceb8]'"
        :aria-pressed="activeFilter === category"
        @click="activeFilter = category"
      >
        {{ FILTER_LABELS[category] }}
      </button>
    </div>

    <!-- One shared target for every resolvable row below -- see this
         file's own header on why this is not a targeting UI. -->
    <label
      v-if="targetOptions.length"
      class="block"
    >
      <span class="mb-2 block text-xs uppercase tracking-[0.22em] text-[#9f9278]">Target</span>
      <select
        v-model="targetCharacterId"
        class="eldra-input min-h-11 w-full rounded-none px-3 py-2 text-sm text-white"
      >
        <option
          value=""
          class="bg-[#090909] text-[#f5e7bd]"
        >
          No target selected
        </option>
        <option
          v-for="option in targetOptions"
          :key="option.id"
          :value="option.id"
          class="bg-[#090909] text-[#f5e7bd]"
        >
          {{ option.title }}
        </option>
      </select>
    </label>

    <p
      v-if="pending"
      class="text-sm text-[#9f9278]"
    >
      Loading actions…
    </p>

    <p
      v-else-if="!actions.length"
      class="text-sm text-[#9f9278]"
    >
      Nothing yet — equip a weapon, prepare a spell, or check back once Species/Class/Background are set.
    </p>

    <p
      v-else-if="!visibleActions.length"
      class="text-sm text-[#9f9278]"
    >
      No actions match this filter.
    </p>

    <template v-else>
      <!-- Column headings, matching the reference sheet's own action table.
           Desktop only, and hidden from assistive technology: each row
           already carries its own labelled values. -->
      <div
        aria-hidden="true"
        class="hidden border-b border-[rgba(201,164,90,0.16)] px-3 pb-1 text-[0.55rem] uppercase tracking-[0.16em] text-[#6f6754] md:grid md:grid-cols-[minmax(0,1fr)_3.75rem_3.25rem_7rem_5rem_7.75rem] md:gap-3"
      >
        <span>Action</span>
        <span>Range</span>
        <span>Hit / DC</span>
        <span>Damage</span>
        <span>Notes</span>
        <span />
      </div>

      <ul class="grid gap-1">
        <li
          v-for="action in visibleActions"
          :key="action.id"
        >
          <!-- Phase 1A.1: attack-capable weapon/unarmed row -- see this
               file's own header. The primary button IS the Attack roll;
               Damage/Info are its siblings, never nested inside it. -->
          <div
            v-if="isAttackCapableAction(action)"
            class="eldra-well flex flex-col gap-1.5 rounded-none px-3 py-2 transition md:flex-row md:items-center md:gap-3"
          >
            <button
              type="button"
              class="block w-full min-w-0 rounded-none py-0 text-left transition focus-visible:ring-2 focus-visible:ring-[rgba(201,164,90,0.65)] disabled:cursor-not-allowed disabled:opacity-50 md:flex-1 md:grid md:grid-cols-[minmax(0,1fr)_3.75rem_3.25rem_7rem_5rem] md:items-center md:gap-3"
              :disabled="rolling"
              :aria-label="`Roll ${action.name} Attack, bonus ${hitOrDc(action)}`"
              @click="attack(action.id)"
            >
              <span class="block min-w-0">
                <span class="block truncate text-sm font-semibold text-[#fff7df]">{{ action.name }}</span>
                <span class="mt-0.5 block truncate text-[0.6rem] uppercase tracking-[0.12em] text-[#9f9278]">
                  {{ CATEGORY_LABELS[action.category] }}
                </span>
              </span>

              <!-- Below `md` the four table columns become one wrapped meta
                   line, each value still carrying its own label. Damage
                   shows the RESOLVED mechanic (Phase 1A.1 Browser Polish),
                   never raw formula prose -- see `resolvedDamageText`. -->
              <span class="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-[#d8ceb8] md:hidden">
                <span v-if="action.range"><span class="text-[#6f6754]">Range</span> {{ action.range }}</span>
                <span><span class="text-[#6f6754]">Attack</span> {{ hitOrDc(action) }}</span>
                <span><span class="text-[#6f6754]">Damage</span> {{ resolvedDamageText(action) }}</span>
                <span v-if="action.actionType"><span class="text-[#6f6754]">Timing</span> {{ action.actionType }}</span>
              </span>

              <span class="hidden truncate text-xs text-[#d8ceb8] md:block">{{ action.range || '—' }}</span>
              <span class="hidden text-sm font-semibold tabular-nums text-[#fff7df] md:block">{{ hitOrDc(action) }}</span>
              <span class="hidden truncate text-xs tabular-nums text-[#d8ceb8] md:block">{{ resolvedDamageText(action) }}</span>
              <span class="hidden truncate text-xs text-[#9f9278] md:block">{{ action.usage || action.actionType || '—' }}</span>
            </button>

            <!-- Info + Damage: independently focusable siblings of the
                 Attack button above. Info reuses CharacterSkillList.vue's
                 exact info-icon language and opens the existing Context
                 Rail (`select`); Damage keeps Phase 1A's existing
                 `damage()` handler, only relocated into this row. -->
            <div class="flex w-full items-center gap-1.5 md:w-auto">
              <button
                type="button"
                class="flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-none text-[#6f6754] transition hover:text-[#d8ceb8] focus-visible:ring-2 focus-visible:ring-[rgba(201,164,90,0.65)]"
                :aria-label="`View ${action.name} details`"
                @click="emit('select', action)"
              >
                <UIcon
                  name="i-lucide-info"
                  class="h-3.5 w-3.5"
                />
              </button>

              <button
                type="button"
                class="eldra-button min-h-11 flex-1 rounded-none px-3 text-xs font-semibold transition focus-visible:ring-2 focus-visible:ring-[rgba(201,164,90,0.65)] disabled:cursor-not-allowed disabled:opacity-50 md:flex-none md:px-4"
                :disabled="rolling"
                :aria-label="`Roll ${action.name} Damage`"
                @click="damage(action.id)"
              >
                Damage
              </button>
            </div>
          </div>

          <!-- Character Sheet Body Phase 1B.2/1B.2.1: a supported spell
               (Fire Bolt-shaped attack-roll, or Magic Missile-shaped
               automatic damage) -- mirrors the attack-capable row above
               almost exactly (same "primary button IS the roll, Info/Damage
               are its siblings" shape), but Cast hits the new
               POST .../cast route instead of .../rolls, Damage is only
               offered when it cannot create a free-resource loophole (see
               `showsIndependentSpellDamage` above), and a spell requiring
               Cast Configuration (a spell-defined choice, or more than one
               legal casting level) opens an inline panel below the row
               instead of Casting immediately -- see this file's own Cast
               Configuration header. -->
          <div
            v-else-if="isCastableSpell(action)"
            class="eldra-well flex flex-col gap-1.5 rounded-none px-3 py-2 transition md:flex-row md:flex-wrap md:items-center md:gap-3"
          >
            <button
              type="button"
              class="block w-full min-w-0 rounded-none py-0 text-left transition focus-visible:ring-2 focus-visible:ring-[rgba(201,164,90,0.65)] disabled:cursor-not-allowed disabled:opacity-50 md:flex-1 md:grid md:grid-cols-[minmax(0,1fr)_3.75rem_3.25rem_7rem_5rem] md:items-center md:gap-3"
              :disabled="casting || !castConfigurationOf(action).canCast"
              :aria-label="`Cast ${action.name}`"
              @click="onCastPrimaryClick(action)"
            >
              <span class="block min-w-0">
                <span class="block truncate text-sm font-semibold text-[#fff7df]">{{ action.name }}</span>
                <span class="mt-0.5 block truncate text-[0.6rem] uppercase tracking-[0.12em] text-[#9f9278]">
                  {{ CATEGORY_LABELS[action.category] }}
                </span>
              </span>

              <span class="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-[#d8ceb8] md:hidden">
                <span v-if="action.range"><span class="text-[#6f6754]">Range</span> {{ action.range }}</span>
                <span><span class="text-[#6f6754]">Hit/DC</span> {{ hitOrDc(action) }}</span>
                <span v-if="action.damage"><span class="text-[#6f6754]">Damage</span> {{ action.damage }}</span>
                <span v-if="action.actionType"><span class="text-[#6f6754]">Timing</span> {{ action.actionType }}</span>
              </span>

              <span class="hidden truncate text-xs text-[#d8ceb8] md:block">{{ action.range || '—' }}</span>
              <span class="hidden text-sm font-semibold tabular-nums text-[#fff7df] md:block">{{ hitOrDc(action) }}</span>
              <span class="hidden truncate text-xs tabular-nums text-[#d8ceb8] md:block">{{ action.damage || '—' }}</span>
              <span class="hidden truncate text-xs text-[#9f9278] md:block">{{ action.usage || action.actionType || '—' }}</span>
            </button>

            <div class="flex w-full items-center gap-1.5 md:w-auto">
              <button
                type="button"
                class="flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-none text-[#6f6754] transition hover:text-[#d8ceb8] focus-visible:ring-2 focus-visible:ring-[rgba(201,164,90,0.65)]"
                :aria-label="`View ${action.name} details`"
                @click="emit('select', action)"
              >
                <UIcon
                  name="i-lucide-info"
                  class="h-3.5 w-3.5"
                />
              </button>

              <button
                v-if="showsIndependentSpellDamage(action)"
                type="button"
                class="eldra-button min-h-11 flex-1 rounded-none px-3 text-xs font-semibold transition focus-visible:ring-2 focus-visible:ring-[rgba(201,164,90,0.65)] disabled:cursor-not-allowed disabled:opacity-50 md:flex-none md:px-4"
                :disabled="casting"
                :aria-label="`Roll ${action.name} Damage`"
                @click="onSpellDamageRowClick(action)"
              >
                Damage
              </button>
            </div>

            <!-- Cast Configuration -- Character Sheet Body Phase 1B.2.1. A
                 compact panel attached to this row, never a modal/new page/
                 Context Rail workflow (that stays reference-only, via Info
                 above). Casting level pills only render when more than one
                 legal level actually exists (SIMPLE CASTS MUST REMAIN
                 SIMPLE); every declared spell choice renders unconditionally
                 -- both share one Cast/Damage confirm pair at the bottom. -->
            <div
              v-if="openConfigActionId === action.id"
              class="w-full border-t border-[rgba(201,164,90,0.16)] pt-2"
            >
              <div
                v-if="castConfigurationOf(action).castLevels.length > 1"
                class="mb-2"
              >
                <span class="mb-1 block text-[0.6rem] uppercase tracking-[0.16em] text-[#9f9278]">Cast At</span>
                <div class="flex flex-wrap gap-1.5">
                  <button
                    v-for="level in castConfigurationOf(action).castLevels"
                    :key="level.level"
                    type="button"
                    class="min-h-9 rounded-none border px-3 text-xs uppercase tracking-[0.08em] transition focus-visible:ring-2 focus-visible:ring-[rgba(201,164,90,0.65)] disabled:cursor-not-allowed disabled:opacity-40"
                    :class="selectedCastLevelFor(action) === level.level
                      ? 'border-[rgba(201,164,90,0.55)] text-[#fff7df]'
                      : 'border-[rgba(201,164,90,0.20)] text-[#9f9278] hover:text-[#d8ceb8]'"
                    :disabled="!level.available"
                    :aria-pressed="selectedCastLevelFor(action) === level.level"
                    @click="selectCastLevel(action, level.level)"
                  >
                    {{ ordinal(level.level) }}
                  </button>
                </div>
              </div>

              <div
                v-for="choice in castConfigurationOf(action).choices"
                :key="choice.id"
                class="mb-2"
              >
                <span class="mb-1 block text-[0.6rem] uppercase tracking-[0.16em] text-[#9f9278]">{{ choice.label }}</span>
                <div class="flex flex-wrap gap-1.5">
                  <button
                    v-for="option in choice.options"
                    :key="option.id"
                    type="button"
                    class="min-h-9 rounded-none border px-3 text-xs uppercase tracking-[0.08em] transition focus-visible:ring-2 focus-visible:ring-[rgba(201,164,90,0.65)]"
                    :class="selectedChoices[action.id]?.[choice.id] === option.id
                      ? 'border-[rgba(201,164,90,0.55)] text-[#fff7df]'
                      : 'border-[rgba(201,164,90,0.20)] text-[#9f9278] hover:text-[#d8ceb8]'"
                    :aria-pressed="selectedChoices[action.id]?.[choice.id] === option.id"
                    @click="selectChoiceOption(action, choice.id, option.id)"
                  >
                    {{ option.label }}
                  </button>
                </div>
              </div>

              <div class="flex gap-1.5">
                <button
                  type="button"
                  class="eldra-button min-h-11 flex-1 rounded-none px-3 text-xs font-semibold transition focus-visible:ring-2 focus-visible:ring-[rgba(201,164,90,0.65)] disabled:cursor-not-allowed disabled:opacity-50 md:flex-none md:px-4"
                  :disabled="casting || !hasCompleteSelection(action, castConfigurationOf(action))"
                  @click="confirmCast(action)"
                >
                  {{ casting ? 'Casting…' : 'Cast' }}
                </button>

                <button
                  v-if="showsIndependentSpellDamage(action)"
                  type="button"
                  class="eldra-button min-h-11 flex-1 rounded-none px-3 text-xs font-semibold transition focus-visible:ring-2 focus-visible:ring-[rgba(201,164,90,0.65)] disabled:cursor-not-allowed disabled:opacity-50 md:flex-none md:px-4"
                  :disabled="casting || !hasCompleteSelection(action, castConfigurationOf(action))"
                  @click="confirmSpellDamage(action)"
                >
                  Damage
                </button>
              </div>
            </div>
          </div>

          <!-- Every other action (spell, non-attack) -- unchanged: the
               whole row opens details, and Combat Resolution's targeted
               Resolve control (spell attack roll / saving throw) sits
               below it. -->
          <template v-else>
            <button
              type="button"
              class="eldra-well block w-full rounded-none px-3 py-2 text-left transition md:grid md:grid-cols-[minmax(0,1fr)_3.75rem_3.25rem_7rem_5rem] md:items-center md:gap-3"
              :aria-label="`${action.name} — open details`"
              @click="emit('select', action)"
            >
              <span class="block min-w-0">
                <span class="block truncate text-sm font-semibold text-[#fff7df]">{{ action.name }}</span>
                <span class="mt-0.5 block truncate text-[0.6rem] uppercase tracking-[0.12em] text-[#9f9278]">
                  {{ CATEGORY_LABELS[action.category] }}
                </span>
              </span>

              <!-- Below `md` the four table columns become one wrapped meta
                   line, each value still carrying its own label. -->
              <span class="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-[#d8ceb8] md:hidden">
                <span v-if="action.range"><span class="text-[#6f6754]">Range</span> {{ action.range }}</span>
                <span><span class="text-[#6f6754]">Hit/DC</span> {{ hitOrDc(action) }}</span>
                <span v-if="action.damage"><span class="text-[#6f6754]">Damage</span> {{ action.damage }}</span>
                <span v-if="action.actionType"><span class="text-[#6f6754]">Timing</span> {{ action.actionType }}</span>
              </span>

              <span class="hidden truncate text-xs text-[#d8ceb8] md:block">{{ action.range || '—' }}</span>
              <span class="hidden text-sm font-semibold tabular-nums text-[#fff7df] md:block">{{ hitOrDc(action) }}</span>
              <span class="hidden truncate text-xs tabular-nums text-[#d8ceb8] md:block">{{ action.damage || '—' }}</span>
              <span class="hidden truncate text-xs text-[#9f9278] md:block">{{ action.usage || action.actionType || '—' }}</span>
            </button>

            <template v-if="action.resolution">
              <button
                type="button"
                class="eldra-button mt-1 min-h-11 w-full rounded-none px-3 text-xs font-semibold disabled:cursor-not-allowed disabled:opacity-50 md:w-auto md:px-4"
                :disabled="!targetCharacterId || resolving"
                @click="resolve(action.id)"
              >
                {{ resolving ? 'Resolving…' : 'Resolve' }}
              </button>

              <div
                v-if="results[action.id]"
                class="mt-1 rounded-none border p-2 text-xs leading-5"
                :class="results[action.id]!.hit
                  ? 'border-[rgba(158,195,125,0.4)] bg-[rgba(158,195,125,0.08)] text-[#d8ceb8]'
                  : 'border-[rgba(201,164,90,0.20)] bg-[rgba(20,17,12,0.4)] text-[#9f9278]'"
              >
                <template v-if="results[action.id]!.attackRoll">
                  <div>
                    Attack roll {{ results[action.id]!.attackRoll!.roll }}
                    {{ signed(results[action.id]!.attackRoll!.bonus) }}
                    = {{ results[action.id]!.attackRoll!.total }}
                    vs AC {{ results[action.id]!.attackRoll!.targetArmorClass }}
                    — <strong>{{ results[action.id]!.critical ? 'Critical Hit' : results[action.id]!.hit ? 'Hit' : 'Miss' }}</strong>
                  </div>
                </template>
                <template v-else-if="results[action.id]!.savingThrow">
                  <div>
                    Target save {{ results[action.id]!.savingThrow!.roll }}
                    {{ signed(results[action.id]!.savingThrow!.bonus) }}
                    = {{ results[action.id]!.savingThrow!.total }}
                    vs DC {{ results[action.id]!.savingThrow!.dc }}
                    — <strong>{{ results[action.id]!.savingThrow!.success ? 'Save Succeeded' : 'Save Failed' }}</strong>
                  </div>
                </template>

                <div v-if="results[action.id]!.damage && results[action.id]!.damage!.total > 0">
                  Damage: {{ results[action.id]!.damage!.total }}
                  <template v-if="results[action.id]!.damage!.type">({{ results[action.id]!.damage!.type }})</template>
                  <template v-if="results[action.id]!.damage!.halvedFrom">
                    — halved from {{ results[action.id]!.damage!.halvedFrom }}
                  </template>
                </div>

                <div class="mt-1 text-[#6f6754]">
                  Target HP remaining: {{ results[action.id]!.targetHealth.currentHp }}
                </div>
              </div>
            </template>
          </template>
        </li>
      </ul>
    </template>
  </div>
</template>
