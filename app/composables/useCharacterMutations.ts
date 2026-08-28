// useCharacterMutations -- Character Sheet Beautification Pass, Phase 2
// (see .github/docs/architecture/character-sheet-beauty-pass.md §8.3,
// §11 Phase 2). One mutation surface for Recovery, Combat, Inventory,
// Spellcasting, and Conditions -- the five domains named by this phase's
// task. Every domain here already existed as page-local state + handler
// functions in sheet-v2.vue; this simply relocates them behind one
// composable so the page calls `mutations.inventory.add(...)` instead of
// owning `persistInventory`/`onInventoryAdd` itself.
//
// Reuses existing server routes exactly as they were called before --
// no endpoint here is new, redesigned, or given a different method/body
// shape. No optimistic-persistence behavior is invented either: every
// domain below preserves the exact "set local state immediately, persist,
// roll back to the previous value on failure" pattern the page already
// had; this phase only relocates that pattern, it does not add retries,
// debouncing, conflict resolution, or anything else beyond what already
// existed.
//
// Notes is deliberately NOT one of the five domains here -- this task's
// own IMPLEMENT section names exactly Recovery/Combat/Inventory/
// Spellcasting/Conditions. `saveNotes` stays inline in sheet-v2.vue,
// unchanged, rather than being pulled in under an unlisted sixth domain.
//
// "Recovery" bundles both of CharacterHealthPanel.vue's mutations --
// the direct `@save` (PUT .../health, editing Current HP/Temp HP/Hit Dice
// spent/Death Saves) and `@recovery` (POST .../recovery, the six named
// Recovery actions) -- because both act on the exact same `healthDraft`
// state behind the exact same panel; splitting them across two domains
// over a naming technicality would fragment one cohesive unit of state.
//
// "Conditions" bundles Join/Leave Encounter alongside Apply/Remove/Tick
// Condition. All five hit the identical endpoint
// (POST .../encounters/:id/actions, server/utils/encounter-actions.ts)
// with the identical request/response shape and the identical success/
// error handling -- sheet-v2.vue's own `sendEncounterAction` already
// unified them before this phase. Splitting Join/Leave into a separate
// "encounter" mutation group would not match any named domain either, and
// would fragment, not centralize, one endpoint's worth of behavior.

import type { Ref } from 'vue'
import type { CombatOutcome } from '~/components/characters/CharacterActionsPanel.vue'
import {
  addInventoryItem,
  changeInventoryQuantity,
  removeInventoryItem,
  toggleInventoryFlag,
  type AssembledInventoryItem,
  type InventoryFlag,
  type StoredInventoryItem
} from '~/lib/characters/inventory'
import {
  addSpell,
  expendSlot,
  removeSpell,
  restoreSlot,
  toggleSpellFlag,
  type AssembledSpellEntry,
  type SpellFlag,
  type StoredSpellEntry
} from '~/lib/characters/spellcasting'
import type { StoredCharacterHealth } from '~/lib/characters/health'
import type { CharacterSheet, EncounterView } from './useCharacterSheet'

export function useCharacterMutations(worldId: Ref<string>, characterId: Ref<string>, sheet: CharacterSheet) {
  // -------------------------------------------------------------------
  // Recovery -- direct Health edits (PUT) and the six named Recovery
  // actions (POST), both writing sheet.healthDraft.
  // -------------------------------------------------------------------

  const recoverySaving = ref(false)
  const recoveryError = ref('')

  async function saveHealth(next: StoredCharacterHealth) {
    if (recoverySaving.value) return

    const previous = sheet.healthDraft.value
    sheet.healthDraft.value = next
    recoverySaving.value = true
    recoveryError.value = ''

    try {
      await $fetch(`/api/worlds/${worldId.value}/characters/${characterId.value}/health`, {
        method: 'PUT',
        body: next
      })
    } catch (saveError: any) {
      sheet.healthDraft.value = previous
      recoveryError.value =
        saveError?.data?.statusMessage || saveError?.statusMessage || 'Failed to save health'
    } finally {
      recoverySaving.value = false
    }
  }

  // A POST, not a PUT: this sends INTENT ({ type, amount? });
  // server/utils/character-recovery.ts decides the resulting numbers
  // (reading Maximum HP and the other Rules Engine output each action
  // needs) and returns the new authoritative state, which replaces
  // `healthDraft` directly -- no separate recompute here, and no need to
  // re-fetch `derived`, since none of these actions change Maximum HP,
  // Hit Dice total, or Hit Die size.
  async function applyRecovery(action: { type: string; amount?: number }) {
    if (recoverySaving.value) return

    recoverySaving.value = true
    recoveryError.value = ''

    try {
      const result = await $fetch<{ success: true; health: StoredCharacterHealth }>(
        `/api/worlds/${worldId.value}/characters/${characterId.value}/recovery`,
        { method: 'POST', body: action }
      )
      sheet.healthDraft.value = result.health
    } catch (recoveryErr: any) {
      recoveryError.value =
        recoveryErr?.data?.statusMessage || recoveryErr?.statusMessage || 'Failed to apply recovery action'
    } finally {
      recoverySaving.value = false
    }
  }

  const recovery = reactive({
    saving: recoverySaving,
    error: recoveryError,
    save: saveHealth,
    apply: applyRecovery
  })

  // -------------------------------------------------------------------
  // Combat -- one attacker (this character), one action, one target.
  // -------------------------------------------------------------------

  const combatResults = ref<Record<string, CombatOutcome>>({})
  const combatResolving = ref(false)
  const combatError = ref('')

  async function resolveAction(payload: { actionId: string; targetCharacterId: string }) {
    if (combatResolving.value) return

    combatResolving.value = true
    combatError.value = ''

    try {
      const result = await $fetch<CombatOutcome & { ok: true }>(
        `/api/worlds/${worldId.value}/characters/${characterId.value}/combat`,
        { method: 'POST', body: payload }
      )
      combatResults.value = { ...combatResults.value, [payload.actionId]: result }
    } catch (resolveError: any) {
      combatError.value =
        resolveError?.data?.statusMessage || resolveError?.statusMessage || 'Failed to resolve this action'
    } finally {
      combatResolving.value = false
    }
  }

  const combat = reactive({
    results: combatResults,
    resolving: combatResolving,
    error: combatError,
    resolve: resolveAction
  })

  // -------------------------------------------------------------------
  // Inventory -- every decision is the pure module's (app/lib/characters/
  // inventory.ts); this only saves the result.
  // -------------------------------------------------------------------

  const inventorySaving = ref(false)
  const inventoryError = ref('')

  // Takes the STORED shape -- `AssembledInventoryItem` is a superset
  // carrying resolved display fields, and persisting those would be
  // storing a copy of the catalogue, which is exactly what Character
  // Assembly's re-resolve-on-every-read design removes.
  async function persistInventory(next: AssembledInventoryItem[]) {
    if (inventorySaving.value) return

    const previous = sheet.inventoryItems.value
    sheet.inventoryItems.value = next
    inventorySaving.value = true
    inventoryError.value = ''

    try {
      const items: StoredInventoryItem[] = next.map((item) => ({
        instanceId: item.instanceId,
        ...(item.ref ? { ref: item.ref } : { name: item.name }),
        quantity: item.quantity,
        equipped: item.equipped,
        attuned: item.attuned,
        ...(item.container ? { container: item.container } : {}),
        ...(item.notes ? { notes: item.notes } : {})
      }))

      await $fetch(`/api/worlds/${worldId.value}/characters/${characterId.value}/inventory`, {
        method: 'PUT',
        body: { items }
      })
    } catch (saveError: any) {
      sheet.inventoryItems.value = previous
      inventoryError.value =
        saveError?.data?.statusMessage || saveError?.statusMessage || 'Failed to save inventory'
    } finally {
      inventorySaving.value = false
    }
  }

  function addItem(payload: {
    ref?: { packageId: string; slug: string }
    name?: string
    quantity: number
    notes?: string
  }) {
    const added = addInventoryItem(sheet.inventoryItems.value, payload)
    const entry = payload.ref
      ? sheet.inventoryOptions.value.find(
          (option) => option.packageId === payload.ref!.packageId && option.slug === payload.ref!.slug
        )
      : undefined

    // The new row is decorated for display exactly as Assembly would
    // have, so the card renders correctly before the next read rather
    // than flashing an "unavailable" state for an item that is perfectly
    // fine.
    persistInventory(added.map((item, index) =>
      index === added.length - 1
        ? {
            ...item,
            status: payload.ref ? (entry ? 'resolved' : 'missing') : 'custom',
            title: entry?.title || payload.name || 'Item',
            ...(entry ? { entry } : {})
          }
        : (item as AssembledInventoryItem)
    ) as AssembledInventoryItem[])
  }

  function removeItem(instanceId: string) {
    persistInventory(removeInventoryItem(sheet.inventoryItems.value, instanceId) as AssembledInventoryItem[])
  }

  function changeQuantity(payload: { instanceId: string; delta: number }) {
    persistInventory(
      changeInventoryQuantity(sheet.inventoryItems.value, payload.instanceId, payload.delta) as AssembledInventoryItem[]
    )
  }

  function toggleFlag(payload: { instanceId: string; flag: InventoryFlag }) {
    persistInventory(
      toggleInventoryFlag(sheet.inventoryItems.value, payload.instanceId, payload.flag) as AssembledInventoryItem[]
    )
  }

  const inventory = reactive({
    saving: inventorySaving,
    error: inventoryError,
    add: addItem,
    remove: removeItem,
    changeQuantity,
    toggleFlag
  })

  // -------------------------------------------------------------------
  // Spellcasting -- every decision is the pure module's (app/lib/
  // characters/spellcasting.ts); this only saves the result.
  // -------------------------------------------------------------------

  const spellcastingSaving = ref(false)
  const spellcastingError = ref('')

  // Takes the STORED shape, exactly as `persistInventory` above does.
  async function persistSpellcasting(nextSpells: AssembledSpellEntry[], nextExpendedSlots: Record<string, number>) {
    if (spellcastingSaving.value) return

    const previousSpells = sheet.spellItems.value
    const previousSlots = sheet.spellcastingExpendedSlots.value
    sheet.spellItems.value = nextSpells
    sheet.spellcastingExpendedSlots.value = nextExpendedSlots
    spellcastingSaving.value = true
    spellcastingError.value = ''

    try {
      const spells: StoredSpellEntry[] = nextSpells.map((entry) => ({
        instanceId: entry.instanceId,
        ...(entry.ref ? { ref: entry.ref } : { name: entry.name }),
        known: entry.known,
        prepared: entry.prepared
      }))

      await $fetch(`/api/worlds/${worldId.value}/characters/${characterId.value}/spellcasting`, {
        method: 'PUT',
        body: { spells, expendedSlots: nextExpendedSlots }
      })
    } catch (saveError: any) {
      sheet.spellItems.value = previousSpells
      sheet.spellcastingExpendedSlots.value = previousSlots
      spellcastingError.value =
        saveError?.data?.statusMessage || saveError?.statusMessage || 'Failed to save spellcasting'
    } finally {
      spellcastingSaving.value = false
    }
  }

  function addSpellEntry(payload: { ref?: { packageId: string; slug: string }; name?: string }) {
    const added = addSpell(sheet.spellItems.value, payload)
    const entry = payload.ref
      ? sheet.spellOptions.value.find(
          (option) => option.packageId === payload.ref!.packageId && option.slug === payload.ref!.slug
        )
      : undefined

    persistSpellcasting(added.map((item, index) =>
      index === added.length - 1
        ? {
            ...item,
            status: payload.ref ? (entry ? 'resolved' : 'missing') : 'custom',
            title: entry?.title || payload.name || 'Spell',
            ...(entry ? { entry } : {})
          }
        : (item as AssembledSpellEntry)
    ) as AssembledSpellEntry[], sheet.spellcastingExpendedSlots.value)
  }

  function removeSpellEntry(instanceId: string) {
    persistSpellcasting(
      removeSpell(sheet.spellItems.value, instanceId) as AssembledSpellEntry[],
      sheet.spellcastingExpendedSlots.value
    )
  }

  function toggleSpellEntryFlag(payload: { instanceId: string; flag: SpellFlag }) {
    persistSpellcasting(
      toggleSpellFlag(sheet.spellItems.value, payload.instanceId, payload.flag) as AssembledSpellEntry[],
      sheet.spellcastingExpendedSlots.value
    )
  }

  function expendSpellSlot(level: number) {
    const max = sheet.slotLevels.value.find((row) => row.level === level)?.max ?? 0
    persistSpellcasting(sheet.spellItems.value, expendSlot(sheet.spellcastingExpendedSlots.value, level, max))
  }

  function restoreSpellSlot(level: number) {
    persistSpellcasting(sheet.spellItems.value, restoreSlot(sheet.spellcastingExpendedSlots.value, level))
  }

  const spellcasting = reactive({
    saving: spellcastingSaving,
    error: spellcastingError,
    add: addSpellEntry,
    remove: removeSpellEntry,
    toggleFlag: toggleSpellEntryFlag,
    expendSlot: expendSpellSlot,
    restoreSlot: restoreSpellSlot
  })

  // -------------------------------------------------------------------
  // Conditions -- Join/Leave Encounter, Apply/Remove/Tick Condition. See
  // this file's header for why all five share one domain.
  // -------------------------------------------------------------------

  async function sendEncounterAction(body: Record<string, unknown>) {
    if (!sheet.encounter.selectedId || sheet.encounter.pending) return

    sheet.encounter.pending = true
    sheet.encounter.error = ''

    try {
      const result = await $fetch<{ ok: true; encounter: EncounterView }>(
        `/api/worlds/${worldId.value}/encounters/${sheet.encounter.selectedId}/actions`,
        { method: 'POST', body }
      )
      sheet.encounter.view = result.encounter
    } catch (fetchError: any) {
      sheet.encounter.error =
        fetchError?.data?.statusMessage || fetchError?.statusMessage || 'Could not update this encounter'
    } finally {
      sheet.encounter.pending = false
    }
  }

  function join() {
    sendEncounterAction({ type: 'join', characterId: characterId.value })
  }

  function leave() {
    sendEncounterAction({ type: 'leave', characterId: characterId.value })
  }

  const draft = reactive({ conditionId: '', duration: '', source: '' })

  function apply() {
    if (!draft.conditionId) return
    const parsedDuration = Number(draft.duration)
    const duration = draft.duration.trim() && Number.isFinite(parsedDuration) ? parsedDuration : undefined

    sendEncounterAction({
      type: 'apply-condition',
      characterId: characterId.value,
      conditionId: draft.conditionId,
      ...(duration !== undefined ? { duration } : {}),
      ...(draft.source.trim() ? { source: draft.source.trim() } : {})
    })

    draft.conditionId = ''
    draft.duration = ''
    draft.source = ''
  }

  function removeCondition(conditionInstanceId: string) {
    sendEncounterAction({ type: 'remove-condition', characterId: characterId.value, conditionInstanceId })
  }

  function tick(conditionInstanceId: string, delta: number) {
    sendEncounterAction({ type: 'tick-condition', characterId: characterId.value, conditionInstanceId, delta })
  }

  const conditions = reactive({
    draft,
    join,
    leave,
    apply,
    remove: removeCondition,
    tick
  })

  return {
    recovery,
    combat,
    inventory,
    spellcasting,
    conditions
  }
}

export type CharacterMutations = ReturnType<typeof useCharacterMutations>
