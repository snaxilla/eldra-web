// Combat Resolution -- one attacker, one action, one target.
//
// Composes exactly the same modules every other gameplay-derived server
// util does -- getCharacterActions (this attacker's own Actions list, each
// entry already carrying `resolution`/`damageRoll` -- Character Actions
// System), getDerivedCharacter (Attack Bonus/Spell Save DC/Armor Class/save
// bonuses, for BOTH the attacker and the target, two separate single-actor
// reads), and character-health.ts (load/save the target's stored HP,
// app/lib/characters/health.ts's existing `applyDamage`, unchanged). No new
// concept beyond "read the numbers the Rules Engine already computed for two
// characters, roll dice, decide the outcome, apply it." Exactly the shape
// server/utils/character-recovery.ts already is, extended from one
// character to two.
//
// ---------------------------------------------------------------------------
// COMBAT ORCHESTRATES; THE RULES ENGINE EVALUATES -- EXACTLY LIKE RECOVERY
// ---------------------------------------------------------------------------
// `app/lib/rules/**` is untouched by this module and never mutates
// ActorState -- unchanged by this task, the same invariant Recovery
// preserved. "The Rules Engine determines numbers" means literally what it
// already means everywhere else in this codebase: Attack Bonus, Spell Save
// DC, Armor Class, and every save bonus are `getDerivedCharacter` OUTPUT,
// read here and nowhere computed. Deciding hit/miss/critical, rolling
// damage, and applying it to stored HP is Combat's own job, performed by
// this module and the pure functions in app/lib/characters/health.ts --
// exactly the same division Recovery's own header already draws between
// itself and the engine.
//
// ---------------------------------------------------------------------------
// WHY THIS DOES NOT USE app/lib/rules/roll-engine.ts / roll-service.ts
// ---------------------------------------------------------------------------
// A genuine architectural finding, not an oversight: RollSpecs (`kind:
// 'roll'` Definitions) are Rules-Package-declared and evaluated against ONE
// EvaluationSession bound to ONE ActorState (evaluation-session.ts,
// unchanged). Combat's hit/miss decision inherently needs TWO characters'
// numbers at once -- the attacker's Attack Bonus and the DEFENDER's Armor
// Class -- which no single EvaluationSession can express (there is no
// `@target:` namespace, and evaluator.ts's own design decisions document
// `@ctx:` as intentionally unresolvable in the current runtime model,
// roll-engine.ts's own design decision 4 confirms `degrees` evaluation
// against a roll's outcome is deliberately unbuilt for the identical
// reason). A weapon's damage dice also vary per-item from CONTENT
// (`ContentAction.damageRoll`), not from a Rules-Package-declared, fixed
// `dice` Expression a RollSpec Definition would need to name statically.
// Neither fits the RollSpec model without redesigning it -- explicitly
// forbidden by this task. What DOES reuse cleanly is the one primitive
// beneath both: `app/lib/rules/rng.ts`'s `createSeededRng`, used here
// exactly as roll-engine.ts itself uses it (§17.4: seed always explicit,
// never `Math.random()`) -- so a resolution is still reproducible from its
// own `seed`, the same reproducibility guarantee every other roll in this
// codebase carries, without executing a RollSpec that does not exist.
//
// ---------------------------------------------------------------------------
// THE TWO RESOLUTION MECHANICS
// ---------------------------------------------------------------------------
// 'attack-roll': d20 + the attacker's relevant Attack Bonus vs the target's
// Armor Class. A natural 20 always hits and is a critical (RAW); a natural 1
// always misses. A critical hit doubles the DICE rolled for damage (RAW:
// "roll all the attack's damage dice twice"), never the flat ability
// modifier, which is added once regardless.
//
// 'saving-throw': the TARGET rolls d20 + their own save bonus for the
// action's `savingAbility` against the attacker's Spell Save DC. RAW's
// overwhelmingly common pattern for a damaging save spell -- stated
// explicitly in Fireball's own printed text, "half as much damage on a
// successful [save]" -- is applied uniformly: success halves damage
// (rounded down), failure takes it in full. Saving throws never critical;
// that field is always `false` on this path.
//
// Neither path adds an ability modifier to SPELL damage (RAW: the vast
// majority of damaging spells, including Fireball, state a fixed damage
// expression with no modifier added) -- only WEAPON/Unarmed damage adds one,
// mirroring the exact melee-uses-Strength/ranged-uses-Dexterity
// simplification packages/eldra-dnd5e-2024's own Melee/Ranged Attack Bonus
// formulas already carry (no finesse modeling, stated there and carried
// forward here unchanged).
//
// ---------------------------------------------------------------------------
// UNARMED STRIKE -- THE ONE ACTION WITH NO damageRoll
// ---------------------------------------------------------------------------
// character-actions.ts's own note: RAW 2024 Unarmed Strike damage is a FLAT
// "1 + Strength modifier", never dice. This module special-cases
// `category === 'unarmed'` for damage ONLY -- everything about the hit/miss
// decision (attack roll, Attack Bonus, target AC) is identical to any other
// melee attack-roll action. A critical Unarmed Strike has nothing to double
// (there is no dice to double) and simply applies the same flat total.

import { randomBytes } from 'node:crypto'
import { getCharacterActions } from './character-actions'
import { getDerivedCharacter } from './character-derived'
import { loadCharacterHealth, saveCharacterHealth } from './character-health'
import { applyDamage, emptyCharacterHealth, type StoredCharacterHealth } from '../../app/lib/characters/health'
import { createSeededRng } from '../../app/lib/rules/rng'

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export type AttackRollDetail = {
  roll: number
  bonus: number
  total: number
  targetArmorClass: number
  naturalTwenty: boolean
  naturalOne: boolean
}

export type SavingThrowDetail = {
  roll: number
  bonus: number
  total: number
  dc: number
  success: boolean
}

export type DamageDetail = {
  rolls: number[]
  modifier: number
  total: number
  type?: string
  // Half of the pre-halving total, rounded down -- present only on a
  // successful saving throw, so a consumer can show "14, halved to 7"
  // rather than just the already-halved number.
  halvedFrom?: number
}

export type CombatResolutionSuccess = {
  ok: true
  actionId: string
  actionName: string
  seed: string
  hit: boolean
  critical: boolean
  attackRoll?: AttackRollDetail
  savingThrow?: SavingThrowDetail
  damage?: DamageDetail
  targetHealth: StoredCharacterHealth
}

export type CombatResolutionFailure = {
  ok: false
  reason: 'attacker-not-found' | 'target-not-found' | 'action-not-found' | 'no-resolution' | 'rules-unavailable'
  message: string
}

export type CombatResolutionResult = CombatResolutionSuccess | CombatResolutionFailure

const MELEE_ATTACK_BONUS_ID = 'value:combat.melee_attack_bonus'
const RANGED_ATTACK_BONUS_ID = 'value:combat.ranged_attack_bonus'
const SPELL_ATTACK_BONUS_ID = 'value:spellcasting.attack_bonus'
const SPELL_SAVE_DC_ID = 'value:spellcasting.save_dc'
const ARMOR_CLASS_ID = 'value:defenses.armor_class'
const STR_MOD_ID = 'value:ability.str.mod'
const DEX_MOD_ID = 'value:ability.dex.mod'

function saveBonusId(ability: string): string {
  return `value:save.${ability}.bonus`
}

function findNumber(byCategory: Record<string, Array<{ id: string; value?: unknown }>>, id: string): number | undefined {
  for (const entries of Object.values(byCategory)) {
    const entry = entries.find((candidate) => candidate.id === id)
    if (entry) return typeof entry.value === 'number' ? entry.value : undefined
  }
  return undefined
}

function rollDie(rng: ReturnType<typeof createSeededRng>, faces: number): number {
  return rng.nextInt(faces) + 1
}

function rollDice(rng: ReturnType<typeof createSeededRng>, count: number, faces: number): number[] {
  const rolls: number[] = []
  for (let i = 0; i < count; i++) rolls.push(rollDie(rng, faces))
  return rolls
}

// The canonical entry point. `seed` defaults to a fresh, server-generated
// one (`randomBytes(16).toString('hex')`) -- the exact convention
// server/utils/world-rules-roll.ts's own `requestWorldRoll` already
// establishes for "never a client-supplied seed, always server-controlled" --
// and is only ever accepted as a parameter so a test can pin one down and
// assert a specific outcome, the same reason `executeRoll`
// (app/lib/rules/roll-engine.ts) takes an explicit seed rather than calling
// `Math.random()` itself.
export async function resolveCombatAction(
  worldId: string | number,
  attackerCharacterId: string | number,
  targetCharacterId: string | number,
  actionId: string,
  seed: string = randomBytes(16).toString('hex')
): Promise<CombatResolutionResult> {
  const attackerActions = await getCharacterActions(worldId, attackerCharacterId)
  if (!attackerActions.available) {
    if (attackerActions.reason === 'character-not-found') {
      return { ok: false, reason: 'attacker-not-found', message: 'Attacking character not found in this world' }
    }
    return { ok: false, reason: 'no-resolution', message: attackerActions.message }
  }

  const action = attackerActions.actions.find((candidate) => candidate.id === actionId)
  if (!action) {
    return { ok: false, reason: 'action-not-found', message: `No action '${actionId}' on this character` }
  }
  if (!action.resolution) {
    return { ok: false, reason: 'no-resolution', message: `'${action.name}' has nothing to resolve -- it grants no attack roll or saving throw` }
  }

  const attackerDerived = await getDerivedCharacter(worldId, attackerCharacterId)
  if (!attackerDerived.available) {
    return { ok: false, reason: 'rules-unavailable', message: attackerDerived.reason === 'character-not-found' ? 'Attacking character not found in this world' : attackerDerived.message }
  }

  const targetDerived = await getDerivedCharacter(worldId, targetCharacterId)
  if (!targetDerived.available) {
    if (targetDerived.reason === 'character-not-found') {
      return { ok: false, reason: 'target-not-found', message: 'Target character not found in this world' }
    }
    return { ok: false, reason: 'rules-unavailable', message: targetDerived.message }
  }

  const attackerByCategory = attackerDerived.derived.byCategory
  const targetByCategory = targetDerived.derived.byCategory

  const rng = createSeededRng(seed)
  const resolution = action.resolution

  let hit = true
  let critical = false
  let attackRoll: AttackRollDetail | undefined
  let savingThrow: SavingThrowDetail | undefined
  let damage: DamageDetail | undefined

  if (resolution.kind === 'attack-roll') {
    const bonusId = resolution.attackKind === 'melee'
      ? MELEE_ATTACK_BONUS_ID
      : resolution.attackKind === 'ranged'
        ? RANGED_ATTACK_BONUS_ID
        : SPELL_ATTACK_BONUS_ID

    const bonus = findNumber(attackerByCategory, bonusId)
    const targetArmorClass = findNumber(targetByCategory, ARMOR_CLASS_ID)
    if (bonus === undefined || targetArmorClass === undefined) {
      return { ok: false, reason: 'rules-unavailable', message: 'This World\'s active Rules Package does not declare the Attack Bonus or Armor Class this resolution needs.' }
    }

    const roll = rollDie(rng, 20)
    const naturalTwenty = roll === 20
    const naturalOne = roll === 1
    const total = roll + bonus

    critical = naturalTwenty
    hit = naturalTwenty || (!naturalOne && total >= targetArmorClass)

    attackRoll = { roll, bonus, total, targetArmorClass, naturalTwenty, naturalOne }
  } else {
    const dc = findNumber(attackerByCategory, SPELL_SAVE_DC_ID)
    const bonus = findNumber(targetByCategory, saveBonusId(resolution.savingAbility))
    if (dc === undefined || bonus === undefined) {
      return { ok: false, reason: 'rules-unavailable', message: 'This World\'s active Rules Package does not declare the Spell Save DC or the target\'s save bonus this resolution needs.' }
    }

    const roll = rollDie(rng, 20)
    const total = roll + bonus
    const success = total >= dc

    // A save "hit" (in the sense of "damage is applied") whenever the
    // action has damage to apply at all -- see this module's own header on
    // why success halves rather than negates.
    hit = true
    savingThrow = { roll, bonus, total, dc, success }
  }

  if (hit) {
    damage = rollDamage(rng, action, attackerByCategory, resolution.kind === 'attack-roll' ? resolution.attackKind : undefined, critical, savingThrow?.success ?? false)
  }

  const current = (await loadCharacterHealth(targetCharacterId)) ?? emptyCharacterHealth()
  const targetHealth = damage && damage.total > 0 ? applyDamage(current, damage.total) : current

  if (damage && damage.total > 0) {
    await saveCharacterHealth(targetCharacterId, targetHealth)
  }

  return {
    ok: true,
    actionId: action.id,
    actionName: action.name,
    seed,
    hit,
    critical,
    attackRoll,
    savingThrow,
    damage,
    targetHealth
  }
}

// ---------------------------------------------------------------------------
// Internals
// ---------------------------------------------------------------------------

function rollDamage(
  rng: ReturnType<typeof createSeededRng>,
  action: { category: string; damageRoll?: { count: number; faces: number }; damageType?: string },
  attackerByCategory: Record<string, Array<{ id: string; value?: unknown }>>,
  attackKind: 'melee' | 'ranged' | 'spell' | undefined,
  critical: boolean,
  savingThrowSucceeded: boolean
): DamageDetail {
  // Unarmed Strike: flat "1 + Strength modifier", no dice -- see this
  // module's own header. Not affected by critical (nothing to double) or by
  // a saving throw (Unarmed Strike is never a saving-throw action).
  if (action.category === 'unarmed') {
    const strMod = findNumber(attackerByCategory, STR_MOD_ID) ?? 0
    const total = 1 + strMod
    return { rolls: [], modifier: strMod + 1, total, type: 'bludgeoning' }
  }

  const dice = action.damageRoll
  if (!dice) return { rolls: [], modifier: 0, total: 0, type: action.damageType }

  // RAW: a critical hit rolls the damage dice TWICE (double the dice
  // count), never doubling a flat modifier. Only an attack-roll action can
  // be critical (savingThrowSucceeded implies this is the saving-throw
  // path, where `critical` is always false already).
  const rollCount = critical ? dice.count * 2 : dice.count
  const rolls = rollDice(rng, rollCount, dice.faces)

  // Weapon/Unarmed damage adds the same ability modifier its Attack Bonus
  // uses (melee -> Strength, ranged -> Dexterity); a spell attack or a
  // saving-throw spell adds none -- see this module's own header.
  const modifier = attackKind === 'melee'
    ? findNumber(attackerByCategory, STR_MOD_ID) ?? 0
    : attackKind === 'ranged'
      ? findNumber(attackerByCategory, DEX_MOD_ID) ?? 0
      : 0

  const rawTotal = rolls.reduce((sum, value) => sum + value, 0) + modifier
  const total = savingThrowSucceeded ? Math.floor(rawTotal / 2) : rawTotal

  return {
    rolls,
    modifier,
    total,
    type: action.damageType,
    ...(savingThrowSucceeded ? { halvedFrom: rawTotal } : {})
  }
}
