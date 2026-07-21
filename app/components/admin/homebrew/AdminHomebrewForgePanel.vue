<script setup lang="ts">
const props = defineProps<{
  worldId: string | number
}>()

const router = useRouter()
const worldId = computed(() => String(props.worldId || ''))

type HomebrewForgeType = 'spell' | 'item' | 'enemy' | 'species' | 'class' | 'feat' | 'background'

const homebrewTypes: Array<{
  key: HomebrewForgeType
  label: string
  description: string
  icon: string
}> = [
  {
    key: 'spell',
    label: 'Spell',
    description: 'Level, school, casting, range, components, duration, and combat delivery.',
    icon: 'i-lucide-sparkles'
  },
  {
    key: 'item',
    label: 'Item',
    description: 'Equipment, weapons, armor, resources, modifiers, and granted actions.',
    icon: 'i-lucide-package'
  },
  {
    key: 'enemy',
    label: 'Enemy',
    description: 'Statblock-ready creatures with CR, abilities, defenses, traits, and actions.',
    icon: 'i-lucide-skull'
  },
  {
    key: 'species',
    label: 'Species',
    description: 'Size, speed, traits, proficiencies, senses, and granted features.',
    icon: 'i-lucide-dna'
  },
  {
    key: 'class',
    label: 'Class',
    description: 'Hit die, proficiencies, saves, spellcasting hooks, and level features.',
    icon: 'i-lucide-shield'
  },
  {
    key: 'feat',
    label: 'Feat',
    description: 'Prerequisites, benefits, granted spells, actions, and mechanical choices.',
    icon: 'i-lucide-badge-plus'
  },
  {
    key: 'background',
    label: 'Background',
    description: 'ASI, skills, tools, languages, feat hooks, and starting flavor.',
    icon: 'i-lucide-scroll-text'
  }
]

const homebrewType = ref<HomebrewForgeType>('spell')
const homebrewTemplateSearch = ref('')
const homebrewTemplates = ref<any[]>([])
const homebrewTemplatesPending = ref(false)
const homebrewSelectedTemplateId = ref('')
const homebrewTitle = ref('')
const homebrewCreating = ref(false)
const homebrewError = ref('')
const homebrewSuccess = ref('')
const homebrewCreatedEntity = ref<any | null>(null)

const selectedHomebrewType = computed(() =>
  homebrewTypes.find((type) => type.key === homebrewType.value) || homebrewTypes[0]
)

const homebrewFilteredTemplates = computed(() => {
  const q = homebrewTemplateSearch.value.trim().toLowerCase()

  return homebrewTemplates.value
    .filter((template: any) => {
      if (!q) return true

      return [
        template.title,
        template.summary,
        template.sourceBook,
        template.metaLine,
        template.entityType
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(q)
    })
    .slice(0, 80)
})

const selectedHomebrewTemplate = computed(() =>
  homebrewTemplates.value.find((template: any) =>
    String(template.id) === String(homebrewSelectedTemplateId.value)
  ) || null
)


const SPELL_SCHOOL_OPTIONS = [
  { value: 'A', label: 'Abjuration' },
  { value: 'C', label: 'Conjuration' },
  { value: 'D', label: 'Divination' },
  { value: 'E', label: 'Enchantment' },
  { value: 'V', label: 'Evocation' },
  { value: 'I', label: 'Illusion' },
  { value: 'N', label: 'Necromancy' },
  { value: 'T', label: 'Transmutation' }
]

const SPELL_LEVEL_OPTIONS = [
  { value: '0', label: 'Cantrip' },
  { value: '1', label: 'Level 1' },
  { value: '2', label: 'Level 2' },
  { value: '3', label: 'Level 3' },
  { value: '4', label: 'Level 4' },
  { value: '5', label: 'Level 5' },
  { value: '6', label: 'Level 6' },
  { value: '7', label: 'Level 7' },
  { value: '8', label: 'Level 8' },
  { value: '9', label: 'Level 9' }
]

const SPELL_ATTACK_OPTIONS = [
  { value: '', label: 'None / Utility' },
  { value: 'spell_attack', label: 'Spell Attack' },
  { value: 'saving_throw', label: 'Saving Throw' },
  { value: 'healing', label: 'Healing' },
  { value: 'summon', label: 'Summon / Control' }
]

const SPELL_SAVE_OPTIONS = [
  { value: '', label: 'No Save' },
  { value: 'str', label: 'Strength' },
  { value: 'dex', label: 'Dexterity' },
  { value: 'con', label: 'Constitution' },
  { value: 'int', label: 'Intelligence' },
  { value: 'wis', label: 'Wisdom' },
  { value: 'cha', label: 'Charisma' }
]

const SPELL_DAMAGE_TYPES = [
  '',
  'acid',
  'bludgeoning',
  'cold',
  'fire',
  'force',
  'lightning',
  'necrotic',
  'piercing',
  'poison',
  'psychic',
  'radiant',
  'slashing',
  'thunder'
]

const spellBuilderForm = reactive({
  name: '',
  level: '0',
  school: 'V',
  castingTime: '',
  range: '',
  duration: '',
  components: '',
  ritual: false,
  concentration: false,
  attackType: '',
  saveAbility: '',
  damage: '',
  damageType: '',
  classes: '',
  description: '',
  higherLevel: ''
})

function spellBuilderText(value: any) {
  return String(value ?? '').trim()
}

function spellLevelLabel(value: any) {
  const key = String(value ?? '0')
  return SPELL_LEVEL_OPTIONS.find((option) => option.value === key)?.label || `Level ${key}`
}

function spellSchoolLabel(value: any) {
  const key = String(value || '').toUpperCase()
  return SPELL_SCHOOL_OPTIONS.find((option) => option.value === key)?.label || key || 'School'
}

function spellBuilderBool(value: any) {
  return value === true || value === 'true' || value === 1 || value === '1'
}

function hydrateSpellBuilderFromTemplate(template: any) {
  const core = template?.core || {}

  spellBuilderForm.name = spellBuilderText(core.name || template?.title || '')
  spellBuilderForm.level = String(core.level ?? '0')
  spellBuilderForm.school = spellBuilderText(core.school || 'V').toUpperCase()
  spellBuilderForm.castingTime = spellBuilderText(core.casting_time || core.castingTime || '')
  spellBuilderForm.range = spellBuilderText(core.range || '')
  spellBuilderForm.duration = spellBuilderText(core.duration || '')
  spellBuilderForm.components = spellBuilderText(core.components || '')
  spellBuilderForm.ritual = spellBuilderBool(core.ritual)
  spellBuilderForm.concentration = spellBuilderBool(core.concentration)
  spellBuilderForm.attackType = spellBuilderText(core.attack_type || core.attackType || '')
  spellBuilderForm.saveAbility = spellBuilderText(core.save_ability || core.saveAbility || '')
  spellBuilderForm.damage = spellBuilderText(core.damage || '')
  spellBuilderForm.damageType = spellBuilderText(core.damage_type || core.damageType || '')
  spellBuilderForm.classes = spellBuilderText(core.classes || '')
  spellBuilderForm.description = spellBuilderText(core.description || template?.summary || '')
  spellBuilderForm.higherLevel = spellBuilderText(core.higher_level || core.higherLevel || '')

  if (!homebrewTitle.value.trim()) {
    homebrewTitle.value = spellBuilderForm.name
      ? `Homebrew: ${spellBuilderForm.name}`
      : defaultHomebrewTitle(template)
  }
}

function spellBuilderPayload() {
  return {
    name: spellBuilderForm.name,
    level: Number(spellBuilderForm.level || 0),
    school: spellBuilderForm.school,
    castingTime: spellBuilderForm.castingTime,
    range: spellBuilderForm.range,
    duration: spellBuilderForm.duration,
    components: spellBuilderForm.components,
    ritual: spellBuilderForm.ritual,
    concentration: spellBuilderForm.concentration,
    attackType: spellBuilderForm.attackType,
    saveAbility: spellBuilderForm.saveAbility,
    damage: spellBuilderForm.damage,
    damageType: spellBuilderForm.damageType,
    classes: spellBuilderForm.classes,
    description: spellBuilderForm.description,
    higherLevel: spellBuilderForm.higherLevel
  }
}

const spellBuilderSummaryLine = computed(() => {
  if (homebrewType.value !== 'spell') return ''

  return [
    spellLevelLabel(spellBuilderForm.level),
    spellSchoolLabel(spellBuilderForm.school),
    spellBuilderForm.castingTime,
    spellBuilderForm.range,
    spellBuilderForm.duration,
    spellBuilderForm.concentration ? 'Concentration' : '',
    spellBuilderForm.ritual ? 'Ritual' : ''
  ].filter(Boolean).join(' · ')
})

function resetSpellBuilderForm() {
  spellBuilderForm.name = ''
  spellBuilderForm.level = '0'
  spellBuilderForm.school = 'V'
  spellBuilderForm.castingTime = ''
  spellBuilderForm.range = ''
  spellBuilderForm.duration = ''
  spellBuilderForm.components = ''
  spellBuilderForm.ritual = false
  spellBuilderForm.concentration = false
  spellBuilderForm.attackType = ''
  spellBuilderForm.saveAbility = ''
  spellBuilderForm.damage = ''
  spellBuilderForm.damageType = ''
  spellBuilderForm.classes = ''
  spellBuilderForm.description = ''
  spellBuilderForm.higherLevel = ''
}



const ITEM_TYPE_OPTIONS = [
  { value: 'G', label: 'Adventuring Gear / Wondrous' },
  { value: 'M', label: 'Melee Weapon' },
  { value: 'R', label: 'Ranged Weapon' },
  { value: 'A', label: 'Ammunition' },
  { value: 'LA', label: 'Light Armor' },
  { value: 'MA', label: 'Medium Armor' },
  { value: 'HA', label: 'Heavy Armor' },
  { value: 'S', label: 'Shield' },
  { value: 'P', label: 'Potion' },
  { value: 'RD', label: 'Rod' },
  { value: 'WD', label: 'Wand' },
  { value: 'ST', label: 'Staff' },
  { value: 'RG', label: 'Ring' },
  { value: 'SC', label: 'Scroll' },
  { value: 'SCF', label: 'Spellcasting Focus' },
  { value: 'T', label: 'Tool' }
]

const ITEM_RARITY_OPTIONS = [
  'none',
  'common',
  'uncommon',
  'rare',
  'very rare',
  'legendary',
  'artifact'
]

const ITEM_EQUIP_SLOT_OPTIONS = [
  { value: '', label: 'Not Equipped' },
  { value: 'hand', label: 'Hand' },
  { value: 'off_hand', label: 'Off Hand' },
  { value: 'body', label: 'Body / Armor' },
  { value: 'ammo', label: 'Ammunition' },
  { value: 'ring', label: 'Ring' },
  { value: 'neck', label: 'Neck' },
  { value: 'shoulders', label: 'Shoulders' },
  { value: 'head', label: 'Head' },
  { value: 'hands', label: 'Hands' },
  { value: 'feet', label: 'Feet' },
  { value: 'waist', label: 'Waist' },
  { value: 'worn', label: 'Worn' }
]

const ITEM_DAMAGE_TYPES = [
  '',
  'acid',
  'bludgeoning',
  'cold',
  'fire',
  'force',
  'lightning',
  'necrotic',
  'piercing',
  'poison',
  'psychic',
  'radiant',
  'slashing',
  'thunder'
]

const ITEM_ACTION_TIMINGS = [
  'Action',
  'Bonus Action',
  'Reaction',
  'Magic Action',
  'Free Action',
  'Other'
]

const ITEM_RECHARGE_OPTIONS = [
  '',
  'short rest',
  'long rest',
  'dawn',
  'daily',
  'charges'
]

const itemBuilderForm = reactive({
  name: '',
  itemType: 'G',
  rarity: 'common',
  requiresAttunement: false,
  attunementText: '',
  equippable: false,
  equipSlot: '',
  weight: '',
  value: '',
  description: '',
  weaponEnabled: false,
  weaponKind: 'melee',
  weaponCategory: '',
  weaponDamage: '',
  weaponDamageType: '',
  weaponRange: '',
  weaponProperties: '',
  magicBonus: '',
  attackBonus: '',
  damageBonus: '',
  armorEnabled: false,
  armorClass: '',
  armorType: 'armor',
  dexCap: '',
  strength: '',
  stealthDisadvantage: false,
  acBonus: '',
  saveBonus: '',
  spellAttackBonus: '',
  spellSaveDcBonus: '',
  grantedActionName: '',
  grantedActionTiming: 'Action',
  grantedActionDetail: '',
  grantedActionUses: '',
  grantedActionRecharge: ''
})

function itemBuilderText(value: any) {
  return String(value ?? '').trim()
}

function itemBuilderBool(value: any) {
  return value === true || value === 'true' || value === 1 || value === '1'
}

function itemTypeLabel(value: any) {
  const key = String(value || '').toUpperCase()
  return ITEM_TYPE_OPTIONS.find((option) => option.value === key)?.label || key || 'Item'
}

function hydrateItemBuilderFromTemplate(template: any) {
  const core = template?.core || {}

  itemBuilderForm.name = itemBuilderText(core.name || template?.title || '')
  itemBuilderForm.itemType = itemBuilderText(core.item_type || core.itemType || 'G').split('|')[0].toUpperCase() || 'G'
  itemBuilderForm.rarity = itemBuilderText(core.rarity || 'common')
  itemBuilderForm.requiresAttunement = itemBuilderBool(core.requiresAttunement)
  itemBuilderForm.attunementText = itemBuilderText(core.attunementText || '')
  itemBuilderForm.equippable = itemBuilderBool(core.equippable)
  itemBuilderForm.equipSlot = itemBuilderText(core.equipSlot || '')
  itemBuilderForm.weight = itemBuilderText(core.weight || '')
  itemBuilderForm.value = itemBuilderText(core.value || '')
  itemBuilderForm.description = itemBuilderText(core.description || template?.summary || '')

  itemBuilderForm.weaponEnabled = itemBuilderBool(core.weaponKind || core.damage || ['M', 'R', 'A'].includes(itemBuilderForm.itemType))
  itemBuilderForm.weaponKind = itemBuilderText(core.weaponKind || (itemBuilderForm.itemType === 'R' ? 'ranged' : 'melee'))
  itemBuilderForm.weaponCategory = itemBuilderText(core.weaponCategory || '')
  itemBuilderForm.weaponDamage = itemBuilderText(core.damage || '')
  itemBuilderForm.weaponDamageType = itemBuilderText(core.damageType || core.damage_type || '')
  itemBuilderForm.weaponRange = itemBuilderText(core.weaponRange || '')
  itemBuilderForm.weaponProperties = itemBuilderText(core.weaponProperties || '')
  itemBuilderForm.magicBonus = itemBuilderText(core.magicBonus || '')
  itemBuilderForm.attackBonus = itemBuilderText(core.attackBonus || '')
  itemBuilderForm.damageBonus = itemBuilderText(core.damageBonus || '')

  itemBuilderForm.armorEnabled = itemBuilderBool(core.armorClass || ['LA', 'MA', 'HA', 'S'].includes(itemBuilderForm.itemType))
  itemBuilderForm.armorClass = itemBuilderText(core.armorClass || '')
  itemBuilderForm.armorType = itemBuilderText(core.armorType || (itemBuilderForm.itemType === 'S' ? 'shield' : 'armor'))
  itemBuilderForm.dexCap = itemBuilderText(core.dexCap || '')
  itemBuilderForm.strength = itemBuilderText(core.strength || '')
  itemBuilderForm.stealthDisadvantage = itemBuilderBool(core.stealthDisadvantage)

  itemBuilderForm.acBonus = itemBuilderText(core.acBonus || '')
  itemBuilderForm.saveBonus = itemBuilderText(core.saveBonus || '')
  itemBuilderForm.spellAttackBonus = itemBuilderText(core.spellAttackBonus || '')
  itemBuilderForm.spellSaveDcBonus = itemBuilderText(core.spellSaveDcBonus || '')

  itemBuilderForm.grantedActionName = itemBuilderText(core.grantedActionName || '')
  itemBuilderForm.grantedActionTiming = itemBuilderText(core.grantedActionTiming || 'Action')
  itemBuilderForm.grantedActionDetail = itemBuilderText(core.grantedActionDetail || '')
  itemBuilderForm.grantedActionUses = itemBuilderText(core.grantedActionUses || '')
  itemBuilderForm.grantedActionRecharge = itemBuilderText(core.grantedActionRecharge || '')

  if (!homebrewTitle.value.trim()) {
    homebrewTitle.value = itemBuilderForm.name
      ? `Homebrew: ${itemBuilderForm.name}`
      : defaultHomebrewTitle(template)
  }
}

function resetItemBuilderForm() {
  itemBuilderForm.name = ''
  itemBuilderForm.itemType = 'G'
  itemBuilderForm.rarity = 'common'
  itemBuilderForm.requiresAttunement = false
  itemBuilderForm.attunementText = ''
  itemBuilderForm.equippable = false
  itemBuilderForm.equipSlot = ''
  itemBuilderForm.weight = ''
  itemBuilderForm.value = ''
  itemBuilderForm.description = ''
  itemBuilderForm.weaponEnabled = false
  itemBuilderForm.weaponKind = 'melee'
  itemBuilderForm.weaponCategory = ''
  itemBuilderForm.weaponDamage = ''
  itemBuilderForm.weaponDamageType = ''
  itemBuilderForm.weaponRange = ''
  itemBuilderForm.weaponProperties = ''
  itemBuilderForm.magicBonus = ''
  itemBuilderForm.attackBonus = ''
  itemBuilderForm.damageBonus = ''
  itemBuilderForm.armorEnabled = false
  itemBuilderForm.armorClass = ''
  itemBuilderForm.armorType = 'armor'
  itemBuilderForm.dexCap = ''
  itemBuilderForm.strength = ''
  itemBuilderForm.stealthDisadvantage = false
  itemBuilderForm.acBonus = ''
  itemBuilderForm.saveBonus = ''
  itemBuilderForm.spellAttackBonus = ''
  itemBuilderForm.spellSaveDcBonus = ''
  itemBuilderForm.grantedActionName = ''
  itemBuilderForm.grantedActionTiming = 'Action'
  itemBuilderForm.grantedActionDetail = ''
  itemBuilderForm.grantedActionUses = ''
  itemBuilderForm.grantedActionRecharge = ''
}

function itemBuilderPayload() {
  return {
    name: itemBuilderForm.name,
    itemType: itemBuilderForm.itemType,
    rarity: itemBuilderForm.rarity,
    requiresAttunement: itemBuilderForm.requiresAttunement,
    attunementText: itemBuilderForm.attunementText,
    equippable: itemBuilderForm.equippable,
    equipSlot: itemBuilderForm.equipSlot,
    weight: itemBuilderForm.weight,
    value: itemBuilderForm.value,
    description: itemBuilderForm.description,
    weaponEnabled: itemBuilderForm.weaponEnabled,
    weaponKind: itemBuilderForm.weaponKind,
    weaponCategory: itemBuilderForm.weaponCategory,
    damage: itemBuilderForm.weaponDamage,
    damageType: itemBuilderForm.weaponDamageType,
    weaponRange: itemBuilderForm.weaponRange,
    weaponProperties: itemBuilderForm.weaponProperties,
    magicBonus: itemBuilderForm.magicBonus,
    attackBonus: itemBuilderForm.attackBonus,
    damageBonus: itemBuilderForm.damageBonus,
    armorEnabled: itemBuilderForm.armorEnabled,
    armorClass: itemBuilderForm.armorClass,
    armorType: itemBuilderForm.armorType,
    dexCap: itemBuilderForm.dexCap,
    strength: itemBuilderForm.strength,
    stealthDisadvantage: itemBuilderForm.stealthDisadvantage,
    acBonus: itemBuilderForm.acBonus,
    saveBonus: itemBuilderForm.saveBonus,
    spellAttackBonus: itemBuilderForm.spellAttackBonus,
    spellSaveDcBonus: itemBuilderForm.spellSaveDcBonus,
    grantedActionName: itemBuilderForm.grantedActionName,
    grantedActionTiming: itemBuilderForm.grantedActionTiming,
    grantedActionDetail: itemBuilderForm.grantedActionDetail,
    grantedActionUses: itemBuilderForm.grantedActionUses,
    grantedActionRecharge: itemBuilderForm.grantedActionRecharge
  }
}

const itemBuilderSummaryLine = computed(() => {
  if (homebrewType.value !== 'item') return ''

  return [
    itemTypeLabel(itemBuilderForm.itemType),
    itemBuilderForm.rarity,
    itemBuilderForm.requiresAttunement ? 'Attunement' : '',
    itemBuilderForm.equippable ? itemBuilderForm.equipSlot || 'Equippable' : '',
    itemBuilderForm.weaponEnabled && itemBuilderForm.weaponDamage ? itemBuilderForm.weaponDamage : '',
    itemBuilderForm.armorEnabled && itemBuilderForm.armorClass ? `AC ${itemBuilderForm.armorClass}` : ''
  ].filter(Boolean).join(' · ')
})


function defaultHomebrewTitle(template: any) {
  const title = String(template?.title || selectedHomebrewType.value?.label || 'Homebrew').trim()
  return title.startsWith('Homebrew:')
    ? title
    : `Homebrew: ${title}`
}

function homebrewTemplateSubtitle(template: any) {
  return [
    template?.sourceBook,
    template?.sourcePage ? `p.${template.sourcePage}` : '',
    template?.entityType,
    template?.blockCount ? `${template.blockCount} blocks` : ''
  ].filter(Boolean).join(' · ')
}

function selectHomebrewTemplate(template: any) {
  homebrewSelectedTemplateId.value = String(template?.id || '')
  homebrewSuccess.value = ''
  homebrewError.value = ''

  if (homebrewType.value === 'spell') {
    hydrateSpellBuilderFromTemplate(template)
  }

  if (homebrewType.value === 'item') {
    hydrateItemBuilderFromTemplate(template)
  }

  if (!homebrewTitle.value.trim()) {
    homebrewTitle.value = defaultHomebrewTitle(template)
  }
}

async function loadHomebrewTemplates() {
  if (!worldId.value) return

  homebrewTemplatesPending.value = true
  homebrewError.value = ''

  try {
    const res: any = await $fetch(`/api/worlds/${worldId.value}/homebrew/templates`, {
      query: {
        type: homebrewType.value
      }
    })

    homebrewTemplates.value = Array.isArray(res?.templates) ? res.templates : []

    if (
      homebrewSelectedTemplateId.value &&
      !homebrewTemplates.value.some((template: any) => String(template.id) === String(homebrewSelectedTemplateId.value))
    ) {
      homebrewSelectedTemplateId.value = ''
    }
  } catch (error: any) {
    homebrewError.value =
      error?.data?.statusMessage ||
      error?.data?.message ||
      error?.message ||
      'Failed to load homebrew templates.'
    homebrewTemplates.value = []
  } finally {
    homebrewTemplatesPending.value = false
  }
}


type HomebrewCheckStatus = 'ok' | 'warn' | 'error'

function homebrewHasText(value: any) {
  return String(value ?? '').trim().length > 0
}

function homebrewNumberText(value: any) {
  const text = String(value ?? '').trim()
  if (!text) return ''

  return text.startsWith('+') || text.startsWith('-')
    ? text
    : text
}

function homebrewReviewValue(value: any, fallback = '—') {
  const text = String(value ?? '').trim()
  return text || fallback
}

const homebrewDraftTitlePreview = computed(() => {
  if (homebrewType.value === 'spell') {
    return homebrewTitle.value.trim() ||
      spellBuilderForm.name.trim() ||
      (selectedHomebrewTemplate.value ? defaultHomebrewTitle(selectedHomebrewTemplate.value) : '')
  }

  if (homebrewType.value === 'item') {
    return homebrewTitle.value.trim() ||
      itemBuilderForm.name.trim() ||
      (selectedHomebrewTemplate.value ? defaultHomebrewTitle(selectedHomebrewTemplate.value) : '')
  }

  return homebrewTitle.value.trim() ||
    (selectedHomebrewTemplate.value ? defaultHomebrewTitle(selectedHomebrewTemplate.value) : '')
})

const homebrewDraftChecks = computed(() => {
  const checks: Array<{
    status: HomebrewCheckStatus
    label: string
    detail: string
  }> = []

  function push(status: HomebrewCheckStatus, label: string, detail: string) {
    checks.push({ status, label, detail })
  }

  if (!selectedHomebrewTemplate.value) {
    push('error', 'Template Required', 'Choose a template before creating a homebrew draft.')
    return checks
  }

  if (!homebrewHasText(homebrewDraftTitlePreview.value)) {
    push('error', 'Title Required', 'Give the draft a title.')
  }

  if (homebrewType.value === 'spell') {
    if (!homebrewHasText(spellBuilderForm.name)) {
      push('error', 'Spell Name Required', 'Set the spell name before creating the draft.')
    }

    if (!homebrewHasText(spellBuilderForm.description)) {
      push('warn', 'Description Empty', 'The spell can be created, but its article and overview will be thin.')
    }

    if (spellBuilderForm.attackType === 'saving_throw' && !homebrewHasText(spellBuilderForm.saveAbility)) {
      push('error', 'Save Ability Required', 'Saving throw spells need a Strength, Dexterity, Constitution, Intelligence, Wisdom, or Charisma save.')
    }

    if (homebrewHasText(spellBuilderForm.damageType) && !homebrewHasText(spellBuilderForm.damage)) {
      push('warn', 'Damage Dice Missing', 'A damage type is set, but no damage/healing dice were entered.')
    }

    if (homebrewHasText(spellBuilderForm.damage) && !homebrewHasText(spellBuilderForm.damageType)) {
      push('warn', 'Damage Type Missing', 'Damage/healing dice are set, but no damage type is selected.')
    }

    if (!homebrewHasText(spellBuilderForm.castingTime)) {
      push('warn', 'Casting Time Empty', 'Foundry-style export will eventually need a casting time.')
    }

    if (!homebrewHasText(spellBuilderForm.range)) {
      push('warn', 'Range Empty', 'Foundry-style export will eventually need range.')
    }

    if (!homebrewHasText(spellBuilderForm.duration)) {
      push('warn', 'Duration Empty', 'Foundry-style export will eventually need duration.')
    }
  }

  if (homebrewType.value === 'item') {
    if (!homebrewHasText(itemBuilderForm.name)) {
      push('error', 'Item Name Required', 'Set the item name before creating the draft.')
    }

    if (!homebrewHasText(itemBuilderForm.description)) {
      push('warn', 'Description Empty', 'The item can be created, but its article and overview will be thin.')
    }

    if (itemBuilderForm.equippable && !homebrewHasText(itemBuilderForm.equipSlot)) {
      push('warn', 'Equip Slot Empty', 'Equippable items should usually have a slot.')
    }

    if (itemBuilderForm.requiresAttunement && !homebrewHasText(itemBuilderForm.attunementText)) {
      push('warn', 'Attunement Text Empty', 'Attunement is enabled, but there is no restriction text.')
    }

    if (itemBuilderForm.weaponEnabled && !homebrewHasText(itemBuilderForm.weaponDamage)) {
      push('warn', 'Weapon Damage Empty', 'Weapon profile is enabled without damage dice.')
    }

    if (itemBuilderForm.weaponEnabled && !homebrewHasText(itemBuilderForm.weaponDamageType)) {
      push('warn', 'Weapon Damage Type Empty', 'Weapon profile is enabled without a damage type.')
    }

    if (itemBuilderForm.armorEnabled && !homebrewHasText(itemBuilderForm.armorClass)) {
      push('warn', 'Armor Class Empty', 'Armor/shield profile is enabled without an AC value.')
    }

    if (homebrewHasText(itemBuilderForm.grantedActionDetail) && !homebrewHasText(itemBuilderForm.grantedActionName)) {
      push('warn', 'Granted Action Name Empty', 'Action detail exists, but no action name is set.')
    }
  }

  if (!checks.length) {
    push('ok', 'Ready', 'This draft has the minimum fields Eldra needs.')
  }

  return checks
})

const homebrewBlockingCheckCount = computed(() =>
  homebrewDraftChecks.value.filter((check) => check.status === 'error').length
)

const homebrewWarningCheckCount = computed(() =>
  homebrewDraftChecks.value.filter((check) => check.status === 'warn').length
)

const homebrewCanCreate = computed(() =>
  Boolean(selectedHomebrewTemplate.value) &&
  homebrewBlockingCheckCount.value === 0
)

function homebrewCheckClass(status: HomebrewCheckStatus) {
  if (status === 'error') {
    return 'border-red-400/25 bg-red-500/10 text-red-100'
  }

  if (status === 'warn') {
    return 'border-amber-300/25 bg-amber-400/10 text-amber-100'
  }

  return 'border-emerald-300/20 bg-emerald-400/10 text-emerald-100'
}

const homebrewReviewRows = computed(() => {
  if (!selectedHomebrewTemplate.value) return []

  if (homebrewType.value === 'spell') {
    return [
      ['Title', homebrewDraftTitlePreview.value],
      ['Level', spellLevelLabel(spellBuilderForm.level)],
      ['School', spellSchoolLabel(spellBuilderForm.school)],
      ['Casting', spellBuilderForm.castingTime],
      ['Range', spellBuilderForm.range],
      ['Duration', spellBuilderForm.duration],
      ['Components', spellBuilderForm.components],
      ['Mode', SPELL_ATTACK_OPTIONS.find((option) => option.value === spellBuilderForm.attackType)?.label || 'None / Utility'],
      ['Save', SPELL_SAVE_OPTIONS.find((option) => option.value === spellBuilderForm.saveAbility)?.label || 'No Save'],
      ['Damage', [spellBuilderForm.damage, spellBuilderForm.damageType].filter(Boolean).join(' ')],
      ['Classes', spellBuilderForm.classes]
    ]
  }

  if (homebrewType.value === 'item') {
    return [
      ['Title', homebrewDraftTitlePreview.value],
      ['Type', itemTypeLabel(itemBuilderForm.itemType)],
      ['Rarity', itemBuilderForm.rarity],
      ['Weight', itemBuilderForm.weight],
      ['Value', itemBuilderForm.value],
      ['Equipped', itemBuilderForm.equippable ? itemBuilderForm.equipSlot || 'Equippable' : 'No'],
      ['Attunement', itemBuilderForm.requiresAttunement ? itemBuilderForm.attunementText || 'Required' : 'No'],
      ['Weapon', itemBuilderForm.weaponEnabled ? [itemBuilderForm.weaponDamage, itemBuilderForm.weaponDamageType, itemBuilderForm.weaponRange].filter(Boolean).join(' · ') : 'No'],
      ['Armor', itemBuilderForm.armorEnabled ? `AC ${itemBuilderForm.armorClass || '—'}` : 'No'],
      ['Modifiers', [
        itemBuilderForm.acBonus ? `AC ${homebrewNumberText(itemBuilderForm.acBonus)}` : '',
        itemBuilderForm.saveBonus ? `Save ${homebrewNumberText(itemBuilderForm.saveBonus)}` : '',
        itemBuilderForm.spellAttackBonus ? `Spell Attack ${homebrewNumberText(itemBuilderForm.spellAttackBonus)}` : '',
        itemBuilderForm.spellSaveDcBonus ? `Spell DC ${homebrewNumberText(itemBuilderForm.spellSaveDcBonus)}` : ''
      ].filter(Boolean).join(' · ')],
      ['Granted Action', itemBuilderForm.grantedActionName || itemBuilderForm.grantedActionDetail ? itemBuilderForm.grantedActionName || 'Unnamed Action' : 'No']
    ]
  }

  return [
    ['Title', homebrewDraftTitlePreview.value],
    ['Type', selectedHomebrewType.value.label],
    ['Template', selectedHomebrewTemplate.value?.title || '—']
  ]
})

async function createHomebrewDraft() {
  if (!selectedHomebrewTemplate.value) {
    homebrewError.value = 'Choose a template first.'
    return
  }

  homebrewCreating.value = true
  homebrewError.value = ''
  homebrewSuccess.value = ''
  homebrewCreatedEntity.value = null

  try {
    const res: any = await $fetch(`/api/worlds/${worldId.value}/homebrew/create`, {
      method: 'POST',
      body: {
        type: homebrewType.value,
        templateEntityId: homebrewSelectedTemplateId.value,
        title: homebrewType.value === 'spell'
          ? (homebrewTitle.value || spellBuilderForm.name || defaultHomebrewTitle(selectedHomebrewTemplate.value))
          : (homebrewTitle.value || defaultHomebrewTitle(selectedHomebrewTemplate.value)),
        spell: homebrewType.value === 'spell'
          ? spellBuilderPayload()
          : undefined,
        item: homebrewType.value === 'item'
          ? itemBuilderPayload()
          : undefined
      }
    })

    homebrewCreatedEntity.value = res?.entity || null
    homebrewSuccess.value = `Created ${res?.entity?.title || 'homebrew draft'}.`

    if (res?.entity?.id) {
      router.push(`/worlds/${worldId.value}/entities/${res.entity.id}`)
    }
  } catch (error: any) {
    homebrewError.value =
      error?.data?.statusMessage ||
      error?.data?.message ||
      error?.message ||
      'Failed to create homebrew draft.'
  } finally {
    homebrewCreating.value = false
  }
}

watch(
  () => [worldId.value, homebrewType.value],
  () => {
    homebrewSelectedTemplateId.value = ''
    homebrewTitle.value = ''
    homebrewTemplateSearch.value = ''
    homebrewCreatedEntity.value = null
    homebrewSuccess.value = ''
    resetSpellBuilderForm()
    void loadHomebrewTemplates()
  },
  { immediate: true }
)
</script>

<template>
  <section
          class="mt-6 grid gap-6 xl:grid-cols-[380px_minmax(0,1fr)]"
        >
          <div class="eldra-ornate-panel eldra-frame-corners rounded-none border border-[rgba(201,164,90,0.24)] bg-[rgba(10,12,14,0.64)] p-5 backdrop-blur">
            <div class="text-xs uppercase tracking-[0.3em] text-[#9f9278]">
              Homebrew Forge
            </div>
            <h2 class="mt-2 text-2xl font-semibold text-white">
              New Homebrew
            </h2>
            <p class="mt-2 text-sm leading-6 text-[#d8ceb8]">
              Create a draft entity from an existing imported or homebrew template. Eldra clones the structured mechanics so this can become Foundry-ready later.
            </p>
  
            <div class="mt-5 grid gap-3">
              <button
                v-for="type in homebrewTypes"
                :key="type.key"
                type="button"
                class="rounded-none border p-3 text-left transition"
                :class="homebrewType === type.key
                  ? 'border-[rgba(201,164,90,0.60)] bg-[rgba(201,164,90,0.16)] text-[#fff7df]'
                  : 'border-[rgba(201,164,90,0.16)] bg-[rgba(8,17,27,0.42)] text-[#d8ceb8] hover:border-[rgba(201,164,90,0.36)] hover:bg-[rgba(201,164,90,0.08)]'"
                @click="homebrewType = type.key"
              >
                <div class="flex items-start gap-3">
                  <UIcon :name="type.icon" class="mt-0.5 h-4 w-4 shrink-0 text-[#c9a45a]" />
                  <div class="min-w-0">
                    <div class="text-sm font-semibold text-white">{{ type.label }}</div>
                    <div class="mt-1 text-xs leading-5 text-[#9f9278]">{{ type.description }}</div>
                  </div>
                </div>
              </button>
            </div>
          </div>
  
          <div class="grid gap-6">
            <div class="eldra-ornate-panel eldra-frame-corners rounded-none border border-[rgba(201,164,90,0.24)] bg-[rgba(10,12,14,0.64)] p-5 backdrop-blur">
              <div class="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
                <div>
                  <div class="text-xs uppercase tracking-[0.3em] text-[#9f9278]">
                    Template Library
                  </div>
                  <h2 class="mt-2 text-2xl font-semibold text-white">
                    {{ selectedHomebrewType.label }} Templates
                  </h2>
                  <p class="mt-2 text-sm leading-6 text-[#d8ceb8]">
                    Pick an existing {{ selectedHomebrewType.label.toLowerCase() }} as the starting mechanical shape.
                  </p>
                </div>
  
                <div class="rounded-none border border-[rgba(201,164,90,0.18)] bg-[rgba(201,164,90,0.08)] px-3 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-[#d8ceb8]">
                  {{ homebrewTemplates.length }} templates
                </div>
              </div>
  
              <input
                v-model="homebrewTemplateSearch"
                class="eldra-input mt-5 w-full rounded-none px-3 py-3 text-sm text-white"
                :placeholder="`Search ${selectedHomebrewType.label.toLowerCase()} templates...`"
              >
  
              <div
                v-if="homebrewTemplatesPending"
                class="mt-4 rounded-none border border-dashed border-[rgba(201,164,90,0.20)] p-5 text-sm text-[#9f9278]"
              >
                Loading templates...
              </div>
  
              <div
                v-else-if="!homebrewFilteredTemplates.length"
                class="mt-4 rounded-none border border-dashed border-[rgba(201,164,90,0.20)] p-5 text-sm text-[#9f9278]"
              >
                No templates found for this type.
              </div>
  
              <div
                v-else
                class="mt-4 grid max-h-[520px] gap-3 overflow-y-auto pr-1"
              >
                <button
                  v-for="template in homebrewFilteredTemplates"
                  :key="template.id"
                  type="button"
                  class="rounded-none border p-4 text-left transition"
                  :class="String(homebrewSelectedTemplateId) === String(template.id)
                    ? 'border-[rgba(201,164,90,0.60)] bg-[rgba(201,164,90,0.16)]'
                    : 'border-[rgba(201,164,90,0.16)] bg-[rgba(8,17,27,0.42)] hover:border-[rgba(201,164,90,0.36)] hover:bg-[rgba(201,164,90,0.08)]'"
                  @click="selectHomebrewTemplate(template)"
                >
                  <div class="flex flex-wrap items-start justify-between gap-3">
                    <div class="min-w-0">
                      <div class="text-lg font-semibold text-white">
                        {{ template.title }}
                      </div>
                      <div class="mt-1 text-[10px] uppercase tracking-[0.18em] text-[#9f9278]">
                        {{ homebrewTemplateSubtitle(template) || selectedHomebrewType.label }}
                      </div>
                    </div>
  
                    <span class="shrink-0 rounded-none border border-[rgba(201,164,90,0.20)] bg-[rgba(201,164,90,0.08)] px-2 py-1 text-[10px] uppercase tracking-[0.14em] text-[#d8ceb8]">
                      {{ template.blockCount || 0 }} blocks
                    </span>
                  </div>
  
                  <p
                    v-if="template.summary"
                    class="mt-3 line-clamp-2 text-sm leading-6 text-[#d8ceb8]"
                  >
                    {{ template.summary }}
                  </p>
  
                  <div
                    v-if="template.coreBlockKeys?.length"
                    class="mt-3 flex flex-wrap gap-2"
                  >
                    <span
                      v-for="key in template.coreBlockKeys.slice(0, 5)"
                      :key="`${template.id}-${key}`"
                      class="rounded-none border border-[rgba(65,82,103,0.58)] bg-[rgba(8,17,27,0.58)] px-2 py-1 text-[10px] uppercase tracking-[0.14em] text-[#9f9278]"
                    >
                      {{ key }}
                    </span>
                  </div>
                </button>
              </div>
            </div>
  
            <div class="eldra-ornate-panel eldra-frame-corners rounded-none border border-[rgba(201,164,90,0.24)] bg-[rgba(10,12,14,0.64)] p-5 backdrop-blur">
              <div class="text-xs uppercase tracking-[0.3em] text-[#9f9278]">
                Draft Setup
              </div>
              <h2 class="mt-2 text-2xl font-semibold text-white">
                Create {{ selectedHomebrewType.label }} Draft
              </h2>
  
              <div
                v-if="selectedHomebrewTemplate"
                class="mt-4 rounded-none border border-[rgba(201,164,90,0.18)] bg-[rgba(8,17,27,0.42)] p-4"
              >
                <div class="text-sm font-semibold text-white">
                  Template: {{ selectedHomebrewTemplate.title }}
                </div>
                <div class="mt-1 text-xs text-[#9f9278]">
                  {{ homebrewTemplateSubtitle(selectedHomebrewTemplate) || 'Structured template selected.' }}
                </div>
              </div>
  
              <div
                v-if="homebrewType === 'spell' && selectedHomebrewTemplate"
                data-homebrew-spell-builder
                class="mt-5 rounded-none border border-[rgba(201,164,90,0.20)] bg-[rgba(8,17,27,0.42)] p-4"
              >
                <div class="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
                  <div>
                    <div class="text-xs uppercase tracking-[0.3em] text-[#9f9278]">
                      Spell Builder
                    </div>
                    <h3 class="mt-2 text-xl font-semibold text-white">
                      Spell Mechanics
                    </h3>
                    <p class="mt-2 text-sm leading-6 text-[#d8ceb8]">
                      Start from the selected template, then override the combat-useful fields before Eldra creates the draft.
                    </p>
                  </div>
  
                  <div class="rounded-none border border-[rgba(201,164,90,0.18)] bg-[rgba(201,164,90,0.08)] px-3 py-2 text-xs leading-5 text-[#d8ceb8]">
                    {{ spellBuilderSummaryLine || 'No mechanics yet' }}
                  </div>
                </div>
  
                <div class="mt-5 grid gap-4 xl:grid-cols-3">
                  <label>
                    <span class="mb-2 block text-xs uppercase tracking-[0.2em] text-[#9f9278]">Spell Name</span>
                    <input
                      v-model="spellBuilderForm.name"
                      class="eldra-input w-full rounded-none px-3 py-3 text-sm text-white"
                      placeholder="Magic Missile, Fireball, etc."
                    >
                  </label>
  
                  <label>
                    <span class="mb-2 block text-xs uppercase tracking-[0.2em] text-[#9f9278]">Level</span>
                    <select
                      v-model="spellBuilderForm.level"
                      class="eldra-input w-full rounded-none px-3 py-3 text-sm text-white"
                    >
                      <option
                        v-for="level in SPELL_LEVEL_OPTIONS"
                        :key="level.value"
                        :value="level.value"
                        class="bg-[#090909] text-[#f5e7bd]"
                      >
                        {{ level.label }}
                      </option>
                    </select>
                  </label>
  
                  <label>
                    <span class="mb-2 block text-xs uppercase tracking-[0.2em] text-[#9f9278]">School</span>
                    <select
                      v-model="spellBuilderForm.school"
                      class="eldra-input w-full rounded-none px-3 py-3 text-sm text-white"
                    >
                      <option
                        v-for="school in SPELL_SCHOOL_OPTIONS"
                        :key="school.value"
                        :value="school.value"
                        class="bg-[#090909] text-[#f5e7bd]"
                      >
                        {{ school.label }}
                      </option>
                    </select>
                  </label>
                </div>
  
                <div class="mt-4 grid gap-4 xl:grid-cols-4">
                  <label>
                    <span class="mb-2 block text-xs uppercase tracking-[0.2em] text-[#9f9278]">Casting Time</span>
                    <input
                      v-model="spellBuilderForm.castingTime"
                      class="eldra-input w-full rounded-none px-3 py-3 text-sm text-white"
                      placeholder="1 Action"
                    >
                  </label>
  
                  <label>
                    <span class="mb-2 block text-xs uppercase tracking-[0.2em] text-[#9f9278]">Range</span>
                    <input
                      v-model="spellBuilderForm.range"
                      class="eldra-input w-full rounded-none px-3 py-3 text-sm text-white"
                      placeholder="60 feet"
                    >
                  </label>
  
                  <label>
                    <span class="mb-2 block text-xs uppercase tracking-[0.2em] text-[#9f9278]">Duration</span>
                    <input
                      v-model="spellBuilderForm.duration"
                      class="eldra-input w-full rounded-none px-3 py-3 text-sm text-white"
                      placeholder="Instantaneous"
                    >
                  </label>
  
                  <label>
                    <span class="mb-2 block text-xs uppercase tracking-[0.2em] text-[#9f9278]">Components</span>
                    <input
                      v-model="spellBuilderForm.components"
                      class="eldra-input w-full rounded-none px-3 py-3 text-sm text-white"
                      placeholder="V, S, M (a tiny bell)"
                    >
                  </label>
                </div>
  
                <div class="mt-4 flex flex-wrap gap-3">
                  <label class="inline-flex items-center gap-2 rounded-none border border-[rgba(201,164,90,0.16)] bg-[rgba(20,17,12,0.52)] px-3 py-2 text-sm text-[#d8ceb8]">
                    <input
                      v-model="spellBuilderForm.concentration"
                      type="checkbox"
                      class="accent-[#c9a45a]"
                    >
                    Concentration
                  </label>
  
                  <label class="inline-flex items-center gap-2 rounded-none border border-[rgba(201,164,90,0.16)] bg-[rgba(20,17,12,0.52)] px-3 py-2 text-sm text-[#d8ceb8]">
                    <input
                      v-model="spellBuilderForm.ritual"
                      type="checkbox"
                      class="accent-[#c9a45a]"
                    >
                    Ritual
                  </label>
                </div>
  
                <div class="mt-4 grid gap-4 xl:grid-cols-4">
                  <label>
                    <span class="mb-2 block text-xs uppercase tracking-[0.2em] text-[#9f9278]">Combat Mode</span>
                    <select
                      v-model="spellBuilderForm.attackType"
                      class="eldra-input w-full rounded-none px-3 py-3 text-sm text-white"
                    >
                      <option
                        v-for="option in SPELL_ATTACK_OPTIONS"
                        :key="option.value"
                        :value="option.value"
                        class="bg-[#090909] text-[#f5e7bd]"
                      >
                        {{ option.label }}
                      </option>
                    </select>
                  </label>
  
                  <label>
                    <span class="mb-2 block text-xs uppercase tracking-[0.2em] text-[#9f9278]">Save Ability</span>
                    <select
                      v-model="spellBuilderForm.saveAbility"
                      class="eldra-input w-full rounded-none px-3 py-3 text-sm text-white"
                    >
                      <option
                        v-for="option in SPELL_SAVE_OPTIONS"
                        :key="option.value"
                        :value="option.value"
                        class="bg-[#090909] text-[#f5e7bd]"
                      >
                        {{ option.label }}
                      </option>
                    </select>
                  </label>
  
                  <label>
                    <span class="mb-2 block text-xs uppercase tracking-[0.2em] text-[#9f9278]">Damage / Healing</span>
                    <input
                      v-model="spellBuilderForm.damage"
                      class="eldra-input w-full rounded-none px-3 py-3 text-sm text-white"
                      placeholder="8d6, 2d8, etc."
                    >
                  </label>
  
                  <label>
                    <span class="mb-2 block text-xs uppercase tracking-[0.2em] text-[#9f9278]">Damage Type</span>
                    <select
                      v-model="spellBuilderForm.damageType"
                      class="eldra-input w-full rounded-none px-3 py-3 text-sm text-white"
                    >
                      <option
                        v-for="type in SPELL_DAMAGE_TYPES"
                        :key="type || 'none'"
                        :value="type"
                        class="bg-[#090909] text-[#f5e7bd]"
                      >
                        {{ type || 'None' }}
                      </option>
                    </select>
                  </label>
                </div>
  
                <label class="mt-4 block">
                  <span class="mb-2 block text-xs uppercase tracking-[0.2em] text-[#9f9278]">Class Lists / Tags</span>
                  <input
                    v-model="spellBuilderForm.classes"
                    class="eldra-input w-full rounded-none px-3 py-3 text-sm text-white"
                    placeholder="Wizard, Cleric, Druid..."
                  >
                </label>
  
                <label class="mt-4 block">
                  <span class="mb-2 block text-xs uppercase tracking-[0.2em] text-[#9f9278]">Description</span>
                  <textarea
                    v-model="spellBuilderForm.description"
                    rows="7"
                    class="eldra-input w-full rounded-none px-3 py-3 text-sm leading-6 text-white"
                    placeholder="What the spell does at the table..."
                  />
                </label>
  
                <label class="mt-4 block">
                  <span class="mb-2 block text-xs uppercase tracking-[0.2em] text-[#9f9278]">At Higher Levels</span>
                  <textarea
                    v-model="spellBuilderForm.higherLevel"
                    rows="3"
                    class="eldra-input w-full rounded-none px-3 py-3 text-sm leading-6 text-white"
                    placeholder="How the spell scales when cast with higher-level slots..."
                  />
                </label>
              </div>
  
              <div
                v-if="homebrewType === 'item' && selectedHomebrewTemplate"
                data-homebrew-item-builder
                class="mt-5 rounded-none border border-[rgba(201,164,90,0.20)] bg-[rgba(8,17,27,0.42)] p-4"
              >
                <div class="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
                  <div>
                    <div class="text-xs uppercase tracking-[0.3em] text-[#9f9278]">
                      Item Builder
                    </div>
                    <h3 class="mt-2 text-xl font-semibold text-white">
                      Item Mechanics
                    </h3>
                    <p class="mt-2 text-sm leading-6 text-[#d8ceb8]">
                      Build the structured item profile Eldra will use for sheets, granted actions, and eventual Foundry export.
                    </p>
                  </div>
  
                  <div class="rounded-none border border-[rgba(201,164,90,0.18)] bg-[rgba(201,164,90,0.08)] px-3 py-2 text-xs leading-5 text-[#d8ceb8]">
                    {{ itemBuilderSummaryLine || 'No item mechanics yet' }}
                  </div>
                </div>
  
                <div class="mt-5 grid gap-4 xl:grid-cols-3">
                  <label>
                    <span class="mb-2 block text-xs uppercase tracking-[0.2em] text-[#9f9278]">Item Name</span>
                    <input
                      v-model="itemBuilderForm.name"
                      class="eldra-input w-full rounded-none px-3 py-3 text-sm text-white"
                      placeholder="Flamebrand Longsword, Lucky Boots..."
                    >
                  </label>
  
                  <label>
                    <span class="mb-2 block text-xs uppercase tracking-[0.2em] text-[#9f9278]">Item Type</span>
                    <select
                      v-model="itemBuilderForm.itemType"
                      class="eldra-input w-full rounded-none px-3 py-3 text-sm text-white"
                    >
                      <option
                        v-for="type in ITEM_TYPE_OPTIONS"
                        :key="type.value"
                        :value="type.value"
                        class="bg-[#090909] text-[#f5e7bd]"
                      >
                        {{ type.label }}
                      </option>
                    </select>
                  </label>
  
                  <label>
                    <span class="mb-2 block text-xs uppercase tracking-[0.2em] text-[#9f9278]">Rarity</span>
                    <select
                      v-model="itemBuilderForm.rarity"
                      class="eldra-input w-full rounded-none px-3 py-3 text-sm text-white"
                    >
                      <option
                        v-for="rarity in ITEM_RARITY_OPTIONS"
                        :key="rarity"
                        :value="rarity"
                        class="bg-[#090909] text-[#f5e7bd]"
                      >
                        {{ rarity }}
                      </option>
                    </select>
                  </label>
                </div>
  
                <div class="mt-4 grid gap-4 xl:grid-cols-4">
                  <label>
                    <span class="mb-2 block text-xs uppercase tracking-[0.2em] text-[#9f9278]">Weight</span>
                    <input
                      v-model="itemBuilderForm.weight"
                      class="eldra-input w-full rounded-none px-3 py-3 text-sm text-white"
                      placeholder="1"
                    >
                  </label>
  
                  <label>
                    <span class="mb-2 block text-xs uppercase tracking-[0.2em] text-[#9f9278]">Value</span>
                    <input
                      v-model="itemBuilderForm.value"
                      class="eldra-input w-full rounded-none px-3 py-3 text-sm text-white"
                      placeholder="5000 cp or raw value"
                    >
                  </label>
  
                  <label>
                    <span class="mb-2 block text-xs uppercase tracking-[0.2em] text-[#9f9278]">Equip Slot</span>
                    <select
                      v-model="itemBuilderForm.equipSlot"
                      class="eldra-input w-full rounded-none px-3 py-3 text-sm text-white"
                    >
                      <option
                        v-for="slot in ITEM_EQUIP_SLOT_OPTIONS"
                        :key="slot.value"
                        :value="slot.value"
                        class="bg-[#090909] text-[#f5e7bd]"
                      >
                        {{ slot.label }}
                      </option>
                    </select>
                  </label>
  
                  <div class="grid gap-2">
                    <label class="inline-flex items-center gap-2 rounded-none border border-[rgba(201,164,90,0.16)] bg-[rgba(20,17,12,0.52)] px-3 py-2 text-sm text-[#d8ceb8]">
                      <input
                        v-model="itemBuilderForm.equippable"
                        type="checkbox"
                        class="accent-[#c9a45a]"
                      >
                      Equippable
                    </label>
  
                    <label class="inline-flex items-center gap-2 rounded-none border border-[rgba(201,164,90,0.16)] bg-[rgba(20,17,12,0.52)] px-3 py-2 text-sm text-[#d8ceb8]">
                      <input
                        v-model="itemBuilderForm.requiresAttunement"
                        type="checkbox"
                        class="accent-[#c9a45a]"
                      >
                      Requires Attunement
                    </label>
                  </div>
                </div>
  
                <label
                  v-if="itemBuilderForm.requiresAttunement"
                  class="mt-4 block"
                >
                  <span class="mb-2 block text-xs uppercase tracking-[0.2em] text-[#9f9278]">Attunement Text</span>
                  <input
                    v-model="itemBuilderForm.attunementText"
                    class="eldra-input w-full rounded-none px-3 py-3 text-sm text-white"
                    placeholder="by a spellcaster, by a dwarf, etc."
                  >
                </label>
  
                <div class="mt-5 rounded-none border border-[rgba(201,164,90,0.16)] bg-[rgba(20,17,12,0.40)] p-4">
                  <label class="inline-flex items-center gap-2 text-sm font-semibold text-[#fff7df]">
                    <input
                      v-model="itemBuilderForm.weaponEnabled"
                      type="checkbox"
                      class="accent-[#c9a45a]"
                    >
                    Weapon Profile
                  </label>
  
                  <div
                    v-if="itemBuilderForm.weaponEnabled"
                    class="mt-4 grid gap-4 xl:grid-cols-4"
                  >
                    <label>
                      <span class="mb-2 block text-xs uppercase tracking-[0.2em] text-[#9f9278]">Kind</span>
                      <select
                        v-model="itemBuilderForm.weaponKind"
                        class="eldra-input w-full rounded-none px-3 py-3 text-sm text-white"
                      >
                        <option value="melee" class="bg-[#090909] text-[#f5e7bd]">Melee</option>
                        <option value="ranged" class="bg-[#090909] text-[#f5e7bd]">Ranged</option>
                      </select>
                    </label>
  
                    <label>
                      <span class="mb-2 block text-xs uppercase tracking-[0.2em] text-[#9f9278]">Category</span>
                      <input
                        v-model="itemBuilderForm.weaponCategory"
                        class="eldra-input w-full rounded-none px-3 py-3 text-sm text-white"
                        placeholder="simple, martial..."
                      >
                    </label>
  
                    <label>
                      <span class="mb-2 block text-xs uppercase tracking-[0.2em] text-[#9f9278]">Damage</span>
                      <input
                        v-model="itemBuilderForm.weaponDamage"
                        class="eldra-input w-full rounded-none px-3 py-3 text-sm text-white"
                        placeholder="1d8"
                      >
                    </label>
  
                    <label>
                      <span class="mb-2 block text-xs uppercase tracking-[0.2em] text-[#9f9278]">Damage Type</span>
                      <select
                        v-model="itemBuilderForm.weaponDamageType"
                        class="eldra-input w-full rounded-none px-3 py-3 text-sm text-white"
                      >
                        <option
                          v-for="type in ITEM_DAMAGE_TYPES"
                          :key="type || 'none'"
                          :value="type"
                          class="bg-[#090909] text-[#f5e7bd]"
                        >
                          {{ type || 'None' }}
                        </option>
                      </select>
                    </label>
  
                    <label>
                      <span class="mb-2 block text-xs uppercase tracking-[0.2em] text-[#9f9278]">Range</span>
                      <input
                        v-model="itemBuilderForm.weaponRange"
                        class="eldra-input w-full rounded-none px-3 py-3 text-sm text-white"
                        placeholder="5, 20/60, 120/360"
                      >
                    </label>
  
                    <label>
                      <span class="mb-2 block text-xs uppercase tracking-[0.2em] text-[#9f9278]">Properties</span>
                      <input
                        v-model="itemBuilderForm.weaponProperties"
                        class="eldra-input w-full rounded-none px-3 py-3 text-sm text-white"
                        placeholder="finesse, light, thrown"
                      >
                    </label>
  
                    <label>
                      <span class="mb-2 block text-xs uppercase tracking-[0.2em] text-[#9f9278]">Attack Bonus</span>
                      <input
                        v-model="itemBuilderForm.attackBonus"
                        class="eldra-input w-full rounded-none px-3 py-3 text-sm text-white"
                        placeholder="+1"
                      >
                    </label>
  
                    <label>
                      <span class="mb-2 block text-xs uppercase tracking-[0.2em] text-[#9f9278]">Damage Bonus</span>
                      <input
                        v-model="itemBuilderForm.damageBonus"
                        class="eldra-input w-full rounded-none px-3 py-3 text-sm text-white"
                        placeholder="+1"
                      >
                    </label>
                  </div>
                </div>
  
                <div class="mt-5 rounded-none border border-[rgba(201,164,90,0.16)] bg-[rgba(20,17,12,0.40)] p-4">
                  <label class="inline-flex items-center gap-2 text-sm font-semibold text-[#fff7df]">
                    <input
                      v-model="itemBuilderForm.armorEnabled"
                      type="checkbox"
                      class="accent-[#c9a45a]"
                    >
                    Armor / Shield Profile
                  </label>
  
                  <div
                    v-if="itemBuilderForm.armorEnabled"
                    class="mt-4 grid gap-4 xl:grid-cols-5"
                  >
                    <label>
                      <span class="mb-2 block text-xs uppercase tracking-[0.2em] text-[#9f9278]">AC</span>
                      <input
                        v-model="itemBuilderForm.armorClass"
                        class="eldra-input w-full rounded-none px-3 py-3 text-sm text-white"
                        placeholder="16"
                      >
                    </label>
  
                    <label>
                      <span class="mb-2 block text-xs uppercase tracking-[0.2em] text-[#9f9278]">Armor Type</span>
                      <input
                        v-model="itemBuilderForm.armorType"
                        class="eldra-input w-full rounded-none px-3 py-3 text-sm text-white"
                        placeholder="armor, shield"
                      >
                    </label>
  
                    <label>
                      <span class="mb-2 block text-xs uppercase tracking-[0.2em] text-[#9f9278]">Dex Cap</span>
                      <input
                        v-model="itemBuilderForm.dexCap"
                        class="eldra-input w-full rounded-none px-3 py-3 text-sm text-white"
                        placeholder="2"
                      >
                    </label>
  
                    <label>
                      <span class="mb-2 block text-xs uppercase tracking-[0.2em] text-[#9f9278]">Strength Req.</span>
                      <input
                        v-model="itemBuilderForm.strength"
                        class="eldra-input w-full rounded-none px-3 py-3 text-sm text-white"
                        placeholder="13"
                      >
                    </label>
  
                    <label class="inline-flex items-center gap-2 rounded-none border border-[rgba(201,164,90,0.16)] bg-[rgba(20,17,12,0.52)] px-3 py-2 text-sm text-[#d8ceb8]">
                      <input
                        v-model="itemBuilderForm.stealthDisadvantage"
                        type="checkbox"
                        class="accent-[#c9a45a]"
                      >
                      Stealth Disadvantage
                    </label>
                  </div>
                </div>
  
                <div class="mt-5 grid gap-4 xl:grid-cols-4">
                  <label>
                    <span class="mb-2 block text-xs uppercase tracking-[0.2em] text-[#9f9278]">AC Bonus</span>
                    <input
                      v-model="itemBuilderForm.acBonus"
                      class="eldra-input w-full rounded-none px-3 py-3 text-sm text-white"
                      placeholder="+1"
                    >
                  </label>
  
                  <label>
                    <span class="mb-2 block text-xs uppercase tracking-[0.2em] text-[#9f9278]">Save Bonus</span>
                    <input
                      v-model="itemBuilderForm.saveBonus"
                      class="eldra-input w-full rounded-none px-3 py-3 text-sm text-white"
                      placeholder="+1"
                    >
                  </label>
  
                  <label>
                    <span class="mb-2 block text-xs uppercase tracking-[0.2em] text-[#9f9278]">Spell Attack Bonus</span>
                    <input
                      v-model="itemBuilderForm.spellAttackBonus"
                      class="eldra-input w-full rounded-none px-3 py-3 text-sm text-white"
                      placeholder="+1"
                    >
                  </label>
  
                  <label>
                    <span class="mb-2 block text-xs uppercase tracking-[0.2em] text-[#9f9278]">Spell Save DC Bonus</span>
                    <input
                      v-model="itemBuilderForm.spellSaveDcBonus"
                      class="eldra-input w-full rounded-none px-3 py-3 text-sm text-white"
                      placeholder="+1"
                    >
                  </label>
                </div>
  
                <div class="mt-5 rounded-none border border-[rgba(201,164,90,0.16)] bg-[rgba(20,17,12,0.40)] p-4">
                  <div class="text-xs uppercase tracking-[0.3em] text-[#9f9278]">
                    Granted Action
                  </div>
  
                  <div class="mt-4 grid gap-4 xl:grid-cols-4">
                    <label>
                      <span class="mb-2 block text-xs uppercase tracking-[0.2em] text-[#9f9278]">Action Name</span>
                      <input
                        v-model="itemBuilderForm.grantedActionName"
                        class="eldra-input w-full rounded-none px-3 py-3 text-sm text-white"
                        placeholder="Poison the Blade"
                      >
                    </label>
  
                    <label>
                      <span class="mb-2 block text-xs uppercase tracking-[0.2em] text-[#9f9278]">Timing</span>
                      <select
                        v-model="itemBuilderForm.grantedActionTiming"
                        class="eldra-input w-full rounded-none px-3 py-3 text-sm text-white"
                      >
                        <option
                          v-for="timing in ITEM_ACTION_TIMINGS"
                          :key="timing"
                          :value="timing"
                          class="bg-[#090909] text-[#f5e7bd]"
                        >
                          {{ timing }}
                        </option>
                      </select>
                    </label>
  
                    <label>
                      <span class="mb-2 block text-xs uppercase tracking-[0.2em] text-[#9f9278]">Uses</span>
                      <input
                        v-model="itemBuilderForm.grantedActionUses"
                        class="eldra-input w-full rounded-none px-3 py-3 text-sm text-white"
                        placeholder="1, 3, etc."
                      >
                    </label>
  
                    <label>
                      <span class="mb-2 block text-xs uppercase tracking-[0.2em] text-[#9f9278]">Recharge</span>
                      <select
                        v-model="itemBuilderForm.grantedActionRecharge"
                        class="eldra-input w-full rounded-none px-3 py-3 text-sm text-white"
                      >
                        <option
                          v-for="recharge in ITEM_RECHARGE_OPTIONS"
                          :key="recharge || 'none'"
                          :value="recharge"
                          class="bg-[#090909] text-[#f5e7bd]"
                        >
                          {{ recharge || 'None' }}
                        </option>
                      </select>
                    </label>
                  </div>
  
                  <label class="mt-4 block">
                    <span class="mb-2 block text-xs uppercase tracking-[0.2em] text-[#9f9278]">Action Detail</span>
                    <textarea
                      v-model="itemBuilderForm.grantedActionDetail"
                      rows="4"
                      class="eldra-input w-full rounded-none px-3 py-3 text-sm leading-6 text-white"
                      placeholder="Describe the action this item grants..."
                    />
                  </label>
                </div>
  
                <label class="mt-5 block">
                  <span class="mb-2 block text-xs uppercase tracking-[0.2em] text-[#9f9278]">Description</span>
                  <textarea
                    v-model="itemBuilderForm.description"
                    rows="7"
                    class="eldra-input w-full rounded-none px-3 py-3 text-sm leading-6 text-white"
                    placeholder="What the item does at the table..."
                  />
                </label>
              </div>
  
              <label class="mt-5 block">
                <span class="mb-2 block text-xs uppercase tracking-[0.2em] text-[#9f9278]">Draft Title</span>
                <input
                  v-model="homebrewTitle"
                  class="eldra-input w-full rounded-none px-3 py-3 text-sm text-white"
                  :placeholder="selectedHomebrewTemplate ? defaultHomebrewTitle(selectedHomebrewTemplate) : 'Choose a template first...'"
                >
              </label>
  
              <div
                v-if="selectedHomebrewTemplate"
                data-homebrew-draft-review
                class="mt-5 rounded-none border border-[rgba(201,164,90,0.20)] bg-[rgba(8,17,27,0.42)] p-4"
              >
                <div class="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
                  <div>
                    <div class="text-xs uppercase tracking-[0.3em] text-[#9f9278]">
                      Draft Review
                    </div>
                    <h3 class="mt-2 text-xl font-semibold text-white">
                      Ready Check
                    </h3>
                    <p class="mt-2 text-sm leading-6 text-[#d8ceb8]">
                      Quick sanity pass before Eldra creates the structured draft.
                    </p>
                  </div>
  
                  <div class="flex flex-wrap gap-2">
                    <span class="rounded-none border border-red-400/20 bg-red-500/10 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-red-100">
                      {{ homebrewBlockingCheckCount }} blockers
                    </span>
                    <span class="rounded-none border border-amber-300/20 bg-amber-400/10 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-amber-100">
                      {{ homebrewWarningCheckCount }} warnings
                    </span>
                  </div>
                </div>
  
                <div class="mt-4 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                  <div
                    v-for="row in homebrewReviewRows"
                    :key="`${row[0]}-${row[1]}`"
                    class="rounded-none border border-[rgba(201,164,90,0.12)] bg-[rgba(4,8,14,0.42)] p-3"
                  >
                    <div class="text-[10px] uppercase tracking-[0.18em] text-[#9f9278]">
                      {{ row[0] }}
                    </div>
                    <div class="mt-1 break-words text-sm font-semibold text-[#fff7df]">
                      {{ homebrewReviewValue(row[1]) }}
                    </div>
                  </div>
                </div>
  
                <div class="mt-4 grid gap-2">
                  <div
                    v-for="check in homebrewDraftChecks"
                    :key="`${check.status}-${check.label}`"
                    class="rounded-none border px-3 py-2 text-sm leading-6"
                    :class="homebrewCheckClass(check.status)"
                  >
                    <span class="font-semibold">{{ check.label }}:</span>
                    <span class="ml-1">{{ check.detail }}</span>
                  </div>
                </div>
              </div>
  
              <div
                v-if="homebrewError"
                class="mt-4 rounded-none border border-red-400/25 bg-red-500/10 px-4 py-3 text-sm leading-6 text-red-100"
              >
                {{ homebrewError }}
              </div>
  
              <div
                v-if="homebrewSuccess"
                class="mt-4 rounded-none border border-emerald-400/20 bg-emerald-400/10 px-4 py-3 text-sm leading-6 text-emerald-100"
              >
                {{ homebrewSuccess }}
              </div>
  
              <div class="mt-5 flex flex-wrap gap-3">
                <button
                  type="button"
                  class="eldra-button rounded-none px-4 py-3 text-sm font-semibold disabled:opacity-50"
                  :disabled="homebrewCreating || !homebrewCanCreate"
                  @click="createHomebrewDraft"
                >
                  {{ homebrewCreating ? 'Creating Draft...' : 'Create Draft & Open Article' }}
                </button>
  
                <button
                  v-if="homebrewCreatedEntity?.id"
                  type="button"
                  class="rounded-none border border-[rgba(201,164,90,0.24)] bg-[rgba(20,17,12,0.72)] px-4 py-3 text-sm font-semibold text-[#fff7df]"
                  @click="router.push(`/worlds/${worldId}/entities/${homebrewCreatedEntity.id}`)"
                >
                  Open Draft
                </button>
              </div>
  
              <div class="mt-5 rounded-none border border-[rgba(201,164,90,0.12)] bg-[rgba(4,8,14,0.40)] p-4 text-xs leading-6 text-[#9f9278]">
                V1 creates a real Eldra entity, marks it as homebrew, clones the template's mechanical core blocks, and opens the article for editing. The next pass adds type-specific mechanical forms.
              </div>
            </div>
          </div>
        </section>
</template>
