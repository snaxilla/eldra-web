<script setup lang="ts">
// Game Admin -- Player Management's "Account & Deletion" detail surface.
//
// PLAYER MANAGEMENT PRESENTATION FIX (unchanged from the original
// version): this content lives in a dedicated drawer, mounted OUTSIDE the
// roster grid it describes, so opening it never stretches a roster card
// and bends the `md:grid-cols-2 2xl:grid-cols-3` layout -- the same shell
// convention SheetItemDetailDrawer.vue/SheetNoteDetailDrawer.vue already
// establish for the Character Sheet.
//
// PLAYER MANAGEMENT OWNERSHIP + DELETION (this task): both sections below
// are now REAL. Ownership reads/writes
// GET/PUT/DELETE /api/worlds/:id/characters/:characterId/owner
// (server/utils/character-ownership.ts); deletion previews via
// GET .../deletion-impact and executes via the SAME
// DELETE /api/worlds/:id/characters/:characterId the standalone Characters
// page already calls (server/utils/character-deletion.ts) -- there is no
// second delete endpoint, so fixing that one route in place is what makes
// both callers safe.
//
// BOTH REQUIRE platform.character.manage (server-side, not just hidden
// client-side) -- an ordinary World GM/Owner opening Game Admin at all
// already requires platform.settings.manage (app/middleware/admin.ts), so
// in practice only a Platform Admin with the EXTRA, explicitly-granted
// platform.character.manage capability can successfully call either
// endpoint; everyone else sees the server's own 403 surfaced as an error
// state below, never a silently-hidden button pretending the capability
// doesn't exist.

import AdminAccountPicker, { type AccountSearchResult } from './AdminAccountPicker.vue'

const props = defineProps<{
  entity?: any | null
  worldId: string | number
  entityId: (entity: any) => string
  entityTitle: (entity: any) => string
  entityTypeLabel: (entity: any) => string
}>()

const emit = defineEmits<{
  (event: 'close'): void
  (event: 'deleted', entityId: string): void
}>()

const title = computed(() => (props.entity ? props.entityTitle(props.entity) : ''))
const typeLabel = computed(() => (props.entity ? props.entityTypeLabel(props.entity) : ''))
const currentEntityId = computed(() => (props.entity ? props.entityId(props.entity) : ''))
const worldIdValue = computed(() => String(props.worldId || ''))

// ---------------------------------------------------------------------
// Ownership
// ---------------------------------------------------------------------

type OwnershipHistoryEntry = {
  id: string
  previousOwnerDisplayName: string | null
  newOwnerDisplayName: string | null
  actorDisplayName: string | null
  changedAt: string | null
  // pending/failed are write-safety diagnostics (no cross-collection
  // transaction exists -- see server/utils/character-ownership.ts's own
  // header): 'completed' is the only status that confirms this row's own
  // description is accurate. The CURRENT owner is never read from this
  // history -- only from the entity itself -- so a pending/failed row
  // here is informational, never something the admin needs to act on to
  // find out who really owns the character.
  status: 'pending' | 'completed' | 'failed'
}

const ownershipLoading = ref(false)
const ownershipError = ref('')
const ownerAccountId = ref<string | null>(null)
const ownerDisplayName = ref<string | null>(null)
const ownershipHistory = ref<OwnershipHistoryEntry[]>([])
const ownershipNotSupported = ref(false) // true for a non-ownable (NPC) entity type -- not an error, just not applicable

const pickerAccount = ref<AccountSearchResult | null>(null)
const pickerRef = ref<InstanceType<typeof AdminAccountPicker> | null>(null)
const assignPending = ref(false)
const assignError = ref('')
const assignSuccess = ref('')

async function loadOwnership() {
  ownershipError.value = ''
  assignError.value = ''
  assignSuccess.value = ''
  ownershipNotSupported.value = false

  const entityId = currentEntityId.value
  if (!entityId || !worldIdValue.value) return

  ownershipLoading.value = true
  try {
    const response = await $fetch<{
      ownership: { ownerAccountId: string | null; ownerDisplayName: string | null }
      history: OwnershipHistoryEntry[]
    }>(`/api/worlds/${worldIdValue.value}/characters/${entityId}/owner`)

    ownerAccountId.value = response.ownership.ownerAccountId
    ownerDisplayName.value = response.ownership.ownerDisplayName
    ownershipHistory.value = response.history || []
  } catch (error: any) {
    if (error?.statusCode === 400 || error?.response?.status === 400) {
      // "Entity type is not an ownable character" -- an NPC opened through
      // this same drawer. Not a failure to report, just a section to hide.
      ownershipNotSupported.value = true
    } else {
      ownerAccountId.value = null
      ownerDisplayName.value = null
      ownershipHistory.value = []
      ownershipError.value =
        error?.data?.statusMessage || error?.data?.message || error?.message || 'Failed to load ownership.'
    }
  } finally {
    ownershipLoading.value = false
  }
}

async function assignOwner() {
  if (!pickerAccount.value) return

  assignPending.value = true
  assignError.value = ''
  assignSuccess.value = ''

  try {
    const response = await $fetch<{ changed: boolean; ownership: { ownerAccountId: string | null } }>(
      `/api/worlds/${worldIdValue.value}/characters/${currentEntityId.value}/owner`,
      { method: 'PUT', body: { accountId: pickerAccount.value.accountId } }
    )

    assignSuccess.value = response.changed
      ? `Owner set to ${pickerAccount.value.displayName}.`
      : `${pickerAccount.value.displayName} is already the owner.`
    pickerRef.value?.reset()
    await loadOwnership()
  } catch (error: any) {
    assignError.value =
      error?.data?.statusMessage || error?.data?.message || error?.message || 'Failed to assign owner.'
  } finally {
    assignPending.value = false
  }
}

const unassignPending = ref(false)

async function unassignOwner() {
  unassignPending.value = true
  assignError.value = ''
  assignSuccess.value = ''

  try {
    const response = await $fetch<{ changed: boolean }>(
      `/api/worlds/${worldIdValue.value}/characters/${currentEntityId.value}/owner`,
      { method: 'DELETE' }
    )
    assignSuccess.value = response.changed ? 'Owner removed. This character is now Unassigned.' : 'Already Unassigned.'
    await loadOwnership()
  } catch (error: any) {
    assignError.value =
      error?.data?.statusMessage || error?.data?.message || error?.message || 'Failed to remove owner.'
  } finally {
    unassignPending.value = false
  }
}

function formatChangedAt(value: string | null) {
  if (!value) return '—'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString()
}

// ---------------------------------------------------------------------
// Deletion
// ---------------------------------------------------------------------

// Revision 2 (complete purge): every field below is a count of rows that
// WILL BE PERMANENTLY DELETED -- there is no longer a "preserved" or
// "detached" category to word differently. The owner's Eldra Account is
// never part of this plan at all (server/utils/character-deletion.ts
// never names eldra_accounts/eldra_identity_links), which is why the
// confirmation copy below states that explicitly rather than listing it
// as "unaffected" alongside things that actually ARE being removed.
type DeletionImpactPlan = {
  sheets: { count: number }
  inventoryRows: { count: number }
  blockInstances: number
  entityActions: number
  entityStatblocks: number
  monsterProfiles: number
  transfers: { count: number }
  relationships: { count: number }
  rollEvents: { count: number }
  mapPins: { count: number }
  ownershipChanges: { count: number }
}

// Three explicit stages, not a boolean -- "show impact" and "actually
// delete" must be two separate, deliberate clicks (this task's own
// instruction: "explicit confirmation flow... showing what will be
// deleted... before the Admin confirms").
const deletionStage = ref<'idle' | 'previewing' | 'confirming' | 'deleting'>('idle')
const deletionImpact = ref<DeletionImpactPlan | null>(null)
const deletionError = ref('')

async function startDeletion() {
  deletionStage.value = 'previewing'
  deletionError.value = ''
  deletionImpact.value = null

  try {
    const response = await $fetch<{ plan: DeletionImpactPlan }>(
      `/api/worlds/${worldIdValue.value}/characters/${currentEntityId.value}/deletion-impact`
    )
    deletionImpact.value = response.plan
    deletionStage.value = 'confirming'
  } catch (error: any) {
    deletionError.value =
      error?.data?.statusMessage || error?.data?.message || error?.message || 'Failed to load deletion impact.'
    deletionStage.value = 'idle'
  }
}

function cancelDeletion() {
  deletionStage.value = 'idle'
  deletionImpact.value = null
  deletionError.value = ''
}

async function confirmDeletion() {
  const entityId = currentEntityId.value
  deletionStage.value = 'deleting'
  deletionError.value = ''

  try {
    await $fetch(`/api/worlds/${worldIdValue.value}/characters/${entityId}`, { method: 'DELETE' })
    emit('deleted', entityId)
    emit('close')
  } catch (error: any) {
    deletionError.value =
      error?.data?.statusMessage || error?.data?.message || error?.message || 'Failed to delete character.'
    deletionStage.value = 'confirming'
  }
}

// ---------------------------------------------------------------------
// Open/close -- STALE STATE: every field above is reset the moment the
// entity changes or the drawer closes, so switching from one character
// to the next (or reopening) never shows a flash of the PREVIOUS
// character's owner/impact data while the new fetch is in flight.
// ---------------------------------------------------------------------

watch(
  () => currentEntityId.value,
  (entityId) => {
    ownerAccountId.value = null
    ownerDisplayName.value = null
    ownershipHistory.value = []
    ownershipError.value = ''
    ownershipNotSupported.value = false
    assignError.value = ''
    assignSuccess.value = ''
    pickerRef.value?.reset()
    cancelDeletion()

    if (entityId) {
      loadOwnership()
    }
  },
  { immediate: true }
)

function close() {
  emit('close')
}
</script>

<template>
  <Transition
    enter-from-class="translate-x-full opacity-0"
    enter-active-class="transition duration-200"
    leave-to-class="translate-x-full opacity-0"
    leave-active-class="transition duration-200"
  >
    <div
      v-if="entity"
      class="fixed inset-0 z-[140] bg-black/60 backdrop-blur-sm md:pointer-events-none md:bg-transparent md:backdrop-blur-none"
      @click.self="close"
    >
      <aside
        class="eldra-ornate-panel eldra-frame-corners fixed bottom-0 right-0 top-0 flex h-full w-full max-w-[440px] flex-col border-l backdrop-blur-xl md:pointer-events-auto"
        role="dialog"
        aria-modal="true"
        :aria-label="`Account and deletion for ${title}`"
      >
        <div class="flex items-start justify-between gap-3 border-b border-[rgba(201,164,90,0.22)] px-5 py-4">
          <div class="min-w-0">
            <div class="text-xs uppercase tracking-[0.35em] text-[#9f9278]">
              Account &amp; Deletion
            </div>
            <h2 class="mt-2 truncate text-2xl font-semibold text-white">
              {{ title }}
            </h2>
            <div class="mt-1 text-xs text-[#9f9278]">
              {{ typeLabel }}
            </div>
          </div>

          <button
            type="button"
            class="rounded-none border border-[rgba(201,164,90,0.24)] bg-[rgba(20,17,12,0.72)] p-2 text-[#b5a88d] transition hover:bg-[rgba(201,164,90,0.10)] hover:text-[#fff7df]"
            @click="close"
          >
            <UIcon name="i-lucide-x" class="h-4 w-4" />
          </button>
        </div>

        <div class="flex-1 overflow-y-auto px-5 py-5">
          <div class="grid gap-4">
            <!-- OWNERSHIP ------------------------------------------------ -->
            <div
              v-if="!ownershipNotSupported"
              class="rounded-none border border-dashed border-[rgba(201,164,90,0.28)] bg-[rgba(20,17,12,0.55)] p-4"
            >
              <div class="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#9f9278]">
                Account Owner
              </div>

              <div
                v-if="ownershipLoading"
                class="mt-3 text-sm text-[#9f9278]"
              >
                Loading owner...
              </div>

              <template v-else>
                <p
                  v-if="ownershipError"
                  class="mt-2 text-sm text-red-300"
                >
                  {{ ownershipError }}
                </p>

                <template v-else>
                  <p class="mt-2 text-sm leading-6 text-[#d8ceb8]">
                    <span v-if="ownerDisplayName">Owned by <span class="text-[#fff7df]">{{ ownerDisplayName }}</span>.</span>
                    <span v-else>Unassigned.</span>
                  </p>

                  <div class="mt-3">
                    <AdminAccountPicker
                      ref="pickerRef"
                      v-model="pickerAccount"
                      placeholder="Search accounts to assign..."
                      :disabled="assignPending || unassignPending"
                    />
                  </div>

                  <div class="mt-3 flex flex-wrap gap-2">
                    <button
                      type="button"
                      :disabled="!pickerAccount || assignPending"
                      class="eldra-button rounded-none px-3 py-2 text-xs font-semibold disabled:cursor-not-allowed disabled:opacity-40"
                      @click="assignOwner"
                    >
                      {{ assignPending ? 'Assigning...' : ownerAccountId ? 'Reassign Owner' : 'Assign Owner' }}
                    </button>

                    <button
                      v-if="ownerAccountId"
                      type="button"
                      :disabled="unassignPending"
                      class="rounded-none border border-[rgba(201,164,90,0.24)] px-3 py-2 text-xs font-semibold text-[#d8ceb8] disabled:cursor-not-allowed disabled:opacity-40"
                      @click="unassignOwner"
                    >
                      {{ unassignPending ? 'Removing...' : 'Remove Owner' }}
                    </button>
                  </div>

                  <p
                    v-if="assignError"
                    class="mt-2 text-sm text-red-300"
                  >
                    {{ assignError }}
                  </p>
                  <p
                    v-else-if="assignSuccess"
                    class="mt-2 text-sm text-emerald-300"
                  >
                    {{ assignSuccess }}
                  </p>

                  <details
                    v-if="ownershipHistory.length"
                    class="mt-4"
                  >
                    <summary class="cursor-pointer text-xs uppercase tracking-[0.15em] text-[#9f9278] hover:text-[#fff7df]">
                      Ownership history ({{ ownershipHistory.length }})
                    </summary>
                    <ul class="mt-2 grid gap-2">
                      <li
                        v-for="entry in ownershipHistory"
                        :key="entry.id"
                        class="border border-[rgba(201,164,90,0.16)] px-2 py-1.5 text-xs text-[#d8ceb8]"
                      >
                        <span v-if="entry.newOwnerDisplayName">Assigned to {{ entry.newOwnerDisplayName }}</span>
                        <span v-else>Unassigned</span>
                        <span v-if="entry.previousOwnerDisplayName"> (from {{ entry.previousOwnerDisplayName }})</span>
                        <span
                          v-if="entry.status !== 'completed'"
                          class="ml-1 text-[10px] uppercase tracking-[0.1em]"
                          :class="entry.status === 'failed' ? 'text-red-300' : 'text-amber-300'"
                        >
                          ({{ entry.status === 'failed' ? 'did not take effect' : 'unconfirmed' }})
                        </span>
                        <span class="block text-[#9f9278]">
                          by {{ entry.actorDisplayName || 'Unknown' }} · {{ formatChangedAt(entry.changedAt) }}
                        </span>
                      </li>
                    </ul>
                  </details>
                </template>
              </template>
            </div>

            <!-- DELETION --------------------------------------------------- -->
            <div class="rounded-none border border-dashed border-red-500/25 bg-[rgba(20,17,12,0.55)] p-4">
              <div class="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#9f9278]">
                Delete Character
              </div>

              <template v-if="deletionStage === 'idle'">
                <p class="mt-2 text-sm leading-6 text-[#d8ceb8]">
                  Permanently removes {{ title }} and everything tied to it -- sheet, inventory, roll history,
                  relationships, inventory transfers, map pins, and ownership history. This account's owner
                  (if any) is never affected.
                </p>
                <button
                  type="button"
                  class="mt-3 rounded-none border border-red-500/40 px-3 py-2 text-xs font-semibold text-red-300 hover:bg-red-500/10"
                  @click="startDeletion"
                >
                  Delete Character...
                </button>
              </template>

              <template v-else-if="deletionStage === 'previewing'">
                <p class="mt-2 text-sm text-[#9f9278]">
                  Checking what this would affect...
                </p>
              </template>

              <template v-else-if="deletionStage === 'confirming' && deletionImpact">
                <p class="mt-2 text-sm leading-6 text-[#d8ceb8]">
                  Deleting <span class="text-[#fff7df]">{{ title }}</span> will permanently remove:
                </p>
                <ul class="mt-2 grid gap-1 text-xs text-[#d8ceb8]">
                  <li>The character itself</li>
                  <li v-if="deletionImpact.sheets.count">
                    {{ deletionImpact.sheets.count }} character sheet(s)
                  </li>
                  <li v-if="deletionImpact.inventoryRows.count">
                    {{ deletionImpact.inventoryRows.count }} inventory item(s)
                  </li>
                  <li v-if="deletionImpact.blockInstances || deletionImpact.entityActions || deletionImpact.entityStatblocks || deletionImpact.monsterProfiles">
                    {{ deletionImpact.blockInstances + deletionImpact.entityActions + deletionImpact.entityStatblocks + deletionImpact.monsterProfiles }} supporting record(s) (blocks/actions/statblocks)
                  </li>
                  <li v-if="deletionImpact.transfers.count">
                    {{ deletionImpact.transfers.count }} inventory transfer record(s) -- including the counterparty's copy of each
                  </li>
                  <li v-if="deletionImpact.relationships.count">
                    {{ deletionImpact.relationships.count }} relationship record(s)
                  </li>
                  <li v-if="deletionImpact.rollEvents.count">
                    {{ deletionImpact.rollEvents.count }} roll history row(s)
                  </li>
                  <li v-if="deletionImpact.mapPins.count">
                    {{ deletionImpact.mapPins.count }} map pin(s)
                  </li>
                  <li v-if="deletionImpact.ownershipChanges.count">
                    {{ deletionImpact.ownershipChanges.count }} ownership history record(s)
                  </li>
                </ul>
                <p class="mt-3 text-xs leading-5 text-[#9f9278]">
                  The owner's Eldra Account, sign-in, and World membership are NOT affected -- only this
                  character and the records listed above.
                </p>
                <p class="mt-2 text-xs font-semibold uppercase tracking-[0.15em] text-red-300">
                  This cannot be undone.
                </p>
                <div class="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    class="rounded-none border border-red-500/50 bg-red-500/10 px-3 py-2 text-xs font-semibold text-red-200 hover:bg-red-500/20"
                    @click="confirmDeletion"
                  >
                    Yes, Delete {{ title }}
                  </button>
                  <button
                    type="button"
                    class="rounded-none border border-[rgba(201,164,90,0.24)] px-3 py-2 text-xs font-semibold text-[#d8ceb8]"
                    @click="cancelDeletion"
                  >
                    Cancel
                  </button>
                </div>
              </template>

              <template v-else-if="deletionStage === 'deleting'">
                <p class="mt-2 text-sm text-[#9f9278]">
                  Deleting...
                </p>
              </template>

              <p
                v-if="deletionError"
                class="mt-3 text-sm text-red-300"
              >
                {{ deletionError }}
              </p>
            </div>
          </div>
        </div>

        <div class="border-t border-[rgba(201,164,90,0.22)] p-5">
          <button
            type="button"
            class="flex-1 eldra-button w-full rounded-none px-4 py-3 text-sm font-medium"
            @click="close"
          >
            Close
          </button>
        </div>
      </aside>
    </div>
  </Transition>
</template>
