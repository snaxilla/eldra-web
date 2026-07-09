<script setup lang="ts">
const props = withDefaults(defineProps<{
  worldId?: string | number
  entityId?: string | number
  sheet?: any
  level?: number
  className?: string
  choiceCount?: number
  saving?: boolean

  levelValue?: string | number
  classEntityId?: string | number
  speciesEntityId?: string | number
  backgroundEntityId?: string | number
  subclassName?: string

  classOptions?: any[]
  speciesOptions?: any[]
  backgroundOptions?: any[]

  resolvedClass?: any
  resolvedSpecies?: any
  resolvedBackground?: any

  abilityList?: any[]
  abilityScores?: Record<string, any>
  combatStats?: Record<string, any>
  shownStats?: Record<string, any>
  sheetTheme?: any
  sheetThemePresetName?: string
  sheetThemePresets?: any[]
}>(), {
  worldId: '',
  entityId: '',
  level: 1,
  className: '—',
  choiceCount: 0,
  saving: false,
  levelValue: '',
  classEntityId: '',
  speciesEntityId: '',
  backgroundEntityId: '',
  subclassName: '',
  classOptions: () => [],
  speciesOptions: () => [],
  backgroundOptions: () => [],
  abilityList: () => [],
  abilityScores: () => ({}),
  combatStats: () => ({}),
  shownStats: () => ({})
})

const emit = defineEmits<{
  (event: 'update-level', value: string): void
  (event: 'update-class-entity-id', value: string): void
  (event: 'update-species-entity-id', value: string): void
  (event: 'update-background-entity-id', value: string): void
  (event: 'update-subclass-name', value: string): void
  (event: 'update-ability', value: { key: string; value: string }): void
  (event: 'update-combat-stat', value: { key: string; value: string }): void
  (event: 'save-level', value: any): void
  (event: 'level-up', value: any): void
  (event: 'saved-choices', value: any): void
  (event: 'save-sheet'): void
  (event: 'update-sheet-theme', patch: Record<string, any>): void
  (event: 'reset-sheet-theme'): void
  (event: 'update-sheet-theme-preset-name', value: string): void
  (event: 'save-sheet-theme-preset'): void
  (event: 'apply-sheet-theme-preset', preset: any): void
  (event: 'delete-sheet-theme-preset', preset: any): void
}>()


const appearanceMediaPickerOpen = ref(false)


const sheetThemePresetList = computed(() =>
  Array.isArray(props.sheetThemePresets) ? props.sheetThemePresets : []
)

function sheetThemePresetUpdatedLabel(value: any) {
  const raw = String(value?.updatedAt || '').trim()
  if (!raw) return ''

  const date = new Date(raw)
  if (Number.isNaN(date.getTime())) return ''

  return date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  })
}

const activeSheetTheme = computed(() =>
  props.sheetTheme && typeof props.sheetTheme === 'object'
    ? props.sheetTheme
    : {}
)


function safeAppearanceCssUrl(value: any) {
  const url = String(value || '/assets/themes/sheet-paper-default.webp')
    .replace(/["\\\n\r]/g, '')
    .trim()

  return `url("${url || '/assets/themes/sheet-paper-default.webp'}")`
}

function normalizeAppearanceColor(value: any, fallback = '#cfc0a0') {
  const text = String(value || '').trim()

  if (/^#[0-9a-fA-F]{6}$/.test(text)) return text.toLowerCase()
  if (/^[0-9a-fA-F]{6}$/.test(text)) return `#${text.toLowerCase()}`

  return fallback
}

const appearancePreviewStyle = computed(() => {
  const theme: any = activeSheetTheme.value || {}
  const tone = theme.tone === 'dark' ? 'dark' : 'paper'
  const mode = theme.backgroundMode === 'solid' ? 'solid' : 'image'
  const dim = Math.max(0, Math.min(0.70, Number(theme.dim ?? 22) / 100))
  const overlay = tone === 'dark'
    ? `linear-gradient(180deg, rgba(4,7,10,${Math.max(0.56, dim)}), rgba(4,7,10,${Math.max(0.66, dim + 0.08)}))`
    : `linear-gradient(180deg, rgba(57,42,22,${dim}), rgba(36,25,12,${Math.min(0.78, dim + 0.11)}))`

  if (mode === 'solid') {
    return {
      backgroundColor: normalizeAppearanceColor(theme.solidColor),
      backgroundImage: overlay,
      backgroundRepeat: 'no-repeat',
      backgroundSize: '100% 100%'
    }
  }

  return {
    backgroundColor: tone === 'dark' ? '#101316' : '#cfc0a0',
    backgroundImage: `${overlay}, ${safeAppearanceCssUrl(theme.backgroundUrl)}`,
    backgroundRepeat: `no-repeat, ${theme.repeat === false ? 'no-repeat' : 'repeat'}`,
    backgroundSize: `100% 100%, ${theme.repeat === false ? (theme.fit || 'cover') : `${theme.tileSize || 520}px ${theme.tileSize || 520}px`}`,
    backgroundPosition: 'center center'
  }
})

function checkedValue(event: Event) {
  return Boolean((event.target as HTMLInputElement)?.checked)
}

function numericInputValue(event: Event, fallback = 520) {
  const parsed = Number((event.target as HTMLInputElement)?.value)
  return Number.isFinite(parsed) ? parsed : fallback
}

function updateSheetTheme(patch: Record<string, any>) {
  emit('update-sheet-theme', patch)
}

function selectSheetThemeMedia(file: any) {
  const url = String(file?.url || file?.imageUrl || file?.image_url || '').trim()
  if (!url) return

  updateSheetTheme({
    backgroundUrl: url,
    backgroundFileId: String(file?.id || ''),
    backgroundTitle: String(file?.title || file?.filename || 'Gallery Image')
  })

  appearanceMediaPickerOpen.value = false
}

function inputValue(event: Event) {
  return String((event.target as HTMLInputElement | HTMLSelectElement)?.value || '')
}

function emitAbility(key: any, event: Event) {
  emit('update-ability', {
    key: String(key || ''),
    value: inputValue(event)
  })
}

function emitCombatStat(key: string, event: Event) {
  emit('update-combat-stat', {
    key,
    value: inputValue(event)
  })
}

function classDetailRows(value: any) {
  return [
    value?.hitDie ? ['Hit Die', value.hitDie] : null,
    value?.savingThrows ? ['Saves', value.savingThrows] : null,
    value?.armorProficiencies ? ['Armor', value.armorProficiencies] : null,
    value?.weaponProficiencies ? ['Weapons', value.weaponProficiencies] : null
  ].filter(Boolean) as [string, any][]
}

function speciesDetailRows(value: any) {
  return [
    value?.size ? ['Size', value.size] : null,
    value?.speed ? ['Speed', value.speed] : null,
    value?.rawTraitCount ? ['Traits', value.rawTraitCount] : null
  ].filter(Boolean) as [string, any][]
}

function backgroundDetailRows(value: any) {
  return [
    value?.skillProficiencies ? ['Skills', value.skillProficiencies] : null,
    value?.toolProficiencies ? ['Tools', value.toolProficiencies] : null,
    value?.featureName ? ['Feature', value.featureName] : null
  ].filter(Boolean) as [string, any][]
}

function abilityInputValue(ability: any) {
  const key = String(ability?.key || '')
  return props.abilityScores?.[key] ?? ability?.value ?? ''
}

function shownCombatValue(key: string) {
  return props.combatStats?.[key] ?? props.shownStats?.[key] ?? ''
}
</script>

<template>
  <section class="space-y-4">
    <div class="rounded-none border border-[rgba(201,164,90,0.22)] bg-[rgba(20,17,12,0.58)] p-4">
      <div class="mb-3 flex items-start justify-between gap-3">
        <div>
          <div class="text-xs uppercase tracking-[0.3em] text-[#9f9278]">Character Setup</div>
          <div class="mt-1 text-sm leading-6 text-[#d8ceb8]">
            Level, class, species, background, ability scores, and combat basics.
          </div>
        </div>

        <button
          type="button"
          class="eldra-button rounded-none px-3 py-2 text-xs font-semibold disabled:opacity-50"
          :disabled="saving"
          @click="emit('save-sheet')"
        >
          {{ saving ? 'Saving...' : 'Save' }}
        </button>
      </div>

      <CharactersSheetLevelManager
        :level="level"
        :class-name="className"
        :choice-count="choiceCount"
        :saving="saving"
        @save-level="emit('save-level', $event)"
        @level-up="emit('level-up', $event)"
      />
    </div>

    <section class="rounded-none border border-[rgba(201,164,90,0.22)] bg-[rgba(20,17,12,0.42)] p-4">
      <div class="mb-3 text-xs uppercase tracking-[0.3em] text-[#9f9278]">Core Identity</div>

      <div class="grid gap-3">
        <label class="block">
          <span class="mb-2 block text-[10px] uppercase tracking-[0.22em] text-[#9f9278]">Level</span>
          <input
            :value="levelValue"
            inputmode="numeric"
            class="eldra-input w-full rounded-none px-3 py-2 text-sm text-white"
            @input="emit('update-level', inputValue($event))"
          >
        </label>

        <label class="block">
          <span class="mb-2 block text-[10px] uppercase tracking-[0.22em] text-[#9f9278]">Class</span>
          <select
            :value="classEntityId || ''"
            class="eldra-input w-full rounded-none px-3 py-2 text-sm text-white"
            @change="emit('update-class-entity-id', inputValue($event))"
          >
            <option value="" class="bg-[#090909] text-[#f5e7bd]">No linked class</option>
            <option
              v-for="option in classOptions"
              :key="option.id"
              :value="option.id"
              class="bg-[#090909] text-[#f5e7bd]"
            >
              {{ option.title }}
            </option>
          </select>
        </label>

        <div
          v-if="resolvedClass"
          class="grid gap-2 rounded-none border border-[rgba(201,164,90,0.14)] bg-[rgba(8,17,27,0.42)] p-3 text-xs"
        >
          <div
            v-for="[label, value] in classDetailRows(resolvedClass)"
            :key="`class-detail-${label}`"
            class="flex justify-between gap-3"
          >
            <span class="text-[#9f9278]">{{ label }}</span>
            <span class="text-right text-[#f5e7bd]">{{ value }}</span>
          </div>
        </div>

        <label class="block">
          <span class="mb-2 block text-[10px] uppercase tracking-[0.22em] text-[#9f9278]">Species</span>
          <select
            :value="speciesEntityId || ''"
            class="eldra-input w-full rounded-none px-3 py-2 text-sm text-white"
            @change="emit('update-species-entity-id', inputValue($event))"
          >
            <option value="" class="bg-[#090909] text-[#f5e7bd]">No linked species</option>
            <option
              v-for="option in speciesOptions"
              :key="option.id"
              :value="option.id"
              class="bg-[#090909] text-[#f5e7bd]"
            >
              {{ option.title }}
            </option>
          </select>
        </label>

        <div
          v-if="resolvedSpecies"
          class="grid gap-2 rounded-none border border-[rgba(201,164,90,0.14)] bg-[rgba(8,17,27,0.42)] p-3 text-xs"
        >
          <div
            v-for="[label, value] in speciesDetailRows(resolvedSpecies)"
            :key="`species-detail-${label}`"
            class="flex justify-between gap-3"
          >
            <span class="text-[#9f9278]">{{ label }}</span>
            <span class="text-right text-[#f5e7bd]">{{ value }}</span>
          </div>
        </div>

        <label class="block">
          <span class="mb-2 block text-[10px] uppercase tracking-[0.22em] text-[#9f9278]">Background</span>
          <select
            :value="backgroundEntityId || ''"
            class="eldra-input w-full rounded-none px-3 py-2 text-sm text-white"
            @change="emit('update-background-entity-id', inputValue($event))"
          >
            <option value="" class="bg-[#090909] text-[#f5e7bd]">No linked background</option>
            <option
              v-for="option in backgroundOptions"
              :key="option.id"
              :value="option.id"
              class="bg-[#090909] text-[#f5e7bd]"
            >
              {{ option.title }}
            </option>
          </select>
        </label>

        <div
          v-if="resolvedBackground"
          class="grid gap-2 rounded-none border border-[rgba(201,164,90,0.14)] bg-[rgba(8,17,27,0.42)] p-3 text-xs"
        >
          <div
            v-for="[label, value] in backgroundDetailRows(resolvedBackground)"
            :key="`background-detail-${label}`"
            class="flex justify-between gap-3"
          >
            <span class="text-[#9f9278]">{{ label }}</span>
            <span class="text-right text-[#f5e7bd]">{{ value }}</span>
          </div>
        </div>

        <label class="block">
          <span class="mb-2 block text-[10px] uppercase tracking-[0.22em] text-[#9f9278]">Subclass</span>
          <input
            :value="subclassName || ''"
            class="eldra-input w-full rounded-none px-3 py-2 text-sm text-white"
            placeholder="Optional subclass"
            @input="emit('update-subclass-name', inputValue($event))"
          >
        </label>
      </div>
    </section>

    <section
      v-if="choiceCount"
      class="rounded-none border border-amber-300/20 bg-amber-400/10 p-4"
    >
      <div class="mb-3 flex items-center justify-between gap-3">
        <div>
          <div class="text-xs uppercase tracking-[0.3em] text-amber-100">Pending Choices</div>
          <div class="mt-1 text-sm text-[#d8ceb8]">
            {{ choiceCount }} choice{{ choiceCount === 1 ? '' : 's' }} still need attention.
          </div>
        </div>
      </div>

      <CharactersSheetLevelSetupChoices
        :world-id="worldId"
        :entity-id="entityId"
        :sheet="sheet"
        :level="level"
        @saved="emit('saved-choices', $event)"
      />
    </section>

    <section class="rounded-none border border-[rgba(201,164,90,0.22)] bg-[rgba(20,17,12,0.42)] p-4">
      <div class="mb-3 text-xs uppercase tracking-[0.3em] text-[#9f9278]">Ability Scores</div>

      <div class="grid grid-cols-2 gap-2">
        <label
          v-for="ability in abilityList"
          :key="ability.key"
          class="rounded-none border border-[rgba(65,82,103,0.62)] bg-[rgba(8,17,27,0.62)] p-3 text-center"
        >
          <span class="block text-[10px] uppercase tracking-[0.22em] text-[#9f9278]">
            {{ ability.label }}
          </span>

          <input
            :value="abilityInputValue(ability)"
            inputmode="numeric"
            class="eldra-input mx-auto mt-2 w-full rounded-none px-3 py-2 text-center text-xl font-semibold text-white"
            @input="emitAbility(ability.key, $event)"
          >

          <span class="mt-1 block text-xs text-[#d8ceb8]">
            {{ ability.modifierText || ability.modText || ability.modifier || '' }}
          </span>
        </label>
      </div>
    </section>

    <section class="rounded-none border border-[rgba(201,164,90,0.22)] bg-[rgba(20,17,12,0.42)] p-4">
      <div class="mb-3 text-xs uppercase tracking-[0.3em] text-[#9f9278]">Combat Basics</div>

      <div class="grid grid-cols-2 gap-3">
        <label class="block">
          <span class="mb-2 block text-[10px] uppercase tracking-[0.22em] text-[#9f9278]">Armor Class</span>
          <input
            :value="shownCombatValue('armorClass')"
            inputmode="numeric"
            class="eldra-input w-full rounded-none px-3 py-2 text-sm text-white"
            @input="emitCombatStat('armorClass', $event)"
          >
        </label>

        <label class="block">
          <span class="mb-2 block text-[10px] uppercase tracking-[0.22em] text-[#9f9278]">Initiative</span>
          <input
            :value="shownCombatValue('initiative')"
            inputmode="numeric"
            class="eldra-input w-full rounded-none px-3 py-2 text-sm text-white"
            @input="emitCombatStat('initiative', $event)"
          >
        </label>

        <label class="block">
          <span class="mb-2 block text-[10px] uppercase tracking-[0.22em] text-[#9f9278]">Current HP</span>
          <input
            :value="shownCombatValue('currentHp')"
            inputmode="numeric"
            class="eldra-input w-full rounded-none px-3 py-2 text-sm text-white"
            @input="emitCombatStat('currentHp', $event)"
          >
        </label>

        <label class="block">
          <span class="mb-2 block text-[10px] uppercase tracking-[0.22em] text-[#9f9278]">Max HP</span>
          <input
            :value="shownCombatValue('maxHp')"
            inputmode="numeric"
            class="eldra-input w-full rounded-none px-3 py-2 text-sm text-white"
            @input="emitCombatStat('maxHp', $event)"
          >
        </label>

        <label class="block">
          <span class="mb-2 block text-[10px] uppercase tracking-[0.22em] text-[#9f9278]">Speed</span>
          <input
            :value="shownCombatValue('speed')"
            class="eldra-input w-full rounded-none px-3 py-2 text-sm text-white"
            placeholder="30 ft"
            @input="emitCombatStat('speed', $event)"
          >
        </label>

        <label class="block">
          <span class="mb-2 block text-[10px] uppercase tracking-[0.22em] text-[#9f9278]">Hit Dice</span>
          <input
            :value="shownCombatValue('hitDice')"
            class="eldra-input w-full rounded-none px-3 py-2 text-sm text-white"
            placeholder="e.g. 1d6"
            @input="emitCombatStat('hitDice', $event)"
          >
        </label>
      </div>
    </section>
  
    <section class="rounded-none border border-[rgba(201,164,90,0.22)] bg-[rgba(20,17,12,0.42)] p-4">
      <div class="mb-3 flex items-start justify-between gap-3">
        <div>
          <div class="text-xs uppercase tracking-[0.3em] text-[#9f9278]">Sheet Appearance</div>
          <div class="mt-1 text-sm leading-6 text-[#d8ceb8]">
            Personal sheet surface theme for this browser.
          </div>
        </div>

        <button
          type="button"
          class="rounded-none border border-[rgba(201,164,90,0.24)] bg-[rgba(20,17,12,0.72)] px-3 py-2 text-xs font-semibold text-[#fff7df]"
          @click="emit('reset-sheet-theme')"
        >
          Reset
        </button>
      </div>

      <div
        class="mb-3 h-24 rounded-none border border-[rgba(201,164,90,0.26)] bg-cover bg-center"
        :style="appearancePreviewStyle"
      />

      <div class="mb-3 rounded-none border border-[rgba(65,82,103,0.52)] bg-[rgba(8,17,27,0.54)] p-3">
        <div class="mb-2 text-[10px] uppercase tracking-[0.22em] text-[#9f9278]">Saved Presets</div>

        <div class="grid grid-cols-[minmax(0,1fr)_auto] gap-2">
          <input
            :value="sheetThemePresetName || ''"
            class="eldra-input w-full rounded-none px-3 py-2 text-sm text-white"
            placeholder="Preset name..."
            @input="emit('update-sheet-theme-preset-name', inputValue($event))"
          >

          <button
            type="button"
            class="eldra-button rounded-none px-3 py-2 text-xs font-semibold disabled:opacity-50"
            :disabled="!String(sheetThemePresetName || '').trim()"
            @click="emit('save-sheet-theme-preset')"
          >
            Save
          </button>
        </div>

        <div
          v-if="sheetThemePresetList.length"
          class="mt-3 grid gap-2"
        >
          <div
            v-for="preset in sheetThemePresetList"
            :key="preset.id"
            class="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-2 rounded-none border border-[rgba(201,164,90,0.16)] bg-[rgba(20,17,12,0.48)] p-2"
          >
            <button
              type="button"
              class="min-w-0 text-left"
              @click="emit('apply-sheet-theme-preset', preset)"
            >
              <span class="block truncate text-sm font-semibold text-white">{{ preset.name }}</span>
              <span
                v-if="sheetThemePresetUpdatedLabel(preset)"
                class="mt-0.5 block text-[10px] uppercase tracking-[0.14em] text-[#9f9278]"
              >
                {{ sheetThemePresetUpdatedLabel(preset) }}
              </span>
            </button>

            <button
              type="button"
              class="rounded-none border border-[rgba(201,164,90,0.22)] bg-[rgba(201,164,90,0.10)] px-2 py-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-[#fff7df]"
              @click="emit('apply-sheet-theme-preset', preset)"
            >
              Apply
            </button>

            <button
              type="button"
              class="rounded-none border border-red-400/24 bg-red-500/10 px-2 py-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-red-100"
              @click="emit('delete-sheet-theme-preset', preset)"
            >
              Delete
            </button>
          </div>
        </div>

        <div
          v-else
          class="mt-3 rounded-none border border-dashed border-[rgba(201,164,90,0.18)] p-3 text-xs leading-5 text-[#9f9278]"
        >
          No saved presets yet.
        </div>
      </div>

      <div class="grid gap-3">
        <label class="block">
          <span class="mb-2 block text-[10px] uppercase tracking-[0.22em] text-[#9f9278]">Background Type</span>
          <select
            :value="activeSheetTheme.backgroundMode || 'image'"
            class="eldra-input w-full rounded-none px-3 py-2 text-sm text-white"
            @change="updateSheetTheme({ backgroundMode: inputValue($event) })"
          >
            <option value="image" class="bg-[#090909] text-[#f5e7bd]">Image / Texture</option>
            <option value="solid" class="bg-[#090909] text-[#f5e7bd]">Solid Color</option>
          </select>
        </label>

        <div
          v-if="activeSheetTheme.backgroundMode === 'solid'"
          class="grid grid-cols-[72px_minmax(0,1fr)] gap-3 rounded-none border border-[rgba(65,82,103,0.52)] bg-[rgba(8,17,27,0.54)] p-3"
        >
          <label class="block">
            <span class="mb-2 block text-[10px] uppercase tracking-[0.22em] text-[#9f9278]">Color</span>
            <input
              type="color"
              :value="activeSheetTheme.solidColor || '#cfc0a0'"
              class="h-10 w-full cursor-pointer rounded-none border border-[rgba(201,164,90,0.24)] bg-transparent p-1"
              @input="updateSheetTheme({ solidColor: inputValue($event) })"
            >
          </label>

          <label class="block">
            <span class="mb-2 block text-[10px] uppercase tracking-[0.22em] text-[#9f9278]">Hex</span>
            <input
              :value="activeSheetTheme.solidColor || '#cfc0a0'"
              class="eldra-input w-full rounded-none px-3 py-2 text-sm text-white"
              placeholder="#cfc0a0"
              @input="updateSheetTheme({ solidColor: inputValue($event) })"
            >
          </label>
        </div>

        <div
          v-if="activeSheetTheme.backgroundMode !== 'solid'"
          class="rounded-none border border-[rgba(65,82,103,0.52)] bg-[rgba(8,17,27,0.54)] p-3"
        >
          <div class="mb-2 text-[10px] uppercase tracking-[0.22em] text-[#9f9278]">Background Image</div>

          <div class="text-sm font-semibold text-white">
            {{ activeSheetTheme.backgroundTitle || 'Default Paper' }}
          </div>

          <div class="mt-3 grid grid-cols-2 gap-2">
            <button
              type="button"
              class="eldra-button rounded-none px-3 py-2 text-xs font-semibold"
              @click="appearanceMediaPickerOpen = true"
            >
              Gallery
            </button>

            <button
              type="button"
              class="rounded-none border border-[rgba(201,164,90,0.22)] bg-[rgba(20,17,12,0.72)] px-3 py-2 text-xs font-semibold text-[#fff7df]"
              @click="updateSheetTheme({
                backgroundUrl: '/assets/themes/sheet-paper-default.webp',
                backgroundTitle: 'Default Paper',
                backgroundFileId: ''
              })"
            >
              Default
            </button>
          </div>
        </div>

        <label class="block">
          <span class="mb-2 block text-[10px] uppercase tracking-[0.22em] text-[#9f9278]">Tone</span>
          <select
            :value="activeSheetTheme.tone || 'paper'"
            class="eldra-input w-full rounded-none px-3 py-2 text-sm text-white"
            @change="updateSheetTheme({ tone: inputValue($event) })"
          >
            <option value="paper" class="bg-[#090909] text-[#f5e7bd]">Paper / Vellum</option>
            <option value="dark" class="bg-[#090909] text-[#f5e7bd]">Dark Slate</option>
          </select>
        </label>

        <label class="block">
          <span class="mb-2 block text-[10px] uppercase tracking-[0.22em] text-[#9f9278]">Cards / Boxes Theme</span>
          <select
            :value="activeSheetTheme.boxTheme || 'midnight'"
            class="eldra-input w-full rounded-none px-3 py-2 text-sm text-white"
            @change="updateSheetTheme({ boxTheme: inputValue($event) })"
          >
            <optgroup label="Dark Neutrals" class="bg-[#090909] text-[#f5e7bd]">
              <option value="midnight" class="bg-[#090909] text-[#f5e7bd]">Midnight Ink</option>
              <option value="obsidian" class="bg-[#090909] text-[#f5e7bd]">Obsidian Gold</option>
              <option value="blueSteel" class="bg-[#090909] text-[#f5e7bd]">Blue Steel</option>
              <option value="smokedWalnut" class="bg-[#090909] text-[#f5e7bd]">Smoked Walnut</option>
            </optgroup>

            <optgroup label="Light Neutrals" class="bg-[#090909] text-[#f5e7bd]">
              <option value="ivory" class="bg-[#090909] text-[#f5e7bd]">Ivory Paper</option>
              <option value="vellum" class="bg-[#090909] text-[#f5e7bd]">Warm Vellum</option>
            </optgroup>

            <optgroup label="Soft Color" class="bg-[#090909] text-[#f5e7bd]">
              <option value="rose" class="bg-[#090909] text-[#f5e7bd]">Blush Rose</option>
              <option value="lavender" class="bg-[#090909] text-[#f5e7bd]">Lavender Mist</option>
            </optgroup>
          </select>
        </label>

        <label class="block">
          <span class="mb-2 block text-[10px] uppercase tracking-[0.22em] text-[#9f9278]">Title Frame</span>
          <select
            :value="activeSheetTheme.titleFrame || 'floral'"
            class="eldra-input w-full rounded-none px-3 py-2 text-sm text-white"
            @change="updateSheetTheme({ titleFrame: inputValue($event) })"
          >
            <option value="floral" class="bg-[#090909] text-[#f5e7bd]">Gold Title Frame</option>
            <option value="simple" class="bg-[#090909] text-[#f5e7bd]">Simple Plate</option>
            <option value="none" class="bg-[#090909] text-[#f5e7bd]">No Frame</option>
          </select>
        </label>

        <label
          v-if="activeSheetTheme.backgroundMode !== 'solid'"
          class="flex items-center justify-between gap-3 rounded-none border border-[rgba(65,82,103,0.52)] bg-[rgba(8,17,27,0.54)] p-3"
        >
          <span>
            <span class="block text-[10px] uppercase tracking-[0.22em] text-[#9f9278]">Repeat Image</span>
            <span class="mt-1 block text-xs text-[#d8ceb8]">Best for seamless paper or texture tiles.</span>
          </span>

          <input
            type="checkbox"
            class="h-5 w-5 accent-[#c9a45a]"
            :checked="activeSheetTheme.repeat !== false"
            @change="updateSheetTheme({ repeat: checkedValue($event) })"
          >
        </label>

        <label
          v-if="activeSheetTheme.backgroundMode !== 'solid' && activeSheetTheme.repeat !== false"
          class="block"
        >
          <span class="mb-2 block text-[10px] uppercase tracking-[0.22em] text-[#9f9278]">
            Tile Size: {{ activeSheetTheme.tileSize || 520 }}px
          </span>

          <input
            type="range"
            min="220"
            max="1200"
            step="20"
            :value="activeSheetTheme.tileSize || 520"
            class="w-full accent-[#c9a45a]"
            @input="updateSheetTheme({ tileSize: numericInputValue($event, 520) })"
          >
        </label>

        <label
          v-else-if="activeSheetTheme.backgroundMode !== 'solid'"
          class="block"
        >
          <span class="mb-2 block text-[10px] uppercase tracking-[0.22em] text-[#9f9278]">Image Fit</span>
          <select
            :value="activeSheetTheme.fit || 'cover'"
            class="eldra-input w-full rounded-none px-3 py-2 text-sm text-white"
            @change="updateSheetTheme({ fit: inputValue($event) })"
          >
            <option value="cover" class="bg-[#090909] text-[#f5e7bd]">Cover</option>
            <option value="contain" class="bg-[#090909] text-[#f5e7bd]">Contain</option>
          </select>
        </label>

        <label class="block">
          <span class="mb-2 block text-[10px] uppercase tracking-[0.22em] text-[#9f9278]">
            Shade: {{ activeSheetTheme.dim ?? 22 }}%
          </span>

          <input
            type="range"
            min="0"
            max="60"
            step="1"
            :value="activeSheetTheme.dim ?? 22"
            class="w-full accent-[#c9a45a]"
            @input="updateSheetTheme({ dim: numericInputValue($event, 22) })"
          >
        </label>
      </div>

      <WorldMediaPicker
        v-model:open="appearanceMediaPickerOpen"
        :world-id="worldId"
        title="Choose Sheet Background"
        select-label="Use Background"
        @select="selectSheetThemeMedia"
      />
    </section>

</section>
</template>
