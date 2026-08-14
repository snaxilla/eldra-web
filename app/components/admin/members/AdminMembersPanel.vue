<script setup lang="ts">
// Game Admin Members tab -- World Membership Administration. See
// .github/docs/architecture/ownership-and-permissions.md (Revision 2) §8.5
// and this task's own SCOPE/UI sections.
//
// Deliberately simple, per this task's own instruction ("Keep UI
// intentionally simple... No invitation flow."): one component, no
// sub-panels. Adding a member goes through search-and-select
// (GET /api/accounts/search) rather than a raw accountId textbox -- see
// this task's own OBJECTIVE: "The UI should operate on human identity. Not
// storage identity." The uuid a search result carries is never rendered;
// it only ever round-trips from selectedAccount straight into the POST
// body. Every write re-fetches the member list from the server afterward
// rather than updating optimistically, matching the same "always refresh
// from the server" convention AdminRulesPanel.vue already established.
//
// PLAYER DIRECTORY (this task): "Add Member" now offers two ways to reach
// the same `selectedAccount` -- search for an existing Player
// (unchanged), or create a brand-new one (POST /api/players) whose result
// flows STRAIGHT into selectedAccount, exactly like a search result would.
// This is deliberate: it is what makes "Create Player -> Immediately Add
// to World" one continuous task rather than two screens, per this task's
// own MEMBERS PANEL section ("Do NOT send the user to another page").
// Nothing here ever says "Directus User" or "Account" -- this task's own
// PLAYER DIRECTORY section: "The UI should speak about Players."

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

type AccountSearchResult = {
  accountId: string
  displayName: string
}

const ASSIGNABLE_ROLES = ['gm', 'worldbuilder', 'player', 'observer'] as const

const members = ref<Member[]>([])
const membersPending = ref(false)
const membersError = ref('')

// Account search-and-select state. selectedAccount is the ONLY thing
// addMember() reads to identify who is being added -- searchQuery/searchResults
// exist purely to help a human FIND that value; neither is ever sent to
// the server.
const searchQuery = ref('')
const searchResults = ref<AccountSearchResult[]>([])
const searchPending = ref(false)
const searchError = ref('')
const searchAttempted = ref(false)
let searchDebounceTimer: ReturnType<typeof setTimeout> | null = null

const selectedAccount = ref<AccountSearchResult | null>(null)

// Which sub-flow "Add Member" is currently showing, when no account is
// selected yet. Irrelevant once selectedAccount is set -- both flows
// converge on the exact same chip/Change UI at that point.
const addMemberMode = ref<'search' | 'create'>('search')

const newPlayerDisplayName = ref('')
const newPlayerUsername = ref('')
const newPlayerPassword = ref('')
const newPlayerPasswordConfirmation = ref('')
const createPlayerPending = ref(false)
const createPlayerError = ref('')

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

// Debounced, not "autocomplete" -- no ranking, no keyboard navigation, no
// caching, no highlighting. Just enough to avoid firing a request on every
// keystroke, per this task's own NON-GOALS ("No autocomplete optimization").
function onSearchInput() {
  selectedAccount.value = null // typing again invalidates a prior selection
  searchAttempted.value = false
  searchError.value = ''

  if (searchDebounceTimer) clearTimeout(searchDebounceTimer)

  const q = searchQuery.value.trim()
  if (!q) {
    searchResults.value = []
    return
  }

  searchDebounceTimer = setTimeout(() => runSearch(q), 250)
}

async function runSearch(q: string) {
  searchPending.value = true
  searchError.value = ''

  try {
    const response = await $fetch<{ accounts: AccountSearchResult[] }>('/api/accounts/search', {
      query: { q }
    })
    searchResults.value = response.accounts || []
  } catch (error: any) {
    searchResults.value = []
    searchError.value = error?.data?.statusMessage || error?.data?.message || error?.message || 'Search failed.'
  } finally {
    searchPending.value = false
    searchAttempted.value = true
  }
}

// The uuid inside `account` is never displayed -- see selectedAccount's
// own declaration comment. Selecting clears the query/results so the
// chosen account's name is the only thing left on screen.
function selectAccount(account: AccountSearchResult) {
  selectedAccount.value = account
  searchResults.value = []
  searchQuery.value = ''
  searchAttempted.value = false
}

function clearSelection() {
  selectedAccount.value = null
}

function resetCreatePlayerForm() {
  newPlayerDisplayName.value = ''
  newPlayerUsername.value = ''
  newPlayerPassword.value = ''
  newPlayerPasswordConfirmation.value = ''
  createPlayerError.value = ''
}

function switchToSearchMode() {
  addMemberMode.value = 'search'
  resetCreatePlayerForm()
}

function switchToCreateMode() {
  addMemberMode.value = 'create'
  searchQuery.value = ''
  searchResults.value = []
  searchAttempted.value = false
}

// POST /api/players, then flows the result STRAIGHT into selectedAccount
// -- see this file's header comment. The new Player is also, independently,
// immediately findable through the ordinary search box (searchAccounts
// queries Directus live, with nothing cached in between), so nothing here
// needs to special-case "just-created" for the search half to stay correct.
async function createNewPlayer() {
  createPlayerError.value = ''

  if (newPlayerPassword.value !== newPlayerPasswordConfirmation.value) {
    createPlayerError.value = 'Password and confirmation do not match.'
    return
  }

  createPlayerPending.value = true

  try {
    const response = await $fetch<{ player: AccountSearchResult }>('/api/players', {
      method: 'POST',
      body: {
        displayName: newPlayerDisplayName.value,
        username: newPlayerUsername.value,
        password: newPlayerPassword.value,
        passwordConfirmation: newPlayerPasswordConfirmation.value
      }
    })

    selectedAccount.value = response.player
    addMemberMode.value = 'search'
    resetCreatePlayerForm()
  } catch (error: any) {
    createPlayerError.value = error?.data?.statusMessage || error?.data?.message || error?.message || 'Failed to create player.'
  } finally {
    createPlayerPending.value = false
  }
}

async function addMember() {
  if (!selectedAccount.value) {
    addError.value = 'Search for and select an account first.'
    return
  }

  const accountId = selectedAccount.value.accountId

  addPending.value = true
  addError.value = ''

  try {
    await $fetch(`/api/worlds/${worldId.value}/members`, {
      method: 'POST',
      body: { accountId, role: newRole.value }
    })
    selectedAccount.value = null
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
        Search for an existing Player by name, or create a new one right
        here. There is no invitation flow yet -- Directus is never exposed.
      </p>

      <div class="mt-4 flex flex-wrap items-end gap-3">
        <div class="flex min-w-[260px] flex-col gap-1">
          <label class="text-xs uppercase tracking-[0.2em] text-[#9f9278]">Player</label>

          <!-- A selection has been made (via search OR creation): show the
               chosen Player's name, never their id, with a way to pick
               someone else. -->
          <div
            v-if="selectedAccount"
            class="flex items-center justify-between gap-3 border border-[rgba(201,164,90,0.24)] bg-[rgba(10,12,14,0.8)] px-3 py-2 text-sm text-[#fff7df]"
          >
            <span>{{ selectedAccount.displayName }}</span>
            <button
              type="button"
              class="text-xs uppercase tracking-[0.15em] text-[#9f9278] hover:text-[#fff7df]"
              @click="clearSelection"
            >
              Change
            </button>
          </div>

          <template v-else>
            <div class="flex gap-1 text-xs uppercase tracking-[0.15em]">
              <button
                type="button"
                class="border px-2 py-1"
                :class="addMemberMode === 'search'
                  ? 'border-[rgba(201,164,90,0.5)] text-[#fff7df]'
                  : 'border-[rgba(201,164,90,0.24)] text-[#9f9278] hover:text-[#fff7df]'"
                @click="switchToSearchMode"
              >
                Search Existing
              </button>
              <button
                type="button"
                class="border px-2 py-1"
                :class="addMemberMode === 'create'
                  ? 'border-[rgba(201,164,90,0.5)] text-[#fff7df]'
                  : 'border-[rgba(201,164,90,0.24)] text-[#9f9278] hover:text-[#fff7df]'"
                @click="switchToCreateMode"
              >
                Create New Player
              </button>
            </div>

            <!-- Search mode: unchanged. -->
            <div
              v-if="addMemberMode === 'search'"
              class="relative mt-1"
            >
              <input
                v-model="searchQuery"
                type="text"
                placeholder="Search by name..."
                class="w-full rounded-none border border-[rgba(201,164,90,0.24)] bg-[rgba(10,12,14,0.8)] px-3 py-2 text-sm text-[#fff7df]"
                @input="onSearchInput"
              >

              <div
                v-if="searchPending"
                class="mt-1 text-xs text-[#9f9278]"
              >
                Searching...
              </div>

              <ul
                v-else-if="searchResults.length"
                class="absolute z-10 mt-1 w-full border border-[rgba(201,164,90,0.24)] bg-[rgba(10,12,14,0.96)]"
              >
                <li
                  v-for="account in searchResults"
                  :key="account.accountId"
                >
                  <button
                    type="button"
                    class="block w-full px-3 py-2 text-left text-sm text-[#fff7df] hover:bg-[rgba(201,164,90,0.15)]"
                    @click="selectAccount(account)"
                  >
                    {{ account.displayName }}
                  </button>
                </li>
              </ul>

              <div
                v-else-if="searchAttempted && searchQuery.trim()"
                class="mt-1 text-xs text-[#9f9278]"
              >
                No Players found.
              </div>

              <p
                v-if="searchError"
                class="mt-1 text-xs text-red-300"
              >
                {{ searchError }}
              </p>
            </div>

            <!-- Create mode: Display Name / Username / Password / Confirm.
                 On success this flows directly into selectedAccount above
                 -- no extra step to "confirm" the new Player before adding
                 them. -->
            <div
              v-else
              class="mt-1 flex flex-col gap-2 border border-[rgba(201,164,90,0.24)] bg-[rgba(10,12,14,0.8)] p-3"
            >
              <input
                v-model="newPlayerDisplayName"
                type="text"
                placeholder="Display Name"
                class="w-full rounded-none border border-[rgba(201,164,90,0.24)] bg-[rgba(10,12,14,0.6)] px-3 py-2 text-sm text-[#fff7df]"
              >
              <input
                v-model="newPlayerUsername"
                type="text"
                placeholder="Username"
                class="w-full rounded-none border border-[rgba(201,164,90,0.24)] bg-[rgba(10,12,14,0.6)] px-3 py-2 text-sm text-[#fff7df]"
              >
              <input
                v-model="newPlayerPassword"
                type="password"
                placeholder="Password"
                class="w-full rounded-none border border-[rgba(201,164,90,0.24)] bg-[rgba(10,12,14,0.6)] px-3 py-2 text-sm text-[#fff7df]"
              >
              <input
                v-model="newPlayerPasswordConfirmation"
                type="password"
                placeholder="Confirm Password"
                class="w-full rounded-none border border-[rgba(201,164,90,0.24)] bg-[rgba(10,12,14,0.6)] px-3 py-2 text-sm text-[#fff7df]"
              >

              <button
                type="button"
                class="self-start rounded-none border border-[rgba(201,164,90,0.24)] px-3 py-2 text-xs font-semibold text-[#fff7df] disabled:opacity-50"
                :disabled="createPlayerPending"
                @click="createNewPlayer"
              >
                {{ createPlayerPending ? 'Creating…' : 'Create Player' }}
              </button>

              <p
                v-if="createPlayerError"
                class="text-xs text-red-300"
              >
                {{ createPlayerError }}
              </p>
            </div>
          </template>
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
          :disabled="addPending || !selectedAccount"
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
