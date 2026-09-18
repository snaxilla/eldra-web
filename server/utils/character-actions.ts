// Character Actions -- "what can my character do?"
//
// Composes exactly the same two modules every other gameplay-derived server
// util does -- assembleCharacter (species/class/background/inventory/spells,
// already joined to the catalogue, each entry now optionally carrying
// `actions` -- see world-content-catalogue.ts's own Character Actions System
// note) and getDerivedCharacter (Melee/Ranged/Spell Attack Bonus, Spell Save
// DC) -- and adds no new concept beyond "read what content grants, attach
// the Rules Engine number each grant needs, and return the combined list."
// No new architecture: this is the SAME shape server/utils/character-recovery.ts
// itself already is (assembleCharacter -> getDerivedCharacter -> combine),
// with a READ at the end instead of a write.
//
// ---------------------------------------------------------------------------
// ACTIONS ARE PRESENTATION, NOT COMBAT
// ---------------------------------------------------------------------------
// This module states what a character is CAPABLE of; it resolves nothing.
// No hit is rolled, no damage is applied, no save is made. `attackBonus` and
// `saveDc` are the exact numbers the Rules Engine already computed for
// Health/Armor Class/Spellcasting, attached to a row so a player can read
// them -- never combined with a d20, never compared to anything.
//
// ---------------------------------------------------------------------------
// UNARMED STRIKE -- THE ONE ACTION THIS MODULE SYNTHESIZES RATHER THAN READS
// ---------------------------------------------------------------------------
// Every character can make an Unarmed Strike regardless of loadout or
// Content Pack -- the same "a real, structural default, not invented
// content" status Armor Class's 10-plus-Dex baseline already has for an
// unarmored character (packages/eldra-dnd5e-2024/definitions.json's own
// `value:defenses.armor_class` formula). Its damage EXPRESSION is a static,
// non-computed string (2024 RAW: "1 + Strength modifier bludgeoning") --
// this task's own instruction that damage is "presentation only" applies
// here exactly as it does to a weapon's printed dice, which is why this is
// not itself "hardcoding a D&D action": no Rules Engine number decides
// whether this action EXISTS, only which Attack Bonus it shows.
//
// ---------------------------------------------------------------------------
// WHICH ITEMS AND SPELLS BECOME ACTIONS
// ---------------------------------------------------------------------------
// Weapons: only EQUIPPED ones -- the same filter Armor Class's own worn-armor
// Source already uses (a weapon in a backpack is not a readied attack).
// Spells: only PREPARED ones -- "what can my character do RIGHT NOW", not
// everything they have ever learned; mirrors 5e's own rule that only
// prepared spells are castable. A resolved spell missing its own
// content-derived action (a custom/homebrew entry, or one whose Content Pack
// went missing) still gets a minimal action carrying its name alone, so a
// player's homebrew spell is not silently absent from their own action list.

import { assembleCharacter, type CharacterAssemblyBlueprint } from './character-assembly'
import { getDerivedCharacter } from './character-derived'
import type { ActionCategory, ContentAction } from '../../app/lib/content-actions'
import { isAttackCapableAction } from '../../app/lib/content-actions'

export type CharacterAction = ContentAction & {
  // Stable within one character's assembled list -- the `:key` a Sheet's
  // v-for needs, and what "no duplicate actions" is checked against. Built
  // here, never by a content resolver: identity of an ASSEMBLED action
  // (this weapon, carried by this character) is this module's concern, not
  // a fact any Content Pack publishes.
  id: string
  // Rules Engine output, attached here -- absent exactly when
  // getDerivedCharacter's own result says numbers are unavailable (no Rules
  // Package activated, or a broken one). Actions still lists NAMES in that
  // case; see this module's own header on why a missing number degrades the
  // row rather than the whole list.
  attackBonus?: number
  saveDc?: number
}

export type CharacterActionsResult =
  | { available: true; actions: CharacterAction[] }
  | { available: false; reason: 'character-not-found' }
  | { available: false; reason: 'no-catalogue-selection'; message: string }

const MELEE_ATTACK_BONUS_ID = 'value:combat.melee_attack_bonus'
const RANGED_ATTACK_BONUS_ID = 'value:combat.ranged_attack_bonus'
const SPELL_ATTACK_BONUS_ID = 'value:spellcasting.attack_bonus'
const SPELL_SAVE_DC_ID = 'value:spellcasting.save_dc'

function findNumber(byCategory: Record<string, Array<{ id: string; value?: unknown }>>, id: string): number | undefined {
  for (const entries of Object.values(byCategory)) {
    const entry = entries.find((candidate) => candidate.id === id)
    if (entry) return typeof entry.value === 'number' ? entry.value : undefined
  }
  return undefined
}

// Deterministic, stable within one character's list -- the same
// "byte-identical on every read" discipline character-actor-bridge.ts's own
// SourceInstance ids already follow. `key` is whatever the caller has that
// is already unique within `category` (an item/spell's own `instanceId`, or
// a running index for content with none) -- never a content name alone,
// which two different traits could share.
function actionId(category: ActionCategory, key: string | number): string {
  return `${category}:${key}`
}

// `resolution` is present (it IS an attack roll) but `damageRoll` is not --
// RAW 2024 Unarmed Strike damage is a FLAT "1 + Strength modifier", never
// dice, so there is nothing for `damageRoll` (a dice payload) to hold.
// server/utils/character-combat.ts special-cases `category === 'unarmed'`
// for exactly this reason, the one piece of Combat Resolution genuinely
// specific to this one synthesized action rather than generic across every
// `damageRoll`-carrying action.
const UNARMED_STRIKE: ContentAction = {
  name: 'Unarmed Strike',
  category: 'unarmed',
  actionType: 'Melee Attack',
  range: '5 ft.',
  damage: '1 + Strength modifier bludgeoning',
  resolution: { kind: 'attack-roll', attackKind: 'melee' }
}

export async function getCharacterActions(
  worldId: string | number,
  characterId: string | number
): Promise<CharacterActionsResult> {
  const assembly = await assembleCharacter(worldId, characterId)
  if (!assembly.available) {
    if (assembly.reason === 'character-not-found') {
      return { available: false, reason: 'character-not-found' }
    }
    return { available: false, reason: assembly.reason, message: assembly.message }
  }

  const blueprint: CharacterAssemblyBlueprint = assembly.blueprint

  // Numbers are OPTIONAL here, unlike Recovery's own `loadRecoveryNumbers`:
  // an Actions list is still useful with no Rules Package activated (every
  // name, range, and damage expression still comes from content), so a
  // missing Rules runtime degrades individual rows' attack bonus/save DC
  // rather than failing the whole request.
  const derived = await getDerivedCharacter(worldId, characterId)
  const byCategory = derived.available ? derived.derived.byCategory : {}

  const meleeBonus = findNumber(byCategory, MELEE_ATTACK_BONUS_ID)
  const rangedBonus = findNumber(byCategory, RANGED_ATTACK_BONUS_ID)
  const spellAttackBonus = findNumber(byCategory, SPELL_ATTACK_BONUS_ID)
  const spellSaveDc = findNumber(byCategory, SPELL_SAVE_DC_ID)

  const actions: CharacterAction[] = []

  actions.push({ ...UNARMED_STRIKE, id: actionId('unarmed', 'strike'), attackBonus: meleeBonus })

  // Species/Class/Background content actions (`ContentAction[]` on each
  // slot's catalogue entry, resolved by resolveSpeciesActions/
  // resolveClassActions/resolveBackgroundActions in content-actions/dnd5e.ts)
  // are DELIBERATELY NOT surfaced here. DND5E Playability Audit: this data
  // has no action-vs-passive signal (content-actions/dnd5e.ts's own header)
  // and no reliable level metadata usable for gating a level-1 character's
  // list, so every row -- Darkvision, Unarmored Defense, Ability Score
  // Improvement, a level-11 feature -- was appearing as something a player
  // could "do" regardless of level. There is no Features & Traits surface
  // yet to move them to (a real gap, not fixed here), so they are left out
  // of Actions entirely rather than shown misleadingly -- "Do not lie."
  // Weapon/Unarmed/Spell actions below are unaffected: each already carries
  // real usable-now semantics (equipped/prepared) this content lacks.

  for (const item of blueprint.inventory) {
    if (!item.equipped) continue
    for (const action of (item.entry as { actions?: ContentAction[] } | undefined)?.actions ?? []) {
      const isRanged = action.actionType === 'Ranged Attack'
      actions.push({ ...action, id: actionId('weapon', item.instanceId), attackBonus: isRanged ? rangedBonus : meleeBonus })
    }
  }

  for (const spell of blueprint.spells) {
    if (!spell.prepared) continue
    const resolved = (spell.entry as { actions?: ContentAction[] } | undefined)?.actions ?? []

    // A prepared spell always shows SOMETHING, even without a resolved
    // catalogue action (a homebrew spell, or one whose Content Pack went
    // missing) -- see this module's own header.
    const spellActions = resolved.length
      ? resolved
      : [{ name: spell.title, category: 'spell' as const, actionType: 'Spell' }]

    for (const action of spellActions) {
      actions.push({ ...action, id: actionId('spell', spell.instanceId), attackBonus: spellAttackBonus, saveDc: spellSaveDc })
    }
  }

  return { available: true, actions }
}

// ---------------------------------------------------------------------------
// resolveAttackAction -- Character Sheet Body Phase 1A (Authoritative
// Attack + Damage Rolls, server/utils/roll-events.ts's own
// createActionAttackRollEvent/createActionDamageRollEvent).
// ---------------------------------------------------------------------------
// The untargeted counterpart to server/utils/character-combat.ts's
// `resolveCombatAction`: this module states what a weapon/unarmed attack
// action's own numbers ARE (Attack Bonus, damage dice, the ability modifier
// its damage uses); it never compares to a target's AC, never decides
// hit/miss, never touches anyone's HP. Spell actions (category 'spell',
// including a spell attack roll) are out of Phase 1A's scope and are
// rejected here exactly like a weapon/unarmed action with no attack-roll
// resolution -- `isAttackCapableAction` is the single gate both this
// function and the Actions panel client-side (CharacterActionsPanel.vue)
// use, so "does this row get Attack/Damage controls" and "will the server
// actually roll them" can never disagree.

const STR_MOD_ID = 'value:ability.str.mod'
const DEX_MOD_ID = 'value:ability.dex.mod'

export type AttackCapableAction = CharacterAction & {
  category: 'weapon' | 'unarmed'
  resolution: { kind: 'attack-roll'; attackKind: 'melee' | 'ranged' }
  attackBonus: number
}

export type ResolvedAttackAction = {
  action: AttackCapableAction
  // The ability modifier this action's DAMAGE uses -- melee reads Strength,
  // ranged reads Dexterity, mirroring character-combat.ts's own
  // `rollDamage` (unchanged, untouched by this module) exactly. Resolved
  // here (rather than by each roll-events.ts write path separately) so an
  // Attack roll and a Damage roll for the same action always agree on which
  // ability the character used, even though only Damage actually needs it.
  damageAbilityModifier: number
}

export type ResolveAttackActionResult =
  | { ok: true; resolved: ResolvedAttackAction }
  | {
      ok: false
      reason: 'character-not-found' | 'no-catalogue-selection' | 'action-not-found' | 'not-attack-capable' | 'rules-unavailable'
      message: string
    }

export async function resolveAttackAction(
  worldId: string | number,
  characterId: string | number,
  actionId: string
): Promise<ResolveAttackActionResult> {
  const actionsResult = await getCharacterActions(worldId, characterId)
  if (!actionsResult.available) {
    if (actionsResult.reason === 'character-not-found') {
      return { ok: false, reason: 'character-not-found', message: 'Character not found in this world' }
    }
    return { ok: false, reason: 'no-catalogue-selection', message: actionsResult.message }
  }

  const action = actionsResult.actions.find((candidate) => candidate.id === actionId)
  if (!action) {
    return { ok: false, reason: 'action-not-found', message: `No action '${actionId}' on this character` }
  }

  if (!isAttackCapableAction(action)) {
    return {
      ok: false,
      reason: 'not-attack-capable',
      message: `'${action.name}' is not a weapon or unarmed attack -- Attack/Damage rolls only support those in this phase`
    }
  }
  if (action.attackBonus === undefined) {
    return {
      ok: false,
      reason: 'rules-unavailable',
      message: `This World's active Rules Package does not declare the Attack Bonus '${action.name}' needs`
    }
  }

  const derived = await getDerivedCharacter(worldId, characterId)
  if (!derived.available) {
    return {
      ok: false,
      reason: 'rules-unavailable',
      message: derived.reason === 'character-not-found' ? 'Character not found in this world' : derived.message
    }
  }

  // `isAttackCapableAction` above already guarantees `resolution.attackKind`
  // is 'melee' or 'ranged' (never 'spell') -- the cast below only narrows
  // the type back to what that predicate already proved at runtime.
  const attackKind = (action.resolution as { attackKind: 'melee' | 'ranged' }).attackKind
  const damageAbilityModifier =
    findNumber(derived.derived.byCategory, attackKind === 'melee' ? STR_MOD_ID : DEX_MOD_ID) ?? 0

  return {
    ok: true,
    resolved: { action: action as AttackCapableAction, damageAbilityModifier }
  }
}
