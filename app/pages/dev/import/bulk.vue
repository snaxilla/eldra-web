<script setup lang="ts">
const selectedWorldId = ref('1')
const selectedDataset = ref('spells')
const selectedMode = ref('upsert')

const sourceMode = ref<'all' | 'one' | 'custom'>('one')
const selectedSource = ref('PHB')
const customSource = ref('')

const loading = ref(false)
const result = ref<any | null>(null)
const errorMessage = ref('')

const { data: worlds } = await useFetch('/api/worlds')

const datasetOptions = [
  { value: 'spells', label: 'Spells' },
  { value: 'items', label: 'Items' },
  { value: 'backgrounds', label: 'Backgrounds' },
  { value: 'feats', label: 'Feats' },
  { value: 'species', label: 'Species' },
  { value: 'classes', label: 'Classes' }
]

const modeOptions = [
  { value: 'create', label: 'Create only' },
  { value: 'update', label: 'Update only' },
  { value: 'upsert', label: 'Upsert' }
]

const sourcebookOptions = [
  { code: 'XPHB', label: "Player's Handbook (2024) — XPHB" },
  { code: 'PHB', label: "Player's Handbook (2014) — PHB" },
  { code: 'MM', label: "Monster Manual (2014) — MM" },
  { code: 'DMG', label: "Dungeon Master's Guide (2014) — DMG" },
  { code: 'XDMG', label: "Dungeon Master's Guide (2024) — XDMG" },
  { code: 'XMM', label: "Monster Manual (2025) — XMM" },
  { code: 'VGM', label: "Volo's Guide to Monsters — VGM" },
  { code: 'XGE', label: "Xanathar's Guide to Everything — XGE" },
  { code: 'MTF', label: "Mordenkainen's Tome of Foes — MTF" },
  { code: 'AI', label: 'Acquisitions Incorporated — AI' },
  { code: 'TCE', label: "Tasha's Cauldron of Everything — TCE" },
  { code: 'FTD', label: "Fizban's Treasury of Dragons — FTD" },
  { code: 'MPMM', label: 'Mordenkainen Presents: Monsters of the Multiverse — MPMM' },
  { code: 'BGG', label: 'Bigby Presents: Glory of the Giants — BGG' },
  { code: 'BMT', label: 'The Book of Many Things — BMT' },
  { code: 'SCAG', label: "Sword Coast Adventurer's Guide — SCAG" },
  { code: 'GGR', label: "Guildmasters' Guide to Ravnica — GGR" },
  { code: 'ERLW', label: 'Eberron: Rising from the Last War — ERLW' },
  { code: 'EGW', label: "Explorer's Guide to Wildemount — EGW" },
  { code: 'MOT', label: 'Mythic Odysseys of Theros — MOT' },
  { code: 'VRGR', label: "Van Richten's Guide to Ravenloft — VRGR" },
  { code: 'SCC', label: 'Strixhaven: A Curriculum of Chaos — SCC' },
  { code: 'AAG', label: "Astral Adventurer's Guide — AAG" },
  { code: 'BAM', label: "Boo's Astral Menagerie — BAM" },
  { code: 'MPP', label: "Morte's Planar Parade — MPP" },
  { code: 'SATO', label: 'Sigil and the Outlands — SATO' },
  { code: 'FRAIF', label: 'Forgotten Realms: Adventures in Faerun — FRAIF' },
  { code: 'FRHoF', label: 'Forgotten Realms Heroes of Faerun — FRHoF' },
  { code: 'EFA', label: 'Eberron: Forge of the Artificer — EFA' },
  { code: 'Ps-Z', label: 'Plane Shift: Zendikar — Ps-Z' },
  { code: 'PS-I', label: 'Plane Shift: Innistrad — PS-I' },
  { code: 'PS-K', label: 'Plane Shift: Kaladesh — PS-K' },
  { code: 'PS-A', label: 'Plane Shift: Amonkhet — PS-A' },
  { code: 'PS-X', label: 'Plane Shift: Ixalan — PS-X' },
  { code: 'PS-D', label: 'Plane Shift: Dominaria — PS-D' },
  { code: 'NF', label: "Netheril's Fall — NF" },
  { code: 'LFL', label: 'Lorwyn: First Light — LFL' }
]

const effectiveSource = computed(() => {
  if (sourceMode.value === 'all') return null
  if (sourceMode.value === 'one') return selectedSource.value || null

  const cleaned = customSource.value.trim()
  return cleaned || null
})

async function runImport() {
  loading.value = true
  errorMessage.value = ''
  result.value = null

  try {
    result.value = await $fetch('/api/import/bulk', {
      method: 'POST',
      body: {
        worldId: Number(selectedWorldId.value),
        dataset: selectedDataset.value,
        mode: selectedMode.value,
        sourceMode: sourceMode.value,
        source: effectiveSource.value
      }
    })
  } catch (error: any) {
    errorMessage.value =
      error?.data?.statusMessage ||
      error?.statusMessage ||
      'Bulk import failed.'
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="space-y-6">
    <section class="rounded-[30px] border border-[#d7c4a0] bg-[#f8f2e8] p-8 shadow-[0_10px_24px_rgba(80,60,30,0.10)]">
      <div class="text-xs uppercase tracking-[0.35em] text-[#907a58]">
        Bulk Import
      </div>

      <h1 class="mt-3 text-4xl font-semibold tracking-[0.04em] text-[#2f2419]">
        Import 5eTools Content
      </h1>

      <p class="mt-3 max-w-3xl text-base leading-7 text-[#4f4030]">
        Import one dataset into one world, with optional sourcebook filtering.
      </p>

      <div class="mt-8 grid gap-6 md:grid-cols-3">
        <div>
          <label class="mb-2 block text-sm font-medium text-[#6b5333]">
            Import
          </label>

          <select
            v-model="selectedDataset"
            class="w-full rounded-xl border border-[#cfb07a] bg-[#fffaf2] px-4 py-3 text-[#2f2419] outline-none focus:border-[#b38a2e]"
          >
            <option
              v-for="option in datasetOptions"
              :key="option.value"
              :value="option.value"
            >
              {{ option.label }}
            </option>
          </select>
        </div>

        <div>
          <label class="mb-2 block text-sm font-medium text-[#6b5333]">
            Into World
          </label>

          <select
            v-model="selectedWorldId"
            class="w-full rounded-xl border border-[#cfb07a] bg-[#fffaf2] px-4 py-3 text-[#2f2419] outline-none focus:border-[#b38a2e]"
          >
            <option
              v-for="world in worlds || []"
              :key="world.id"
              :value="String(world.id)"
            >
              {{ world.name }}
            </option>
          </select>
        </div>

        <div>
          <label class="mb-2 block text-sm font-medium text-[#6b5333]">
            Mode
          </label>

          <select
            v-model="selectedMode"
            class="w-full rounded-xl border border-[#cfb07a] bg-[#fffaf2] px-4 py-3 text-[#2f2419] outline-none focus:border-[#b38a2e]"
          >
            <option
              v-for="option in modeOptions"
              :key="option.value"
              :value="option.value"
            >
              {{ option.label }}
            </option>
          </select>
        </div>
      </div>

      <div class="mt-8 grid gap-6 md:grid-cols-2">
        <div>
          <label class="mb-2 block text-sm font-medium text-[#6b5333]">
            From
          </label>

          <select
            v-model="sourceMode"
            class="w-full rounded-xl border border-[#cfb07a] bg-[#fffaf2] px-4 py-3 text-[#2f2419] outline-none focus:border-[#b38a2e]"
          >
            <option value="all">All Sources</option>
            <option value="one">One Sourcebook</option>
            <option value="custom">Custom 5eTools Shortcode</option>
          </select>
        </div>

        <div v-if="sourceMode === 'one'">
          <label class="mb-2 block text-sm font-medium text-[#6b5333]">
            Sourcebook
          </label>

          <select
            v-model="selectedSource"
            class="w-full rounded-xl border border-[#cfb07a] bg-[#fffaf2] px-4 py-3 text-[#2f2419] outline-none focus:border-[#b38a2e]"
          >
            <option
              v-for="option in sourcebookOptions"
              :key="option.code"
              :value="option.code"
            >
              {{ option.label }}
            </option>
          </select>
        </div>

        <div v-else-if="sourceMode === 'custom'">
          <label class="mb-2 block text-sm font-medium text-[#6b5333]">
            Custom Shortcode
          </label>

          <input
            v-model="customSource"
            type="text"
            placeholder="Example: XPHB"
            class="w-full rounded-xl border border-[#cfb07a] bg-[#fffaf2] px-4 py-3 text-[#2f2419] outline-none placeholder:text-[#9a8667] focus:border-[#b38a2e]"
          >
        </div>
      </div>

      <div class="mt-8">
        <button
          class="rounded-full bg-[#b38a2e] px-6 py-3 text-sm font-semibold text-white transition hover:bg-[#9d7825] disabled:opacity-50"
          :disabled="loading"
          @click="runImport"
        >
          {{ loading ? 'Running Import...' : 'Run Bulk Import' }}
        </button>
      </div>

      <div
        v-if="errorMessage"
        class="mt-6 rounded-2xl border border-red-200 bg-red-50 p-4 text-red-700"
      >
        {{ errorMessage }}
      </div>
    </section>

    <section
      v-if="result"
      class="rounded-[30px] border border-[#d7c4a0] bg-[#f8f2e8] p-8 shadow-[0_10px_24px_rgba(80,60,30,0.10)]"
    >
      <div class="text-xs uppercase tracking-[0.35em] text-[#907a58]">
        Import Result
      </div>

      <h2 class="mt-3 text-3xl font-semibold text-[#2f2419]">
        Summary
      </h2>

      <div class="mt-3 text-sm text-[#6b5333]">
        Imported dataset: <strong>{{ result.dataset }}</strong>
        <span v-if="result.source">from <strong>{{ result.source }}</strong></span>
      </div>

      <div class="mt-6 grid gap-4 md:grid-cols-3">
        <div class="rounded-2xl border border-[#dfcfb1] bg-[#fffaf2] p-5">
          <div class="text-xs uppercase tracking-[0.35em] text-[#907a58]">Created</div>
          <div class="mt-3 text-3xl font-semibold text-[#2f2419]">{{ result.created?.length || 0 }}</div>
        </div>

        <div class="rounded-2xl border border-[#dfcfb1] bg-[#fffaf2] p-5">
          <div class="text-xs uppercase tracking-[0.35em] text-[#907a58]">Updated</div>
          <div class="mt-3 text-3xl font-semibold text-[#2f2419]">{{ result.updated?.length || 0 }}</div>
        </div>

        <div class="rounded-2xl border border-[#dfcfb1] bg-[#fffaf2] p-5">
          <div class="text-xs uppercase tracking-[0.35em] text-[#907a58]">Skipped</div>
          <div class="mt-3 text-3xl font-semibold text-[#2f2419]">{{ result.skipped?.length || 0 }}</div>
        </div>
      </div>

      <div
        v-if="result.skipped?.length"
        class="mt-6 rounded-2xl border border-[#dfcfb1] bg-[#fffaf2] p-5"
      >
        <div class="text-sm font-semibold text-[#2f2419]">Skipped Entries</div>
        <ul class="mt-3 space-y-2 text-sm text-[#4f4030]">
          <li v-for="item in result.skipped" :key="`${item.slug}-${item.reason}`">
            {{ item.title }} ({{ item.reason }})
          </li>
        </ul>
      </div>
    </section>
  </div>
</template>
