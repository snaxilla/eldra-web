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
  equippedWeaponActions?: any[]
  actionSpellCards?: any[]
  hasLimitedResources?: boolean
  limitedResourceLabel?: string
  spellSlotRows?: any[]
  spellSaving?: boolean
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

function text(value: any, fallback = '—') {
  const out = String(value ?? '').trim()
  return out || fallback
}

function short(value: any, limit = 180) {
  if (props.shortText) return props.shortText(value, limit)

  const clean = String(value || '').replace(/\s+/g, ' ').trim()
  return clean.length > limit ? `${clean.slice(0, limit).trim()}...` : clean
}

function abilityMod(value: any) {
  const score = Number(value ?? 10)
  if (!Number.isFinite(score)) return '+0'
  const mod = Math.floor((score - 10) / 2)
  return `${mod >= 0 ? '+' : ''}${mod}`
}

function signedTotal(value: any) {
  const raw = String(value ?? '').trim()
  if (!raw) return '+0'
  if (raw.startsWith('+') || raw.startsWith('-')) return raw
  const parsed = Number(raw)
  if (!Number.isFinite(parsed)) return raw
  return `${parsed >= 0 ? '+' : ''}${parsed}`
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

const heroStats = computed(() => [
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

const tableRows = computed(() => [
  { label: 'Level', value: props.sheet?.level || props.math?.level || 1 },
  { label: 'Class', value: props.sheet?.class_name || props.resolvedClass?.title || '—' },
  { label: 'Species', value: props.sheet?.species_name || props.resolvedSpecies?.title || '—' },
  { label: 'Background', value: props.sheet?.background_name || props.resolvedBackground?.title || '—' },
  { label: 'Features', value: props.featureCount },
  { label: 'Spells', value: props.selectedSpellCount },
  { label: 'Items', value: props.inventoryCount }
])

const saveRows = computed(() => props.mathSaves || [])
const skillRows = computed(() => props.mathSkills || [])
const weaponRows = computed(() => (props.equippedWeaponActions || []).slice(0, 4))
const spellRows = computed(() => (props.actionSpellCards || []).slice(0, 5))

function slotClass(row: any, index: number) {
  return props.slotGemClass?.(row, index) || 'border-[rgba(201,164,90,0.40)] bg-[rgba(201,164,90,0.18)]'
}

function slotLabel(level: any) {
  return props.slotLevelLabel?.(level) || `Level ${level}`
}

function toggleSlot(row: any, index: number) {
  props.toggleSpellSlot?.(row, index)
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

function spellLevel(spell: any) {
  return props.spellOptionLevelLabel?.(spell) || 'Spell'
}

function spellMechanic(spell: any) {
  return props.spellActionMechanic?.(spell) || {
    label: 'Action',
    value: '—',
    note: ''
  }
}

function canCast(spell: any) {
  return props.canCastSpell?.(spell) ?? true
}
</script>

<template>
  <section class="sheet-desktop-only mt-6 hidden md:block">
    <div class="grid items-start gap-4 xl:grid-cols-[260px_minmax(0,1fr)_340px] 2xl:grid-cols-[280px_minmax(0,1fr)_380px]">
      <aside class="grid content-start gap-4">
        <div class="eldra-codex-soft rounded-none p-4">
          <div
            v-if="imageUrl"
            class="overflow-hidden rounded-none border border-[rgba(201,164,90,0.34)] bg-black/25"
          >
            <img
              :src="imageUrl"
              :alt="sheet?.name || entity?.title || 'Character Portrait'"
              class="h-72 w-full object-cover object-[center_15%]"
              loading="lazy"
            >
          </div>

          <div
            v-else
            class="flex h-72 items-center justify-center rounded-none border border-dashed border-[rgba(201,164,90,0.28)] bg-black/20 text-sm text-[#9f9278]"
          >
            No portrait set.
          </div>

          <div class="mt-4">
            <div class="text-xs uppercase tracking-[0.3em] text-[#9f9278]">Character</div>
            <div class="mt-1 text-xl font-semibold text-white">
              {{ sheet?.name || entity?.title || 'Character' }}
            </div>
            <div class="mt-1 text-sm leading-6 text-[#d8ceb8]">
              {{ subtitleText || 'No class/species details yet.' }}
            </div>
          </div>
        </div>

        <div class="eldra-codex-soft rounded-none p-4">
          <div class="text-xs uppercase tracking-[0.3em] text-[#9f9278]">At A Glance</div>

          <div class="mt-3 grid gap-2 text-sm">
            <div
              v-for="row in tableRows"
              :key="row.label"
              class="flex items-center justify-between gap-3 rounded-none border border-[rgba(201,164,90,0.14)] bg-[rgba(9,17,26,0.42)] px-3 py-2"
            >
              <span class="text-[#9f9278]">{{ row.label }}</span>
              <span class="truncate font-semibold text-[#fff7df]">{{ row.value }}</span>
            </div>
          </div>
        </div>

        <div class="eldra-codex-soft rounded-none p-4">
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
        </div>
      </aside>

      <main class="grid content-start gap-4">
        <div class="grid auto-rows-max items-start gap-3 sm:grid-cols-2 xl:grid-cols-5">
          <div
            v-for="stat in heroStats"
            :key="stat.key"
            class="min-h-[116px] rounded-none border border-[rgba(201,164,90,0.24)] bg-[rgba(20,17,12,0.72)] p-4"
          >
            <div class="text-xs uppercase tracking-[0.22em] text-[#9f9278]">{{ stat.label }}</div>
            <div class="mt-2 text-3xl font-semibold leading-none text-white">{{ stat.value }}</div>
            <div class="mt-2 text-xs text-[#9f9278]">{{ stat.sub }}</div>
          </div>
        </div>

        <div class="eldra-codex-soft rounded-none p-4">
          <div class="mb-3 flex flex-wrap items-center justify-between gap-3">
            <div class="text-xs uppercase tracking-[0.3em] text-[#9f9278]">Abilities</div>
            <div class="text-xs uppercase tracking-[0.18em] text-[#756a57]">Click to roll</div>
          </div>

          <div class="grid gap-2 sm:grid-cols-3 xl:grid-cols-6">
            <button
              v-for="ability in abilityList"
              :key="ability.key"
              type="button"
              class="rounded-none border border-[rgba(201,164,90,0.18)] bg-[rgba(9,17,26,0.58)] p-3 text-center transition hover:border-[rgba(201,164,90,0.46)] hover:bg-[rgba(201,164,90,0.10)]"
              @click.stop="rollAbility(ability)"
            >
              <div class="text-xs uppercase tracking-[0.2em] text-[#9f9278]">{{ ability.label }}</div>
              <div class="mt-2 text-3xl font-semibold leading-none text-white">{{ ability.value ?? 10 }}</div>
              <div class="mt-1 text-sm text-[#d8ceb8]">{{ abilityMod(ability.value) }}</div>
            </button>
          </div>
        </div>

        <div class="grid gap-4 xl:grid-cols-[320px_minmax(0,1fr)]">
          <div class="eldra-codex-soft rounded-none p-4">
            <div class="mb-3 flex items-center justify-between gap-3">
              <div class="text-xs uppercase tracking-[0.3em] text-[#9f9278]">Saving Throws</div>
              <div class="text-xs text-[#756a57]">Roll</div>
            </div>

            <div class="grid grid-cols-2 gap-2">
              <button
                v-for="save in saveRows"
                :key="save.key"
                type="button"
                class="rounded-none border border-[rgba(201,164,90,0.14)] bg-[rgba(9,17,26,0.42)] p-2 text-left transition hover:border-[rgba(201,164,90,0.42)] hover:bg-[rgba(201,164,90,0.08)]"
                @click.stop="rollSave(save)"
              >
                <div class="flex items-center justify-between gap-2">
                  <span class="text-xs uppercase tracking-[0.18em] text-[#9f9278]">{{ save.shortLabel }}</span>
                  <span v-if="save.proficient" class="eldra-gold-chip rounded-none border px-1.5 py-0 text-[9px]">P</span>
                </div>
                <div class="mt-1 text-xl font-semibold text-white">{{ save.totalText }}</div>
              </button>
            </div>
          </div>

          <div class="eldra-codex-soft rounded-none p-4">
            <div class="mb-3 flex items-center justify-between gap-3">
              <div class="text-xs uppercase tracking-[0.3em] text-[#9f9278]">Skills</div>
              <div class="text-xs text-[#756a57]">Click to roll</div>
            </div>

            <div class="grid gap-1.5 sm:grid-cols-2 2xl:grid-cols-3">
              <button
                v-for="skill in skillRows"
                :key="skill.key"
                type="button"
                class="flex items-center justify-between gap-2 rounded-none border border-[rgba(201,164,90,0.12)] bg-[rgba(9,17,26,0.34)] px-2.5 py-2 text-left transition hover:border-[rgba(201,164,90,0.38)] hover:bg-[rgba(201,164,90,0.08)]"
                @click.stop="rollSkill(skill)"
              >
                <span class="min-w-0 truncate text-sm text-[#d8ceb8]">
                  {{ skill.label }}
                  <span v-if="skill.proficient" class="ml-1 text-[#c9a45a]">P</span>
                </span>
                <span class="shrink-0 font-semibold text-white">{{ skill.totalText }}</span>
              </button>
            </div>
          </div>
        </div>

        <div class="grid items-start gap-4 2xl:grid-cols-2">
<div class="eldra-codex-soft rounded-none p-4">
          <div class="mb-3 flex flex-wrap items-center justify-between gap-3">
            <div class="text-xs uppercase tracking-[0.3em] text-[#9f9278]">Primary Attacks</div>
            <div class="eldra-gold-chip rounded-none border px-2 py-0.5 text-[10px]">
              {{ equippedWeaponActions.length }}
            </div>
          </div>

          <div
            v-if="weaponRows.length"
            class="grid gap-2"
          >
            <article
              v-for="weapon in weaponRows"
              :key="`overview-weapon-${weapon.id}`"
              class="rounded-none border border-[rgba(65,82,103,0.58)] bg-[rgba(8,17,27,0.62)] p-3"
            >
              <div class="flex items-start justify-between gap-3">
                <div class="min-w-0">
                  <div class="truncate font-semibold text-white">{{ weapon.name }}</div>
                  <div class="mt-1 text-xs text-[#9f9278]">{{ weapon.itemType || 'Weapon' }}</div>
                </div>
                <div class="text-right">
                  <div class="text-lg font-semibold text-white">{{ weapon.attackBonusText }}</div>
                  <div class="text-[10px] uppercase tracking-[0.16em] text-[#9f9278]">Hit</div>
                </div>
              </div>

              <div class="mt-2 grid grid-cols-2 gap-2 text-xs">
                <div class="rounded-none border border-[rgba(201,164,90,0.12)] bg-black/20 p-2">
                  <div class="uppercase tracking-[0.16em] text-[#9f9278]">Damage</div>
                  <div class="mt-1 font-semibold text-white">{{ weapon.damage || '—' }}</div>
                </div>
                <div class="rounded-none border border-[rgba(201,164,90,0.12)] bg-black/20 p-2">
                  <div class="uppercase tracking-[0.16em] text-[#9f9278]">Type</div>
                  <div class="mt-1 font-semibold text-white">{{ weapon.damageType || '—' }}</div>
                </div>
              </div>

              <div class="mt-3 grid grid-cols-3 gap-2">
                <button
                  type="button"
                  class="rounded-none border border-[rgba(201,164,90,0.24)] bg-[rgba(201,164,90,0.10)] px-2 py-2 text-xs font-semibold text-[#fff7df]"
                  @click.stop="rollWeaponAttack?.(weapon)"
                >
                  To Hit
                </button>

                <button
                  type="button"
                  class="rounded-none border border-[rgba(201,164,90,0.24)] bg-[rgba(201,164,90,0.10)] px-2 py-2 text-xs font-semibold text-[#fff7df]"
                  @click.stop="rollWeaponDamage?.(weapon)"
                >
                  Damage
                </button>

                <button
                  type="button"
                  class="rounded-none border border-[rgba(201,164,90,0.24)] bg-[rgba(20,17,12,0.72)] px-2 py-2 text-xs font-semibold text-[#fff7df]"
                  @click.stop="openItemDrawer?.(weapon)"
                >
                  Details
                </button>
              </div>
            </article>
          </div>

          <div
            v-else
            class="rounded-none border border-dashed border-[rgba(201,164,90,0.22)] p-3 text-sm text-[#9f9278]"
          >
            No equipped weapon attacks yet.
          </div>
        </div>

<div
          v-if="spellRows.length"
          class="eldra-codex-soft rounded-none p-4"
        >
          <div class="mb-3 flex flex-wrap items-center justify-between gap-3">
            <div class="text-xs uppercase tracking-[0.3em] text-[#9f9278]">Spell Actions</div>
            <div class="eldra-gold-chip rounded-none border px-2 py-0.5 text-[10px]">
              {{ actionSpellCards.length }}
            </div>
          </div>

          <div class="grid gap-2">
            <article
              v-for="spell in spellRows"
              :key="`overview-spell-${spell.id}`"
              class="rounded-none border border-[rgba(65,82,103,0.58)] bg-[rgba(8,17,27,0.62)] p-3"
            >
              <div class="flex items-start justify-between gap-3">
                <button
                  type="button"
                  class="min-w-0 text-left"
                  @click.stop="openSpellDrawer?.(spell)"
                >
                  <div class="truncate font-semibold text-white">{{ spell.title }}</div>
                  <div class="mt-1 text-xs text-[#9f9278]">{{ spellLevel(spell) }}</div>
                </button>

                <span class="rounded-none border border-[rgba(201,164,90,0.18)] bg-black/20 px-2 py-1 text-[10px] uppercase tracking-[0.16em] text-[#f5e7bd]">
                  {{ spell.actionKind || 'Spell' }}
                </span>
              </div>

              <div class="mt-2 rounded-none border border-[rgba(201,164,90,0.12)] bg-black/20 p-2 text-xs">
                <div class="flex items-center justify-between gap-2">
                  <span class="uppercase tracking-[0.16em] text-[#9f9278]">{{ spellMechanic(spell).label }}</span>
                  <span class="font-semibold text-white">{{ spellMechanic(spell).value }}</span>
                </div>
                <div class="mt-0.5 text-[10px] text-[#9f9278]">{{ spellMechanic(spell).note }}</div>
              </div>

              <div
                class="mt-3 grid gap-2"
                :class="spellConsumesSlot?.(spell) ? 'grid-cols-2' : 'grid-cols-1'"
              >
                <button
                  type="button"
                  class="rounded-none border border-[rgba(201,164,90,0.24)] bg-[rgba(20,17,12,0.72)] px-2 py-2 text-xs font-semibold text-[#fff7df]"
                  @click.stop="openSpellDrawer?.(spell)"
                >
                  Details
                </button>

                <button
                  v-if="spellConsumesSlot?.(spell)"
                  type="button"
                  class="rounded-none border border-[rgba(201,164,90,0.34)] bg-[rgba(201,164,90,0.12)] px-2 py-2 text-xs font-semibold text-[#fff7df] disabled:opacity-45"
                  :disabled="spellSaving || !canCast(spell)"
                  @click.stop="castSpell?.(spell)"
                >
                  Cast
                </button>
              </div>
            </article>
          </div>
        </div>
        </div>
      </main>

      <aside class="grid content-start gap-4">
        <div
          v-if="hasLimitedResources && spellSlotRows.length"
          class="eldra-codex-soft rounded-none p-4"
        >
          <div class="mb-3 flex items-center justify-between gap-3">
            <div class="text-xs uppercase tracking-[0.3em] text-[#9f9278]">
              {{ limitedResourceLabel || 'Resources' }}
            </div>
            <div v-if="spellSaving" class="text-xs text-[#9f9278]">Saving</div>
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
        </div>

        

        

        <div class="eldra-codex-soft rounded-none p-4">
          <div class="text-xs uppercase tracking-[0.3em] text-[#9f9278]">Defenses / Conditions</div>
          <div class="mt-3 grid gap-2 text-sm">
            <div class="rounded-none border border-[rgba(201,164,90,0.14)] bg-[rgba(9,17,26,0.42)] p-3">
              <span class="text-[#9f9278]">Armor:</span>
              <span class="ml-1 text-[#d8ceb8]">{{ text(resolvedClass?.armorProficiencies, 'None listed') }}</span>
            </div>
            <div class="rounded-none border border-[rgba(201,164,90,0.14)] bg-[rgba(9,17,26,0.42)] p-3">
              <span class="text-[#9f9278]">Weapons:</span>
              <span class="ml-1 text-[#d8ceb8]">{{ text(resolvedClass?.weaponProficiencies, 'None listed') }}</span>
            </div>
            <div class="rounded-none border border-[rgba(201,164,90,0.14)] bg-[rgba(9,17,26,0.42)] p-3 text-[#9f9278]">
              Conditions tracking coming with the combat polish pass.
            </div>
          </div>
        </div>
      </aside>
    </div>
  </section>
</template>
