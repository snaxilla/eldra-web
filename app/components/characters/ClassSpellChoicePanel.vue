<script setup lang="ts">
const props = defineProps<{
  worldId: string | number
  className?: string
  classEntity?: any
  level?: number | string
  abilityScores?: Record<string, any>
}>()

const emit = defineEmits<{
  (event: 'update:spellcasting', payload: Record<string, any>): void
  (event: 'update:complete', complete: boolean): void
}>()

type SpellGroupKind = 'cantrip' | 'known' | 'prepared' | 'spellbook'

interface SpellChoiceGroup {
  key: string
  title: string
  note: string
  count: number
  level: number
  kind: SpellGroupKind
}

const spellSearch = ref('')
const spellSelections = reactive<Record<string, string[]>>({})

const CLASS_SPELL_RULES: Record<string, {
  ability: 'int' | 'wis' | 'cha'
  cantrips?: number
  known?: number
  prepared?: number | 'abilityPlusLevel'
  spellbook?: number
}> = {
  bard: {
    ability: 'cha',
    cantrips: 2,
    known: 4
  },
  cleric: {
    ability: 'wis',
    cantrips: 3,
    prepared: 'abilityPlusLevel'
  },
  druid: {
    ability: 'wis',
    cantrips: 2,
    prepared: 'abilityPlusLevel'
  },
  sorcerer: {
    ability: 'cha',
    cantrips: 4,
    known: 2
  },
  warlock: {
    ability: 'cha',
    cantrips: 2,
    known: 2
  },
  wizard: {
    ability: 'int',
    cantrips: 3,
    spellbook: 6
  }
}

function plainText(value: any) {
  if (value === null || value === undefined) return ''

  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return String(value)
  }

  try {
    return JSON.stringify(value)
  } catch {
    return ''
  }
}

function normalizedKey(value: any) {
  return plainText(value)
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

function classKey() {
  return normalizedKey(props.className || props.classEntity?.title || '')
}

function classDisplayName() {
  return String(props.className || props.classEntity?.title || 'Class').trim()
}

function levelNumber() {
  const parsed = Number(props.level || 1)
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : 1
}

function abilityModifier(value: any) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return 0
  return Math.floor((parsed - 10) / 2)
}

function preparedCountForRule(rule: any) {
  if (rule.prepared !== 'abilityPlusLevel') {
    return Math.max(0, Number(rule.prepared || 0) || 0)
  }

  const abilityScore = props.abilityScores?.[rule.ability] ?? 10
  return Math.max(1, levelNumber() + abilityModifier(abilityScore))
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

function classUsesKnownSpellCasting() {
  const key = classKey()

  return [
    'bard',
    'sorcerer',
    'warlock'
  ].some((name) => key.includes(name))
}

const spellRule = computed(() => {
  const key = classKey()
  if (!key) return null

  return Object.entries(CLASS_SPELL_RULES).find(([className]) => key.includes(className))?.[1] || null
})

const classSpellOptionsUrl = computed(() => {
  if (!props.worldId || !classDisplayName()) return ''

  const params = new URLSearchParams()
  params.set('className', classDisplayName())

  return `/api/worlds/${props.worldId}/class-spell-options?${params.toString()}`
})

const { data: classSpellOptionPayload, pending: spellsLoading } = await useFetch(classSpellOptionsUrl, {
  default: () => [],
  watch: [classSpellOptionsUrl]
})

function asArray(value: any) {
  if (Array.isArray(value)) return value
  if (Array.isArray(value?.data)) return value.data
  if (Array.isArray(value?.items)) return value.items
  return []
}

const legalClassSpellOptions = computed(() =>
  asArray(classSpellOptionPayload.value)
    .map((option: any) => ({
      ...option,
      id: spellId(option),
      title: spellTitle(option),
      level: spellLevel(option),
      source: spellSource(option),
      classNames: Array.isArray(option?.classNames) ? option.classNames : []
    }))
    .filter((option: any) => option.id && option.title)
    .sort((a: any, b: any) =>
      Number(a.level || 0) - Number(b.level || 0) ||
      String(a.title || '').localeCompare(String(b.title || ''))
    )
)

const choiceGroups = computed<SpellChoiceGroup[]>(() => {
  const rule = spellRule.value
  if (!rule) return []

  const groups: SpellChoiceGroup[] = []

  if (rule.cantrips) {
    groups.push({
      key: 'class-cantrips',
      title: `${classDisplayName()} Cantrips`,
      note: `Choose ${rule.cantrips} cantrip${rule.cantrips === 1 ? '' : 's'} from the ${classDisplayName()} spell list.`,
      count: rule.cantrips,
      level: 0,
      kind: 'cantrip'
    })
  }

  if (rule.known) {
    groups.push({
      key: 'class-known-1',
      title: `${classDisplayName()} Level 1 Spells Known`,
      note: `Choose ${rule.known} level 1 spell${rule.known === 1 ? '' : 's'} from the ${classDisplayName()} spell list.`,
      count: rule.known,
      level: 1,
      kind: 'known'
    })
  }

  if (rule.prepared) {
    const count = preparedCountForRule(rule)

    groups.push({
      key: 'class-prepared-1',
      title: `${classDisplayName()} Prepared Level 1 Spells`,
      note: `Choose ${count} level 1 prepared spell${count === 1 ? '' : 's'} from the ${classDisplayName()} spell list.`,
      count,
      level: 1,
      kind: 'prepared'
    })
  }

  if (rule.spellbook) {
    groups.push({
      key: 'class-spellbook-1',
      title: `${classDisplayName()} Spellbook`,
      note: `Choose ${rule.spellbook} level 1 spell${rule.spellbook === 1 ? '' : 's'} for the starting spellbook.`,
      count: rule.spellbook,
      level: 1,
      kind: 'spellbook'
    })
  }

  return groups
})

function ensureSelections() {
  for (const group of choiceGroups.value) {
    if (!Array.isArray(spellSelections[group.key])) {
      spellSelections[group.key] = []
    }

    for (let index = 0; index < group.count; index++) {
      if (spellSelections[group.key][index] === undefined) {
        spellSelections[group.key][index] = ''
      }
    }

    spellSelections[group.key].splice(group.count)
  }

  for (const key of Object.keys(spellSelections)) {
    if (!choiceGroups.value.some((group) => group.key === key)) {
      delete spellSelections[key]
    }
  }
}

watch(
  choiceGroups,
  () => ensureSelections(),
  { immediate: true, deep: true }
)

watch(
  () => [props.className, props.classEntity?.id, props.level],
  () => {
    for (const key of Object.keys(spellSelections)) {
      delete spellSelections[key]
    }

    ensureSelections()
  }
)

watch(
  legalClassSpellOptions,
  () => {
    const legalIds = new Set(legalClassSpellOptions.value.map((spell: any) => String(spell.id)))

    for (const [key, values] of Object.entries(spellSelections)) {
      spellSelections[key] = values.map((value) =>
        legalIds.has(String(value || '')) ? value : ''
      )
    }
  },
  { deep: true }
)

function groupSelectedValues(group: SpellChoiceGroup) {
  return (spellSelections[group.key] || [])
    .map((value) => String(value || '').trim())
    .filter(Boolean)
}

function groupOptions(group: SpellChoiceGroup) {
  const query = normalizedKey(spellSearch.value)

  return legalClassSpellOptions.value
    .filter((spell: any) => Number(spell.level) === Number(group.level))
    .filter((spell: any) => {
      if (!query) return true
      return normalizedKey(`${spell.title} ${spell.source}`).includes(query)
    })
}

function spellById(id: any) {
  const needle = String(id || '')
  if (!needle) return null
  return legalClassSpellOptions.value.find((spell: any) => String(spell.id) === needle) || null
}

function selectedSpellTitle(id: any) {
  return spellById(id)?.title || String(id || '')
}

function choiceSlots(group: SpellChoiceGroup) {
  return Array.from({ length: group.count }, (_, index) => index)
}

function optionDisabled(group: SpellChoiceGroup, slot: number, optionId: any) {
  const value = String(optionId || '')
  if (!value) return false

  return (spellSelections[group.key] || []).some((selected, index) =>
    index !== slot && String(selected || '') === value
  )
}

const choicesComplete = computed(() =>
  choiceGroups.value.every((group) =>
    groupSelectedValues(group).length >= group.count
  )
)

const spellcastingPayload = computed(() => {
  const known = new Set<string>()
  const prepared = new Set<string>()
  const summary: Record<string, any> = {}
  const knownCaster = classUsesKnownSpellCasting()

  for (const group of choiceGroups.value) {
    const values = groupSelectedValues(group)

    if (!values.length) continue

    summary[group.key] = {
      label: group.title,
      values: values.map(selectedSpellTitle),
      spellIds: values,
      kind: group.kind,
      level: group.level
    }

    if (group.kind === 'cantrip' || group.kind === 'known' || group.kind === 'spellbook') {
      values.forEach((id) => known.add(String(id)))
    }

    if (group.kind === 'prepared') {
      values.forEach((id) => prepared.add(String(id)))
    }

    if (knownCaster && group.kind === 'known') {
      values.forEach((id) => prepared.add(String(id)))
    }
  }

  const payload: Record<string, any> = {
    knownSpellIds: Array.from(known),
    preparedSpellIds: Array.from(prepared),
    builderClassSpellChoices: summary
  }

  if (!payload.knownSpellIds.length && !payload.preparedSpellIds.length) {
    return {}
  }

  return payload
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

const panelVisible = computed(() =>
  Boolean(props.className || props.classEntity?.title) &&
  Boolean(spellRule.value)
)
</script>

<template>
  <div
    v-if="panelVisible"
    class="rounded-none border border-[rgba(201,164,90,0.22)] bg-[rgba(20,17,12,0.52)] p-3"
  >
    <div class="flex flex-wrap items-start justify-between gap-3">
      <div>
        <div class="text-[10px] uppercase tracking-[0.24em] text-[#9f9278]">Required Class Spells</div>
        <div class="mt-1 text-sm font-semibold text-white">{{ classDisplayName() }} Spell Choices</div>
        <div class="mt-1 text-xs leading-5 text-[#9f9278]">
          Player choices are limited to imported spells on the {{ classDisplayName() }} class list.
        </div>
      </div>

      <div
        class="rounded-none border px-2 py-0.5 text-[10px]"
        :class="choicesComplete ? 'border-emerald-400/25 bg-emerald-400/10 text-emerald-100' : 'border-amber-300/25 bg-amber-400/10 text-amber-100'"
      >
        {{ choicesComplete ? 'Complete' : 'Needed' }}
      </div>
    </div>

    <div
      v-if="spellsLoading"
      class="mt-3 rounded-none border border-[rgba(201,164,90,0.18)] bg-[rgba(8,17,27,0.52)] p-3 text-xs text-[#9f9278]"
    >
      Loading {{ classDisplayName() }} spell list...
    </div>

    <label class="mt-3 block">
      <span class="mb-1 block text-xs uppercase tracking-[0.18em] text-[#9f9278]">Search {{ classDisplayName() }} spells</span>
      <input
        v-model="spellSearch"
        type="text"
        class="eldra-input w-full rounded-none px-3 py-2 text-sm text-white"
        placeholder="Search Fire Bolt, Shield, Cure Wounds..."
      >
    </label>

    <div class="mt-3 grid gap-3">
      <div
        v-for="group in choiceGroups"
        :key="group.key"
        class="rounded-none border border-[rgba(65,82,103,0.50)] bg-[rgba(8,17,27,0.52)] p-3"
      >
        <div class="font-semibold text-white">{{ group.title }}</div>
        <div class="mt-1 text-xs leading-5 text-[#9f9278]">{{ group.note }}</div>

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
              v-model="spellSelections[group.key][slot]"
              class="eldra-input w-full rounded-none px-3 py-2 text-sm text-white"
            >
              <option value="" class="bg-[#090909] text-[#f5e7bd]">Choose...</option>
              <option
                v-for="spell in groupOptions(group)"
                :key="`${group.key}-${spell.id}`"
                :value="spell.id"
                :disabled="optionDisabled(group, slot, spell.id)"
                class="bg-[#090909] text-[#f5e7bd] disabled:text-[#756a57]"
              >
                {{ spell.title }}{{ spell.source ? ` · ${spell.source}` : '' }}
              </option>
            </select>
          </label>
        </div>

        <div
          v-if="!groupOptions(group).length"
          class="mt-3 rounded-none border border-amber-300/20 bg-amber-400/10 p-3 text-xs leading-5 text-amber-100"
        >
          No imported level {{ group.level }} {{ classDisplayName() }} spells found. Import that source, or clear the search.
        </div>
      </div>
    </div>

    <div
      v-if="Object.keys(spellcastingPayload.builderClassSpellChoices || {}).length"
      class="mt-3 rounded-none border border-[rgba(201,164,90,0.18)] bg-[rgba(20,17,12,0.42)] p-3"
    >
      <div class="text-[10px] uppercase tracking-[0.24em] text-[#9f9278]">Spell Builder Benefits</div>

      <div class="mt-2 grid gap-2">
        <div
          v-for="choice in Object.values(spellcastingPayload.builderClassSpellChoices || {})"
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
