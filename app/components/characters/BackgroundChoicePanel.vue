<script setup lang="ts">
const props = defineProps<{
  backgroundEntity?: any
}>()

const emit = defineEmits<{
  (event: 'update:payload', payload: Record<string, any>): void
  (event: 'update:complete', complete: boolean): void
}>()

const TOOL_CATEGORY_OPTIONS: Record<string, string[]> = {
  "artisan's tools": [
    "Alchemist's Supplies",
    "Brewer's Supplies",
    "Calligrapher's Supplies",
    "Carpenter's Tools",
    "Cartographer's Tools",
    "Cobbler's Tools",
    "Cook's Utensils",
    "Glassblower's Tools",
    "Jeweler's Tools",
    "Leatherworker's Tools",
    "Mason's Tools",
    "Painter's Supplies",
    "Potter's Tools",
    "Smith's Tools",
    "Tinker's Tools",
    "Weaver's Tools",
    "Woodcarver's Tools"
  ],
  'gaming set': [
    'Dice Set',
    'Dragonchess Set',
    'Playing Card Set',
    'Three-Dragon Ante Set'
  ],
  'musical instrument': [
    'Bagpipes',
    'Drum',
    'Dulcimer',
    'Flute',
    'Horn',
    'Lute',
    'Lyre',
    'Pan Flute',
    'Shawm',
    'Viol'
  ]
}

function asObject(value: any) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {}
}

function parseJsonish(value: any): any {
  if (typeof value !== 'string') return value

  const trimmed = value.trim()
  if (!trimmed) return value

  if (
    (trimmed.startsWith('{') && trimmed.endsWith('}')) ||
    (trimmed.startsWith('[') && trimmed.endsWith(']'))
  ) {
    try {
      return JSON.parse(
        trimmed
          .replace(/:\s*True\b/g, ': true')
          .replace(/:\s*False\b/g, ': false')
          .replace(/:\s*None\b/g, ': null')
      )
    } catch {
      return value
    }
  }

  return value
}

function clean5eText(value: any) {
  return String(value ?? '')
    .replace(/\{@(?:feat|skill|item|spell|filter|book|action|variantrule|condition|class|race|creature|damage|sense|status)\s+([^|}]+)(?:\|[^}]*)?\}/gi, '$1')
    .replace(/\{@(?:i|b|dice|damage|hit|dc|scaledice|scaledamage)\s+([^}]+)\}/gi, '$1')
    .replace(/\{@[^}]+\}/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function titleCase(value: any) {
  return clean5eText(value)
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

function blockData(entity: any, key: string) {
  const blocks = Array.isArray(entity?.blocks) ? entity.blocks : []
  const block = blocks.find((item: any) =>
    String(item?.block_key || item?.blockKey || '') === key
  )

  return asObject(block?.data)
}

function rawJson(entity: any) {
  const source = blockData(entity, 'import_source')
  return asObject(parseJsonish(source.raw_json ?? source.rawJson))
}

function entryText(value: any): string {
  const parsed = parseJsonish(value)

  if (!parsed) return ''
  if (typeof parsed === 'string' || typeof parsed === 'number' || typeof parsed === 'boolean') {
    return clean5eText(parsed)
  }

  if (Array.isArray(parsed)) {
    return parsed.map(entryText).filter(Boolean).join('\n')
  }

  if (typeof parsed === 'object') {
    return [
      parsed.name,
      parsed.title,
      parsed.label,
      parsed.entry,
      parsed.entries,
      parsed.items,
      parsed.rows,
      parsed.description,
      parsed.summary,
      parsed.text,
      parsed.detail
    ]
      .map(entryText)
      .filter(Boolean)
      .join('\n')
  }

  return ''
}

function backgroundChoiceValues(value: any): string[] {
  const parsed = parseJsonish(value)

  if (!parsed) return []

  if (Array.isArray(parsed)) {
    return parsed.flatMap(backgroundChoiceValues).filter(Boolean)
  }

  if (typeof parsed === 'object') {
    if (Array.isArray(parsed.values)) return backgroundChoiceValues(parsed.values)
    if (Array.isArray(parsed.selected)) return backgroundChoiceValues(parsed.selected)
    if (parsed.value) return backgroundChoiceValues(parsed.value)
    if (parsed.choose) return backgroundChoiceValues(parsed.choose)
    if (Array.isArray(parsed.from)) return backgroundChoiceValues(parsed.from)

    const truthyKeys = Object.entries(parsed)
      .filter(([, item]) => item === true || item === 'true' || item === 1)
      .map(([key]) => titleCase(key))
      .filter(Boolean)

    if (truthyKeys.length) return truthyKeys

    return Object.values(parsed).flatMap(backgroundChoiceValues).filter(Boolean)
  }

  const text = titleCase(parsed)
  if (!text) return []

  if (text.includes(',')) {
    return text
      .split(',')
      .map((item) => titleCase(item))
      .filter(Boolean)
  }

  return [text]
}

function dedupeValues(values: any[]) {
  const seen = new Set<string>()
  const out: string[] = []

  for (const value of Array.isArray(values) ? values : []) {
    const text = titleCase(value)
    const key = normalizedKey(text)

    if (!text || !key || seen.has(key)) continue

    seen.add(key)
    out.push(text)
  }

  return out
}

function featValues(raw: any) {
  const candidates = [
    raw?.feat,
    raw?.feats,
    raw?.additionalFeat,
    raw?.additionalFeats
  ]

  for (const candidate of candidates) {
    const values = dedupeValues(backgroundChoiceValues(candidate))
    if (values.length) return values
  }

  return []
}

const backgroundCore = computed(() => blockData(props.backgroundEntity, 'background_core'))
const backgroundRaw = computed(() => rawJson(props.backgroundEntity))

const backgroundDescription = computed(() => {
  const core = backgroundCore.value
  const raw = backgroundRaw.value

  return entryText([
    core.description,
    core.summary,
    core.equipment,
    core.starting_equipment,
    core.startingEquipment,
    raw.entries,
    raw.description,
    raw.summary,
    raw.startingEquipment,
    raw.equipment
  ])
})

function isAmbiguousTool(value: any) {
  const key = normalizedKey(value).replace(/[^a-z0-9]+/g, '')

  if (!key) return false

  return key.startsWith('any') ||
    key.includes('choose') ||
    key === 'gamingset' ||
    key === 'musicalinstrument' ||
    key === 'artisantool' ||
    key === 'artisanstool' ||
    key === 'artisanstools' ||
    key === 'anygamingset' ||
    key === 'anymusicalinstrument' ||
    key === 'anyartisantool' ||
    key === 'anyartisanstool' ||
    key === 'anyartisanstools'
}

function toolOptionsForValues(values: string[]) {
  const text = normalizedKey(values.join(' '))
  const compact = text.replace(/[^a-z0-9]+/g, '')

  if (text.includes('artisan') || compact.includes('artisantool')) {
    return TOOL_CATEGORY_OPTIONS["artisan's tools"].map((value) => ({ value, label: value }))
  }

  if (text.includes('gaming') || compact.includes('gamingset')) {
    return TOOL_CATEGORY_OPTIONS['gaming set'].map((value) => ({ value, label: value }))
  }

  if (text.includes('musical') || text.includes('instrument') || compact.includes('musicalinstrument')) {
    return TOOL_CATEGORY_OPTIONS['musical instrument'].map((value) => ({ value, label: value }))
  }

  return values
    .filter((value) => !isAmbiguousTool(value))
    .map((value) => ({ value, label: value }))
}

const rawToolValues = computed(() => {
  const core = backgroundCore.value
  const raw = backgroundRaw.value

  return dedupeValues(backgroundChoiceValues(
    core.tool_proficiencies ||
    core.toolProficiencies ||
    core.tool_proficiency ||
    core.toolProficiency ||
    core.tools ||
    raw.toolProficiencies ||
    raw.tool_proficiencies ||
    raw.toolProficiency ||
    raw.tool_proficiency ||
    raw.tools
  ))
})

const backgroundToolChoiceGroup = computed(() => {
  const values = rawToolValues.value
  if (!values.length || !values.some(isAmbiguousTool)) return null

  const options = toolOptionsForValues(values)
  if (!options.length) return null

  return {
    key: 'background-tools',
    title: 'Background Tool Proficiency',
    label: 'Background Tools',
    note: 'Choose the tool proficiency granted by this background.',
    count: 1,
    options
  }
})

const hasEquipmentChoice = computed(() => {
  const text = backgroundDescription.value

  return /choose\s+a\s+or\s+b/i.test(text) ||
    (/\(A\)/i.test(text) && /\(B\)/i.test(text))
})

const backgroundEquipmentChoiceGroup = computed(() => {
  if (!hasEquipmentChoice.value) return null

  return {
    key: 'background-equipment-choice',
    title: 'Background Equipment',
    label: 'Background Equipment',
    note: 'Choose starting equipment package A or take the gold option.',
    count: 1,
    options: [
      { value: 'A', label: 'A - Starting equipment package' },
      { value: 'B', label: 'B - Gold only' }
    ]
  }
})

const choiceGroups = computed(() =>
  [
    backgroundToolChoiceGroup.value,
    backgroundEquipmentChoiceGroup.value
  ].filter(Boolean)
)

const choiceSelections = reactive<Record<string, string[]>>({})

function choiceSlots(group: any) {
  const count = Math.max(1, Number(group?.count || 1))
  return Array.from({ length: count }, (_, index) => index)
}

function ensureSelections() {
  for (const group of choiceGroups.value) {
    const count = Math.max(1, Number((group as any)?.count || 1))
    const key = String((group as any)?.key || '')

    if (!key) continue

    if (!Array.isArray(choiceSelections[key])) {
      choiceSelections[key] = []
    }

    for (let index = 0; index < count; index++) {
      if (choiceSelections[key][index] === undefined) {
        choiceSelections[key][index] = ''
      }
    }

    choiceSelections[key].splice(count)
  }

  for (const key of Object.keys(choiceSelections)) {
    if (!choiceGroups.value.some((group: any) => group.key === key)) {
      delete choiceSelections[key]
    }
  }
}

watch(
  choiceGroups,
  () => ensureSelections(),
  { immediate: true, deep: true }
)

function selectedValues(group: any) {
  if (!group?.key) return []

  return (choiceSelections[group.key] || [])
    .map((value: any) => String(value || '').trim())
    .filter(Boolean)
}

function optionDisabled(group: any, slot: number, option: any) {
  const value = String(option || '').trim()
  if (!value) return false

  return (choiceSelections[group.key] || []).some((selected, index) =>
    index !== slot && String(selected || '').trim() === value
  )
}

const choicesComplete = computed(() =>
  choiceGroups.value.every((group: any) =>
    selectedValues(group).length >= Math.max(1, Number(group?.count || 1))
  )
)

function equipmentSegment(choice: 'A' | 'B') {
  const text = backgroundDescription.value
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')

  if (!text) return ''

  if (choice === 'A') {
    const match = text.match(/\(A\)\s*([\s\S]*?)(?:;\s*or\s*\(B\)|\s+or\s+\(B\)|\(B\)|$)/i)
    return String(match?.[1] || '').trim()
  }

  const match = text.match(/\(B\)\s*([\s\S]*)/i)
  return String(match?.[1] || '').trim()
}

function cleanEquipmentItem(value: any, selectedTool = '') {
  let item = clean5eText(value)
    .replace(/choose\s+a\s+or\s+b\s*:/gi, '')
    .replace(/\(A\)|\(B\)/gi, '')
    .replace(/^or\s+/i, '')
    .replace(/\s+/g, ' ')
    .trim()

  if (/same as above/i.test(item)) {
    return selectedTool || ''
  }

  item = item
    .replace(/\s*\(same as above\)\s*/gi, '')
    .replace(/\s+/g, ' ')
    .trim()

  if (/^\d+\s*(?:GP|SP|CP|PP|Gold Pieces?)$/i.test(item)) return ''
  if (/^(?:GP|SP|CP|PP|Gold Pieces?)$/i.test(item)) return ''
  if (/^or$/i.test(item)) return ''

  return titleCase(item)
}

function equipmentValuesForChoice(choice: any, selectedTool = '') {
  const key = String(choice || '').trim().toUpperCase()

  if (!key) return []
  if (key === 'B') return ['50 GP']

  const segment = equipmentSegment('A')
  if (!segment) return []

  return dedupeValues(
    segment
      .split(/\n|,|;/)
      .map((item) => cleanEquipmentItem(item, selectedTool))
      .filter(Boolean)
  )
}

const payload = computed(() => {
  const raw = backgroundRaw.value
  const core = backgroundCore.value
  const out: Record<string, any> = {}

  if (!props.backgroundEntity) return out

  const skills = dedupeValues(backgroundChoiceValues(core.skill_proficiencies || raw.skillProficiencies))
  const selectedTools = backgroundToolChoiceGroup.value ? selectedValues(backgroundToolChoiceGroup.value) : []
  const tools = selectedTools.length
    ? selectedTools
    : rawToolValues.value.filter((value) => !isAmbiguousTool(value))

  const languages = dedupeValues(backgroundChoiceValues(core.languages || raw.languageProficiencies || raw.languages))
  const feats = featValues(raw)
  const abilityScores = dedupeValues(backgroundChoiceValues(raw.ability || raw.abilityScores || raw.abilityScoreIncrease))

  const selectedEquipmentChoice = backgroundEquipmentChoiceGroup.value
    ? selectedValues(backgroundEquipmentChoiceGroup.value)[0] || ''
    : ''

  const equipment = backgroundEquipmentChoiceGroup.value
    ? equipmentValuesForChoice(selectedEquipmentChoice, selectedTools[0] || '')
    : []

  if (skills.length) {
    out['background-skills'] = {
      label: 'Background Skills',
      values: skills,
      note: 'Granted by background.'
    }
  }

  if (tools.length) {
    out['background-tools'] = {
      label: 'Background Tools',
      values: tools,
      note: selectedTools.length ? 'Chosen in Guided Builder.' : 'Granted by background.'
    }
  }

  if (languages.length) {
    out['background-languages'] = {
      label: 'Background Languages',
      values: languages,
      note: 'Granted by background.'
    }
  }

  if (feats.length) {
    out['background-feat'] = {
      label: 'Background Feat',
      values: feats,
      note: 'Granted by background.'
    }
  }

  if (abilityScores.length) {
    out['background-abilities'] = {
      label: 'Background Ability Scores',
      values: abilityScores,
      note: 'Suggested by background.'
    }
  }

  if (equipment.length) {
    out['background-equipment'] = {
      label: 'Background Equipment',
      values: equipment,
      note: backgroundEquipmentChoiceGroup.value
        ? `Chosen equipment option ${selectedEquipmentChoice || '-'}`
        : 'Granted by background.'
    }
  }

  return out
})

watch(
  payload,
  (value) => emit('update:payload', value),
  { immediate: true, deep: true }
)

watch(
  choicesComplete,
  (value) => emit('update:complete', value),
  { immediate: true }
)

onBeforeUnmount(() => {
  emit('update:payload', {})
  emit('update:complete', true)
})
</script>

<template>
  <div v-if="backgroundEntity" class="mt-3 grid gap-3">
    <div
      v-if="choiceGroups.length"
      class="rounded-none border border-[rgba(201,164,90,0.22)] bg-[rgba(20,17,12,0.52)] p-3"
    >
      <div class="flex flex-wrap items-center justify-between gap-2">
        <div class="text-[10px] uppercase tracking-[0.24em] text-[#9f9278]">Required Background Choices</div>
        <div
          class="rounded-none border px-2 py-0.5 text-[10px]"
          :class="choicesComplete ? 'border-emerald-400/25 bg-emerald-400/10 text-emerald-100' : 'border-amber-300/25 bg-amber-400/10 text-amber-100'"
        >
          {{ choicesComplete ? 'Complete' : 'Needed' }}
        </div>
      </div>

      <div class="mt-3 grid gap-3">
        <div
          v-for="group in choiceGroups"
          :key="group.key"
          class="rounded-none border border-[rgba(65,82,103,0.50)] bg-[rgba(8,17,27,0.52)] p-3"
        >
          <div class="font-semibold text-white">{{ group.title || group.label }}</div>
          <div v-if="group.note" class="mt-1 text-xs leading-5 text-[#9f9278]">{{ group.note }}</div>

          <div class="mt-3 grid gap-2">
            <label
              v-for="slot in choiceSlots(group)"
              :key="`${group.key}-${slot}`"
              class="block"
            >
              <span class="mb-1 block text-xs uppercase tracking-[0.18em] text-[#9f9278]">
                Pick {{ slot + 1 }}
              </span>

              <select
                v-model="choiceSelections[group.key][slot]"
                class="eldra-input w-full rounded-none px-3 py-2 text-sm text-white"
              >
                <option value="" class="bg-[#090909] text-[#f5e7bd]">Choose...</option>
                <option
                  v-for="option in group.options"
                  :key="`${group.key}-${option.value}`"
                  :value="option.value"
                  :disabled="optionDisabled(group, slot, option.value)"
                  class="bg-[#090909] text-[#f5e7bd] disabled:text-[#756a57]"
                >
                  {{ option.label }}
                </option>
              </select>
            </label>
          </div>
        </div>
      </div>
    </div>

    <div
      v-if="Object.keys(payload).length"
      class="rounded-none border border-[rgba(201,164,90,0.18)] bg-[rgba(20,17,12,0.42)] p-3"
    >
      <div class="text-[10px] uppercase tracking-[0.24em] text-[#9f9278]">Background Builder Benefits</div>

      <div class="mt-2 grid gap-2">
        <div
          v-for="choice in Object.values(payload)"
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
