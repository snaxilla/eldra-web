<script setup lang="ts">
// Reusable account search-and-select widget -- Player Management
// (character ownership). Extracted from
// app/components/admin/members/AdminMembersPanel.vue's own inline search
// (same debounce timing, same GET /api/accounts/search, same loading/
// empty/error states) now that a SECOND consumer needs it: that panel's
// own inline version is left untouched (working, unrelated to this task),
// this component is what the new Player Management ownership picker uses.
//
// No "create new player" sub-flow here, unlike AdminMembersPanel's own
// Add Member widget -- a brand-new Player has no World membership yet,
// and assigning ownership requires one (server/utils/character-ownership.ts's
// own validation), so creating one inline here would hand back a
// selection the very next request would reject. That flow still lives in
// AdminMembersPanel; this component is deliberately narrower.
//
// The uuid inside a result is never rendered -- only `displayName` ever
// reaches the DOM. No password, token, or email crosses this boundary:
// GET /api/accounts/search already strips to {accountId, displayName}
// (server/utils/accounts.ts), and this component asks for nothing more.
export type AccountSearchResult = {
  accountId: string
  displayName: string
}

const props = defineProps<{
  modelValue: AccountSearchResult | null
  placeholder?: string
  disabled?: boolean
}>()

const emit = defineEmits<{
  (event: 'update:modelValue', value: AccountSearchResult | null): void
}>()

const searchQuery = ref('')
const searchResults = ref<AccountSearchResult[]>([])
const searchPending = ref(false)
const searchError = ref('')
const searchAttempted = ref(false)
let debounceTimer: ReturnType<typeof setTimeout> | null = null

function onInput() {
  emit('update:modelValue', null) // typing again invalidates a prior selection
  searchAttempted.value = false
  searchError.value = ''

  if (debounceTimer) clearTimeout(debounceTimer)

  const q = searchQuery.value.trim()
  if (!q) {
    searchResults.value = []
    return
  }

  debounceTimer = setTimeout(() => runSearch(q), 250)
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

function select(account: AccountSearchResult) {
  emit('update:modelValue', account)
  searchResults.value = []
  searchQuery.value = ''
  searchAttempted.value = false
}

function clearSelection() {
  emit('update:modelValue', null)
}

// A caller may reset this picker from the outside (e.g. after a
// confirmed assignment) without needing to know this component's own
// internal field names.
function reset() {
  searchQuery.value = ''
  searchResults.value = []
  searchAttempted.value = false
  searchError.value = ''
  emit('update:modelValue', null)
}

defineExpose({ reset })
</script>

<template>
  <div class="flex flex-col gap-1">
    <div
      v-if="modelValue"
      class="flex items-center justify-between gap-3 border border-[rgba(201,164,90,0.24)] bg-[rgba(10,12,14,0.8)] px-3 py-2 text-sm text-[#fff7df]"
    >
      <span class="truncate">{{ modelValue.displayName }}</span>
      <button
        type="button"
        class="shrink-0 text-xs uppercase tracking-[0.15em] text-[#9f9278] hover:text-[#fff7df]"
        :disabled="disabled"
        @click="clearSelection"
      >
        Change
      </button>
    </div>

    <div
      v-else
      class="relative"
    >
      <input
        v-model="searchQuery"
        type="text"
        :placeholder="placeholder || 'Search by name...'"
        :disabled="disabled"
        class="w-full rounded-none border border-[rgba(201,164,90,0.24)] bg-[rgba(10,12,14,0.8)] px-3 py-2 text-sm text-[#fff7df] disabled:opacity-50"
        @input="onInput"
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
            @click="select(account)"
          >
            {{ account.displayName }}
          </button>
        </li>
      </ul>

      <div
        v-else-if="searchAttempted && searchQuery.trim()"
        class="mt-1 text-xs text-[#9f9278]"
      >
        No accounts found.
      </div>

      <p
        v-if="searchError"
        class="mt-1 text-xs text-red-300"
      >
        {{ searchError }}
      </p>
    </div>
  </div>
</template>
