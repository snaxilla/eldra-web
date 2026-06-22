<script setup lang="ts">
const props = defineProps<{
  worldId: string | number
  className?: string
  subclassName?: string
  subclassLookupId?: string
  level?: number | string
}>()

const emit = defineEmits<{
  (event: 'update:spellcasting', payload: Record<string, any>): void
  (event: 'update:complete', complete: boolean): void
}>()

const cantripSelections = ref<string[]>([])
const leveledSpellSelections = ref<string[]>([])
const spellSearch = ref('')

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

function normalizedKey(value: any) {
  return cleanText(value)
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

function characterLevel() {
  const parsed = Number(props.level || 1)
  if (!Number.isFinite(parsed)) return 1
  return Math.max(1, Math.min(20, Math.floor(parsed)))
}

const normalizedClassName = computed(() => normalizedKey(props.className || ''))

function isSpellcastingClass() {
  const cls = normalizedClassName.value

  return [
    'bard',
    'cleric',
    'druid',
    'sorcerer',
    'warlock',
    'wizard',
    'paladin',
    'ranger'
  ].some((name) => cls.includes(name))
}

function isFullCaster() {
  const cls = normalizedClassName.value

  return [
    'bard',
    'cleric',
    'druid',
    'sorcerer',
    'wizard'
  ].some((name) => cls.includes(name))
}

function isHalfCaster() {
  const cls = normalizedClassName.value
  return cls.includes('paladin') || cls.includes('ranger')
}

function isWarlock() {
  return normalizedClassName.value.includes('warlock')
}

function maxSpellLevelForClassLevel() {
  const level = characterLevel()

  if (isFullCaster()) {
    return Math.max(1, Math.min(9, Math.ceil(level / 2)))
  }

  if (isHalfCaster()) {
    if (level < 2) return 0
    return Math.max(1, Math.min(5, Math.ceil((level - 1) / 4)))
  }

  if (isWarlock()) {
    if (level >= 17) return 5
    if (level >= 11) return 5
    if (level >= 7) return 4
    if (level >= 5) return 3
    if (level >= 3) return 2
    return 1
  }

  return 0
}

function cantripCountForClassLevel() {
  const cls = normalizedClassName.value
  const level = characterLevel()

  if (cls.includes('sorcerer')) return level >= 10 ? 6 : level >= 4 ? 5 : 4
  if (cls.includes('wizard')) return level >= 10 ? 5 : level >= 4 ? 4 : 3
  if (cls.includes('warlock')) return level >= 10 ? 4 : level >= 4 ? 3 : 2
  if (cls.includes('bard')) return level >= 10 ? 4 : level >= 4 ? 3 : 2
  if (cls.includes('cleric')) return level >= 10 ? 5 : level >= 4 ? 4 : 3
  if (cls.includes('druid')) return level >= 10 ? 4 : level >= 4 ? 3 : 2

  return 0
}

function leveledSpellChoiceCount() {
  const cls = normalizedClassName.value
  const level = characterLevel()

  if (!maxSpellLevelForClassLevel()) return 0

  // Prepared casters use level + casting mod. We do not know final ability math here,
  // so +2 is the same safe default the builder has been using.
  if (cls.includes('cleric') || cls.includes('druid') || cls.includes('wizard')) {
    return Math.max(1, level + 2)
  }

  if (cls.includes('paladin') || cls.includes('ranger')) {
    return Math.max(1, Math.floor(level / 2) + 2)
  }

  if (cls.includes('sorcerer')) {
    const known = [0, 2, 3, 4, 5, 6, 7, 7, 8, 9, 10, 11, 12, 12, 13, 14, 15, 15, 15, 15, 15]
    return known[level] || 2
  }

  if (cls.includes('bard')) {
    const known = [0, 4, 5, 6, 7, 8, 9, 10, 11, 12, 14, 15, 15, 16, 18, 19, 19, 20, 22, 22, 22]
    return known[level] || 4
  }

  if (cls.includes('warlock')) {
    const known = [0, 2, 3, 4, 5, 6, 7, 8, 9, 10, 10, 11, 11, 12, 12, 13, 13, 14, 14, 15, 15]
    return known[level] || 2
  }

  return 0
}

function spellId(option: any) {
  return String(option?.id || option?.value || '').trim()
}

function spellTitle(option: any) {
  return cleanText(option?.title || option?.name || option?.label || option?.value || 'Untitled Spell')
}

function spellLevel(option: any) {
  const parsed = Number(option?.level ?? option?.spellLevel ?? option?.spell_level ?? 0)
  return Number.isFinite(parsed) ? parsed : 0
}

function spellSource(option: any) {
  return cleanText(option?.source || option?.sourceBook || option?.source_book || option?.book || '')
}

const classSpellOptionsUrl = computed(() => {
  if (!props.worldId || !props.className || !isSpellcastingClass()) return ''

  const params = new URLSearchParams()
  params.set('className', String(props.className || ''))

  if (props.subclassName) {
    params.set('subclassName', String(props.subclassName || ''))
  }

  return `/api/worlds/${props.worldId}/class-spell-options?${params.toString()}`
})

const {
  data: rawSpellOptions,
  pending: spellOptionsPending,
  refresh: refreshSpellOptions
} = await useFetch(classSpellOptionsUrl, {
  default: () => [],
  watch: [classSpellOptionsUrl]
})

const spellOptions = computed(() =>
  asArray(rawSpellOptions.value)
    .map((option: any) => ({
      ...option,
      id: spellId(option),
      title: spellTitle(option),
      level: spellLevel(option),
      source: spellSource(option),
      isSubclassSpell: option?.isSubclassSpell === true ||
        option?.subclassMatch === true ||
        option?.alwaysPrepared === true
    }))
    .filter((option: any) => option.id && option.title)
    .sort((a: any, b: any) =>
      Number(a.level || 0) - Number(b.level || 0) ||
      String(a.title || '').localeCompare(String(b.title || ''))
    )
)

function queryMatches(option: any) {
  const query = normalizedKey(spellSearch.value)
  if (!query) return true

  return normalizedKey(`${option.title} ${option.source} level ${option.level}`).includes(query)
}

const subclassGrantedSpellOptions = computed(() => {
  const maxLevel = maxSpellLevelForClassLevel()

  return spellOptions.value
    .filter((option: any) => option.isSubclassSpell)
    .filter((option: any) => {
      const level = Number(option.level || 0)

      return level === 0 || (level > 0 && level <= maxLevel)
    })
})

const subclassGrantedCantripOptions = computed(() =>
  subclassGrantedSpellOptions.value.filter((option: any) => Number(option.level || 0) === 0)
)

const subclassGrantedLeveledSpellOptions = computed(() =>
  subclassGrantedSpellOptions.value.filter((option: any) => Number(option.level || 0) > 0)
)

const subclassGrantedSpellIds = computed(() =>
  subclassGrantedSpellOptions.value
    .map((spell: any) => String(spell.id || '').trim())
    .filter(Boolean)
)

const subclassGrantedSpellIdSet = computed(() =>
  new Set(subclassGrantedSpellIds.value)
)

const cantripOptions = computed(() =>
  spellOptions.value
    .filter((option: any) => Number(option.level || 0) === 0)
    .filter((option: any) => !subclassGrantedSpellIdSet.value.has(String(option.id || '')))
    .filter(queryMatches)
)

const leveledSpellOptions = computed(() => {
  const maxLevel = maxSpellLevelForClassLevel()

  return spellOptions.value
    .filter((option: any) => {
      const level = Number(option.level || 0)
      return level > 0 && level <= maxLevel
    })
    .filter((option: any) => !subclassGrantedSpellIdSet.value.has(String(option.id || '')))
    .filter(queryMatches)
})

const preparedSpellLevelLabel = computed(() => {
  const maxLevel = maxSpellLevelForClassLevel()

  if (maxLevel <= 1) return 'Level 1 Spells'
  return `Level 1-${maxLevel} Spells`
})

function optionDisabled(values: string[], slot: number, optionId: any) {
  const id = String(optionId || '')
  if (!id) return false

  return values.some((value, index) =>
    index !== slot && String(value || '') === id
  )
}

function normalizeSelectionArray(value: string[], size: number) {
  const next = Array.isArray(value) ? [...value] : []
  next.splice(size)
  while (next.length < size) next.push('')
  return next
}

watch(
  () => [
    props.className,
    props.subclassName,
    characterLevel(),
    cantripCountForClassLevel(),
    leveledSpellChoiceCount()
  ],
  () => {
    cantripSelections.value = normalizeSelectionArray(cantripSelections.value, cantripCountForClassLevel())
    leveledSpellSelections.value = normalizeSelectionArray(leveledSpellSelections.value, leveledSpellChoiceCount())
  },
  { immediate: true }
)

watch(
  subclassGrantedSpellIdSet,
  (ids) => {
    cantripSelections.value = cantripSelections.value.map((id) => ids.has(String(id || '')) ? '' : id)
    leveledSpellSelections.value = leveledSpellSelections.value.map((id) => ids.has(String(id || '')) ? '' : id)
  },
  { immediate: true }
)

const selectedCantripIds = computed(() =>
  cantripSelections.value.map((id) => String(id || '').trim()).filter(Boolean)
)

const selectedLeveledSpellIds = computed(() =>
  leveledSpellSelections.value.map((id) => String(id || '').trim()).filter(Boolean)
)

const choicesComplete = computed(() => {
  if (!isSpellcastingClass()) return true
  if (!classSpellOptionsUrl.value) return true

  return selectedCantripIds.value.length >= cantripCountForClassLevel() &&
    selectedLeveledSpellIds.value.length >= leveledSpellChoiceCount()
})

function spellNameById(id: any) {
  const needle = String(id || '')
  const found = spellOptions.value.find((option: any) => String(option.id) === needle)
  return found?.title || needle
}

const spellcastingPayload = computed(() => {
  if (!isSpellcastingClass()) return {}

  const alwaysPrepared = Array.from(new Set(subclassGrantedSpellIds.value))
  const known = Array.from(new Set([
    ...selectedCantripIds.value,
    ...selectedLeveledSpellIds.value,
    ...alwaysPrepared
  ]))

  const prepared = Array.from(new Set([
    ...selectedLeveledSpellIds.value
  ]))

  if (!known.length && !prepared.length && !alwaysPrepared.length) return {}

  return {
    knownSpellIds: known,
    preparedSpellIds: prepared,
    alwaysPreparedSpellIds: alwaysPrepared,
    builderClassSpellChoices: {
      className: props.className || '',
      subclassName: props.subclassName || '',
      subclassLookupId: props.subclassLookupId || '',
      level: characterLevel(),
      cantripSpellIds: selectedCantripIds.value,
      leveledSpellIds: selectedLeveledSpellIds.value,
      subclassSpellIds: alwaysPrepared,
      subclassCantripSpellIds: subclassGrantedCantripOptions.value.map((spell: any) => String(spell.id || '')).filter(Boolean),
      subclassLeveledSpellIds: subclassGrantedLeveledSpellOptions.value.map((spell: any) => String(spell.id || '')).filter(Boolean),
      alwaysPreparedSpellIds: alwaysPrepared,
      maxSpellLevel: maxSpellLevelForClassLevel(),
      values: known.map(spellNameById)
    }
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

const panelVisible = computed(() =>
  isSpellcastingClass() &&
  (cantripCountForClassLevel() > 0 || leveledSpellChoiceCount() > 0 || subclassGrantedSpellOptions.value.length > 0)
)

function subclassSpellHeader() {
  if (props.subclassName) return `${props.subclassName} Spells`
  return 'Subclass Spells'
}
</script>

<template>
  <div
    v-if="panelVisible"
    class="rounded-none border border-[rgba(201,164,90,0.22)] bg-[rgba(20,17,12,0.52)] p-3"
  >
    <div class="flex flex-wrap items-start justify-between gap-3">
      <div>
        <div class="text-[10px] uppercase tracking-[0.24em] text-[#9f9278]">Required Class Spells</div>
        <div class="mt-1 text-sm font-semibold text-white">
          {{ className }} Spell Choices
        </div>
        <div class="mt-1 text-xs leading-5 text-[#9f9278]">
          Level {{ characterLevel() }} allows prepared/known spells up to spell level {{ maxSpellLevelForClassLevel() || 0 }}.
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
      <span class="mb-1 block text-xs uppercase tracking-[0.18em] text-[#9f9278]">Search class spell options</span>
      <input
        v-model="spellSearch"
        type="text"
        class="eldra-input w-full rounded-none px-3 py-2 text-sm text-white"
        placeholder="Search Cure Wounds, Moonbeam, Flaming Sphere..."
      >
    </label>

    <div
      v-if="spellOptionsPending"
      class="mt-3 rounded-none border border-[rgba(201,164,90,0.18)] bg-[rgba(20,17,12,0.42)] p-3 text-xs text-[#9f9278]"
    >
      Loading class spells...
    </div>

    <div
      v-else-if="!spellOptions.length"
      class="mt-3 rounded-none border border-amber-300/20 bg-amber-400/10 p-3 text-xs leading-5 text-amber-100"
    >
      No imported spells found for this class.
      <button
        type="button"
        class="underline decoration-amber-200/40 underline-offset-4"
        @click="refreshSpellOptions"
      >
        Refresh
      </button>
    </div>

    <div v-else class="mt-3 grid gap-3">
      <div
        v-if="subclassGrantedSpellOptions.length"
        class="rounded-none border border-emerald-400/20 bg-emerald-400/10 p-3"
      >
        <div class="font-semibold text-white">{{ subclassSpellHeader() }}</div>
        <div class="mt-1 text-xs leading-5 text-emerald-100/90">
          These spells and cantrips are granted by your subclass/circle. Cantrips do not count against normal cantrip choices; leveled spells are always prepared and do not count against normal prepared spell choices.
        </div>

        <div class="mt-3 grid gap-2 sm:grid-cols-2">
          <div
            v-for="spell in subclassGrantedSpellOptions"
            :key="`subclass-spell-${spell.id}`"
            class="rounded-none border border-emerald-400/20 bg-[rgba(8,17,27,0.52)] p-2 text-xs leading-5"
          >
            <div class="font-semibold text-white">{{ spell.title }}</div>
            <div class="mt-1 text-[#9f9278]">{{ spell.level ? `Level ${spell.level}` : 'Cantrip' }} · {{ spell.source || 'Unknown' }}</div>
          </div>
        </div>
      </div>

      <div
        v-if="cantripCountForClassLevel()"
        class="rounded-none border border-[rgba(65,82,103,0.50)] bg-[rgba(8,17,27,0.52)] p-3"
      >
        <div class="font-semibold text-white">{{ className }} Cantrips</div>
        <div class="mt-1 text-xs text-[#9f9278]">Choose {{ cantripCountForClassLevel() }} cantrip{{ cantripCountForClassLevel() === 1 ? '' : 's' }}.</div>

        <div class="mt-3 grid gap-2">
          <label
            v-for="slot in cantripCountForClassLevel()"
            :key="`cantrip-${slot}`"
            class="block"
          >
            <span class="mb-1 block text-xs uppercase tracking-[0.18em] text-[#9f9278]">Pick {{ slot }}</span>
            <select
              v-model="cantripSelections[slot - 1]"
              class="eldra-input w-full rounded-none px-3 py-2 text-sm text-white"
            >
              <option value="" class="bg-[#090909] text-[#f5e7bd]">Choose...</option>
              <option
                v-for="spell in cantripOptions"
                :key="`cantrip-option-${slot}-${spell.id}`"
                :value="spell.id"
                :disabled="optionDisabled(cantripSelections, slot - 1, spell.id)"
                class="bg-[#090909] text-[#f5e7bd] disabled:text-[#756a57]"
              >
                {{ spell.title }} · {{ spell.source || 'Unknown' }}
              </option>
            </select>
          </label>
        </div>
      </div>

      <div
        v-if="leveledSpellChoiceCount()"
        class="rounded-none border border-[rgba(65,82,103,0.50)] bg-[rgba(8,17,27,0.52)] p-3"
      >
        <div class="font-semibold text-white">{{ className }} Prepared {{ preparedSpellLevelLabel }}</div>
        <div class="mt-1 text-xs text-[#9f9278]">
          Choose {{ leveledSpellChoiceCount() }} spell{{ leveledSpellChoiceCount() === 1 ? '' : 's' }} from spell levels 1 through {{ maxSpellLevelForClassLevel() }}.
          Subclass/circle grants above do not count against these choices.
        </div>

        <div class="mt-3 grid gap-2">
          <label
            v-for="slot in leveledSpellChoiceCount()"
            :key="`leveled-spell-${slot}`"
            class="block"
          >
            <span class="mb-1 block text-xs uppercase tracking-[0.18em] text-[#9f9278]">Pick {{ slot }}</span>
            <select
              v-model="leveledSpellSelections[slot - 1]"
              class="eldra-input w-full rounded-none px-3 py-2 text-sm text-white"
            >
              <option value="" class="bg-[#090909] text-[#f5e7bd]">Choose...</option>
              <option
                v-for="spell in leveledSpellOptions"
                :key="`leveled-option-${slot}-${spell.id}`"
                :value="spell.id"
                :disabled="optionDisabled(leveledSpellSelections, slot - 1, spell.id)"
                class="bg-[#090909] text-[#f5e7bd] disabled:text-[#756a57]"
              >
                {{ spell.title }} · Level {{ spell.level }} · {{ spell.source || 'Unknown' }}
              </option>
            </select>
          </label>
        </div>
      </div>

      <div
        v-if="Object.keys(spellcastingPayload).length"
        class="rounded-none border border-[rgba(201,164,90,0.18)] bg-[rgba(20,17,12,0.42)] p-3"
      >
        <div class="text-[10px] uppercase tracking-[0.24em] text-[#9f9278]">Spell Builder Benefits</div>

        <div class="mt-2 grid gap-2">
          <div
            v-if="selectedCantripIds.length"
            class="rounded-none border border-[rgba(65,82,103,0.50)] bg-[rgba(8,17,27,0.52)] p-2 text-xs leading-5"
          >
            <span class="font-semibold text-white">{{ className }} Cantrips:</span>
            <span class="text-[#d8ceb8]"> {{ selectedCantripIds.map(spellNameById).join(', ') }}</span>
          </div>

          <div
            v-if="selectedLeveledSpellIds.length"
            class="rounded-none border border-[rgba(65,82,103,0.50)] bg-[rgba(8,17,27,0.52)] p-2 text-xs leading-5"
          >
            <span class="font-semibold text-white">{{ className }} {{ preparedSpellLevelLabel }}:</span>
            <span class="text-[#d8ceb8]"> {{ selectedLeveledSpellIds.map(spellNameById).join(', ') }}</span>
          </div>

          <div
            v-if="subclassGrantedSpellIds.length"
            class="rounded-none border border-emerald-400/20 bg-emerald-400/10 p-2 text-xs leading-5"
          >
            <span class="font-semibold text-white">{{ subclassSpellHeader() }}:</span>
            <span class="text-[#d8ceb8]"> {{ subclassGrantedSpellIds.map(spellNameById).join(', ') }}</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
