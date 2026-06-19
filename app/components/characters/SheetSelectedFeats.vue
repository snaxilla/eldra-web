<script setup lang="ts">
const props = defineProps<{
  worldId: string | number
  sheet?: any
}>()

const selectedFeatForDrawer = ref<any | null>(null)

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
    .replace(/\{@(?:feat|skill|item|spell|filter|book|action|variantrule|condition|class|race|creature|damage|sense|status|classFeature|subclassFeature)\s+([^|}]+)(?:\|[^}]*)?\}/gi, '$1')
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
    .replace(/\([^)]*\)/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

function displayFeatName(value: any) {
  return cleanText(value)
    .replace(/\|[A-Za-z0-9_.:-]+(?:\|[^,\n;)]*)?/g, '')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (letter) => letter.toUpperCase())
    .replace(/\b([A-Za-z]+)'S\b/g, "$1's")
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
    if (Array.isArray(obj.featIds)) return choiceValues(obj.featIds)
    if (Array.isArray(obj.selectedFeatIds)) return choiceValues(obj.selectedFeatIds)
    if (obj.value) return choiceValues(obj.value)
    if (obj.valueLabel) return choiceValues(obj.valueLabel)
    if (obj.selectedLabel) return choiceValues(obj.selectedLabel)
    if (obj.featName) return choiceValues(obj.featName)
    if (obj.title) return choiceValues(obj.title)
    if (obj.name) return choiceValues(obj.name)

    const truthyKeys = Object.entries(obj)
      .filter(([, item]) => item === true || item === 'true' || item === 1)
      .map(([key]) => displayFeatName(key))
      .filter(Boolean)

    if (truthyKeys.length) return truthyKeys

    return Object.values(obj).flatMap(choiceValues).filter(Boolean)
  }

  const text = displayFeatName(value)
  return text ? [text] : []
}

function sourceLabel(feat: any) {
  return [
    feat.source || feat.sourceBook || '',
    feat.page || feat.sourcePage ? `p. ${feat.page || feat.sourcePage}` : ''
  ].filter(Boolean).join(' · ')
}

function shortText(value: any, limit = 260) {
  const text = cleanText(value)
  if (!text) return ''
  return text.length > limit ? `${text.slice(0, limit).trim()}...` : text
}

function stripFeatChoiceSuffix(value: any) {
  return cleanText(value)
    .replace(/\s*\((Bard|Cleric|Druid|Sorcerer|Warlock|Wizard)\)\s*$/i, '')
    .trim()
}

function featChoiceSpellList(value: any) {
  const text = cleanText(value)
  const match = text.match(/\((Bard|Cleric|Druid|Sorcerer|Warlock|Wizard)\)/i)
  return match?.[1] || ''
}

function looksNumericId(value: any) {
  return /^\d+$/.test(String(value || '').trim())
}

function placeholderFeatName(value: any) {
  const key = normalizedKey(value)
  return key === 'feat' ||
    key === 'origin feat' ||
    key === 'background feat' ||
    key === 'species feat' ||
    key === 'selected feat'
}

const featOptionsUrl = computed(() =>
  props.worldId ? `/api/worlds/${props.worldId}/feat-options` : ''
)

const { data: featOptionPayload } = await useFetch(featOptionsUrl, {
  default: () => [],
  watch: [featOptionsUrl]
})

const featOptions = computed(() =>
  asArray(featOptionPayload.value)
    .map((feat: any) => ({
      ...feat,
      id: String(feat.id || feat.value || '').trim(),
      title: cleanText(feat.title || feat.name || feat.label || feat.value || 'Untitled Feat')
    }))
    .filter((feat: any) => feat.id && feat.title)
)

function featById(id: any) {
  const needle = String(id || '').trim()
  if (!needle) return null
  return featOptions.value.find((feat: any) => String(feat.id) === needle) || null
}

function featByName(name: any) {
  const key = normalizedKey(stripFeatChoiceSuffix(name))
  if (!key) return null

  return featOptions.value.find((feat: any) =>
    normalizedKey(feat.title) === key ||
    normalizedKey(feat.rawName) === key
  ) || null
}

const builderFeatChoiceSummary = computed(() => {
  const spellcasting = asObject(props.sheet?.spellcasting)
  const choices = asObject(props.sheet?.choices)

  return {
    ...asObject(spellcasting.builderFeatChoices),
    ...asObject(spellcasting.builder_feat_choices),
    ...asObject(choices.builderFeatChoices),
    ...asObject(choices.builder_feat_choices)
  }
})

function pushFeatRef(rows: any[], source: string, value: any, groupKey = '') {
  const text = cleanText(value)
  if (!text) return

  if (looksNumericId(text)) {
    rows.push({
      source,
      id: text,
      name: '',
      originalName: text,
      groupKey
    })
    return
  }

  if (placeholderFeatName(text)) return

  rows.push({
    source,
    name: stripFeatChoiceSuffix(text),
    originalName: text,
    spellList: featChoiceSpellList(text),
    groupKey
  })
}

function collectFeatRefsFromChoiceMap(source: string, choices: Record<string, any> = {}) {
  const rows: any[] = []

  for (const [key, rawGroup] of Object.entries(choices || {})) {
    const group = asObject(rawGroup)
    const labelText = normalizedKey([
      key,
      group.label,
      group.title,
      group.note,
      group.detail,
      group.valueLabel,
      group.selectedLabel
    ].join(' '))

    if (!labelText.includes('feat')) continue

    const values = [
      ...choiceValues(group.values),
      ...choiceValues(group.selected),
      ...choiceValues(group.value),
      ...choiceValues(group.valueLabel),
      ...choiceValues(group.selectedLabel)
    ]

    for (const value of values) {
      pushFeatRef(rows, source, value, key)
    }
  }

  return rows
}

const selectedFeatRefs = computed(() => {
  const sheet = asObject(props.sheet)
  const choices = asObject(sheet.choices)
  const rows: any[] = []

  for (const id of choiceValues(
    sheet.selectedFeatIds ??
    sheet.selected_feat_ids ??
    sheet.featIds ??
    sheet.feat_ids ??
    choices.selectedFeatIds ??
    choices.selected_feat_ids ??
    choices.featIds ??
    choices.feat_ids
  )) {
    pushFeatRef(rows, 'sheet', id)
  }

  rows.push(
    ...collectFeatRefsFromChoiceMap('species', asObject(choices.builderSpeciesChoices ?? choices.builder_species_choices)),
    ...collectFeatRefsFromChoiceMap('background', asObject(choices.builderBackgroundChoices ?? choices.builder_background_choices))
  )

  for (const [key, rawGroup] of Object.entries(builderFeatChoiceSummary.value)) {
    const group = asObject(rawGroup)
    const featName = cleanText(group.featName || group.label || group.title || key)

    if (!featName) continue

    rows.push({
      source: group.source || 'feat-choice',
      name: stripFeatChoiceSuffix(featName),
      originalName: featName,
      spellList: cleanText(group.spellList || ''),
      groupKey: key,
      builderChoice: group
    })
  }

  const seen = new Set<string>()

  return rows.filter((row) => {
    const idMatch = row.id ? featById(row.id) : null
    const nameMatch = row.name ? featByName(row.name) : null

    // Numeric IDs should either resolve to an imported feat entity or disappear.
    // Otherwise the UI shows ugly cards like "351".
    if (row.id && !idMatch && !row.name) return false

    const key = idMatch
      ? `id:${idMatch.id}`
      : nameMatch
        ? `id:${nameMatch.id}`
        : row.name || row.originalName
          ? `name:${normalizedKey(row.name || row.originalName)}`
          : ''

    if (!key || seen.has(key)) return false

    seen.add(key)
    return Boolean(idMatch || nameMatch || row.name || row.originalName)
  })
})

function builderChoiceForFeat(feat: any, fallbackRow: any) {
  const direct = asObject(fallbackRow.builderChoice)
  if (Object.keys(direct).length) return direct

  const featKey = normalizedKey(feat?.title || fallbackRow?.name)

  for (const group of Object.values(builderFeatChoiceSummary.value)) {
    const obj = asObject(group)
    const groupKey = normalizedKey(obj.featName || obj.label || obj.title || '')

    if (groupKey && groupKey.includes(featKey)) return obj
  }

  return {}
}

const selectedFeatCards = computed(() => {
  const cards: any[] = []

  for (const row of selectedFeatRefs.value) {
    const feat = row.id ? featById(row.id) : featByName(row.name || row.originalName)

    if (feat) {
      const builderChoice = builderChoiceForFeat(feat, row)

      cards.push({
        ...feat,
        selectedSource: row.source,
        selectedName: row.originalName || feat.title,
        spellList: cleanText(builderChoice.spellList || row.spellList || ''),
        spellcastingAbility: cleanText(builderChoice.spellcastingAbility || ''),
        choiceValues: choiceValues(builderChoice.values || []),
        cantripSpellIds: choiceValues(builderChoice.cantripSpellIds || []),
        levelOneSpellIds: choiceValues(builderChoice.levelOneSpellIds || []),
        builderChoice
      })

      continue
    }

    cards.push({
      id: `unresolved-${normalizedKey(row.name || row.originalName)}`,
      title: displayFeatName(row.name || row.originalName || 'Selected Feat'),
      selectedSource: row.source,
      selectedName: row.originalName || row.name,
      source: '',
      page: '',
      prerequisite: '',
      description: '',
      spellList: row.spellList || '',
      choiceValues: [],
      unresolved: true
    })
  }

  return cards
})

function selectedSourceLabel(source: any) {
  const text = cleanText(source)
  if (text === 'species') return 'Species Choice'
  if (text === 'background') return 'Background Choice'
  if (text === 'feat-choice') return 'Feat Choice'
  if (text === 'sheet') return 'Sheet'
  return text || 'Selected'
}
</script>

<template>
  <div class="eldra-codex-soft rounded-none p-4">
    <div class="flex w-full items-center justify-between gap-3 text-left">
      <div>
        <div class="text-xs uppercase tracking-[0.3em] text-[#9f9278]">Selected Feats</div>
        <div class="mt-1 text-sm text-[#d8ceb8]">
          Resolved from guided builder choices and imported feat articles.
        </div>
      </div>

      <div class="eldra-gold-chip rounded-none border px-3 py-1 text-xs">
        {{ selectedFeatCards.length }} Feat{{ selectedFeatCards.length === 1 ? '' : 's' }}
      </div>
    </div>

    <div
      v-if="selectedFeatCards.length"
      class="mt-4 grid min-w-0 gap-2 md:grid-cols-2 xl:grid-cols-3"
    >
      <article
        v-for="feat in selectedFeatCards"
        :key="`selected-feat-${feat.id}`"
        class="min-w-0 overflow-hidden rounded-none border border-[rgba(65,82,103,0.62)] bg-[rgba(8,17,27,0.68)] p-3"
      >
        <div class="flex min-w-0 items-start justify-between gap-3">
          <div class="min-w-0">
            <div class="max-w-full truncate font-semibold text-white">{{ feat.title }}</div>
            <div class="mt-1 text-xs text-[#9f9278]">
              {{ selectedSourceLabel(feat.selectedSource) }}
              <span v-if="sourceLabel(feat)"> · {{ sourceLabel(feat) }}</span>
            </div>
          </div>

          <button
            type="button"
            class="shrink-0 rounded-none border border-[rgba(201,164,90,0.22)] bg-[rgba(20,17,12,0.72)] px-2 py-1 text-xs text-[#f5e7bd]"
            @click.stop="selectedFeatForDrawer = feat"
          >
            Details
          </button>
        </div>

        <div
          v-if="feat.prerequisite"
          class="mt-3 rounded-none border border-[rgba(201,164,90,0.14)] bg-[rgba(20,17,12,0.42)] p-2 text-xs leading-5 text-[#d8ceb8]"
        >
          <span class="font-semibold text-white">Prerequisite:</span>
          {{ feat.prerequisite }}
        </div>

        <p class="mt-3 break-words text-xs leading-5 text-[#9f9278]">
          {{ shortText(feat.description || feat.summary, 220) || (feat.unresolved ? 'Imported feat article not matched yet.' : 'No imported feat description found yet.') }}
        </p>

        <div
          v-if="feat.spellList || feat.spellcastingAbility || feat.choiceValues?.length"
          class="mt-3 rounded-none border border-[rgba(201,164,90,0.14)] bg-[rgba(9,17,26,0.42)] p-2 text-xs leading-5 text-[#d8ceb8]"
        >
          <div v-if="feat.spellList">
            <span class="font-semibold text-white">Spell List:</span>
            {{ feat.spellList }}
          </div>
          <div v-if="feat.spellcastingAbility">
            <span class="font-semibold text-white">Ability:</span>
            {{ feat.spellcastingAbility }}
          </div>
          <div v-if="feat.choiceValues?.length" class="mt-1">
            <span class="font-semibold text-white">Chosen Spells:</span>
            {{ feat.choiceValues.join(', ') }}
          </div>
        </div>
      </article>
    </div>

    <div
      v-else
      class="mt-4 rounded-none border border-dashed border-[rgba(201,164,90,0.22)] p-4 text-sm text-[#9f9278]"
    >
      No selected feats resolved yet.
    </div>

    <Transition
      enter-from-class="opacity-0"
      enter-active-class="transition duration-150"
      leave-to-class="opacity-0"
      leave-active-class="transition duration-150"
    >
      <div
        v-if="selectedFeatForDrawer"
        class="fixed inset-0 z-[250] flex items-center justify-center bg-black/72 p-4 backdrop-blur-sm"
        @click.self="selectedFeatForDrawer = null"
      >
        <aside class="eldra-ornate-panel eldra-frame-corners max-h-[86dvh] w-full max-w-2xl overflow-y-auto rounded-none border p-5">
          <div class="flex items-start justify-between gap-3">
            <div>
              <div class="text-xs uppercase tracking-[0.3em] text-[#9f9278]">Feat Details</div>
              <h2 class="mt-2 text-2xl font-semibold text-white">{{ selectedFeatForDrawer.title }}</h2>
              <div class="mt-1 text-xs text-[#9f9278]">
                {{ selectedSourceLabel(selectedFeatForDrawer.selectedSource) }}
                <span v-if="sourceLabel(selectedFeatForDrawer)"> · {{ sourceLabel(selectedFeatForDrawer) }}</span>
              </div>
            </div>

            <button
              type="button"
              class="rounded-none border border-[rgba(201,164,90,0.24)] bg-[rgba(20,17,12,0.72)] p-2 text-[#b5a88d] transition hover:bg-[rgba(201,164,90,0.10)] hover:text-[#fff7df]"
              @click="selectedFeatForDrawer = null"
            >
              <UIcon name="i-lucide-x" class="h-4 w-4" />
            </button>
          </div>

          <div
            v-if="selectedFeatForDrawer.prerequisite"
            class="mt-4 rounded-none border border-[rgba(201,164,90,0.16)] bg-[rgba(20,17,12,0.42)] p-3 text-sm leading-6 text-[#d8ceb8]"
          >
            <span class="font-semibold text-white">Prerequisite:</span>
            {{ selectedFeatForDrawer.prerequisite }}
          </div>

          <div
            v-if="selectedFeatForDrawer.spellList || selectedFeatForDrawer.spellcastingAbility || selectedFeatForDrawer.choiceValues?.length"
            class="mt-4 rounded-none border border-[rgba(201,164,90,0.16)] bg-[rgba(9,17,26,0.42)] p-3 text-sm leading-6 text-[#d8ceb8]"
          >
            <div v-if="selectedFeatForDrawer.spellList">
              <span class="font-semibold text-white">Spell List:</span>
              {{ selectedFeatForDrawer.spellList }}
            </div>
            <div v-if="selectedFeatForDrawer.spellcastingAbility">
              <span class="font-semibold text-white">Ability:</span>
              {{ selectedFeatForDrawer.spellcastingAbility }}
            </div>
            <div v-if="selectedFeatForDrawer.choiceValues?.length" class="mt-1">
              <span class="font-semibold text-white">Chosen Spells:</span>
              {{ selectedFeatForDrawer.choiceValues.join(', ') }}
            </div>
          </div>

          <div class="mt-5 whitespace-pre-line text-sm leading-7 text-[#d8ceb8]">
            {{ selectedFeatForDrawer.description || selectedFeatForDrawer.summary || 'No imported feat description found yet.' }}
          </div>
        </aside>
      </div>
    </Transition>
  </div>
</template>
