<script setup lang="ts">
const props = defineProps<{
  worldId: string | number
  speciesChoices?: Record<string, any>
  backgroundChoices?: Record<string, any>
}>()

const emit = defineEmits<{
  (event: 'update:spellcasting', payload: Record<string, any>): void
  (event: 'update:complete', complete: boolean): void
}>()

type SpellListName = 'Bard' | 'Cleric' | 'Druid' | 'Sorcerer' | 'Warlock' | 'Wizard'

const SPELL_LIST_OPTIONS: Array<{ value: SpellListName; label: string }> = [
  { value: 'Bard', label: 'Bard' },
  { value: 'Cleric', label: 'Cleric' },
  { value: 'Druid', label: 'Druid' },
  { value: 'Sorcerer', label: 'Sorcerer' },
  { value: 'Warlock', label: 'Warlock' },
  { value: 'Wizard', label: 'Wizard' }
]

const spellListSelections = reactive<Record<string, string>>({})
const cantripSelections = reactive<Record<string, string[]>>({})
const levelOneSelections = reactive<Record<string, string[]>>({})
const spellOptionsByList = ref<Record<string, any[]>>({})
const loadingLists = ref<Record<string, boolean>>({})
const spellSearch = ref('')

function asObject(value: any) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {}
}

function asArray(value: any) {
  if (Array.isArray(value)) return value
  if (Array.isArray(value?.data)) return value.data
  if (Array.isArray(value?.items)) return value.items
  return []
}

function cleanText(value: any) {
  return String(value ?? '')
    .replace(/\{@(?:feat|skill|item|spell|filter|book|action|variantrule|condition|class|race|creature|damage|sense|status)\s+([^|}]+)(?:\|[^}]*)?\}/gi, '$1')
    .replace(/\{@(?:i|b|dice|damage|hit|dc|scaledice|scaledamage)\s+([^}]+)\}/gi, '$1')
    .replace(/\{@[^}]+\}/g, '')
    .replace(/[#*_`]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function titleCase(value: any) {
  return cleanText(value)
    .replace(/\|[A-Za-z0-9_.:-]+(?:\|[^,\n;)]*)?/g, '')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (letter) => letter.toUpperCase())
    .replace(/\b([A-Za-z]+)'S\b/g, "$1's")
}

function normalizedKey(value: any) {
  return titleCase(value)
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

function spellId(option: any) {
  return String(option?.id || option?.value || '').trim()
}

function spellTitle(option: any) {
  return String(option?.title || option?.name || option?.label || option?.value || 'Untitled Spell').trim()
}

function spellLevel(option: any) {
  const parsed = Number(option?.level ?? option?.spellLevel ?? option?.spell_level ?? 0)
  return Number.isFinite(parsed) ? parsed : 0
}

function spellSource(option: any) {
  return String(option?.source || option?.sourceBook || option?.source_book || option?.book || '').trim()
}

function choiceValues(value: any): string[] {
  if (value === null || value === undefined || value === '') return []

  if (Array.isArray(value)) {
    return value.flatMap(choiceValues).filter(Boolean)
  }

  if (typeof value === 'object') {
    const obj = asObject(value)

    if (Array.isArray(obj.values)) return choiceValues(obj.values)
    if (Array.isArray(obj.selected)) return choiceValues(obj.selected)
    if (obj.value) return choiceValues(obj.value)
    if (obj.valueLabel) return choiceValues(obj.valueLabel)
    if (obj.selectedLabel) return choiceValues(obj.selectedLabel)

    const truthyKeys = Object.entries(obj)
      .filter(([, item]) => item === true || item === 'true' || item === 1)
      .map(([key]) => titleCase(key))
      .filter(Boolean)

    if (truthyKeys.length) return truthyKeys

    return Object.values(obj).flatMap(choiceValues).filter(Boolean)
  }

  const text = titleCase(value)
  if (!text) return []

  if (text.includes(',')) {
    return text
      .split(',')
      .map((item) => titleCase(item))
      .filter(Boolean)
  }

  return [text]
}

function fixedMagicInitiateList(value: any) {
  const text = titleCase(value)
  const match = text.match(/Magic Initiate\s*\((Bard|Cleric|Druid|Sorcerer|Warlock|Wizard)\)/i)
  if (!match?.[1]) return ''

  const normalized = titleCase(match[1])
  return SPELL_LIST_OPTIONS.find((option) => option.value.toLowerCase() === normalized.toLowerCase())?.value || ''
}

function isMagicInitiate(value: any) {
  const key = normalizedKey(value)
  return key === 'magic initiate' ||
    key.startsWith('magic initiate ') ||
    key.includes(' magic initiate ')
}

function collectFeatRowsFromChoiceMap(source: string, choices: Record<string, any> = {}) {
  const rows: Array<{
    key: string
    source: string
    featName: string
    fixedSpellList: string
  }> = []

  for (const [choiceKey, rawGroup] of Object.entries(choices || {})) {
    const group = asObject(rawGroup)
    const labelText = normalizedKey([
      choiceKey,
      group.label,
      group.title,
      group.note,
      group.detail
    ].join(' '))

    if (!labelText.includes('feat')) continue

    const values = choiceValues(group.values ?? group.selected ?? group.value)
    for (const value of values) {
      if (!isMagicInitiate(value)) continue

      rows.push({
        key: `${source}-${choiceKey}-${normalizedKey(value).replace(/\s+/g, '-')}`,
        source,
        featName: titleCase(value),
        fixedSpellList: fixedMagicInitiateList(value)
      })
    }
  }

  return rows
}

const magicInitiateRows = computed(() => {
  const rows = [
    ...collectFeatRowsFromChoiceMap('species', props.speciesChoices || {}),
    ...collectFeatRowsFromChoiceMap('background', props.backgroundChoices || {})
  ]

  const seen = new Set<string>()
  return rows.filter((row) => {
    const key = row.key
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
})

function selectedSpellList(row: any) {
  return String(row.fixedSpellList || spellListSelections[row.key] || '').trim()
}

function ensureChoiceState() {
  const activeKeys = new Set(magicInitiateRows.value.map((row) => row.key))

  for (const row of magicInitiateRows.value) {
    if (row.fixedSpellList) {
      spellListSelections[row.key] = row.fixedSpellList
    } else if (spellListSelections[row.key] === undefined) {
      spellListSelections[row.key] = ''
    }

    if (!Array.isArray(cantripSelections[row.key])) {
      cantripSelections[row.key] = ['', '']
    }

    if (!Array.isArray(levelOneSelections[row.key])) {
      levelOneSelections[row.key] = ['']
    }

    cantripSelections[row.key].splice(2)
    levelOneSelections[row.key].splice(1)

    while (cantripSelections[row.key].length < 2) cantripSelections[row.key].push('')
    while (levelOneSelections[row.key].length < 1) levelOneSelections[row.key].push('')
  }

  for (const key of Object.keys(spellListSelections)) {
    if (!activeKeys.has(key)) delete spellListSelections[key]
  }

  for (const key of Object.keys(cantripSelections)) {
    if (!activeKeys.has(key)) delete cantripSelections[key]
  }

  for (const key of Object.keys(levelOneSelections)) {
    if (!activeKeys.has(key)) delete levelOneSelections[key]
  }
}

watch(
  magicInitiateRows,
  () => ensureChoiceState(),
  { immediate: true, deep: true }
)

const selectedSpellLists = computed(() =>
  Array.from(new Set(
    magicInitiateRows.value
      .map((row) => selectedSpellList(row))
      .filter(Boolean)
  ))
)

watch(
  selectedSpellLists,
  async (lists) => {
    for (const list of lists) {
      if (spellOptionsByList.value[list] || loadingLists.value[list]) continue

      loadingLists.value = {
        ...loadingLists.value,
        [list]: true
      }

      try {
        const params = new URLSearchParams()
        params.set('className', list)

        const result = await $fetch<any[]>(`/api/worlds/${props.worldId}/class-spell-options?${params.toString()}`)
        spellOptionsByList.value = {
          ...spellOptionsByList.value,
          [list]: asArray(result)
            .map((option: any) => ({
              ...option,
              id: spellId(option),
              title: spellTitle(option),
              level: spellLevel(option),
              source: spellSource(option)
            }))
            .filter((option: any) => option.id && option.title)
            .sort((a: any, b: any) =>
              Number(a.level || 0) - Number(b.level || 0) ||
              String(a.title || '').localeCompare(String(b.title || ''))
            )
        }
      } catch (error) {
        console.error('[feat-choice-panel] failed to load spell list', list, error)
        spellOptionsByList.value = {
          ...spellOptionsByList.value,
          [list]: []
        }
      } finally {
        loadingLists.value = {
          ...loadingLists.value,
          [list]: false
        }
      }
    }
  },
  { immediate: true, deep: true }
)

function spellOptionsForRow(row: any, level: number) {
  const list = selectedSpellList(row)
  const query = normalizedKey(spellSearch.value)

  return (spellOptionsByList.value[list] || [])
    .filter((spell: any) => Number(spell.level || 0) === Number(level))
    .filter((spell: any) => {
      if (!query) return true
      return normalizedKey(`${spell.title} ${spell.source}`).includes(query)
    })
}

function spellById(id: any) {
  const needle = String(id || '')
  if (!needle) return null

  for (const options of Object.values(spellOptionsByList.value)) {
    const found = (options || []).find((spell: any) => String(spell.id) === needle)
    if (found) return found
  }

  return null
}

function spellNameById(id: any) {
  return spellById(id)?.title || String(id || '')
}

function selectedCantripValues(row: any) {
  return (cantripSelections[row.key] || [])
    .map((value) => String(value || '').trim())
    .filter(Boolean)
}

function selectedLevelOneValues(row: any) {
  return (levelOneSelections[row.key] || [])
    .map((value) => String(value || '').trim())
    .filter(Boolean)
}

function optionDisabled(values: string[], slot: number, optionId: any) {
  const value = String(optionId || '')
  if (!value) return false

  return values.some((selected, index) =>
    index !== slot && String(selected || '') === value
  )
}

const choicesComplete = computed(() =>
  magicInitiateRows.value.every((row) =>
    Boolean(selectedSpellList(row)) &&
    selectedCantripValues(row).length >= 2 &&
    selectedLevelOneValues(row).length >= 1
  )
)

const spellcastingPayload = computed(() => {
  const known = new Set<string>()
  const prepared = new Set<string>()
  const featSpellIds = new Set<string>()
  const summary: Record<string, any> = {}

  for (const row of magicInitiateRows.value) {
    const spellList = selectedSpellList(row)
    const cantrips = selectedCantripValues(row)
    const levelOne = selectedLevelOneValues(row)
    const all = [...cantrips, ...levelOne]

    if (!spellList || !all.length) continue

    for (const id of all) {
      featSpellIds.add(String(id))
      known.add(String(id))
    }

    for (const id of levelOne) {
      prepared.add(String(id))
    }

    summary[row.key] = {
      label: `${row.featName}${spellList ? ` (${spellList})` : ''}`,
      featName: row.featName,
      spellList,
      values: all.map(spellNameById),
      cantripSpellIds: cantrips,
      levelOneSpellIds: levelOne,
      spellIds: all,
      source: row.source
    }
  }

  if (!featSpellIds.size) return {}

  return {
    knownSpellIds: Array.from(known),
    preparedSpellIds: Array.from(prepared),
    selectedChoiceSpellIds: Array.from(featSpellIds),
    featChoiceSpellIds: Array.from(featSpellIds),
    featChoiceSpells: Array.from(featSpellIds),
    featSpellIds: Array.from(featSpellIds),
    builderFeatChoices: summary
  }
})

watch(
  spellcastingPayload,
  (payload) => emit('update:spellcasting', payload),
  { immediate: true, deep: true }
)

watch(
  choicesComplete,
  (complete) => emit('update:complete', complete),
  { immediate: true }
)

const panelVisible = computed(() => magicInitiateRows.value.length > 0)
</script>

<template>
  <div
    v-if="panelVisible"
    class="rounded-none border border-[rgba(201,164,90,0.22)] bg-[rgba(20,17,12,0.52)] p-3"
  >
    <div class="flex flex-wrap items-start justify-between gap-3">
      <div>
        <div class="text-[10px] uppercase tracking-[0.24em] text-[#9f9278]">Required Feat Choices</div>
        <div class="mt-1 text-sm font-semibold text-white">Magic Initiate Spell Choices</div>
        <div class="mt-1 text-xs leading-5 text-[#9f9278]">
          Pick feat-granted cantrips and the level 1 spell now so they appear on the sheet.
        </div>
      </div>

      <div
        class="rounded-none border px-2 py-0.5 text-[10px]"
        :class="choicesComplete ? 'border-emerald-400/25 bg-emerald-400/10 text-emerald-100' : 'border-amber-300/25 bg-amber-400/10 text-amber-100'"
      >
        {{ choicesComplete ? 'Complete' : 'Needed' }}
      </div>
    </div>

    <label class="mt-3 block">
      <span class="mb-1 block text-xs uppercase tracking-[0.18em] text-[#9f9278]">Search feat spell options</span>
      <input
        v-model="spellSearch"
        type="text"
        class="eldra-input w-full rounded-none px-3 py-2 text-sm text-white"
        placeholder="Search Guidance, Light, Cure Wounds..."
      >
    </label>

    <div class="mt-3 grid gap-3">
      <div
        v-for="row in magicInitiateRows"
        :key="row.key"
        class="rounded-none border border-[rgba(65,82,103,0.50)] bg-[rgba(8,17,27,0.52)] p-3"
      >
        <div class="font-semibold text-white">{{ row.featName }}</div>
        <div class="mt-1 text-xs leading-5 text-[#9f9278]">
          Choose two cantrips and one level 1 spell from the selected spell list.
        </div>

        <label class="mt-3 block">
          <span class="mb-1 block text-xs uppercase tracking-[0.18em] text-[#9f9278]">Spell List</span>
          <select
            v-model="spellListSelections[row.key]"
            :disabled="Boolean(row.fixedSpellList)"
            class="eldra-input w-full rounded-none px-3 py-2 text-sm text-white disabled:opacity-70"
          >
            <option value="" class="bg-[#090909] text-[#f5e7bd]">Choose...</option>
            <option
              v-for="option in SPELL_LIST_OPTIONS"
              :key="`${row.key}-${option.value}`"
              :value="option.value"
              class="bg-[#090909] text-[#f5e7bd]"
            >
              {{ option.label }}
            </option>
          </select>
        </label>

        <div v-if="selectedSpellList(row)" class="mt-3 grid gap-3">
          <div class="rounded-none border border-[rgba(65,82,103,0.50)] bg-[rgba(8,17,27,0.48)] p-3">
            <div class="font-semibold text-white">Cantrips</div>
            <div class="mt-1 text-xs text-[#9f9278]">Pick 2.</div>

            <div class="mt-3 grid gap-2">
              <label
                v-for="slot in [0, 1]"
                :key="`${row.key}-cantrip-${slot}`"
                class="block"
              >
                <span class="mb-1 block text-xs uppercase tracking-[0.18em] text-[#9f9278]">
                  Cantrip {{ slot + 1 }}
                </span>

                <select
                  v-model="cantripSelections[row.key][slot]"
                  class="eldra-input w-full rounded-none px-3 py-2 text-sm text-white"
                >
                  <option value="" class="bg-[#090909] text-[#f5e7bd]">Choose...</option>
                  <option
                    v-for="spell in spellOptionsForRow(row, 0)"
                    :key="`${row.key}-cantrip-option-${spell.id}`"
                    :value="spell.id"
                    :disabled="optionDisabled(cantripSelections[row.key], slot, spell.id)"
                    class="bg-[#090909] text-[#f5e7bd] disabled:text-[#756a57]"
                  >
                    {{ spell.title }}{{ spell.source ? ` · ${spell.source}` : '' }}
                  </option>
                </select>
              </label>
            </div>
          </div>

          <div class="rounded-none border border-[rgba(65,82,103,0.50)] bg-[rgba(8,17,27,0.48)] p-3">
            <div class="font-semibold text-white">Level 1 Spell</div>
            <div class="mt-1 text-xs text-[#9f9278]">Pick 1.</div>

            <label class="mt-3 block">
              <span class="mb-1 block text-xs uppercase tracking-[0.18em] text-[#9f9278]">Level 1 Spell</span>
              <select
                v-model="levelOneSelections[row.key][0]"
                class="eldra-input w-full rounded-none px-3 py-2 text-sm text-white"
              >
                <option value="" class="bg-[#090909] text-[#f5e7bd]">Choose...</option>
                <option
                  v-for="spell in spellOptionsForRow(row, 1)"
                  :key="`${row.key}-level-one-option-${spell.id}`"
                  :value="spell.id"
                  class="bg-[#090909] text-[#f5e7bd]"
                >
                  {{ spell.title }}{{ spell.source ? ` · ${spell.source}` : '' }}
                </option>
              </select>
            </label>
          </div>
        </div>

        <div
          v-else
          class="mt-3 rounded-none border border-amber-300/20 bg-amber-400/10 p-3 text-xs leading-5 text-amber-100"
        >
          Choose a spell list to load Magic Initiate spell options.
        </div>

        <div
          v-if="selectedSpellList(row) && !loadingLists[selectedSpellList(row)] && !spellOptionsForRow(row, 0).length && !spellOptionsForRow(row, 1).length"
          class="mt-3 rounded-none border border-amber-300/20 bg-amber-400/10 p-3 text-xs leading-5 text-amber-100"
        >
          No imported spells found for the selected list. Import that source first, or clear the search.
        </div>
      </div>
    </div>

    <div
      v-if="Object.keys(spellcastingPayload.builderFeatChoices || {}).length"
      class="mt-3 rounded-none border border-[rgba(201,164,90,0.18)] bg-[rgba(20,17,12,0.42)] p-3"
    >
      <div class="text-[10px] uppercase tracking-[0.24em] text-[#9f9278]">Feat Builder Benefits</div>

      <div class="mt-2 grid gap-2">
        <div
          v-for="choice in Object.values(spellcastingPayload.builderFeatChoices || {})"
          :key="choice.label"
          class="rounded-none border border-[rgba(65,82,103,0.50)] bg-[rgba(8,17,27,0.52)] p-2 text-xs leading-5"
        >
          <span class="font-semibold text-white">{{ choice.label }}:</span>
          <span class="text-[#d8ceb8]"> {{ choice.values.join(', ') }}</span>
        </div>
      </div>
    </div>
  </div>
</template>
