// useCharacterMutations -- Character Sheet Beautification Pass, Phase 2
// (see .github/docs/architecture/character-sheet-beauty-pass.md §8.3,
// §11 Phase 2). One mutation surface for Recovery, Combat, Inventory,
// Spellcasting, and Conditions -- the five domains named by this phase's
// task. Every domain here already existed as page-local state + handler
// functions in sheet-v2.vue; this simply relocates them behind one
// composable so the page calls `mutations.inventory.add(...)` instead of
// owning `persistInventory`/`onInventoryAdd` itself.
//
// Portrait was added later, by Character Sheet Header Cleanup 1
// (Play-Mode Portrait Management) -- see that domain's own header comment
// below for why it lives here rather than as a sixth unlisted addition:
// it is the same shape of "one cohesive unit of mutable Sheet state"
// Recovery's own header argues for, just for the portrait instead of HP.
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
  toStoredSpellEntry,
  type AssembledSpellEntry,
  type SpellFlag,
  type StoredSpellEntry
} from '~/lib/characters/spellcasting'
import { computeOptimisticExpended, createResourceWriteQueue } from './characterResourceInteraction'
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
  // re-fetch `derived` for Maximum HP, Hit Dice total, or Hit Die size,
  // none of which any recovery action changes.
  //
  // Character Sheet Header Cleanup 2.1 -- THE MISSING REFRESH, FOUND BY
  // TRACING A REAL BROWSER BUG (a Long Rest that visibly failed to restore
  // Hit Dice): the claim above was subtly wrong for exactly one displayed
  // number, `value:hit_points.hit_dice_available` -- a DERIVED value
  // (`useCharacterSheet.ts`'s own `hitDiceAvailable`), computed from
  // `derived`, not from `healthDraft`. `derived` is fetched once and never
  // re-fetched by anything in THIS function, so `hitDiceAvailable` stayed
  // frozen at whatever it was on page load, however many times
  // 'spend-hit-die'/'long-rest' actually changed `hitDiceSpent` server-side
  // and correctly updated `healthDraft.hitDiceSpent` right here. The
  // server-persisted number was always correct; only the SHEET's displayed
  // "available / max" line never moved. Refreshing `derived` (not the
  // heavier combined `refresh`, which would also needlessly re-fetch
  // `assembly`/`actions`) after exactly the action types that can change
  // a value this composable reads off `derived` (not off `healthDraft`)
  // closes that gap with no change to what gets persisted or how any
  // other action behaves.
  //
  // RESOURCE INTERACTION PERFORMANCE -- THE SAME GAP, FOUND AGAIN FOR
  // GENERIC RESOURCES (real browser evidence: "Short Rest / manual Rage
  // refill behavior feels all over the place"). Traced, not guessed:
  // `character-recovery.ts` already applies each acquired resource's own
  // `recovery` rule for BOTH 'short-rest' and 'long-rest' triggers (Rage's
  // real XPHB rule -- Short Rest regains one use, Long Rest regains all --
  // is applied correctly server-side either way). But 'short-rest' was
  // missing from this set, so after a Short Rest the server had already
  // correctly restored Rage, while the Sheet's own `characterResources`
  // (also read off `derived`, exactly like `hitDiceAvailable`) kept
  // showing the PRE-rest expended count until something unrelated
  // happened to refresh `derived` -- not a race, not timing-dependent,
  // simply a derived value this set never named. Renamed from
  // `HIT_DICE_AFFECTING_ACTIONS` since it is no longer Hit-Dice-specific;
  // membership is still exactly "which Recovery actions change a value
  // this composable reads from `derived` rather than from `healthDraft`,"
  // the same test the set always encoded.
  const DERIVED_AFFECTING_RECOVERY_ACTIONS = new Set(['spend-hit-die', 'short-rest', 'long-rest'])

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
      if (DERIVED_AFFECTING_RECOVERY_ACTIONS.has(action.type)) {
        await sheet.refreshDerived()
      }
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
  // Portrait -- Character Sheet Header Cleanup 1 (Play-Mode Portrait
  // Management). Reuses the EXACT same endpoint Build Mode's own portrait
  // upload and the World roster's Edit Character form already POST to
  // (`.../characters/:id/update`) -- no second upload system. That
  // endpoint is a full character-metadata update, so `title`/
  // `characterType` (and, when present, `summary`) are always sent
  // verbatim from `sheet.identity`/`sheet.blueprint` alongside the image,
  // or a portrait-only request would silently blank the summary or
  // misclassify the character (see character-assembly.ts's own note on
  // why those fields were added to the blueprint for this task). Same
  // "optimistic set, persist, roll back on failure" shape as saveHealth
  // above -- no new pattern.
  // -------------------------------------------------------------------

  const portraitSaving = ref(false)
  const portraitError = ref('')

  async function sendPortraitUpdate(body: FormData) {
    if (portraitSaving.value) return

    const previous = sheet.characterImageUrlDraft.value
    portraitSaving.value = true
    portraitError.value = ''

    try {
      const result = await $fetch<{ imageUrl: string | null }>(
        `/api/worlds/${worldId.value}/characters/${characterId.value}/update`,
        { method: 'POST', body }
      )
      sheet.characterImageUrlDraft.value = result.imageUrl ?? null
    } catch (portraitErr: any) {
      sheet.characterImageUrlDraft.value = previous
      portraitError.value =
        portraitErr?.data?.statusMessage || portraitErr?.statusMessage || 'Failed to update portrait'
    } finally {
      portraitSaving.value = false
    }
  }

  function portraitFormBase(): FormData {
    const body = new FormData()
    body.append('title', sheet.identity.value.characterTitle || 'Character')
    body.append('characterType', sheet.identity.value.characterType || 'pc')
    if (sheet.identity.value.characterSummary) {
      body.append('summary', sheet.identity.value.characterSummary)
    }
    return body
  }

  function updatePortrait(file: File) {
    const body = portraitFormBase()
    body.append('image', file)
    return sendPortraitUpdate(body)
  }

  function clearPortrait() {
    const body = portraitFormBase()
    body.append('clearImage', 'true')
    return sendPortraitUpdate(body)
  }

  const portrait = reactive({
    saving: portraitSaving,
    error: portraitError,
    update: updatePortrait,
    clear: clearPortrait
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
      // D&D 2024 Character Rules P3.2.1 -- `toStoredSpellEntry`, never a hand-listed field set: this
      // is a full-replace PUT, so any field this rebuild forgot to carry through (requirementIds
      // included) would be silently erased on the very next ordinary Sheet-side spell edit.
      const spells: StoredSpellEntry[] = nextSpells.map(toStoredSpellEntry)

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
  // Resources -- D&D 2024 Character Rules Phase 2A.2, GENERIC CHARACTER
  // RESOURCES.
  //
  // RESOURCE INTERACTION PERFORMANCE (real browser defect: clicking a
  // Rage/Bardic Inspiration/etc. orb visibly waited on TWO sequential
  // round trips -- the authoritative PUT, THEN a full `sheet.
  // refreshDerived()` -- before the orb changed at all; `refreshDerived()`
  // re-runs the ENTIRE Rules Engine evaluation, not just this one
  // resource). Traced this phase, not assumed:
  //   1. The PUT's own response (server/api/.../resources.put.ts) already
  //      returns the fully authoritative `{id, max, expended, remaining}`
  //      for the ONE resource that changed -- sufficient to update the
  //      pool with no second request at all.
  //   2. No Definition anywhere in the Rules Package formula corpus reads
  //      `resource.*` state (confirmed by grep against
  //      packages/eldra-dnd5e-2024/definitions.json) -- expending/
  //      restoring a resource provably changes NO other derived value,
  //      so gating the UI on a full derived refresh was never necessary
  //      for this mutation.
  // `sheet.refreshDerived()` is therefore no longer called here at all.
  // Should a FUTURE resource-linked effect ever need one (this phase's own
  // explicit caveat: do not assume resource spend can NEVER affect derived
  // state), that stays a deliberate, separate choice for whichever new
  // mutation introduces it -- not a default this generic path reinstates.
  //
  // OPTIMISTIC OVERLAY, smallest generic version: `sheet.setResourceOverride`/
  // `clearResourceOverride` (useCharacterSheet.ts) hold authoritative-base +
  // overlay; this domain's only job is WHEN to call them --
  // synchronously on click (optimistic), from the PUT response (authoritative
  // reconciliation), or on failure (rollback) -- reusing the EXACT pure
  // `expendResource`/`restoreResource` clamp functions
  // (app/lib/characters/resources.ts) the server itself uses, never a
  // second reimplementation of their bounds logic, and never recomputing a
  // maximum (always read from `sheet.characterResources`' own current
  // entry, itself Rules-Engine-derived).
  //
  // RAPID INTERACTION / ORDERING SAFETY: `resourceQueues` serializes the
  // NETWORK call per resourceId (the server's own route is a
  // read-modify-write against one persisted record -- two concurrent
  // writes for the SAME resource could otherwise race and lose an update);
  // DIFFERENT resources' queues are fully independent, so spending Rage
  // never waits on Bardic Inspiration's own save. Because at most one
  // network call per resourceId is ever in flight, no response for a given
  // resource can ever arrive out of the order its own request was sent --
  // "stale response" protection falls out of the queue's own structure,
  // not timestamp comparison (see the regression tests this phase adds).
  // -------------------------------------------------------------------

  const resourcesPendingIds = ref<Set<string>>(new Set())
  const resourcesSaving = computed(() => resourcesPendingIds.value.size > 0)
  const resourcesError = ref('')
  // The pure, directly-unit-tested queue (characterResourceInteraction.ts)
  // -- this domain's only job is calling `enqueue`/`isPending` at the
  // right moments and reflecting `isPending` into reactive state for the
  // UI (`resourcesPendingIds`).
  const resourceWriteQueue = createResourceWriteQueue()

  function markResourcePending(resourceId: string, pending: boolean) {
    const next = new Set(resourcesPendingIds.value)
    if (pending) next.add(resourceId)
    else next.delete(resourceId)
    resourcesPendingIds.value = next
  }

  // `amount` -- D&D 2024 Character Rules Phase 2A.2 (large-pool follow-up).
  // 1 for an ordinary orb click, user-entered for a `'points'`-style large
  // pool (CharacterResourceOrbs.vue). Relayed verbatim to the authoritative
  // route; this function never clamps or validates it as AUTHORITY -- the
  // server independently bounds it against the real max/zero regardless
  // of what is sent.
  async function performResourceWrite(resourceId: string, action: 'expend' | 'restore', amount: number) {
    try {
      const result = await $fetch<{ success: true, resource: { id: string, max: number, expended: number, remaining: number } }>(
        `/api/worlds/${worldId.value}/characters/${characterId.value}/resources`,
        { method: 'PUT', body: { resourceId, action, amount } }
      )
      sheet.setResourceOverride(resourceId, result.resource.expended)
      resourcesError.value = ''
    } catch (saveError: any) {
      sheet.clearResourceOverride(resourceId)
      resourcesError.value =
        saveError?.data?.statusMessage || saveError?.statusMessage || 'Failed to update resource'
    }
  }

  function adjustResource(resourceId: string, action: 'expend' | 'restore', amount = 1) {
    const current = sheet.characterResources.value.find((candidate) => candidate.id === resourceId)
    if (!current) return

    // Immediate optimistic overlay -- synchronous, before any network
    // call starts. Computed off whatever is CURRENTLY displayed (already
    // including any still-pending optimistic guess from an earlier rapid
    // click on this same resource), so a burst of clicks accumulates
    // correctly without waiting for a round trip between them.
    sheet.setResourceOverride(resourceId, computeOptimisticExpended(current, action, amount))

    markResourcePending(resourceId, true)
    resourceWriteQueue.enqueue(resourceId, () => performResourceWrite(resourceId, action, amount))
      .finally(() => markResourcePending(resourceId, resourceWriteQueue.isPending(resourceId)))
  }

  function expendResourceUnit({ resourceId, amount }: { resourceId: string; amount: number }) {
    adjustResource(resourceId, 'expend', amount)
  }

  function restoreResourceUnit({ resourceId, amount }: { resourceId: string; amount: number }) {
    adjustResource(resourceId, 'restore', amount)
  }

  const resources = reactive({
    saving: resourcesSaving,
    pendingIds: resourcesPendingIds,
    error: resourcesError,
    expend: expendResourceUnit,
    restore: restoreResourceUnit
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
    portrait,
    combat,
    inventory,
    spellcasting,
    resources,
    conditions
  }
}

export type CharacterMutations = ReturnType<typeof useCharacterMutations>
