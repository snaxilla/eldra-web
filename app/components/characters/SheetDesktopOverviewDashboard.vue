<script setup lang="ts">
const props = withDefaults(defineProps<{
  mode?: string
  sheet?: any
  entity?: any
  imageUrl?: string
  subtitle?: string
  math?: any
  resolvedClass?: any
  resolvedSpecies?: any
  resolvedBackground?: any
  abilityList?: any[]
  mathSaves?: any[]
  mathSkills?: any[]
  shownStats?: Record<string, any>
  inventoryCount?: number
  featureCount?: number
  selectedSpellCount?: number
  showQuickActions?: boolean
  equippedWeaponActions?: any[]
  actionSpellCards?: any[]
  hasLimitedResources?: boolean
  limitedResourceLabel?: string
  spellSlotRows?: any[]
  spellSaving?: boolean
  restSaving?: boolean
  restSaveError?: string
  restSaveSuccess?: string
  takeShortRest?: () => void
  takeLongRest?: () => void
  slotGemClass?: (row: any, index: number) => string
  slotLevelLabel?: (level: any) => string
  toggleSpellSlot?: (row: any, index: number) => void
  rollAbilityCheck?: (ability: any) => void
  rollSavingThrow?: (save: any) => void
  rollSkillCheck?: (skill: any) => void
  rollWeaponAttack?: (weapon: any) => void
  rollWeaponDamage?: (weapon: any) => void
  openItemDrawer?: (item: any) => void
  openSpellDrawer?: (spell: any) => void
  spellOptionLevelLabel?: (spell: any) => string
  spellActionMechanic?: (spell: any) => any
  spellUsesAttackRoll?: (spell: any) => boolean
  canCastSpell?: (spell: any) => boolean
  rollSpellAttackAndConsumeSlot?: (spell: any) => void
  spellConsumesSlot?: (spell: any) => boolean
  castSpell?: (spell: any) => void
  shortText?: (value: any, limit?: number) => string
}>(), {
  mode: 'play',
  imageUrl: '',
  subtitle: '',
  abilityList: () => [],
  mathSaves: () => [],
  mathSkills: () => [],
  shownStats: () => ({}),
  inventoryCount: 0,
  featureCount: 0,
  selectedSpellCount: 0,
  showQuickActions: false,
  equippedWeaponActions: () => [],
  actionSpellCards: () => [],
  hasLimitedResources: false,
  limitedResourceLabel: '',
  spellSlotRows: () => [],
  spellSaving: false
})

function shown(key: string, fallback = '—') {
  const value = props.shownStats?.[key]
  return value === null || value === undefined || value === '' ? fallback : value
}

function signedTotal(value: any) {
  const raw = String(value ?? '').trim()
  if (!raw) return '+0'
  if (raw.startsWith('+') || raw.startsWith('-')) return raw

  const parsed = Number(raw)
  if (!Number.isFinite(parsed)) return raw

  return `${parsed >= 0 ? '+' : ''}${parsed}`
}

function abilityMod(value: any) {
  const score = Number(value ?? 10)
  if (!Number.isFinite(score)) return '+0'

  const mod = Math.floor((score - 10) / 2)
  return `${mod >= 0 ? '+' : ''}${mod}`
}

function rollAbility(ability: any) {
  props.rollAbilityCheck?.(ability)
}

function rollSave(save: any) {
  props.rollSavingThrow?.(save)
}

function rollSkill(skill: any) {
  props.rollSkillCheck?.(skill)
}

function passiveFor(label: string) {
  const wanted = label.toLowerCase()
  const skill = props.mathSkills.find((item: any) =>
    String(item?.label || '').toLowerCase() === wanted
  )

  if (!skill) return '—'

  const raw = String(skill.totalText ?? skill.total ?? skill.bonus ?? '0')
  const parsed = Number(raw.replace(/^\+/, ''))

  if (!Number.isFinite(parsed)) return '—'
  return String(10 + parsed)
}

const subtitleText = computed(() => {
  if (props.subtitle) return props.subtitle

  return [
    props.sheet?.class_name,
    props.sheet?.species_name,
    props.sheet?.background_name
  ].filter(Boolean).join(' / ')
})

const combatCards = computed(() => [
  {
    key: 'hp',
    label: 'Hit Points',
    value: `${shown('currentHp')} / ${shown('maxHp')}`,
    sub: Number(shown('tempHp', 0)) ? `Temp ${shown('tempHp')}` : 'Current / Max'
  },
  {
    key: 'ac',
    label: 'Armor Class',
    value: shown('armorClass'),
    sub: 'Defense'
  },
  {
    key: 'init',
    label: 'Initiative',
    value: signedTotal(props.math?.combat?.initiativeText || shown('initiative')),
    sub: 'Turn order'
  },
  {
    key: 'speed',
    label: 'Speed',
    value: props.math?.combat?.speed || shown('speed'),
    sub: 'Movement'
  },
  {
    key: 'prof',
    label: 'Proficiency',
    value: props.math?.proficiencyBonusText || '+2',
    sub: 'Bonus'
  }
])

const passiveRows = computed(() => [
  { label: 'Passive Perception', value: passiveFor('Perception') },
  { label: 'Passive Investigation', value: passiveFor('Investigation') },
  { label: 'Passive Insight', value: passiveFor('Insight') }
])

const atAGlanceRows = computed(() => [
  { label: 'Level', value: props.sheet?.level || props.math?.level || 1 },
  { label: 'Class', value: props.sheet?.class_name || props.resolvedClass?.title || '—' },
  { label: 'Species', value: props.sheet?.species_name || props.resolvedSpecies?.title || '—' },
  { label: 'Background', value: props.sheet?.background_name || props.resolvedBackground?.title || '—' },
  { label: 'Features', value: props.featureCount },
  { label: 'Spells', value: props.selectedSpellCount },
  { label: 'Items', value: props.inventoryCount }
])

function slotClass(row: any, index: number) {
  return props.slotGemClass?.(row, index) || 'border-[rgba(201,164,90,0.40)] bg-[rgba(201,164,90,0.18)]'
}

function slotLabel(level: any) {
  return props.slotLevelLabel?.(level) || `Level ${level}`
}

function toggleSlot(row: any, index: number) {
  props.toggleSpellSlot?.(row, index)
}


function doShortRest() {
  props.takeShortRest?.()
}

function doLongRest() {
  props.takeLongRest?.()
}

function proficienciesText(value: any, fallback = 'None listed') {
  const text = String(value || '').trim()
  return text || fallback
}
</script>

<template>
  <section class="sheet-desktop-only mt-4 hidden md:block">
    <div class="grid items-start gap-4 xl:grid-cols-[300px_340px_minmax(0,1fr)] 2xl:grid-cols-[320px_380px_minmax(0,1fr)]">
      <!-- Left rail: DDB-style identity + core left column -->
      <aside class="grid content-start gap-4">
        <section class="eldra-codex-soft rounded-none p-4">
          <div
            v-if="imageUrl"
            class="overflow-hidden rounded-none border border-[rgba(201,164,90,0.28)] bg-black/25"
          >
            <img
              :src="imageUrl"
              :alt="sheet?.name || entity?.title || 'Character Portrait'"
              class="aspect-[4/5] w-full object-cover object-top"
              loading="lazy"
            >
          </div>

          <div
            v-else
            class="flex aspect-[4/5] w-full items-center justify-center rounded-none border border-dashed border-[rgba(201,164,90,0.28)] bg-black/20 text-sm text-[#9f9278]"
          >
            No portrait set.
          </div>

          <div class="mt-4">
            <div class="text-xs uppercase tracking-[0.3em] text-[#9f9278]">Character</div>
            <div class="mt-1 text-2xl font-semibold leading-tight text-white">
              {{ sheet?.name || entity?.title || 'Character' }}
            </div>
            <div class="mt-2 text-sm leading-6 text-[#d8ceb8]">
              {{ subtitleText || 'No class/species details yet.' }}
            </div>
          </div>
        </section>

        <section class="eldra-codex-soft rounded-none p-4">
          <div class="text-xs uppercase tracking-[0.3em] text-[#9f9278]">Ability Scores</div>

          <div class="mt-3 grid grid-cols-2 gap-2">
            <button
              v-for="ability in abilityList"
              :key="ability.key"
              type="button"
              class="rounded-none border border-[rgba(201,164,90,0.18)] bg-[rgba(9,17,26,0.58)] px-3 py-3 text-center transition hover:border-[rgba(201,164,90,0.46)] hover:bg-[rgba(201,164,90,0.10)]"
              @click.stop="rollAbility(ability)"
            >
              <div class="text-xs uppercase tracking-[0.22em] text-[#9f9278]">{{ ability.label }}</div>
              <div class="mt-2 text-3xl font-semibold leading-none text-white">{{ ability.value ?? 10 }}</div>
              <div class="mt-1 text-sm text-[#d8ceb8]">{{ abilityMod(ability.value) }}</div>
            </button>
          </div>
        </section>

        <section class="eldra-codex-soft rounded-none p-4">
          <div class="mb-3 flex items-center justify-between gap-3">
            <div class="text-xs uppercase tracking-[0.3em] text-[#9f9278]">Saving Throws</div>
            <div class="text-[10px] uppercase tracking-[0.18em] text-[#756a57]">Roll</div>
          </div>

          <div class="grid grid-cols-2 gap-2">
            <button
              v-for="save in mathSaves"
              :key="save.key"
              type="button"
              class="rounded-none border border-[rgba(201,164,90,0.14)] bg-[rgba(9,17,26,0.42)] p-2 text-left transition hover:border-[rgba(201,164,90,0.42)] hover:bg-[rgba(201,164,90,0.08)]"
              @click.stop="rollSave(save)"
            >
              <div class="flex items-center justify-between gap-2">
                <span class="text-xs uppercase tracking-[0.18em] text-[#9f9278]">{{ save.shortLabel || save.label }}</span>
                <span
                  v-if="save.proficient"
                  class="eldra-gold-chip rounded-none border px-1.5 py-0 text-[9px]"
                >
                  P
                </span>
              </div>
              <div class="mt-1 text-xl font-semibold text-white">{{ save.totalText }}</div>
            </button>
          </div>
        </section>

        <section class="eldra-codex-soft rounded-none p-4">
          <div class="text-xs uppercase tracking-[0.3em] text-[#9f9278]">Passives</div>

          <div class="mt-3 grid gap-2">
            <div
              v-for="row in passiveRows"
              :key="row.label"
              class="flex items-center justify-between gap-3 rounded-none border border-[rgba(201,164,90,0.14)] bg-[rgba(9,17,26,0.42)] px-3 py-2"
            >
              <span class="text-sm text-[#d8ceb8]">{{ row.label }}</span>
              <span class="text-xl font-semibold text-white">{{ row.value }}</span>
            </div>
          </div>
        </section>
      </aside>

      <!-- Middle rail: DDB-style skills/proficiencies column -->
      <main class="grid content-start gap-4">
        <section class="grid grid-cols-2 gap-2">
          <div
            v-for="stat in combatCards"
            :key="stat.key"
            class="min-h-[96px] rounded-none border border-[rgba(201,164,90,0.24)] bg-[rgba(20,17,12,0.72)] p-3"
            :class="stat.key === 'hp' ? 'col-span-2' : ''"
          >
            <div class="text-xs uppercase tracking-[0.22em] text-[#9f9278]">{{ stat.label }}</div>
            <div class="mt-2 text-3xl font-semibold leading-none text-white">{{ stat.value }}</div>
            <div class="mt-2 text-xs text-[#9f9278]">{{ stat.sub }}</div>
          </div>
        </section>

        <section
          v-if="hasLimitedResources && spellSlotRows.length"
          class="eldra-codex-soft rounded-none p-4"
        >
          <div class="mb-3 flex items-center justify-between gap-3">
            <div class="text-xs uppercase tracking-[0.3em] text-[#9f9278]">
              {{ limitedResourceLabel || 'Resources' }}
            </div>
            <div
              v-if="spellSaving"
              class="text-xs text-[#9f9278]"
            >
              Saving
            </div>
          </div>

          <div class="grid gap-2">
            <div
              v-for="row in spellSlotRows"
              :key="`overview-slot-row-${row.level}`"
              class="flex items-center justify-between gap-3 rounded-none border border-[rgba(201,164,90,0.14)] bg-[rgba(9,17,26,0.42)] px-3 py-2"
            >
              <div class="text-xs font-semibold uppercase tracking-[0.18em] text-[#d8ceb8]">
                {{ row.level }}
              </div>

              <div class="flex flex-wrap justify-end gap-1.5">
                <button
                  v-for="index in row.max"
                  :key="`overview-slot-${row.level}-${index}`"
                  type="button"
                  class="h-4 w-4 rotate-45 border transition hover:scale-110 disabled:opacity-50"
                  :class="slotClass(row, index - 1)"
                  :title="`${slotLabel(row.level)} slot ${index}`"
                  :disabled="spellSaving"
                  @click="toggleSlot(row, index - 1)"
                >
                  <span class="sr-only">{{ slotLabel(row.level) }} slot {{ index }}</span>
                </button>
              </div>
            </div>
          </div>
        </section>

        <section class="eldra-codex-soft rounded-none p-4">
          <div class="mb-3 flex items-center justify-between gap-3">
            <div class="text-xs uppercase tracking-[0.3em] text-[#9f9278]">Skills</div>
            <div class="text-[10px] uppercase tracking-[0.18em] text-[#756a57]">Click to roll</div>
          </div>

          <div class="grid gap-1.5">
            <button
              v-for="skill in mathSkills"
              :key="skill.key"
              type="button"
              class="grid grid-cols-[minmax(0,1fr)_46px] items-center gap-2 rounded-none border border-[rgba(201,164,90,0.12)] bg-[rgba(9,17,26,0.34)] px-3 py-2 text-left transition hover:border-[rgba(201,164,90,0.38)] hover:bg-[rgba(201,164,90,0.08)]"
              @click.stop="rollSkill(skill)"
            >
              <span class="min-w-0 text-sm text-[#d8ceb8]">
                {{ skill.label }}
                <span
                  v-if="skill.proficient"
                  class="ml-1 text-[#c9a45a]"
                >
                  P
                </span>
              </span>
              <span class="text-right font-semibold text-white">{{ skill.totalText }}</span>
            </button>
          </div>
        </section>

        <section class="eldra-codex-soft rounded-none p-4">
          <div class="text-xs uppercase tracking-[0.3em] text-[#9f9278]">Proficiencies / Training</div>

          <div class="mt-3 grid gap-2 text-sm">
            <div class="rounded-none border border-[rgba(201,164,90,0.14)] bg-[rgba(9,17,26,0.42)] p-3">
              <div class="text-xs uppercase tracking-[0.18em] text-[#9f9278]">Armor</div>
              <div class="mt-1 text-[#d8ceb8]">{{ proficienciesText(resolvedClass?.armorProficiencies) }}</div>
            </div>

            <div class="rounded-none border border-[rgba(201,164,90,0.14)] bg-[rgba(9,17,26,0.42)] p-3">
              <div class="text-xs uppercase tracking-[0.18em] text-[#9f9278]">Weapons</div>
              <div class="mt-1 text-[#d8ceb8]">{{ proficienciesText(resolvedClass?.weaponProficiencies) }}</div>
            </div>

            <div class="rounded-none border border-[rgba(201,164,90,0.14)] bg-[rgba(9,17,26,0.42)] p-3">
              <div class="text-xs uppercase tracking-[0.18em] text-[#9f9278]">Class / Species</div>
              <div class="mt-1 text-[#d8ceb8]">
                {{ sheet?.class_name || resolvedClass?.title || '—' }} • {{ sheet?.species_name || resolvedSpecies?.title || '—' }}
              </div>
            </div>
          </div>
        </section>

        <section class="eldra-codex-soft rounded-none p-4">
          <div class="text-xs uppercase tracking-[0.3em] text-[#9f9278]">At A Glance</div>

          <div class="mt-3 grid gap-2 text-sm">
            <div
              v-for="row in atAGlanceRows"
              :key="row.label"
              class="flex items-center justify-between gap-3 rounded-none border border-[rgba(201,164,90,0.14)] bg-[rgba(9,17,26,0.42)] px-3 py-2"
            >
              <span class="text-[#9f9278]">{{ row.label }}</span>
              <span class="truncate font-semibold text-[#fff7df]">{{ row.value }}</span>
            </div>
          </div>
        </section>
      </main>

      <!-- Right rail: DDB-style integrated sheet panel -->
      <aside class="grid content-start gap-4">
        <section class="eldra-codex-soft rounded-none p-4">
          <div class="text-xs uppercase tracking-[0.3em] text-[#9f9278]">Defenses / Conditions</div>

          <div class="mt-3 grid gap-2 text-sm">
            <div class="rounded-none border border-[rgba(201,164,90,0.14)] bg-[rgba(9,17,26,0.42)] p-3">
              <span class="text-[#9f9278]">Armor:</span>
              <span class="ml-1 text-[#d8ceb8]">{{ proficienciesText(resolvedClass?.armorProficiencies) }}</span>
            </div>

            <div class="rounded-none border border-[rgba(201,164,90,0.14)] bg-[rgba(9,17,26,0.42)] p-3">
              <span class="text-[#9f9278]">Weapons:</span>
              <span class="ml-1 text-[#d8ceb8]">{{ proficienciesText(resolvedClass?.weaponProficiencies) }}</span>
            </div>

            <div class="rounded-none border border-[rgba(201,164,90,0.14)] bg-[rgba(9,17,26,0.42)] p-3 text-[#9f9278]">
              Conditions tracking coming with the combat polish pass.
            </div>
          </div>
        </section>

        <section
          data-desktop-rest-controls
          class="eldra-codex-soft rounded-none p-4"
        >
          <div class="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div class="text-xs uppercase tracking-[0.3em] text-[#9f9278]">Rest</div>
              <div class="mt-1 text-sm text-[#d8ceb8]">Recover hit points, spell slots, and limited resources.</div>
            </div>

            <div
              v-if="restSaving"
              class="text-xs uppercase tracking-[0.18em] text-[#9f9278]"
            >
              Saving
            </div>
          </div>

          <div class="mt-3 grid grid-cols-2 gap-2">
            <button
              type="button"
              class="rounded-none border border-[rgba(65,82,103,0.64)] bg-[rgba(8,17,27,0.62)] px-3 py-2 text-xs font-semibold text-[#d8ceb8] transition hover:border-[rgba(201,164,90,0.38)] hover:text-[#fff7df] disabled:opacity-50"
              :disabled="restSaving"
              @click="doShortRest"
            >
              Short Rest
            </button>

            <button
              type="button"
              class="rounded-none border border-[rgba(201,164,90,0.34)] bg-[rgba(201,164,90,0.12)] px-3 py-2 text-xs font-semibold text-[#fff7df] transition hover:border-[rgba(245,231,189,0.62)] disabled:opacity-50"
              :disabled="restSaving"
              @click="doLongRest"
            >
              {{ restSaving ? 'Resting...' : 'Long Rest' }}
            </button>
          </div>

          <div class="mt-2 min-h-[1.25rem] text-xs">
            <span v-if="restSaveError" class="text-red-200">{{ restSaveError }}</span>
            <span v-else-if="restSaveSuccess" class="text-emerald-200">{{ restSaveSuccess }}</span>
            <span v-else class="text-[#756a57]">Long Rest resets spell slots and long-rest resources.</span>
          </div>
        </section>

        <slot name="actions">
          <section class="eldra-codex-soft rounded-none p-5 text-sm text-[#9f9278]">
            Action Center not loaded.
          </section>
        </slot>
      </aside>
    </div>
  </section>
</template>
