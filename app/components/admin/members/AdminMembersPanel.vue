<script setup lang="ts">
// Game Admin Members tab -- World Membership Administration. See
// .github/docs/architecture/ownership-and-permissions.md (Revision 2) §8.5
// and this task's own SCOPE/UI sections.
//
// Deliberately simple, per this task's own instruction ("Keep UI
// intentionally simple. No search optimization. No invitation flow."):
// one component, no sub-panels, no autocomplete. Adding a member takes a
// raw accountId (an existing Directus user id) -- there is no Accounts
// collection or lookup-by-email to search against yet (NON-GOALS: no
// Accounts, no IdentityLinks, no email). Every write re-fetches the member
// list from the server afterward rather than updating optimistically,
// matching the same "always refresh from the server" convention
// AdminRulesPanel.vue already established.

const props = defineProps<{
  worldId: string | number
}>()

const worldId = computed(() => String(props.worldId || ''))

type Member = {
  id: string
  worldId: string
  accountId: string
  role: 'owner' | 'gm' | 'worldbuilder' | 'player' | 'observer'
  displayName: string
  createdAt: string | null
}

const ASSIGNABLE_ROLES = ['gm', 'worldbuilder', 'player', 'observer'] as const

const members = ref<Member[]>([])
const membersPending = ref(false)
const membersError = ref('')

const newAccountId = ref('')
const newRole = ref<(typeof ASSIGNABLE_ROLES)[number]>('player')
const addPending = ref(false)
const addError = ref('')

// Per-row pending flags, keyed by accountId, so one row's role-change/
// remove request in flight doesn't disable every other row's controls.
const rolePendingFor = ref<Record<string, boolean>>({})
const removePendingFor = ref<Record<string, boolean>>({})
const rowError = ref<Record<string, string>>({})

async function loadMembers() {
  if (!worldId.value) return

  membersPending.value = true
  membersError.value = ''

  try {
    const response = await $fetch<{ members: Member[] }>(`/api/worlds/${worldId.value}/members`)
    members.value = response.members || []
  } catch (error: any) {
    members.value = []
    membersError.value = error?.data?.statusMessage || error?.data?.message || error?.message || 'Failed to load members.'
  } finally {
    membersPending.value = false
  }
}

watch(worldId, loadMembers, { immediate: true })

function formatJoined(createdAt: string | null) {
  if (!createdAt) return '—'
  const date = new Date(createdAt)
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleDateString()
}

async function addMember() {
  const accountId = newAccountId.value.trim()
  if (!accountId) {
    addError.value = 'Account ID is required.'
    return
  }

  addPending.value = true
  addError.value = ''

  try {
    await $fetch(`/api/worlds/${worldId.value}/members`, {
      method: 'POST',
      body: { accountId, role: newRole.value }
    })
    newAccountId.value = ''
    newRole.value = 'player'
    await loadMembers()
  } catch (error: any) {
    addError.value = error?.data?.statusMessage || error?.data?.message || error?.message || 'Failed to add member.'
  } finally {
    addPending.value = false
  }
}

async function changeRole(member: Member, role: string) {
  if (role === member.role) return

  rolePendingFor.value = { ...rolePendingFor.value, [member.accountId]: true }
  rowError.value = { ...rowError.value, [member.accountId]: '' }

  try {
    await $fetch(`/api/worlds/${worldId.value}/members/${member.accountId}`, {
      method: 'PATCH',
      body: { role }
    })
    await loadMembers()
  } catch (error: any) {
    rowError.value = {
      ...rowError.value,
      [member.accountId]: error?.data?.statusMessage || error?.data?.message || error?.message || 'Failed to change role.'
    }
  } finally {
    rolePendingFor.value = { ...rolePendingFor.value, [member.accountId]: false }
  }
}

async function removeMember(member: Member) {
  const ok = window.confirm(`Remove ${member.displayName} from this World?`)
  if (!ok) return

  removePendingFor.value = { ...removePendingFor.value, [member.accountId]: true }
  rowError.value = { ...rowError.value, [member.accountId]: '' }

  try {
    await $fetch(`/api/worlds/${worldId.value}/members/${member.accountId}`, {
      method: 'DELETE'
    })
    await loadMembers()
  } catch (error: any) {
    rowError.value = {
      ...rowError.value,
      [member.accountId]: error?.data?.statusMessage || error?.data?.message || error?.message || 'Failed to remove member.'
    }
  } finally {
    removePendingFor.value = { ...removePendingFor.value, [member.accountId]: false }
  }
}
</script>

<template>
  <section class="mt-6 grid gap-5">
    <div class="eldra-ornate-panel eldra-frame-corners rounded-none border border-[rgba(201,164,90,0.24)] bg-[rgba(10,12,14,0.64)] p-5 backdrop-blur">
      <div class="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div class="text-xs uppercase tracking-[0.3em] text-[#9f9278]">
            World Membership
          </div>
          <h2 class="mt-2 text-2xl font-semibold text-white">
            Members
          </h2>
          <p class="mt-2 max-w-2xl text-sm leading-6 text-[#d8ceb8]">
            Who has access to this World, and what they may do here. The Owner
            cannot be changed or removed from this panel.
          </p>
        </div>

        <button
          type="button"
          class="rounded-none border border-[rgba(201,164,90,0.24)] px-3 py-2 text-xs font-semibold text-[#fff7df]"
          @click="loadMembers"
        >
          Refresh
        </button>
      </div>

      <div
        v-if="membersPending"
        class="mt-5 rounded-none border border-dashed border-[rgba(201,164,90,0.20)] p-6 text-sm text-[#9f9278]"
      >
        Loading members...
      </div>

      <div
        v-else-if="membersError"
        class="mt-5 rounded-none border border-red-500/20 bg-red-500/10 p-4 text-sm text-red-200"
      >
        {{ membersError }}
      </div>

      <div
        v-else
        class="mt-5 overflow-x-auto"
      >
        <table class="w-full border-collapse text-left text-sm">
          <thead>
            <tr class="border-b border-[rgba(201,164,90,0.24)] text-xs uppercase tracking-[0.2em] text-[#9f9278]">
              <th class="py-2 pr-4 font-semibold">
                Display Name
              </th>
              <th class="py-2 pr-4 font-semibold">
                Role
              </th>
              <th class="py-2 pr-4 font-semibold">
                Joined
              </th>
              <th class="py-2 pr-4 font-semibold" />
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="member in members"
              :key="member.accountId"
              class="border-b border-[rgba(201,164,90,0.12)]"
            >
              <td class="py-3 pr-4 text-[#fff7df]">
                {{ member.displayName }}
              </td>
              <td class="py-3 pr-4">
                <span
                  v-if="member.role === 'owner'"
                  class="text-[#d8ceb8]"
                >Owner</span>
                <select
                  v-else
                  class="rounded-none border border-[rgba(201,164,90,0.24)] bg-[rgba(10,12,14,0.8)] px-2 py-1 text-sm text-[#fff7df]"
                  :value="member.role"
                  :disabled="rolePendingFor[member.accountId]"
                  @change="changeRole(member, ($event.target as HTMLSelectElement).value)"
                >
                  <option
                    v-for="role in ASSIGNABLE_ROLES"
                    :key="role"
                    :value="role"
                  >
                    {{ role }}
                  </option>
                </select>
              </td>
              <td class="py-3 pr-4 text-[#9f9278]">
                {{ formatJoined(member.createdAt) }}
              </td>
              <td class="py-3 pr-4 text-right">
                <button
                  v-if="member.role !== 'owner'"
                  type="button"
                  class="rounded-none border border-red-500/30 px-2 py-1 text-xs font-semibold text-red-200 disabled:opacity-50"
                  :disabled="removePendingFor[member.accountId]"
                  @click="removeMember(member)"
                >
                  Remove
                </button>
              </td>
              <td
                v-if="rowError[member.accountId]"
                colspan="4"
                class="pb-2 text-xs text-red-300"
              >
                {{ rowError[member.accountId] }}
              </td>
            </tr>
            <tr v-if="!members.length">
              <td
                colspan="4"
                class="py-6 text-center text-sm text-[#9f9278]"
              >
                No members yet.
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <div class="eldra-ornate-panel eldra-frame-corners rounded-none border border-[rgba(201,164,90,0.24)] bg-[rgba(10,12,14,0.64)] p-5 backdrop-blur">
      <div class="text-xs uppercase tracking-[0.3em] text-[#9f9278]">
        Add Member
      </div>
      <p class="mt-2 max-w-2xl text-sm leading-6 text-[#d8ceb8]">
        Add an existing account by its account ID. There is no invitation
        flow yet -- the account must already exist.
      </p>

      <div class="mt-4 flex flex-wrap items-end gap-3">
        <div class="flex flex-col gap-1">
          <label class="text-xs uppercase tracking-[0.2em] text-[#9f9278]">Account ID</label>
          <input
            v-model="newAccountId"
            type="text"
            placeholder="Account ID"
            class="rounded-none border border-[rgba(201,164,90,0.24)] bg-[rgba(10,12,14,0.8)] px-3 py-2 text-sm text-[#fff7df]"
          >
        </div>

        <div class="flex flex-col gap-1">
          <label class="text-xs uppercase tracking-[0.2em] text-[#9f9278]">Role</label>
          <select
            v-model="newRole"
            class="rounded-none border border-[rgba(201,164,90,0.24)] bg-[rgba(10,12,14,0.8)] px-3 py-2 text-sm text-[#fff7df]"
          >
            <option
              v-for="role in ASSIGNABLE_ROLES"
              :key="role"
              :value="role"
            >
              {{ role }}
            </option>
          </select>
        </div>

        <button
          type="button"
          class="rounded-none border border-[rgba(201,164,90,0.24)] px-3 py-2 text-xs font-semibold text-[#fff7df] disabled:opacity-50"
          :disabled="addPending"
          @click="addMember"
        >
          Add Member
        </button>
      </div>

      <p
        v-if="addError"
        class="mt-3 text-xs text-red-300"
      >
        {{ addError }}
      </p>
    </div>
  </section>
</template>
